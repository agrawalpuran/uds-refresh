/**
 * Client-side decryption utility for sensitive employee data
 * 
 * SECURITY NOTE: This utility decrypts data in the browser.
 * The encryption key must be available as NEXT_PUBLIC_ENCRYPTION_KEY environment variable.
 * 
 * Decryption should only be used in frontend components for authorized users:
 * - Location Admin (for their location's employees)
 * - Company Admin (for their company's employees)
 * - Employee themselves (for their own data)
 */

// Get encryption key from environment variable (must be prefixed with NEXT_PUBLIC_ for client-side access)
const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'
const ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16

// Ensure encryption key is 32 bytes (256 bits) for AES-256
// Matches backend logic: crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
const getKey = async (): Promise<CryptoKey> => {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(ENCRYPTION_KEY)
  
  let keyBuffer: ArrayBuffer
  
  if (keyData.length === 32) {
    keyBuffer = keyData.buffer
  } else {
    // Hash to get 32 bytes using SHA-256 (matches backend)
    const hashBuffer = await crypto.subtle.digest('SHA-256', keyData)
    keyBuffer = hashBuffer
  }
  
  // Import key for AES-CBC
  return crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-CBC' },
    false,
    ['decrypt']
  )
}

/**
 * Decrypts an encrypted string using Web Crypto API (browser-compatible)
 * @param encryptedText - The encrypted text in format: iv:encryptedData (base64)
 * @returns Decrypted string
 */
export async function decrypt(encryptedText: string): Promise<string> {
  if (!encryptedText) return encryptedText
  
  // Check if the text is already decrypted (doesn't contain the iv:data format)
  if (!encryptedText.includes(':')) {
    return encryptedText
  }
  
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 2) {
      return encryptedText
    }
    
    // Get key (handles key derivation if needed)
    const key = await getKey()
    
    // Decode IV and encrypted data from base64
    const iv = Uint8Array.from(atob(parts[0]), c => c.charCodeAt(0))
    const encrypted = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0))
    
    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-CBC',
        iv: iv
      },
      key,
      encrypted
    )
    
    // Convert to string
    const decoder = new TextDecoder()
    const decryptedText = decoder.decode(decrypted)
    
    // Verify decryption succeeded
    if (decryptedText && decryptedText !== encryptedText && !decryptedText.includes(':')) {
      return decryptedText
    }
    
    return encryptedText
  } catch (error) {
    console.warn('Decryption error:', error)
    return encryptedText
  }
}

/**
 * Synchronous decrypt function (for cases where async is not possible)
 * Uses a fallback implementation
 */
export function decryptSync(encryptedText: string): string {
  if (!encryptedText || !encryptedText.includes(':')) {
    return encryptedText
  }
  
  // For synchronous decryption, we need to use a library or implement a workaround
  // Since Web Crypto API is async, we'll return encrypted text and log a warning
  // Components should use the async decrypt() function instead
  console.warn('decryptSync called - use async decrypt() instead for proper decryption')
  return encryptedText
}

/**
 * Decrypts an object's sensitive fields
 * @param obj - Object to decrypt
 * @param fields - Array of field names to decrypt
 * @returns New object with decrypted fields
 */
export async function decryptFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): Promise<T> {
  const decrypted = { ...obj }
  
  await Promise.all(
    fields.map(async (field) => {
      if (decrypted[field] && typeof decrypted[field] === 'string') {
        decrypted[field] = (await decrypt(decrypted[field] as string)) as T[keyof T]
      }
    })
  )
  
  return decrypted
}

/**
 * Decrypts employee sensitive fields
 * @param employee - Employee object
 * @returns Employee object with decrypted sensitive fields
 */
export async function decryptEmployee(employee: any): Promise<any> {
  if (!employee) return employee
  
  const sensitiveFields = ['email', 'mobile', 'firstName', 'lastName', 'designation']
  const addressFields = ['address_line_1', 'address_line_2', 'address_line_3', 'city', 'state', 'pincode']
  
  const decrypted = { ...employee }
  
  // Decrypt sensitive fields
  for (const field of sensitiveFields) {
    if (decrypted[field] && typeof decrypted[field] === 'string' && decrypted[field].includes(':')) {
      try {
        decrypted[field] = await decrypt(decrypted[field])
      } catch (error) {
        console.warn(`Failed to decrypt field ${field}:`, error)
      }
    }
  }
  
  // Decrypt address fields
  for (const field of addressFields) {
    if (decrypted[field] && typeof decrypted[field] === 'string' && decrypted[field].includes(':')) {
      try {
        decrypted[field] = await decrypt(decrypted[field])
      } catch (error) {
        console.warn(`Failed to decrypt address field ${field}:`, error)
      }
    }
  }
  
  return decrypted
}

/**
 * Decrypts an array of employees
 * @param employees - Array of employee objects
 * @returns Array of employees with decrypted sensitive fields
 */
export async function decryptEmployees(employees: any[]): Promise<any[]> {
  if (!employees || !Array.isArray(employees)) return employees
  
  return Promise.all(employees.map(employee => decryptEmployee(employee)))
}
