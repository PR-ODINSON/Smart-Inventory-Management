import { db } from '../storage/database'
import type { Material, Supplier } from '../types/inventory'
import type { PurchaseOrder } from '../types/purchasing'
import { findDuplicateSupplier, validateSupplierForm } from '../lib/supplier/validation'
import type { SupplierFormInput } from '../lib/supplier/validation'

function newSupplierId(): string {
  return `SUP-${crypto.randomUUID().slice(0, 8)}`
}

export async function listSuppliers(): Promise<Supplier[]> {
  return db.suppliers.toArray()
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  return (await db.suppliers.get(id)) ?? null
}

export async function listMaterialsForPicker(): Promise<Material[]> {
  return db.materials.orderBy('name').toArray()
}

async function syncMaterialSupplierLinks(
  supplierId: string,
  previousMaterialIds: string[],
  nextMaterialIds: string[],
): Promise<void> {
  const removed = new Set(previousMaterialIds.filter((id) => !nextMaterialIds.includes(id)))
  const added = nextMaterialIds.filter((id) => !previousMaterialIds.includes(id))
  const now = new Date().toISOString()

  for (const materialId of removed) {
    const m = await db.materials.get(materialId)
    if (!m) continue
    const supplierIds = m.supplierIds.filter((id) => id !== supplierId)
    await db.materials.put({ ...m, supplierIds, updatedAt: now })
  }
  for (const materialId of added) {
    const m = await db.materials.get(materialId)
    if (!m) continue
    if (m.supplierIds.includes(supplierId)) continue
    await db.materials.put({
      ...m,
      supplierIds: [...m.supplierIds, supplierId],
      updatedAt: now,
    })
  }
}

function formToSupplierFields(input: SupplierFormInput) {
  return {
    companyName: input.companyName.trim(),
    contactPerson: input.contactPerson?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    materialIds: [...new Set(input.materialIds)],
    avgDeliveryDays: input.avgDeliveryDays,
    maxDeliveryDays: input.maxDeliveryDays,
    active: input.active,
    notes: input.notes?.trim() || undefined,
  }
}

export class DuplicateSupplierError extends Error {
  existingId: string
  constructor(existingId: string) {
    super('A supplier with this company name already exists.')
    this.name = 'DuplicateSupplierError'
    this.existingId = existingId
  }
}

export class SupplierReferencedError extends Error {
  constructor() {
    super('This supplier is linked to purchase orders and cannot be removed. Deactivate instead.')
    this.name = 'SupplierReferencedError'
  }
}

export async function createSupplier(
  input: SupplierFormInput,
  options?: { isDemo?: boolean },
): Promise<Supplier> {
  const validation = validateSupplierForm(input)
  if (!validation.ok) {
    throw new Error(Object.values(validation.errors)[0] ?? 'Invalid supplier data.')
  }
  const all = await listSuppliers()
  const dup = findDuplicateSupplier(all, input.companyName)
  if (dup) throw new DuplicateSupplierError(dup.id)

  const now = new Date().toISOString()
  const supplier: Supplier = {
    id: newSupplierId(),
    ...formToSupplierFields(input),
    isDemo: options?.isDemo,
    createdAt: now,
    updatedAt: now,
  }
  await db.suppliers.add(supplier)
  await syncMaterialSupplierLinks(supplier.id, [], supplier.materialIds)
  return supplier
}

export async function updateSupplier(
  id: string,
  input: SupplierFormInput,
): Promise<Supplier> {
  const existing = await getSupplier(id)
  if (!existing) throw new Error('Supplier not found.')

  const validation = validateSupplierForm(input)
  if (!validation.ok) {
    throw new Error(Object.values(validation.errors)[0] ?? 'Invalid supplier data.')
  }
  const all = await listSuppliers()
  const dup = findDuplicateSupplier(all, input.companyName, id)
  if (dup) throw new DuplicateSupplierError(dup.id)

  const now = new Date().toISOString()
  const previousIds = existing.materialIds
  const updated: Supplier = {
    ...existing,
    ...formToSupplierFields(input),
    updatedAt: now,
    createdAt: existing.createdAt ?? now,
  }
  await db.suppliers.put(updated)
  await syncMaterialSupplierLinks(id, previousIds, updated.materialIds)
  return updated
}

export async function setSupplierActive(id: string, active: boolean): Promise<Supplier> {
  const existing = await getSupplier(id)
  if (!existing) throw new Error('Supplier not found.')
  const updated: Supplier = {
    ...existing,
    active,
    updatedAt: new Date().toISOString(),
  }
  await db.suppliers.put(updated)
  return updated
}

export async function deleteSupplierIfUnreferenced(id: string): Promise<void> {
  const refCount = await db.purchaseOrders.filter((po) => po.supplierId === id).count()
  if (refCount > 0) throw new SupplierReferencedError()
  const existing = await getSupplier(id)
  if (!existing) return
  await db.suppliers.delete(id)
  await syncMaterialSupplierLinks(id, existing.materialIds, [])
}

export async function listPurchaseOrdersForSupplier(
  supplierId: string,
): Promise<PurchaseOrder[]> {
  return db.purchaseOrders.filter((po) => po.supplierId === supplierId).toArray()
}
