const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Define Uniform Schema
const UniformSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  gender: { type: String, required: true },
  sizes: [{ type: String }],
  price: { type: Number, required: true },
  image: { type: String },
  sku: { type: String, required: true, unique: true, index: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
  stock: { type: Number, default: 0 },
}, { timestamps: true })

const Uniform = mongoose.model('Uniform', UniformSchema)

// Price mapping by category and name patterns
function getPriceForProduct(name, category) {
  const nameLower = name.toLowerCase()
  const categoryLower = category.toLowerCase()
  
  // Shirts
  if (categoryLower === 'shirt') {
    if (nameLower.includes('formal')) return 1500
    if (nameLower.includes('polo')) return 1200
    if (nameLower.includes('t-shirt') || nameLower.includes('tshirt')) return 800
    return 1000
  }
  
  // Pants
  if (categoryLower === 'pant') {
    if (nameLower.includes('formal') || nameLower.includes('trouser')) return 2000
    if (nameLower.includes('cargo')) return 1800
    return 1500
  }
  
  // Shoes
  if (categoryLower === 'shoe') {
    if (nameLower.includes('formal') || nameLower.includes('dress') || nameLower.includes('heel')) return 3000
    if (nameLower.includes('safety')) return 2800
    if (nameLower.includes('sneaker')) return 2500
    return 2500
  }
  
  // Jackets
  if (categoryLower === 'jacket') {
    if (nameLower.includes('blazer')) return 4000
    if (nameLower.includes('windbreaker')) return 2500
    return 3000
  }
  
  // Accessories
  if (categoryLower === 'accessory') {
    return 500
  }
  
  return 1000 // Default
}

async function setProductPrices() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Get all products
    const products = await Uniform.find({})
    console.log(`\nFound ${products.length} products to update\n`)

    if (products.length === 0) {
      console.log('⚠️ No products found in database')
      return
    }

    // Update each product's price
    let updatedCount = 0
    for (const product of products) {
      const category = product.category.toLowerCase()
      const name = product.name
      
      // Get price based on product name and category
      let newPrice = getPriceForProduct(name, category)
      
      const oldPrice = product.price || 0
      
      await Uniform.updateOne(
        { _id: product._id },
        { $set: { price: newPrice } }
      )
      
      console.log(`✅ ${product.name} (${product.sku}) - Category: ${category}`)
      console.log(`   Price: ₹${oldPrice} → ₹${newPrice}`)
      updatedCount++
    }

    console.log(`\n✅ Successfully updated ${updatedCount} products`)
    console.log('💰 All product prices have been set')
  } catch (error) {
    console.error('❌ Error updating prices:', error)
  } finally {
    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  }
}

setProductPrices()

