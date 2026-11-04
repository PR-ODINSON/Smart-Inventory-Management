import type { Supplier } from '../../types/inventory'
import { normaliseCustomerName } from '../poImport/matchCustomer'

export type SupplierMatchKind = 'gstin' | 'name' | 'fuzzy' | 'none'

export interface SupplierMatchResult {
  kind: SupplierMatchKind
  supplier: Supplier | null
  score?: number
  needsConfirmation: boolean
}

function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(normaliseCustomerName(a).split(' ').filter(Boolean))
  const tb = new Set(normaliseCustomerName(b).split(' ').filter(Boolean))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / Math.max(ta.size, tb.size)
}

export function matchSupplier(
  suppliers: Supplier[],
  input: { companyName: string; gstin?: string | null },
): SupplierMatchResult {
  const gst = input.gstin?.trim().toUpperCase()
  if (gst) {
    const byGst = suppliers.find((s) => s.gstin?.trim().toUpperCase() === gst)
    if (byGst) {
      return { kind: 'gstin', supplier: byGst, needsConfirmation: false }
    }
  }

  const norm = normaliseCustomerName(input.companyName)
  if (norm) {
    const byName = suppliers.find(
      (c) => normaliseCustomerName(c.companyName) === norm,
    )
    if (byName) {
      const samePrinted =
        input.companyName.trim().toUpperCase() === byName.companyName.trim().toUpperCase()
      if (samePrinted) {
        return { kind: 'name', supplier: byName, needsConfirmation: false }
      }
      return { kind: 'fuzzy', supplier: byName, needsConfirmation: true }
    }
  }

  let best: Supplier | null = null
  let bestScore = 0
  for (const s of suppliers) {
    const score = tokenSimilarity(input.companyName, s.companyName)
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }
  if (best && bestScore >= 0.85) {
    const samePrinted =
      input.companyName.trim().toUpperCase() === best.companyName.trim().toUpperCase()
    if (samePrinted) {
      return { kind: 'name', supplier: best, score: bestScore, needsConfirmation: false }
    }
    return {
      kind: 'fuzzy',
      supplier: best,
      score: bestScore,
      needsConfirmation: true,
    }
  }

  return { kind: 'none', supplier: null, needsConfirmation: false }
}

export function findDuplicateInvoice(
  invoices: { supplierId: string; invoiceNumber: string }[],
  supplierId: string,
  invoiceNumber: string,
): boolean {
  const key = invoiceNumber.trim().toLowerCase()
  if (!key) return false
  return invoices.some(
    (inv) =>
      inv.supplierId === supplierId &&
      inv.invoiceNumber.trim().toLowerCase() === key,
  )
}
