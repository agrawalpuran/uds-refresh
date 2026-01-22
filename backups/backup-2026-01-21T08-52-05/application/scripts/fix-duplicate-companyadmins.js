/**
 * Fix Duplicate CompanyAdmins Script
 * 
 * This script identifies and fixes duplicate companyadmins records that have
 * the same companyId + employeeId combination after ObjectId to StringId migration.
 * 
 * SAFETY FEATURES:
 * - Dry-run mode by default (use --execute to actually fix)
 * - Shows all duplicates before fixing
 * - Provides options to merge or delete duplicates
 * 
 * Usage:
 *   node scripts/fix-duplicate-companyadmins.js [--execute] [--strategy=merge|delete-oldest|delete-newest]
 * 
 * Examples:
 *   node scripts/fix-duplicate-companyadmins.js                    # Dry run, show duplicates
 *   node scripts/fix-duplicate-companyadmins.js --execute           # Execute with default strategy (merge)
 *   node scripts/fix-duplicate-companyadmins.js --execute --strategy=delete-oldest
 */

const fs = require('fs')
const path = require('path')

// Try to load dotenv if available, otherwise read .env.local manually
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {
  // dotenv not installed, try to read .env.local manually
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
  }
}

const mongoose = require('mongoose')

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection
  }
  
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('\n❌ MONGODB_URI environment variable is not set')
    throw new Error('MONGODB_URI environment variable is not set')
  }
  
  await mongoose.connect(uri)
  console.log('✅ Connected to MongoDB')
  return mongoose.connection
}

/**
 * Convert ObjectId to string ID by looking up the referenced entity
 */
async function convertObjectIdToStringId(db, collectionName, objectIdValue) {
  if (!objectIdValue) return null
  
  // If already a string, return as is
  if (typeof objectIdValue === 'string') {
    return objectIdValue
  }
  
  // If it's an ObjectId, look up the entity to get its string id field
  if (objectIdValue instanceof mongoose.Types.ObjectId || 
      (typeof objectIdValue === 'object' && objectIdValue._id)) {
    
    const objectId = objectIdValue instanceof mongoose.Types.ObjectId 
      ? objectIdValue 
      : objectIdValue._id
    
    try {
      const entity = await db.collection(collectionName).findOne({ _id: objectId })
      if (entity && entity.id) {
        return String(entity.id)
      }
      // Fallback: return ObjectId as string
      return String(objectId)
    } catch (error) {
      console.warn(`  ⚠️  Error looking up ${collectionName} for ObjectId ${objectId}:`, error.message)
      return String(objectId)
    }
  }
  
  return String(objectIdValue)
}

/**
 * Find duplicate companyadmins records
 */
async function findDuplicates(db) {
  const collection = db.collection('companyadmins')
  
  // Get all companyadmins
  const allAdmins = await collection.find({}).toArray()
  
  console.log(`\n📊 Total companyadmins records: ${allAdmins.length}`)
  
  // First, convert any ObjectId values to string IDs
  console.log('\n🔄 Converting ObjectId references to string IDs...')
  const normalizedAdmins = []
  
  for (const admin of allAdmins) {
    const normalized = { ...admin }
    
    // Convert companyId if it's an ObjectId
    if (admin.companyId && (admin.companyId instanceof mongoose.Types.ObjectId || 
        (typeof admin.companyId === 'object' && admin.companyId._id))) {
      const stringId = await convertObjectIdToStringId(db, 'companies', admin.companyId)
      if (stringId) {
        normalized.companyId = stringId
        console.log(`  ✅ Converted companyId ObjectId to string: ${stringId}`)
      }
    }
    
    // Convert employeeId if it's an ObjectId
    if (admin.employeeId && (admin.employeeId instanceof mongoose.Types.ObjectId || 
        (typeof admin.employeeId === 'object' && admin.employeeId._id))) {
      const stringId = await convertObjectIdToStringId(db, 'employees', admin.employeeId)
      if (stringId) {
        normalized.employeeId = stringId
        console.log(`  ✅ Converted employeeId ObjectId to string: ${stringId}`)
      }
    }
    
    normalizedAdmins.push(normalized)
  }
  
  // Group by companyId + employeeId combination (using normalized values)
  const groups = new Map()
  
  for (const admin of normalizedAdmins) {
    // Normalize companyId and employeeId to strings
    const companyId = String(admin.companyId || '')
    const employeeId = String(admin.employeeId || '')
    
    // Skip if either is missing
    if (!companyId || !employeeId) {
      continue
    }
    
    const key = `${companyId}|${employeeId}`
    
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key).push(admin)
  }
  
  // Find duplicates (groups with more than 1 record)
  const duplicates = []
  for (const [key, admins] of groups.entries()) {
    if (admins.length > 1) {
      const [companyId, employeeId] = key.split('|')
      duplicates.push({
        companyId,
        employeeId,
        count: admins.length,
        records: admins
      })
    }
  }
  
  return duplicates
}

/**
 * Display duplicate information
 */
function displayDuplicates(duplicates) {
  if (duplicates.length === 0) {
    console.log('\n✅ No duplicates found!')
    return
  }
  
  console.log(`\n⚠️  Found ${duplicates.length} duplicate group(s):`)
  console.log('='.repeat(80))
  
  duplicates.forEach((dup, index) => {
    console.log(`\n${index + 1}. Duplicate Group: companyId="${dup.companyId}", employeeId="${dup.employeeId}"`)
    console.log(`   Count: ${dup.count} records`)
    console.log(`   Records:`)
    
    dup.records.forEach((record, idx) => {
      console.log(`     ${idx + 1}. _id: ${record._id}`)
      console.log(`        companyId: ${record.companyId} (type: ${typeof record.companyId})`)
      console.log(`        employeeId: ${record.employeeId} (type: ${typeof record.employeeId})`)
      console.log(`        privileges: ${JSON.stringify(record.privileges || {})}`)
      console.log(`        createdAt: ${record.createdAt || 'N/A'}`)
      console.log(`        updatedAt: ${record.updatedAt || 'N/A'}`)
    })
  })
}

/**
 * Merge duplicate records (keep the most complete one)
 */
function selectBestRecord(records) {
  // Sort by:
  // 1. Has more fields (more complete)
  // 2. Has updatedAt (more recent)
  // 3. Has createdAt (older = original)
  
  return records.sort((a, b) => {
    const aFields = Object.keys(a).length
    const bFields = Object.keys(b).length
    
    // Prefer record with more fields
    if (aFields !== bFields) {
      return bFields - aFields
    }
    
    // Prefer record with updatedAt
    if (a.updatedAt && !b.updatedAt) return -1
    if (!a.updatedAt && b.updatedAt) return 1
    
    // If both have updatedAt, prefer newer
    if (a.updatedAt && b.updatedAt) {
      return new Date(b.updatedAt) - new Date(a.updatedAt)
    }
    
    // Prefer record with createdAt (older = original)
    if (a.createdAt && !b.createdAt) return -1
    if (!a.createdAt && b.createdAt) return 1
    if (a.createdAt && b.createdAt) {
      return new Date(a.createdAt) - new Date(b.createdAt)
    }
    
    return 0
  })[0]
}

/**
 * Merge privileges from multiple records
 */
function mergePrivileges(records) {
  const merged = {}
  
  for (const record of records) {
    if (record.privileges && typeof record.privileges === 'object') {
      Object.assign(merged, record.privileges)
    }
  }
  
  return Object.keys(merged).length > 0 ? merged : undefined
}

/**
 * Fix duplicates using specified strategy
 */
async function fixDuplicates(db, duplicates, strategy, execute) {
  if (duplicates.length === 0) {
    return { fixed: 0, deleted: 0, errors: 0 }
  }
  
  const collection = db.collection('companyadmins')
  let fixed = 0
  let deleted = 0
  const errors = []
  
  console.log(`\n🔧 Fixing duplicates using strategy: ${strategy}`)
  console.log('='.repeat(80))
  
  for (const dup of duplicates) {
    try {
      if (strategy === 'merge') {
        // Strategy: Merge - keep best record, merge privileges, delete others
        const bestRecord = selectBestRecord([...dup.records])
        const otherRecords = dup.records.filter(r => r._id.toString() !== bestRecord._id.toString())
        
        // Merge privileges from all records
        const mergedPrivileges = mergePrivileges(dup.records)
        
        if (execute) {
          // Update best record with merged privileges if needed
          if (mergedPrivileges && Object.keys(mergedPrivileges).length > 0) {
            await collection.updateOne(
              { _id: bestRecord._id },
              { $set: { privileges: mergedPrivileges } }
            )
          }
          
          // Ensure companyId and employeeId are strings (convert ObjectIds if needed)
          let companyIdStr = String(dup.companyId)
          let employeeIdStr = String(dup.employeeId)
          
          // If they're ObjectIds, convert them
          if (bestRecord.companyId instanceof mongoose.Types.ObjectId || 
              (typeof bestRecord.companyId === 'object' && bestRecord.companyId._id)) {
            companyIdStr = await convertObjectIdToStringId(db, 'companies', bestRecord.companyId) || companyIdStr
          }
          if (bestRecord.employeeId instanceof mongoose.Types.ObjectId || 
              (typeof bestRecord.employeeId === 'object' && bestRecord.employeeId._id)) {
            employeeIdStr = await convertObjectIdToStringId(db, 'employees', bestRecord.employeeId) || employeeIdStr
          }
          
          await collection.updateOne(
            { _id: bestRecord._id },
            { 
              $set: { 
                companyId: companyIdStr,
                employeeId: employeeIdStr
              }
            }
          )
          
          // Delete other records
          const otherIds = otherRecords.map(r => r._id)
          const deleteResult = await collection.deleteMany({ _id: { $in: otherIds } })
          deleted += deleteResult.deletedCount
        } else {
          console.log(`\n  Would merge ${dup.count} records for companyId="${dup.companyId}", employeeId="${dup.employeeId}"`)
          console.log(`    Keep: _id=${bestRecord._id}`)
          console.log(`    Delete: ${otherRecords.map(r => r._id).join(', ')}`)
        }
        
        fixed++
        
      } else if (strategy === 'delete-oldest') {
        // Strategy: Keep newest, delete oldest
        const sorted = dup.records.sort((a, b) => {
          const aDate = a.createdAt || a._id.getTimestamp()
          const bDate = b.createdAt || b._id.getTimestamp()
          return new Date(aDate) - new Date(bDate)
        })
        
        const keepRecord = sorted[sorted.length - 1] // Newest
        const deleteRecords = sorted.slice(0, -1) // All except newest
        
        if (execute) {
          // Ensure keep record has string IDs
          await collection.updateOne(
            { _id: keepRecord._id },
            { 
              $set: { 
                companyId: String(dup.companyId),
                employeeId: String(dup.employeeId)
              }
            }
          )
          
          // Delete older records
          const deleteIds = deleteRecords.map(r => r._id)
          const deleteResult = await collection.deleteMany({ _id: { $in: deleteIds } })
          deleted += deleteResult.deletedCount
        } else {
          console.log(`\n  Would keep newest record for companyId="${dup.companyId}", employeeId="${dup.employeeId}"`)
          console.log(`    Keep: _id=${keepRecord._id}`)
          console.log(`    Delete: ${deleteRecords.map(r => r._id).join(', ')}`)
        }
        
        fixed++
        
      } else if (strategy === 'delete-newest') {
        // Strategy: Keep oldest, delete newest
        const sorted = dup.records.sort((a, b) => {
          const aDate = a.createdAt || a._id.getTimestamp()
          const bDate = b.createdAt || b._id.getTimestamp()
          return new Date(aDate) - new Date(bDate)
        })
        
        const keepRecord = sorted[0] // Oldest
        const deleteRecords = sorted.slice(1) // All except oldest
        
        if (execute) {
          // Ensure keep record has string IDs
          await collection.updateOne(
            { _id: keepRecord._id },
            { 
              $set: { 
                companyId: String(dup.companyId),
                employeeId: String(dup.employeeId)
              }
            }
          )
          
          // Delete newer records
          const deleteIds = deleteRecords.map(r => r._id)
          const deleteResult = await collection.deleteMany({ _id: { $in: deleteIds } })
          deleted += deleteResult.deletedCount
        } else {
          console.log(`\n  Would keep oldest record for companyId="${dup.companyId}", employeeId="${dup.employeeId}"`)
          console.log(`    Keep: _id=${keepRecord._id}`)
          console.log(`    Delete: ${deleteRecords.map(r => r._id).join(', ')}`)
        }
        
        fixed++
      }
      
    } catch (error) {
      console.error(`\n❌ Error fixing duplicate for companyId="${dup.companyId}", employeeId="${dup.employeeId}":`, error.message)
      errors.push({ duplicate: dup, error: error.message })
    }
  }
  
  return { fixed, deleted, errors: errors.length }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2)
  const execute = args.includes('--execute')
  const strategyArg = args.find(arg => arg.startsWith('--strategy='))
  const strategy = strategyArg ? strategyArg.split('=')[1] : 'merge'
  
  if (!['merge', 'delete-oldest', 'delete-newest'].includes(strategy)) {
    console.error('❌ Invalid strategy. Use: merge, delete-oldest, or delete-newest')
    process.exit(1)
  }
  
  console.log('\n' + '='.repeat(80))
  console.log('FIX DUPLICATE COMPANYADMINS SCRIPT')
  console.log('='.repeat(80))
  console.log(`Mode: ${execute ? 'EXECUTE (WILL MODIFY DATA)' : 'DRY RUN (NO CHANGES)'}`)
  console.log(`Strategy: ${strategy}`)
  console.log('='.repeat(80))
  
  if (!execute) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made')
    console.log('   Use --execute flag to actually fix duplicates\n')
  } else {
    console.log('\n⚠️  EXECUTE MODE - Changes will be made to the database')
    console.log('   Press Ctrl+C within 5 seconds to cancel...\n')
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  
  try {
    const db = await connectDB()
    
    // Find duplicates
    console.log('\n🔍 Scanning for duplicate companyadmins...')
    const duplicates = await findDuplicates(db)
    
    // Display duplicates
    displayDuplicates(duplicates)
    
    if (duplicates.length === 0) {
      console.log('\n✅ No action needed. All companyadmins records are unique.')
      await mongoose.connection.close()
      return
    }
    
    // Fix duplicates
    const result = await fixDuplicates(db, duplicates, strategy, execute)
    
    console.log('\n' + '='.repeat(80))
    console.log('FIX SUMMARY')
    console.log('='.repeat(80))
    console.log(`Duplicate groups found: ${duplicates.length}`)
    console.log(`Duplicate groups ${execute ? 'fixed' : 'would be fixed'}: ${result.fixed}`)
    console.log(`Records ${execute ? 'deleted' : 'would be deleted'}: ${result.deleted}`)
    if (result.errors > 0) {
      console.log(`Errors: ${result.errors}`)
    }
    console.log('='.repeat(80))
    
    if (!execute && duplicates.length > 0) {
      console.log('\n💡 To execute the fix, run:')
      console.log(`   node scripts/fix-duplicate-companyadmins.js --execute --strategy=${strategy}`)
    }
    
  } catch (error) {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('\n✅ Database connection closed')
  }
}

// Run script
main().catch(console.error)
