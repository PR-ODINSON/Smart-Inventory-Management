import {
  detectPoFormat,
  type PoPdfFormat,
} from './poImport/detect'
import { extractBuyerGstin, extractSigner, type SignerSource } from './poImport/extractSigner'
import {
  groupPiecesIntoRows,
  normalizePdfText,
  rowsToLayoutLines,
  type PdfCell,
  type PdfRow,
} from './pdfRowExtract'

export const MAX_PO_PDF_BYTES = 10 * 1024 * 1024

export type { PoPdfFormat }
export { detectPoFormat }

export type { PdfCell, PdfRow }

export interface ParsedPoHeader {
  poNumber: string
  poDate: string
  vendorCode: string
  buyerName: string
  buyerGstin: string
  signerName: string
  signerSource: SignerSource
  printedTotalKg: number | null
  printedTotalNos: number | null
}

export interface ParsedPoLine {
  lineNo: number
  itemCode: string
  itemName: string
  hsnCode: string
  gstRate: number
  quantityNos: number
  totalWeightKg: number
  weightPerPieceKg: number
  rate: number
  amount: number
  deliveryDate: string
  indentNo: string
  indentDate: string
  workOrderNo: string
  salesOrderNo: string
}

export interface ParsePoPdfResult {
  header: ParsedPoHeader
  lines: ParsedPoLine[]
  layoutLines: string[]
  rows: PdfRow[]
  format: PoPdfFormat
  scanned: boolean
  debug?: PoParseDebugInfo
}

export interface PoParseDebugInfo {
  format: PoPdfFormat
  rowCount: number
  firstRows: PdfRow[]
  sampleRowsJson: string
}

function parseDecimal(raw: string): number {
  return parseFloat(raw.replace(/,/g, '').replace(/₹/g, ''))
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

function parseDdMmYyyy(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (!m) return raw.trim()
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function isNodeRuntime(): boolean {
  const proc = (globalThis as { process?: { versions?: { node?: string } } }).process
  return typeof proc?.versions?.node === 'string'
}

async function loadPdfDocument(data: Uint8Array) {
  if (isNodeRuntime()) {
    const legacy = await import('pdfjs-dist/legacy/build/pdf.mjs')
    return legacy.getDocument({ data, useSystemFonts: true }).promise
  }
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  return pdfjs.getDocument({ data }).promise
}

async function extractRowsFromPdfBytes(data: Uint8Array): Promise<PdfRow[]> {
  const doc = await loadPdfDocument(data)
  const allRows: PdfRow[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const viewport = page.getViewport({ scale: 1 })
    const pageHeight = viewport.height
    const content = await page.getTextContent()
    const pieces: { text: string; x: number; y: number; page: number; pageHeight: number }[] =
      []
    for (const item of content.items) {
      if (!('str' in item)) continue
      const t = normalizePdfText(item.str)
      if (!t) continue
      const tx = item.transform
      pieces.push({ text: t, x: tx[4], y: tx[5], page: p, pageHeight })
    }
    allRows.push(...groupPiecesIntoRows(pieces))
  }
  return allRows
}

export async function readPdfRowsFromBytes(data: Uint8Array): Promise<PdfRow[]> {
  return extractRowsFromPdfBytes(data)
}

export async function readPdfRows(file: File): Promise<PdfRow[]> {
  if (file.size > MAX_PO_PDF_BYTES) {
    throw new Error('PDF must be 10 MB or smaller.')
  }
  const data = new Uint8Array(await file.arrayBuffer())
  return extractRowsFromPdfBytes(data)
}

/** Extract layout lines from a PDF file (client-side only). */
export async function readPdfLines(file: File): Promise<string[]> {
  if (file.type && file.type !== 'application/pdf') {
    throw new Error('Only PDF files are supported.')
  }
  const rows = await readPdfRows(file)
  return rowsToLayoutLines(rows)
}

const AQUA_LINE_HEAD_RE =
  /^(\d{1,3})\s+([A-Z0-9][A-Z0-9 ]{4,})\s+(\d{8})\s+(\d{1,2})\s+Kgs?\.?\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/i

const AQUA_ARM_BLOCK_RE =
  /(ARM\d{8,})\b.*?(\d{8})\s+(\d{1,2})\s+Kgs?\.?\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/i

const NOS_RE = /Nos?\.?\s*([\d,]+\.?\d*)/i
const INDENT_RE =
  /Indent\s+No\.?\s*:?\s*([A-Z0-9\-]+)(?:\s*[-–]\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}))?/i
const WO_SO_RE =
  /WO\s+No\.?\s*:?\s*([A-Z0-9]+)\s*,\s*SO\s+No\.?\s*:?\s*([A-Z0-9]+)/i
const DELIVERY_RE = /Delivery\s+Date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i

const SB_LINE_RE =
  /^(\d+)\s+([\dA-Za-z][\dA-Za-z ]*?)\s+(.+?)\s+(\d{8})\s+([\d,]+(?:\.\d+)?)\s*Kg\s+₹?\s*([\d,]+\.?\d*)\s+₹?\s*([\d,]+\.?\d*)/i

const REQ_QTY_RE = /Required\s+Qty\s*:?\s*([\d,]+)\s*Nos/i
const REQ_BY_RE = /Required\s+by\s*:?\s*(\d{1,2}-\d{1,2}-\d{4})/i

const MBH_LINE1_RE =
  /^(\d+)\s+([A-Z0-9]+)\s+(.+?)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([A-Z0-9\-]+)\s*$/i
const MBH_WT_RE = /^([\d,]+\.?\d*)\s+KGS\s+(\d+(?:\.\d+)?)\s*%?/i
const MBH_DEL_RE =
  /Del\.Dt\s*:\s*(\d{1,2}-\d{1,2}-\d{4})[\s\d:]*Indent\s+No\s+([A-Z0-9\-]+)/i

function rowHasAquaBlock(text: string): boolean {
  return AQUA_LINE_HEAD_RE.test(text) || AQUA_ARM_BLOCK_RE.test(text)
}

function parseAquaBlockFromRow(
  text: string,
  lineNoFallback: number,
): Omit<ParsedPoLine, 'itemName' | 'quantityNos'> & { quantityNos: number } | null {
  const head = AQUA_LINE_HEAD_RE.exec(text)
  if (head) {
    return {
      lineNo: parseInt(head[1], 10),
      itemCode: normalizePdfText(head[2]).replace(/\s+/g, ''),
      hsnCode: head[3],
      gstRate: parseDecimal(head[4]),
      totalWeightKg: parseDecimal(head[5]),
      rate: parseDecimal(head[6]),
      amount: parseDecimal(head[7]),
      quantityNos: 0,
      weightPerPieceKg: 0,
      deliveryDate: '',
      indentNo: '',
      indentDate: '',
      workOrderNo: '',
      salesOrderNo: '',
    }
  }
  const arm = AQUA_ARM_BLOCK_RE.exec(text)
  if (!arm) return null
  const lineNoMatch = text.match(/(?:^|\s)(\d{1,2})\s+(?:.*?\s)?ARM/i)
  return {
    lineNo: lineNoMatch ? parseInt(lineNoMatch[1], 10) : lineNoFallback,
    itemCode: arm[1],
    hsnCode: arm[2],
    gstRate: parseDecimal(arm[3]),
    totalWeightKg: parseDecimal(arm[4]),
    rate: parseDecimal(arm[5]),
    amount: parseDecimal(arm[6]),
    quantityNos: 0,
    weightPerPieceKg: 0,
    deliveryDate: '',
    indentNo: '',
    indentDate: '',
    workOrderNo: '',
    salesOrderNo: '',
  }
}

function parseAquaLines(rows: PdfRow[]): ParsedPoLine[] {
  const endIdx = rows.findIndex((r) => /Total\s+Qty/i.test(r.text))
  const slice = endIdx >= 0 ? rows.slice(0, endIdx) : rows
  const out: ParsedPoLine[] = []

  for (let i = 0; i < slice.length; i++) {
    const text = slice[i].text
    if (!rowHasAquaBlock(text)) continue

    const partial = parseAquaBlockFromRow(text, out.length + 1)
    if (!partial || partial.totalWeightKg <= 0) continue

    let quantityNos = 0
    const descParts: string[] = []
    let deliveryDate = ''
    let indentNo = ''
    let indentDate = ''
    let workOrderNo = ''
    let salesOrderNo = ''

    for (let j = i + 1; j < Math.min(i + 12, slice.length); j++) {
      const l = slice[j].text
      if (rowHasAquaBlock(l)) break

      const nos = NOS_RE.exec(l)
      if (nos && quantityNos === 0) {
        quantityNos = parseDecimal(nos[1])
        const beforeNos = l.split(/Nos?\.?/i)[0]?.trim()
        if (beforeNos && !/^(Mode|Insurance|Notes)/i.test(beforeNos) && beforeNos.length > 8) {
          descParts.push(beforeNos)
        }
        continue
      }
      const indent = INDENT_RE.exec(l)
      if (indent) {
        indentNo = indent[1]
        if (indent[2]) indentDate = parseDdMmYyyy(indent[2])
        continue
      }
      const woSo = WO_SO_RE.exec(l)
      if (woSo) {
        workOrderNo = woSo[1]
        salesOrderNo = woSo[2]
        continue
      }
      const del = DELIVERY_RE.exec(l)
      if (del) {
        deliveryDate = parseDdMmYyyy(del[1])
        continue
      }
      if (
        l.length > 6 &&
        !/^(Please|All Casting|Subject|We Reserve|If any|\d+\.)/i.test(l) &&
        !/BLACKLISTED|Jurisdiction/i.test(l)
      ) {
        descParts.push(l)
      }
    }

    if (quantityNos <= 0) continue

    const key = `${partial.itemCode}|${partial.totalWeightKg}|${quantityNos}`
    if (out.some((x) => `${x.itemCode}|${x.totalWeightKg}|${x.quantityNos}` === key)) continue

    out.push({
      ...partial,
      quantityNos,
      weightPerPieceKg: round3(partial.totalWeightKg / quantityNos),
      itemName: descParts.join(' ').trim() || partial.itemCode,
      deliveryDate,
      indentNo,
      indentDate,
      workOrderNo,
      salesOrderNo,
    })
  }

  return out.sort((a, b) => a.lineNo - b.lineNo)
}

function parseSbPumpsLines(rows: PdfRow[]): ParsedPoLine[] {
  const out: ParsedPoLine[] = []
  for (let i = 0; i < rows.length; i++) {
    const m = SB_LINE_RE.exec(rows[i].text)
    if (!m) continue

    let quantityNos = 0
    let deliveryDate = ''
    for (let j = i + 1; j < Math.min(i + 4, rows.length); j++) {
      const rq = REQ_QTY_RE.exec(rows[j].text)
      if (!rq) continue
      quantityNos = parseDecimal(rq[1])
      const rb = REQ_BY_RE.exec(rows[j].text)
      if (rb) deliveryDate = parseDdMmYyyy(rb[1])
      break
    }
    if (quantityNos <= 0) continue

    const totalWeightKg = parseDecimal(m[5])
    out.push({
      lineNo: parseInt(m[1], 10),
      itemCode: normalizePdfText(m[2]),
      itemName: m[3].trim(),
      hsnCode: m[4],
      gstRate: 18,
      quantityNos,
      totalWeightKg,
      weightPerPieceKg: round3(totalWeightKg / quantityNos),
      rate: parseDecimal(m[6]),
      amount: parseDecimal(m[7]),
      deliveryDate,
      indentNo: '',
      indentDate: '',
      workOrderNo: '',
      salesOrderNo: '',
    })
  }
  return out
}

function parseMbhLines(rows: PdfRow[]): ParsedPoLine[] {
  const out: ParsedPoLine[] = []
  for (let i = 0; i < rows.length; i++) {
    const m = MBH_LINE1_RE.exec(rows[i].text)
    if (!m) continue

    let totalWeightKg = 0
    let gstRate = 18
    for (let j = i + 1; j < Math.min(i + 4, rows.length); j++) {
      const wt = MBH_WT_RE.exec(rows[j].text)
      if (wt) {
        totalWeightKg = parseDecimal(wt[1])
        gstRate = parseDecimal(wt[2])
        break
      }
    }
    if (totalWeightKg <= 0) continue

    const quantityNos = parseDecimal(m[4])
    let deliveryDate = ''
    let indentNo = ''
    for (let j = i + 1; j < Math.min(i + 5, rows.length); j++) {
      const del = MBH_DEL_RE.exec(rows[j].text)
      if (del) {
        deliveryDate = parseDdMmYyyy(del[1])
        indentNo = del[2]
        break
      }
    }

    out.push({
      lineNo: parseInt(m[1], 10),
      itemCode: m[2],
      itemName: m[3].trim(),
      hsnCode: '',
      gstRate,
      quantityNos,
      totalWeightKg,
      weightPerPieceKg: round3(totalWeightKg / quantityNos),
      rate: parseDecimal(m[5]),
      amount: parseDecimal(m[6]),
      deliveryDate,
      indentNo,
      indentDate: '',
      workOrderNo: '',
      salesOrderNo: '',
    })
  }
  return out
}

export function parsePoLinesFromRows(rows: PdfRow[], format?: PoPdfFormat): ParsedPoLine[] {
  const fmt = format ?? detectPoFormat(rows)
  switch (fmt) {
    case 'aqua':
      return parseAquaLines(rows)
    case 'sb_pumps':
      return parseSbPumpsLines(rows)
    case 'mbh':
      return parseMbhLines(rows)
    default: {
      const aqua = parseAquaLines(rows)
      if (aqua.length > 0) return aqua
      const sb = parseSbPumpsLines(rows)
      if (sb.length > 0) return sb
      return parseMbhLines(rows)
    }
  }
}

/** Parse line items from layout lines; stops at "Total Qty" for aqua. */
export function parsePoLines(layoutLines: string[]): ParsedPoLine[] {
  const rows: PdfRow[] = layoutLines.map((text, i) => ({
    y: layoutLines.length - i,
    cells: [],
    text: normalizePdfText(text),
  }))
  return parsePoLinesFromRows(rows)
}

export function parsePoHeaderFromRows(rows: PdfRow[]): ParsedPoHeader {
  const layoutLines = rowsToLayoutLines(rows)
  return parsePoHeader(layoutLines, rows)
}

export function parsePoHeader(layoutLines: string[], rows?: PdfRow[]): ParsedPoHeader {
  const text = layoutLines.join('\n')
  let poNumber = ''
  const poPatterns = [
    /P\.?\s*O\.?\s*No\.?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/\.]+)/i,
    /P\.?\s*O\s+No\s+(ORD-[A-Z0-9\-]+)/i,
    /REFERENCE\s+ID\s+([A-Z0-9\-]+)/i,
    /(SBPSPL-PO-[A-Z0-9\-]+)/i,
    /\b(P[0-9]{6,12})\b/,
  ]
  for (const re of poPatterns) {
    const m = text.match(re)
    if (m?.[1]) {
      poNumber = m[1].trim()
      break
    }
  }

  let poDate = ''
  const datePatterns = [
    /P\.?\s*O\.?\s*Date\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    /\bDate\s+(\d{1,2}-\d{1,2}-\d{4})/i,
    /(SBPSPL-PO-[A-Z0-9\-]+)\s+(\d{1,2}-\d{1,2}-\d{4})/i,
  ]
  for (const re of datePatterns) {
    const m = text.match(re)
    if (m?.[1] && re.source.includes('SBPSPL')) {
      poDate = parseDdMmYyyy(m[2])
      break
    }
    if (m?.[1] && !re.source.includes('SBPSPL')) {
      poDate = parseDdMmYyyy(m[1])
      break
    }
  }

  let vendorCode = ''
  const vendor =
    /Vendor\s+Code\s+([A-Z0-9]+)/i.exec(text) ??
    /\[Vendor\s+Code\s*:\s*([^\]]+)\]/i.exec(text) ??
    /\bCode\s*:\s*([A-Z]?\d{4,})\b/i.exec(text)
  if (vendor?.[1] && !/^gstin/i.test(vendor[1])) vendorCode = vendor[1].trim()

  let printedTotalKg: number | null = null
  let printedTotalNos: number | null = null
  const rowList = rows ?? layoutLines.map((t, i) => ({ y: i, cells: [], text: t }))
  for (let i = 0; i < rowList.length; i++) {
    const l = rowList[i].text
    const t = /Total\s+Qty\s*:?\s*([\d,]+\.?\d*)/i.exec(l)
    if (t) {
      printedTotalKg = parseDecimal(t[1])
      const inlineNos = /([\d,]+\.?\d*)\s*Nos/i.exec(l)
      if (inlineNos) printedTotalNos = parseDecimal(inlineNos[1])
      else {
        const next = rowList[i + 1]?.text.match(/^([\d,]+\.?\d*)\s*$/)
        if (next) printedTotalNos = parseDecimal(next[1])
      }
      break
    }
    if (/SUB\s+TOTAL/i.test(l) && printedTotalKg == null) {
      const kgSum = parseSbPumpsLines(rowList).reduce((s, x) => s + x.totalWeightKg, 0)
      if (kgSum > 0) printedTotalKg = kgSum
    }
  }
  if (printedTotalNos == null) {
    const lines = parsePoLinesFromRows(rowList)
    if (lines.length > 0) {
      printedTotalNos = lines.reduce((s, x) => s + x.quantityNos, 0)
      if (printedTotalKg == null) {
        printedTotalKg = lines.reduce((s, x) => s + x.totalWeightKg, 0)
      }
    }
  }

  return {
    poNumber,
    poDate,
    vendorCode,
    buyerName: '',
    buyerGstin: '',
    signerName: '',
    signerSource: null,
    printedTotalKg,
    printedTotalNos,
  }
}

function applyCustomerFromPdf(
  header: ParsedPoHeader,
  rows: PdfRow[],
  format: PoPdfFormat,
): ParsedPoHeader {
  const signer = extractSigner(rows)
  const gst = extractBuyerGstin(rows, format)
  const name = signer.companyName ?? ''
  return {
    ...header,
    buyerName: name,
    buyerGstin: gst.buyerGstin ?? '',
    signerName: signer.companyName ?? '',
    signerSource: signer.source,
  }
}

function looksScanned(rows: PdfRow[]): boolean {
  const joined = rows.map((r) => r.text).join('').replace(/\s/g, '')
  if (joined.length < 40) return true
  const words = rows.join(' ').match(/[A-Za-z]{3,}/g)
  return !words || words.length < 5
}

export function buildParseDebugInfo(rows: PdfRow[], format: PoPdfFormat): PoParseDebugInfo {
  const firstRows = rows.slice(0, 40)
  const sampleRowsJson = JSON.stringify(
    firstRows.map((r) => ({
      y: Math.round(r.y * 10) / 10,
      cells: r.cells.map((c) => ({ x: Math.round(c.x), text: c.text })),
    })),
    null,
    2,
  )
  return { format, rowCount: rows.length, firstRows, sampleRowsJson }
}

export function formatParseFailureMessage(debug: PoParseDebugInfo): string {
  const preview = debug.firstRows
    .slice(0, 5)
    .map((r, i) => `${i + 1}. ${r.text.slice(0, 120)}`)
    .join('\n')
  return (
    `No line items found.\n` +
    `Format: ${debug.format}\n` +
    `Rows read: ${debug.rowCount}\n` +
    `First rows:\n${preview}`
  )
}

export async function parsePoPdfBytes(data: Uint8Array): Promise<ParsePoPdfResult> {
  const rows = await readPdfRowsFromBytes(data)
  const format = detectPoFormat(rows)
  const layoutLines = rowsToLayoutLines(rows)
  const scanned = looksScanned(rows)
  const header = applyCustomerFromPdf(parsePoHeader(layoutLines, rows), rows, format)
  const lines = scanned ? [] : parsePoLinesFromRows(rows, format)
  const debug = buildParseDebugInfo(rows, format)
  return { header, lines, layoutLines, rows, format, scanned, debug }
}

export async function parsePoPdfFile(file: File): Promise<ParsePoPdfResult> {
  if (file.size > MAX_PO_PDF_BYTES) {
    throw new Error('PDF must be 10 MB or smaller.')
  }
  const data = new Uint8Array(await file.arrayBuffer())
  return parsePoPdfBytes(data)
}
