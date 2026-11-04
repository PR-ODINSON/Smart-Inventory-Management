import type { PurchaseOrder, PurchaseOrderLine, RateBasis } from '../types/purchasing'
import { isCustomerPo } from '../types/purchasing'
import { amountInWordsInr } from './indianAmountWords'

export function weightPerPieceKg(line: PurchaseOrderLine): number | null {
  const nos = line.quantityNos ?? 0
  const kg = line.totalWeightKg ?? 0
  if (nos <= 0 || kg <= 0) return null
  return kg / nos
}

export function computeCustomerLineAmount(line: PurchaseOrderLine): number {
  const basis: RateBasis = line.rateBasis ?? 'per_kg'
  const rate = line.rate ?? 0
  if (rate <= 0) return 0
  if (basis === 'per_kg') {
    const kg = line.totalWeightKg ?? 0
    return kg * rate
  }
  const nos = line.quantityNos ?? 0
  return nos * rate
}

export interface CustomerPoTotals {
  subTotal: number
  totalWeightKg: number
  totalQtyNos: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  roundOff: number
  grandTotal: number
}

/** Split GST: default intra-state 9% + 9% from line gstRate (e.g. 18% → half each). */
export function computeCustomerPoTotals(
  lines: PurchaseOrderLine[],
  options?: { useIgst?: boolean },
): CustomerPoTotals {
  let subTotal = 0
  let totalWeightKg = 0
  let totalQtyNos = 0
  let cgst = 0
  let sgst = 0
  let igst = 0

  for (const line of lines) {
    const amount = computeCustomerLineAmount(line)
    subTotal += amount
    totalWeightKg += line.totalWeightKg ?? 0
    totalQtyNos += line.quantityNos ?? 0
    const gstRate = line.gstRate ?? 0
    const tax = amount * (gstRate / 100)
    if (options?.useIgst) {
      igst += tax
    } else {
      cgst += tax / 2
      sgst += tax / 2
    }
  }

  const rawGrand = subTotal + cgst + sgst + igst
  const grandRounded = Math.round(rawGrand)
  const roundOff = grandRounded - rawGrand

  return {
    subTotal: roundTo2(subTotal),
    totalWeightKg,
    totalQtyNos,
    cgstAmount: roundTo2(cgst),
    sgstAmount: roundTo2(sgst),
    igstAmount: roundTo2(igst),
    roundOff: roundTo2(roundOff),
    grandTotal: grandRounded,
  }
}

export function applyCustomerPoTotals(po: PurchaseOrder): PurchaseOrder {
  if (!isCustomerPo(po)) return po
  const totals = computeCustomerPoTotals(po.lines)
  const lines = po.lines.map((l) => ({
    ...l,
    lineAmount: roundTo2(computeCustomerLineAmount(l)),
  }))
  return {
    ...po,
    lines,
    subTotal: totals.subTotal,
    cgstAmount: totals.cgstAmount,
    sgstAmount: totals.sgstAmount,
    igstAmount: totals.igstAmount,
    roundOff: totals.roundOff,
    grandTotal: totals.grandTotal,
    amountInWords: amountInWordsInr(totals.grandTotal),
  }
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100
}

export { amountInWordsInr } from './indianAmountWords'
