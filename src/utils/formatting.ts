import { format, parseISO } from 'date-fns'

export function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return format(parseISO(iso), 'dd MMM yyyy')
  } catch {
    return iso
  }
}

export function formatDateTime(iso: string): string {
  try {
    return format(parseISO(iso), 'dd MMM yyyy HH:mm')
  } catch {
    return iso
  }
}

export function formatLeadTimeRange(
  avg?: number,
  max?: number,
): string {
  if (avg == null && max == null) return '—'
  if (avg != null && max != null) return `${avg}–${max} d`
  if (avg != null) return `${avg} d avg`
  return `${max} d max`
}

/** Shorter label when a demo badge is shown separately. */
export function displaySupplierName(companyName: string, isDemo?: boolean): string {
  if (!isDemo) return companyName
  return companyName.replace(/\s*\(Demo\)\s*$/i, '').trim()
}

export function stockStatusLabel(status: string): string {
  const map: Record<string, string> = {
    healthy: 'Healthy',
    approaching_reorder: 'Approaching reorder',
    below_reorder: 'Below reorder point',
    critical: 'Critical shortage',
    no_consumption: 'No consumption',
  }
  return map[status] ?? status
}
