import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../components/shared/Button'
import { DemoBadge } from '../components/shared/Badge'
import { amountInWordsInr, weightPerPieceKg } from '../services/customerPoCalculator'
import { db } from '../storage/database'
import type { PurchaseOrder } from '../types/purchasing'
import { isCustomerPo, poDirection } from '../types/purchasing'
import { formatDate, formatNumber } from '../utils/formatting'
import { purchaseOrderTotalWeight } from '../utils/poWeight'

export function PurchaseOrderPrintPage() {
  const { poId } = useParams()
  const [po, setPo] = useState<PurchaseOrder | null>(null)

  useEffect(() => {
    if (!poId) return
    void db.purchaseOrders.get(poId).then((p) => setPo(p ?? null))
  }, [poId])

  if (!po) {
    return <p className="p-6 text-sm text-slate-500">Purchase order not found.</p>
  }

  const customer = isCustomerPo(po)

  return (
    <div className="min-h-full bg-white text-slate-900 print:bg-white">
      <div className="mx-auto max-w-4xl p-6 print:p-4">
        <div className="mb-4 flex justify-between print:hidden">
          <Link to={poId ? `/purchase-orders/${poId}` : '/purchase-orders'}><Button variant="secondary">Back</Button></Link>
          <Button onClick={() => window.print()}>Print</Button>
        </div>

        <header className="border-b border-slate-300 pb-4">
          <div className="mb-3 border-b border-slate-200 pb-3">
            <p className="text-base font-bold tracking-wide">NEELAM INDUSTRIES</p>
            <p className="text-[10px] text-slate-600">Foundry &amp; casting operations · Sample letterhead</p>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold tracking-wide">PURCHASE ORDER</h1>
              {customer && (
                <p className="text-xs text-slate-600">
                  Customer order received — Neelam Industries as supplier
                  {po.poFormat && ` · Template ${po.poFormat.replace('_', ' ')}`}
                </p>
              )}
              {!customer && (
                <p className="text-xs text-slate-600">Raw material PO issued to supplier</p>
              )}
            </div>
            <DemoBadge label="Demo / Sample" />
          </div>
          {po.formRef && (
            <p className="mt-1 text-xs text-slate-500">Form: {po.formRef}</p>
          )}
        </header>

        <section className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div className="rounded border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Buyer</p>
            <p className="font-medium">{po.buyer?.name ?? '—'}</p>
            <p className="text-xs whitespace-pre-wrap">{po.buyer?.address}</p>
            <p className="text-xs">GSTIN: {po.buyer?.gstin ?? '—'}</p>
          </div>
          <div className="rounded border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Supplier (M/S)</p>
            <p className="font-medium">{po.supplierParty?.name ?? 'Neelam Industries'}</p>
            <p className="text-xs whitespace-pre-wrap">{po.supplierParty?.address}</p>
            <p className="text-xs">GSTIN: {po.supplierParty?.gstin ?? '—'}</p>
            {po.counterpartyVendorCode && (
              <p className="text-xs">Vendor code: {po.counterpartyVendorCode}</p>
            )}
          </div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div><span className="text-slate-500">P.O. No.</span><br /><strong>{po.poNumber}</strong></div>
          <div><span className="text-slate-500">Date</span><br />{formatDate(po.poDate ?? po.createdAt)}</div>
          <div><span className="text-slate-500">Transport</span><br />{po.transportBy ?? '—'}</div>
          <div><span className="text-slate-500">Destination</span><br />{po.destination ?? '—'}</div>
        </section>

        <table className="mt-6 w-full border-collapse text-xs">
          <thead>
            <tr className="border border-slate-400 bg-slate-100">
              <th className="border border-slate-300 p-1">No.</th>
              <th className="border border-slate-300 p-1">Item / Part</th>
              <th className="border border-slate-300 p-1">HSN</th>
              <th className="border border-slate-300 p-1">GST%</th>
              <th className="border border-slate-300 p-1">Nos.</th>
              <th className="border border-slate-300 p-1">Weight (Kg)</th>
              <th className="border border-slate-300 p-1">Rate/Kg</th>
              <th className="border border-slate-300 p-1">Amount</th>
            </tr>
          </thead>
          <tbody>
            {customer
              ? po.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="border border-slate-300 p-1 align-top">{l.lineNo}</td>
                    <td className="border border-slate-300 p-1 align-top">
                      <div className="font-medium">{l.buyerItemCode}</div>
                      <div>{l.description}</div>
                      {l.grade && <div className="text-slate-600">Grade: {l.grade}</div>}
                      {l.deliveryDate && <div>Del: {formatDate(l.deliveryDate)}</div>}
                      {l.indentNo && <div>Indent: {l.indentNo}</div>}
                      {l.workOrderNo && <div>WO: {l.workOrderNo}</div>}
                      {l.salesOrderNo && <div>SO: {l.salesOrderNo}</div>}
                      {(l.drawingNo || l.patternNo) && (
                        <div>Drg/Pat: {l.drawingNo} / {l.patternNo}</div>
                      )}
                    </td>
                    <td className="border border-slate-300 p-1">{l.hsnCode}</td>
                    <td className="border border-slate-300 p-1">{l.gstRate}</td>
                    <td className="border border-slate-300 p-1 tabular-nums">{formatNumber(l.quantityNos ?? 0, 3)}</td>
                    <td className="border border-slate-300 p-1 tabular-nums">
                      {formatNumber(l.totalWeightKg ?? 0, 3)}
                      {weightPerPieceKg(l) != null && (
                        <div className="text-slate-500">({formatNumber(weightPerPieceKg(l)!, 2)} kg/pc)</div>
                      )}
                    </td>
                    <td className="border border-slate-300 p-1 tabular-nums">{formatNumber(l.rate ?? 0, 2)}</td>
                    <td className="border border-slate-300 p-1 tabular-nums">{formatNumber(l.lineAmount ?? 0, 2)}</td>
                  </tr>
                ))
              : po.lines.map((l, i) => (
                  <tr key={l.id}>
                    <td className="border border-slate-300 p-1">{i + 1}</td>
                    <td className="border border-slate-300 p-1">{l.materialId}</td>
                    <td className="border border-slate-300 p-1">—</td>
                    <td className="border border-slate-300 p-1">—</td>
                    <td className="border border-slate-300 p-1">{formatNumber(l.orderQuantity)}</td>
                    <td className="border border-slate-300 p-1">{formatNumber(l.orderQuantity * l.unitWeight, 2)}</td>
                    <td className="border border-slate-300 p-1">—</td>
                    <td className="border border-slate-300 p-1">—</td>
                  </tr>
                ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-64 text-sm">
            {customer && (
              <>
                <div className="flex justify-between border-b py-1">
                  <span>Basic amount</span>
                  <span className="tabular-nums">₹ {formatNumber(po.subTotal ?? 0, 2)}</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span>CGST</span>
                  <span className="tabular-nums">₹ {formatNumber(po.cgstAmount ?? 0, 2)}</span>
                </div>
                <div className="flex justify-between border-b py-1">
                  <span>SGST</span>
                  <span className="tabular-nums">₹ {formatNumber(po.sgstAmount ?? 0, 2)}</span>
                </div>
                {po.roundOff != null && po.roundOff !== 0 && (
                  <div className="flex justify-between border-b py-1">
                    <span>Round off</span>
                    <span className="tabular-nums">₹ {formatNumber(po.roundOff, 2)}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 font-semibold">
                  <span>Grand total</span>
                  <span className="tabular-nums">₹ {formatNumber(po.grandTotal ?? 0, 2)}</span>
                </div>
              </>
            )}
            <div className="mt-2 text-xs text-slate-600">
              Total weight: {formatNumber(purchaseOrderTotalWeight(po), 2)} kg
            </div>
            {customer && po.grandTotal != null && (
              <p className="mt-2 text-xs italic">{po.amountInWords ?? amountInWordsInr(po.grandTotal)}</p>
            )}
          </div>
        </div>

        {po.paymentTerms && (
          <p className="mt-4 text-xs"><strong>Payment:</strong> {po.paymentTerms}</p>
        )}

        {po.termsAndConditions && po.termsAndConditions.length > 0 && (
          <section className="mt-4 text-xs">
            <h2 className="font-semibold">Terms &amp; conditions</h2>
            <ol className="mt-1 list-decimal pl-4">
              {po.termsAndConditions.map((t, i) => (
                <li key={i} className="mb-1">{t}</li>
              ))}
            </ol>
          </section>
        )}

        <footer className="mt-8 grid grid-cols-2 gap-8 text-xs">
          <div>
            <p className="text-slate-500">Prepared by</p>
            <p className="mt-6 border-t border-slate-400 pt-1">{po.preparedBy ?? '—'}</p>
          </div>
          <div>
            <p className="text-slate-500">Authorised by</p>
            <p className="mt-6 border-t border-slate-400 pt-1">{po.authorisedBy ?? '—'}</p>
          </div>
        </footer>

        <p className="mt-6 text-[10px] text-slate-400 print:fixed print:bottom-2">
          Direction: {poDirection(po)} · Status: {po.status}
        </p>
      </div>
    </div>
  )
}
