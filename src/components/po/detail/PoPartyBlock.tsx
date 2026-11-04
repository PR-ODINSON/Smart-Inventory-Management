import type { PurchaseOrder } from '../../../types/purchasing'
import { isCustomerPo } from '../../../types/purchasing'
import type { Supplier } from '../../../types/inventory'
import { partyLabel } from '../../../features/purchasing/poPageUtils'

function dash(v?: string | null): string {
  if (v == null || String(v).trim() === '') return '—'
  return v
}

export function PoPartyBlock({
  po,
  suppliers,
}: {
  po: PurchaseOrder
  suppliers: Map<string, Supplier>
}) {
  const customer = isCustomerPo(po)
  const party = customer ? po.buyer : undefined
  const supplierName = customer ? undefined : partyLabel(po, suppliers)

  return (
    <div className="rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-800">
      <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Party</p>
      <dl className="grid gap-1.5">
        <Row label="Name" value={dash(party?.name ?? supplierName)} />
        {customer && (
          <Row label="Vendor code" value={dash(po.counterpartyVendorCode ?? party?.vendorCode)} />
        )}
        <Row label="GSTIN" value={dash(party?.gstin)} />
      </dl>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  )
}
