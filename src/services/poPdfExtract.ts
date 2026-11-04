import { readPdfLines } from '../lib/parsePoPdf'

export interface PdfExtractResult {
  /** Flat text (legacy) */
  fullText: string
  /** One string per visual line, left-to-right */
  lines: string[]
}

export async function extractTextFromPdfFile(file: File): Promise<PdfExtractResult> {
  const lines = await readPdfLines(file)
  return { fullText: lines.join('\n'), lines }
}
