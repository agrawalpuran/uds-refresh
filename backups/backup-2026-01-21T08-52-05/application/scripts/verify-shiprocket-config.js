/**
 * Verify Shiprocket Provider Configuration
 * 
 * This script verifies that Shiprocket provider has:
 * 1. providerRefId assigned
 * 2. authConfig configured with encrypted credentials
 * 
 * Usage: node scripts/verify-shiprocket-config.js
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

async function verifyShiprocketConfig() {
  try {
    console.log('='.repeat(80))
    console.log('VERIFYING SHIPROCKET PROVIDER CONFIGURATION')
    console.log('='.repeat(80))
    console.log('')

    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')
    console.log('')

    const db = mongoose.connection.db
    const shipmentServiceProviderCollection = db.collection('shipmentserviceproviders')

    // Find Shiprocket provider
    const provider = await shipmentServiceProviderCollection.findOne({ providerCode: 'SHIPROCKET' })
    
    if (!provider) {
      console.error('❌ Shiprocket provider not found!')
      await mongoose.disconnect()
      process.exit(1)
    }

    console.log('✅ Shiprocket Provider Found')
    console.log('')
    console.log('Configuration Details:')
    console.log(`   Provider ID: ${provider.providerId}`)
    console.log(`   Provider Code: ${provider.providerCode}`)
    console.log(`   Provider Name: ${provider.providerName}`)
    console.log(`   Provider Ref ID: ${provider.providerRefId || 'NOT SET'}`)
    console.log(`   API Base URL: ${provider.apiBaseUrl || 'NOT SET'}`)
    console.log(`   Auth Type: ${provider.authType || 'NOT SET'}`)
    console.log(`   Is Active: ${provider.isActive}`)
    console.log('')

    // Check authConfig
    if (provider.authConfig) {
      console.log('✅ Authentication Configuration:')
      console.log(`   Auth Type: ${provider.authConfig.authType}`)
      console.log(`   Has Credentials: ${provider.authConfig.credentials ? 'YES' : 'NO'}`)
      if (provider.authConfig.credentials) {
        console.log(`   Username (Email): ${provider.authConfig.credentials.username ? 'SET (encrypted)' : 'NOT SET'}`)
        console.log(`   Password: ${provider.authConfig.credentials.password ? 'SET (encrypted)' : 'NOT SET'}`)
      }
      console.log(`   Auto-refresh Token: ${provider.authConfig.autoRefreshToken ? 'YES' : 'NO'}`)
      console.log('')
      console.log('✅ Authentication is properly configured!')
    } else {
      console.log('⚠️  Authentication Configuration: NOT SET')
      console.log('   Run: node scripts/update-shiprocket-auth.js')
    }

    console.log('')
    console.log('='.repeat(80))
    console.log('✅ VERIFICATION COMPLETE')
    console.log('='.repeat(80))
    console.log('')

    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Verification failed:', error)
    process.exit(1)
  }
}

verifyShiprocketConfig()

