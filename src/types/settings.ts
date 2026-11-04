export interface ApplicationSettings {
  id: 'app'
  productionLevelPercent: number
  desiredCoverageDays: number
  theme: 'light' | 'dark' | 'system'
  defaultCategory: string
  demoDataSeeded: boolean
  demoPurchaseOrdersSeeded?: boolean
  storageMode: 'indexeddb' | 'indexeddb+mongodb'
  lastBackupAt?: string
  cloudLastSyncedAt?: string
}

export interface AppBackup {
  version: 1
  exportedAt: string
  materials: import('./inventory').Material[]
  balances: import('./inventory').InventoryBalance[]
  locationBalances: import('./inventory').LocationBalance[]
  movements: import('./inventory').InventoryMovement[]
  locations: import('./inventory').StorageLocation[]
  suppliers: import('./inventory').Supplier[]
  customers?: import('./customer').Customer[]
  purchaseOrders: import('./purchasing').PurchaseOrder[]
  goodsReceipts: import('./purchasing').GoodsReceipt[]
  poDispatches?: import('./purchasing').PoDispatchRecord[]
  supplierInvoices?: import('./supplierInvoice').SupplierInvoice[]
  productionBatches: import('./production').ProductionBatch[]
  auditEvents: import('./inventory').AuditEvent[]
  settings: ApplicationSettings
}
