import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/shared/Button'
import { StockBadge } from '../components/shared/Badge'
import { Modal } from '../components/shared/Modal'
import { useToast } from '../contexts/ToastContext'
import { useAppData } from '../contexts/AppDataContext'
import {
  listMaterialsComputed,
  updateInventoryBalance,
  upsertMaterial,
} from '../services/inventoryService'
import type { InventoryBalance } from '../types/inventory'
import { materialsToCsv, downloadTextFile } from '../services/importExportService'
import type { Material, MaterialComputed, StockStatus } from '../types/inventory'
import { formatDate, formatNumber } from '../utils/formatting'
import { isPastDate } from '../utils/dates'

const emptyMaterial = (): Material => ({
  id: '',
  name: '',
  category: 'General',
  unit: 'kg',
  packSize: 1,
  baseDailyConsumption: 0,
  avgLeadTimeDays: 5,
  maxLeadTimeDays: 10,
  supplierIds: [],
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

export function InventoryPage() {
  const [rows, setRows] = useState<MaterialComputed[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [statusFilter, setStatusFilter] = useState<StockStatus | ''>('')
  const [sort, setSort] = useState<'cover' | 'stock' | 'consumption'>('cover')
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [form, setForm] = useState<Material>(emptyMaterial())
  const [balanceForm, setBalanceForm] = useState<InventoryBalance | null>(null)
  const [isNew, setIsNew] = useState(true)
  const { settings } = useAppData()
  const { toast } = useToast()
  const [params] = useSearchParams()

  const load = async () => {
    setRows(await listMaterialsComputed())
  }

  useEffect(() => {
    void load()
  }, [settings.productionLevelPercent, settings.desiredCoverageDays])

  useEffect(() => {
    if (params.get('action') === 'add') {
      setIsNew(true)
      setForm(emptyMaterial())
      setBalanceForm(null)
      setModal('add')
    }
    const editId = params.get('edit')
    if (editId && rows.length > 0) {
      const row = rows.find((r) => r.material.id === editId)
      if (row) {
        setIsNew(false)
        setForm({ ...row.material })
        setBalanceForm({ ...row.balance })
        setModal('edit')
      }
    }
  }, [params, rows])

  const categories = useMemo(
    () => [...new Set(rows.map((r) => r.material.category))].sort(),
    [rows],
  )

  const filtered = useMemo(() => {
    let list = [...rows]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (r) =>
          r.material.name.toLowerCase().includes(q) ||
          r.material.id.toLowerCase().includes(q),
      )
    }
    if (category) list = list.filter((r) => r.material.category === category)
    if (statusFilter) list = list.filter((r) => r.stockStatus === statusFilter)
    list.sort((a, b) => {
      if (sort === 'stock') return b.availableStock - a.availableStock
      if (sort === 'consumption')
        return b.effectiveDailyConsumption - a.effectiveDailyConsumption
      const ac = a.daysOfCover ?? 9999
      const bc = b.daysOfCover ?? 9999
      return ac - bc
    })
    return list
  }, [rows, search, category, statusFilter, sort])

  const saveMaterial = async () => {
    try {
      if (!form.id.trim() || !form.name.trim()) {
        toast('Material ID and name are required.', 'error')
        return
      }
      if (form.baseDailyConsumption < 0 || form.packSize <= 0) {
        toast('Invalid consumption or pack size.', 'error')
        return
      }
      if (form.avgLeadTimeDays < 0 || form.maxLeadTimeDays < form.avgLeadTimeDays) {
        toast('Check lead time values.', 'error')
        return
      }
      const now = new Date().toISOString()
      const payload = { ...form, id: form.id.trim(), updatedAt: now }
      if (isNew) payload.createdAt = now
      await upsertMaterial(payload, isNew)
      if (!isNew && balanceForm) {
        await updateInventoryBalance({
          ...balanceForm,
          materialId: payload.id,
        })
      }
      toast(isNew ? 'Material created.' : 'Material updated.', 'success')
      setModal(null)
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed.', 'error')
    }
  }

  const exportCsv = () => {
    downloadTextFile(
      `inventory-${new Date().toISOString().slice(0, 10)}.csv`,
      materialsToCsv(filtered),
      'text/csv',
    )
    toast('CSV exported.', 'success')
  }

  const openEdit = (row: MaterialComputed) => {
    setIsNew(false)
    setForm({ ...row.material })
    setBalanceForm({ ...row.balance })
    setModal('edit')
  }

  return (
    <div>
      <PageHeader
        title="Inventory Management"
        description="Central operational view of materials, availability, and reorder planning."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>
            <Button
              onClick={() => {
                setIsNew(true)
                setForm(emptyMaterial())
                setBalanceForm(null)
                setModal('add')
              }}
            >
              Add material
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
          placeholder="Search name or ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          className="rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StockStatus | '')}
        >
          <option value="">All statuses</option>
          <option value="healthy">Healthy</option>
          <option value="approaching_reorder">Approaching reorder</option>
          <option value="below_reorder">Below reorder</option>
          <option value="critical">Critical</option>
          <option value="no_consumption">No consumption</option>
        </select>
        <select
          className="rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
        >
          <option value="cover">Sort: days of cover</option>
          <option value="stock">Sort: available stock</option>
          <option value="consumption">Sort: consumption</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="min-w-[1400px] w-full text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 dark:bg-slate-900">
            <tr>
              {[
                'ID', 'Name', 'Category', 'Unit', 'Location', 'Physical', 'Reserved', 'Inspection',
                'Available', 'Daily use', 'Avg lead', 'Max lead', 'Safety', 'Reorder', 'Days cover',
                'Stock-out', 'Order qty', 'Order by', 'Status', 'Actions',
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-2 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.material.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-2 py-1.5 font-mono">{r.material.id}</td>
                <td className="px-2 py-1.5">
                  <Link to={`/inventory/${r.material.id}`} className="font-medium text-brand hover:underline">
                    {r.material.name}
                  </Link>
                </td>
                <td className="px-2 py-1.5">{r.material.category}</td>
                <td className="px-2 py-1.5">{r.material.unit}</td>
                <td className="px-2 py-1.5">{r.balance.locationId}</td>
                <td className="px-2 py-1.5 tabular-nums">{formatNumber(r.balance.physicalStock)}</td>
                <td className="px-2 py-1.5 tabular-nums">{formatNumber(r.balance.reserved)}</td>
                <td className="px-2 py-1.5 tabular-nums">{formatNumber(r.balance.awaitingInspection)}</td>
                <td className="px-2 py-1.5 tabular-nums">{formatNumber(r.availableStock)}</td>
                <td className="px-2 py-1.5 tabular-nums">{formatNumber(r.effectiveDailyConsumption)}</td>
                <td className="px-2 py-1.5 tabular-nums">{r.material.avgLeadTimeDays}</td>
                <td className="px-2 py-1.5 tabular-nums">{r.material.maxLeadTimeDays}</td>
                <td className="px-2 py-1.5 tabular-nums">{formatNumber(r.safetyStock)}</td>
                <td className="px-2 py-1.5 tabular-nums">{formatNumber(r.reorderPoint)}</td>
                <td className="px-2 py-1.5 tabular-nums">
                  {r.daysOfCover != null ? formatNumber(r.daysOfCover, 1) : '—'}
                </td>
                <td className="px-2 py-1.5">{formatDate(r.predictedStockOutDate)}</td>
                <td className="px-2 py-1.5 tabular-nums">{formatNumber(r.recommendedOrderQty, 0)}</td>
                <td className="px-2 py-1.5">
                  {r.latestSafeOrderDate && isPastDate(r.latestSafeOrderDate)
                    ? 'Order immediately'
                    : formatDate(r.latestSafeOrderDate)}
                </td>
                <td className="px-2 py-1.5"><StockBadge status={r.stockStatus} /></td>
                <td className="px-2 py-1.5">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={isNew ? 'Add material' : 'Edit material'}
        wide
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ['id', 'Material ID'],
            ['name', 'Name'],
            ['category', 'Category'],
            ['unit', 'Unit'],
          ].map(([key, label]) => (
            <label key={key} className="text-sm">
              <span className="text-slate-600 dark:text-slate-400">{label}</span>
              <input
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
                value={String(form[key as keyof Material] ?? '')}
                disabled={!isNew && key === 'id'}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          {[
            ['packSize', 'Pack size'],
            ['baseDailyConsumption', 'Base daily consumption'],
            ['avgLeadTimeDays', 'Avg lead time (days)'],
            ['maxLeadTimeDays', 'Max lead time (days)'],
            ['unitWeightKg', 'Weight per unit (kg)'],
          ].map(([key, label]) => (
            <label key={key} className="text-sm">
              <span className="text-slate-600 dark:text-slate-400">{label}</span>
              <input
                type="number"
                min={0}
                step="any"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
                value={(form[key as keyof Material] as number | undefined) ?? ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  setForm({
                    ...form,
                    [key]: key === 'unitWeightKg' ? (Number.isFinite(v) ? v : undefined) : v || 0,
                  })
                }}
              />
            </label>
          ))}
          <label className="text-sm sm:col-span-2">
            <span className="text-slate-600 dark:text-slate-400">Default location ID</span>
            <input
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
              value={form.defaultLocationId ?? ''}
              onChange={(e) => setForm({ ...form, defaultLocationId: e.target.value })}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-slate-600 dark:text-slate-400">Notes</span>
            <textarea
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
              rows={2}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          {!isNew && balanceForm && (
            <div className="sm:col-span-2 rounded border border-slate-200 p-3 dark:border-slate-700">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Stock levels (edit)</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    ['physicalStock', 'Physical stock'],
                    ['reserved', 'Reserved'],
                    ['awaitingInspection', 'Awaiting inspection'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="text-sm">
                    {label}
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
                      value={balanceForm[key]}
                      onChange={(e) =>
                        setBalanceForm({
                          ...balanceForm,
                          [key]: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                For traceable changes, prefer Stock Movements; direct edits are for corrections.
              </p>
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
          <Button onClick={() => void saveMaterial()}>Save</Button>
        </div>
      </Modal>
    </div>
  )
}
