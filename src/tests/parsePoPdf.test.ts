import { describe, expect, it } from 'vitest'
import { parsePoHeader, parsePoLines } from '../lib/parsePoPdf'

/** Synthetic clean layout (Format 1 row pattern). */
const p2605638Lines = [
  'PURCHASE ORDER',
  'P.O. No. P2605638',
  'P.O. Date 15/01/2026',
  'Code : N0285',
  'Buyer',
  'Kirloskar Brothers Ltd.',
  '1 ARM010002240 73259910 18 Kgs. 685.600 87.00 59647.20',
  'Nos. 4.000',
  'Indent No. : I262716233 - 10/01/2026',
  'WO No. : WO26001363 , SO No. : O25668',
  'Delivery Date : 20/03/2026',
  'DE_Housing line one',
  '2 ARM010002240 73259910 18 Kgs. 1714.000 87.00 149118.00',
  'Nos. 10.000',
  '3 ARM010002876 73259910 18 Kgs. 303.600 87.00 26413.20',
  'Nos. 2.000',
  '4 ARM010002684 73259910 18 Kgs. 771.700 87.00 67137.90',
  'Nos. 4.000',
  '5 ARM010002684 73259910 18 Kgs. 1929.250 87.00 167844.75',
  'Nos. 10.000',
  'Total Qty : 5404.150',
  '30.000',
]

describe('parsePoPdf', () => {
  it('parses P2605638 with five lines, totals, and kg/pc', () => {
    const header = parsePoHeader(p2605638Lines)
    expect(header.poNumber).toBe('P2605638')
    expect(header.vendorCode).toBe('N0285')
    expect(header.printedTotalKg).toBeCloseTo(5404.15, 3)
    expect(header.printedTotalNos).toBe(30)

    const lines = parsePoLines(p2605638Lines)
    expect(lines).toHaveLength(5)

    const sumKg = lines.reduce((s, l) => s + l.totalWeightKg, 0)
    const sumNos = lines.reduce((s, l) => s + l.quantityNos, 0)
    expect(sumKg).toBeCloseTo(5404.15, 2)
    expect(sumNos).toBe(30)

    const kgPc = lines.map((l) => l.weightPerPieceKg)
    expect(kgPc).toEqual([171.4, 171.4, 151.8, 192.925, 192.925])
  })
})
