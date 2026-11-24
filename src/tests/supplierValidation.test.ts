import { describe, expect, it } from 'vitest'
import {
  findDuplicateSupplier,
  findDuplicateSupplierEmail,
  normalizeCompanyName,
  validateLeadTimes,
  validateSupplierForm,
} from '../lib/supplier/validation'
import type { Supplier } from '../types/inventory'

const baseSupplier = (overrides: Partial<Supplier> = {}): Supplier => ({
  id: 'SUP-1',
  companyName: 'Acme Metals',
  materialIds: [],
  active: true,
  ...overrides,
})

describe('supplier validation', () => {
  it('requires company name and contact', () => {
    const r = validateSupplierForm({
      companyName: '',
      avgDeliveryDays: 5,
      maxDeliveryDays: 10,
      materialIds: [],
      active: true,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.companyName).toBeTruthy()
      expect(r.errors.contact).toBeTruthy()
    }
  })

  it('accepts phone as contact', () => {
    const r = validateSupplierForm({
      companyName: 'Acme',
      phone: '9876543210',
      avgDeliveryDays: 3,
      maxDeliveryDays: 7,
      materialIds: [],
      active: true,
    })
    expect(r.ok).toBe(true)
  })

  it('rejects max lead below average', () => {
    expect(validateLeadTimes(10, 5)).toMatch(/maximum/i)
  })

  it('detects duplicate normalized company names', () => {
    const list = [
      baseSupplier({ id: 'a', companyName: 'Acme  Metals' }),
      baseSupplier({ id: 'b', companyName: 'Other Co' }),
    ]
    const dup = findDuplicateSupplier(list, 'acme metals')
    expect(dup?.id).toBe('a')
    expect(findDuplicateSupplier(list, 'acme metals', 'a')).toBeNull()
  })

  it('normalizes whitespace in company names', () => {
    expect(normalizeCompanyName('  Foo   Bar  ')).toBe('foo bar')
  })

  it('validates required email and email format when requireEmail is true', () => {
    const withoutEmail = validateSupplierForm(
      {
        companyName: 'Acme',
        avgDeliveryDays: 3,
        maxDeliveryDays: 7,
        materialIds: [],
        active: true,
      },
      { requireEmail: true },
    )
    expect(withoutEmail.ok).toBe(false)
    if (!withoutEmail.ok) {
      expect(withoutEmail.errors.email).toBe('Email address is required.')
    }

    const invalidEmail = validateSupplierForm(
      {
        companyName: 'Acme',
        email: 'invalid-email-address',
        avgDeliveryDays: 3,
        maxDeliveryDays: 7,
        materialIds: [],
        active: true,
      },
      { requireEmail: true },
    )
    expect(invalidEmail.ok).toBe(false)
    if (!invalidEmail.ok) {
      expect(invalidEmail.errors.email).toBe('Enter a valid email address.')
    }

    const validEmail = validateSupplierForm(
      {
        companyName: 'Acme',
        email: 'supplier@acme.com',
        avgDeliveryDays: 3,
        maxDeliveryDays: 7,
        materialIds: [],
        active: true,
      },
      { requireEmail: true },
    )
    expect(validEmail.ok).toBe(true)
  })

  it('detects duplicate email case-insensitively', () => {
    const list = [
      baseSupplier({ id: 's1', companyName: 'Acme', email: 'sales@acme.com' }),
      baseSupplier({ id: 's2', companyName: 'Beta', email: 'orders@beta.in' }),
    ]

    expect(findDuplicateSupplierEmail(list, 'SALES@ACME.COM')?.id).toBe('s1')
    expect(findDuplicateSupplierEmail(list, '  sales@acme.com  ')?.id).toBe('s1')
    expect(findDuplicateSupplierEmail(list, 'sales@acme.com', 's1')).toBeNull()
    expect(findDuplicateSupplierEmail(list, 'unknown@other.com')).toBeNull()
  })

  it('detects duplicate supplier name via contactPerson or companyName', () => {
    const list = [
      baseSupplier({ id: 's1', companyName: 'Acme Alloys', contactPerson: 'John Doe' }),
    ]

    expect(findDuplicateSupplier(list, 'acme alloys')?.id).toBe('s1')
    expect(findDuplicateSupplier(list, 'john doe')?.id).toBe('s1')
    expect(findDuplicateSupplier(list, 'Jane Doe')).toBeNull()
  })
})
