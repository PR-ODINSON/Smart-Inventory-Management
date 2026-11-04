import { FileUp, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Modal } from '../shared/Modal'
import { Button } from '../shared/Button'
import {
  formatParseFailureMessage,
  parsePoPdfFile,
  type ParsedPoHeader,
  type ParsedPoLine,
  type PoParseDebugInfo,
  MAX_PO_PDF_BYTES,
  type PoPdfFormat,
} from '../../lib/parsePoPdf'
import { formatKeywordInSigner } from '../../lib/poImport/detect'
import { matchCustomer, type CustomerMatchResult } from '../../lib/poImport/matchCustomer'
import {
  hasBlockingImportErrors,
  validatePoImport,
  type PoImportIssue,
} from '../../lib/poImportValidation'
import {
  matchMaterialId,
  saveImportedPurchaseOrder,
} from '../../services/poImportService'
import { upsertMaterial } from '../../services/inventoryService'
import { upsertCustomer } from '../../services/customerService'
import type { Customer } from '../../types/customer'
import type { Material } from '../../types/inventory'
import { formatNumber } from '../../utils/formatting'
import { useToast } from '../../contexts/ToastContext'

type Step = 'upload' | 'preview' | 'scanned'

export function PoPdfImportFlow({
  open,
  onClose,
  materials,
  customers,
  onCustomersChange,
  existingPoNumbers,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  materials: Material[]
  customers: Customer[]
  onCustomersChange: () => void | Promise<void>
  existingPoNumbers: string[]
  onSaved: () => void | Promise<void>
}) {
  const [step, setStep] = useState<Step>('upload')
  const [parsing, setParsing] = useState(false)
  const [header, setHeader] = useState<ParsedPoHeader | null>(null)
  const [lines, setLines] = useState<ParsedPoLine[]>([])
  const [materialOverrides, setMaterialOverrides] = useState<Map<string, string>>(new Map())
  const [createItemFor, setCreateItemFor] = useState<string | null>(null)
  const [createName, setCreateName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const [searchParams] = useSearchParams()
  const importDebug = searchParams.get('importDebug') === '1'
  const [parseFailure, setParseFailure] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<PoParseDebugInfo | null>(null)
  const [debugRows, setDebugRows] = useState<string[]>([])
  const [poFormat, setPoFormat] = useState<PoPdfFormat>('unknown')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [customerMatch, setCustomerMatch] = useState<CustomerMatchResult | null>(null)
  const [fuzzyConfirmed, setFuzzyConfirmed] = useState(false)
  const [showCreateCustomer, setShowCreateCustomer] = useState(false)

  const reset = useCallback(() => {
    setStep('upload')
    setHeader(null)
    setLines([])
    setMaterialOverrides(new Map())
    setCreateItemFor(null)
    setCreateName('')
    setParsing(false)
    setParseFailure(null)
    setDebugInfo(null)
    setDebugRows([])
    setPoFormat('unknown')
    setCustomerId(null)
    setCustomerMatch(null)
    setFuzzyConfirmed(false)
    setShowCreateCustomer(false)
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  const applyCustomerMatch = useCallback(
    (h: ParsedPoHeader) => {
      const m = matchCustomer(customers, {
        name: h.buyerName,
        gstin: h.buyerGstin || null,
      })
      setCustomerMatch(m)
      setFuzzyConfirmed(false)
      if (m.kind === 'gstin' || m.kind === 'name') {
        setCustomerId(m.customer?.id ?? null)
        setShowCreateCustomer(false)
      } else if (m.kind === 'fuzzy') {
        setCustomerId(null)
        setShowCreateCustomer(false)
      } else {
        setCustomerId(null)
        setShowCreateCustomer(true)
      }
    },
    [customers],
  )

  useEffect(() => {
    if (header) applyCustomerMatch(header)
  }, [header, applyCustomerMatch])

  const handleClose = () => {
    reset()
    onClose()
  }

  const processFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast('Only PDF files are allowed.', 'error')
      return
    }
    if (file.size > MAX_PO_PDF_BYTES) {
      toast('PDF must be 10 MB or smaller.', 'error')
      return
    }
    setParsing(true)
    try {
      const result = await parsePoPdfFile(file)
      if (result.scanned) {
        setStep('scanned')
        return
      }
      setDebugRows(result.layoutLines)
      if (result.debug) setDebugInfo(result.debug)
      if (result.lines.length === 0) {
        const msg = result.debug
          ? formatParseFailureMessage(result.debug)
          : 'No line items found in this PDF.'
        setParseFailure(msg)
        toast('No line items found in this PDF.', 'error')
        return
      }
      setParseFailure(null)
      setHeader(result.header)
      setLines(result.lines)
      setPoFormat(result.format)
      applyCustomerMatch(result.header)
      setStep('preview')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read PDF', 'error')
    } finally {
      setParsing(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const issues = useMemo((): PoImportIssue[] => {
    if (!header) return []
    return validatePoImport(header, lines, existingPoNumbers)
  }, [header, lines, existingPoNumbers])

  const rowIssues = (index: number) =>
    issues.filter((i) => i.lineIndex === index)

  const globalIssues = issues.filter((i) => i.lineIndex === undefined)

  const materialIdForLine = (line: ParsedPoLine): string | null => {
    const override = materialOverrides.get(line.itemCode)
    if (override) return override
    return matchMaterialId(line.itemCode, materials)
  }

  const missingMaterials = lines.filter((l) => !materialIdForLine(l))

  const updateLine = (index: number, patch: Partial<ParsedPoLine>) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l
        const next = { ...l, ...patch }
        if (patch.totalWeightKg != null || patch.quantityNos != null) {
          const kg = patch.totalWeightKg ?? l.totalWeightKg
          const nos = patch.quantityNos ?? l.quantityNos
          if (nos > 0) next.weightPerPieceKg = Math.round((kg / nos) * 1000) / 1000
        }
        return next
      }),
    )
  }

  const confirmCreateItem = async (line: ParsedPoLine) => {
    const id = line.itemCode.trim()
    const name = createName.trim() || line.itemName || id
    if (!id) {
      toast('Item code is required.', 'error')
      return
    }
    const now = new Date().toISOString()
    const material: Material = {
      id,
      name,
      category: 'Castings',
      unit: 'nos',
      packSize: 1,
      unitWeightKg: line.weightPerPieceKg,
      baseDailyConsumption: 0,
      avgLeadTimeDays: 5,
      maxLeadTimeDays: 10,
      supplierIds: [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }
    try {
      await upsertMaterial(material, true)
      setMaterialOverrides((m) => new Map(m).set(line.itemCode, id))
      setCreateItemFor(null)
      toast(`Item ${id} created.`, 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create item', 'error')
    }
  }

  const formatMismatch =
    header &&
    header.signerName &&
    poFormat !== 'unknown' &&
    !formatKeywordInSigner(poFormat, header.signerName)

  const customerBlocked =
    !header?.buyerName.trim() ||
    (customerMatch?.needsConfirmation && !fuzzyConfirmed && !customerId) ||
    (customerMatch?.kind === 'none' && !customerId && !showCreateCustomer)

  const confirmCreateCustomer = async () => {
    if (!header?.buyerName.trim()) return
    try {
      const row = await upsertCustomer(
        {
          name: header.buyerName.trim(),
          gstin: header.buyerGstin || undefined,
          vendorCode: header.vendorCode || undefined,
          active: true,
        },
        true,
      )
      setCustomerId(row.id)
      setShowCreateCustomer(false)
      toast('Customer created.', 'success')
      await onCustomersChange()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create customer', 'error')
    }
  }

  const confirmImport = async () => {
    if (!header || hasBlockingImportErrors(issues) || customerBlocked) return
    const map = new Map(materialOverrides)
    for (const line of lines) {
      const mid = materialIdForLine(line)
      if (mid) map.set(line.itemCode, mid)
    }
    try {
      await saveImportedPurchaseOrder({
        header,
        lines,
        materialIdByItemCode: map,
        customerId: customerId ?? undefined,
      })
      toast('Purchase order imported.', 'success')
      handleClose()
      await onSaved()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error')
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) void processFile(f)
  }

  return (
    <>
      <Modal
        open={open && step === 'upload'}
        onClose={handleClose}
        title="Import PO from PDF"
      >
        <div className="space-y-4 text-sm">
          <p className="text-slate-600 dark:text-slate-400">
            Drag and drop a text-based PDF (max 10 MB). Parsing runs in your browser; the file is
            not uploaded to a server.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void processFile(f)
            }}
          />
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-10 transition-colors ${
              dragOver
                ? 'border-brand bg-brand/5'
                : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <Upload className="mb-2 h-8 w-8 text-slate-400" />
            <span className="font-medium">Drop PDF here or click to browse</span>
            <span className="mt-1 text-xs text-slate-500">PDF only · 10 MB max</span>
          </div>
          {parsing && (
            <p className="text-center text-xs text-slate-500">Reading PDF…</p>
          )}
          {parseFailure && (
            <div className="space-y-2 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
              <pre className="whitespace-pre-wrap font-sans">{parseFailure}</pre>
              {debugInfo && (
                <Button
                  size="sm"
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      debugInfo.sampleRowsJson + '\n\n' + parseFailure,
                    )
                    toast('Debug info copied.', 'success')
                  }}
                >
                  Copy debug info
                </Button>
              )}
            </div>
          )}
          {importDebug && debugRows.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded border border-slate-200 p-2 font-mono text-[10px] dark:border-slate-700">
              {debugRows.map((row, i) => (
                <div key={i} className="border-b border-slate-100 py-0.5 dark:border-slate-800">
                  {i + 1}. {row}
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Modal open={open && step === 'scanned'} onClose={handleClose} title="Import PO from PDF">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          This PDF looks scanned. Enter manually or upload a text-based PDF.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>Close</Button>
          <Button onClick={() => setStep('upload')}>Try another file</Button>
        </div>
      </Modal>

      <Modal
        open={open && step === 'preview' && header != null}
        onClose={handleClose}
        title="Preview import"
        wide
      >
        {header && (
          <div className="space-y-4 text-sm">
            {globalIssues.map((issue, i) => (
              <p
                key={i}
                className={`rounded px-2 py-1 text-xs ${
                  issue.level === 'error'
                    ? 'border border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100'
                    : 'border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100'
                }`}
              >
                {issue.message}
              </p>
            ))}

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-500">PO number</span>
                <input
                  className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                  value={header.poNumber}
                  onChange={(e) => setHeader({ ...header, poNumber: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-500">PO date</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                  value={header.poDate}
                  onChange={(e) => setHeader({ ...header, poDate: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Vendor code</span>
                <input
                  className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                  value={header.vendorCode}
                  onChange={(e) => setHeader({ ...header, vendorCode: e.target.value })}
                />
              </label>
            </div>
            {formatMismatch && (
              <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                Customer name and detected format differ. Please check.
              </p>
            )}
            <label className="block">
              <span className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                Customer
                {header.signerSource === 'signature' && (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-normal text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                    Read from signing block
                  </span>
                )}
                {header.signerSource === 'letterhead' && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-normal text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    Read from letterhead
                  </span>
                )}
              </span>
              <input
                required
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                value={header.buyerName}
                onChange={(e) => {
                  const next = { ...header, buyerName: e.target.value }
                  setHeader(next)
                  applyCustomerMatch(next)
                }}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Customer GSTIN</span>
              <input
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
                value={header.buyerGstin}
                onChange={(e) => {
                  const next = { ...header, buyerGstin: e.target.value }
                  setHeader(next)
                  applyCustomerMatch(next)
                }}
              />
            </label>
            {customerMatch?.kind === 'fuzzy' && customerMatch.customer && !fuzzyConfirmed && (
              <div className="flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-2 text-xs dark:border-amber-900 dark:bg-amber-950">
                <span>Is this {customerMatch.customer.name}?</span>
                <Button
                  size="sm"
                  onClick={() => {
                    setCustomerId(customerMatch.customer!.id)
                    setFuzzyConfirmed(true)
                  }}
                >
                  Yes, use this customer
                </Button>
              </div>
            )}
            {showCreateCustomer && !customerId && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => void confirmCreateCustomer()}>
                  Create customer
                </Button>
                <span className="text-xs text-slate-500">
                  Pre-fills name, GSTIN and vendor code from the PDF.
                </span>
              </div>
            )}
            {customerId && (
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                Linked to customer {customerId}
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="border-b border-slate-100 text-slate-500 dark:border-slate-800">
                  <tr>
                    <th className="px-1 py-1">Item code</th>
                    <th className="px-1 py-1">Item name</th>
                    <th className="px-1 py-1 text-right">Nos</th>
                    <th className="px-1 py-1 text-right">Total kg</th>
                    <th className="px-1 py-1 text-right">kg/pc</th>
                    <th className="px-1 py-1 text-right">Rate</th>
                    <th className="px-1 py-1 text-right">Amount</th>
                    <th className="px-1 py-1">Delivery</th>
                    <th className="px-1 py-1">Indent</th>
                    <th className="px-1 py-1">WO</th>
                    <th className="px-1 py-1">SO</th>
                    <th className="px-1 py-1">Master</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => {
                    const rowWarn = rowIssues(i)
                    const rowHasError = rowWarn.some((w) => w.level === 'error')
                    const matId = materialIdForLine(line)
                    return (
                      <tr
                        key={i}
                        className={`border-b border-slate-50 align-top dark:border-slate-800 ${
                          rowHasError
                            ? 'bg-red-50/50 dark:bg-red-950/20'
                            : rowWarn.length
                              ? 'bg-amber-50/50 dark:bg-amber-950/20'
                              : ''
                        }`}
                      >
                        <td className="px-1 py-1 font-mono">{line.itemCode}</td>
                        <td className="px-1 py-1">
                          <input
                            className="w-full min-w-[120px] rounded border border-slate-200 px-1 py-0.5 dark:border-slate-700 dark:bg-slate-900"
                            value={line.itemName}
                            onChange={(e) => updateLine(i, { itemName: e.target.value })}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            className="w-16 rounded border border-slate-200 px-1 py-0.5 text-right dark:border-slate-700 dark:bg-slate-900"
                            value={line.quantityNos}
                            onChange={(e) =>
                              updateLine(i, { quantityNos: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            className="w-20 rounded border border-slate-200 px-1 py-0.5 text-right dark:border-slate-700 dark:bg-slate-900"
                            value={line.totalWeightKg}
                            onChange={(e) =>
                              updateLine(i, { totalWeightKg: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </td>
                        <td className="px-1 py-1 text-right">{formatNumber(line.weightPerPieceKg, 3)}</td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            className="w-16 rounded border border-slate-200 px-1 py-0.5 text-right dark:border-slate-700 dark:bg-slate-900"
                            value={line.rate}
                            onChange={(e) =>
                              updateLine(i, { rate: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            className="w-20 rounded border border-slate-200 px-1 py-0.5 text-right dark:border-slate-700 dark:bg-slate-900"
                            value={line.amount}
                            onChange={(e) =>
                              updateLine(i, { amount: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="date"
                            className="w-[7.5rem] rounded border border-slate-200 px-1 py-0.5 dark:border-slate-700 dark:bg-slate-900"
                            value={line.deliveryDate}
                            onChange={(e) => updateLine(i, { deliveryDate: e.target.value })}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            className="w-24 rounded border border-slate-200 px-1 py-0.5 dark:border-slate-700 dark:bg-slate-900"
                            value={line.indentNo}
                            onChange={(e) => updateLine(i, { indentNo: e.target.value })}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            className="w-24 rounded border border-slate-200 px-1 py-0.5 dark:border-slate-700 dark:bg-slate-900"
                            value={line.workOrderNo}
                            onChange={(e) => updateLine(i, { workOrderNo: e.target.value })}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            className="w-20 rounded border border-slate-200 px-1 py-0.5 dark:border-slate-700 dark:bg-slate-900"
                            value={line.salesOrderNo}
                            onChange={(e) => updateLine(i, { salesOrderNo: e.target.value })}
                          />
                        </td>
                        <td className="px-1 py-1">
                          {matId ? (
                            <span className="text-emerald-700 dark:text-emerald-400">{matId}</span>
                          ) : createItemFor === line.itemCode ? (
                            <div className="space-y-1">
                              <input
                                className="w-full rounded border border-slate-200 px-1 py-0.5 dark:border-slate-700 dark:bg-slate-900"
                                placeholder="Item name"
                                value={createName}
                                onChange={(e) => setCreateName(e.target.value)}
                              />
                              <div className="flex gap-1">
                                <Button size="sm" onClick={() => void confirmCreateItem(line)}>
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setCreateItemFor(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setCreateItemFor(line.itemCode)
                                setCreateName(line.itemName || line.itemCode)
                              }}
                            >
                              Create item
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {missingMaterials.length > 0 && (
              <p className="text-xs text-amber-800 dark:text-amber-200">
                {missingMaterials.length} line(s) have no material match — create items or import
                will save lines without a material link.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={() => void confirmImport()}
                disabled={
                  hasBlockingImportErrors(issues) ||
                  lines.length === 0 ||
                  customerBlocked
                }
              >
                <FileUp className="h-4 w-4" />
                Confirm import
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
