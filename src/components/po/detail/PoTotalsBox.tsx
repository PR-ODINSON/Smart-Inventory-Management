import { amountInWordsInr } from '../../../services/customerPoCalculator'
import type { PurchaseOrder } from '../../../types/purchasing'
import { isCustomerPo } from '../../../types/purchasing'
import { customerTotalsForPo, poValueInfo } from '../../../lib/po/poSelectors'
import { formatNumber } from '../../../utils/formatting'

export function PoTotalsBox({ po }: { po: PurchaseOrder }) {
  const customer = isCustomerPo(po)
  const value = poValueInfo(po)

  if (!customer) {
    if (value.kind === 'not_priced') {
      return <p className="text-right text-sm text-slate-500">Not priced</p>
    }
  }

  if (value.kind === 'not_priced' && customer) {
    return <p className="text-right text-sm text-slate-500">Not priced</p>
  }

  const totals = customer ? customerTotalsForPo(po) : null
  const grand = customer ? totals!.grandTotal : value.total
  const words = po.amountInWords ?? amountInWordsInr(grand)

  return (
    <div className="ml-auto w-full max-w-sm rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-800">
      {customer && totals && (
        <>
          <Line label="Basic amount" value={totals.subTotal} />
          <Line label="Sub total" value={totals.subTotal} />
          {totals.igstAmount > 0 ? (
            <Line label="IGST" value={totals.igstAmount} />
          ) : (
            <>
              <Line label="CGST" value={totals.cgstAmount} />
              <Line label="SGST" value={totals.sgstAmount} />
            </>
          )}
          <Line label="Round-off" value={totals.roundOff} />
          <Line label="Grand total" value={totals.grandTotal} strong />
        </>
      )}
      {!customer && value.kind !== 'not_priced' && (
        <Line label="Line value total" value={value.total} strong />
      )}
      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{words}</p>
      {po.totalsComputed && (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Totals calculated by the app. Not printed on the customer PO.
        </p>
      )}
    </div>
  )
}

function Line({
  label,
  value,
  strong,
}: {
  label: string
  value: number
  strong?: boolean
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-1 dark:border-slate-800">
      <span className="text-slate-500">{label}</span>
      <span className={strong ? 'font-semibold' : ''}>₹{formatNumber(value, 2)}</span>
    </div>
  )
}
