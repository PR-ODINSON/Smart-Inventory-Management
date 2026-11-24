export interface DispatchRecord {
  id: string
  customerPoId: string
  poItemId: string
  materialName: string
  quantity: number
  unit: string
  totalWeightKg?: number
  dispatchDate: string
  invoiceNo?: string
  remarks?: string
  createdAt: string
}

export interface MovementTypeMaster {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}
