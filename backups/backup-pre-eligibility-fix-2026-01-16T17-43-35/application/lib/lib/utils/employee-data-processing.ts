/**
 * Employee Data Processing Utility
 * 
 * Handles role-based decryption and masking of employee PII data:
 * - employee, location_admin, company_admin → decrypted data
 * - vendor → masked data
 * 
 * NOTE: This file contains server-side code. Do not import in client components.
 * Use client-decryption.ts for client-side decryption.
 */

import { maskEmployeeData, maskEmployeesData } from './data-masking'

export type UserRole = 'employee' | 'location_admin' | 'company_admin' | 'vendor' | 'unknown'

/**
 * Checks if user is a vendor
 * @param userEmail - User's email address
 * @returns true if user is a vendor
 */
export async function isVendor(userEmail: string): Promise<boolean> {
  if (!userEmail) {
    return false
  }

  try {
    // Dynamic import to avoid bundling server-side code in client
    const { getVendorByEmail } = require('../db/data-access')
    const vendor = await getVendorByEmail(userEmail)
    return !!vendor
  } catch (error) {
    console.warn(`[isVendor] Error checking vendor status for ${userEmail}:`, error)
    return false
  }
}

/**
 * Determines user role based on email and context
 * @param userEmail - User's email address
 * @param companyId - Company ID (required for company_admin check)
 * @param employeeEmail - Employee email (for self-check)
 * @returns User role
 */
export async function determineUserRole(
  userEmail: string,
  companyId?: string,
  employeeEmail?: string
): Promise<UserRole> {
  if (!userEmail) {
    return 'unknown'
  }

  // Check if user is a vendor first
  const vendorCheck = await isVendor(userEmail)
  if (vendorCheck) {
    return 'vendor'
  }

  // Check if user is viewing their own data
  if (employeeEmail && userEmail.toLowerCase().trim() === employeeEmail.toLowerCase().trim()) {
    return 'employee'
  }

  // Check if user is Company Admin
  if (companyId) {
    try {
      // Dynamic import to avoid bundling server-side code in client
      const { isCompanyAdmin } = require('../db/data-access')
      const isAdmin = await isCompanyAdmin(userEmail, companyId)
      if (isAdmin) {
        return 'company_admin'
      }
    } catch (error) {
      console.warn(`[determineUserRole] Error checking company admin status:`, error)
    }
  }

  // Check if user is Location Admin
  try {
    // Dynamic import to avoid bundling server-side code in client
    const { getLocationByAdminEmail } = require('../db/data-access')
    const location = await getLocationByAdminEmail(userEmail)
    if (location) {
      return 'location_admin'
    }
  } catch (error) {
    console.warn(`[determineUserRole] Error checking location admin status:`, error)
  }

  // Default to employee role
  return 'employee'
}

/**
 * Decrypts employee PII fields
 * Works both server-side and client-side
 * @param employee - Employee object with encrypted fields
 * @returns Employee object with decrypted fields
 */
export function decryptEmployeeData(employee: any): any {
  if (!employee) {
    return employee
  }

  const decrypted = { ...employee }

  // Server-side decryption (Node.js) - this is used in API routes
  if (typeof window === 'undefined') {
    try {
      const { decrypt } = require('./encryption')
      
      // Decrypt sensitive fields
      const sensitiveFields = ['email', 'mobile', 'firstName', 'lastName', 'designation']
      for (const field of sensitiveFields) {
        if (decrypted[field] && typeof decrypted[field] === 'string' && decrypted[field].includes(':')) {
          try {
            decrypted[field] = decrypt(decrypted[field])
          } catch (error) {
            console.warn(`Failed to decrypt field ${field}:`, error)
          }
        }
      }

      // Decrypt address fields
      const addressFields = ['address_line_1', 'address_line_2', 'address_line_3', 'city', 'state', 'pincode', 'location']
      for (const field of addressFields) {
        if (decrypted[field] && typeof decrypted[field] === 'string' && decrypted[field].includes(':')) {
          try {
            decrypted[field] = decrypt(decrypted[field])
          } catch (error) {
            console.warn(`Failed to decrypt address field ${field}:`, error)
          }
        }
      }
    } catch (error) {
      console.warn('[decryptEmployeeData] Server-side decryption failed:', error)
    }
    
    return decrypted
  }

  // Client-side: Return as-is (API should have already decrypted it)
  // If API didn't decrypt, the data will remain encrypted (shouldn't happen)
  return decrypted
}

/**
 * Processes employee data based on user role
 * @param employee - Employee object (encrypted)
 * @param userRole - User's role
 * @returns Processed employee data (decrypted or masked)
 */
export function processEmployeeDataByRole(employee: any, userRole: UserRole): any {
  if (!employee) {
    return employee
  }

  // Vendor sees masked data
  if (userRole === 'vendor') {
    return maskEmployeeData(employee)
  }

  // All other roles see decrypted data
  return decryptEmployeeData(employee)
}

/**
 * Processes array of employees based on user role
 * @param employees - Array of employee objects (encrypted)
 * @param userRole - User's role
 * @returns Array of processed employee data (decrypted or masked)
 */
export function processEmployeesDataByRole(employees: any[], userRole: UserRole): any[] {
  if (!employees || !Array.isArray(employees)) {
    return employees || []
  }

  // Vendor sees masked data
  if (userRole === 'vendor') {
    return maskEmployeesData(employees)
  }

  // All other roles see decrypted data
  return employees.map(employee => decryptEmployeeData(employee))
}

/**
 * Processes employee data with automatic role detection
 * @param employee - Employee object (encrypted)
 * @param userEmail - User's email address
 * @param companyId - Company ID (optional, for company_admin check)
 * @param employeeEmail - Employee email (optional, for self-check)
 * @returns Processed employee data (decrypted or masked)
 */
export async function processEmployeeData(
  employee: any,
  userEmail: string,
  companyId?: string,
  employeeEmail?: string
): Promise<any> {
  if (!employee) {
    return employee
  }

  // Check if vendor
  const vendorCheck = await isVendor(userEmail)
  if (vendorCheck) {
    return maskEmployeeData(employee)
  }

  // Determine role
  const role = await determineUserRole(userEmail, companyId, employeeEmail)

  // Process based on role
  return processEmployeeDataByRole(employee, role)
}

/**
 * Processes array of employees with automatic role detection
 * @param employees - Array of employee objects (encrypted)
 * @param userEmail - User's email address
 * @param companyId - Company ID (optional, for company_admin check)
 * @returns Array of processed employee data (decrypted or masked)
 */
export async function processEmployeesData(
  employees: any[],
  userEmail: string,
  companyId?: string
): Promise<any[]> {
  if (!employees || !Array.isArray(employees)) {
    return employees || []
  }

  // Check if vendor
  const vendorCheck = await isVendor(userEmail)
  if (vendorCheck) {
    return maskEmployeesData(employees)
  }

  // Determine role
  const role = await determineUserRole(userEmail, companyId)

  // Process based on role
  return processEmployeesDataByRole(employees, role)
}
