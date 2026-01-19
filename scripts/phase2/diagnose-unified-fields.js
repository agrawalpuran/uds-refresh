/**
 * Diagnostic: Check unified field status across all entities
 */

const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') })
const { MongoClient } = require('mongodb')

async function diagnose() {
  const client = new MongoClient(process.env.MONGODB_URI)
  await client.connect()
  const db = client.db()
  
  console.log('═══════════════════════════════════════════════════════════════════')
  console.log('DIAGNOSTIC: UNIFIED FIELD STATUS')
  console.log('═══════════════════════════════════════════════════════════════════\n')
  
  // ========================
  // ORDERS (non-PR)
  // ========================
  console.log('─── ORDERS (non-PR) ───')
  const totalOrders = await db.collection('orders').countDocuments({ pr_number: { $exists: false } })
  const ordersFieldExists = await db.collection('orders').countDocuments({ 
    pr_number: { $exists: false },
    unified_status: { $exists: true }
  })
  const ordersWithValue = await db.collection('orders').countDocuments({ 
    pr_number: { $exists: false },
    unified_status: { $exists: true, $ne: null, $ne: '' }
  })
  
  console.log(`Total: ${totalOrders}`)
  console.log(`unified_status field exists: ${ordersFieldExists}`)
  console.log(`unified_status has value: ${ordersWithValue}`)
  
  // Sample
  const sampleOrder = await db.collection('orders').findOne({ pr_number: { $exists: false } })
  if (sampleOrder) {
    console.log(`Sample order.status: "${sampleOrder.status}"`)
    console.log(`Sample order.unified_status: ${JSON.stringify(sampleOrder.unified_status)}`)
    console.log(`unified_status in keys: ${'unified_status' in sampleOrder}`)
  }
  
  // ========================
  // PRs
  // ========================
  console.log('\n─── PRs ───')
  const totalPRs = await db.collection('orders').countDocuments({ pr_number: { $exists: true, $ne: null } })
  const prsFieldExists = await db.collection('orders').countDocuments({ 
    pr_number: { $exists: true, $ne: null },
    unified_pr_status: { $exists: true }
  })
  const prsWithValue = await db.collection('orders').countDocuments({ 
    pr_number: { $exists: true, $ne: null },
    unified_pr_status: { $exists: true, $ne: null, $ne: '' }
  })
  
  console.log(`Total: ${totalPRs}`)
  console.log(`unified_pr_status field exists: ${prsFieldExists}`)
  console.log(`unified_pr_status has value: ${prsWithValue}`)
  
  // Sample PR with status breakdown
  const samplePR = await db.collection('orders').findOne({ pr_number: { $exists: true, $ne: null } })
  if (samplePR) {
    console.log(`Sample PR.pr_status: "${samplePR.pr_status}"`)
    console.log(`Sample PR.unified_pr_status: ${JSON.stringify(samplePR.unified_pr_status)}`)
  }
  
  // Status breakdown
  const prStatusBreakdown = await db.collection('orders').aggregate([
    { $match: { pr_number: { $exists: true, $ne: null } } },
    { $group: { _id: '$pr_status', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray()
  console.log('PR Status breakdown:')
  prStatusBreakdown.forEach(s => console.log(`  ${s._id}: ${s.count}`))
  
  // ========================
  // POs
  // ========================
  console.log('\n─── PURCHASE ORDERS ───')
  const totalPOs = await db.collection('purchaseorders').countDocuments({})
  const posFieldExists = await db.collection('purchaseorders').countDocuments({ 
    unified_po_status: { $exists: true }
  })
  const posWithValue = await db.collection('purchaseorders').countDocuments({ 
    unified_po_status: { $exists: true, $ne: null, $ne: '' }
  })
  
  console.log(`Total: ${totalPOs}`)
  console.log(`unified_po_status field exists: ${posFieldExists}`)
  console.log(`unified_po_status has value: ${posWithValue}`)
  
  // ========================
  // GRNs
  // ========================
  console.log('\n─── GRNs ───')
  const totalGRNs = await db.collection('grns').countDocuments({})
  const grnsFieldExists = await db.collection('grns').countDocuments({ 
    unified_grn_status: { $exists: true }
  })
  const grnsWithValue = await db.collection('grns').countDocuments({ 
    unified_grn_status: { $exists: true, $ne: null, $ne: '' }
  })
  
  console.log(`Total: ${totalGRNs}`)
  console.log(`unified_grn_status field exists: ${grnsFieldExists}`)
  console.log(`unified_grn_status has value: ${grnsWithValue}`)
  
  // ========================
  // Invoices
  // ========================
  console.log('\n─── INVOICES ───')
  const totalInvoices = await db.collection('invoices').countDocuments({})
  const invoicesFieldExists = await db.collection('invoices').countDocuments({ 
    unified_invoice_status: { $exists: true }
  })
  const invoicesWithValue = await db.collection('invoices').countDocuments({ 
    unified_invoice_status: { $exists: true, $ne: null, $ne: '' }
  })
  
  console.log(`Total: ${totalInvoices}`)
  console.log(`unified_invoice_status field exists: ${invoicesFieldExists}`)
  console.log(`unified_invoice_status has value: ${invoicesWithValue}`)
  
  // ========================
  // Shipments
  // ========================
  console.log('\n─── SHIPMENTS ───')
  const totalShipments = await db.collection('shipments').countDocuments({})
  const shipmentsFieldExists = await db.collection('shipments').countDocuments({ 
    unified_shipment_status: { $exists: true }
  })
  const shipmentsWithValue = await db.collection('shipments').countDocuments({ 
    unified_shipment_status: { $exists: true, $ne: null, $ne: '' }
  })
  
  console.log(`Total: ${totalShipments}`)
  console.log(`unified_shipment_status field exists: ${shipmentsFieldExists}`)
  console.log(`unified_shipment_status has value: ${shipmentsWithValue}`)
  
  console.log('\n═══════════════════════════════════════════════════════════════════')
  console.log('DIAGNOSIS COMPLETE')
  console.log('═══════════════════════════════════════════════════════════════════')
  
  await client.close()
}

diagnose().catch(console.error)
