import { db } from '../storage/database'
import type { Material, Supplier } from '../types/inventory'
import type { PurchaseOrder } from '../types/purchasing'
import {
  findDuplicateSupplier,
  findDuplicateSupplierEmail,
  validateSupplierForm,
} from '../lib/supplier/validation'
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
    address: input.address?.trim() || undefined,
    gstin: input.gstin?.trim() || undefined,
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
  constructor(message?: string) {
    super(message || 'This supplier is linked to existing records and cannot be deleted.')
    this.name = 'SupplierReferencedError'
  }
}

export async function createSupplier(
  input: SupplierFormInput,
  options?: { isDemo?: boolean },
): Promise<Supplier> {
  const validation = validateSupplierForm(input, { requireEmail: true })
  if (!validation.ok) {
    throw new Error(Object.values(validation.errors)[0] ?? 'Invalid supplier data.')
  }
  const all = await listSuppliers()
  const nameToCheck = input.contactPerson?.trim() || input.companyName.trim()
  const dup = findDuplicateSupplier(all, nameToCheck)
  if (dup) throw new DuplicateSupplierError(dup.id)

  if (input.email?.trim()) {
    const dupEmail = findDuplicateSupplierEmail(all, input.email)
    if (dupEmail) {
      throw new Error('A supplier with this email address already exists.')
    }
  }

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

  const validation = validateSupplierForm(input, { requireEmail: true })
  if (!validation.ok) {
    throw new Error(Object.values(validation.errors)[0] ?? 'Invalid supplier data.')
  }
  const all = await listSuppliers()
  const nameToCheck = input.contactPerson?.trim() || input.companyName.trim()
  const dup = findDuplicateSupplier(all, nameToCheck, id)
  if (dup) throw new DuplicateSupplierError(dup.id)

  if (input.email?.trim()) {
    const dupEmail = findDuplicateSupplierEmail(all, input.email, id)
    if (dupEmail) {
      throw new Error('A supplier with this email address already exists.')
    }
  }

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
  const [materials, purchaseOrders, receipts, invoices] = await Promise.all([
    db.materials.filter((m) => m.supplierIds.includes(id)).toArray(),
    db.purchaseOrders.filter((po) => po.supplierId === id).toArray(),
    db.materialReceipts.filter((r) => r.supplierId === id).toArray(),
    db.supplierInvoices.filter((inv) => inv.supplierId === id).toArray(),
  ])

  const linkages: string[] = []
  if (materials.length > 0) {
    linkages.push(
      `${materials.length} material(s) (${materials.map((m) => m.name).slice(0, 3).join(', ')}${
        materials.length > 3 ? '...' : ''
      })`,
    )
  }
  if (purchaseOrders.length > 0) {
    linkages.push(`${purchaseOrders.length} purchase order(s)`)
  }
  if (receipts.length > 0) {
    linkages.push(`${receipts.length} material receipt(s)`)
  }
  if (invoices.length > 0) {
    linkages.push(`${invoices.length} bill/invoice(s)`)
  }

  if (linkages.length > 0) {
    throw new SupplierReferencedError(
      `Cannot delete supplier. This supplier is linked to: ${linkages.join(', ')}.`,
    )
  }

  const existing = await getSupplier(id)
  if (!existing) return
  await db.suppliers.delete(id)
  await syncMaterialSupplierLinks(id, existing.materialIds, [])
}

export async function deleteSupplier(id: string): Promise<void> {
  return deleteSupplierIfUnreferenced(id)
}

export async function listPurchaseOrdersForSupplier(
  supplierId: string,
): Promise<PurchaseOrder[]> {
  return db.purchaseOrders.filter((po) => po.supplierId === supplierId).toArray()
}
