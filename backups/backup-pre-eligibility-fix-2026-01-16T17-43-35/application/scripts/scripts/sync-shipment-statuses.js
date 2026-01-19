#!/usr/bin/env node
/**
 * Shipment Status Sync Job
 * 
 * Background job to sync shipment statuses from logistics providers.
 * Should be run periodically (e.g., via cron job or scheduled task).
 * 
 * Usage:
 *   node scripts/sync-shipment-statuses.js
 * 
 * Environment:
 *   Reads MONGODB_URI from .env.local or environment variable
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

async function syncShipmentStatuses() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Import sync function (using dynamic import to avoid module resolution issues)
    const { syncAllPendingShipments } = require('../lib/db/shipment-execution')
    
    console.log('🔄 Starting shipment status sync...')
    const result = await syncAllPendingShipments()
    
    console.log('\n================================================================================')
    console.log('SYNC SUMMARY')
    console.log('================================================================================')
    console.log(`✅ Synced: ${result.synced} shipment(s)`)
    console.log(`❌ Errors: ${result.errors} shipment(s)`)
    console.log(`📊 Total processed: ${result.synced + result.errors} shipment(s)\n`)

    if (result.errors > 0) {
      console.warn('⚠️  Some shipments failed to sync. Check logs for details.')
    }

  } catch (error) {
    console.error('❌ Error during sync:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  }
}

// Run if called directly
if (require.main === module) {
  syncShipmentStatuses().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

module.exports = { syncShipmentStatuses }

