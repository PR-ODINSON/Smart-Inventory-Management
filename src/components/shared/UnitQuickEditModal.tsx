import { useState, useEffect } from 'react'
import { Modal } from '../shared/Modal'
import { Button } from '../shared/Button'
import { useToast } from '../../contexts/ToastContext'
import type { UnitMaster } from '../../types/masterData'
import {
  changeMaterialUnit,
  addUnit,
  listUnits,
} from '../../services/masterDataService'

export function UnitQuickEditModal({
  open,
  onClose,
  materialId,
  materialName,
  currentUnit,
  onUpdated,
}: {
  open: boolean
  onClose: () => void
  materialId: string
  materialName: string
  currentUnit: string
  onUpdated: () => Promise<void> | void
}) {
  const { toast } = useToast()
  const [units, setUnits] = useState<UnitMaster[]>([])
  const [selectedUnit, setSelectedUnit] = useState(currentUnit)
  const [newUnitName, setNewUnitName] = useState('')
  const [showAddNew, setShowAddNew] = useState(false)
  const [convertStock, setConvertStock] = useState(true)

  const load = async () => {
    const list = await listUnits()
    setUnits(list)
  }

  useEffect(() => {
    if (open) {
      setSelectedUnit(currentUnit)
      setNewUnitName('')
      setShowAddNew(false)
      void load()
    }
  }, [open, currentUnit])

  const isKgTonneSwitch =
    (currentUnit.toLowerCase() === 'kg' && selectedUnit.toLowerCase() === 'tonne') ||
    (currentUnit.toLowerCase() === 'tonne' && selectedUnit.toLowerCase() === 'kg')

  const handleSave = async () => {
    try {
      let unitToApply = selectedUnit.trim()
      if (showAddNew && newUnitName.trim()) {
        const added = await addUnit(newUnitName.trim())
        unitToApply = added.name
      }

      if (!unitToApply) {
        toast('Please select or enter a unit.', 'error')
        return
      }

      await changeMaterialUnit(materialId, unitToApply, {
        convertKgTonneStock: convertStock && isKgTonneSwitch,
      })

      toast(`Unit updated to "${unitToApply}" everywhere.`, 'success')
      await onUpdated()
      onClose()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update unit.', 'error')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Change Unit for ${materialName}`}>
      <div className="space-y-4 text-sm">
        <p className="text-xs text-slate-500">
          Updating the unit for <strong>{materialName}</strong> updates it everywhere (Dashboard, Planning, and Inventory table). Daily Need and Purchase Requirement will both use this unit.
        </p>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Select Unit</label>
          <div className="flex gap-2">
            <select
              className="flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={selectedUnit}
              onChange={(e) => {
                setSelectedUnit(e.target.value)
                setShowAddNew(false)
              }}
            >
              {units.map((u) => (
                <option key={u.id} value={u.name}>
                  {u.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAddNew(!showAddNew)}
            >
              {showAddNew ? 'Cancel' : '+ New Unit'}
            </Button>
          </div>
        </div>

        {showAddNew && (
          <div className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Add New Unit to Master List
            </label>
            <input
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
              placeholder="e.g. litre, pcs, bag, box"
              value={newUnitName}
              onChange={(e) => setNewUnitName(e.target.value)}
            />
          </div>
        )}

        {isKgTonneSwitch ? (
          <div className="rounded bg-blue-50 p-2.5 text-xs text-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={convertStock}
                onChange={(e) => setConvertStock(e.target.checked)}
              />
              <span>
                Convert stored quantities between kg and tonne (1 tonne = 1000 kg)?
              </span>
            </label>
          </div>
        ) : (
          <div className="rounded bg-slate-50 p-2.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <em>Unit conversion note:</em> Changing to units other than kg/tonne updates the label only; it does not convert stored numeric stock quantities.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()}>
            Update Unit
          </Button>
        </div>
      </div>
    </Modal>
  )
}
