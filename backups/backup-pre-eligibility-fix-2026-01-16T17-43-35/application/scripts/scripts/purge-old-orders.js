/**
 * Purge Old Orders Script
 * 
 * This script removes orders older than 5 days and all related data from MongoDB.
 * It handles cascading deletes to maintain data integrity.
 * 
 * Collections affected:
 * - Order (main orders)
 * - POOrder (order-to-PO mappings)
 * - OrderSuborder (suborders)
 * - ProductFeedback (product feedback for orders)
 * - ReturnRequest (return requests for orders)
 * - Shipment (shipments for orders via PR number)
 * - PurchaseOrder (if no orders remain linked)
 * - GRN (if all related PRs are deleted)
 * 
 * Usage:
 *   node scripts/purge-old-orders.js [--dry-run] [--days=N]
 * 
 * Options:
 *   --dry-run    Preview changes without modifying the database
 *   --days=N     Override default 5 days (e.g., --days=7)
 * 
 * @created 2026-01-16
 */

const mongoose = require('mongoose')
require('dotenv').config({ path: '.env.local' })

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is not set')
  process.exit(1)
}

// Parse command line arguments
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const daysArg = args.find(arg => arg.startsWith('--days='))
const DAYS_THRESHOLD = daysArg ? parseInt(daysArg.split('=')[1], 10) : 5

if (isNaN(DAYS_THRESHOLD) || DAYS_THRESHOLD < 1) {
  console.error('❌ Invalid days value. Must be a positive integer.')
  process.exit(1)
}

// Calculate cutoff date
const cutoffDate = new Date()
cutoffDate.setDate(cutoffDate.getDate() - DAYS_THRESHOLD)

console.log('='.repeat(70))
console.log('PURGE OLD ORDERS SCRIPT')
console.log('='.repeat(70))
console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (no changes will be made)' : '⚠️  LIVE RUN (data will be deleted!)'}`)
console.log(`Threshold: ${DAYS_THRESHOLD} days`)
console.log(`Cutoff Date: ${cutoffDate.toISOString()}`)
console.log(`Orders created before this date will be purged`)
console.log('='.repeat(70))

async function purgeOldOrders() {
  try {
    // Connect to MongoDB
    console.log('\n📡 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    const db = mongoose.connection.db

    // Step 1: Find old orders
    console.log('\n' + '─'.repeat(70))
    console.log('STEP 1: Finding orders older than', DAYS_THRESHOLD, 'days...')
    console.log('─'.repeat(70))

    const ordersCollection = db.collection('orders')
    const oldOrders = await ordersCollection.find({
      $or: [
        { orderDate: { $lt: cutoffDate } },
        { createdAt: { $lt: cutoffDate } }
      ]
    }).toArray()

    console.log(`Found ${oldOrders.length} orders to purge`)

    if (oldOrders.length === 0) {
      console.log('\n✅ No orders found older than', DAYS_THRESHOLD, 'days. Nothing to purge.')
      return
    }

    // Extract order identifiers
    const orderIds = oldOrders.map(o => o.id).filter(Boolean)
    const orderObjectIds = oldOrders.map(o => o._id)
    const prNumbers = oldOrders.map(o => o.pr_number).filter(Boolean)
    
    console.log(`  - Order IDs: ${orderIds.length}`)
    console.log(`  - PR Numbers: ${prNumbers.length}`)

    // Step 2: Find related PO IDs
    console.log('\n' + '─'.repeat(70))
    console.log('STEP 2: Finding related Purchase Orders...')
    console.log('─'.repeat(70))

    const poOrderCollection = db.collection('poorders')
    const relatedPOOrders = await poOrderCollection.find({
      order_id: { $in: orderIds }
    }).toArray()

    const poIds = [...new Set(relatedPOOrders.map(pom => pom.purchase_order_id).filter(Boolean))]
    console.log(`Found ${relatedPOOrders.length} POOrder mappings`)
    console.log(`Related PO IDs: ${poIds.length}`)

    // Summary of what will be deleted
    const deletionSummary = {
      orders: oldOrders.length,
      poOrders: 0,
      orderSuborders: 0,
      productFeedback: 0,
      returnRequests: 0,
      shipments: 0,
      purchaseOrders: 0,
      grns: 0
    }

    // Step 3: Count related records
    console.log('\n' + '─'.repeat(70))
    console.log('STEP 3: Counting related records...')
    console.log('─'.repeat(70))

    // POOrder mappings
    deletionSummary.poOrders = await poOrderCollection.countDocuments({
      order_id: { $in: orderIds }
    })
    console.log(`  POOrders: ${deletionSummary.poOrders}`)

    // OrderSuborder
    const orderSuborderCollection = db.collection('ordersuborders')
    deletionSummary.orderSuborders = await orderSuborderCollection.countDocuments({
      order_id: { $in: orderIds }
    })
    console.log(`  OrderSuborders: ${deletionSummary.orderSuborders}`)

    // ProductFeedback
    const productFeedbackCollection = db.collection('productfeedbacks')
    deletionSummary.productFeedback = await productFeedbackCollection.countDocuments({
      orderId: { $in: orderIds }
    })
    console.log(`  ProductFeedback: ${deletionSummary.productFeedback}`)

    // ReturnRequest
    const returnRequestCollection = db.collection('returnrequests')
    deletionSummary.returnRequests = await returnRequestCollection.countDocuments({
      originalOrderId: { $in: orderIds }
    })
    console.log(`  ReturnRequests: ${deletionSummary.returnRequests}`)

    // Shipment (via PR number)
    const shipmentCollection = db.collection('shipments')
    deletionSummary.shipments = await shipmentCollection.countDocuments({
      prNumber: { $in: prNumbers }
    })
    console.log(`  Shipments: ${deletionSummary.shipments}`)

    // Step 4: Find orphaned POs (POs that will have no orders after this purge)
    console.log('\n' + '─'.repeat(70))
    console.log('STEP 4: Finding orphaned Purchase Orders...')
    console.log('─'.repeat(70))

    const orphanedPoIds = []
    for (const poId of poIds) {
      // Count orders linked to this PO that are NOT in our deletion list
      const remainingOrdersForPO = await poOrderCollection.countDocuments({
        purchase_order_id: poId,
        order_id: { $nin: orderIds }
      })
      
      if (remainingOrdersForPO === 0) {
        orphanedPoIds.push(poId)
      }
    }
    
    deletionSummary.purchaseOrders = orphanedPoIds.length
    console.log(`  Orphaned POs to delete: ${orphanedPoIds.length}`)

    // Step 5: Find orphaned GRNs (GRNs where all PRs are being deleted)
    console.log('\n' + '─'.repeat(70))
    console.log('STEP 5: Finding orphaned GRNs...')
    console.log('─'.repeat(70))

    const grnCollection = db.collection('grns')
    const relatedGRNs = await grnCollection.find({
      prNumbers: { $in: prNumbers }
    }).toArray()

    const orphanedGrnIds = []
    for (const grn of relatedGRNs) {
      // Check if ALL prNumbers in this GRN are in our deletion list
      const allPRsBeingDeleted = grn.prNumbers.every(pr => prNumbers.includes(pr))
      if (allPRsBeingDeleted) {
        orphanedGrnIds.push(grn.id || grn._id)
      }
    }
    
    deletionSummary.grns = orphanedGrnIds.length
    console.log(`  Orphaned GRNs to delete: ${orphanedGrnIds.length}`)

    // Print Summary
    console.log('\n' + '='.repeat(70))
    console.log('DELETION SUMMARY')
    console.log('='.repeat(70))
    console.log(`  📦 Orders:           ${deletionSummary.orders}`)
    console.log(`  🔗 POOrder mappings: ${deletionSummary.poOrders}`)
    console.log(`  📋 OrderSuborders:   ${deletionSummary.orderSuborders}`)
    console.log(`  ⭐ ProductFeedback:  ${deletionSummary.productFeedback}`)
    console.log(`  ↩️  ReturnRequests:   ${deletionSummary.returnRequests}`)
    console.log(`  🚚 Shipments:        ${deletionSummary.shipments}`)
    console.log(`  📄 PurchaseOrders:   ${deletionSummary.purchaseOrders}`)
    console.log(`  📝 GRNs:             ${deletionSummary.grns}`)
    console.log('='.repeat(70))

    const totalRecords = Object.values(deletionSummary).reduce((a, b) => a + b, 0)
    console.log(`  TOTAL RECORDS TO DELETE: ${totalRecords}`)
    console.log('='.repeat(70))

    if (isDryRun) {
      console.log('\n🔍 DRY RUN COMPLETE - No changes were made')
      console.log('Run without --dry-run flag to execute the purge')
      return
    }

    // Step 6: Execute deletions (child tables first)
    console.log('\n' + '─'.repeat(70))
    console.log('STEP 6: Executing deletions...')
    console.log('─'.repeat(70))

    let deletedCounts = {
      productFeedback: 0,
      returnRequests: 0,
      shipments: 0,
      orderSuborders: 0,
      poOrders: 0,
      grns: 0,
      purchaseOrders: 0,
      orders: 0
    }

    // 6.1 Delete ProductFeedback
    console.log('  Deleting ProductFeedback...')
    const feedbackResult = await productFeedbackCollection.deleteMany({
      orderId: { $in: orderIds }
    })
    deletedCounts.productFeedback = feedbackResult.deletedCount
    console.log(`    ✅ Deleted ${feedbackResult.deletedCount} ProductFeedback records`)

    // 6.2 Delete ReturnRequests
    console.log('  Deleting ReturnRequests...')
    const returnResult = await returnRequestCollection.deleteMany({
      originalOrderId: { $in: orderIds }
    })
    deletedCounts.returnRequests = returnResult.deletedCount
    console.log(`    ✅ Deleted ${returnResult.deletedCount} ReturnRequest records`)

    // 6.3 Delete Shipments
    console.log('  Deleting Shipments...')
    const shipmentResult = await shipmentCollection.deleteMany({
      prNumber: { $in: prNumbers }
    })
    deletedCounts.shipments = shipmentResult.deletedCount
    console.log(`    ✅ Deleted ${shipmentResult.deletedCount} Shipment records`)

    // 6.4 Delete OrderSuborders
    console.log('  Deleting OrderSuborders...')
    const suborderResult = await orderSuborderCollection.deleteMany({
      order_id: { $in: orderIds }
    })
    deletedCounts.orderSuborders = suborderResult.deletedCount
    console.log(`    ✅ Deleted ${suborderResult.deletedCount} OrderSuborder records`)

    // 6.5 Delete POOrder mappings
    console.log('  Deleting POOrder mappings...')
    const poOrderResult = await poOrderCollection.deleteMany({
      order_id: { $in: orderIds }
    })
    deletedCounts.poOrders = poOrderResult.deletedCount
    console.log(`    ✅ Deleted ${poOrderResult.deletedCount} POOrder records`)

    // 6.6 Delete orphaned GRNs
    if (orphanedGrnIds.length > 0) {
      console.log('  Deleting orphaned GRNs...')
      const grnResult = await grnCollection.deleteMany({
        $or: [
          { id: { $in: orphanedGrnIds } },
          { _id: { $in: orphanedGrnIds } }
        ]
      })
      deletedCounts.grns = grnResult.deletedCount
      console.log(`    ✅ Deleted ${grnResult.deletedCount} GRN records`)
    }

    // 6.7 Delete orphaned PurchaseOrders
    if (orphanedPoIds.length > 0) {
      console.log('  Deleting orphaned PurchaseOrders...')
      const purchaseOrderCollection = db.collection('purchaseorders')
      const poResult = await purchaseOrderCollection.deleteMany({
        id: { $in: orphanedPoIds }
      })
      deletedCounts.purchaseOrders = poResult.deletedCount
      console.log(`    ✅ Deleted ${poResult.deletedCount} PurchaseOrder records`)
    }

    // 6.8 Delete Orders (main records - last)
    console.log('  Deleting Orders...')
    const orderResult = await ordersCollection.deleteMany({
      _id: { $in: orderObjectIds }
    })
    deletedCounts.orders = orderResult.deletedCount
    console.log(`    ✅ Deleted ${orderResult.deletedCount} Order records`)

    // Final Summary
    console.log('\n' + '='.repeat(70))
    console.log('PURGE COMPLETE')
    console.log('='.repeat(70))
    console.log('Deleted records:')
    console.log(`  📦 Orders:           ${deletedCounts.orders}`)
    console.log(`  🔗 POOrder mappings: ${deletedCounts.poOrders}`)
    console.log(`  📋 OrderSuborders:   ${deletedCounts.orderSuborders}`)
    console.log(`  ⭐ ProductFeedback:  ${deletedCounts.productFeedback}`)
    console.log(`  ↩️  ReturnRequests:   ${deletedCounts.returnRequests}`)
    console.log(`  🚚 Shipments:        ${deletedCounts.shipments}`)
    console.log(`  📄 PurchaseOrders:   ${deletedCounts.purchaseOrders}`)
    console.log(`  📝 GRNs:             ${deletedCounts.grns}`)
    console.log('='.repeat(70))
    
    const totalDeleted = Object.values(deletedCounts).reduce((a, b) => a + b, 0)
    console.log(`  TOTAL RECORDS DELETED: ${totalDeleted}`)
    console.log('='.repeat(70))

  } catch (error) {
    console.error('\n❌ Error during purge:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n📡 Disconnected from MongoDB')
  }
}

// Run the script
purgeOldOrders()
