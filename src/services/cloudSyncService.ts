import {
  exportFullBackup,
  restoreBackup,
  validateBackup,
} from './importExportService'
import { fetchApiHealth, isCloudApiConfigured, pullCloudState, pushCloudState } from '../storage/mongoApi'
import type { AppBackup } from '../types/settings'
import { getSettings, saveSettings } from './seedService'
import { db } from '../storage/database'

export async function tryBootstrapFromCloud(): Promise<boolean> {
  if (!isCloudApiConfigured()) return false
  const health = await fetchApiHealth()
  if (!health.ok) return false
  try {
    const raw = await pullCloudState()
    const backup = validateBackup(raw as AppBackup)
    await restoreBackup(backup)
    const settings = await getSettings()
    await saveSettings({
      ...settings,
      ...backup.settings,
      id: 'app',
      cloudLastSyncedAt: new Date().toISOString(),
      storageMode: 'indexeddb+mongodb',
    })
    return true
  } catch {
    return false
  }
}

export async function pushLocalToCloud(): Promise<void> {
  const backup = await exportFullBackup()
  await pushCloudState(backup)
  const settings = await getSettings()
  await saveSettings({
    ...settings,
    cloudLastSyncedAt: new Date().toISOString(),
    storageMode: 'indexeddb+mongodb',
  })
}

export async function pullCloudToLocal(): Promise<void> {
  const raw = await pullCloudState()
  const backup = validateBackup(raw as AppBackup)
  await restoreBackup(backup)
  const settings = await getSettings()
  await saveSettings({
    ...settings,
    cloudLastSyncedAt: new Date().toISOString(),
    storageMode: 'indexeddb+mongodb',
  })
}

/** Push current IndexedDB to Mongo if cloud is configured and local has data. */
export async function ensureCloudHasLocalSnapshot(): Promise<void> {
  if (!isCloudApiConfigured()) return
  const settings = await getSettings()
  if (settings.demoDataSeeded) return
  const count = await db.materials.count()
  if (count === 0) return
  try {
    await pullCloudState()
  } catch {
    await pushLocalToCloud()
  }
}
