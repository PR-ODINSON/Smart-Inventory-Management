/**
 * Push Required Inventory Data to MongoDB Atlas
 *
 * This script seeds/syncs the 36 foundry raw materials, default storage locations,
 * stock balances, and settings into MongoDB Atlas so that any Netlify deployment
 * or client instance can pull and bootstrap the inventory seamlessly.
 *
 * Usage:
 *   node --env-file=.env scripts/push-to-mongo.mjs
 *   node scripts/push-to-mongo.mjs "<mongodb_connection_string>"
 */

import { MongoClient } from 'mongodb'
import {
  ensureEntityIndexes,
  indexBackupPayload,
} from '../server/indexCollections.mjs'

// 36 Foundry Raw Materials Data (exact specification for Neelam Industries)
export const FOUNDRY_MATERIALS_DATA = [
  { no: 1, name: 'SILICA SAND', category: 'MOULDING', unit: 'KGS', availableStock: 5000, dailyConsumption: 500, emergencyStock: 1000 },
  { no: 2, name: 'MOLASSES', category: 'MOULDING', unit: 'KGS', availableStock: 300, dailyConsumption: 20, emergencyStock: 60 },
  { no: 3, name: 'SODIUM SILICATE', category: 'MOULDING', unit: 'KGS', availableStock: 400, dailyConsumption: 25, emergencyStock: 75 },
  { no: 4, name: 'CO2 GAS', category: 'GAS', unit: 'KGS', availableStock: 150, dailyConsumption: 8, emergencyStock: 24 },
  { no: 5, name: 'BENTONITE', category: 'MOULDING', unit: 'KGS', availableStock: 500, dailyConsumption: 25, emergencyStock: 75 },
  { no: 6, name: 'COAL DUST', category: 'MOULDING', unit: 'KGS', availableStock: 300, dailyConsumption: 15, emergencyStock: 45 },
  { no: 7, name: 'DEXTRIN', category: 'MOULDING', unit: 'KGS', availableStock: 100, dailyConsumption: 3, emergencyStock: 9 },
  { no: 8, name: 'STARCH POWDER', category: 'MOULDING', unit: 'KGS', availableStock: 100, dailyConsumption: 3, emergencyStock: 9 },
  { no: 9, name: 'WOOD FLOUR', category: 'MOULDING', unit: 'KGS', availableStock: 100, dailyConsumption: 5, emergencyStock: 15 },
  { no: 10, name: 'PARTING SAND', category: 'MOULDING', unit: 'KGS', availableStock: 500, dailyConsumption: 20, emergencyStock: 60 },
  { no: 11, name: 'PIG IRON', category: 'METALLIC CHARGE', unit: 'KGS', availableStock: 5000, dailyConsumption: 400, emergencyStock: 800 },
  { no: 12, name: 'CAST IRON SCRAP', category: 'METALLIC CHARGE', unit: 'KGS', availableStock: 6000, dailyConsumption: 500, emergencyStock: 1000 },
  { no: 13, name: 'MS SCRAP', category: 'METALLIC CHARGE', unit: 'KGS', availableStock: 3000, dailyConsumption: 200, emergencyStock: 400 },
  { no: 14, name: 'FOUNDRY RETURNS', category: 'METALLIC CHARGE', unit: 'KGS', availableStock: 8000, dailyConsumption: 600, emergencyStock: 1200 },
  { no: 15, name: 'FERRO SILICON', category: 'ALLOYS AND ADDITIVES', unit: 'KGS', availableStock: 300, dailyConsumption: 20, emergencyStock: 60 },
  { no: 16, name: 'FERRO MANGANESE', category: 'ALLOYS AND ADDITIVES', unit: 'KGS', availableStock: 100, dailyConsumption: 3, emergencyStock: 9 },
  { no: 17, name: 'CARBON RAISER', category: 'ALLOYS AND ADDITIVES', unit: 'KGS', availableStock: 150, dailyConsumption: 5, emergencyStock: 15 },
  { no: 18, name: 'FERRO SILICON MAGNESIUM', category: 'ALLOYS AND ADDITIVES', unit: 'KGS', availableStock: 100, dailyConsumption: 4, emergencyStock: 12 },
  { no: 19, name: 'INOCULANT', category: 'ALLOYS AND ADDITIVES', unit: 'KGS', availableStock: 150, dailyConsumption: 10, emergencyStock: 30 },
  { no: 20, name: 'FERRO PHOSPHORUS', category: 'ALLOYS AND ADDITIVES', unit: 'KGS', availableStock: 50, dailyConsumption: 1, emergencyStock: 3 },
  { no: 21, name: 'FERRO CHROME', category: 'ALLOYS AND ADDITIVES', unit: 'KGS', availableStock: 50, dailyConsumption: 1, emergencyStock: 3 },
  { no: 22, name: 'COPPER', category: 'ALLOYS AND ADDITIVES', unit: 'KGS', availableStock: 50, dailyConsumption: 1, emergencyStock: 3 },
  { no: 23, name: 'NICKEL', category: 'ALLOYS AND ADDITIVES', unit: 'KGS', availableStock: 50, dailyConsumption: 1, emergencyStock: 3 },
  { no: 24, name: 'GRAPHITE POWDER', category: 'REFRACTORY AND COATING', unit: 'KGS', availableStock: 100, dailyConsumption: 3, emergencyStock: 9 },
  { no: 25, name: 'ZIRCON POWDER', category: 'REFRACTORY AND COATING', unit: 'KGS', availableStock: 100, dailyConsumption: 2, emergencyStock: 6 },
  { no: 26, name: 'SILICA FLOUR', category: 'REFRACTORY AND COATING', unit: 'KGS', availableStock: 200, dailyConsumption: 5, emergencyStock: 15 },
  { no: 27, name: 'REFRACTORY MOULD WASH', category: 'REFRACTORY AND COATING', unit: 'LITRES', availableStock: 100, dailyConsumption: 5, emergencyStock: 15 },
  { no: 28, name: 'BENTONITE-BASED COATING', category: 'REFRACTORY AND COATING', unit: 'KGS', availableStock: 100, dailyConsumption: 3, emergencyStock: 9 },
  { no: 29, name: 'GRINDING WHEELS', category: 'CONSUMABLES', unit: 'PIECES', availableStock: 100, dailyConsumption: 5, emergencyStock: 15 },
  { no: 30, name: 'CUTTING WHEELS', category: 'CONSUMABLES', unit: 'PIECES', availableStock: 100, dailyConsumption: 5, emergencyStock: 15 },
  { no: 31, name: 'STEEL SHOT', category: 'CONSUMABLES', unit: 'KGS', availableStock: 500, dailyConsumption: 15, emergencyStock: 45 },
  { no: 32, name: 'STEEL GRIT', category: 'CONSUMABLES', unit: 'KGS', availableStock: 300, dailyConsumption: 10, emergencyStock: 30 },
  { no: 33, name: 'WELDING ELECTRODES', category: 'CONSUMABLES', unit: 'KGS', availableStock: 100, dailyConsumption: 3, emergencyStock: 9 },
  { no: 34, name: 'OXYGEN GAS', category: 'GAS', unit: 'CYLINDERS', availableStock: 10, dailyConsumption: 0.5, emergencyStock: 2 },
  { no: 35, name: 'LPG', category: 'FUEL', unit: 'KGS', availableStock: 200, dailyConsumption: 10, emergencyStock: 30 },
  { no: 36, name: 'ACETYLENE GAS', category: 'GAS', unit: 'CYLINDERS', availableStock: 5, dailyConsumption: 0.2, emergencyStock: 1 },
]

export const STORAGE_LOCATIONS = [
  { id: 'loc-scrap', name: 'Scrap yard', code: 'SCRAP', active: true, isExternal: false },
  { id: 'loc-alloy', name: 'Alloy store', code: 'ALLOY', active: true, isExternal: false },
  { id: 'loc-sand', name: 'Sand plant', code: 'SAND', active: true, isExternal: false },
  { id: 'loc-fettling', name: 'Fettling shop', code: 'FETTL', active: true, isExternal: false },
  { id: 'loc-consumables', name: 'General consumables store', code: 'GEN', active: true, isExternal: false },
  { id: 'loc-finished', name: 'Finished goods', code: 'FG', active: true, isExternal: false },
  { id: 'loc-vendor', name: 'Outside vendor', code: 'VEND', active: true, isExternal: true },
  { id: 'loc-furnace', name: 'Furnace / production area', code: 'FURN', active: true, isExternal: false },
]

export function buildFoundryBackupPayload(existingState = null) {
  const now = new Date().toISOString()
  const defaultLoc = 'loc-consumables'

  // Map 36 materials with deterministic IDs (MAT-001 ... MAT-036)
  const materials = FOUNDRY_MATERIALS_DATA.map((row) => {
    const id = `MAT-${String(row.no).padStart(3, '0')}`
    return {
      id,
      name: row.name,
      category: row.category,
      unit: row.unit,
      packSize: 1,
      baseDailyConsumption: row.dailyConsumption,
      dailyConsumptionUnit: row.unit,
      emergencyStock: row.emergencyStock,
      avgLeadTimeDays: 5,
      maxLeadTimeDays: 10,
      supplierIds: [],
      status: 'active',
      defaultLocationId: defaultLoc,
      createdAt: now,
      updatedAt: now,
    }
  })

  // Balances
  const balances = FOUNDRY_MATERIALS_DATA.map((row) => {
    const id = `MAT-${String(row.no).padStart(3, '0')}`
    return {
      materialId: id,
      physicalStock: row.availableStock,
      reserved: 0,
      awaitingInspection: 0,
      locationId: defaultLoc,
    }
  })

  // Location balances
  const locationBalances = FOUNDRY_MATERIALS_DATA.map((row) => {
    const id = `MAT-${String(row.no).padStart(3, '0')}`
    return {
      materialId: id,
      locationId: defaultLoc,
      quantity: row.availableStock,
    }
  })

  // Application settings
  const settings = {
    id: 'app',
    productionLevelPercent: 100,
    desiredCoverageDays: 14,
    theme: 'system',
    defaultCategory: 'General',
    demoDataSeeded: false,
    storageMode: 'indexeddb+mongodb',
    cloudLastSyncedAt: now,
  }

  return {
    version: 1,
    exportedAt: now,
    materials,
    balances,
    locationBalances,
    movements: existingState?.movements ?? [],
    locations: STORAGE_LOCATIONS,
    suppliers: existingState?.suppliers ?? [],
    customers: existingState?.customers ?? [],
    purchaseOrders: existingState?.purchaseOrders ?? [],
    goodsReceipts: existingState?.goodsReceipts ?? [],
    poDispatches: existingState?.poDispatches ?? [],
    supplierInvoices: existingState?.supplierInvoices ?? [],
    productionBatches: existingState?.productionBatches ?? [],
    auditEvents: existingState?.auditEvents ?? [],
    settings: {
      ...settings,
      ...(existingState?.settings ?? {}),
      cloudLastSyncedAt: now,
    },
  }
}

async function main() {
  const uri =
    process.argv[2] ||
    process.env.MONGODB_URI ||
    'mongodb+srv://prithraj120_db_user:ycq05nHqmnSXPQm6@cluster0.n6eevrz.mongodb.net/'

  const dbName = process.env.MONGODB_DB_NAME || 'neelam_inventory'

  const maskedUri = uri.replace(/\/\/(.*?)@/, (_, creds) => {
    const [user] = creds.split(':')
    return `//${user}:****@`
  })

  console.log('='.repeat(65))
  console.log(' Neelam Industries — MongoDB Atlas Inventory Data Pusher')
  console.log('='.repeat(65))
  console.log(`Connecting to: ${maskedUri}`)
  console.log(`Target database: ${dbName}`)
  console.log('-'.repeat(65))

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 10000,
  })

  try {
    await client.connect()
    console.log('[SUCCESS] Connected to MongoDB Atlas!')

    const db = client.db(dbName)

    // 1. Check existing state to preserve suppliers/POs if present
    console.log('1. Checking existing cloud snapshot in app_state...')
    const existingDoc = await db.collection('app_state').findOne({ _id: 'current' })
    const existingPayload = existingDoc?.payload || null
    if (existingPayload) {
      console.log(`   Found existing cloud snapshot (exported: ${existingPayload.exportedAt})`)
      console.log(`   Existing suppliers: ${existingPayload.suppliers?.length || 0}, POs: ${existingPayload.purchaseOrders?.length || 0}`)
    } else {
      console.log('   No previous snapshot found. Creating fresh baseline snapshot.')
    }

    // 2. Build the snapshot payload with 36 foundry materials
    console.log('\n2. Building AppBackup v1 snapshot...')
    const payload = buildFoundryBackupPayload(existingPayload)
    console.log(`   - Materials: ${payload.materials.length} (All 36 foundry materials)`)
    console.log(`   - Balances: ${payload.balances.length}`)
    console.log(`   - Locations: ${payload.locations.length} standard storage locations`)
    console.log(`   - Version: ${payload.version}`)

    // 3. Ensure indexes in MongoDB collections
    console.log('\n3. Ensuring MongoDB entity indexes...')
    await ensureEntityIndexes(db)
    console.log('   [SUCCESS] Entity indexes verified.')

    // 4. Save into app_state snapshot collection
    console.log('\n4. Storing app_state and app_settings...')
    const updatedAt = new Date().toISOString()
    await db.collection('app_state').replaceOne(
      { _id: 'current' },
      {
        _id: 'current',
        payload,
        updatedAt,
      },
      { upsert: true },
    )

    await db.collection('app_settings').replaceOne(
      { _id: 'app' },
      {
        _id: 'app',
        payload: payload.settings,
        updatedAt,
      },
      { upsert: true },
    )
    console.log('   [SUCCESS] Snapshot saved in app_state collection.')

    // 5. Index all entities into individual MongoDB collections
    console.log('\n5. Indexing entities into individual MongoDB collections...')
    await indexBackupPayload(db, payload)
    console.log('   [SUCCESS] Materials, balances, locations, and meta collections indexed.')

    // 6. Verify by querying MongoDB back
    console.log('\n6. Verification check from MongoDB Atlas:')
    const matCount = await db.collection('materials').countDocuments()
    const balCount = await db.collection('balances').countDocuments()
    const locCount = await db.collection('locations').countDocuments()
    const metaDoc = await db.collection('sync_meta').findOne({ _id: 'current' })

    console.log(`   - materials in MongoDB: ${matCount}`)
    console.log(`   - balances in MongoDB: ${balCount}`)
    console.log(`   - locations in MongoDB: ${locCount}`)
    console.log(`   - sync_meta indexed at: ${metaDoc?.indexedAt}`)

    console.log('\n' + '='.repeat(65))
    console.log(' [COMPLETED] Required inventory data successfully pushed to MongoDB!')
    console.log(' This data can now be pulled by Netlify or any client instance.')
    console.log('='.repeat(65))

    await client.close()
    process.exit(0)
  } catch (err) {
    console.error('\n' + '!'.repeat(65))
    console.error(' [FAILED] Could not push data to MongoDB Atlas')
    console.error('!'.repeat(65))
    console.error('Error:', err.message)
    await client.close().catch(() => {})
    process.exit(1)
  }
}

if (process.argv[1] && process.argv[1].endsWith('push-to-mongo.mjs')) {
  main()
}
