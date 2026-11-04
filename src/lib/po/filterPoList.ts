import { filterByTab, partyLabel, poDateIso } from '../../features/purchasing/poPageUtils'
import type { Supplier } from '../../types/inventory'
import type { PurchaseOrder } from '../../types/purchasing'
import type { PoListParams } from './poListParams'

const PAGE_SIZE = 20

export function filterPurchaseOrders(
  orders: PurchaseOrder[],
  params: PoListParams,
  suppliers: Map<string, Supplier>,
): PurchaseOrder[] {
  let list = filterByTab(orders, params.tab)
  if (params.status !== 'all') {
    list = list.filter((p) => p.status === params.status)
  }
  const q = params.q.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (p) =>
        p.poNumber.toLowerCase().includes(q) ||
        partyLabel(p, suppliers).toLowerCase().includes(q) ||
        p.lines.some((l) => (l.description ?? '').toLowerCase().includes(q)),
    )
  }
  if (params.from) {
    list = list.filter((p) => poDateIso(p).slice(0, 10) >= params.from)
  }
  if (params.to) {
    list = list.filter((p) => poDateIso(p).slice(0, 10) <= params.to)
  }
  list = [...list].sort((a, b) => sortCompare(a, b, params.sort))
  return list
}

function sortCompare(
  a: PurchaseOrder,
  b: PurchaseOrder,
  sort: PoListParams['sort'],
): number {
  if (sort === 'po_number') return a.poNumber.localeCompare(b.poNumber)
  if (sort === 'po_date_desc') {
    return poDateIso(b).localeCompare(poDateIso(a))
  }
  return b.createdAt.localeCompare(a.createdAt)
}

export function paginatePoList<T>(list: T[], page: number): T[] {
  const p = Math.max(1, page)
  const start = (p - 1) * PAGE_SIZE
  return list.slice(start, start + PAGE_SIZE)
}

export { PAGE_SIZE as PO_LIST_PAGE_SIZE }
