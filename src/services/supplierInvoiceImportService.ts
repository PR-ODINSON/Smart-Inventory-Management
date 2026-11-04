import { db } from '../storage/database'
import type { Supplier } from '../types/inventory'
import type {
  SupplierInvoice,
  SupplierInvoiceLine,
  SupplierInvoiceTotals,
} from '../types/supplierInvoice'
import type {
  ParsedSupplierInvoiceHeader,
  ParsedSupplierInvoiceLine,
  ParsedSupplierInvoiceTotals,
  ParsedSupplierParty,
} from '../lib/supplierInvoice/parseSupplierInvoice'
import { findDuplicateInvoice } from '../lib/supplierInvoice/matchSupplier'
import { createSupplier, getSupplier, updateSupplier } from './supplierService'
import type { SupplierFormInput } from '../lib/supplier/validation'
import { listSupplierInvoices } from './supplierInvoiceService'

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function parsedLineToStored(line: ParsedSupplierInvoiceLine): SupplierInvoiceLine {
  return {
    id: newId('SIL'),
    lineNo: line.lineNo,
    description: line.description.trim(),
    itemCode: line.itemCode?.trim() || undefined,
    hsnSac: line.hsnSac?.trim() || undefined,
    quantity: line.quantity,
    unit: line.unit.trim() || 'nos',
    rate: line.rate,
    taxableAmount: line.taxableAmount,
    cgstRate: line.cgstRate ?? undefined,
    cgstAmount: line.cgstAmount ?? undefined,
    sgstRate: line.sgstRate ?? undefined,
    sgstAmount: line.sgstAmount ?? undefined,
    igstRate: line.igstRate ?? undefined,
    igstAmount: line.igstAmount ?? undefined,
    lineTotal: line.lineTotal ?? undefined,
  }
}

function parsedTotalsToStored(t: ParsedSupplierInvoiceTotals): SupplierInvoiceTotals {
  return {
    taxableValue: t.taxableValue ?? undefined,
    cgst: t.cgst ?? undefined,
    sgst: t.sgst ?? undefined,
    igst: t.igst ?? undefined,
    otherCharges: t.otherCharges ?? undefined,
    roundOff: t.roundOff ?? undefined,
    grandTotal: t.grandTotal ?? undefined,
  }
}

export async function checkDuplicateSupplierInvoice(
  supplierId: string,
  invoiceNumber: string,
): Promise<boolean> {
  const all = await listSupplierInvoices()
  return findDuplicateInvoice(all, supplierId, invoiceNumber)
}

export async function mergeSupplierMasterFromExtract(
  supplierId: string,
  party: ParsedSupplierParty,
  updateMaster: boolean,
): Promise<Supplier> {
  const existing = await getSupplier(supplierId)
  if (!existing) throw new Error('Supplier not found.')
  if (!updateMaster) return existing

  const form: SupplierFormInput = {
    companyName: party.companyName.trim() || existing.companyName,
    contactPerson: party.contactPerson.trim() || existing.contactPerson || '',
    phone: party.phone.trim() || existing.phone || '',
    email: party.email.trim() || existing.email || '',
    avgDeliveryDays: existing.avgDeliveryDays ?? 5,
    maxDeliveryDays: existing.maxDeliveryDays ?? 10,
    materialIds: [...existing.materialIds],
    active: existing.active,
    notes: existing.notes ?? '',
  }
  const updated = await updateSupplier(supplierId, form)
  const withTax: Supplier = {
    ...updated,
    gstin: party.gstin.trim() || updated.gstin,
    pan: party.pan.trim() || updated.pan,
    address: party.address.trim() || updated.address,
    state: party.state.trim() || updated.state,
    stateCode: party.stateCode.trim() || updated.stateCode,
    updatedAt: new Date().toISOString(),
  }
  await db.suppliers.put(withTax)
  return withTax
}

export async function createSupplierFromExtract(party: ParsedSupplierParty): Promise<Supplier> {
  const phone = party.phone.trim()
  const email = party.email.trim()
  const contactOk = phone.length >= 6 || email.length > 0
  const created = await createSupplier({
    companyName: party.companyName.trim(),
    contactPerson: party.contactPerson.trim() || undefined,
    phone: contactOk ? phone || undefined : '000000',
    email: email || undefined,
    avgDeliveryDays: 5,
    maxDeliveryDays: 10,
    materialIds: [],
    active: true,
    notes: 'Created from supplier bill import.',
  })
  const withTax: Supplier = {
    ...created,
    gstin: party.gstin.trim() || undefined,
    pan: party.pan.trim() || undefined,
    address: party.address.trim() || undefined,
    state: party.state.trim() || undefined,
    stateCode: party.stateCode.trim() || undefined,
  }
  await db.suppliers.put(withTax)
  return withTax
}

export async function saveImportedSupplierInvoice(input: {
  supplierId: string
  header: ParsedSupplierInvoiceHeader
  lines: ParsedSupplierInvoiceLine[]
  totals: ParsedSupplierInvoiceTotals
  source: SupplierInvoice['source']
  sourceFileName?: string
  extractionWarnings?: string[]
  allowDuplicate: boolean
}): Promise<SupplierInvoice> {
  const invoiceNumber = input.header.invoiceNumber.trim()
  if (!invoiceNumber) throw new Error('Invoice number is required.')
  if (input.lines.length === 0) throw new Error('At least one line item is required.')

  const dup = await checkDuplicateSupplierInvoice(input.supplierId, invoiceNumber)
  if (dup && !input.allowDuplicate) {
    throw new Error(
      `Invoice "${invoiceNumber}" already exists for this supplier. Confirm duplicate to proceed.`,
    )
  }

  const now = new Date().toISOString()
  const invoice: SupplierInvoice = {
    id: newId('SINV'),
    supplierId: input.supplierId,
    invoiceNumber,
    invoiceDate: input.header.invoiceDate || undefined,
    challanNumber: input.header.challanNumber.trim() || undefined,
    purchaseOrderRef: input.header.purchaseOrderRef.trim() || undefined,
    paymentTerms: input.header.paymentTerms.trim() || undefined,
    placeOfSupply: input.header.placeOfSupply.trim() || undefined,
    lines: input.lines.map(parsedLineToStored),
    totals: parsedTotalsToStored(input.totals),
    source: input.source,
    sourceFileName: input.sourceFileName,
    importedAt: now,
    createdAt: now,
    updatedAt: now,
    extractionWarnings: input.extractionWarnings,
  }

  await db.supplierInvoices.add(invoice)
  return invoice
}
