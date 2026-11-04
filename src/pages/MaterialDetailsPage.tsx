import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Card, CardHeader } from '../components/shared/Card'
import { StockBadge } from '../components/shared/Badge'
import { getMaterialComputed, archiveMaterial } from '../services/inventoryService'
import { db } from '../storage/database'
import type { InventoryMovement, MaterialComputed } from '../types/inventory'
import type { PurchaseOrder } from '../types/purchasing'
import { formatDate, formatDateTime, formatNumber } from '../utils/formatting'
import { isPastDate } from '../utils/dates'
import { Button } from '../components/shared/Button'
import { useToast } from '../contexts/ToastContext'

export function MaterialDetailsPage() {
  const { id } = useParams()
  const [data, setData] = useState<MaterialComputed | null>(null)
  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const { toast } = useToast()

  useEffect(() => {
    if (!id) return
    void (async () => {
      setData(await getMaterialComputed(id))
      setMovements(
        await db.movements.where('materialId').equals(id).reverse().sortBy('timestamp'),
      )
      const allPo = await db.purchaseOrders.toArray()
      setOrders(allPo.filter((p) => p.lines.some((l) => l.materialId === id)))
    })()
  }, [id])

  if (!data) {
    return <p className="text-sm text-slate-500">Material not found.</p>
  }

  const { material, balance } = data

  return (
    <div>
      <PageHeader
        title={material.name}
        description={`${material.id} · ${material.category}`}
        actions={
          <>
            <Link to="/inventory"><Button variant="secondary">Back to inventory</Button></Link>
            <Link to={`/inventory?edit=${material.id}`}>
              <Button>Edit material</Button>
            </Link>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm('Archive this material?')) {
                  void archiveMaterial(material.id).then(() => {
                    toast('Material archived.', 'success')
                  })
                }
              }}
            >
              Archive
            </Button>
          </>
        }
      />

      {data.inconsistencies.length > 0 && (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <strong>Data inconsistencies:</strong> {data.inconsistencies.join(' ')}
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-sm font-semibold">Current levels</h3>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-500">Physical</dt>
            <dd className="tabular-nums">{formatNumber(balance.physicalStock)} {material.unit}</dd>
            <dt className="text-slate-500">Available</dt>
            <dd className="tabular-nums">{formatNumber(data.availableStock)} {material.unit}</dd>
            <dt className="text-slate-500">Reserved</dt>
            <dd>{formatNumber(balance.reserved)}</dd>
            <dt className="text-slate-500">Awaiting inspection</dt>
            <dd>{formatNumber(balance.awaitingInspection)}</dd>
            <dt className="text-slate-500">Status</dt>
            <dd><StockBadge status={data.stockStatus} /></dd>
          </dl>
        </Card>
        <Card className="p-4">
          <h3 className="text-sm font-semibold">Reorder planning</h3>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-slate-500">Safety stock</dt>
            <dd>{formatNumber(data.safetyStock)}</dd>
            <dt className="text-slate-500">Reorder point</dt>
            <dd>{formatNumber(data.reorderPoint)}</dd>
            <dt className="text-slate-500">Recommended order</dt>
            <dd>{formatNumber(data.recommendedOrderQty, 0)} {material.unit}</dd>
            <dt className="text-slate-500">Latest safe order</dt>
            <dd>
              {data.latestSafeOrderDate && isPastDate(data.latestSafeOrderDate)
                ? 'Order immediately'
                : formatDate(data.latestSafeOrderDate)}
            </dd>
            <dt className="text-slate-500">Predicted stock-out</dt>
            <dd>{formatDate(data.predictedStockOutDate)}</dd>
          </dl>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader title="Stock movements" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase dark:bg-slate-900">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Qty</th>
                <th className="px-3 py-2 text-left">Balance after</th>
                <th className="px-3 py-2 text-left">Reference</th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 ? (
                <tr><td colSpan={5} className="p-4 text-slate-500">No movements recorded.</td></tr>
              ) : (
                movements.slice(0, 50).map((m) => (
                  <tr key={m.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2">{formatDateTime(m.timestamp)}</td>
                    <td className="px-3 py-2">{m.type.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2 tabular-nums">{formatNumber(m.quantity)} {m.unit}</td>
                    <td className="px-3 py-2 tabular-nums">{formatNumber(m.resultingPhysicalStock)}</td>
                    <td className="px-3 py-2">{m.referenceNumber ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Related purchase orders" />
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {orders.length === 0 ? (
            <li className="p-4 text-sm text-slate-500">No purchase orders.</li>
          ) : (
            orders.map((po) => (
              <li key={po.id} className="flex justify-between px-4 py-3 text-sm">
                <Link to="/purchase-orders" className="text-brand hover:underline">{po.poNumber}</Link>
                <span className="text-slate-500">{po.status}</span>
              </li>
            ))
          )}
        </ul>
      </Card>
    </div>
  )
}
