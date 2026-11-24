import { db } from '../storage/database'
import type { MovementTypeMaster } from '../types/dispatch'

export const DEFAULT_MOVEMENT_TYPES: { id: string; name: string }[] = [
  { id: 'goods_receipt', name: 'Goods receipt' },
  { id: 'issue_to_production', name: 'Issue to production' },
  { id: 'transfer', name: 'Transfer' },
  { id: 'return_from_production', name: 'Return from production' },
  { id: 'return_to_supplier', name: 'Return to supplier' },
  { id: 'stock_adjustment', name: 'Stock adjustment' },
  { id: 'inspection_acceptance', name: 'Inspection acceptance' },
  { id: 'inspection_rejection', name: 'Inspection rejection' },
  { id: 'reservation', name: 'Reservation' },
  { id: 'reservation_release', name: 'Reservation release' },
]

export async function ensureMovementTypesSeeded(): Promise<MovementTypeMaster[]> {
  const existing = await db.movementTypes.toArray()
  const now = new Date().toISOString()
  if (existing.length === 0) {
    for (const t of DEFAULT_MOVEMENT_TYPES) {
      await db.movementTypes.put({
        ...t,
        createdAt: now,
        updatedAt: now,
      })
    }
    return db.movementTypes.toArray()
  }
  return existing
}

export async function listMovementTypes(): Promise<MovementTypeMaster[]> {
  return ensureMovementTypesSeeded()
}

export async function addMovementType(name: string): Promise<MovementTypeMaster> {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('Type of goods name is required.')
  }
  const all = await db.movementTypes.toArray()
  if (all.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('A goods movement type with this name already exists.')
  }
  const id = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  const now = new Date().toISOString()
  const newType: MovementTypeMaster = {
    id,
    name: trimmed,
    createdAt: now,
    updatedAt: now,
  }
  await db.movementTypes.put(newType)
  return newType
}

export async function updateMovementType(id: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('Type of goods name is required.')
  }
  const existing = await db.movementTypes.get(id)
  if (!existing) {
    throw new Error('Goods movement type not found.')
  }
  const all = await db.movementTypes.toArray()
  if (all.some((t) => t.id !== id && t.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('Another goods movement type with this name already exists.')
  }
  await db.movementTypes.update(id, { name: trimmed })
}

export async function removeMovementType(id: string): Promise<void> {
  // Check if any movements exist with this type
  const inUse = await db.movements.where('type').equals(id).count()
  if (inUse > 0) {
    throw new Error(`Cannot delete this type of goods: it is used by ${inUse} recorded movement(s).`)
  }
  await db.movementTypes.delete(id)
}
