/**
 * Script to purge all relationship data from the database
 * Deletes all ProductCompany and ProductVendor relationships
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

async function purgeAllRelationships() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    // Count existing relationships
    const productCompanyCount = await db.collection('productcompanies').countDocuments({})
    const productVendorCount = await db.collection('productvendors').countDocuments({})

    console.log('=== CURRENT RELATIONSHIP COUNTS ===')
    console.log(`ProductCompany relationships: ${productCompanyCount}`)
    console.log(`ProductVendor relationships: ${productVendorCount}\n`)

    if (productCompanyCount === 0 && productVendorCount === 0) {
      console.log('✅ No relationships to purge')
      await mongoose.disconnect()
      process.exit(0)
    }

    // Confirm deletion
    console.log('⚠️  WARNING: This will delete ALL relationship data!')
    console.log('   - All Product-Company relationships will be deleted')
    console.log('   - All Product-Vendor relationships will be deleted\n')

    // Delete ProductCompany relationships
    console.log('Deleting ProductCompany relationships...')
    const productCompanyResult = await db.collection('productcompanies').deleteMany({})
    console.log(`✅ Deleted ${productCompanyResult.deletedCount} ProductCompany relationship(s)\n`)

    // Delete ProductVendor relationships
    console.log('Deleting ProductVendor relationships...')
    const productVendorResult = await db.collection('productvendors').deleteMany({})
    console.log(`✅ Deleted ${productVendorResult.deletedCount} ProductVendor relationship(s)\n`)

    // Verify deletion
    const remainingProductCompany = await db.collection('productcompanies').countDocuments({})
    const remainingProductVendor = await db.collection('productvendors').countDocuments({})

    console.log('=== VERIFICATION ===')
    console.log(`Remaining ProductCompany relationships: ${remainingProductCompany}`)
    console.log(`Remaining ProductVendor relationships: ${remainingProductVendor}\n`)

    if (remainingProductCompany === 0 && remainingProductVendor === 0) {
      console.log('✅ All relationships have been purged successfully!')
    } else {
      console.log('⚠️  Some relationships may still exist')
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
    process.exit(0)
  } catch (error) {
    console.error('❌ Purge failed:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

purgeAllRelationships()

