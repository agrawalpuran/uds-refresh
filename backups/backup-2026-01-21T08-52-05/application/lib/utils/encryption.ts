/**
 * Encryption utility for sensitive data
 * Uses AES-256 encryption with a secret key from environment variables
 */

import crypto from 'crypto'

// Get encryption key from environment variable
// In production, this should be a strong, randomly generated key stored securely
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'
const ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16 // For AES, this is always 16

// Ensure encryption key is 32 bytes (256 bits) for AES-256
const getKey = (): Buffer => {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  // If key is not 32 bytes, hash it to get 32 bytes
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  }
  return key
}

/**
 * Encrypts a string value
 * @param text - The text to encrypt
 * @returns Encrypted string in format: iv:encryptedData (base64 encoded)
 */
export function encrypt(text: string): string {
  if (!text) return text
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH)
    const key = getKey()
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    
    let encrypted = cipher.update(text, 'utf8', 'base64')
    encrypted += cipher.final('base64')
    
    // Return iv:encryptedData format
    return `${iv.toString('base64')}:${encrypted}`
  } catch (error) {
    console.error('Encryption error:', error)
    throw new Error('Failed to encrypt data')
  }
}

/**
 * Decrypts an encrypted string
 * @param encryptedText - The encrypted text in format: iv:encryptedData
 * @returns Decrypted string
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return encryptedText
  
  // Check if the text is already decrypted (doesn't contain the iv:data format)
  if (!encryptedText.includes(':')) {
    // Might be old unencrypted data, return as is
    return encryptedText
  }
  
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 2) {
      // Invalid format, return as is (might be unencrypted legacy data)
      return encryptedText
    }
    
    const key = getKey()
    
    // Try base64 first (current standard format)
    try {
      const iv = Buffer.from(parts[0], 'base64')
      const encrypted = parts[1]
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
      
      let decrypted = decipher.update(encrypted, 'base64', 'utf8')
      decrypted += decipher.final('utf8')
      
      // Verify decryption succeeded (should not contain ':' and should be different from input)
      if (decrypted && decrypted !== encryptedText && !decrypted.includes(':')) {
        return decrypted
      }
    } catch (base64Error) {
      // Base64 failed, try hex format (legacy format)
      try {
        const iv = Buffer.from(parts[0], 'hex')
        const encrypted = parts[1]
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8')
        decrypted += decipher.final('utf8')
        
        // Verify decryption succeeded
        if (decrypted && decrypted !== encryptedText && !decrypted.includes(':')) {
          return decrypted
        }
      } catch (hexError) {
        // Both formats failed
        console.error('Decryption error (both base64 and hex failed):', {
          base64Error: base64Error instanceof Error ? base64Error.message : base64Error,
          hexError: hexError instanceof Error ? hexError.message : hexError,
        })
      }
    }
    
    // If all decryption attempts failed, return original
    return encryptedText
  } catch (error) {
    console.error('Decryption error:', error)
    // If decryption fails, return original (might be unencrypted legacy data)
    return encryptedText
  }
}

/**
 * Encrypts an object's sensitive fields
 * @param obj - Object to encrypt
 * @param fields - Array of field names to encrypt
 * @returns New object with encrypted fields
 */
export function encryptFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const encrypted = { ...obj }
  for (const field of fields) {
    if (encrypted[field] && typeof encrypted[field] === 'string') {
      encrypted[field] = encrypt(encrypted[field] as string) as T[keyof T]
    }
  }
  return encrypted
}

/**
 * Decrypts an object's sensitive fields
 * @param obj - Object to decrypt
 * @param fields - Array of field names to decrypt
 * @returns New object with decrypted fields
 */
export function decryptFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const decrypted = { ...obj }
  for (const field of fields) {
    if (decrypted[field] && typeof decrypted[field] === 'string') {
      decrypted[field] = decrypt(decrypted[field] as string) as T[keyof T]
    }
  }
  return decrypted
}


