export interface ProductionPlan {
  id: string
  /** Format: YYYY-MM e.g. "2026-11" */
  month: string
  maxCapacityTonnes: number
  targetTonnes: number
  workingDays: number
  desiredInventoryDays: number
  createdAt: string
  updatedAt: string
}

export interface MaterialConsumptionRate {
  id: string
  materialId: string
  /** Optional casting grade or specification e.g. "FG260" */
  grade?: string
  /** Consumption rate in kg of raw material per 1 kg of casting output */
  rateKgPerKgCasting: number
  sourceNotes?: string
  updatedAt: string
}

export interface MaterialReceipt {
  id: string
  supplierId?: string
  supplierName: string
  invoiceNumber: string
  invoiceDate?: string
  materialId: string
  billedQty: number
  receivedQty: number
  unit: string
  rate?: number
  amount?: number
  receivedAt: string
  locationId?: string
  remarks?: string
}

export interface MaterialIssue {
  id: string
  materialId: string
  quantity: number
  unit: string
  productionBatchId?: string
  issuedAt: string
  remarks?: string
  operator?: string
}
