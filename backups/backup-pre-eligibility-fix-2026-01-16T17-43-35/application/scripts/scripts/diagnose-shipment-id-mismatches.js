/**
 * Diagnostic Script: Find and Fix Shipment ID Mismatches
 * 
 * This script identifies cases where:
 * 1. Order.shipmentId doesn't match Shipment.shipmentId
 * 2. Shipment documents exist but Order.shipmentId is different
 * 3. Order.shipmentId exists but no corresponding Shipment document
 * 
 * Usage: node scripts/diagnose-shipment-id-mismatches.js [--fix]
 */

require('dotenv').config({ path: '.env.local' })
const mongoose = require('mongoose')

// Import models
const Order = require('../lib/models/Order').default
const Shipment = require('../lib/models/Shipment').default

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function diagnoseShipmentMismatches(fix = false) {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Find all orders with shipmentId
    console.log('📋 Finding all orders with shipmentId...')
    const ordersWithShipment = await Order.find({
      shipmentId: { $exists: true, $ne: null, $ne: '' }
    }).lean()

    console.log(`Found ${ordersWithShipment.length} orders with shipmentId\n`)

    // Find all shipments
    console.log('📦 Finding all shipments...')
    const allShipments = await Shipment.find({}).lean()
    console.log(`Found ${allShipments.length} shipments\n`)

    // Create a map of shipmentId -> Shipment document
    const shipmentMap = new Map()
    allShipments.forEach(shipment => {
      shipmentMap.set(shipment.shipmentId, shipment)
    })

    // Analyze mismatches
    const mismatches = []
    const missingShipments = []
    const orphanedShipments = new Set(allShipments.map(s => s.shipmentId))

    console.log('🔍 Analyzing shipmentId matches...\n')

    for (const order of ordersWithShipment) {
      const orderShipmentId = order.shipmentId
      const shipment = shipmentMap.get(orderShipmentId)

      if (!shipment) {
        // Order has shipmentId but no corresponding Shipment document
        missingShipments.push({
          orderId: order.id,
          prNumber: order.pr_number,
          orderShipmentId,
          vendorId: order.vendorId,
          dispatchStatus: order.dispatchStatus,
          dispatchedDate: order.dispatchedDate,
        })
        console.log(`❌ MISMATCH: Order ${order.id} (PR: ${order.pr_number}) has shipmentId "${orderShipmentId}" but no Shipment document exists`)
      } else {
        // Check if shipmentMode matches
        orphanedShipments.delete(orderShipmentId)
        
        // Additional validation
        if (shipment.prNumber !== order.pr_number && shipment.prNumber !== order.id) {
          mismatches.push({
            type: 'PR_MISMATCH',
            orderId: order.id,
            orderPR: order.pr_number,
            shipmentId: orderShipmentId,
            shipmentPR: shipment.prNumber,
            shipmentMode: shipment.shipmentMode,
          })
          console.log(`⚠️  WARNING: Order ${order.id} PR "${order.pr_number}" doesn't match Shipment PR "${shipment.prNumber}"`)
        }
      }
    }

    // Find orphaned shipments (Shipment documents with no corresponding Order)
    const orphanedShipmentList = Array.from(orphanedShipments)
      .map(shipmentId => {
        const shipment = shipmentMap.get(shipmentId)
        return {
          shipmentId,
          prNumber: shipment?.prNumber,
          shipmentMode: shipment?.shipmentMode,
          vendorId: shipment?.vendorId,
          createdAt: shipment?.createdAt,
        }
      })

    // Summary
    console.log('\n' + '='.repeat(80))
    console.log('📊 DIAGNOSTIC SUMMARY')
    console.log('='.repeat(80))
    console.log(`Total Orders with shipmentId: ${ordersWithShipment.length}`)
    console.log(`Total Shipments: ${allShipments.length}`)
    console.log(`\n❌ Missing Shipment Documents: ${missingShipments.length}`)
    console.log(`⚠️  PR Mismatches: ${mismatches.length}`)
    console.log(`🔍 Orphaned Shipments: ${orphanedShipmentList.length}`)

    // Detailed reports
    if (missingShipments.length > 0) {
      console.log('\n' + '-'.repeat(80))
      console.log('❌ ORDERS WITH MISSING SHIPMENT DOCUMENTS:')
      console.log('-'.repeat(80))
      missingShipments.forEach((item, index) => {
        console.log(`\n${index + 1}. Order ID: ${item.orderId}`)
        console.log(`   PR Number: ${item.prNumber}`)
        console.log(`   Shipment ID: ${item.orderShipmentId}`)
        console.log(`   Vendor ID: ${item.vendorId}`)
        console.log(`   Dispatch Status: ${item.dispatchStatus}`)
        console.log(`   Dispatched Date: ${item.dispatchedDate}`)
      })
    }

    if (orphanedShipmentList.length > 0) {
      console.log('\n' + '-'.repeat(80))
      console.log('🔍 ORPHANED SHIPMENT DOCUMENTS (no matching Order):')
      console.log('-'.repeat(80))
      orphanedShipmentList.forEach((item, index) => {
        console.log(`\n${index + 1}. Shipment ID: ${item.shipmentId}`)
        console.log(`   PR Number: ${item.prNumber}`)
        console.log(`   Shipment Mode: ${item.shipmentMode}`)
        console.log(`   Vendor ID: ${item.vendorId}`)
        console.log(`   Created At: ${item.createdAt}`)
      })
    }

    // Fix mode
    if (fix && missingShipments.length > 0) {
      console.log('\n' + '='.repeat(80))
      console.log('🔧 FIX MODE: Attempting to fix missing Shipment documents...')
      console.log('='.repeat(80))

      let fixed = 0
      let failed = 0

      for (const item of missingShipments) {
        try {
          // Try to find the order to get more details
          const order = await Order.findOne({ id: item.orderId }).lean()
          
          if (!order) {
            console.log(`⚠️  Order ${item.orderId} not found, skipping...`)
            failed++
            continue
          }

          // Determine shipment mode based on order data
          const shipmentMode = order.logisticsProviderCode ? 'API' : 'MANUAL'
          
          // Create Shipment document
          await Shipment.create({
            shipmentId: item.orderShipmentId,
            prNumber: order.pr_number || order.id,
            poNumber: undefined,
            vendorId: order.vendorId,
            shipmentMode: shipmentMode,
            providerId: undefined, // Would need to look up from routing
            companyShippingProviderId: undefined,
            providerShipmentReference: order.logisticsPayloadRef || item.orderShipmentId,
            trackingNumber: order.trackingNumber,
            trackingUrl: order.logisticsTrackingUrl,
            warehouseRefId: undefined,
            warehousePincode: undefined,
            shipmentPackageId: undefined,
            lengthCm: undefined,
            breadthCm: undefined,
            heightCm: undefined,
            volumetricWeight: undefined,
            shippingCost: undefined,
            shipmentStatus: order.dispatchStatus === 'SHIPPED' ? 'CREATED' : 'PENDING',
            lastProviderSyncAt: shipmentMode === 'API' ? new Date() : undefined,
            rawProviderResponse: undefined,
          })

          console.log(`✅ Fixed: Created Shipment document for ${item.orderShipmentId} (Mode: ${shipmentMode})`)
          fixed++
        } catch (error) {
          console.error(`❌ Failed to fix ${item.orderShipmentId}:`, error.message)
          failed++
        }
      }

      console.log(`\n✅ Fixed: ${fixed}`)
      console.log(`❌ Failed: ${failed}`)
    } else if (fix) {
      console.log('\n✅ No missing Shipment documents to fix!')
    }

    // Search for specific shipmentId if provided
    const searchId = process.argv.find(arg => arg.startsWith('--search='))
    if (searchId) {
      const searchValue = searchId.split('=')[1]
      console.log(`\n🔍 Searching for shipmentId: "${searchValue}"...`)
      
      const foundOrder = ordersWithShipment.find(o => o.shipmentId === searchValue)
      const foundShipment = allShipments.find(s => s.shipmentId === searchValue)
      
      if (foundOrder) {
        console.log(`\n✅ Found in Order:`)
        console.log(`   Order ID: ${foundOrder.id}`)
        console.log(`   PR Number: ${foundOrder.pr_number}`)
        console.log(`   Shipment ID: ${foundOrder.shipmentId}`)
        console.log(`   Dispatch Status: ${foundOrder.dispatchStatus}`)
      } else {
        console.log(`\n❌ Not found in any Order`)
      }
      
      if (foundShipment) {
        console.log(`\n✅ Found in Shipment:`)
        console.log(`   Shipment ID: ${foundShipment.shipmentId}`)
        console.log(`   PR Number: ${foundShipment.prNumber}`)
        console.log(`   Shipment Mode: ${foundShipment.shipmentMode}`)
        console.log(`   Vendor ID: ${foundShipment.vendorId}`)
        console.log(`   Created At: ${foundShipment.createdAt}`)
      } else {
        console.log(`\n❌ Not found in any Shipment document`)
      }
    }

    console.log('\n✅ Diagnostic complete!')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

// Parse command line arguments
const fix = process.argv.includes('--fix')
const search = process.argv.find(arg => arg.startsWith('--search='))

console.log('🚀 Shipment ID Mismatch Diagnostic Tool')
console.log('='.repeat(80))
if (fix) {
  console.log('⚠️  FIX MODE ENABLED - Will attempt to create missing Shipment documents')
}
if (search) {
  console.log(`🔍 Search mode: ${search}`)
}
console.log('='.repeat(80) + '\n')

diagnoseShipmentMismatches(fix)
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })

