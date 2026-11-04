export type PurchaseOrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'ordered'
  | 'partially_received'
  | 'received'
  | 'partially_dispatched'
  | 'dispatched'
  | 'cancelled'

export type ApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected'

/** Raw-material POs you issue vs casting POs received from customers (Neelam as supplier). */
export type PoDirection = 'issued_to_supplier' | 'received_from_customer'

export type PoFormatTemplate = 'format_1' | 'format_2' | 'format_3' | 'generic'

export type RateBasis = 'per_kg' | 'per_nos'

export interface PoParty {
  name: string
  vendorCode?: string
  gstin?: string
  address?: string
  contactPerson?: string
  phone?: string
  email?: string
}

export interface PoActivityEntry {
  id: string
  at: string
  action: string
  detail?: string
  actor?: string
  reason?: string
}

export interface PoDispatchRecord {
  id: string
  purchaseOrderId: string
  lineId: string
  quantityNos: number
  actualWeightKg?: number
  dispatchedAt: string
  challanNo?: string
  vehicleNo?: string
  remarks?: string
  operator?: string
}

export interface PurchaseOrderLine {
  id: string
  lineNo?: number
  weightIsTentative?: boolean
  /** Raw-material PO: internal material master */
  materialId: string
  orderQuantity: number
  unit: string
  unitWeight: number
  weightUnit: string
  unitPrice?: number
  receivedQuantity: number
  /** Customer PO: quantity dispatched (nos) */
  dispatchedQuantity?: number
  /** Customer PO (casting / job-work) */
  buyerItemCode?: string
  description?: string
  grade?: string
  hsnCode?: string
  gstRate?: number
  quantityNos?: number
  totalWeightKg?: number
  rateBasis?: RateBasis
  /** Rate per kg or per nos per rateBasis */
  rate?: number
  lineAmount?: number
  deliveryDate?: string
  indentNo?: string
  indentDate?: string
  workOrderNo?: string
  salesOrderNo?: string
  drawingNo?: string
  patternNo?: string
}

export interface PurchaseOrder {
  id: string
  poNumber: string
  direction?: PoDirection
  poFormat?: PoFormatTemplate
  supplierId?: string
  lines: PurchaseOrderLine[]
  status: PurchaseOrderStatus
  approvalStatus: ApprovalStatus
  createdAt: string
  updatedAt: string
  poDate?: string
  expectedDeliveryDate?: string
  orderedDate?: string
  notes?: string
  approvedBy?: string
  rejectedReason?: string
  /** Customer on received POs; buyer on letterhead */
  buyer?: PoParty
  customerId?: string
  /** Printed name from signing block (audit) */
  signerName?: string
  /** Neelam (supplier) on received POs */
  supplierParty?: PoParty
  counterpartyVendorCode?: string
  quotationNo?: string
  quotationDate?: string
  kindAttn?: string
  reference?: string
  transportBy?: string
  destination?: string
  paymentTerms?: string
  inspectionTerms?: string
  termsAndConditions?: string[]
  subTotal?: number
  cgstAmount?: number
  sgstAmount?: number
  igstAmount?: number
  roundOff?: number
  grandTotal?: number
  amountInWords?: string
  preparedBy?: string
  authorisedBy?: string
  formRef?: string
  deliveryTerms?: string
  importSourceFileName?: string
  totalsComputed?: boolean
  isDemo?: boolean
  activityLog?: PoActivityEntry[]
  cancelledAt?: string
  cancelReason?: string
}

export interface GoodsReceipt {
  id: string
  purchaseOrderId: string
  lineId: string
  materialId: string
  quantity: number
  unit: string
  receivedAt: string
  locationId: string
  referenceNumber?: string
  operator?: string
  notes?: string
}

export function poDirection(po: PurchaseOrder): PoDirection {
  return po.direction ?? 'issued_to_supplier'
}

export function isCustomerPo(po: PurchaseOrder): boolean {
  return poDirection(po) === 'received_from_customer'
}
