/**
 * Diagnose Shiprocket authentication issue
 * Check what credentials are being used
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

let MONGODB_URI = process.env.MONGODB_URI
let ENCRYPTION_KEY = process.env.ENCRYPTION_KEY

if (!MONGODB_URI || !ENCRYPTION_KEY) {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) MONGODB_URI = mongoMatch[1].trim()
    const encryptionMatch = envContent.match(/ENCRYPTION_KEY=(.+)/)
    if (encryptionMatch) ENCRYPTION_KEY = encryptionMatch[1].trim()
  }
}

// Decryption function (same as in lib/utils/encryption.ts)
function decrypt(encryptedText) {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is not set')
  }
  
  if (!encryptedText || typeof encryptedText !== 'string') {
    return encryptedText
  }
  
  // Check if the text appears to be encrypted (contains ':')
  if (!encryptedText.includes(':')) {
    // Not encrypted, return as-is
    return encryptedText
  }
  
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 2) {
      // Invalid format, return as-is
      return encryptedText
    }
    
    const iv = Buffer.from(parts[0], 'hex')
    const encryptedData = Buffer.from(parts[1], 'hex')
    
    // Create key from ENCRYPTION_KEY (32 bytes for AES-256)
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = decipher.update(encryptedData)
    decrypted = Buffer.concat([decrypted, decipher.final()])
    
    return decrypted.toString('utf8')
  } catch (error) {
    console.error('Decryption failed:', error.message)
    return encryptedText
  }
}

async function diagnoseAuth() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
  console.log('║     DIAGNOSE SHIPROCKET AUTHENTICATION                                      ║')
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝')
  console.log()

  await mongoose.connect(MONGODB_URI)
  console.log('✅ Connected to MongoDB\n')

  const db = mongoose.connection.db
  const providersCollection = db.collection('shipmentserviceproviders')
  const companyProvidersCollection = db.collection('companyshippingproviders')

  const PROVIDER_ID = 'PROV_MJXY0QMESF'

  // Get ShipmentServiceProvider with authConfig
  const provider = await providersCollection.findOne({ providerId: PROVIDER_ID })
  
  console.log('═══════════════════════════════════════════════════════════════════════════════')
  console.log('1. ShipmentServiceProvider authConfig:')
  console.log('═══════════════════════════════════════════════════════════════════════════════')
  console.log('   Provider ID:', provider?.providerId)
  console.log('   Provider Code:', provider?.providerCode)
  console.log('   Has authConfig:', !!provider?.authConfig)
  console.log('   authType:', provider?.authConfig?.authType)
  console.log()
  
  if (provider?.authConfig?.credentials) {
    const creds = provider.authConfig.credentials
    console.log('   Raw credentials.username (first 50 chars):', creds.username?.substring(0, 50) + '...')
    console.log('   Raw credentials.password (first 50 chars):', creds.password?.substring(0, 50) + '...')
    
    // Decrypt
    const decryptedUsername = decrypt(creds.username)
    const decryptedPassword = decrypt(creds.password)
    
    console.log()
    console.log('   Decrypted username (email):', decryptedUsername ? decryptedUsername.substring(0, 10) + '...' : 'FAILED')
    console.log('   Decrypted password:', decryptedPassword ? '****' + decryptedPassword.substring(Math.max(0, decryptedPassword.length - 4)) : 'FAILED')
    console.log('   Username looks like email:', decryptedUsername?.includes('@') ? 'YES' : 'NO')
  }

  // Get CompanyShippingProvider (AKASA AIR)
  console.log('\n═══════════════════════════════════════════════════════════════════════════════')
  console.log('2. CompanyShippingProvider (AKASA AIR):')
  console.log('═══════════════════════════════════════════════════════════════════════════════')
  
  const akasaCsp = await companyProvidersCollection.findOne({ companyId: '100002' })
  
  if (akasaCsp) {
    console.log('   Company ID:', akasaCsp.companyId)
    console.log('   Provider ID:', akasaCsp.providerId)
    console.log('   Has apiKey:', !!akasaCsp.apiKey)
    console.log('   Has apiSecret:', !!akasaCsp.apiSecret)
    
    if (akasaCsp.apiKey && akasaCsp.apiSecret) {
      const decryptedApiKey = decrypt(akasaCsp.apiKey)
      const decryptedApiSecret = decrypt(akasaCsp.apiSecret)
      
      console.log()
      console.log('   Decrypted apiKey (email):', decryptedApiKey ? decryptedApiKey.substring(0, 10) + '...' : 'FAILED')
      console.log('   Decrypted apiSecret:', decryptedApiSecret ? '****' + decryptedApiSecret.substring(Math.max(0, decryptedApiSecret.length - 4)) : 'FAILED')
    }
  }

  // Get CompanyShippingProvider (ICICI)
  console.log('\n═══════════════════════════════════════════════════════════════════════════════')
  console.log('3. CompanyShippingProvider (ICICI BANK):')
  console.log('═══════════════════════════════════════════════════════════════════════════════')
  
  const iciciCsp = await companyProvidersCollection.findOne({ companyId: '100004' })
  
  if (iciciCsp) {
    console.log('   Company ID:', iciciCsp.companyId)
    console.log('   Provider ID:', iciciCsp.providerId)
    console.log('   Has apiKey:', !!iciciCsp.apiKey)
    console.log('   Has apiSecret:', !!iciciCsp.apiSecret)
    
    if (iciciCsp.apiKey && iciciCsp.apiSecret) {
      const decryptedApiKey = decrypt(iciciCsp.apiKey)
      const decryptedApiSecret = decrypt(iciciCsp.apiSecret)
      
      console.log()
      console.log('   Decrypted apiKey (email):', decryptedApiKey ? decryptedApiKey.substring(0, 10) + '...' : 'FAILED')
      console.log('   Decrypted apiSecret:', decryptedApiSecret ? '****' + decryptedApiSecret.substring(Math.max(0, decryptedApiSecret.length - 4)) : 'FAILED')
    }
  }

  // Try to authenticate with Shiprocket
  console.log('\n═══════════════════════════════════════════════════════════════════════════════')
  console.log('4. Testing Shiprocket Authentication:')
  console.log('═══════════════════════════════════════════════════════════════════════════════')
  
  if (provider?.authConfig?.credentials) {
    const email = decrypt(provider.authConfig.credentials.username)
    const password = decrypt(provider.authConfig.credentials.password)
    
    console.log('   Using email:', email)
    console.log('   API URL: https://apiv2.shiprocket.in/v1/external/auth/login')
    
    try {
      const response = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })
      
      console.log('   Response Status:', response.status)
      
      if (response.ok) {
        const data = await response.json()
        console.log('   ✅ Authentication SUCCESSFUL!')
        console.log('   Token received:', data.token ? 'YES' : 'NO')
        console.log('   User:', data.first_name, data.last_name)
      } else {
        const errorText = await response.text()
        console.log('   ❌ Authentication FAILED!')
        console.log('   Error:', errorText)
      }
    } catch (error) {
      console.log('   ❌ Network Error:', error.message)
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════════')
  
  await mongoose.disconnect()
  console.log('\n🔌 Disconnected from MongoDB')
}

diagnoseAuth()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
