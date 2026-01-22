const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Define schemas
const UniformSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  price: { type: Number, required: true },
  sku: { type: String, required: true, unique: true, index: true },
}, { timestamps: true })

const OrderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  items: [{
    uniformId: { type: mongoose.Schema.Types.ObjectId, ref: 'Uniform' },
    uniformName: { type: String },
    size: { type: String },
    quantity: { type: Number },
    price: { type: Number },
  }],
  total: { type: Number, required: true },
}, { timestamps: true })

const Uniform = mongoose.model('Uniform', UniformSchema)
const Order = mongoose.model('Order', OrderSchema)

async function fixOrderPrices() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Get all orders
    const orders = await Order.find({}).populate('items.uniformId')
    console.log(`Found ${orders.length} orders to check\n`)

    if (orders.length === 0) {
      console.log('⚠️ No orders found in database')
      return
    }

    let updatedCount = 0
    let totalFixed = 0

    for (const order of orders) {
      let orderUpdated = false
      let newTotal = 0
      const updatedItems = []

      for (const item of order.items) {
        let itemPrice = 0
        let itemUpdated = false

        // Always get the current price from the product (not from stored order price)
        if (item.uniformId) {
          // If populated, get price directly
          if (typeof item.uniformId === 'object' && item.uniformId.price) {
            itemPrice = item.uniformId.price
            itemUpdated = true
          } else {
            // If ObjectId, fetch the uniform
            const uniform = await Uniform.findById(item.uniformId)
            if (uniform && uniform.price) {
              itemPrice = uniform.price
              itemUpdated = true
            }
          }
        } else {
          // Try to find by uniformName or other identifier
          // This is a fallback - ideally we'd have uniformId
          console.log(`⚠️ Order ${order.id}: Item "${item.uniformName}" has no uniformId, cannot update price`)
          // Keep old price as fallback
          itemPrice = item.price || 0
        }

        const itemTotal = itemPrice * (item.quantity || 0)
        newTotal += itemTotal

        updatedItems.push({
          ...item.toObject ? item.toObject() : item,
          price: itemPrice
        })

        if (itemUpdated) {
          orderUpdated = true
        }
      }

      // Always update order to use current product prices
      if (orderUpdated || order.total !== newTotal) {
        await Order.updateOne(
          { _id: order._id },
          { 
            $set: { 
              items: updatedItems,
              total: newTotal
            } 
          }
        )
        
        console.log(`✅ Order ${order.id}:`)
        console.log(`   Old total: ₹${order.total}`)
        console.log(`   New total: ₹${newTotal}`)
        console.log(`   Items: ${updatedItems.map(i => `${i.uniformName} (₹${i.price} × ${i.quantity})`).join(', ')}`)
        console.log('')
        
        updatedCount++
        totalFixed += newTotal - (order.total || 0)
      }
    }

    console.log(`\n✅ Successfully updated ${updatedCount} orders`)
    console.log(`💰 Total value fixed: ₹${totalFixed.toFixed(2)}`)
  } catch (error) {
    console.error('❌ Error fixing order prices:', error)
  } finally {
    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  }
}

fixOrderPrices()

