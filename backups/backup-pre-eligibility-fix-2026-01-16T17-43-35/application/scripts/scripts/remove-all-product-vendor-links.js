/**
 * Script to remove all ProductVendor linkages from the database
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Try to read .env.local file manually
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
  console.warn('Could not read .env.local, using default connection string')
}

async function removeAllProductVendorLinks() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    // Get count before deletion
    const countBefore = await db.collection('productvendors').countDocuments()
    console.log(`Found ${countBefore} ProductVendor links in database\n`)

    if (countBefore === 0) {
      console.log('No ProductVendor links to remove.')
      await mongoose.disconnect()
      return
    }

    // List all links before deletion
    const allLinks = await db.collection('productvendors').find({}).toArray()
    console.log('ProductVendor links to be removed:')
    allLinks.forEach((link, index) => {
      const productIdStr = link.productId ? link.productId.toString() : 'null'
      const vendorIdStr = link.vendorId ? link.vendorId.toString() : 'null'
      console.log(`  ${index + 1}. productId: ${productIdStr}, vendorId: ${vendorIdStr}`)
    })
    console.log()

    // Delete all ProductVendor links
    const result = await db.collection('productvendors').deleteMany({})
    
    console.log('='.repeat(80))
    console.log(`✓ Deleted ${result.deletedCount} ProductVendor link(s)`)
    console.log('='.repeat(80))

    // Verify deletion
    const countAfter = await db.collection('productvendors').countDocuments()
    if (countAfter === 0) {
      console.log('✓ Verification: All ProductVendor links have been removed')
    } else {
      console.warn(`⚠ Warning: ${countAfter} ProductVendor links still remain`)
    }

    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

removeAllProductVendorLinks()

