const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Read .env.local file
let MONGODB_URI = 'mongodb://localhost:27017/uniform-distribution'
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim()
    }
  }
} catch (error) {
  console.log('Could not read .env.local, using default MongoDB URI')
}

// Also check process.env (in case it's already set)
MONGODB_URI = process.env.MONGODB_URI || MONGODB_URI

// Define Order Schema matching the actual model
const OrderItemSchema = new mongoose.Schema({
  uniformId: { type: mongoose.Schema.Types.ObjectId, ref: 'Uniform', required: true },
  productId: { type: String, required: true },
  uniformName: { type: String, required: true },
  size: { type: String, required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
})

const OrderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  employeeIdNum: { type: String, required: true },
  employeeName: { type: String, required: true },
  items: { type: [OrderItemSchema], required: true },
  total: { type: Number, required: true },
  status: { type: String, required: true },
  orderDate: { type: Date, required: true },
  dispatchLocation: { type: String, required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  companyIdNum: { type: Number, required: true },
  deliveryAddress: { type: String, required: true },
  estimatedDeliveryTime: { type: String, required: true },
  parentOrderId: { type: String },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  vendorName: { type: String },
  isPersonalPayment: { type: Boolean, default: false },
  personalPaymentAmount: { type: Number, default: 0 },
  orderType: { type: String, enum: ['NORMAL', 'REPLACEMENT'], default: 'NORMAL' },
  returnRequestId: { type: String },
}, { timestamps: true })

const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema)

async function deleteAllOrders() {
  try {
    console.log('Connecting to MongoDB...')
    console.log(`MongoDB URI: ${MONGODB_URI.replace(/\/\/.*@/, '//***:***@')}`) // Mask credentials
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Count orders before deletion
    const orderCount = await Order.countDocuments({})
    console.log(`\nFound ${orderCount} orders in the database`)

    if (orderCount === 0) {
      console.log('✅ No orders found in database. All orders have been purged.')
      // Double-check by querying the collection directly
      const db = mongoose.connection.db
      const ordersCollection = db.collection('orders')
      const directCount = await ordersCollection.countDocuments({})
      if (directCount > 0) {
        console.log(`⚠️  Found ${directCount} orders in 'orders' collection directly. Deleting...`)
        const directResult = await ordersCollection.deleteMany({})
        console.log(`✅ Deleted ${directResult.deletedCount} orders from collection directly`)
      }
      return
    }

    // Delete all orders using the model
    console.log('\nDeleting all orders...')
    const result = await Order.deleteMany({})
    
    console.log(`✅ Successfully deleted ${result.deletedCount} orders using Order model`)
    
    // Double-check by querying the collection directly and delete any remaining
    const db = mongoose.connection.db
    const ordersCollection = db.collection('orders')
    const remainingCount = await ordersCollection.countDocuments({})
    if (remainingCount > 0) {
      console.log(`⚠️  Found ${remainingCount} additional orders in collection. Deleting...`)
      const directResult = await ordersCollection.deleteMany({})
      console.log(`✅ Deleted ${directResult.deletedCount} additional orders from collection`)
    }
    
    // Final verification
    const finalCount = await Order.countDocuments({})
    const finalDirectCount = await ordersCollection.countDocuments({})
    
    console.log('\n📊 Final verification:')
    console.log(`   Orders via model: ${finalCount}`)
    console.log(`   Orders in collection: ${finalDirectCount}`)
    
    if (finalCount === 0 && finalDirectCount === 0) {
      console.log('\n✅ All orders have been completely purged from the database')
    } else {
      console.log('\n⚠️  Warning: Some orders may still exist. Please check manually.')
    }
  } catch (error) {
    console.error('❌ Error deleting orders:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  }
}

deleteAllOrders()






