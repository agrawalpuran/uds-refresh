/**
 * Script to fix test orders visibility for vendors
 * Updates test orders to ensure they're not visible to vendors until Company Admin approval
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Try to read .env.local
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
  console.warn('Could not read .env.local, using default connection string')
}

async function fixTestOrdersVisibility() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    const ordersCollection = db.collection('orders')

    // Find the two test orders mentioned by the user
    // Order IDs: ORD-1767688892533-DXNL8YSPL-100001 and ORD-1767688331029-0TC234E43-100001
    const testOrderIds = [
      'ORD-1767688892533-DXNL8YSPL-100001',
      'ORD-1767688331029-0TC234E43-100001'
    ]

    console.log('📋 Finding test orders...')
    const orders = await ordersCollection.find({
      id: { $in: testOrderIds }
    }).toArray()

    console.log(`Found ${orders.length} order(s) to update\n`)

    if (orders.length === 0) {
      console.log('⚠️ No orders found with the specified IDs. Searching for all test orders...')
      
      // Find all test orders (isTestOrder = true) that might be visible to vendors
      const allTestOrders = await ordersCollection.find({
        isTestOrder: true,
        pr_status: { $in: ['COMPANY_ADMIN_APPROVED', 'PO_CREATED', 'SITE_ADMIN_APPROVED'] }
      }).toArray()

      console.log(`Found ${allTestOrders.length} test order(s) that are currently visible to vendors\n`)

      if (allTestOrders.length > 0) {
        console.log('Updating all test orders to PENDING_COMPANY_ADMIN_APPROVAL...')
        
        for (const order of allTestOrders) {
          const updateResult = await ordersCollection.updateOne(
            { _id: order._id },
            {
              $set: {
                pr_status: 'PENDING_COMPANY_ADMIN_APPROVAL',
                status: 'Awaiting approval',
                updatedAt: new Date()
              }
            }
          )

          if (updateResult.modifiedCount > 0) {
            console.log(`✅ Updated order ${order.id}: pr_status -> PENDING_COMPANY_ADMIN_APPROVAL`)
          }
        }
      }
    } else {
      // Update the specific orders
      for (const order of orders) {
        console.log(`\n📦 Order: ${order.id}`)
        console.log(`   Current pr_status: ${order.pr_status || 'N/A'}`)
        console.log(`   Current status: ${order.status || 'N/A'}`)
        console.log(`   PR Number: ${order.pr_number || 'N/A'}`)
        console.log(`   isTestOrder: ${order.isTestOrder || false}`)

        // Set to PENDING_COMPANY_ADMIN_APPROVAL if not already
        // This ensures vendors won't see them until Company Admin approves
        const targetPrStatus = 'PENDING_COMPANY_ADMIN_APPROVAL'
        const targetStatus = 'Awaiting approval'

        if (order.pr_status !== targetPrStatus) {
          const updateResult = await ordersCollection.updateOne(
            { _id: order._id },
            {
              $set: {
                pr_status: targetPrStatus,
                status: targetStatus,
                updatedAt: new Date()
              }
            }
          )

          if (updateResult.modifiedCount > 0) {
            console.log(`   ✅ Updated: pr_status -> ${targetPrStatus}, status -> ${targetStatus}`)
          } else {
            console.log(`   ⚠️ No changes made (already in correct status)`)
          }
        } else {
          console.log(`   ✓ Already in correct status (${targetPrStatus})`)
        }
      }
    }

    // Verify: Check how many test orders are now visible to vendors
    console.log('\n📊 Verification:')
    const visibleToVendors = await ordersCollection.countDocuments({
      isTestOrder: true,
      pr_status: { $in: ['COMPANY_ADMIN_APPROVED', 'PO_CREATED'] }
    })
    console.log(`   Test orders visible to vendors: ${visibleToVendors} (should be 0)`)
    
    const pendingApproval = await ordersCollection.countDocuments({
      isTestOrder: true,
      pr_status: 'PENDING_COMPANY_ADMIN_APPROVAL'
    })
    console.log(`   Test orders pending Company Admin approval: ${pendingApproval}`)

    console.log('\n✅ Script completed successfully!')

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

// Run the script
fixTestOrdersVisibility()
  .then(() => {
    console.log('\n✅ Script completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })

