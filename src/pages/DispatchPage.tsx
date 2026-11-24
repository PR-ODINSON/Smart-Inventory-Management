import { useEffect, useState, useMemo, useRef } from 'react'
import { Truck, Trash2, Search, X } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card, CardHeader } from '../components/shared/Card'
import { Button } from '../components/shared/Button'
import { Modal } from '../components/shared/Modal'
import { useToast } from '../contexts/ToastContext'
import {
  createDispatch,
  deleteDispatch,
  listDispatchesWithDetails,
  listPendingPoItems,
  type DispatchWithDetails,
  type PoItemDispatchInfo,
} from '../services/dispatchService'
import { formatNumber } from '../utils/formatting'

const inputClass =
  'w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none dark:border-slate-700 dark:bg-slate-900'

export function DispatchPage() {
  const { toast } = useToast()

  // Data states
  const [pendingItems, setPendingItems] = useState<PoItemDispatchInfo[]>([])
  const [history, setHistory] = useState<DispatchWithDetails[]>([])
  const [loading, setLoading] = useState(true)

  // Form states (EXACTLY 5 fields in EXACT order)
  // 1. Item Name
  const [selectedPoItemId, setSelectedPoItemId] = useState<string>('')
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 2. Quantity
  const [quantity, setQuantity] = useState<number>(0)

  // 3. Invoice No
  const [invoiceNo, setInvoiceNo] = useState('')

  // 4. Dispatch Date
  const [dispatchDate, setDispatchDate] = useState(() => new Date().toISOString().split('T')[0])

  // 5. Vehicle Number
  const [vehicleNumber, setVehicleNumber] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)

  // Delete / Reversal state
  const [dispatchToDelete, setDispatchToDelete] = useState<DispatchWithDetails | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

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

  // Close combobox when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedItem = useMemo(
    () => pendingItems.find((i) => i.itemId === selectedPoItemId),
    [pendingItems, selectedPoItemId],
  )

  // Filtered pending PO items for Item Name searchable combobox
  const filteredPendingItems = useMemo(() => {
    const q = itemSearchQuery.trim().toLowerCase()
    if (!q) return pendingItems
    return pendingItems.filter(
      (item) =>
        item.itemName.toLowerCase().includes(q) ||
        item.poNumber.toLowerCase().includes(q) ||
        item.customerName.toLowerCase().includes(q),
    )
  }, [pendingItems, itemSearchQuery])

  const calculatedTotalWeightKg = useMemo(() => {
    if (!selectedItem || quantity <= 0 || !selectedItem.weightPerPieceKg) return 0
    return quantity * selectedItem.weightPerPieceKg
  }, [selectedItem, quantity])

  const handleSelectItem = (item: PoItemDispatchInfo) => {
    setSelectedPoItemId(item.itemId)
    setItemSearchQuery(`${item.itemName} — PO #${item.poNumber} (${item.customerName})`)
    setQuantity(item.pendingQuantity)
    setIsDropdownOpen(false)
  }

  const handleClearForm = () => {
    setSelectedPoItemId('')
    setItemSearchQuery('')
    setQuantity(0)
    setInvoiceNo('')
    setDispatchDate(new Date().toISOString().split('T')[0])
    setVehicleNumber('')
    setIsDropdownOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedItem) {
      toast('Please select an item from the Purchase Order list.', 'error')
      return
    }

    if (quantity <= 0) {
      toast('Quantity must be greater than 0.', 'error')
      return
    }

    if (quantity > selectedItem.pendingQuantity) {
      toast(`Quantity cannot exceed pending quantity (${selectedItem.pendingQuantity} ${selectedItem.unit}).`, 'error')
      return
    }

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

    setIsSubmitting(true)
    try {
      await createDispatch({
        customerPoId: selectedItem.poId,
        poItemId: selectedItem.itemId,
        quantity,
        dispatchDate,
        invoiceNo: trimmedInvoiceNo,
        vehicleNumber: trimmedVehicleNumber,
      })

      toast(`Dispatch recorded successfully for ${selectedItem.itemName}.`, 'success')
      handleClearForm()
      await loadData()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to record dispatch.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmDeleteDispatch = async () => {
    if (!dispatchToDelete) return
    setIsDeleting(true)
    try {
      await deleteDispatch(dispatchToDelete.id)
      toast(`Dispatch ${dispatchToDelete.invoiceNo ?? ''} reversed and PO pending quantity restored.`, 'success')
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

      {/* SECTION 1: RECORD NEW DISPATCH (EXACTLY 5 FIELDS IN EXACT ORDER) */}
      <Card className="p-6">
        <CardHeader
          title="Record New Dispatch"
          description="Enter customer dispatch details. Fulfilled quantities on customer POs update automatically."
        />

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* FIELD 1: Item Name (Searchable combobox from pending customer PO items) */}
            <div className="relative lg:col-span-2" ref={dropdownRef}>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                1. Item Name *
              </label>
              <div className="relative">
                <input
                  type="text"
                  className={`${inputClass} pr-8`}
                  placeholder="Type to search pending casting items, PO #, or customer..."
                  value={itemSearchQuery}
                  onFocus={() => setIsDropdownOpen(true)}
                  onChange={(e) => {
                    setItemSearchQuery(e.target.value)
                    setIsDropdownOpen(true)
                    // If modified text no longer matches current selection, reset id
                    if (selectedPoItemId) {
                      setSelectedPoItemId('')
                    }
                  }}
                />
                {itemSearchQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setItemSearchQuery('')
                      setSelectedPoItemId('')
                      setQuantity(0)
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                )}
              </div>

              {/* Combobox Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  {filteredPendingItems.length === 0 ? (
                    <div className="p-3 text-xs text-slate-500">
                      {pendingItems.length === 0
                        ? 'No customer PO items with pending quantity found.'
                        : 'No matching items found.'}
                    </div>
                  ) : (
                    filteredPendingItems.map((item) => (
                      <button
                        key={`${item.poId}-${item.itemId}`}
                        type="button"
                        onClick={() => handleSelectItem(item)}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-brand/10 transition-colors border-b border-slate-100 dark:border-slate-700/50 last:border-0 ${
                          selectedPoItemId === item.itemId ? 'bg-brand/15 font-medium' : ''
                        }`}
                      >
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {item.itemName}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-slate-500 dark:text-slate-400">
                          <span>PO: <strong className="text-slate-700 dark:text-slate-200">{item.poNumber}</strong></span>
                          <span>·</span>
                          <span>Customer: <strong className="text-slate-700 dark:text-slate-200">{item.customerName}</strong></span>
                          <span>·</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            Pending: {formatNumber(item.pendingQuantity, 0)} {item.unit}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {selectedItem && (
                <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                  Selected: {selectedItem.itemName} · Pending: {formatNumber(selectedItem.pendingQuantity, 0)} {selectedItem.unit}
                </p>
              )}
            </div>

            {/* FIELD 2: Quantity */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                2. Quantity ({selectedItem?.unit || 'pieces'}) *
              </label>
              <input
                type="number"
                min={1}
                max={selectedItem?.pendingQuantity}
                className={inputClass}
                placeholder="Pieces to dispatch"
                value={quantity || ''}
                onChange={(e) => setQuantity(Number(e.target.value))}
                disabled={!selectedItem}
              />
              <div className="mt-1 text-xs text-slate-500">
                {selectedItem ? (
                  <span>
                    Pending: <strong>{selectedItem.pendingQuantity}</strong> {selectedItem.unit}
                    {selectedItem.weightPerPieceKg > 0 && (
                      <span> · Wt/pc: {selectedItem.weightPerPieceKg} kg · Total: <strong>{formatNumber(calculatedTotalWeightKg, 1)} kg</strong></span>
                    )}
                  </span>
                ) : (
                  'Select an item first'
                )}
              </div>
            </div>

            {/* FIELD 3: Invoice No */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                3. Invoice No *
              </label>
              <input
                type="text"
                className={inputClass}
                placeholder="e.g. INV-2026-0042"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
              />
            </div>

            {/* FIELD 4: Dispatch Date */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                4. Dispatch Date *
              </label>
              <input
                type="date"
                className={inputClass}
                value={dispatchDate}
                onChange={(e) => setDispatchDate(e.target.value)}
              />
            </div>

            {/* FIELD 5: Vehicle Number */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                5. Vehicle Number *
              </label>
              <input
                type="text"
                className={`${inputClass} uppercase`}
                placeholder="e.g. MH 12 AB 1234"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" disabled={isSubmitting || !selectedItem}>
              <Truck className="h-4 w-4 mr-1.5" />
              {isSubmitting ? 'Recording Dispatch…' : 'Record Dispatch'}
            </Button>
            <Button type="button" variant="ghost" onClick={handleClearForm}>
              Clear
            </Button>
          </div>
        </form>
      </Card>

      {/* SECTION 2: DISPATCH HISTORY */}
      <Card>
        <CardHeader
          title="Dispatch History"
          description="Log of fulfilled customer dispatches. Reversing a dispatch restores pending quantity to the PO."
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
                  <th className="px-4 py-3">Customer PO #</th>
                  <th className="px-4 py-3">Customer / Company Name</th>
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
              Are you sure you want to reverse this dispatch? This will restore the dispatched quantity back to the customer purchase order and permanently delete this record.
            </p>
            <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs space-y-1 dark:border-slate-800 dark:bg-slate-900">
              <div><strong>Item:</strong> {dispatchToDelete.materialName}</div>
              <div><strong>Quantity:</strong> {formatNumber(dispatchToDelete.quantity, 0)} {dispatchToDelete.unit}</div>
              <div><strong>Invoice No:</strong> {dispatchToDelete.invoiceNo || '—'}</div>
              <div><strong>Vehicle:</strong> {dispatchToDelete.vehicleNumber || '—'}</div>
              <div><strong>Customer PO #:</strong> {dispatchToDelete.customerPoNumber}</div>
              <div><strong>Customer:</strong> {dispatchToDelete.customerName}</div>
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
