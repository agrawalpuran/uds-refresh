/**
 * Fix invalid vendorId references in uniforms collection
 * Update them to use valid vendors from the vendors collection
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

async function fixInvalidVendorReferences() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    console.log('='.repeat(80))
    console.log('FIXING INVALID VENDOR REFERENCES IN UNIFORMS')
    console.log('='.repeat(80))
    console.log()

    // Get all vendors
    const vendors = await db.collection('vendors').find({}).toArray()
    if (vendors.length === 0) {
      console.log('❌ No vendors found in database!')
      await mongoose.disconnect()
      return
    }

    // Use first vendor as default (UniformPro Inc)
    const defaultVendor = vendors[0]
    console.log(`Using default vendor: ${defaultVendor.name} (${defaultVendor.id})`)
    console.log(`   _id: ${defaultVendor._id}\n`)

    // Get all uniforms with invalid vendorId
    const allUniforms = await db.collection('uniforms').find({}).toArray()
    const validVendorIds = new Set(vendors.map(v => v._id.toString()))

    let fixedCount = 0
    let removedCount = 0

    for (const uniform of allUniforms) {
      if (!uniform.vendorId) {
        continue // Skip if no vendorId
      }

      const vendorIdStr = uniform.vendorId.toString ? uniform.vendorId.toString() : String(uniform.vendorId)
      
      if (!validVendorIds.has(vendorIdStr)) {
        console.log(`Fixing: ${uniform.name} (ID: ${uniform.id})`)
        console.log(`   Old vendorId: ${vendorIdStr} (INVALID)`)
        
        // Option 1: Update to default vendor
        await db.collection('uniforms').updateOne(
          { _id: uniform._id },
          { $set: { vendorId: defaultVendor._id } }
        )
        
        console.log(`   ✅ Updated to: ${defaultVendor.name} (${defaultVendor._id})`)
        fixedCount++
        console.log()
      }
    }

    console.log('='.repeat(80))
    console.log('SUMMARY:')
    console.log('='.repeat(80))
    console.log(`   ✅ Fixed ${fixedCount} uniform(s)`)
    console.log(`   ⚠️  Removed ${removedCount} invalid vendorId(s)`)
    console.log()
    console.log('NOTE: The vendorId field in Uniform is optional/legacy.')
    console.log('The system uses ProductVendor collection for vendor relationships.')
    console.log('This fix ensures data consistency, but ProductVendor links are what matter.')

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
    console.log('\n🎉 Fix complete!')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

fixInvalidVendorReferences()

