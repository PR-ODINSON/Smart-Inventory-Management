import { useState } from 'react'
import type { GoodsReceipt, PoActivityEntry, PoDispatchRecord, PurchaseOrder } from '../../../types/purchasing'
import { isCustomerPo } from '../../../types/purchasing'
import { formatDateTime } from '../../../utils/formatting'
import { Button } from '../../shared/Button'

type TabId = 'terms' | 'movements' | 'activity' | 'attachments'

export function PoTabs({
  po,
  receipts,
  dispatches,
  onPrimaryMovement,
  primaryMovementLabel,
}: {
  po: PurchaseOrder
  receipts: GoodsReceipt[]
  dispatches: PoDispatchRecord[]
  onPrimaryMovement?: () => void
  primaryMovementLabel?: string
}) {
  const [tab, setTab] = useState<TabId>('terms')
  const customer = isCustomerPo(po)
  const terms = po.termsAndConditions ?? []

  const tabs: { id: TabId; label: string }[] = [
    { id: 'terms', label: 'Terms and conditions' },
    {
      id: 'movements',
      label: customer ? 'Dispatches' : 'Receipts',
    },
    { id: 'activity', label: 'Activity log' },
    { id: 'attachments', label: 'Attachments' },
  ]

  const activity = [...(po.activityLog ?? [])].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  )

  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm ${tab === t.id ? 'border-b-2 border-indigo-600 font-medium' : 'text-slate-500'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="py-4 text-sm">
        {tab === 'terms' && (
          <ol className="list-decimal space-y-1 pl-5">
            {terms.length === 0 ? (
              <li className="list-none text-slate-500">No terms recorded.</li>
            ) : (
              terms.map((t, i) => <li key={i}>{t}</li>)
            )}
          </ol>
        )}
        {tab === 'movements' && customer && (
          <MovementTable
            emptyLabel="No dispatches yet."
            onPrimary={onPrimaryMovement}
            primaryLabel={primaryMovementLabel}
            rows={dispatches.map((d) => ({
              date: d.dispatchedAt,
              challan: d.challanNo,
              vehicle: d.vehicleNo,
              qty: `${d.quantityNos} nos`,
              weight: d.actualWeightKg != null ? `${d.actualWeightKg} kg` : '—',
              by: d.operator,
            }))}
          />
        )}
        {tab === 'movements' && !customer && (
          <MovementTable
            emptyLabel="No receipts yet."
            onPrimary={onPrimaryMovement}
            primaryLabel={primaryMovementLabel}
            rows={receipts.map((r) => ({
              date: r.receivedAt,
              challan: r.referenceNumber,
              vehicle: '—',
              qty: `${r.quantity} ${r.unit}`,
              weight: '—',
              by: r.operator,
            }))}
          />
        )}
        {tab === 'activity' && (
          <ul className="space-y-2">
            {activity.length === 0 ? (
              <li className="text-slate-500">No activity yet.</li>
            ) : (
              activity.map((e) => <ActivityRow key={e.id} entry={e} />)
            )}
          </ul>
        )}
        {tab === 'attachments' && (
          <div>
            {po.importSourceFileName ? (
              <p>Original PDF: {po.importSourceFileName} (filename only — file not stored)</p>
            ) : (
              <p className="text-slate-500">No attachments.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MovementTable({
  rows,
  emptyLabel,
  onPrimary,
  primaryLabel,
}: {
  rows: {
    date: string
    challan?: string
    vehicle?: string
    qty: string
    weight: string
    by?: string
  }[]
  emptyLabel: string
  onPrimary?: () => void
  primaryLabel?: string
}) {
  if (rows.length === 0) {
    return (
      <div className="text-center text-slate-500">
        <p>{emptyLabel}</p>
        {onPrimary && primaryLabel && (
          <Button className="mt-2" onClick={onPrimary}>{primaryLabel}</Button>
        )}
      </div>
    )
  }
  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="text-slate-500">
          <th className="py-1">Date</th>
          <th>Challan</th>
          <th>Vehicle</th>
          <th>Qty</th>
          <th>Weight</th>
          <th>By</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
            <td className="py-1">{formatDateTime(r.date)}</td>
            <td>{r.challan ?? '—'}</td>
            <td>{r.vehicle ?? '—'}</td>
            <td>{r.qty}</td>
            <td>{r.weight}</td>
            <td>{r.by ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ActivityRow({ entry }: { entry: PoActivityEntry }) {
  return (
    <li className="rounded border border-slate-100 px-3 py-2 dark:border-slate-800">
      <div className="flex justify-between gap-2 text-xs text-slate-500">
        <span className="capitalize">{entry.action}</span>
        <span>{formatDateTime(entry.at)}</span>
      </div>
      {entry.detail && <p>{entry.detail}</p>}
      {entry.actor && <p className="text-xs">By {entry.actor}</p>}
      {entry.reason && <p className="text-xs text-slate-600">Reason: {entry.reason}</p>}
    </li>
  )
}
