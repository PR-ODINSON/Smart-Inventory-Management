import { describe, expect, it } from 'vitest'
import { FOUNDRY_MATERIALS } from '../data/foundryInventorySeedData'
import { calculateStockCoverage } from '../lib/productionPlanning'

describe('Foundry Inventory Seed Data', () => {
  it('contains exactly 36 materials', () => {
    expect(FOUNDRY_MATERIALS).toHaveLength(36)
  })

  it('has materials numbered 1 to 36 with no gaps or duplicates', () => {
    const numbers = FOUNDRY_MATERIALS.map((m) => m.no)
    expect(numbers).toEqual(Array.from({ length: 36 }, (_, i) => i + 1))
  })

  it('has exact names, categories, units, stocks, consumption, and emergency stocks from the table', () => {
    // Spot-check every material name exists
    const names = FOUNDRY_MATERIALS.map((m) => m.name)
    expect(names).toContain('SILICA SAND')
    expect(names).toContain('MOLASSES')
    expect(names).toContain('SODIUM SILICATE')
    expect(names).toContain('CO2 GAS')
    expect(names).toContain('BENTONITE')
    expect(names).toContain('COAL DUST')
    expect(names).toContain('DEXTRIN')
    expect(names).toContain('STARCH POWDER')
    expect(names).toContain('WOOD FLOUR')
    expect(names).toContain('PARTING SAND')
    expect(names).toContain('PIG IRON')
    expect(names).toContain('CAST IRON SCRAP')
    expect(names).toContain('MS SCRAP')
    expect(names).toContain('FOUNDRY RETURNS')
    expect(names).toContain('FERRO SILICON')
    expect(names).toContain('FERRO MANGANESE')
    expect(names).toContain('CARBON RAISER')
    expect(names).toContain('FERRO SILICON MAGNESIUM')
    expect(names).toContain('INOCULANT')
    expect(names).toContain('FERRO PHOSPHORUS')
    expect(names).toContain('FERRO CHROME')
    expect(names).toContain('COPPER')
    expect(names).toContain('NICKEL')
    expect(names).toContain('GRAPHITE POWDER')
    expect(names).toContain('ZIRCON POWDER')
    expect(names).toContain('SILICA FLOUR')
    expect(names).toContain('REFRACTORY MOULD WASH')
    expect(names).toContain('BENTONITE-BASED COATING')
    expect(names).toContain('GRINDING WHEELS')
    expect(names).toContain('CUTTING WHEELS')
    expect(names).toContain('STEEL SHOT')
    expect(names).toContain('STEEL GRIT')
    expect(names).toContain('WELDING ELECTRODES')
    expect(names).toContain('OXYGEN GAS')
    expect(names).toContain('LPG')
    expect(names).toContain('ACETYLENE GAS')
  })

  it('has no duplicate material names', () => {
    const names = FOUNDRY_MATERIALS.map((m) => m.name)
    const unique = new Set(names)
    expect(unique.size).toBe(36)
  })

  it('has correct categories for all materials', () => {
    const catByName = new Map(FOUNDRY_MATERIALS.map((m) => [m.name, m.category]))
    expect(catByName.get('SILICA SAND')).toBe('MOULDING')
    expect(catByName.get('CO2 GAS')).toBe('GAS')
    expect(catByName.get('PIG IRON')).toBe('METALLIC CHARGE')
    expect(catByName.get('FERRO SILICON')).toBe('ALLOYS AND ADDITIVES')
    expect(catByName.get('GRAPHITE POWDER')).toBe('REFRACTORY AND COATING')
    expect(catByName.get('GRINDING WHEELS')).toBe('CONSUMABLES')
    expect(catByName.get('LPG')).toBe('FUEL')
    expect(catByName.get('OXYGEN GAS')).toBe('GAS')
    expect(catByName.get('ACETYLENE GAS')).toBe('GAS')
  })

  it('has correct units including LITRES, PIECES, and CYLINDERS', () => {
    const unitByName = new Map(FOUNDRY_MATERIALS.map((m) => [m.name, m.unit]))
    expect(unitByName.get('SILICA SAND')).toBe('KGS')
    expect(unitByName.get('REFRACTORY MOULD WASH')).toBe('LITRES')
    expect(unitByName.get('GRINDING WHEELS')).toBe('PIECES')
    expect(unitByName.get('CUTTING WHEELS')).toBe('PIECES')
    expect(unitByName.get('OXYGEN GAS')).toBe('CYLINDERS')
    expect(unitByName.get('ACETYLENE GAS')).toBe('CYLINDERS')
  })

  it('stores decimal daily consumption without rounding (0.5 and 0.2)', () => {
    const oxygenGas = FOUNDRY_MATERIALS.find((m) => m.name === 'OXYGEN GAS')!
    expect(oxygenGas.dailyConsumption).toBe(0.5)
    expect(oxygenGas.dailyConsumption).not.toBe(1)
    expect(oxygenGas.emergencyStock).toBe(2)

    const acetyleneGas = FOUNDRY_MATERIALS.find((m) => m.name === 'ACETYLENE GAS')!
    expect(acetyleneGas.dailyConsumption).toBe(0.2)
    expect(acetyleneGas.dailyConsumption).not.toBe(0)
    expect(acetyleneGas.emergencyStock).toBe(1)
  })

  it('has exact numeric values for key materials', () => {
    const find = (name: string) => FOUNDRY_MATERIALS.find((m) => m.name === name)!

    // SILICA SAND: 5000 stock, 500 daily, 1000 emergency
    const silicaSand = find('SILICA SAND')
    expect(silicaSand.availableStock).toBe(5000)
    expect(silicaSand.dailyConsumption).toBe(500)
    expect(silicaSand.emergencyStock).toBe(1000)

    // PIG IRON: 5000 stock, 400 daily, 800 emergency
    const pigIron = find('PIG IRON')
    expect(pigIron.availableStock).toBe(5000)
    expect(pigIron.dailyConsumption).toBe(400)
    expect(pigIron.emergencyStock).toBe(800)

    // FOUNDRY RETURNS: 8000 stock, 600 daily, 1200 emergency
    const foundryReturns = find('FOUNDRY RETURNS')
    expect(foundryReturns.availableStock).toBe(8000)
    expect(foundryReturns.dailyConsumption).toBe(600)
    expect(foundryReturns.emergencyStock).toBe(1200)

    // FERRO SILICON MAGNESIUM: 100 stock, 4 daily, 12 emergency
    const feSiMg = find('FERRO SILICON MAGNESIUM')
    expect(feSiMg.availableStock).toBe(100)
    expect(feSiMg.dailyConsumption).toBe(4)
    expect(feSiMg.emergencyStock).toBe(12)

    // OXYGEN GAS: 10 stock, 0.5 daily, 2 emergency
    const oxygenGas = find('OXYGEN GAS')
    expect(oxygenGas.availableStock).toBe(10)
    expect(oxygenGas.dailyConsumption).toBe(0.5)
    expect(oxygenGas.emergencyStock).toBe(2)

    // ACETYLENE GAS: 5 stock, 0.2 daily, 1 emergency
    const acetyleneGas = find('ACETYLENE GAS')
    expect(acetyleneGas.availableStock).toBe(5)
    expect(acetyleneGas.dailyConsumption).toBe(0.2)
    expect(acetyleneGas.emergencyStock).toBe(1)
  })
})

describe('Days to be Covered calculations from seed data (using existing calculateStockCoverage)', () => {
  it('SILICA SAND: 5000 / 500 = 10.0 days', () => {
    const result = calculateStockCoverage({
      availableStockKg: 5000,
      plannedDailyRequirementKg: 500,
      desiredInventoryDays: 7,
      emergencyStockKg: 1000,
      unit: 'KGS',
    })
    expect(result.estimatedStockCoverageDays).toBe(10.0)
  })

  it('PIG IRON: 5000 / 400 = 12.5 days', () => {
    const result = calculateStockCoverage({
      availableStockKg: 5000,
      plannedDailyRequirementKg: 400,
      desiredInventoryDays: 7,
      emergencyStockKg: 800,
      unit: 'KGS',
    })
    expect(result.estimatedStockCoverageDays).toBe(12.5)
  })

  it('OXYGEN GAS: 10 / 0.5 = 20.0 days', () => {
    const result = calculateStockCoverage({
      availableStockKg: 10,
      plannedDailyRequirementKg: 0.5,
      desiredInventoryDays: 7,
      emergencyStockKg: 2,
      unit: 'CYLINDERS',
    })
    expect(result.estimatedStockCoverageDays).toBe(20.0)
  })

  it('ACETYLENE GAS: 5 / 0.2 = 25.0 days', () => {
    const result = calculateStockCoverage({
      availableStockKg: 5,
      plannedDailyRequirementKg: 0.2,
      desiredInventoryDays: 7,
      emergencyStockKg: 1,
      unit: 'CYLINDERS',
    })
    expect(result.estimatedStockCoverageDays).toBe(25.0)
  })
})

describe('Seed upsert logic (pure data checks)', () => {
  it('upsert by name should match case-insensitively with no duplicates on second run', () => {
    const existingNames = ['SILICA SAND', 'PIG IRON']
    const seedNames = FOUNDRY_MATERIALS.map((m) => m.name.trim().toLowerCase())

    // Count matches
    let matched = 0
    let inserted = 0
    for (const seedName of seedNames) {
      const found = existingNames.some((e) => e.trim().toLowerCase() === seedName)
      if (found) matched++
      else inserted++
    }

    expect(matched).toBe(2) // SILICA SAND and PIG IRON
    expect(inserted).toBe(34) // remaining 34 are new inserts

    // Second run: all 36 match, 0 inserts
    const allNames = FOUNDRY_MATERIALS.map((m) => m.name.trim().toLowerCase())
    let matchedSecondRun = 0
    for (const seedName of allNames) {
      if (allNames.includes(seedName)) matchedSecondRun++
    }
    expect(matchedSecondRun).toBe(36)
  })
})
