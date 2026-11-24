import { db } from '../storage/database'
import type { DispatchRecord } from '../types/dispatch'
export type { DispatchRecord } from '../types/dispatch'
import { calculateLineWeightPerPieceKg } from '../lib/productionPlanning'

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export interface CreateDispatchInput {
  customerPoId: string
  poItemId: string
  quantity: number
  dispatchDate?: string
  invoiceNo: string
  vehicleNumber: string
  remarks?: string
}

export interface PoItemDispatchInfo {
  poId: string
  poNumber: string
  customerName: string
  itemId: string
  itemName: string
  orderedQuantity: number
  fulfilledQuantity: number
  pendingQuantity: number
  weightPerPieceKg: number
  pendingWeightKg: number
  deliveryDeadline?: string
  unit: string
}

export function sortToDispatchItems<T extends { deliveryDeadline?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (!a.deliveryDeadline && !b.deliveryDeadline) return 0
    if (!a.deliveryDeadline) return 1
    if (!b.deliveryDeadline) return -1
    return a.deliveryDeadline.localeCompare(b.deliveryDeadline)
  })
}

/**
 * Lists all customer PO items that currently have pending quantity > 0,
 * sorted by delivery deadline (earliest first).
 */
export async function listPendingPoItems(): Promise<PoItemDispatchInfo[]> {
  const pos = await db.purchaseOrders.where('direction').equals('received_from_customer').toArray()
  const items: PoItemDispatchInfo[] = []

  for (const po of pos) {
    if (po.status === 'cancelled') continue
    const customerName = po.buyer?.name || 'Customer'

    for (const line of po.lines) {
      const ordered = line.quantityNos ?? line.orderQuantity ?? 0
      const fulfilled = line.dispatchedQuantity ?? line.receivedQuantity ?? 0
      const pending = Math.max(0, ordered - fulfilled)

      if (pending > 0) {
        const wtPerPiece = calculateLineWeightPerPieceKg(line)
        const itemName = line.description || line.buyerItemCode || 'Casting Item'
        items.push({
          poId: po.id,
          poNumber: po.poNumber,
          customerName,
          itemId: line.id,
          itemName,
          orderedQuantity: ordered,
          fulfilledQuantity: fulfilled,
          pendingQuantity: pending,
          weightPerPieceKg: wtPerPiece,
          pendingWeightKg: wtPerPiece > 0 ? pending * wtPerPiece : 0,
          deliveryDeadline: line.deliveryDate || po.expectedDeliveryDate,
          unit: line.unit || 'nos',
        })
      }
    }
  }

  return sortToDispatchItems(items)
}

/**
 * Creates a Dispatch record and updates the customer PO item's fulfilled quantity
 * in ONE Dexie transaction.
 * Does NOT alter raw material inventory stock.
 */
export async function createDispatch(input: CreateDispatchInput): Promise<DispatchRecord> {
  const { customerPoId, poItemId, quantity } = input
  const invoiceNo = input.invoiceNo?.trim()
  if (!invoiceNo) {
    throw new Error('Invoice No is required.')
  }
  const vehicleNumber = input.vehicleNumber?.trim().toUpperCase()
  if (!vehicleNumber) {
    throw new Error('Vehicle Number is required.')
  }
  if (quantity <= 0) {
    throw new Error('Quantity must be greater than 0.')
  }

  let createdDispatch: DispatchRecord | null = null

  await db.transaction('rw', [db.purchaseOrders, db.dispatches], async () => {
    const po = await db.purchaseOrders.get(customerPoId)
    if (!po) throw new Error('Customer purchase order not found.')

    const line = po.lines.find((l) => l.id === poItemId)
    if (!line) throw new Error('PO line item not found.')

    const ordered = line.quantityNos ?? line.orderQuantity ?? 0
    const currentFulfilled = line.dispatchedQuantity ?? line.receivedQuantity ?? 0
    const pending = Math.max(0, ordered - currentFulfilled)

    if (quantity > pending) {
      throw new Error(`Quantity cannot be more than pending quantity (${pending} remaining).`)
    }

    const wtPerPiece = calculateLineWeightPerPieceKg(line)
    const totalWeightKg = wtPerPiece > 0 ? quantity * wtPerPiece : undefined
    const itemName = line.description || line.buyerItemCode || line.materialId || 'Casting Item'

    const now = new Date().toISOString()
    const dispatchDate = input.dispatchDate || now.split('T')[0]

    createdDispatch = {
      id: newId('DSP'),
      customerPoId,
      poItemId,
      materialName: itemName,
      quantity,
      unit: line.unit || 'nos',
      totalWeightKg,
      dispatchDate,
      invoiceNo,
      vehicleNumber,
      remarks: input.remarks?.trim() || undefined,
      createdAt: now,
    }

    // 1. Save Dispatch Record
    await db.dispatches.add(createdDispatch)

    // 2. Increase fulfilled quantity on PO line
    const newFulfilled = currentFulfilled + quantity
    line.dispatchedQuantity = newFulfilled
    if (line.receivedQuantity !== undefined) {
      line.receivedQuantity = newFulfilled
    }

    // Update PO status if all items fulfilled
    const allFulfilled = po.lines.every((l) => {
      const o = l.quantityNos ?? l.orderQuantity ?? 0
      const f = l.dispatchedQuantity ?? l.receivedQuantity ?? 0
      return f >= o
    })
    po.status = allFulfilled ? 'dispatched' : 'partially_dispatched'
    po.updatedAt = now

    await db.purchaseOrders.put(po)
  })

  if (!createdDispatch) throw new Error('Failed to create dispatch.')
  return createdDispatch
}

/**
 * Reverses a dispatch in ONE Dexie transaction:
 * - Decreases line.dispatchedQuantity by dispatch.quantity
 * - Deletes the Dispatch record
 */
export async function deleteDispatch(dispatchId: string): Promise<void> {
  await db.transaction('rw', [db.purchaseOrders, db.dispatches], async () => {
    const dsp = await db.dispatches.get(dispatchId)
    if (!dsp) return

    const po = await db.purchaseOrders.get(dsp.customerPoId)
    if (po) {
      const line = po.lines.find((l) => l.id === dsp.poItemId)
      if (line) {
        const currentFulfilled = line.dispatchedQuantity ?? line.receivedQuantity ?? 0
        if (currentFulfilled - dsp.quantity < 0) {
          throw new Error('Reversing this dispatch would make fulfilled quantity negative.')
        }
        const newFulfilled = Math.max(0, currentFulfilled - dsp.quantity)
        line.dispatchedQuantity = newFulfilled
        if (line.receivedQuantity !== undefined) {
          line.receivedQuantity = newFulfilled
        }

        const anyDispatched = po.lines.some((l) => (l.dispatchedQuantity ?? 0) > 0)
        po.status = anyDispatched ? 'partially_dispatched' : 'ordered'
        po.updatedAt = new Date().toISOString()
        await db.purchaseOrders.put(po)
      }
    }

    await db.dispatches.delete(dispatchId)
  })
}

export interface DispatchWithDetails extends DispatchRecord {
  customerPoNumber: string
  customerName: string
}

export async function listDispatches(): Promise<DispatchRecord[]> {
  return db.dispatches.orderBy('createdAt').reverse().toArray()
}

export async function listDispatchesWithDetails(): Promise<DispatchWithDetails[]> {
  const [dispatches, pos] = await Promise.all([
    db.dispatches.orderBy('createdAt').reverse().toArray(),
    db.purchaseOrders.toArray(),
  ])
  const poMap = new Map<string, { poNumber: string; customerName: string }>()
  for (const po of pos) {
    poMap.set(po.id, {
      poNumber: po.poNumber,
      customerName: po.buyer?.name || 'Customer',
    })
  }

  return dispatches.map((d) => {
    const poInfo = poMap.get(d.customerPoId)
    return {
      ...d,
      customerPoNumber: poInfo?.poNumber || '—',
      customerName: poInfo?.customerName || '—',
    }
  })
}

export interface PoOriginalAndCurrentItem {
  poId: string
  poNumber: string
  customerName: string
  lineId: string
  itemName: string
  unit: string
  weightPerPieceKg: number
  originalOrderedQty: number
  originalTotalWeightKg: number
  totalDispatchedQty: number
  totalDispatchedWeightKg: number
  currentPendingQty: number
  currentPendingWeightKg: number
  deliveryDeadline?: string
}

export async function getOriginalAndCurrentPoLists(): Promise<PoOriginalAndCurrentItem[]> {
  const pos = await db.purchaseOrders.where('direction').equals('received_from_customer').toArray()
  const result: PoOriginalAndCurrentItem[] = []

  for (const po of pos) {
    if (po.status === 'cancelled') continue
    const customerName = po.buyer?.name || 'Customer'

    for (const line of po.lines) {
      const originalOrderedQty = line.quantityNos ?? line.orderQuantity ?? 0
      const totalDispatchedQty = line.dispatchedQuantity ?? line.receivedQuantity ?? 0
      const currentPendingQty = Math.max(0, originalOrderedQty - totalDispatchedQty)
      const weightPerPieceKg = calculateLineWeightPerPieceKg(line)

      const originalTotalWeightKg = line.totalWeightKg && line.totalWeightKg > 0
        ? line.totalWeightKg
        : weightPerPieceKg * originalOrderedQty

      const totalDispatchedWeightKg = weightPerPieceKg > 0 ? totalDispatchedQty * weightPerPieceKg : 0
      const currentPendingWeightKg = weightPerPieceKg > 0 ? currentPendingQty * weightPerPieceKg : 0

      result.push({
        poId: po.id,
        poNumber: po.poNumber,
        customerName,
        lineId: line.id,
        itemName: line.description || line.buyerItemCode || line.materialId || 'Casting Item',
        unit: line.unit || 'nos',
        weightPerPieceKg,
        originalOrderedQty,
        originalTotalWeightKg,
        totalDispatchedQty,
        totalDispatchedWeightKg,
        currentPendingQty,
        currentPendingWeightKg,
        deliveryDeadline: line.deliveryDate || po.expectedDeliveryDate,
      })
    }
  }

  return result
}
