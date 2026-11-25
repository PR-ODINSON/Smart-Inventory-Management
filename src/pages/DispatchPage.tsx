import { useEffect, useState, useMemo, useRef } from 'react'
import {
  Truck,
  Trash2,
  Search,
  X,
  Plus,
  Package,
  CheckSquare,
  Square,
  Layers,
} from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card, CardHeader } from '../components/shared/Card'
import { Button } from '../components/shared/Button'
import { Modal } from '../components/shared/Modal'
import { useToast } from '../contexts/ToastContext'
import {
  createMultipleDispatches,
  deleteDispatch,
  listDispatchesWithDetails,
  listPendingPoItems,
  type DispatchWithDetails,
  type PoItemDispatchInfo,
} from '../services/dispatchService'
import { formatNumber } from '../utils/formatting'

const inputClass =
  'w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-900'

interface DispatchRowState {
  id: string
  poItemId: string
  searchQuery: string
  isDropdownOpen: boolean
  quantity: number
}

function createEmptyRow(): DispatchRowState {
  return {
    id: `row-${crypto.randomUUID()}`,
    poItemId: '',
    searchQuery: '',
    isDropdownOpen: false,
    quantity: 0,
  }
}

export function DispatchPage() {
  const { toast } = useToast()

  // Data states
  const [pendingItems, setPendingItems] = useState<PoItemDispatchInfo[]>([])
  const [history, setHistory] = useState<DispatchWithDetails[]>([])
  const [loading, setLoading] = useState(true)

  // Header form states
  const [invoiceNo, setInvoiceNo] = useState('')
  const [dispatchDate, setDispatchDate] = useState(() => new Date().toISOString().split('T')[0])
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [remarks, setRemarks] = useState('')

  // Dispatch items (supports multiple items)
  const [dispatchRows, setDispatchRows] = useState<DispatchRowState[]>([createEmptyRow()])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Quick picker modal
  const [isQuickPickerOpen, setIsQuickPickerOpen] = useState(false)
  const [quickPickerSelection, setQuickPickerSelection] = useState<string[]>([])
  const [quickPickerSearch, setQuickPickerSearch] = useState('')

  // Delete / Reversal state
  const [dispatchToDelete, setDispatchToDelete] = useState<DispatchWithDetails | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const dropdownContainerRef = useRef<HTMLDivElement>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [pending, dispatches] = await Promise.all([
        listPendingPoItems(),
        listDispatchesWithDetails(),
      ])
      setPendingItems(pending)
      setHistory(dispatches)
    } catch {
      toast('Failed to load dispatch data.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownContainerRef.current &&
        !dropdownContainerRef.current.contains(event.target as Node)
      ) {
        setDispatchRows((prev) =>
          prev.map((row) => (row.isDropdownOpen ? { ...row, isDropdownOpen: false } : row)),
        )
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Lookup map for fast pending item access
  const pendingItemMap = useMemo(() => {
    const map = new Map<string, PoItemDispatchInfo>()
    for (const item of pendingItems) {
      map.set(item.itemId, item)
    }
    return map
  }, [pendingItems])

  // Summary calculations
  const summary = useMemo(() => {
    let totalItems = 0
    let totalQty = 0
    let totalWeightKg = 0

    for (const row of dispatchRows) {
      if (row.poItemId && row.quantity > 0) {
        const item = pendingItemMap.get(row.poItemId)
        if (item) {
          totalItems++
          totalQty += row.quantity
          if (item.weightPerPieceKg > 0) {
            totalWeightKg += row.quantity * item.weightPerPieceKg
          }
        }
      }
    }
    return { totalItems, totalQty, totalWeightKg }
  }, [dispatchRows, pendingItemMap])

  // Row handlers
  const handleAddRow = () => {
    setDispatchRows((prev) => [...prev, createEmptyRow()])
  }

  const handleRemoveRow = (rowId: string) => {
    setDispatchRows((prev) => {
      if (prev.length <= 1) {
        return [createEmptyRow()]
      }
      return prev.filter((r) => r.id !== rowId)
    })
  }

  const handleSelectPoItem = (rowId: string, item: PoItemDispatchInfo) => {
    setDispatchRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r
        return {
          ...r,
          poItemId: item.itemId,
          searchQuery: item.itemName,
          quantity: item.pendingQuantity,
          isDropdownOpen: false,
        }
      }),
    )
  }

  const handleRowQueryChange = (rowId: string, query: string) => {
    setDispatchRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r
        const currentItem = pendingItemMap.get(r.poItemId)
        const stillMatches = currentItem && currentItem.itemName.toLowerCase() === query.trim().toLowerCase()
        return {
          ...r,
          searchQuery: query,
          isDropdownOpen: true,
          poItemId: stillMatches ? r.poItemId : '',
        }
      }),
    )
  }

  const handleRowQuantityChange = (rowId: string, qty: number) => {
    setDispatchRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, quantity: Math.max(0, qty) } : r)),
    )
  }

  const handleClearForm = () => {
    setInvoiceNo('')
    setDispatchDate(new Date().toISOString().split('T')[0])
    setVehicleNumber('')
    setRemarks('')
    setDispatchRows([createEmptyRow()])
  }

  // Quick picker handlers
  const handleOpenQuickPicker = () => {
    const currentlySelected = dispatchRows.filter((r) => r.poItemId).map((r) => r.poItemId)
    setQuickPickerSelection(currentlySelected)
    setQuickPickerSearch('')
    setIsQuickPickerOpen(true)
  }

  const handleToggleQuickPickerItem = (itemId: string) => {
    setQuickPickerSelection((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId],
    )
  }

  const handleApplyQuickPicker = () => {
    const newRows: DispatchRowState[] = []
    for (const itemId of quickPickerSelection) {
      const item = pendingItemMap.get(itemId)
      if (item) {
        const existingRow = dispatchRows.find((r) => r.poItemId === itemId)
        newRows.push({
          id: existingRow?.id || `row-${crypto.randomUUID()}`,
          poItemId: item.itemId,
          searchQuery: item.itemName,
          quantity: existingRow && existingRow.quantity > 0 ? existingRow.quantity : item.pendingQuantity,
          isDropdownOpen: false,
        })
      }
    }
    setDispatchRows(newRows.length > 0 ? newRows : [createEmptyRow()])
    setIsQuickPickerOpen(false)
  }

  const filteredQuickPickerItems = useMemo(() => {
    const q = quickPickerSearch.trim().toLowerCase()
    if (!q) return pendingItems
    return pendingItems.filter(
      (item) =>
        item.itemName.toLowerCase().includes(q) ||
        item.poNumber.toLowerCase().includes(q) ||
        item.customerName.toLowerCase().includes(q),
    )
  }, [pendingItems, quickPickerSearch])

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedInvoiceNo = invoiceNo.trim()
    if (!trimmedInvoiceNo) {
      toast('Invoice No is required.', 'error')
      return
    }

    const trimmedVehicleNumber = vehicleNumber.trim().toUpperCase()
    if (!trimmedVehicleNumber) {
      toast('Vehicle Number is required.', 'error')
      return
    }

    if (!dispatchDate) {
      toast('Dispatch Date is required.', 'error')
      return
    }

    // Validate items
    const validRows = dispatchRows.filter((r) => r.poItemId)
    if (validRows.length === 0) {
      toast('Please select at least one item from the Purchase Order list.', 'error')
      return
    }

    // Check for duplicate items in same dispatch
    const itemIds = validRows.map((r) => r.poItemId)
    if (new Set(itemIds).size !== itemIds.length) {
      toast('Duplicate items selected. Please combine quantities into one row.', 'error')
      return
    }

    for (const row of validRows) {
      const item = pendingItemMap.get(row.poItemId)
      if (!item) {
        toast('One or more selected items are invalid.', 'error')
        return
      }
      if (row.quantity <= 0) {
        toast(`Quantity for "${item.itemName}" must be greater than 0.`, 'error')
        return
      }
      if (row.quantity > item.pendingQuantity) {
        toast(
          `Quantity for "${item.itemName}" exceeds pending quantity (${item.pendingQuantity} ${item.unit}).`,
          'error',
        )
        return
      }
    }

    setIsSubmitting(true)
    try {
      const itemsPayload = validRows.map((r) => {
        const item = pendingItemMap.get(r.poItemId)!
        return {
          customerPoId: item.poId,
          poItemId: item.itemId,
          quantity: rowQuantityToSubmit(r.quantity),
        }
      })

      await createMultipleDispatches({
        invoiceNo: trimmedInvoiceNo,
        vehicleNumber: trimmedVehicleNumber,
        dispatchDate,
        remarks: remarks.trim() || undefined,
        items: itemsPayload,
      })

      toast(
        `Dispatch recorded successfully for ${validRows.length} item(s) (Invoice #${trimmedInvoiceNo}).`,
        'success',
      )
      handleClearForm()
      await loadData()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to record dispatch.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  function rowQuantityToSubmit(qty: number): number {
    return Number(qty)
  }

  const handleConfirmDeleteDispatch = async () => {
    if (!dispatchToDelete) return
    setIsDeleting(true)
    try {
      await deleteDispatch(dispatchToDelete.id)
      toast(
        `Dispatch ${dispatchToDelete.invoiceNo ?? ''} reversed and PO pending quantity restored.`,
        'success',
      )
      setDispatchToDelete(null)
      await loadData()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to reverse dispatch.', 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Dispatch"
        description="Record customer order dispatches and track delivery fulfillment against purchase orders."
      />

      {/* SECTION 1: RECORD NEW DISPATCH */}
      <Card className="p-6">
        <CardHeader
          title="Record New Dispatch"
          description="Enter dispatch details and select items from purchase orders. Fulfilled quantities on customer POs update automatically."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenQuickPicker}
              className="text-xs"
            >
              <Layers className="h-4 w-4 mr-1.5 text-brand" />
              Quick Select from PO List
            </Button>
          }
        />

        <form onSubmit={handleSubmit} className="mt-4 space-y-6">
          {/* COMMON DISPATCH DETAILS: Invoice No, Dispatch Date, Vehicle Number */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Invoice No *
              </label>
              <input
                type="text"
                className={inputClass}
                placeholder="e.g. INV-2026-0042"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Dispatch Date *
              </label>
              <input
                type="date"
                className={inputClass}
                value={dispatchDate}
                onChange={(e) => setDispatchDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Vehicle Number *
              </label>
              <input
                type="text"
                className={`${inputClass} uppercase font-mono`}
                placeholder="e.g. MH 12 AB 1234"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                required
              />
            </div>
          </div>

          {/* DISPATCH ITEMS SECTION (Supports Multiple Items with Autocomplete) */}
          <div className="space-y-3" ref={dropdownContainerRef}>
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Items to Dispatch ({dispatchRows.filter((r) => r.poItemId).length} selected)
              </span>
              <button
                type="button"
                onClick={handleAddRow}
                className="inline-flex items-center text-xs font-semibold text-brand hover:underline"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Another Item
              </button>
            </div>

            <div className="space-y-3">
              {dispatchRows.map((row, index) => {
                const selectedItem = pendingItemMap.get(row.poItemId)
                const query = row.searchQuery.trim().toLowerCase()
                const filteredRowOptions = query
                  ? pendingItems.filter(
                      (item) =>
                        item.itemName.toLowerCase().includes(query) ||
                        item.poNumber.toLowerCase().includes(query) ||
                        item.customerName.toLowerCase().includes(query),
                    )
                  : pendingItems

                const lineWeightKg =
                  selectedItem && row.quantity > 0 && selectedItem.weightPerPieceKg > 0
                    ? row.quantity * selectedItem.weightPerPieceKg
                    : 0

                return (
                  <div
                    key={row.id}
                    className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 transition-colors dark:border-slate-800 dark:bg-slate-900/40"
                  >
                    <div className="grid gap-3 sm:grid-cols-12 items-start">
                      {/* Item Index & Searchable Input */}
                      <div className="relative sm:col-span-7">
                        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                          Item #{index + 1}: Name (Search from Purchase Orders) *
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            className={`${inputClass} pr-8 bg-white dark:bg-slate-900`}
                            placeholder="Type to search PO item name, PO #, or customer..."
                            value={row.searchQuery}
                            onFocus={() => {
                              setDispatchRows((prev) =>
                                prev.map((r) => (r.id === row.id ? { ...r, isDropdownOpen: true } : r)),
                              )
                            }}
                            onChange={(e) => handleRowQueryChange(row.id, e.target.value)}
                          />
                          {row.searchQuery ? (
                            <button
                              type="button"
                              onClick={() => {
                                setDispatchRows((prev) =>
                                  prev.map((r) =>
                                    r.id === row.id
                                      ? {
                                          ...r,
                                          searchQuery: '',
                                          poItemId: '',
                                          quantity: 0,
                                          isDropdownOpen: false,
                                        }
                                      : r,
                                  ),
                                )
                              }}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          ) : (
                            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          )}
                        </div>

                        {/* Suggestions Dropdown */}
                        {row.isDropdownOpen && (
                          <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
                            {filteredRowOptions.length === 0 ? (
                              <div className="p-3 text-xs text-slate-500">
                                {pendingItems.length === 0
                                  ? 'No pending items found in purchase orders.'
                                  : 'No matching PO items found.'}
                              </div>
                            ) : (
                              filteredRowOptions.map((item) => {
                                const isSelected = row.poItemId === item.itemId
                                return (
                                  <button
                                    key={`${item.poId}-${item.itemId}`}
                                    type="button"
                                    onClick={() => handleSelectPoItem(row.id, item)}
                                    className={`w-full text-left px-3 py-2 text-xs hover:bg-brand/10 transition-colors border-b border-slate-100 dark:border-slate-700/50 last:border-0 ${
                                      isSelected ? 'bg-brand/15 font-medium' : ''
                                    }`}
                                  >
                                    <div className="font-semibold text-slate-900 dark:text-white">
                                      {item.itemName}
                                    </div>
                                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-slate-500 dark:text-slate-400">
                                      <span>
                                        PO: <strong className="text-slate-700 dark:text-slate-200">{item.poNumber}</strong>
                                      </span>
                                      <span>·</span>
                                      <span>
                                        Party: <strong className="text-slate-700 dark:text-slate-200">{item.customerName}</strong>
                                      </span>
                                      <span>·</span>
                                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                        Pending: {formatNumber(item.pendingQuantity, 0)} {item.unit}
                                      </span>
                                    </div>
                                  </button>
                                )
                              })
                            )}
                          </div>
                        )}

                        {/* Selected Item Info Badge */}
                        {selectedItem && (
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-600 dark:text-slate-400">
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              PO #{selectedItem.poNumber} ({selectedItem.customerName})
                            </span>
                            <span>·</span>
                            <span>
                              Available to dispatch: <strong className="text-slate-800 dark:text-slate-200">{selectedItem.pendingQuantity} {selectedItem.unit}</strong>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Quantity Input */}
                      <div className="sm:col-span-3">
                        <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                          Quantity ({selectedItem?.unit || 'pieces'}) *
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={selectedItem?.pendingQuantity}
                          className={`${inputClass} bg-white dark:bg-slate-900`}
                          placeholder="Qty to dispatch"
                          value={row.quantity || ''}
                          onChange={(e) => handleRowQuantityChange(row.id, Number(e.target.value))}
                          disabled={!selectedItem}
                          required
                        />
                        <div className="mt-1 text-xs text-slate-500">
                          {selectedItem ? (
                            <span>
                              Max: <strong>{selectedItem.pendingQuantity}</strong>
                              {selectedItem.weightPerPieceKg > 0 && (
                                <span> · Total: <strong>{formatNumber(lineWeightKg, 1)} kg</strong></span>
                              )}
                            </span>
                          ) : (
                            <span>Select item first</span>
                          )}
                        </div>
                      </div>

                      {/* Remove Button */}
                      <div className="sm:col-span-2 flex items-end justify-end pt-5 sm:pt-6">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveRow(row.id)}
                          className="text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
                          title="Remove item"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Add More Items Button */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddRow}
                className="text-xs"
              >
                <Plus className="h-4 w-4 mr-1 text-brand" />
                Add Another Item
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleOpenQuickPicker}
                className="text-xs text-slate-600 dark:text-slate-400"
              >
                <Package className="h-4 w-4 mr-1 text-slate-500" />
                Browse PO Items ({pendingItems.length} available)
              </Button>
            </div>
          </div>

          {/* SUMMARY BANNER */}
          {summary.totalItems > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-900/60 dark:bg-emerald-950/20">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-emerald-900 dark:text-emerald-300">
                  Dispatch Summary:
                </span>
                <div className="flex flex-wrap gap-4 text-emerald-800 dark:text-emerald-300 font-medium">
                  <span>Total Items: <strong>{summary.totalItems}</strong></span>
                  <span>Total Quantity: <strong>{formatNumber(summary.totalQty, 0)} nos</strong></span>
                  {summary.totalWeightKg > 0 && (
                    <span>Total Weight: <strong>{formatNumber(summary.totalWeightKg, 1)} kg</strong></span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SUBMIT ACTIONS */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              type="submit"
              disabled={isSubmitting || summary.totalItems === 0}
            >
              <Truck className="h-4 w-4 mr-1.5" />
              {isSubmitting
                ? 'Recording Dispatch…'
                : summary.totalItems > 1
                ? `Record Dispatch (${summary.totalItems} items)`
                : 'Record Dispatch'}
            </Button>
            <Button type="button" variant="ghost" onClick={handleClearForm}>
              Clear
            </Button>
          </div>
        </form>
      </Card>

      {/* QUICK PICKER MODAL (Multi-select PO items with checkboxes) */}
      <Modal
        open={isQuickPickerOpen}
        onClose={() => setIsQuickPickerOpen(false)}
        title="Select Items from Purchase Orders"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Check the purchase order items you want to include in this dispatch. Their pending quantities will be added to the dispatch form.
          </p>

          <div className="relative">
            <input
              type="text"
              className={inputClass}
              placeholder="Filter by item name, PO #, or customer..."
              value={quickPickerSearch}
              onChange={(e) => setQuickPickerSearch(e.target.value)}
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          </div>

          <div className="max-h-80 overflow-y-auto space-y-1.5 rounded border border-slate-200 p-2 dark:border-slate-800">
            {filteredQuickPickerItems.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-500">
                {pendingItems.length === 0
                  ? 'No pending purchase order items found.'
                  : 'No items match your search.'}
              </p>
            ) : (
              filteredQuickPickerItems.map((item) => {
                const isChecked = quickPickerSelection.includes(item.itemId)
                return (
                  <div
                    key={`${item.poId}-${item.itemId}`}
                    onClick={() => handleToggleQuickPickerItem(item.itemId)}
                    className={`flex items-start gap-3 rounded-md p-2.5 cursor-pointer text-xs transition-colors border ${
                      isChecked
                        ? 'border-brand/40 bg-brand/10 dark:bg-brand/20'
                        : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="mt-0.5 text-brand">
                      {isChecked ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {item.itemName}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2 text-slate-500 dark:text-slate-400">
                        <span>PO: <strong className="text-slate-700 dark:text-slate-300">{item.poNumber}</strong></span>
                        <span>·</span>
                        <span>Customer: <strong className="text-slate-700 dark:text-slate-300">{item.customerName}</strong></span>
                        <span>·</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          Pending: {formatNumber(item.pendingQuantity, 0)} {item.unit}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div className="flex justify-between items-center pt-2">
            <span className="text-xs text-slate-500">
              {quickPickerSelection.length} item(s) selected
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setIsQuickPickerOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleApplyQuickPicker}
                disabled={quickPickerSelection.length === 0}
              >
                Add Selected Items ({quickPickerSelection.length})
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* SECTION 2: DISPATCH HISTORY */}
      <Card>
        <CardHeader
          title="Dispatch History"
          description="Log of fulfilled dispatches. Reversing a dispatch restores pending quantity to the PO."
        />

        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading dispatch records…</p>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No dispatches recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                <tr>
                  <th className="px-4 py-3">Dispatch Date</th>
                  <th className="px-4 py-3">Invoice No</th>
                  <th className="px-4 py-3">Item Name</th>
                  <th className="px-4 py-3 text-right">Quantity</th>
                  <th className="px-4 py-3">Vehicle Number</th>
                  <th className="px-4 py-3">PO #</th>
                  <th className="px-4 py-3">Party / Customer</th>
                  <th className="px-4 py-3 text-right">Total Weight (kg)</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                      {record.dispatchDate}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs font-medium text-slate-900 dark:text-white">
                      {record.invoiceNo || '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                      {record.materialName}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900 dark:text-white">
                      {formatNumber(record.quantity, 0)} {record.unit}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {record.vehicleNumber || '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-slate-600 dark:text-slate-400">
                      {record.customerPoNumber}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                      {record.customerName}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-slate-600 dark:text-slate-400">
                      {record.totalWeightKg !== undefined ? formatNumber(record.totalWeightKg, 1) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        onClick={() => setDispatchToDelete(record)}
                        className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                        title="Reverse Dispatch"
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Reverse
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* REVERSAL CONFIRMATION MODAL */}
      <Modal
        open={Boolean(dispatchToDelete)}
        onClose={() => setDispatchToDelete(null)}
        title="Confirm Dispatch Reversal"
      >
        {dispatchToDelete && (
          <div className="space-y-4 text-sm">
            <p className="text-slate-600 dark:text-slate-400">
              Are you sure you want to reverse this dispatch? This will restore the dispatched quantity back to the purchase order and permanently delete this record.
            </p>
            <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs space-y-1 dark:border-slate-800 dark:bg-slate-900">
              <div><strong>Item:</strong> {dispatchToDelete.materialName}</div>
              <div><strong>Quantity:</strong> {formatNumber(dispatchToDelete.quantity, 0)} {dispatchToDelete.unit}</div>
              <div><strong>Invoice No:</strong> {dispatchToDelete.invoiceNo || '—'}</div>
              <div><strong>Vehicle:</strong> {dispatchToDelete.vehicleNumber || '—'}</div>
              <div><strong>PO #:</strong> {dispatchToDelete.customerPoNumber}</div>
              <div><strong>Customer / Party:</strong> {dispatchToDelete.customerName}</div>
              <div><strong>Dispatch Date:</strong> {dispatchToDelete.dispatchDate}</div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                type="button"
                disabled={isDeleting}
                onClick={() => setDispatchToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                type="button"
                disabled={isDeleting}
                onClick={() => void handleConfirmDeleteDispatch()}
              >
                {isDeleting ? 'Reversing…' : 'Confirm Reversal'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
