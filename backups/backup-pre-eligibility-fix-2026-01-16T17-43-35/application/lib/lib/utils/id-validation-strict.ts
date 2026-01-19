/**
 * ============================================================
 * 🟣 STRICT VALIDATION MODULE — ENFORCED MODE
 * ============================================================
 * 
 * This module ENFORCES string ID validation on create/update operations.
 * It THROWS errors when invalid IDs are detected.
 * 
 * USAGE:
 *   import { enforceStringId, enforceStringIds } from '@/lib/utils/id-validation-strict'
 * 
 *   // Throws if invalid
 *   enforceStringId(companyId, 'createEmployee.companyId')
 * 
 *   // Batch validation
 *   enforceStringIds({
 *     companyId: company.id,
 *     vendorId: vendor.id
 *   }, 'createOrder')
 */

// ============================================================
// PATTERNS
// ============================================================

// Updated to support alphanumeric IDs (1-50 characters)
const VALID_STRING_ID_PATTERN = /^[A-Za-z0-9_-]{1,50}$/
const HEX_24_PATTERN = /^[0-9a-fA-F]{24}$/

// ============================================================
// DETECTION FUNCTIONS (THROWS)
// ============================================================

/**
 * Detects and THROWS if value is a 24-character hex string (ObjectId format)
 * 
 * @throws Error if hex-string detected
 */
export function detectAndRejectHexString(value: unknown, context: string): void {
  if (typeof value === 'string' && HEX_24_PATTERN.test(value)) {
    throw new Error(
      `[ID-VALIDATION] ❌ ${context}: Invalid hex-string ID "${value}". ` +
      `Expected alphanumeric string ID (e.g., "100001", "COMP-001"). ` +
      `Hex-strings are NOT allowed.`
    )
  }
}

/**
 * Detects and THROWS if value is a MongoDB ObjectId instance
 * 
 * @throws Error if ObjectId instance detected
 */
export function detectAndRejectObjectIdInstance(value: unknown, context: string): void {
  if (!value || typeof value !== 'object') return
  
  const obj = value as any
  
  const isObjectId = (
    obj._bsontype === 'ObjectId' ||
    obj._bsontype === 'ObjectID' ||
    (obj.constructor && (
      obj.constructor.name === 'ObjectId' || 
      obj.constructor.name === 'ObjectID'
    )) ||
    (typeof obj.toHexString === 'function' && typeof obj.getTimestamp === 'function')
  )
  
  if (isObjectId) {
    throw new Error(
      `[ID-VALIDATION] ❌ ${context}: Invalid ObjectId instance "${obj.toString()}". ` +
      `Expected alphanumeric string ID (e.g., "100001", "COMP-001"). ` +
      `ObjectId instances are NOT allowed.`
    )
  }
}

// ============================================================
// ENFORCEMENT FUNCTIONS
// ============================================================

/**
 * Enforces that a value is a valid alphanumeric string ID.
 * THROWS if the value is:
 *   - null/undefined (unless optional=true)
 *   - ObjectId instance
 *   - 24-char hex string
 *   - Invalid format
 * 
 * @param value - The value to validate
 * @param context - Context for error message (e.g., "createEmployee.companyId")
 * @param options - Optional settings
 * @returns The validated string ID
 * @throws Error if validation fails
 * 
 * @example
 * const validId = enforceStringId(companyId, 'createEmployee.companyId')
 */
export function enforceStringId(
  value: unknown, 
  context: string,
  options: { optional?: boolean } = {}
): string {
  // Handle null/undefined
  if (value === null || value === undefined) {
    if (options.optional) {
      return ''
    }
    throw new Error(
      `[ID-VALIDATION] ❌ ${context}: ID is required but got ${value}`
    )
  }
  
  // Reject ObjectId instance
  detectAndRejectObjectIdInstance(value, context)
  
  // Convert to string for further checks
  const strValue = String(value)
  
  // Reject hex-string
  detectAndRejectHexString(strValue, context)
  
  // Validate alphanumeric format
  if (!VALID_STRING_ID_PATTERN.test(strValue)) {
    throw new Error(
      `[ID-VALIDATION] ❌ ${context}: Invalid ID format "${strValue}". ` +
      `Expected alphanumeric string ID (e.g., "100001", "COMP-001")`
    )
  }
  
  return strValue
}

/**
 * Enforces validation for multiple IDs at once.
 * THROWS on first invalid ID found.
 * 
 * @param ids - Object with field names as keys and ID values
 * @param context - Base context for error messages
 * @returns Object with validated string IDs
 * @throws Error if any validation fails
 * 
 * @example
 * const { companyId, vendorId } = enforceStringIds({
 *   companyId: company.id,
 *   vendorId: vendor.id
 * }, 'createOrder')
 */
export function enforceStringIds<T extends Record<string, unknown>>(
  ids: T,
  context: string,
  optionalFields: string[] = []
): Record<keyof T, string> {
  const result: Record<string, string> = {}
  
  for (const [field, value] of Object.entries(ids)) {
    const isOptional = optionalFields.includes(field)
    result[field] = enforceStringId(value, `${context}.${field}`, { optional: isOptional })
  }
  
  return result as Record<keyof T, string>
}

/**
 * Validates a value WITHOUT throwing, returns validation details.
 * Use this for READ operations where you want to log but not break.
 * 
 * @param value - The value to check
 * @returns Validation result object
 */
export function validateIdFormat(value: unknown): {
  valid: boolean
  value: unknown
  type: 'valid' | 'hex-string' | 'objectid' | 'empty' | 'invalid'
  message: string
} {
  if (value === null || value === undefined) {
    return { valid: false, value, type: 'empty', message: 'ID is null/undefined' }
  }
  
  // Check ObjectId instance
  if (typeof value === 'object') {
    const obj = value as any
    if (
      obj._bsontype === 'ObjectId' ||
      obj._bsontype === 'ObjectID' ||
      (obj.constructor && (obj.constructor.name === 'ObjectId' || obj.constructor.name === 'ObjectID'))
    ) {
      return { valid: false, value, type: 'objectid', message: `ObjectId instance: ${obj.toString()}` }
    }
  }
  
  const strValue = String(value)
  
  if (HEX_24_PATTERN.test(strValue)) {
    return { valid: false, value, type: 'hex-string', message: `Hex-string: ${strValue}` }
  }
  
  if (VALID_STRING_ID_PATTERN.test(strValue)) {
    return { valid: true, value, type: 'valid', message: 'Valid alphanumeric string ID' }
  }
  
  return { valid: false, value, type: 'invalid', message: `Invalid format: ${strValue}` }
}

// ============================================================
// INTEGRATION HELPERS
// ============================================================

/**
 * Pre-create validation hook.
 * Call this before inserting documents to validate all ID fields.
 * 
 * @param data - The document data to validate
 * @param idFields - Array of field names that should be valid string IDs
 * @param context - Context for error messages
 * @throws Error if any ID field is invalid
 * 
 * @example
 * validateBeforeCreate(employeeData, ['companyId', 'locationId'], 'createEmployee')
 */
export function validateBeforeCreate(
  data: Record<string, unknown>,
  idFields: string[],
  context: string
): void {
  for (const field of idFields) {
    if (field in data && data[field]) {
      enforceStringId(data[field], `${context}.${field}`)
    }
  }
}

/**
 * Pre-update validation hook.
 * Call this before updating documents to validate ID fields in updateData.
 * 
 * @param updateData - The update data to validate
 * @param idFields - Array of field names that should be valid string IDs
 * @param context - Context for error messages
 * @throws Error if any ID field is invalid
 */
export function validateBeforeUpdate(
  updateData: Record<string, unknown>,
  idFields: string[],
  context: string
): void {
  for (const field of idFields) {
    if (field in updateData && updateData[field]) {
      enforceStringId(updateData[field], `${context}.${field}`)
    }
  }
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  // Enforcement
  enforceStringId,
  enforceStringIds,
  
  // Validation (non-throwing)
  validateIdFormat,
  
  // Detection (throwing)
  detectAndRejectHexString,
  detectAndRejectObjectIdInstance,
  
  // Integration helpers
  validateBeforeCreate,
  validateBeforeUpdate
}
