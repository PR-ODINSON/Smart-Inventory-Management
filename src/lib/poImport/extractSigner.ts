import { OUR_GSTIN } from '../../config/company'
import type { PdfRow } from '../pdfRowExtract'
import { joinRowCells, normalizePdfText } from '../pdfRowExtract'
import { detectPoFormat, letterheadCustomerHint, type PoPdfFormat } from './detect'

export type SignerSource = 'signature' | 'letterhead' | null

export interface ExtractSignerResult {
  companyName: string | null
  source: SignerSource
  rowText?: string
  page?: number
}

export interface ExtractBuyerGstinResult {
  buyerGstin: string | null
}

const GSTIN_RE = /\b(\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/g

const COMPANY_SUFFIX =
  /\b(?:LIMITED|LTD\.?|PVT\.?\s*LTD\.?|PRIVATE\s+LIMITED|LLP|INDUSTRIES|ENTERPRISES|P\.?\s*LIMITED)\s*\.?\s*$/i

const SIGNATURE_MARKERS =
  /Authorised|Authorized|Prepared\s+By|Computer\s+Generated|Authorised\s+Sign/i

const CELL_GAP_MIN = 36

function splitRowByCellGaps(row: PdfRow): string[] {
  if (row.cells.length < 2) return [row.text]
  const sorted = [...row.cells].sort((a, b) => a.x - b.x)
  const segments: typeof sorted[] = [[]]
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].x - sorted[i - 1].x > CELL_GAP_MIN) {
      segments.push([])
    }
    segments[segments.length - 1].push(sorted[i])
  }
  return segments.map((seg) => joinRowCells(seg)).filter(Boolean)
}

function endsWithCompanySuffix(name: string): boolean {
  return COMPANY_SUFFIX.test(name.trim())
}

function cleanCompanyName(raw: string): string {
  let name = normalizePdfText(raw)
  name = name.replace(/,+\s*$/g, '')
  if (/PVT\.\s*LTD$/i.test(name)) {
    name = `${name}.`
  }
  return normalizePdfText(name.replace(/\s+,/g, ','))
}

function tryMatchForCompany(text: string): string | null {
  const re =
    /\bfor\s*,?\s+([A-Z][A-Za-z0-9&.,()'\- ]{2,80}?\b(?:LIMITED|LTD\.?|PVT\.?\s*LTD\.?|PRIVATE\s+LIMITED|LLP|INDUSTRIES|ENTERPRISES|P\.?\s*LIMITED))/i
  const m = re.exec(text)
  if (!m?.[1]) return null
  const name = cleanCompanyName(m[1])
  if (!endsWithCompanySuffix(name)) return null
  if (/^FOR\s+[A-Z]+\s+Pumps\s+works$/i.test(name)) return null
  if (/\bworks$/i.test(name) && !/PVT|LTD|LIMITED|LLP/i.test(name)) return null
  return name
}

function isBottomThird(row: PdfRow): boolean {
  if (row.pageHeight == null || row.pageHeight <= 0) return false
  return row.y <= row.pageHeight * 0.3
}

function hasSignatureContext(rows: PdfRow[], index: number): boolean {
  for (let j = index + 1; j < Math.min(index + 9, rows.length); j++) {
    if (SIGNATURE_MARKERS.test(rows[j].text)) return true
  }
  return false
}

export function extractSigner(rows: PdfRow[]): ExtractSignerResult {
  const candidates: { name: string; row: PdfRow; rowText: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const texts = [...splitRowByCellGaps(row), row.text]
    for (const text of texts) {
      const name = tryMatchForCompany(text)
      if (!name) continue
      const okContext = hasSignatureContext(rows, i) || isBottomThird(row)
      if (!okContext) continue
      candidates.push({ name, row, rowText: text })
    }
  }

  if (candidates.length > 0) {
    const last = candidates[candidates.length - 1]
    return {
      companyName: last.name,
      source: 'signature',
      rowText: last.rowText,
      page: last.row.page,
    }
  }

  const format = detectPoFormat(rows)
  const hint = letterheadCustomerHint(format)
  if (hint) {
    return {
      companyName: hint.companyName,
      source: 'letterhead',
    }
  }

  return { companyName: null, source: null }
}

function collectGstins(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(GSTIN_RE)) {
    const g = m[1]
    if (g !== OUR_GSTIN) out.push(g)
  }
  return out
}

export function extractBuyerGstin(rows: PdfRow[], format?: PoPdfFormat): ExtractBuyerGstinResult {
  const fmt = format ?? detectPoFormat(rows)
  const allText = rows.map((r) => r.text).join('\n')
  const found = new Set<string>()

  for (const g of collectGstins(allText)) found.add(g)

  // Aqua: GST NO. near signing block (often merged with item text on page 2)
  for (const row of rows) {
    if (/GST\s+NO\.?/i.test(row.text)) {
      for (const g of collectGstins(row.text)) found.add(g)
    }
  }

  // SB: letterhead "GST No." (not supplier "GST ID")
  for (const row of rows.slice(0, 25)) {
    if (/GST\s+No\.?/i.test(row.text) && !/GST\s+ID/i.test(row.text)) {
      for (const g of collectGstins(row.text)) found.add(g)
    }
  }

  // MBH: header GST No (buyer column — exclude supplier column if only ours)
  for (const row of rows.slice(0, 20)) {
    if (/GST\s+No/i.test(row.text)) {
      for (const seg of splitRowByCellGaps(row)) {
        if (/GST\s+No/i.test(seg)) {
          for (const g of collectGstins(seg)) found.add(g)
        }
      }
    }
  }

  if (found.size > 0) {
    return { buyerGstin: [...found][found.size - 1] ?? null }
  }

  const hint = letterheadCustomerHint(fmt)
  if (hint?.buyerGstin) {
    return { buyerGstin: hint.buyerGstin }
  }

  return { buyerGstin: null }
}
