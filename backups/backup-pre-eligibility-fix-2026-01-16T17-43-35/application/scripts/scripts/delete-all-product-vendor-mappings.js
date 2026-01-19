/**
 * Script to delete all ProductVendor mappings from the database
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8')
  envFile.split('\n').forEach(line => {
    const trimmedLine = line.trim()
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const match = trimmedLine.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim().replace(/^["']|["']$/g, '')
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Define schema
const ProductVendorSchema = new mongoose.Schema({}, { strict: false, collection: 'productvendors' })
const ProductVendor = mongoose.models.ProductVendor || mongoose.model('ProductVendor', ProductVendorSchema, 'productvendors')

async function deleteAllProductVendorMappings() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db

    // Get count before deletion
    const countBefore = await ProductVendor.countDocuments()
    console.log(`📊 Total ProductVendor mappings found: ${countBefore}`)

    if (countBefore === 0) {
      console.log('ℹ️  No ProductVendor mappings found. Nothing to delete.')
      await mongoose.disconnect()
      console.log('\nDisconnected from MongoDB')
      return
    }

    // Show sample mappings before deletion
    const sampleMappings = await ProductVendor.find({}).limit(5).lean()
    console.log('\nSample mappings (first 5):')
    for (const mapping of sampleMappings) {
      console.log(`  - ProductId: ${mapping.productId}, VendorId: ${mapping.vendorId}`)
    }

    // Confirm deletion
    console.log(`\n⚠️  WARNING: This will delete ALL ${countBefore} ProductVendor mappings!`)
    console.log('To proceed, run: node scripts/delete-all-product-vendor-mappings.js --confirm')

    // Check if --confirm flag is provided
    if (process.argv.includes('--confirm')) {
      console.log('\n🗑️  Deleting all ProductVendor mappings...')
      
      const result = await ProductVendor.deleteMany({})
      
      console.log(`\n✅ Successfully deleted ${result.deletedCount} ProductVendor mappings`)
      
      // Verify deletion
      const countAfter = await ProductVendor.countDocuments()
      console.log(`📊 Remaining ProductVendor mappings: ${countAfter}`)
      
      if (countAfter === 0) {
        console.log('✅ All ProductVendor mappings have been deleted successfully!')
      } else {
        console.log(`⚠️  Warning: ${countAfter} mappings still exist`)
      }
    } else {
      console.log('\nℹ️  Deletion not confirmed. No changes made.')
    }

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  }
}

deleteAllProductVendorMappings()



