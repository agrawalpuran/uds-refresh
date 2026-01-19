/**
 * Fix script to ensure all companies have valid id fields
 * Creates missing id fields for companies that don't have them
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables
let MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) {
  try {
    const envPath = path.join(__dirname, '..', 'env.local')
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8')
      const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
      if (mongoMatch) {
        MONGODB_URI = mongoMatch[1].trim()
      }
    }
  } catch (error) {
    console.error('Could not read env.local file')
  }
}

if (!MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is required')
  console.error('Set it in env.local file or as environment variable')
  process.exit(1)
}

async function fixCompanyIds() {
  try {
    console.log('🔧 Fixing Company ID Fields')
    console.log('='.repeat(60))
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
    
    // Get all companies
    const companies = await db.collection('companies').find({}).toArray()
    console.log(`📊 Found ${companies.length} companies`)
    console.log('')
    
    // Find companies without id field
    const companiesWithoutId = companies.filter(c => !c.id)
    console.log(`⚠️  Companies without id field: ${companiesWithoutId.length}`)
    
    if (companiesWithoutId.length === 0) {
      console.log('✅ All companies already have id fields!')
      await mongoose.disconnect()
      return
    }
    
    // Get the highest existing id to generate new ones
    const companiesWithId = companies.filter(c => c.id && /^\d{6}$/.test(String(c.id)))
    let maxId = 100000 // Start from 100000 if no existing IDs
    
    if (companiesWithId.length > 0) {
      const numericIds = companiesWithId.map(c => parseInt(c.id, 10)).filter(id => !isNaN(id))
      if (numericIds.length > 0) {
        maxId = Math.max(...numericIds)
      }
    }
    
    console.log(`   Starting new IDs from: ${maxId + 1}`)
    console.log('')
    
    // Fix each company
    let fixedCount = 0
    let skippedCount = 0
    
    for (const company of companiesWithoutId) {
      const newId = String(maxId + 1).padStart(6, '0')
      maxId++
      
      try {
        // Check if this id already exists
        const existing = await db.collection('companies').findOne({ id: newId })
        if (existing) {
          console.log(`⚠️  ID ${newId} already exists, skipping ${company.name}`)
          skippedCount++
          continue
        }
        
        // Update company with new id
        await db.collection('companies').updateOne(
          { _id: company._id },
          { $set: { id: newId } }
        )
        
        console.log(`✅ Fixed: ${company.name}`)
        console.log(`   Added id: ${newId}`)
        fixedCount++
      } catch (error) {
        console.error(`❌ Error fixing ${company.name}:`, error.message)
      }
    }
    
    console.log('')
    console.log('📋 Summary')
    console.log('='.repeat(60))
    console.log(`   Fixed: ${fixedCount} companies`)
    if (skippedCount > 0) {
      console.log(`   Skipped: ${skippedCount} companies (ID conflicts)`)
    }
    console.log('')
    
    // Verify all companies now have id fields
    const allCompanies = await db.collection('companies').find({}).toArray()
    const stillMissing = allCompanies.filter(c => !c.id)
    
    if (stillMissing.length === 0) {
      console.log('✅ All companies now have id fields!')
    } else {
      console.log(`⚠️  ${stillMissing.length} companies still missing id fields`)
    }
    console.log('')
    
    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

fixCompanyIds()



