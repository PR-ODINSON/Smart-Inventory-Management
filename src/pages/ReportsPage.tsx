import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Card, CardHeader } from '../components/shared/Card'
import { Button } from '../components/shared/Button'
import { listMaterialsComputed } from '../services/inventoryService'
import { materialsToCsv, downloadTextFile } from '../services/importExportService'
import { db } from '../storage/database'
import type { MaterialComputed } from '../types/inventory'
import { formatNumber } from '../utils/formatting'
const REPORTS = [
  { id: 'current', name: 'Current inventory' },
  { id: 'low-stock', name: 'Low stock' },
  { id: 'critical', name: 'Critical shortage' },
  { id: 'reorder', name: 'Reorder recommendations' },
  { id: 'movements', name: 'Stock movements' },
  { id: 'locations', name: 'Location-wise inventory' },
  { id: 'purchase', name: 'Purchase orders' },
  { id: 'inspection', name: 'Inspection pending' },
]

export function ReportsPage() {
  const [rows, setRows] = useState<MaterialComputed[]>([])
  const [report, setReport] = useState('current')
  const [params] = useSearchParams()

  useEffect(() => {
    void listMaterialsComputed().then(setRows)
  }, [])

  useEffect(() => {
    const r = params.get('report')
    if (r) setReport(r)
  }, [params])

  const filtered = useMemo(() => {
    switch (report) {
      case 'low-stock':
        return rows.filter((r) => r.stockStatus === 'approaching_reorder' || r.stockStatus === 'below_reorder')
      case 'critical':
        return rows.filter((r) => r.stockStatus === 'critical')
      case 'reorder':
        return rows.filter((r) => r.recommendedOrderQty > 0)
      case 'inspection':
        return rows.filter((r) => r.balance.awaitingInspection > 0)
      default:
        return rows
    }
  }, [rows, report])

  const exportReport = () => {
    if (report === 'movements' || report === 'purchase' || report === 'locations') {
      void (async () => {
        if (report === 'movements') {
          const m = await db.movements.toArray()
          downloadTextFile('movements.csv', 'id,materialId,type,quantity,timestamp\n' + m.map((x) => `${x.id},${x.materialId},${x.type},${x.quantity},${x.timestamp}`).join('\n'), 'text/csv')
        } else if (report === 'purchase') {
          const p = await db.purchaseOrders.toArray()
          downloadTextFile('purchase-orders.csv', 'poNumber,status,lines\n' + p.map((x) => `${x.poNumber},${x.status},${x.lines.length}`).join('\n'), 'text/csv')
        } else {
          const lb = await db.locationBalances.toArray()
          downloadTextFile('location-inventory.csv', 'materialId,locationId,quantity\n' + lb.map((x) => `${x.materialId},${x.locationId},${x.quantity}`).join('\n'), 'text/csv')
        }
      })()
      return
    }
    downloadTextFile(`report-${report}.csv`, materialsToCsv(filtered), 'text/csv')
  }

  return (
    <div>
      <PageHeader
        title="Reports & Exports"
        description="Operational reports derived from live application data."
        actions={<Button variant="secondary" onClick={exportReport}>Export CSV</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setReport(r.id)}
            className={`rounded border px-3 py-1.5 text-sm ${report === r.id ? 'border-brand bg-blue-50 text-brand dark:bg-blue-950' : 'border-slate-300 dark:border-slate-600'}`}
          >
            {r.name}
          </button>
        ))}
      </div>
      <Card>
        <CardHeader title={REPORTS.find((r) => r.id === report)?.name ?? 'Report'} />
        <div className="overflow-x-auto p-4 print:p-0">
          {report === 'movements' || report === 'purchase' || report === 'locations' ? (
            <p className="text-sm text-slate-600">Use Export CSV to download this report.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="py-2">Material</th>
                  <th className="py-2">Available</th>
                  <th className="py-2">Reorder pt</th>
                  <th className="py-2">Recommend qty</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.material.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2">{r.material.name}</td>
                    <td className="py-2 tabular-nums">{formatNumber(r.availableStock)}</td>
                    <td className="py-2 tabular-nums">{formatNumber(r.reorderPoint)}</td>
                    <td className="py-2 tabular-nums">{formatNumber(r.recommendedOrderQty, 0)}</td>
                    <td className="py-2">{r.stockStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  )
}
