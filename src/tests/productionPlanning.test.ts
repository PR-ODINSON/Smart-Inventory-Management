import { describe, expect, it } from 'vitest'
import {
  aggregateCustomerOrders,
  calculateDailyRawMaterialRequirement,
  calculateLineWeightPerPieceKg,
  calculateStockCoverage,
  checkReceiptDuplicate,
  computeIssueStockDelta,
  computeReceiptStockDelta,
  evaluateDeadlineRisks,
} from '../lib/productionPlanning'
import type { PurchaseOrder } from '../types/purchasing'

describe('productionPlanning logic', () => {
  describe('calculateDailyRawMaterialRequirement', () => {
    it('applies the 10% planning allowance correctly with the worked example', () => {
      // Monthly target 60 tonnes = 60,000 kg, 25 working days -> daily production 2,400 kg/day
      // Rate = 0.05 kg/kg casting -> base = 120 kg/day, planned (+10%) = 132 kg/day
      const result = calculateDailyRawMaterialRequirement({
        targetTonnes: 60,
        workingDays: 25,
        consumptionRateKgPerKgCasting: 0.05,
      })

      expect(result.dailyCastingProductionKg).toBe(2400)
      expect(result.dailyRawMaterialRequirementKg).toBe(120)
      expect(result.plannedDailyRequirementKg).toBe(132)
    })

    it('returns zeroes for invalid or zero inputs', () => {
      const result = calculateDailyRawMaterialRequirement({
        targetTonnes: 0,
        workingDays: 25,
        consumptionRateKgPerKgCasting: 0.05,
      })
      expect(result.dailyCastingProductionKg).toBe(0)
      expect(result.dailyRawMaterialRequirementKg).toBe(0)
      expect(result.plannedDailyRequirementKg).toBe(0)
    })
  })

  describe('calculateStockCoverage', () => {
    it('matches the exact illustrative example from specifications', () => {
      // Planned daily requirement = 100 kg, Desired coverage = 7 days,
      // Required stock = 700 kg, Available stock = 500 kg,
      // Estimated coverage = 5 days, Additional to purchase = 200 kg
      const result = calculateStockCoverage({
        availableStockKg: 500,
        plannedDailyRequirementKg: 100,
        desiredInventoryDays: 7,
      })

      expect(result.estimatedStockCoverageDays).toBe(5)
      expect(result.requiredStockKg).toBe(700)
      expect(result.purchaseRequirementKg).toBe(200)
      expect(result.statementText).toBe(
        'Your available stock is estimated to last 5 working days. To maintain 7 working days of inventory, purchase an additional 200 kg.',
      )
    })

    it('floors purchase requirement at 0 when stock is sufficient', () => {
      const result = calculateStockCoverage({
        availableStockKg: 1000,
        plannedDailyRequirementKg: 100,
        desiredInventoryDays: 7,
      })

      expect(result.estimatedStockCoverageDays).toBe(10)
      expect(result.requiredStockKg).toBe(700)
      expect(result.purchaseRequirementKg).toBe(0)
    })

    it('handles zero planned requirement cleanly without Infinity or NaN', () => {
      const result = calculateStockCoverage({
        availableStockKg: 500,
        plannedDailyRequirementKg: 0,
        desiredInventoryDays: 7,
      })

      expect(result.estimatedStockCoverageDays).toBeNull()
      expect(result.purchaseRequirementKg).toBe(0)
      expect(result.statementText).toContain('No planned daily consumption')
    })
  })

  describe('aggregateCustomerOrders', () => {
    it('aggregates pending casting orders and distinguishes ordered from fulfilled', () => {
      const sampleOrders: PurchaseOrder[] = [
        {
          id: 'po-1',
          poNumber: 'PO-001',
          direction: 'received_from_customer',
          status: 'ordered',
          approvalStatus: 'approved',
          createdAt: '2026-11-01',
          updatedAt: '2026-11-01',
          buyer: { name: 'Acme Pumps' },
          lines: [
            {
              id: 'l1',
              materialId: 'CAST-1',
              orderQuantity: 100,
              quantityNos: 100,
              unit: 'nos',
              unitWeight: 50,
              weightUnit: 'kg',
              totalWeightKg: 5000,
              receivedQuantity: 0,
              dispatchedQuantity: 20, // 20 fulfilled, 80 pending
              grade: 'FG260',
            },
          ],
        },
        {
          id: 'po-2',
          poNumber: 'PO-002',
          direction: 'received_from_customer',
          status: 'ordered',
          approvalStatus: 'approved',
          createdAt: '2026-11-02',
          updatedAt: '2026-11-02',
          buyer: { name: 'Beta Valves' },
          lines: [
            {
              id: 'l2',
              materialId: 'CAST-2',
              orderQuantity: 10,
              quantityNos: 10,
              unit: 'nos',
              unitWeight: 8500, // 85 tonnes
              weightUnit: 'kg',
              totalWeightKg: 85000,
              receivedQuantity: 0,
              dispatchedQuantity: 0,
            },
          ],
        },
        // Supplier PO which should be ignored by customer aggregation
        {
          id: 'po-sup',
          poNumber: 'SUP-001',
          direction: 'issued_to_supplier',
          status: 'ordered',
          approvalStatus: 'approved',
          createdAt: '2026-11-03',
          updatedAt: '2026-11-03',
          lines: [],
        },
      ]

      const summary = aggregateCustomerOrders(sampleOrders)

      // Total ordered: 5000 kg + 85000 kg = 90,000 kg = 90 tonnes
      expect(summary.totalOrderedKg).toBe(90000)
      expect(summary.totalOrderedTonnes).toBe(90)

      // Total fulfilled: 20 nos * 50 kg = 1000 kg = 1 tonne
      expect(summary.totalFulfilledKg).toBe(1000)

      // Total pending: 80 nos * 50 kg (4000 kg) + 85000 kg = 89,000 kg = 89 tonnes
      expect(summary.totalPendingKg).toBe(89000)
      expect(summary.totalPendingTonnes).toBe(89)
    })
  })

  describe('evaluateDeadlineRisks', () => {
    it('flags items where estimated completion exceeds delivery deadline', () => {
      const items = [
        {
          poId: 'po-1',
          poNumber: 'PO-001',
          customerName: 'Acme',
          lineId: 'l1',
          weightPerPieceKg: 100,
          orderedQty: 10,
          fulfilledQty: 0,
          pendingQty: 10,
          orderedWeightKg: 1000,
          pendingWeightKg: 1000,
          deliveryDeadline: '2026-11-02',
        },
      ]

      // Daily production = 100 kg/day. 1000 kg takes 10 days.
      // Starting 2026-11-01, completion is 2026-11-11, which misses 2026-11-02 deadline.
      const startDate = new Date('2026-11-01T00:00:00Z')
      const risks = evaluateDeadlineRisks(items, 100, startDate)

      expect(risks).toHaveLength(1)
      expect(risks[0].isAtRisk).toBe(true)
      expect(risks[0].daysShort).toBeGreaterThan(0)
    })
  })

  describe('Material Receipts & Issues pure calculations', () => {
    it('detects duplicate invoices by supplier name and invoice number', () => {
      const existing = [
        { supplierName: 'Tata Metaliks', invoiceNumber: 'INV-1001' },
        { supplierName: 'Plasma Induction', invoiceNumber: 'PI-2025' },
      ]

      expect(checkReceiptDuplicate(existing, 'Tata Metaliks', 'INV-1001')).toBe(true)
      expect(checkReceiptDuplicate(existing, ' tata metaliks ', 'inv-1001')).toBe(true)
      expect(checkReceiptDuplicate(existing, 'Tata Metaliks', 'INV-1002')).toBe(false)
      expect(checkReceiptDuplicate(existing, 'Other Supplier', 'INV-1001')).toBe(false)
    })

    it('adds ONLY the accepted received quantity to stock, tracking discrepancy', () => {
      // Billed: 500 kg, Received: 450 kg
      const result = computeReceiptStockDelta(500, 450)
      expect(result.addedStock).toBe(450)
      expect(result.discrepancy).toBe(-50)
    })

    it('reduces stock when issued to production', () => {
      // Current stock: 500 kg, Issue: 120 kg -> 380 kg
      const nextStock = computeIssueStockDelta(500, 120)
      expect(nextStock).toBe(380)

      expect(() => computeIssueStockDelta(500, 600)).toThrow(/only 500 available/i)
      expect(() => computeIssueStockDelta(500, 0)).toThrow(/greater than 0/i)
    })
  })
})
