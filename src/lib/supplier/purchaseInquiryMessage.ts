import { COMPANY_NAME } from '../../config/company'
import type { Supplier } from '../../types/inventory'
import type { PurchaseRequirement } from './purchaseRequirements'

export type InquiryMessageInput = {
  supplier: Supplier
  requirement: PurchaseRequirement
}

export type GeneratedInquiryMessage = {
  body: string
  subject: string
  missingFields: string[]
}

function materialLine(req: PurchaseRequirement): string {
  const spec = req.specification?.trim()
  return spec ? `${req.materialName} (${spec})` : req.materialName
}

export function buildPurchaseInquiryMessage(
  input: InquiryMessageInput,
): GeneratedInquiryMessage {
  const { supplier, requirement } = input
  const missingFields: string[] = []
  const supplierName = supplier.companyName.trim() || '[Supplier name]'
  if (!supplier.companyName.trim()) missingFields.push('supplier name')

  const qty =
    requirement.quantity > 0
      ? String(requirement.quantity)
      : '[Quantity — enter required amount]'
  if (requirement.quantity <= 0) missingFields.push('quantity')

  const unit = requirement.unit?.trim() || '[Unit]'
  if (!requirement.unit?.trim()) missingFields.push('unit')

  const material = materialLine(requirement)
  let deliveryLine = ''
  if (requirement.requestedDeliveryDate) {
    deliveryLine = `\nRequested delivery date: ${requirement.requestedDeliveryDate}.`
  } else {
    deliveryLine =
      '\nRequested delivery date: [Delivery date — enter if known].'
    missingFields.push('delivery date')
  }

  const body = `Dear ${supplierName} Team,

${COMPANY_NAME} requires ${qty} ${unit} of ${material}.${deliveryLine}

Please confirm material availability, your quotation, and the expected delivery date.

Regards,
${COMPANY_NAME}`

  const subject = `Purchase inquiry — ${requirement.materialName} — ${COMPANY_NAME}`

  return { body, subject, missingFields }
}

export function mailtoPurchaseInquiry(
  email: string,
  subject: string,
  body: string,
): string {
  const params = new URLSearchParams({
    subject,
    body,
  })
  return `mailto:${encodeURIComponent(email.trim())}?${params.toString()}`
}
