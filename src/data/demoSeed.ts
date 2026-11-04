import type { Material, StorageLocation } from '../types/inventory'

export const DEMO_LOCATIONS: StorageLocation[] = [
  { id: 'loc-scrap', name: 'Scrap yard', code: 'SCRAP', active: true, isExternal: false },
  { id: 'loc-alloy', name: 'Alloy store', code: 'ALLOY', active: true, isExternal: false },
  { id: 'loc-sand', name: 'Sand plant', code: 'SAND', active: true, isExternal: false },
  { id: 'loc-fettling', name: 'Fettling shop', code: 'FETTL', active: true, isExternal: false },
  { id: 'loc-consumables', name: 'General consumables store', code: 'GEN', active: true, isExternal: false },
  { id: 'loc-finished', name: 'Finished goods', code: 'FG', active: true, isExternal: false },
  { id: 'loc-vendor', name: 'Outside vendor', code: 'VEND', active: true, isExternal: true },
  { id: 'loc-furnace', name: 'Furnace / production area', code: 'FURN', active: true, isExternal: false },
]

export interface DemoMaterialRow {
  id: string
  name: string
  category: string
  unit: string
  physicalStock: number
  reserved: number
  awaitingInspection: number
  dailyUse: number
  avgLead: number
  maxLead: number
  packSize: number
  locationId: string
}

export const DEMO_MATERIALS: DemoMaterialRow[] = [
  { id: 'MAT-001', name: 'Pig iron', category: 'Metallic charge', unit: 'kg', physicalStock: 6000, reserved: 1500, awaitingInspection: 0, dailyUse: 450, avgLead: 6, maxLead: 10, packSize: 1000, locationId: 'loc-scrap' },
  { id: 'MAT-002', name: 'Purchased CI scrap', category: 'Metallic charge', unit: 'kg', physicalStock: 4000, reserved: 0, awaitingInspection: 0, dailyUse: 300, avgLead: 4, maxLead: 7, packSize: 1000, locationId: 'loc-scrap' },
  { id: 'MAT-003', name: 'Carburiser', category: 'Alloys & additives', unit: 'kg', physicalStock: 300, reserved: 50, awaitingInspection: 0, dailyUse: 14, avgLead: 5, maxLead: 9, packSize: 25, locationId: 'loc-alloy' },
  { id: 'MAT-004', name: 'Ferrosilicon', category: 'Alloys & additives', unit: 'kg', physicalStock: 160, reserved: 30, awaitingInspection: 20, dailyUse: 15, avgLead: 5, maxLead: 8, packSize: 50, locationId: 'loc-alloy' },
  { id: 'MAT-005', name: 'FeSiMg (Mg treatment alloy)', category: 'Alloys & additives', unit: 'kg', physicalStock: 120, reserved: 20, awaitingInspection: 0, dailyUse: 9, avgLead: 10, maxLead: 16, packSize: 25, locationId: 'loc-alloy' },
  { id: 'MAT-006', name: 'Inoculant', category: 'Alloys & additives', unit: 'kg', physicalStock: 60, reserved: 0, awaitingInspection: 0, dailyUse: 3, avgLead: 7, maxLead: 12, packSize: 25, locationId: 'loc-alloy' },
  { id: 'MAT-007', name: 'Bentonite', category: 'Moulding', unit: 'kg', physicalStock: 800, reserved: 0, awaitingInspection: 0, dailyUse: 40, avgLead: 4, maxLead: 7, packSize: 50, locationId: 'loc-sand' },
  { id: 'MAT-008', name: 'Sodium silicate', category: 'Moulding', unit: 'kg', physicalStock: 600, reserved: 100, awaitingInspection: 0, dailyUse: 60, avgLead: 3, maxLead: 6, packSize: 250, locationId: 'loc-sand' },
  { id: 'MAT-009', name: 'CO₂ gas', category: 'Process gas', unit: 'kg', physicalStock: 90, reserved: 0, awaitingInspection: 0, dailyUse: 12, avgLead: 2, maxLead: 4, packSize: 30, locationId: 'loc-consumables' },
  { id: 'MAT-010', name: 'New silica sand', category: 'Moulding', unit: 'tonnes', physicalStock: 18, reserved: 0, awaitingInspection: 0, dailyUse: 2.5, avgLead: 3, maxLead: 5, packSize: 10, locationId: 'loc-sand' },
  { id: 'MAT-011', name: 'Ramming mass', category: 'Refractory', unit: 'kg', physicalStock: 900, reserved: 0, awaitingInspection: 0, dailyUse: 25, avgLead: 8, maxLead: 14, packSize: 25, locationId: 'loc-furnace' },
  { id: 'MAT-012', name: 'Grinding wheels', category: 'Consumables', unit: 'pieces', physicalStock: 40, reserved: 0, awaitingInspection: 0, dailyUse: 6, avgLead: 5, maxLead: 9, packSize: 10, locationId: 'loc-fettling' },
]

/** Optional kg per unit for PO weight defaults (demo) */
export const DEMO_UNIT_WEIGHT_KG: Record<string, number> = {
  'MAT-010': 1000,
  'MAT-012': 3.5,
}

export function demoRowToMaterial(row: DemoMaterialRow, now: string): Material {
  const unitWeightKg = DEMO_UNIT_WEIGHT_KG[row.id]
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    packSize: row.packSize,
    unitWeightKg,
    baseDailyConsumption: row.dailyUse,
    avgLeadTimeDays: row.avgLead,
    maxLeadTimeDays: row.maxLead,
    defaultLocationId: row.locationId,
    supplierIds: [],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
}
