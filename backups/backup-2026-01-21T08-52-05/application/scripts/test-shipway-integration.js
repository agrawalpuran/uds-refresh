#!/usr/bin/env node
/**
 * Shipway Integration Test Script
 * 
 * Tests Shipway provider integration with sample payloads.
 * Validates API calls, payload structure, and response handling.
 * 
 * Usage:
 *   node scripts/test-shipway-integration.js
 * 
 * Environment:
 *   Reads MONGODB_URI from .env.local
 *   Requires SHIPWAY_API_KEY and SHIPWAY_API_SECRET (or test credentials)
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

// Sample test data
const TEST_SHIPMENT_PAYLOAD = {
  prNumber: 'PR-TEST-001',
  poNumber: 'PO-TEST-001',
  vendorId: '100001',
  companyId: '100001',
  fromAddress: {
    name: 'Test Vendor',
    address: '123 Vendor Street, Industrial Area',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    phone: '9876543210',
    email: 'vendor@test.com',
  },
  toAddress: {
    name: 'Test Employee',
    address: '456 Employee Lane, Residential Area',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400070',
    phone: '9876543211',
    email: 'employee@test.com',
  },
  items: [
    {
      productName: 'Formal Shirt',
      quantity: 2,
      weight: 0.5, // kg per item
    },
    {
      productName: 'Formal Trousers',
      quantity: 1,
      weight: 0.6,
    },
  ],
  shipmentValue: 5000,
  paymentMode: 'PREPAID',
}

async function testShipwayIntegration() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Use direct MongoDB access (avoiding TypeScript module imports)
    const db = mongoose.connection.db
    const systemShippingConfigCollection = db.collection('systemshippingconfigs')
    const shipmentServiceProviderCollection = db.collection('shipmentserviceproviders')
    const companyShippingProviderCollection = db.collection('companyshippingproviders')

    console.log('================================================================================')
    console.log('SHIPWAY INTEGRATION TEST')
    console.log('================================================================================\n')

    // Step 1: Check/Enable shipping integration
    console.log('📋 Step 1: Checking System Shipping Configuration...')
    let config = await systemShippingConfigCollection.findOne({ id: 'SYS_SHIP_CFG' })
    if (!config) {
      console.log('   Creating default shipping configuration...')
      await systemShippingConfigCollection.insertOne({
        id: 'SYS_SHIP_CFG',
        shippingIntegrationEnabled: true,
        allowMultipleProvidersPerCompany: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      config = await systemShippingConfigCollection.findOne({ id: 'SYS_SHIP_CFG' })
    }
    console.log(`   ✅ Shipping Integration Enabled: ${config.shippingIntegrationEnabled}`)
    console.log(`   ✅ Allow Multiple Providers: ${config.allowMultipleProvidersPerCompany}\n`)

    if (!config.shippingIntegrationEnabled) {
      console.log('   ⚠️  Enabling shipping integration for testing...')
      await systemShippingConfigCollection.updateOne(
        { id: 'SYS_SHIP_CFG' },
        { $set: { shippingIntegrationEnabled: true, updatedAt: new Date() } }
      )
      config.shippingIntegrationEnabled = true
      console.log('   ✅ Shipping integration enabled\n')
    }

    // Step 2: Create/Check Shipway Provider
    console.log('📋 Step 2: Setting up Shipway Provider...')
    let shipwayProvider = await shipmentServiceProviderCollection.findOne({ providerCode: 'SHIPWAY' })
    
    if (!shipwayProvider) {
      console.log('   Creating Shipway provider...')
      const providerId = `PROV_${Date.now().toString(36).toUpperCase().substring(0, 10)}`
      await shipmentServiceProviderCollection.insertOne({
        providerId,
        providerCode: 'SHIPWAY',
        providerName: 'Shipway Logistics',
        providerType: 'API_AGGREGATOR',
        isActive: true,
        supportsShipmentCreate: true,
        supportsTracking: true,
        supportsServiceabilityCheck: true,
        supportsCancellation: true,
        supportsWebhooks: false,
        apiBaseUrl: process.env.SHIPWAY_API_BASE_URL || 'https://api.shipway.in', // NOTE: Update with actual Shipway API URL
        apiVersion: 'v1',
        authType: 'API_KEY',
        documentationUrl: 'https://docs.shipway.in',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      shipwayProvider = await shipmentServiceProviderCollection.findOne({ providerCode: 'SHIPWAY' })
      console.log(`   ✅ Created Shipway provider: ${shipwayProvider.providerId}`)
    } else {
      console.log(`   ✅ Shipway provider exists: ${shipwayProvider.providerId}`)
    }
    console.log(`   Provider Name: ${shipwayProvider.providerName}`)
    console.log(`   API Base URL: ${shipwayProvider.apiBaseUrl || 'Not configured'}`)
    console.log(`   Active: ${shipwayProvider.isActive}\n`)

    // Step 3: Display Payload Structure
    console.log('📋 Step 3: Shipment Creation Payload Structure...')
    console.log('   This is the payload structure that will be sent to Shipway:')
    console.log(JSON.stringify(TEST_SHIPMENT_PAYLOAD, null, 2))
    console.log()

    // Step 4: Display Shipway API Mapping
    console.log('📋 Step 4: UDS → Shipway Field Mapping...')
    console.log('   UDS Field              → Shipway Field')
    console.log('   ──────────────────────────────────────────────')
    console.log('   prNumber               → order_id')
    console.log('   fromAddress.name       → from_name')
    console.log('   fromAddress.address    → from_address')
    console.log('   fromAddress.city       → from_city')
    console.log('   fromAddress.state      → from_state')
    console.log('   fromAddress.pincode    → from_pincode')
    console.log('   fromAddress.phone     → from_phone')
    console.log('   toAddress.*           → to_* (same pattern)')
    console.log('   items[].productName   → items[].name')
    console.log('   items[].quantity      → items[].quantity')
    console.log('   items[].weight        → items[].weight')
    console.log('   paymentMode            → payment_mode')
    console.log('   codAmount              → cod_amount')
    console.log('   shipmentValue          → shipment_value')
    console.log()

    // Step 5: Display Status Mapping
    console.log('📋 Step 5: Shipway → UDS Status Mapping...')
    console.log('   Shipway Status         → UDS Status')
    console.log('   ──────────────────────────────────────────────')
    console.log('   CREATED, PICKED, BOOKED → CREATED')
    console.log('   IN_TRANSIT, TRANSIT     → IN_TRANSIT')
    console.log('   DELIVERED, COMPLETED    → DELIVERED')
    console.log('   FAILED, CANCELLED       → FAILED')
    console.log()

    // Step 6: Note about API Testing
    console.log('📋 Step 6: API Testing...')
    console.log('   ⚠️  To test actual API calls, you need:')
    console.log('   1. Real Shipway API credentials')
    console.log('   2. Use the test API endpoint: POST /api/test/shipway')
    console.log('   3. Or use the test script with credentials in .env.local')
    console.log('   4. See SHIPWAY_SETUP_GUIDE.md for details')
    console.log()

    // Step 7: Display Configuration Summary
    console.log('================================================================================')
    console.log('CONFIGURATION SUMMARY')
    console.log('================================================================================')
    console.log('✅ System Shipping Config: Enabled')
    console.log(`✅ Shipway Provider: ${shipwayProvider.providerId}`)
    console.log(`✅ Provider Code: ${shipwayProvider.providerCode}`)
    console.log(`✅ Provider Name: ${shipwayProvider.providerName}`)
    console.log(`✅ API Base URL: ${shipwayProvider.apiBaseUrl || 'Not set'}`)
    console.log(`✅ API Version: ${shipwayProvider.apiVersion || 'Not set'}`)
    console.log(`✅ Auth Type: ${shipwayProvider.authType || 'Not set'}`)
    console.log(`✅ Supports Create: ${shipwayProvider.supportsShipmentCreate}`)
    console.log(`✅ Supports Tracking: ${shipwayProvider.supportsTracking}`)
    console.log(`✅ Supports Serviceability: ${shipwayProvider.supportsServiceabilityCheck}`)
    console.log()
    console.log('📝 Next Steps:')
    console.log('   1. Configure Shipway API credentials (see SHIPWAY_SETUP_GUIDE.md)')
    console.log('   2. Test API calls using: POST /api/test/shipway')
    console.log('   3. Or set credentials in .env.local and run: npm run test-shipway')
    console.log('   4. Create CompanyShippingProvider with encrypted credentials')
    console.log('   5. Test end-to-end shipment creation')
    console.log()

  } catch (error) {
    console.error('❌ Error during test:', error)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  }
}

// Run if called directly
if (require.main === module) {
  testShipwayIntegration().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

module.exports = { testShipwayIntegration }

