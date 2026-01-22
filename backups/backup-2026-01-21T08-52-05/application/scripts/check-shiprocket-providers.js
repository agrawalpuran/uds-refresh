/**
 * Check Shiprocket Providers Script
 * 
 * This script checks all Shiprocket providers and their configurations.
 * 
 * Usage: node scripts/check-shiprocket-providers.js
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

async function checkProviders() {
  try {
    console.log('='.repeat(80))
    console.log('CHECKING SHIPROCKET PROVIDERS')
    console.log('='.repeat(80))
    console.log('')

    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')
    console.log('')

    const db = mongoose.connection.db
    const collection = db.collection('shipmentserviceproviders')

    // Find all Shiprocket providers
    const providers = await collection.find({
      providerCode: { $regex: /SHIPROCKET/i }
    }).toArray()

    console.log(`Found ${providers.length} Shiprocket provider(s):`)
    console.log('')

    providers.forEach((provider, index) => {
      console.log(`${'='.repeat(80)}`)
      console.log(`Provider ${index + 1}:`)
      console.log(`${'='.repeat(80)}`)
      console.log(`Provider Code: ${provider.providerCode}`)
      console.log(`Provider ID: ${provider.providerId}`)
      console.log(`Provider Name: ${provider.providerName}`)
      console.log(`Provider Type: ${provider.providerType}`)
      console.log(`API Base URL: ${provider.apiBaseUrl || 'NOT SET'}`)
      console.log(`API Version: ${provider.apiVersion || 'NOT SET'}`)
      console.log(`Auth Type (Legacy): ${provider.authType || 'NOT SET'}`)
      console.log(`Is Active: ${provider.isActive ? 'YES' : 'NO'}`)
      console.log(`Provider Ref ID: ${provider.providerRefId || 'NOT SET'}`)
      console.log('')

      // Check authConfig
      if (provider.authConfig) {
        console.log('✅ Authentication Configuration:')
        console.log(`   Auth Type: ${provider.authConfig.authType}`)
        console.log(`   Has Credentials: ${provider.authConfig.credentials ? 'YES' : 'NO'}`)
        if (provider.authConfig.credentials) {
          if (provider.authConfig.credentials.username) {
            console.log(`   Username (Email): ${provider.authConfig.credentials.username.substring(0, 20)}... (encrypted)`)
          }
          if (provider.authConfig.credentials.password) {
            console.log(`   Password: ${provider.authConfig.credentials.password.substring(0, 20)}... (encrypted)`)
          }
          if (provider.authConfig.credentials.apiKey) {
            console.log(`   API Key: ${provider.authConfig.credentials.apiKey.substring(0, 20)}... (encrypted)`)
          }
          if (provider.authConfig.credentials.token) {
            console.log(`   Token: ${provider.authConfig.credentials.token.substring(0, 20)}... (encrypted)`)
          }
        }
        console.log(`   Auto-refresh Token: ${provider.authConfig.autoRefreshToken ? 'YES' : 'NO'}`)
      } else {
        console.log('❌ Authentication Configuration: NOT SET')
      }
      console.log('')

      // Check capabilities
      console.log('Capabilities:')
      console.log(`   Create Shipment: ${provider.supportsShipmentCreate ? 'YES' : 'NO'}`)
      console.log(`   Tracking: ${provider.supportsTracking ? 'YES' : 'NO'}`)
      console.log(`   Serviceability Check: ${provider.supportsServiceabilityCheck ? 'YES' : 'NO'}`)
      console.log(`   Cancellation: ${provider.supportsCancellation ? 'YES' : 'NO'}`)
      console.log(`   Webhooks: ${provider.supportsWebhooks ? 'YES' : 'NO'}`)
      console.log('')
    })

    console.log('='.repeat(80))
    console.log('SUMMARY')
    console.log('='.repeat(80))
    console.log('')

    const workingProvider = providers.find(p => p.providerCode === 'SHIPROCKET' && p.authConfig)
    const iciciProvider = providers.find(p => p.providerCode === 'SHIPROCKET_ICICI')

    if (workingProvider) {
      console.log('✅ SHIPROCKET: Configured with authConfig')
    } else {
      console.log('❌ SHIPROCKET: Missing authConfig')
    }

    if (iciciProvider) {
      if (iciciProvider.authConfig) {
        console.log('✅ SHIPROCKET_ICICI: Configured with authConfig')
      } else {
        console.log('❌ SHIPROCKET_ICICI: Missing authConfig')
      }
    } else {
      console.log('⚠️  SHIPROCKET_ICICI: Provider not found')
    }

    console.log('')

    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

checkProviders()

