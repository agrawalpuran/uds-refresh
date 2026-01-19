/**
 * Test script to verify encryption/decryption key consistency
 * This checks if the utility and scripts use the same key derivation
 */

const crypto = require('crypto')

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'

console.log('='.repeat(80))
console.log('ENCRYPTION KEY CONSISTENCY TEST')
console.log('='.repeat(80))
console.log(`\nEncryption Key: ${ENCRYPTION_KEY}`)
console.log(`Key Length: ${ENCRYPTION_KEY.length} characters`)
console.log(`Key Length (bytes): ${Buffer.from(ENCRYPTION_KEY, 'utf8').length} bytes`)
console.log('')

// Method 1: Utility method (lib/utils/encryption.ts)
function getKeyUtility() {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  // If key is not 32 bytes, hash it to get 32 bytes
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  }
  return key
}

// Method 2: Script method (FIXED - now matches utility)
function getKeyScript() {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  // If key is not 32 bytes, hash it to get 32 bytes (same as utility)
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  }
  return key
}

const keyUtility = getKeyUtility()
const keyScript = getKeyScript()

console.log('Key Derivation Methods:')
console.log('─'.repeat(80))
console.log(`Utility Method (lib/utils/encryption.ts):`)
console.log(`  Key Length: ${keyUtility.length} bytes`)
console.log(`  Key (hex): ${keyUtility.toString('hex')}`)
console.log(`  Uses SHA256 hash: ${Buffer.from(ENCRYPTION_KEY, 'utf8').length !== 32 ? 'YES' : 'NO'}`)
console.log('')
console.log(`Script Method (scripts/*.js - FIXED):`)
console.log(`  Key Length: ${keyScript.length} bytes`)
console.log(`  Key (hex): ${keyScript.toString('hex')}`)
console.log(`  Uses SHA256 hash: ${Buffer.from(ENCRYPTION_KEY, 'utf8').length !== 32 ? 'YES' : 'NO'}`)
console.log('')

// Check if keys match
const keysMatch = keyUtility.equals(keyScript)
console.log('='.repeat(80))
if (keysMatch) {
  console.log('✅ SUCCESS: Keys match! Encryption/decryption will work correctly.')
} else {
  console.log('❌ ERROR: Keys DO NOT match!')
  console.log('')
  console.log('This means:')
  console.log('  - Data encrypted by lib/utils/encryption.ts CANNOT be decrypted by scripts')
  console.log('  - Data encrypted by scripts CANNOT be decrypted by lib/utils/encryption.ts')
  console.log('')
  console.log('FIX REQUIRED:')
  console.log('  Scripts must use the same key derivation as lib/utils/encryption.ts')
  console.log('  Use: crypto.createHash(\'sha256\').update(ENCRYPTION_KEY).digest()')
  console.log('  Instead of: Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32))')
}
console.log('='.repeat(80))

