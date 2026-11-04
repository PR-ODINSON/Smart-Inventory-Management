import { db } from '../storage/database'
import type { ParsedPoHeader, ParsedPoLine } from '../lib/parsePoPdf'
import type { PurchaseOrder, PurchaseOrderLine } from '../types/purchasing'

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function importLineToPoLine(parsed: ParsedPoLine, materialId: string): PurchaseOrderLine {
  return {
    id: newId('POL'),
    lineNo: parsed.lineNo,
    materialId,
    buyerItemCode: parsed.itemCode,
    description: parsed.itemName,
    hsnCode: parsed.hsnCode,
    gstRate: parsed.gstRate,
    quantityNos: parsed.quantityNos,
    totalWeightKg: parsed.totalWeightKg,
    orderQuantity: parsed.quantityNos,
    unit: 'nos',
    unitWeight: parsed.weightPerPieceKg,
    weightUnit: 'kg',
    rateBasis: 'per_kg',
    rate: parsed.rate,
    lineAmount: parsed.amount,
    deliveryDate: parsed.deliveryDate || undefined,
    indentNo: parsed.indentNo || undefined,
    indentDate: parsed.indentDate || undefined,
    workOrderNo: parsed.workOrderNo || undefined,
    salesOrderNo: parsed.salesOrderNo || undefined,
    receivedQuantity: 0,
  }
}

export async function saveImportedPurchaseOrder(input: {
  header: ParsedPoHeader
  lines: ParsedPoLine[]
  materialIdByItemCode: Map<string, string>
  customerId?: string
}): Promise<PurchaseOrder> {
  const poNumber = input.header.poNumber.trim()
  const buyerName = input.header.buyerName.trim()
  if (!poNumber) throw new Error('PO number is required')
  if (!buyerName) throw new Error('Buyer / company name is required')
  if (input.lines.length === 0) throw new Error('At least one line item is required')

  const duplicate = await db.purchaseOrders
    .filter((p) => p.poNumber.trim().toLowerCase() === poNumber.toLowerCase())
    .first()
  if (duplicate) throw new Error(`PO number "${poNumber}" already exists.`)

  const now = new Date().toISOString()
  const po: PurchaseOrder = {
    id: newId('PO'),
    poNumber,
    direction: 'received_from_customer',
    poDate: input.header.poDate || undefined,
    counterpartyVendorCode: input.header.vendorCode || undefined,
    customerId: input.customerId,
    signerName: input.header.signerName || buyerName,
    buyer: {
      name: buyerName,
      vendorCode: input.header.vendorCode || undefined,
      gstin: input.header.buyerGstin || undefined,
    },
    lines: input.lines.map((line) => {
      const materialId = input.materialIdByItemCode.get(line.itemCode) ?? ''
      return importLineToPoLine(line, materialId)
    }),
    status: 'ordered',
    approvalStatus: 'not_required',
    createdAt: now,
    updatedAt: now,
  }
  await db.purchaseOrders.add(po)
  return po
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  await db.purchaseOrders.delete(id)
}

export function matchMaterialId(
  itemCode: string,
  materials: { id: string; name: string }[],
): string | null {
  const code = itemCode.trim().toUpperCase()
  const byId = materials.find((m) => m.id.trim().toUpperCase() === code)
  if (byId) return byId.id
  const byName = materials.find((m) => m.name.toUpperCase().includes(code))
  if (byName) return byName.id
  return null
}
