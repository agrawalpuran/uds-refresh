/**
 * Find order by pattern
 */

try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {}

const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    })
    console.log('✅ Connected to MongoDB')
    return mongoose.connection.db
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message)
    process.exit(1)
  }
}

async function findOrder() {
  const db = await connectDB()
  const ordersCollection = db.collection('orders')
  
  const searchPattern = 'VPX7AO659'
  
  console.log(`\n🔍 Searching for orders containing: ${searchPattern}`)
  console.log('─'.repeat(60))
  
  try {
    // Try exact match
    let order = await ordersCollection.findOne({ id: 'ORD-1768295151720-VPX7AO659' })
    if (order) {
      console.log('✅ Found by exact match')
      console.log(JSON.stringify(order, null, 2))
      return
    }
    
    // Try partial match
    order = await ordersCollection.findOne({ id: { $regex: searchPattern } })
    if (order) {
      console.log('✅ Found by regex match')
      console.log(`   id: ${order.id}`)
      console.log(`   employeeId: ${order.employeeId}`)
      console.log(`   pr_status: ${order.pr_status}`)
      return
    }
    
    // Try finding recent orders
    const recentOrders = await ordersCollection.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray()
    
    console.log(`\n📋 Recent orders (last 10):`)
    recentOrders.forEach((o, i) => {
      console.log(`   ${i + 1}. ${o.id} - employeeId: ${o.employeeId}, pr_status: ${o.pr_status || 'null'}`)
    })
    
  } catch (error) {
    console.error('\n❌ Error:', error)
    throw error
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

findOrder()
  .then(() => {
    console.log('\n✨ Script finished')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error)
    process.exit(1)
  })
