/**
 * NotificationRecipientResolver - Resolves recipient emails for notifications
 * 
 * Supports multiple recipient types:
 * - EMPLOYEE: The employee who placed the order
 * - VENDOR: The vendor fulfilling the order
 * - COMPANY_ADMIN: All admins of the company
 * - LOCATION_ADMIN: Admin of the employee's location
 * - SUPER_ADMIN: System super admins
 */

import connectDB from '../db/mongodb'
import mongoose from 'mongoose'

// =============================================================================
// TYPES
// =============================================================================

export type RecipientType = 
  | 'EMPLOYEE' 
  | 'VENDOR' 
  | 'COMPANY_ADMIN' 
  | 'LOCATION_ADMIN' 
  | 'SUPER_ADMIN'
  | 'ALL_COMPANY_ADMINS'
  | 'ALL_LOCATION_ADMINS'

export interface RecipientInfo {
  email: string
  name: string
  type: RecipientType
  id?: string
}

export interface RecipientContext {
  employeeId?: string
  vendorId?: string
  companyId?: string
  locationId?: string
  orderId?: string
}

// =============================================================================
// HELPER: Decrypt if needed
// =============================================================================

function decryptIfNeeded(value: string | undefined): string {
  if (!value) return ''
  if (!value.includes(':')) return value
  
  try {
    const { decrypt } = require('../utils/encryption')
    return decrypt(value)
  } catch (e) {
    return value
  }
}

// =============================================================================
// RESOLVER FUNCTIONS
// =============================================================================

/**
 * Get employee recipient info
 */
export async function resolveEmployeeRecipient(employeeId: string): Promise<RecipientInfo | null> {
  await connectDB()
  const Employee = mongoose.models.Employee || require('../models/Employee').default
  
  const employee = await Employee.findOne({ 
    $or: [{ id: employeeId }, { employeeId: employeeId }] 
  }).lean()
  
  if (!employee || !employee.email) return null
  
  const email = decryptIfNeeded(employee.email)
  const firstName = decryptIfNeeded(employee.firstName)
  const lastName = decryptIfNeeded(employee.lastName)
  const name = `${firstName} ${lastName}`.trim() || 'Employee'
  
  return { email, name, type: 'EMPLOYEE', id: employee.id || employee.employeeId }
}

/**
 * Get vendor recipient info
 */
export async function resolveVendorRecipient(vendorId: string): Promise<RecipientInfo | null> {
  await connectDB()
  const Vendor = mongoose.models.Vendor || require('../models/Vendor').default
  
  const vendor = await Vendor.findOne({ id: vendorId }).lean()
  
  if (!vendor || !vendor.email) return null
  
  return {
    email: vendor.email,
    name: vendor.name || vendor.contactPerson || 'Vendor',
    type: 'VENDOR',
    id: vendor.id,
  }
}

/**
 * Get company admin recipients (all admins of a company)
 */
export async function resolveCompanyAdminRecipients(companyId: string): Promise<RecipientInfo[]> {
  await connectDB()
  const CompanyAdmin = mongoose.models.CompanyAdmin || require('../models/CompanyAdmin').default
  const Employee = mongoose.models.Employee || require('../models/Employee').default
  
  const recipients: RecipientInfo[] = []
  
  // Get all company admins
  const companyAdmins = await CompanyAdmin.find({ companyId }).lean()
  
  for (const admin of companyAdmins) {
    const employeeId = admin.employeeId || admin.adminId
    if (!employeeId) continue
    
    const employee = await Employee.findOne({ 
      $or: [{ id: employeeId }, { employeeId: employeeId }] 
    }).lean()
    
    if (employee?.email) {
      const email = decryptIfNeeded(employee.email)
      const firstName = decryptIfNeeded(employee.firstName)
      const lastName = decryptIfNeeded(employee.lastName)
      const name = `${firstName} ${lastName}`.trim() || 'Company Admin'
      
      recipients.push({ email, name, type: 'COMPANY_ADMIN', id: employeeId })
    }
  }
  
  return recipients
}

/**
 * Get location admin recipient
 */
export async function resolveLocationAdminRecipient(locationId: string): Promise<RecipientInfo | null> {
  await connectDB()
  const Location = mongoose.models.Location || require('../models/Location').default
  const LocationAdmin = mongoose.models.LocationAdmin || require('../models/LocationAdmin').default
  const Employee = mongoose.models.Employee || require('../models/Employee').default
  
  // First check LocationAdmin collection
  const locationAdmin = await LocationAdmin.findOne({ locationId }).lean()
  if (locationAdmin?.employeeId) {
    const employee = await Employee.findOne({ 
      $or: [{ id: locationAdmin.employeeId }, { employeeId: locationAdmin.employeeId }] 
    }).lean()
    
    if (employee?.email) {
      const email = decryptIfNeeded(employee.email)
      const firstName = decryptIfNeeded(employee.firstName)
      const lastName = decryptIfNeeded(employee.lastName)
      const name = `${firstName} ${lastName}`.trim() || 'Location Admin'
      
      return { email, name, type: 'LOCATION_ADMIN', id: locationAdmin.employeeId }
    }
  }
  
  // Fallback: Check Location.adminEmail
  const location = await Location.findOne({ id: locationId }).lean()
  if (location?.adminEmail) {
    return {
      email: location.adminEmail,
      name: location.name || 'Location Admin',
      type: 'LOCATION_ADMIN',
      id: locationId,
    }
  }
  
  return null
}

/**
 * Get all location admins for a company
 */
export async function resolveAllLocationAdminsForCompany(companyId: string): Promise<RecipientInfo[]> {
  await connectDB()
  const Location = mongoose.models.Location || require('../models/Location').default
  const LocationAdmin = mongoose.models.LocationAdmin || require('../models/LocationAdmin').default
  const Employee = mongoose.models.Employee || require('../models/Employee').default
  
  const recipients: RecipientInfo[] = []
  
  // Get all locations for the company
  const locations = await Location.find({ companyId }).lean()
  
  for (const location of locations) {
    const locationAdmin = await LocationAdmin.findOne({ locationId: location.id }).lean()
    
    if (locationAdmin?.employeeId) {
      const employee = await Employee.findOne({ 
        $or: [{ id: locationAdmin.employeeId }, { employeeId: locationAdmin.employeeId }] 
      }).lean()
      
      if (employee?.email) {
        const email = decryptIfNeeded(employee.email)
        const firstName = decryptIfNeeded(employee.firstName)
        const lastName = decryptIfNeeded(employee.lastName)
        const name = `${firstName} ${lastName}`.trim() || 'Location Admin'
        
        recipients.push({ email, name, type: 'LOCATION_ADMIN', id: locationAdmin.employeeId })
      }
    } else if (location.adminEmail) {
      recipients.push({
        email: location.adminEmail,
        name: location.name || 'Location Admin',
        type: 'LOCATION_ADMIN',
        id: location.id,
      })
    }
  }
  
  // Deduplicate by email
  const seen = new Set<string>()
  return recipients.filter(r => {
    if (seen.has(r.email)) return false
    seen.add(r.email)
    return true
  })
}

/**
 * Get employee's location admin
 */
export async function resolveEmployeeLocationAdmin(employeeId: string): Promise<RecipientInfo | null> {
  await connectDB()
  const Employee = mongoose.models.Employee || require('../models/Employee').default
  
  const employee = await Employee.findOne({ 
    $or: [{ id: employeeId }, { employeeId: employeeId }] 
  }).lean()
  
  if (!employee?.locationId) return null
  
  return resolveLocationAdminRecipient(employee.locationId)
}

// =============================================================================
// MAIN RESOLVER
// =============================================================================

/**
 * Resolve recipients based on type and context
 */
export async function resolveRecipients(
  recipientType: RecipientType,
  context: RecipientContext
): Promise<RecipientInfo[]> {
  const recipients: RecipientInfo[] = []
  
  switch (recipientType) {
    case 'EMPLOYEE':
      if (context.employeeId) {
        const emp = await resolveEmployeeRecipient(context.employeeId)
        if (emp) recipients.push(emp)
      }
      break
      
    case 'VENDOR':
      if (context.vendorId) {
        const vendor = await resolveVendorRecipient(context.vendorId)
        if (vendor) recipients.push(vendor)
      }
      break
      
    case 'COMPANY_ADMIN':
    case 'ALL_COMPANY_ADMINS':
      if (context.companyId) {
        const admins = await resolveCompanyAdminRecipients(context.companyId)
        recipients.push(...admins)
      }
      break
      
    case 'LOCATION_ADMIN':
      if (context.locationId) {
        const locAdmin = await resolveLocationAdminRecipient(context.locationId)
        if (locAdmin) recipients.push(locAdmin)
      } else if (context.employeeId) {
        const locAdmin = await resolveEmployeeLocationAdmin(context.employeeId)
        if (locAdmin) recipients.push(locAdmin)
      }
      break
      
    case 'ALL_LOCATION_ADMINS':
      if (context.companyId) {
        const locAdmins = await resolveAllLocationAdminsForCompany(context.companyId)
        recipients.push(...locAdmins)
      }
      break
      
    case 'SUPER_ADMIN':
      // Super admin emails would typically come from env config
      // For now, skip unless configured
      break
  }
  
  return recipients
}

/**
 * Resolve recipients from order context
 * Automatically extracts IDs from order data
 */
export async function resolveRecipientsFromOrder(
  recipientType: RecipientType,
  order: any
): Promise<RecipientInfo[]> {
  const context: RecipientContext = {
    employeeId: order.employeeId,
    vendorId: order.vendorId,
    companyId: order.companyId,
    locationId: order.locationId,
    orderId: order.id || order.orderId,
  }
  
  return resolveRecipients(recipientType, context)
}
