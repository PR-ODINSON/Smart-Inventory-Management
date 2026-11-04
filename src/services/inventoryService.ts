import { db } from '../storage/database'
import type { Material, MaterialComputed } from '../types/inventory'
import { computeReorderMetrics } from './reorderCalculator'
import { getSettings } from './seedService'

export async function listMaterialsComputed(): Promise<MaterialComputed[]> {
  const [materials, settings] = await Promise.all([
    db.materials.where('status').equals('active').toArray(),
    getSettings(),
  ])
  const result: MaterialComputed[] = []
  for (const material of materials) {
    const balance = await db.balances.get(material.id)
    const bal = balance ?? {
      materialId: material.id,
      physicalStock: 0,
      reserved: 0,
      awaitingInspection: 0,
      locationId: material.defaultLocationId ?? 'loc-consumables',
    }
    const metrics = computeReorderMetrics(material, {
      physicalStock: bal.physicalStock,
      reserved: bal.reserved,
      awaitingInspection: bal.awaitingInspection,
      productionLevelPercent: settings.productionLevelPercent,
      desiredCoverageDays: settings.desiredCoverageDays,
    })
    result.push({
      material,
      balance: bal,
      ...metrics,
    })
  }
  return result
}

export async function getMaterialComputed(id: string): Promise<MaterialComputed | null> {
  const material = await db.materials.get(id)
  if (!material) return null
  const settings = await getSettings()
  const balance = await db.balances.get(id)
  const bal = balance ?? {
    materialId: id,
    physicalStock: 0,
    reserved: 0,
    awaitingInspection: 0,
    locationId: material.defaultLocationId ?? 'loc-consumables',
  }
  const metrics = computeReorderMetrics(material, {
    physicalStock: bal.physicalStock,
    reserved: bal.reserved,
    awaitingInspection: bal.awaitingInspection,
    productionLevelPercent: settings.productionLevelPercent,
    desiredCoverageDays: settings.desiredCoverageDays,
  })
  return { material, balance: bal, ...metrics }
}

export async function updateInventoryBalance(
  balance: import('../types/inventory').InventoryBalance,
): Promise<void> {
  const { physicalStock, reserved, awaitingInspection } = balance
  if (physicalStock < 0 || reserved < 0 || awaitingInspection < 0) {
    throw new Error('Stock quantities cannot be negative.')
  }
  if (reserved + awaitingInspection > physicalStock) {
    throw new Error('Reserved plus inspection cannot exceed physical stock.')
  }
  await db.balances.put(balance)
}

export async function upsertMaterial(
  material: Material,
  isNew: boolean,
): Promise<void> {
  const existing = await db.materials.get(material.id)
  if (isNew && existing) {
    throw new Error(`Material ID ${material.id} already exists.`)
  }
  await db.materials.put(material)
  const bal = await db.balances.get(material.id)
  if (!bal) {
    await db.balances.put({
      materialId: material.id,
      physicalStock: 0,
      reserved: 0,
      awaitingInspection: 0,
      locationId: material.defaultLocationId ?? 'loc-consumables',
    })
  }
}

export async function archiveMaterial(id: string): Promise<void> {
  const m = await db.materials.get(id)
  if (!m) return
  m.status = 'archived'
  m.updatedAt = new Date().toISOString()
  await db.materials.put(m)
}
