import { db } from '../storage/database'
import type { SupplierInvoice } from '../types/supplierInvoice'

export async function listSupplierInvoices(): Promise<SupplierInvoice[]> {
  return db.supplierInvoices.toArray()
}

export async function listInvoicesForSupplier(supplierId: string): Promise<SupplierInvoice[]> {
  return db.supplierInvoices.where('supplierId').equals(supplierId).toArray()
}

export async function getSupplierInvoice(id: string): Promise<SupplierInvoice | null> {
  return (await db.supplierInvoices.get(id)) ?? null
}
