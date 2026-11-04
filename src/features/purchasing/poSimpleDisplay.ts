import type { Supplier } from '../../types/inventory'
import type { PurchaseOrder, PurchaseOrderLine } from '../../types/purchasing'
import { poTotalKg } from '../../lib/po/poSelectors'
import { lineTotalWeight } from '../../utils/poWeight'

export function poCompanyName(
  po: PurchaseOrder,
  suppliers: Map<string, Supplier>,
): string {
  if (po.buyer?.name) return po.buyer.name
  if (po.supplierId) {
    return suppliers.get(po.supplierId)?.companyName ?? po.supplierId
  }
  return '—'
}

export function lineItemName(
  line: PurchaseOrderLine,
  materialNames: Map<string, string>,
): string {
  if (line.description) return line.description
  if (line.buyerItemCode) return line.buyerItemCode
  const mat = materialNames.get(line.materialId)
  if (mat && line.materialId !== 'IMPORT') return mat
  return 'Item'
}

export interface SimpleLineDisplay {
  itemName: string
  quantity: number
  quantityUnit: string
  weightPerUnitKg: number
  totalWeightKg: number
}

export function simpleLineDisplay(
  line: PurchaseOrderLine,
  materialNames: Map<string, string>,
): SimpleLineDisplay {
  const itemName = lineItemName(line, materialNames)
  const totalWeightKg =
    line.totalWeightKg ?? lineTotalWeight(line)
  if (line.quantityNos != null && line.quantityNos > 0) {
    const per =
      line.unitWeight > 0
        ? line.unitWeight
        : totalWeightKg / line.quantityNos
    return {
      itemName,
      quantity: line.quantityNos,
      quantityUnit: 'nos',
      weightPerUnitKg: per,
      totalWeightKg,
    }
  }
  if (line.unit.toLowerCase() === 'kg') {
    return {
      itemName,
      quantity: line.orderQuantity,
      quantityUnit: 'kg',
      weightPerUnitKg: 1,
      totalWeightKg: line.orderQuantity,
    }
  }
  return {
    itemName,
    quantity: line.orderQuantity,
    quantityUnit: line.unit,
    weightPerUnitKg: line.unitWeight,
    totalWeightKg,
  }
}

export function poTotalWeightKg(po: PurchaseOrder): number {
  return poTotalKg(po)
}
