/**
 * Fix Shiprocket_ICICI Provider Script
 * 
 * This script fixes the SHIPROCKET_ICICI provider by:
 * 1. Assigning a providerRefId
 * 2. Adding authentication configuration (same as SHIPROCKET)
 * 3. Fixing API Base URL (removing trailing slash)
 * 
 * Usage: node scripts/fix-shiprocket-icici.js
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const match = trimmed.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        process.env[key] = value
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URI_LOCAL || 'mongodb://localhost:27017/uniform-distribution'

// Shiprocket credentials
const SHIPROCKET_EMAIL = 'agrawalpuran@gmail.com'
const SHIPROCKET_PASSWORD = '!d%wun0jY75pPeapvAJ9kZo#ylHYgIOr'

// Import encryption utility
const crypto = require('crypto')
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'
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
  try {
    const iv = crypto.randomBytes(IV_LENGTH)
    const key = getKey()
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    let encrypted = cipher.update(text, 'utf8', 'base64')
    encrypted += cipher.final('base64')
    return `${iv.toString('base64')}:${encrypted}`
  } catch (error) {
    console.error('Encryption error:', error)
    throw new Error('Failed to encrypt data')
  }
}

async function fixShiprocketICICI() {
  try {
    console.log('='.repeat(80))
    console.log('FIXING SHIPROCKET_ICICI PROVIDER')
    console.log('='.repeat(80))
    console.log('')

    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')
    console.log('')

    const db = mongoose.connection.db
    const collection = db.collection('shipmentserviceproviders')

    // Find SHIPROCKET_ICICI provider
    const provider = await collection.findOne({ providerCode: 'SHIPROCKET_ICICI' })
    
    if (!provider) {
      console.error('❌ SHIPROCKET_ICICI provider not found!')
      await mongoose.disconnect()
      process.exit(1)
    }

    console.log(`Found provider: ${provider.providerId}`)
    console.log(`Provider Name: ${provider.providerName}`)
    console.log('')

    // 1. Assign providerRefId if missing
    let providerRefId = provider.providerRefId
    if (!providerRefId) {
      console.log('📝 Assigning providerRefId...')
      // Find the highest existing providerRefId
      const allProviders = await collection.find({ providerRefId: { $exists: true, $ne: null } }).toArray()
      const maxRefId = allProviders.length > 0 
        ? Math.max(...allProviders.map(p => p.providerRefId || 0))
        : 100002
      
      providerRefId = maxRefId + 1
      console.log(`   ✅ Assigned providerRefId: ${providerRefId}`)
    } else {
      console.log(`   ✅ ProviderRefId already exists: ${providerRefId}`)
    }
    console.log('')

    // 2. Encrypt credentials
    console.log('🔐 Encrypting credentials...')
    const encryptedEmail = encrypt(SHIPROCKET_EMAIL)
    const encryptedPassword = encrypt(SHIPROCKET_PASSWORD)
    console.log('✅ Credentials encrypted')
    console.log('')

    // 3. Fix API Base URL (remove trailing slash)
    const apiBaseUrl = provider.apiBaseUrl?.replace(/\/$/, '') || 'https://apiv2.shiprocket.in'
    const needsUrlFix = provider.apiBaseUrl?.endsWith('/')

    // 4. Update provider
    const updateData = {
      $set: {
        providerRefId: providerRefId,
        authConfig: {
          authType: 'BASIC', // Shiprocket uses email/password (Basic Auth)
          credentials: {
            username: encryptedEmail, // Email stored as username
            password: encryptedPassword,
          },
          headersTemplate: {
            'Authorization': 'Bearer {{token}}', // Token will be obtained via login
            'Content-Type': 'application/json',
          },
          autoRefreshToken: true, // Shiprocket tokens expire after 240 hours
        },
        apiBaseUrl: apiBaseUrl, // Fix trailing slash
        updatedAt: new Date(),
      }
    }

    await collection.updateOne(
      { providerCode: 'SHIPROCKET_ICICI' },
      updateData
    )

    console.log('✅ SHIPROCKET_ICICI provider updated successfully!')
    console.log('')
    console.log('Configuration Details:')
    console.log(`   Provider Ref ID: ${providerRefId}`)
    console.log(`   Auth Type: BASIC (email/password)`)
    console.log(`   Email: ${SHIPROCKET_EMAIL} (encrypted)`)
    console.log(`   Password: ******** (encrypted)`)
    console.log(`   API Base URL: ${apiBaseUrl}${needsUrlFix ? ' (fixed - removed trailing slash)' : ''}`)
    console.log(`   Auto-refresh Token: true`)
    console.log('')
    console.log('='.repeat(80))
    console.log('✅ FIX COMPLETED')
    console.log('='.repeat(80))
    console.log('')
    console.log('Next Steps:')
    console.log('   1. Go to Super Admin → Logistics & Shipping → Service Providers')
    console.log('   2. Edit SHIPROCKET_ICICI provider')
    console.log('   3. Click "Test Connection" to verify authentication')
    console.log('')

    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Fix failed:', error)
    process.exit(1)
  }
}

fixShiprocketICICI()

