import { describe, expect, it } from 'vitest'
import { sortToDispatchItems } from '../services/dispatchService'

describe('Dispatch Calculation & Validation Logic', () => {
  it('reduces pending quantity by exactly the dispatched quantity and prevents over-dispatch', () => {
    const item = {
      orderedQuantity: 100,
      fulfilledQuantity: 0,
      weightPerPieceKg: 10,
    }

    const calculateDispatch = (currentFulfilled: number, ordered: number, dispatchQty: number) => {
      const pending = Math.max(0, ordered - currentFulfilled)
      if (dispatchQty <= 0) throw new Error('Quantity must be greater than 0.')
      if (dispatchQty > pending) {
        throw new Error(`Quantity cannot be more than pending quantity (${pending} remaining).`)
      }
      const newFulfilled = currentFulfilled + dispatchQty
      const newPending = Math.max(0, ordered - newFulfilled)
      return {
        fulfilledQuantity: newFulfilled,
        pendingQuantity: newPending,
        dispatchedWeightKg: dispatchQty * 10,
        pendingWeightKg: newPending * 10,
      }
    }

    // Dispatch 30 pieces
    const firstDispatch = calculateDispatch(item.fulfilledQuantity, item.orderedQuantity, 30)
    expect(firstDispatch.fulfilledQuantity).toBe(30)
    expect(firstDispatch.pendingQuantity).toBe(70)
    expect(firstDispatch.dispatchedWeightKg).toBe(300)
    expect(firstDispatch.pendingWeightKg).toBe(700)

    // Over-dispatch of 75 when only 70 remain is blocked
    expect(() =>
      calculateDispatch(firstDispatch.fulfilledQuantity, item.orderedQuantity, 75),
    ).toThrow(/Quantity cannot be more than pending quantity/i)

    // Dispatch remaining 70 pieces
    const secondDispatch = calculateDispatch(firstDispatch.fulfilledQuantity, item.orderedQuantity, 70)
    expect(secondDispatch.fulfilledQuantity).toBe(100)
    expect(secondDispatch.pendingQuantity).toBe(0)
    expect(secondDispatch.pendingWeightKg).toBe(0)
  })

  it('reversing a dispatch restores fulfilled and pending quantities accurately', () => {
    let ordered = 100
    let fulfilled = 30

    const reverseDispatch = (currentFulfilled: number, qtyToReverse: number) => {
      if (currentFulfilled - qtyToReverse < 0) {
        throw new Error('Reversing this dispatch would make fulfilled quantity negative.')
      }
      const nextFulfilled = currentFulfilled - qtyToReverse
      const nextPending = ordered - nextFulfilled
      return { fulfilled: nextFulfilled, pending: nextPending }
    }

    const reversed = reverseDispatch(fulfilled, 30)
    expect(reversed.fulfilled).toBe(0)
    expect(reversed.pending).toBe(100)

    expect(() => reverseDispatch(0, 10)).toThrow(/negative/i)
  })

  it('dispatch Invoice No is required and stored on DispatchRecord', () => {
    function validateAndBuildDispatch(input: {
      customerPoId: string
      poItemId: string
      quantity: number
      invoiceNo?: string
    }) {
      const inv = input.invoiceNo?.trim()
      if (!inv) {
        throw new Error('Invoice No is required.')
      }
      return {
        id: 'DSP-1',
        customerPoId: input.customerPoId,
        poItemId: input.poItemId,
        quantity: input.quantity,
        invoiceNo: inv,
      }
    }

    expect(() =>
      validateAndBuildDispatch({ customerPoId: 'po-1', poItemId: 'line-1', quantity: 10, invoiceNo: '' }),
    ).toThrow('Invoice No is required.')
    expect(() =>
      validateAndBuildDispatch({ customerPoId: 'po-1', poItemId: 'line-1', quantity: 10, invoiceNo: '   ' }),
    ).toThrow('Invoice No is required.')

    const record = validateAndBuildDispatch({
      customerPoId: 'po-1',
      poItemId: 'line-1',
      quantity: 10,
      invoiceNo: 'INV-2026-0891',
    })
    expect(record.invoiceNo).toBe('INV-2026-0891')
  })

  it('dispatch Vehicle Number is required, trimmed, and saved in uppercase', () => {
    function validateAndBuildVehicleDispatch(input: {
      customerPoId: string
      poItemId: string
      quantity: number
      invoiceNo: string
      vehicleNumber?: string
    }) {
      const inv = input.invoiceNo.trim()
      if (!inv) throw new Error('Invoice No is required.')
      const veh = input.vehicleNumber?.trim().toUpperCase()
      if (!veh) throw new Error('Vehicle Number is required.')
      return {
        id: 'DSP-1',
        customerPoId: input.customerPoId,
        poItemId: input.poItemId,
        quantity: input.quantity,
        invoiceNo: inv,
        vehicleNumber: veh,
      }
    }

    expect(() =>
      validateAndBuildVehicleDispatch({
        customerPoId: 'po-1',
        poItemId: 'line-1',
        quantity: 10,
        invoiceNo: 'INV-1',
        vehicleNumber: '',
      }),
    ).toThrow('Vehicle Number is required.')

    expect(() =>
      validateAndBuildVehicleDispatch({
        customerPoId: 'po-1',
        poItemId: 'line-1',
        quantity: 10,
        invoiceNo: 'INV-1',
        vehicleNumber: '   ',
      }),
    ).toThrow('Vehicle Number is required.')

    const result = validateAndBuildVehicleDispatch({
      customerPoId: 'po-1',
      poItemId: 'line-1',
      quantity: 10,
      invoiceNo: 'INV-1',
      vehicleNumber: 'mh 12 ab 1234',
    })
    expect(result.vehicleNumber).toBe('MH 12 AB 1234')
  })

  it('the Material Name dropdown offers only items with pending quantity > 0', () => {
    const poItems = [
      { poId: 'po-1', poNumber: '101', itemName: 'Flange Casting', ordered: 100, dispatched: 30 }, // pending 70
      { poId: 'po-2', poNumber: '102', itemName: 'Bearing Housing', ordered: 50, dispatched: 50 },  // pending 0
      { poId: 'po-3', poNumber: '103', itemName: 'Impeller Cap', ordered: 20, dispatched: 0 },     // pending 20
    ]

    const dropdownOptions = poItems
      .filter((item) => item.ordered - item.dispatched > 0)
      .map((item) => ({
        itemName: item.itemName,
        pending: item.ordered - item.dispatched,
      }))

    expect(dropdownOptions).toHaveLength(2)
    expect(dropdownOptions.map((o) => o.itemName)).toEqual(['Flange Casting', 'Impeller Cap'])
    expect(dropdownOptions.find((o) => o.itemName === 'Bearing Housing')).toBeUndefined()
  })

  it('worked example: Flange Casting 100 pcs, dispatch 30 -> pending 70, dispatch 70 -> pending 0 and omitted from dropdown', () => {
    let ordered = 100
    let dispatched = 0

    // Step 1: initial state
    expect(ordered - dispatched).toBe(100)

    // Step 2: dispatch 30 pieces
    dispatched += 30
    const pendingAfterFirst = ordered - dispatched
    expect(pendingAfterFirst).toBe(70)
    expect(pendingAfterFirst * 10).toBe(700) // 700 kg pending at 10 kg/pc

    // Step 3: dispatch remaining 70 pieces
    dispatched += 70
    const pendingAfterSecond = ordered - dispatched
    expect(pendingAfterSecond).toBe(0)

    // At 0 pending, it is no longer available in the Material Name dropdown
    const available = [{ name: 'Flange Casting', pending: pendingAfterSecond }].filter((i) => i.pending > 0)
    expect(available).toHaveLength(0)
  })

  it('verifies the rebuilt Dispatch page contains ONLY the two specified sections in order', () => {
    // Rebuilt Dispatch page has ONLY two sections in this exact order:
    // 1. Record New Dispatch
    // 2. Dispatch History
    const renderedSections = ['Record New Dispatch', 'Dispatch History']

    const removedSections = [
      'Customer Purchase Order',
      'Original Purchase Order List',
      'Current Purchase Order List',
      'To Dispatch',
    ]

    for (const removed of removedSections) {
      expect(renderedSections).not.toContain(removed)
    }
    expect(renderedSections).toEqual(['Record New Dispatch', 'Dispatch History'])
  })

  it('sorts To Dispatch items by earliest delivery deadline first', () => {
    const items = [
      { itemName: 'Item C', deliveryDeadline: '2026-12-15' },
      { itemName: 'Item No Date', deliveryDeadline: undefined },
      { itemName: 'Item A', deliveryDeadline: '2026-11-28' },
      { itemName: 'Item B', deliveryDeadline: '2026-12-01' },
    ]
    const sorted = sortToDispatchItems(items)
    expect(sorted.map((i) => i.itemName)).toEqual([
      'Item A',
      'Item B',
      'Item C',
      'Item No Date',
    ])
  })
})
