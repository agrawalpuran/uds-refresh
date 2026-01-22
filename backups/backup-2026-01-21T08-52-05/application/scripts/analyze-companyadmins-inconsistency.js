/**
 * Analyze CompanyAdmins Inconsistency Script
 * 
 * This script analyzes the companyadmins collection to identify inconsistencies:
 * - Records with ObjectId values instead of string IDs
 * - Records with 24-char hex strings instead of proper string IDs
 * - Records missing id field
 * - Records with mismatched ID formats
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

/**
 * Check if a string looks like a 24-char hex ObjectId
 */
function looksLikeObjectIdHex(str) {
  if (typeof str !== 'string') return false
  return /^[0-9a-fA-F]{24}$/.test(str) && str.length === 24
}

/**
 * Check if a value is a 6-digit numeric string ID
 */
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
      objectId = lookupValue._id
    } else if (typeof lookupValue === 'string' && looksLikeObjectIdHex(lookupValue)) {
      objectId = new mongoose.Types.ObjectId(lookupValue)
    }
    
    if (objectId) {
      const entity = await db.collection(collectionName).findOne({ _id: objectId })
      if (entity && entity.id) {
        return String(entity.id)
      }
      // If entity doesn't have id field, try to find by _id and check
      if (entity) {
        console.warn(`  ⚠️  Entity ${collectionName} _id=${objectId} has no 'id' field`)
        return null
      }
      console.warn(`  ⚠️  Entity ${collectionName} _id=${objectId} not found`)
      return null
    }
    
    // If it's already a string but not ObjectId format, return as is
    if (typeof lookupValue === 'string') {
      return lookupValue
    }
    
    return null
  } catch (error) {
    console.error(`  ❌ Error looking up ${collectionName}:`, error.message)
    return null
  }
}

async function analyzeCompanyAdmins(db) {
  const collection = db.collection('companyadmins')
  const allAdmins = await collection.find({}).toArray()
  
  console.log('\n' + '='.repeat(80))
  console.log('COMPANYADMINS INCONSISTENCY ANALYSIS')
  console.log('='.repeat(80))
  console.log(`\n📊 Total records: ${allAdmins.length}\n`)
  
  const issues = {
    missingIdField: [],
    objectIdInstances: [],
    hexStringInsteadOfId: [],
    inconsistentFormats: [],
    duplicates: []
  }
  
  // Group by normalized companyId + employeeId for duplicate detection
  const groups = new Map()
  
  for (let i = 0; i < allAdmins.length; i++) {
    const admin = allAdmins[i]
    const recordIssues = []
    
    console.log(`\n${'─'.repeat(80)}`)
    console.log(`Record ${i + 1}: _id=${admin._id}`)
    console.log(`${'─'.repeat(80)}`)
    
    // Check id field
    if (!admin.id) {
      recordIssues.push('MISSING_ID_FIELD')
      issues.missingIdField.push({ record: admin, index: i + 1 })
      console.log(`  ❌ Missing 'id' field`)
    } else {
      console.log(`  ✅ Has 'id' field: "${admin.id}"`)
    }
    
    // Check companyId
    console.log(`  companyId: ${JSON.stringify(admin.companyId)}`)
    console.log(`    Type: ${typeof admin.companyId}`)
    console.log(`    Is ObjectId instance: ${admin.companyId instanceof mongoose.Types.ObjectId}`)
    
    if (admin.companyId instanceof mongoose.Types.ObjectId) {
      recordIssues.push('COMPANYID_OBJECTID_INSTANCE')
      issues.objectIdInstances.push({ 
        record: admin, 
        index: i + 1, 
        field: 'companyId',
        value: admin.companyId 
      })
      console.log(`    ❌ companyId is ObjectId instance (should be string ID)`)
      
      // Try to resolve it
      const resolvedId = await getStringIdFromEntity(db, 'companies', admin.companyId)
      if (resolvedId) {
        console.log(`    💡 Should be: "${resolvedId}"`)
      } else {
        console.log(`    ⚠️  Could not resolve to string ID`)
      }
    } else if (typeof admin.companyId === 'string') {
      if (looksLikeObjectIdHex(admin.companyId)) {
        recordIssues.push('COMPANYID_HEX_STRING')
        issues.hexStringInsteadOfId.push({ 
          record: admin, 
          index: i + 1, 
          field: 'companyId',
          value: admin.companyId 
        })
        console.log(`    ❌ companyId is 24-char hex string (ObjectId format, should be actual string ID)`)
        
        // Try to resolve it
        const resolvedId = await getStringIdFromEntity(db, 'companies', admin.companyId)
        if (resolvedId) {
          console.log(`    💡 Should be: "${resolvedId}"`)
        } else {
          console.log(`    ⚠️  Could not resolve to string ID`)
        }
      } else if (isNumericStringId(admin.companyId)) {
        console.log(`    ✅ companyId is proper 6-digit string ID`)
      } else {
        console.log(`    ⚠️  companyId is string but not standard format: "${admin.companyId}"`)
      }
    }
    
    // Check employeeId
    console.log(`  employeeId: ${JSON.stringify(admin.employeeId)}`)
    console.log(`    Type: ${typeof admin.employeeId}`)
    console.log(`    Is ObjectId instance: ${admin.employeeId instanceof mongoose.Types.ObjectId}`)
    
    if (admin.employeeId instanceof mongoose.Types.ObjectId) {
      recordIssues.push('EMPLOYEEID_OBJECTID_INSTANCE')
      issues.objectIdInstances.push({ 
        record: admin, 
        index: i + 1, 
        field: 'employeeId',
        value: admin.employeeId 
      })
      console.log(`    ❌ employeeId is ObjectId instance (should be string ID)`)
      
      // Try to resolve it
      const resolvedId = await getStringIdFromEntity(db, 'employees', admin.employeeId)
      if (resolvedId) {
        console.log(`    💡 Should be: "${resolvedId}"`)
      } else {
        console.log(`    ⚠️  Could not resolve to string ID`)
      }
    } else if (typeof admin.employeeId === 'string') {
      if (looksLikeObjectIdHex(admin.employeeId)) {
        recordIssues.push('EMPLOYEEID_HEX_STRING')
        issues.hexStringInsteadOfId.push({ 
          record: admin, 
          index: i + 1, 
          field: 'employeeId',
          value: admin.employeeId 
        })
        console.log(`    ❌ employeeId is 24-char hex string (ObjectId format, should be actual string ID)`)
        
        // Try to resolve it
        const resolvedId = await getStringIdFromEntity(db, 'employees', admin.employeeId)
        if (resolvedId) {
          console.log(`    💡 Should be: "${resolvedId}"`)
        } else {
          console.log(`    ⚠️  Could not resolve to string ID`)
        }
      } else if (isNumericStringId(admin.employeeId)) {
        console.log(`    ✅ employeeId is proper 6-digit string ID`)
      } else {
        console.log(`    ⚠️  employeeId is string but not standard format: "${admin.employeeId}"`)
      }
    }
    
    // Check for format inconsistencies
    const companyIdIsProper = typeof admin.companyId === 'string' && 
                               !looksLikeObjectIdHex(admin.companyId) && 
                               !(admin.companyId instanceof mongoose.Types.ObjectId)
    const employeeIdIsProper = typeof admin.employeeId === 'string' && 
                                !looksLikeObjectIdHex(admin.employeeId) && 
                                !(admin.employeeId instanceof mongoose.Types.ObjectId)
    
    if (!companyIdIsProper || !employeeIdIsProper) {
      issues.inconsistentFormats.push({ record: admin, index: i + 1 })
    }
    
    // Normalize for duplicate detection
    let normalizedCompanyId = null
    let normalizedEmployeeId = null
    
    if (admin.companyId instanceof mongoose.Types.ObjectId) {
      const resolved = await getStringIdFromEntity(db, 'companies', admin.companyId)
      normalizedCompanyId = resolved || String(admin.companyId)
    } else if (typeof admin.companyId === 'string' && looksLikeObjectIdHex(admin.companyId)) {
      const resolved = await getStringIdFromEntity(db, 'companies', admin.companyId)
      normalizedCompanyId = resolved || admin.companyId
    } else {
      normalizedCompanyId = String(admin.companyId || '')
    }
    
    if (admin.employeeId instanceof mongoose.Types.ObjectId) {
      const resolved = await getStringIdFromEntity(db, 'employees', admin.employeeId)
      normalizedEmployeeId = resolved || String(admin.employeeId)
    } else if (typeof admin.employeeId === 'string' && looksLikeObjectIdHex(admin.employeeId)) {
      const resolved = await getStringIdFromEntity(db, 'employees', admin.employeeId)
      normalizedEmployeeId = resolved || admin.employeeId
    } else {
      normalizedEmployeeId = String(admin.employeeId || '')
    }
    
    if (normalizedCompanyId && normalizedEmployeeId) {
      const key = `${normalizedCompanyId}|${normalizedEmployeeId}`
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key).push({ ...admin, normalizedCompanyId, normalizedEmployeeId })
    }
    
    if (recordIssues.length > 0) {
      console.log(`\n  📋 Issues found: ${recordIssues.join(', ')}`)
    } else {
      console.log(`\n  ✅ No issues found`)
    }
  }
  
  // Check for duplicates
  console.log(`\n\n${'='.repeat(80)}`)
  console.log('DUPLICATE DETECTION')
  console.log('='.repeat(80))
  
  for (const [key, records] of groups.entries()) {
    if (records.length > 1) {
      const [companyId, employeeId] = key.split('|')
      issues.duplicates.push({ companyId, employeeId, records })
      console.log(`\n⚠️  Duplicate group: companyId="${companyId}", employeeId="${employeeId}"`)
      console.log(`   Count: ${records.length} records`)
      records.forEach((r, idx) => {
        console.log(`     ${idx + 1}. _id=${r._id}, createdAt=${r.createdAt || 'N/A'}`)
      })
    }
  }
  
  // Summary
  console.log(`\n\n${'='.repeat(80)}`)
  console.log('ISSUE SUMMARY')
  console.log('='.repeat(80))
  console.log(`Records missing 'id' field: ${issues.missingIdField.length}`)
  console.log(`Records with ObjectId instances: ${issues.objectIdInstances.length}`)
  console.log(`Records with hex strings instead of IDs: ${issues.hexStringInsteadOfId.length}`)
  console.log(`Records with inconsistent formats: ${issues.inconsistentFormats.length}`)
  console.log(`Duplicate groups: ${issues.duplicates.length}`)
  console.log('='.repeat(80))
  
  return issues
}

async function main() {
  try {
    const db = await connectDB()
    const issues = await analyzeCompanyAdmins(db)
    
    if (issues.missingIdField.length === 0 && 
        issues.objectIdInstances.length === 0 && 
        issues.hexStringInsteadOfId.length === 0 && 
        issues.duplicates.length === 0) {
      console.log('\n✅ No issues found! All records are consistent.')
    } else {
      console.log('\n⚠️  Issues found. Consider running the fix script.')
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
