import { AlertTriangle, ArrowRight, PackagePlus, ShoppingCart } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardHeader } from '../components/shared/Card'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/shared/Button'
import { StockBadge } from '../components/shared/Badge'
import { useAppData } from '../contexts/AppDataContext'
import { listMaterialsComputed } from '../services/inventoryService'
import { db } from '../storage/database'
import type { MaterialComputed } from '../types/inventory'
import { formatNumber } from '../utils/formatting'
import { isPastDate } from '../utils/dates'

const STATUS_COLORS: Record<string, string> = {
  healthy: '#10b981',
  approaching_reorder: '#f59e0b',
  below_reorder: '#f97316',
  critical: '#ef4444',
  no_consumption: '#94a3b8',
}

export function DashboardPage() {
  const { settings, refresh } = useAppData()
  const [rows, setRows] = useState<MaterialComputed[]>([])
  const [poPending, setPoPending] = useState(0)

  useEffect(() => {
    void (async () => {
      setRows(await listMaterialsComputed())
      const pos = await db.purchaseOrders.toArray()
      setPoPending(
        pos.filter(
          (p) =>
            p.approvalStatus === 'pending' ||
            p.status === 'pending_approval' ||
            p.status === 'approved',
        ).length,
      )
    })()
  }, [settings.productionLevelPercent, settings.desiredCoverageDays])

  const attention = rows.filter(
    (r) => r.stockStatus !== 'healthy' && r.stockStatus !== 'no_consumption',
  )
  const critical = rows.filter((r) => r.stockStatus === 'critical')
  const belowReorder = rows.filter((r) => r.stockStatus === 'below_reorder')
  const inspection = rows.reduce((s, r) => s + r.balance.awaitingInspection, 0)

  const healthPie = Object.entries(
    rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.stockStatus] = (acc[r.stockStatus] ?? 0) + 1
      return acc
    }, {}),
  ).map(([name, value]) => ({ name, value }))

  const stockVsReorder = rows
    .filter((r) => r.effectiveDailyConsumption > 0)
    .slice(0, 8)
    .map((r) => ({
      name: r.material.name.length > 14 ? r.material.name.slice(0, 12) + '…' : r.material.name,
      available: r.availableStock,
      reorder: r.reorderPoint,
    }))

  const poStatusData = async () => {
    const pos = await db.purchaseOrders.toArray()
    const counts: Record<string, number> = {}
    for (const p of pos) counts[p.status] = (counts[p.status] ?? 0) + 1
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }

  const [poChart, setPoChart] = useState<{ name: string; value: number }[]>([])
  useEffect(() => {
    void poStatusData().then(setPoChart)
  }, [])

  const alerts = [
    ...critical.map((r) => ({
      id: r.material.id,
      severity: 'critical' as const,
      text: `${r.material.name} — critical shortage (${formatNumber(r.availableStock)} ${r.material.unit} available)`,
      link: `/inventory/${r.material.id}`,
    })),
    ...rows
      .filter(
        (r) =>
          r.latestSafeOrderDate &&
          (isPastDate(r.latestSafeOrderDate) || r.stockStatus === 'below_reorder'),
      )
      .slice(0, 5)
      .map((r) => ({
        id: `order-${r.material.id}`,
        severity: 'warning' as const,
        text: r.latestSafeOrderDate && isPastDate(r.latestSafeOrderDate)
          ? `${r.material.name} — order immediately (safe order date passed)`
          : `${r.material.name} — below reorder point`,
        link: `/inventory/${r.material.id}`,
      })),
  ].slice(0, 10)

  return (
    <div>
      <PageHeader
        title="Executive Dashboard"
        description="Overview of inventory health, shortages, and purchasing activity. Figures reflect demo/sample data until live records are imported."
        actions={
          <>
            <Button variant="secondary" onClick={() => void refresh()}>
              Refresh
            </Button>
            <Link to="/inventory?action=add">
              <Button>Add material</Button>
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { label: 'Tracked materials', value: rows.length },
          { label: 'Need attention', value: attention.length },
          { label: 'Critical shortages', value: critical.length },
          { label: 'Below reorder point', value: belowReorder.length },
          { label: 'POs awaiting action', value: poPending },
          { label: 'Qty awaiting inspection', value: formatNumber(inspection, 0) },
        ].map((kpi) => (
          <Card key={kpi.label} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{kpi.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{kpi.value}</p>
          </Card>
        ))}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Inventory health distribution" />
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
        <Card>
          <CardHeader title="Available stock vs reorder point" description="Top materials by consumption" />
          <div className="h-64 p-4">
            {stockVsReorder.length === 0 ? (
              <p className="text-sm text-slate-500">No consumption data.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stockVsReorder} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="available" fill="#2563eb" name="Available" />
                  <Bar dataKey="reorder" fill="#f59e0b" name="Reorder point" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Purchase order status" />
          <div className="h-56 p-4">
            {poChart.length === 0 ? (
              <p className="text-sm text-slate-500">No purchase orders yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={poChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#475569" name="Count" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Prioritized alerts"
            action={
              <Link to="/reports?report=low-stock" className="text-xs text-brand hover:underline">
                View reports
              </Link>
            }
          />
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {alerts.length === 0 ? (
              <li className="p-4 text-sm text-slate-500">No active alerts.</li>
            ) : (
              alerts.map((a) => (
                <li key={a.id} className="flex items-start gap-2 px-4 py-3 text-sm">
                  <AlertTriangle
                    className={`mt-0.5 h-4 w-4 shrink-0 ${a.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`}
                  />
                  <Link to={a.link} className="flex-1 hover:text-brand">
                    {a.text}
                  </Link>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="Quick actions" />
        <div className="flex flex-wrap gap-2 p-4">
          <Link to="/movements?type=goods_receipt"><Button variant="secondary"><PackagePlus className="h-4 w-4" /> Goods receipt</Button></Link>
          <Link to="/movements?type=issue_to_production"><Button variant="secondary">Issue to production</Button></Link>
          <Link to="/purchase-orders"><Button variant="secondary"><ShoppingCart className="h-4 w-4" /> Import PO (PDF)</Button></Link>
          <Link to="/movements?type=stock_adjustment"><Button variant="secondary">Stock adjustment</Button></Link>
          <Link to="/settings"><Button variant="secondary">Export / backup</Button></Link>
        </div>
      </Card>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Materials requiring attention</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-3 py-2">Material</th>
                <th className="px-3 py-2">Available</th>
                <th className="px-3 py-2">Days cover</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {attention.slice(0, 8).map((r) => (
                <tr key={r.material.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2">
                    <Link to={`/inventory/${r.material.id}`} className="font-medium text-brand hover:underline">
                      {r.material.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatNumber(r.availableStock)} {r.material.unit}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.daysOfCover != null ? formatNumber(r.daysOfCover, 1) : '—'}
                  </td>
                  <td className="px-3 py-2"><StockBadge status={r.stockStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
