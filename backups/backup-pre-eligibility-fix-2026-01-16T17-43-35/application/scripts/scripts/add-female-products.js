/**
 * Script to add 3 new female products to the catalog:
 * 1. Formal Trouser - Female
 * 2. Blazer - Female
 * 3. Shoes - Female
 */

const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Define Uniform Schema
const UniformSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  category: { type: String, enum: ['shirt', 'pant', 'shoe', 'jacket', 'accessory'], required: true },
  gender: { type: String, enum: ['male', 'female', 'unisex'], required: true },
  sizes: [String],
  price: { type: Number, required: true },
  image: { type: String, required: true },
  sku: { type: String, required: true, unique: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  stock: { type: Number, required: true, default: 0 },
  companyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Company' }],
}, { timestamps: true })

const Uniform = mongoose.models.Uniform || mongoose.model('Uniform', UniformSchema)

const Vendor = mongoose.models.Vendor || mongoose.model('Vendor', new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
}, { timestamps: true }))

const Company = mongoose.models.Company || mongoose.model('Company', new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
}, { timestamps: true }))

async function addFemaleProducts() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Get vendor and company IDs
    const vendor = await Vendor.findOne({ id: 'VEND-001' })
    if (!vendor) {
      console.error('❌ Vendor VEND-001 not found')
      process.exit(1)
    }

    const company = await Company.findOne({ id: 'COMP-INDIGO' })
    if (!company) {
      console.error('❌ Company COMP-INDIGO not found')
      process.exit(1)
    }

    // Check if products already exist
    const existingProducts = await Uniform.find({
      $or: [
        { sku: 'PANT-F-002' },
        { sku: 'JACKET-F-002' },
        { sku: 'SHOE-F-002' }
      ]
    })

    if (existingProducts.length > 0) {
      console.log('⚠️  Some products already exist:')
      existingProducts.forEach(p => console.log(`   - ${p.name} (${p.sku})`))
      console.log('\n💡 Skipping existing products...')
    }

    const newProducts = [
      {
        id: `PROD-${Date.now()}-1`,
        name: 'Formal Trouser - Female',
        category: 'pant',
        gender: 'female',
        sizes: ['26', '28', '30', '32', '34', '36'],
        price: 2000,
        image: '/images/uniforms/pant-female.jpg', // Will use local image
        sku: 'PANT-F-002',
        vendorId: vendor._id,
        stock: 150,
        companyIds: [company._id]
      },
      {
        id: `PROD-${Date.now()}-2`,
        name: 'Blazer - Female',
        category: 'jacket',
        gender: 'female',
        sizes: ['XS', 'S', 'M', 'L', 'XL'],
        price: 4000,
        image: '/images/uniforms/jacket-female.jpg', // Will use local image
        sku: 'JACKET-F-002',
        vendorId: vendor._id,
        stock: 100,
        companyIds: [company._id]
      },
      {
        id: `PROD-${Date.now()}-3`,
        name: 'Shoes - Female',
        category: 'shoe',
        gender: 'female',
        sizes: ['5', '6', '7', '8', '9', '10'],
        price: 3000,
        image: '/images/uniforms/shoe-image.jpg', // Will use local image
        sku: 'SHOE-F-002',
        vendorId: vendor._id,
        stock: 120,
        companyIds: [company._id]
      }
    ]

    let addedCount = 0
    let skippedCount = 0

    for (const product of newProducts) {
      // Check if product with this SKU already exists
      const existing = await Uniform.findOne({ sku: product.sku })
      if (existing) {
        console.log(`⏭️  Skipping ${product.name} - already exists (SKU: ${product.sku})`)
        skippedCount++
        continue
      }

      const created = await Uniform.create(product)
      console.log(`✅ Added: ${product.name}`)
      console.log(`   SKU: ${product.sku}`)
      console.log(`   Price: ₹${product.price}`)
      console.log(`   Stock: ${product.stock}`)
      console.log(`   Sizes: ${product.sizes.join(', ')}`)
      addedCount++
    }

    console.log(`\n📊 Summary:`)
    console.log(`   ✅ Added: ${addedCount} products`)
    console.log(`   ⏭️  Skipped: ${skippedCount} products`)
    console.log(`\n🎉 Process completed!`)

  } catch (error) {
    console.error('❌ Error adding products:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

addFemaleProducts()



