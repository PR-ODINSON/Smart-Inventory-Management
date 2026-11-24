import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../components/shared/Button'
import { useToast } from '../contexts/ToastContext'
import { listPathWithParams, parsePoListParams } from '../lib/po/poListParams'
import { appendPoActivity } from '../services/poWorkflowService'
import { updatePurchaseOrder } from '../services/purchaseOrderService'
import { applyCustomerPoTotals } from '../services/customerPoCalculator'
import { db } from '../storage/database'
import type { PurchaseOrder, PurchaseOrderLine } from '../types/purchasing'
import { formatNumber } from '../utils/formatting'

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
  const [buyerName, setBuyerName] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<PurchaseOrderLine[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!poId) return
    void db.purchaseOrders.get(poId).then((p) => {
      setPo(p ?? null)
      if (p) {
        setBuyerName(p.buyer?.name || p.supplierParty?.name || '')
        setPoNumber(p.poNumber)
        setDeliveryDate(p.expectedDeliveryDate || '')
        setNotes(p.notes ?? '')
        setLines(p.lines.map((l) => ({ ...l })))
      }
    })
  }, [poId])

  if (po === undefined) return <p className="text-slate-500">Loading…</p>
  if (!po) {
    return (
      <div className="py-12 text-center">
        <p>Purchase order not found</p>
        <Link to={listBackHref}>
          <Button className="mt-4" variant="secondary">
            Back to list
          </Button>
        </Link>
      </div>
    )
  }

  const isCustomer = po.direction === 'received_from_customer'

  const handleLineChange = (idx: number, patch: Partial<PurchaseOrderLine>) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l
        const updated = { ...l, ...patch }
        const ordered = updated.quantityNos ?? updated.orderQuantity ?? 0
        const wt = updated.unitWeight ?? 1
        updated.totalWeightKg = ordered * wt
        return updated
      }),
    )
  }

  const handleAddLine = () => {
    const defaultDate = deliveryDate || new Date().toISOString().split('T')[0]
    setLines((prev) => [
      ...prev,
      {
        id: `POL-${crypto.randomUUID()}`,
        materialId: '',
        buyerItemCode: '',
        description: '',
        orderQuantity: 1,
        quantityNos: 1,
        unit: 'nos',
        unitWeight: 0,
        weightUnit: 'kg',
        totalWeightKg: 0,
        receivedQuantity: 0,
        dispatchedQuantity: 0,
        deliveryDate: defaultDate,
      },
    ])
  }

  const handleRemoveLine = (idx: number) => {
    if (lines.length <= 1) {
      toast('At least 1 item row is required.', 'error')
      return
    }
    const target = lines[idx]
    const fulfilled = target ? (target.dispatchedQuantity ?? target.receivedQuantity ?? 0) : 0
    if (fulfilled > 0) {
      toast('Cannot remove — this item has already been dispatched.', 'error')
      return
    }
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!poNumber.trim()) {
      toast('PO Number is required.', 'error')
      return
    }

    if (lines.length === 0) {
      toast('At least 1 item row is required.', 'error')
      return
    }

    // Validation: item name, weight, ordered qty, deadline, and >= fulfilled
    for (const line of lines) {
      const name = (line.description || line.buyerItemCode || '').trim()
      if (!name) {
        toast('Item Name / Description is required for all rows.', 'error')
        return
      }
      if ((line.unitWeight ?? 0) <= 0) {
        toast('Weight per piece must be greater than 0 for all rows.', 'error')
        return
      }
      const ordered = line.quantityNos ?? line.orderQuantity ?? 0
      const fulfilled = line.dispatchedQuantity ?? line.receivedQuantity ?? 0
      if (ordered <= 0 || (isCustomer && !Number.isInteger(ordered))) {
        toast('Ordered quantity must be a whole number greater than 0.', 'error')
        return
      }
      if (ordered < fulfilled) {
        toast(
          `Ordered quantity (${ordered}) cannot be less than already dispatched quantity (${fulfilled}).`,
          'error',
        )
        return
      }
    }

    setIsSubmitting(true)
    try {
      const now = new Date().toISOString()
      const updatedPo: PurchaseOrder = {
        ...po,
        poNumber: poNumber.trim(),
        expectedDeliveryDate: deliveryDate || undefined,
        notes: notes.trim() || undefined,
        updatedAt: now,
        lines: lines.map((l) => ({
          ...l,
          materialId: l.materialId || l.description || l.buyerItemCode || '',
          deliveryDate: l.deliveryDate || deliveryDate || undefined,
        })),
      }

      if (isCustomer) {
        if (updatedPo.buyer) {
          updatedPo.buyer.name = buyerName.trim()
        } else {
          updatedPo.buyer = { name: buyerName.trim() }
        }
      } else {
        if (updatedPo.supplierParty) {
          updatedPo.supplierParty.name = buyerName.trim()
        } else {
          updatedPo.supplierParty = { name: buyerName.trim() }
        }
      }

      const finalized = isCustomer ? applyCustomerPoTotals(updatedPo) : updatedPo
      appendPoActivity(finalized, 'edited', 'PO details and line quantities updated')
      await updatePurchaseOrder(finalized)

      toast('Purchase Order updated successfully.', 'success')
      navigate(`/purchase-orders/${po.id}`, { state })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update PO.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-5 pb-12">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
        <h1 className="text-xl font-bold">Edit Purchase Order {po.poNumber}</h1>
        <span className="text-xs uppercase font-semibold text-slate-500">
          {isCustomer ? 'Customer PO' : 'Supplier PO'}
        </span>
      </div>

      <form onSubmit={handleSave} className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {isCustomer ? 'Customer / Company Name' : 'Supplier Name'} *
            </label>
            <input
              required
              className="w-full rounded border border-slate-300 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              PO Number *
            </label>
            <input
              required
              className="w-full rounded border border-slate-300 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Delivery Deadline / Due Date
            </label>
            <input
              type="date"
              className="w-full rounded border border-slate-300 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
          </div>
        </div>

        {/* PO Line Items */}
        <div className="rounded border border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Line Items ({lines.length})
            </h2>
            <Button type="button" size="sm" variant="secondary" onClick={handleAddLine}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Item
            </Button>
          </div>
          <div className="space-y-3">
            {lines.map((line, idx) => {
              const ordered = line.quantityNos ?? line.orderQuantity ?? 0
              const fulfilled = line.dispatchedQuantity ?? line.receivedQuantity ?? 0
              return (
                <div
                  key={line.id}
                  className="rounded border border-slate-200 p-3 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-500">Item #{idx + 1}</span>
                    <button
                      type="button"
                      disabled={lines.length <= 1}
                      onClick={() => handleRemoveLine(idx)}
                      title={
                        lines.length <= 1
                          ? 'At least 1 item is required'
                          : fulfilled > 0
                            ? 'Cannot remove — already dispatched'
                            : 'Remove item'
                      }
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none dark:hover:bg-red-950"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-slate-500 mb-0.5">Item Description / Code</label>
                      <input
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                        value={line.description || line.buyerItemCode || ''}
                        onChange={(e) =>
                          handleLineChange(idx, {
                            description: e.target.value,
                            buyerItemCode: e.target.value,
                          })
                        }
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-slate-500 mb-0.5">
                        Ordered Qty ({line.unit || 'nos'})
                      </label>
                      <input
                        type="number"
                        min={fulfilled || 1}
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                        value={ordered}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          handleLineChange(idx, {
                            orderQuantity: val,
                            quantityNos: val,
                          })
                        }}
                      />
                      {fulfilled > 0 && (
                        <span className="block text-[10px] text-slate-400 mt-0.5">
                          Dispatched: {fulfilled} (min allowed)
                        </span>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs text-slate-500 mb-0.5">Weight / Piece (kg)</label>
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                        value={line.unitWeight || ''}
                        onChange={(e) =>
                          handleLineChange(idx, {
                            unitWeight: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                  </div>

                  {isCustomer && (
                    <div className="grid gap-3 sm:grid-cols-3 text-xs">
                      <div>
                        <label className="block text-slate-500 mb-0.5">Casting Spec / Grade / Drawing</label>
                        <input
                          className="w-full rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                          value={line.grade || ''}
                          placeholder="e.g. FG260, Drg #123"
                          onChange={(e) => handleLineChange(idx, { grade: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 mb-0.5">Item Delivery Deadline</label>
                        <input
                          type="date"
                          className="w-full rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                          value={line.deliveryDate || deliveryDate || ''}
                          onChange={(e) => handleLineChange(idx, { deliveryDate: e.target.value })}
                        />
                      </div>
                      <div className="flex items-end pb-1 text-slate-600 dark:text-slate-400 font-mono">
                        Line Weight: {(line.totalWeightKg ?? 0).toFixed(2)} kg (Pending: {Math.max(0, ordered - fulfilled)})
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex items-center justify-between rounded border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-xs dark:border-indigo-900 dark:bg-indigo-950/40">
            <span className="font-semibold text-indigo-900 dark:text-indigo-200">Total PO Weight</span>
            <span className="font-bold tabular-nums text-indigo-900 dark:text-indigo-100">
              {formatNumber(lines.reduce((s, l) => s + (l.totalWeightKg ?? 0), 0), 2)} kg
            </span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Notes
          </label>
          <textarea
            className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Link to={`/purchase-orders/${po.id}`}>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  )
}
