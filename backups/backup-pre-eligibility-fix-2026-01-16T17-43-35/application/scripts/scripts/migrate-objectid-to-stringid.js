/**
 * Migration Script: ObjectId to StringId
 * 
 * This script safely migrates legacy ObjectId references to proper StringId fields.
 * 
 * SAFETY FEATURES:
 * - Dry-run mode by default (use --execute to actually run)
 * - Idempotent (can be run multiple times safely)
 * - Does NOT delete any data
 * - Only normalizes existing legacy ObjectId references
 * 
 * Usage:
 *   node scripts/migrate-objectid-to-stringid.js [--execute] [--collection=<name>]
 * 
 * Examples:
 *   node scripts/migrate-objectid-to-stringid.js                    # Dry run, all collections
 *   node scripts/migrate-objectid-to-stringid.js --execute          # Execute migration, all collections
 *   node scripts/migrate-objectid-to-stringid.js --collection=orders # Dry run, specific collection
 */

// Try to load dotenv if available, otherwise read .env.local manually
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {
  // dotenv not installed, try to read .env.local manually
  const fs = require('fs')
  const path = require('path')
  const envPath = path.join(__dirname, '../.env.local')
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8')
    envContent.split('\n').forEach(line => {
      // Skip comments and empty lines
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      
      // Match KEY=VALUE pattern
      const match = trimmed.match(/^([^=:#]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim()
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        if (key && value && !process.env[key]) {
          process.env[key] = value
        }
      }
    })
    console.log('ℹ️  Loaded environment variables from .env.local')
  } else {
    console.log('ℹ️  .env.local not found, using environment variables directly')
  }
}
const mongoose = require('mongoose')

// Collections to migrate
const COLLECTIONS_TO_MIGRATE = [
  'companies',
  'employees',
  'vendors',
  'orders',
  'purchaseorders',
  'invoices',
  'shipments',
  'grns',
  'uniforms',
  'locations',
  'branches',
  'productvendors',
  'productcompanies',
  'companyadmins',
  'locationadmins',
  'vendorinventories',
  'designationeligibilities'
]

// Relationship collections that need ID field updates
const RELATIONSHIP_COLLECTIONS = [
  'productvendors',    // productId, vendorId
  'productcompanies',   // productId, companyId
  'companyadmins',      // companyId, employeeId
  'locationadmins',     // locationId, adminId
  'vendorinventories',  // vendorId, productId
  'orders',             // companyId, employeeId, vendorId, locationId
  'purchaseorders',     // companyId, vendorId
  'invoices',           // companyId, vendorId, grnId
  'shipments',          // companyId, orderId
  'grns',               // companyId, vendorId, poId
  'employees',          // companyId, locationId, branchId
  'branches',           // companyId, adminId
]

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection
  }
  
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('\n❌ MONGODB_URI environment variable is not set')
    console.error('   Please set MONGODB_URI in your .env.local file or as an environment variable')
    console.error('   Example: MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/database')
    throw new Error('MONGODB_URI environment variable is not set')
  }
  
  await mongoose.connect(uri)
  console.log('✅ Connected to MongoDB')
  return mongoose.connection
}

/**
 * Check if a value looks like an ObjectId (24-char hex string)
 */
function looksLikeObjectId(value) {
  if (!value) return false
  const str = String(value)
  return /^[0-9a-fA-F]{24}$/.test(str) && str.length === 24
}

/**
 * Get string ID from a document
 */
function getStringId(doc) {
  if (!doc) return null
  // Prefer 'id' field if it exists
  if (doc.id && typeof doc.id === 'string' && doc.id.length > 0) {
    return doc.id
  }
  // Fallback: convert _id to string
  if (doc._id) {
    return String(doc._id)
  }
  return null
}

/**
 * Migrate a single collection
 */
async function migrateCollection(db, collectionName, execute = false) {
  const collection = db.collection(collectionName)
  const stats = {
    total: 0,
    needsIdField: 0,
    needsRelationshipUpdate: 0,
    updated: 0,
    errors: 0
  }
  
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Migrating collection: ${collectionName}`)
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY RUN'}`)
  console.log('='.repeat(60))
  
  try {
    // Get all documents
    const cursor = collection.find({})
    stats.total = await collection.countDocuments({})
    
    console.log(`Total documents: ${stats.total}`)
    
    let processed = 0
    const batchSize = 100
    const batch = []
    
    for await (const doc of cursor) {
      processed++
      const updates = {}
      let needsUpdate = false
      
      // 1. Ensure 'id' field exists (copy from _id if missing)
      if (!doc.id && doc._id) {
        const idValue = String(doc._id)
        updates.id = idValue
        needsUpdate = true
        stats.needsIdField++
      }
      
      // 2. Update relationship fields if they're ObjectId-like
      if (collectionName in RELATIONSHIP_COLLECTIONS || RELATIONSHIP_COLLECTIONS.includes(collectionName)) {
        const relationshipFields = getRelationshipFields(collectionName)
        
        for (const field of relationshipFields) {
          if (doc[field]) {
            const fieldValue = doc[field]
            
            // If it's an ObjectId instance or looks like ObjectId hex string
            if (fieldValue instanceof mongoose.Types.ObjectId || 
                (typeof fieldValue === 'string' && looksLikeObjectId(fieldValue))) {
              
              // Convert to string
              const stringId = String(fieldValue)
              
              // Try to find the referenced document to get its 'id' field
              const referencedCollection = getReferencedCollection(collectionName, field)
              if (referencedCollection) {
                try {
                  const refDoc = await db.collection(referencedCollection).findOne({ 
                    _id: fieldValue instanceof mongoose.Types.ObjectId ? fieldValue : new mongoose.Types.ObjectId(fieldValue)
                  })
                  
                  if (refDoc && refDoc.id) {
                    updates[field] = refDoc.id
                    needsUpdate = true
                    stats.needsRelationshipUpdate++
                  } else {
                    // Fallback: use string conversion
                    updates[field] = stringId
                    needsUpdate = true
                    stats.needsRelationshipUpdate++
                  }
                } catch (err) {
                  console.warn(`  ⚠️  Error looking up reference for ${field}:`, err.message)
                  // Fallback: use string conversion
                  updates[field] = stringId
                  needsUpdate = true
                  stats.needsRelationshipUpdate++
                }
              } else {
                // No referenced collection, just convert to string
                updates[field] = stringId
                needsUpdate = true
                stats.needsRelationshipUpdate++
              }
            }
          }
        }
      }
      
      if (needsUpdate) {
        if (execute) {
          batch.push({
            updateOne: {
              filter: { _id: doc._id },
              update: { $set: updates }
            }
          })
          
          // Execute batch when it reaches batchSize
          if (batch.length >= batchSize) {
            try {
              const result = await collection.bulkWrite(batch, { ordered: false })
              stats.updated += result.modifiedCount
              batch.length = 0
            } catch (err) {
              console.error(`  ❌ Batch write error:`, err.message)
              stats.errors += batch.length
              batch.length = 0
            }
          }
        } else {
          // Dry run: just count
          stats.updated++
          if (processed <= 5) {
            console.log(`  📝 Would update document ${doc._id}:`, updates)
          }
        }
      }
      
      if (processed % 1000 === 0) {
        console.log(`  Processed ${processed}/${stats.total} documents...`)
      }
    }
    
    // Execute remaining batch
    if (execute && batch.length > 0) {
      try {
        const result = await collection.bulkWrite(batch, { ordered: false })
        stats.updated += result.modifiedCount
      } catch (err) {
        console.error(`  ❌ Final batch write error:`, err.message)
        stats.errors += batch.length
      }
    }
    
    console.log(`\n✅ Collection ${collectionName} migration complete:`)
    console.log(`   - Total documents: ${stats.total}`)
    console.log(`   - Need id field: ${stats.needsIdField}`)
    console.log(`   - Need relationship updates: ${stats.needsRelationshipUpdate}`)
    console.log(`   - ${execute ? 'Updated' : 'Would update'}: ${stats.updated}`)
    if (stats.errors > 0) {
      console.log(`   - Errors: ${stats.errors}`)
    }
    
  } catch (error) {
    console.error(`❌ Error migrating collection ${collectionName}:`, error.message)
    stats.errors++
  }
  
  return stats
}

/**
 * Get relationship fields for a collection
 */
function getRelationshipFields(collectionName) {
  const fieldMap = {
    'productvendors': ['productId', 'vendorId'],
    'productcompanies': ['productId', 'companyId'],
    'companyadmins': ['companyId', 'employeeId'],
    'locationadmins': ['locationId', 'adminId'],
    'vendorinventories': ['vendorId', 'productId'],
    'orders': ['companyId', 'employeeId', 'vendorId', 'locationId'],
    'purchaseorders': ['companyId', 'vendorId'],
    'invoices': ['companyId', 'vendorId', 'grnId'],
    'shipments': ['companyId', 'orderId'],
    'grns': ['companyId', 'vendorId', 'poId'],
    'employees': ['companyId', 'locationId', 'branchId'],
    'branches': ['companyId', 'adminId'],
  }
  return fieldMap[collectionName] || []
}

/**
 * Get referenced collection name for a field
 */
function getReferencedCollection(collectionName, fieldName) {
  const refMap = {
    'productvendors': { productId: 'uniforms', vendorId: 'vendors' },
    'productcompanies': { productId: 'uniforms', companyId: 'companies' },
    'companyadmins': { companyId: 'companies', employeeId: 'employees' },
    'locationadmins': { locationId: 'locations', adminId: 'employees' },
    'vendorinventories': { vendorId: 'vendors', productId: 'uniforms' },
    'orders': { companyId: 'companies', employeeId: 'employees', vendorId: 'vendors', locationId: 'locations' },
    'purchaseorders': { companyId: 'companies', vendorId: 'vendors' },
    'invoices': { companyId: 'companies', vendorId: 'vendors', grnId: 'grns' },
    'shipments': { companyId: 'companies', orderId: 'orders' },
    'grns': { companyId: 'companies', vendorId: 'vendors', poId: 'purchaseorders' },
    'employees': { companyId: 'companies', locationId: 'locations', branchId: 'branches' },
    'branches': { companyId: 'companies', adminId: 'employees' },
  }
  return refMap[collectionName]?.[fieldName] || null
}

/**
 * Main migration function
 */
async function main() {
  const args = process.argv.slice(2)
  const execute = args.includes('--execute')
  const collectionArg = args.find(arg => arg.startsWith('--collection='))
  const targetCollection = collectionArg ? collectionArg.split('=')[1] : null
  
  console.log('\n' + '='.repeat(60))
  console.log('OBJECTID TO STRINGID MIGRATION SCRIPT')
  console.log('='.repeat(60))
  console.log(`Mode: ${execute ? 'EXECUTE (WILL MODIFY DATA)' : 'DRY RUN (NO CHANGES)'}`)
  if (targetCollection) {
    console.log(`Target Collection: ${targetCollection}`)
  }
  console.log('='.repeat(60))
  
  if (!execute) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made')
    console.log('   Use --execute flag to actually run the migration\n')
  } else {
    console.log('\n⚠️  EXECUTE MODE - Changes will be made to the database')
    console.log('   Press Ctrl+C within 5 seconds to cancel...\n')
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  
  try {
    const db = await connectDB()
    
    const collections = targetCollection 
      ? [targetCollection.toLowerCase()]
      : COLLECTIONS_TO_MIGRATE
    
    const summary = {
      totalCollections: collections.length,
      totalDocuments: 0,
      totalNeedsIdField: 0,
      totalNeedsRelationshipUpdate: 0,
      totalUpdated: 0,
      totalErrors: 0
    }
    
    for (const collectionName of collections) {
      const stats = await migrateCollection(db, collectionName, execute)
      
      summary.totalDocuments += stats.total
      summary.totalNeedsIdField += stats.needsIdField
      summary.totalNeedsRelationshipUpdate += stats.needsRelationshipUpdate
      summary.totalUpdated += stats.updated
      summary.totalErrors += stats.errors
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('MIGRATION SUMMARY')
    console.log('='.repeat(60))
    console.log(`Collections processed: ${summary.totalCollections}`)
    console.log(`Total documents: ${summary.totalDocuments}`)
    console.log(`Documents needing id field: ${summary.totalNeedsIdField}`)
    console.log(`Documents needing relationship updates: ${summary.totalNeedsRelationshipUpdate}`)
    console.log(`Documents ${execute ? 'updated' : 'would be updated'}: ${summary.totalUpdated}`)
    if (summary.totalErrors > 0) {
      console.log(`Errors: ${summary.totalErrors}`)
    }
    console.log('='.repeat(60))
    
    if (!execute && summary.totalUpdated > 0) {
      console.log('\n💡 To execute the migration, run:')
      console.log(`   node scripts/migrate-objectid-to-stringid.js --execute`)
      if (targetCollection) {
        console.log(`   node scripts/migrate-objectid-to-stringid.js --execute --collection=${targetCollection}`)
      }
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('\n✅ Database connection closed')
  }
}

// Run migration
main().catch(console.error)
