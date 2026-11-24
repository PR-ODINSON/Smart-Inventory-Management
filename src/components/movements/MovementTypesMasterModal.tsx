import { useState } from 'react'
import { Modal } from '../shared/Modal'
import { Button } from '../shared/Button'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import type { MovementTypeMaster } from '../../types/dispatch'
import {
  addMovementType,
  updateMovementType,
  removeMovementType,
} from '../../services/movementTypeService'

interface MovementTypesMasterModalProps {
  open: boolean
  onClose: () => void
  types: MovementTypeMaster[]
  onTypesChanged: () => Promise<void>
}

export function MovementTypesMasterModal({
  open,
  onClose,
  types,
  onTypesChanged,
}: MovementTypesMasterModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!newName.trim()) return
    setSaving(true)
    try {
      await addMovementType(newName)
      setNewName('')
      await onTypesChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add type.')
    } finally {
      setSaving(false)
    }
  }

  const handleStartEdit = (t: MovementTypeMaster) => {
    setEditingId(t.id)
    setEditingName(t.name)
    setError(null)
  }

  const handleSaveEdit = async (id: string) => {
    setError(null)
    if (!editingName.trim()) return
    setSaving(true)
    try {
      await updateMovementType(id, editingName)
      setEditingId(null)
      await onTypesChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update type.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setError(null)
    setSaving(true)
    try {
      await removeMovementType(id)
      await onTypesChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove type.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title="Manage Type of Goods" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Configure master categories for goods movement transactions. Categories currently assigned
          to recorded stock movements cannot be removed.
        </p>

        {error && (
          <div className="rounded bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Add new type form */}
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            placeholder="New type of goods (e.g. Scrapped, Subcontracted)..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900"
          />
          <Button size="sm" type="submit" disabled={saving || !newName.trim()}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
        </form>

        {/* List of current types */}
        <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {types.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-2.5 text-xs">
              {editingId === t.id ? (
                <div className="flex flex-1 items-center gap-2 mr-2">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="flex-1 rounded border border-brand px-2 py-1 dark:bg-slate-900"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    type="button"
                    disabled={saving || !editingName.trim()}
                    onClick={() => void handleSaveEdit(t.id)}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <div className="font-medium text-slate-900 dark:text-white">
                    {t.name}
                    <span className="ml-2 font-mono text-[10px] text-slate-400">({t.id})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="p-1 text-slate-400 hover:text-brand"
                      title="Edit name"
                      onClick={() => handleStartEdit(t)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1 text-slate-400 hover:text-red-600"
                      title="Delete"
                      onClick={() => void handleDelete(t.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  )
}
