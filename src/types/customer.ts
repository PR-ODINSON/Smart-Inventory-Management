export interface Customer {
  id: string
  name: string
  gstin?: string
  vendorCode?: string
  contactPerson?: string
  phone?: string
  email?: string
  address?: string
  active: boolean
  createdAt: string
  updatedAt: string
}
