import type { PurchaseOrder } from '../../../types/purchasing'
import { isCustomerPo } from '../../../types/purchasing'
import {
  customerTotalsForPo,
  earliestOutstandingDueDate,
  overdueDays,
  poOutstandingKg,
  poProgressPercent,
  poReceivedKg,
  poTotalKg,
  poValueInfo,
} from '../../../lib/po/poSelectors'
import { formatDate, formatNumber } from '../../../utils/formatting'

export function PoSummaryCards({ po }: { po: PurchaseOrder }) {
  const customer = isCustomerPo(po)
  const progress = poProgressPercent(po)
  const due = earliestOutstandingDueDate(po)
  const overdue = overdueDays(due)

  if (customer) {
    const totals = customerTotalsForPo(po)
    const value = poValueInfo(po)
    return (
      <SummaryShell progress={progress} due={due} overdue={overdue}>
        <Card label="Total kg" value={`${formatNumber(totals.totalWeightKg, 3)} kg`} />
        <Card label="Total nos" value={String(totals.totalQtyNos)} />
        <Card
          label="Basic amount"
          value={value.kind === 'not_priced' ? '—' : `₹${formatNumber(totals.subTotal, 2)}`}
        />
        <Card
          label="Grand total (incl. GST)"
          value={value.kind === 'not_priced' ? 'Not priced' : `₹${formatNumber(totals.grandTotal, 2)}`}
        />
      </SummaryShell>
    )
  }

  return (
    <SummaryShell progress={progress} due={due} overdue={overdue}>
      <Card label="Total ordered kg" value={`${formatNumber(poTotalKg(po), 3)} kg`} />
      <Card label="Received kg" value={`${formatNumber(poReceivedKg(po), 3)} kg`} />
      <Card label="Outstanding kg" value={`${formatNumber(poOutstandingKg(po), 3)} kg`} />
      <Card label="Next due date" value={due ? formatDate(due) : '—'} />
    </SummaryShell>
  )
}

function SummaryShell({
  children,
  progress,
  due,
  overdue,
}: {
  children: import('react').ReactNode
  progress: number
  due: string | null
  overdue: number
}) {
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      <div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">{formatNumber(progress, 1)}% by weight</p>
      </div>
      {overdue > 0 && due && (
        <p className="text-sm font-medium text-red-600">Overdue by {overdue} days</p>
      )}
    </div>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}
