import { db } from '../storage/database'
import type { InventoryBalance, InventoryMovement, Material, MovementType } from '../types/inventory'
import { computeAvailableStock } from './reorderCalculator'

export class MovementValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MovementValidationError'
  }
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

async function getBalance(materialId: string): Promise<InventoryBalance> {
  const existing = await db.balances.get(materialId)
  if (existing) return existing
  const material = await db.materials.get(materialId)
  const locationId = material?.defaultLocationId ?? 'loc-consumables'
  const balance: InventoryBalance = {
    materialId,
    physicalStock: 0,
    reserved: 0,
    awaitingInspection: 0,
    locationId,
  }
  await db.balances.put(balance)
  return balance
}

async function syncLocationBalance(
  materialId: string,
  locationId: string,
  deltaPhysical: number,
): Promise<void> {
  const key = [materialId, locationId] as [string, string]
  const row = await db.locationBalances.get(key)
  const nextQty = (row?.quantity ?? 0) + deltaPhysical
  if (nextQty < 0) {
    throw new MovementValidationError('Location balance cannot go negative.')
  }
  await db.locationBalances.put({ materialId, locationId, quantity: nextQty })
}

export interface MovementContext {
  material: Material
  type: MovementType
  quantity: number
  sourceLocationId?: string
  destinationLocationId?: string
  referenceNumber?: string
  operator?: string
  notes?: string
  reason?: string
  purchaseOrderId?: string
  productionBatchId?: string
  timestamp?: string
  adjustmentSign?: 'increase' | 'decrease'
}

export async function applyMovement(ctx: MovementContext): Promise<InventoryMovement> {
  const { material, type, quantity } = ctx
  if (quantity <= 0) throw new MovementValidationError('Quantity must be positive.')
  const balance = await getBalance(material.id)
  const prev = { ...balance }
  let physical = balance.physicalStock
  let reserved = balance.reserved
  let awaiting = balance.awaitingInspection
  const unit = material.unit

  switch (type) {
    case 'goods_receipt': {
      physical += quantity
      const dest = ctx.destinationLocationId ?? balance.locationId
      balance.locationId = dest
      await syncLocationBalance(material.id, dest, quantity)
      break
    }
    case 'issue_to_production': {
      const { available } = computeAvailableStock(physical, reserved, awaiting)
      if (quantity > available) {
        throw new MovementValidationError(
          `Cannot issue ${quantity} ${unit}; only ${available} available.`,
        )
      }
      physical -= quantity
      const src = ctx.sourceLocationId ?? balance.locationId
      await syncLocationBalance(material.id, src, -quantity)
      break
    }
    case 'return_from_production': {
      physical += quantity
      const dest = ctx.destinationLocationId ?? balance.locationId
      await syncLocationBalance(material.id, dest, quantity)
      break
    }
    case 'return_to_supplier': {
      const { available } = computeAvailableStock(physical, reserved, awaiting)
      if (quantity > available) {
        throw new MovementValidationError('Insufficient available stock for supplier return.')
      }
      physical -= quantity
      await syncLocationBalance(material.id, balance.locationId, -quantity)
      break
    }
    case 'stock_adjustment': {
      if (!ctx.reason?.trim()) {
        throw new MovementValidationError('Stock adjustment requires a reason.')
      }
      const delta = ctx.adjustmentSign === 'decrease' ? -quantity : quantity
      if (delta < 0 && physical + delta < 0) {
        throw new MovementValidationError('Adjustment would make physical stock negative.')
      }
      physical += delta
      await syncLocationBalance(material.id, balance.locationId, delta)
      break
    }
    case 'inspection_acceptance': {
      if (quantity > awaiting) {
        throw new MovementValidationError('Cannot accept more than awaiting inspection.')
      }
      awaiting -= quantity
      break
    }
    case 'inspection_rejection': {
      if (quantity > awaiting) {
        throw new MovementValidationError('Cannot reject more than awaiting inspection.')
      }
      awaiting -= quantity
      physical -= quantity
      await syncLocationBalance(material.id, balance.locationId, -quantity)
      break
    }
    case 'reservation': {
      const { available } = computeAvailableStock(physical, reserved, awaiting)
      if (quantity > available) {
        throw new MovementValidationError('Cannot reserve more than available stock.')
      }
      reserved += quantity
      break
    }
    case 'reservation_release': {
      if (quantity > reserved) {
        throw new MovementValidationError('Cannot release more than reserved quantity.')
      }
      reserved -= quantity
      break
    }
    case 'transfer': {
      const src = ctx.sourceLocationId
      const dest = ctx.destinationLocationId
      if (!src || !dest) {
        throw new MovementValidationError('Transfer requires source and destination locations.')
      }
      if (src === dest) {
        throw new MovementValidationError('Source and destination must differ.')
      }
      const srcRow = await db.locationBalances.get([material.id, src])
      if (!srcRow || srcRow.quantity < quantity) {
        throw new MovementValidationError('Insufficient stock at source location.')
      }
      await syncLocationBalance(material.id, src, -quantity)
      await syncLocationBalance(material.id, dest, quantity)
      balance.locationId = dest
      break
    }
    default:
      throw new MovementValidationError(`Unsupported movement type: ${type}`)
  }

  if (physical < 0 || reserved < 0 || awaiting < 0) {
    throw new MovementValidationError('Movement would create negative inventory.')
  }
  if (reserved + awaiting > physical) {
    throw new MovementValidationError('Reserved and inspection exceed physical stock.')
  }

  balance.physicalStock = physical
  balance.reserved = reserved
  balance.awaitingInspection = awaiting
  await db.balances.put(balance)

  const movement: InventoryMovement = {
    id: newId('MOV'),
    materialId: material.id,
    type,
    quantity,
    unit,
    sourceLocationId: ctx.sourceLocationId,
    destinationLocationId: ctx.destinationLocationId ?? balance.locationId,
    referenceNumber: ctx.referenceNumber,
    timestamp: ctx.timestamp || new Date().toISOString(),
    operator: ctx.operator,
    notes: ctx.notes,
    reason: ctx.reason,
    adjustmentSign: ctx.adjustmentSign,
    previousPhysicalStock: prev.physicalStock,
    resultingPhysicalStock: physical,
    previousReserved: prev.reserved,
    resultingReserved: reserved,
    previousAwaitingInspection: prev.awaitingInspection,
    resultingAwaitingInspection: awaiting,
    purchaseOrderId: ctx.purchaseOrderId,
    productionBatchId: ctx.productionBatchId,
  }
  await db.movements.add(movement)
  return movement
}

/** Pure balance transition for unit tests */
export function simulateMovementOnBalance(
  balance: InventoryBalance,
  type: MovementType,
  quantity: number,
  opts?: { decreaseAdjustment?: boolean },
): InventoryBalance {
  const b = { ...balance }
  switch (type) {
    case 'goods_receipt':
      b.physicalStock += quantity
      break
    case 'issue_to_production':
      b.physicalStock -= quantity
      break
    case 'reservation':
      b.reserved += quantity
      break
    case 'reservation_release':
      b.reserved -= quantity
      break
    case 'inspection_acceptance':
      b.awaitingInspection -= quantity
      break
    case 'inspection_rejection':
      b.awaitingInspection -= quantity
      b.physicalStock -= quantity
      break
    case 'stock_adjustment':
      b.physicalStock += opts?.decreaseAdjustment ? -quantity : quantity
      break
    default:
      break
  }
  return b
}

export function isSystemMovement(m: InventoryMovement): boolean {
  if (m.isSystem) return true
  if (m.id.startsWith('MVT-REV-')) return true
  if (m.reversedMovementId) return true
  if (m.notes && m.notes.startsWith('Reversal of deleted receipt')) return true
  return false
}

export interface MovementDeltas {
  physical: number
  reserved: number
  awaiting: number
}

export function computeMovementDelta(
  type: MovementType,
  quantity: number,
  adjustmentSign?: 'increase' | 'decrease',
): MovementDeltas {
  switch (type) {
    case 'goods_receipt':
    case 'return_from_production':
      return { physical: quantity, reserved: 0, awaiting: 0 }
    case 'issue_to_production':
    case 'return_to_supplier':
      return { physical: -quantity, reserved: 0, awaiting: 0 }
    case 'stock_adjustment':
      return {
        physical: adjustmentSign === 'decrease' ? -quantity : quantity,
        reserved: 0,
        awaiting: 0,
      }
    case 'inspection_acceptance':
      return { physical: 0, reserved: 0, awaiting: -quantity }
    case 'inspection_rejection':
      return { physical: -quantity, reserved: 0, awaiting: -quantity }
    case 'reservation':
      return { physical: 0, reserved: quantity, awaiting: 0 }
    case 'reservation_release':
      return { physical: 0, reserved: -quantity, awaiting: 0 }
    case 'transfer':
      return { physical: 0, reserved: 0, awaiting: 0 }
    default:
      return { physical: 0, reserved: 0, awaiting: 0 }
  }
}

export interface EditMovementInput {
  materialId: string
  type: MovementType
  quantity: number
  unit?: string
  timestamp?: string
  reason?: string
  notes?: string
  adjustmentSign?: 'increase' | 'decrease'
}

export async function editMovement(
  movementId: string,
  input: EditMovementInput,
): Promise<InventoryMovement> {
  const movement = await db.movements.get(movementId)
  if (!movement) {
    throw new MovementValidationError('Movement not found.')
  }
  if (isSystemMovement(movement)) {
    throw new MovementValidationError('System movements cannot be edited directly.')
  }
  if (input.quantity <= 0) {
    throw new MovementValidationError('Quantity must be greater than 0.')
  }
  if (!input.materialId) {
    throw new MovementValidationError('Material is required.')
  }
  if (!input.type) {
    throw new MovementValidationError('Type of Goods is required.')
  }
  if (input.timestamp && Number.isNaN(Date.parse(input.timestamp))) {
    throw new MovementValidationError('Date must be a valid date.')
  }

  const newMaterial = await db.materials.get(input.materialId)
  if (!newMaterial) {
    throw new MovementValidationError(`Material with ID "${input.materialId}" was not found.`)
  }

  let updatedMovement: InventoryMovement = { ...movement }

  await db.transaction('rw', [db.movements, db.balances, db.locationBalances], async () => {
    // 1. REVERSE old movement stock effect on old material
    const oldBal = (await db.balances.get(movement.materialId)) ?? {
      materialId: movement.materialId,
      physicalStock: 0,
      reserved: 0,
      awaitingInspection: 0,
      locationId: 'loc-consumables',
    }
    const oldSign =
      movement.adjustmentSign ??
      (movement.resultingPhysicalStock < movement.previousPhysicalStock ? 'decrease' : 'increase')
    const oldDelta = computeMovementDelta(movement.type, movement.quantity, oldSign)

    // Reverse: subtract the delta (negative stock is allowed)
    oldBal.physicalStock -= oldDelta.physical
    oldBal.reserved -= oldDelta.reserved
    oldBal.awaitingInspection -= oldDelta.awaiting
    await db.balances.put(oldBal)

    // Sync old location balance if existed
    if (movement.destinationLocationId) {
      const locKey = [movement.materialId, movement.destinationLocationId] as [string, string]
      const locRow = await db.locationBalances.get(locKey)
      if (locRow) {
        await db.locationBalances.put({
          materialId: movement.materialId,
          locationId: movement.destinationLocationId,
          quantity: locRow.quantity - oldDelta.physical,
        })
      }
    }

    // 2. APPLY new movement stock effect on new material
    const newBal =
      movement.materialId === input.materialId
        ? oldBal
        : (await db.balances.get(input.materialId)) ?? {
            materialId: input.materialId,
            physicalStock: 0,
            reserved: 0,
            awaitingInspection: 0,
            locationId: 'loc-consumables',
          }

    const prevPhysical = newBal.physicalStock
    const prevReserved = newBal.reserved
    const prevAwaiting = newBal.awaitingInspection

    const newDelta = computeMovementDelta(input.type, input.quantity, input.adjustmentSign)

    // Apply: add the delta (negative stock is allowed)
    newBal.physicalStock += newDelta.physical
    newBal.reserved += newDelta.reserved
    newBal.awaitingInspection += newDelta.awaiting
    await db.balances.put(newBal)

    // Sync new location balance if destination exists
    const destLoc = movement.destinationLocationId || newBal.locationId
    if (destLoc) {
      const locKey = [input.materialId, destLoc] as [string, string]
      const locRow = await db.locationBalances.get(locKey)
      if (locRow) {
        await db.locationBalances.put({
          materialId: input.materialId,
          locationId: destLoc,
          quantity: locRow.quantity + newDelta.physical,
        })
      }
    }

    // 3. Update the movement record itself
    updatedMovement = {
      ...movement,
      materialId: input.materialId,
      type: input.type,
      quantity: input.quantity,
      unit: input.unit || newMaterial.unit || movement.unit,
      timestamp: input.timestamp || movement.timestamp,
      notes: input.notes !== undefined ? input.notes : movement.notes,
      reason: input.reason !== undefined ? input.reason : movement.reason,
      adjustmentSign: input.adjustmentSign,
      previousPhysicalStock: prevPhysical,
      resultingPhysicalStock: newBal.physicalStock,
      previousReserved: prevReserved,
      resultingReserved: newBal.reserved,
      previousAwaitingInspection: prevAwaiting,
      resultingAwaitingInspection: newBal.awaitingInspection,
    }
    await db.movements.put(updatedMovement)
  })

  return updatedMovement
}

export async function deleteMovement(movementId: string): Promise<void> {
  const movement = await db.movements.get(movementId)
  if (!movement) {
    throw new MovementValidationError('Movement not found.')
  }
  if (isSystemMovement(movement)) {
    throw new MovementValidationError('System movements cannot be deleted directly.')
  }

  await db.transaction('rw', [db.movements, db.balances, db.locationBalances], async () => {
    // 1. Delete the movement
    await db.movements.delete(movementId)

    // 2. Reverse its stock effect (negative stock is allowed)
    const bal = (await db.balances.get(movement.materialId)) ?? {
      materialId: movement.materialId,
      physicalStock: 0,
      reserved: 0,
      awaitingInspection: 0,
      locationId: 'loc-consumables',
    }
    const sign =
      movement.adjustmentSign ??
      (movement.resultingPhysicalStock < movement.previousPhysicalStock ? 'decrease' : 'increase')
    const delta = computeMovementDelta(movement.type, movement.quantity, sign)

    bal.physicalStock -= delta.physical
    bal.reserved -= delta.reserved
    bal.awaitingInspection -= delta.awaiting
    await db.balances.put(bal)

    if (movement.destinationLocationId) {
      const locKey = [movement.materialId, movement.destinationLocationId] as [string, string]
      const locRow = await db.locationBalances.get(locKey)
      if (locRow) {
        await db.locationBalances.put({
          materialId: movement.materialId,
          locationId: movement.destinationLocationId,
          quantity: locRow.quantity - delta.physical,
        })
      }
    }
  })
}
