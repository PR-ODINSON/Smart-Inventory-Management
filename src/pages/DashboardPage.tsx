import {
  ArrowRight,
  PackageCheck,
  TrendingUp,
  Upload,
  CalendarDays,
  CheckCircle2,
  Trash2,
} from 'lucide-react'
import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { Card, CardHeader } from '../components/shared/Card'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/shared/Button'
import { useAppData } from '../contexts/AppDataContext'
import { useToast } from '../contexts/ToastContext'
import { listMaterialsComputed } from '../services/inventoryService'
import { db } from '../storage/database'
import type { Material, MaterialComputed, Supplier } from '../types/inventory'
import type { PurchaseOrder } from '../types/purchasing'
import type { MaterialReceipt, ProductionPlan } from '../types/productionPlanning'
import { formatNumber } from '../utils/formatting'
import {
  aggregateCustomerOrders,
  calculateDailyRawMaterialRequirement,
  calculateStockCoverage,
  evaluateDeadlineRisks,
  type CustomerOrdersSummary,
} from '../lib/productionPlanning'
import {
  deleteMaterialReceipt,
  getActiveProductionPlan,
  listMaterialConsumptionRates,
  listMaterialReceipts,
} from '../services/productionPlanService'
import { ReceiveMaterialModal } from '../components/planning/ReceiveMaterialModal'
import { RecordConsumptionModal } from '../components/planning/RecordConsumptionModal'
import { UnitQuickEditModal } from '../components/shared/UnitQuickEditModal'
import { Modal } from '../components/shared/Modal'
import { Edit2 } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  healthy: '#10b981',
  approaching_reorder: '#f59e0b',
  below_reorder: '#f97316',
  critical: '#ef4444',
  no_consumption: '#94a3b8',
}

interface RawMaterialSummaryRow {
  material: Material
  availableStock: number
  plannedDailyReqKg: number
  coverageDays: number | null
  desiredDays: number
  requiredStockKg: number
  toPurchaseKg: number
  status: 'critical' | 'shortage' | 'sufficient' | 'no_consumption'
}

export function DashboardPage() {
  const { settings, refresh } = useAppData()
  const { toast } = useToast()

  const [rows, setRows] = useState<MaterialComputed[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [plan, setPlan] = useState<ProductionPlan | null>(null)
  const [receipts, setReceipts] = useState<MaterialReceipt[]>([])
  const [ratesMap, setRatesMap] = useState<Map<string, number>>(new Map())

  // Modal controls
  const [receiveModalOpen, setReceiveModalOpen] = useState(false)
  const [consumptionModalOpen, setConsumptionModalOpen] = useState(false)
  const [unitEditMaterial, setUnitEditMaterial] = useState<{ id: string; name: string; unit: string } | null>(null)
  const [receiptToDelete, setReceiptToDelete] = useState<MaterialReceipt | null>(null)
  const [isDeletingReceipt, setIsDeletingReceipt] = useState(false)

  const loadData = async () => {
    const [computedList, pos, activePlan, sups, recentReceipts, allRates] = await Promise.all([
      listMaterialsComputed(),
      db.purchaseOrders.toArray(),
      getActiveProductionPlan(),
      db.suppliers.toArray(),
      listMaterialReceipts(),
      listMaterialConsumptionRates(),
    ])

    setRows(computedList)
    setOrders(pos)
    setPlan(activePlan)
    setSuppliers(sups)
    setReceipts(recentReceipts.slice(0, 5))

    const rMap = new Map<string, number>()
    for (const r of allRates) {
      if (!rMap.has(r.materialId)) rMap.set(r.materialId, r.rateKgPerKgCasting)
    }
    setRatesMap(rMap)
  }

  useEffect(() => {
    void loadData()
  }, [settings.productionLevelPercent, settings.desiredCoverageDays])

  // Step 1: Customer PO Aggregation
  const customerOrdersSummary: CustomerOrdersSummary = useMemo(() => {
    return aggregateCustomerOrders(orders)
  }, [orders])

  // Step 2 & 3: Production Plan parameters
  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), [])
  const maxCapacityTonnes = plan?.maxCapacityTonnes ?? 90
  const selectedTargetTonnes = plan?.targetTonnes ?? 60
  const plannedWorkingDays = plan?.workingDays ?? 25
  const desiredDays = plan?.desiredInventoryDays ?? 7

  const dailyProductionKg = useMemo(() => {
    if (plannedWorkingDays <= 0 || selectedTargetTonnes <= 0) return 0
    return (selectedTargetTonnes * 1000) / plannedWorkingDays
  }, [selectedTargetTonnes, plannedWorkingDays])

  // Deadline risks
  const deadlineRisks = useMemo(() => {
    return evaluateDeadlineRisks(customerOrdersSummary.items, dailyProductionKg)
  }, [customerOrdersSummary.items, dailyProductionKg])

  // Raw Material Overview calculation
  const rawMaterialOverview: RawMaterialSummaryRow[] = useMemo(() => {
    return rows.map((r) => {
      const consumptionRate = ratesMap.get(r.material.id) ?? 0.05
      const dailyCalc = calculateDailyRawMaterialRequirement({
        targetTonnes: selectedTargetTonnes,
        workingDays: plannedWorkingDays,
        consumptionRateKgPerKgCasting: consumptionRate,
      })

      const coverage = calculateStockCoverage({
        availableStockKg: r.availableStock,
        plannedDailyRequirementKg: dailyCalc.plannedDailyRequirementKg,
        desiredInventoryDays: desiredDays,
        emergencyStockKg: r.material.emergencyStock ?? 0,
        unit: r.material.unit,
      })

      let status: RawMaterialSummaryRow['status'] = 'sufficient'
      if (coverage.plannedDailyRequirementKg <= 0) {
        status = 'no_consumption'
      } else if (coverage.availableStockKg <= 0) {
        status = 'critical'
      } else if (coverage.estimatedStockCoverageDays! < desiredDays) {
        status = 'shortage'
      }

      return {
        material: r.material,
        availableStock: r.availableStock,
        plannedDailyReqKg: dailyCalc.plannedDailyRequirementKg,
        coverageDays: coverage.estimatedStockCoverageDays,
        desiredDays,
        requiredStockKg: coverage.requiredStockKg,
        toPurchaseKg: coverage.purchaseRequirementKg,
        status,
      }
    })
  }, [rows, ratesMap, selectedTargetTonnes, plannedWorkingDays, desiredDays])

  // Sorted shortages: worst coverage first
  const shortageAlerts = useMemo(() => {
    return rawMaterialOverview
      .filter((m) => m.status === 'critical' || m.status === 'shortage')
      .sort((a, b) => (a.coverageDays ?? 0) - (b.coverageDays ?? 0))
  }, [rawMaterialOverview])

  const healthPie = Object.entries(
    rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.stockStatus] = (acc[r.stockStatus] ?? 0) + 1
      return acc
    }, {}),
  ).map(([name, value]) => ({ name, value }))

  const handleDeleteReceiptConfirm = async () => {
    if (!receiptToDelete) return
    setIsDeletingReceipt(true)
    try {
      await deleteMaterialReceipt(receiptToDelete.id)
      toast(`Receipt for ${receiptToDelete.supplierName} deleted and stock reversed.`, 'success')
      setReceiptToDelete(null)
      await refresh()
      await loadData()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete receipt.', 'error')
    } finally {
      setIsDeletingReceipt(false)
    }
  }

  const materialNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows) {
      map.set(r.material.id, r.material.name)
    }
    return map
  }, [rows])

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Foundry Executive Dashboard"
        description="Unified management view connecting customer casting orders, production targets, raw material stock coverage, and shortage alerts."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void refresh().then(loadData)}>
              Refresh
            </Button>
            <Button variant="secondary" onClick={() => setReceiveModalOpen(true)}>
              <Upload className="h-4 w-4 mr-1.5" /> Receive Material
            </Button>
            <Button variant="secondary" onClick={() => setConsumptionModalOpen(true)}>
              <PackageCheck className="h-4 w-4 mr-1.5" /> Issue to Production
            </Button>
            <Link to="/planning">
              <Button>
                <CalendarDays className="h-4 w-4 mr-1.5" /> Production Planning
              </Button>
            </Link>
          </div>
        }
      />

      {/* SECTION 1: PRODUCTION OVERVIEW */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-brand" /> Production Overview ({plan?.month || currentMonthStr})
            </h2>
            <p className="text-xs text-slate-500">
              Casting demand vs management&apos;s planned production run.
            </p>
          </div>
          <Link
            to="/planning"
            className="text-xs font-medium text-brand hover:underline flex items-center gap-1"
          >
            Adjust Target & Working Days <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {/* 1. Pending Customer Orders */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Pending Orders
            </span>
            <div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
              {formatNumber(customerOrdersSummary.totalPendingTonnes, 2)} tonnes
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              {formatNumber(customerOrdersSummary.totalPendingKg, 0)} kg casting backlog
            </div>
          </div>

          {/* 2. Order Deadlines / At-risk */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Deadline Risk Status
            </span>
            <div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
              {deadlineRisks.length > 0 ? (
                <span className="text-amber-600 dark:text-amber-400">
                  {deadlineRisks.length} At Risk
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" /> On Schedule
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              {deadlineRisks.length > 0
                ? 'Target may miss delivery dates'
                : 'All orders meet deadlines'}
            </div>
          </div>

          {/* 3. Max Monthly Capacity */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Max Monthly Capacity
            </span>
            <div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
              {formatNumber(maxCapacityTonnes, 1)} tonnes/mo
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">Foundry furnace ceiling</div>
          </div>

          {/* 4. Selected Monthly Target */}
          <div className="rounded-lg border-2 border-brand/50 bg-brand-muted/10 p-3.5 dark:bg-brand-muted/5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-brand">
              Selected Target
            </span>
            <div className="mt-1 text-xl font-bold text-brand">
              {formatNumber(selectedTargetTonnes, 1)} tonnes
            </div>
            <div className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
              Planned for this month
            </div>
          </div>

          {/* 5. Planned Daily Production */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Daily Casting Output
            </span>
            <div className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
              {formatNumber(dailyProductionKg, 0)} kg/day
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              Over {plannedWorkingDays} planned working days
            </div>
          </div>
        </div>
      </Card>

      {/* SECTION 2: RAW MATERIAL SHORTAGES & RECENT RECEIPTS */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Shortage Alerts (Worst first) */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Raw Material Shortage Alerts"
            description={`Materials with stock coverage below desired inventory (${desiredDays} working days), sorted worst first.`}
            action={
              <Link to="/planning" className="text-xs text-brand hover:underline">
                View Planning & Purchase Table
              </Link>
            }
          />

          <div className="overflow-x-auto p-4">
            {shortageAlerts.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-4 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                All raw materials have sufficient stock coverage to maintain the desired {desiredDays} working days of inventory!
              </div>
            ) : (
              <table className="min-w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900">
                  <tr>
                    <th className="px-3 py-2">Material</th>
                    <th className="px-3 py-2">Current Stock</th>
                    <th className="px-3 py-2">Daily Need (+10%)</th>
                    <th className="px-3 py-2">Coverage</th>
                    <th className="px-3 py-2">Additional to Purchase</th>
                    <th className="px-3 py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {shortageAlerts.map((item) => (
                    <tr key={item.material.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">
                        {item.material.name}
                      </td>
                      <td
                        className={`px-3 py-2.5 tabular-nums ${
                          item.availableStock < 0
                            ? 'font-semibold text-red-600 dark:text-red-400'
                            : ''
                        }`}
                      >
                        {formatNumber(item.availableStock, 1)} {item.material.unit}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <span>
                            {formatNumber(item.plannedDailyReqKg, 1)} {item.material.unit}/day
                          </span>
                          <button
                            type="button"
                            className="p-0.5 text-slate-400 hover:text-brand"
                            title={`Change unit (${item.material.unit})`}
                            onClick={() =>
                              setUnitEditMaterial({
                                id: item.material.id,
                                name: item.material.name,
                                unit: item.material.unit,
                              })
                            }
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">
                        <span
                          className={`font-semibold ${
                            item.coverageDays != null && item.coverageDays <= 0
                              ? 'text-red-600 dark:text-red-400 font-bold'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {item.coverageDays != null ? `${Math.max(0, item.coverageDays)} days` : '0 days'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums font-bold text-red-600 dark:text-red-400">
                        {formatNumber(item.toPurchaseKg, 1)} {item.material.unit}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {item.coverageDays != null && item.coverageDays <= 0 ? (
                          <span className="rounded bg-red-100 px-2 py-0.5 font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                            Critical Out of Stock
                          </span>
                        ) : (
                          <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            Shortage ({item.coverageDays}d &lt; {desiredDays}d)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {/* Recent Material Receipts */}
        <Card>
          <CardHeader
            title="Recent Material Receipts"
            description="Verified deliveries added to stock"
            action={
              <Button size="sm" variant="secondary" onClick={() => setReceiveModalOpen(true)}>
                + Receive
              </Button>
            }
          />
          <div className="p-4">
            {receipts.length === 0 ? (
              <p className="text-xs text-slate-500">No raw material receipts uploaded yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {receipts.map((rcp) => (
                  <li key={rcp.id} className="py-2.5">
                    <div className="flex items-center justify-between font-medium">
                      <span>{rcp.supplierName}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          +{rcp.receivedQty} {rcp.unit}
                        </span>
                        <button
                          type="button"
                          className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          title="Delete receipt and reverse stock"
                          onClick={() => setReceiptToDelete(rcp)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-slate-500 text-[11px] mt-0.5">
                      <span>
                        {materialNameById.get(rcp.materialId) ?? 'Raw material'} · Inv #{rcp.invoiceNumber}
                      </span>
                      <span>{new Date(rcp.receivedAt).toLocaleDateString()}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {/* SECTION 3: HEALTH */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Inventory Health Distribution" />
          <div className="h-64 p-4">
            {healthPie.length === 0 ? (
              <p className="text-sm text-slate-500">No materials to display.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={healthPie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                    {healthPie.map((entry) => (
                      <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? '#64748b'} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* MODALS */}
      <ReceiveMaterialModal
        open={receiveModalOpen}
        onClose={() => setReceiveModalOpen(false)}
        materials={rows.map((r) => r.material)}
        suppliers={suppliers}
        onReceiptCompleted={() => void loadData()}
      />

      <RecordConsumptionModal
        open={consumptionModalOpen}
        onClose={() => setConsumptionModalOpen(false)}
        materials={rows.map((r) => r.material)}
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
            await refresh()
            await loadData()
          }}
        />
      )}

      {receiptToDelete && (
        <Modal
          open={Boolean(receiptToDelete)}
          title="Delete Material Receipt"
          onClose={() => !isDeletingReceipt && setReceiptToDelete(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Are you sure you want to delete this received material entry? Deleting this receipt will
              deduct <span className="font-semibold text-slate-900 dark:text-white">{receiptToDelete.receivedQty} {receiptToDelete.unit}</span> from current inventory stock.
            </p>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Material:</span>
                <span className="font-medium text-slate-900 dark:text-white">
                  {materialNameById.get(receiptToDelete.materialId) ?? receiptToDelete.materialId}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Supplier:</span>
                <span className="font-medium text-slate-900 dark:text-white">{receiptToDelete.supplierName}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Invoice:</span>
                <span className="font-medium text-slate-900 dark:text-white">#{receiptToDelete.invoiceNumber}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Received Qty:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {receiptToDelete.receivedQty} {receiptToDelete.unit}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Received Date:</span>
                <span className="text-slate-700 dark:text-slate-300">
                  {new Date(receiptToDelete.receivedAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-red-50 p-3 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">
              <strong>Warning:</strong> This will remove {receiptToDelete.receivedQty} {receiptToDelete.unit} from stock. Stock may go negative. This cannot be undone.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                disabled={isDeletingReceipt}
                onClick={() => setReceiptToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                className="bg-red-600 text-white hover:bg-red-700"
                disabled={isDeletingReceipt}
                onClick={() => void handleDeleteReceiptConfirm()}
              >
                {isDeletingReceipt ? 'Deleting…' : 'Delete Receipt'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
