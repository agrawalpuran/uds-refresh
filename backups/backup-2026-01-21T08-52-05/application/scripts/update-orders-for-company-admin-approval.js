/**
 * Update orders to appear in Company Admin approval queue
 * This ensures orders approved by site admin move to PENDING_COMPANY_ADMIN_APPROVAL
 * if company requires company admin approval
 */

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

async function updateOrdersForCompanyAdmin() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    const ordersCollection = db.collection('orders')
    const companiesCollection = db.collection('companies')

    // Find ICICI company
    const company = await companiesCollection.findOne({
      $or: [{ id: 'COMP-ICICI' }, { name: { $regex: /icici/i } }]
    })
    if (!company) {
      throw new Error('ICICI Bank company not found')
    }

    console.log(`✅ Found company: ${company.name} (${company.id})`)
    console.log(`   - enable_pr_po_workflow: ${company.enable_pr_po_workflow}`)
    console.log(`   - require_company_admin_po_approval: ${company.require_company_admin_po_approval}\n`)

    // Find orders that are SITE_ADMIN_APPROVED but should be PENDING_COMPANY_ADMIN_APPROVAL
    const orders = await ordersCollection.find({
      companyId: company._id,
      pr_status: 'SITE_ADMIN_APPROVED',
      status: 'Awaiting fulfilment'
    }).toArray()

    console.log(`📦 Found ${orders.length} orders with SITE_ADMIN_APPROVED status\n`)

    if (orders.length === 0) {
      console.log('   No orders to update')
      return
    }

    // Check if company requires company admin approval
    const requiresCompanyAdminApproval = company.require_company_admin_po_approval === true

    let updatedCount = 0
    for (const order of orders) {
      if (requiresCompanyAdminApproval) {
        // Update to PENDING_COMPANY_ADMIN_APPROVAL
        await ordersCollection.updateOne(
          { _id: order._id },
          {
            $set: {
              pr_status: 'PENDING_COMPANY_ADMIN_APPROVAL',
              status: 'Awaiting approval',
              updatedAt: new Date()
            }
          }
        )
        console.log(`   ✅ Updated order ${order.id}:`)
        console.log(`      - PR Status: SITE_ADMIN_APPROVED → PENDING_COMPANY_ADMIN_APPROVAL`)
        console.log(`      - Status: Awaiting fulfilment → Awaiting approval`)
        updatedCount++
      } else {
        console.log(`   ℹ️  Order ${order.id} is correct (company doesn't require admin approval)`)
      }
    }

    console.log(`\n🎉 Updated ${updatedCount} orders to appear in Company Admin approval queue!`)

    // Verify the update
    const pendingOrders = await ordersCollection.find({
      companyId: company._id,
      pr_status: 'PENDING_COMPANY_ADMIN_APPROVAL'
    }).toArray()

    console.log(`\n📋 Verification:`)
    console.log(`   - Orders now in PENDING_COMPANY_ADMIN_APPROVAL: ${pendingOrders.length}`)
    pendingOrders.forEach((order, idx) => {
      console.log(`      ${idx + 1}. Order ${order.id} - PR: ${order.pr_number || 'N/A'}`)
    })

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

updateOrdersForCompanyAdmin()
  .then(() => {
    console.log('\n✅ Script completed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })

