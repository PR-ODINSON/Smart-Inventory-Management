import type { Customer } from '../../types/customer'

export type CustomerMatchKind = 'gstin' | 'name' | 'fuzzy' | 'none'

export interface CustomerMatchResult {
  kind: CustomerMatchKind
  customer: Customer | null
  score?: number
  needsConfirmation: boolean
}

export function normaliseCustomerName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[(),]/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\bPRIVATE\b/g, 'PVT')
    .replace(/\bLIMITED\b/g, 'LTD')
    .replace(/\bP\s+LTD\b/g, 'PVT LTD')
    .replace(/\bP\s+LIMITED\b/g, 'PVT LTD')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(normaliseCustomerName(a).split(' ').filter(Boolean))
  const tb = new Set(normaliseCustomerName(b).split(' ').filter(Boolean))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / Math.max(ta.size, tb.size)
}

export function matchCustomer(
  customers: Customer[],
  input: { name: string; gstin?: string | null },
): CustomerMatchResult {
  const gst = input.gstin?.trim().toUpperCase()
  if (gst) {
    const byGst = customers.find((c) => c.gstin?.trim().toUpperCase() === gst)
    if (byGst) {
      return { kind: 'gstin', customer: byGst, needsConfirmation: false }
    }
  }

  const norm = normaliseCustomerName(input.name)
  if (norm) {
    const byName = customers.find((c) => normaliseCustomerName(c.name) === norm)
    if (byName) {
      const samePrinted =
        input.name.trim().toUpperCase() === byName.name.trim().toUpperCase()
      if (samePrinted) {
        return { kind: 'name', customer: byName, needsConfirmation: false }
      }
      return { kind: 'fuzzy', customer: byName, needsConfirmation: true }
    }
  }

  let best: Customer | null = null
  let bestScore = 0
  for (const c of customers) {
    const score = tokenSimilarity(input.name, c.name)
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  if (best && bestScore >= 0.85) {
    const samePrinted =
      input.name.trim().toUpperCase() === best.name.trim().toUpperCase()
    if (samePrinted) {
      return { kind: 'name', customer: best, score: bestScore, needsConfirmation: false }
    }
    return {
      kind: 'fuzzy',
      customer: best,
      score: bestScore,
      needsConfirmation: true,
    }
  }

  return { kind: 'none', customer: null, needsConfirmation: false }
}
