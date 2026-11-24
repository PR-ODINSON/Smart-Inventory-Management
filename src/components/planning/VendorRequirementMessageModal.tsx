import { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2, Mail } from 'lucide-react'
import { Modal } from '../shared/Modal'
import { Button } from '../shared/Button'
import { useToast } from '../../contexts/ToastContext'
import type { Supplier } from '../../types/inventory'
import { db } from '../../storage/database'
import { createSupplier, updateSupplier, deleteSupplier } from '../../services/supplierService'

export interface VendorRequirementDetails {
  materialId: string
  materialName: string
  specification?: string
  quantityKg: number
  unit: string
  desiredInventoryDays: number
}

export function VendorRequirementMessageModal({
  open,
  onClose,
  suppliers,
  requirement,
  onSuppliersChanged,
}: {
  open: boolean
  onClose: () => void
  suppliers: Supplier[]
  requirement: VendorRequirementDetails | null
  onSuppliersChanged?: () => Promise<void> | void
}) {
  const { toast } = useToast()

  // Selected supplier
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('')
  const [deliveryDate, setDeliveryDate] = useState<string>('')
  const [editableQty, setEditableQty] = useState<number>(0)
  const [messageText, setMessageText] = useState<string>('')

  // Vendor add/edit form states
  const [vendorModalMode, setVendorModalMode] = useState<'add' | 'edit' | null>(null)
  const [vName, setVName] = useState('')
  const [vEmail, setVEmail] = useState('')
  const [vPhone, setVPhone] = useState('')
  const [vAddress, setVAddress] = useState('')
  const [vGstin, setVGstin] = useState('')
  const [isVendorSubmitting, setIsVendorSubmitting] = useState(false)

  useEffect(() => {
    if (requirement) {
      setEditableQty(requirement.quantityKg)
      const d = new Date()
      d.setDate(d.getDate() + (requirement.desiredInventoryDays || 7))
      setDeliveryDate(d.toISOString().split('T')[0])

      const matching = suppliers.find((s) => s.materialIds?.includes(requirement.materialId))
      setSelectedSupplierId(matching?.id || suppliers[0]?.id || '')
    }
  }, [requirement, suppliers])

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId)

  useEffect(() => {
    if (!requirement) return

    const vendorName = selectedSupplier?.companyName || '[Vendor Name]'
    const materialSpec = requirement.specification?.trim()
      ? `${requirement.materialName} (${requirement.specification.trim()})`
      : requirement.materialName
    const qty = editableQty || requirement.quantityKg
    const unit = requirement.unit || 'kg'
    const dateStr = deliveryDate || '[Date]'

    // Format: "Hello [Vendor Name], We require [Quantity] [Unit] of [Material + Specification] for Neelam Industries. Kindly deliver by [Date]. Please confirm availability and price. Thank you, Neelam Industries"
    const text = `Hello ${vendorName}, We require ${qty} ${unit} of ${materialSpec} for Neelam Industries. Kindly deliver by ${dateStr}. Please confirm availability and price. Thank you, Neelam Industries`
    setMessageText(text)
  }, [requirement, selectedSupplier, editableQty, deliveryDate])

  if (!requirement) return null

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(messageText)
      toast('Requirement message copied to clipboard!', 'success')
    } catch {
      toast('Failed to copy. Please select and copy manually.', 'error')
    }
  }

  const openAddVendor = () => {
    setVName('')
    setVEmail('')
    setVPhone('')
    setVAddress('')
    setVGstin('')
    setVendorModalMode('add')
  }

  const openEditVendor = () => {
    if (!selectedSupplier) {
      toast('Please select a vendor to edit.', 'error')
      return
    }
    setVName(selectedSupplier.companyName)
    setVEmail(selectedSupplier.email || '')
    setVPhone(selectedSupplier.phone || '')
    setVAddress(selectedSupplier.address || '')
    setVGstin(selectedSupplier.gstin || '')
    setVendorModalMode('edit')
  }

  const handleDeleteVendor = async () => {
    if (!selectedSupplier) return

    // Guard: Check if vendor is linked to materials, POs, or receipts
    const [mats, pos, receipts] = await Promise.all([
      db.materials.toArray(),
      db.purchaseOrders.toArray(),
      db.materialReceipts.toArray(),
    ])

    const linkedMats = mats.filter((m) => m.supplierIds?.includes(selectedSupplier.id))
    const linkedPos = pos.filter((p) => p.supplierId === selectedSupplier.id)
    const linkedReceipts = receipts.filter(
      (r) =>
        r.supplierId === selectedSupplier.id ||
        r.supplierName.trim().toLowerCase() === selectedSupplier.companyName.trim().toLowerCase(),
    )

    const reasons: string[] = []
    if (linkedMats.length > 0) reasons.push(`Used by ${linkedMats.length} material(s)`)
    if (linkedPos.length > 0) reasons.push(`Linked to ${linkedPos.length} purchase order(s)`)
    if (linkedReceipts.length > 0) reasons.push(`Linked to ${linkedReceipts.length} receipt record(s)`)

    if (reasons.length > 0) {
      toast(`Cannot delete vendor "${selectedSupplier.companyName}": ${reasons.join(', ')}.`, 'error')
      return
    }

    if (!confirm(`Delete vendor "${selectedSupplier.companyName}"? This action cannot be undone.`)) {
      return
    }

    try {
      await deleteSupplier(selectedSupplier.id)
      toast(`Vendor "${selectedSupplier.companyName}" deleted.`, 'success')
      await onSuppliersChanged?.()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete vendor.', 'error')
    }
  }

  const handleSaveVendor = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = vName.trim()
    const email = vEmail.trim()

    if (!name) {
      toast('Vendor / Company Name is required.', 'error')
      return
    }
    if (!email) {
      toast('Email Address is required.', 'error')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast('Please enter a valid email address.', 'error')
      return
    }

    // Uniqueness validation
    const duplicate = suppliers.find(
      (s) =>
        (!selectedSupplier || vendorModalMode === 'add' || s.id !== selectedSupplier.id) &&
        (s.companyName.trim().toLowerCase() === name.toLowerCase() ||
          (s.email && s.email.trim().toLowerCase() === email.toLowerCase())),
    )
    if (duplicate) {
      toast('A vendor with this name or email address already exists.', 'error')
      return
    }

    setIsVendorSubmitting(true)
    try {
      if (vendorModalMode === 'add') {
        const created = await createSupplier({
          companyName: name,
          email,
          phone: vPhone.trim() || undefined,
          address: vAddress.trim() || undefined,
          gstin: vGstin.trim() || undefined,
          avgDeliveryDays: 7,
          maxDeliveryDays: 14,
          materialIds: requirement?.materialId ? [requirement.materialId] : [],
          active: true,
        })
        toast(`Vendor "${name}" created.`, 'success')
        setSelectedSupplierId(created.id)
      } else if (vendorModalMode === 'edit' && selectedSupplier) {
        await updateSupplier(selectedSupplier.id, {
          companyName: name,
          email,
          phone: vPhone.trim() || undefined,
          address: vAddress.trim() || undefined,
          gstin: vGstin.trim() || undefined,
          avgDeliveryDays: selectedSupplier.avgDeliveryDays ?? 7,
          maxDeliveryDays: selectedSupplier.maxDeliveryDays ?? 14,
          active: selectedSupplier.active,
          materialIds: selectedSupplier.materialIds,
        })
        toast(`Vendor "${name}" updated.`, 'success')
      }
      setVendorModalMode(null)
      await onSuppliersChanged?.()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save vendor.', 'error')
    } finally {
      setIsVendorSubmitting(false)
    }
  }

  const email = selectedSupplier?.email?.trim() || ''

  return (
    <>
      <Modal open={open} onClose={onClose} title="Generate Vendor Requirement Message" wide>
        <div className="space-y-4 text-sm">
          {/* Vendor selector + Add / Edit / Delete buttons (Part B3) */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Vendor / Supplier Selection
              </label>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="secondary" onClick={openAddVendor}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Vendor
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!selectedSupplier}
                  onClick={openEditVendor}
                >
                  <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit Vendor
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                  disabled={!selectedSupplier}
                  onClick={() => void handleDeleteVendor()}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Vendor
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <select
                  className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.companyName} {s.email ? `(${s.email})` : '(No email)'}
                    </option>
                  ))}
                  {suppliers.length === 0 && <option value="">No vendors found</option>}
                </select>
              </div>

              <div className="flex items-center text-xs text-slate-600 dark:text-slate-400">
                <Mail className="h-3.5 w-3.5 mr-1 text-slate-400" />
                {email ? <span className="font-mono text-brand font-semibold">{email}</span> : 'No email saved'}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Required Quantity ({requirement.unit})
              </label>
              <input
                type="number"
                min="0"
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={editableQty}
                onChange={(e) => setEditableQty(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Required Delivery Date</label>
              <input
                type="date"
                className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Generated Message (Ready to Copy)
            </label>
            <textarea
              rows={4}
              className="w-full rounded border border-slate-300 bg-white p-3 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <p className="text-xs text-slate-500 italic">
              Message preparation only. Sending the requirement by email remains a manual user action.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              <Button onClick={() => void copyToClipboard()}>
                Copy Message
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* VENDOR ADD / EDIT MODAL (Part B3) */}
      {vendorModalMode && (
        <Modal
          open={vendorModalMode !== null}
          onClose={() => setVendorModalMode(null)}
          title={vendorModalMode === 'add' ? 'Add New Vendor' : `Edit Vendor: ${selectedSupplier?.companyName}`}
        >
          <form onSubmit={handleSaveVendor} className="space-y-3 text-sm">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Vendor / Company Name *
              </label>
              <input
                required
                className="w-full rounded border border-slate-300 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                placeholder="e.g. Tata Metaliks Ltd"
                value={vName}
                onChange={(e) => setVName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email Address *
              </label>
              <input
                type="email"
                required
                className="w-full rounded border border-slate-300 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                placeholder="e.g. sales@tatametaliks.com"
                value={vEmail}
                onChange={(e) => setVEmail(e.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Phone Number
                </label>
                <input
                  className="w-full rounded border border-slate-300 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                  placeholder="e.g. +91 98250 12345"
                  value={vPhone}
                  onChange={(e) => setVPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  GSTIN (Optional)
                </label>
                <input
                  className="w-full rounded border border-slate-300 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900 font-mono text-xs"
                  placeholder="e.g. 24AAACT1234F1Z5"
                  value={vGstin}
                  onChange={(e) => setVGstin(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Address
              </label>
              <textarea
                rows={2}
                className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900 text-xs"
                placeholder="Street address, city, state"
                value={vAddress}
                onChange={(e) => setVAddress(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setVendorModalMode(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isVendorSubmitting}>
                {isVendorSubmitting ? 'Saving...' : 'Save Vendor'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
