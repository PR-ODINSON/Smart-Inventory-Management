import { describe, expect, it } from 'vitest'
import { buildPurchaseInquiryMessage, mailtoPurchaseInquiry } from '../lib/supplier/purchaseInquiryMessage'
import type { Supplier } from '../types/inventory'

const supplier: Supplier = {
  id: 'S1',
  companyName: 'Test Vendor',
  email: 'buyer@vendor.example',
  materialIds: [],
  active: true,
}

describe('purchaseInquiryMessage', () => {
  it('builds message from requirement data', () => {
    const { body, subject, missingFields } = buildPurchaseInquiryMessage({
      supplier,
      requirement: {
        materialId: 'M1',
        materialName: 'Pig iron',
        unit: 'kg',
        quantity: 500,
        specification: 'Metallic charge',
        requestedDeliveryDate: '2026-11-01',
      },
    })
    expect(subject).toContain('Pig iron')
    expect(body).toContain('500 kg')
    expect(body).toContain('Neelam Industries')
    expect(body).toContain('2026-11-01')
    expect(missingFields).not.toContain('quantity')
  })

  it('marks missing delivery date and quantity', () => {
    const { body, missingFields } = buildPurchaseInquiryMessage({
      supplier: { ...supplier, companyName: '' },
      requirement: {
        materialId: 'M1',
        materialName: 'Sand',
        unit: 'kg',
        quantity: 0,
      },
    })
    expect(missingFields).toContain('quantity')
    expect(missingFields).toContain('delivery date')
    expect(body).toContain('[Quantity')
  })

  it('builds mailto when email present', () => {
    const url = mailtoPurchaseInquiry('a@b.co', 'Subject', 'Body text')
    expect(url).toMatch(/^mailto:/)
    expect(url).toContain('subject=')
  })
})
