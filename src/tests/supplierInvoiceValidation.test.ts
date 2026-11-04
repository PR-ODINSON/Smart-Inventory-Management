import { describe, expect, it } from 'vitest'
import {
  hasBlockingSupplierInvoiceErrors,
  validateSupplierInvoiceImport,
} from '../lib/supplierInvoiceValidation'
import { emptyParseSupplierInvoiceResult } from '../lib/supplierInvoice/parseSupplierInvoice'

describe('supplierInvoiceValidation', () => {
  it('blocks save without invoice number or lines', () => {
    const empty = emptyParseSupplierInvoiceResult()
    const issues = validateSupplierInvoiceImport(
      empty.supplier,
      empty.header,
      empty.lines,
      empty.totals,
      false,
    )
    expect(hasBlockingSupplierInvoiceErrors(issues)).toBe(true)
  })

  it('warns on qty rate mismatch without blocking', () => {
    const empty = emptyParseSupplierInvoiceResult()
    const issues = validateSupplierInvoiceImport(
      { ...empty.supplier, companyName: 'Vendor' },
      { ...empty.header, invoiceNumber: 'INV-9' },
      [
        {
          lineNo: 1,
          description: 'Item',
          itemCode: '',
          hsnSac: '',
          quantity: 10,
          unit: 'NOS',
          rate: 100,
          taxableAmount: 50,
          cgstRate: null,
          cgstAmount: null,
          sgstRate: null,
          sgstAmount: null,
          igstRate: null,
          igstAmount: null,
          lineTotal: null,
        },
      ],
      empty.totals,
      false,
    )
    expect(hasBlockingSupplierInvoiceErrors(issues)).toBe(false)
    expect(issues.some((i) => i.level === 'warning')).toBe(true)
  })
})
