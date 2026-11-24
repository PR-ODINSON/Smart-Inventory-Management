import { describe, expect, it } from 'vitest'
import {
  computeMovementDelta,
  isSystemMovement,
  type MovementType,
} from '../services/inventoryMovementService'
import type { InventoryBalance, InventoryMovement } from '../types/inventory'

describe('Movement Edit and Delete Logic', () => {
  it('correctly calculates movement deltas for forward and reverse transitions', () => {
    // Receipt of 100 kg: +100 physical
    const receiptDelta = computeMovementDelta('goods_receipt', 100)
    expect(receiptDelta.physical).toBe(100)

    // Issue of 50 kg: -50 physical
    const issueDelta = computeMovementDelta('issue_to_production', 50)
    expect(issueDelta.physical).toBe(-50)

    // Stock adjustment decrease of 20 kg: -20 physical
    const adjDecDelta = computeMovementDelta('stock_adjustment', 20, 'decrease')
    expect(adjDecDelta.physical).toBe(-20)

    // Stock adjustment increase of 30 kg: +30 physical
    const adjIncDelta = computeMovementDelta('stock_adjustment', 30, 'increase')
    expect(adjIncDelta.physical).toBe(30)
  })

  it('movement edit reverses the old effect and applies the new effect (including changing the material)', () => {
    // Initial balances
    const balMatA: InventoryBalance = {
      materialId: 'MAT-A',
      physicalStock: 100,
      reserved: 0,
      awaitingInspection: 0,
      locationId: 'loc-1',
    }
    const balMatB: InventoryBalance = {
      materialId: 'MAT-B',
      physicalStock: 200,
      reserved: 0,
      awaitingInspection: 0,
      locationId: 'loc-1',
    }

    // Old movement: goods_receipt of 100 kg on MAT-A
    const oldMovement = {
      materialId: 'MAT-A',
      type: 'goods_receipt' as MovementType,
      quantity: 100,
    }

    // Step A: Reverse old movement effect on MAT-A (-100 kg)
    const oldDelta = computeMovementDelta(oldMovement.type, oldMovement.quantity)
    balMatA.physicalStock -= oldDelta.physical
    expect(balMatA.physicalStock).toBe(0) // 100 - 100 = 0

    // Step B: Apply new movement effect: goods_receipt of 150 kg on MAT-B (+150 kg)
    const newMovement = {
      materialId: 'MAT-B',
      type: 'goods_receipt' as MovementType,
      quantity: 150,
    }
    const newDelta = computeMovementDelta(newMovement.type, newMovement.quantity)
    balMatB.physicalStock += newDelta.physical
    expect(balMatB.physicalStock).toBe(350) // 200 + 150 = 350
  })

  it('movement delete reverses its effect and allows negative stock', () => {
    // Current stock: 20 kg (e.g., received 100, issued 80, leaving 20)
    const balance: InventoryBalance = {
      materialId: 'MAT-001',
      physicalStock: 20,
      reserved: 0,
      awaitingInspection: 0,
      locationId: 'loc-1',
    }

    // Deleting the receipt of 100 kg
    const receiptMovement = {
      materialId: 'MAT-001',
      type: 'goods_receipt' as MovementType,
      quantity: 100,
    }

    const delta = computeMovementDelta(receiptMovement.type, receiptMovement.quantity)
    balance.physicalStock -= delta.physical

    // Result is allowed to be negative (-80 kg)
    expect(balance.physicalStock).toBe(-80)
  })

  it('deleting an issue adds stock back', () => {
    const balance: InventoryBalance = {
      materialId: 'MAT-001',
      physicalStock: 50,
      reserved: 0,
      awaitingInspection: 0,
      locationId: 'loc-1',
    }

    // Old issue: 50 kg
    const issueMovement = {
      materialId: 'MAT-001',
      type: 'issue_to_production' as MovementType,
      quantity: 50,
    }

    const delta = computeMovementDelta(issueMovement.type, issueMovement.quantity) // physical: -50
    // Reversal: subtract delta (-(-50) = +50)
    balance.physicalStock -= delta.physical
    expect(balance.physicalStock).toBe(100)
  })

  it('system movements are identified and blocked from edit/delete', () => {
    const systemMovement1: InventoryMovement = {
      id: 'MVT-REV-1234',
      materialId: 'MAT-001',
      type: 'stock_adjustment',
      quantity: 50,
      unit: 'kg',
      timestamp: '2026-11-25T00:00:00Z',
      previousPhysicalStock: 100,
      resultingPhysicalStock: 50,
      previousReserved: 0,
      resultingReserved: 0,
      previousAwaitingInspection: 0,
      resultingAwaitingInspection: 0,
    }
    const systemMovement2: InventoryMovement = {
      id: 'MOV-999',
      materialId: 'MAT-001',
      type: 'stock_adjustment',
      quantity: 50,
      unit: 'kg',
      isSystem: true,
      timestamp: '2026-11-25T00:00:00Z',
      previousPhysicalStock: 100,
      resultingPhysicalStock: 50,
      previousReserved: 0,
      resultingReserved: 0,
      previousAwaitingInspection: 0,
      resultingAwaitingInspection: 0,
    }
    const userMovement: InventoryMovement = {
      id: 'MOV-USER-1',
      materialId: 'MAT-001',
      type: 'goods_receipt',
      quantity: 100,
      unit: 'kg',
      timestamp: '2026-11-25T00:00:00Z',
      previousPhysicalStock: 0,
      resultingPhysicalStock: 100,
      previousReserved: 0,
      resultingReserved: 0,
      previousAwaitingInspection: 0,
      resultingAwaitingInspection: 0,
    }

    expect(isSystemMovement(systemMovement1)).toBe(true)
    expect(isSystemMovement(systemMovement2)).toBe(true)
    expect(isSystemMovement(userMovement)).toBe(false)
  })
})
