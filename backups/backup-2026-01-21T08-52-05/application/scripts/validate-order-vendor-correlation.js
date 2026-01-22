/**
 * Validation script to check if all orders have vendorId properly set
 * and if multi-vendor orders are correctly linked via parentOrderId
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

async function validateOrderVendorCorrelation() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    const ordersCollection = db.collection('orders')
    const vendorsCollection = db.collection('vendors')
    
    // Get all orders
    const allOrders = await ordersCollection.find({}).toArray()
    console.log(`Total orders: ${allOrders.length}\n`)

    // Get all vendors for validation
    const allVendors = await vendorsCollection.find({}).toArray()
    const vendorMap = new Map()
    allVendors.forEach((v) => {
      vendorMap.set(v._id.toString(), { id: v.id, name: v.name })
    })

    // Validate orders
    let ordersWithoutVendorId = 0
    let ordersWithInvalidVendorId = 0
    let ordersWithValidVendorId = 0
    let splitOrdersCount = 0
    let parentOrderIds = new Set()
    const issues = []

    for (const order of allOrders) {
      // Check if vendorId exists
      if (!order.vendorId) {
        ordersWithoutVendorId++
        issues.push({
          orderId: order.id,
          issue: 'Missing vendorId',
          parentOrderId: order.parentOrderId || 'N/A'
        })
      } else {
        const vendorIdStr = order.vendorId.toString()
        const vendor = vendorMap.get(vendorIdStr)
        
        if (!vendor) {
          ordersWithInvalidVendorId++
          issues.push({
            orderId: order.id,
            issue: `Invalid vendorId: ${vendorIdStr} (vendor not found)`,
            parentOrderId: order.parentOrderId || 'N/A'
          })
        } else {
          ordersWithValidVendorId++
        }
      }

      // Check for split orders
      if (order.parentOrderId) {
        splitOrdersCount++
        parentOrderIds.add(order.parentOrderId)
      }
    }

    // Validate split orders
    console.log('=== VALIDATION RESULTS ===\n')
    console.log(`Orders with valid vendorId: ${ordersWithValidVendorId}`)
    console.log(`Orders without vendorId: ${ordersWithoutVendorId}`)
    console.log(`Orders with invalid vendorId: ${ordersWithInvalidVendorId}`)
    console.log(`Split orders (with parentOrderId): ${splitOrdersCount}`)
    console.log(`Unique parent order IDs: ${parentOrderIds.size}\n`)

    // Check split order groups
    if (parentOrderIds.size > 0) {
      console.log('=== SPLIT ORDER GROUPS ===\n')
      for (const parentOrderId of parentOrderIds) {
        const splitOrders = allOrders.filter(o => o.parentOrderId === parentOrderId)
        console.log(`Parent Order ID: ${parentOrderId}`)
        console.log(`  Number of split orders: ${splitOrders.length}`)
        
        const vendorIds = new Set()
        const vendorNames = new Set()
        
        splitOrders.forEach((o) => {
          if (o.vendorId) {
            const vendorIdStr = o.vendorId.toString()
            vendorIds.add(vendorIdStr)
            if (o.vendorName) {
              vendorNames.add(o.vendorName)
            }
          }
        })
        
        console.log(`  Unique vendors: ${vendorIds.size}`)
        console.log(`  Vendor names: ${Array.from(vendorNames).join(', ') || 'N/A'}`)
        
        // Check if all split orders have vendorId
        const missingVendorId = splitOrders.filter(o => !o.vendorId)
        if (missingVendorId.length > 0) {
          console.log(`  ⚠️  WARNING: ${missingVendorId.length} split order(s) missing vendorId`)
        }
        
        console.log('')
      }
    }

    // Report issues
    if (issues.length > 0) {
      console.log('=== ISSUES FOUND ===\n')
      issues.forEach((issue, idx) => {
        console.log(`${idx + 1}. Order ID: ${issue.orderId}`)
        console.log(`   Issue: ${issue.issue}`)
        console.log(`   Parent Order ID: ${issue.parentOrderId}`)
        console.log('')
      })
    } else {
      console.log('✅ All orders have valid vendorId!\n')
    }

    // Summary
    console.log('=== SUMMARY ===')
    console.log(`Total orders: ${allOrders.length}`)
    console.log(`✅ Valid: ${ordersWithValidVendorId}`)
    console.log(`❌ Missing vendorId: ${ordersWithoutVendorId}`)
    console.log(`❌ Invalid vendorId: ${ordersWithInvalidVendorId}`)
    console.log(`📦 Split orders: ${splitOrdersCount} (${parentOrderIds.size} parent orders)`)

    if (ordersWithoutVendorId === 0 && ordersWithInvalidVendorId === 0) {
      console.log('\n✅ VALIDATION PASSED: All orders have valid vendorId!')
    } else {
      console.log('\n⚠️  VALIDATION FAILED: Some orders have issues with vendorId')
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
    process.exit(issues.length > 0 ? 1 : 0)
  } catch (error) {
    console.error('❌ Validation failed:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

validateOrderVendorCorrelation()

