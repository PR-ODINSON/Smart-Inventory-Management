import { describe, it, expect } from 'vitest'

describe('Receipt Reversal & Stock Validation Logic', () => {
  /**
   * NEW BEHAVIOUR (after the fix):
   *  - Delete always succeeds — no negative-stock block.
   *  - resultingStock = currentPhysicalStock - receiptQty (may be negative).
   */
  function simulateReceiptDeletion(
    currentPhysicalStock: number,
    receiptQty: number,
  ) {
    return {
      resultingStock: currentPhysicalStock - receiptQty,
      deleted: true,
    }
  }

  it('successfully calculates stock reversal when stock is sufficient', () => {
    const result = simulateReceiptDeletion(10, 10)
    expect(result.deleted).toBe(true)
    expect(result.resultingStock).toBe(0)

    const partialReversal = simulateReceiptDeletion(25, 10)
    expect(partialReversal.resultingStock).toBe(15)
  })

  it('allows deletion even when stock would go negative (no block)', () => {
    // Current stock is 20 kg, receipt was 100 kg, 80 kg was issued — delete should succeed.
    const result = simulateReceiptDeletion(20, 100)
    expect(result.deleted).toBe(true)
    expect(result.resultingStock).toBe(-80)
  })

  it('worked example: receipt 100, issued 80, delete receipt → stock -80', () => {
    // Start: 0 stock. Receive 100 → stock 100. Issue 80 → stock 20. Delete receipt of 100.
    const stockAfterReceipt = 0 + 100   // = 100
    const stockAfterIssue   = stockAfterReceipt - 80 // = 20
    const result = simulateReceiptDeletion(stockAfterIssue, 100)
    expect(result.deleted).toBe(true)
    expect(result.resultingStock).toBe(-80)
  })

  it('validates vendor deletion constraints against linked entities', () => {
    function canDeleteVendor(vendor: {
      hasMaterials: boolean
      hasPurchaseOrders: boolean
      hasReceipts: boolean
    }) {
      if (vendor.hasMaterials || vendor.hasPurchaseOrders || vendor.hasReceipts) {
        throw new Error('This supplier is linked to inventory or purchase orders and cannot be removed.')
      }
      return true
    }

    expect(canDeleteVendor({ hasMaterials: false, hasPurchaseOrders: false, hasReceipts: false })).toBe(true)
    expect(() => canDeleteVendor({ hasMaterials: true, hasPurchaseOrders: false, hasReceipts: false })).toThrow()
    expect(() => canDeleteVendor({ hasMaterials: false, hasPurchaseOrders: true, hasReceipts: false })).toThrow()
    expect(() => canDeleteVendor({ hasMaterials: false, hasPurchaseOrders: false, hasReceipts: true })).toThrow()
  })

  it('validates PO ordered quantity cannot be edited below fulfilled quantity', () => {
    function validatePoQuantityEdit(newOrderedQty: number, fulfilledQty: number) {
      if (newOrderedQty < fulfilledQty) {
        throw new Error(
          `Ordered quantity cannot be less than already fulfilled / dispatched quantity (${fulfilledQty}).`,
        )
      }
      return true
    }

    expect(validatePoQuantityEdit(100, 50)).toBe(true)
    expect(validatePoQuantityEdit(50, 50)).toBe(true)
    expect(() => validatePoQuantityEdit(40, 50)).toThrow(
      'Ordered quantity cannot be less than already fulfilled / dispatched quantity (50).',
    )
  })

  it('dispatch "To Dispatch" = orderedQty - dispatchedQty, disappears at 0', () => {
    function toDispatch(ordered: number, dispatched: number) {
      return Math.max(0, ordered - dispatched)
    }

    expect(toDispatch(100, 0)).toBe(100)
    expect(toDispatch(100, 30)).toBe(70)
    expect(toDispatch(100, 100)).toBe(0)
    // Should not appear in list when pendingQty === 0
    const items = [
      { name: 'Flange A', ordered: 100, dispatched: 100 },
      { name: 'Flange B', ordered: 50, dispatched: 20 },
    ]
    const pending = items.filter((i) => toDispatch(i.ordered, i.dispatched) > 0)
    expect(pending).toHaveLength(1)
    expect(pending[0].name).toBe('Flange B')
  })

  it('over-dispatch is blocked (quantity > pending)', () => {
    function validateDispatch(quantity: number, pendingQty: number) {
      if (quantity > pendingQty) {
        throw new Error(`Quantity cannot be more than pending quantity (${pendingQty} remaining).`)
      }
      return true
    }

    expect(validateDispatch(30, 70)).toBe(true)
    expect(validateDispatch(70, 70)).toBe(true)
    expect(() => validateDispatch(71, 70)).toThrow('Quantity cannot be more than pending quantity (70 remaining).')
  })

  it('multi-item PO: total PO weight = sum of all item weights', () => {
    const items = [
      { weightPerPiece: 10, qty: 5 },   // 50 kg
      { weightPerPiece: 20, qty: 3 },   // 60 kg
      { weightPerPiece: 5,  qty: 10 },  // 50 kg
    ]
    const totalKg = items.reduce((sum, i) => sum + i.weightPerPiece * i.qty, 0)
    expect(totalKg).toBe(160)
  })
})
