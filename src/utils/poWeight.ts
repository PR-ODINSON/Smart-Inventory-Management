import type { PurchaseOrder, PurchaseOrderLine } from '../types/purchasing'
import { isCustomerPo } from '../types/purchasing'

/** Total weight for one line: quantity × weight per unit */
export function lineTotalWeight(line: PurchaseOrderLine): number {
  const qty = line.orderQuantity
  const perUnit = line.unitWeight ?? 0
  if (qty <= 0 || perUnit <= 0) return 0
  return qty * perUnit
}

export function lineWeightKg(po: PurchaseOrder, line: PurchaseOrderLine): number {
  if (isCustomerPo(po)) {
    return line.totalWeightKg ?? 0
  }
  return lineTotalWeight(line)
}

/** Sum of line weights on a single PO */
export function purchaseOrderTotalWeight(po: PurchaseOrder): number {
  return po.lines.reduce((sum, line) => sum + lineWeightKg(po, line), 0)
}

/** Cumulative weight across many POs (optionally exclude cancelled) */
export function allPurchaseOrdersTotalWeight(
  orders: PurchaseOrder[],
  options?: { excludeCancelled?: boolean },
): number {
  const list = options?.excludeCancelled
    ? orders.filter((p) => p.status !== 'cancelled')
    : orders
  return list.reduce((sum, po) => sum + purchaseOrderTotalWeight(po), 0)
}

export function defaultUnitWeightKg(unit: string, materialUnitWeight?: number): number {
  if (materialUnitWeight != null && materialUnitWeight > 0) return materialUnitWeight
  const u = unit.toLowerCase()
  if (u === 'kg') return 1
  if (u === 'tonnes' || u === 'tonne' || u === 't') return 1000
  return 0
}
