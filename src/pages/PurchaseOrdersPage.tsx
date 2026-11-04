import { ChevronDown, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/shared/Card'
import { Button } from '../components/shared/Button'
import { StatusPill } from '../components/po/StatusPill'
import { PoPdfImportFlow } from '../components/purchasing/PoPdfImportFlow'
import { listMaterialsComputed } from '../services/inventoryService'
import { listCustomers } from '../services/customerService'
import type { Customer } from '../types/customer'
import { deletePurchaseOrder } from '../services/poImportService'
import { db } from '../storage/database'
import type { Material, Supplier } from '../types/inventory'
import type { PurchaseOrder } from '../types/purchasing'
import {
  poCompanyName,
  poTotalWeightKg,
  simpleLineDisplay,
} from '../features/purchasing/poSimpleDisplay'
import { formatNumber } from '../utils/formatting'
import { useToast } from '../contexts/ToastContext'
import {
  parsePoListParams,
  serializePoListParams,
  shouldIgnorePoRowNavigation,
} from '../lib/po/poListParams'
import { filterPurchaseOrders, paginatePoList, PO_LIST_PAGE_SIZE } from '../lib/po/filterPoList'
import { sumPurchaseOrdersWeightKg } from '../lib/po/poSelectors'
import type { PoTab } from '../features/purchasing/poPageUtils'

export function PurchaseOrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = useMemo(() => parsePoListParams(searchParams), [searchParams])
  const navigate = useNavigate()

  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [materialNames, setMaterialNames] = useState<Map<string, string>>(new Map())
  const [importOpen, setImportOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  const setParams = (patch: Partial<typeof params>) => {
    const next = { ...params, ...patch }
    const qs = serializePoListParams(next)
    setSearchParams(qs ? new URLSearchParams(qs) : {}, { replace: true })
  }

  const load = async () => {
    setOrders(await db.purchaseOrders.orderBy('createdAt').reverse().toArray())
    setSuppliers(await db.suppliers.toArray())
    const mats = await listMaterialsComputed()
    setMaterials(mats.map((m) => m.material))
    setCustomers(await listCustomers())
    setMaterialNames(new Map(mats.map((m) => [m.material.id, m.material.name])))
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const supplierMap = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s])),
    [suppliers],
  )

  const existingPoNumbers = useMemo(() => orders.map((o) => o.poNumber), [orders])

  const filtered = useMemo(
    () => filterPurchaseOrders(orders, params, supplierMap),
    [orders, params, supplierMap],
  )

  const pageCount = Math.max(1, Math.ceil(filtered.length / PO_LIST_PAGE_SIZE))
  const pageRows = paginatePoList(filtered, params.page)
  const totalWeightKg = useMemo(
    () => sumPurchaseOrdersWeightKg(filtered),
    [filtered],
  )
  const orderedIds = filtered.map((p) => p.id)
  const listSearch = serializePoListParams(params)
  const navState = { listSearch, orderedIds }

  const removePo = async (id: string) => {
    if (!confirm('Delete this purchase order?')) return
    await deletePurchaseOrder(id)
    await load()
    toast('Deleted', 'success')
  }

  const openPo = (id: string) => {
    navigate(`/purchase-orders/${id}`, { state: navState })
  }

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        description="Customer POs received from buyers — import from PDF or manage existing orders."
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {(['all', 'received_from_customer', 'issued_to_supplier'] as PoTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setParams({ tab, page: 1 })}
            className={`rounded-full px-3 py-1 text-sm ${
              params.tab === tab
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {tab === 'all' ? 'All' : tab === 'received_from_customer' ? 'Customer' : 'Raw material'}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative" ref={menuRef}>
          <Button onClick={() => setMenuOpen((o) => !o)}>
            <Plus className="h-4 w-4" />
            New PO
            <ChevronDown className="h-4 w-4 opacity-70" />
          </Button>
          {menuOpen && (
            <div
              className="absolute left-0 z-20 mt-1 min-w-[200px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                onClick={() => {
                  setMenuOpen(false)
                  setImportOpen(true)
                }}
              >
                Import PO from PDF
              </button>
            </div>
          )}
        </div>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search PO #, company, item…"
            value={params.q}
            onChange={(e) => setParams({ q: e.target.value, page: 1 })}
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <select
          value={params.status}
          onChange={(e) => setParams({ status: e.target.value as typeof params.status, page: 1 })}
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="ordered">Ordered</option>
          <option value="partially_dispatched">Partially dispatched</option>
          <option value="dispatched">Dispatched</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {filtered.length > 0 && (
          <p className="ml-auto text-sm text-slate-600 dark:text-slate-400">
            <span className="font-medium text-slate-900 dark:text-slate-100">Total weight</span>
            {' · '}
            {formatNumber(totalWeightKg, 3)} kg
            <span className="text-slate-500">
              {' '}
              ({filtered.length} {filtered.length === 1 ? 'PO' : 'POs'}
              {filtered.length !== orders.length ? ', filtered' : ''})
            </span>
          </p>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950">
              <tr>
                <th className="px-3 py-2 font-medium">PO #</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Items</th>
                <th className="px-3 py-2 font-medium text-right">PO weight (kg)</th>
                <th className="px-3 py-2 font-medium w-16" />
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    No purchase orders yet. Use New PO → Import PO from PDF.
                  </td>
                </tr>
              ) : (
                pageRows.map((po) => (
                  <tr
                    key={po.id}
                    className="cursor-pointer border-b border-slate-50 align-top hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/50"
                    onClick={(e) => {
                      if (shouldIgnorePoRowNavigation(e.target)) return
                      openPo(po.id)
                    }}
                  >
                    <td className="px-3 py-2 font-medium whitespace-nowrap">
                      <Link
                        to={`/purchase-orders/${po.id}`}
                        state={navState}
                        className="text-indigo-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {po.poNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill status={po.status} />
                    </td>
                    <td className="px-3 py-2">{poCompanyName(po, supplierMap)}</td>
                    <td className="px-3 py-2">
                      <ul className="space-y-2">
                        {po.lines.map((line) => {
                          const d = simpleLineDisplay(line, materialNames)
                          return (
                            <li key={line.id} className="text-xs">
                              <div className="font-medium text-slate-800 dark:text-slate-200">
                                {d.itemName}
                              </div>
                              <div className="text-slate-500">
                                Qty {formatNumber(d.quantity, 3)} {d.quantityUnit}
                                {d.quantityUnit === 'nos' && (
                                  <>
                                    {' · '}
                                    {formatNumber(d.weightPerUnitKg, 2)} kg each
                                  </>
                                )}
                                {' · '}
                                {formatNumber(d.totalWeightKg, 3)} kg total
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {formatNumber(poTotalWeightKg(po), 3)}
                    </td>
                    <td className="px-3 py-2 text-right" data-po-row-ignore>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          void removePo(po.id)
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-sm dark:border-slate-700 dark:bg-slate-950">
                <tr>
                  <td colSpan={4} className="px-3 py-2.5 text-right font-medium text-slate-600 dark:text-slate-400">
                    Total weight ({filtered.length} {filtered.length === 1 ? 'order' : 'orders'})
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap tabular-nums">
                    {formatNumber(totalWeightKg, 3)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {filtered.length > PO_LIST_PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs dark:border-slate-800">
            <span>
              Page {params.page} of {pageCount} ({filtered.length} orders)
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="secondary"
                disabled={params.page <= 1}
                onClick={() => setParams({ page: params.page - 1 })}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={params.page >= pageCount}
                onClick={() => setParams({ page: params.page + 1 })}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <PoPdfImportFlow
        open={importOpen}
        onClose={() => setImportOpen(false)}
        materials={materials}
        customers={customers}
        onCustomersChange={load}
        existingPoNumbers={existingPoNumbers}
        onSaved={load}
      />
    </div>
  )
}
