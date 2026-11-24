import type { PurchaseOrder, PurchaseOrderLine } from '../../types/purchasing'
import { applyCustomerPoTotals } from '../../services/customerPoCalculator'

export interface ManualPoItemDraft {
  id: string
  itemName: string
  castingSpec: string
  weightPerPiece: number
  orderedQty: number
  deadline: string
  dispatchedQty?: number
}

export interface ManualPoRowErrors {
  itemName?: string
  weightPerPiece?: string
  orderedQty?: string
  deadline?: string
}

export function createEmptyManualPoItem(defaultDeadline?: string): ManualPoItemDraft {
  return {
    id: `POL-${crypto.randomUUID()}`,
    itemName: '',
    castingSpec: '',
    weightPerPiece: 0,
    orderedQty: 0,
    deadline: defaultDeadline ?? new Date().toISOString().split('T')[0],
  }
}

export function computeRowWeightKg(weightPerPiece: number, orderedQty: number): number {
  if (!Number.isFinite(weightPerPiece) || !Number.isFinite(orderedQty)) return 0
  if (weightPerPiece <= 0 || orderedQty <= 0) return 0
  return Math.round(weightPerPiece * orderedQty * 1000) / 1000
}

export function computeTotalPoWeightKg(rows: Pick<ManualPoItemDraft, 'weightPerPiece' | 'orderedQty'>[]): number {
  const sum = rows.reduce((acc, r) => acc + computeRowWeightKg(r.weightPerPiece, r.orderedQty), 0)
  return Math.round(sum * 1000) / 1000
}

export function validateManualPoRow(row: ManualPoItemDraft): ManualPoRowErrors {
  const errors: ManualPoRowErrors = {}
  if (!row.itemName.trim()) {
    errors.itemName = 'Item Name is required.'
  }
  if (!Number.isFinite(row.weightPerPiece) || row.weightPerPiece <= 0) {
    errors.weightPerPiece = 'Weight per piece must be > 0.'
  }
  if (!Number.isFinite(row.orderedQty) || row.orderedQty <= 0 || !Number.isInteger(row.orderedQty)) {
    errors.orderedQty = 'Ordered quantity must be a whole number > 0.'
  } else if (row.dispatchedQty != null && row.orderedQty < row.dispatchedQty) {
    errors.orderedQty = `Cannot be less than dispatched (${row.dispatchedQty}).`
  }
  if (!row.deadline || Number.isNaN(Date.parse(row.deadline))) {
    errors.deadline = 'Valid delivery deadline is required.'
  }
  return errors
}

export function removeManualPoRow(
  rows: ManualPoItemDraft[],
  index: number,
): { rows: ManualPoItemDraft[]; error?: string } {
  if (rows.length <= 1) {
    return { rows, error: 'At least 1 item row is required.' }
  }
  const target = rows[index]
  if (target && (target.dispatchedQty ?? 0) > 0) {
    return { rows, error: 'Cannot remove — this item has already been dispatched.' }
  }
  return { rows: rows.filter((_, i) => i !== index) }
}

export function buildCustomerPoFromDraft(input: {
  poId?: string
  customerName: string
  poNumber: string
  rows: ManualPoItemDraft[]
  now?: string
}): PurchaseOrder {
  const now = input.now ?? new Date().toISOString()
  const lines: PurchaseOrderLine[] = input.rows.map((r) => ({
    id: r.id,
    materialId: r.itemName.trim(),
    buyerItemCode: r.itemName.trim(),
    description: r.itemName.trim(),
    orderQuantity: r.orderedQty,
    quantityNos: r.orderedQty,
    unit: 'nos',
    unitWeight: r.weightPerPiece,
    weightUnit: 'kg',
    totalWeightKg: computeRowWeightKg(r.weightPerPiece, r.orderedQty),
    receivedQuantity: 0,
    dispatchedQuantity: r.dispatchedQty ?? 0,
    deliveryDate: r.deadline,
    grade: r.castingSpec.trim() || undefined,
  }))

  const earliestDeadline = input.rows
    .map((r) => r.deadline)
    .filter(Boolean)
    .sort()[0]

  const po: PurchaseOrder = {
    id: input.poId ?? `PO-${crypto.randomUUID()}`,
    poNumber: input.poNumber.trim(),
    direction: 'received_from_customer',
    status: 'ordered',
    approvalStatus: 'approved',
    createdAt: now,
    updatedAt: now,
    expectedDeliveryDate: earliestDeadline,
    buyer: {
      name: input.customerName.trim(),
    },
    lines,
  }

  return applyCustomerPoTotals(po)
}
