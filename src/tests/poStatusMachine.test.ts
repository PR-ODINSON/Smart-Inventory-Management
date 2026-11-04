import { describe, expect, it } from 'vitest'
import {
  canWorkflowAction,
  statusAfterWorkflowAction,
} from '../lib/po/poStatusMachine'
import type { PurchaseOrder } from '../types/purchasing'

function po(status: PurchaseOrder['status']): PurchaseOrder {
  return {
    id: 'PO-1',
    poNumber: 'X',
    lines: [],
    status,
    approvalStatus: 'not_required',
    createdAt: '',
    updatedAt: '',
  }
}

describe('poStatusMachine', () => {
  it('allows draft -> pending_approval', () => {
    const p = po('draft')
    expect(canWorkflowAction(p, 'submit_for_approval')).toBe(true)
    expect(statusAfterWorkflowAction(p, 'submit_for_approval')).toBe('pending_approval')
  })

  it('blocks approve from draft', () => {
    expect(() => statusAfterWorkflowAction(po('draft'), 'approve')).toThrow()
  })

  it('reject returns to draft', () => {
    expect(statusAfterWorkflowAction(po('pending_approval'), 'reject')).toBe('draft')
  })

  it('allows cancel from ordered', () => {
    expect(canWorkflowAction(po('ordered'), 'cancel')).toBe(true)
  })

  it('blocks mark_ordered from draft', () => {
    expect(() => statusAfterWorkflowAction(po('draft'), 'mark_ordered')).toThrow()
  })
})
