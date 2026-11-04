import {
  BarChart3,
  Boxes,
  FileText,
  LayoutDashboard,
  MapPin,
  Menu,
  Moon,
  Package,
  Settings,
  Sun,
  Truck,
  Warehouse,
} from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAppData } from '../../contexts/AppDataContext'
import { useTheme } from '../../contexts/ThemeContext'
import { cn } from '../../utils/cn'
import { DemoBadge } from '../shared/Badge'
import { Button } from '../shared/Button'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/movements', label: 'Movements', icon: Package },
  { to: '/locations', label: 'Locations', icon: MapPin },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/purchase-orders', label: 'Purchase Orders', icon: FileText },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { dark, toggle } = useTheme()
  const { settings } = useAppData()

  return (
    <div className="flex h-full min-h-0">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-slate-200 bg-slate-850 text-slate-100 transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="border-b border-slate-700 px-4 py-4">
          <Link to="/" className="flex items-center gap-2" onClick={() => setSidebarOpen(false)}>
            <Warehouse className="h-7 w-7 text-brand-muted" />
            <div>
              <div className="text-sm font-semibold leading-tight">Neelam Industries</div>
              <div className="text-xs text-slate-400">Smart Inventory</div>
            </div>
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'mb-0.5 flex items-center gap-2 rounded px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-700 p-3 text-xs text-slate-400">
          Storage: IndexedDB (local browser)
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setSidebarOpen((o) => !o)}
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            {settings.demoDataSeeded && <DemoBadge />}
          </div>
          <Button variant="ghost" size="sm" onClick={toggle} aria-label="Toggle theme">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
    </div>
  )
}
