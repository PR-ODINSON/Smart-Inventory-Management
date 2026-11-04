export type MaterialStatus = 'active' | 'archived'

export type StockStatus =
  | 'healthy'
  | 'approaching_reorder'
  | 'below_reorder'
  | 'critical'
  | 'no_consumption'

export interface Material {
  id: string
  name: string
  category: string
  unit: string
  packSize: number
  /** Weight of one inventory unit in kg (1 for kg, 1000 for tonnes, set per piece for pieces) */
  unitWeightKg?: number
  baseDailyConsumption: number
  avgLeadTimeDays: number
  maxLeadTimeDays: number
  defaultLocationId?: string
  supplierIds: string[]
  safetyStockOverride?: number
  reorderPointOverride?: number
  status: MaterialStatus
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface InventoryBalance {
  materialId: string
  physicalStock: number
  reserved: number
  awaitingInspection: number
  locationId: string
}

export interface LocationBalance {
  materialId: string
  locationId: string
  quantity: number
}

export type MovementType =
  | 'goods_receipt'
  | 'issue_to_production'
  | 'transfer'
  | 'return_from_production'
  | 'return_to_supplier'
  | 'stock_adjustment'
  | 'inspection_acceptance'
  | 'inspection_rejection'
  | 'reservation'
  | 'reservation_release'

export interface InventoryMovement {
  id: string
  materialId: string
  type: MovementType
  quantity: number
  unit: string
  sourceLocationId?: string
  destinationLocationId?: string
  referenceNumber?: string
  timestamp: string
  operator?: string
  notes?: string
  reason?: string
  previousPhysicalStock: number
  resultingPhysicalStock: number
  previousReserved: number
  resultingReserved: number
  previousAwaitingInspection: number
  resultingAwaitingInspection: number
  purchaseOrderId?: string
  productionBatchId?: string
  reversedMovementId?: string
}

export interface StorageLocation {
  id: string
  name: string
  code: string
  description?: string
  isExternal: boolean
  active: boolean
}

export interface Supplier {
  id: string
  companyName: string
  contactPerson?: string
  phone?: string
  email?: string
  gstin?: string
  pan?: string
  state?: string
  stateCode?: string
  address?: string
  materialIds: string[]
  avgDeliveryDays?: number
  maxDeliveryDays?: number
  minOrderQuantity?: number
  packSizes?: Record<string, number>
  notes?: string
  active: boolean
  createdAt?: string
  updatedAt?: string
  /** Fictional supplier for demonstration — not a verified vendor */
  isDemo?: boolean
}

export interface AuditEvent {
  id: string
  entityType: string
  entityId: string
  action: string
  timestamp: string
  details?: string
  operator?: string
}

export interface MaterialComputed {
  material: Material
  balance: InventoryBalance
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
