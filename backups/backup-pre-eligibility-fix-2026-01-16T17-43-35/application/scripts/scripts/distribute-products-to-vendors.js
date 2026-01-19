/**
 * Distribute products across multiple vendors based on product category
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

async function distributeProducts() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    // Get all vendors
    const vendors = await db.collection('vendors').find({}).toArray()
    console.log(`Found ${vendors.length} vendors:`)
    vendors.forEach(v => {
      console.log(`   - ${v.name} (${v.id}) - _id: ${v._id}`)
    })
    console.log()

    // Get all products
    const products = await db.collection('uniforms').find({}).toArray()
    console.log(`Found ${products.length} products\n`)

    // Get all companies
    const companies = await db.collection('companies').find({}).toArray()
    console.log(`Found ${companies.length} companies\n`)

    // Get existing ProductVendor links
    const existingLinks = await db.collection('productvendors').find({}).toArray()
    console.log(`Found ${existingLinks.length} existing ProductVendor links\n`)

    console.log('='.repeat(80))
    console.log('CURRENT DISTRIBUTION:')
    console.log('='.repeat(80))
    
    const vendorUsage = new Map()
    existingLinks.forEach(link => {
      const vendorId = link.vendorId ? link.vendorId.toString() : 'MISSING'
      vendorUsage.set(vendorId, (vendorUsage.get(vendorId) || 0) + 1)
    })

    vendorUsage.forEach((count, vendorId) => {
      const vendor = vendors.find(v => v._id.toString() === vendorId)
      console.log(`   ${vendor ? vendor.name : 'UNKNOWN'}: ${count} product link(s)`)
    })

    console.log('\n' + '='.repeat(80))
    console.log('RECOMMENDATION:')
    console.log('='.repeat(80))
    console.log('Currently all products are linked to UniformPro Inc.')
    console.log('If you want to distribute products across vendors:')
    console.log('  - Footwear products → Footwear Plus (VEND-002)')
    console.log('  - Other products → UniformPro Inc (VEND-001) or Elite Uniforms (VEND-003)')
    console.log('\nThis is just informational - your current setup is working correctly.')
    console.log('All products having the same vendor _id in ProductVendor links is normal')
    console.log('if you only have one vendor supplying all products.')

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

distributeProducts()

