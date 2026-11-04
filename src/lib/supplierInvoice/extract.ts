export const GSTIN_RE = /\b(\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d])\b/gi
export const PAN_RE = /\b([A-Z]{5}\d{4}[A-Z])\b/g

export function parseDecimal(raw: string): number {
  const t = raw.replace(/,/g, '').replace(/₹/g, '').trim()
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : 0
}

export function parseDdMmYyyyToIso(raw: string): string {
  const compact = raw.trim().replace(/\s+/g, '')
  const m = compact.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/)
  if (!m) return raw.trim()
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

export function extractGstinFromText(text: string): string[] {
  const fromPattern = extractGstinCandidates(text)
  if (fromPattern.length > 0) return fromPattern
  const legacy = text.match(
    /(?:GST\s*TIN|GSTIN)\s*(?:NO\.?)?\s*[:\-]?\s*(\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d])/gi,
  )
  if (!legacy) return []
  return legacy.map((m) => {
    const inner = m.match(/(\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d])/i)
    return inner?.[1].toUpperCase() ?? ''
  }).filter(Boolean)
}

export function extractGstinCandidates(text: string): string[] {
  const out = new Set<string>()
  let m: RegExpExecArray | null
  const re = new RegExp(GSTIN_RE.source, 'gi')
  while ((m = re.exec(text)) !== null) {
    out.add(m[1].toUpperCase())
  }
  return [...out]
}

export function extractLabelValue(lines: string[], labels: RegExp[]): string {
  for (const line of lines) {
    for (const label of labels) {
      const m = line.match(label)
      if (m?.[1]) return m[1].trim()
    }
  }
  return ''
}

export function extractPanFromText(text: string): string {
  const gstins = extractGstinCandidates(text)
  if (gstins.length > 0) {
    return gstins[0].slice(2, 12)
  }
  const m = PAN_RE.exec(text)
  return m?.[1] ?? ''
}

export function looksScannedDocument(rows: { text: string }[]): boolean {
  const joined = rows.map((r) => r.text).join('').replace(/\s/g, '')
  if (joined.length < 40) return true
  const words = rows.join(' ').match(/[A-Za-z]{3,}/g)
  return !words || words.length < 5
}
