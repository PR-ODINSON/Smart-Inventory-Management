import Dexie, { type Table } from 'dexie'
import type {
  AuditEvent,
  InventoryBalance,
  InventoryMovement,
  LocationBalance,
  Material,
  StorageLocation,
  Supplier,
} from '../types/inventory'
import type { ProductionBatch } from '../types/production'
import type { GoodsReceipt, PoDispatchRecord, PurchaseOrder } from '../types/purchasing'
import type { Customer } from '../types/customer'
import type { ApplicationSettings } from '../types/settings'
import type { SupplierInvoice } from '../types/supplierInvoice'

export class NeelamDatabase extends Dexie {
  materials!: Table<Material, string>
  balances!: Table<InventoryBalance, string>
  locationBalances!: Table<LocationBalance, string>
  movements!: Table<InventoryMovement, string>
  locations!: Table<StorageLocation, string>
  suppliers!: Table<Supplier, string>
  customers!: Table<Customer, string>
  purchaseOrders!: Table<PurchaseOrder, string>
  goodsReceipts!: Table<GoodsReceipt, string>
  poDispatches!: Table<PoDispatchRecord, string>
  productionBatches!: Table<ProductionBatch, string>
  auditEvents!: Table<AuditEvent, string>
  settings!: Table<ApplicationSettings, string>
  supplierInvoices!: Table<SupplierInvoice, string>

  constructor() {
    super('NeelamInventoryDB')
    this.version(1).stores({
      materials: 'id, name, category, status',
      balances: 'materialId',
      locationBalances: '[materialId+locationId], materialId, locationId',
      movements: 'id, materialId, timestamp, type',
      locations: 'id, code, active',
      suppliers: 'id, companyName, active',
      purchaseOrders: 'id, poNumber, status',
      goodsReceipts: 'id, purchaseOrderId, materialId',
      productionBatches: 'id, batchNumber, date, materialId',
      auditEvents: 'id, entityType, timestamp',
      settings: 'id',
    })
    this.version(2).stores({
      purchaseOrders: 'id, poNumber, status, createdAt',
    })
    this.version(3).stores({
      customers: 'id, name, gstin, active',
    })
    this.version(4).stores({
      poDispatches: 'id, purchaseOrderId, lineId, dispatchedAt',
    })
    this.version(5).stores({
      suppliers: 'id, companyName, active, gstin',
      supplierInvoices: 'id, supplierId, invoiceNumber, invoiceDate, createdAt',
    })
  }
}

export const db = new NeelamDatabase()

function attachCloudSyncHooks() {
  void import('../services/cloudPushScheduler').then(({ scheduleCloudPush }) => {
    for (const table of db.tables) {
      table.hook('creating', () => scheduleCloudPush())
      table.hook('updating', () => scheduleCloudPush())
      table.hook('deleting', () => scheduleCloudPush())
    }
  })
}

attachCloudSyncHooks()

export function balanceKey(materialId: string): string {
  return materialId
}
