import { describe, expect, it } from 'vitest'
import {
  calculateStockCoverage,
} from '../lib/productionPlanning'

describe('Inventory & Units Calculation Rules', () => {
  it('calculates Days to be Covered, Reorder Quantity with Emergency Stock, and Stock Out Date for worked example', () => {
    // Worked example from specifications:
    // Daily Use = 100 kg/day, Available Stock = 500 kg, Emergency Stock = 0 kg, Desired Inventory Days = 7
    // Days to be Covered = 500 / 100 = 5.0 days
    // Required Stock = 7 x 100 = 700 kg
    // Reorder Quantity = max(0, 700 + 0 - 500) = 200 kg
    const asOf = new Date('2026-11-24T00:00:00Z')
    const result = calculateStockCoverage({
      availableStockKg: 500,
      plannedDailyRequirementKg: 100,
      desiredInventoryDays: 7,
      emergencyStockKg: 0,
      unit: 'kg',
      asOfDate: asOf,
    })

    expect(result.estimatedStockCoverageDays).toBe(5.0)
    expect(result.requiredStockKg).toBe(700)
    expect(result.emergencyStockKg).toBe(0)
    expect(result.purchaseRequirementKg).toBe(200)
    expect(result.stockOutDate).toBe('2026-11-29')
  })

  it('adds Emergency Stock buffer to Reorder Quantity correctly', () => {
    // Daily Use = 100 kg/day, Available = 500 kg, Emergency Stock = 50 kg, Desired Days = 7
    // Required Stock = 700 kg
    // Reorder Quantity = max(0, 700 + 50 - 500) = 250 kg
    const result = calculateStockCoverage({
      availableStockKg: 500,
      plannedDailyRequirementKg: 100,
      desiredInventoryDays: 7,
      emergencyStockKg: 50,
      unit: 'kg',
    })

    expect(result.purchaseRequirementKg).toBe(250)
  })

  it('floors Reorder Quantity at 0 when stock exceeds required + emergency stock', () => {
    // Daily Use = 100, Available = 900, Emergency = 50, Desired = 7
    // Required + Emergency = 750 < 900 -> Reorder = 0
    const result = calculateStockCoverage({
      availableStockKg: 900,
      plannedDailyRequirementKg: 100,
      desiredInventoryDays: 7,
      emergencyStockKg: 50,
      unit: 'kg',
    })

    expect(result.purchaseRequirementKg).toBe(0)
  })

  it('shows Days to be Covered as null (rendered as —) when Daily Use is 0', () => {
    const result = calculateStockCoverage({
      availableStockKg: 500,
      plannedDailyRequirementKg: 0,
      desiredInventoryDays: 7,
      emergencyStockKg: 50,
      unit: 'kg',
    })

    expect(result.estimatedStockCoverageDays).toBeNull()
    expect(result.purchaseRequirementKg).toBe(0)
    expect(result.stockOutDate).toBeNull()
  })

  it('uses the same unit for Daily Need and Purchase Requirement in statement and result', () => {
    const resultTonne = calculateStockCoverage({
      availableStockKg: 5,
      plannedDailyRequirementKg: 1,
      desiredInventoryDays: 7,
      emergencyStockKg: 0,
      unit: 'tonne',
    })

    expect(resultTonne.statementText).toContain('purchase an additional 2 tonne')
    expect(resultTonne.purchaseRequirementKg).toBe(2)
  })
})
