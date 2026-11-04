/**
 * Parser for Indian OEM / foundry purchase-order PDFs (layout-aware lines from pdf.js).
 */

export interface ParsedPoLine {
  itemName: string
  quantity: number
  quantityUnit: string
  weightPerUnitKg: number
  totalWeightKg: number
}

export interface ParsedPurchaseOrder {
  poNumber: string
  companyName: string
  lines: ParsedPoLine[]
  warnings: string[]
}

const GST_RATES = new Set([0, 5, 12, 18, 28])
const ITEM_CODE_RE = /^[A-Z]{2,}\d{8,}$/
const HSN_RE = /\b(\d{8})\b/

function parseDecimal(raw: string): number {
  return parseFloat(raw.replace(/,/g, ''))
}

function normalizePdfText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

export function extractPoNumber(text: string, layoutLines: string[]): string | null {
  const patterns = [
    /P\.?\s*O\.?\s*No\.?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/\.]+)/i,
    /Purchase\s+Order\s+Number\s*[:\-]\s*([A-Z0-9][A-Z0-9\-\/\.]+)/i,
    /(?:Purchase\s+Order)\s*(?:No\.?|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/\.]+)/i,
    /\bPO\s*[#:\-]?\s*([A-Z0-9][A-Z0-9\-\/\.]+)/i,
    /\b(P[0-9]{6,12})\b/,
    /\b(PO[0-9]{4,12})\b/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) {
      const n = m[1].trim().replace(/\s+/g, ' ')
      if (n.length >= 3 && !/^no$/i.test(n)) return n
    }
  }
  for (const line of layoutLines) {
    const m = line.match(/\b(P[0-9]{6,12})\b/)
    if (m) return m[1]
  }
  return null
}

function isBadCompanyName(name: string): boolean {
  const n = name.trim()
  if (n.length < 3) return true
  if (/^code\s*[:\-]?\s*[A-Z]?\d/i.test(n)) return true
  if (/^vendor\s*code/i.test(n)) return true
  if (/^N\d{3,}$/i.test(n.replace(/\s/g, ''))) return true
  if (/^\d{2}[A-Z]{5}\d{4}[A-Z]\d/i.test(n.replace(/\s/g, ''))) return true
  if (/^gstin/i.test(n)) return true
  if (/^pin\s*code/i.test(n)) return true
  return false
}

export function extractCompanyName(text: string, layoutLines: string[]): string | null {
  const patterns = [
    /(?:Buyer|Bill\s+To|Customer|Consignee)\s*[:\-]\s*([A-Za-z][^\n]{2,80})/i,
    /(?:Supplier|Vendor)\s*[:\-]\s*([A-Za-z][^\n]{2,80})/i,
    /M\/s\.?\s*([A-Za-z][^\n]{2,80})/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) {
      let name = m[1].trim()
      name = name.split(/\s{2,}|GSTIN|GST\s*No|Pin\s*Code|Code\s*:/i)[0]?.trim() ?? name
      if (!isBadCompanyName(name)) return name
    }
  }

  for (let i = 0; i < layoutLines.length; i++) {
    const line = layoutLines[i]
    if (/^(Buyer|Bill\s+To|Customer|Consignee)\s*:?\s*$/i.test(line)) {
      for (let j = i + 1; j < Math.min(i + 6, layoutLines.length); j++) {
        const next = layoutLines[j].trim()
        if (!next) continue
        if (/^(gstin|pin|state|country|phone|email)/i.test(next)) continue
        if (/^(code|vendor\s*code)\s*[:\-]/i.test(next)) continue
        if (isBadCompanyName(next)) continue
        if (next.length >= 4) return next.split(/\s{2,}/)[0].trim()
      }
    }
    const inline = line.match(/^(?:Buyer|Bill\s+To|Customer)\s*[:\-]\s*(.+)$/i)
    if (inline?.[1]) {
      const name = inline[1].split(/\s{2,}|GSTIN|Code\s*:/i)[0].trim()
      if (!isBadCompanyName(name)) return name
    }
  }

  return null
}

/** Numbers on / after HSN line: skip 8-digit HSN, skip GST %, then kg qty then nos qty */
function parseKgNosFromNumberRun(nums: number[]): { totalKg: number; nos: number } | null {
  const filtered = nums.filter(
    (n) => !(n >= 10_000_000 && n <= 99_999_999 && Number.isInteger(n)),
  )
  if (filtered.length < 2) return null

  let i = 0
  if (filtered[i] <= 28 && GST_RATES.has(filtered[i])) i++

  const rest = filtered.slice(i)
  if (rest.length < 2) return null

  let kg = rest[0]
  let nos = rest[1]

  if (kg <= 28 && GST_RATES.has(kg) && rest.length >= 3) {
    kg = rest[1]
    nos = rest[2]
  }

  if (GST_RATES.has(kg) && kg <= 28) return null
  if (kg < nos && kg < 100) {
    ;[kg, nos] = [nos, kg]
  }
  if (kg <= 28) return null
  if (nos <= 0 || kg <= 0) return null
  return { totalKg: kg, nos }
}

function numbersFromLines(lines: string[], from: number, maxLines = 6): number[] {
  const nums: number[] = []
  for (let i = from; i < Math.min(from + maxLines, lines.length); i++) {
    const l = lines[i]
    if (/Item\s*Code\s*:/i.test(l) || ITEM_CODE_RE.test(l.trim())) break
    if (/^(Sub|Grand)\s*Total/i.test(l)) break
    const found = l.match(/\d+(?:\.\d+)?/g)
    if (!found) continue
    for (const raw of found) nums.push(parseDecimal(raw))
  }
  return nums
}

function parseHsnTailLine(line: string): { totalKg: number; nos: number } | null {
  const m = line.match(
    /\b\d{8}\s+(\d{1,2})\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?:\s+\d+(?:\.\d+)?)*/,
  )
  if (!m) return null
  const gst = parseInt(m[1], 10)
  if (!GST_RATES.has(gst) && gst > 28) return null
  const kg = parseDecimal(m[2])
  const nos = parseDecimal(m[3])
  if (GST_RATES.has(kg) && kg <= 28) return null
  if (kg <= 28) return null
  return { totalKg: kg, nos }
}

function pushLine(
  lines: ParsedPoLine[],
  itemName: string,
  totalKg: number,
  nos: number | null,
): void {
  if (!itemName || totalKg <= 0) return
  if (GST_RATES.has(totalKg) && totalKg <= 28 && (nos == null || nos <= 0)) return

  const code = itemName.split(/[\s—\-]/)[0]
  const key = `${code}|${totalKg}|${nos ?? 0}`
  if (lines.some((l) => {
    const c = l.itemName.split(/[\s—\-]/)[0]
    return `${c}|${l.totalWeightKg}|${l.quantity}` === key
  })) return

  if (nos != null && nos > 0) {
    lines.push({
      itemName,
      quantity: nos,
      quantityUnit: 'nos',
      weightPerUnitKg: totalKg / nos,
      totalWeightKg: totalKg,
    })
  } else {
    lines.push({
      itemName,
      quantity: totalKg,
      quantityUnit: 'kg',
      weightPerUnitKg: 1,
      totalWeightKg: totalKg,
    })
  }
}

/** Primary OEM parser: one block per Item Code / ARM######## */
function parseOemLayoutItems(layoutLines: string[]): ParsedPoLine[] {
  const out: ParsedPoLine[] = []
  let i = 0

  while (i < layoutLines.length) {
    const line = layoutLines[i]
    const codeFromLabel = line.match(/Item\s*Code\s*:\s*(\S+)/i)?.[1]?.trim()
    const codeFromLine = !codeFromLabel && ITEM_CODE_RE.test(line.trim()) ? line.trim() : null
    const code = codeFromLabel ?? codeFromLine

    if (!code) {
      i++
      continue
    }

    let desc = ''
    let hsnLineIdx = -1
    let j = i + 1

    while (j < layoutLines.length && j < i + 20) {
      const l = layoutLines[j]
      if (j > i + 1 && (/Item\s*Code\s*:/i.test(l) || ITEM_CODE_RE.test(l.trim()))) break
      if (/^(Sub|Grand)\s*Total|Amount\s*in\s*Words/i.test(l)) break

      const d = l.match(/Description\s*:\s*(.+)/i)
      if (d) desc = d[1].trim()
      else if (
        !desc &&
        l.length > 12 &&
        !/^(Indent|WO|SO|Delivery|HSN|GST|No\.)/i.test(l) &&
        !HSN_RE.test(l) &&
        !/^\d+(\.\d+)?$/.test(l.trim())
      ) {
        desc = l.trim()
      }

      if (HSN_RE.test(l)) {
        hsnLineIdx = j
        break
      }
      j++
    }

    let totalKg: number | null = null
    let nos: number | null = null

    if (hsnLineIdx >= 0) {
      const hsnLine = layoutLines[hsnLineIdx]
      const inline = parseHsnTailLine(hsnLine)
      if (inline) {
        totalKg = inline.totalKg
        nos = inline.nos
      } else {
        const nums = numbersFromLines(layoutLines, hsnLineIdx, 8)
        const parsed = parseKgNosFromNumberRun(nums)
        if (parsed) {
          totalKg = parsed.totalKg
          nos = parsed.nos
        }
      }
    }

    const itemName = desc ? `${code} — ${desc}` : code
    if (totalKg && totalKg > 0) pushLine(out, itemName, totalKg, nos)

    i = hsnLineIdx >= 0 ? hsnLineIdx + 1 : j + 1
  }

  return out
}

function parseItemCodeBlocks(fullText: string, lines: ParsedPoLine[], warnings: string[]): void {
  const parts = fullText.split(/(?=Item\s*Code\s*:)/gi)
  for (const block of parts.slice(1)) {
    const code = /Item\s*Code\s*:\s*(\S+)/i.exec(block)?.[1]?.trim()
    const desc = /Description\s*:\s*([^\n]+)/i.exec(block)?.[1]?.trim()
    const itemName =
      code && desc ? `${code} — ${desc}` : (desc ?? code ?? '').trim()
    if (!itemName) continue

    const inline = block.match(
      /\b\d{8}\s+(\d{1,2})\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/,
    )
    if (!inline) {
      const labeled = block.match(
        /Kgs?\.?\s*(\d+(?:\.\d+)?)\s*Nos?\.?\s*(\d+(?:\.\d+)?)/i,
      )
      if (labeled) {
        pushLine(lines, itemName, parseDecimal(labeled[1]), parseDecimal(labeled[2]))
        continue
      }
      warnings.push(`Could not read weight for "${itemName.slice(0, 36)}…"`)
      continue
    }
    const kg = parseDecimal(inline[2])
    const n = parseDecimal(inline[3])
    if (GST_RATES.has(kg) && kg <= 28) continue
    pushLine(lines, itemName, kg, n)
  }
}

function parseSimpleMaterialLines(layoutLines: string[], lines: ParsedPoLine[]): void {
  for (const row of layoutLines) {
    const line = row.trim()
    const m = line.match(
      /^(?:\d+[\.\)]\s*)?([A-Za-z][A-Za-z0-9 \-\/\(\)&,\.]{2,60}?)\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s*(kg|kgs|mt)\s*$/i,
    )
    if (!m) continue
    const name = m[1].trim()
    if (/^(item|description|total|sub|grand|purchase|supplier|uom)/i.test(name)) continue
    let qty = parseDecimal(m[2])
    if (m[3].toLowerCase() === 'mt') qty *= 1000
    pushLine(lines, name, qty, null)
  }
}

export function parsePurchaseOrderFromText(
  rawText: string,
  layoutLines: string[] = [],
): ParsedPurchaseOrder {
  const text = normalizePdfText(rawText)
  const lines: string[] =
    layoutLines.length > 0 ? layoutLines : text.split('\n').map((l) => l.trim()).filter(Boolean)
  const warnings: string[] = []

  const poNumber = extractPoNumber(text, lines)
  const companyName = extractCompanyName(text, lines)

  if (!poNumber) warnings.push('PO number not found — correct it below.')
  if (!companyName) warnings.push('Company name not found — correct it below.')

  const oemLines = parseOemLayoutItems(lines)
  const parsedLines: ParsedPoLine[] = [...oemLines]

  if (parsedLines.length === 0) {
    parseItemCodeBlocks(text, parsedLines, warnings)
  }
  parseSimpleMaterialLines(lines, parsedLines)

  const unique: ParsedPoLine[] = []
  const seen = new Set<string>()
  for (const l of parsedLines) {
    const key = `${l.itemName}|${l.totalWeightKg}|${l.quantity}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(l)
  }

  if (unique.length === 0) {
    warnings.push(
      'No line items extracted. The PDF may be scanned (image-only) or use an unsupported layout.',
    )
  }

  return {
    poNumber: poNumber ?? '',
    companyName: companyName ?? '',
    lines: unique,
    warnings,
  }
}
