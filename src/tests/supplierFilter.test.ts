import { describe, expect, it } from 'vitest'
import { filterAndSortSuppliers } from '../lib/supplier/filterSuppliers'
import type { Supplier } from '../types/inventory'

const s = (
  id: string,
  name: string,
  opts: Partial<Supplier> = {},
): Supplier => ({
  id,
  companyName: name,
  materialIds: opts.materialIds ?? [],
  active: opts.active ?? true,
  avgDeliveryDays: opts.avgDeliveryDays,
  maxDeliveryDays: opts.maxDeliveryDays,
})

describe('filterAndSortSuppliers', () => {
  const suppliers = [
    s('1', 'Zulu Supply', { avgDeliveryDays: 8, maxDeliveryDays: 12, materialIds: ['M1'] }),
    s('2', 'Alpha Metals', { avgDeliveryDays: 2, maxDeliveryDays: 4, materialIds: ['M2'], active: false }),
    s('3', 'Beta Sand', { avgDeliveryDays: 5, maxDeliveryDays: 9, materialIds: ['M1', 'M2'] }),
  ]

  it('filters by search and material', () => {
    const out = filterAndSortSuppliers(suppliers, {
      search: 'beta',
      status: 'all',
      materialId: 'M1',
      sort: 'company_asc',
    })
    expect(out.map((x) => x.id)).toEqual(['3'])
  })

  it('filters inactive only', () => {
    const out = filterAndSortSuppliers(suppliers, {
      status: 'inactive',
      sort: 'company_asc',
    })
    expect(out).toHaveLength(1)
    expect(out[0].companyName).toBe('Alpha Metals')
  })

  it('sorts by average lead time', () => {
    const out = filterAndSortSuppliers(suppliers, {
      status: 'all',
      sort: 'avgLead_asc',
    })
    expect(out[0].avgDeliveryDays).toBe(2)
    expect(out[out.length - 1].avgDeliveryDays).toBe(8)
  })
})
