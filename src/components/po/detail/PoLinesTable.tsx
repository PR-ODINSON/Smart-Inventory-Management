import { Fragment, useState } from 'react'
import { lineTotalWeight } from '../../../utils/poWeight'
import { outstandingDispatchNos, outstandingQty } from '../../../services/purchaseOrderService'
import type { GoodsReceipt, PoDispatchRecord, PurchaseOrder, PurchaseOrderLine } from '../../../types/purchasing'
import { isCustomerPo } from '../../../types/purchasing'
import {
  overdueDays,
  poTotalKg,
  poTotalNos,
  rawLineFormula,
} from '../../../lib/po/poSelectors'
import { formatDate, formatNumber } from '../../../utils/formatting'
import { computeCustomerLineAmount } from '../../../services/customerPoCalculator'

export function PoLinesTable({
  po,
  materialNames,
  receipts,
  dispatches,
}: {
  po: PurchaseOrder
  materialNames: Map<string, string>
  receipts: GoodsReceipt[]
  dispatches: PoDispatchRecord[]
}) {
  const customer = isCustomerPo(po)
  const [expanded, setExpanded] = useState<string | null>(null)

  const toggle = (id: string) => setExpanded((e) => (e === id ? null : id))

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950">
          {customer ? (
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-2 py-2 dark:bg-slate-950">#</th>
              <th className="sticky left-8 z-10 bg-slate-50 px-2 py-2 dark:bg-slate-950">Item code</th>
              <th className="px-2 py-2">Item name</th>
              <th className="px-2 py-2">HSN</th>
              <th className="px-2 py-2">GST%</th>
              <th className="px-2 py-2 text-right">Nos</th>
              <th className="px-2 py-2 text-right">Total kg</th>
              <th className="px-2 py-2 text-right">kg/pc</th>
              <th className="px-2 py-2 text-right">Rate/kg</th>
              <th className="px-2 py-2 text-right">Amount</th>
              <th className="px-2 py-2">Due</th>
              <th className="px-2 py-2 text-right">Dispatched</th>
              <th className="px-2 py-2 text-right">Outstanding</th>
            </tr>
          ) : (
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-2 py-2 dark:bg-slate-950">#</th>
              <th className="sticky left-8 z-10 bg-slate-50 px-2 py-2 dark:bg-slate-950">Material</th>
              <th className="px-2 py-2">Ordered</th>
              <th className="px-2 py-2 text-right">kg/unit</th>
              <th className="px-2 py-2 text-right">Total kg</th>
              <th className="px-2 py-2 text-right">Unit price</th>
              <th className="px-2 py-2 text-right">Line value</th>
              <th className="px-2 py-2">Due</th>
              <th className="px-2 py-2 text-right">Received</th>
              <th className="px-2 py-2 text-right">Outstanding</th>
            </tr>
          )}
        </thead>
        <tbody>
          {po.lines.map((line, idx) => {
            const lineNo = line.lineNo ?? idx + 1
            const due = line.deliveryDate ?? po.expectedDeliveryDate
            const outCustomer = outstandingDispatchNos(line)
            const outRaw = outstandingQty(line)
            const overdue =
              due &&
              overdueDays(due.slice(0, 10)) > 0 &&
              (customer ? outCustomer > 0 : outRaw > 0)

            return (
              <Fragment key={line.id}>
                <tr
                  className="cursor-pointer border-t border-slate-100 dark:border-slate-800"
                  onClick={() => toggle(line.id)}
                >
                  {customer ? (
                    <CustomerCells line={line} lineNo={lineNo} overdue={!!overdue} />
                  ) : (
                    <RawCells
                      line={line}
                      lineNo={lineNo}
                      materialNames={materialNames}
                      overdue={!!overdue}
                    />
                  )}
                </tr>
                {expanded === line.id && (
                  <tr className="bg-slate-50 dark:bg-slate-900/50">
                    <td colSpan={customer ? 13 : 10} className="px-4 py-2 text-xs text-slate-600">
                      {customer ? (
                        <DispatchList lineId={line.id} dispatches={dispatches} />
                      ) : (
                        <ReceiptList lineId={line.id} receipts={receipts} />
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
          <tr className="border-t-2 border-slate-200 font-medium dark:border-slate-700">
            <td colSpan={customer ? 5 : 2} className="px-2 py-2">Totals</td>
            {customer ? (
              <>
                <td className="px-2 py-2 text-right">{poTotalNos(po)}</td>
                <td className="px-2 py-2 text-right">{formatNumber(poTotalKg(po), 3)}</td>
                <td colSpan={3} />
                <td className="px-2 py-2 text-right">
                  ₹{formatNumber(po.lines.reduce((s, l) => s + computeCustomerLineAmount(l), 0), 2)}
                </td>
                <td colSpan={3} />
              </>
            ) : (
              <>
                <td colSpan={2} />
                <td className="px-2 py-2 text-right">{formatNumber(poTotalKg(po), 3)}</td>
                <td colSpan={5} />
              </>
            )}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function CustomerCells({
  line,
  lineNo,
  overdue,
}: {
  line: PurchaseOrderLine
  lineNo: number
  overdue: boolean
}) {
  const nos = line.quantityNos ?? 0
  const kg = line.totalWeightKg ?? 0
  const kgPc = nos > 0 ? kg / nos : 0
  const out = outstandingDispatchNos(line)
  return (
    <>
      <td className="sticky left-0 bg-white px-2 py-2 dark:bg-slate-950">{lineNo}</td>
      <td className="sticky left-8 bg-white px-2 py-2 dark:bg-slate-950">{line.buyerItemCode ?? '—'}</td>
      <td className="px-2 py-2">
        <div>{line.description ?? '—'}</div>
        <div className="text-xs text-slate-500">
          {[line.indentNo && `Indent ${line.indentNo}`, line.workOrderNo && `WO ${line.workOrderNo}`, line.salesOrderNo && `SO ${line.salesOrderNo}`, line.drawingNo && `Drg ${line.drawingNo}`, line.patternNo && `Pat ${line.patternNo}`]
            .filter(Boolean)
            .join(' · ')}
        </div>
        {line.weightIsTentative && (
          <span className="mt-1 inline-block rounded bg-slate-100 px-1 text-[10px] uppercase dark:bg-slate-800">
            Tentative weight
          </span>
        )}
      </td>
      <td className="px-2 py-2">{line.hsnCode ?? '—'}</td>
      <td className="px-2 py-2">{line.gstRate ?? '—'}</td>
      <td className="px-2 py-2 text-right">{nos}</td>
      <td className="px-2 py-2 text-right">{formatNumber(kg, 3)}</td>
      <td className="px-2 py-2 text-right">{formatNumber(kgPc, 3)}</td>
      <td className="px-2 py-2 text-right">{line.rate ?? '—'}</td>
      <td className="px-2 py-2 text-right">{formatNumber(line.lineAmount ?? computeCustomerLineAmount(line), 2)}</td>
      <td className="px-2 py-2">
        {line.deliveryDate ? formatDate(line.deliveryDate) : '—'}
        {overdue && <span className="ml-1 text-red-600">Overdue</span>}
      </td>
      <td className="px-2 py-2 text-right">{line.dispatchedQuantity ?? 0}</td>
      <td className="px-2 py-2 text-right">{out}</td>
    </>
  )
}

function RawCells({
  line,
  lineNo,
  materialNames,
  overdue,
}: {
  line: PurchaseOrderLine
  lineNo: number
  materialNames: Map<string, string>
  overdue: boolean
}) {
  const name = materialNames.get(line.materialId) ?? line.description ?? line.materialId
  const formula = rawLineFormula(line)
  const recv = line.receivedQuantity
  const out = outstandingQty(line)
  const total = line.orderQuantity
  const progress = total > 0 ? (recv / total) * 100 : 0
  const lineVal = (line.unitPrice ?? 0) * line.orderQuantity
  return (
    <>
      <td className="sticky left-0 bg-white px-2 py-2 dark:bg-slate-950">{lineNo}</td>
      <td className="sticky left-8 bg-white px-2 py-2 dark:bg-slate-950">{name}</td>
      <td className="px-2 py-2">
        {line.orderQuantity} {line.unit}
        {formula && <div className="text-xs text-slate-500">{formula}</div>}
      </td>
      <td className="px-2 py-2 text-right">{line.unitWeight}</td>
      <td className="px-2 py-2 text-right">
        {formatNumber(
          line.unit.toLowerCase() === 'kg' ? line.orderQuantity : lineTotalWeight(line),
          3,
        )}
      </td>
      <td className="px-2 py-2 text-right">{line.unitPrice ?? '—'}</td>
      <td className="px-2 py-2 text-right">{line.unitPrice ? formatNumber(lineVal, 2) : '—'}</td>
      <td className="px-2 py-2">
        {line.deliveryDate ? formatDate(line.deliveryDate) : '—'}
        {overdue && <span className="ml-1 text-red-600">Overdue</span>}
      </td>
      <td className="px-2 py-2 text-right">
        {recv} {line.unit}
        <div className="mx-auto mt-1 h-1 max-w-[80px] overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} />
        </div>
      </td>
      <td className="px-2 py-2 text-right">{out} {line.unit}</td>
    </>
  )
}

function ReceiptList({ lineId, receipts }: { lineId: string; receipts: GoodsReceipt[] }) {
  const rows = receipts.filter((r) => r.lineId === lineId)
  if (rows.length === 0) return <p>No receipts for this line.</p>
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.id}>
          {formatDate(r.receivedAt)} · {r.quantity} {r.unit}
          {r.operator && ` · ${r.operator}`}
        </li>
      ))}
    </ul>
  )
}

function DispatchList({
  lineId,
  dispatches,
}: {
  lineId: string
  dispatches: PoDispatchRecord[]
}) {
  const rows = dispatches.filter((d) => d.lineId === lineId)
  if (rows.length === 0) return <p>No dispatches for this line.</p>
  return (
    <ul className="space-y-1">
      {rows.map((d) => (
        <li key={d.id}>
          {formatDate(d.dispatchedAt)} · Challan {d.challanNo ?? '—'} · {d.quantityNos} nos
          {d.actualWeightKg != null && ` · ${d.actualWeightKg} kg`}
        </li>
      ))}
    </ul>
  )
}
