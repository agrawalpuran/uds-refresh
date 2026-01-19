/**
 * Inspect CompanyAdmins Script
 * 
 * This script shows detailed information about all companyadmins records
 * to help identify why the migration had duplicate key errors.
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

async function inspectCompanyAdmins(db) {
  const collection = db.collection('companyadmins')
  const allAdmins = await collection.find({}).toArray()
  
  console.log(`\n📊 Total companyadmins records: ${allAdmins.length}`)
  console.log('='.repeat(80))
  
  // Group by normalized companyId + employeeId
  const groups = new Map()
  
  for (const admin of allAdmins) {
    const companyIdRaw = admin.companyId
    const employeeIdRaw = admin.employeeId
    
    // Normalize to strings for comparison
    let companyIdStr = ''
    let employeeIdStr = ''
    
    if (companyIdRaw) {
      if (companyIdRaw instanceof mongoose.Types.ObjectId) {
        companyIdStr = companyIdRaw.toString()
      } else if (typeof companyIdRaw === 'object' && companyIdRaw._id) {
        companyIdStr = String(companyIdRaw._id)
      } else {
        companyIdStr = String(companyIdRaw)
      }
    }
    
    if (employeeIdRaw) {
      if (employeeIdRaw instanceof mongoose.Types.ObjectId) {
        employeeIdStr = employeeIdRaw.toString()
      } else if (typeof employeeIdRaw === 'object' && employeeIdRaw._id) {
        employeeIdStr = String(employeeIdRaw._id)
      } else {
        employeeIdStr = String(employeeIdRaw)
      }
    }
    
    const key = `${companyIdStr}|${employeeIdStr}`
    
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key).push({
      ...admin,
      normalizedCompanyId: companyIdStr,
      normalizedEmployeeId: employeeIdStr
    })
  }
  
  // Check for duplicates (normalized)
  console.log('\n🔍 Analyzing records by normalized companyId + employeeId:')
  console.log('='.repeat(80))
  
  let duplicateCount = 0
  for (const [key, records] of groups.entries()) {
    if (records.length > 1) {
      duplicateCount++
      const [companyId, employeeId] = key.split('|')
      console.log(`\n⚠️  DUPLICATE GROUP ${duplicateCount}:`)
      console.log(`   Normalized: companyId="${companyId}", employeeId="${employeeId}"`)
      console.log(`   Count: ${records.length} records`)
      
      records.forEach((record, idx) => {
        console.log(`\n   Record ${idx + 1}:`)
        console.log(`     _id: ${record._id}`)
        console.log(`     companyId (raw): ${JSON.stringify(record.companyId)} (type: ${typeof record.companyId}, isObjectId: ${record.companyId instanceof mongoose.Types.ObjectId})`)
        console.log(`     employeeId (raw): ${JSON.stringify(record.employeeId)} (type: ${typeof record.employeeId}, isObjectId: ${record.employeeId instanceof mongoose.Types.ObjectId})`)
        console.log(`     normalizedCompanyId: ${record.normalizedCompanyId}`)
        console.log(`     normalizedEmployeeId: ${record.normalizedEmployeeId}`)
        console.log(`     privileges: ${JSON.stringify(record.privileges || {})}`)
        console.log(`     createdAt: ${record.createdAt || 'N/A'}`)
        console.log(`     updatedAt: ${record.updatedAt || 'N/A'}`)
      })
    }
  }
  
  if (duplicateCount === 0) {
    console.log('\n✅ No duplicates found when normalized!')
  }
  
  // Show all records for reference
  console.log('\n\n📋 All CompanyAdmins Records:')
  console.log('='.repeat(80))
  
  allAdmins.forEach((admin, idx) => {
    console.log(`\n${idx + 1}. _id: ${admin._id}`)
    console.log(`   companyId: ${JSON.stringify(admin.companyId)} (type: ${typeof admin.companyId}, isObjectId: ${admin.companyId instanceof mongoose.Types.ObjectId})`)
    console.log(`   employeeId: ${JSON.stringify(admin.employeeId)} (type: ${typeof admin.employeeId}, isObjectId: ${admin.employeeId instanceof mongoose.Types.ObjectId})`)
    console.log(`   privileges: ${JSON.stringify(admin.privileges || {})}`)
  })
  
  // Check index
  console.log('\n\n🔍 Checking indexes:')
  console.log('='.repeat(80))
  const indexes = await collection.indexes()
  indexes.forEach((index, idx) => {
    console.log(`${idx + 1}. ${index.name}: ${JSON.stringify(index.key)}`)
    if (index.unique) {
      console.log(`   Unique: true`)
    }
  })
}

async function main() {
  try {
    const db = await connectDB()
    await inspectCompanyAdmins(db)
  } catch (error) {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('\n✅ Database connection closed')
  }
}

main().catch(console.error)
