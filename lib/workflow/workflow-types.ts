/**
 * Workflow Types
 * 
 * Separate type definitions to work around Turbopack export detection issues.
 * Using class-based pattern since Turbopack can see class exports.
 */

export const WORKFLOW_ENTITY_TYPES = {
  ORDER: 'ORDER',
  GRN: 'GRN',
  INVOICE: 'INVOICE',
  PURCHASE_ORDER: 'PURCHASE_ORDER',
  RETURN_REQUEST: 'RETURN_REQUEST',
} as const

// Use keyof typeof pattern for type (works at build time, not import time)
export const WORKFLOW_ENTITY_TYPES_ARRAY = Object.values(WORKFLOW_ENTITY_TYPES)

export const WORKFLOW_ROLES = {
  LOCATION_ADMIN: 'LOCATION_ADMIN',
  SITE_ADMIN: 'SITE_ADMIN',
  COMPANY_ADMIN: 'COMPANY_ADMIN',
  FINANCE_ADMIN: 'FINANCE_ADMIN',
  VENDOR: 'VENDOR',
  SUPER_ADMIN: 'SUPER_ADMIN',
  EMPLOYEE: 'EMPLOYEE',
} as const

export const WORKFLOW_ROLES_ARRAY = Object.values(WORKFLOW_ROLES)
