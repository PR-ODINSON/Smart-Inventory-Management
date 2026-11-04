import { db } from '../storage/database'
import type { PoActivityEntry, PoDispatchRecord, PurchaseOrder } from '../types/purchasing'
import { isCustomerPo } from '../types/purchasing'
import {
  canWorkflowAction,
  statusAfterWorkflowAction,
  type PoWorkflowAction,
} from '../lib/po/poStatusMachine'
import {
  dispatchAgainstPo,
  duplicatePurchaseOrder,
  receiveAgainstPo,
  recomputeCustomerDispatchStatus,
  recomputePoStatus,
  updatePurchaseOrder,
} from './purchaseOrderService'
import { deletePurchaseOrder } from './poImportService'

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export function appendPoActivity(
  po: PurchaseOrder,
  action: string,
  detail?: string,
  options?: { actor?: string; reason?: string },
): PoActivityEntry {
  const entry: PoActivityEntry = {
    id: newId('ACT'),
    at: new Date().toISOString(),
    action,
    detail,
    actor: options?.actor,
    reason: options?.reason,
  }
  po.activityLog = [entry, ...(po.activityLog ?? [])]
  return entry
}

export async function runPoWorkflowAction(
  po: PurchaseOrder,
  action: PoWorkflowAction,
  options?: { reason?: string; actor?: string },
): Promise<PurchaseOrder> {
  if (action === 'delete') {
    if (!canWorkflowAction(po, action)) {
      throw new Error('Only draft POs can be deleted.')
    }
    await deletePurchaseOrder(po.id)
    return po
  }

  const next = statusAfterWorkflowAction(po, action)
  po.status = next
  if (action === 'submit_for_approval') {
    po.approvalStatus = 'pending'
    appendPoActivity(po, 'submitted', 'Submitted for approval', options)
  } else if (action === 'approve') {
    po.approvalStatus = 'approved'
    po.approvedBy = options?.actor
    appendPoActivity(po, 'approved', 'Approved', options)
  } else if (action === 'reject') {
    po.approvalStatus = 'rejected'
    po.rejectedReason = options?.reason
    appendPoActivity(po, 'rejected', 'Rejected', {
      actor: options?.actor,
      reason: options?.reason,
    })
  } else if (action === 'mark_ordered') {
    po.orderedDate = new Date().toISOString().slice(0, 10)
    appendPoActivity(po, 'ordered', 'Marked as ordered', options)
  } else if (action === 'cancel') {
    if (!options?.reason?.trim()) throw new Error('Cancellation reason is required.')
    po.cancelReason = options.reason.trim()
    po.cancelledAt = new Date().toISOString()
    appendPoActivity(po, 'cancelled', 'PO cancelled', {
      actor: options?.actor,
      reason: options.reason,
    })
  }
  await updatePurchaseOrder(po)
  return po
}

export interface ReceiveLineInput {
  lineId: string
  quantity: number
  actualWeightKg?: number
}

export async function receivePoBatch(
  purchaseOrderId: string,
  input: {
    date: string
    challanNo?: string
    vehicleNo?: string
    remarks?: string
    operator?: string
    lines: ReceiveLineInput[]
    locationId: string
  },
): Promise<PurchaseOrder> {
  const po = await db.purchaseOrders.get(purchaseOrderId)
  if (!po) throw new Error('Purchase order not found.')
  if (isCustomerPo(po)) throw new Error('Receive applies to raw-material POs only.')

  for (const row of input.lines) {
    if (row.quantity <= 0) continue
    await receiveAgainstPo(
      purchaseOrderId,
      row.lineId,
      row.quantity,
      input.locationId,
      input.operator,
    )
  }

  const updated = await db.purchaseOrders.get(purchaseOrderId)
  if (!updated) throw new Error('Purchase order not found.')
  appendPoActivity(updated, 'receipt', input.remarks ?? 'Goods received', {
    actor: input.operator,
    reason: [input.challanNo, input.vehicleNo].filter(Boolean).join(' · ') || undefined,
  })
  updated.status = recomputePoStatus(updated)
  await updatePurchaseOrder(updated)
  return updated
}

export interface DispatchLineInput {
  lineId: string
  quantityNos: number
  actualWeightKg?: number
}

export async function dispatchPoBatch(
  purchaseOrderId: string,
  input: {
    date: string
    challanNo?: string
    vehicleNo?: string
    remarks?: string
    operator?: string
    lines: DispatchLineInput[]
  },
): Promise<PurchaseOrder> {
  const po = await db.purchaseOrders.get(purchaseOrderId)
  if (!po) throw new Error('Purchase order not found.')
  if (!isCustomerPo(po)) throw new Error('Dispatch applies to customer POs only.')

  for (const row of input.lines) {
    if (row.quantityNos <= 0) continue
    await dispatchAgainstPo(purchaseOrderId, row.lineId, row.quantityNos)
    const record: PoDispatchRecord = {
      id: newId('DSP'),
      purchaseOrderId,
      lineId: row.lineId,
      quantityNos: row.quantityNos,
      actualWeightKg: row.actualWeightKg,
      dispatchedAt: input.date,
      challanNo: input.challanNo,
      vehicleNo: input.vehicleNo,
      remarks: input.remarks,
      operator: input.operator,
    }
    await db.poDispatches.add(record)
  }

  const updated = await db.purchaseOrders.get(purchaseOrderId)
  if (!updated) throw new Error('Purchase order not found.')
  updated.status = recomputeCustomerDispatchStatus(updated)
  appendPoActivity(updated, 'dispatch', input.remarks ?? 'Dispatched', {
    actor: input.operator,
    reason: [input.challanNo, input.vehicleNo].filter(Boolean).join(' · ') || undefined,
  })
  await updatePurchaseOrder(updated)
  return updated
}

export async function duplicatePoWithLog(po: PurchaseOrder): Promise<PurchaseOrder> {
  const copy = await duplicatePurchaseOrder(po)
  appendPoActivity(copy, 'created', `Duplicated from ${po.poNumber}`)
  await updatePurchaseOrder(copy)
  return copy
}
