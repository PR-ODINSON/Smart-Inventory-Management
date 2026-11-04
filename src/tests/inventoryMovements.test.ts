import { describe, expect, it } from 'vitest'
import { simulateMovementOnBalance } from '../services/inventoryMovementService'
import type { InventoryBalance } from '../types/inventory'
import { outstandingQty, recomputePoStatus } from '../services/purchaseOrderService'
import type { PurchaseOrderLine } from '../types/purchasing'

const balance: InventoryBalance = {
  materialId: 'MAT-001',
  physicalStock: 100,
  reserved: 10,
  awaitingInspection: 5,
  locationId: 'loc-1',
}

describe('inventory movements (simulate)', () => {
  it('goods receipt increases physical', () => {
    const next = simulateMovementOnBalance(balance, 'goods_receipt', 20)
    expect(next.physicalStock).toBe(120)
  })

  it('issue decreases physical', () => {
    const next = simulateMovementOnBalance(balance, 'issue_to_production', 15)
    expect(next.physicalStock).toBe(85)
  })

  it('reservation increases reserved only', () => {
    const next = simulateMovementOnBalance(balance, 'reservation', 5)
    expect(next.reserved).toBe(15)
    expect(next.physicalStock).toBe(100)
  })

  it('inspection acceptance reduces awaiting', () => {
    const next = simulateMovementOnBalance(balance, 'inspection_acceptance', 5)
    expect(next.awaitingInspection).toBe(0)
  })

  it('inspection rejection reduces both', () => {
    const next = simulateMovementOnBalance(balance, 'inspection_rejection', 5)
    expect(next.awaitingInspection).toBe(0)
    expect(next.physicalStock).toBe(95)
  })
})

describe('purchase orders', () => {
  it('tracks outstanding quantity', () => {
    const line: PurchaseOrderLine = {
      id: 'l1',
      materialId: 'm',
      orderQuantity: 100,
      unit: 'kg',
      unitWeight: 1,
      weightUnit: 'kg',
      receivedQuantity: 30,
    }
    expect(outstandingQty(line)).toBe(70)
  })

  it('recomputes partial and received status', () => {
    const po = {
      id: 'p',
      poNumber: 'PO-1',
      lines: [
        {
          id: 'l1',
          materialId: 'm',
          orderQuantity: 10,
          unit: 'kg',
          unitWeight: 1,
          weightUnit: 'kg',
          receivedQuantity: 5,
        },
      ],
      status: 'ordered' as const,
      approvalStatus: 'approved' as const,
      createdAt: '',
      updatedAt: '',
    }
    expect(recomputePoStatus(po)).toBe('partially_received')
    po.lines[0].receivedQuantity = 10
    expect(recomputePoStatus(po)).toBe('received')
  })
})
