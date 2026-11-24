import { useEffect, useState, useMemo } from 'react'
import { Truck, Trash2, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card, CardHeader } from '../components/shared/Card'
import { Button } from '../components/shared/Button'
import { useToast } from '../contexts/ToastContext'
import {
  createDispatch,
  deleteDispatch,
  getOriginalAndCurrentPoLists,
  listDispatches,
  listPendingPoItems,
  type DispatchRecord,
  type PoItemDispatchInfo,
  type PoOriginalAndCurrentItem,
} from '../services/dispatchService'
import { db } from '../storage/database'
import { formatNumber } from '../utils/formatting'

export function DispatchPage() {
  const { toast } = useToast()
  const [pendingItems, setPendingItems] = useState<PoItemDispatchInfo[]>([])
  const [poListItems, setPoListItems] = useState<PoOriginalAndCurrentItem[]>([])
  const [history, setHistory] = useState<DispatchRecord[]>([])
  const [poNumberMap, setPoNumberMap] = useState<Map<string, string>>(new Map())

  // Form states
  const [selectedPoItemId, setSelectedPoItemId] = useState('')
  const [quantity, setQuantity] = useState<number>(0)
  const [dispatchDate, setDispatchDate] = useState(() => new Date().toISOString().split('T')[0])
  const [invoiceNo, setInvoiceNo] = useState('')
  const [invoiceNoError, setInvoiceNoError] = useState('')
  const [remarks, setRemarks] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadData = async () => {
    const [pend, overview, hist, pos] = await Promise.all([
      listPendingPoItems(),
      getOriginalAndCurrentPoLists(),
      listDispatches(),
      db.purchaseOrders.toArray(),
    ])
    setPendingItems(pend)
    setPoListItems(overview)
    setHistory(hist)

    const map = new Map<string, string>()
    for (const p of pos) {
      map.set(p.id, p.poNumber)
    }
    setPoNumberMap(map)
  }

  useEffect(() => {
    void loadData()
  }, [])

  const selectedItem = useMemo(
    () => pendingItems.find((i) => i.itemId === selectedPoItemId),
    [pendingItems, selectedPoItemId],
  )

  // Map to count how many open POs have the same item name
  const itemNameCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of pendingItems) {
      counts.set(item.itemName, (counts.get(item.itemName) ?? 0) + 1)
    }
    return counts
  }, [pendingItems])

  // Items sharing the same item name as the currently selected one
  const alternatePosForSelectedItem = useMemo(() => {
    if (!selectedItem) return []
    return pendingItems.filter((i) => i.itemName === selectedItem.itemName)
  }, [pendingItems, selectedItem])

  const calculatedWeightKg = useMemo(() => {
    if (!selectedItem || quantity <= 0 || !selectedItem.weightPerPieceKg) return 0
    return quantity * selectedItem.weightPerPieceKg
  }, [selectedItem, quantity])

  const handleSelectMaterial = (itemId: string) => {
    setSelectedPoItemId(itemId)
    const found = pendingItems.find((i) => i.itemId === itemId)
    setQuantity(found ? found.pendingQuantity : 0)
  }

  const handleSaveDispatch = async (e: React.FormEvent) => {
    e.preventDefault()
    setInvoiceNoError('')

    if (!selectedItem) {
      toast('Please select a material / casting item from the Purchase Order list.', 'error')
      return
    }
    if (quantity <= 0) {
      toast('Dispatch quantity must be greater than 0.', 'error')
      return
    }
    if (quantity > selectedItem.pendingQuantity) {
      toast(
        `Quantity cannot be more than pending quantity (${selectedItem.pendingQuantity} remaining).`,
        'error',
      )
      return
    }
    if (!invoiceNo.trim()) {
      setInvoiceNoError('Invoice No is required.')
      toast('Invoice No is required.', 'error')
      return
    }

    setIsSubmitting(true)
    try {
      await createDispatch({
        customerPoId: selectedItem.poId,
        poItemId: selectedItem.itemId,
        quantity,
        dispatchDate,
        invoiceNo: invoiceNo.trim(),
        remarks: remarks.trim() || undefined,
      })

      toast('Dispatch recorded! Pending quantity on customer PO reduced.', 'success')
      setQuantity(0)
      setInvoiceNo('')
      setInvoiceNoError('')
      setRemarks('')
      setSelectedPoItemId('')
      await loadData()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to record dispatch.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteDispatch = async (dsp: DispatchRecord) => {
    if (
      !confirm(
        `Reverse this dispatch of ${dsp.quantity} ${dsp.unit} for "${dsp.materialName}"? This will add the quantity back to PO pending status.`,
      )
    ) {
      return
    }

    try {
      await deleteDispatch(dsp.id)
      toast('Dispatch reversed. PO pending quantity restored.', 'success')
      await loadData()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to reverse dispatch.', 'error')
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Customer Order Dispatch"
        description="Dispatch completed castings against customer purchase orders. Dispatches reduce pending PO quantities and do not affect raw material inventory."
      />

      {/* 1. RECORD NEW DISPATCH FORM */}
      <Card className="p-5">
        <CardHeader
          title="Record New Dispatch"
          description="Select an open customer PO casting item to dispatch. Over-dispatch is automatically prevented."
        />

        <form onSubmit={handleSaveDispatch} noValidate className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* 1. Material Name (Dropdown from PO list) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Material Name *
              </label>
              <select
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={selectedPoItemId}
                onChange={(e) => handleSelectMaterial(e.target.value)}
              >
                <option value="">-- Select Material / Casting Item --</option>
                {pendingItems.map((item) => {
                  const multiple = (itemNameCount.get(item.itemName) ?? 0) > 1
                  return (
                    <option key={item.itemId} value={item.itemId}>
                      {item.itemName}
                      {multiple ? ` (PO #${item.poNumber})` : ''} — {item.pendingQuantity} {item.unit} pending
                    </option>
                  )
                })}
              </select>
              {pendingItems.length === 0 ? (
                <p className="mt-1 text-xs text-slate-400">
                  No open customer purchase orders with pending quantities.
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-slate-500">
                  Populated from customer PO items with pending quantity &gt; 0.
                </p>
              )}
            </div>

            {/* 2. Customer Purchase Order */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Customer Purchase Order *
              </label>
              {alternatePosForSelectedItem.length > 1 ? (
                <select
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  value={selectedPoItemId}
                  onChange={(e) => handleSelectMaterial(e.target.value)}
                >
                  {alternatePosForSelectedItem.map((alt) => (
                    <option key={alt.itemId} value={alt.itemId}>
                      PO #{alt.poNumber} — {alt.customerName} ({alt.pendingQuantity} pending)
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  readOnly
                  className="w-full rounded border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  value={
                    selectedItem
                      ? `PO #${selectedItem.poNumber} — ${selectedItem.customerName}`
                      : 'Auto-filled from selected Material Name'
                  }
                />
              )}
              {selectedItem && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {selectedItem.customerName} · Due: {selectedItem.deliveryDeadline || 'Not specified'}
                </p>
              )}
            </div>

            {/* 3. Quantity */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Quantity ({selectedItem?.unit || 'pieces'}) *
              </label>
              <input
                type="number"
                min="1"
                max={selectedItem?.pendingQuantity}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={quantity || ''}
                placeholder={selectedItem ? `Max ${selectedItem.pendingQuantity}` : '0'}
                onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)}
              />
              {selectedItem && (
                <span className="mt-1 block text-[11px] text-slate-500">
                  Weight: <strong>{formatNumber(selectedItem.weightPerPieceKg, 2)} kg/piece</strong>
                  {calculatedWeightKg > 0 && ` · Total: ${formatNumber(calculatedWeightKg, 1)} kg`}
                </span>
              )}
            </div>

            {/* 4. Dispatch Date */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Dispatch Date *
              </label>
              <input
                type="date"
                required
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={dispatchDate}
                onChange={(e) => setDispatchDate(e.target.value)}
              />
            </div>

            {/* 5. Invoice No */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Invoice No *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. INV-2026-0891"
                className={`w-full rounded border px-3 py-2 text-sm dark:bg-slate-900 ${
                  invoiceNoError
                    ? 'border-red-500'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
                value={invoiceNo}
                onChange={(e) => {
                  setInvoiceNo(e.target.value)
                  if (invoiceNoError) setInvoiceNoError('')
                }}
              />
              {invoiceNoError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400 font-medium">
                  {invoiceNoError}
                </p>
              )}
            </div>

            {/* 6. Remarks */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Remarks (Optional)
              </label>
              <input
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                placeholder="Challan #DC-884, Vehicle GJ-01-AB-1234"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-500 italic">
              Dispatch records finished castings leaving against a customer PO. Raw material stock is not affected.
            </span>
            <Button type="submit" disabled={isSubmitting || !selectedItem || quantity <= 0}>
              <Truck className="h-4 w-4 mr-1.5" />
              {isSubmitting ? 'Recording Dispatch...' : 'Save Dispatch'}
            </Button>
          </div>
        </form>
      </Card>

      {/* 2. CURRENT PURCHASE ORDER LIST */}
      <Card>
        <CardHeader
          title="Current Purchase Order List"
          description="Live order status showing remaining pending casting quantities and dispatched progress across customer POs."
        />
        <div className="overflow-x-auto p-4">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-3 py-2">Customer PO Number</th>
                <th className="px-3 py-2">Customer / Company Name</th>
                <th className="px-3 py-2">Item Name</th>
                <th className="px-3 py-2">Original Ordered Qty</th>
                <th className="px-3 py-2">Total Dispatched Qty</th>
                <th className="px-3 py-2">Current Pending Qty</th>
                <th className="px-3 py-2">Current Pending Weight</th>
                <th className="px-3 py-2">Delivery Deadline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {poListItems.map((item) => (
                <tr key={`cur-${item.lineId}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="px-3 py-2 font-mono font-semibold text-slate-900 dark:text-white">
                    PO #{item.poNumber}
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                    {item.customerName}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">
                    {item.itemName}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {item.originalOrderedQty} {item.unit}
                  </td>
                  <td className="px-3 py-2 tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                    {item.totalDispatchedQty} {item.unit}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {item.currentPendingQty > 0 ? (
                      <span className="font-bold text-amber-600 dark:text-amber-400">
                        {item.currentPendingQty} {item.unit}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> 0 (Fulfilled)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums font-mono text-slate-600 dark:text-slate-400">
                    {formatNumber(item.currentPendingWeightKg, 1)} kg
                  </td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                    {item.deliveryDeadline || '—'}
                  </td>
                </tr>
              ))}
              {poListItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-400">
                    No customer purchase orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 3. DISPATCH HISTORY */}
      <Card>
        <CardHeader
          title="Dispatch History"
          description="Recent dispatches recorded against customer orders. Deleting a record restores the pending order quantity."
        />
        <div className="overflow-x-auto p-4">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] uppercase text-slate-500 dark:bg-slate-900">
              <tr>
                <th className="px-3 py-2">Dispatch Date</th>
                <th className="px-3 py-2">Invoice No</th>
                <th className="px-3 py-2">Customer PO #</th>
                <th className="px-3 py-2">Material / Casting Item</th>
                <th className="px-3 py-2">Quantity</th>
                <th className="px-3 py-2">Total Weight</th>
                <th className="px-3 py-2">Remarks</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {history.map((dsp) => (
                <tr key={dsp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                    {dsp.dispatchDate}
                  </td>
                  <td className="px-3 py-2 font-mono font-semibold text-slate-900 dark:text-white">
                    {dsp.invoiceNo || '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                    {poNumberMap.get(dsp.customerPoId) ? `PO #${poNumberMap.get(dsp.customerPoId)}` : '—'}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">
                    {dsp.materialName}
                  </td>
                  <td className="px-3 py-2 tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                    {dsp.quantity} {dsp.unit}
                  </td>
                  <td className="px-3 py-2 tabular-nums font-mono text-slate-600 dark:text-slate-400">
                    {dsp.totalWeightKg ? `${formatNumber(dsp.totalWeightKg, 1)} kg` : '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{dsp.remarks || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
                      onClick={() => void handleDeleteDispatch(dsp)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Reverse
                    </Button>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-400">
                    No dispatches recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

