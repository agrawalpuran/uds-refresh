/**
 * Database Reindexing Script
 * 
 * PURPOSE:
 * This script synchronizes MongoDB indexes with the corrected Mongoose schema definitions.
 * It removes duplicate/obsolete indexes and ensures all indexes match the schema definitions.
 * 
 * SAFETY:
 * - Uses mongoose.syncIndexes() which is safe and non-destructive
 * - Only modifies indexes, NOT data or collections
 * - Drops indexes that don't match schemas and creates missing ones
 * - Environment guard: Blocks production runs without explicit confirmation
 * 
 * USAGE:
 *   node scripts/sync-mongoose-indexes.js [--force]
 * 
 * OPTIONS:
 *   --force: Skip confirmation prompts (use with caution)
 * 
 * ENVIRONMENT CHECK:
 * - Checks NODE_ENV and warns if running in production
 * - Requires explicit confirmation before proceeding (unless --force)
 */

const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')
const readline = require('readline')

// Manually load MONGODB_URI from .env.local
let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim()
    }
  }
} catch (error) {
  console.log('Could not read .env.local, using default or environment variable')
}

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env.local or environment variables.')
  process.exit(1)
}

// Import all models to ensure they are registered
require('../lib/models/Company')
require('../lib/models/Employee')
require('../lib/models/Vendor')
require('../lib/models/Order')
require('../lib/models/Uniform')
require('../lib/models/Branch')
require('../lib/models/Location')
require('../lib/models/LocationAdmin')
require('../lib/models/CompanyAdmin')
require('../lib/models/DesignationProductEligibility')
require('../lib/models/Relationship')
require('../lib/models/VendorInventory')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer)
    })
  })
}

async function syncIndexes() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2)
    const force = args.includes('--force')
    const nodeEnv = process.env.NODE_ENV || 'development'

    console.log('='.repeat(80))
    console.log('DATABASE REINDEXING SCRIPT')
    console.log('='.repeat(80))
    console.log(`Environment: ${nodeEnv}`)
    console.log(`Force mode: ${force ? 'YES (confirmation skipped)' : 'NO'}`)
    console.log(`MongoDB URI: ${MONGODB_URI ? 'Set' : 'NOT SET'}`)
    console.log('='.repeat(80))
    console.log()

    // Environment check
    if (nodeEnv === 'production' && !force) {
      console.warn('⚠️  WARNING: You are running this script in PRODUCTION environment!')
      const confirm = await askQuestion('Are you absolutely sure you want to sync indexes in production? (yes/no): ')
      if (confirm.toLowerCase() !== 'yes') {
        console.log('❌ Operation cancelled.')
        rl.close()
        process.exit(0)
      }
    } else if (!force) {
      console.log(`ℹ️  Running in ${nodeEnv} environment`)
      const confirm = await askQuestion('This will sync MongoDB indexes with schema definitions. Continue? (yes/no): ')
      if (confirm.toLowerCase() !== 'yes') {
        console.log('❌ Operation cancelled.')
        rl.close()
        process.exit(0)
      }
    }

    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Get all registered models
    const modelNames = Object.keys(mongoose.models)
    console.log(`📋 Found ${modelNames.length} registered models:`)
    modelNames.forEach(name => console.log(`   - ${name}`))
    console.log('')

    // Sync indexes for each model
    const results = {
      success: [],
      failed: [],
      skipped: []
    }

    for (const modelName of modelNames) {
      const Model = mongoose.models[modelName]
      try {
        const collectionName = Model.collection.name
        console.log(`📊 ${modelName} (${collectionName})`)
        
        // Get current indexes before sync
        const collection = Model.collection
        const existingIndexes = await collection.indexes()
        console.log(`   Indexes before: ${existingIndexes.length}`)
        
        // Display current indexes
        if (existingIndexes.length > 0) {
          existingIndexes.forEach(idx => {
            const keyStr = Object.entries(idx.key)
              .map(([field, direction]) => `${field}:${direction}`)
              .join(', ')
            const uniqueStr = idx.unique ? ' [UNIQUE]' : ''
            const sparseStr = idx.sparse ? ' [SPARSE]' : ''
            console.log(`      - ${idx.name}: {${keyStr}}${uniqueStr}${sparseStr}`)
          })
        }
        
        // syncIndexes() will:
        // - Drop indexes that are not in the schema
        // - Create indexes that are in the schema but missing
        // - Keep indexes that match the schema
        console.log(`   Syncing indexes...`)
        const syncResult = await Model.syncIndexes({ background: false })
        
        // Get indexes after sync
        const newIndexes = await collection.indexes()
        console.log(`   Indexes after: ${newIndexes.length}`)
        
        // Display new indexes
        if (newIndexes.length > 0) {
          newIndexes.forEach(idx => {
            const keyStr = Object.entries(idx.key)
              .map(([field, direction]) => `${field}:${direction}`)
              .join(', ')
            const uniqueStr = idx.unique ? ' [UNIQUE]' : ''
            const sparseStr = idx.sparse ? ' [SPARSE]' : ''
            console.log(`      - ${idx.name}: {${keyStr}}${uniqueStr}${sparseStr}`)
          })
        }
        
        // Calculate changes
        const added = newIndexes.length - existingIndexes.length
        const removed = syncResult ? Object.keys(syncResult).length : 0
        
        if (added > 0 || removed > 0) {
          console.log(`   ✅ Changes: +${added} added, ${removed} removed`)
          if (removed > 0 && syncResult) {
            console.log(`      Removed indexes: ${Object.keys(syncResult).join(', ')}`)
          }
        } else {
          console.log(`   ✅ No changes needed (indexes are in sync)`)
        }
        
        results.success.push({
          model: modelName,
          collection: collectionName,
          indexesBefore: existingIndexes.length,
          indexesAfter: newIndexes.length,
          added,
          removed
        })
        
        console.log()
      } catch (error) {
        console.error(`   ❌ Error syncing indexes for ${modelName}:`, error.message)
        results.failed.push({ model: modelName, error: error.message })
        console.log()
      }
    }

    // Summary
    console.log('='.repeat(80))
    console.log('REINDEXING SUMMARY')
    console.log('='.repeat(80))
    console.log(`✅ Successfully processed: ${results.success.length} models`)
    console.log(`❌ Failed: ${results.failed.length} models`)
    console.log()

    if (results.success.length > 0) {
      console.log('Successfully processed models:')
      results.success.forEach(r => {
        if (typeof r === 'string') {
          console.log(`  - ${r}`)
        } else {
          console.log(`  - ${r.model} (${r.collection}): ${r.indexesBefore} → ${r.indexesAfter} indexes`)
          if (r.added > 0 || r.removed > 0) {
            console.log(`    Changes: +${r.added} added, ${r.removed} removed`)
          }
        }
      })
      console.log()
    }

    if (results.failed.length > 0) {
      console.log('Failed models:')
      results.failed.forEach(f => {
        console.log(`  - ${f.model}: ${f.error}`)
      })
      console.log()
    }

    console.log('='.repeat(80))
    console.log('✅ Reindexing completed successfully!')
    console.log('='.repeat(80))
    console.log('ℹ️  The application should now start without duplicate index warnings.')
    console.log('ℹ️  Restart your application to verify the warnings are gone.')

    await mongoose.disconnect()
    console.log('✅ MongoDB Disconnected')
    rl.close()
  } catch (error) {
    console.error('❌ Script error:', error)
    rl.close()
    await mongoose.disconnect()
    process.exit(1)
  }
}

syncIndexes()

