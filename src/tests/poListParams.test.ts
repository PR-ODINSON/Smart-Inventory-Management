import { describe, expect, it } from 'vitest'
import {
  parsePoListParams,
  serializePoListParams,
  shouldIgnorePoRowNavigation,
} from '../lib/po/poListParams'

describe('poListParams', () => {
  it('round-trips tab, status, q and page', () => {
    const p = parsePoListParams(
      new URLSearchParams('tab=customer&status=ordered&q=aqua&page=2'),
    )
    expect(p.tab).toBe('received_from_customer')
    expect(p.status).toBe('ordered')
    expect(p.q).toBe('aqua')
    expect(p.page).toBe(2)
    const qs = serializePoListParams({ ...p, tab: 'received_from_customer' })
    expect(qs).toContain('tab=customer')
    expect(qs).toContain('status=ordered')
  })

  it('ignores clicks on buttons and checkboxes', () => {
    const btn = document.createElement('button')
    document.body.appendChild(btn)
    expect(shouldIgnorePoRowNavigation(btn)).toBe(true)
    btn.remove()
  })
})
