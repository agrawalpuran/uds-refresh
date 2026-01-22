/**
 * Migration Script: Convert all ObjectId references to String IDs
 * 
 * This script migrates the database from ObjectId-based foreign keys to string-based IDs.
 * 
 * IMPORTANT: 
 * - Run this script AFTER updating all model schemas
 * - Backup your database before running
 * - Test on a development database first
 * 
 * Usage:
 *   node scripts/migrate-to-string-ids.js [--dry-run]
 * 
 * The script will:
 * 1. Extract _id values and store them as string IDs in the 'id' field (if not already present)
 * 2. Convert all ObjectId foreign key references to string IDs
 * 3. Log all conversions and missing references
 * 4. Create a migration report
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables
let MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) {
  try {
    const envPath = path.join(__dirname, '..', '.env.local')
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8')
      const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
      if (mongoMatch) {
        MONGODB_URI = mongoMatch[1].trim().replace(/^["']|["']$/g, '')
      }
    }
  } catch (error) {
    console.error('Could not read .env.local file')
  }
}

if (!MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is required')
  process.exit(1)
}

const DRY_RUN = process.argv.includes('--dry-run')

// Mapping of collection names to their ID field names and foreign key fields
const COLLECTION_CONFIG = {
  companies: {
    idField: 'id',
    foreignKeys: {
      adminId: 'employees' // adminId references Employee
    }
  },
  employees: {
    idField: 'id',
    foreignKeys: {
      companyId: 'companies', // companyId references Company
      locationId: 'locations' // locationId references Location
    }
  },
  locations: {
    idField: 'id',
    foreignKeys: {
      companyId: 'companies', // companyId references Company
      adminId: 'employees' // adminId references Employee
    }
  },
  orders: {
    idField: 'id',
    foreignKeys: {
      employeeId: 'employees',
      companyId: 'companies',
      site_admin_approved_by: 'employees',
      company_admin_approved_by: 'employees',
      indent_id: 'indentheaders'
    },
    nestedForeignKeys: {
      'items.uniformId': 'uniforms' // Nested in items array
    }
  },
  uniforms: {
    idField: 'id',
    foreignKeys: {
      categoryId: 'productcategories'
    },
    arrayForeignKeys: {
      companyIds: 'companies' // Array of company IDs
    }
  },
  vendors: {
    idField: 'id',
    foreignKeys: {}
  },
  branches: {
    idField: 'id',
    foreignKeys: {
      companyId: 'companies',
      adminId: 'employees'
    }
  },
  companyadmins: {
    idField: 'id',
    foreignKeys: {
      companyId: 'companies',
      employeeId: 'employees'
    }
  },
  locationadmins: {
    idField: 'id',
    foreignKeys: {
      locationId: 'locations',
      employeeId: 'employees'
    }
  },
  returnrequests: {
    idField: 'id',
    foreignKeys: {
      uniformId: 'uniforms',
      employeeId: 'employees',
      companyId: 'companies'
    }
  },
  productcategories: {
    idField: 'id',
    foreignKeys: {
      companyId: 'companies'
    }
  },
  subcategories: {
    idField: 'id',
    foreignKeys: {
      parentCategoryId: 'productcategories',
      companyId: 'companies'
    }
  },
  productsubcategorymappings: {
    idField: 'id',
    foreignKeys: {
      productId: 'uniforms',
      subCategoryId: 'subcategories',
      companyId: 'companies'
    }
  },
  designationproducteligibilities: {
    idField: 'id',
    foreignKeys: {
      companyId: 'companies'
    }
  },
  designationsubcategoryeligibilities: {
    idField: 'id',
    foreignKeys: {
      subCategoryId: 'subcategories',
      companyId: 'companies'
    }
  },
  vendorinventories: {
    idField: 'id',
    foreignKeys: {
      vendorId: 'vendors',
      productId: 'uniforms'
    }
  },
  productcompanies: {
    idField: 'id',
    foreignKeys: {
      productId: 'uniforms',
      companyId: 'companies'
    }
  },
  productvendors: {
    idField: 'id',
    foreignKeys: {
      productId: 'uniforms',
      vendorId: 'vendors'
    }
  },
  vendorcompanies: {
    idField: 'id',
    foreignKeys: {
      vendorId: 'vendors',
      companyId: 'companies'
    }
  },
  purchaseorders: {
    idField: 'id',
    foreignKeys: {
      companyId: 'companies',
      vendorId: 'vendors',
      created_by_user_id: 'employees'
    }
  },
  poorders: {
    idField: 'id',
    foreignKeys: {
      purchase_order_id: 'purchaseorders',
      order_id: 'orders'
    }
  },
  productfeedbacks: {
    idField: 'id',
    foreignKeys: {
      uniformId: 'uniforms',
      employeeId: 'employees',
      companyId: 'companies',
      vendorId: 'vendors'
    }
  },
  indentheaders: {
    idField: 'id',
    foreignKeys: {
      companyId: 'companies',
      site_id: 'locations',
      created_by_user_id: 'employees'
    }
  },
  vendorindents: {
    idField: 'id',
    foreignKeys: {
      indent_id: 'indentheaders',
      vendor_id: 'vendors'
    }
  },
  ordersuborders: {
    idField: 'id',
    foreignKeys: {
      order_id: 'orders',
      vendor_id: 'vendors',
      vendor_indent_id: 'vendorindents'
    }
  },
  vendorinvoices: {
    idField: 'id',
    foreignKeys: {
      vendor_indent_id: 'vendorindents',
      vendor_id: 'vendors'
    }
  },
  payments: {
    idField: 'id',
    foreignKeys: {
      invoice_id: 'vendorinvoices',
      vendor_id: 'vendors'
    }
  },
  goodsreceiptnotes: {
    idField: 'id',
    foreignKeys: {
      vendor_indent_id: 'vendorindents',
      vendor_id: 'vendors'
    }
  },
  notificationroutings: {
    idField: 'id',
    foreignKeys: {
      companyId: 'companies'
    }
  },
  notificationsenderprofiles: {
    idField: 'id',
    foreignKeys: {
      companyId: 'companies'
    }
  }
}

// Helper to convert ObjectId to string ID
async function getStringIdFromObjectId(db, collectionName, objectId, idField = 'id') {
  if (!objectId) return null
  
  try {
    const doc = await db.collection(collectionName).findOne({ _id: objectId })
    if (doc && doc[idField]) {
      return String(doc[idField])
    }
    // If id field doesn't exist, generate from _id (last 6 digits of hex)
    if (doc && doc._id) {
      const hexId = doc._id.toString()
      // Use last 6 digits as fallback (not ideal, but works)
      return hexId.slice(-6).padStart(6, '0')
    }
    return null
  } catch (error) {
    console.error(`Error getting string ID for ${collectionName}:`, error.message)
    return null
  }
}

// Helper to ensure document has string ID
async function ensureStringId(db, collectionName, doc, idField = 'id') {
  if (doc[idField]) {
    return String(doc[idField])
  }
  
  // Generate ID from _id if not present
  if (doc._id) {
    const hexId = doc._id.toString()
    // Use last 6 digits as fallback
    const generatedId = hexId.slice(-6).padStart(6, '0')
    
    if (!DRY_RUN) {
      await db.collection(collectionName).updateOne(
        { _id: doc._id },
        { $set: { [idField]: generatedId } }
      )
    }
    
    return generatedId
  }
  
  return null
}

// Migrate a single collection
async function migrateCollection(db, collectionName, config) {
  console.log(`\n📦 Migrating collection: ${collectionName}`)
  
  const collection = db.collection(collectionName)
  const documents = await collection.find({}).toArray()
  
  console.log(`   Found ${documents.length} documents`)
  
  let updated = 0
  let errors = 0
  const missingRefs = []
  
  for (const doc of documents) {
    try {
      const updates = {}
      let hasUpdates = false
      
      // Ensure document has string ID
      const stringId = await ensureStringId(db, collectionName, doc, config.idField)
      if (stringId && !doc[config.idField]) {
        updates[config.idField] = stringId
        hasUpdates = true
      }
      
      // Convert foreign key ObjectIds to string IDs
      for (const [fkField, refCollection] of Object.entries(config.foreignKeys || {})) {
        if (doc[fkField] && doc[fkField].constructor.name === 'ObjectId') {
          const stringId = await getStringIdFromObjectId(db, refCollection, doc[fkField])
          if (stringId) {
            updates[fkField] = stringId
            hasUpdates = true
          } else {
            missingRefs.push({
              collection: collectionName,
              documentId: doc._id,
              field: fkField,
              objectId: doc[fkField].toString(),
              refCollection
            })
          }
        } else if (doc[fkField] && typeof doc[fkField] === 'string' && /^[0-9a-fA-F]{24}$/.test(doc[fkField])) {
          // Handle string representation of ObjectId
          const objectId = new mongoose.Types.ObjectId(doc[fkField])
          const stringId = await getStringIdFromObjectId(db, refCollection, objectId)
          if (stringId) {
            updates[fkField] = stringId
            hasUpdates = true
          } else {
            missingRefs.push({
              collection: collectionName,
              documentId: doc._id,
              field: fkField,
              objectId: doc[fkField],
              refCollection
            })
          }
        }
      }
      
      // Convert array foreign keys
      for (const [fkField, refCollection] of Object.entries(config.arrayForeignKeys || {})) {
        if (doc[fkField] && Array.isArray(doc[fkField])) {
          const stringIds = []
          let arrayUpdated = false
          
          for (const item of doc[fkField]) {
            if (item && item.constructor.name === 'ObjectId') {
              const stringId = await getStringIdFromObjectId(db, refCollection, item)
              if (stringId) {
                stringIds.push(stringId)
                arrayUpdated = true
              }
            } else if (typeof item === 'string' && /^[0-9a-fA-F]{24}$/.test(item)) {
              const objectId = new mongoose.Types.ObjectId(item)
              const stringId = await getStringIdFromObjectId(db, refCollection, objectId)
              if (stringId) {
                stringIds.push(stringId)
                arrayUpdated = true
              }
            } else if (typeof item === 'string' && /^\d{6}$/.test(item)) {
              // Already a string ID
              stringIds.push(item)
            }
          }
          
          if (arrayUpdated) {
            updates[fkField] = stringIds
            hasUpdates = true
          }
        }
      }
      
      // Convert nested foreign keys (e.g., items.uniformId)
      for (const [nestedPath, refCollection] of Object.entries(config.nestedForeignKeys || {})) {
        const [parentField, childField] = nestedPath.split('.')
        if (doc[parentField] && Array.isArray(doc[parentField])) {
          const updatedArray = []
          let arrayUpdated = false
          
          for (const item of doc[parentField]) {
            const updatedItem = { ...item }
            if (item[childField] && item[childField].constructor.name === 'ObjectId') {
              const stringId = await getStringIdFromObjectId(db, refCollection, item[childField])
              if (stringId) {
                updatedItem[childField] = stringId
                arrayUpdated = true
              }
            }
            updatedArray.push(updatedItem)
          }
          
          if (arrayUpdated) {
            updates[parentField] = updatedArray
            hasUpdates = true
          }
        }
      }
      
      // Apply updates
      if (hasUpdates && !DRY_RUN) {
        await collection.updateOne(
          { _id: doc._id },
          { $set: updates }
        )
        updated++
      } else if (hasUpdates && DRY_RUN) {
        updated++
        console.log(`   [DRY RUN] Would update document ${doc._id}:`, updates)
      }
    } catch (error) {
      errors++
      console.error(`   ❌ Error processing document ${doc._id}:`, error.message)
    }
  }
  
  console.log(`   ✅ Updated: ${updated}, Errors: ${errors}`)
  
  return { updated, errors, missingRefs }
}

// Main migration function
async function migrate() {
  try {
    console.log('🚀 Starting String ID Migration')
    console.log('='.repeat(60))
    if (DRY_RUN) {
      console.log('⚠️  DRY RUN MODE - No changes will be made')
    }
    console.log('')
    
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    })
    console.log('✅ Connected to MongoDB')
    console.log(`   Database: ${mongoose.connection.db.databaseName}`)
    console.log('')
    
    const db = mongoose.connection.db
    
    // Run migration for each collection
    const results = {}
    const allMissingRefs = []
    
    for (const [collectionName, config] of Object.entries(COLLECTION_CONFIG)) {
      try {
        const result = await migrateCollection(db, collectionName, config)
        results[collectionName] = result
        allMissingRefs.push(...result.missingRefs)
      } catch (error) {
        console.error(`❌ Failed to migrate ${collectionName}:`, error.message)
        results[collectionName] = { updated: 0, errors: 1, missingRefs: [] }
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 MIGRATION SUMMARY')
    console.log('='.repeat(60))
    
    let totalUpdated = 0
    let totalErrors = 0
    
    for (const [collectionName, result] of Object.entries(results)) {
      console.log(`${collectionName}:`)
      console.log(`   Updated: ${result.updated}`)
      console.log(`   Errors: ${result.errors}`)
      console.log(`   Missing Refs: ${result.missingRefs.length}`)
      totalUpdated += result.updated
      totalErrors += result.errors
    }
    
    console.log(`\nTotal Updated: ${totalUpdated}`)
    console.log(`Total Errors: ${totalErrors}`)
    console.log(`Total Missing References: ${allMissingRefs.length}`)
    
    // Report missing references
    if (allMissingRefs.length > 0) {
      console.log('\n⚠️  MISSING REFERENCES:')
      console.log('='.repeat(60))
      for (const ref of allMissingRefs) {
        console.log(`${ref.collection}.${ref.field} -> ${ref.refCollection}`)
        console.log(`   Document ID: ${ref.documentId}`)
        console.log(`   ObjectId: ${ref.objectId}`)
        console.log('')
      }
    }
    
    // Save report
    const report = {
      timestamp: new Date().toISOString(),
      dryRun: DRY_RUN,
      results,
      missingReferences: allMissingRefs,
      summary: {
        totalUpdated,
        totalErrors,
        totalMissingRefs: allMissingRefs.length
      }
    }
    
    const reportPath = path.join(__dirname, '..', 'migration-report.json')
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
    console.log(`\n📄 Migration report saved to: ${reportPath}`)
    
    await mongoose.disconnect()
    console.log('\n✅ Migration complete')
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

// Run migration
migrate()
