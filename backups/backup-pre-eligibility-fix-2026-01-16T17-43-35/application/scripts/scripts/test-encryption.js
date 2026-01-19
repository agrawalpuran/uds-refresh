/**
 * Test script to verify encryption is working
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// Read .env.local file manually
let ENCRYPTION_KEY = 'default-encryption-key-change-in-production-32-chars!!'
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const match = envContent.match(/ENCRYPTION_KEY=(.+)/)
    if (match) {
      ENCRYPTION_KEY = match[1].trim()
    }
  }
} catch (error) {
  console.warn('Could not read .env.local, using default key')
}

// Also check process.env (in case it's set)
ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || ENCRYPTION_KEY
const ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16

function getKey() {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  }
  return key
}

function encrypt(text) {
  if (!text) return text
  const iv = crypto.randomBytes(IV_LENGTH)
  const key = getKey()
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(text, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  return `${iv.toString('base64')}:${encrypted}`
}

function decrypt(encryptedText) {
  if (!encryptedText || !encryptedText.includes(':')) return encryptedText
  const parts = encryptedText.split(':')
  if (parts.length !== 2) return encryptedText
  const iv = Buffer.from(parts[0], 'base64')
  const encrypted = parts[1]
  const key = getKey()
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  let decrypted = decipher.update(encrypted, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

// Test
console.log('🧪 Testing Encryption Setup...\n')
console.log('Encryption Key:', ENCRYPTION_KEY.substring(0, 20) + '...' + ENCRYPTION_KEY.substring(ENCRYPTION_KEY.length - 10))
console.log('Key Length:', ENCRYPTION_KEY.length, 'characters\n')

const testData = 'test@example.com'
const encrypted = encrypt(testData)
const decrypted = decrypt(encrypted)

console.log('Test Data:', testData)
console.log('Encrypted:', encrypted.substring(0, 50) + '...')
console.log('Decrypted:', decrypted)
console.log('Match:', testData === decrypted ? '✅ PASS' : '❌ FAIL')

if (testData === decrypted) {
  console.log('\n✅ Encryption is working correctly!')
  process.exit(0)
} else {
  console.log('\n❌ Encryption test failed!')
  process.exit(1)
}

