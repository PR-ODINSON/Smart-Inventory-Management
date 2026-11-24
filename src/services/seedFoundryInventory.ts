import { db } from '../storage/database'
import type { Material } from '../types/inventory'
import {
  FOUNDRY_MATERIALS,
  type FoundryMaterialSeedRow,
} from '../data/foundryInventorySeedData'
import { ensureFoundryMasterData } from './masterDataService'

export { FOUNDRY_MATERIALS, type FoundryMaterialSeedRow }

function newMaterialId(): string {
  return `MAT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

export interface SeedFoundryResult {
  inserted: number
  updated: number
  keptPreExisting: number
  totalMaterials: number
}

/**
 * Seeds the 36 foundry raw materials into the inventory in ONE Dexie transaction.
 * Uses an idempotent upsert by material name (case-insensitive, trimmed):
 * - If not found: INSERT with all values from the table.
 * - If found: UPDATE Category, Unit, Available Stock, Daily Consumption, and Emergency Stock.
 * - Does NOT delete any pre-existing materials.
 * - Does NOT create duplicate records on repeated runs.
 */
export async function seedFoundryMaterials(
  materials: FoundryMaterialSeedRow[] = FOUNDRY_MATERIALS,
): Promise<SeedFoundryResult> {
  // 1. Ensure Categories & Units are present in master tables
  await ensureFoundryMasterData()

  let inserted = 0
  let updated = 0
  let keptPreExisting = 0
  let totalMaterials = 0

  const now = new Date().toISOString()

  // 2. Perform idempotent upsert in ONE Dexie transaction
  await db.transaction('rw', [db.materials, db.balances, db.locationBalances], async () => {
    const existingMaterials = await db.materials.toArray()
    const byName = new Map<string, Material>()
    for (const m of existingMaterials) {
      byName.set(m.name.trim().toLowerCase(), m)
    }

    const matchedIds = new Set<string>()

    for (const row of materials) {
      const trimmedName = row.name.trim()
      const normalizedName = trimmedName.toLowerCase()
      const existing = byName.get(normalizedName)

      if (existing) {
        // UPDATE existing material fields
        existing.category = row.category
        existing.unit = row.unit
        existing.baseDailyConsumption = row.dailyConsumption
        existing.dailyConsumptionUnit = row.unit
        existing.emergencyStock = row.emergencyStock
        existing.status = 'active'
        existing.updatedAt = now

        await db.materials.put(existing)

        // Update balance
        const defaultLoc = existing.defaultLocationId || 'loc-consumables'
        await db.balances.put({
          materialId: existing.id,
          physicalStock: row.availableStock,
          reserved: 0,
          awaitingInspection: 0,
          locationId: defaultLoc,
        })

        await db.locationBalances.put({
          materialId: existing.id,
          locationId: defaultLoc,
          quantity: row.availableStock,
        })

        matchedIds.add(existing.id)
        updated++
      } else {
        // INSERT new material
        const id = newMaterialId()
        const defaultLoc = 'loc-consumables'

        const newMat: Material = {
          id,
          name: trimmedName,
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

        await db.materials.add(newMat)

        await db.balances.put({
          materialId: id,
          physicalStock: row.availableStock,
          reserved: 0,
          awaitingInspection: 0,
          locationId: defaultLoc,
        })

        await db.locationBalances.put({
          materialId: id,
          locationId: defaultLoc,
          quantity: row.availableStock,
        })

        matchedIds.add(id)
        inserted++
      }
    }

    keptPreExisting = existingMaterials.filter((m) => !matchedIds.has(m.id)).length
    totalMaterials = await db.materials.count()
  })

  return {
    inserted,
    updated,
    keptPreExisting,
    totalMaterials,
  }
}
