import { describe, expect, it } from 'vitest'
import { findDuplicateInvoice, matchSupplier } from '../lib/supplierInvoice/matchSupplier'
import type { Supplier } from '../types/inventory'

const s = (overrides: Partial<Supplier>): Supplier => ({
  id: 'SUP-1',
  companyName: 'Acme Metals',
  materialIds: [],
  active: true,
  ...overrides,
})

describe('matchSupplier', () => {
  it('matches by GSTIN first', () => {
    const suppliers = [
      s({ id: 'A', companyName: 'Other', gstin: '24AABCP1234F1Z5' }),
      s({ id: 'B', companyName: 'Plasma Induction' }),
    ]
    const m = matchSupplier(suppliers, {
      companyName: 'Unknown',
      gstin: '24AABCP1234F1Z5',
    })
    expect(m.kind).toBe('gstin')
    expect(m.supplier?.id).toBe('A')
  })

  it('detects duplicate invoices', () => {
    const dup = findDuplicateInvoice(
      [
        { supplierId: 'S1', invoiceNumber: 'INV-1' },
        { supplierId: 'S2', invoiceNumber: 'INV-1' },
      ],
      'S1',
      'inv-1',
    )
    expect(dup).toBe(true)
    expect(findDuplicateInvoice([], 'S1', 'INV-1')).toBe(false)
  })
})
