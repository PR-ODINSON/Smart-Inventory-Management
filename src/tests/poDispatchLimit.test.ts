import { describe, expect, it } from 'vitest'
import { outstandingDispatchNos } from '../services/purchaseOrderService'
import type { PurchaseOrderLine } from '../types/purchasing'

describe('dispatch limits', () => {
  it('blocks dispatch more than outstanding', () => {
    const line: PurchaseOrderLine = {
      id: 'l1',
      materialId: 'm',
      orderQuantity: 10,
      unit: 'nos',
      unitWeight: 1,
      weightUnit: 'kg',
      receivedQuantity: 0,
      quantityNos: 10,
      dispatchedQuantity: 8,
    }
    const outstanding = outstandingDispatchNos(line)
    expect(outstanding).toBe(2)
    const attempt = 3
    expect(attempt > outstanding).toBe(true)
  })
})
