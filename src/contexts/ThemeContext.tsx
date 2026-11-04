import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAppData } from './AppDataContext'

type ThemeContextValue = { dark: boolean; toggle: () => void }

const ThemeContext = createContext<ThemeContextValue>({ dark: false, toggle: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings, updateSettings } = useAppData()
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark =
      settings.theme === 'dark' || (settings.theme === 'system' && prefersDark)
    setDark(isDark)
    root.classList.toggle('dark', isDark)
  }, [settings.theme])

  const toggle = () => {
    const next = dark ? 'light' : 'dark'
    void updateSettings({ theme: next })
  }

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>{children}</ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
