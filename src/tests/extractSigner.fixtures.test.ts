import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { OUR_GSTIN } from '../config/company'
import { readPdfRowsFromBytes } from '../lib/parsePoPdf'
import { extractBuyerGstin, extractSigner } from '../lib/poImport/extractSigner'

const FIXTURE_DIR = join(process.cwd(), '__fixtures__')

const CASES = [
  {
    file: 'aqua.pdf',
    companyName: 'AQUA MACHINERIES P. LIMITED',
    buyerGstin: '24AACCP3014A1ZB',
    source: 'signature' as const,
  },
  {
    file: 'sbpumps.pdf',
    companyName: 'SB Pumps Solutions Private Limited',
    buyerGstin: '24ABICS0605D1ZV',
    source: 'signature' as const,
  },
  {
    file: 'mbh.pdf',
    companyName: 'MBH PUMPS (GUJ) PVT. LTD.',
    buyerGstin: '24AAACM7934L1Z8',
    source: 'signature' as const,
  },
]

describe('extractSigner fixtures', () => {
  for (const c of CASES) {
    const path = join(FIXTURE_DIR, c.file)
    const run = existsSync(path) ? it : it.skip

    run(`${c.file} company and GSTIN`, async () => {
      const data = new Uint8Array(readFileSync(path))
      const rows = await readPdfRowsFromBytes(data)
      const signer = extractSigner(rows)
      const gst = extractBuyerGstin(rows)

      expect(signer.companyName).toBe(c.companyName)
      expect(signer.source).toBe(c.source)
      expect(gst.buyerGstin).toBe(c.buyerGstin)
      expect(JSON.stringify({ signer, gst })).not.toContain(OUR_GSTIN)
    })
  }

  it('mbh does not use "FOR MBH Pumps works" as company name', async () => {
    const path = join(FIXTURE_DIR, 'mbh.pdf')
    if (!existsSync(path)) return
    const data = new Uint8Array(readFileSync(path))
    const rows = await readPdfRowsFromBytes(data)
    const signer = extractSigner(rows)
    expect(signer.companyName).not.toMatch(/works/i)
    expect(signer.companyName).toBe('MBH PUMPS (GUJ) PVT. LTD.')
  })
})
