import { DEMO_LOCATIONS, DEMO_MATERIALS, demoRowToMaterial } from '../data/demoSeed'
import { db } from '../storage/database'
import { isCloudApiConfigured } from '../storage/mongoApi'
import type { ApplicationSettings } from '../types/settings'
import { seedDemoPurchaseOrders } from './demoPurchaseOrderSeed'

const DEFAULT_SETTINGS: ApplicationSettings = {
  id: 'app',
  productionLevelPercent: 100,
  desiredCoverageDays: 14,
  theme: 'system',
  defaultCategory: 'General',
  demoDataSeeded: false,
  storageMode: 'indexeddb',
}

export async function getSettings(): Promise<ApplicationSettings> {
  const s = await db.settings.get('app')
  return s ?? DEFAULT_SETTINGS
}

export async function saveSettings(settings: ApplicationSettings): Promise<void> {
  await db.settings.put(settings)
}

export async function initializeApp(): Promise<ApplicationSettings> {
  await getSettings()
  const cloudConfigured = isCloudApiConfigured()
  let materialCount = await db.materials.count()

  if (materialCount === 0 && cloudConfigured) {
    const { tryBootstrapFromCloud } = await import('./cloudSyncService')
    const loaded = await tryBootstrapFromCloud()
    if (loaded) materialCount = await db.materials.count()
  }

  // Demo inventory is opt-in from Settings — start empty for real supplier/invoice uploads.
  const locCount = await db.locations.count()
  if (locCount === 0) {
    await db.locations.bulkAdd(DEMO_LOCATIONS)
  }
  materialCount = await db.materials.count()
  if (cloudConfigured && materialCount > 0) {
    const { ensureCloudHasLocalSnapshot } = await import('./cloudSyncService')
    await ensureCloudHasLocalSnapshot()
  }
  return getSettings()
}

export async function seedDemoData(clearExisting = false): Promise<void> {
  if (clearExisting) {
    await db.transaction(
      'rw',
      [
        db.materials,
        db.balances,
        db.locationBalances,
        db.movements,
        db.purchaseOrders,
        db.goodsReceipts,
        db.productionBatches,
        db.suppliers,
        db.customers,
        db.poDispatches,
        db.auditEvents,
      ],
      async () => {
        await db.materials.clear()
        await db.balances.clear()
        await db.locationBalances.clear()
        await db.movements.clear()
        await db.purchaseOrders.clear()
        await db.goodsReceipts.clear()
        await db.productionBatches.clear()
        await db.suppliers.clear()
        await db.customers.clear()
        await db.poDispatches.clear()
        await db.auditEvents.clear()
      },
    )
    await db.locations.bulkPut(DEMO_LOCATIONS)
  }
  const now = new Date().toISOString()
  for (const row of DEMO_MATERIALS) {
    const material = demoRowToMaterial(row, now)
    await db.materials.put(material)
    await db.balances.put({
      materialId: row.id,
      physicalStock: row.physicalStock,
      reserved: row.reserved,
      awaitingInspection: row.awaitingInspection,
      locationId: row.locationId,
    })
    await db.locationBalances.put({
      materialId: row.id,
      locationId: row.locationId,
      quantity: row.physicalStock,
    })
  }
  const settings = await getSettings()
  settings.demoDataSeeded = true
  await saveSettings(settings)
  await seedDemoPurchaseOrders(true)
}
