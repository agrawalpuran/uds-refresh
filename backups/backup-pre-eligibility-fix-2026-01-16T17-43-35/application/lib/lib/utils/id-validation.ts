/**
 * ============================================================
 * 🟣 DELIVERABLE 3 — VALIDATION LAYER (NON-BREAKING)
 * ============================================================
 * 
 * ID Validation Module for UDS Application
 * 
 * This module provides utilities to detect and validate ID formats
 * without throwing errors in production. It logs warnings for
 * developers and can be configured for stricter enforcement later.
 * 
 * FEATURES:
 *   - detectHexString(value) - Detects 24-char hex strings
 *   - detectObjectIdInstance(value) - Detects MongoDB ObjectId instances
 *   - validateStringId(value) - Validates proper 6-digit string ID
 *   - warnOnInvalidId(value, context) - Logs warning without throwing
 *   - assertValidStringId(value, context) - Throws in strict mode
 * 
 * USAGE:
 *   import { validateStringId, warnOnInvalidId } from '@/lib/utils/id-validation'
 * 
 *   // Non-breaking warning (default)
 *   warnOnInvalidId(companyId, 'createEmployee.companyId')
 * 
 *   // Get validation result
 *   const result = validateStringId(vendorId)
 *   if (!result.valid) console.warn(result.message)
 * 
 *   // Strict mode (throws error)
 *   assertValidStringId(productId, 'createOrder.productId')
 */

// ============================================================
// CONFIGURATION
// ============================================================

/**
 * Configuration for ID validation behavior
 */
export const ID_VALIDATION_CONFIG = {
  /**
   * When true, assertValidStringId will throw errors.
   * When false, it will only log warnings.
   * Default: false (non-breaking)
   */
  strictMode: false,
  
  /**
   * When true, all warnings are logged to console.
   * Default: true in development, false in production
   */
  enableLogging: process.env.NODE_ENV !== 'production',
  
  /**
   * Prefix for all log messages
   */
  logPrefix: '[ID-VALIDATION]',
  
  /**
   * Valid string ID pattern (6 digits)
   */
  validIdPattern: /^\d{6}$/,
  
  /**
   * MongoDB ObjectId hex pattern (24 hex chars)
   */
  hexPattern: /^[0-9a-fA-F]{24}$/,
}

// ============================================================
// DETECTION FUNCTIONS
// ============================================================

/**
 * Detects if a value is a 24-character hexadecimal string
 * (typical MongoDB ObjectId string format)
 * 
 * @param value - The value to check
 * @returns true if value is a 24-char hex string
 * 
 * @example
 * detectHexString("507f1f77bcf86cd799439011") // true
 * detectHexString("100001") // false
 * detectHexString(123) // false
 */
export function detectHexString(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return ID_VALIDATION_CONFIG.hexPattern.test(value)
}

/**
 * Detects if a value is a MongoDB ObjectId instance
 * 
 * @param value - The value to check
 * @returns true if value is an ObjectId instance
 * 
 * @example
 * detectObjectIdInstance(new mongoose.Types.ObjectId()) // true
 * detectObjectIdInstance("507f1f77bcf86cd799439011") // false
 */
export function detectObjectIdInstance(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  
  const obj = value as any
  
  // Check BSON type marker
  if (obj._bsontype === 'ObjectId' || obj._bsontype === 'ObjectID') {
    return true
  }
  
  // Check constructor name
  if (obj.constructor && 
      (obj.constructor.name === 'ObjectId' || obj.constructor.name === 'ObjectID')) {
    return true
  }
  
  // Check for ObjectId methods
  if (typeof obj.toHexString === 'function' && 
      typeof obj.getTimestamp === 'function') {
    return true
  }
  
  return false
}

/**
 * Detects if a value is either a hex-string or ObjectId instance
 * 
 * @param value - The value to check
 * @returns true if value is hex-string or ObjectId
 */
export function detectInvalidIdFormat(value: unknown): boolean {
  return detectHexString(value) || detectObjectIdInstance(value)
}

// ============================================================
// VALIDATION FUNCTIONS
// ============================================================

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean
  value: unknown
  type: 'valid-string-id' | 'hex-string' | 'objectid' | 'empty' | 'invalid-format'
  message: string
}

/**
 * Validates if a value is a proper 6-digit string ID
 * 
 * @param value - The value to validate
 * @returns ValidationResult with details
 * 
 * @example
 * validateStringId("100001") // { valid: true, type: 'valid-string-id', ... }
 * validateStringId("507f1f77bcf86cd799439011") // { valid: false, type: 'hex-string', ... }
 */
export function validateStringId(value: unknown): ValidationResult {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return {
      valid: false,
      value,
      type: 'empty',
      message: 'ID value is null or undefined'
    }
  }
  
  // Check for ObjectId instance
  if (detectObjectIdInstance(value)) {
    return {
      valid: false,
      value,
      type: 'objectid',
      message: `Expected string ID, got ObjectId instance: ${String(value)}`
    }
  }
  
  // Convert to string for further checks
  const strValue = String(value)
  
  // Check for hex-string (ObjectId format)
  if (detectHexString(strValue)) {
    return {
      valid: false,
      value,
      type: 'hex-string',
      message: `Expected 6-digit string ID, got 24-char hex string: "${strValue}"`
    }
  }
  
  // Check for valid 6-digit format
  if (ID_VALIDATION_CONFIG.validIdPattern.test(strValue)) {
    return {
      valid: true,
      value,
      type: 'valid-string-id',
      message: 'Valid string ID'
    }
  }
  
  // Invalid format
  return {
    valid: false,
    value,
    type: 'invalid-format',
    message: `Invalid ID format: "${strValue}". Expected 6-digit string (e.g., "100001")`
  }
}

// ============================================================
// WARNING/ASSERTION FUNCTIONS
// ============================================================

/**
 * Logs a warning if the value is not a valid string ID.
 * Does NOT throw an error (non-breaking).
 * 
 * @param value - The value to check
 * @param context - Context string for the log message (e.g., "createEmployee.companyId")
 * @returns The validation result
 * 
 * @example
 * warnOnInvalidId(company._id, 'createEmployee.companyId')
 * // Logs: [ID-VALIDATION] ⚠️ createEmployee.companyId: Expected string ID, got ObjectId instance
 */
export function warnOnInvalidId(value: unknown, context: string): ValidationResult {
  const result = validateStringId(value)
  
  if (!result.valid && ID_VALIDATION_CONFIG.enableLogging) {
    console.warn(
      `${ID_VALIDATION_CONFIG.logPrefix} ⚠️ ${context}: ${result.message}`
    )
  }
  
  return result
}

/**
 * Asserts that a value is a valid string ID.
 * In strict mode: throws an error if invalid.
 * In non-strict mode: logs a warning only.
 * 
 * @param value - The value to check
 * @param context - Context string for the error/log message
 * @returns The value if valid (type assertion)
 * @throws Error if invalid AND strictMode is enabled
 * 
 * @example
 * const validId = assertValidStringId(companyId, 'createOrder.companyId')
 */
export function assertValidStringId(value: unknown, context: string): string {
  const result = validateStringId(value)
  
  if (!result.valid) {
    const errorMessage = `${ID_VALIDATION_CONFIG.logPrefix} ❌ ${context}: ${result.message}`
    
    if (ID_VALIDATION_CONFIG.strictMode) {
      throw new Error(errorMessage)
    } else if (ID_VALIDATION_CONFIG.enableLogging) {
      console.warn(errorMessage)
    }
  }
  
  return String(value)
}

/**
 * Batch validation for multiple IDs
 * 
 * @param ids - Object with field names as keys and ID values
 * @param context - Base context for logging
 * @returns Object with validation results for each field
 * 
 * @example
 * validateMultipleIds({
 *   companyId: company.id,
 *   employeeId: employee.id,
 *   vendorId: vendor.id
 * }, 'createOrder')
 */
export function validateMultipleIds(
  ids: Record<string, unknown>,
  context: string
): Record<string, ValidationResult> {
  const results: Record<string, ValidationResult> = {}
  
  for (const [field, value] of Object.entries(ids)) {
    results[field] = warnOnInvalidId(value, `${context}.${field}`)
  }
  
  return results
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Converts a value to a string ID, with validation.
 * If the value is an ObjectId or hex-string, logs a warning.
 * 
 * @param value - The value to convert
 * @param context - Context for logging
 * @returns The string representation
 */
export function toStringId(value: unknown, context: string): string {
  warnOnInvalidId(value, context)
  
  if (detectObjectIdInstance(value)) {
    return (value as any).toString()
  }
  
  return String(value || '')
}

/**
 * Checks if a value needs migration (is ObjectId or hex-string)
 * 
 * @param value - The value to check
 * @returns true if value should be migrated to string ID
 */
export function needsIdMigration(value: unknown): boolean {
  if (!value) return false
  
  const result = validateStringId(value)
  return result.type === 'objectid' || result.type === 'hex-string'
}

// ============================================================
// CONFIGURATION HELPERS
// ============================================================

/**
 * Enable strict mode (throws errors on invalid IDs)
 * Typically used in test environments
 */
export function enableStrictMode(): void {
  ID_VALIDATION_CONFIG.strictMode = true
  console.log(`${ID_VALIDATION_CONFIG.logPrefix} Strict mode ENABLED`)
}

/**
 * Disable strict mode (warnings only)
 */
export function disableStrictMode(): void {
  ID_VALIDATION_CONFIG.strictMode = false
  console.log(`${ID_VALIDATION_CONFIG.logPrefix} Strict mode DISABLED`)
}

/**
 * Enable/disable logging
 */
export function setLogging(enabled: boolean): void {
  ID_VALIDATION_CONFIG.enableLogging = enabled
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  // Detection
  detectHexString,
  detectObjectIdInstance,
  detectInvalidIdFormat,
  
  // Validation
  validateStringId,
  validateMultipleIds,
  
  // Warning/Assertion
  warnOnInvalidId,
  assertValidStringId,
  
  // Utilities
  toStringId,
  needsIdMigration,
  
  // Configuration
  enableStrictMode,
  disableStrictMode,
  setLogging,
  ID_VALIDATION_CONFIG
}
