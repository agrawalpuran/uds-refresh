/**
 * Test Provider Instance Script
 * 
 * This script tests if getProviderInstance can correctly load and initialize
 * SHIPROCKET_ICICI provider with stored authConfig.
 * 
 * Usage: node scripts/test-provider-instance.js
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

async function testProviderInstance() {
  try {
    console.log('='.repeat(80))
    console.log('TESTING PROVIDER INSTANCE CREATION')
    console.log('='.repeat(80))
    console.log('')

    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')
    console.log('')

    // Import after mongoose connection
    const { getProviderInstance } = await import('../lib/providers/ProviderFactory.js')
    
    console.log('Testing SHIPROCKET_ICICI provider...')
    console.log('')

    try {
      // Try to get provider instance without explicit credentials (should use stored authConfig)
      const providerInstance = await getProviderInstance('SHIPROCKET_ICICI')
      
      console.log('✅ Provider instance created successfully')
      console.log(`   Provider Code: ${providerInstance.providerCode}`)
      console.log(`   Provider Name: ${providerInstance.providerName}`)
      console.log(`   Provider ID: ${providerInstance.providerId}`)
      console.log('')

      // Try health check
      console.log('Running health check...')
      const healthResult = await providerInstance.healthCheck()
      
      console.log('✅ Health check completed')
      console.log(`   Healthy: ${healthResult.healthy}`)
      console.log(`   Message: ${healthResult.message || 'N/A'}`)
      if (healthResult.responseTime) {
        console.log(`   Response Time: ${healthResult.responseTime}ms`)
      }
      if (healthResult.error) {
        console.log(`   Error: ${healthResult.error}`)
      }
      console.log('')

    } catch (error) {
      console.error('❌ Error:', error.message)
      console.error('Stack:', error.stack)
      console.log('')
    }

    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  }
}

testProviderInstance()

