/**
 * Script to generate a secure encryption key for the application
 * Run: node scripts/generate-encryption-key.js
 */

const crypto = require('crypto')

// Generate a 32-byte (256-bit) random key
const key = crypto.randomBytes(32).toString('hex')

console.log('🔐 Generated Encryption Key:')
console.log('')
console.log(key)
console.log('')
console.log('📝 Add this to your .env.local file:')
console.log(`ENCRYPTION_KEY=${key}`)
console.log('')
console.log('⚠️  IMPORTANT:')
console.log('   - Keep this key secure and never commit it to version control')
console.log('   - Use the same key across all environments for the same database')
console.log('   - If you lose this key, encrypted data cannot be decrypted')
console.log('   - Store this key in a secure password manager or secret management system')


