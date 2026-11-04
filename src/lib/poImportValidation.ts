import type { ParsedPoHeader, ParsedPoLine } from './parsePoPdf'

export type PoImportIssueLevel = 'warning' | 'error'

export interface PoImportIssue {
  level: PoImportIssueLevel
  message: string
  lineIndex?: number
}

const AMOUNT_TOLERANCE = 0.05

export function validatePoImport(
  header: ParsedPoHeader,
  lines: ParsedPoLine[],
  existingPoNumbers: string[],
): PoImportIssue[] {
  const issues: PoImportIssue[] = []
  const poKey = header.poNumber.trim().toLowerCase()
  if (poKey && existingPoNumbers.some((p) => p.trim().toLowerCase() === poKey)) {
    issues.push({
      level: 'error',
      message: `PO number "${header.poNumber}" already exists.`,
    })
  }

  const sumKg = lines.reduce((s, l) => s + l.totalWeightKg, 0)
  const sumNos = lines.reduce((s, l) => s + l.quantityNos, 0)

  if (header.printedTotalKg != null && Math.abs(sumKg - header.printedTotalKg) > 0.001) {
    issues.push({
      level: 'error',
      message: `Line weights sum to ${sumKg.toFixed(3)} kg but PDF shows ${header.printedTotalKg.toFixed(3)} kg.`,
    })
  }
  if (header.printedTotalNos != null && Math.abs(sumNos - header.printedTotalNos) > 0.001) {
    issues.push({
      level: 'error',
      message: `Line Nos sum to ${sumNos} but PDF shows ${header.printedTotalNos}.`,
    })
  }

  lines.forEach((line, i) => {
    const expected = line.totalWeightKg * line.rate
    if (Math.abs(expected - line.amount) > AMOUNT_TOLERANCE) {
      issues.push({
        level: 'error',
        message: `Line ${line.lineNo}: kg × rate (${expected.toFixed(2)}) ≠ amount (${line.amount.toFixed(2)}).`,
        lineIndex: i,
      })
    }
  })

  return issues
}

export function hasBlockingImportErrors(issues: PoImportIssue[]): boolean {
  return issues.some((i) => i.level === 'error')
}
