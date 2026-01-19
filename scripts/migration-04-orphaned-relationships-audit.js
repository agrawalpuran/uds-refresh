/**
 * Migration Script #4 — DATA CLEANUP FOR FAILED/ORPHANED RELATIONSHIPS
 * 
 * Purpose: Find orphaned records and relationship inconsistencies.
 * 
 * Checks:
 * - Orphaned shipments (shipment.prNumber not found in orders)
 * - PRs with IN_SHIPMENT status but no shipments
 * - POs whose PR-status aggregates don't match their PO-status
 * - GRNs without matching POs
 * - Invoices without matching GRNs
 * 
 * Actions: READ-ONLY - Lists only, no deletes or updates
 * 
 * Usage: node scripts/migration-04-orphaned-relationships-audit.js
 * 
 * @version 1.0.0
 * @created 2026-01-15
 */

require('dotenv').config()
const mongoose = require('mongoose')

// =============================================================================
// AUDIT FUNCTIONS
// =============================================================================

async function findOrphanedShipments(db) {
  console.log('\n' + '='.repeat(80))
  console.log('CHECKING: Orphaned Shipments')
  console.log('(Shipments whose prNumber does not exist in orders.pr_number)')
  console.log('='.repeat(80))
  
  const shipments = await db.collection('shipments').find({}).toArray()
  const prNumbers = await db.collection('orders').distinct('pr_number', {
    pr_number: { $exists: true, $ne: null }
  })
  const prNumberSet = new Set(prNumbers)
  
  const orphaned = []
  for (const shipment of shipments) {
    if (!prNumberSet.has(shipment.prNumber)) {
      orphaned.push({
        shipmentId: shipment.shipmentId,
        prNumber: shipment.prNumber,
        vendorId: shipment.vendorId,
        shipmentStatus: shipment.shipmentStatus,
        createdAt: shipment.createdAt,
      })
    }
  }
  
  console.log(`\nTotal Shipments: ${shipments.length}`)
  console.log(`Valid PRs referenced: ${prNumberSet.size}`)
  console.log(`Orphaned Shipments: ${orphaned.length}`)
  
  if (orphaned.length > 0) {
    console.log('\n--- Orphaned Shipments ---')
    orphaned.slice(0, 30).forEach(s => {
      console.log(`  ⚠️  ShipmentID: ${s.shipmentId} | PR#: ${s.prNumber} | Vendor: ${s.vendorId} | Status: ${s.shipmentStatus}`)
    })
    if (orphaned.length > 30) {
      console.log(`  ... and ${orphaned.length - 30} more`)
    }
  } else {
    console.log('\n✅ No orphaned shipments found')
  }
  
  return orphaned
}

async function findPRsWithoutShipments(db) {
  console.log('\n' + '='.repeat(80))
  console.log('CHECKING: PRs with IN_SHIPMENT status but no Shipments')
  console.log('(PRs that claim to be shipped but have no shipment records)')
  console.log('='.repeat(80))
  
  // Find PRs with shipment-related status
  const prsWithShipmentStatus = await db.collection('orders').find({
    pr_number: { $exists: true, $ne: null },
    $or: [
      { dispatchStatus: 'SHIPPED' },
      { unified_pr_status: 'IN_SHIPMENT' },
      { deliveryStatus: { $in: ['PARTIALLY_DELIVERED', 'DELIVERED'] } }
    ]
  }).toArray()
  
  // Get all PR numbers that have shipments
  const shipmentPRNumbers = await db.collection('shipments').distinct('prNumber')
  const shipmentPRSet = new Set(shipmentPRNumbers)
  
  const prsWithoutShipments = []
  for (const pr of prsWithShipmentStatus) {
    if (!shipmentPRSet.has(pr.pr_number)) {
      prsWithoutShipments.push({
        id: pr.id,
        prNumber: pr.pr_number,
        prStatus: pr.pr_status,
        dispatchStatus: pr.dispatchStatus,
        deliveryStatus: pr.deliveryStatus,
        unifiedPRStatus: pr.unified_pr_status,
      })
    }
  }
  
  console.log(`\nPRs with shipment-related status: ${prsWithShipmentStatus.length}`)
  console.log(`Unique PRs with shipments: ${shipmentPRSet.size}`)
  console.log(`PRs claiming shipment but no shipment record: ${prsWithoutShipments.length}`)
  
  if (prsWithoutShipments.length > 0) {
    console.log('\n--- PRs without Shipments ---')
    prsWithoutShipments.slice(0, 30).forEach(p => {
      console.log(`  ⚠️  ID: ${p.id} | PR#: ${p.prNumber} | Status: ${p.prStatus} | Dispatch: ${p.dispatchStatus} | Delivery: ${p.deliveryStatus}`)
    })
    if (prsWithoutShipments.length > 30) {
      console.log(`  ... and ${prsWithoutShipments.length - 30} more`)
    }
  } else {
    console.log('\n✅ All PRs with shipment status have corresponding shipment records')
  }
  
  return prsWithoutShipments
}

async function findPOStatusMismatches(db) {
  console.log('\n' + '='.repeat(80))
  console.log('CHECKING: PO Status vs Aggregated PR Status Mismatches')
  console.log('(POs whose status doesn\'t align with their linked PRs\' status)')
  console.log('='.repeat(80))
  
  const pos = await db.collection('purchaseorders').find({}).toArray()
  
  const mismatches = []
  
  for (const po of pos) {
    // Find all PRs linked to this PO via client_po_number
    const linkedPRs = await db.collection('orders').find({
      pr_number: { $exists: true, $ne: null },
      // PRs are typically linked via parentOrderId or a stored reference
      // We'll check for PRs with PO_CREATED status and matching companyId
      companyId: po.companyId,
      pr_status: 'PO_CREATED'
    }).toArray()
    
    if (linkedPRs.length === 0) continue // No linked PRs to check
    
    // Check for status mismatches
    const allDelivered = linkedPRs.every(pr => 
      pr.deliveryStatus === 'DELIVERED' || pr.pr_status === 'FULLY_DELIVERED'
    )
    const anyShipped = linkedPRs.some(pr => pr.dispatchStatus === 'SHIPPED')
    
    let expectedPOStatus = po.po_status
    let mismatchReason = null
    
    if (allDelivered && po.po_status !== 'COMPLETED') {
      mismatchReason = `All ${linkedPRs.length} PRs delivered but PO status is ${po.po_status} (expected: COMPLETED)`
    } else if (anyShipped && po.po_status === 'CREATED') {
      mismatchReason = `PRs have shipped items but PO status is still CREATED`
    }
    
    if (mismatchReason) {
      mismatches.push({
        poId: po.id,
        poNumber: po.client_po_number,
        poStatus: po.po_status,
        linkedPRCount: linkedPRs.length,
        mismatchReason,
      })
    }
  }
  
  console.log(`\nTotal POs checked: ${pos.length}`)
  console.log(`POs with status mismatches: ${mismatches.length}`)
  
  if (mismatches.length > 0) {
    console.log('\n--- PO Status Mismatches ---')
    mismatches.slice(0, 30).forEach(m => {
      console.log(`  ⚠️  PO#: ${m.poNumber} | Status: ${m.poStatus} | PRs: ${m.linkedPRCount}`)
      console.log(`      Reason: ${m.mismatchReason}`)
    })
    if (mismatches.length > 30) {
      console.log(`  ... and ${mismatches.length - 30} more`)
    }
  } else {
    console.log('\n✅ No PO status mismatches found')
  }
  
  return mismatches
}

async function findOrphanedGRNs(db) {
  console.log('\n' + '='.repeat(80))
  console.log('CHECKING: Orphaned GRNs')
  console.log('(GRNs without matching POs)')
  console.log('='.repeat(80))
  
  const grns = await db.collection('grns').find({}).toArray()
  const poNumbers = await db.collection('purchaseorders').distinct('client_po_number')
  const poNumberSet = new Set(poNumbers)
  
  const orphaned = []
  for (const grn of grns) {
    if (!poNumberSet.has(grn.poNumber)) {
      orphaned.push({
        grnId: grn.id,
        grnNumber: grn.grnNumber,
        poNumber: grn.poNumber,
        vendorId: grn.vendorId,
        status: grn.status,
        grnStatus: grn.grnStatus,
        createdAt: grn.createdAt,
      })
    }
  }
  
  console.log(`\nTotal GRNs: ${grns.length}`)
  console.log(`Valid POs: ${poNumberSet.size}`)
  console.log(`Orphaned GRNs: ${orphaned.length}`)
  
  if (orphaned.length > 0) {
    console.log('\n--- Orphaned GRNs ---')
    orphaned.slice(0, 30).forEach(g => {
      console.log(`  ⚠️  GRN#: ${g.grnNumber} | PO#: ${g.poNumber} | Vendor: ${g.vendorId} | Status: ${g.status}/${g.grnStatus}`)
    })
    if (orphaned.length > 30) {
      console.log(`  ... and ${orphaned.length - 30} more`)
    }
  } else {
    console.log('\n✅ No orphaned GRNs found')
  }
  
  return orphaned
}

async function findOrphanedInvoices(db) {
  console.log('\n' + '='.repeat(80))
  console.log('CHECKING: Orphaned Invoices')
  console.log('(Invoices without matching GRNs)')
  console.log('='.repeat(80))
  
  const invoices = await db.collection('invoices').find({}).toArray()
  const grnIds = await db.collection('grns').distinct('id')
  const grnIdSet = new Set(grnIds)
  
  const orphaned = []
  for (const invoice of invoices) {
    if (!grnIdSet.has(invoice.grnId)) {
      orphaned.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        grnId: invoice.grnId,
        grnNumber: invoice.grnNumber,
        vendorId: invoice.vendorId,
        invoiceStatus: invoice.invoiceStatus,
        createdAt: invoice.createdAt,
      })
    }
  }
  
  console.log(`\nTotal Invoices: ${invoices.length}`)
  console.log(`Valid GRNs: ${grnIdSet.size}`)
  console.log(`Orphaned Invoices: ${orphaned.length}`)
  
  if (orphaned.length > 0) {
    console.log('\n--- Orphaned Invoices ---')
    orphaned.slice(0, 30).forEach(i => {
      console.log(`  ⚠️  Invoice#: ${i.invoiceNumber} | GRN: ${i.grnId}/${i.grnNumber} | Vendor: ${i.vendorId} | Status: ${i.invoiceStatus}`)
    })
    if (orphaned.length > 30) {
      console.log(`  ... and ${orphaned.length - 30} more`)
    }
  } else {
    console.log('\n✅ No orphaned invoices found')
  }
  
  return orphaned
}

async function findOrphanedProductVendorLinks(db) {
  console.log('\n' + '='.repeat(80))
  console.log('CHECKING: Orphaned Product-Vendor Links')
  console.log('(ProductVendors referencing non-existent vendors or products)')
  console.log('='.repeat(80))
  
  const productVendors = await db.collection('productvendors').find({}).toArray()
  
  if (productVendors.length === 0) {
    console.log('\nNo productvendors collection found or empty')
    return []
  }
  
  const vendorIds = await db.collection('vendors').distinct('id')
  const vendorIdSet = new Set(vendorIds)
  
  const uniformIds = await db.collection('uniforms').distinct('id')
  const uniformIdSet = new Set(uniformIds)
  
  const orphaned = []
  for (const pv of productVendors) {
    const issues = []
    if (!vendorIdSet.has(pv.vendorId)) {
      issues.push(`Vendor ${pv.vendorId} not found`)
    }
    if (pv.uniformId && !uniformIdSet.has(pv.uniformId)) {
      issues.push(`Uniform ${pv.uniformId} not found`)
    }
    
    if (issues.length > 0) {
      orphaned.push({
        id: pv.id || pv._id,
        vendorId: pv.vendorId,
        uniformId: pv.uniformId,
        issues,
      })
    }
  }
  
  console.log(`\nTotal ProductVendor links: ${productVendors.length}`)
  console.log(`Valid Vendors: ${vendorIdSet.size}`)
  console.log(`Valid Uniforms: ${uniformIdSet.size}`)
  console.log(`Orphaned links: ${orphaned.length}`)
  
  if (orphaned.length > 0) {
    console.log('\n--- Orphaned Product-Vendor Links ---')
    orphaned.slice(0, 30).forEach(o => {
      console.log(`  ⚠️  ID: ${o.id} | Vendor: ${o.vendorId} | Uniform: ${o.uniformId}`)
      console.log(`      Issues: ${o.issues.join(', ')}`)
    })
    if (orphaned.length > 30) {
      console.log(`  ... and ${orphaned.length - 30} more`)
    }
  } else {
    console.log('\n✅ No orphaned product-vendor links found')
  }
  
  return orphaned
}

async function findOrphanedVendorInventory(db) {
  console.log('\n' + '='.repeat(80))
  console.log('CHECKING: Orphaned Vendor Inventory')
  console.log('(VendorInventory referencing non-existent vendors or products)')
  console.log('='.repeat(80))
  
  const vendorInventories = await db.collection('vendorinventories').find({}).toArray()
  
  if (vendorInventories.length === 0) {
    console.log('\nNo vendorinventories collection found or empty')
    return []
  }
  
  const vendorIds = await db.collection('vendors').distinct('id')
  const vendorIdSet = new Set(vendorIds)
  
  const uniformIds = await db.collection('uniforms').distinct('id')
  const uniformIdSet = new Set(uniformIds)
  
  const orphaned = []
  for (const vi of vendorInventories) {
    const issues = []
    if (!vendorIdSet.has(vi.vendorId)) {
      issues.push(`Vendor ${vi.vendorId} not found`)
    }
    if (vi.uniformId && !uniformIdSet.has(vi.uniformId)) {
      issues.push(`Uniform ${vi.uniformId} not found`)
    }
    
    if (issues.length > 0) {
      orphaned.push({
        id: vi.id || vi._id,
        vendorId: vi.vendorId,
        uniformId: vi.uniformId,
        issues,
      })
    }
  }
  
  console.log(`\nTotal VendorInventory records: ${vendorInventories.length}`)
  console.log(`Valid Vendors: ${vendorIdSet.size}`)
  console.log(`Valid Uniforms: ${uniformIdSet.size}`)
  console.log(`Orphaned records: ${orphaned.length}`)
  
  if (orphaned.length > 0) {
    console.log('\n--- Orphaned Vendor Inventory ---')
    orphaned.slice(0, 30).forEach(o => {
      console.log(`  ⚠️  ID: ${o.id} | Vendor: ${o.vendorId} | Uniform: ${o.uniformId}`)
      console.log(`      Issues: ${o.issues.join(', ')}`)
    })
    if (orphaned.length > 30) {
      console.log(`  ... and ${orphaned.length - 30} more`)
    }
  } else {
    console.log('\n✅ No orphaned vendor inventory records found')
  }
  
  return orphaned
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
  console.log('║     MIGRATION SCRIPT #4 — ORPHANED RELATIONSHIPS AUDIT                       ║')
  console.log('║     READ-ONLY — Lists only, no deletes or updates                            ║')
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝')
  console.log()
  console.log(`Timestamp: ${new Date().toISOString()}`)
  
  const mongoUri = process.env.MONGODB_URI
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI environment variable not set')
    process.exit(1)
  }
  
  try {
    await mongoose.connect(mongoUri)
    console.log('Connected to MongoDB')
    
    const db = mongoose.connection.db
    
    // Run all audits
    const orphanedShipments = await findOrphanedShipments(db)
    const prsWithoutShipments = await findPRsWithoutShipments(db)
    const poMismatches = await findPOStatusMismatches(db)
    const orphanedGRNs = await findOrphanedGRNs(db)
    const orphanedInvoices = await findOrphanedInvoices(db)
    const orphanedProductVendors = await findOrphanedProductVendorLinks(db)
    const orphanedInventory = await findOrphanedVendorInventory(db)
    
    // Summary
    console.log('\n' + '═'.repeat(80))
    console.log('ORPHANED RELATIONSHIPS AUDIT SUMMARY')
    console.log('═'.repeat(80))
    
    const totalIssues = orphanedShipments.length + prsWithoutShipments.length +
                        poMismatches.length + orphanedGRNs.length + orphanedInvoices.length +
                        orphanedProductVendors.length + orphanedInventory.length
    
    console.log(`
┌───────────────────────────────────────┬─────────┐
│ Issue Type                            │ Count   │
├───────────────────────────────────────┼─────────┤
│ Orphaned Shipments (no PR)            │ ${String(orphanedShipments.length).padStart(7)} │
│ PRs claiming shipment (no shipment)   │ ${String(prsWithoutShipments.length).padStart(7)} │
│ PO/PR Status Mismatches               │ ${String(poMismatches.length).padStart(7)} │
│ Orphaned GRNs (no PO)                 │ ${String(orphanedGRNs.length).padStart(7)} │
│ Orphaned Invoices (no GRN)            │ ${String(orphanedInvoices.length).padStart(7)} │
│ Orphaned Product-Vendor Links         │ ${String(orphanedProductVendors.length).padStart(7)} │
│ Orphaned Vendor Inventory             │ ${String(orphanedInventory.length).padStart(7)} │
├───────────────────────────────────────┼─────────┤
│ TOTAL ISSUES                          │ ${String(totalIssues).padStart(7)} │
└───────────────────────────────────────┴─────────┘
`)
    
    if (totalIssues === 0) {
      console.log('✅ No orphaned relationships found - data integrity is good!')
    } else {
      console.log(`⚠️  ${totalIssues} total issues found`)
      console.log('\nReview the details above and decide on cleanup actions.')
      console.log('Run migration-05-optional-cleanup.js to generate cleanup commands (manual confirmation required).')
    }
    
    console.log('\n' + '═'.repeat(80))
    console.log('AUDIT COMPLETE — No modifications were made')
    console.log('═'.repeat(80))
    
  } catch (error) {
    console.error('Migration error:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  }
}

main()
