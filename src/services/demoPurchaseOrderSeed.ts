import { buildDemoPurchaseOrders, DEMO_SUPPLIERS } from '../data/demoPurchaseOrders'
import { db } from '../storage/database'
import { getSettings, saveSettings } from './seedService'

export async function seedDemoPurchaseOrders(force = false): Promise<number> {
  const existing = await db.purchaseOrders.count()
  if (!force && existing > 0) {
    const hasDemo = await db.purchaseOrders.filter((p) => p.poNumber.includes('DEMO')).count()
    if (hasDemo > 0) return 0
  }

  const now = new Date().toISOString()
  for (const s of DEMO_SUPPLIERS) {
    const found = await db.suppliers.get(s.id)
    if (!found) {
      await db.suppliers.put({
        ...s,
        createdAt: now,
        updatedAt: now,
      })
    }
    for (const materialId of s.materialIds) {
      const m = await db.materials.get(materialId)
      if (m && !m.supplierIds.includes(s.id)) {
        await db.materials.put({
          ...m,
          supplierIds: [...m.supplierIds, s.id],
          updatedAt: now,
        })
      }
    }
  }

  const orders = buildDemoPurchaseOrders(now)
  for (const po of orders) {
    const exists = await db.purchaseOrders.get(po.id)
    if (!exists) await db.purchaseOrders.add(po)
  }

  const settings = await getSettings()
  settings.demoPurchaseOrdersSeeded = true
  await saveSettings(settings)
  return orders.length
}
