import { useEffect, useState } from 'react'
import { Modal } from '../shared/Modal'
import { Button } from '../shared/Button'
import { useToast } from '../../contexts/ToastContext'
import type { Supplier } from '../../types/inventory'
import type { PurchaseRequirement } from '../../lib/supplier/purchaseRequirements'
import {
  buildPurchaseInquiryMessage,
  mailtoPurchaseInquiry,
} from '../../lib/supplier/purchaseInquiryMessage'
import { isValidEmail } from '../../lib/supplier/validation'

export function VendorMessageModal({
  open,
  onClose,
  supplier,
  requirement,
}: {
  open: boolean
  onClose: () => void
  supplier: Supplier
  requirement: PurchaseRequirement
}) {
  const { toast } = useToast()
  const generated = buildPurchaseInquiryMessage({ supplier, requirement })
  const [body, setBody] = useState(generated.body)

  useEffect(() => {
    if (open) setBody(buildPurchaseInquiryMessage({ supplier, requirement }).body)
  }, [open, supplier, requirement])

  const email = supplier.email?.trim() ?? ''
  const canMailto = email.length > 0 && isValidEmail(email)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body)
      toast('Message copied to clipboard.', 'success')
    } catch {
      toast('Could not copy — select the text and copy manually.', 'error')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Purchase inquiry message" wide>
      {generated.missingFields.length > 0 && (
        <p className="mb-3 text-xs text-amber-800 dark:text-amber-200">
          Some details were missing from inventory data and are marked with brackets. Edit the
          message before sending.
        </p>
      )}
      {!canMailto && (
        <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
          No valid email on file for this supplier — use Copy Message or add an email on the
          supplier record.
        </p>
      )}
      <textarea
        className="min-h-[220px] w-full rounded border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={() => void copy()}>Copy message</Button>
        {canMailto && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              window.location.href = mailtoPurchaseInquiry(email, generated.subject, body)
            }}
          >
            Open email draft
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}
