import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../shared/Button'
import { StatusPill } from './StatusPill'
import type { PurchaseOrder } from '../../types/purchasing'
import { isCustomerPo } from '../../types/purchasing'
import {
  customerLineDisplay,
  partyLabel,
  poDateIso,
  rawLineDisplay,
} from '../../features/purchasing/poPageUtils'
import type { Supplier } from '../../types/inventory'
import type { GoodsReceipt } from '../../types/purchasing'
import { db } from '../../storage/database'
import { computeCustomerPoTotals } from '../../services/customerPoCalculator'
import { formatDate, formatDateTime, formatNumber } from '../../utils/formatting'
import { purchaseOrderTotalWeight } from '../../utils/poWeight'
import { PoValueCell } from './PoValueCell'

export function PoDetailDrawer({
  po,
  suppliers,
  materialNames,
  onClose,
  onApprove,
  onReject,
  onPrimary,
  primaryLabel,
}: {
  po: PurchaseOrder
  suppliers: Map<string, Supplier>
  materialNames: Map<string, string>
  onClose: () => void
  onApprove?: () => void
  onReject?: () => void
  onPrimary?: () => void
  primaryLabel?: string
}) {
  const customer = isCustomerPo(po)
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([])

  useEffect(() => {
    void db.goodsReceipts.where('purchaseOrderId').equals(po.id).toArray().then(setReceipts)
  }, [po.id])

  const customerTotals = customer ? computeCustomerPoTotals(po.lines) : null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <aside
        className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
        role="dialog"
        aria-modal
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div>
            <h2 className="font-semibold">{po.poNumber}</h2>
            <p className="text-xs text-slate-500">{partyLabel(po, suppliers)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-sm">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <StatusPill status={po.status} />
            <span className="text-slate-500">PO date {formatDate(poDateIso(po))}</span>
          </div>
          <dl className="mb-4 grid grid-cols-2 gap-2 text-xs">
            <dt className="text-slate-500">PO weight</dt>
            <dd>{formatNumber(purchaseOrderTotalWeight(po), 2)} kg</dd>
            <dt className="text-slate-500">Value</dt>
            <dd><PoValueCell po={po} /></dd>
            {customer && customerTotals && (
              <>
                <dt className="text-slate-500">Total nos</dt>
                <dd>{formatNumber(customerTotals.totalQtyNos, 0)}</dd>
                <dt className="text-slate-500">Total kg</dt>
                <dd>{formatNumber(customerTotals.totalWeightKg, 3)}</dd>
                <dt className="text-slate-500">Subtotal</dt>
                <dd>₹ {formatNumber(po.subTotal ?? customerTotals.subTotal, 2)}</dd>
                <dt className="text-slate-500">CGST / SGST</dt>
                <dd>
                  ₹ {formatNumber(po.cgstAmount ?? 0, 2)} / ₹ {formatNumber(po.sgstAmount ?? 0, 2)}
                </dd>
                {po.igstAmount != null && po.igstAmount > 0 && (
                  <>
                    <dt className="text-slate-500">IGST</dt>
                    <dd>₹ {formatNumber(po.igstAmount, 2)}</dd>
                  </>
                )}
                <dt className="text-slate-500">Round off</dt>
                <dd>₹ {formatNumber(po.roundOff ?? 0, 2)}</dd>
                <dt className="text-slate-500">Grand total</dt>
                <dd>₹ {formatNumber(po.grandTotal ?? customerTotals.grandTotal, 2)}</dd>
                {po.amountInWords && (
                  <>
                    <dt className="col-span-2 text-slate-500">Amount in words</dt>
                    <dd className="col-span-2 italic">{po.amountInWords}</dd>
                  </>
                )}
              </>
            )}
          </dl>

          <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Lines</h3>
          <ul className="mb-4 space-y-3">
            {po.lines.map((l) => {
              const display = customer
                ? customerLineDisplay(l)
                : rawLineDisplay(l, materialNames.get(l.materialId) ?? l.materialId)
              return (
                <li key={l.id} className="rounded border border-slate-100 p-2 dark:border-slate-800">
                  <p className="text-xs">{display.summary}</p>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full bg-brand transition-all"
                      style={{ width: `${display.progress}%` }}
                    />
                  </div>
                  {customer && (
                    <p className="mt-1 text-[10px] text-slate-500">
                      HSN {l.hsnCode} · GST {l.gstRate}% · Del {formatDate(l.deliveryDate)}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>

          <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">
            {customer ? 'Dispatch history' : 'Receipt history'}
          </h3>
          {customer ? (
            <ul className="mb-4 space-y-1 text-xs text-slate-600 dark:text-slate-400">
              {po.lines.every((l) => !(l.dispatchedQuantity ?? 0))
                ? <li>No dispatches recorded yet.</li>
                : po.lines.map((l) => (
                    <li key={l.id}>
                      {l.buyerItemCode}: dispatched {l.dispatchedQuantity ?? 0} / {l.quantityNos ?? 0} nos
                    </li>
                  ))}
            </ul>
          ) : receipts.length === 0 ? (
            <p className="mb-4 text-xs text-slate-500">No goods receipts for this PO yet.</p>
          ) : (
            <ul className="mb-4 space-y-1 text-xs">
              {receipts.map((r) => (
                <li key={r.id}>
                  {formatDateTime(r.receivedAt)} — {formatNumber(r.quantity)} {r.unit} ({r.materialId})
                </li>
              ))}
            </ul>
          )}

          <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Activity log</h3>
          <ul className="text-xs text-slate-600 dark:text-slate-400">
            <li>Created {formatDateTime(po.createdAt)}</li>
            <li>Updated {formatDateTime(po.updatedAt)}</li>
            {po.orderedDate && <li>Ordered {formatDateTime(po.orderedDate)}</li>}
            {po.approvedBy && <li>Approved by {po.approvedBy}</li>}
            {po.notes && <li className="mt-1">Note: {po.notes}</li>}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
          {onApprove && <Button size="sm" onClick={onApprove}>Approve</Button>}
          {onReject && <Button size="sm" variant="secondary" onClick={onReject}>Reject</Button>}
          {onPrimary && primaryLabel && <Button size="sm" onClick={onPrimary}>{primaryLabel}</Button>}
        </div>
      </aside>
    </div>
  )
}
