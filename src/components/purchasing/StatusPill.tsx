import { cn } from '../../utils/cn'
import type { PurchaseOrderStatus } from '../../types/purchasing'

const config: Record<
  PurchaseOrderStatus,
  { label: string; className: string }
> = {
  draft: {
    label: 'Draft',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  pending_approval: {
    label: 'Pending approval',
    className: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
  },
  approved: {
    label: 'Approved',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  },
  ordered: {
    label: 'Ordered',
    className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
  },
  partially_received: {
    label: 'Partially received',
    className: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-100',
  },
  received: {
    label: 'Received',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  },
  partially_dispatched: {
    label: 'Partially dispatched',
    className: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-100',
  },
  dispatched: {
    label: 'Dispatched',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  },
}

export function StatusPill({ status }: { status: PurchaseOrderStatus }) {
  const c = config[status] ?? config.draft
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        c.className,
      )}
    >
      {c.label}
    </span>
  )
}
