import type { PurchaseOrder, PurchaseOrderLine } from '../types/purchasing'
import { isCustomerPo } from '../types/purchasing'

export interface CustomerOrderAggregationItem {
  poId: string
  poNumber: string
  customerName: string
  lineId: string
  itemCode?: string
  description?: string
  specification?: string
  weightPerPieceKg: number
  orderedQty: number
  fulfilledQty: number
  pendingQty: number
  orderedWeightKg: number
  pendingWeightKg: number
  deliveryDeadline?: string
}

export interface CustomerOrdersSummary {
  totalPendingKg: number
  totalPendingTonnes: number
  totalOrderedKg: number
  totalOrderedTonnes: number
  totalFulfilledKg: number
  totalFulfilledTonnes: number
  items: CustomerOrderAggregationItem[]
}

/**
 * Calculates weight per piece (in kg) for a customer PO line.
 * If unitWeight is provided, use it; otherwise totalWeightKg / quantityNos.
 */
export function calculateLineWeightPerPieceKg(line: PurchaseOrderLine): number {
  if (line.unitWeight && line.unitWeight > 0) {
    return line.unitWeight
  }
  const nos = line.quantityNos ?? line.orderQuantity ?? 0
  const totalKg = line.totalWeightKg ?? 0
  if (nos > 0 && totalKg > 0) {
    return totalKg / nos
  }
  return 0
}

/**
 * Aggregates all customer purchase orders:
 * - Distinguishes ordered from fulfilled (dispatchedQuantity or receivedQuantity)
 * - Pending = ordered - fulfilled (never negative)
 * - Computes ordered weight and pending weight in kg and tonnes
 */
export function aggregateCustomerOrders(orders: PurchaseOrder[]): CustomerOrdersSummary {
  const customerOrders = orders.filter(isCustomerPo)
  const items: CustomerOrderAggregationItem[] = []

  let totalPendingKg = 0
  let totalOrderedKg = 0
  let totalFulfilledKg = 0

  for (const po of customerOrders) {
    if (po.status === 'cancelled') continue
    const customerName = po.buyer?.name || 'Unknown Customer'

    for (const line of po.lines) {
      const orderedQty = line.quantityNos ?? line.orderQuantity ?? 0
      const fulfilledQty = line.dispatchedQuantity ?? line.receivedQuantity ?? 0
      const pendingQty = Math.max(0, orderedQty - fulfilledQty)
      const wtPerPiece = calculateLineWeightPerPieceKg(line)

      const orderedWeightKg = line.totalWeightKg && line.totalWeightKg > 0
        ? line.totalWeightKg
        : wtPerPiece * orderedQty

      const pendingWeightKg = pendingQty > 0
        ? (orderedQty > 0 ? (orderedWeightKg * (pendingQty / orderedQty)) : 0)
        : 0

      const fulfilledWeightKg = Math.max(0, orderedWeightKg - pendingWeightKg)

      totalOrderedKg += orderedWeightKg
      totalPendingKg += pendingWeightKg
      totalFulfilledKg += fulfilledWeightKg

      // Casting specification format: shape / size / drawing / grade
      const specParts = [
        line.grade ? `Grade: ${line.grade}` : '',
        line.drawingNo ? `Drg: ${line.drawingNo}` : '',
        line.patternNo ? `Pattern: ${line.patternNo}` : '',
      ].filter(Boolean)
      const specification = specParts.length > 0 ? specParts.join(' | ') : undefined

      items.push({
        poId: po.id,
        poNumber: po.poNumber,
        customerName,
        lineId: line.id,
        itemCode: line.buyerItemCode || line.materialId,
        description: line.description,
        specification,
        weightPerPieceKg: roundTo2(wtPerPiece),
        orderedQty,
        fulfilledQty,
        pendingQty,
        orderedWeightKg: roundTo2(orderedWeightKg),
        pendingWeightKg: roundTo2(pendingWeightKg),
        deliveryDeadline: line.deliveryDate || po.expectedDeliveryDate,
      })
    }
  }

  return {
    totalPendingKg: roundTo2(totalPendingKg),
    totalPendingTonnes: roundTo3(totalPendingKg / 1000),
    totalOrderedKg: roundTo2(totalOrderedKg),
    totalOrderedTonnes: roundTo3(totalOrderedKg / 1000),
    totalFulfilledKg: roundTo2(totalFulfilledKg),
    totalFulfilledTonnes: roundTo3(totalFulfilledKg / 1000),
    items,
  }
}

/**
 * Step 3: Daily raw material requirements calculation logic
 * Daily casting production (kg/day) = Monthly production target (kg) / Planned working days
 * Daily raw material requirement (kg/day) = Daily casting production x Material consumption rate
 * Planned daily requirement (kg/day) = Daily raw material requirement x 1.10 (10% planning allowance)
 */
export interface DailyRequirementInput {
  targetTonnes: number
  workingDays: number
  consumptionRateKgPerKgCasting: number
}

export interface DailyRequirementResult {
  dailyCastingProductionKg: number
  dailyRawMaterialRequirementKg: number
  plannedDailyRequirementKg: number // Includes 10% planning allowance
}

export function calculateDailyRawMaterialRequirement(input: DailyRequirementInput): DailyRequirementResult {
  const { targetTonnes, workingDays, consumptionRateKgPerKgCasting } = input
  if (workingDays <= 0 || targetTonnes <= 0 || consumptionRateKgPerKgCasting <= 0) {
    return {
      dailyCastingProductionKg: 0,
      dailyRawMaterialRequirementKg: 0,
      plannedDailyRequirementKg: 0,
    }
  }

  const targetKg = targetTonnes * 1000
  const dailyCastingProductionKg = targetKg / workingDays
  const dailyRawMaterialRequirementKg = dailyCastingProductionKg * consumptionRateKgPerKgCasting
  const plannedDailyRequirementKg = dailyRawMaterialRequirementKg * 1.10

  return {
    dailyCastingProductionKg: roundTo2(dailyCastingProductionKg),
    dailyRawMaterialRequirementKg: roundTo2(dailyRawMaterialRequirementKg),
    plannedDailyRequirementKg: roundTo2(plannedDailyRequirementKg),
  }
}

/**
 * Step 4: Compare available stock with desired inventory period
 * Estimated stock coverage = Available stock / Planned daily requirement
 * Required stock = Desired inventory days x Planned daily requirement
 * Purchase requirement = Required stock - Available stock (floored at 0)
 */
export interface StockCoverageInput {
  availableStockKg: number
  plannedDailyRequirementKg: number
  desiredInventoryDays: number
  emergencyStockKg?: number
  unit?: string
  asOfDate?: Date
}

export interface StockCoverageResult {
  availableStockKg: number
  plannedDailyRequirementKg: number
  estimatedStockCoverageDays: number | null
  desiredInventoryDays: number
  emergencyStockKg: number
  requiredStockKg: number
  purchaseRequirementKg: number
  stockOutDate: string | null
  statementText: string
}

export function calculateStockCoverage(input: StockCoverageInput): StockCoverageResult {
  const {
    availableStockKg,
    plannedDailyRequirementKg,
    desiredInventoryDays,
    emergencyStockKg = 0,
    unit = 'kg',
    asOfDate = new Date(),
  } = input

  if (plannedDailyRequirementKg <= 0) {
    return {
      availableStockKg: roundTo2(availableStockKg),
      plannedDailyRequirementKg: 0,
      estimatedStockCoverageDays: null,
      desiredInventoryDays,
      emergencyStockKg: roundTo2(emergencyStockKg),
      requiredStockKg: 0,
      purchaseRequirementKg: 0,
      stockOutDate: null,
      statementText: 'No planned daily consumption for this material under the current production plan.',
    }
  }

  const coverageRaw = availableStockKg / plannedDailyRequirementKg
  const estimatedStockCoverageDays = roundTo1(coverageRaw)
  const requiredStockKg = roundTo2(desiredInventoryDays * plannedDailyRequirementKg)

  // Reorder Quantity = max(0, Required Stock + Emergency Stock - Available Stock)
  const purchaseRequirementKg = Math.max(
    0,
    roundTo2(requiredStockKg + emergencyStockKg - availableStockKg),
  )

  // Stock Out Date = Today + Days to be Covered (in calendar days from plan reference date)
  let stockOutDate: string | null = null
  if (estimatedStockCoverageDays != null) {
    const d = new Date(asOfDate)
    d.setDate(d.getDate() + Math.ceil(estimatedStockCoverageDays))
    stockOutDate = d.toISOString().split('T')[0]
  }

  const coverageDisplay = estimatedStockCoverageDays
  const statementText = `Your available stock is estimated to last ${coverageDisplay} working days. To maintain ${desiredInventoryDays} working days of inventory, purchase an additional ${purchaseRequirementKg} ${unit}.`

  return {
    availableStockKg: roundTo2(availableStockKg),
    plannedDailyRequirementKg: roundTo2(plannedDailyRequirementKg),
    estimatedStockCoverageDays,
    desiredInventoryDays,
    emergencyStockKg: roundTo2(emergencyStockKg),
    requiredStockKg,
    purchaseRequirementKg,
    stockOutDate,
    statementText,
  }
}

/**
 * Step 2: Deadline risk calculation
 * For each pending PO/item:
 * days needed = Pending weight (kg) / Planned daily casting production (kg/day)
 * If estimated completion date is after delivery deadline, flag as at risk.
 */
export interface DeadlineRiskItem {
  poNumber: string
  customerName: string
  description?: string
  pendingWeightKg: number
  deliveryDeadline: string
  daysNeeded: number
  estimatedCompletionDate: string
  isAtRisk: boolean
  daysShort: number
}

export function evaluateDeadlineRisks(
  items: CustomerOrderAggregationItem[],
  dailyCastingProductionKg: number,
  planStartDate: Date = new Date(),
): DeadlineRiskItem[] {
  if (dailyCastingProductionKg <= 0) return []

  const risks: DeadlineRiskItem[] = []

  // Items are scheduled sequentially or in parallel based on cumulative pending weight
  let cumulativeWeightKg = 0

  for (const item of items) {
    if (item.pendingQty <= 0 || !item.deliveryDeadline) continue

    cumulativeWeightKg += item.pendingWeightKg
    const daysNeeded = Math.ceil(cumulativeWeightKg / dailyCastingProductionKg)

    const estimatedCompletion = new Date(planStartDate)
    estimatedCompletion.setDate(estimatedCompletion.getDate() + daysNeeded)
    const estimatedCompletionDate = estimatedCompletion.toISOString().split('T')[0]

    const deadline = new Date(item.deliveryDeadline)
    const isAtRisk = estimatedCompletion.getTime() > deadline.getTime()

    const diffMs = estimatedCompletion.getTime() - deadline.getTime()
    const daysShort = isAtRisk ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0

    if (isAtRisk) {
      risks.push({
        poNumber: item.poNumber,
        customerName: item.customerName,
        description: item.description,
        pendingWeightKg: item.pendingWeightKg,
        deliveryDeadline: item.deliveryDeadline,
        daysNeeded,
        estimatedCompletionDate,
        isAtRisk,
        daysShort,
      })
    }
  }

  return risks
}

export function checkReceiptDuplicate(
  existingReceipts: Array<{ supplierName: string; invoiceNumber: string }>,
  supplierName: string,
  invoiceNumber: string,
): boolean {
  const normSupplier = supplierName.trim().toLowerCase()
  const normInvoice = invoiceNumber.trim().toLowerCase()
  return existingReceipts.some(
    (r) =>
      r.supplierName.trim().toLowerCase() === normSupplier &&
      r.invoiceNumber.trim().toLowerCase() === normInvoice,
  )
}

export function computeReceiptStockDelta(billedQty: number, receivedQty: number): { addedStock: number; discrepancy: number } {
  return {
    addedStock: Math.max(0, receivedQty),
    discrepancy: receivedQty - billedQty,
  }
}

export function computeIssueStockDelta(currentStock: number, issueQty: number): number {
  if (issueQty <= 0) throw new Error('Issued quantity must be greater than 0.')
  if (issueQty > currentStock) throw new Error(`Cannot issue ${issueQty}; only ${currentStock} available.`)
  return currentStock - issueQty
}

function roundTo1(n: number): number {
  return Math.round(n * 10) / 10
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100
}

function roundTo3(n: number): number {
  return Math.round(n * 1000) / 1000
}
