import { poValueInfo } from '../../features/purchasing/poPageUtils'
import type { PurchaseOrder } from '../../types/purchasing'
import { formatNumber } from '../../utils/formatting'

export function PoValueCell({ po }: { po: PurchaseOrder }) {
  const info = poValueInfo(po)
  if (info.kind === 'not_priced') {
    return <span className="text-slate-400">Not priced</span>
  }
  return (
    <span title={info.kind === 'partial' ? 'Some lines are unpriced; total includes priced lines only' : undefined}>
      ₹ {formatNumber(info.total, 2)}
      {info.kind === 'partial' && <span className="text-amber-600"> *</span>}
    </span>
  )
}
