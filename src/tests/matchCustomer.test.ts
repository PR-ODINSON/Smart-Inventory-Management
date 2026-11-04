import { describe, expect, it } from 'vitest'
import { matchCustomer, normaliseCustomerName } from '../lib/poImport/matchCustomer'
import type { Customer } from '../types/customer'

const now = new Date().toISOString()

function cust(name: string, gstin?: string): Customer {
  return {
    id: 'c1',
    name,
    gstin,
    active: true,
    createdAt: now,
    updatedAt: now,
  }
}

describe('normaliseCustomerName', () => {
  it('normalises MBH variants to the same key', () => {
    expect(normaliseCustomerName('MBH PUMPS (GUJ) PVT. LTD.')).toBe(
      normaliseCustomerName('Mbh Pumps Guj Pvt Ltd'),
    )
  })
})

describe('matchCustomer', () => {
  it('fuzzy-matches Aqua names with confirmation', () => {
    const master = [cust('AQUA MACHINERIES P. LIMITED', '24AACCP3014A1ZB')]
    const r = matchCustomer(master, {
      name: 'Aqua Machineries Pvt Ltd',
      gstin: null,
    })
    expect(r.kind).toBe('fuzzy')
    expect(r.needsConfirmation).toBe(true)
    expect(r.customer?.name).toContain('AQUA')
  })

  it('exact match by GSTIN', () => {
    const master = [cust('SB Pumps Solutions Private Limited', '24ABICS0605D1ZV')]
    const r = matchCustomer(master, {
      name: 'Other',
      gstin: '24ABICS0605D1ZV',
    })
    expect(r.kind).toBe('gstin')
    expect(r.needsConfirmation).toBe(false)
  })
})
