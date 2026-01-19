/**
 * Update Shiprocket Provider with Authentication Configuration
 * 
 * This script updates the Shiprocket provider with authentication credentials
 * from the test API section, storing them securely in authConfig.
 * 
 * Usage: node scripts/update-shiprocket-auth.js
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

// Shiprocket credentials from test API section
const SHIPROCKET_EMAIL = 'agrawalpuran@gmail.com'
const SHIPROCKET_PASSWORD = '!d%wun0jY75pPeapvAJ9kZo#ylHYgIOr'

async function updateShiprocketAuth() {
  try {
    console.log('='.repeat(80))
    console.log('UPDATING SHIPROCKET PROVIDER AUTHENTICATION')
    console.log('='.repeat(80))
    console.log('')

    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')
    console.log('')

    // Use direct MongoDB collection access (similar to setup script)
    const db = mongoose.connection.db
    const shipmentServiceProviderCollection = db.collection('shipmentserviceproviders')

    // Find Shiprocket provider
    const provider = await shipmentServiceProviderCollection.findOne({ providerCode: 'SHIPROCKET' })
    
    if (!provider) {
      console.error('❌ Shiprocket provider not found!')
      console.error('   Please run: node scripts/setup-shiprocket-provider.js first')
      await mongoose.disconnect()
      process.exit(1)
    }

    console.log(`Found Shiprocket provider: ${provider.providerId}`)
    console.log(`Provider Name: ${provider.providerName}`)
    console.log('')

    // Encrypt credentials
    console.log('🔐 Encrypting credentials...')
    const encryptedEmail = encrypt(SHIPROCKET_EMAIL)
    const encryptedPassword = encrypt(SHIPROCKET_PASSWORD)
    console.log('✅ Credentials encrypted')
    console.log('')

    // Update provider with authConfig
    const updateData = {
      $set: {
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
        authType: 'TOKEN', // Legacy field for backward compatibility
        updatedAt: new Date(),
      }
    }

    // Update API base URL if not set
    if (!provider.apiBaseUrl) {
      updateData.$set.apiBaseUrl = 'https://apiv2.shiprocket.in'
    }

    await shipmentServiceProviderCollection.updateOne(
      { providerCode: 'SHIPROCKET' },
      updateData
    )

    console.log('✅ Shiprocket provider updated with authentication configuration')
    console.log('')
    console.log('Configuration Details:')
    console.log(`   Auth Type: BASIC (email/password)`)
    console.log(`   Email: ${SHIPROCKET_EMAIL} (encrypted)`)
    console.log(`   Password: ******** (encrypted)`)
    console.log(`   API Base URL: ${provider.apiBaseUrl}`)
    console.log(`   Auto-refresh Token: true`)
    console.log('')
    console.log('='.repeat(80))
    console.log('✅ UPDATE COMPLETED')
    console.log('='.repeat(80))
    console.log('')
    console.log('Next Steps:')
    console.log('   1. Go to Super Admin → Logistics & Shipping → Service Providers')
    console.log('   2. Edit Shiprocket provider')
    console.log('   3. Click "Test Connection" to verify authentication')
    console.log('')

    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Update failed:', error)
    process.exit(1)
  }
}

updateShiprocketAuth()

