import { applyCustomerPoTotals } from '../services/customerPoCalculator'
import type { Supplier } from '../types/inventory'
import type { PurchaseOrder, PurchaseOrderLine } from '../types/purchasing'
import { defaultUnitWeightKg } from '../utils/poWeight'

export const DEMO_SUPPLIERS: Supplier[] = [
  {
    id: 'SUP-DEMO-001',
    companyName: 'Sample Metals & Alloys (Demo)',
    contactPerson: 'Demo contact',
    phone: '+91-00000-00000',
    email: 'demo-supplier@example.com',
    materialIds: ['MAT-001', 'MAT-002', 'MAT-003', 'MAT-004'],
    avgDeliveryDays: 6,
    maxDeliveryDays: 10,
    active: true,
    isDemo: true,
    notes: 'Fictional supplier for demonstration only.',
  },
  {
    id: 'SUP-DEMO-002',
    companyName: 'Sample Sand & Moulding Supplies (Demo)',
    contactPerson: 'Demo contact',
    phone: '+91-00000-00000',
    email: 'demo-supplier@example.com',
    materialIds: ['MAT-007', 'MAT-008', 'MAT-010'],
    avgDeliveryDays: 4,
    maxDeliveryDays: 7,
    active: true,
    isDemo: true,
    notes: 'Fictional supplier for demonstration only.',
  },
]

function line(
  id: string,
  materialId: string,
  orderQuantity: number,
  unit: string,
  unitWeightKg?: number,
  receivedQuantity = 0,
) {
  return {
    id,
    materialId,
    orderQuantity,
    unit,
    unitWeight: defaultUnitWeightKg(unit, unitWeightKg),
    weightUnit: 'kg',
    receivedQuantity,
  }
}

/** Sample POs — clearly demo / hypothetical */
export function buildDemoPurchaseOrders(now: string): PurchaseOrder[] {
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString()
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString()

  const rawMaterialDefaults = { direction: 'issued_to_supplier' as const }

  return [
    {
      id: 'PO-DEMO-001',
      poNumber: 'PO-2026-DEMO-001',
      ...rawMaterialDefaults,
      supplierId: 'SUP-DEMO-001',
      lines: [
        line('POL-D-001', 'MAT-001', 2000, 'kg', 1),
        line('POL-D-002', 'MAT-003', 100, 'kg', 1),
      ],
      status: 'draft',
      approvalStatus: 'not_required',
      createdAt: now,
      updatedAt: now,
      expectedDeliveryDate: in14,
      notes: 'Demo draft PO — edit quantities/weights before submitting.',
    },
    {
      id: 'PO-DEMO-002',
      poNumber: 'PO-2026-DEMO-002',
      ...rawMaterialDefaults,
      supplierId: 'SUP-DEMO-001',
      lines: [
        line('POL-D-003', 'MAT-004', 150, 'kg', 1),
        line('POL-D-004', 'MAT-005', 75, 'kg', 1),
      ],
      status: 'pending_approval',
      approvalStatus: 'pending',
      createdAt: now,
      updatedAt: now,
      expectedDeliveryDate: in14,
      notes: 'Demo PO awaiting approval.',
    },
    {
      id: 'PO-DEMO-003',
      poNumber: 'PO-2026-DEMO-003',
      ...rawMaterialDefaults,
      supplierId: 'SUP-DEMO-002',
      lines: [
        line('POL-D-005', 'MAT-007', 400, 'kg', 1),
        line('POL-D-006', 'MAT-010', 20, 'tonnes', 1000, 10),
        line('POL-D-007', 'MAT-012', 30, 'pieces', 3.5, 0),
      ],
      status: 'partially_received',
      approvalStatus: 'approved',
      createdAt: now,
      updatedAt: now,
      orderedDate: now,
      expectedDeliveryDate: in7,
      notes: 'Demo PO — partial receipt on bentonite and silica sand.',
    },
    {
      id: 'PO-DEMO-004',
      poNumber: 'PO-2026-DEMO-004',
      ...rawMaterialDefaults,
      supplierId: 'SUP-DEMO-002',
      lines: [line('POL-D-008', 'MAT-008', 500, 'kg', 1)],
      status: 'partially_dispatched',
      approvalStatus: 'approved',
      createdAt: now,
      updatedAt: now,
      orderedDate: now,
      expectedDeliveryDate: in7,
      notes: 'Demo PO — ready for goods receipt.',
    },
    buildDemoCustomerPurchaseOrder(now),
  ]
}

/** Customer PO received by Neelam (casting) — matches PDF analysis dummy row */
function buildDemoCustomerPurchaseOrder(now: string): PurchaseOrder {
  const delivery = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10)
  const line: PurchaseOrderLine = {
    id: 'POL-CUST-001',
    lineNo: 1,
    materialId: '',
    orderQuantity: 0,
    unit: 'nos',
    unitWeight: 0,
    weightUnit: 'kg',
    receivedQuantity: 0,
    dispatchedQuantity: 2,
    buyerItemCode: 'ABC100001',
    description: 'Housing_Test_CI_FG260',
    grade: 'FG260',
    hsnCode: '73259910',
    gstRate: 18,
    quantityNos: 5,
    totalWeightKg: 400,
    rateBasis: 'per_kg',
    rate: 90,
    deliveryDate: delivery,
    indentNo: 'I00000001',
    workOrderNo: 'WO00000001',
    salesOrderNo: 'S00001',
    drawingNo: 'DRG-DEMO-01',
    patternNo: 'PAT-DEMO-01',
  }

  let po: PurchaseOrder = {
    id: 'PO-DEMO-CUSTOMER-001',
    poNumber: 'P26-DEMO-5638',
    direction: 'received_from_customer',
    poFormat: 'format_1',
    formRef: 'F:PR:08/REV00/01/01/2018 (demo)',
    status: 'ordered',
    approvalStatus: 'approved',
    createdAt: now,
    updatedAt: now,
    poDate: now.slice(0, 10),
    orderedDate: now,
    counterpartyVendorCode: 'N####',
    buyer: {
      name: '[Customer — Demo Pump OEM]',
      gstin: '[REDACTED]',
      address: '[Plant address — demo]',
      contactPerson: 'Demo Buyer Contact',
    },
    supplierParty: {
      name: 'Neelam Industries',
      gstin: '[REDACTED]',
      address: '[Foundry address — demo]',
    },
    transportBy: 'Road',
    destination: '[Customer plant — demo]',
    paymentTerms: '90 days from supply and QC approval (demo)',
    preparedBy: 'Demo User',
    authorisedBy: 'AU',
    termsAndConditions: [
      'Delivery per line date; door delivery by road.',
      'Inspection at buyer end; rejection at supplier cost.',
      'Heat number and foundry mark on all parts.',
      'Test certificate with challan before dispatch.',
    ],
    lines: [line],
    notes: 'Sample customer PO (Neelam as supplier). Not a raw-material purchase.',
  }
  po = applyCustomerPoTotals(po)
  return po
}

export function buildStandaloneDemoCustomerPo(now: string): PurchaseOrder {
  return buildDemoCustomerPurchaseOrder(now)
}
