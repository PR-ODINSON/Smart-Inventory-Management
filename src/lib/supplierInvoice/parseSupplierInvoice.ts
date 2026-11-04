import {
  groupPiecesIntoRows,
  rowsToLayoutLines,
  type PdfRow,
} from '../pdfRowExtract'
import { readPdfRowsFromBytes } from '../parsePoPdf'
import {
  extractGstinFromText,
  extractLabelValue,
  extractPanFromText,
  looksScannedDocument,
  parseDdMmYyyyToIso,
  parseDecimal,
} from './extract'

export const MAX_SUPPLIER_BILL_BYTES = 10 * 1024 * 1024

export interface ParsedSupplierParty {
  companyName: string
  contactPerson: string
  phone: string
  email: string
  gstin: string
  pan: string
  address: string
  state: string
  stateCode: string
}

export interface ParsedSupplierInvoiceHeader {
  invoiceNumber: string
  invoiceDate: string
  challanNumber: string
  purchaseOrderRef: string
  paymentTerms: string
  placeOfSupply: string
}

export interface ParsedSupplierInvoiceLine {
  lineNo: number
  description: string
  itemCode: string
  hsnSac: string
  quantity: number
  unit: string
  rate: number
  taxableAmount: number
  cgstRate: number | null
  cgstAmount: number | null
  sgstRate: number | null
  sgstAmount: number | null
  igstRate: number | null
  igstAmount: number | null
  lineTotal: number | null
}

export interface ParsedSupplierInvoiceTotals {
  taxableValue: number | null
  cgst: number | null
  sgst: number | null
  igst: number | null
  otherCharges: number | null
  roundOff: number | null
  grandTotal: number | null
}

export interface ParseSupplierInvoiceResult {
  supplier: ParsedSupplierParty
  header: ParsedSupplierInvoiceHeader
  lines: ParsedSupplierInvoiceLine[]
  totals: ParsedSupplierInvoiceTotals
  layoutLines: string[]
  rows: PdfRow[]
  scanned: boolean
  warnings: string[]
}

const BUYER_HINTS = /NEELAM|BILL\s+TO|BUYER|CONSIGNEE|M\/s\.?\s*:/i

const INVOICE_NO_LABELS = [
  /Invoice\s*(?:No\.?|#|Number)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/\-\.]+)/i,
  /Bill\s*(?:No\.?|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/\-\.]+)/i,
  /Tax\s+Invoice\s*(?:No\.?)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/\-\.]+)/i,
]

const INVOICE_DATE_LABELS = [
  /Invoice\s+Date\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})/i,
  /Bill\s+Date\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})/i,
  /Dated\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})/i,
]

/** Description then HSN (e.g. generic tax invoices). */
const LINE_WITH_HSN_RE =
  /^(\d{1,3})\s+(.+?)\s+(\d{4,8})\s+([\d,]+\.?\d*)\s+(KGS?|NOS?|PCS?\.?|MT|TONS?|LTR?S?|BAGS?)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/i

/** Item code after line no (Plasma-style). */
const LINE_CODE_HSN_RE =
  /^(\d{1,3})\s+((?=.*\d)[A-Z0-9\-]{5,})\s+(.+?)\s+(\d{8})\s+([\d,]+\.?\d*)\s+(KGS?|NOS?|PCS?\.?|MT)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/i

/** Qty + unit + rate + amount (Madhav-style). */
const LINE_QTY_UNIT_RATE_RE =
  /^(\d{1,3})\s+(.+?)\s+([\d,]+\.?\d*)\s+(KGS?|NOS?|PCS?\.?|MT|Sqf\.?)\s+([\d,]+\.?\d*)\s+([\d,]+)\s*\.?\s*\d*/i

const LINE_SIMPLE_RE =
  /^(\d{1,3})\s+(.+?)\s+([\d,]+\.?\d*)\s+(KGS?|NOS?|PCS?\.?|MT)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/i

function emptyParty(): ParsedSupplierParty {
  return {
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    gstin: '',
    pan: '',
    address: '',
    state: '',
    stateCode: '',
  }
}

function emptyHeader(): ParsedSupplierInvoiceHeader {
  return {
    invoiceNumber: '',
    invoiceDate: '',
    challanNumber: '',
    purchaseOrderRef: '',
    paymentTerms: '',
    placeOfSupply: '',
  }
}

function emptyTotals(): ParsedSupplierInvoiceTotals {
  return {
    taxableValue: null,
    cgst: null,
    sgst: null,
    igst: null,
    otherCharges: null,
    roundOff: null,
    grandTotal: null,
  }
}

export function emptyParseSupplierInvoiceResult(): ParseSupplierInvoiceResult {
  return {
    supplier: emptyParty(),
    header: emptyHeader(),
    lines: [],
    totals: emptyTotals(),
    layoutLines: [],
    rows: [],
    scanned: false,
    warnings: [],
  }
}

function pickSupplierGstin(lines: string[], allGstins: string[]): string {
  const sellerIdx = lines.findIndex((l) => /Seller\s+Detail/i.test(l))
  const buyerIdx = lines.findIndex((l) => BUYER_HINTS.test(l))
  if (sellerIdx >= 0) {
    const end = buyerIdx > sellerIdx ? buyerIdx : sellerIdx + 30
    const sellerGst = extractGstinFromText(lines.slice(sellerIdx, end).join('\n'))
    if (sellerGst[0]) return sellerGst[0]
  }

  const buyerGstins = new Set<string>()
  for (let i = 0; i < lines.length; i++) {
    if (!BUYER_HINTS.test(lines[i])) continue
    const window = lines.slice(i, i + 10).join(' ')
    for (const g of extractGstinFromText(window)) buyerGstins.add(g)
  }
  const sellerCandidates = allGstins.filter((g) => !buyerGstins.has(g))
  if (sellerCandidates.length > 0) return sellerCandidates[0]
  if (allGstins.length === 1) return allGstins[0]
  return allGstins[0] ?? ''
}

function inferSupplierName(lines: string[], gstin: string): string {
  const head = lines[0]?.trim() ?? ''
  if (
    head.length >= 4 &&
    !BUYER_HINTS.test(head) &&
    /ENTERPRISE|INDUSTRIES|INDUCTION|PVT|LTD|LIMITED/i.test(head)
  ) {
    return head
  }

  if (gstin) {
    const idx = lines.findIndex((l) => l.toUpperCase().includes(gstin))
    if (idx > 0) {
      for (let i = idx - 1; i >= Math.max(0, idx - 8); i--) {
        const t = lines[i].trim()
        if (t.length < 3 || /invoice|tax|gstin|bill to|ship to|GST|PAN/i.test(t)) continue
        if (/^\d{5,}/.test(t) || /AHMEDABAD|PINCODE|ROAD/i.test(t)) continue
        if (/^[A-Z0-9\-\/]+$/.test(t) && t.length < 12) continue
        if (/ENTERPRISE|INDUSTRIES|INDUCTION|PVT|LTD|LIMITED/i.test(t)) return t
      }
    }
  }
  const sellerIdx = lines.findIndex((l) => /Seller\s+Detail/i.test(l))
  if (sellerIdx >= 0) {
    for (let i = sellerIdx + 1; i < Math.min(lines.length, sellerIdx + 5); i++) {
      const t = lines[i].trim()
      if (t.length < 4 || /GST|PAN|Udyam|State/i.test(t)) continue
      return t
    }
  }
  for (const line of lines.slice(0, 25)) {
    const t = line.trim()
    if (t.length < 4) continue
    if (/tax\s+invoice|original|duplicate|triplicate|debit\s+memo/i.test(t)) continue
    if (BUYER_HINTS.test(t)) break
    if (
      /PVT|LTD|LIMITED|ENTERPRISE|INDUSTRIES|INDUCTION|METAL|TRADING|CORP/i.test(t)
    ) {
      return t
    }
  }
  return ''
}

function extractContactFields(text: string): {
  phone: string
  email: string
  contactPerson: string
} {
  const emailM = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  const phoneM = text.match(/(?:Mob\.?|Phone|Tel\.?|Contact)\s*[:\-]?\s*([+\d][\d\s\-]{8,14}\d)/i)
  const personM = text.match(/Contact\s+Person\s*[:\-]?\s*([A-Za-z .]{3,40})/i)
  return {
    email: emailM?.[0] ?? '',
    phone: phoneM?.[1]?.replace(/\s/g, '') ?? '',
    contactPerson: personM?.[1]?.trim() ?? '',
  }
}

function extractAddressBlock(lines: string[], gstin: string, companyName: string): string {
  const sellerIdx = lines.findIndex((l) => /Seller\s+Detail/i.test(l))
  if (sellerIdx >= 0) {
    const parts: string[] = []
    for (let i = sellerIdx + 1; i < Math.min(lines.length, sellerIdx + 8); i++) {
      const t = lines[i].trim()
      if (!t || t === companyName || /GST|PAN|Udyam|State|Rev\./i.test(t)) break
      parts.push(t)
    }
    if (parts.length > 0) return parts.join(', ')
  }
  if (!gstin) return ''
  const idx = lines.findIndex((l) => l.includes(gstin))
  if (idx < 0) return ''
  const parts: string[] = []
  for (let i = Math.max(0, idx - 5); i < idx; i++) {
    const t = lines[i].trim()
    if (t === companyName || t.length < 8 || /invoice|GSTIN/i.test(t)) continue
    if (/ENTERPRISE|INDUSTRIES|INDUCTION/i.test(t) && t === companyName) continue
    parts.push(t)
  }
  return parts.join(', ')
}

function extractInvoiceNumber(lines: string[]): string {
  for (const line of lines) {
    if (!/Invoice\s+No/i.test(line)) continue
    const pi = line.match(/PI\/[A-Z0-9\/\-]+/i)
    if (pi) return pi[0]
    const onLine = line.match(
      /Invoice\s+No\.?\s*(?::\s*)+([A-Z0-9][A-Z0-9\/\-]+)/i,
    )
    if (onLine) return onLine[1].trim()
  }

  const joined = lines.join('\n')
  const generic = joined.match(
    /Invoice\s+No\.?\s*(?::\s*)+([A-Z0-9][A-Z0-9\/\-]+)(?:\s+Cust|\s+Date)/i,
  )
  if (generic) return generic[1].trim()

  const invIdx = lines.findIndex((l) => /Invoice\s+No/i.test(l))
  if (invIdx >= 0) {
    for (let i = invIdx; i < Math.min(lines.length, invIdx + 8); i++) {
      const t = lines[i].trim()
      if (/^\d{1,6}$/.test(t)) return t
    }
  }

  return extractLabelValue(lines, INVOICE_NO_LABELS)
}

function extractInvoiceDate(lines: string[]): string {
  const joined = lines.join(' ')
  const m =
    joined.match(/Invoice\s+Date\s*[:\-]?\s*(\d{1,2}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{4})/i) ??
    joined.match(/Invoice\s+No\.?\s*Date\s+(\d{1,2}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{4})/i) ??
    joined.match(/Challan\s+No\s*Date\s+(\d{1,2}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{4})/i)
  if (m) return parseDdMmYyyyToIso(m[1])
  return parseDdMmYyyyToIso(extractLabelValue(lines, INVOICE_DATE_LABELS))
}

function parseTotalsSection(lines: string[]): ParsedSupplierInvoiceTotals {
  const totals = emptyTotals()
  const joined = lines.join('\n')
  const taxableM =
    joined.match(/Total\s+Assessable\s+Value\s*[:\-]?\s*([\d,]+\.?\d*)/i) ??
    joined.match(/Taxable\s+Value\s*[:\-]?\s*([\d,]+\.?\d*)/i) ??
    joined.match(/Total\s+Taxable\s*[:\-]?\s*([\d,]+\.?\d*)/i) ??
    joined.match(/Sub\s+Total\s+([\d,]+\.?\d*)/i) ??
    joined.match(/Assessable\s+Value\s*[:\-]?\s*([\d,]+\.?\d*)/i)
  if (taxableM) totals.taxableValue = parseDecimal(taxableM[1])

  const cgstM = joined.match(/CGST\s*(?:@\s*[\d.]+%)?\s*[:\-]?\s*([\d,]+\.?\d*)/i)
  const sgstM = joined.match(/SGST\s*(?:@\s*[\d.]+%)?\s*[:\-]?\s*([\d,]+\.?\d*)/i)
  const igstM = joined.match(/IGST\s*(?:@\s*[\d.]+%)?\s*[:\-]?\s*([\d,]+\.?\d*)/i)
  if (cgstM) totals.cgst = parseDecimal(cgstM[1])
  if (sgstM) totals.sgst = parseDecimal(sgstM[1])
  if (igstM) totals.igst = parseDecimal(igstM[1])

  const roundM = joined.match(/Round\s*[- ]?Off\s*[:\-]?\s*([\d,]+\.?\d*)/i)
  if (roundM) totals.roundOff = parseDecimal(roundM[1])

  const grandM =
    joined.match(/Total\s+Invoice\s+Value\s*[:\-]?\s*([\d,]+\.?\d*)/i) ??
    joined.match(/Grand\s+Total\s*[:\-]?\s*([\d,]+\.?\d*)/i) ??
    joined.match(/Invoice\s+Total\s*[:\-]?\s*([\d,]+\.?\d*)/i) ??
    joined.match(/Total\s+Amount\s*[:\-]?\s*([\d,]+\.?\d*)/i)
  if (grandM) totals.grandTotal = parseDecimal(grandM[1])

  const otherM = joined.match(/Other\s+Charges?\s*[:\-]?\s*([\d,]+\.?\d*)/i)
  if (otherM) totals.otherCharges = parseDecimal(otherM[1])

  return totals
}

function findTableStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]
    if ((/Sr\.?\s*No|SrNo/i.test(t) || /S\.?\s*No/i.test(t)) && /Particular|HSN|Qty/i.test(t)) {
      let start = i + 1
      if (start < lines.length && /^No\./i.test(lines[start])) start++
      return start
    }
    if (/HSN|SAC/i.test(t) && /Description|Particulars/i.test(t)) return i + 1
    if (/S\.?\s*No/i.test(t) && /Qty/i.test(t)) return i + 1
  }
  return -1
}

function isLineStop(text: string): boolean {
  return (
    /^Total\b/i.test(text) ||
    /^Sub\s*Total/i.test(text) ||
    /^Remarks\b/i.test(text) ||
    /^Bank\b/i.test(text) ||
    /^CGST\b/i.test(text) ||
    /^SGST\b/i.test(text) ||
    /^Value\s+in\s+words/i.test(text)
  )
}

function parseLineFromRow(text: string): ParsedSupplierInvoiceLine | null {
  const hsn = LINE_WITH_HSN_RE.exec(text)
  if (hsn) {
    const qty = parseDecimal(hsn[4])
    const rate = parseDecimal(hsn[6])
    const taxable = parseDecimal(hsn[7])
    return {
      lineNo: parseInt(hsn[1], 10),
      description: hsn[2].trim(),
      itemCode: '',
      hsnSac: hsn[3],
      quantity: qty,
      unit: hsn[5].replace(/\./g, '').toUpperCase(),
      rate,
      taxableAmount: taxable,
      cgstRate: null,
      cgstAmount: null,
      sgstRate: null,
      sgstAmount: null,
      igstRate: null,
      igstAmount: null,
      lineTotal: taxable,
    }
  }

  const coded = LINE_CODE_HSN_RE.exec(text)
  if (coded) {
    const qty = parseDecimal(coded[5])
    const rate = parseDecimal(coded[7])
    const taxable = parseDecimal(coded[8])
    return {
      lineNo: parseInt(coded[1], 10),
      description: coded[3].trim(),
      itemCode: coded[2].trim(),
      hsnSac: coded[4],
      quantity: qty,
      unit: coded[6].replace(/\./g, '').toUpperCase(),
      rate,
      taxableAmount: taxable,
      cgstRate: null,
      cgstAmount: null,
      sgstRate: null,
      sgstAmount: null,
      igstRate: null,
      igstAmount: null,
      lineTotal: taxable,
    }
  }

  const qtyUnit = LINE_QTY_UNIT_RATE_RE.exec(text)
  if (qtyUnit) {
    const qty = parseDecimal(qtyUnit[3])
    const rate = parseDecimal(qtyUnit[5])
    const taxable = parseDecimal(qtyUnit[6])
    return {
      lineNo: parseInt(qtyUnit[1], 10),
      description: qtyUnit[2].trim(),
      itemCode: '',
      hsnSac: '',
      quantity: qty,
      unit: qtyUnit[4].replace(/\./g, '').toUpperCase(),
      rate,
      taxableAmount: taxable,
      cgstRate: null,
      cgstAmount: null,
      sgstRate: null,
      sgstAmount: null,
      igstRate: null,
      igstAmount: null,
      lineTotal: taxable,
    }
  }

  const simple = LINE_SIMPLE_RE.exec(text)
  if (simple) {
    const qty = parseDecimal(simple[3])
    const rate = parseDecimal(simple[5])
    const taxable = parseDecimal(simple[6])
    return {
      lineNo: parseInt(simple[1], 10),
      description: simple[2].trim(),
      itemCode: '',
      hsnSac: '',
      quantity: qty,
      unit: simple[4].replace(/\./g, '').toUpperCase(),
      rate,
      taxableAmount: taxable,
      cgstRate: null,
      cgstAmount: null,
      sgstRate: null,
      sgstAmount: null,
      igstRate: null,
      igstAmount: null,
      lineTotal: taxable,
    }
  }
  if (/^Total\b/i.test(text) || /^Sub\s*Total/i.test(text)) return null
  return null
}

export function parseSupplierInvoiceFromLayoutLines(lines: string[]): ParseSupplierInvoiceResult {
  const warnings: string[] = []
  const fullText = lines.join('\n')
  const allGstins = extractGstinFromText(fullText)
  const gstin = pickSupplierGstin(lines, allGstins)
  const companyName = inferSupplierName(lines, gstin)
  const supplier: ParsedSupplierParty = {
    ...emptyParty(),
    companyName,
    gstin,
    pan: extractPanFromText(gstin ? gstin : fullText),
    address: extractAddressBlock(lines, gstin, companyName),
    ...extractContactFields(fullText),
  }

  const stateM = fullText.match(/State\s*(?:Name)?\s*[:\-]?\s*([A-Za-z ]+?)(?:\s+State\s+Code|\s+\d{2}\b|$)/i)
  const stateCodeM = fullText.match(/State\s+Code\s*[:\-]?\s*(\d{2})/i)
  if (stateM) supplier.state = stateM[1].trim()
  if (stateCodeM) supplier.stateCode = stateCodeM[1]
  else if (gstin.length >= 2) supplier.stateCode = gstin.slice(0, 2)

  const header: ParsedSupplierInvoiceHeader = {
    ...emptyHeader(),
    invoiceNumber: extractInvoiceNumber(lines),
    invoiceDate: extractInvoiceDate(lines),
    challanNumber: extractLabelValue(lines, [/Challan\s*(?:No\.?)?\s*[:\-]?\s*([A-Z0-9\/\-]+)/i]),
    purchaseOrderRef: extractLabelValue(lines, [
      /P\.?O\.?\s*(?:No\.?|Ref\.?)?\s*[:\-]?\s*([A-Z0-9\/\-]+)/i,
      /Purchase\s+Order\s*[:\-]?\s*([A-Z0-9\/\-]+)/i,
    ]),
    paymentTerms: extractLabelValue(lines, [/Payment\s+Terms?\s*[:\-]?\s*(.+)/i]),
    placeOfSupply: extractLabelValue(lines, [/Place\s+of\s+Supply\s*[:\-]?\s*(.+)/i]),
  }

  const parsedLines: ParsedSupplierInvoiceLine[] = []
  const start = findTableStart(lines)
  const scanFrom = start >= 0 ? start : 0
  for (let i = scanFrom; i < lines.length; i++) {
    if (isLineStop(lines[i]) && parsedLines.length > 0) break
    const row = parseLineFromRow(lines[i])
    if (!row) continue
    if (i + 1 < lines.length) {
      const next = lines[i + 1].trim()
      if (
        next &&
        !/^\d{1,3}\s/.test(next) &&
        !isLineStop(next) &&
        !/^(GST|PAN|State)\b/i.test(next)
      ) {
        row.description = `${row.description} ${next}`.trim()
        i++
      }
    }
    parsedLines.push(row)
  }

  const totals = parseTotalsSection(lines)

  if (!supplier.companyName) warnings.push('Supplier name could not be extracted — please enter it.')
  if (!header.invoiceNumber) warnings.push('Invoice number missing — please enter it.')
  if (!header.invoiceDate) warnings.push('Invoice date missing — please enter it.')
  if (parsedLines.length === 0) warnings.push('No line items detected — add lines manually.')

  return {
    supplier,
    header,
    lines: parsedLines,
    totals,
    layoutLines: lines,
    rows: [],
    scanned: false,
    warnings,
  }
}

export function parseSupplierInvoiceFromRows(rows: PdfRow[]): ParseSupplierInvoiceResult {
  const layoutLines = rowsToLayoutLines(rows)
  const scanned = looksScannedDocument(rows)
  if (scanned) {
    return {
      ...emptyParseSupplierInvoiceResult(),
      layoutLines,
      rows,
      scanned: true,
      warnings: ['Document appears scanned or has little extractable text. OCR is not available — enter details manually.'],
    }
  }
  const result = parseSupplierInvoiceFromLayoutLines(layoutLines)
  return { ...result, rows, scanned: false }
}

export async function parseSupplierBillPdfBytes(data: Uint8Array): Promise<ParseSupplierInvoiceResult> {
  const rows = await readPdfRowsFromBytes(data)
  return parseSupplierInvoiceFromRows(rows)
}

export async function parseSupplierBillFile(file: File): Promise<ParseSupplierInvoiceResult> {
  if (file.size > MAX_SUPPLIER_BILL_BYTES) {
    throw new Error('File must be 10 MB or smaller.')
  }
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const isImage =
    /^image\/(jpeg|jpg|png)$/i.test(file.type) ||
    /\.(jpe?g|png)$/i.test(file.name)

  if (isImage) {
    return {
      ...emptyParseSupplierInvoiceResult(),
      scanned: true,
      warnings: [
        'Image files cannot be read as text in this app. Enter invoice details manually or upload a text-based PDF.',
      ],
    }
  }
  if (!isPdf) {
    throw new Error('Supported formats: PDF, JPG, JPEG, PNG.')
  }
  const data = new Uint8Array(await file.arrayBuffer())
  return parseSupplierBillPdfBytes(data)
}

/** Build synthetic rows for tests from plain lines. */
export function layoutLinesToRows(lines: string[]): PdfRow[] {
  const pieces = lines.map((text, i) => ({
    text,
    x: 10,
    y: 1000 - i * 12,
  }))
  return groupPiecesIntoRows(pieces)
}
