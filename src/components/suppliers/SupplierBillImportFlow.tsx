import { FileUp, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../shared/Modal'
import { Button } from '../shared/Button'
import type { Supplier } from '../../types/inventory'
import {
  emptyParseSupplierInvoiceResult,
  parseSupplierBillFile,
  type ParsedSupplierInvoiceHeader,
  type ParsedSupplierInvoiceLine,
  type ParsedSupplierInvoiceTotals,
  type ParsedSupplierParty,
  MAX_SUPPLIER_BILL_BYTES,
} from '../../lib/supplierInvoice/parseSupplierInvoice'
import { matchSupplier, type SupplierMatchResult } from '../../lib/supplierInvoice/matchSupplier'
import {
  hasBlockingSupplierInvoiceErrors,
  validateSupplierInvoiceImport,
  type SupplierInvoiceImportIssue,
} from '../../lib/supplierInvoiceValidation'
import {
  checkDuplicateSupplierInvoice,
  createSupplierFromExtract,
  mergeSupplierMasterFromExtract,
  saveImportedSupplierInvoice,
} from '../../services/supplierInvoiceImportService'
import type { SupplierInvoiceImportSource } from '../../types/supplierInvoice'
import { formatNumber } from '../../utils/formatting'
import { useToast } from '../../contexts/ToastContext'

type Step = 'upload' | 'preview' | 'scanned'

const inputClass =
  'w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900'

function newLineNo(lines: ParsedSupplierInvoiceLine[]): number {
  return lines.length === 0 ? 1 : Math.max(...lines.map((l) => l.lineNo)) + 1
}

function emptyLine(lineNo: number): ParsedSupplierInvoiceLine {
  return {
    lineNo,
    description: '',
    itemCode: '',
    hsnSac: '',
    quantity: 0,
    unit: 'NOS',
    rate: 0,
    taxableAmount: 0,
    cgstRate: null,
    cgstAmount: null,
    sgstRate: null,
    sgstAmount: null,
    igstRate: null,
    igstAmount: null,
    lineTotal: null,
  }
}

export function SupplierBillImportFlow({
  open,
  onClose,
  suppliers,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  suppliers: Supplier[]
  onSaved: () => void | Promise<void>
}) {
  const [step, setStep] = useState<Step>('upload')
  const [parsing, setParsing] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [supplier, setSupplier] = useState<ParsedSupplierParty>(
    emptyParseSupplierInvoiceResult().supplier,
  )
  const [header, setHeader] = useState<ParsedSupplierInvoiceHeader>(
    emptyParseSupplierInvoiceResult().header,
  )
  const [lines, setLines] = useState<ParsedSupplierInvoiceLine[]>([])
  const [totals, setTotals] = useState<ParsedSupplierInvoiceTotals>(
    emptyParseSupplierInvoiceResult().totals,
  )
  const [warnings, setWarnings] = useState<string[]>([])
  const [supplierId, setSupplierId] = useState<string | null>(null)
  const [supplierMatch, setSupplierMatch] = useState<SupplierMatchResult | null>(null)
  const [fuzzyConfirmed, setFuzzyConfirmed] = useState(false)
  const [createNewSupplier, setCreateNewSupplier] = useState(false)
  const [updateMaster, setUpdateMaster] = useState(false)
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const [duplicatePending, setDuplicatePending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const reset = useCallback(() => {
    setStep('upload')
    setParsing(false)
    setSelectedFile(null)
    const empty = emptyParseSupplierInvoiceResult()
    setSupplier(empty.supplier)
    setHeader(empty.header)
    setLines(empty.lines)
    setTotals(empty.totals)
    setWarnings([])
    setSupplierId(null)
    setSupplierMatch(null)
    setFuzzyConfirmed(false)
    setCreateNewSupplier(false)
    setUpdateMaster(false)
    setAllowDuplicate(false)
    setDuplicatePending(false)
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  const applySupplierMatch = useCallback(
    (party: ParsedSupplierParty) => {
      const m = matchSupplier(suppliers, {
        companyName: party.companyName,
        gstin: party.gstin || null,
      })
      setSupplierMatch(m)
      setFuzzyConfirmed(false)
      if (m.kind === 'gstin' || m.kind === 'name') {
        setSupplierId(m.supplier?.id ?? null)
        setCreateNewSupplier(false)
      } else if (m.kind === 'fuzzy') {
        setSupplierId(null)
        setCreateNewSupplier(false)
      } else {
        setSupplierId(null)
        setCreateNewSupplier(true)
      }
    },
    [suppliers],
  )

  useEffect(() => {
    if (step === 'preview') applySupplierMatch(supplier)
  }, [supplier.companyName, supplier.gstin, step, applySupplierMatch])

  const handleClose = () => {
    reset()
    onClose()
  }

  const acceptFile = (file: File) => {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const isImage =
      /^image\/(jpeg|jpg|png)$/i.test(file.type) ||
      /\.(jpe?g|png)$/i.test(file.name)
    if (!isPdf && !isImage) {
      toast('Supported formats: PDF, JPG, JPEG, PNG.', 'error')
      return
    }
    if (file.size > MAX_SUPPLIER_BILL_BYTES) {
      toast('File must be 10 MB or smaller.', 'error')
      return
    }
    setSelectedFile(file)
    setWarnings([])
  }

  const runExtraction = async () => {
    if (!selectedFile) return
    setParsing(true)
    try {
      const result = await parseSupplierBillFile(selectedFile)
      setWarnings(result.warnings)
      if (result.scanned && result.lines.length === 0 && !result.header.invoiceNumber) {
        setStep('scanned')
        setSupplier(result.supplier)
        setHeader(result.header)
        setLines(result.lines)
        setTotals(result.totals)
        return
      }
      setSupplier(result.supplier)
      setHeader(result.header)
      setLines(result.lines)
      setTotals(result.totals)
      applySupplierMatch(result.supplier)
      setStep('preview')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read file', 'error')
    } finally {
      setParsing(false)
    }
  }

  const continueManualFromScanned = () => {
    setStep('preview')
    setCreateNewSupplier(supplierMatch?.kind === 'none')
  }

  const issues = useMemo((): SupplierInvoiceImportIssue[] => {
    const dup =
      supplierId != null &&
      header.invoiceNumber.trim() &&
      duplicatePending
    return validateSupplierInvoiceImport(
      supplier,
      header,
      lines,
      totals,
      Boolean(dup),
    )
  }, [supplier, header, lines, totals, supplierId, duplicatePending])

  useEffect(() => {
    if (!supplierId || !header.invoiceNumber.trim()) {
      setDuplicatePending(false)
      return
    }
    void checkDuplicateSupplierInvoice(supplierId, header.invoiceNumber).then(setDuplicatePending)
  }, [supplierId, header.invoiceNumber])

  const supplierBlocked =
    !supplier.companyName.trim() ||
    (supplierMatch?.needsConfirmation && !fuzzyConfirmed && !supplierId) ||
    (supplierMatch?.kind === 'none' && !supplierId && !createNewSupplier)

  const updateLine = (index: number, patch: Partial<ParsedSupplierInvoiceLine>) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l
        const next = { ...l, ...patch }
        if (patch.quantity != null || patch.rate != null) {
          const qty = patch.quantity ?? l.quantity
          const rate = patch.rate ?? l.rate
          if (qty > 0 && rate > 0 && patch.taxableAmount === undefined) {
            next.taxableAmount = Math.round(qty * rate * 100) / 100
          }
        }
        return next
      }),
    )
  }

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const addLine = () => {
    setLines((prev) => [...prev, emptyLine(newLineNo(prev))])
  }

  const resolveSource = (): SupplierInvoiceImportSource => {
    if (!selectedFile) return 'manual'
    if (/^image\//i.test(selectedFile.type) || /\.(jpe?g|png)$/i.test(selectedFile.name)) {
      return 'image_import'
    }
    return 'pdf_import'
  }

  const confirmSave = async () => {
    if (hasBlockingSupplierInvoiceErrors(issues) || supplierBlocked) return
    if (duplicatePending && !allowDuplicate) {
      toast('Duplicate invoice detected — check the confirmation box to proceed.', 'error')
      return
    }
    try {
      let sid = supplierId
      if (!sid && createNewSupplier) {
        const created = await createSupplierFromExtract(supplier)
        sid = created.id
      }
      if (!sid) {
        toast('Select or create a supplier.', 'error')
        return
      }
      if (updateMaster && sid) {
        await mergeSupplierMasterFromExtract(sid, supplier, true)
      }
      await saveImportedSupplierInvoice({
        supplierId: sid,
        header,
        lines,
        totals,
        source: resolveSource(),
        sourceFileName: selectedFile?.name,
        extractionWarnings: warnings.length > 0 ? warnings : undefined,
        allowDuplicate,
      })
      toast('Supplier invoice saved. Stock was not updated.', 'success')
      handleClose()
      await onSaved()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error')
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) acceptFile(f)
  }

  return (
    <>
      <Modal open={open && step === 'upload'} onClose={handleClose} title="Upload supplier bill">
        <div className="space-y-4 text-sm">
          <p className="text-slate-600 dark:text-slate-400">
            Upload a tax invoice (PDF preferred). Parsing runs in your browser; files are not sent
            to a server. Scanned PDFs and images require manual entry.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) acceptFile(f)
            }}
          />
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 px-4 py-8 dark:border-slate-700"
          >
            <Upload className="mb-2 h-8 w-8 text-slate-400" />
            <span className="font-medium">Drop file here or click to browse</span>
            <span className="mt-1 text-xs text-slate-500">PDF · JPG · PNG · 10 MB max</span>
          </div>
          {selectedFile && (
            <div className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 dark:border-slate-700">
              <span className="flex items-center gap-2 truncate">
                <FileUp className="h-4 w-4 shrink-0 text-slate-400" />
                {selectedFile.name}
              </span>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-800"
                onClick={() => setSelectedFile(null)}
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button
              disabled={!selectedFile || parsing}
              onClick={() => void runExtraction()}
            >
              {parsing ? 'Extracting…' : 'Extract invoice details'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={open && step === 'scanned'} onClose={handleClose} title="Upload supplier bill">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          This document could not be read as text (scanned PDF or image). OCR is not available in
          this app. You can enter invoice details manually on the review screen.
        </p>
        {warnings.length > 0 && (
          <ul className="mt-3 list-disc pl-5 text-xs text-amber-800 dark:text-amber-200">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>Close</Button>
          <Button variant="secondary" onClick={() => setStep('upload')}>Try another file</Button>
          <Button onClick={continueManualFromScanned}>Enter manually</Button>
        </div>
      </Modal>

      <Modal
        open={open && step === 'preview'}
        onClose={handleClose}
        title="Review supplier invoice"
        wide
      >
        <div className="space-y-4 text-sm">
          {warnings.map((w, i) => (
            <p
              key={`w-${i}`}
              className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
            >
              {w}
            </p>
          ))}
          {issues.map((issue, i) => (
            <p
              key={`i-${i}`}
              className={`rounded px-2 py-1 text-xs ${
                issue.level === 'error'
                  ? 'border border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950'
                  : 'border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950'
              }`}
            >
              {issue.message}
            </p>
          ))}

          <section>
            <h3 className="mb-2 font-medium">Supplier</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-slate-500">Company name</span>
                <input
                  className={inputClass}
                  value={supplier.companyName}
                  onChange={(e) => setSupplier({ ...supplier, companyName: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">GSTIN</span>
                <input
                  className={inputClass}
                  value={supplier.gstin}
                  onChange={(e) => setSupplier({ ...supplier, gstin: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Contact person</span>
                <input
                  className={inputClass}
                  value={supplier.contactPerson}
                  onChange={(e) => setSupplier({ ...supplier, contactPerson: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Phone</span>
                <input
                  className={inputClass}
                  value={supplier.phone}
                  onChange={(e) => setSupplier({ ...supplier, phone: e.target.value })}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-slate-500">Email</span>
                <input
                  className={inputClass}
                  value={supplier.email}
                  onChange={(e) => setSupplier({ ...supplier, email: e.target.value })}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-slate-500">Address</span>
                <input
                  className={inputClass}
                  value={supplier.address}
                  onChange={(e) => setSupplier({ ...supplier, address: e.target.value })}
                />
              </label>
            </div>

            {supplierMatch && supplierMatch.kind !== 'none' && supplierMatch.supplier && (
              <div className="mt-3 rounded border border-slate-200 p-3 text-xs dark:border-slate-700">
                <p className="font-medium">Existing supplier match ({supplierMatch.kind})</p>
                <p>{supplierMatch.supplier.companyName}</p>
                {supplierMatch.supplier.gstin && (
                  <p className="text-slate-500">GSTIN: {supplierMatch.supplier.gstin}</p>
                )}
                {supplierMatch.needsConfirmation && (
                  <label className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={fuzzyConfirmed}
                      onChange={(e) => {
                        setFuzzyConfirmed(e.target.checked)
                        if (e.target.checked) setSupplierId(supplierMatch.supplier!.id)
                      }}
                    />
                    Use this supplier
                  </label>
                )}
                {!supplierMatch.needsConfirmation && (
                  <Button
                    size="sm"
                    className="mt-2"
                    variant="secondary"
                    type="button"
                    onClick={() => setSupplierId(supplierMatch.supplier!.id)}
                  >
                    Use existing supplier
                  </Button>
                )}
                <label className="mt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={updateMaster}
                    onChange={(e) => setUpdateMaster(e.target.checked)}
                  />
                  Update supplier master from extracted fields
                </label>
              </div>
            )}
            {supplierMatch?.kind === 'none' && (
              <label className="mt-2 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={createNewSupplier}
                  onChange={(e) => setCreateNewSupplier(e.target.checked)}
                />
                Create new supplier from extracted details
              </label>
            )}
          </section>

          <section>
            <h3 className="mb-2 font-medium">Invoice</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-slate-500">Invoice number</span>
                <input
                  className={inputClass}
                  value={header.invoiceNumber}
                  onChange={(e) => setHeader({ ...header, invoiceNumber: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Invoice date</span>
                <input
                  className={inputClass}
                  value={header.invoiceDate}
                  onChange={(e) => setHeader({ ...header, invoiceDate: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Challan no.</span>
                <input
                  className={inputClass}
                  value={header.challanNumber}
                  onChange={(e) => setHeader({ ...header, challanNumber: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">PO reference</span>
                <input
                  className={inputClass}
                  value={header.purchaseOrderRef}
                  onChange={(e) => setHeader({ ...header, purchaseOrderRef: e.target.value })}
                />
              </label>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium">Line items</h3>
              <Button size="sm" variant="secondary" type="button" onClick={addLine}>
                Add line
              </Button>
            </div>
            <div className="max-h-64 overflow-auto">
              <table className="min-w-full text-xs">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-1 pr-2">#</th>
                    <th className="py-1 pr-2">Code</th>
                    <th className="py-1 pr-2">Particulars</th>
                    <th className="py-1 pr-2">HSN</th>
                    <th className="py-1 pr-2">Qty</th>
                    <th className="py-1 pr-2">Unit</th>
                    <th className="py-1 pr-2">Rate</th>
                    <th className="py-1 pr-2">Taxable</th>
                    <th className="py-1" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-1 pr-2">{line.lineNo}</td>
                      <td className="py-1 pr-2">
                        <input
                          className={`${inputClass} w-24 font-mono text-[11px]`}
                          value={line.itemCode}
                          onChange={(e) => updateLine(i, { itemCode: e.target.value })}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          className={inputClass}
                          value={line.description}
                          onChange={(e) => updateLine(i, { description: e.target.value })}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          className={`${inputClass} w-20`}
                          value={line.hsnSac}
                          onChange={(e) => updateLine(i, { hsnSac: e.target.value })}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          className={`${inputClass} w-16`}
                          type="number"
                          value={line.quantity || ''}
                          onChange={(e) =>
                            updateLine(i, { quantity: parseFloat(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          className={`${inputClass} w-14`}
                          value={line.unit}
                          onChange={(e) => updateLine(i, { unit: e.target.value })}
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          className={`${inputClass} w-20`}
                          type="number"
                          value={line.rate || ''}
                          onChange={(e) =>
                            updateLine(i, { rate: parseFloat(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          className={`${inputClass} w-24`}
                          type="number"
                          value={line.taxableAmount || ''}
                          onChange={(e) =>
                            updateLine(i, {
                              taxableAmount: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </td>
                      <td className="py-1">
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          onClick={() => removeLine(i)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-medium">Totals</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ['taxableValue', 'Taxable value'],
                  ['cgst', 'CGST'],
                  ['sgst', 'SGST'],
                  ['igst', 'IGST'],
                  ['grandTotal', 'Grand total'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-xs text-slate-500">{label}</span>
                  <input
                    className={inputClass}
                    type="number"
                    value={totals[key] ?? ''}
                    onChange={(e) =>
                      setTotals({
                        ...totals,
                        [key]: e.target.value === '' ? null : parseFloat(e.target.value),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </section>

          {duplicatePending && (
            <label className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-100">
              <input
                type="checkbox"
                checked={allowDuplicate}
                onChange={(e) => setAllowDuplicate(e.target.checked)}
              />
              This invoice number already exists for this supplier — save anyway
            </label>
          )}

          <p className="text-xs text-slate-500">
            Saving records the invoice only. Inventory stock is not increased until goods are
            received through the normal receipt workflow.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button
              disabled={hasBlockingSupplierInvoiceErrors(issues) || supplierBlocked}
              onClick={() => void confirmSave()}
            >
              Confirm and save
            </Button>
          </div>
          {totals.grandTotal != null && (
            <p className="text-right text-xs text-slate-500">
              Invoice total: {formatNumber(totals.grandTotal, 2)}
            </p>
          )}
        </div>
      </Modal>
    </>
  )
}
