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

async function increasePrices() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Get all products
    const products = await Uniform.find({})
    console.log(`Found ${products.length} products to update`)

    if (products.length === 0) {
      console.log('⚠️ No products found in database')
      return
    }

    // Update each product's price by adding 1000
    let updatedCount = 0
    for (const product of products) {
      const oldPrice = product.price
      const newPrice = oldPrice + 1000
      
      await Uniform.updateOne(
        { _id: product._id },
        { $set: { price: newPrice } }
      )
      
      console.log(`✅ Updated ${product.name} (${product.sku}): ₹${oldPrice} → ₹${newPrice}`)
      updatedCount++
    }

    console.log(`\n✅ Successfully updated ${updatedCount} products`)
    console.log('💰 All product prices increased by ₹1000')
  } catch (error) {
    console.error('❌ Error updating prices:', error)
  } finally {
    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  }
}

increasePrices()






