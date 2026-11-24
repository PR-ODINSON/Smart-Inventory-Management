import { useState } from 'react'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { Modal } from '../shared/Modal'
import { Button } from '../shared/Button'
import { useToast } from '../../contexts/ToastContext'
import type { CategoryMaster, UnitMaster } from '../../types/masterData'
import {
  addCategory,
  addUnit,
  deleteCategory,
  deleteUnit,
  renameCategory,
  renameUnit,
} from '../../services/masterDataService'

export function MasterDataModal({
  open,
  onClose,
  type,
  items,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  type: 'category' | 'unit'
  items: Array<CategoryMaster | UnitMaster>
  onChanged: () => Promise<void> | void
}) {
  const { toast } = useToast()
  const [newVal, setNewVal] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingVal, setEditingVal] = useState('')

  const title = type === 'category' ? 'Manage Categories' : 'Manage Units'
  const noun = type === 'category' ? 'Category' : 'Unit'

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = newVal.trim()
    if (!val) return
    try {
      if (type === 'category') {
        await addCategory(val)
      } else {
        await addUnit(val)
      }
      toast(`${noun} "${val}" added.`, 'success')
      setNewVal('')
      await onChanged()
    } catch (err) {
      toast(err instanceof Error ? err.message : `Failed to add ${noun.toLowerCase()}.`, 'error')
    }
  }

  const handleRename = async (id: string) => {
    const val = editingVal.trim()
    if (!val) return
    try {
      if (type === 'category') {
        await renameCategory(id, val)
      } else {
        await renameUnit(id, val)
      }
      toast(`${noun} renamed to "${val}".`, 'success')
      setEditingId(null)
      await onChanged()
    } catch (err) {
      toast(err instanceof Error ? err.message : `Failed to rename ${noun.toLowerCase()}.`, 'error')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${noun.toLowerCase()} "${name}"?`)) return
    try {
      if (type === 'category') {
        await deleteCategory(id)
      } else {
        await deleteUnit(id)
      }
      toast(`${noun} "${name}" removed.`, 'success')
      await onChanged()
    } catch (err) {
      toast(err instanceof Error ? err.message : `Failed to remove ${noun.toLowerCase()}.`, 'error')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4 text-sm">
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            placeholder={`New ${noun.toLowerCase()} name…`}
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
          />
          <Button type="submit">
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </form>

        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 rounded border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-2.5">
              {editingId === item.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                    value={editingVal}
                    onChange={(e) => setEditingVal(e.target.value)}
                  />
                  <Button size="sm" onClick={() => void handleRename(item.id)}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{item.name}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      title="Edit"
                      onClick={() => {
                        setEditingId(item.id)
                        setEditingVal(item.name)
                      }}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1 text-red-400 hover:text-red-600 dark:hover:text-red-300"
                      title="Delete"
                      onClick={() => void handleDelete(item.id, item.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {items.length === 0 && (
            <p className="p-3 text-center text-xs text-slate-400">No {noun.toLowerCase()}s found.</p>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
