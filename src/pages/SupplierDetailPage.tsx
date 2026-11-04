import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/shared/Card'
import { Button } from '../components/shared/Button'
import { getSupplier } from '../services/supplierService'
import { formatDate, formatNumber } from '../utils/formatting'
import { listInvoicesForSupplier } from '../services/supplierInvoiceService'
import type { SupplierInvoice } from '../types/supplierInvoice'
import type { Supplier } from '../types/inventory'
import { SupplierInvoiceLineTable } from '../components/suppliers/SupplierInvoiceLineTable'

function importSourceLabel(source: SupplierInvoice['source']): string {
  if (source === 'pdf_import') return 'pdf import'
  if (source === 'image_import') return 'image import'
  return 'manual entry'
}

export function SupplierDetailPage() {
  const { supplierId } = useParams<{ supplierId: string }>()
  const navigate = useNavigate()
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!supplierId) return
    setLoading(true)
    try {
      const [s, inv] = await Promise.all([
        getSupplier(supplierId),
        listInvoicesForSupplier(supplierId),
      ])
      setSupplier(s)
      setInvoices(
        inv.sort((a, b) =>
          (b.invoiceDate ?? b.createdAt).localeCompare(a.invoiceDate ?? a.createdAt),
        ),
      )
    } finally {
      setLoading(false)
    }
  }, [supplierId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <p className="p-6 text-sm text-slate-500">Loading supplier…</p>
  }

  if (!supplier) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-600">Supplier not found.</p>
        <Link to="/suppliers" className="mt-2 inline-block text-sm text-brand hover:underline">
          Back to suppliers
        </Link>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={supplier.companyName}
        actions={
          <Button variant="secondary" onClick={() => navigate('/suppliers')}>
            Back
          </Button>
        }
      />

      <p className="mb-6 text-sm">
        <span className="text-slate-500">GSTIN</span>{' '}
        <span className="font-mono font-medium">{supplier.gstin ?? '—'}</span>
      </p>

      {invoices.length === 0 ? (
        <Card>
          <p className="p-6 text-sm text-slate-500">No uploaded invoices for this supplier yet.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {invoices.map((inv) => (
            <Card key={inv.id}>
              <div className="border-b border-slate-100 p-4 dark:border-slate-800">
                <h2 className="text-base font-semibold">
                  Invoice {inv.invoiceNumber}
                  {inv.invoiceDate ? (
                    <span className="font-normal text-slate-600 dark:text-slate-400">
                      {' '}
                      {formatDate(inv.invoiceDate)}
                    </span>
                  ) : null}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {importSourceLabel(inv.source)}
                  {inv.sourceFileName ? ` · ${inv.sourceFileName}` : ''}
                </p>
                {inv.totals.grandTotal != null && (
                  <p className="mt-2 text-sm tabular-nums text-slate-600 dark:text-slate-400">
                    Total {formatNumber(inv.totals.grandTotal, 2)}
                  </p>
                )}
              </div>
              <div className="p-4">
                <SupplierInvoiceLineTable lines={inv.lines} variant="summary" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
