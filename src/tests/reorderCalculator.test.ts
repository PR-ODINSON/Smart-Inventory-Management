import { describe, expect, it } from 'vitest'
import type { Material } from '../types/inventory'
import {
  computeAvailableStock,
  computeDaysOfCover,
  computeLatestSafeOrderDate,
  computeRecommendedOrderQty,
  computeReorderMetrics,
  effectiveDailyConsumption,
  roundUpToPackSize,
} from '../services/reorderCalculator'

const baseMaterial: Material = {
  id: 'MAT-TEST',
  name: 'Test',
  category: 'Test',
  unit: 'kg',
  packSize: 25,
  baseDailyConsumption: 10,
  avgLeadTimeDays: 5,
  maxLeadTimeDays: 10,
  supplierIds: [],
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('reorderCalculator', () => {
  it('computes available stock', () => {
    const r = computeAvailableStock(100, 20, 10)
    expect(r.available).toBe(70)
  })

  it('flags inconsistency when reserved exceeds physical', () => {
    const r = computeAvailableStock(50, 40, 20)
    expect(r.inconsistencies.length).toBeGreaterThan(0)
    expect(r.available).toBe(0)
  })

  it('computes safety stock from lead spread', () => {
    const ed = effectiveDailyConsumption(10, 100)
    const m = computeReorderMetrics(baseMaterial, {
      physicalStock: 200,
      reserved: 0,
      awaitingInspection: 0,
      productionLevelPercent: 100,
      desiredCoverageDays: 14,
      asOfDate: '2026-01-01T00:00:00.000Z',
    })
    expect(m.safetyStock).toBe((10 - 5) * ed)
    expect(m.reorderPoint).toBe(ed * 5 + m.safetyStock)
  })

  it('handles zero consumption', () => {
    const m = { ...baseMaterial, baseDailyConsumption: 0 }
    const metrics = computeReorderMetrics(m, {
      physicalStock: 100,
      reserved: 0,
      awaitingInspection: 0,
      productionLevelPercent: 100,
      desiredCoverageDays: 14,
    })
    expect(metrics.daysOfCover).toBeNull()
    expect(metrics.stockStatus).toBe('no_consumption')
  })

  it('computes days of cover', () => {
    expect(computeDaysOfCover(100, 10)).toBe(10)
    expect(computeDaysOfCover(100, 0)).toBeNull()
  })

  it('rounds order quantity to pack size', () => {
    expect(roundUpToPackSize(26, 25)).toBe(50)
    expect(computeRecommendedOrderQty(14, 10, 50, 70, 25)).toBeGreaterThan(0)
    expect(computeRecommendedOrderQty(14, 10, 50, 500, 25)).toBe(0)
  })

  it('computes safe order date before stock-out by max lead time', () => {
    const stockOut = '2026-01-05T00:00:00.000Z'
    const safe = computeLatestSafeOrderDate(stockOut, 10)
    expect(safe).toBeTruthy()
    const stockOutTime = new Date(stockOut).getTime()
    const safeTime = new Date(safe!).getTime()
    const diffDays = (stockOutTime - safeTime) / (86400000)
    expect(diffDays).toBe(10)
  })

  it('scales consumption with production level', () => {
    expect(effectiveDailyConsumption(100, 150)).toBe(150)
    expect(effectiveDailyConsumption(100, 40)).toBe(50)
  })
})
