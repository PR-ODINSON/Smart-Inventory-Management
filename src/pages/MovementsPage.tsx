import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/shared/Button'
import { Card, CardHeader } from '../components/shared/Card'
import { useToast } from '../contexts/ToastContext'
import { applyMovement, MovementValidationError } from '../services/inventoryMovementService'
import { db } from '../storage/database'
import type { InventoryMovement, Material, MovementType } from '../types/inventory'
import { formatDateTime, formatNumber } from '../utils/formatting'

const MOVEMENT_TYPES: { value: MovementType; label: string }[] = [
  { value: 'goods_receipt', label: 'Goods receipt' },
  { value: 'issue_to_production', label: 'Issue to production' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'return_from_production', label: 'Return from production' },
  { value: 'return_to_supplier', label: 'Return to supplier' },
  { value: 'stock_adjustment', label: 'Stock adjustment' },
  { value: 'inspection_acceptance', label: 'Inspection acceptance' },
  { value: 'inspection_rejection', label: 'Inspection rejection' },
  { value: 'reservation', label: 'Reservation' },
  { value: 'reservation_release', label: 'Reservation release' },
]

export function MovementsPage() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  const [history, setHistory] = useState<InventoryMovement[]>([])
  const [type, setType] = useState<MovementType>('goods_receipt')
  const [materialId, setMaterialId] = useState('')
  const [quantity, setQuantity] = useState(0)
  const [src, setSrc] = useState('')
  const [dest, setDest] = useState('')
  const [reason, setReason] = useState('')
  const [reference, setReference] = useState('')
  const [adjustSign, setAdjustSign] = useState<'increase' | 'decrease'>('increase')
  const { toast } = useToast()
  const [params] = useSearchParams()

  const reload = async () => {
    setMaterials(await db.materials.where('status').equals('active').toArray())
    setLocations(await db.locations.toArray())
    setHistory(await db.movements.orderBy('timestamp').reverse().limit(100).toArray())
  }

  useEffect(() => {
    void reload()
  }, [])

  useEffect(() => {
    const t = params.get('type') as MovementType | null
    if (t && MOVEMENT_TYPES.some((x) => x.value === t)) setType(t)
  }, [params])

  const submit = async () => {
    const material = materials.find((m) => m.id === materialId)
    if (!material) {
      toast('Select a material.', 'error')
      return
    }
    try {
      await applyMovement({
        material,
        type,
        quantity,
        sourceLocationId: src || undefined,
        destinationLocationId: dest || undefined,
        reason: type === 'stock_adjustment' ? reason : undefined,
        referenceNumber: reference || undefined,
        adjustmentSign: type === 'stock_adjustment' ? adjustSign : undefined,
      })
      toast('Movement recorded.', 'success')
      setQuantity(0)
      await reload()
    } catch (e) {
      toast(e instanceof MovementValidationError ? e.message : 'Movement failed.', 'error')
    }
  }

  return (
    <div>
      <PageHeader
        title="Stock Movements"
        description="Record traceable inventory transactions. Historical records cannot be edited; use compensating adjustments."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Record movement" />
          <div className="space-y-3 p-4">
            <label className="block text-sm">
              Type
              <select
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
                value={type}
                onChange={(e) => setType(e.target.value as MovementType)}
              >
                {MOVEMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Material
              <select
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
                value={materialId}
                onChange={(e) => setMaterialId(e.target.value)}
              >
                <option value="">Select…</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Quantity
              <input
                type="number"
                min={0}
                step="any"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
                value={quantity || ''}
                onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
              />
            </label>
            {(type === 'transfer' || type === 'issue_to_production') && (
              <label className="block text-sm">
                Source location
                <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900" value={src} onChange={(e) => setSrc(e.target.value)}>
                  <option value="">Default</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            )}
            {(type === 'transfer' || type === 'goods_receipt' || type === 'return_from_production') && (
              <label className="block text-sm">
                Destination location
                <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900" value={dest} onChange={(e) => setDest(e.target.value)}>
                  <option value="">Default</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            )}
            {type === 'stock_adjustment' && (
              <>
                <label className="block text-sm">
                  Direction
                  <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900" value={adjustSign} onChange={(e) => setAdjustSign(e.target.value as 'increase' | 'decrease')}>
                    <option value="increase">Increase</option>
                    <option value="decrease">Decrease</option>
                  </select>
                </label>
                <label className="block text-sm">
                  Reason (required)
                  <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900" value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
              </>
            )}
            <label className="block text-sm">
              Reference #
              <input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900" value={reference} onChange={(e) => setReference(e.target.value)} />
            </label>
            <Button onClick={() => void submit()}>Submit movement</Button>
          </div>
        </Card>

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
                </tr>
              </thead>
              <tbody>
                {history.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-1.5">{formatDateTime(m.timestamp)}</td>
                    <td className="px-2 py-1.5">{m.materialId}</td>
                    <td className="px-2 py-1.5">{m.type}</td>
                    <td className="px-2 py-1.5 tabular-nums">{formatNumber(m.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
