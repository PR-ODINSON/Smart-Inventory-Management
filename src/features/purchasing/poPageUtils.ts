import { outstandingDispatchNos, outstandingQty } from '../../services/purchaseOrderService'
import type { Supplier } from '../../types/inventory'
import type { PurchaseOrder, PurchaseOrderLine, PoDirection } from '../../types/purchasing'
import { isCustomerPo, poDirection } from '../../types/purchasing'
import { lineTotalWeight, purchaseOrderTotalWeight } from '../../utils/poWeight'
import { defaultUnitWeightKg } from '../../utils/poWeight'

export type PoTab = 'all' | PoDirection

const OPEN_RAW = new Set([
  'draft',
  'pending_approval',
  'approved',
  'ordered',
  'partially_received',
])
const OPEN_CUSTOMER = new Set(['ordered', 'partially_dispatched'])

export function filterByTab(orders: PurchaseOrder[], tab: PoTab): PurchaseOrder[] {
  if (tab === 'all') return orders
  return orders.filter((p) => poDirection(p) === tab)
}

export function partyLabel(po: PurchaseOrder, suppliers: Map<string, Supplier>): string {
  if (isCustomerPo(po)) return po.buyer?.name ?? 'Customer'
  if (po.supplierId) {
    return suppliers.get(po.supplierId)?.companyName ?? po.supplierId
  }
  return 'Supplier'
}

export function poDateIso(po: PurchaseOrder): string {
  return po.poDate ?? po.createdAt
}

export function earliestDueDate(po: PurchaseOrder): string | null {
  const dates = po.lines
    .map((l) => l.deliveryDate)
    .filter(Boolean) as string[]
  if (po.expectedDeliveryDate) dates.push(po.expectedDeliveryDate)
  if (dates.length === 0) return null
  return dates.sort()[0]
}

export function isOverdue(iso: string | null): boolean {
  if (!iso) return false
  const d = iso.slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  return d < today
}

export function isDueWithinDays(iso: string | null, days: number): boolean {
  if (!iso) return false
  const due = new Date(iso.slice(0, 10)).getTime()
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const limit = now.getTime() + days * 86400000
  return due >= now.getTime() && due <= limit
}

export function lineOutstandingKg(line: PurchaseOrderLine, unit?: string): number {
  const out = outstandingQty(line)
  const u = (unit ?? line.unit).toLowerCase()
  if (u === 'kg') return out
  return out * (line.unitWeight > 0 ? line.unitWeight : defaultUnitWeightKg(line.unit))
}

export function rawLineDisplay(
  line: PurchaseOrderLine,
  materialName: string,
): { summary: string; progress: number } {
  const out = outstandingQty(line)
  const recv = line.receivedQuantity
  const total = line.orderQuantity
  const u = line.unit.toLowerCase()
  let summary: string
  if (u === 'kg') {
    summary = `${total} kg`
  } else {
    const w = line.unitWeight > 0 ? line.unitWeight : defaultUnitWeightKg(line.unit)
    const totalKg = total * w
    summary = `${total} ${line.unit} × ${w} kg = ${totalKg.toFixed(2)} kg`
  }
  summary = `${materialName}: ${summary}`
  const progress = total > 0 ? Math.min(100, (recv / total) * 100) : 0
  return {
    summary: `${summary} · recv ${recv} ${line.unit}, out ${out} ${line.unit}`,
    progress,
  }
}

/** Shorter line text for table cells (max 2 lines). */
export function compactRawLineForTable(
  line: PurchaseOrderLine,
  materialName: string,
): { summary: string; progress: number } {
  const d = rawLineDisplay(line, materialName)
  const parts = d.summary.split(' · ')
  return { summary: parts[0] ?? d.summary, progress: d.progress }
}

export function compactCustomerLineForTable(line: PurchaseOrderLine): { summary: string; progress: number } {
  const d = customerLineDisplay(line)
  const head = `${line.buyerItemCode}: ${line.totalWeightKg ?? 0} kg @ ₹${line.rate ?? 0}/kg`
  return { summary: head, progress: d.progress }
}

export function customerLineDisplay(line: PurchaseOrderLine): { summary: string; progress: number } {
  const total = line.quantityNos ?? 0
  const out = outstandingDispatchNos(line)
  const dispatched = line.dispatchedQuantity ?? 0
  const summary = `${line.buyerItemCode ?? '—'}: ${line.description ?? ''} · ${total} nos · ${line.totalWeightKg ?? 0} kg`
  const progress = total > 0 ? Math.min(100, (dispatched / total) * 100) : 0
  return {
    summary: `${summary} · dispatched ${dispatched} nos, out ${out} nos`,
    progress,
  }
}

export type { PoValueInfo } from '../../lib/po/poSelectors'
export { poValueInfo, poTotalKg } from '../../lib/po/poSelectors'

export function rawKpis(orders: PurchaseOrder[]) {
  const open = orders.filter((p) => OPEN_RAW.has(p.status))
  const outstandingKg = open.reduce((sum, po) => {
    return (
      sum +
      po.lines.reduce((s, l) => s + lineOutstandingKg(l), 0)
    )
  }, 0)
  const pendingApproval = orders.filter((p) => p.approvalStatus === 'pending').length
  let overdueLines = 0
  for (const po of orders) {
    for (const l of po.lines) {
      const due = l.deliveryDate ?? po.expectedDeliveryDate
      if (due && isOverdue(due) && outstandingQty(l) > 0) overdueLines++
    }
  }
  return { openCount: open.length, outstandingKg, pendingApproval, overdueLines }
}

export function customerKpis(orders: PurchaseOrder[]) {
  const open = orders.filter((p) => OPEN_CUSTOMER.has(p.status))
  const openOrderKg = open.reduce((s, p) => s + purchaseOrderTotalWeight(p), 0)
  const basic = open.reduce((s, p) => s + (p.subTotal ?? 0), 0)
  const inclGst = open.reduce((s, p) => s + (p.grandTotal ?? 0), 0)
  let dueIn7 = 0
  for (const po of open) {
    for (const l of po.lines) {
      if (l.deliveryDate && isDueWithinDays(l.deliveryDate, 7) && outstandingDispatchNos(l) > 0) {
        dueIn7++
      }
    }
  }
  return { openCount: open.length, openOrderKg, basic, inclGst, dueIn7 }
}

export function allTabKpis(orders: PurchaseOrder[]) {
  const raw = orders.filter((p) => !isCustomerPo(p))
  const cust = orders.filter(isCustomerPo)
  const open = orders.filter(
    (p) =>
      (isCustomerPo(p) && OPEN_CUSTOMER.has(p.status)) ||
      (!isCustomerPo(p) && OPEN_RAW.has(p.status)),
  )
  return {
    total: orders.length,
    rawCount: raw.length,
    customerCount: cust.length,
    openCount: open.length,
  }
}

export function lineTotalKg(po: PurchaseOrder, line: PurchaseOrderLine): number {
  if (isCustomerPo(po)) return line.totalWeightKg ?? 0
  const u = line.unit.toLowerCase()
  if (u === 'kg') return line.orderQuantity
  return lineTotalWeight(line)
}
