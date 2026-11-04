import { db } from '../storage/database'
import type { Customer } from '../types/customer'
import { normaliseCustomerName } from '../lib/poImport/matchCustomer'

function newId(): string {
  return `CUST-${crypto.randomUUID()}`
}

export async function listCustomers(): Promise<Customer[]> {
  const all = await db.customers.toArray()
  return all.filter((c) => c.active)
}

export async function upsertCustomer(
  partial: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  isNew: boolean,
): Promise<Customer> {
  const now = new Date().toISOString()
  const id = partial.id?.trim() || newId()
  const existing = await db.customers.get(id)
  if (isNew && existing) {
    throw new Error(`Customer ${id} already exists.`)
  }
  const row: Customer = {
    id,
    name: partial.name.trim(),
    gstin: partial.gstin?.trim() || undefined,
    vendorCode: partial.vendorCode?.trim() || undefined,
    contactPerson: partial.contactPerson,
    phone: partial.phone,
    email: partial.email,
    address: partial.address,
    active: partial.active ?? true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  await db.customers.put(row)
  return row
}

export function customerNameKey(name: string): string {
  return normaliseCustomerName(name)
}
