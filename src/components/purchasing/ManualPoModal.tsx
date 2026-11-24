import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '../shared/Modal'
import { Button } from '../shared/Button'
import { useToast } from '../../contexts/ToastContext'
import { db } from '../../storage/database'
import { formatNumber } from '../../utils/formatting'
import {
  buildCustomerPoFromDraft,
  computeRowWeightKg,
  computeTotalPoWeightKg,
  createEmptyManualPoItem,
  removeManualPoRow,
  validateManualPoRow,
  type ManualPoItemDraft,
  type ManualPoRowErrors,
} from '../../lib/po/manualPoValidation'

export function ManualPoModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const { toast } = useToast()

  // Customer PO fields (Customer PO only — Raw Material PO removed from UI)
  const [customerName, setCustomerName] = useState('')
  const [customerPoNumber, setCustomerPoNumber] = useState('')
  const [rows, setRows] = useState<ManualPoItemDraft[]>(() => [createEmptyManualPoItem()])
  const [rowErrors, setRowErrors] = useState<Record<string, ManualPoRowErrors>>({})
  const [headerErrors, setHeaderErrors] = useState<{ customerName?: string; poNumber?: string }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const totalPoWeightKg = computeTotalPoWeightKg(rows)

  const resetForm = () => {
    setCustomerName('')
    setCustomerPoNumber('')
    setRows([createEmptyManualPoItem()])
    setRowErrors({})
    setHeaderErrors({})
  }

  const updateRow = (index: number, patch: Partial<ManualPoItemDraft>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
    const rowId = rows[index]?.id
    if (rowId && rowErrors[rowId]) {
      setRowErrors((prev) => {
        const next = { ...prev }
        delete next[rowId]
        return next
      })
    }
  }

  const handleAddRow = () => {
    const lastDeadline = rows[rows.length - 1]?.deadline
    setRows((prev) => [...prev, createEmptyManualPoItem(lastDeadline)])
  }

  const handleRemoveRow = (index: number) => {
    const res = removeManualPoRow(rows, index)
    if (res.error) {
      toast(res.error, 'error')
      return
    }
    setRows(res.rows)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    const nextHeaderErrors: { customerName?: string; poNumber?: string } = {}
    if (!customerName.trim()) {
      nextHeaderErrors.customerName = 'Customer / Company Name is required.'
    }
    if (!customerPoNumber.trim()) {
      nextHeaderErrors.poNumber = 'Customer PO Number is required.'
    }

    const nextRowErrors: Record<string, ManualPoRowErrors> = {}
    let hasRowError = false
    for (const row of rows) {
      const errs = validateManualPoRow(row)
      if (Object.keys(errs).length > 0) {
        nextRowErrors[row.id] = errs
        hasRowError = true
      }
    }

    setHeaderErrors(nextHeaderErrors)
    setRowErrors(nextRowErrors)

    if (Object.keys(nextHeaderErrors).length > 0 || hasRowError || rows.length === 0) {
      toast('Please fix the highlighted errors before saving.', 'error')
      return
    }

    // Check unique PO number
    const existing = await db.purchaseOrders.where('poNumber').equals(customerPoNumber.trim()).first()
    if (existing) {
      setHeaderErrors({ poNumber: `PO Number "${customerPoNumber.trim()}" already exists.` })
      toast(`PO Number "${customerPoNumber.trim()}" already exists.`, 'error')
      return
    }

    setIsSubmitting(true)
    try {
      const po = buildCustomerPoFromDraft({
        customerName,
        poNumber: customerPoNumber,
        rows,
      })

      await db.transaction('rw', [db.purchaseOrders], async () => {
        await db.purchaseOrders.add(po)
      })

      toast(`Customer Purchase Order saved with ${rows.length} item${rows.length === 1 ? '' : 's'}!`, 'success')
      resetForm()
      await onSaved()
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save customer PO.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Customer Purchase Order" wide>
      <form onSubmit={handleSave} noValidate className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Customer / Company Name *
            </label>
            <input
              className={`w-full rounded border px-3 py-1.5 dark:bg-slate-900 ${
                headerErrors.customerName
                  ? 'border-red-500'
                  : 'border-slate-300 dark:border-slate-700'
              }`}
              placeholder="e.g. MBH Pumps Gujarat Pvt Ltd"
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value)
                if (headerErrors.customerName) setHeaderErrors((h) => ({ ...h, customerName: undefined }))
              }}
            />
            {headerErrors.customerName && (
              <p className="mt-1 text-xs text-red-600">{headerErrors.customerName}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Customer PO Number *
            </label>
            <input
              className={`w-full rounded border px-3 py-1.5 dark:bg-slate-900 ${
                headerErrors.poNumber
                  ? 'border-red-500'
                  : 'border-slate-300 dark:border-slate-700'
              }`}
              placeholder="e.g. PO-MBH-2026-441"
              value={customerPoNumber}
              onChange={(e) => {
                setCustomerPoNumber(e.target.value)
                if (headerErrors.poNumber) setHeaderErrors((h) => ({ ...h, poNumber: undefined }))
              }}
            />
            {headerErrors.poNumber && (
              <p className="mt-1 text-xs text-red-600">{headerErrors.poNumber}</p>
            )}
          </div>
        </div>

        {/* Dynamic Item Rows */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Order Items ({rows.length})
            </h3>
            <Button type="button" size="sm" variant="secondary" onClick={handleAddRow}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Item
            </Button>
          </div>

          <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
            {rows.map((row, idx) => {
              const errs = rowErrors[row.id] ?? {}
              const hasErr = Object.keys(errs).length > 0
              const rowWeight = computeRowWeightKg(row.weightPerPiece, row.orderedQty)
              return (
                <div
                  key={row.id}
                  className={`rounded-lg border p-3 space-y-2.5 ${
                    hasErr
                      ? 'border-red-400 bg-red-50/40 dark:border-red-700 dark:bg-red-950/20'
                      : 'border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Item #{idx + 1}
                    </span>
                    <button
                      type="button"
                      disabled={rows.length <= 1}
                      onClick={() => handleRemoveRow(idx)}
                      title={rows.length <= 1 ? 'At least 1 item is required' : 'Remove item'}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none dark:hover:bg-red-950"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-0.5">
                        Item Name / Code *
                      </label>
                      <input
                        className={`w-full rounded border px-2.5 py-1.5 text-xs dark:bg-slate-900 ${
                          errs.itemName ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
                        }`}
                        placeholder="e.g. Flange Casting"
                        value={row.itemName}
                        onChange={(e) => updateRow(idx, { itemName: e.target.value })}
                      />
                      {errs.itemName && <p className="mt-0.5 text-[11px] text-red-600">{errs.itemName}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-0.5">
                        Casting Specification (Optional)
                      </label>
                      <input
                        className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                        placeholder="Shape, size, drawing ref, grade (e.g. FG260)"
                        value={row.castingSpec}
                        onChange={(e) => updateRow(idx, { castingSpec: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-0.5">
                        Weight / Piece (kg) *
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        className={`w-full rounded border px-2.5 py-1.5 text-xs dark:bg-slate-900 ${
                          errs.weightPerPiece ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
                        }`}
                        placeholder="e.g. 10"
                        value={row.weightPerPiece || ''}
                        onChange={(e) => updateRow(idx, { weightPerPiece: parseFloat(e.target.value) || 0 })}
                      />
                      {errs.weightPerPiece && (
                        <p className="mt-0.5 text-[11px] text-red-600">{errs.weightPerPiece}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-0.5">
                        Ordered Qty (pcs) *
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        className={`w-full rounded border px-2.5 py-1.5 text-xs dark:bg-slate-900 ${
                          errs.orderedQty ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
                        }`}
                        placeholder="e.g. 100"
                        value={row.orderedQty || ''}
                        onChange={(e) => {
                          const v = e.target.value === '' ? 0 : Number(e.target.value)
                          updateRow(idx, { orderedQty: v })
                        }}
                      />
                      {errs.orderedQty && (
                        <p className="mt-0.5 text-[11px] text-red-600">{errs.orderedQty}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-0.5">
                        Delivery Deadline *
                      </label>
                      <input
                        type="date"
                        className={`w-full rounded border px-2.5 py-1.5 text-xs dark:bg-slate-900 ${
                          errs.deadline ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
                        }`}
                        value={row.deadline}
                        onChange={(e) => updateRow(idx, { deadline: e.target.value })}
                      />
                      {errs.deadline && <p className="mt-0.5 text-[11px] text-red-600">{errs.deadline}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-0.5">
                        Total Item Weight
                      </label>
                      <div className="rounded border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-semibold tabular-nums text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {formatNumber(rowWeight, 2)} kg
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Live Total PO Weight */}
        <div className="flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50/70 px-3.5 py-2.5 text-xs dark:border-indigo-900 dark:bg-indigo-950/40">
          <span className="font-semibold text-indigo-900 dark:text-indigo-200">
            Total PO Weight ({rows.length} {rows.length === 1 ? 'item' : 'items'})
          </span>
          <span className="text-sm font-bold tabular-nums text-indigo-900 dark:text-indigo-100">
            {formatNumber(totalPoWeightKg, 2)} kg
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Purchase Order'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
