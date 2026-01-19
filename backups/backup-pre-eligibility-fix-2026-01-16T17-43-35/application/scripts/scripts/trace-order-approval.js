const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables
let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

try {
  const envPath = path.join(process.cwd(), '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch (e) {
  console.error('Error reading .env.local:', e.message)
}

async function traceApprovalFlow() {
  try {
    console.log('🔍 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected\n')

    const db = mongoose.connection.db
    const orderId = 'ORD-1765638635900-LU1V6AE90-100002'

    console.log(`📦 Looking up order: ${orderId}`)
    const order = await db.collection('orders').findOne({ id: orderId })
    
    if (!order) {
      console.error('❌ Order not found!')
      await mongoose.disconnect()
      process.exit(1)
    }

    console.log('✅ Order found')
    console.log(`   - Order ID: ${order.id}`)
    console.log(`   - Parent Order ID: ${order.parentOrderId || 'N/A'}`)
    console.log(`   - Status: ${order.status}`)
    console.log(`   - Company ID (ObjectId): ${order.companyId?.toString()}`)
    console.log(`   - Company ID (numeric): ${order.companyIdNum}`)
    console.log(`   - Vendor ID (ObjectId): ${order.vendorId?.toString()}`)
    console.log('')

    // Try raw MongoDB lookup
    console.log('🔍 Step 1: Raw MongoDB lookup')
    const rawCompany = await db.collection('companies').findOne({ _id: order.companyId })
    if (rawCompany) {
      console.log(`✅ Company found via raw MongoDB:`)
      console.log(`   - _id: ${rawCompany._id?.toString()}`)
      console.log(`   - id (business): ${rawCompany.id}`)
      console.log(`   - name: ${rawCompany.name}`)
    } else {
      console.log('❌ Company NOT found via raw MongoDB')
    }
    console.log('')

    // Try Mongoose lookup by ObjectId
    console.log('🔍 Step 2: Mongoose findById')
    const Company = mongoose.model('Company', new mongoose.Schema({}, { collection: 'companies', strict: false }))
    const mongooseCompanyById = await Company.findById(order.companyId)
    if (mongooseCompanyById) {
      console.log(`✅ Company found via Mongoose findById:`)
      console.log(`   - _id: ${mongooseCompanyById._id?.toString()}`)
      console.log(`   - id (business): ${mongooseCompanyById.id}`)
      console.log(`   - name: ${mongooseCompanyById.name}`)
    } else {
      console.log('❌ Company NOT found via Mongoose findById')
    }
    console.log('')

    // Try lookup by business ID if available
    if (rawCompany && rawCompany.id) {
      console.log(`🔍 Step 3: Mongoose findOne by business id: ${rawCompany.id}`)
      const mongooseCompanyById = await Company.findOne({ id: rawCompany.id })
      if (mongooseCompanyById) {
        console.log(`✅ Company found via Mongoose findOne({ id: '${rawCompany.id}' }):`)
        console.log(`   - _id: ${mongooseCompanyById._id?.toString()}`)
        console.log(`   - id (business): ${mongooseCompanyById.id}`)
        console.log(`   - name: ${mongooseCompanyById.name}`)
      } else {
        console.log('❌ Company NOT found via Mongoose findOne by business id')
      }
      console.log('')
    }

    // Check if this is a split order
    if (order.parentOrderId) {
      console.log(`🔍 Step 4: Checking split orders for parent: ${order.parentOrderId}`)
      const childOrders = await db.collection('orders').find({ parentOrderId: order.parentOrderId }).toArray()
      console.log(`   Found ${childOrders.length} child orders`)
      childOrders.forEach((child, idx) => {
        console.log(`   [${idx + 1}] ${child.id} - Company: ${child.companyId?.toString()} - Status: ${child.status}`)
      })
      console.log('')
    }

    // Check all companies to see what's available
    console.log('🔍 Step 5: Listing all companies in database')
    const allCompanies = await db.collection('companies').find({}).limit(10).toArray()
    console.log(`   Found ${allCompanies.length} companies:`)
    allCompanies.forEach((c, idx) => {
      console.log(`   [${idx + 1}] _id: ${c._id?.toString()}, id: ${c.id}, name: ${c.name}`)
    })
    console.log('')

    await mongoose.disconnect()
    console.log('✅ Disconnected')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

traceApprovalFlow()

