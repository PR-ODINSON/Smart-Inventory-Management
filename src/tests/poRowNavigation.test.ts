import { describe, expect, it, vi } from 'vitest'
import { shouldIgnorePoRowNavigation } from '../lib/po/poListParams'

function simulateRowClick(target: EventTarget | null, navigate: (path: string) => void) {
  if (shouldIgnorePoRowNavigation(target)) return
  navigate('/purchase-orders/PO-123')
}

describe('PO list row navigation', () => {
  it('navigates on row click', () => {
    const nav = vi.fn()
    const td = document.createElement('td')
    simulateRowClick(td, nav)
    expect(nav).toHaveBeenCalledWith('/purchase-orders/PO-123')
  })

  it('does not navigate when clicking delete button', () => {
    const nav = vi.fn()
    const btn = document.createElement('button')
    simulateRowClick(btn, nav)
    expect(nav).not.toHaveBeenCalled()
  })
})
