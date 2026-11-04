import type { MaterialComputed } from '../../types/inventory'

export type PurchaseRequirement = {
  materialId: string
  materialName: string
  category: string
  unit: string
  quantity: number
  /** Extra detail (notes only — category is shown separately when grouped). */
  specification?: string
  requestedDeliveryDate?: string
}

/** Derived from inventory reorder metrics — not a separate persisted model. */
export function materialNeedsPurchase(row: MaterialComputed): boolean {
  return row.recommendedOrderQty > 0
}

export function toPurchaseRequirement(row: MaterialComputed): PurchaseRequirement {
  const notes = row.material.notes?.trim()
  return {
    materialId: row.material.id,
    materialName: row.material.name,
    category: row.material.category,
    unit: row.material.unit,
    quantity: row.recommendedOrderQty,
    specification: notes || undefined,
    requestedDeliveryDate: row.latestSafeOrderDate ?? undefined,
  }
}

export function listPurchaseRequirements(
  rows: MaterialComputed[],
): PurchaseRequirement[] {
  return rows.filter(materialNeedsPurchase).map(toPurchaseRequirement)
}
