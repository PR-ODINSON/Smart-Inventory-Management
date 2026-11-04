import type {
  ParsedSupplierInvoiceHeader,
  ParsedSupplierInvoiceLine,
  ParsedSupplierInvoiceTotals,
  ParsedSupplierParty,
} from './supplierInvoice/parseSupplierInvoice'

export type SupplierInvoiceImportIssueLevel = 'warning' | 'error'

export interface SupplierInvoiceImportIssue {
  level: SupplierInvoiceImportIssueLevel
  message: string
  lineIndex?: number
}

const AMOUNT_TOLERANCE = 1

export function validateSupplierInvoiceImport(
  supplier: ParsedSupplierParty,
  header: ParsedSupplierInvoiceHeader,
  lines: ParsedSupplierInvoiceLine[],
  totals: ParsedSupplierInvoiceTotals,
  existingDuplicate: boolean,
): SupplierInvoiceImportIssue[] {
  const issues: SupplierInvoiceImportIssue[] = []

  if (!supplier.companyName.trim()) {
    issues.push({ level: 'error', message: 'Supplier company name is required.' })
  }
  if (!header.invoiceNumber.trim()) {
    issues.push({ level: 'error', message: 'Invoice number is required.' })
  }
  if (existingDuplicate) {
    issues.push({
      level: 'warning',
      message: `An invoice with this number already exists for the selected supplier. Confirm to save anyway.`,
    })
  }
  if (lines.length === 0) {
    issues.push({ level: 'error', message: 'At least one line item is required.' })
  }

  lines.forEach((line, i) => {
    if (!line.description.trim()) {
      issues.push({
        level: 'error',
        message: `Line ${line.lineNo}: description is required.`,
        lineIndex: i,
      })
    }
    if (line.quantity <= 0) {
      issues.push({
        level: 'warning',
        message: `Line ${line.lineNo}: quantity is zero or missing.`,
        lineIndex: i,
      })
    }
    const expected = line.quantity * line.rate
    if (
      line.quantity > 0 &&
      line.rate > 0 &&
      Math.abs(expected - line.taxableAmount) > AMOUNT_TOLERANCE
    ) {
      issues.push({
        level: 'warning',
        message: `Line ${line.lineNo}: qty × rate (${expected.toFixed(2)}) ≠ taxable amount (${line.taxableAmount.toFixed(2)}).`,
        lineIndex: i,
      })
    }
  })

  const sumTaxable = lines.reduce((s, l) => s + l.taxableAmount, 0)
  if (totals.taxableValue != null && lines.length > 0) {
    if (Math.abs(sumTaxable - totals.taxableValue) > AMOUNT_TOLERANCE) {
      issues.push({
        level: 'warning',
        message: `Line taxable amounts sum to ${sumTaxable.toFixed(2)} but invoice shows ${totals.taxableValue.toFixed(2)}.`,
      })
    }
  }

  const taxSum =
    (totals.cgst ?? 0) + (totals.sgst ?? 0) + (totals.igst ?? 0) + (totals.otherCharges ?? 0)
  if (totals.grandTotal != null && totals.taxableValue != null) {
    const expectedGrand =
      totals.taxableValue + taxSum + (totals.roundOff ?? 0)
    if (Math.abs(expectedGrand - totals.grandTotal) > AMOUNT_TOLERANCE * 2) {
      issues.push({
        level: 'warning',
        message: `Taxable + taxes (${expectedGrand.toFixed(2)}) does not match grand total (${totals.grandTotal.toFixed(2)}).`,
      })
    }
  }

  return issues
}

export function hasBlockingSupplierInvoiceErrors(
  issues: SupplierInvoiceImportIssue[],
): boolean {
  return issues.some((i) => i.level === 'error')
}
