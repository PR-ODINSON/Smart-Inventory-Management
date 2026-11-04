import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { initializeApp, getSettings, saveSettings } from '../services/seedService'
import type { ApplicationSettings } from '../types/settings'

interface AppDataContextValue {
  ready: boolean
  settings: ApplicationSettings
  refresh: () => Promise<void>
  updateSettings: (patch: Partial<ApplicationSettings>) => Promise<void>
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState<ApplicationSettings | null>(null)

  const refresh = useCallback(async () => {
    const s = await getSettings()
    setSettings(s)
  }, [])

  useEffect(() => {
    void (async () => {
      const s = await initializeApp()
      setSettings(s)
      setReady(true)
    })()
  }, [])

  const updateSettings = useCallback(
    async (patch: Partial<ApplicationSettings>) => {
      const current = await getSettings()
      const next = { ...current, ...patch }
      await saveSettings(next)
      setSettings(next)
    },
    [],
  )

  const value = useMemo(
    () =>
      settings
        ? { ready, settings, refresh, updateSettings }
        : { ready: false, settings: null as unknown as ApplicationSettings, refresh, updateSettings },
    [ready, settings, refresh, updateSettings],
  )

  if (!ready || !settings) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand dark:border-slate-600" />
          <p className="text-sm text-slate-600 dark:text-slate-400">Loading inventory data…</p>
        </div>
      </div>
    )
  }

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider')
  return ctx
}
