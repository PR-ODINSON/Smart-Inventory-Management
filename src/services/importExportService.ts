import { db } from '../storage/database'
import type { AppBackup } from '../types/settings'
import { getSettings, saveSettings } from './seedService'

export async function exportFullBackup(): Promise<AppBackup> {
  const settings = await getSettings()
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    materials: await db.materials.toArray(),
    balances: await db.balances.toArray(),
    locationBalances: await db.locationBalances.toArray(),
    movements: await db.movements.toArray(),
    locations: await db.locations.toArray(),
    suppliers: await db.suppliers.toArray(),
    customers: await db.customers.toArray(),
    purchaseOrders: await db.purchaseOrders.toArray(),
    goodsReceipts: await db.goodsReceipts.toArray(),
    poDispatches: await db.poDispatches.toArray(),
    supplierInvoices: await db.supplierInvoices.toArray(),
    productionBatches: await db.productionBatches.toArray(),
    auditEvents: await db.auditEvents.toArray(),
    settings,
  }
}

export function validateBackup(data: unknown): AppBackup {
  if (!data || typeof data !== 'object') throw new Error('Invalid backup file.')
  const b = data as AppBackup
  if (b.version !== 1) throw new Error('Unsupported backup version.')
  if (!Array.isArray(b.materials)) throw new Error('Missing materials array.')
  return b
}

export async function restoreBackup(backup: AppBackup): Promise<void> {
  validateBackup(backup)
  await db.transaction(
    'rw',
    db.tables,
    async () => {
      for (const table of db.tables) {
        await table.clear()
      }
      await db.materials.bulkAdd(backup.materials)
      await db.balances.bulkAdd(backup.balances)
      await db.locationBalances.bulkAdd(backup.locationBalances)
      await db.movements.bulkAdd(backup.movements)
      await db.locations.bulkAdd(backup.locations)
      await db.suppliers.bulkAdd(backup.suppliers)
      if (backup.customers?.length) await db.customers.bulkAdd(backup.customers)
      await db.purchaseOrders.bulkAdd(backup.purchaseOrders)
      await db.goodsReceipts.bulkAdd(backup.goodsReceipts)
      if (backup.poDispatches?.length) await db.poDispatches.bulkAdd(backup.poDispatches)
      if (backup.supplierInvoices?.length) await db.supplierInvoices.bulkAdd(backup.supplierInvoices)
      await db.productionBatches.bulkAdd(backup.productionBatches)
      await db.auditEvents.bulkAdd(backup.auditEvents)
      await saveSettings(backup.settings)
    },
  )
}

export function materialsToCsv(
  rows: {
    material: { id: string; name: string; category: string; unit: string }
    balance: {
      physicalStock: number
      reserved: number
      awaitingInspection: number
      locationId: string
    }
    availableStock: number
    effectiveDailyConsumption: number
    reorderPoint: number
    daysOfCover: number | null
    recommendedOrderQty: number
    stockStatus: string
  }[],
): string {
  const header = [
    'Material ID',
    'Name',
    'Category',
    'Unit',
    'Location',
    'Physical',
    'Reserved',
    'Awaiting Inspection',
    'Available',
    'Daily Consumption',
    'Reorder Point',
    'Days of Cover',
    'Recommended Order Qty',
    'Status',
  ]
  const lines = rows.map((r) =>
    [
      r.material.id,
      `"${r.material.name.replace(/"/g, '""')}"`,
      r.material.category,
      r.material.unit,
      r.balance.locationId,
      r.balance.physicalStock,
      r.balance.reserved,
      r.balance.awaitingInspection,
      r.availableStock,
      r.effectiveDailyConsumption,
      r.reorderPoint,
      r.daysOfCover ?? '',
      r.recommendedOrderQty,
      r.stockStatus,
    ].join(','),
  )
  return [header.join(','), ...lines].join('\n')
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
