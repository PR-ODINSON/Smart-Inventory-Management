/**
 * @vitest-environment node
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parseSupplierBillPdfBytes } from '../lib/supplierInvoice/parseSupplierInvoice'

const FIXTURE_DIR = join(process.cwd(), '__fixtures__')

const BILLS = [
  {
    file: 'supplier-plasma.pdf',
    source: join(process.cwd(), 'supplier.pdf'),
    supplier: /Plasma/i,
    invoice: 'PI/26/1021',
    grandTotal: 19470,
  },
  {
    file: 'madhav-bill-62.pdf',
    source: join(process.cwd(), 'madhav bill 62.pdf'),
    supplier: /Madhav/i,
    invoice: '62',
    grandTotal: 122838,
  },
]

describe('supplier bill PDF fixtures', () => {
  for (const bill of BILLS) {
    const fixturePath = join(FIXTURE_DIR, bill.file)
    const readPath = existsSync(fixturePath)
      ? fixturePath
      : existsSync(bill.source)
        ? bill.source
        : null

    it(`parses ${bill.file}`, async () => {
      if (!readPath) {
        expect.soft(readPath).toBeTruthy()
        return
      }
      const bytes = new Uint8Array(readFileSync(readPath))
      const result = await parseSupplierBillPdfBytes(bytes)

      expect(result.scanned).toBe(false)
      expect(result.supplier.companyName).toMatch(bill.supplier)
      expect(result.supplier.gstin.length).toBe(15)
      expect(result.header.invoiceNumber).toBe(bill.invoice)
      expect(result.lines.length).toBeGreaterThan(0)
      expect(result.totals.grandTotal).toBe(bill.grandTotal)
    })
  }
})
