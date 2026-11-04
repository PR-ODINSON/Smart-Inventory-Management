import type { Material, StockStatus } from '../types/inventory'
import { addDaysToIso, todayIso } from '../utils/dates'

export interface ReorderInputs {
  physicalStock: number
  reserved: number
  awaitingInspection: number
  productionLevelPercent: number
  desiredCoverageDays: number
  asOfDate?: string
}

export interface ReorderMetrics {
  availableStock: number
  effectiveDailyConsumption: number
  safetyStock: number
  reorderPoint: number
  daysOfCover: number | null
  predictedStockOutDate: string | null
  recommendedOrderQty: number
  latestSafeOrderDate: string | null
  stockStatus: StockStatus
  inconsistencies: string[]
}

export function computeAvailableStock(
  physical: number,
  reserved: number,
  awaitingInspection: number,
): { available: number; inconsistencies: string[] } {
  const inconsistencies: string[] = []
  if (physical < 0) inconsistencies.push('Physical stock is negative.')
  if (reserved < 0) inconsistencies.push('Reserved quantity is negative.')
  if (awaitingInspection < 0) inconsistencies.push('Awaiting inspection quantity is negative.')
  if (reserved + awaitingInspection > physical) {
    inconsistencies.push(
      'Reserved plus awaiting inspection exceeds physical stock.',
    )
  }
  const raw = physical - reserved - awaitingInspection
  const available = Math.max(0, raw)
  if (raw < 0 && inconsistencies.length === 0) {
    inconsistencies.push('Available stock would be negative; capped at zero for planning.')
  }
  return { available, inconsistencies }
}

export function effectiveDailyConsumption(
  baseDaily: number,
  productionLevelPercent: number,
): number {
  if (baseDaily < 0) return 0
  const level = Math.min(150, Math.max(50, productionLevelPercent))
  return (baseDaily * level) / 100
}

export function computeSafetyStock(
  material: Material,
  effectiveDaily: number,
): number {
  if (material.safetyStockOverride != null && material.safetyStockOverride >= 0) {
    return material.safetyStockOverride
  }
  const avg = material.avgLeadTimeDays
  const max = material.maxLeadTimeDays
  if (avg < 0 || max < 0) return 0
  const leadSpread = Math.max(0, max - avg)
  return leadSpread * effectiveDaily
}

export function computeReorderPoint(
  material: Material,
  effectiveDaily: number,
  safetyStock: number,
): number {
  if (material.reorderPointOverride != null && material.reorderPointOverride >= 0) {
    return material.reorderPointOverride
  }
  if (material.avgLeadTimeDays < 0) return safetyStock
  return effectiveDaily * material.avgLeadTimeDays + safetyStock
}

export function computeDaysOfCover(
  available: number,
  effectiveDaily: number,
): number | null {
  if (effectiveDaily <= 0) return null
  if (available <= 0) return 0
  return available / effectiveDaily
}

export function computePredictedStockOutDate(
  daysOfCover: number | null,
  asOfDate: string,
): string | null {
  if (daysOfCover == null) return null
  return addDaysToIso(asOfDate, Math.ceil(daysOfCover))
}

export function roundUpToPackSize(qty: number, packSize: number): number {
  if (qty <= 0) return 0
  if (packSize <= 0) return Math.ceil(qty)
  return Math.ceil(qty / packSize) * packSize
}

export function computeRecommendedOrderQty(
  desiredCoverageDays: number,
  effectiveDaily: number,
  safetyStock: number,
  available: number,
  packSize: number,
): number {
  if (desiredCoverageDays < 0 || effectiveDaily < 0) return 0
  const raw =
    desiredCoverageDays * effectiveDaily + safetyStock - available
  if (raw <= 0) return 0
  return roundUpToPackSize(raw, packSize)
}

export function computeLatestSafeOrderDate(
  predictedStockOut: string | null,
  maxLeadTimeDays: number,
): string | null {
  if (!predictedStockOut || maxLeadTimeDays < 0) return null
  return addDaysToIso(predictedStockOut, -Math.ceil(maxLeadTimeDays))
}

export function deriveStockStatus(
  available: number,
  reorderPoint: number,
  effectiveDaily: number,
  daysOfCover: number | null,
  maxLeadTime: number,
): StockStatus {
  if (effectiveDaily <= 0) return 'no_consumption'
  if (available <= 0) return 'critical'
  if (daysOfCover != null && daysOfCover <= maxLeadTime) return 'critical'
  if (available < reorderPoint * 0.5) return 'critical'
  if (available < reorderPoint) return 'below_reorder'
  if (available < reorderPoint * 1.25) return 'approaching_reorder'
  return 'healthy'
}

export function computeReorderMetrics(
  material: Material,
  inputs: ReorderInputs,
): ReorderMetrics {
  const asOf = inputs.asOfDate ?? todayIso()
  const { available, inconsistencies } = computeAvailableStock(
    inputs.physicalStock,
    inputs.reserved,
    inputs.awaitingInspection,
  )
  const effectiveDaily = effectiveDailyConsumption(
    material.baseDailyConsumption,
    inputs.productionLevelPercent,
  )
  const safetyStock = computeSafetyStock(material, effectiveDaily)
  const reorderPoint = computeReorderPoint(material, effectiveDaily, safetyStock)
  const daysOfCover = computeDaysOfCover(available, effectiveDaily)
  const predictedStockOutDate = computePredictedStockOutDate(daysOfCover, asOf)
  const recommendedOrderQty = computeRecommendedOrderQty(
    inputs.desiredCoverageDays,
    effectiveDaily,
    safetyStock,
    available,
    material.packSize,
  )
  const latestSafeOrderDate = computeLatestSafeOrderDate(
    predictedStockOutDate,
    material.maxLeadTimeDays,
  )
  const stockStatus = deriveStockStatus(
    available,
    reorderPoint,
    effectiveDaily,
    daysOfCover,
    material.maxLeadTimeDays,
  )
  return {
    availableStock: available,
    effectiveDailyConsumption: effectiveDaily,
    safetyStock,
    reorderPoint,
    daysOfCover,
    predictedStockOutDate,
    recommendedOrderQty,
    latestSafeOrderDate,
    stockStatus,
    inconsistencies,
  }
}
