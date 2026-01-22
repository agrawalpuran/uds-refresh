/**
 * Script to update the Formal Shirt - Male image URL in MongoDB
 */

const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

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

async function updateImage() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Update Formal Shirt - Male image
    const result = await Uniform.updateOne(
      { id: '1' },
      { 
        $set: { 
          image: 'https://images.unsplash.com/photo-1603252109303-2751441dd157?w=400&h=400&fit=crop'
        } 
      }
    )

    if (result.matchedCount === 0) {
      console.log('⚠️  No product found with id "1"')
    } else if (result.modifiedCount === 0) {
      console.log('ℹ️  Product found but image was already updated')
    } else {
      console.log('✅ Successfully updated Formal Shirt - Male image')
    }

    // Verify the update
    const updated = await Uniform.findOne({ id: '1' })
    if (updated) {
      console.log('📸 New image URL:', updated.image)
    }

    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error updating image:', error)
    process.exit(1)
  }
}

updateImage()






