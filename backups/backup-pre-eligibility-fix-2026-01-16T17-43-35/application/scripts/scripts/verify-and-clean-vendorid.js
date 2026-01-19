/**
 * Verify and clean vendorId field - also drop index if it exists
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

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
  console.warn('Could not read .env.local')
}

async function verifyAndClean() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    console.log('='.repeat(80))
    console.log('VERIFYING AND CLEANING vendorId FIELD')
    console.log('='.repeat(80))
    console.log()

    // Check indexes
    console.log('Checking indexes on uniforms collection...')
    const indexes = await db.collection('uniforms').indexes()
    console.log('Current indexes:')
    indexes.forEach(idx => {
      console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`)
    })
    console.log()

    // Drop vendorId index if it exists
    const vendorIdIndex = indexes.find(idx => idx.name === 'vendorId_1' || (idx.key && idx.key.vendorId))
    if (vendorIdIndex) {
      console.log(`⚠️  Found vendorId index: ${vendorIdIndex.name}`)
      try {
        await db.collection('uniforms').dropIndex(vendorIdIndex.name)
        console.log(`✅ Dropped vendorId index: ${vendorIdIndex.name}`)
      } catch (error) {
        console.log(`   Note: ${error.message}`)
      }
    } else {
      console.log('✅ No vendorId index found')
    }
    console.log()

    // Force remove vendorId from ALL documents (even if query doesn't find them)
    console.log('Removing vendorId from all uniform documents...')
    const result = await db.collection('uniforms').updateMany(
      {}, // Update ALL documents
      { $unset: { vendorId: "" } }
    )
    
    console.log(`   Matched: ${result.matchedCount} document(s)`)
    console.log(`   Modified: ${result.modifiedCount} document(s)`)
    console.log()

    // Verify by checking a specific document
    const sampleUniform = await db.collection('uniforms').findOne({ id: 1 })
    if (sampleUniform) {
      console.log('='.repeat(80))
      console.log('VERIFICATION - Sample Document (Formal Shirt - Male, ID: 1):')
      console.log('='.repeat(80))
      console.log('All fields:', Object.keys(sampleUniform).sort().join(', '))
      
      if (sampleUniform.vendorId !== undefined) {
        console.log(`\n❌ PROBLEM: vendorId still exists: ${sampleUniform.vendorId}`)
        console.log('   Type:', typeof sampleUniform.vendorId)
        console.log('   Value:', sampleUniform.vendorId)
      } else {
        console.log('\n✅ CONFIRMED: vendorId field does NOT exist in database')
      }
    }

    // Check all documents
    const allUniforms = await db.collection('uniforms').find({}).toArray()
    const withVendorId = allUniforms.filter(u => u.vendorId !== undefined)
    
    console.log('\n' + '='.repeat(80))
    console.log('FINAL VERIFICATION:')
    console.log('='.repeat(80))
    console.log(`   Total documents: ${allUniforms.length}`)
    console.log(`   Documents with vendorId: ${withVendorId.length}`)
    
    if (withVendorId.length > 0) {
      console.log('\n⚠️  Documents still with vendorId:')
      withVendorId.forEach(u => {
        console.log(`   - ${u.name} (ID: ${u.id}): vendorId = ${u.vendorId}`)
      })
    } else {
      console.log('\n✅ SUCCESS: No documents have vendorId field!')
      console.log('\nIf you still see vendorId in MongoDB Compass:')
      console.log('   1. Click the REFRESH button (circular arrow icon)')
      console.log('   2. Close and reopen the document')
      console.log('   3. Close and reopen MongoDB Compass')
      console.log('   4. The field has been removed from the database - Compass is showing cached data')
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

verifyAndClean()

