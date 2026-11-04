import { describe, expect, it } from 'vitest'
import { formatQtyWithUnit } from '../lib/po/poSelectors'
import { outstandingQty } from '../services/purchaseOrderService'
import type { PurchaseOrderLine } from '../types/purchasing'

describe('raw-material tonne line', () => {
  it('shows received and outstanding in tonnes', () => {
    const line: PurchaseOrderLine = {
      id: 'l1',
      materialId: 'sand',
      orderQuantity: 2,
      unit: 'tonnes',
      unitWeight: 1000,
      weightUnit: 'kg',
      receivedQuantity: 0.5,
      unitPrice: 1000,
    }
    const out = outstandingQty(line)
    expect(formatQtyWithUnit(line.receivedQuantity, line.unit)).toBe('0.5 t')
    expect(formatQtyWithUnit(out, line.unit)).toBe('1.5 t')
  })
})
