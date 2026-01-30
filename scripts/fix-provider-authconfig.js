/**
 * Fix ShipmentServiceProvider authConfig by storing properly encrypted credentials
 * 
 * The issue: credentials were double-encrypted (copied encrypted values then
 * decryptAuthConfig tried to decrypt them, which failed)
 * 
 * The fix: Store the same encrypted values but in the correct format that
 * decryptAuthConfig expects
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

// Match the exact encryption/decryption from lib/utils/encryption.ts
const ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16

function getKey() {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  }
  return key
}

function decrypt(encryptedText) {
  if (!encryptedText) return encryptedText
  if (!encryptedText.includes(':')) return encryptedText
  
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 2) return encryptedText
    
    const key = getKey()
    
    // Try base64 first
    try {
      const iv = Buffer.from(parts[0], 'base64')
      const encrypted = parts[1]
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
      
      let decrypted = decipher.update(encrypted, 'base64', 'utf8')
      decrypted += decipher.final('utf8')
      
      if (decrypted && decrypted !== encryptedText && !decrypted.includes(':')) {
        return decrypted
      }
    } catch (e) {
      // Try hex
      try {
        const iv = Buffer.from(parts[0], 'hex')
        const encrypted = parts[1]
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8')
        decrypted += decipher.final('utf8')
        
        if (decrypted && decrypted !== encryptedText && !decrypted.includes(':')) {
          return decrypted
        }
      } catch (e2) {
        console.error('Decryption failed (both base64 and hex)')
      }
    }
    return encryptedText
  } catch (e) {
    return encryptedText
  }
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

async function fixProviderAuthConfig() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
  console.log('║     FIX SHIPMENT SERVICE PROVIDER AUTH CONFIG                               ║')
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝')
  console.log()

  await mongoose.connect(MONGODB_URI)
  console.log('✅ Connected to MongoDB\n')

  const db = mongoose.connection.db
  const providersCollection = db.collection('shipmentserviceproviders')
  const companyProvidersCollection = db.collection('companyshippingproviders')

  const PROVIDER_ID = 'PROV_MJXY0QMESF'

  // Get the ICICI BANK company provider (original source of credentials)
  const iciciProvider = await companyProvidersCollection.findOne({ companyId: '100004' })
  
  if (!iciciProvider || !iciciProvider.apiKey || !iciciProvider.apiSecret) {
    console.log('❌ ICICI BANK credentials not found!')
    await mongoose.disconnect()
    process.exit(1)
  }

  console.log('📋 ICICI BANK CompanyShippingProvider:')
  console.log('   Has apiKey:', !!iciciProvider.apiKey)
  console.log('   Has apiSecret:', !!iciciProvider.apiSecret)

  // Decrypt the credentials
  const decryptedEmail = decrypt(iciciProvider.apiKey)
  const decryptedPassword = decrypt(iciciProvider.apiSecret)

  console.log('\n📋 Decrypted credentials:')
  console.log('   Email:', decryptedEmail ? (decryptedEmail.includes('@') ? decryptedEmail : 'INVALID (not an email)') : 'FAILED')
  console.log('   Password:', decryptedPassword ? '****' : 'FAILED')

  if (!decryptedEmail || !decryptedEmail.includes('@')) {
    console.log('\n❌ Failed to decrypt email - it does not look like a valid email address')
    console.log('   Raw value:', iciciProvider.apiKey?.substring(0, 50) + '...')
    
    // The credentials might be stored in plaintext
    console.log('\n🔄 Checking if credentials are already plaintext...')
    if (iciciProvider.apiKey.includes('@')) {
      console.log('   ✅ apiKey appears to be a plaintext email!')
      // Use as-is, then encrypt for authConfig
      const email = iciciProvider.apiKey
      const password = iciciProvider.apiSecret
      
      console.log('   Email:', email)
      
      // Test authentication first
      console.log('\n🔄 Testing Shiprocket authentication with plaintext credentials...')
      try {
        const response = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        
        if (response.ok) {
          const data = await response.json()
          console.log('   ✅ Authentication SUCCESSFUL!')
          console.log('   User:', data.first_name, data.last_name)
          
          // Now store encrypted credentials in authConfig
          const authConfig = {
            authType: 'BASIC',
            credentials: {
              username: encrypt(email),
              password: encrypt(password)
            }
          }
          
          console.log('\n🔄 Updating ShipmentServiceProvider with properly encrypted authConfig...')
          
          await providersCollection.updateOne(
            { providerId: PROVIDER_ID },
            {
              $set: {
                authConfig: authConfig,
                updatedAt: new Date(),
                updatedBy: 'Fix Script - Properly encrypted credentials'
              }
            }
          )
          
          console.log('   ✅ authConfig updated successfully!')
        } else {
          const errorText = await response.text()
          console.log('   ❌ Authentication FAILED:', errorText)
        }
      } catch (error) {
        console.log('   ❌ Network Error:', error.message)
      }
    } else {
      console.log('   ❌ apiKey does not appear to be a plaintext email either')
    }
  } else {
    // Successfully decrypted
    console.log('\n✅ Successfully decrypted credentials!')
    
    // Test authentication
    console.log('\n🔄 Testing Shiprocket authentication...')
    try {
      const response = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: decryptedEmail, password: decryptedPassword }),
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log('   ✅ Authentication SUCCESSFUL!')
        console.log('   User:', data.first_name, data.last_name)
        
        // Now store encrypted credentials in authConfig
        const authConfig = {
          authType: 'BASIC',
          credentials: {
            username: encrypt(decryptedEmail),
            password: encrypt(decryptedPassword)
          }
        }
        
        console.log('\n🔄 Updating ShipmentServiceProvider with properly encrypted authConfig...')
        
        await providersCollection.updateOne(
          { providerId: PROVIDER_ID },
          {
            $set: {
              authConfig: authConfig,
              updatedAt: new Date(),
              updatedBy: 'Fix Script - Properly encrypted credentials'
            }
          }
        )
        
        console.log('   ✅ authConfig updated successfully!')
        
        // Verify
        const updatedProvider = await providersCollection.findOne({ providerId: PROVIDER_ID })
        console.log('\n📋 Verification:')
        console.log('   Has authConfig:', !!updatedProvider?.authConfig)
        console.log('   authType:', updatedProvider?.authConfig?.authType)
        
        // Test decryption of stored credentials
        const storedUsername = updatedProvider?.authConfig?.credentials?.username
        const storedPassword = updatedProvider?.authConfig?.credentials?.password
        const verifyEmail = decrypt(storedUsername)
        const verifyPassword = decrypt(storedPassword)
        
        console.log('   Stored username decrypts to email:', verifyEmail?.includes('@') ? 'YES' : 'NO')
        console.log('   Stored password decrypts:', verifyPassword && verifyPassword !== storedPassword ? 'YES' : 'NO')
      } else {
        const errorText = await response.text()
        console.log('   ❌ Authentication FAILED:', errorText)
      }
    } catch (error) {
      console.log('   ❌ Network Error:', error.message)
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗')
  console.log('║                              FIX COMPLETE                                    ║')
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝')

  await mongoose.disconnect()
  console.log('\n🔌 Disconnected from MongoDB')
}

fixProviderAuthConfig()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
