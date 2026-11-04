import type { PurchaseOrderStatus } from '../../types/purchasing'
import type { PoTab } from '../../features/purchasing/poPageUtils'

export interface PoListParams {
  tab: PoTab
  status: PurchaseOrderStatus | 'all'
  q: string
  page: number
  sort: 'created_desc' | 'po_date_desc' | 'po_number'
  from: string
  to: string
}

export const DEFAULT_PO_LIST_PARAMS: PoListParams = {
  tab: 'all',
  status: 'all',
  q: '',
  page: 1,
  sort: 'created_desc',
  from: '',
  to: '',
}

function parseTab(raw: string | null): PoTab {
  if (!raw || raw === 'all') return 'all'
  if (raw === 'customer' || raw === 'received_from_customer') return 'received_from_customer'
  if (raw === 'raw' || raw === 'issued_to_supplier') return 'issued_to_supplier'
  return 'all'
}

export function parsePoListParams(search: URLSearchParams): PoListParams {
  const tab = parseTab(search.get('tab'))
  const status = (search.get('status') as PoListParams['status'] | null) ?? 'all'
  const pageRaw = Number(search.get('page') ?? '1')
  const sort = (search.get('sort') as PoListParams['sort'] | null) ?? 'created_desc'
  return {
    tab,
    status,
    q: search.get('q') ?? '',
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    sort: sort === 'po_date_desc' || sort === 'po_number' ? sort : 'created_desc',
    from: search.get('from') ?? '',
    to: search.get('to') ?? '',
  }
}

export function serializePoListParams(p: PoListParams): string {
  const sp = new URLSearchParams()
  if (p.tab === 'received_from_customer') sp.set('tab', 'customer')
  else if (p.tab === 'issued_to_supplier') sp.set('tab', 'raw')
  else if (p.tab !== 'all') sp.set('tab', p.tab)
  if (p.status !== 'all') sp.set('status', p.status)
  if (p.q.trim()) sp.set('q', p.q.trim())
  if (p.page > 1) sp.set('page', String(p.page))
  if (p.sort !== 'created_desc') sp.set('sort', p.sort)
  if (p.from) sp.set('from', p.from)
  if (p.to) sp.set('to', p.to)
  return sp.toString()
}

export function listPathWithParams(p: PoListParams): string {
  const qs = serializePoListParams(p)
  return qs ? `/purchase-orders?${qs}` : '/purchase-orders'
}

/** True when the click target is inside an interactive control that should not navigate. */
export function shouldIgnorePoRowNavigation(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest(
      'a, button, input, select, textarea, [role="menu"], [role="menuitem"], [data-po-row-ignore]',
    ),
  )
}
