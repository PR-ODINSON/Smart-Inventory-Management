import { useEffect, useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card, CardHeader } from '../components/shared/Card'
import { Button } from '../components/shared/Button'
import { useToast } from '../contexts/ToastContext'
import { db } from '../storage/database'
import type { LocationBalance, StorageLocation } from '../types/inventory'
import { formatNumber } from '../utils/formatting'

export function LocationsPage() {
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [balances, setBalances] = useState<LocationBalance[]>([])
  const [form, setForm] = useState({ name: '', code: '', description: '' })
  const { toast } = useToast()

  const load = async () => {
    setLocations(await db.locations.toArray())
    setBalances(await db.locationBalances.toArray())
  }

  useEffect(() => {
    void load()
  }, [])

  const addLocation = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      toast('Name and code required.', 'error')
      return
    }
    const id = `loc-${crypto.randomUUID().slice(0, 8)}`
    await db.locations.add({
      id,
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      description: form.description,
      active: true,
      isExternal: false,
    })
    toast('Location added.', 'success')
    setForm({ name: '', code: '', description: '' })
    await load()
  }

  return (
    <div>
      <PageHeader
        title="Location Management"
        description="Storage areas and location-wise stock balances. Transfers preserve total quantity."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Add location" />
          <div className="space-y-2 p-4">
            <input placeholder="Name" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input placeholder="Code" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <input placeholder="Description" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Button onClick={() => void addLocation()}>Save location</Button>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Locations" />
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase dark:bg-slate-900">
              <tr>
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">External</th>
                <th className="px-3 py-2 text-left">Materials</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((loc) => {
                const mats = balances.filter((b) => b.locationId === loc.id && b.quantity > 0)
                return (
                  <tr key={loc.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 font-mono">{loc.code}</td>
                    <td className="px-3 py-2">{loc.name}</td>
                    <td className="px-3 py-2">{loc.isExternal ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2 text-xs">
                      {mats.length === 0
                        ? '—'
                        : mats.map((b) => `${b.materialId}: ${formatNumber(b.quantity)}`).join(', ')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
