import { describe, expect, it } from 'vitest'
import { parseSupplierInvoiceFromLayoutLines } from '../lib/supplierInvoice/parseSupplierInvoice'

/** Layout inspired by a metal supplier tax invoice (sanitized). */
const plasmaStyleLines = [
  'PLASMA INDUCTION (INDIA) PVT. LTD.',
  'GSTIN : 24AABCP1234F1Z5',
  'TAX INVOICE',
  'Invoice No. PI/25-26/1042',
  'Invoice Date : 15-03-2025',
  'Challan No. CH-8821',
  'P.O. No. PO-NEE-442',
  'Place of Supply : Gujarat',
  'Bill To',
  'NEELAM INDUSTRIES',
  'GSTIN : 27AABCN5678G1Z2',
  'S.No Description of Goods HSN/SAC Qty Unit Rate Taxable Amount',
  '1 COPPER SCRAP WIRE 74040012 500 KGS 650.00 325000.00',
  '2 BRASS TURNINGS 74040022 200 KGS 520.00 104000.00',
  'Taxable Value 429000.00',
  'CGST @ 9% 38610.00',
  'SGST @ 9% 38610.00',
  'Grand Total 506220.00',
]

/** Layout inspired by a trading enterprise invoice (sanitized). */
const madhavStyleLines = [
  'MADHAV ENTERPRISE',
  'GSTIN: 27AABCM9876H1Z4',
  'Tax Invoice',
  'Invoice No: ME/2025/118',
  'Dated: 02/04/2025',
  'Buyer',
  'NEELAM INDUSTRIES PVT LTD',
  'GSTIN 27AABCN5678G1Z2',
  'Description HSN/SAC Qty Rate Amount',
  '1 STEEL BILLET 72061020 10 MT 45000.00 450000.00',
  'Invoice Total 531000.00',
  'IGST @ 18% 81000.00',
]

describe('parseSupplierInvoice', () => {
  it('extracts plasma-style supplier, invoice header, lines, and totals', () => {
    const r = parseSupplierInvoiceFromLayoutLines(plasmaStyleLines)
    expect(r.supplier.companyName).toContain('PLASMA')
    expect(r.supplier.gstin).toBe('24AABCP1234F1Z5')
    expect(r.header.invoiceNumber).toBe('PI/25-26/1042')
    expect(r.header.invoiceDate).toBe('2025-03-15')
    expect(r.header.challanNumber).toBe('CH-8821')
    expect(r.header.purchaseOrderRef).toBe('PO-NEE-442')
    expect(r.lines).toHaveLength(2)
    expect(r.lines[0].hsnSac).toBe('74040012')
    expect(r.lines[0].quantity).toBe(500)
    expect(r.lines[0].taxableAmount).toBe(325000)
    expect(r.totals.taxableValue).toBe(429000)
    expect(r.totals.cgst).toBe(38610)
    expect(r.totals.grandTotal).toBe(506220)
  })

  it('extracts madhav-style invoice with IGST', () => {
    const r = parseSupplierInvoiceFromLayoutLines(madhavStyleLines)
    expect(r.supplier.companyName).toContain('MADHAV')
    expect(r.supplier.gstin).toBe('27AABCM9876H1Z4')
    expect(r.header.invoiceNumber).toBe('ME/2025/118')
    expect(r.header.invoiceDate).toBe('2025-04-02')
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].unit).toBe('MT')
    expect(r.totals.grandTotal).toBe(531000)
    expect(r.totals.igst).toBe(81000)
  })

  it('handles missing line items with warnings', () => {
    const r = parseSupplierInvoiceFromLayoutLines(['TAX INVOICE', 'Invoice No. X1'])
    expect(r.lines).toHaveLength(0)
    expect(r.warnings.some((w) => /line items/i.test(w))).toBe(true)
  })
})
