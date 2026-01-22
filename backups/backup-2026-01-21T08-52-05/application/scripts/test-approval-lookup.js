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

async function testApprovalLookup() {
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
    console.log(`   - Company ID (raw): ${order.companyId}`)
    console.log(`   - Company ID (type): ${typeof order.companyId}`)
    console.log(`   - Company ID (numeric): ${order.companyIdNum}`)
    console.log('')

    // Test the new lookup logic
    console.log('🔍 Testing approval lookup logic...\n')

    // Step 1: Convert to ObjectId
    let companyIdObjectId = order.companyId
    if (companyIdObjectId && !(companyIdObjectId instanceof mongoose.Types.ObjectId)) {
      if (mongoose.Types.ObjectId.isValid(companyIdObjectId)) {
        companyIdObjectId = new mongoose.Types.ObjectId(companyIdObjectId)
        console.log(`✅ Converted companyId to ObjectId: ${companyIdObjectId.toString()}`)
      } else {
        console.log(`❌ companyId is not a valid ObjectId: ${companyIdObjectId}`)
      }
    } else {
      console.log(`✅ companyId is already an ObjectId: ${companyIdObjectId.toString()}`)
    }
    console.log('')

    // Step 2: Try Mongoose findById
    const Company = mongoose.model('Company', new mongoose.Schema({}, { collection: 'companies', strict: false }))
    let company = await Company.findById(companyIdObjectId)
    if (company) {
      console.log(`✅ Company found via Mongoose findById: ${company.name} (id: ${company.id})`)
    } else {
      console.log(`❌ Company NOT found via Mongoose findById`)
    }
    console.log('')

    // Step 3: Try raw MongoDB lookup
    if (!company) {
      const rawCompany = await db.collection('companies').findOne({ _id: companyIdObjectId })
      if (rawCompany) {
        console.log(`✅ Company found via raw MongoDB: ${rawCompany.name} (id: ${rawCompany.id})`)
        
        // Try Mongoose lookup by business ID
        if (rawCompany.id) {
          company = await Company.findOne({ id: rawCompany.id })
          if (company) {
            console.log(`✅ Company found via Mongoose findOne({ id: '${rawCompany.id}' }): ${company.name}`)
          }
        }
      } else {
        console.log(`❌ Company NOT found via raw MongoDB`)
      }
      console.log('')
    }

    // Step 4: Try lookup by business ID (companyIdNum)
    if (!company && order.companyIdNum) {
      console.log(`🔍 Trying lookup by business ID: ${order.companyIdNum}`)
      company = await Company.findOne({ id: String(order.companyIdNum) })
      if (company) {
        console.log(`✅ Company found via business ID: ${company.name} (id: ${company.id})`)
      } else {
        console.log(`❌ Company NOT found via business ID`)
      }
      console.log('')
    }

    if (company) {
      console.log('✅ SUCCESS: Company lookup would succeed in approval flow')
      console.log(`   Final company: ${company.name} (id: ${company.id}, _id: ${company._id?.toString()})`)
    } else {
      console.log('❌ FAILURE: Company lookup would fail in approval flow')
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

testApprovalLookup()

