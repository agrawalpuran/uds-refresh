/**
 * Script to safely add 10 sample products to the UDS application
 * 
 * STRICT RULES:
 * 1. Do NOT modify or delete any existing records
 * 2. Do NOT change schemas, indexes, or migrations
 * 3. Do NOT hardcode ObjectIds
 * 4. Do NOT create vendor, company, inventory, or eligibility relationships
 * 5. Do NOT bypass model validations
 * 6. Abort execution if NODE_ENV === "production"
 */

const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')

// Load environment variables from .env.local
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

// Check NODE_ENV
if (process.env.NODE_ENV === 'production') {
  console.error('❌ ERROR: This script cannot run in production environment')
  process.exit(1)
}

// Import the Uniform model
const UniformSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: function(v) {
        return /^\d{6}$/.test(v)
      },
      message: 'Uniform/Product ID must be a 6-digit numeric string (e.g., "200001")'
    }
  },
  name: { type: String, required: true },
  category: {
    type: String,
    enum: ['shirt', 'pant', 'shoe', 'jacket', 'accessory'],
    required: true
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'unisex'],
    required: true
  },
  sizes: { type: [String], required: true },
  price: { type: Number, required: true },
  image: { type: String, required: true },
  sku: { type: String, required: true, unique: true },
  stock: { type: Number, required: true, default: 0 },
  companyIds: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Company',
    default: []
  },
  attribute1_name: { type: String, required: false },
  attribute1_value: { type: mongoose.Schema.Types.Mixed, required: false },
  attribute2_name: { type: String, required: false },
  attribute2_value: { type: mongoose.Schema.Types.Mixed, required: false },
  attribute3_name: { type: String, required: false },
  attribute3_value: { type: mongoose.Schema.Types.Mixed, required: false },
}, {
  timestamps: true,
  strictPopulate: false
})

const Uniform = mongoose.models.Uniform || mongoose.model('Uniform', UniformSchema)

// 10 sample products similar to existing ones
const SAMPLE_PRODUCTS = [
  {
    name: 'Oxford Shirt - Male',
    category: 'shirt',
    gender: 'male',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    price: 1399,
    image: '/images/products/shirt-male-oxford.jpg',
    sku: 'SHIRT-M-O-002',
    stock: 110,
    attribute1_name: 'GSM',
    attribute1_value: 360,
    attribute2_name: 'Fabric',
    attribute2_value: 'Cotton',
    attribute3_name: 'Style',
    attribute3_value: 'Classic Fit',
  },
  {
    name: 'Denim Shirt - Male',
    category: 'shirt',
    gender: 'male',
    sizes: ['S', 'M', 'L', 'XL'],
    price: 1099,
    image: '/images/products/shirt-male-denim.jpg',
    sku: 'SHIRT-M-D-002',
    stock: 130,
    attribute1_name: 'GSM',
    attribute1_value: 320,
    attribute2_name: 'Fabric',
    attribute2_value: 'Denim',
    attribute3_name: 'Style',
    attribute3_value: 'Regular Fit',
  },
  {
    name: 'Kurti - Female',
    category: 'shirt',
    gender: 'female',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    price: 1299,
    image: '/images/products/shirt-female-kurti.jpg',
    sku: 'SHIRT-F-K-002',
    stock: 95,
    attribute1_name: 'GSM',
    attribute1_value: 280,
    attribute2_name: 'Fabric',
    attribute2_value: 'Cotton',
    attribute3_name: 'Style',
    attribute3_value: 'A-Line',
  },
  {
    name: 'Cargo Pants - Male',
    category: 'pant',
    gender: 'male',
    sizes: ['28', '30', '32', '34', '36', '38'],
    price: 1999,
    image: '/images/products/pant-male-cargo.jpg',
    sku: 'PANT-M-CG-002',
    stock: 88,
    attribute1_name: 'GSM',
    attribute1_value: 300,
    attribute2_name: 'Fabric',
    attribute2_value: 'Cotton Twill',
    attribute3_name: 'Style',
    attribute3_value: 'Relaxed Fit',
  },
  {
    name: 'Palazzo Pants - Female',
    category: 'pant',
    gender: 'female',
    sizes: ['26', '28', '30', '32', '34'],
    price: 1599,
    image: '/images/products/pant-female-palazzo.jpg',
    sku: 'PANT-F-P-002',
    stock: 72,
    attribute1_name: 'GSM',
    attribute1_value: 220,
    attribute2_name: 'Fabric',
    attribute2_value: 'Georgette',
    attribute3_name: 'Style',
    attribute3_value: 'Wide Leg',
  },
  {
    name: 'Loafers - Male',
    category: 'shoe',
    gender: 'male',
    sizes: ['7', '8', '9', '10', '11'],
    price: 3299,
    image: '/images/products/shoe-male-loafers.jpg',
    sku: 'SHOE-M-L-002',
    stock: 65,
    attribute1_name: 'Material',
    attribute1_value: 'Genuine Leather',
    attribute2_name: 'Sole',
    attribute2_value: 'Leather',
    attribute3_name: 'Style',
    attribute3_value: 'Classic',
  },
  {
    name: 'Heels - Female',
    category: 'shoe',
    gender: 'female',
    sizes: ['5', '6', '7', '8', '9'],
    price: 2799,
    image: '/images/products/shoe-female-heels.jpg',
    sku: 'SHOE-F-H-002',
    stock: 58,
    attribute1_name: 'Material',
    attribute1_value: 'Synthetic Leather',
    attribute2_name: 'Heel Height',
    attribute2_value: '3 inches',
    attribute3_name: 'Style',
    attribute3_value: 'Stiletto',
  },
  {
    name: 'Sneakers - Unisex',
    category: 'shoe',
    gender: 'unisex',
    sizes: ['6', '7', '8', '9', '10', '11'],
    price: 2299,
    image: '/images/products/shoe-unisex-sneakers.jpg',
    sku: 'SHOE-U-SN-002',
    stock: 90,
    attribute1_name: 'Material',
    attribute1_value: 'Mesh & Synthetic',
    attribute2_name: 'Sole',
    attribute2_value: 'Rubber',
    attribute3_name: 'Style',
    attribute3_value: 'Athletic',
  },
  {
    name: 'Windbreaker - Unisex',
    category: 'jacket',
    gender: 'unisex',
    sizes: ['S', 'M', 'L', 'XL'],
    price: 3799,
    image: '/images/products/jacket-unisex-windbreaker.jpg',
    sku: 'JACKET-U-W-002',
    stock: 55,
    attribute1_name: 'GSM',
    attribute1_value: 180,
    attribute2_name: 'Fabric',
    attribute2_value: 'Polyester',
    attribute3_name: 'Style',
    attribute3_value: 'Lightweight',
  },
  {
    name: 'Tie - Unisex',
    category: 'accessory',
    gender: 'unisex',
    sizes: ['One Size'],
    price: 699,
    image: '/images/products/accessory-tie.jpg',
    sku: 'ACC-U-T-002',
    stock: 150,
    attribute1_name: 'Material',
    attribute1_value: 'Silk',
    attribute2_name: 'Width',
    attribute2_value: '3 inches',
    attribute3_name: 'Pattern',
    attribute3_value: 'Solid',
  },
]

/**
 * Find the next available product ID
 */
async function getNextProductId() {
  const existingProducts = await Uniform.find({})
    .sort({ id: -1 })
    .limit(1)
    .lean()
  
  let nextProductId = 200001 // Start from 200001
  
  if (existingProducts.length > 0) {
    const lastId = existingProducts[0].id
    if (/^\d{6}$/.test(String(lastId))) {
      const lastIdNum = parseInt(String(lastId), 10)
      if (lastIdNum >= 200001 && lastIdNum < 300000) {
        nextProductId = lastIdNum + 1
      }
    }
  }
  
  // Find next available ID if current one exists
  let productId = String(nextProductId).padStart(6, '0')
  let exists = await Uniform.findOne({ id: productId })
  let attempts = 0
  while (exists && attempts < 1000) {
    nextProductId++
    productId = String(nextProductId).padStart(6, '0')
    exists = await Uniform.findOne({ id: productId })
    attempts++
  }
  
  if (attempts >= 1000) {
    throw new Error('Could not find available product ID after 1000 attempts')
  }
  
  return { productId, nextProductId }
}

/**
 * Main function to add sample products
 */
async function addSampleProducts() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      let productIdCounter = 200001
      const { productId: startId, nextProductId: startCounter } = await getNextProductId()
      productIdCounter = startCounter

      console.log('========================================')
      console.log('ADDING 10 SAMPLE PRODUCTS')
      console.log('========================================\n')

      let totalAttempted = 0
      let totalCreated = 0
      let totalSkipped = 0
      const skippedProducts = []
      const createdProducts = []
      const errors = []

      for (const productData of SAMPLE_PRODUCTS) {
        totalAttempted++

        try {
          // Check if product with this SKU already exists
          const existingBySku = await Uniform.findOne({ sku: productData.sku }).session(session)
          if (existingBySku) {
            console.log(`⏭️  [${totalAttempted}/10] Skipping "${productData.name}" - SKU ${productData.sku} already exists`)
            skippedProducts.push({
              name: productData.name,
              sku: productData.sku,
              reason: 'SKU already exists'
            })
            totalSkipped++
            continue
          }

          // Get next available product ID
          let productId = String(productIdCounter).padStart(6, '0')
          let existingById = await Uniform.findOne({ id: productId }).session(session)
          let attempts = 0
          while (existingById && attempts < 100) {
            productIdCounter++
            productId = String(productIdCounter).padStart(6, '0')
            existingById = await Uniform.findOne({ id: productId }).session(session)
            attempts++
          }

          if (existingById) {
            console.log(`⚠️  [${totalAttempted}/10] Could not find available ID for "${productData.name}"`)
            skippedProducts.push({
              name: productData.name,
              sku: productData.sku,
              reason: 'Could not find available product ID'
            })
            totalSkipped++
            continue
          }

          // Create product using model (not raw DB calls)
          const productToCreate = {
            id: productId,
            name: productData.name,
            category: productData.category,
            gender: productData.gender,
            sizes: productData.sizes,
            price: productData.price,
            image: productData.image,
            sku: productData.sku,
            stock: productData.stock || 0,
            companyIds: [], // No company relationships as per rules
          }

          // Add optional attributes only if provided
          if (productData.attribute1_name) {
            productToCreate.attribute1_name = productData.attribute1_name
            productToCreate.attribute1_value = productData.attribute1_value
          }
          if (productData.attribute2_name) {
            productToCreate.attribute2_name = productData.attribute2_name
            productToCreate.attribute2_value = productData.attribute2_value
          }
          if (productData.attribute3_name) {
            productToCreate.attribute3_name = productData.attribute3_name
            productToCreate.attribute3_value = productData.attribute3_value
          }

          // Create using model (this will trigger all validations)
          const newProduct = new Uniform(productToCreate)
          await newProduct.save({ session })

          console.log(`✅ [${totalAttempted}/10] Created: ${productData.name}`)
          console.log(`   ID: ${productId}, SKU: ${productData.sku}, Price: ₹${productData.price}, Stock: ${productData.stock}`)

          createdProducts.push({
            id: productId,
            name: productData.name,
            sku: productData.sku
          })

          totalCreated++
          productIdCounter++

        } catch (error) {
          console.error(`❌ [${totalAttempted}/10] Error creating "${productData.name}":`, error.message)
          errors.push({
            name: productData.name,
            sku: productData.sku,
            error: error.message
          })
          // Continue with next product instead of aborting
        }
      }

      // Commit transaction if we have at least one successful creation
      if (totalCreated > 0) {
        await session.commitTransaction()
        console.log('\n✅ Transaction committed successfully')
      } else {
        await session.abortTransaction()
        console.log('\n⚠️  No products created, transaction aborted')
      }

      // Log summary
      console.log('\n========================================')
      console.log('SUMMARY')
      console.log('========================================')
      console.log(`Total Products Attempted: ${totalAttempted}`)
      console.log(`Total Products Created: ${totalCreated}`)
      console.log(`Total Products Skipped: ${totalSkipped}`)
      
      if (skippedProducts.length > 0) {
        console.log('\nSkipped Products:')
        skippedProducts.forEach(sp => {
          console.log(`  - ${sp.name} (${sp.sku}): ${sp.reason}`)
        })
      }

      if (errors.length > 0) {
        console.log('\nErrors:')
        errors.forEach(err => {
          console.log(`  - ${err.name} (${err.sku}): ${err.error}`)
        })
      }

      if (totalCreated > 0) {
        console.log('\n✅ Successfully created products:')
        createdProducts.forEach(cp => {
          console.log(`  - ${cp.name} (ID: ${cp.id}, SKU: ${cp.sku})`)
        })
      }

      console.log('\n🎉 Process completed!')

    } catch (error) {
      await session.abortTransaction()
      console.error('\n❌ Transaction aborted due to error:', error)
      throw error
    } finally {
      await session.endSession()
    }

  } catch (error) {
    console.error('❌ Error adding products:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

// Run the script
addSampleProducts()

