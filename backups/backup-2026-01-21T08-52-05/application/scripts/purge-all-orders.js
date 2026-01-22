/**
 * Script to purge all orders from the Order collection
 * WARNING: This is a destructive operation that will delete ALL orders
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const match = trimmed.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        process.env[key] = value
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URI_LOCAL

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function purgeAllOrders() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    const db = mongoose.connection.db
    
    // Count orders before deletion
    const orderCount = await db.collection('orders').countDocuments()
    console.log(`📊 Found ${orderCount} order(s) in database`)
    
    if (orderCount === 0) {
      console.log('ℹ️  No orders to delete')
      await mongoose.disconnect()
      return
    }
    
    // Count related POOrder mappings
    const poOrderCount = await db.collection('poorders').countDocuments()
    console.log(`📊 Found ${poOrderCount} POOrder mapping(s)`)
    
    // Ask for confirmation (in script, we'll proceed but log warning)
    console.log('⚠️  WARNING: This will delete ALL orders and related mappings!')
    console.log('⚠️  Proceeding with deletion...')
    
    // Delete POOrder mappings first (they reference orders)
    if (poOrderCount > 0) {
      const poOrderResult = await db.collection('poorders').deleteMany({})
      console.log(`✅ Deleted ${poOrderResult.deletedCount} POOrder mapping(s)`)
    }
    
    // Delete all orders
    const result = await db.collection('orders').deleteMany({})
    console.log(`✅ Deleted ${result.deletedCount} order(s)`)
    
    // Verify deletion
    const remainingCount = await db.collection('orders').countDocuments()
    if (remainingCount === 0) {
      console.log('✅ All orders successfully purged')
    } else {
      console.log(`⚠️  Warning: ${remainingCount} order(s) still remain`)
    }
    
    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
    console.log('✅ Purge complete!')
    
  } catch (error) {
    console.error('❌ Error purging orders:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

// Run the purge
purgeAllOrders()
