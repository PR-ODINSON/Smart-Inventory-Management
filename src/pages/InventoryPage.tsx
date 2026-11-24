import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/shared/Button'
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
import type { CategoryMaster, UnitMaster } from '../types/masterData'
import { formatDate, formatNumber } from '../utils/formatting'
import {
  listCategories,
  listUnits,
} from '../services/masterDataService'
import { MasterDataModal } from '../components/shared/MasterDataModal'
import {
  getActiveProductionPlan,
  listMaterialConsumptionRates,
} from '../services/productionPlanService'
import {
  calculateDailyRawMaterialRequirement,
  calculateStockCoverage,
} from '../lib/productionPlanning'

const emptyMaterial = (): Material => ({
  id: '',
  name: '',
  category: 'General',
  unit: 'kg',
  packSize: 1,
  baseDailyConsumption: 0,
  dailyConsumptionUnit: 'kg',
  emergencyStock: 0,
  avgLeadTimeDays: 5,
  maxLeadTimeDays: 10,
  supplierIds: [],
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

interface InventoryTableRow {
  material: Material
  balance: InventoryBalance
  availableStock: number
  dailyUse: number
  dailyUseUnit: string
  isFromActivePlan: boolean
  emergencyStock: number
  daysCovered: number | null
  reorderQuantity: number
  stockOutDate: string | null
  isOutOfStock: boolean
  isShortage: boolean
}

export function InventoryPage() {
  const [rows, setRows] = useState<MaterialComputed[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [statusFilter, setStatusFilter] = useState<StockStatus | ''>('')

  // Master data
  const [categories, setCategories] = useState<CategoryMaster[]>([])
  const [units, setUnits] = useState<UnitMaster[]>([])
  const [masterModal, setMasterModal] = useState<'category' | 'unit' | null>(null)

  // Plan & rates for Daily Use calculation
  const [ratesMap, setRatesMap] = useState<Map<string, number>>(new Map())
  const [planTargetTonnes, setPlanTargetTonnes] = useState<number | null>(null)
  const [planWorkingDays, setPlanWorkingDays] = useState<number | null>(null)
  const [desiredDays, setDesiredDays] = useState<number>(7)

  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [form, setForm] = useState<Material>(emptyMaterial())
  const [balanceForm, setBalanceForm] = useState<InventoryBalance | null>(null)
  const [isNew, setIsNew] = useState(true)

  const { settings } = useAppData()
  const { toast } = useToast()
  const [params] = useSearchParams()

  const loadMasterData = async () => {
    const [cats, uList] = await Promise.all([listCategories(), listUnits()])
    setCategories(cats)
    setUnits(uList)
  }

  const load = async () => {
    const [computedList, activePlan, allRates] = await Promise.all([
      listMaterialsComputed(),
      getActiveProductionPlan(),
      listMaterialConsumptionRates(),
    ])
    setRows(computedList)

    if (activePlan) {
      setPlanTargetTonnes(activePlan.targetTonnes)
      setPlanWorkingDays(activePlan.workingDays)
      setDesiredDays(activePlan.desiredInventoryDays ?? 7)
    } else {
      setPlanTargetTonnes(null)
      setPlanWorkingDays(null)
      setDesiredDays(7)
    }

    const rMap = new Map<string, number>()
    for (const r of allRates) {
      if (!rMap.has(r.materialId)) rMap.set(r.materialId, r.rateKgPerKgCasting)
    }
    setRatesMap(rMap)
    await loadMasterData()
  }

  useEffect(() => {
    void load()
  }, [settings.productionLevelPercent, settings.desiredCoverageDays])

  useEffect(() => {
    if (params.get('action') === 'add') {
      setIsNew(true)
      const defaultCat = categories[0]?.name || 'General'
      const defaultUnit = units[0]?.name || 'kg'
      setForm({
        ...emptyMaterial(),
        id: `MAT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        category: defaultCat,
        unit: defaultUnit,
        dailyConsumptionUnit: defaultUnit,
      })
      setBalanceForm(null)
      setModal('add')
    }
    const editId = params.get('edit')
    if (editId && rows.length > 0) {
      const row = rows.find((r) => r.material.id === editId)
      if (row) {
        setIsNew(false)
        setForm({
          ...row.material,
          emergencyStock: row.material.emergencyStock ?? 0,
          dailyConsumptionUnit: row.material.dailyConsumptionUnit || row.material.unit,
        })
        setBalanceForm({ ...row.balance })
        setModal('edit')
      }
    }
  }, [params, rows, categories, units])

  // Compute table rows based on EXACT Part B formulas
  const tableRows: InventoryTableRow[] = useMemo(() => {
    return rows.map((r) => {
      const mat = r.material
      let dailyUse = 0
      let isFromActivePlan = false

      if (planTargetTonnes != null && planWorkingDays != null && planWorkingDays > 0) {
        // Daily Use from active production plan (including 10% planning allowance)
        const consumptionRate = ratesMap.get(mat.id) ?? 0.05
        const dailyCalc = calculateDailyRawMaterialRequirement({
          targetTonnes: planTargetTonnes,
          workingDays: planWorkingDays,
          consumptionRateKgPerKgCasting: consumptionRate,
        })
        dailyUse = dailyCalc.plannedDailyRequirementKg
        isFromActivePlan = true
      } else {
        // Fallback to material's saved base daily consumption
        dailyUse = mat.baseDailyConsumption ?? 0
        isFromActivePlan = false
      }

      const availableStock = r.availableStock
      const emergencyStock = mat.emergencyStock ?? 0

      // Calculate coverage and reorder using standardized formulas
      const coverageResult = calculateStockCoverage({
        availableStockKg: availableStock,
        plannedDailyRequirementKg: dailyUse,
        desiredInventoryDays: desiredDays,
        emergencyStockKg: emergencyStock,
        unit: mat.unit,
      })

      const daysCovered = coverageResult.estimatedStockCoverageDays
      const reorderQuantity = coverageResult.purchaseRequirementKg
      const stockOutDate = coverageResult.stockOutDate

      const isOutOfStock = availableStock <= 0
      const isShortage = daysCovered != null && daysCovered < desiredDays

      return {
        material: mat,
        balance: r.balance,
        availableStock,
        dailyUse,
        dailyUseUnit: `${mat.unit}/day`,
        isFromActivePlan,
        emergencyStock,
        daysCovered,
        reorderQuantity,
        stockOutDate,
        isOutOfStock,
        isShortage,
      }
    })
  }, [rows, planTargetTonnes, planWorkingDays, ratesMap, desiredDays])

  // Filtering + Default Name A-Z sorting (Sort options removed per Part D)
  const filtered = useMemo(() => {
    let list = [...tableRows]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (r) =>
          r.material.name.toLowerCase().includes(q) ||
          r.material.id.toLowerCase().includes(q),
      )
    }
    if (category) list = list.filter((r) => r.material.category === category)
    if (statusFilter) {
      list = list.filter((r) => {
        if (statusFilter === 'critical') return r.isOutOfStock
        if (statusFilter === 'below_reorder' || statusFilter === 'approaching_reorder') return r.isShortage
        if (statusFilter === 'no_consumption') return r.dailyUse <= 0
        if (statusFilter === 'healthy') return !r.isShortage && !r.isOutOfStock && r.dailyUse > 0
        return true
      })
    }
    // Default order of Inventory table is Name A-Z (Part D)
    list.sort((a, b) =>
      a.material.name.localeCompare(b.material.name, undefined, { sensitivity: 'base' }),
    )
    return list
  }, [tableRows, search, category, statusFilter])

  const saveMaterial = async () => {
    try {
      if (!form.name.trim()) {
        toast('Material name is required.', 'error')
        return
      }
      if (!form.category.trim()) {
        toast('Category is required.', 'error')
        return
      }
      if (!form.unit.trim()) {
        toast('Unit is required.', 'error')
        return
      }
      if (form.baseDailyConsumption < 0) {
        toast('Daily consumption cannot be negative.', 'error')
        return
      }
      if ((form.emergencyStock ?? 0) < 0) {
        toast('Emergency stock cannot be negative.', 'error')
        return
      }

      const id = isNew
        ? form.id.trim() || `MAT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
        : form.id.trim()

      const now = new Date().toISOString()
      const payload: Material = {
        ...form,
        id,
        name: form.name.trim(),
        category: form.category.trim(),
        unit: form.unit.trim(),
        dailyConsumptionUnit: form.dailyConsumptionUnit?.trim() || form.unit.trim(),
        emergencyStock: Number(form.emergencyStock) || 0,
        baseDailyConsumption: Number(form.baseDailyConsumption) || 0,
        packSize: form.packSize || 1,
        avgLeadTimeDays: form.avgLeadTimeDays ?? 5,
        maxLeadTimeDays: form.maxLeadTimeDays ?? 10,
        updatedAt: now,
      }
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
      materialsToCsv(rows),
      'text/csv',
    )
    toast('CSV exported.', 'success')
  }

  const openEdit = (r: InventoryTableRow) => {
    setIsNew(false)
    setForm({
      ...r.material,
      emergencyStock: r.material.emergencyStock ?? 0,
      dailyConsumptionUnit: r.material.dailyConsumptionUnit || r.material.unit,
    })
    setBalanceForm({ ...r.balance })
    setModal('edit')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Management"
        description="Central operational view of materials, live stock, and production reorder requirements."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportCsv}>
              Export CSV
            </Button>
            <Button
              onClick={() => {
                setIsNew(true)
                const defaultCat = categories[0]?.name || 'General'
                const defaultUnit = units[0]?.name || 'kg'
                setForm({
                  ...emptyMaterial(),
                  id: `MAT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
                  category: defaultCat,
                  unit: defaultUnit,
                  dailyConsumptionUnit: defaultUnit,
                })
                setBalanceForm(null)
                setModal('add')
              }}
            >
              Add Material
            </Button>
          </div>
        }
      />

      {/* FILTERS (Part D: Days of cover, available stock, and consumption sort options removed) */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
          placeholder="Search name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="rounded border border-slate-300 px-2.5 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StockStatus | '')}
        >
          <option value="">All statuses</option>
          <option value="healthy">Healthy</option>
          <option value="below_reorder">Shortage</option>
          <option value="critical">Critical Out of Stock</option>
          <option value="no_consumption">No consumption</option>
        </select>

        <span className="text-xs text-slate-400 ml-auto">
          Sorted by Name (A-Z)
        </span>
      </div>

      {/* EXACT 9 COLUMNS TABLE IN EXACT ORDER (Part B) */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-slate-900">
            <tr>
              <th className="px-3 py-2.5">1. Name</th>
              <th className="px-3 py-2.5">2. Category</th>
              <th className="px-3 py-2.5">3. Unit</th>
              <th className="px-3 py-2.5">4. Available Stock</th>
              <th className="px-3 py-2.5">5. Daily Use</th>
              <th className="px-3 py-2.5">6. Emergency Stock</th>
              <th className="px-3 py-2.5">7. Days to be Covered</th>
              <th className="px-3 py-2.5">8. Reorder Quantity</th>
              <th className="px-3 py-2.5">9. Stock Out Date</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((r) => (
              <tr
                key={r.material.id}
                className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/50 ${
                  r.isOutOfStock ? 'bg-red-50/40 dark:bg-red-950/20' : ''
                }`}
              >
                {/* 1. Name */}
                <td className="px-3 py-2.5">
                  <Link
                    to={`/inventory/${r.material.id}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {r.material.name}
                  </Link>
                </td>

                {/* 2. Category */}
                <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">
                  {r.material.category}
                </td>

                {/* 3. Unit */}
                <td className="px-3 py-2.5 font-mono text-slate-700 dark:text-slate-300">
                  {r.material.unit}
                </td>

                {/* 4. Available Stock */}
                <td
                  className={`px-3 py-2.5 tabular-nums font-semibold ${
                    r.availableStock < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {formatNumber(r.availableStock, 1)} {r.material.unit}
                </td>

                {/* 5. Daily Use */}
                <td className="px-3 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">
                  {formatNumber(r.dailyUse, 1)} {r.dailyUseUnit}
                  {!r.isFromActivePlan && (
                    <span className="block text-[10px] text-slate-400">(no active plan)</span>
                  )}
                </td>

                {/* 6. Emergency Stock */}
                <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-400">
                  {formatNumber(r.emergencyStock, 1)} {r.material.unit}
                </td>

                {/* 7. Days to be Covered */}
                <td className="px-3 py-2.5 tabular-nums">
                  {r.daysCovered != null ? (
                    <span
                      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${
                        r.daysCovered < desiredDays
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}
                    >
                      {formatNumber(r.daysCovered, 1)} days
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>

                {/* 8. Reorder Quantity */}
                <td className="px-3 py-2.5 tabular-nums">
                  {r.reorderQuantity > 0 ? (
                    <span className="font-bold text-red-600 dark:text-red-400">
                      {formatNumber(r.reorderQuantity, 1)} {r.material.unit}
                    </span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      0 {r.material.unit}
                    </span>
                  )}
                </td>

                {/* 9. Stock Out Date */}
                <td className="px-3 py-2.5">
                  {r.isOutOfStock ? (
                    <span className="font-bold text-red-600 dark:text-red-400">
                      Today (Out of Stock)
                    </span>
                  ) : r.stockOutDate ? (
                    <span title="Estimated in calendar days based on current Daily Use">
                      {formatDate(r.stockOutDate)}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-3 py-2.5 text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-slate-400">
                  No materials found matching criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-400 italic">
        * Stock Out Date is calculated in calendar days from current stock and daily use. Reorder Quantity incorporates desired coverage ({desiredDays} days) plus Emergency Stock, floored at 0.
      </p>

      {/* ADD / EDIT MATERIAL MODAL (Part C) */}
      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={isNew ? 'Add Material' : 'Edit Material'}
        wide
      >
        <div className="space-y-4 text-sm">
          {/* Row 1: Name */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Material Name *
            </label>
            <input
              className="w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              placeholder="e.g. Pig Iron Foundry Grade"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          {/* Row 2: Category with Add/Edit/Remove */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Category *
              </label>
              <button
                type="button"
                className="text-xs text-brand hover:underline font-medium"
                onClick={() => setMasterModal('category')}
              >
                Manage Categories
              </button>
            </div>
            <select
              className="w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Row 3: Unit with Add/Edit/Remove */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Unit of Measurement *
              </label>
              <button
                type="button"
                className="text-xs text-brand hover:underline font-medium"
                onClick={() => setMasterModal('unit')}
              >
                Manage Units
              </button>
            </div>
            <select
              className="w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              value={form.unit}
              onChange={(e) => {
                const nextUnit = e.target.value
                setForm({
                  ...form,
                  unit: nextUnit,
                  // Keep daily consumption unit in sync by default (Part C)
                  dailyConsumptionUnit: nextUnit,
                })
              }}
            >
              {units.map((u) => (
                <option key={u.id} value={u.name}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {/* Row 4: Daily Consumption (Value + Unit) */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Base Daily Consumption
              </label>
              <input
                type="number"
                min={0}
                step="any"
                className="w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
                value={form.baseDailyConsumption || ''}
                placeholder="0"
                onChange={(e) =>
                  setForm({
                    ...form,
                    baseDailyConsumption: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Daily Consumption Unit
                </label>
                <button
                  type="button"
                  className="text-xs text-brand hover:underline font-medium"
                  onClick={() => setMasterModal('unit')}
                >
                  Manage Units
                </button>
              </div>
              <select
                className="w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
                value={form.dailyConsumptionUnit || form.unit}
                onChange={(e) =>
                  setForm({ ...form, dailyConsumptionUnit: e.target.value })
                }
              >
                {units.map((u) => (
                  <option key={u.id} value={u.name}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 5: Emergency Stock */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Emergency Stock ({form.unit})
            </label>
            <input
              type="number"
              min={0}
              step="any"
              className="w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              placeholder="0"
              value={form.emergencyStock ?? 0}
              onChange={(e) =>
                setForm({
                  ...form,
                  emergencyStock: parseFloat(e.target.value) || 0,
                })
              }
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              Safety stock buffer added to required stock during reorder planning.
            </span>
          </div>

          {/* Row 6: Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Notes
            </label>
            <textarea
              className="w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              rows={2}
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          {/* Direct Stock Level Correction (when editing existing material) */}
          {!isNew && balanceForm && (
            <div className="rounded border border-slate-200 p-3 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                Stock Levels ({form.unit})
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ['physicalStock', 'Physical stock'],
                  ['reserved', 'Reserved'],
                  ['awaitingInspection', 'Awaiting inspection'],
                ].map(([key, label]) => (
                  <label key={key} className="text-xs">
                    <span className="text-slate-500">{label}</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
                      value={balanceForm[key as keyof InventoryBalance] as number}
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
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button onClick={() => void saveMaterial()}>
              Save Material
            </Button>
          </div>
        </div>
      </Modal>

      {/* MASTER DATA MANAGEMENT MODAL (Categories / Units) */}
      {masterModal && (
        <MasterDataModal
          open={masterModal !== null}
          onClose={() => setMasterModal(null)}
          type={masterModal}
          items={masterModal === 'category' ? categories : units}
          onChanged={async () => {
            await load()
          }}
        />
      )}
    </div>
  )
}
