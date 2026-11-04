/** Uploaded supplier tax invoice / bill — not a goods receipt and does not change stock. */

export type SupplierInvoiceImportSource = 'pdf_import' | 'image_import' | 'manual'

export interface SupplierInvoiceLine {
  id: string
  lineNo: number
  description: string
  itemCode?: string
  hsnSac?: string
  quantity: number
  unit: string
  rate: number
  taxableAmount: number
  cgstRate?: number
  cgstAmount?: number
  sgstRate?: number
  sgstAmount?: number
  igstRate?: number
  igstAmount?: number
  lineTotal?: number
}

export interface SupplierInvoiceTotals {
  taxableValue?: number
  cgst?: number
  sgst?: number
  igst?: number
  otherCharges?: number
  roundOff?: number
  grandTotal?: number
}

export interface SupplierInvoice {
  id: string
  supplierId: string
  invoiceNumber: string
  invoiceDate?: string
  challanNumber?: string
  purchaseOrderRef?: string
  paymentTerms?: string
  placeOfSupply?: string
  lines: SupplierInvoiceLine[]
  totals: SupplierInvoiceTotals
  /** Import metadata */
  source: SupplierInvoiceImportSource
  sourceFileName?: string
  importedAt: string
  createdAt: string
  updatedAt: string
  extractionWarnings?: string[]
}
