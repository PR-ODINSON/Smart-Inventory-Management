export type PdfCell = { x: number; text: string; page?: number; pageHeight?: number }

export type PdfRow = {
  y: number
  cells: PdfCell[]
  text: string
  page?: number
  pageHeight?: number
}

export const ROW_Y_GAP = 2.5

export function normalizePdfText(raw: string): string {
  return raw.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Drop consecutive duplicate cell texts (mirrored PDF columns). */
export function joinRowCells(cells: PdfCell[]): string {
  const sorted = [...cells].sort((a, b) => a.x - b.x)
  const parts: string[] = []
  for (const c of sorted) {
    const t = normalizePdfText(c.text)
    if (!t) continue
    if (parts.length > 0 && parts[parts.length - 1] === t) continue
    parts.push(t)
  }
  let line = parts.join(' ')
  const words = line.split(' ')
  for (let len = Math.floor(words.length / 2); len >= 2; len--) {
    const a = words.slice(0, len).join(' ')
    const b = words.slice(len, len * 2).join(' ')
    if (a === b) {
      line = [a, ...words.slice(len * 2)].join(' ')
      break
    }
  }
  return normalizePdfText(line)
}

export function groupPiecesIntoRows(
  pieces: { text: string; x: number; y: number; page?: number; pageHeight?: number }[],
  gap = ROW_Y_GAP,
): PdfRow[] {
  const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x)
  const groups: {
    y: number
    cells: { text: string; x: number; y: number; page?: number; pageHeight?: number }[]
  }[] = []
  for (const p of sorted) {
    const t = normalizePdfText(p.text)
    if (!t) continue
    if (groups.length === 0) {
      groups.push({ y: p.y, cells: [{ ...p, text: t }] })
      continue
    }
    const last = groups[groups.length - 1]
    if (Math.abs(last.y - p.y) > gap) {
      groups.push({ y: p.y, cells: [{ ...p, text: t }] })
    } else {
      last.cells.push({ ...p, text: t })
    }
  }
  return groups.map((g) => {
    const cells = g.cells.map((c) => ({
      x: c.x,
      text: c.text,
      page: c.page,
      pageHeight: c.pageHeight,
    }))
    const page = g.cells[0]?.page
    const pageHeight = g.cells[0]?.pageHeight
    return { y: g.y, cells, text: joinRowCells(cells), page, pageHeight }
  })
}

export function rowsToLayoutLines(rows: PdfRow[]): string[] {
  return rows.map((r) => r.text).filter(Boolean)
}
