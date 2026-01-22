/**
 * Complete Fix for CompanyAdmins Inconsistencies
 * 
 * This script fixes all inconsistencies in companyadmins:
 * 1. Converts ObjectId instances to proper string IDs
 * 2. Resolves 24-char hex strings to actual string IDs (or marks as invalid)
 * 3. Adds missing 'id' fields
 * 4. Handles duplicates
 * 
 * Usage:
 *   node scripts/fix-companyadmins-complete.js [--execute] [--delete-orphaned]
 */

const fs = require('fs')
const path = require('path')

// Try to load dotenv if available, otherwise read .env.local manually
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {
  const envPath = path.join(__dirname, '../.env.local')
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8')
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      
      const match = trimmed.match(/^([^=:#]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim()
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        if (key && value && !process.env[key]) {
          process.env[key] = value
        }
      }
    })
  }
}

const mongoose = require('mongoose')

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection
  }
  
  const uri = process.env.MONGODB_URI
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set')
  }
  
  await mongoose.connect(uri)
  console.log('✅ Connected to MongoDB')
  return mongoose.connection
}

function looksLikeObjectIdHex(str) {
  if (typeof str !== 'string') return false
  return /^[0-9a-fA-F]{24}$/.test(str) && str.length === 24
}

function isNumericStringId(str) {
  if (typeof str !== 'string') return false
  return /^\d{6}$/.test(str)
}

/**
 * Get the actual string ID from a referenced entity
 */
async function getStringIdFromEntity(db, collectionName, lookupValue) {
  if (!lookupValue) return null
  
  try {
    // If it's already a proper string ID (6 digits), return it
    if (typeof lookupValue === 'string' && isNumericStringId(lookupValue)) {
      return lookupValue
    }
    
    // If it's an ObjectId instance, look it up
    let objectId = null
    if (lookupValue instanceof mongoose.Types.ObjectId) {
      objectId = lookupValue
    } else if (typeof lookupValue === 'object' && lookupValue._id) {
      objectId = lookupValue._id instanceof mongoose.Types.ObjectId 
        ? lookupValue._id 
        : new mongoose.Types.ObjectId(lookupValue._id)
    } else if (typeof lookupValue === 'string' && looksLikeObjectIdHex(lookupValue)) {
      objectId = new mongoose.Types.ObjectId(lookupValue)
    }
    
    if (objectId) {
      const entity = await db.collection(collectionName).findOne({ _id: objectId })
      if (entity && entity.id) {
        return String(entity.id)
      }
      return null // Entity not found or has no id field
    }
    
    // If it's already a string but not ObjectId format, return as is
    if (typeof lookupValue === 'string') {
      return lookupValue
    }
    
    return null
  } catch (error) {
    return null
  }
}

async function fixCompanyAdmins(db, execute, deleteOrphaned) {
  const collection = db.collection('companyadmins')
  const allAdmins = await collection.find({}).toArray()
  
  console.log('\n' + '='.repeat(80))
  console.log('FIXING COMPANYADMINS INCONSISTENCIES')
  console.log('='.repeat(80))
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY RUN'}`)
  console.log(`Delete orphaned records: ${deleteOrphaned ? 'YES' : 'NO'}`)
  console.log('='.repeat(80))
  console.log(`\n📊 Total records: ${allAdmins.length}\n`)
  
  const stats = {
    fixed: 0,
    updated: 0,
    deleted: 0,
    orphaned: 0,
    errors: 0
  }
  
  // First pass: Fix each record
  for (const admin of allAdmins) {
    const updates = {}
    let needsUpdate = false
    let isOrphaned = false
    
    console.log(`\n${'─'.repeat(80)}`)
    console.log(`Processing: _id=${admin._id}`)
    
    // 1. Add missing 'id' field
    if (!admin.id && admin._id) {
      const idValue = String(admin._id).slice(-6) // Use last 6 chars of _id
      updates.id = idValue
      needsUpdate = true
      console.log(`  ➕ Will add 'id' field: "${idValue}"`)
    }
    
    // 2. Fix companyId
    let companyIdFixed = null
    if (admin.companyId instanceof mongoose.Types.ObjectId || 
        (typeof admin.companyId === 'object' && admin.companyId._id)) {
      // ObjectId instance - resolve it
      const resolved = await getStringIdFromEntity(db, 'companies', admin.companyId)
      if (resolved) {
        companyIdFixed = resolved
        updates.companyId = resolved
        needsUpdate = true
        console.log(`  🔧 companyId: ObjectId → "${resolved}"`)
      } else {
        isOrphaned = true
        console.log(`  ⚠️  companyId: ObjectId references non-existent entity`)
      }
    } else if (typeof admin.companyId === 'string' && looksLikeObjectIdHex(admin.companyId)) {
      // 24-char hex string - resolve it
      const resolved = await getStringIdFromEntity(db, 'companies', admin.companyId)
      if (resolved) {
        companyIdFixed = resolved
        updates.companyId = resolved
        needsUpdate = true
        console.log(`  🔧 companyId: hex string → "${resolved}"`)
      } else {
        isOrphaned = true
        console.log(`  ⚠️  companyId: hex string references non-existent entity`)
      }
    } else if (typeof admin.companyId === 'string' && isNumericStringId(admin.companyId)) {
      // Already correct
      companyIdFixed = admin.companyId
      console.log(`  ✅ companyId: already correct ("${admin.companyId}")`)
    } else {
      companyIdFixed = String(admin.companyId || '')
      console.log(`  ⚠️  companyId: keeping as-is ("${companyIdFixed}")`)
    }
    
    // 3. Fix employeeId
    let employeeIdFixed = null
    if (admin.employeeId instanceof mongoose.Types.ObjectId || 
        (typeof admin.employeeId === 'object' && admin.employeeId._id)) {
      // ObjectId instance - resolve it
      const resolved = await getStringIdFromEntity(db, 'employees', admin.employeeId)
      if (resolved) {
        employeeIdFixed = resolved
        updates.employeeId = resolved
        needsUpdate = true
        console.log(`  🔧 employeeId: ObjectId → "${resolved}"`)
      } else {
        isOrphaned = true
        console.log(`  ⚠️  employeeId: ObjectId references non-existent entity`)
      }
    } else if (typeof admin.employeeId === 'string' && looksLikeObjectIdHex(admin.employeeId)) {
      // 24-char hex string - resolve it
      const resolved = await getStringIdFromEntity(db, 'employees', admin.employeeId)
      if (resolved) {
        employeeIdFixed = resolved
        updates.employeeId = resolved
        needsUpdate = true
        console.log(`  🔧 employeeId: hex string → "${resolved}"`)
      } else {
        isOrphaned = true
        console.log(`  ⚠️  employeeId: hex string references non-existent entity`)
      }
    } else if (typeof admin.employeeId === 'string' && isNumericStringId(admin.employeeId)) {
      // Already correct
      employeeIdFixed = admin.employeeId
      console.log(`  ✅ employeeId: already correct ("${admin.employeeId}")`)
    } else {
      employeeIdFixed = String(admin.employeeId || '')
      console.log(`  ⚠️  employeeId: keeping as-is ("${employeeIdFixed}")`)
    }
    
    // Handle orphaned records
    if (isOrphaned) {
      stats.orphaned++
      if (deleteOrphaned && execute) {
        await collection.deleteOne({ _id: admin._id })
        stats.deleted++
        console.log(`  🗑️  Deleted orphaned record`)
        continue
      } else if (deleteOrphaned) {
        console.log(`  🗑️  Would delete orphaned record`)
        continue
      }
    }
    
    // Apply updates
    if (needsUpdate && execute) {
      try {
        await collection.updateOne({ _id: admin._id }, { $set: updates })
        stats.updated++
        console.log(`  ✅ Updated record`)
      } catch (error) {
        stats.errors++
        console.error(`  ❌ Error updating: ${error.message}`)
      }
    } else if (needsUpdate) {
      console.log(`  📝 Would update: ${JSON.stringify(updates)}`)
    }
    
    if (!isOrphaned) {
      stats.fixed++
    }
  }
  
  // Second pass: Handle duplicates after all fixes
  console.log(`\n\n${'='.repeat(80)}`)
  console.log('CHECKING FOR DUPLICATES')
  console.log('='.repeat(80))
  
  const allAdminsAfter = await collection.find({}).toArray()
  const groups = new Map()
  
  for (const admin of allAdminsAfter) {
    const companyId = String(admin.companyId || '')
    const employeeId = String(admin.employeeId || '')
    
    if (companyId && employeeId) {
      const key = `${companyId}|${employeeId}`
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key).push(admin)
    }
  }
  
  for (const [key, records] of groups.entries()) {
    if (records.length > 1) {
      const [companyId, employeeId] = key.split('|')
      console.log(`\n⚠️  Duplicate: companyId="${companyId}", employeeId="${employeeId}" (${records.length} records)`)
      
      // Keep the oldest, delete others
      const sorted = records.sort((a, b) => {
        const aDate = a.createdAt || a._id.getTimestamp()
        const bDate = b.createdAt || b._id.getTimestamp()
        return new Date(aDate) - new Date(bDate)
      })
      
      const keep = sorted[0]
      const deleteList = sorted.slice(1)
      
      console.log(`  Keep: _id=${keep._id} (created: ${keep.createdAt || keep._id.getTimestamp()})`)
      
      if (execute) {
        const deleteIds = deleteList.map(r => r._id)
        const deleteResult = await collection.deleteMany({ _id: { $in: deleteIds } })
        stats.deleted += deleteResult.deletedCount
        console.log(`  🗑️  Deleted ${deleteResult.deletedCount} duplicate(s)`)
      } else {
        console.log(`  🗑️  Would delete ${deleteList.length} duplicate(s)`)
      }
    }
  }
  
  return stats
}

async function main() {
  const args = process.argv.slice(2)
  const execute = args.includes('--execute')
  const deleteOrphaned = args.includes('--delete-orphaned')
  
  if (!execute) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made')
    console.log('   Use --execute flag to actually fix records\n')
  } else {
    console.log('\n⚠️  EXECUTE MODE - Changes will be made to the database')
    console.log('   Press Ctrl+C within 5 seconds to cancel...\n')
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  
  try {
    const db = await connectDB()
    const stats = await fixCompanyAdmins(db, execute, deleteOrphaned)
    
    console.log(`\n\n${'='.repeat(80)}`)
    console.log('FIX SUMMARY')
    console.log('='.repeat(80))
    console.log(`Records processed: ${stats.fixed + stats.orphaned}`)
    console.log(`Records ${execute ? 'updated' : 'would be updated'}: ${stats.updated}`)
    console.log(`Orphaned records found: ${stats.orphaned}`)
    console.log(`Records ${execute ? 'deleted' : 'would be deleted'}: ${stats.deleted}`)
    if (stats.errors > 0) {
      console.log(`Errors: ${stats.errors}`)
    }
    console.log('='.repeat(80))
    
    if (!execute) {
      console.log('\n💡 To execute the fix, run:')
      console.log('   node scripts/fix-companyadmins-complete.js --execute')
      if (stats.orphaned > 0) {
        console.log('   node scripts/fix-companyadmins-complete.js --execute --delete-orphaned')
      }
    }
    
  } catch (error) {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('\n✅ Database connection closed')
  }
}

main().catch(console.error)
