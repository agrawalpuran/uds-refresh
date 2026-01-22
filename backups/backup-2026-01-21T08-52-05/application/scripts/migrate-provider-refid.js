/**
 * Migration Script: Assign providerRefId to existing ShipmentServiceProvider records
 * 
 * This script:
 * 1. Finds all providers without providerRefId
 * 2. Assigns sequential numeric IDs starting from 100000
 * 3. Ensures uniqueness and proper indexing
 * 
 * Usage: node scripts/migrate-provider-refid.js
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

async function migrateProviderRefIds() {
  try {
    console.log('='.repeat(80))
    console.log('MIGRATION: Assign providerRefId to existing providers')
    console.log('='.repeat(80))
    console.log('')

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')
    console.log('')

    // Use direct MongoDB collection access
    const db = mongoose.connection.db
    const shipmentServiceProviderCollection = db.collection('shipmentserviceproviders')
    
    // Find all providers
    const providers = await shipmentServiceProviderCollection.find({}).sort({ createdAt: 1 }).toArray()
    console.log(`Found ${providers.length} provider(s)`)
    console.log('')

    // Find providers without providerRefId
    const providersWithoutRefId = providers.filter((p) => !p.providerRefId)
    console.log(`Providers without providerRefId: ${providersWithoutRefId.length}`)
    console.log('')

    if (providersWithoutRefId.length === 0) {
      console.log('✅ All providers already have providerRefId assigned')
      await mongoose.disconnect()
      return
    }

    // Find the highest existing providerRefId
    const providersWithRefId = providers.filter((p) => p.providerRefId)
    let nextRefId = 100000
    if (providersWithRefId.length > 0) {
      const maxRefId = Math.max(...providersWithRefId.map((p) => p.providerRefId))
      nextRefId = maxRefId + 1
    }

    console.log(`Starting providerRefId assignment from: ${nextRefId}`)
    console.log('')

    // Assign providerRefId to each provider
    let assigned = 0
    for (const provider of providersWithoutRefId) {
      try {
        await shipmentServiceProviderCollection.updateOne(
          { _id: provider._id },
          { $set: { providerRefId: nextRefId } }
        )

        console.log(
          `✅ Assigned providerRefId ${nextRefId} to ${provider.providerCode} (${provider.providerName})`
        )
        assigned++
        nextRefId++
      } catch (error) {
        console.error(
          `❌ Failed to assign providerRefId to ${provider.providerCode}: ${error.message}`
        )
      }
    }

    console.log('')
    console.log('='.repeat(80))
    console.log(`✅ MIGRATION COMPLETED: ${assigned} provider(s) updated`)
    console.log('='.repeat(80))
    console.log('')

    // Verify migration
    const allProviders = await shipmentServiceProviderCollection.find({}).toArray()
    const withoutRefId = allProviders.filter((p) => !p.providerRefId)
    if (withoutRefId.length === 0) {
      console.log('✅ Verification passed: All providers have providerRefId')
    } else {
      console.log(`⚠️  Warning: ${withoutRefId.length} provider(s) still without providerRefId`)
    }

    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

migrateProviderRefIds()

