import type { Supplier } from '../../types/inventory'
import { normalizeCompanyName } from './validation'

export type SupplierStatusFilter = 'all' | 'active' | 'inactive'

export type SupplierSort =
  | 'company_asc'
  | 'avgLead_asc'
  | 'avgLead_desc'
  | 'maxLead_asc'
  | 'maxLead_desc'

export type SupplierListParams = {
  search?: string
  status: SupplierStatusFilter
  materialId?: string
  sort: SupplierSort
}

export function filterAndSortSuppliers(
  suppliers: Supplier[],
  params: SupplierListParams,
): Supplier[] {
  let list = [...suppliers]
  const q = params.search?.trim().toLowerCase()
  if (q) {
    list = list.filter((s) => {
      const hay = [
        s.companyName,
        s.contactPerson ?? '',
        s.phone ?? '',
        s.email ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q) || normalizeCompanyName(s.companyName).includes(q)
    })
  }
  if (params.status === 'active') list = list.filter((s) => s.active)
  if (params.status === 'inactive') list = list.filter((s) => !s.active)
  if (params.materialId) {
    list = list.filter((s) => s.materialIds.includes(params.materialId!))
  }

  const avg = (s: Supplier) => s.avgDeliveryDays ?? 0
  const max = (s: Supplier) => s.maxDeliveryDays ?? 0

  list.sort((a, b) => {
    switch (params.sort) {
      case 'company_asc':
        return a.companyName.localeCompare(b.companyName)
      case 'avgLead_asc':
        return avg(a) - avg(b)
      case 'avgLead_desc':
        return avg(b) - avg(a)
      case 'maxLead_asc':
        return max(a) - max(b)
      case 'maxLead_desc':
        return max(b) - max(a)
      default:
        return 0
    }
  })
  return list
}

export function hasActiveFilters(params: SupplierListParams): boolean {
  return Boolean(
    params.search?.trim() ||
      params.status !== 'all' ||
      params.materialId ||
      params.sort !== 'company_asc',
  )
}

export const DEFAULT_SUPPLIER_LIST_PARAMS: SupplierListParams = {
  status: 'all',
  sort: 'company_asc',
}
