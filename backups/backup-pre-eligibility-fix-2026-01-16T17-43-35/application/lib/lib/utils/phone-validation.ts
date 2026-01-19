/**
 * Phone Number Validation Utility
 * 
 * Validates and normalizes phone numbers for pickup scheduling and shipment creation.
 * Strict validation: rejects invalid/masked values and ensures exactly 10 digits.
 */

export interface PhoneValidationResult {
  isValid: boolean
  normalizedPhone?: string
  error?: string
}

/**
 * Validate and normalize phone number for pickup/shipment operations
 * 
 * Rules:
 * - Allow digits only
 * - Strip +91, leading 0, spaces, hyphens
 * - Must be exactly 10 digits after stripping
 * - Reject masked values (****, XXXXX, etc.)
 * 
 * @param phone Phone number to validate
 * @param strictValidation If true, throws error on invalid phone. If false, returns error in result.
 * @returns Validation result with normalized phone or error
 */
export function validateAndNormalizePhone(phone: string | undefined | null, strictValidation: boolean = true): PhoneValidationResult {
  // Step 1: Check if phone is provided
  if (!phone || phone.trim() === '' || phone === '0000000000') {
    const error = 'Phone number is required'
    if (strictValidation) {
      throw new Error(error)
    }
    return { isValid: false, error }
  }

  // Step 2: Remove all non-numeric characters
  let digitsOnly = phone.replace(/\D/g, '')

  // Step 3: Reject masked/obfuscated values
  if (digitsOnly.includes('*') || digitsOnly.includes('X') || /^9{6,}/.test(digitsOnly)) {
    const error = `Phone number appears to be masked or invalid: ${phone}`
    if (strictValidation) {
      throw new Error(error)
    }
    return { isValid: false, error }
  }

  // Step 4: Strip leading country code "91" if present
  if (digitsOnly.length >= 12 && digitsOnly.startsWith('91')) {
    digitsOnly = digitsOnly.substring(2)
  }

  // Step 5: Strip leading "0" if present
  if (digitsOnly.length > 10 && digitsOnly.startsWith('0')) {
    digitsOnly = digitsOnly.substring(1)
  }

  // Step 6: Validate final length must be exactly 10 digits
  if (digitsOnly.length !== 10) {
    const error = `Phone number must be exactly 10 digits after normalization. Got: ${digitsOnly.length} digits from "${phone}"`
    if (strictValidation) {
      throw new Error(error)
    }
    return { isValid: false, error }
  }

  // Step 7: Validate only digits
  if (!/^\d{10}$/.test(digitsOnly)) {
    const error = `Phone number contains invalid characters: ${phone}`
    if (strictValidation) {
      throw new Error(error)
    }
    return { isValid: false, error }
  }

  return {
    isValid: true,
    normalizedPhone: digitsOnly,
  }
}

