import { describe, expect, it } from 'vitest'
import {
  buildCustomerPoFromDraft,
  computeRowWeightKg,
  computeTotalPoWeightKg,
  removeManualPoRow,
  validateManualPoRow,
  type ManualPoItemDraft,
} from '../lib/po/manualPoValidation'

describe('Multi-item Manual Customer PO', () => {
  const row1: ManualPoItemDraft = {
    id: 'POL-1',
    itemName: 'Flange Casting',
    castingSpec: 'FG260',
    weightPerPiece: 10,
    orderedQty: 100,
    deadline: '2026-12-10',
  }
  const row2: ManualPoItemDraft = {
    id: 'POL-2',
    itemName: 'Bearing Housing',
    castingSpec: 'SG400',
    weightPerPiece: 25,
    orderedQty: 20,
    deadline: '2026-12-15',
  }

  it('creates one PO with all items and correct Total PO Weight', () => {
    expect(computeRowWeightKg(10, 100)).toBe(1000)
    expect(computeRowWeightKg(25, 20)).toBe(500)
    expect(computeTotalPoWeightKg([row1, row2])).toBe(1500)

    const po = buildCustomerPoFromDraft({
      poId: 'PO-MULTI-1',
      customerName: 'MBH Pumps',
      poNumber: 'PO-2026-101',
      rows: [row1, row2],
      now: '2026-11-25T00:00:00.000Z',
    })

    expect(po.id).toBe('PO-MULTI-1')
    expect(po.direction).toBe('received_from_customer')
    expect(po.lines).toHaveLength(2)
    expect(po.lines[0].totalWeightKg).toBe(1000)
    expect(po.lines[1].totalWeightKg).toBe(500)
    const totalWeight = po.lines.reduce((s, l) => s + (l.totalWeightKg ?? 0), 0)
    expect(totalWeight).toBe(1500)
  })

  it('blocks removing the last item row', () => {
    const res = removeManualPoRow([row1], 0)
    expect(res.rows).toHaveLength(1)
    expect(res.error).toMatch(/At least 1 item/i)
  })

  it('blocks removing an item row that has already been dispatched', () => {
    const dispatchedRow: ManualPoItemDraft = { ...row1, dispatchedQty: 30 }
    const res = removeManualPoRow([dispatchedRow, row2], 0)
    expect(res.rows).toHaveLength(2)
    expect(res.error).toBe('Cannot remove — this item has already been dispatched.')
  })

  it('validates per-row fields (item name, weight > 0, whole pieces > 0, valid deadline)', () => {
    const invalid: ManualPoItemDraft = {
      id: 'POL-BAD',
      itemName: '  ',
      castingSpec: '',
      weightPerPiece: 0,
      orderedQty: 2.5,
      deadline: '',
    }
    const errs = validateManualPoRow(invalid)
    expect(errs.itemName).toBeDefined()
    expect(errs.weightPerPiece).toBeDefined()
    expect(errs.orderedQty).toBeDefined()
    expect(errs.deadline).toBeDefined()
  })
})
