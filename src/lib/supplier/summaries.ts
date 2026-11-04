import type { Supplier } from '../../types/inventory'

export type SupplierSummary = {
  total: number
  active: number
  averageLeadTimeDays: number | null
  withMaterialAssociations: number
}

export function computeSupplierSummary(suppliers: Supplier[]): SupplierSummary {
  const activeSuppliers = suppliers.filter((s) => s.active)
  const withMats = suppliers.filter((s) => s.materialIds.length > 0)
  const leadValues = activeSuppliers
    .map((s) => s.avgDeliveryDays)
    .filter((d): d is number => d != null && Number.isFinite(d))
  const averageLeadTimeDays =
    leadValues.length === 0
      ? null
      : leadValues.reduce((a, b) => a + b, 0) / leadValues.length

  return {
    total: suppliers.length,
    active: activeSuppliers.length,
    averageLeadTimeDays,
    withMaterialAssociations: withMats.length,
  }
}
