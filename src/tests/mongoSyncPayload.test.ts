import { describe, expect, it } from 'vitest'
import {
  FOUNDRY_MATERIALS_DATA,
  STORAGE_LOCATIONS,
  buildFoundryBackupPayload,
} from '../../scripts/push-to-mongo.mjs'
import { validateBackup } from '../services/importExportService'

describe('MongoDB Seed / Push Payload', () => {
  it('contains exactly 36 foundry raw materials', () => {
    expect(FOUNDRY_MATERIALS_DATA).toHaveLength(36)
  })

  it('builds a valid AppBackup v1 payload', () => {
    const payload = buildFoundryBackupPayload()
    expect(payload.version).toBe(1)
    expect(payload.materials).toHaveLength(36)
    expect(payload.balances).toHaveLength(36)
    expect(payload.locationBalances).toHaveLength(36)
    expect(payload.locations).toHaveLength(STORAGE_LOCATIONS.length)

    // Passes existing validateBackup verification
    const validated = validateBackup(payload)
    expect(validated.version).toBe(1)
    expect(validated.materials).toHaveLength(36)
  })

  it('correctly maps material fields and stock numbers', () => {
    const payload = buildFoundryBackupPayload()

    // Silica Sand
    const sand = payload.materials.find((m) => m.name === 'SILICA SAND')
    expect(sand).toBeDefined()
    expect(sand?.category).toBe('MOULDING')
    expect(sand?.unit).toBe('KGS')
    expect(sand?.baseDailyConsumption).toBe(500)
    expect(sand?.emergencyStock).toBe(1000)

    const sandBal = payload.balances.find((b) => b.materialId === sand?.id)
    expect(sandBal?.physicalStock).toBe(5000)

    // Pig Iron
    const pigIron = payload.materials.find((m) => m.name === 'PIG IRON')
    expect(pigIron).toBeDefined()
    expect(pigIron?.category).toBe('METALLIC CHARGE')
    expect(pigIron?.baseDailyConsumption).toBe(400)
    expect(pigIron?.emergencyStock).toBe(800)

    // Oxygen Gas decimal consumption
    const oxygen = payload.materials.find((m) => m.name === 'OXYGEN GAS')
    expect(oxygen).toBeDefined()
    expect(oxygen?.category).toBe('GAS')
    expect(oxygen?.unit).toBe('CYLINDERS')
    expect(oxygen?.baseDailyConsumption).toBe(0.5)
    expect(oxygen?.emergencyStock).toBe(2)

    const oxyBal = payload.balances.find((b) => b.materialId === oxygen?.id)
    expect(oxyBal?.physicalStock).toBe(10)

    // Acetylene Gas decimal consumption
    const acetylene = payload.materials.find((m) => m.name === 'ACETYLENE GAS')
    expect(acetylene).toBeDefined()
    expect(acetylene?.category).toBe('GAS')
    expect(acetylene?.unit).toBe('CYLINDERS')
    expect(acetylene?.baseDailyConsumption).toBe(0.2)
    expect(acetylene?.emergencyStock).toBe(1)

    const aceBal = payload.balances.find((b) => b.materialId === acetylene?.id)
    expect(aceBal?.physicalStock).toBe(5)
  })

  it('preserves existing POs, suppliers and customers when provided', () => {
    const existing = {
      suppliers: [{ id: 'sup-1', companyName: 'Test Supplier', active: true }],
      purchaseOrders: [{ id: 'po-1', poNumber: 'PO-001', status: 'issued' }],
      customers: [{ id: 'cust-1', name: 'Test Customer', active: true }],
    }
    const payload = buildFoundryBackupPayload(existing as any)
    expect(payload.suppliers).toHaveLength(1)
    expect(payload.purchaseOrders).toHaveLength(1)
    expect(payload.customers).toHaveLength(1)
    expect(payload.materials).toHaveLength(36)
  })
})
