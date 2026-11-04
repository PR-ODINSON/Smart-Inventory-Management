import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const legacy = await import('pdfjs-dist/legacy/build/pdf.mjs')

async function extractRows(data) {
  const doc = await legacy.getDocument({ data, useSystemFonts: true }).promise
  const allRows = []
  const ROW_Y_GAP = 2.5
  const norm = (s) => s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const pieces = []
    for (const item of content.items) {
      if (!('str' in item)) continue
      const t = norm(item.str)
      if (!t) continue
      pieces.push({ text: t, x: item.transform[4], y: item.transform[5] })
    }
    pieces.sort((a, b) => b.y - a.y || a.x - b.x)
    const groups = []
    for (const piece of pieces) {
      if (groups.length === 0) {
        groups.push({ y: piece.y, cells: [piece] })
        continue
      }
      const last = groups[groups.length - 1]
      if (Math.abs(last.y - piece.y) > ROW_Y_GAP) {
        groups.push({ y: piece.y, cells: [piece] })
      } else {
        last.cells.push(piece)
      }
    }
    for (const g of groups) {
      const cells = [...g.cells].sort((a, b) => a.x - b.x)
      const text = cells.map((c) => c.text).join(' ')
      allRows.push({ text: norm(text) })
    }
  }
  return allRows
}

const out = []
for (const file of ['supplier.pdf', 'madhav bill 62.pdf']) {
  const path = join(process.cwd(), file)
  const data = new Uint8Array(readFileSync(path))
  const rows = await extractRows(data)
  out.push({ file, lines: rows.map((r) => r.text) })
}

writeFileSync(join(process.cwd(), 'scripts', 'supplier-bill-dump.json'), JSON.stringify(out, null, 2))
console.log('Wrote scripts/supplier-bill-dump.json')
