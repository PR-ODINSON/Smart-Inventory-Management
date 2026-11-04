import { describe, expect, it } from 'vitest'
import type { PurchaseOrder, PurchaseOrderLine } from '../types/purchasing'
import {
  allPurchaseOrdersTotalWeight,
  lineTotalWeight,
  purchaseOrderTotalWeight,
} from '../utils/poWeight'

const line = (qty: number, wt: number): PurchaseOrderLine => ({
  id: 'l1',
  materialId: 'm1',
  orderQuantity: qty,
  unit: 'pieces',
  unitWeight: wt,
  weightUnit: 'kg',
  receivedQuantity: 0,
})

describe('poWeight', () => {
  it('computes line total weight', () => {
    expect(lineTotalWeight(line(10, 2.5))).toBe(25)
  })

  it('sums PO weight', () => {
    const po: PurchaseOrder = {
      id: 'p1',
      poNumber: 'PO-1',
      lines: [line(10, 2), line(5, 4)],
      status: 'draft',
      approvalStatus: 'not_required',
      createdAt: '',
      updatedAt: '',
    }
    expect(purchaseOrderTotalWeight(po)).toBe(40)
  })

  it('sums all POs', () => {
    const a: PurchaseOrder = {
      id: 'a',
      poNumber: 'A',
      lines: [line(2, 10)],
      status: 'ordered',
      approvalStatus: 'approved',
      createdAt: '',
      updatedAt: '',
    }
    const b: PurchaseOrder = {
      id: 'b',
      poNumber: 'B',
      lines: [line(1, 5)],
      status: 'cancelled',
      approvalStatus: 'rejected',
      createdAt: '',
      updatedAt: '',
    }
    expect(allPurchaseOrdersTotalWeight([a, b])).toBe(25)
    expect(allPurchaseOrdersTotalWeight([a, b], { excludeCancelled: true })).toBe(20)
  })
})
