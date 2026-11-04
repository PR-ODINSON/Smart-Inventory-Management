import type { PurchaseOrder, PurchaseOrderStatus } from '../../types/purchasing'
import { isCustomerPo } from '../../types/purchasing'

export type PoWorkflowAction =
  | 'submit_for_approval'
  | 'approve'
  | 'reject'
  | 'mark_ordered'
  | 'cancel'
  | 'delete'

const TRANSITIONS: Record<
  PoWorkflowAction,
  { from: PurchaseOrderStatus[]; to: PurchaseOrderStatus }
> = {
  submit_for_approval: {
    from: ['draft'],
    to: 'pending_approval',
  },
  approve: {
    from: ['pending_approval'],
    to: 'approved',
  },
  reject: {
    from: ['pending_approval'],
    to: 'draft',
  },
  mark_ordered: {
    from: ['approved'],
    to: 'ordered',
  },
  cancel: {
    from: [
      'draft',
      'pending_approval',
      'approved',
      'ordered',
      'partially_received',
      'partially_dispatched',
    ],
    to: 'cancelled',
  },
  delete: {
    from: ['draft'],
    to: 'draft',
  },
}

export function canWorkflowAction(
  po: PurchaseOrder,
  action: PoWorkflowAction,
): boolean {
  const from = po.status
  const rule = TRANSITIONS[action]
  if (!rule.from.includes(from)) return false
  if (action === 'delete') return from === 'draft'
  return true
}

export function statusAfterWorkflowAction(
  po: PurchaseOrder,
  action: PoWorkflowAction,
): PurchaseOrderStatus {
  if (!canWorkflowAction(po, action)) {
    throw new Error(`Cannot ${action.replace(/_/g, ' ')} when status is ${po.status}.`)
  }
  if (action === 'delete') return po.status
  return TRANSITIONS[action].to
}

export function canReceive(po: PurchaseOrder): boolean {
  if (isCustomerPo(po)) return false
  return po.status === 'ordered' || po.status === 'partially_received'
}

export function canDispatch(po: PurchaseOrder): boolean {
  if (!isCustomerPo(po)) return false
  return po.status === 'ordered' || po.status === 'partially_dispatched'
}

export function isOpenForCancel(status: PurchaseOrderStatus): boolean {
  return TRANSITIONS.cancel.from.includes(status)
}

export function canEditPo(po: PurchaseOrder): boolean {
  return po.status === 'draft' || po.status === 'pending_approval'
}
