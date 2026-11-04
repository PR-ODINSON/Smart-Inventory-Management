import { useEffect, useRef, useState } from 'react'
import { fetchApiHealth, isCloudApiConfigured } from '../storage/mongoApi'
import { pullCloudToLocal, pushLocalToCloud } from '../services/cloudSyncService'
import { PageHeader } from '../components/layout/PageHeader'
import { Card, CardHeader } from '../components/shared/Card'
import { Button } from '../components/shared/Button'
import { useAppData } from '../contexts/AppDataContext'
import { useToast } from '../contexts/ToastContext'
import {
  exportFullBackup,
  restoreBackup,
  validateBackup,
  downloadTextFile,
} from '../services/importExportService'
import { seedDemoData } from '../services/seedService'
import { purgeDemoSampleData } from '../services/purgeDemoData'
import type { AppBackup } from '../types/settings'

export function SettingsPage() {
  const { settings, updateSettings, refresh } = useAppData()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [mongoStatus, setMongoStatus] = useState<string>('Checking…')
  const cloudConfigured = isCloudApiConfigured()

  useEffect(() => {
    if (!cloudConfigured) {
      setMongoStatus('Cloud API not configured (set VITE_API_BASE_URL in .env).')
      return
    }
    void fetchApiHealth().then((h) => {
      setMongoStatus(
        h.ok
          ? `Connected to MongoDB (${h.database}).`
          : `API unreachable: ${h.error}`,
      )
    })
  }, [cloudConfigured])

  const backup = async () => {
    const data = await exportFullBackup()
    downloadTextFile(
      `neelam-inventory-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(data, null, 2),
      'application/json',
    )
    await updateSettings({ lastBackupAt: new Date().toISOString() })
    toast('JSON backup downloaded.', 'success')
  }

  const onRestore = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = validateBackup(JSON.parse(text) as AppBackup)
      if (!confirm('Restore will replace all local data. Continue?')) return
      await restoreBackup(parsed)
      await refresh()
      toast('Backup restored.', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Restore failed.', 'error')
    }
  }

  const removeSampleData = async () => {
    if (
      !confirm(
        'Remove demo/sample suppliers, purchase orders, and customers? Your uploaded supplier invoices and manual records are kept.',
      )
    )
      return
    const counts = await purgeDemoSampleData()
    await refresh()
    toast(
      `Removed ${counts.suppliers} demo supplier(s), ${counts.purchaseOrders} sample PO(s), ${counts.customers} demo customer(s).`,
      'success',
    )
  }

  const resetDemo = async () => {
    if (
      !confirm(
        'This will replace all inventory data with the 12-material demo dataset. Continue?',
      )
    )
      return
    await seedDemoData(true)
    await refresh()
    toast('Demo data reset.', 'success')
  }

  return (
    <div>
      <PageHeader
        title="Settings & Data Management"
        description="Production planning parameters, theme, and local data tools."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Planning parameters" />
          <div className="space-y-4 p-4 text-sm">
            <label className="block">
              Production level (% of normal, 50–150)
              <input
                type="number"
                min={50}
                max={150}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
                value={settings.productionLevelPercent}
                onChange={(e) =>
                  void updateSettings({ productionLevelPercent: +e.target.value })
                }
              />
            </label>
            <label className="block">
              Desired stock coverage (days)
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
                value={settings.desiredCoverageDays}
                onChange={(e) =>
                  void updateSettings({ desiredCoverageDays: +e.target.value })
                }
              />
            </label>
            <label className="block">
              Theme
              <select
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900"
                value={settings.theme}
                onChange={(e) =>
                  void updateSettings({
                    theme: e.target.value as 'light' | 'dark' | 'system',
                  })
                }
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
          </div>
        </Card>

        <Card>
          <CardHeader title="Storage" />
          <div className="space-y-2 p-4 text-sm text-slate-600 dark:text-slate-400">
            <p>
              <strong className="text-slate-900 dark:text-slate-100">UI cache:</strong>{' '}
              IndexedDB (this browser). With <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">VITE_API_BASE_URL</code>, changes sync to MongoDB.
            </p>
            <p>
              <strong className="text-slate-900 dark:text-slate-100">MongoDB:</strong>{' '}
              {mongoStatus}
            </p>
            <p className="text-xs">
              Each push indexes materials, suppliers, purchase orders, customers, movements, and
              related tables into separate collections with query indexes.
            </p>
            <p className="text-xs">
              <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">MONGODB_URI</code> is
              read only by the Node server (<code className="rounded bg-slate-100 px-1 dark:bg-slate-800">npm run server</code>
              ), never by React.
            </p>
            {settings.cloudLastSyncedAt && (
              <p>Last cloud sync: {new Date(settings.cloudLastSyncedAt).toLocaleString()}</p>
            )}
            {settings.lastBackupAt && (
              <p>Last JSON file backup: {new Date(settings.lastBackupAt).toLocaleString()}</p>
            )}
            {cloudConfigured && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void pushLocalToCloud()
                      .then(() => refresh())
                      .then(() => toast('Pushed to MongoDB.', 'success'))
                      .catch((e) =>
                        toast(e instanceof Error ? e.message : 'Push failed.', 'error'),
                      )
                  }
                >
                  Push local → cloud
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (!confirm('Replace local data with the cloud snapshot?')) return
                    void pullCloudToLocal()
                      .then(() => refresh())
                      .then(() => toast('Loaded from MongoDB.', 'success'))
                      .catch((e) =>
                        toast(e instanceof Error ? e.message : 'Pull failed.', 'error'),
                      )
                  }}
                >
                  Pull cloud → local
                </Button>
              </div>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Import / export / reset" />
          <div className="flex flex-wrap gap-2 p-4">
            <Button variant="secondary" onClick={() => void backup()}>Download JSON backup</Button>
            <Button
              variant="secondary"
              onClick={() => fileRef.current?.click()}
            >
              Restore JSON backup
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onRestore(f)
              }}
            />
            <Button variant="secondary" onClick={() => void removeSampleData()}>
              Remove sample / demo data
            </Button>
            <Button variant="danger" onClick={() => void resetDemo()}>
              Load full demo dataset
            </Button>
          </div>
          <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800">
            CSV import: use Inventory → Export CSV as a template; full merge import can be extended
            from Settings backup format. Duplicate material IDs are rejected on manual entry.
          </p>
        </Card>
      </div>
    </div>
  )
}
