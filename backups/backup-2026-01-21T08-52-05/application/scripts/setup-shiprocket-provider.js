#!/usr/bin/env node
/**
 * Setup Shiprocket Provider Script
 * 
 * Creates Shiprocket provider configuration in the database.
 * 
 * Usage:
 *   node scripts/setup-shiprocket-provider.js
 * 
 * Environment:
 *   Reads MONGODB_URI from .env.local
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

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URI_LOCAL

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function setupShiprocketProvider() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    const shipmentServiceProviderCollection = db.collection('shipmentserviceproviders')

    console.log('================================================================================')
    console.log('SETTING UP SHIPROCKET PROVIDER')
    console.log('================================================================================\n')

    // Check if Shiprocket provider already exists
    let shiprocketProvider = await shipmentServiceProviderCollection.findOne({ providerCode: 'SHIPROCKET' })
    
    if (!shiprocketProvider) {
      console.log('📋 Creating Shiprocket provider...')
      const providerId = `PROV_SR_${Date.now().toString(36).toUpperCase().substring(0, 8)}`
      await shipmentServiceProviderCollection.insertOne({
        providerId,
        providerCode: 'SHIPROCKET',
        providerName: 'Shiprocket',
        providerType: 'API_AGGREGATOR',
        isActive: true,
        supportsShipmentCreate: true,
        supportsTracking: true,
        supportsServiceabilityCheck: true,
        supportsCancellation: true,
        supportsWebhooks: false,
        apiBaseUrl: 'https://apiv2.shiprocket.in',
        apiVersion: 'v1',
        authType: 'TOKEN', // Shiprocket uses email/password to get token
        documentationUrl: 'https://apidocs.shiprocket.in/',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      shiprocketProvider = await shipmentServiceProviderCollection.findOne({ providerCode: 'SHIPROCKET' })
      console.log(`   ✅ Created Shiprocket provider: ${shiprocketProvider.providerId}`)
    } else {
      console.log(`   ✅ Shiprocket provider already exists: ${shiprocketProvider.providerId}`)
    }

    console.log('\n================================================================================')
    console.log('CONFIGURATION SUMMARY')
    console.log('================================================================================')
    console.log(`✅ Provider ID: ${shiprocketProvider.providerId}`)
    console.log(`✅ Provider Code: ${shiprocketProvider.providerCode}`)
    console.log(`✅ Provider Name: ${shiprocketProvider.providerName}`)
    console.log(`✅ API Base URL: ${shiprocketProvider.apiBaseUrl}`)
    console.log(`✅ API Version: ${shiprocketProvider.apiVersion}`)
    console.log(`✅ Auth Type: ${shiprocketProvider.authType}`)
    console.log(`✅ Active: ${shiprocketProvider.isActive}`)
    console.log()
    console.log('📝 Next Steps:')
    console.log('   1. Create CompanyShippingProvider with encrypted email/password')
    console.log('   2. Test authentication: POST /api/test/shipway?providerCode=SHIPROCKET')
    console.log('   3. Test shipment creation with real credentials')
    console.log()

  } catch (error) {
    console.error('❌ Error during setup:', error)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  }
}

// Run if called directly
if (require.main === module) {
  setupShiprocketProvider().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

module.exports = { setupShiprocketProvider }

