/**
 * FORENSIC ANALYSIS: Compare encryption/decryption between script and application
 * This will identify EXACTLY what's different
 */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

// Read .env.local
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
  console.warn('Could not read .env.local')
}

// Also check process.env
ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || ENCRYPTION_KEY

console.log('='.repeat(80))
console.log('FORENSIC ENCRYPTION ANALYSIS')
console.log('='.repeat(80))
console.log('')

console.log('Encryption Key:')
console.log(`  Source: ${process.env.ENCRYPTION_KEY ? 'process.env' : '.env.local or default'}`)
console.log(`  Value: ${ENCRYPTION_KEY}`)
console.log(`  Length: ${ENCRYPTION_KEY.length} characters`)
console.log('')

// Method 1: Script method (create-diageo-and-admin.js)
function getKeyScript() {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  }
  return key
}

function encryptScript(text) {
  if (!text) return ''
  const iv = crypto.randomBytes(16)
  const key = getKeyScript()
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  return iv.toString('base64') + ':' + encrypted
}

function decryptScript(encryptedText) {
  if (!encryptedText || typeof encryptedText !== 'string') return ''
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 2) return ''
    
    const key = getKeyScript()
    try {
      const iv = Buffer.from(parts[0], 'base64')
      const encrypted = parts[1]
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
      let decrypted = decipher.update(encrypted, 'base64', 'utf8')
      decrypted += decipher.final('utf8')
      return decrypted
    } catch {
      // Try hex
      const iv = Buffer.from(parts[0], 'hex')
      const encrypted = parts[1]
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      return decrypted
    }
  } catch (error) {
    return ''
  }
}

// Method 2: Application method (lib/utils/encryption.ts)
function getKeyApp() {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  }
  return key
}

function encryptApp(text) {
  if (!text) return text
  try {
    const iv = crypto.randomBytes(16)
    const key = getKeyApp()
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    let encrypted = cipher.update(text, 'utf8', 'base64')
    encrypted += cipher.final('base64')
    return `${iv.toString('base64')}:${encrypted}`
  } catch (error) {
    throw new Error('Failed to encrypt data')
  }
}

function decryptApp(encryptedText) {
  if (!encryptedText) return encryptedText
  if (!encryptedText.includes(':')) return encryptedText
  
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 2) return encryptedText
    
    const key = getKeyApp()
    
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

// Test with swapnil.jain@diageo.com
const testEmail = 'swapnil.jain@diageo.com'
const normalizedEmail = testEmail.trim().toLowerCase()

console.log('Test Email:')
console.log(`  Original: "${testEmail}"`)
console.log(`  Normalized: "${normalizedEmail}"`)
console.log('')

// Encrypt with script method
const encryptedScript = encryptScript(normalizedEmail)
console.log('Script Method (create-diageo-and-admin.js):')
console.log(`  Encrypted: ${encryptedScript.substring(0, 50)}...`)
console.log(`  Format: base64:base64`)
const decryptedScript = decryptScript(encryptedScript)
console.log(`  Decrypted: ${decryptedScript}`)
console.log(`  Match: ${decryptedScript === normalizedEmail ? '✅ YES' : '❌ NO'}`)
console.log('')

// Encrypt with app method
const encryptedApp = encryptApp(normalizedEmail)
console.log('Application Method (lib/utils/encryption.ts):')
console.log(`  Encrypted: ${encryptedApp.substring(0, 50)}...`)
console.log(`  Format: base64:base64`)
const decryptedApp = decryptApp(encryptedApp)
console.log(`  Decrypted: ${decryptedApp}`)
console.log(`  Match: ${decryptedApp === normalizedEmail ? '✅ YES' : '❌ NO'}`)
console.log('')

// Cross-test: Can script decrypt app-encrypted?
console.log('Cross-Testing:')
const scriptDecryptsApp = decryptScript(encryptedApp)
console.log(`  Script decrypts App-encrypted: ${scriptDecryptsApp === normalizedEmail ? '✅ YES' : '❌ NO'}`)
if (scriptDecryptsApp !== normalizedEmail) {
  console.log(`    Result: "${scriptDecryptsApp}"`)
}

const appDecryptsScript = decryptApp(encryptedScript)
console.log(`  App decrypts Script-encrypted: ${appDecryptsScript === normalizedEmail ? '✅ YES' : '❌ NO'}`)
if (appDecryptsScript !== normalizedEmail) {
  console.log(`    Result: "${appDecryptsScript}"`)
}
console.log('')

// Key comparison
const keyScript = getKeyScript()
const keyApp = getKeyApp()
console.log('Key Comparison:')
console.log(`  Script key (hex): ${keyScript.toString('hex')}`)
console.log(`  App key (hex): ${keyApp.toString('hex')}`)
console.log(`  Keys match: ${keyScript.toString('hex') === keyApp.toString('hex') ? '✅ YES' : '❌ NO'}`)
console.log('')

console.log('='.repeat(80))
if (scriptDecryptsApp === normalizedEmail && appDecryptsScript === normalizedEmail) {
  console.log('✅ SUCCESS: Script and App encryption/decryption are COMPATIBLE')
} else {
  console.log('❌ ERROR: Script and App encryption/decryption are INCOMPATIBLE')
  console.log('   This is the root cause of login failures!')
}
console.log('='.repeat(80))

