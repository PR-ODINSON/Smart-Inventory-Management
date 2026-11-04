import { describe, expect, it } from 'vitest'
import {
  computeCustomerLineAmount,
  computeCustomerPoTotals,
  weightPerPieceKg,
} from '../services/customerPoCalculator'
import type { PurchaseOrderLine } from '../types/purchasing'

const sampleLine: PurchaseOrderLine = {
  id: 'l1',
  materialId: '',
  orderQuantity: 0,
  unit: 'nos',
  unitWeight: 0,
  weightUnit: 'kg',
  receivedQuantity: 0,
  quantityNos: 5,
  totalWeightKg: 400,
  rateBasis: 'per_kg',
  rate: 90,
  gstRate: 18,
}

describe('customerPoCalculator', () => {
  it('computes line amount as weight × rate per kg', () => {
    expect(computeCustomerLineAmount(sampleLine)).toBe(36000)
  })

  it('computes weight per piece', () => {
    expect(weightPerPieceKg(sampleLine)).toBe(80)
  })

  it('computes GST split and rounded grand total', () => {
    const totals = computeCustomerPoTotals([sampleLine])
    expect(totals.subTotal).toBe(36000)
    expect(totals.cgstAmount).toBe(3240)
    expect(totals.sgstAmount).toBe(3240)
    expect(totals.grandTotal).toBe(42480)
  })
})
