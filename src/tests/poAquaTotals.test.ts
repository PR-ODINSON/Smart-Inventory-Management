import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parsePoLinesFromRows, readPdfRowsFromBytes } from '../lib/parsePoPdf'
import { computeCustomerPoTotals } from '../services/customerPoCalculator'
import { poTotalKg, poTotalNos, customerTotalsForPo } from '../lib/po/poSelectors'
import type { PurchaseOrder, PurchaseOrderLine } from '../types/purchasing'

const aquaPath = join(process.cwd(), '__fixtures__', 'aqua.pdf')

describe('imported Aqua PO totals', () => {
  const run = existsSync(aquaPath) ? it : it.skip

  run('shows 5 lines, 5404.150 kg, 30 nos, grand total 554790.00', async () => {
    const data = new Uint8Array(readFileSync(aquaPath))
    const rows = await readPdfRowsFromBytes(data)
    const parsed = parsePoLinesFromRows(rows)

    const lines: PurchaseOrderLine[] = parsed.map((l, i) => ({
      id: `l${i}`,
      materialId: 'IMPORT',
      orderQuantity: l.quantityNos,
      unit: 'nos',
      unitWeight: l.weightPerPieceKg,
      weightUnit: 'kg',
      receivedQuantity: 0,
      buyerItemCode: l.itemCode,
      description: l.itemName,
      quantityNos: l.quantityNos,
      totalWeightKg: l.totalWeightKg,
      rate: l.rate,
      gstRate: l.gstRate,
      lineAmount: l.amount,
    }))

    const po: PurchaseOrder = {
      id: 'PO-test',
      poNumber: 'AQUA-TEST',
      direction: 'received_from_customer',
      lines,
      status: 'ordered',
      approvalStatus: 'not_required',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    expect(po.lines).toHaveLength(5)
    expect(poTotalKg(po)).toBeCloseTo(5404.15, 2)
    expect(poTotalNos(po)).toBe(30)

    const totals = computeCustomerPoTotals(lines)
    expect(totals.grandTotal).toBe(554790)
    expect(customerTotalsForPo(po).grandTotal).toBe(554790)
  })
})
