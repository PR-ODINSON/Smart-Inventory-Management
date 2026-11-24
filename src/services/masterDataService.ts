import { db } from '../storage/database'
import type { CategoryMaster, UnitMaster } from '../types/masterData'

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

/**
 * Initializes category and unit master lists from existing materials
 * if the master tables are currently empty.
 */
export async function ensureMasterDataInitialized(): Promise<void> {
  const [catCount, unitCount, materials] = await Promise.all([
    db.categories.count(),
    db.units.count(),
    db.materials.toArray(),
  ])

  const now = new Date().toISOString()

  if (catCount === 0) {
    const existingCats = new Set<string>()
    for (const m of materials) {
      if (m.category?.trim()) existingCats.add(m.category.trim())
    }
    if (existingCats.size === 0) {
      existingCats.add('General')
    }
    const toAdd: CategoryMaster[] = Array.from(existingCats).map((name) => ({
      id: newId('CAT'),
      name,
      createdAt: now,
      updatedAt: now,
    }))
    await db.categories.bulkAdd(toAdd)
  }

  if (unitCount === 0) {
    const existingUnits = new Set<string>()
    // Always include standard foundry units kg and tonne
    existingUnits.add('kg')
    existingUnits.add('tonne')
    for (const m of materials) {
      if (m.unit?.trim()) existingUnits.add(m.unit.trim())
    }
    const toAdd: UnitMaster[] = Array.from(existingUnits).map((name) => ({
      id: newId('UNIT'),
      name,
      createdAt: now,
      updatedAt: now,
    }))
    await db.units.bulkAdd(toAdd)
  }
}

// -------------------------------------------------------------
// Category Master Actions
// -------------------------------------------------------------

export async function listCategories(): Promise<CategoryMaster[]> {
  await ensureMasterDataInitialized()
  const list = await db.categories.toArray()
  return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

export async function addCategory(rawName: string): Promise<CategoryMaster> {
  const name = rawName.trim()
  if (!name) throw new Error('Category name cannot be empty.')

  const existing = await db.categories
    .filter((c) => c.name.trim().toLowerCase() === name.toLowerCase())
    .first()
  if (existing) {
    throw new Error(`Category "${name}" already exists.`)
  }

  const now = new Date().toISOString()
  const cat: CategoryMaster = {
    id: newId('CAT'),
    name,
    createdAt: now,
    updatedAt: now,
  }
  await db.categories.add(cat)
  return cat
}

export async function renameCategory(id: string, rawNewName: string): Promise<CategoryMaster> {
  const newName = rawNewName.trim()
  if (!newName) throw new Error('Category name cannot be empty.')

  const cat = await db.categories.get(id)
  if (!cat) throw new Error('Category not found.')

  const duplicate = await db.categories
    .filter((c) => c.id !== id && c.name.trim().toLowerCase() === newName.toLowerCase())
    .first()
  if (duplicate) {
    throw new Error(`Category "${newName}" already exists.`)
  }

  const oldName = cat.name
  const now = new Date().toISOString()
  cat.name = newName
  cat.updatedAt = now

  // Transaction: update category and cascade rename to materials using this category
  await db.transaction('rw', [db.categories, db.materials], async () => {
    await db.categories.put(cat)
    const affected = await db.materials.where('category').equals(oldName).toArray()
    for (const m of affected) {
      m.category = newName
      m.updatedAt = now
      await db.materials.put(m)
    }
  })

  return cat
}

export async function deleteCategory(id: string): Promise<void> {
  const cat = await db.categories.get(id)
  if (!cat) return

  // Check if any material is using this category
  const inUseCount = await db.materials.where('category').equals(cat.name).count()
  if (inUseCount > 0) {
    throw new Error(
      `Cannot remove category "${cat.name}". It is currently used by ${inUseCount} material${inUseCount === 1 ? '' : 's'}.`,
    )
  }

  await db.categories.delete(id)
}

// -------------------------------------------------------------
// Unit Master Actions
// -------------------------------------------------------------

export async function listUnits(): Promise<UnitMaster[]> {
  await ensureMasterDataInitialized()
  const list = await db.units.toArray()
  return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

export async function addUnit(rawName: string): Promise<UnitMaster> {
  const name = rawName.trim()
  if (!name) throw new Error('Unit name cannot be empty.')

  const existing = await db.units
    .filter((u) => u.name.trim().toLowerCase() === name.toLowerCase())
    .first()
  if (existing) {
    throw new Error(`Unit "${name}" already exists.`)
  }

  const now = new Date().toISOString()
  const unitRecord: UnitMaster = {
    id: newId('UNIT'),
    name,
    createdAt: now,
    updatedAt: now,
  }
  await db.units.add(unitRecord)
  return unitRecord
}

export async function renameUnit(id: string, rawNewName: string): Promise<UnitMaster> {
  const newName = rawNewName.trim()
  if (!newName) throw new Error('Unit name cannot be empty.')

  const unitRecord = await db.units.get(id)
  if (!unitRecord) throw new Error('Unit not found.')

  const duplicate = await db.units
    .filter((u) => u.id !== id && u.name.trim().toLowerCase() === newName.toLowerCase())
    .first()
  if (duplicate) {
    throw new Error(`Unit "${newName}" already exists.`)
  }

  const oldName = unitRecord.name
  const now = new Date().toISOString()
  unitRecord.name = newName
  unitRecord.updatedAt = now

  // Transaction: update unit master and cascade rename to materials using this unit
  await db.transaction('rw', [db.units, db.materials], async () => {
    await db.units.put(unitRecord)
    const affected = await db.materials.where('unit').equals(oldName).toArray()
    for (const m of affected) {
      m.unit = newName
      if (m.dailyConsumptionUnit === oldName) {
        m.dailyConsumptionUnit = newName
      }
      m.updatedAt = now
      await db.materials.put(m)
    }
  })

  return unitRecord
}

export async function deleteUnit(id: string): Promise<void> {
  const unitRecord = await db.units.get(id)
  if (!unitRecord) return

  // Check if any material is using this unit as material.unit or dailyConsumptionUnit
  const materials = await db.materials.toArray()
  const inUse = materials.filter(
    (m) =>
      m.unit?.trim().toLowerCase() === unitRecord.name.toLowerCase() ||
      m.dailyConsumptionUnit?.trim().toLowerCase() === unitRecord.name.toLowerCase(),
  )

  if (inUse.length > 0) {
    throw new Error(
      `Cannot remove unit "${unitRecord.name}". It is currently used by ${inUse.length} material${inUse.length === 1 ? '' : 's'}.`,
    )
  }

  await db.units.delete(id)
}

/**
 * Changes a material's unit.
 * Unit conversion rule:
 * - Only kg <-> tonne conversion is allowed at 1 tonne = 1000 kg.
 * - For any other unit change, stored quantity is not changed (label changes).
 */
export async function changeMaterialUnit(
  materialId: string,
  newUnit: string,
  options?: { convertKgTonneStock?: boolean },
): Promise<void> {
  const mat = await db.materials.get(materialId)
  if (!mat) throw new Error('Material not found.')

  const oldUnit = mat.unit?.trim().toLowerCase()
  const targetUnit = newUnit.trim().toLowerCase()
  const now = new Date().toISOString()

  await db.transaction('rw', [db.materials, db.balances], async () => {
    // If switching between kg and tonne and convertKgTonneStock is requested
    if (options?.convertKgTonneStock) {
      const bal = await db.balances.get(materialId)
      if (bal) {
        if (oldUnit === 'kg' && targetUnit === 'tonne') {
          bal.physicalStock /= 1000
          bal.reserved /= 1000
          bal.awaitingInspection /= 1000
          await db.balances.put(bal)
        } else if (oldUnit === 'tonne' && targetUnit === 'kg') {
          bal.physicalStock *= 1000
          bal.reserved *= 1000
          bal.awaitingInspection *= 1000
          await db.balances.put(bal)
        }
      }
    }

    mat.unit = newUnit.trim()
    mat.dailyConsumptionUnit = newUnit.trim()
    mat.updatedAt = now
    await db.materials.put(mat)
  })
}
