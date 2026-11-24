import { describe, expect, it } from 'vitest'

describe('Category and Unit validation logic', () => {
  it('validates category and unit name uniqueness and trimming', () => {
    const existing = ['General', 'Metallic Charge', 'Sand & Binders']

    const checkDuplicate = (name: string, list: string[]) => {
      const trimmed = name.trim().toLowerCase()
      if (!trimmed) throw new Error('Name cannot be empty')
      return list.some((item) => item.trim().toLowerCase() === trimmed)
    }

    expect(checkDuplicate('general', existing)).toBe(true)
    expect(checkDuplicate('  General  ', existing)).toBe(true)
    expect(checkDuplicate('New Category', existing)).toBe(false)
    expect(() => checkDuplicate('   ', existing)).toThrow(/empty/i)
  })

  it('blocks deletion when category or unit is in use by materials', () => {
    const materials = [
      { id: 'm1', name: 'Pig Iron', category: 'Metallic Charge', unit: 'kg' },
      { id: 'm2', name: 'Silica Sand', category: 'Sand', unit: 'kg' },
    ]

    const canDeleteCategory = (catName: string) => {
      const count = materials.filter((m) => m.category.toLowerCase() === catName.toLowerCase()).length
      if (count > 0) {
        throw new Error(`Cannot remove category "${catName}". It is currently used by ${count} materials.`)
      }
      return true
    }

    const canDeleteUnit = (unitName: string) => {
      const count = materials.filter((m) => m.unit.toLowerCase() === unitName.toLowerCase()).length
      if (count > 0) {
        throw new Error(`Cannot remove unit "${unitName}". It is currently used by ${count} materials.`)
      }
      return true
    }

    expect(() => canDeleteCategory('Metallic Charge')).toThrow(/currently used by 1 materials/i)
    expect(canDeleteCategory('Unused Category')).toBe(true)

    expect(() => canDeleteUnit('kg')).toThrow(/currently used by 2 materials/i)
    expect(canDeleteUnit('tonne')).toBe(true)
  })
})
