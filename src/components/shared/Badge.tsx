import { cn } from '../../utils/cn'
import type { StockStatus } from '../../types/inventory'
import { stockStatusLabel } from '../../utils/formatting'

const statusStyles: Record<StockStatus, string> = {
  healthy: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  approaching_reorder: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  below_reorder: 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  no_consumption: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

export function StockBadge({ status }: { status: StockStatus }) {
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium',
        statusStyles[status],
      )}
    >
      {stockStatusLabel(status)}
    </span>
  )
}

export function DemoBadge({ label = 'Demo Data' }: { label?: string }) {
  return (
    <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      {label}
    </span>
  )
}
