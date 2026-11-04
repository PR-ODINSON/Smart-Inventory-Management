import { ChevronDown, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../shared/Button'
import { DemoBadge } from '../../shared/Badge'
import { StatusPill } from '../StatusPill'
import type { PurchaseOrder } from '../../../types/purchasing'
import { isCustomerPo } from '../../../types/purchasing'
import {
  canDispatch,
  canEditPo,
  canReceive,
  canWorkflowAction,
  isOpenForCancel,
} from '../../../lib/po/poStatusMachine'
import type { PoWorkflowAction } from '../../../lib/po/poStatusMachine'

export function PoHeaderBar({
  po,
  listBackHref,
  prevId,
  nextId,
  onAction,
  onReceiveDispatch,
  navState,
}: {
  po: PurchaseOrder
  listBackHref: string
  prevId?: string
  nextId?: string
  onAction: (
    action: PoWorkflowAction | 'duplicate' | 'receive' | 'dispatch',
    reason?: string,
  ) => Promise<void>
  navState?: unknown
  onReceiveDispatch: (mode: 'receive' | 'dispatch') => void
}) {
  const customer = isCustomerPo(po)
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [reasonOpen, setReasonOpen] = useState<'reject' | 'cancel' | null>(null)
  const [reason, setReason] = useState('')

  const typeBadge = customer
    ? 'Customer PO (received)'
    : 'Raw material (issued)'

  const primary = primaryAction(po, customer)
  const secondaries = secondaryActions(po, customer, primary)

  const submitReason = async () => {
    if (!reasonOpen) return
    const action = reasonOpen === 'reject' ? 'reject' : 'cancel'
    await onAction(action, reason)
    setReasonOpen(null)
    setReason('')
  }

  return (
    <div className="space-y-3">
      <nav className="text-sm text-slate-500">
        <Link to={listBackHref} className="hover:text-indigo-600">Purchase Orders</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-800 dark:text-slate-200">{po.poNumber}</span>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{po.poNumber}</h1>
            <StatusPill status={po.status} />
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">{typeBadge}</span>
            {po.isDemo && <DemoBadge label="Sample" />}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {prevId && (
            <Link to={`/purchase-orders/${prevId}`} state={navState}>
              <Button variant="secondary" size="sm">Previous</Button>
            </Link>
          )}
          {nextId && (
            <Link to={`/purchase-orders/${nextId}`} state={navState}>
              <Button variant="secondary" size="sm">Next</Button>
            </Link>
          )}
          {primary && (
            <Button
              onClick={() => {
                if (primary === 'receive' || primary === 'dispatch') {
                  onReceiveDispatch(primary)
                } else if (primary === 'edit') {
                  navigate(`/purchase-orders/${po.id}/edit`, { state: navState })
                } else {
                  void onAction(primary as PoWorkflowAction)
                }
              }}
            >
              {labelFor(primary)}
            </Button>
          )}
          {secondaries.map((a) => (
            <Button
              key={a}
              variant="secondary"
              size="sm"
              onClick={() => {
                if (a === 'reject' || a === 'cancel') {
                  setReasonOpen(a)
                } else if (a === 'edit') {
                  navigate(`/purchase-orders/${po.id}/edit`, { state: navState })
                } else {
                  void onAction(a)
                }
              }}
            >
              {labelFor(a)}
            </Button>
          ))}
          <div className="relative">
            <Button variant="secondary" size="sm" onClick={() => setMenuOpen((o) => !o)}>
              <MoreHorizontal className="h-4 w-4" />
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-1 min-w-[160px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                <Link
                  to={`/purchase-orders/${po.id}/print`}
                  className="block px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => setMenuOpen(false)}
                >
                  Print
                </Link>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => {
                    setMenuOpen(false)
                    void onAction('duplicate' as PoWorkflowAction)
                  }}
                >
                  Duplicate
                </button>
                {isOpenForCancel(po.status) && (
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                    onClick={() => {
                      setMenuOpen(false)
                      setReasonOpen('cancel')
                    }}
                  >
                    Cancel PO
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {reasonOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="font-semibold">
              {reasonOpen === 'reject' ? 'Reject PO' : 'Cancel PO'}
            </h3>
            <p className="mt-1 text-sm text-slate-500">Reason (required)</p>
            <textarea
              className="mt-2 w-full rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReasonOpen(null)}>Close</Button>
              <Button
                disabled={!reason.trim()}
                onClick={() => void submitReason()}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

type HeaderAction =
  | PoWorkflowAction
  | 'receive'
  | 'dispatch'
  | 'edit'
  | 'duplicate'

function primaryAction(po: PurchaseOrder, customer: boolean): HeaderAction | null {
  if (po.status === 'draft') return 'edit'
  if (po.status === 'pending_approval') return 'approve'
  if (po.status === 'approved') return 'mark_ordered'
  if (!customer && canReceive(po)) return 'receive'
  if (customer && canDispatch(po)) return 'dispatch'
  return null
}

function secondaryActions(
  po: PurchaseOrder,
  _customer: boolean,
  primary: HeaderAction | null,
): HeaderAction[] {
  const out: HeaderAction[] = []
  if (po.status === 'draft') {
    if (primary !== 'submit_for_approval' && canWorkflowAction(po, 'submit_for_approval')) {
      out.push('submit_for_approval')
    }
    if (canWorkflowAction(po, 'delete')) out.push('delete')
  }
  if (po.status === 'pending_approval') {
    out.push('reject')
    if (canEditPo(po)) out.push('edit')
  }
  return out.filter((a) => a !== primary)
}

function labelFor(a: HeaderAction): string {
  const map: Record<string, string> = {
    edit: 'Edit',
    submit_for_approval: 'Submit for approval',
    delete: 'Delete',
    approve: 'Approve',
    reject: 'Reject',
    mark_ordered: 'Mark as ordered',
    receive: 'Receive',
    dispatch: 'Dispatch',
    cancel: 'Cancel PO',
    duplicate: 'Duplicate',
  }
  return map[a] ?? a
}
