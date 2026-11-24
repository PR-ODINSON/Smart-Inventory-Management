export interface FoundryMaterialSeedRow {
  no: number
  name: string
  category: string
  unit: string
  availableStock: number
  dailyConsumption: number
  emergencyStock: number
}

export const FOUNDRY_MATERIALS: FoundryMaterialSeedRow[] = [
  { no: 1, name: 'SILICA SAND', category: 'MOULDING', unit: 'KGS', availableStock: 5000, dailyConsumption: 500, emergencyStock: 1000 },
  { no: 2, name: 'MOLASSES', category: 'MOULDING', unit: 'KGS', availableStock: 300, dailyConsumption: 20, emergencyStock: 60 },
  { no: 3, name: 'SODIUM SILICATE', category: 'MOULDING', unit: 'KGS', availableStock: 400, dailyConsumption: 25, emergencyStock: 75 },
  { no: 4, name: 'CO2 GAS', category: 'GAS', unit: 'KGS', availableStock: 150, dailyConsumption: 8, emergencyStock: 24 },
  { no: 5, name: 'BENTONITE', category: 'MOULDING', unit: 'KGS', availableStock: 500, dailyConsumption: 25, emergencyStock: 75 },
  { no: 6, name: 'COAL DUST', category: 'MOULDING', unit: 'KGS', availableStock: 300, dailyConsumption: 15, emergencyStock: 45 },
  { no: 7, name: 'DEXTRIN', category: 'MOULDING', unit: 'KGS', availableStock: 100, dailyConsumption: 3, emergencyStock: 9 },
  { no: 8, name: 'STARCH POWDER', category: 'MOULDING', unit: 'KGS', availableStock: 100, dailyConsumption: 3, emergencyStock: 9 },
  { no: 9, name: 'WOOD FLOUR', category: 'MOULDING', unit: 'KGS', availableStock: 100, dailyConsumption: 5, emergencyStock: 15 },
  { no: 10, name: 'PARTING SAND', category: 'MOULDING', unit: 'KGS', availableStock: 500, dailyConsumption: 20, emergencyStock: 60 },
  { no: 11, name: 'PIG IRON', category: 'METALLIC CHARGE', unit: 'KGS', availableStock: 5000, dailyConsumption: 400, emergencyStock: 800 },
  { no: 12, name: 'CAST IRON SCRAP', category: 'METALLIC CHARGE', unit: 'KGS', availableStock: 6000, dailyConsumption: 500, emergencyStock: 1000 },
  { no: 13, name: 'MS SCRAP', category: 'METALLIC CHARGE', unit: 'KGS', availableStock: 3000, dailyConsumption: 200, emergencyStock: 400 },
  { no: 14, name: 'FOUNDRY RETURNS', category: 'METALLIC CHARGE', unit: 'KGS', availableStock: 8000, dailyConsumption: 600, emergencyStock: 1200 },
  { no: 15, name: 'FERRO SILICON', category: 'ALLOYS AND ADDITIVES', unit: 'KGS', availableStock: 300, dailyConsumption: 20, emergencyStock: 60 },
  { no: 16, name: 'FERRO MANGANESE', category: 'ALLOYS AND ADDITIVES', unit: 'KGS', availableStock: 100, dailyConsumption: 3, emergencyStock: 9 },
  { no: 17, name: 'CARBON RAISER', category: 'ALLOYS AND ADDITIVES', unit: 'KGS', availableStock: 150, dailyConsumption: 5, emergencyStock: 15 },
  { no: 18, name: 'FERRO SILICON MAGNESIUM', category: 'ALLOYS AND ADDITIVES', unit: 'KGS', availableStock: 100, dailyConsumption: 4, emergencyStock: 12 },
  { no: 19, name: 'INOCULANT', category: 'ALLOYS AND ADDITIVES', unit: 'KGS', availableStock: 150, dailyConsumption: 10, emergencyStock: 30 },
  { no: 20, name: 'FERRO PHOSPHORUS', category: 'ALLOYS AND ADDITIVES', unit: 'KGS', availableStock: 50, dailyConsumption: 1, emergencyStock: 3 },
  { no: 21, name: 'FERRO CHROME', category: 'ALLOYS AND ADDITIVES', unit: 'KGS', availableStock: 50, dailyConsumption: 1, emergencyStock: 3 },
  { no: 22, name: 'COPPER', category: 'ALLOYS AND ADDITIVES', unit: 'KGS', availableStock: 50, dailyConsumption: 1, emergencyStock: 3 },
  { no: 23, name: 'NICKEL', category: 'ALLOYS AND ADDITIVES', unit: 'KGS', availableStock: 50, dailyConsumption: 1, emergencyStock: 3 },
  { no: 24, name: 'GRAPHITE POWDER', category: 'REFRACTORY AND COATING', unit: 'KGS', availableStock: 100, dailyConsumption: 3, emergencyStock: 9 },
  { no: 25, name: 'ZIRCON POWDER', category: 'REFRACTORY AND COATING', unit: 'KGS', availableStock: 100, dailyConsumption: 2, emergencyStock: 6 },
  { no: 26, name: 'SILICA FLOUR', category: 'REFRACTORY AND COATING', unit: 'KGS', availableStock: 200, dailyConsumption: 5, emergencyStock: 15 },
  { no: 27, name: 'REFRACTORY MOULD WASH', category: 'REFRACTORY AND COATING', unit: 'LITRES', availableStock: 100, dailyConsumption: 5, emergencyStock: 15 },
  { no: 28, name: 'BENTONITE-BASED COATING', category: 'REFRACTORY AND COATING', unit: 'KGS', availableStock: 100, dailyConsumption: 3, emergencyStock: 9 },
  { no: 29, name: 'GRINDING WHEELS', category: 'CONSUMABLES', unit: 'PIECES', availableStock: 100, dailyConsumption: 5, emergencyStock: 15 },
  { no: 30, name: 'CUTTING WHEELS', category: 'CONSUMABLES', unit: 'PIECES', availableStock: 100, dailyConsumption: 5, emergencyStock: 15 },
  { no: 31, name: 'STEEL SHOT', category: 'CONSUMABLES', unit: 'KGS', availableStock: 500, dailyConsumption: 15, emergencyStock: 45 },
  { no: 32, name: 'STEEL GRIT', category: 'CONSUMABLES', unit: 'KGS', availableStock: 300, dailyConsumption: 10, emergencyStock: 30 },
  { no: 33, name: 'WELDING ELECTRODES', category: 'CONSUMABLES', unit: 'KGS', availableStock: 100, dailyConsumption: 3, emergencyStock: 9 },
  { no: 34, name: 'OXYGEN GAS', category: 'GAS', unit: 'CYLINDERS', availableStock: 10, dailyConsumption: 0.5, emergencyStock: 2 },
  { no: 35, name: 'LPG', category: 'FUEL', unit: 'KGS', availableStock: 200, dailyConsumption: 10, emergencyStock: 30 },
  { no: 36, name: 'ACETYLENE GAS', category: 'GAS', unit: 'CYLINDERS', availableStock: 5, dailyConsumption: 0.2, emergencyStock: 1 },
]
