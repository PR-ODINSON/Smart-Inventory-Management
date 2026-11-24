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
import type {
  MaterialConsumptionRate,
  MaterialIssue,
  MaterialReceipt,
  ProductionPlan,
} from '../types/productionPlanning'
import type { CategoryMaster, UnitMaster } from '../types/masterData'
import type { DispatchRecord, MovementTypeMaster } from '../types/dispatch'

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
  productionPlans!: Table<ProductionPlan, string>
  materialConsumptionRates!: Table<MaterialConsumptionRate, string>
  materialReceipts!: Table<MaterialReceipt, string>
  materialIssues!: Table<MaterialIssue, string>
  categories!: Table<CategoryMaster, string>
  units!: Table<UnitMaster, string>
  dispatches!: Table<DispatchRecord, string>
  movementTypes!: Table<MovementTypeMaster, string>

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
    this.version(6).stores({
      productionPlans: 'id, month, createdAt',
      materialConsumptionRates: 'id, materialId, grade',
      materialReceipts: 'id, [supplierName+invoiceNumber], materialId, invoiceNumber, receivedAt',
      materialIssues: 'id, materialId, issuedAt, productionBatchId',
    })
    this.version(7).stores({
      categories: 'id, name',
      units: 'id, name',
    })
    this.version(8).stores({
      dispatches: 'id, customerPoId, poItemId, dispatchDate, createdAt',
      movementTypes: 'id, name',
    })
    this.version(9).stores({
      dispatches: 'id, customerPoId, poItemId, dispatchDate, invoiceNo, createdAt',
    })
    this.version(10).stores({
      dispatches: 'id, customerPoId, poItemId, dispatchDate, invoiceNo, vehicleNumber, createdAt',
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
