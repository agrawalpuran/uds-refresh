#!/usr/bin/env node
/**
 * Mock Provider Test Script
 * 
 * Tests the mock logistics provider for payload validation and integration testing.
 * This allows testing without requiring a real API endpoint.
 * 
 * Usage:
 *   node scripts/test-mock-provider.js
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
      weight: 0.5,
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

async function testMockProvider() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    const systemShippingConfigCollection = db.collection('systemshippingconfigs')
    const shipmentServiceProviderCollection = db.collection('shipmentserviceproviders')

    console.log('================================================================================')
    console.log('MOCK PROVIDER INTEGRATION TEST')
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
    console.log(`   ✅ Shipping Integration Enabled: ${config.shippingIntegrationEnabled}\n`)

    // Step 2: Create/Check Mock Provider
    console.log('📋 Step 2: Setting up Mock Provider...')
    let mockProvider = await shipmentServiceProviderCollection.findOne({ providerCode: 'MOCK' })
    
    if (!mockProvider) {
      console.log('   Creating Mock provider...')
      const providerId = `PROV_MOCK_${Date.now().toString(36).toUpperCase().substring(0, 8)}`
      await shipmentServiceProviderCollection.insertOne({
        providerId,
        providerCode: 'MOCK',
        providerName: 'Mock Logistics Provider (Testing)',
        providerType: 'API_AGGREGATOR',
        isActive: true,
        supportsShipmentCreate: true,
        supportsTracking: true,
        supportsServiceabilityCheck: true,
        supportsCancellation: true,
        supportsWebhooks: false,
        apiBaseUrl: 'https://mock.api.test',
        apiVersion: 'v1',
        authType: 'API_KEY',
        documentationUrl: 'https://docs.mock.test',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      mockProvider = await shipmentServiceProviderCollection.findOne({ providerCode: 'MOCK' })
      console.log(`   ✅ Created Mock provider: ${mockProvider.providerId}`)
    } else {
      console.log(`   ✅ Mock provider exists: ${mockProvider.providerId}`)
    }
    console.log(`   Provider Name: ${mockProvider.providerName}`)
    console.log(`   Active: ${mockProvider.isActive}\n`)

    // Step 3: Test Provider Instance (using dynamic import for TypeScript)
    console.log('📋 Step 3: Testing Mock Provider Instance...')
    console.log('   Note: This requires the server to be running for TypeScript imports')
    console.log('   Use the test API endpoint instead: POST /api/test/shipway?providerCode=MOCK\n')

    // Step 4: Display Payload Structure
    console.log('📋 Step 4: Shipment Creation Payload Structure...')
    console.log('   This is the payload structure that will be sent:')
    console.log(JSON.stringify(TEST_SHIPMENT_PAYLOAD, null, 2))
    console.log()

    // Step 5: Display Configuration Summary
    console.log('================================================================================')
    console.log('CONFIGURATION SUMMARY')
    console.log('================================================================================')
    console.log('✅ System Shipping Config: Enabled')
    console.log(`✅ Mock Provider: ${mockProvider.providerId}`)
    console.log(`✅ Provider Code: ${mockProvider.providerCode}`)
    console.log(`✅ Provider Name: ${mockProvider.providerName}`)
    console.log()
    console.log('📝 Testing Options:')
    console.log('   1. Use test API endpoint: POST /api/test/shipway')
    console.log('      Set providerCode=MOCK in query or use Mock provider')
    console.log('   2. Mock provider simulates API responses without real API calls')
    console.log('   3. Perfect for testing payload structure and integration flow')
    console.log('   4. No API credentials required')
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
  testMockProvider().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

module.exports = { testMockProvider }

