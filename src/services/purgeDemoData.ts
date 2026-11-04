import { db } from '../storage/database'
import { getSettings, saveSettings } from './seedService'

/** Remove fictional demo suppliers, POs, and customers. Keeps real uploads and manual records. */
export async function purgeDemoSampleData(): Promise<{
  suppliers: number
  purchaseOrders: number
  customers: number
}> {
  const suppliers = await db.suppliers.filter((s) => s.isDemo === true).toArray()
  const supplierIds = new Set(suppliers.map((s) => s.id))

  const demoPos = await db.purchaseOrders
    .filter((p) => p.isDemo === true || p.poNumber.toUpperCase().includes('DEMO'))
    .toArray()

  const demoCustomers = await db.customers
    .filter(
      (c) =>
        c.name.toUpperCase().includes('DEMO') ||
        (c.vendorCode?.toUpperCase().includes('DEMO') ?? false),
    )
    .toArray()

  await db.transaction(
    'rw',
    [db.suppliers, db.purchaseOrders, db.customers, db.materials],
    async () => {
      for (const s of suppliers) await db.suppliers.delete(s.id)
      for (const po of demoPos) await db.purchaseOrders.delete(po.id)
      for (const c of demoCustomers) await db.customers.delete(c.id)

      for (const material of await db.materials.toArray()) {
        const nextIds = material.supplierIds.filter((id) => !supplierIds.has(id))
        if (nextIds.length !== material.supplierIds.length) {
          await db.materials.put({
            ...material,
            supplierIds: nextIds,
            updatedAt: new Date().toISOString(),
          })
        }
      }
    },
  )

  const settings = await getSettings()
  settings.demoPurchaseOrdersSeeded = false
  await saveSettings(settings)

  return {
    suppliers: suppliers.length,
    purchaseOrders: demoPos.length,
    customers: demoCustomers.length,
  }
}
