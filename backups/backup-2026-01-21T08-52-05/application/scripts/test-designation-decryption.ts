/**
 * Script to test decryption of the encrypted designation value
 */

const crypto = require('crypto')

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'
const IV_LENGTH = 16

function getKey(): Buffer {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  }
  return key
}

function decryptBase64(encryptedText: string): string {
  if (!encryptedText || !encryptedText.includes(':')) return encryptedText
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 2) return encryptedText
    const iv = Buffer.from(parts[0], 'base64')
    const encrypted = parts[1]
    const key = getKey()
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = decipher.update(encrypted, 'base64', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    console.error('Base64 decryption error:', error)
    return encryptedText
  }
}

function decryptHex(encryptedText: string): string {
  if (!encryptedText || !encryptedText.includes(':')) return encryptedText
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 2) return encryptedText
    const iv = Buffer.from(parts[0], 'hex')
    const encrypted = parts[1]
    const key = getKey()
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    console.error('Hex decryption error:', error)
    return encryptedText
  }
}

const encryptedValue = '285b3e07bc667de9dfc2f7dfe2b0d29d:d2d064785637ae553e4d29bc6da435a3'

console.log('🔍 Testing decryption of:', encryptedValue)
console.log('')

// Try base64
console.log('📝 Trying Base64 decryption...')
try {
  const decryptedBase64 = decryptBase64(encryptedValue)
  console.log(`   Result: ${decryptedBase64}`)
  if (decryptedBase64 !== encryptedValue && !decryptedBase64.includes(':')) {
    console.log('   ✅ Base64 decryption successful!')
  } else {
    console.log('   ❌ Base64 decryption failed or returned encrypted value')
  }
} catch (error: any) {
  console.log(`   ❌ Base64 decryption error: ${error.message}`)
}

console.log('')

// Try hex
console.log('📝 Trying Hex decryption...')
try {
  const decryptedHex = decryptHex(encryptedValue)
  console.log(`   Result: ${decryptedHex}`)
  if (decryptedHex !== encryptedValue && !decryptedHex.includes(':')) {
    console.log('   ✅ Hex decryption successful!')
  } else {
    console.log('   ❌ Hex decryption failed or returned encrypted value')
  }
} catch (error: any) {
  console.log(`   ❌ Hex decryption error: ${error.message}`)
}

