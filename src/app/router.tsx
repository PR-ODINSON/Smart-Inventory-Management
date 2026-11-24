import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { DashboardPage } from '../pages/DashboardPage'
import { PlanningPage } from '../pages/PlanningPage'
import { DispatchPage } from '../pages/DispatchPage'
import { InventoryPage } from '../pages/InventoryPage'
import { MaterialDetailsPage } from '../pages/MaterialDetailsPage'
import { MovementsPage } from '../pages/MovementsPage'
import { SuppliersPage } from '../pages/SuppliersPage'
import { SupplierDetailPage } from '../pages/SupplierDetailPage'
import { PurchaseOrdersPage } from '../pages/PurchaseOrdersPage'
import { PurchaseOrderDetailPage } from '../pages/PurchaseOrderDetail'
import { PurchaseOrderEditPage } from '../pages/PurchaseOrderEditPage'
import { PurchaseOrderPrintPage } from '../pages/PurchaseOrderPrintPage'

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
      { path: 'planning', element: <PlanningPage /> },
      { path: 'dispatch', element: <DispatchPage /> },
      { path: 'inventory', element: <InventoryPage /> },
      { path: 'inventory/:id', element: <MaterialDetailsPage /> },
      { path: 'movements', element: <MovementsPage /> },
      { path: 'suppliers', element: <SuppliersPage /> },
      { path: 'suppliers/:supplierId', element: <SupplierDetailPage /> },
      { path: 'purchase-orders', element: <PurchaseOrdersPage /> },
      { path: 'purchase-orders/:poId', element: <PurchaseOrderDetailPage /> },
      { path: 'purchase-orders/:poId/edit', element: <PurchaseOrderEditPage /> },
    ],
  },
])
