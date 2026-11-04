import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { DashboardPage } from '../pages/DashboardPage'
import { InventoryPage } from '../pages/InventoryPage'
import { MaterialDetailsPage } from '../pages/MaterialDetailsPage'
import { MovementsPage } from '../pages/MovementsPage'
import { LocationsPage } from '../pages/LocationsPage'
import { SuppliersPage } from '../pages/SuppliersPage'
import { SupplierDetailPage } from '../pages/SupplierDetailPage'
import { PurchaseOrdersPage } from '../pages/PurchaseOrdersPage'
import { PurchaseOrderDetailPage } from '../pages/PurchaseOrderDetail'
import { PurchaseOrderEditPage } from '../pages/PurchaseOrderEditPage'
import { PurchaseOrderPrintPage } from '../pages/PurchaseOrderPrintPage'
import { ReportsPage } from '../pages/ReportsPage'
import { SettingsPage } from '../pages/SettingsPage'

export const router = createBrowserRouter([
  {
    path: '/purchase-orders/:poId/print',
    element: <PurchaseOrderPrintPage />,
  },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'inventory', element: <InventoryPage /> },
      { path: 'inventory/:id', element: <MaterialDetailsPage /> },
      { path: 'movements', element: <MovementsPage /> },
      { path: 'locations', element: <LocationsPage /> },
      { path: 'suppliers', element: <SuppliersPage /> },
      { path: 'suppliers/:supplierId', element: <SupplierDetailPage /> },
      { path: 'purchase-orders', element: <PurchaseOrdersPage /> },
      { path: 'purchase-orders/:poId', element: <PurchaseOrderDetailPage /> },
      { path: 'purchase-orders/:poId/edit', element: <PurchaseOrderEditPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])
