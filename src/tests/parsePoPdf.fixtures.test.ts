import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  buildParseDebugInfo,
  detectPoFormat,
  parsePoLinesFromRows,
  parsePoHeaderFromRows,
  readPdfRowsFromBytes,
} from '../lib/parsePoPdf'

const FIXTURE_DIR = join(process.cwd(), '__fixtures__')

const FIXTURES = [
  {
    file: 'aqua.pdf',
    format: 'aqua' as const,
    lines: 5,
    totalKg: 5404.15,
    totalNos: 30,
    kgPc: [171.4, 171.4, 151.8, 192.925, 192.925],
  },
  {
    file: 'sbpumps.pdf',
    format: 'sb_pumps' as const,
    lines: 5,
    totalKg: 2250,
    totalNos: 38,
    kgPc: null as number[] | null,
  },
  {
    file: 'mbh.pdf',
    format: 'mbh' as const,
    lines: 2,
    totalKg: 195.76,
    totalNos: 8,
    kgPc: null as number[] | null,
  },
]

function fixturePath(name: string): string {
  return join(FIXTURE_DIR, name)
}

describe('parsePoPdf fixtures', () => {
  for (const fx of FIXTURES) {
    const path = fixturePath(fx.file)
    const describeFn = existsSync(path) ? describe : describe.skip

    describeFn(fx.file, () => {
      it('extracts rows and logs debug sample', async () => {
        const data = new Uint8Array(readFileSync(path))
        const rows = await readPdfRowsFromBytes(data)
        const format = detectPoFormat(rows)
        const debug = buildParseDebugInfo(rows, format)

        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify({
            file: fx.file,
            detectedFormat: format,
            rowCount: rows.length,
            first40: JSON.parse(debug.sampleRowsJson),
          }),
        )

        expect(format).toBe(fx.format)
        expect(rows.length).toBeGreaterThan(10)
      })

      it('parses expected line totals', async () => {
        const data = new Uint8Array(readFileSync(path))
        const rows = await readPdfRowsFromBytes(data)
        const lines = parsePoLinesFromRows(rows)
        const header = parsePoHeaderFromRows(rows)

        expect(lines).toHaveLength(fx.lines)

        const sumKg = lines.reduce((s, l) => s + l.totalWeightKg, 0)
        const sumNos = lines.reduce((s, l) => s + l.quantityNos, 0)
        expect(sumKg).toBeCloseTo(fx.totalKg, 2)
        expect(sumNos).toBe(fx.totalNos)

        if (fx.kgPc) {
          expect(lines.map((l) => l.weightPerPieceKg)).toEqual(fx.kgPc)
        }

        if (header.printedTotalKg != null) {
          expect(header.printedTotalKg).toBeCloseTo(fx.totalKg, 2)
        }
        if (header.printedTotalNos != null) {
          expect(header.printedTotalNos).toBe(fx.totalNos)
        }
      })
    })
  }
})
