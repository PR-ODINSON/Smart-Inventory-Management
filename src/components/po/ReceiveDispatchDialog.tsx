import { useEffect, useState } from 'react'
import { Button } from '../shared/Button'
import type { PurchaseOrder, PurchaseOrderLine } from '../../types/purchasing'
import { isCustomerPo } from '../../types/purchasing'
import { outstandingDispatchNos, outstandingQty } from '../../services/purchaseOrderService'

export type ReceiveDispatchMode = 'receive' | 'dispatch'

export interface LineQtyRow {
  lineId: string
  label: string
  max: number
  unit: string
  qty: number
  actualWeightKg: string
}

export function ReceiveDispatchDialog({
  open,
  mode,
  po,
  materialNames,
  onClose,
  onSave,
}: {
  open: boolean
  mode: ReceiveDispatchMode
  po: PurchaseOrder
  materialNames: Map<string, string>
  onClose: () => void
  onSave: (payload: {
    date: string
    challanNo: string
    vehicleNo: string
    remarks: string
    lines: { lineId: string; qty: number; actualWeightKg?: number }[]
  }) => Promise<void>
}) {
  const customer = isCustomerPo(po)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [challanNo, setChallanNo] = useState('')
  const [vehicleNo, setVehicleNo] = useState('')
  const [remarks, setRemarks] = useState('')
  const [rows, setRows] = useState<LineQtyRow[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDate(new Date().toISOString().slice(0, 10))
    setChallanNo('')
    setVehicleNo('')
    setRemarks('')
    setRows(
      po.lines.map((line) => lineToRow(line, po, materialNames, mode, customer)),
    )
  }, [open, po, mode, materialNames, customer])

  if (!open) return null

  const title = mode === 'receive' ? 'Receive goods' : 'Dispatch casting'

  const submit = async () => {
    setSaving(true)
    try {
      await onSave({
        date,
        challanNo,
        vehicleNo,
        remarks,
        lines: rows.map((r) => ({
          lineId: r.lineId,
          qty: r.qty,
          actualWeightKg: r.actualWeightKg ? Number(r.actualWeightKg) : undefined,
        })),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{po.poNumber}</p>
        <div className="mt-4 grid gap-3 text-sm">
          <label className="grid gap-1">
            <span className="text-slate-600">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-slate-600">Challan no.</span>
            <input
              value={challanNo}
              onChange={(e) => setChallanNo(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-slate-600">Vehicle no.</span>
            <input
              value={vehicleNo}
              onChange={(e) => setVehicleNo(e.target.value)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <div className="space-y-2">
            <p className="font-medium text-slate-700 dark:text-slate-300">Lines</p>
            {rows.map((row) => (
              <div
                key={row.lineId}
                className="rounded-lg border border-slate-100 p-2 dark:border-slate-800"
              >
                <p className="text-xs font-medium">{row.label}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <label className="text-xs">
                    Qty (max {row.max} {row.unit})
                    <input
                      type="number"
                      min={0}
                      max={row.max}
                      step="any"
                      value={row.qty}
                      onChange={(e) => {
                        const v = Math.min(row.max, Math.max(0, Number(e.target.value)))
                        setRows((prev) =>
                          prev.map((r) => (r.lineId === row.lineId ? { ...r, qty: v } : r)),
                        )
                      }}
                      className="mt-0.5 w-24 rounded border border-slate-200 px-1 py-0.5 dark:border-slate-700 dark:bg-slate-950"
                    />
                  </label>
                  <label className="text-xs">
                    Actual weight (kg)
                    <input
                      value={row.actualWeightKg}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) =>
                            r.lineId === row.lineId ? { ...r, actualWeightKg: e.target.value } : r,
                          ),
                        )
                      }
                      className="mt-0.5 w-24 rounded border border-slate-200 px-1 py-0.5 dark:border-slate-700 dark:bg-slate-950"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
          <label className="grid gap-1">
            <span className="text-slate-600">Remarks</span>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              className="rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}

function lineToRow(
  line: PurchaseOrderLine,
  _po: PurchaseOrder,
  materialNames: Map<string, string>,
  mode: ReceiveDispatchMode,
  customer: boolean,
): LineQtyRow {
  if (customer || mode === 'dispatch') {
    const max = outstandingDispatchNos(line)
    const label = `${line.buyerItemCode ?? '—'}: ${line.description ?? ''}`
    return {
      lineId: line.id,
      label,
      max,
      unit: 'nos',
      qty: max,
      actualWeightKg: '',
    }
  }
  const max = outstandingQty(line)
  const name = materialNames.get(line.materialId) ?? line.materialId
  return {
    lineId: line.id,
    label: name,
    max,
    unit: line.unit,
    qty: max,
    actualWeightKg: '',
  }
}
