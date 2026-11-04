export interface ProductionBatch {
  id: string
  batchNumber: string
  date: string
  furnaceOrLine: string
  materialId: string
  plannedQuantity: number
  actualConsumed: number
  returnedQuantity: number
  finishedOutput?: number
  rejectedOutput?: number
  unit: string
  notes?: string
  movementIds: string[]
}
