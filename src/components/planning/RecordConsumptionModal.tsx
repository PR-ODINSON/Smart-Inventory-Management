import { useState, useEffect } from 'react'
import { Modal } from '../shared/Modal'
import { Button } from '../shared/Button'
import { useToast } from '../../contexts/ToastContext'
import type { Material } from '../../types/inventory'
import { recordMaterialIssue } from '../../services/productionPlanService'
import { db } from '../../storage/database'
import type { ProductionBatch } from '../../types/production'

export function RecordConsumptionModal({
  open,
  onClose,
  materials,
  onConsumptionRecorded,
}: {
  open: boolean
  onClose: () => void
  materials: Material[]
  onConsumptionRecorded?: () => void
}) {
  const { toast } = useToast()

  const [materialId, setMaterialId] = useState('')
  const [quantity, setQuantity] = useState<number>(0)
  const [date, setDate] = useState<string>('')
  const [productionBatchId, setProductionBatchId] = useState('')
  const [remarks, setRemarks] = useState('')
  const [batches, setBatches] = useState<ProductionBatch[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setMaterialId(materials[0]?.id || '')
      setQuantity(0)
      setDate(new Date().toISOString().split('T')[0])
      setProductionBatchId('')
      setRemarks('')
      setIsSubmitting(false)
      void db.productionBatches.toArray().then(setBatches)
    }
  }, [open, materials])

  const selectedMat = materials.find((m) => m.id === materialId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!materialId) {
      toast('Please select a material.', 'error')
      return
    }
    if (quantity <= 0) {
      toast('Quantity issued must be greater than 0.', 'error')
      return
    }

    setIsSubmitting(true)
    try {
      await recordMaterialIssue({
        materialId,
        quantity,
        unit: selectedMat?.unit || 'kg',
        productionBatchId: productionBatchId.trim() || undefined,
        remarks: remarks.trim() || undefined,
        date,
      })

      toast('Material consumption recorded and stock updated.', 'success')
      onConsumptionRecorded?.()
      onClose()
    } catch (err) {
      console.error(err)
      toast(err instanceof Error ? err.message : 'Failed to record consumption.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Issue to Production / Record Consumption">
      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        <p className="text-xs text-slate-500">
          Record actual raw material issued or melted in the furnace. Stock is decreased by the exact issued quantity (without the 10% planning allowance).
        </p>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Raw Material *</label>
          <select
            className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
          >
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.unit})
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Quantity Issued ({selectedMat?.unit || 'kg'}) *
            </label>
            <input
              type="number"
              step="any"
              min="0.01"
              required
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={quantity || ''}
              onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Date Issued *</label>
            <input
              type="date"
              required
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Production Heat / Batch (Optional)
          </label>
          {batches.length > 0 ? (
            <select
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={productionBatchId}
              onChange={(e) => setProductionBatchId(e.target.value)}
            >
              <option value="">None / General foundry issue</option>
              {batches.map((b) => (
                <option key={b.id} value={b.batchNumber}>
                  {b.batchNumber} ({b.furnaceOrLine})
                </option>
              ))}
            </select>
          ) : (
            <input
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={productionBatchId}
              placeholder="e.g. BATCH-2026-11-A"
              onChange={(e) => setProductionBatchId(e.target.value)}
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Remarks / Heat Details</label>
          <input
            className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={remarks}
            placeholder="e.g. Induction furnace heat #3, FG260 grade"
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || quantity <= 0}>
            {isSubmitting ? 'Recording...' : 'Record Issue'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
