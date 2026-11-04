import { useEffect, useState } from 'react'
import { Modal } from '../shared/Modal'
import { Button } from '../shared/Button'
import type { Material, Supplier } from '../../types/inventory'
import {
  validateSupplierForm,
  type SupplierFieldErrors,
  type SupplierFormInput,
} from '../../lib/supplier/validation'

const inputClass =
  'w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900'

export function emptySupplierForm(): SupplierFormInput {
  return {
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    avgDeliveryDays: 5,
    maxDeliveryDays: 10,
    materialIds: [],
    active: true,
    notes: '',
  }
}

export function supplierToForm(s: Supplier): SupplierFormInput {
  return {
    companyName: s.companyName,
    contactPerson: s.contactPerson ?? '',
    phone: s.phone ?? '',
    email: s.email ?? '',
    avgDeliveryDays: s.avgDeliveryDays ?? 5,
    maxDeliveryDays: s.maxDeliveryDays ?? 10,
    materialIds: [...s.materialIds],
    active: s.active,
    notes: s.notes ?? '',
  }
}

export function SupplierFormModal({
  open,
  mode,
  initial,
  materials,
  saving,
  duplicateHint,
  onClose,
  onSave,
}: {
  open: boolean
  mode: 'add' | 'edit'
  initial: SupplierFormInput
  materials: Material[]
  saving: boolean
  duplicateHint?: string
  onClose: () => void
  onSave: (form: SupplierFormInput) => void
}) {
  const [form, setForm] = useState<SupplierFormInput>(initial)
  const [errors, setErrors] = useState<SupplierFieldErrors>({})

  useEffect(() => {
    if (open) {
      setForm(initial)
      setErrors({})
    }
  }, [open, initial])

  const toggleMaterial = (id: string) => {
    setForm((f) => ({
      ...f,
      materialIds: f.materialIds.includes(id)
        ? f.materialIds.filter((m) => m !== id)
        : [...f.materialIds, id],
    }))
  }

  const submit = () => {
    const v = validateSupplierForm(form)
    if (!v.ok) {
      setErrors(v.errors)
      return
    }
    setErrors({})
    onSave(form)
  }

  const activeMaterials = materials.filter((m) => m.status === 'active')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'add' ? 'Add supplier' : 'Edit supplier'}
      wide
    >
      <div className="space-y-3 text-sm">
        {duplicateHint && (
          <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            {duplicateHint}
          </p>
        )}
        <label className="block">
          Company name *
          <input
            className={inputClass}
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          />
          {errors.companyName && (
            <span className="mt-0.5 block text-xs text-red-600">{errors.companyName}</span>
          )}
        </label>
        <label className="block">
          Contact person
          <input
            className={inputClass}
            value={form.contactPerson}
            onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            Phone
            <input
              className={inputClass}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label className="block">
            Email
            <input
              className={inputClass}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            {errors.email && (
              <span className="mt-0.5 block text-xs text-red-600">{errors.email}</span>
            )}
          </label>
        </div>
        {errors.contact && (
          <p className="text-xs text-red-600">{errors.contact}</p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            Avg delivery (days)
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.avgDeliveryDays}
              onChange={(e) =>
                setForm({ ...form, avgDeliveryDays: Number(e.target.value) })
              }
            />
          </label>
          <label className="block">
            Max delivery (days)
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.maxDeliveryDays}
              onChange={(e) =>
                setForm({ ...form, maxDeliveryDays: Number(e.target.value) })
              }
            />
          </label>
        </div>
        {(errors.avgDeliveryDays || errors.maxDeliveryDays) && (
          <p className="text-xs text-red-600">
            {errors.avgDeliveryDays ?? errors.maxDeliveryDays}
          </p>
        )}
        <label className="block">
          Status
          <select
            className={inputClass}
            value={form.active ? 'active' : 'inactive'}
            onChange={(e) => setForm({ ...form, active: e.target.value === 'active' })}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className="block">
          Notes
          <textarea
            className={inputClass}
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        <div>
          <p className="mb-1 font-medium">Materials supplied</p>
          {activeMaterials.length === 0 ? (
            <p className="text-xs text-slate-500">
              No materials in inventory yet. Add materials on the Inventory page first.
            </p>
          ) : (
            <div className="max-h-40 overflow-auto rounded border border-slate-200 p-2 dark:border-slate-700">
              {activeMaterials.map((m) => (
                <label key={m.id} className="flex cursor-pointer gap-2 py-0.5 text-xs">
                  <input
                    type="checkbox"
                    checked={form.materialIds.includes(m.id)}
                    onChange={() => toggleMaterial(m.id)}
                  />
                  <span>{m.name}</span>
                  <span className="text-slate-500">({m.id})</span>
                </label>
              ))}
            </div>
          )}
          {form.materialIds.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Selected: {form.materialIds.length} material(s)
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" disabled={saving} onClick={submit}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
