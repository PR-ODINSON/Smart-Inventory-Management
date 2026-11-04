import { db } from '../storage/database'
import type { Material } from '../types/inventory'
import type {
  GoodsReceipt,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
} from '../types/purchasing'
import { isCustomerPo } from '../types/purchasing'
import { defaultUnitWeightKg } from '../utils/poWeight'
import { applyMovement } from './inventoryMovementService'

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export async function nextPoNumber(): Promise<string> {
  const count = await db.purchaseOrders.count()
  const year = new Date().getFullYear()
  return `PO-${year}-${String(count + 1).padStart(4, '0')}`
}

export async function createPurchaseOrder(
  partial: Omit<PurchaseOrder, 'id' | 'createdAt' | 'updatedAt' | 'poNumber'> & {
    poNumber?: string
  },
): Promise<PurchaseOrder> {
  const now = new Date().toISOString()
  const po: PurchaseOrder = {
    id: newId('PO'),
    poNumber: partial.poNumber ?? (await nextPoNumber()),
    direction: partial.direction ?? 'issued_to_supplier',
    supplierId: partial.supplierId,
    lines: partial.lines,
    status: partial.status,
    approvalStatus: partial.approvalStatus,
    createdAt: now,
    updatedAt: now,
    expectedDeliveryDate: partial.expectedDeliveryDate,
    orderedDate: partial.orderedDate,
    notes: partial.notes,
  }
  await db.purchaseOrders.add(po)
  return po
}

export async function updatePurchaseOrder(po: PurchaseOrder): Promise<void> {
  po.updatedAt = new Date().toISOString()
  await db.purchaseOrders.put(po)
}

export function outstandingQty(line: PurchaseOrderLine): number {
  return Math.max(0, line.orderQuantity - line.receivedQuantity)
}

export function outstandingDispatchNos(line: PurchaseOrderLine): number {
  const ordered = line.quantityNos ?? 0
  const done = line.dispatchedQuantity ?? 0
  return Math.max(0, ordered - done)
}

export function isFullyReceived(po: PurchaseOrder): boolean {
  if (isCustomerPo(po)) {
    return po.lines.every((l) => outstandingDispatchNos(l) <= 0)
  }
  return po.lines.every((l) => outstandingQty(l) <= 0)
}

export function recomputeCustomerDispatchStatus(po: PurchaseOrder): PurchaseOrderStatus {
  if (po.status === 'cancelled') return 'cancelled'
  const lines = po.lines
  if (lines.length === 0) return po.status
  const allDone = lines.every((l) => outstandingDispatchNos(l) <= 0)
  const anyDone = lines.some((l) => (l.dispatchedQuantity ?? 0) > 0)
  if (allDone) return 'dispatched'
  if (anyDone) return 'partially_dispatched'
  return 'ordered'
}

export async function dispatchAgainstPo(
  purchaseOrderId: string,
  lineId: string,
  quantityNos: number,
): Promise<void> {
  const po = await db.purchaseOrders.get(purchaseOrderId)
  if (!po) throw new Error('Purchase order not found.')
  if (!isCustomerPo(po)) throw new Error('Dispatch applies to customer orders only.')
  if (po.status === 'cancelled' || po.status === 'dispatched') {
    throw new Error('Cannot dispatch on this order status.')
  }
  const line = po.lines.find((l) => l.id === lineId)
  if (!line) throw new Error('PO line not found.')
  const outstanding = outstandingDispatchNos(line)
  if (quantityNos <= 0 || quantityNos > outstanding) {
    throw new Error(`Dispatch quantity must be between 0 and ${outstanding}.`)
  }
  line.dispatchedQuantity = (line.dispatchedQuantity ?? 0) + quantityNos
  po.status = recomputeCustomerDispatchStatus(po)
  po.updatedAt = new Date().toISOString()
  await db.purchaseOrders.put(po)
}

export async function duplicatePurchaseOrder(po: PurchaseOrder): Promise<PurchaseOrder> {
  const now = new Date().toISOString()
  const copy: PurchaseOrder = {
    ...po,
    id: newId('PO'),
    poNumber: await nextPoNumber(),
    status: isCustomerPo(po) ? 'ordered' : 'draft',
    approvalStatus: isCustomerPo(po) ? 'approved' : 'not_required',
    createdAt: now,
    updatedAt: now,
    orderedDate: undefined,
    lines: po.lines.map((l) => ({
      ...l,
      id: newId('POL'),
      receivedQuantity: 0,
      dispatchedQuantity: 0,
    })),
  }
  await db.purchaseOrders.add(copy)
  return copy
}

export function recomputePoStatus(po: PurchaseOrder): PurchaseOrderStatus {
  if (po.status === 'cancelled' || po.status === 'draft') return po.status
  const lines = po.lines
  if (lines.length === 0) return po.status
  const allReceived = lines.every((l) => l.receivedQuantity >= l.orderQuantity)
  const anyReceived = lines.some((l) => l.receivedQuantity > 0)
  if (allReceived) return 'received'
  if (anyReceived) return 'partially_received'
  return po.status
}

export async function receiveAgainstPo(
  purchaseOrderId: string,
  lineId: string,
  quantity: number,
  locationId: string,
  operator?: string,
): Promise<GoodsReceipt> {
  const po = await db.purchaseOrders.get(purchaseOrderId)
  if (!po) throw new Error('Purchase order not found.')
  if (po.status === 'cancelled') throw new Error('Cannot receive against cancelled PO.')
  const line = po.lines.find((l) => l.id === lineId)
  if (!line) throw new Error('PO line not found.')
  const outstanding = outstandingQty(line)
  if (quantity <= 0 || quantity > outstanding + 1e-9) {
    throw new Error(`Receive quantity cannot exceed outstanding (${outstanding}).`)
  }
  const material = await db.materials.get(line.materialId)
  if (!material) throw new Error('Material not found.')

  await applyMovement({
    material,
    type: 'goods_receipt',
    quantity,
    destinationLocationId: locationId,
    referenceNumber: po.poNumber,
    operator,
    purchaseOrderId: po.id,
    notes: `Receipt for ${po.poNumber}`,
  })

  line.receivedQuantity += quantity
  po.status = recomputePoStatus(po)
  po.updatedAt = new Date().toISOString()
  await db.purchaseOrders.put(po)

  const receipt: GoodsReceipt = {
    id: newId('GRN'),
    purchaseOrderId: po.id,
    lineId: line.id,
    materialId: line.materialId,
    quantity,
    unit: line.unit,
    receivedAt: new Date().toISOString(),
    locationId,
    referenceNumber: po.poNumber,
    operator,
  }
  await db.goodsReceipts.add(receipt)
  return receipt
}

export async function createDraftFromRecommendations(
  items: { material: Material; qty: number }[],
  supplierId?: string,
): Promise<PurchaseOrder> {
  const lines: PurchaseOrderLine[] = items
    .filter((i) => i.qty > 0)
    .map((i) => ({
      id: newId('POL'),
      materialId: i.material.id,
      orderQuantity: i.qty,
      unit: i.material.unit,
      unitWeight: defaultUnitWeightKg(i.material.unit, i.material.unitWeightKg),
      weightUnit: 'kg',
      receivedQuantity: 0,
    }))
  return createPurchaseOrder({
    supplierId,
    lines,
    status: 'draft',
    approvalStatus: lines.length > 0 ? 'pending' : 'not_required',
  })
}
