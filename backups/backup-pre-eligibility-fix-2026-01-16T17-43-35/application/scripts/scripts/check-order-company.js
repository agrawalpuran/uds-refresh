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

async function checkOrder() {
  try {
    await mongoose.connect(MONGODB_URI)
    const db = mongoose.connection.db
    
    const order = await db.collection('orders').findOne({ id: 'ORD-1765638635900-LU1V6AE90-100002' })
    if (!order) {
      console.log('Order not found')
      await mongoose.disconnect()
      process.exit(0)
    }
    
    console.log('Order found:')
    console.log('  Order ID:', order.id)
    console.log('  CompanyId (ObjectId):', order.companyId)
    console.log('  CompanyId type:', typeof order.companyId)
    console.log('  CompanyId string:', order.companyId?.toString())
    console.log('  Status:', order.status)
    console.log('  ParentOrderId:', order.parentOrderId)
    
    // Try to find company
    const company = await db.collection('companies').findOne({ _id: order.companyId })
    if (company) {
      console.log('\nCompany found:')
      console.log('  Company ID:', company.id)
      console.log('  Company Name:', company.name)
    } else {
      console.log('\nCompany NOT found by ObjectId')
      
      // List all companies
      const allCompanies = await db.collection('companies').find({}).toArray()
      console.log('\nAll companies in database:')
      allCompanies.forEach((c, idx) => {
        console.log(`  ${idx + 1}. _id: ${c._id}, id: ${c.id}, name: ${c.name}`)
      })
    }
    
    await mongoose.disconnect()
    process.exit(0)
  } catch (error) {
    console.error('Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

checkOrder()

