import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Card, CardHeader } from '../components/shared/Card'
import { Button } from '../components/shared/Button'
import { DemoBadge } from '../components/shared/Badge'
import { useToast } from '../contexts/ToastContext'
import type { Material, Supplier } from '../types/inventory'
import {
  DEFAULT_SUPPLIER_LIST_PARAMS,
  filterAndSortSuppliers,
  hasActiveFilters,
  type SupplierListParams,
  type SupplierSort,
  type SupplierStatusFilter,
} from '../lib/supplier/filterSuppliers'
import { computeSupplierSummary } from '../lib/supplier/summaries'
import {
  createSupplier,
  DuplicateSupplierError,
  listMaterialsForPicker,
  listSuppliers,
  updateSupplier,
} from '../services/supplierService'
import {
  emptySupplierForm,
  SupplierFormModal,
  supplierToForm,
} from '../components/suppliers/SupplierFormModal'
import { SupplierBillImportFlow } from '../components/suppliers/SupplierBillImportFlow'
import { listSupplierInvoices } from '../services/supplierInvoiceService'
import type { SupplierInvoiceLine } from '../types/supplierInvoice'
import { formatNumber } from '../utils/formatting'

const inputClass =
  'rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900'

function MaterialNames({
  ids,
  nameById,
  max = 3,
}: {
  ids: string[]
  nameById: Map<string, string>
  max?: number
}) {
  if (ids.length === 0) return <span className="text-slate-500">—</span>
  const labels = ids.map((id) => nameById.get(id) ?? `${id} (removed)`)
  const shown = labels.slice(0, max)
  const rest = labels.length - shown.length
  return (
    <span className="text-xs leading-snug">
      {shown.join(', ')}
      {rest > 0 && <span className="text-slate-500"> +{rest} more</span>}
    </span>
  )
}

function BillItemSummary({ lines }: { lines: SupplierInvoiceLine[] }) {
  if (lines.length === 0) return <span className="text-slate-500">—</span>
  return (
    <ul className="space-y-1 text-xs leading-snug">
      {lines.slice(0, 3).map((l) => (
        <li key={l.id}>
          {l.itemCode ? (
            <span className="font-mono text-slate-600 dark:text-slate-400">{l.itemCode}</span>
          ) : null}
          {l.itemCode ? ' · ' : null}
          <span>{l.description}</span>
        </li>
      ))}
      {lines.length > 3 && (
        <li className="text-slate-500">+{lines.length - 3} more on bills</li>
      )}
    </ul>
  )
}

export function SuppliersPage() {
  const { toast } = useToast()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [params, setParams] = useState<SupplierListParams>(DEFAULT_SUPPLIER_LIST_PARAMS)
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add')
  const [formInitial, setFormInitial] = useState(emptySupplierForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [duplicateHint, setDuplicateHint] = useState<string | undefined>()
  const [billImportOpen, setBillImportOpen] = useState(false)
  const [billLinesBySupplier, setBillLinesBySupplier] = useState<
    Map<string, SupplierInvoiceLine[]>
  >(new Map())

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [s, m, invoices] = await Promise.all([
        listSuppliers(),
        listMaterialsForPicker(),
        listSupplierInvoices(),
      ])
      const bySupplier = new Map<string, SupplierInvoiceLine[]>()
      for (const inv of invoices) {
        const prev = bySupplier.get(inv.supplierId) ?? []
        bySupplier.set(inv.supplierId, [...prev, ...inv.lines])
      }
      setBillLinesBySupplier(bySupplier)
      setSuppliers(s)
      setMaterials(m)
    } catch {
      setLoadError('Could not load suppliers. Refresh the page or try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const nameById = useMemo(
    () => new Map(materials.map((m) => [m.id, m.name])),
    [materials],
  )

  const summary = useMemo(() => computeSupplierSummary(suppliers), [suppliers])
  const filtered = useMemo(
    () => filterAndSortSuppliers(suppliers, params),
    [suppliers, params],
  )

  const openAdd = () => {
    setFormMode('add')
    setEditingId(null)
    setFormInitial(emptySupplierForm())
    setDuplicateHint(undefined)
    setFormOpen(true)
  }

  const openEdit = (s: Supplier) => {
    setFormMode('edit')
    setEditingId(s.id)
    setFormInitial(supplierToForm(s))
    setDuplicateHint(undefined)
    setFormOpen(true)
  }

  const handleSave = async (form: ReturnType<typeof emptySupplierForm>) => {
    setSaving(true)
    setDuplicateHint(undefined)
    try {
      if (formMode === 'add') {
        await createSupplier(form)
        toast('Supplier added.', 'success')
      } else if (editingId) {
        await updateSupplier(editingId, form)
        toast('Supplier updated.', 'success')
      }
      setFormOpen(false)
      await load()
    } catch (e) {
      if (e instanceof DuplicateSupplierError) {
        setDuplicateHint(
          `A supplier named like this already exists (${e.existingId}). Edit that record or use a distinct company name.`,
        )
      } else {
        toast(e instanceof Error ? e.message : 'Save failed.', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const clearFilters = () => setParams(DEFAULT_SUPPLIER_LIST_PARAMS)

  return (
    <div>
      <PageHeader
        title="Supplier management"
        description="Maintain supplier contacts, upload bills, and manage material associations."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setBillImportOpen(true)}>
              Upload supplier bill
            </Button>
            <Button onClick={openAdd}>Add supplier</Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total suppliers', value: summary.total },
          { label: 'Active suppliers', value: summary.active },
          {
            label: 'Avg delivery lead time',
            value:
              summary.averageLeadTimeDays == null
                ? '—'
                : `${formatNumber(summary.averageLeadTimeDays, 1)} days`,
          },
          {
            label: 'With material links',
            value: summary.withMaterialAssociations,
          },
        ].map((c) => (
          <Card key={c.label}>
            <div className="p-4">
              <p className="text-xs uppercase text-slate-500">{c.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Supplier directory" />
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4 dark:border-slate-800">
          <input
            placeholder="Search name or contact"
            className={inputClass}
            value={params.search ?? ''}
            onChange={(e) => setParams({ ...params, search: e.target.value })}
          />
          <select
            className={inputClass}
            value={params.status}
            onChange={(e) =>
              setParams({ ...params, status: e.target.value as SupplierStatusFilter })
            }
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            className={inputClass}
            value={params.materialId ?? ''}
            onChange={(e) =>
              setParams({ ...params, materialId: e.target.value || undefined })
            }
          >
            <option value="">All materials</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <select
            className={inputClass}
            value={params.sort}
            onChange={(e) => setParams({ ...params, sort: e.target.value as SupplierSort })}
          >
            <option value="company_asc">Sort: company A–Z</option>
            <option value="avgLead_asc">Sort: avg lead ↑</option>
            <option value="avgLead_desc">Sort: avg lead ↓</option>
            <option value="maxLead_asc">Sort: max lead ↑</option>
            <option value="maxLead_desc">Sort: max lead ↓</option>
          </select>
          {hasActiveFilters(params) && (
            <Button variant="ghost" size="sm" type="button" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>

        {loading ? (
          <p className="p-4 text-sm text-slate-500">Loading suppliers…</p>
        ) : loadError ? (
          <p className="p-4 text-sm text-red-600">{loadError}</p>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm">
            <p className="text-slate-600 dark:text-slate-400">
              {suppliers.length === 0
                ? 'No suppliers yet. Add your first vendor to link materials and lead times.'
                : 'No suppliers match your filters.'}
            </p>
            {suppliers.length === 0 && (
              <Button className="mt-4" onClick={openAdd}>Add supplier</Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2 text-left">Company</th>
                  <th className="px-3 py-2 text-left">Contact</th>
                  <th className="px-3 py-2 text-left">Materials</th>
                  <th className="px-3 py-2 text-left">Items from bills</th>
                  <th className="px-3 py-2 text-left">Lead times</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/suppliers/${s.id}`} className="font-medium hover:underline">
                          {s.companyName}
                        </Link>
                        {s.isDemo && <DemoBadge label="Demo supplier" />}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {s.contactPerson ?? '—'}
                      {s.phone && <div>{s.phone}</div>}
                      {s.email && <div className="text-slate-500">{s.email}</div>}
                    </td>
                    <td className="max-w-[200px] px-3 py-2">
                      <MaterialNames ids={s.materialIds} nameById={nameById} />
                    </td>
                    <td className="max-w-[240px] px-3 py-2">
                      <BillItemSummary lines={billLinesBySupplier.get(s.id) ?? []} />
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {s.avgDeliveryDays ?? '—'} / {s.maxDeliveryDays ?? '—'} days
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          s.active
                            ? 'rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100'
                            : 'rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                        }
                      >
                        {s.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="ghost" type="button" onClick={() => openEdit(s)}>
                          Edit
                        </Button>
                        <Link to={`/suppliers/${s.id}`}>
                          <Button size="sm" variant="secondary" type="button">View</Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <SupplierFormModal
        open={formOpen}
        mode={formMode}
        initial={formInitial}
        materials={materials}
        saving={saving}
        duplicateHint={duplicateHint}
        onClose={() => setFormOpen(false)}
        onSave={(f) => void handleSave(f)}
      />

      <SupplierBillImportFlow
        open={billImportOpen}
        onClose={() => setBillImportOpen(false)}
        suppliers={suppliers}
        onSaved={load}
      />
    </div>
  )
}
