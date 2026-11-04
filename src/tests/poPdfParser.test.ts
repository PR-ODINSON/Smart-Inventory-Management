import { describe, expect, it } from 'vitest'
import { parsePurchaseOrderFromText } from '../services/poPdfParser'

const customerPoSnippet = `
PURCHASE ORDER
PO No: PO-2026-1042
Buyer: Kirloskar Brothers Ltd.
GSTIN 27AAAAA0000A1Z5

No. Item Details HSN/SAC GST % UOM Quantity Rate Amount (INR)
Item Code: ARM010002240
Description: DE_Housing_DEH Vo 50 7228 x 2_3 CJG PR00_CI FG260-RM
Indent No. I262716233 WO No. WO26001363 SO No. O25668
73259910 18 Kgs. 685.600 Nos. 4.000 87.00 59647.20
`

const customerLayoutLines = [
  'PURCHASE ORDER',
  'PO No: P2605638',
  'Buyer',
  'Kirloskar Brothers Ltd.',
  'Item Code: ARM010002240',
  'Description: DE_Housing_DEH Vo 50 7228 x 2_3 CJG PR00_CI FG260-RM',
  '73259910 18 685.600 4.000 87.00 59647.20',
]

/** GST on its own line (common PDF column split) */
const splitColumnLayout = [
  'PO No: P2605638',
  'Buyer',
  'Kirloskar Brothers Ltd.',
  'Code : N0285',
  'Item Code: ARM010002240',
  'Description: DE_Housing line one',
  '73259910',
  '18',
  '685.600',
  '4.000',
  '87.00',
  '59647.20',
  'Item Code: ARM010002876',
  'Description: DE_Housing line two',
  '73259910',
  '18',
  '303.600',
  '2.000',
  'Item Code: ARM010002999',
  'Description: third item',
  '73259910',
  '18',
  '1714.000',
  '10.000',
  'Item Code: ARM010002888',
  'Description: fourth item',
  '73259910',
  '18',
  '500.000',
  '3.000',
  'Item Code: ARM010002684',
  'Description: fifth item',
  '73259910',
  '18',
  '1929.250',
  '10.000',
]

const pigIronSnippet = `
Purchase Order Number: RM-PO-7781
Supplier: Sample Metals & Alloys (Demo)

1. Pig Iron FG 2000 kg
2. Steel Scrap 500 kg
`

describe('parsePurchaseOrderFromText', () => {
  it('parses customer PO with kg and nos', () => {
    const layout = customerPoSnippet.split('\n').map((l) => l.trim()).filter(Boolean)
    const r = parsePurchaseOrderFromText(customerPoSnippet, layout)
    expect(r.poNumber).toContain('PO-2026-1042')
    expect(r.companyName).toMatch(/Kirloskar/i)
    expect(r.lines.length).toBeGreaterThanOrEqual(1)
    const line = r.lines[0]
    expect(line.quantity).toBe(4)
    expect(line.quantityUnit).toBe('nos')
    expect(line.totalWeightKg).toBeCloseTo(685.6, 1)
    expect(line.weightPerUnitKg).toBeCloseTo(171.4, 1)
    expect(line.itemName).toContain('ARM010002240')
  })

  it('parses layout-style OEM PO (P number)', () => {
    const text = customerLayoutLines.join('\n')
    const r = parsePurchaseOrderFromText(text, customerLayoutLines)
    expect(r.poNumber).toBe('P2605638')
    expect(r.companyName).toMatch(/Kirloskar/i)
    expect(r.lines.length).toBe(1)
    expect(r.lines[0].totalWeightKg).toBeCloseTo(685.6, 1)
    expect(r.lines[0].quantity).toBe(4)
    expect(r.lines[0].totalWeightKg).not.toBe(18)
  })

  it('does not treat GST 18 as kg when columns are split', () => {
    const text = splitColumnLayout.join('\n')
    const r = parsePurchaseOrderFromText(text, splitColumnLayout)
    expect(r.companyName).toMatch(/Kirloskar/i)
    expect(r.companyName).not.toMatch(/Code/i)
    expect(r.lines.length).toBe(5)
    expect(r.lines[0].totalWeightKg).toBeCloseTo(685.6, 1)
    expect(r.lines[0].quantity).toBe(4)
    expect(r.lines.every((l) => l.totalWeightKg > 28)).toBe(true)
    expect(r.lines[4].totalWeightKg).toBeCloseTo(1929.25, 1)
    expect(r.lines[4].quantity).toBe(10)
  })

  it('parses simple raw-material lines', () => {
    const layout = pigIronSnippet.split('\n').map((l) => l.trim()).filter(Boolean)
    const r = parsePurchaseOrderFromText(pigIronSnippet, layout)
    expect(r.poNumber).toMatch(/RM-PO-7781/)
    expect(r.companyName).toMatch(/Sample Metals/i)
    expect(r.lines.length).toBe(2)
    expect(r.lines[0].itemName).toMatch(/Pig Iron/i)
    expect(r.lines[0].totalWeightKg).toBe(2000)
  })
})
