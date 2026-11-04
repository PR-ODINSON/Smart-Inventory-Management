import type { Supplier } from '../../types/inventory'

export function suppliersForMaterial(
  suppliers: Supplier[],
  materialId: string,
  { activeOnly = true }: { activeOnly?: boolean } = {},
): Supplier[] {
  return suppliers.filter(
    (s) =>
      s.materialIds.includes(materialId) && (!activeOnly || s.active),
  )
}

export function countPurchaseOrdersForSupplier(
  purchaseOrders: { supplierId?: string }[],
  supplierId: string,
): number {
  return purchaseOrders.filter((po) => po.supplierId === supplierId).length
}
