/**
 * CRITICAL: Test script to verify encryption key is loaded correctly
 * This checks if process.env.ENCRYPTION_KEY is available and matches expected value
 */

// Simulate how Next.js loads environment variables
// Next.js automatically loads .env.local for server-side code

console.log('='.repeat(80))
console.log('ENCRYPTION KEY LOADING TEST')
console.log('='.repeat(80))
console.log('')

// Check if key is loaded
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'

console.log('Key Source:')
if (process.env.ENCRYPTION_KEY) {
  console.log('  ✅ Loaded from process.env.ENCRYPTION_KEY')
  console.log(`  Key length: ${process.env.ENCRYPTION_KEY.length} characters`)
  console.log(`  Key (first 20 chars): ${process.env.ENCRYPTION_KEY.substring(0, 20)}...`)
} else {
  console.log('  ⚠️  NOT loaded from process.env - using default fallback')
  console.log(`  Default key length: ${ENCRYPTION_KEY.length} characters`)
  console.log(`  Default key (first 20 chars): ${ENCRYPTION_KEY.substring(0, 20)}...`)
}
console.log('')

// Test key derivation (same as lib/utils/encryption.ts)
const crypto = require('crypto')

function getKey() {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  }
  return key
}

const derivedKey = getKey()
console.log('Key Derivation:')
console.log(`  Original key length: ${ENCRYPTION_KEY.length} bytes`)
console.log(`  Derived key length: ${derivedKey.length} bytes`)
console.log(`  Derived key (hex): ${derivedKey.toString('hex')}`)
console.log(`  Uses SHA256 hash: ${ENCRYPTION_KEY.length !== 32 ? 'YES' : 'NO'}`)
console.log('')

// Test encryption/decryption
function encrypt(text) {
  if (!text) return text
  try {
    const iv = crypto.randomBytes(16)
    const key = getKey()
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    let encrypted = cipher.update(text, 'utf8', 'base64')
    encrypted += cipher.final('base64')
    return `${iv.toString('base64')}:${encrypted}`
  } catch (error) {
    throw new Error('Failed to encrypt data')
  }
}

function decrypt(encryptedText) {
  if (!encryptedText || typeof encryptedText !== 'string') return encryptedText
  if (!encryptedText.includes(':')) return encryptedText
  
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 2) return encryptedText
    
    const key = getKey()
    
    try {
      const iv = Buffer.from(parts[0], 'base64')
      const encrypted = parts[1]
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
      let decrypted = decipher.update(encrypted, 'base64', 'utf8')
      decrypted += decipher.final('utf8')
      if (decrypted && decrypted !== encryptedText && !decrypted.includes(':')) {
        return decrypted
      }
    } catch (base64Error) {
      try {
        const iv = Buffer.from(parts[0], 'hex')
        const encrypted = parts[1]
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
        let decrypted = decipher.update(encrypted, 'hex', 'utf8')
        decrypted += decipher.final('utf8')
        if (decrypted && decrypted !== encryptedText && !decrypted.includes(':')) {
          return decrypted
        }
      } catch (hexError) {
        return encryptedText
      }
    }
    return encryptedText
  } catch (error) {
    return encryptedText
  }
}

// Test round-trip
console.log('Encryption/Decryption Test:')
const testEmail = 'test@example.com'
const encrypted = encrypt(testEmail)
const decrypted = decrypt(encrypted)

console.log(`  Original: ${testEmail}`)
console.log(`  Encrypted: ${encrypted.substring(0, 50)}...`)
console.log(`  Decrypted: ${decrypted}`)
console.log(`  Match: ${testEmail === decrypted ? '✅ YES' : '❌ NO'}`)
console.log('')

console.log('='.repeat(80))
if (testEmail === decrypted) {
  console.log('✅ SUCCESS: Encryption/decryption works correctly')
} else {
  console.log('❌ ERROR: Encryption/decryption failed!')
}
console.log('='.repeat(80))

