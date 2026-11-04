import type { Supplier } from '../../types/inventory'

export function normalizeCompanyName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export type SupplierFormInput = {
  companyName: string
  contactPerson?: string
  phone?: string
  email?: string
  avgDeliveryDays: number
  maxDeliveryDays: number
  materialIds: string[]
  active: boolean
  notes?: string
}

export type SupplierFieldErrors = Partial<
  Record<keyof SupplierFormInput | 'contact', string>
>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  const t = email.trim()
  return t.length > 0 && EMAIL_RE.test(t)
}

export function hasContactMethod(phone?: string, email?: string): boolean {
  const p = phone?.trim() ?? ''
  const e = email?.trim() ?? ''
  if (p.length >= 6) return true
  if (e.length > 0 && isValidEmail(e)) return true
  return false
}

export function validateLeadTimes(avg: number, max: number): string | null {
  if (!Number.isFinite(avg) || !Number.isFinite(max)) {
    return 'Lead times must be valid numbers.'
  }
  if (avg < 0 || max < 0) return 'Lead times cannot be negative.'
  if (max < avg) return 'Maximum lead time cannot be less than average lead time.'
  return null
}

export function validateSupplierForm(
  input: SupplierFormInput,
): { ok: true } | { ok: false; errors: SupplierFieldErrors } {
  const errors: SupplierFieldErrors = {}
  if (!input.companyName.trim()) {
    errors.companyName = 'Company name is required.'
  }
  const leadErr = validateLeadTimes(input.avgDeliveryDays, input.maxDeliveryDays)
  if (leadErr) {
    errors.avgDeliveryDays = leadErr
    errors.maxDeliveryDays = leadErr
  }
  const phone = input.phone?.trim() ?? ''
  const email = input.email?.trim() ?? ''
  if (!hasContactMethod(phone, email)) {
    errors.contact = 'Enter a phone number (at least 6 digits) or a valid email address.'
  }
  if (email && !isValidEmail(email)) {
    errors.email = 'Enter a valid email address.'
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true }
}

export function findDuplicateSupplier(
  suppliers: Supplier[],
  companyName: string,
  excludeId?: string,
): Supplier | null {
  const norm = normalizeCompanyName(companyName)
  if (!norm) return null
  return (
    suppliers.find(
      (s) => s.id !== excludeId && normalizeCompanyName(s.companyName) === norm,
    ) ?? null
  )
}
