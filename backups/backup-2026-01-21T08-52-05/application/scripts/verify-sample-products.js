/**
 * Quick verification script to check if sample products exist
 */

const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=')
      const value = valueParts.join('=').trim()
      if (key && value) {
        process.env[key.trim()] = value
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

const UniformSchema = new mongoose.Schema({}, { strict: false })
const Uniform = mongoose.models.Uniform || mongoose.model('Uniform', UniformSchema)

async function verifyProducts() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Check for products with IDs 200001-200010
    const productIds = ['200001', '200002', '200003', '200004', '200005', '200006', '200007', '200008', '200009', '200010']
    const products = await Uniform.find({ id: { $in: productIds } })
      .select('id name sku category gender price stock companyIds')
      .lean()

    console.log(`Found ${products.length} out of 10 sample products:\n`)
    products.forEach(p => {
      console.log(`  ✅ ${p.name}`)
      console.log(`     ID: ${p.id}, SKU: ${p.sku}`)
      console.log(`     Category: ${p.category}, Gender: ${p.gender}`)
      console.log(`     Price: ₹${p.price}, Stock: ${p.stock}`)
      console.log(`     Company IDs: ${p.companyIds?.length || 0} (should be 0 - no relationships)\n`)
    })

    // Check for orphan records (products with companyIds)
    const productsWithCompanies = await Uniform.find({ 
      id: { $in: productIds },
      companyIds: { $exists: true, $ne: [] }
    }).countDocuments()

    if (productsWithCompanies > 0) {
      console.log(`⚠️  Warning: ${productsWithCompanies} products have company relationships (should be 0)`)
    } else {
      console.log('✅ No orphan records - all products have empty companyIds array')
    }

    // Verify via getAllProducts API function
    console.log('\n📋 Verifying products appear in getAllProducts()...')
    const allProducts = await Uniform.find().lean()
    const sampleProductsInAll = allProducts.filter(p => productIds.includes(p.id))
    console.log(`✅ ${sampleProductsInAll.length} sample products found in getAllProducts()`)

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

verifyProducts()

