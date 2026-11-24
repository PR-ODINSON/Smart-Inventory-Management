import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/shared/Button'
import { Card, CardHeader } from '../components/shared/Card'
import { Modal } from '../components/shared/Modal'
import { useToast } from '../contexts/ToastContext'
import { useAppData } from '../contexts/AppDataContext'
import {
  applyMovement,
  editMovement,
  deleteMovement,
  isSystemMovement,
  MovementValidationError,
} from '../services/inventoryMovementService'
import { db } from '../storage/database'
import type { InventoryMovement, Material, MovementType } from '../types/inventory'
import type { MovementTypeMaster } from '../types/dispatch'
import { formatDateTime, formatNumber } from '../utils/formatting'
import { listMovementTypes } from '../services/movementTypeService'
import { MovementTypesMasterModal } from '../components/movements/MovementTypesMasterModal'
import { Settings2, Edit2, Trash2 } from 'lucide-react'

export function MovementsPage() {
  const { refresh } = useAppData()
  const { toast } = useToast()
  const [params] = useSearchParams()

  const [materials, setMaterials] = useState<Material[]>([])
  const [history, setHistory] = useState<InventoryMovement[]>([])
  const [type, setType] = useState<string>('goods_receipt')
  const [materialId, setMaterialId] = useState('')
  const [quantity, setQuantity] = useState<number>(0)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16))
  const [reason, setReason] = useState('')
  const [adjustSign, setAdjustSign] = useState<'increase' | 'decrease'>('increase')
  const [movementTypes, setMovementTypes] = useState<MovementTypeMaster[]>([])
  const [typesModalOpen, setTypesModalOpen] = useState(false)

  // Edit & Delete states
  const [editingMovement, setEditingMovement] = useState<InventoryMovement | null>(null)
  const [movementToDelete, setMovementToDelete] = useState<InventoryMovement | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Inline errors
  const [errors, setErrors] = useState<{
    materialId?: string
    type?: string
    quantity?: string
    date?: string
    reason?: string
  }>({})

  const reload = async () => {
    const [allMats, recentMovements, allTypes] = await Promise.all([
      db.materials.toArray(),
      db.movements.orderBy('timestamp').reverse().limit(100).toArray(),
      listMovementTypes(),
    ])
    setMaterials(allMats)
    setHistory(recentMovements)
    setMovementTypes(allTypes)
  }

  useEffect(() => {
    void reload()
  }, [])

  useEffect(() => {
    const t = params.get('type')
    if (t) setType(t)
  }, [params])

  // Material ID to Name lookup map
  const materialNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of materials) {
      map.set(m.id, m.name)
    }
    return map
  }, [materials])

  // Movement type ID to Name lookup map
  const typeNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of movementTypes) {
      map.set(t.id, t.name)
    }
    return map
  }, [movementTypes])

  const activeMaterials = useMemo(
    () => materials.filter((m) => m.status === 'active'),
    [materials],
  )

  const startEditMovement = (m: InventoryMovement) => {
    setEditingMovement(m)
    setMaterialId(m.materialId)
    setType(m.type)
    setQuantity(m.quantity)
    setDate(m.timestamp ? m.timestamp.slice(0, 16) : new Date().toISOString().slice(0, 16))
    setReason(m.reason || '')
    const sign =
      m.adjustmentSign ||
      (m.resultingPhysicalStock < m.previousPhysicalStock ? 'decrease' : 'increase')
    setAdjustSign(sign)
    setErrors({})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelEdit = () => {
    setEditingMovement(null)
    setMaterialId('')
    setQuantity(0)
    setDate(new Date().toISOString().slice(0, 16))
    setReason('')
    setAdjustSign('increase')
    setErrors({})
  }

  const validateForm = (): boolean => {
    const errs: typeof errors = {}
    if (!materialId) {
      errs.materialId = 'Material is required.'
    }
    if (!type) {
      errs.type = 'Type of Goods is required.'
    }
    if (quantity <= 0 || Number.isNaN(quantity)) {
      errs.quantity = 'Quantity must be greater than 0.'
    }
    if (!date || Number.isNaN(Date.parse(date))) {
      errs.date = 'Valid date is required.'
    }
    if (type === 'stock_adjustment' && !reason.trim()) {
      errs.reason = 'Reason is required for stock adjustment.'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const submit = async () => {
    if (!validateForm()) {
      toast('Please fix the errors before submitting.', 'error')
      return
    }

    const material = materials.find((m) => m.id === materialId)
    if (!material) {
      toast('Selected material was not found.', 'error')
      return
    }

    setIsSaving(true)
    try {
      const isoDate = new Date(date).toISOString()
      if (editingMovement) {
        // EDIT existing movement
        await editMovement(editingMovement.id, {
          materialId,
          type: type as MovementType,
          quantity,
          unit: material.unit,
          timestamp: isoDate,
          reason: type === 'stock_adjustment' ? reason.trim() : undefined,
          adjustmentSign: type === 'stock_adjustment' ? adjustSign : undefined,
        })
        toast('Movement updated and stock recalculated.', 'success')
        cancelEdit()
      } else {
        // CREATE new movement
        await applyMovement({
          material,
          type: type as MovementType,
          quantity,
          timestamp: isoDate,
          reason: type === 'stock_adjustment' ? reason.trim() : undefined,
          adjustmentSign: type === 'stock_adjustment' ? adjustSign : undefined,
        })
        toast('Movement recorded.', 'success')
        setQuantity(0)
        setReason('')
      }
      await refresh()
      await reload()
    } catch (e) {
      toast(e instanceof MovementValidationError ? e.message : 'Movement failed.', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!movementToDelete) return
    setIsDeleting(true)
    try {
      await deleteMovement(movementToDelete.id)
      toast('Movement deleted and stock reversed.', 'success')
      setMovementToDelete(null)
      await refresh()
      await reload()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete movement.', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Stock Movements"
        description="Record and manage traceable inventory transactions with stock reversal on edit or delete."
        actions={
          <Button variant="secondary" onClick={() => setTypesModalOpen(true)}>
            <Settings2 className="mr-1.5 h-4 w-4" /> Manage Type of Goods
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ADD / EDIT MOVEMENT FORM */}
        <Card>
          <CardHeader
            title={editingMovement ? 'Edit movement' : 'Record movement'}
            action={
              editingMovement ? (
                <Button size="sm" variant="secondary" onClick={cancelEdit}>
                  Cancel edit
                </Button>
              ) : undefined
            }
          />
          <div className="space-y-3 p-4">
            {editingMovement && (
              <div className="rounded bg-indigo-50 p-2.5 text-xs text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
                <strong>Editing Movement:</strong> Saving changes will reverse the old movement&apos;s
                stock effect and apply the new values.
              </div>
            )}

            <label className="block text-sm">
              <span className="flex items-center justify-between">
                <span>Type of Goods Movement *</span>
                <button
                  type="button"
                  onClick={() => setTypesModalOpen(true)}
                  className="text-xs text-brand hover:underline font-normal"
                >
                  Configure Types
                </button>
              </span>
              <select
                className={`mt-1 w-full rounded border px-2 py-1.5 dark:bg-slate-900 ${
                  errors.type ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                }`}
                value={type}
                onChange={(e) => {
                  setType(e.target.value)
                  if (errors.type) setErrors((err) => ({ ...err, type: undefined }))
                }}
              >
                {movementTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {errors.type && <p className="mt-1 text-xs text-red-600">{errors.type}</p>}
            </label>

            <label className="block text-sm">
              Material *
              <select
                className={`mt-1 w-full rounded border px-2 py-1.5 dark:bg-slate-900 ${
                  errors.materialId ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                }`}
                value={materialId}
                onChange={(e) => {
                  setMaterialId(e.target.value)
                  if (errors.materialId) setErrors((err) => ({ ...err, materialId: undefined }))
                }}
              >
                <option value="">Select material…</option>
                {activeMaterials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              {errors.materialId && <p className="mt-1 text-xs text-red-600">{errors.materialId}</p>}
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Quantity *
                <input
                  type="number"
                  min={0.001}
                  step="any"
                  className={`mt-1 w-full rounded border px-2 py-1.5 dark:bg-slate-900 ${
                    errors.quantity ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                  }`}
                  value={quantity || ''}
                  placeholder="e.g. 50"
                  onChange={(e) => {
                    setQuantity(parseFloat(e.target.value) || 0)
                    if (errors.quantity) setErrors((err) => ({ ...err, quantity: undefined }))
                  }}
                />
                {errors.quantity && <p className="mt-1 text-xs text-red-600">{errors.quantity}</p>}
              </label>

              <label className="block text-sm">
                Date &amp; Time *
                <input
                  type="datetime-local"
                  required
                  className={`mt-1 w-full rounded border px-2 py-1.5 dark:bg-slate-900 ${
                    errors.date ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                  }`}
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value)
                    if (errors.date) setErrors((err) => ({ ...err, date: undefined }))
                  }}
                />
                {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date}</p>}
              </label>
            </div>

            {type === 'stock_adjustment' && (
              <>
                <label className="block text-sm">
                  Direction
                  <select
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
                    value={adjustSign}
                    onChange={(e) => setAdjustSign(e.target.value as 'increase' | 'decrease')}
                  >
                    <option value="increase">Increase (+)</option>
                    <option value="decrease">Decrease (-)</option>
                  </select>
                </label>
                <label className="block text-sm">
                  Reason (required) *
                  <input
                    className={`mt-1 w-full rounded border px-2 py-1.5 dark:bg-slate-900 ${
                      errors.reason ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'
                    }`}
                    placeholder="e.g. Physical inventory count discrepancy"
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value)
                      if (errors.reason) setErrors((err) => ({ ...err, reason: undefined }))
                    }}
                  />
                  {errors.reason && <p className="mt-1 text-xs text-red-600">{errors.reason}</p>}
                </label>
              </>
            )}

            <div className="flex gap-2 pt-2">
              <Button onClick={() => void submit()} disabled={isSaving}>
                {isSaving
                  ? 'Saving…'
                  : editingMovement
                    ? 'Save Movement Changes'
                    : 'Submit movement'}
              </Button>
              {editingMovement && (
                <Button variant="secondary" onClick={cancelEdit}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* RECENT MOVEMENTS TABLE */}
        <Card>
          <CardHeader title="Recent movements" />
          <div className="max-h-[480px] overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-2 py-2 text-left">When</th>
                  <th className="px-2 py-2 text-left">Material</th>
                  <th className="px-2 py-2 text-left">Type</th>
                  <th className="px-2 py-2 text-left">Qty</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-500">
                      No stock movements recorded yet.
                    </td>
                  </tr>
                ) : (
                  history.map((m) => {
                    const isSystem = isSystemMovement(m)
                    return (
                      <tr key={m.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-2 py-1.5 whitespace-nowrap">{formatDateTime(m.timestamp)}</td>
                        <td className="px-2 py-1.5 font-medium text-slate-900 dark:text-white">
                          {materialNameMap.get(m.materialId) ?? 'Unknown material (deleted)'}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600 dark:text-slate-400">
                          {typeNameMap.get(m.type) ?? m.type.replace(/_/g, ' ')}
                        </td>
                        <td className="px-2 py-1.5 tabular-nums font-semibold">
                          {formatNumber(m.quantity)} {m.unit}
                        </td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                          {isSystem ? (
                            <span
                              className="text-[10px] text-slate-400 italic"
                              title="System movement — change the source receipt/dispatch instead."
                            >
                              System
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                                title="Edit movement"
                                onClick={() => startEditMovement(m)}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                                title="Delete movement"
                                onClick={() => setMovementToDelete(m)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <MovementTypesMasterModal
        open={typesModalOpen}
        onClose={() => setTypesModalOpen(false)}
        types={movementTypes}
        onTypesChanged={reload}
      />

      {/* DELETE CONFIRMATION MODAL */}
      {movementToDelete && (
        <Modal
          open={Boolean(movementToDelete)}
          title="Delete Stock Movement"
          onClose={() => !isDeleting && setMovementToDelete(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Are you sure you want to delete this movement record? Deleting this movement will
              reverse its effect on stock. Stock may go negative.
            </p>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Material:</span>
                <span className="font-medium text-slate-900 dark:text-white">
                  {materialNameMap.get(movementToDelete.materialId) ?? movementToDelete.materialId}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Type of Goods:</span>
                <span className="font-medium text-slate-900 dark:text-white">
                  {typeNameMap.get(movementToDelete.type) ?? movementToDelete.type}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Quantity:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {movementToDelete.quantity} {movementToDelete.unit}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Date:</span>
                <span className="text-slate-700 dark:text-slate-300">
                  {formatDateTime(movementToDelete.timestamp)}
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-red-50 p-3 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">
              <strong>Warning:</strong> Deleting will reverse this movement&apos;s effect on stock.
              Stock may go negative. This cannot be undone.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                disabled={isDeleting}
                onClick={() => setMovementToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                className="bg-red-600 text-white hover:bg-red-700"
                disabled={isDeleting}
                onClick={() => void handleDeleteConfirm()}
              >
                {isDeleting ? 'Deleting…' : 'Delete Movement'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

