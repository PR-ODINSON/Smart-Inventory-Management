import { useState, useRef, useEffect } from 'react'
import { FileUp, AlertTriangle, CheckCircle, Plus, Trash2 } from 'lucide-react'
import { Modal } from '../shared/Modal'
import { Button } from '../shared/Button'
import { useToast } from '../../contexts/ToastContext'
import type { Material, Supplier } from '../../types/inventory'
import {
  parseSupplierBillFile,
  MAX_SUPPLIER_BILL_BYTES,
} from '../../lib/supplierInvoice/parseSupplierInvoice'
import { matchSupplier } from '../../lib/supplierInvoice/matchSupplier'
import {
  checkDuplicateMaterialReceipt,
  recordMaterialReceipt,
} from '../../services/productionPlanService'

interface EditableReceiptLine {
  id: string
  description: string
  materialId: string
  billedQty: number
  receivedQty: number
  unit: string
  rate: number
  amount: number
  matchedName?: string
  confidence?: 'exact' | 'fuzzy' | 'unmatched'
}

export function ReceiveMaterialModal({
  open,
  onClose,
  materials,
  suppliers,
  onReceiptCompleted,
}: {
  open: boolean
  onClose: () => void
  materials: Material[]
  suppliers: Supplier[]
  onReceiptCompleted?: () => void
}) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [parsing, setParsing] = useState(false)
  const [supplierName, setSupplierName] = useState('')
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [lines, setLines] = useState<EditableReceiptLine[]>([])
  const [isDuplicate, setIsDuplicate] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset when opening
  useEffect(() => {
    if (open) {
      setSupplierName('')
      setSelectedSupplierId('')
      setInvoiceNumber('')
      setInvoiceDate(new Date().toISOString().split('T')[0])
      setLines([])
      setIsDuplicate(false)
      setIsSubmitting(false)
    }
  }, [open])

  // Duplicate invoice check
  useEffect(() => {
    if (supplierName.trim() && invoiceNumber.trim()) {
      void checkDuplicateMaterialReceipt(supplierName, invoiceNumber).then(setIsDuplicate)
    } else {
      setIsDuplicate(false)
    }
  }, [supplierName, invoiceNumber])

  // Try matching line item to material catalog
  const matchMaterialForLine = (desc: string): { materialId: string; confidence: 'exact' | 'fuzzy' | 'unmatched' } => {
    const cleanDesc = desc.toLowerCase().trim()
    if (!cleanDesc) return { materialId: materials[0]?.id || '', confidence: 'unmatched' }

    // Exact match
    const exact = materials.find((m) => m.name.toLowerCase() === cleanDesc)
    if (exact) return { materialId: exact.id, confidence: 'exact' }

    // Substring / keyword fuzzy match
    const fuzzy = materials.find(
      (m) => cleanDesc.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(cleanDesc),
    )
    if (fuzzy) return { materialId: fuzzy.id, confidence: 'fuzzy' }

    return { materialId: materials[0]?.id || '', confidence: 'unmatched' }
  }

  const handleFileUpload = async (file: File) => {
    if (file.size > MAX_SUPPLIER_BILL_BYTES) {
      toast('File is larger than the 15 MB limit.', 'error')
      return
    }

    setParsing(true)
    try {
      const parsed = await parseSupplierBillFile(file)
      const party = parsed.supplier

      // Supplier match
      const matched = matchSupplier(suppliers, party)
      if (matched.kind !== 'none' && matched.supplier) {
        setSelectedSupplierId(matched.supplier.id)
        setSupplierName(matched.supplier.companyName)
      } else {
        setSupplierName(party.companyName || file.name.replace(/\.[^/.]+$/, ''))
      }

      setInvoiceNumber(parsed.header.invoiceNumber || `INV-${Date.now().toString().slice(-4)}`)
      if (parsed.header.invoiceDate) {
        setInvoiceDate(parsed.header.invoiceDate)
      }

      const receiptLines: EditableReceiptLine[] = parsed.lines.map((l, idx) => {
        const match = matchMaterialForLine(l.description)
        const matchedMat = materials.find((m) => m.id === match.materialId)
        return {
          id: `line-${idx}-${Date.now()}`,
          description: l.description,
          materialId: match.materialId,
          billedQty: l.quantity,
          receivedQty: l.quantity, // Default received = billed
          unit: l.unit || matchedMat?.unit || 'kg',
          rate: l.rate,
          amount: l.taxableAmount,
          matchedName: matchedMat?.name,
          confidence: match.confidence,
        }
      })

      if (receiptLines.length === 0) {
        // Fallback line so user can enter manually
        receiptLines.push({
          id: `line-${Date.now()}`,
          description: 'Material from invoice',
          materialId: materials[0]?.id || '',
          billedQty: 100,
          receivedQty: 100,
          unit: materials[0]?.unit || 'kg',
          rate: 0,
          amount: 0,
          confidence: 'unmatched',
        })
      }

      setLines(receiptLines)
      toast('Bill parsed successfully. Please verify quantities and material matches.', 'success')
    } catch (err) {
      console.error(err)
      toast('Could not auto-extract all fields from PDF. You can enter lines manually.', 'error')
      // Provide an empty line for manual entry
      setLines([
        {
          id: `line-${Date.now()}`,
          description: 'Manual entry line',
          materialId: materials[0]?.id || '',
          billedQty: 0,
          receivedQty: 0,
          unit: materials[0]?.unit || 'kg',
          rate: 0,
          amount: 0,
          confidence: 'unmatched',
        },
      ])
    } finally {
      setParsing(false)
    }
  }

  const addLine = () => {
    setLines([
      ...lines,
      {
        id: `line-${Date.now()}-${lines.length}`,
        description: '',
        materialId: materials[0]?.id || '',
        billedQty: 0,
        receivedQty: 0,
        unit: materials[0]?.unit || 'kg',
        rate: 0,
        amount: 0,
        confidence: 'unmatched',
      },
    ])
  }

  const removeLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index))
  }

  const updateLine = (index: number, patch: Partial<EditableReceiptLine>) => {
    setLines(
      lines.map((l, i) => {
        if (i !== index) return l
        const updated = { ...l, ...patch }
        if (patch.materialId) {
          const mat = materials.find((m) => m.id === patch.materialId)
          if (mat) {
            updated.matchedName = mat.name
            updated.unit = mat.unit
            updated.confidence = 'exact'
          }
        }
        return updated
      }),
    )
  }

  const handleConfirmAndAddStock = async () => {
    if (!supplierName.trim()) {
      toast('Please enter or select a supplier name.', 'error')
      return
    }
    if (!invoiceNumber.trim()) {
      toast('Please enter an invoice number.', 'error')
      return
    }
    if (lines.length === 0) {
      toast('Please add at least one line item.', 'error')
      return
    }
    if (isDuplicate) {
      toast('This invoice has already been recorded. Duplicate entries are blocked.', 'error')
      return
    }

    setIsSubmitting(true)
    try {
      // Record receipt for each line
      for (const line of lines) {
        if (!line.materialId) continue
        await recordMaterialReceipt({
          supplierId: selectedSupplierId || undefined,
          supplierName: supplierName.trim(),
          invoiceNumber: invoiceNumber.trim(),
          invoiceDate,
          materialId: line.materialId,
          billedQty: line.billedQty,
          receivedQty: line.receivedQty,
          unit: line.unit,
          rate: line.rate,
          amount: line.amount,
          remarks: `Matched: ${line.description}`,
        })
      }

      toast('Material receipt saved! Available stock and dashboard updated.', 'success')
      onReceiptCompleted?.()
      onClose()
    } catch (err) {
      console.error(err)
      toast(err instanceof Error ? err.message : 'Failed to record receipt.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Upload Bill & Receive Material" wide>
      <div className="space-y-4 text-sm">
        {/* Upload Button Area */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-lg border-2 border-dashed border-slate-300 p-4 dark:border-slate-700">
          <div>
            <p className="font-medium text-slate-800 dark:text-slate-200">
              Upload Received Supplier Bill / Invoice (PDF)
            </p>
            <p className="text-xs text-slate-500">
              System will extract supplier, invoice number, items, and quantities for verification before adding stock.
            </p>
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFileUpload(file)
              }}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={parsing}
              onClick={() => fileRef.current?.click()}
            >
              <FileUp className="h-4 w-4 mr-1.5" />
              {parsing ? 'Parsing PDF...' : 'Select PDF Bill'}
            </Button>
          </div>
        </div>

        {/* Invoice Header Details */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Supplier Name *</label>
            <input
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={supplierName}
              placeholder="e.g. Tata Metaliks Ltd"
              onChange={(e) => setSupplierName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Invoice Number *</label>
            <input
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={invoiceNumber}
              placeholder="e.g. TM/2026/9041"
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Invoice Date</label>
            <input
              type="date"
              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </div>
        </div>

        {/* Duplicate Warning */}
        {isDuplicate && (
          <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <span>
              <strong>Duplicate blocked:</strong> This invoice has already been recorded for {supplierName}. The same invoice cannot be added twice.
            </span>
          </div>
        )}

        {/* Line Items Table with Matching and Qty verification */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Verify Invoice Items & Received Stock Quantities
            </span>
            <Button size="sm" variant="secondary" onClick={addLine}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Line
            </Button>
          </div>

          <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="px-2.5 py-2">Invoice Description</th>
                  <th className="px-2.5 py-2">Match to Inventory Material *</th>
                  <th className="px-2.5 py-2">Billed Qty</th>
                  <th className="px-2.5 py-2">Received Qty *</th>
                  <th className="px-2.5 py-2">Unit</th>
                  <th className="px-2.5 py-2">Match Status</th>
                  <th className="px-2.5 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {lines.map((line, idx) => {
                  const qtyMismatch = line.billedQty !== line.receivedQty
                  return (
                    <tr key={line.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <td className="px-2.5 py-2">
                        <input
                          className="w-44 rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                          value={line.description}
                          placeholder="Particulars on bill"
                          onChange={(e) => updateLine(idx, { description: e.target.value })}
                        />
                      </td>
                      <td className="px-2.5 py-2">
                        <select
                          className="w-48 rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                          value={line.materialId}
                          onChange={(e) => updateLine(idx, { materialId: e.target.value })}
                        >
                          {materials.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.unit})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2.5 py-2">
                        <input
                          type="number"
                          className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                          value={line.billedQty}
                          onChange={(e) =>
                            updateLine(idx, { billedQty: parseFloat(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td className="px-2.5 py-2">
                        <input
                          type="number"
                          className={`w-20 rounded border px-2 py-1 text-xs ${
                            qtyMismatch
                              ? 'border-amber-400 bg-amber-50 font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                              : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
                          }`}
                          value={line.receivedQty}
                          onChange={(e) =>
                            updateLine(idx, { receivedQty: parseFloat(e.target.value) || 0 })
                          }
                        />
                        {qtyMismatch && (
                          <span className="block text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                            Diff: {line.receivedQty - line.billedQty}
                          </span>
                        )}
                      </td>
                      <td className="px-2.5 py-2 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        {line.unit}
                      </td>
                      <td className="px-2.5 py-2">
                        {line.confidence === 'exact' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                            <CheckCircle className="h-3 w-3" /> Exact match
                          </span>
                        ) : line.confidence === 'fuzzy' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" /> Fuzzy match
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                            Manual / verify
                          </span>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-right">
                        <button
                          type="button"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => removeLine(idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-slate-400">
                      No items added yet. Click &quot;Select PDF Bill&quot; or &quot;Add Line&quot;.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded bg-slate-50 p-2.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          <strong>Important note:</strong> Clicking &quot;Confirm and Add to Stock&quot; will create a Material Receipt record and add <em>ONLY the accepted Received Quantity</em> to the inventory balance. Billed quantity is kept for financial auditing.
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={isDuplicate || lines.length === 0 || isSubmitting}
            onClick={() => void handleConfirmAndAddStock()}
          >
            {isSubmitting ? 'Updating Stock...' : 'Confirm and Add to Stock'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
