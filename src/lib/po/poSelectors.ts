import { outstandingDispatchNos, outstandingQty } from '../../services/purchaseOrderService'
import {
  computeCustomerPoTotals,
  type CustomerPoTotals,
} from '../../services/customerPoCalculator'
import type { PurchaseOrder, PurchaseOrderLine } from '../../types/purchasing'
import { isCustomerPo } from '../../types/purchasing'
import { lineTotalWeight, purchaseOrderTotalWeight } from '../../utils/poWeight'
import { defaultUnitWeightKg } from '../../utils/poWeight'

export function poTotalKg(po: PurchaseOrder): number {
  return purchaseOrderTotalWeight(po)
}

/** Sum of PO weights for a list (e.g. filtered purchase orders on the list page). */
export function sumPurchaseOrdersWeightKg(orders: PurchaseOrder[]): number {
  return orders.reduce((sum, po) => sum + poTotalKg(po), 0)
}

export function poTotalNos(po: PurchaseOrder): number {
  if (!isCustomerPo(po)) return 0
  return po.lines.reduce((s, l) => s + (l.quantityNos ?? 0), 0)
}

export function poReceivedKg(po: PurchaseOrder): number {
  if (isCustomerPo(po)) return 0
  return po.lines.reduce((s, l) => {
    const u = l.unit.toLowerCase()
    if (u === 'kg') return s + l.receivedQuantity
    const w = l.unitWeight > 0 ? l.unitWeight : defaultUnitWeightKg(l.unit)
    return s + l.receivedQuantity * w
  }, 0)
}

export function poOutstandingKg(po: PurchaseOrder): number {
  if (isCustomerPo(po)) return 0
  return po.lines.reduce((s, l) => {
    const out = outstandingQty(l)
    const u = l.unit.toLowerCase()
    if (u === 'kg') return s + out
    const w = l.unitWeight > 0 ? l.unitWeight : defaultUnitWeightKg(l.unit)
    return s + out * w
  }, 0)
}

export function poDispatchedKg(po: PurchaseOrder): number {
  if (!isCustomerPo(po)) return 0
  const total = poTotalKg(po)
  const totalNos = poTotalNos(po)
  if (totalNos <= 0) return 0
  const dispatchedNos = po.lines.reduce((s, l) => s + (l.dispatchedQuantity ?? 0), 0)
  return (dispatchedNos / totalNos) * total
}

export function poProgressPercent(po: PurchaseOrder): number {
  const totalKg = poTotalKg(po)
  if (totalKg <= 0) return 0
  if (isCustomerPo(po)) {
    const done = poDispatchedKg(po)
    return Math.min(100, (done / totalKg) * 100)
  }
  const done = poReceivedKg(po)
  return Math.min(100, (done / totalKg) * 100)
}

export interface PoValueInfo {
  kind: 'not_priced' | 'partial' | 'full'
  display: string
  total: number
}

export function poValueInfo(po: PurchaseOrder): PoValueInfo {
  if (isCustomerPo(po)) {
    const priced = po.lines.filter((l) => (l.rate ?? 0) > 0 && (l.totalWeightKg ?? 0) > 0)
    if (priced.length === 0) {
      return { kind: 'not_priced', display: 'Not priced', total: 0 }
    }
    const totals = customerTotalsForPo(po)
    const total = po.grandTotal ?? totals.grandTotal
    const kind = priced.length < po.lines.length ? 'partial' : 'full'
    return { kind, display: total.toFixed(2), total }
  }
  const priced = po.lines.filter((l) => (l.unitPrice ?? 0) > 0)
  if (priced.length === 0) return { kind: 'not_priced', display: 'Not priced', total: 0 }
  const total = priced.reduce((s, l) => s + (l.unitPrice ?? 0) * l.orderQuantity, 0)
  const kind = priced.length < po.lines.length ? 'partial' : 'full'
  return { kind, display: total.toFixed(2), total }
}

export function customerTotalsForPo(po: PurchaseOrder): CustomerPoTotals {
  if (!isCustomerPo(po)) {
    return {
      subTotal: 0,
      totalWeightKg: 0,
      totalQtyNos: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      roundOff: 0,
      grandTotal: 0,
    }
  }
  const computed = computeCustomerPoTotals(po.lines)
  return {
    subTotal: po.subTotal ?? computed.subTotal,
    totalWeightKg: poTotalKg(po),
    totalQtyNos: poTotalNos(po),
    cgstAmount: po.cgstAmount ?? computed.cgstAmount,
    sgstAmount: po.sgstAmount ?? computed.sgstAmount,
    igstAmount: po.igstAmount ?? computed.igstAmount,
    roundOff: po.roundOff ?? computed.roundOff,
    grandTotal: po.grandTotal ?? computed.grandTotal,
  }
}

export function earliestOutstandingDueDate(po: PurchaseOrder): string | null {
  const dates: string[] = []
  for (const l of po.lines) {
    const due = l.deliveryDate ?? po.expectedDeliveryDate
    if (!due) continue
    const out = isCustomerPo(po) ? outstandingDispatchNos(l) : outstandingQty(l)
    if (out > 0) dates.push(due.slice(0, 10))
  }
  if (dates.length === 0) return null
  return dates.sort()[0]
}

export function overdueDays(iso: string | null): number {
  if (!iso) return 0
  const due = new Date(iso.slice(0, 10)).getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = today.getTime() - due
  if (diff <= 0) return 0
  return Math.floor(diff / 86400000)
}

export function lineOutstandingKg(line: PurchaseOrderLine): number {
  const out = outstandingQty(line)
  const u = line.unit.toLowerCase()
  if (u === 'kg') return out
  const w = line.unitWeight > 0 ? line.unitWeight : defaultUnitWeightKg(line.unit)
  return out * w
}

export function rawLineFormula(line: PurchaseOrderLine): string | null {
  const u = line.unit.toLowerCase()
  if (u === 'kg') return null
  const w = line.unitWeight > 0 ? line.unitWeight : defaultUnitWeightKg(line.unit)
  const totalKg = lineTotalWeight(line)
  return `${line.orderQuantity} ${line.unit} × ${w} kg = ${totalKg.toFixed(3)} kg`
}

export function formatQtyWithUnit(qty: number, unit: string): string {
  const u = unit.toLowerCase()
  if (u === 'tonnes' || u === 'tonne' || u === 't') {
    return `${qty} t`
  }
  return `${qty} ${unit}`
}
