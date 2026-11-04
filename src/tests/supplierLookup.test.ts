import { describe, expect, it } from 'vitest'
import { suppliersForMaterial } from '../lib/supplier/lookup'
import type { Supplier } from '../types/inventory'

describe('suppliersForMaterial', () => {
  const suppliers: Supplier[] = [
    {
      id: 'a',
      companyName: 'Active',
      materialIds: ['MAT-1'],
      active: true,
    },
    {
      id: 'b',
      companyName: 'Inactive',
      materialIds: ['MAT-1'],
      active: false,
    },
    {
      id: 'c',
      companyName: 'Other',
      materialIds: ['MAT-2'],
      active: true,
    },
  ]

  it('returns active suppliers for a material', () => {
    const out = suppliersForMaterial(suppliers, 'MAT-1')
    expect(out.map((s) => s.id)).toEqual(['a'])
  })

  it('can include inactive when requested', () => {
    const out = suppliersForMaterial(suppliers, 'MAT-1', { activeOnly: false })
    expect(out).toHaveLength(2)
  })
})
