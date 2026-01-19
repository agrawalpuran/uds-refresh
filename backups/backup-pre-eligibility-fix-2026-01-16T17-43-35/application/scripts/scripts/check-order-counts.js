const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch (error) {
  console.warn('Could not read .env.local')
}

async function checkOrderCounts() {
  try {
    await mongoose.connect(MONGODB_URI)
    const db = mongoose.connection.db
    
    const total = await db.collection('orders').countDocuments({})
    const delivered = await db.collection('orders').countDocuments({ status: 'Delivered' })
    
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 365)
    const oldDelivered = await db.collection('orders').countDocuments({ 
      status: 'Delivered', 
      orderDate: { $lt: cutoff } 
    })
    
    console.log(`Total orders: ${total}`)
    console.log(`Delivered orders: ${delivered}`)
    console.log(`Delivered orders older than 365 days: ${oldDelivered}`)
    
    await mongoose.disconnect()
    process.exit(0)
  } catch (error) {
    console.error('Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

checkOrderCounts()

