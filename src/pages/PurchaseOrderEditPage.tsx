import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/shared/Button'
import { useToast } from '../contexts/ToastContext'
import { listPathWithParams, parsePoListParams } from '../lib/po/poListParams'
import { canEditPo } from '../lib/po/poStatusMachine'
import { appendPoActivity } from '../services/poWorkflowService'
import { updatePurchaseOrder } from '../services/purchaseOrderService'
import { db } from '../storage/database'
import type { PurchaseOrder } from '../types/purchasing'

export function PurchaseOrderEditPage() {
  const { poId } = useParams<{ poId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { toast } = useToast()
  const state = location.state as { listSearch?: string } | undefined
  const listBackHref = listPathWithParams(
    parsePoListParams(new URLSearchParams(state?.listSearch ?? '')),
  )

  const [po, setPo] = useState<PurchaseOrder | null | undefined>(undefined)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!poId) return
    void db.purchaseOrders.get(poId).then((p) => {
      setPo(p ?? null)
      if (p) setNotes(p.notes ?? '')
    })
  }, [poId])

  if (po === undefined) return <p className="text-slate-500">Loading…</p>
  if (!po) {
    return (
      <div className="py-12 text-center">
        <p>Purchase order not found</p>
        <Link to={listBackHref}><Button className="mt-4" variant="secondary">Back to list</Button></Link>
      </div>
    )
  }

  if (!canEditPo(po)) {
    return (
      <div className="max-w-lg space-y-3">
        <p className="text-slate-600">
          This PO cannot be edited in status <strong>{po.status}</strong>. Cancel and recreate to
          change an ordered PO.
        </p>
        <Link to={`/purchase-orders/${po.id}`}>
          <Button variant="secondary">View PO</Button>
        </Link>
      </div>
    )
  }

  const save = async () => {
    po.notes = notes
    appendPoActivity(po, 'edited', 'Notes updated')
    await updatePurchaseOrder(po)
    toast('Saved', 'success')
    navigate(`/purchase-orders/${po.id}`, { state })
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Edit {po.poNumber}</h1>
      <label className="block text-sm">
        Notes
        <textarea
          className="mt-1 w-full rounded-lg border border-slate-200 p-2 dark:border-slate-700 dark:bg-slate-950"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <Button onClick={() => void save()}>Save</Button>
        <Link to={`/purchase-orders/${po.id}`}>
          <Button variant="secondary">Cancel</Button>
        </Link>
      </div>
    </div>
  )
}
