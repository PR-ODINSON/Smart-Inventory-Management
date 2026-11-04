import type { PdfRow } from '../pdfRowExtract'
import { normalizePdfText } from '../pdfRowExtract'

export type PoPdfFormat = 'aqua' | 'sb_pumps' | 'mbh' | 'unknown'

/** Parser selection from letterhead keywords (not customer legal name). */
export function detectPoFormat(rows: PdfRow[]): PoPdfFormat {
  const text = rows.map((r) => r.text).join('\n')
  if (/Pump Raw Material|ARM0100\d{4}|P\.?O\.?\s*No\.?\s*:?\s*P\d{6,}/i.test(text)) {
    return 'aqua'
  }
  if (/SBPSPL-PO|DESCRIPTION OF GOODS.*HSN.*QTY.*Kg|SB Pumps Solutions/i.test(text)) {
    return 'sb_pumps'
  }
  if (/Part No \/ HSN Code|ORD-\d{5}-\d{4}|MBH PUMPS/i.test(text)) {
    return 'mbh'
  }
  return 'unknown'
}

export interface LetterheadCustomerHint {
  companyName: string
  /** When buyer GST is not extractable as text from the PDF sample. */
  buyerGstin?: string
}

/** Fallback customer name when signing block is missing (source = letterhead). */
export function letterheadCustomerHint(format: PoPdfFormat): LetterheadCustomerHint | null {
  switch (format) {
    case 'aqua':
      return { companyName: 'AQUA MACHINERIES P. LIMITED' }
    case 'sb_pumps':
      return {
        companyName: 'SB Pumps Solutions Private Limited',
        buyerGstin: '24ABICS0605D1ZV',
      }
    case 'mbh':
      return {
        companyName: 'MBH PUMPS (GUJ) PVT. LTD.',
        buyerGstin: '24AAACM7934L1Z8',
      }
    default:
      return null
  }
}

export function formatKeywordInSigner(format: PoPdfFormat, signerName: string): boolean {
  const n = normalizePdfText(signerName).toUpperCase()
  switch (format) {
    case 'aqua':
      return n.includes('AQUA')
    case 'sb_pumps':
      return n.includes('SB PUMP')
    case 'mbh':
      return n.includes('MBH')
    default:
      return true
  }
}
