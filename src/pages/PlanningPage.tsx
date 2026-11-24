import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  Layers,
  MessageSquare,
  PackageCheck,
  TrendingUp,
  Upload,
} from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card, CardHeader } from '../components/shared/Card'
import { Button } from '../components/shared/Button'
import { useToast } from '../contexts/ToastContext'
import { db } from '../storage/database'
import type { Material, Supplier } from '../types/inventory'
import type { PurchaseOrder } from '../types/purchasing'
import type { MaterialConsumptionRate } from '../types/productionPlanning'
import {
  aggregateCustomerOrders,
  calculateDailyRawMaterialRequirement,
  calculateStockCoverage,
  evaluateDeadlineRisks,
  type CustomerOrdersSummary,
  type StockCoverageResult,
  type DeadlineRiskItem,
} from '../lib/productionPlanning'
import {
  getActiveProductionPlan,
  saveProductionPlan,
  listMaterialConsumptionRates,
} from '../services/productionPlanService'
import { listMaterialsComputed } from '../services/inventoryService'
import { formatNumber } from '../utils/formatting'
import {
  VendorRequirementMessageModal,
  type VendorRequirementDetails,
} from '../components/planning/VendorRequirementMessageModal'
import { ReceiveMaterialModal } from '../components/planning/ReceiveMaterialModal'
import { RecordConsumptionModal } from '../components/planning/RecordConsumptionModal'
import { UnitQuickEditModal } from '../components/shared/UnitQuickEditModal'
import { Edit2 } from 'lucide-react'

export function PlanningPage() {
  const { toast } = useToast()

  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [balances, setBalances] = useState<Map<string, number>>(new Map())
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [rates, setRates] = useState<MaterialConsumptionRate[]>([])

  // Plan state
  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), [])
  const [planMonth, setPlanMonth] = useState(currentMonthStr)
  const [maxCapacityTonnes, setMaxCapacityTonnes] = useState(90)
  const [targetTonnes, setTargetTonnes] = useState(60)
  const [workingDays, setWorkingDays] = useState(25)
  const [desiredInventoryDays, setDesiredInventoryDays] = useState(7)
  const [activePlanId, setActivePlanId] = useState<string | undefined>(undefined)

  // Modals
  const [vendorMsgModalOpen, setVendorMsgModalOpen] = useState(false)
  const [activeRequirement, setActiveRequirement] = useState<VendorRequirementDetails | null>(null)
  const [receiveModalOpen, setReceiveModalOpen] = useState(false)
  const [consumptionModalOpen, setConsumptionModalOpen] = useState(false)
  const [unitEditMaterial, setUnitEditMaterial] = useState<{ id: string; name: string; unit: string } | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [pos, matsComputed, sups, savedRates, plan] = await Promise.all([
        db.purchaseOrders.toArray(),
        listMaterialsComputed(),
        db.suppliers.toArray(),
        listMaterialConsumptionRates(),
        getActiveProductionPlan(planMonth),
      ])

      setOrders(pos)
      setMaterials(matsComputed.map((m) => m.material))
      setBalances(new Map(matsComputed.map((m) => [m.material.id, m.availableStock])))
      setSuppliers(sups)
      setRates(savedRates)

      if (plan) {
        setActivePlanId(plan.id)
        setMaxCapacityTonnes(plan.maxCapacityTonnes)
        setTargetTonnes(plan.targetTonnes)
        setWorkingDays(plan.workingDays)
        setDesiredInventoryDays(plan.desiredInventoryDays)
      } else {
        // Defaults if no plan exists for this month
        setActivePlanId(undefined)
        setMaxCapacityTonnes(90)
        setTargetTonnes(60)
        setWorkingDays(25)
        setDesiredInventoryDays(7)
      }
    } catch (err) {
      console.error(err)
      toast('Failed to load production planning data.', 'error')
    }
  }, [planMonth, toast])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Save / Update plan
  const handleSavePlan = async () => {
    if (targetTonnes > maxCapacityTonnes) {
      toast('Selected monthly target cannot exceed maximum monthly capacity.', 'error')
      return
    }
    if (targetTonnes < 0 || maxCapacityTonnes <= 0) {
      toast('Target must be >= 0 and capacity must be > 0.', 'error')
      return
    }
    if (workingDays <= 0) {
      toast('Working days must be greater than 0.', 'error')
      return
    }

    try {
      const saved = await saveProductionPlan({
        id: activePlanId,
        month: planMonth,
        maxCapacityTonnes,
        targetTonnes,
        workingDays,
        desiredInventoryDays,
      })
      setActivePlanId(saved.id)
      toast('Production plan updated successfully!', 'success')
    } catch (err) {
      console.error(err)
      toast(err instanceof Error ? err.message : 'Failed to save plan.', 'error')
    }
  }

  // 1. Customer PO Aggregation (Step 1)
  const ordersSummary: CustomerOrdersSummary = useMemo(() => {
    return aggregateCustomerOrders(orders)
  }, [orders])

  // 2. Calculations: Daily production and rate mapping (Step 3 & 4)
  const dailyProductionKg = useMemo(() => {
    if (workingDays <= 0 || targetTonnes <= 0) return 0
    return (targetTonnes * 1000) / workingDays
  }, [targetTonnes, workingDays])

  // Per-material planning rows
  interface MaterialPlanningRow {
    material: Material
    consumptionRate: number
    hasCustomRate: boolean
    dailyRawRequirementKg: number
    plannedDailyRequirementKg: number // with 10% allowance
    availableStockKg: number
    coverageResult: StockCoverageResult
  }

  const materialRows: MaterialPlanningRow[] = useMemo(() => {
    return materials.map((mat) => {
      // Find consumption rate
      const rateRecord = rates.find((r) => r.materialId === mat.id)
      // If no rate saved, default to 0.05 kg/kg (or proportional foundry estimate)
      const consumptionRate = rateRecord ? rateRecord.rateKgPerKgCasting : 0.05
      const hasCustomRate = Boolean(rateRecord)

      const dailyCalc = calculateDailyRawMaterialRequirement({
        targetTonnes,
        workingDays,
        consumptionRateKgPerKgCasting: consumptionRate,
      })

      const availableStockKg = balances.get(mat.id) ?? 0

      const coverageResult = calculateStockCoverage({
        availableStockKg,
        plannedDailyRequirementKg: dailyCalc.plannedDailyRequirementKg,
        desiredInventoryDays,
        emergencyStockKg: mat.emergencyStock ?? 0,
        unit: mat.unit,
      })

      return {
        material: mat,
        consumptionRate,
        hasCustomRate,
        dailyRawRequirementKg: dailyCalc.dailyRawMaterialRequirementKg,
        plannedDailyRequirementKg: dailyCalc.plannedDailyRequirementKg,
        availableStockKg,
        coverageResult,
      }
    })
  }, [materials, rates, targetTonnes, workingDays, balances, desiredInventoryDays])

  // 3. Deadline risk assessment (Step 2)
  const deadlineRisks: DeadlineRiskItem[] = useMemo(() => {
    return evaluateDeadlineRisks(ordersSummary.items, dailyProductionKg)
  }, [ordersSummary.items, dailyProductionKg])

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Foundry Production & Inventory Planning"
        description="Connect customer casting orders to management's monthly target, daily raw material requirements, and purchasing needs."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setReceiveModalOpen(true)}>
              <Upload className="h-4 w-4 mr-1.5" /> Receive Material (Bill)
            </Button>
            <Button variant="secondary" onClick={() => setConsumptionModalOpen(true)}>
              <PackageCheck className="h-4 w-4 mr-1.5" /> Issue to Production
            </Button>
          </div>
        }
      />

      {/* 3 DISTINCT NUMBERS + WORKING DAYS */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Production Plan Parameters ({planMonth})
            </h2>
            <p className="text-xs text-slate-500">
              The selected target (not capacity or total pending) is the direct basis for raw material calculations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500">Plan Month:</label>
            <input
              type="month"
              className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
              value={planMonth}
              onChange={(e) => setPlanMonth(e.target.value)}
            />
            <Button size="sm" onClick={() => void handleSavePlan()}>
              Save Plan
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Card 1: Pending Orders */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Pending Orders
              </span>
              <Layers className="h-4 w-4 text-brand" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {formatNumber(ordersSummary.totalPendingTonnes, 2)} tonnes
            </div>
            <div className="mt-1 text-xs text-slate-500">
              ({formatNumber(ordersSummary.totalPendingKg, 0)} kg total casting required)
            </div>
          </div>

          {/* Card 2: Maximum Monthly Capacity */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Max Monthly Capacity
              </span>
              <TrendingUp className="h-4 w-4 text-slate-400" />
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <input
                type="number"
                min="1"
                className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-xl font-bold dark:border-slate-700 dark:bg-slate-800"
                value={maxCapacityTonnes}
                onChange={(e) => setMaxCapacityTonnes(parseFloat(e.target.value) || 0)}
              />
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">tonnes/mo</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">Maximum factory production ceiling</div>
          </div>

          {/* Card 3: Selected Monthly Target (Highlighted) */}
          <div className="rounded-lg border-2 border-brand/40 bg-brand-muted/10 p-4 dark:bg-brand-muted/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-brand">
                Selected Monthly Target
              </span>
              <CheckCircle className="h-4 w-4 text-brand" />
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <input
                type="number"
                min="0"
                max={maxCapacityTonnes}
                className="w-24 rounded border border-brand bg-white px-2 py-1 text-xl font-bold text-slate-900 dark:border-brand dark:bg-slate-800 dark:text-white"
                value={targetTonnes}
                onChange={(e) => setTargetTonnes(parseFloat(e.target.value) || 0)}
              />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">tonnes</span>
            </div>
            <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Quantity management plans to cast this month
            </div>
          </div>

          {/* Card 4: Working Days & Planned Daily Casting */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Daily Casting Output
              </span>
              <Calendar className="h-4 w-4 text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {formatNumber(dailyProductionKg, 0)} kg/day
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <span>Working Days:</span>
              <input
                type="number"
                min="1"
                max="31"
                className="w-14 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800"
                value={workingDays}
                onChange={(e) => setWorkingDays(parseInt(e.target.value, 10) || 1)}
              />
              <span>days</span>
            </div>
          </div>
        </div>

        {/* Desired inventory days control */}
        <div className="mt-4 flex flex-wrap items-center justify-between rounded-lg bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-brand" />
            <span>
              <strong>Desired Raw Material Inventory Period:</strong> Factory maintains stock to cover
            </span>
            <input
              type="number"
              min="1"
              max="60"
              className="w-14 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-bold dark:border-slate-600 dark:bg-slate-900"
              value={desiredInventoryDays}
              onChange={(e) => setDesiredInventoryDays(parseInt(e.target.value, 10) || 1)}
            />
            <span>working days of planned production.</span>
          </div>
          <span className="text-[11px] text-slate-500 italic">
            Default 7 working days. Changes recalculate required stock and purchase needs.
          </span>
        </div>
      </Card>

      {/* DEADLINE RISKS (Step 2) */}
      {deadlineRisks.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-semibold text-sm mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>Order Deadline Risk Alert ({deadlineRisks.length} orders at risk)</span>
          </div>
          <p className="text-xs text-amber-800 dark:text-amber-300 mb-3">
            At the current selected target of {targetTonnes} tonnes/month ({formatNumber(dailyProductionKg, 0)} kg/day), the following customer delivery commitments will not be fulfilled on time:
          </p>
          <div className="space-y-1.5">
            {deadlineRisks.map((risk, idx) => (
              <div
                key={idx}
                className="flex flex-wrap items-center justify-between rounded bg-white px-3 py-2 text-xs shadow-xs dark:bg-slate-900"
              >
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white">{risk.customerName}</span>{' '}
                  <span className="text-slate-500">({risk.poNumber})</span> — {risk.description || 'Casting order'}
                </div>
                <div className="flex items-center gap-3 text-right">
                  <span className="text-slate-600 dark:text-slate-400">
                    Pending: <strong>{formatNumber(risk.pendingWeightKg, 0)} kg</strong>
                  </span>
                  <span className="text-slate-600 dark:text-slate-400">
                    Due: <strong>{risk.deliveryDeadline}</strong>
                  </span>
                  <span className="rounded bg-red-100 px-2 py-0.5 font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                    At risk — will miss deadline by {risk.daysShort} days
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* STEP 4 & 5: RAW MATERIAL REQUIREMENTS, COVERAGE & VENDOR MESSAGES (PART B: EXACT 7 COLUMNS) */}
      <Card>
        <CardHeader
          title="Raw Material Requirements, Coverage & Purchasing"
          description="Calculated from selected monthly target. Includes a 10% planning allowance for furnace melting margin."
        />

        <div className="overflow-x-auto p-4">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-3 py-2.5">1. Material Name</th>
                <th className="px-3 py-2.5">2. Availability</th>
                <th className="px-3 py-2.5">3. Daily Usage</th>
                <th className="px-3 py-2.5">4. Stock Coverage</th>
                <th className="px-3 py-2.5">5. Required Stock</th>
                <th className="px-3 py-2.5">6. Purchase Required</th>
                <th className="px-3 py-2.5 text-right">7. Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {materialRows.map((row) => {
                const isShortage = row.coverageResult.purchaseRequirementKg > 0
                return (
                  <tr key={row.material.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                    {/* 1. Material Name */}
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {row.material.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {row.material.category}
                      </div>
                    </td>

                    {/* 2. Availability */}
                    <td
                      className={`px-3 py-2.5 tabular-nums font-semibold ${
                        row.availableStockKg < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {formatNumber(row.availableStockKg, 1)} {row.material.unit}
                    </td>

                    {/* 3. Daily Usage */}
                    <td className="px-3 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <span>
                          {formatNumber(row.plannedDailyRequirementKg, 1)} {row.material.unit}/day
                        </span>
                        <button
                          type="button"
                          className="p-0.5 text-slate-400 hover:text-brand"
                          title={`Change unit (${row.material.unit})`}
                          onClick={() =>
                            setUnitEditMaterial({
                              id: row.material.id,
                              name: row.material.name,
                              unit: row.material.unit,
                            })
                          }
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>

                    {/* 4. Stock Coverage */}
                    <td className="px-3 py-2.5 tabular-nums">
                      {row.coverageResult.estimatedStockCoverageDays != null ? (
                        <span
                          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${
                            row.coverageResult.estimatedStockCoverageDays < desiredInventoryDays
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}
                        >
                          {row.coverageResult.estimatedStockCoverageDays} days
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>

                    {/* 5. Required Stock */}
                    <td className="px-3 py-2.5 tabular-nums text-slate-700 dark:text-slate-300">
                      {formatNumber(row.coverageResult.requiredStockKg, 1)} {row.material.unit}
                    </td>

                    {/* 6. Purchase Required */}
                    <td className="px-3 py-2.5 tabular-nums">
                      {isShortage ? (
                        <span className="font-bold text-red-600 dark:text-red-400">
                          {formatNumber(row.coverageResult.purchaseRequirementKg, 1)} {row.material.unit}
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          0 {row.material.unit}
                        </span>
                      )}
                    </td>

                    {/* 7. Action */}
                    <td className="px-3 py-2.5 text-right">
                      {isShortage ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setActiveRequirement({
                              materialId: row.material.id,
                              materialName: row.material.name,
                              specification: row.material.category,
                              quantityKg: row.coverageResult.purchaseRequirementKg,
                              unit: row.material.unit,
                              desiredInventoryDays,
                            })
                            setVendorMsgModalOpen(true)
                          }}
                        >
                          <MessageSquare className="h-3.5 w-3.5 mr-1" /> Generate Message
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">Stock ok</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Sentence pattern statement for materials */}
        <div className="border-t border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">
            Stock Coverage Summaries (Estimates based on selected production plan):
          </p>
          <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
            {materialRows
              .filter((r) => r.plannedDailyRequirementKg > 0)
              .map((r) => (
                <li key={r.material.id} className="flex items-start gap-1.5">
                  <span className="text-slate-400">•</span>
                  <span>
                    <strong>{r.material.name}:</strong> {r.coverageResult.statementText}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      </Card>

      {/* MODALS */}
      <VendorRequirementMessageModal
        open={vendorMsgModalOpen}
        onClose={() => setVendorMsgModalOpen(false)}
        suppliers={suppliers}
        requirement={activeRequirement}
      />

      <ReceiveMaterialModal
        open={receiveModalOpen}
        onClose={() => setReceiveModalOpen(false)}
        materials={materials}
        suppliers={suppliers}
        onReceiptCompleted={() => void loadData()}
      />

      <RecordConsumptionModal
        open={consumptionModalOpen}
        onClose={() => setConsumptionModalOpen(false)}
        materials={materials}
        onConsumptionRecorded={() => void loadData()}
      />

      {unitEditMaterial && (
        <UnitQuickEditModal
          open={Boolean(unitEditMaterial)}
          onClose={() => setUnitEditMaterial(null)}
          materialId={unitEditMaterial.id}
          materialName={unitEditMaterial.name}
          currentUnit={unitEditMaterial.unit}
          onUpdated={async () => {
            await loadData()
          }}
        />
      )}
    </div>
  )
}
