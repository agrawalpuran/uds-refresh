/**
 * Force remove vendorId field from all uniform documents
 * Using $unset to completely remove the field
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

async function forceRemoveVendorId() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    console.log('='.repeat(80))
    console.log('FORCE REMOVING vendorId FIELD FROM ALL UNIFORMS')
    console.log('='.repeat(80))
    console.log()

    // Check before
    const beforeCount = await db.collection('uniforms').countDocuments({
      vendorId: { $exists: true }
    })
    console.log(`Found ${beforeCount} uniform(s) with vendorId field before removal\n`)

    if (beforeCount === 0) {
      console.log('✅ No uniforms have vendorId field - nothing to remove')
      await mongoose.disconnect()
      return
    }

    // Show which uniforms will be updated
    const uniformsWithVendorId = await db.collection('uniforms').find({
      vendorId: { $exists: true }
    }).toArray()
    
    console.log('Uniforms that will have vendorId removed:')
    uniformsWithVendorId.forEach((uniform, index) => {
      console.log(`   ${index + 1}. ${uniform.name || 'N/A'} (ID: ${uniform.id})`)
    })
    console.log()

    // Remove vendorId using $unset
    const result = await db.collection('uniforms').updateMany(
      { vendorId: { $exists: true } },
      { $unset: { vendorId: "" } }
    )

    console.log('='.repeat(80))
    console.log('UPDATE RESULT:')
    console.log('='.repeat(80))
    console.log(`   Matched: ${result.matchedCount} document(s)`)
    console.log(`   Modified: ${result.modifiedCount} document(s)`)
    console.log()

    // Verify removal
    const afterCount = await db.collection('uniforms').countDocuments({
      vendorId: { $exists: true }
    })
    
    console.log('='.repeat(80))
    console.log('VERIFICATION:')
    console.log('='.repeat(80))
    console.log(`   Before: ${beforeCount} uniform(s) with vendorId`)
    console.log(`   After: ${afterCount} uniform(s) with vendorId`)
    
    if (afterCount === 0) {
      console.log('\n✅ SUCCESS: All vendorId fields have been removed!')
    } else {
      console.log(`\n⚠️  WARNING: ${afterCount} uniform(s) still have vendorId field`)
      console.log('   This might be a caching issue. Try refreshing MongoDB Compass.')
    }

    // Show a sample document to verify
    const sampleUniform = await db.collection('uniforms').findOne({ id: 1 })
    if (sampleUniform) {
      console.log('\n' + '='.repeat(80))
      console.log('SAMPLE DOCUMENT (Formal Shirt - Male, ID: 1):')
      console.log('='.repeat(80))
      console.log('Fields:', Object.keys(sampleUniform).join(', '))
      if (sampleUniform.vendorId) {
        console.log(`   ❌ vendorId still exists: ${sampleUniform.vendorId}`)
      } else {
        console.log('   ✅ vendorId field does NOT exist')
      }
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
    console.log('\n🎉 Cleanup complete!')
    console.log('\nNOTE: If you still see vendorId in MongoDB Compass, try:')
    console.log('   1. Refresh the collection view (click refresh icon)')
    console.log('   2. Close and reopen the document')
    console.log('   3. The field has been removed from the database')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

forceRemoveVendorId()

