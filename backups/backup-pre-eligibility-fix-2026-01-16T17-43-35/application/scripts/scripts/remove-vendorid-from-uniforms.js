/**
 * Remove vendorId field from all uniform documents in the database
 * This field is no longer needed as ProductVendor collection handles vendor relationships
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

async function removeVendorIdFromUniforms() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    console.log('='.repeat(80))
    console.log('REMOVING vendorId FIELD FROM UNIFORMS COLLECTION')
    console.log('='.repeat(80))
    console.log()

    // Get all uniforms with vendorId
    const uniformsWithVendorId = await db.collection('uniforms').find({
      vendorId: { $exists: true }
    }).toArray()

    console.log(`Found ${uniformsWithVendorId.length} uniform(s) with vendorId field\n`)

    if (uniformsWithVendorId.length === 0) {
      console.log('✅ No uniforms have vendorId field - nothing to remove')
      await mongoose.disconnect()
      return
    }

    // Show what will be removed
    console.log('Uniforms that will have vendorId removed:')
    uniformsWithVendorId.forEach((uniform, index) => {
      console.log(`   ${index + 1}. ${uniform.name || 'N/A'} (ID: ${uniform.id})`)
      console.log(`      Current vendorId: ${uniform.vendorId ? uniform.vendorId.toString() : 'N/A'}`)
    })
    console.log()

    // Remove vendorId from all uniforms
    const result = await db.collection('uniforms').updateMany(
      { vendorId: { $exists: true } },
      { $unset: { vendorId: "" } }
    )

    console.log('='.repeat(80))
    console.log('SUMMARY:')
    console.log('='.repeat(80))
    console.log(`   ✅ Removed vendorId from ${result.modifiedCount} uniform(s)`)
    console.log(`   📊 Matched ${result.matchedCount} document(s)`)
    console.log()
    console.log('NOTE:')
    console.log('   - vendorId field has been removed from Uniform model')
    console.log('   - Vendor relationships are now managed via ProductVendor collection')
    console.log('   - This is the correct approach for multi-vendor support')

    // Verify removal
    const remaining = await db.collection('uniforms').countDocuments({
      vendorId: { $exists: true }
    })

    if (remaining === 0) {
      console.log('\n✅ Verification: No uniforms have vendorId field remaining')
    } else {
      console.log(`\n⚠️  Warning: ${remaining} uniform(s) still have vendorId field`)
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
    console.log('\n🎉 Cleanup complete!')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

removeVendorIdFromUniforms()

