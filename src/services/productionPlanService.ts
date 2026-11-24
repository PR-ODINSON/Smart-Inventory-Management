import { db } from '../storage/database'
import type {
  MaterialConsumptionRate,
  MaterialIssue,
  MaterialReceipt,
  ProductionPlan,
} from '../types/productionPlanning'
import { applyMovement } from './inventoryMovementService'

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

// -------------------------------------------------------------
// Production Plans
// -------------------------------------------------------------

export async function getActiveProductionPlan(month?: string): Promise<ProductionPlan | null> {
  const targetMonth = month || new Date().toISOString().slice(0, 7)
  const plans = await db.productionPlans.where('month').equals(targetMonth).toArray()
  return plans[0] ?? null
}

export async function listProductionPlans(): Promise<ProductionPlan[]> {
  return db.productionPlans.orderBy('month').reverse().toArray()
}

export async function saveProductionPlan(plan: Omit<ProductionPlan, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<ProductionPlan> {
  if (plan.targetTonnes > plan.maxCapacityTonnes) {
    throw new Error('Selected monthly target cannot exceed maximum monthly capacity.')
  }
  if (plan.targetTonnes < 0 || plan.maxCapacityTonnes <= 0) {
    throw new Error('Target must be >= 0 and capacity must be > 0.')
  }
  if (plan.workingDays <= 0) {
    throw new Error('Planned working days must be greater than 0.')
  }

  const existing = await db.productionPlans.where('month').equals(plan.month).toArray()
  const existingPlan = existing.find((p) => !plan.id || p.id !== plan.id)
  if (existingPlan) {
    throw new Error(`A production plan for month ${plan.month} already exists. Please edit the existing plan.`)
  }

  const now = new Date().toISOString()
  const toSave: ProductionPlan = {
    id: plan.id || newId('PLAN'),
    month: plan.month,
    maxCapacityTonnes: plan.maxCapacityTonnes,
    targetTonnes: plan.targetTonnes,
    workingDays: plan.workingDays,
    desiredInventoryDays: plan.desiredInventoryDays ?? 7,
    createdAt: now,
    updatedAt: now,
  }

  await db.productionPlans.put(toSave)
  return toSave
}

// -------------------------------------------------------------
// Material Consumption Rates
// -------------------------------------------------------------

export async function listMaterialConsumptionRates(): Promise<MaterialConsumptionRate[]> {
  return db.materialConsumptionRates.toArray()
}

export async function getConsumptionRateForMaterial(materialId: string, grade?: string): Promise<number> {
  const allRates = await db.materialConsumptionRates.where('materialId').equals(materialId).toArray()
  if (allRates.length === 0) return 0

  if (grade) {
    const matched = allRates.find((r) => r.grade && r.grade.toLowerCase() === grade.toLowerCase())
    if (matched) return matched.rateKgPerKgCasting
  }
  const defaultRate = allRates.find((r) => !r.grade)
  return defaultRate ? defaultRate.rateKgPerKgCasting : allRates[0].rateKgPerKgCasting
}

export async function saveMaterialConsumptionRate(
  rate: Omit<MaterialConsumptionRate, 'id' | 'updatedAt'> & { id?: string },
): Promise<MaterialConsumptionRate> {
  if (rate.rateKgPerKgCasting < 0) {
    throw new Error('Consumption rate cannot be negative.')
  }
  const now = new Date().toISOString()
  const toSave: MaterialConsumptionRate = {
    id: rate.id || newId('MCR'),
    materialId: rate.materialId,
    grade: rate.grade?.trim() || undefined,
    rateKgPerKgCasting: rate.rateKgPerKgCasting,
    sourceNotes: rate.sourceNotes?.trim() || undefined,
    updatedAt: now,
  }
  await db.materialConsumptionRates.put(toSave)
  return toSave
}

// -------------------------------------------------------------
// Material Receipts (Upload Bill / Receive Material)
// -------------------------------------------------------------

export interface RecordMaterialReceiptInput {
  supplierId?: string
  supplierName: string
  invoiceNumber: string
  invoiceDate?: string
  materialId: string
  billedQty: number
  receivedQty: number
  unit: string
  rate?: number
  amount?: number
  locationId?: string
  remarks?: string
}

export async function checkDuplicateMaterialReceipt(
  supplierName: string,
  invoiceNumber: string,
): Promise<boolean> {
  const normSupplier = supplierName.trim().toLowerCase()
  const normInvoice = invoiceNumber.trim().toLowerCase()
  const existing = await db.materialReceipts
    .filter(
      (r) =>
        r.supplierName.trim().toLowerCase() === normSupplier &&
        r.invoiceNumber.trim().toLowerCase() === normInvoice,
    )
    .first()

  return Boolean(existing)
}

/**
 * Creates a material receipt and increases the material's physical stock
 * by the accepted RECEIVED quantity (not billed quantity).
 * Duplicate invoice prevention is enforced.
 */
export async function recordMaterialReceipt(
  input: RecordMaterialReceiptInput,
): Promise<MaterialReceipt> {
  const normSupplier = input.supplierName.trim()
  const normInvoice = input.invoiceNumber.trim()

  if (!normInvoice) {
    throw new Error('Invoice number is required.')
  }
  if (input.receivedQty < 0) {
    throw new Error('Received quantity cannot be negative.')
  }

  const isDuplicate = await checkDuplicateMaterialReceipt(normSupplier, normInvoice)
  if (isDuplicate) {
    throw new Error('This invoice has already been recorded.')
  }

  const material = await db.materials.get(input.materialId)
  if (!material) {
    throw new Error(`Material with ID "${input.materialId}" was not found.`)
  }

  const now = new Date().toISOString()
  const receiptRecord: MaterialReceipt = {
    id: newId('MRCP'),
    supplierId: input.supplierId,
    supplierName: normSupplier,
    invoiceNumber: normInvoice,
    invoiceDate: input.invoiceDate,
    materialId: input.materialId,
    billedQty: input.billedQty,
    receivedQty: input.receivedQty,
    unit: input.unit || material.unit,
    rate: input.rate,
    amount: input.amount,
    receivedAt: now,
    locationId: input.locationId,
    remarks: input.remarks,
  }

  // Atomically add receipt and apply movement to update stock
  await db.transaction('rw', [db.materialReceipts, db.balances, db.locationBalances, db.movements], async () => {
    await db.materialReceipts.add(receiptRecord)
    if (input.receivedQty > 0) {
      await applyMovement({
        material,
        type: 'goods_receipt',
        quantity: input.receivedQty,
        referenceNumber: normInvoice,
        notes: `Received from bill ${normInvoice} (${normSupplier}). Billed: ${input.billedQty} ${input.unit}, Received: ${input.receivedQty} ${input.unit}`,
        destinationLocationId: input.locationId,
      })
    }
  })

  return receiptRecord
}

export async function listMaterialReceipts(): Promise<MaterialReceipt[]> {
  return db.materialReceipts.orderBy('receivedAt').reverse().toArray()
}

/**
 * Deletes a material receipt and reverses the stock addition in one transaction.
 * Negative stock is ALLOWED — it is the user's responsibility to reconcile.
 * If a location balance row does not exist, that sub-step is skipped (not an error).
 */
export async function deleteMaterialReceipt(receiptId: string): Promise<void> {
  const receipt = await db.materialReceipts.get(receiptId)
  if (!receipt) {
    throw new Error('Material receipt not found.')
  }

  // Fetch material outside the transaction so we don't access an undeclared table inside Dexie rw transaction
  const material = await db.materials.get(receipt.materialId)

  await db.transaction('rw', [db.materialReceipts, db.balances, db.locationBalances, db.movements], async () => {
    // 1. Delete receipt
    await db.materialReceipts.delete(receiptId)

    // 2. Deduct from balance (may go negative — intentional)
    if (receipt.receivedQty > 0) {
      const existingBalance = await db.balances.get(receipt.materialId)
      const balance = existingBalance ?? {
        materialId: receipt.materialId,
        physicalStock: 0,
        reserved: 0,
        awaitingInspection: 0,
        locationId: receipt.locationId ?? 'loc-consumables',
      }
      const currentPhysical = balance.physicalStock
      // Allow negative: DO NOT block if currentPhysical - receivedQty < 0
      const nextPhysical = currentPhysical - receipt.receivedQty

      await db.balances.put({
        ...balance,
        physicalStock: nextPhysical,
      })

      // 3. Update location balance if applicable — skip if row does not exist (not an error)
      const locId = receipt.locationId || balance.locationId
      if (locId) {
        const key = [receipt.materialId, locId] as [string, string]
        const locRow = await db.locationBalances.get(key)
        if (locRow) {
          await db.locationBalances.put({
            materialId: receipt.materialId,
            locationId: locId,
            quantity: locRow.quantity - receipt.receivedQty,
          })
        }
        // If locRow doesn't exist, skip gracefully
      }

      // 4. Record compensatory stock_adjustment movement
      await db.movements.add({
        id: `MVT-REV-${crypto.randomUUID()}`,
        materialId: receipt.materialId,
        type: 'stock_adjustment',
        isSystem: true,
        quantity: receipt.receivedQty,
        unit: receipt.unit || material?.unit || 'kg',
        timestamp: new Date().toISOString(),
        notes: `Reversal of deleted receipt ${receipt.invoiceNumber} (${receipt.supplierName})`,
        referenceNumber: receipt.invoiceNumber,
        previousPhysicalStock: currentPhysical,
        resultingPhysicalStock: nextPhysical,
        previousReserved: balance.reserved,
        resultingReserved: balance.reserved,
        previousAwaitingInspection: balance.awaitingInspection,
        resultingAwaitingInspection: balance.awaitingInspection,
      })
    }
  })
}

// -------------------------------------------------------------
// Material Issues (Issue to Production / Record Consumption)
// -------------------------------------------------------------

export interface RecordMaterialIssueInput {
  materialId: string
  quantity: number
  unit?: string
  productionBatchId?: string
  remarks?: string
  operator?: string
  date?: string
}

/**
 * Records actual material consumption issued to production.
 * Reduces the material's physical stock balance.
 * Uses ACTUAL issued quantity without applying planning allowance.
 */
export async function recordMaterialIssue(
  input: RecordMaterialIssueInput,
): Promise<MaterialIssue> {
  if (input.quantity <= 0) {
    throw new Error('Issued quantity must be greater than 0.')
  }

  const material = await db.materials.get(input.materialId)
  if (!material) {
    throw new Error(`Material with ID "${input.materialId}" was not found.`)
  }

  const now = input.date ? new Date(input.date).toISOString() : new Date().toISOString()
  const issueRecord: MaterialIssue = {
    id: newId('MISS'),
    materialId: input.materialId,
    quantity: input.quantity,
    unit: input.unit || material.unit,
    productionBatchId: input.productionBatchId,
    issuedAt: now,
    remarks: input.remarks,
    operator: input.operator,
  }

  // Atomically add issue and apply movement to reduce stock
  await db.transaction('rw', [db.materialIssues, db.balances, db.locationBalances, db.movements], async () => {
    await db.materialIssues.add(issueRecord)
    await applyMovement({
      material,
      type: 'issue_to_production',
      quantity: input.quantity,
      referenceNumber: input.productionBatchId,
      notes: input.remarks || 'Issued to production',
      operator: input.operator,
      productionBatchId: input.productionBatchId,
    })
  })

  return issueRecord
}

export async function listMaterialIssues(): Promise<MaterialIssue[]> {
  return db.materialIssues.orderBy('issuedAt').reverse().toArray()
}
