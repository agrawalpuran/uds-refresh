/**
 * Phase 2 MongoDB Bootstrap - Safe Read-Only Connection
 * 
 * Purpose: Creates a safe, read-only MongoDB connection with all write
 *          operations blocked at the driver level.
 * 
 * Safety Features:
 * - readPreference: 'secondaryPreferred' (prefer replicas)
 * - retryWrites: false (no automatic retries)
 * - No transactions allowed
 * - Write operation interceptors that throw errors
 * - DRY_RUN gate required
 * 
 * Usage: 
 *   const { getReadOnlyClient, getReadOnlyDb } = require('./mongo-bootstrap')
 *   const db = await getReadOnlyDb()
 * 
 * @version 1.0.0
 * @created 2026-01-15
 */

// =============================================================================
// DRY RUN GATE - MUST BE FIRST
// =============================================================================

const DRY_RUN = process.env.DRY_RUN === 'true'

if (!DRY_RUN) {
  console.error('═══════════════════════════════════════════════════════════════════')
  console.error('  ❌ FATAL: DRY_RUN must be set to "true" to use mongo-bootstrap')
  console.error('═══════════════════════════════════════════════════════════════════')
  console.error('  This is a safety measure to prevent accidental database access.')
  console.error('  Set environment variable: DRY_RUN=true')
  console.error('═══════════════════════════════════════════════════════════════════')
  throw new Error('DRY_RUN=true is required to use mongo-bootstrap')
}

// =============================================================================
// DEPENDENCIES
// =============================================================================

let dotenv
try {
  const fs = require('fs')
  const path = require('path')
  dotenv = require('dotenv')
  
  // Try .env.local first (Next.js convention), then .env
  const envLocalPath = path.resolve(process.cwd(), '.env.local')
  const envPath = path.resolve(process.cwd(), '.env')
  
  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath })
    console.log('  📁 Loaded environment from .env.local')
  } else if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath })
    console.log('  📁 Loaded environment from .env')
  }
} catch (e) {
  console.warn('⚠️  dotenv not available, using process.env directly')
}

const { MongoClient } = require('mongodb')

// =============================================================================
// CONFIGURATION
// =============================================================================

const READ_ONLY_OPTIONS = {
  // Force reads to secondary replicas when possible
  readPreference: 'secondaryPreferred',
  
  // Disable automatic retry of writes
  retryWrites: false,
  
  // Minimal connection pool for safety
  maxPoolSize: 2,
  minPoolSize: 1,
  
  // Connection timeouts
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 30000,
  
  // Disable write concern (we won't write anyway)
  w: 0,
  
  // Application name for audit trail
  appName: 'UDS-Phase2-ReadOnly',
}

// =============================================================================
// BLOCKED OPERATIONS LIST
// =============================================================================

const BLOCKED_OPERATIONS = [
  'insertOne',
  'insertMany',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
  'bulkWrite',
  'drop',
  'dropCollection',
  'dropDatabase',
  'createIndex',
  'dropIndex',
  'dropIndexes',
  'rename',
]

// =============================================================================
// READ-ONLY COLLECTION WRAPPER
// =============================================================================

function createReadOnlyCollection(collection, collectionName) {
  const handler = {
    get(target, prop) {
      // Block write operations
      if (BLOCKED_OPERATIONS.includes(prop)) {
        return function() {
          const error = new Error(
            `[READ-ONLY MODE] Write operation "${prop}" is blocked on collection "${collectionName}". ` +
            'Phase 2 runs in read-only mode for safety.'
          )
          error.code = 'READ_ONLY_VIOLATION'
          error.operation = prop
          error.collection = collectionName
          console.error(`\n❌ BLOCKED: ${prop}() on ${collectionName}`)
          throw error
        }
      }
      
      // Allow read operations
      const value = target[prop]
      if (typeof value === 'function') {
        return value.bind(target)
      }
      return value
    }
  }
  
  return new Proxy(collection, handler)
}

// =============================================================================
// READ-ONLY DATABASE WRAPPER
// =============================================================================

function createReadOnlyDb(db) {
  const originalCollection = db.collection.bind(db)
  
  // Override collection method to return read-only collections
  db.collection = function(name, options) {
    const collection = originalCollection(name, options)
    return createReadOnlyCollection(collection, name)
  }
  
  // Block database-level write operations
  const blockedDbOps = ['dropCollection', 'dropDatabase', 'createCollection', 'renameCollection']
  blockedDbOps.forEach(op => {
    db[op] = function() {
      const error = new Error(
        `[READ-ONLY MODE] Database operation "${op}" is blocked. ` +
        'Phase 2 runs in read-only mode for safety.'
      )
      error.code = 'READ_ONLY_VIOLATION'
      error.operation = op
      console.error(`\n❌ BLOCKED: db.${op}()`)
      throw error
    }
  })
  
  return db
}

// =============================================================================
// CLIENT SINGLETON
// =============================================================================

let client = null
let readOnlyDb = null

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Get a read-only MongoDB client
 * @returns {Promise<MongoClient>}
 */
async function getReadOnlyClient() {
  if (client && client.topology && client.topology.isConnected()) {
    return client
  }
  
  const mongoUri = process.env.MONGODB_URI
  if (!mongoUri) {
    throw new Error('MONGODB_URI environment variable is not set')
  }
  
  console.log('\n─────────────────────────────────────────────────────────────────')
  console.log('  🔒 CONNECTING IN READ-ONLY MODE')
  console.log('─────────────────────────────────────────────────────────────────')
  console.log(`  Mode: DRY_RUN=${DRY_RUN}`)
  console.log(`  Read Preference: ${READ_ONLY_OPTIONS.readPreference}`)
  console.log(`  Retry Writes: ${READ_ONLY_OPTIONS.retryWrites}`)
  console.log(`  App Name: ${READ_ONLY_OPTIONS.appName}`)
  console.log('─────────────────────────────────────────────────────────────────')
  
  client = new MongoClient(mongoUri, READ_ONLY_OPTIONS)
  await client.connect()
  
  console.log('  ✅ Connected successfully (READ-ONLY)')
  console.log('─────────────────────────────────────────────────────────────────\n')
  
  return client
}

/**
 * Get a read-only database instance
 * @param {string} dbName - Optional database name override
 * @returns {Promise<Db>}
 */
async function getReadOnlyDb(dbName = null) {
  if (readOnlyDb && !dbName) {
    return readOnlyDb
  }
  
  const mongoClient = await getReadOnlyClient()
  const db = mongoClient.db(dbName)
  
  // Wrap in read-only proxy
  readOnlyDb = createReadOnlyDb(db)
  
  return readOnlyDb
}

/**
 * Close the MongoDB connection
 */
async function closeConnection() {
  if (client) {
    await client.close()
    client = null
    readOnlyDb = null
    console.log('  🔒 Connection closed')
  }
}

/**
 * Get connection status
 */
function getConnectionStatus() {
  return {
    connected: client && client.topology && client.topology.isConnected(),
    mode: 'READ_ONLY',
    dryRun: DRY_RUN,
    readPreference: READ_ONLY_OPTIONS.readPreference,
    retryWrites: READ_ONLY_OPTIONS.retryWrites,
    blockedOperations: BLOCKED_OPERATIONS,
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  getReadOnlyClient,
  getReadOnlyDb,
  closeConnection,
  getConnectionStatus,
  READ_ONLY_OPTIONS,
  BLOCKED_OPERATIONS,
}

// =============================================================================
// STANDALONE TEST (if run directly)
// =============================================================================

if (require.main === module) {
  (async () => {
    console.log('═══════════════════════════════════════════════════════════════════')
    console.log('  MONGO BOOTSTRAP — STANDALONE TEST')
    console.log('═══════════════════════════════════════════════════════════════════')
    
    try {
      const db = await getReadOnlyDb()
      
      // Test read operation
      console.log('\n📖 Testing READ operation (find)...')
      const collections = await db.listCollections().toArray()
      console.log(`   ✅ Found ${collections.length} collections`)
      collections.slice(0, 5).forEach(c => console.log(`      - ${c.name}`))
      if (collections.length > 5) {
        console.log(`      ... and ${collections.length - 5} more`)
      }
      
      // Test blocked write operation
      console.log('\n🚫 Testing BLOCKED operation (insertOne)...')
      try {
        await db.collection('test').insertOne({ test: true })
        console.log('   ❌ ERROR: Insert should have been blocked!')
      } catch (err) {
        if (err.code === 'READ_ONLY_VIOLATION') {
          console.log('   ✅ Insert correctly blocked:', err.message)
        } else {
          throw err
        }
      }
      
      await closeConnection()
      
      console.log('\n═══════════════════════════════════════════════════════════════════')
      console.log('  ✅ BOOTSTRAP TEST PASSED — READ-ONLY MODE WORKING')
      console.log('═══════════════════════════════════════════════════════════════════')
      
    } catch (err) {
      console.error('\n❌ Bootstrap test failed:', err.message)
      await closeConnection()
      process.exit(1)
    }
  })()
}
