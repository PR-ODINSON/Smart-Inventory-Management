import type { SupplierInvoiceLine } from '../../types/supplierInvoice'
import { formatNumber } from '../../utils/formatting'

const thClass = 'px-2 py-1.5 text-left font-medium text-slate-500'
const tdClass = 'px-2 py-2 align-top'

export function SupplierInvoiceLineTable({
  lines,
  variant = 'summary',
}: {
  lines: SupplierInvoiceLine[]
  /** summary: particulars + qty/rate/amount only (supplier detail view) */
  variant?: 'summary' | 'full'
}) {
  if (lines.length === 0) {
    return <p className="text-sm text-slate-500">No line items.</p>
  }

  const showCode = variant === 'full'
  const showHsn = variant === 'full'

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase dark:bg-slate-900">
          <tr>
            {showCode && <th className={thClass}>#</th>}
            {showCode && <th className={thClass}>Code</th>}
            <th className={thClass}>Particulars</th>
            {showHsn && <th className={thClass}>HSN / SAC</th>}
            <th className={thClass}>Qty</th>
            <th className={thClass}>Unit</th>
            <th className={thClass}>Rate</th>
            <th className={thClass}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-t border-slate-100 dark:border-slate-800">
              {showCode && <td className={`${tdClass} tabular-nums`}>{line.lineNo}</td>}
              {showCode && (
                <td className={`${tdClass} font-mono text-xs`}>{line.itemCode ?? '—'}</td>
              )}
              <td className={`${tdClass} min-w-[12rem] max-w-md`}>{line.description}</td>
              {showHsn && (
                <td className={`${tdClass} font-mono text-xs`}>{line.hsnSac ?? '—'}</td>
              )}
              <td className={`${tdClass} tabular-nums`}>{formatNumber(line.quantity, 2)}</td>
              <td className={tdClass}>{line.unit}</td>
              <td className={`${tdClass} tabular-nums`}>{formatNumber(line.rate, 2)}</td>
              <td className={`${tdClass} tabular-nums font-medium`}>
                {formatNumber(line.taxableAmount, 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
