import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { PoHeaderBar } from '../components/po/detail/PoHeaderBar'
import { PoSummaryCards } from '../components/po/detail/PoSummaryCards'
import { PoPartyBlock } from '../components/po/detail/PoPartyBlock'
import { PoLinesTable } from '../components/po/detail/PoLinesTable'
import { PoTotalsBox } from '../components/po/detail/PoTotalsBox'
import { ReceiveDispatchDialog } from '../components/po/ReceiveDispatchDialog'
import { Button } from '../components/shared/Button'
import { useToast } from '../contexts/ToastContext'
import { listPathWithParams, parsePoListParams } from '../lib/po/poListParams'
import type { PoWorkflowAction } from '../lib/po/poStatusMachine'
import {
  dispatchPoBatch,
  duplicatePoWithLog,
  receivePoBatch,
  runPoWorkflowAction,
} from '../services/poWorkflowService'
import { db } from '../storage/database'
import { listMaterialsComputed } from '../services/inventoryService'
import type { Supplier } from '../types/inventory'
import type { GoodsReceipt, PoDispatchRecord, PurchaseOrder } from '../types/purchasing'

type DetailLocationState = {
  listSearch?: string
  orderedIds?: string[]
}

export function PurchaseOrderDetailPage() {
  const { poId } = useParams<{ poId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { toast } = useToast()
  const state = (location.state ?? {}) as DetailLocationState

  const [po, setPo] = useState<PurchaseOrder | null | undefined>(undefined)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materialNames, setMaterialNames] = useState<Map<string, string>>(new Map())
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([])
  const [dispatches, setDispatches] = useState<PoDispatchRecord[]>([])
  const [rdOpen, setRdOpen] = useState<'receive' | 'dispatch' | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const listParams = useMemo(() => {
    const qs = state.listSearch ?? ''
    return parsePoListParams(new URLSearchParams(qs))
  }, [state.listSearch])
  const listBackHref = listPathWithParams(listParams)

  const orderedIds = state.orderedIds ?? []
  const idx = po ? orderedIds.indexOf(po.id) : -1
  const prevId = idx > 0 ? orderedIds[idx - 1] : undefined
  const nextId = idx >= 0 && idx < orderedIds.length - 1 ? orderedIds[idx + 1] : undefined

  const reload = useCallback(async (id: string) => {
    setLoadError(null)
    try {
      const p = await db.purchaseOrders.get(id)
      setPo(p ?? null)
      if (p) {
        setReceipts(
          await db.goodsReceipts.where('purchaseOrderId').equals(p.id).toArray(),
        )
        setDispatches(
          await db.poDispatches.where('purchaseOrderId').equals(p.id).toArray(),
        )
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load')
      setPo(null)
    }
  }, [])

  useEffect(() => {
    if (!poId) return
    void reload(poId)
    void db.suppliers.toArray().then(setSuppliers)
    void listMaterialsComputed().then((mats) =>
      setMaterialNames(new Map(mats.map((m) => [m.material.id, m.material.name]))),
    )
  }, [poId, reload])

  const supplierMap = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s])),
    [suppliers],
  )

  const handleAction = async (
    action: PoWorkflowAction | 'duplicate' | 'receive' | 'dispatch',
    reason?: string,
  ) => {
    if (action === 'receive' || action === 'dispatch') {
      setRdOpen(action)
      return
    }
    if (!po) return
    try {
      if (action === 'duplicate') {
        const copy = await duplicatePoWithLog(po)
        toast('PO duplicated', 'success')
        navigate(`/purchase-orders/${copy.id}`, { state })
        return
      }
      if (action === 'delete') {
        await runPoWorkflowAction(po, action)
        toast('PO deleted', 'success')
        navigate(listBackHref)
        return
      }
      const updated = await runPoWorkflowAction(po, action, { reason })
      setPo(updated)
      toast('Updated', 'success')
      if (action === 'reject') {
        navigate(`/purchase-orders/${po.id}/edit`, { state })
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Action failed', 'error')
    }
  }

  const saveReceiveDispatch = async (payload: {
    date: string
    challanNo: string
    vehicleNo: string
    remarks: string
    lines: { lineId: string; qty: number; actualWeightKg?: number }[]
  }) => {
    if (!po || !rdOpen) return
    const locationRow = await db.locations.filter((l) => l.active).first()
    const locationId = locationRow?.id ?? 'loc-scrap'
    try {
      if (rdOpen === 'receive') {
        await receivePoBatch(po.id, {
          date: payload.date,
          challanNo: payload.challanNo,
          vehicleNo: payload.vehicleNo,
          remarks: payload.remarks,
          locationId,
          lines: payload.lines.map((l) => ({
            lineId: l.lineId,
            quantity: l.qty,
            actualWeightKg: l.actualWeightKg,
          })),
        })
      } else {
        await dispatchPoBatch(po.id, {
          date: payload.date,
          challanNo: payload.challanNo,
          vehicleNo: payload.vehicleNo,
          remarks: payload.remarks,
          lines: payload.lines.map((l) => ({
            lineId: l.lineId,
            quantityNos: l.qty,
            actualWeightKg: l.actualWeightKg,
          })),
        })
      }
      toast('Saved', 'success')
      await reload(po.id)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error')
      throw e
    }
  }

  if (po === undefined) {
    return <DetailSkeleton />
  }

  if (!po) {
    return (
      <div className="py-12 text-center">
        <p className="text-lg font-medium">Purchase order not found</p>
        <Link to={listBackHref} className="mt-4 inline-block">
          <Button variant="secondary">Back to list</Button>
        </Link>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="py-12 text-center">
        <p className="text-red-600">{loadError}</p>
        <Button className="mt-4" onClick={() => poId && void reload(poId)}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      <PoHeaderBar
        po={po}
        listBackHref={listBackHref}
        prevId={prevId}
        nextId={nextId}
        navState={state}
        onAction={handleAction}
        onReceiveDispatch={(mode) => setRdOpen(mode)}
      />

      <PoSummaryCards po={po} />
      <PoPartyBlock po={po} suppliers={supplierMap} />
      <PoLinesTable
        po={po}
        materialNames={materialNames}
        receipts={receipts}
        dispatches={dispatches}
      />
      <PoTotalsBox po={po} />

      <ReceiveDispatchDialog
        open={rdOpen != null}
        mode={rdOpen ?? 'receive'}
        po={po}
        materialNames={materialNames}
        onClose={() => setRdOpen(null)}
        onSave={saveReceiveDispatch}
      />
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="grid gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-lg bg-slate-200 dark:bg-slate-800" />
        ))}
      </div>
      <div className="h-48 rounded-lg bg-slate-200 dark:bg-slate-800" />
    </div>
  )
}
