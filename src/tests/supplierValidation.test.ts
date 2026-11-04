import { describe, expect, it } from 'vitest'
import {
  findDuplicateSupplier,
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
})
