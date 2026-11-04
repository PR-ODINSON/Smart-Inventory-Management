/** Denormalize AppBackup v1 into indexed MongoDB collections. */

export const COLLECTION_INDEXES = {
  materials: [
    { key: { name: 1 }, name: 'materials_name' },
    { key: { category: 1 }, name: 'materials_category' },
    { key: { status: 1 }, name: 'materials_status' },
  ],
  balances: [{ key: { materialId: 1 }, name: 'balances_materialId' }],
  location_balances: [
    { key: { materialId: 1, locationId: 1 }, name: 'location_balances_material_location' },
    { key: { locationId: 1 }, name: 'location_balances_locationId' },
  ],
  movements: [
    { key: { materialId: 1, timestamp: -1 }, name: 'movements_material_time' },
    { key: { timestamp: -1 }, name: 'movements_timestamp' },
    { key: { purchaseOrderId: 1 }, name: 'movements_po', sparse: true },
  ],
  locations: [
    { key: { code: 1 }, name: 'locations_code' },
    { key: { active: 1 }, name: 'locations_active' },
  ],
  suppliers: [
    { key: { companyName: 1 }, name: 'suppliers_companyName' },
    { key: { active: 1 }, name: 'suppliers_active' },
    { key: { materialIds: 1 }, name: 'suppliers_materialIds' },
    { key: { gstin: 1 }, name: 'suppliers_gstin', sparse: true },
  ],
  supplier_invoices: [
    { key: { supplierId: 1, invoiceNumber: 1 }, name: 'supplier_invoices_supplier_number' },
    { key: { invoiceDate: -1 }, name: 'supplier_invoices_date', sparse: true },
    { key: { createdAt: -1 }, name: 'supplier_invoices_created' },
  ],
  customers: [
    { key: { name: 1 }, name: 'customers_name' },
    { key: { gstin: 1 }, name: 'customers_gstin', sparse: true },
    { key: { active: 1 }, name: 'customers_active' },
  ],
  purchase_orders: [
    { key: { poNumber: 1 }, name: 'purchase_orders_poNumber' },
    { key: { status: 1 }, name: 'purchase_orders_status' },
    { key: { supplierId: 1 }, name: 'purchase_orders_supplierId', sparse: true },
    { key: { customerId: 1 }, name: 'purchase_orders_customerId', sparse: true },
    { key: { createdAt: -1 }, name: 'purchase_orders_createdAt' },
    { key: { direction: 1 }, name: 'purchase_orders_direction', sparse: true },
  ],
  goods_receipts: [
    { key: { purchaseOrderId: 1 }, name: 'goods_receipts_po' },
    { key: { materialId: 1 }, name: 'goods_receipts_material' },
  ],
  po_dispatches: [
    { key: { purchaseOrderId: 1 }, name: 'po_dispatches_po' },
    { key: { dispatchedAt: -1 }, name: 'po_dispatches_time' },
  ],
  production_batches: [
    { key: { batchNumber: 1 }, name: 'production_batches_number' },
    { key: { materialId: 1 }, name: 'production_batches_material' },
    { key: { date: -1 }, name: 'production_batches_date' },
  ],
  audit_events: [
    { key: { entityType: 1, timestamp: -1 }, name: 'audit_entity_time' },
    { key: { timestamp: -1 }, name: 'audit_timestamp' },
  ],
}

export async function ensureEntityIndexes(db) {
  for (const [collection, specs] of Object.entries(COLLECTION_INDEXES)) {
    const col = db.collection(collection)
    for (const spec of specs) {
      const { name, key, ...opts } = spec
      await col.createIndex(key, { name, ...opts })
    }
  }
}

function replaceOps(docs, idField = 'id') {
  if (!docs?.length) return []
  return docs.map((doc) => ({
    replaceOne: {
      filter: { _id: doc[idField] },
      replacement: { _id: doc[idField], ...doc },
      upsert: true,
    },
  }))
}

function balanceOps(rows) {
  if (!rows?.length) return []
  return rows.map((row) => ({
    replaceOne: {
      filter: { _id: row.materialId },
      replacement: { _id: row.materialId, ...row },
      upsert: true,
    },
  }))
}

function locationBalanceOps(rows) {
  if (!rows?.length) return []
  return rows.map((row) => {
    const _id = `${row.materialId}:${row.locationId}`
    return {
      replaceOne: {
        filter: { _id },
        replacement: { _id, ...row },
        upsert: true,
      },
    }
  })
}

async function bulk(col, ops) {
  if (ops.length === 0) return
  await col.bulkWrite(ops, { ordered: false })
}

export async function indexBackupPayload(db, payload) {
  if (!payload || payload.version !== 1) {
    throw new Error('Expected backup payload version 1.')
  }

  await bulk(db.collection('materials'), replaceOps(payload.materials))
  await bulk(db.collection('balances'), balanceOps(payload.balances))
  await bulk(db.collection('location_balances'), locationBalanceOps(payload.locationBalances))
  await bulk(db.collection('movements'), replaceOps(payload.movements))
  await bulk(db.collection('locations'), replaceOps(payload.locations))
  await bulk(db.collection('suppliers'), replaceOps(payload.suppliers))
  await bulk(db.collection('customers'), replaceOps(payload.customers ?? []))
  await bulk(db.collection('purchase_orders'), replaceOps(payload.purchaseOrders))
  await bulk(db.collection('goods_receipts'), replaceOps(payload.goodsReceipts))
  await bulk(db.collection('po_dispatches'), replaceOps(payload.poDispatches ?? []))
  await bulk(db.collection('supplier_invoices'), replaceOps(payload.supplierInvoices ?? []))
  await bulk(db.collection('production_batches'), replaceOps(payload.productionBatches))
  await bulk(db.collection('audit_events'), replaceOps(payload.auditEvents))

  await db.collection('sync_meta').replaceOne(
    { _id: 'current' },
    {
      _id: 'current',
      version: 1,
      indexedAt: new Date().toISOString(),
      exportedAt: payload.exportedAt ?? null,
      counts: {
        materials: payload.materials?.length ?? 0,
        suppliers: payload.suppliers?.length ?? 0,
        purchaseOrders: payload.purchaseOrders?.length ?? 0,
        customers: payload.customers?.length ?? 0,
      },
    },
    { upsert: true },
  )
}

/** Rebuild AppBackup v1 from indexed collections (for pull when only entities exist). */
export async function backupFromIndexedCollections(db) {
  const [
    materials,
    balances,
    locationBalances,
    movements,
    locations,
    suppliers,
    customers,
    purchaseOrders,
    goodsReceipts,
    poDispatches,
    supplierInvoices,
    productionBatches,
    auditEvents,
  ] = await Promise.all([
    db.collection('materials').find().toArray(),
    db.collection('balances').find().toArray(),
    db.collection('location_balances').find().toArray(),
    db.collection('movements').find().toArray(),
    db.collection('locations').find().toArray(),
    db.collection('suppliers').find().toArray(),
    db.collection('customers').find().toArray(),
    db.collection('purchase_orders').find().toArray(),
    db.collection('goods_receipts').find().toArray(),
    db.collection('po_dispatches').find().toArray(),
    db.collection('supplier_invoices').find().toArray(),
    db.collection('production_batches').find().toArray(),
    db.collection('audit_events').find().toArray(),
  ])

  const strip = (rows) => rows.map(({ _id, ...rest }) => rest)

  const meta = await db.collection('sync_meta').findOne({ _id: 'current' })
  if (materials.length === 0 && suppliers.length === 0 && purchaseOrders.length === 0) {
    return null
  }

  const settingsDoc = await db.collection('app_settings').findOne({ _id: 'app' })

  return {
    version: 1,
    exportedAt: meta?.indexedAt ?? new Date().toISOString(),
    materials: strip(materials),
    balances: strip(balances),
    locationBalances: strip(locationBalances),
    movements: strip(movements),
    locations: strip(locations),
    suppliers: strip(suppliers),
    customers: strip(customers),
    purchaseOrders: strip(purchaseOrders),
    goodsReceipts: strip(goodsReceipts),
    poDispatches: strip(poDispatches),
    supplierInvoices: strip(supplierInvoices),
    productionBatches: strip(productionBatches),
    auditEvents: strip(auditEvents),
    settings: settingsDoc?.payload ?? {
      id: 'app',
      productionLevelPercent: 100,
      desiredCoverageDays: 14,
      theme: 'system',
      defaultCategory: 'General',
      demoDataSeeded: false,
      storageMode: 'indexeddb+mongodb',
    },
  }
}
