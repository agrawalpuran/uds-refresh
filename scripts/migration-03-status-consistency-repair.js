/**
 * Migration Script #3 — STATUS CONSISTENCY REPAIR
 * 
 * Purpose: Correct unified_*_status values ONLY when safe to infer from legacy fields.
 * 
 * Rules:
 * - Does NOT change or overwrite existing old fields
 * - Does NOT remove any legacy fields
 * - Does NOT introduce new fields (only populates existing unified_* fields)
 * - Logs all modifications
 * - Skips records where inference is ambiguous
 * 
 * Usage: node scripts/migration-03-status-consistency-repair.js
 * 
 * @version 1.0.0
 * @created 2026-01-15
 */

require('dotenv').config()
const mongoose = require('mongoose')

// =============================================================================
// STATUS MAPPING FUNCTIONS (for safe inference)
// =============================================================================

const LEGACY_TO_UNIFIED_ORDER_STATUS = {
  'Awaiting approval': 'PENDING_APPROVAL',
  'Awaiting fulfilment': 'IN_FULFILMENT',
  'Dispatched': 'DISPATCHED',
  'Delivered': 'DELIVERED',
}

const LEGACY_TO_UNIFIED_PR_STATUS = {
  'DRAFT': 'DRAFT',
  'SUBMITTED': 'PENDING_SITE_ADMIN_APPROVAL',
  'PENDING_SITE_ADMIN_APPROVAL': 'PENDING_SITE_ADMIN_APPROVAL',
  'SITE_ADMIN_APPROVED': 'SITE_ADMIN_APPROVED',
  'PENDING_COMPANY_ADMIN_APPROVAL': 'PENDING_COMPANY_ADMIN_APPROVAL',
  'COMPANY_ADMIN_APPROVED': 'COMPANY_ADMIN_APPROVED',
  'REJECTED_BY_SITE_ADMIN': 'REJECTED',
  'REJECTED_BY_COMPANY_ADMIN': 'REJECTED',
  'PO_CREATED': 'LINKED_TO_PO',
  'FULLY_DELIVERED': 'FULLY_DELIVERED',
}

const LEGACY_TO_UNIFIED_PO_STATUS = {
  'CREATED': 'CREATED',
  'SENT_TO_VENDOR': 'SENT_TO_VENDOR',
  'ACKNOWLEDGED': 'ACKNOWLEDGED',
  'IN_FULFILMENT': 'IN_FULFILMENT',
  'COMPLETED': 'FULLY_DELIVERED',
  'CANCELLED': 'CANCELLED',
}

const LEGACY_TO_UNIFIED_SHIPMENT_STATUS = {
  'CREATED': 'CREATED',
  'IN_TRANSIT': 'IN_TRANSIT',
  'DELIVERED': 'DELIVERED',
  'FAILED': 'FAILED',
}

const LEGACY_TO_UNIFIED_GRN_STATUS = {
  'CREATED': 'RAISED',
  'ACKNOWLEDGED': 'APPROVED',
  'INVOICED': 'INVOICED',
  'RECEIVED': 'APPROVED',
  'CLOSED': 'CLOSED',
}

const LEGACY_TO_UNIFIED_INVOICE_STATUS = {
  'RAISED': 'RAISED',
  'APPROVED': 'APPROVED',
}

// =============================================================================
// REPAIR FUNCTIONS
// =============================================================================

async function repairOrders(db) {
  console.log('\n' + '='.repeat(80))
  console.log('REPAIRING ORDERS (Simple Workflow)')
  console.log('='.repeat(80))
  
  const orders = await db.collection('orders').find({
    pr_number: { $exists: false }, // Regular orders, not PRs
    unified_status: { $exists: false }
  }).toArray()
  
  const results = {
    total: orders.length,
    repaired: 0,
    skipped: 0,
    errors: 0,
    details: [],
  }
  
  for (const order of orders) {
    const legacyStatus = order.status
    const unifiedStatus = LEGACY_TO_UNIFIED_ORDER_STATUS[legacyStatus]
    
    if (!unifiedStatus) {
      // Cannot safely infer - skip
      results.skipped++
      results.details.push({
        id: order.id,
        action: 'SKIPPED',
        reason: `Unknown legacy status: ${legacyStatus}`,
      })
      continue
    }
    
    try {
      await db.collection('orders').updateOne(
        { _id: order._id },
        {
          $set: {
            unified_status: unifiedStatus,
            unified_status_updated_at: new Date(),
            unified_status_updated_by: 'migration-03',
          }
        }
      )
      results.repaired++
      results.details.push({
        id: order.id,
        action: 'REPAIRED',
        legacyStatus,
        newUnifiedStatus: unifiedStatus,
      })
    } catch (error) {
      results.errors++
      results.details.push({
        id: order.id,
        action: 'ERROR',
        error: error.message,
      })
    }
  }
  
  console.log(`Total Orders to repair: ${results.total}`)
  console.log(`Repaired: ${results.repaired}`)
  console.log(`Skipped (ambiguous): ${results.skipped}`)
  console.log(`Errors: ${results.errors}`)
  
  if (results.details.length > 0 && results.details.length <= 50) {
    console.log('\n--- Repair Details ---')
    results.details.forEach(d => {
      if (d.action === 'REPAIRED') {
        console.log(`  ✅ ${d.id}: ${d.legacyStatus} → ${d.newUnifiedStatus}`)
      } else if (d.action === 'SKIPPED') {
        console.log(`  ⏭️  ${d.id}: ${d.reason}`)
      } else {
        console.log(`  ❌ ${d.id}: ${d.error}`)
      }
    })
  }
  
  return results
}

async function repairPRs(db) {
  console.log('\n' + '='.repeat(80))
  console.log('REPAIRING PRs (Purchase Requisitions)')
  console.log('='.repeat(80))
  
  const prs = await db.collection('orders').find({
    pr_number: { $exists: true, $ne: null },
    unified_pr_status: { $exists: false }
  }).toArray()
  
  const results = {
    total: prs.length,
    repaired: 0,
    skipped: 0,
    errors: 0,
    details: [],
  }
  
  for (const pr of prs) {
    const legacyStatus = pr.pr_status
    const unifiedStatus = LEGACY_TO_UNIFIED_PR_STATUS[legacyStatus]
    
    if (!unifiedStatus) {
      // Cannot safely infer - skip
      results.skipped++
      results.details.push({
        id: pr.id,
        prNumber: pr.pr_number,
        action: 'SKIPPED',
        reason: `Unknown legacy status: ${legacyStatus}`,
      })
      continue
    }
    
    try {
      await db.collection('orders').updateOne(
        { _id: pr._id },
        {
          $set: {
            unified_pr_status: unifiedStatus,
            unified_pr_status_updated_at: new Date(),
            unified_pr_status_updated_by: 'migration-03',
          }
        }
      )
      results.repaired++
      results.details.push({
        id: pr.id,
        prNumber: pr.pr_number,
        action: 'REPAIRED',
        legacyStatus,
        newUnifiedStatus: unifiedStatus,
      })
    } catch (error) {
      results.errors++
      results.details.push({
        id: pr.id,
        prNumber: pr.pr_number,
        action: 'ERROR',
        error: error.message,
      })
    }
  }
  
  console.log(`Total PRs to repair: ${results.total}`)
  console.log(`Repaired: ${results.repaired}`)
  console.log(`Skipped (ambiguous): ${results.skipped}`)
  console.log(`Errors: ${results.errors}`)
  
  if (results.details.length > 0 && results.details.length <= 50) {
    console.log('\n--- Repair Details ---')
    results.details.forEach(d => {
      if (d.action === 'REPAIRED') {
        console.log(`  ✅ ${d.id} (PR#${d.prNumber}): ${d.legacyStatus} → ${d.newUnifiedStatus}`)
      } else if (d.action === 'SKIPPED') {
        console.log(`  ⏭️  ${d.id} (PR#${d.prNumber}): ${d.reason}`)
      } else {
        console.log(`  ❌ ${d.id} (PR#${d.prNumber}): ${d.error}`)
      }
    })
  }
  
  return results
}

async function repairPOs(db) {
  console.log('\n' + '='.repeat(80))
  console.log('REPAIRING POs (Purchase Orders)')
  console.log('='.repeat(80))
  
  const pos = await db.collection('purchaseorders').find({
    unified_po_status: { $exists: false }
  }).toArray()
  
  const results = {
    total: pos.length,
    repaired: 0,
    skipped: 0,
    errors: 0,
    details: [],
  }
  
  for (const po of pos) {
    const legacyStatus = po.po_status
    const unifiedStatus = LEGACY_TO_UNIFIED_PO_STATUS[legacyStatus]
    
    if (!unifiedStatus) {
      results.skipped++
      results.details.push({
        id: po.id,
        poNumber: po.client_po_number,
        action: 'SKIPPED',
        reason: `Unknown legacy status: ${legacyStatus}`,
      })
      continue
    }
    
    try {
      await db.collection('purchaseorders').updateOne(
        { _id: po._id },
        {
          $set: {
            unified_po_status: unifiedStatus,
            unified_po_status_updated_at: new Date(),
            unified_po_status_updated_by: 'migration-03',
          }
        }
      )
      results.repaired++
      results.details.push({
        id: po.id,
        poNumber: po.client_po_number,
        action: 'REPAIRED',
        legacyStatus,
        newUnifiedStatus: unifiedStatus,
      })
    } catch (error) {
      results.errors++
      results.details.push({
        id: po.id,
        poNumber: po.client_po_number,
        action: 'ERROR',
        error: error.message,
      })
    }
  }
  
  console.log(`Total POs to repair: ${results.total}`)
  console.log(`Repaired: ${results.repaired}`)
  console.log(`Skipped (ambiguous): ${results.skipped}`)
  console.log(`Errors: ${results.errors}`)
  
  if (results.details.length > 0 && results.details.length <= 50) {
    console.log('\n--- Repair Details ---')
    results.details.forEach(d => {
      if (d.action === 'REPAIRED') {
        console.log(`  ✅ ${d.id} (PO#${d.poNumber}): ${d.legacyStatus} → ${d.newUnifiedStatus}`)
      } else if (d.action === 'SKIPPED') {
        console.log(`  ⏭️  ${d.id} (PO#${d.poNumber}): ${d.reason}`)
      } else {
        console.log(`  ❌ ${d.id} (PO#${d.poNumber}): ${d.error}`)
      }
    })
  }
  
  return results
}

async function repairShipments(db) {
  console.log('\n' + '='.repeat(80))
  console.log('REPAIRING SHIPMENTS')
  console.log('='.repeat(80))
  
  const shipments = await db.collection('shipments').find({
    unified_shipment_status: { $exists: false }
  }).toArray()
  
  const results = {
    total: shipments.length,
    repaired: 0,
    skipped: 0,
    errors: 0,
    details: [],
  }
  
  for (const shipment of shipments) {
    const legacyStatus = shipment.shipmentStatus
    const unifiedStatus = LEGACY_TO_UNIFIED_SHIPMENT_STATUS[legacyStatus]
    
    if (!unifiedStatus) {
      results.skipped++
      results.details.push({
        id: shipment.shipmentId,
        prNumber: shipment.prNumber,
        action: 'SKIPPED',
        reason: `Unknown legacy status: ${legacyStatus}`,
      })
      continue
    }
    
    try {
      await db.collection('shipments').updateOne(
        { _id: shipment._id },
        {
          $set: {
            unified_shipment_status: unifiedStatus,
            unified_shipment_status_updated_at: new Date(),
            unified_shipment_status_updated_by: 'migration-03',
          }
        }
      )
      results.repaired++
      results.details.push({
        id: shipment.shipmentId,
        prNumber: shipment.prNumber,
        action: 'REPAIRED',
        legacyStatus,
        newUnifiedStatus: unifiedStatus,
      })
    } catch (error) {
      results.errors++
      results.details.push({
        id: shipment.shipmentId,
        prNumber: shipment.prNumber,
        action: 'ERROR',
        error: error.message,
      })
    }
  }
  
  console.log(`Total Shipments to repair: ${results.total}`)
  console.log(`Repaired: ${results.repaired}`)
  console.log(`Skipped (ambiguous): ${results.skipped}`)
  console.log(`Errors: ${results.errors}`)
  
  if (results.details.length > 0 && results.details.length <= 50) {
    console.log('\n--- Repair Details ---')
    results.details.forEach(d => {
      if (d.action === 'REPAIRED') {
        console.log(`  ✅ ${d.id} (PR#${d.prNumber}): ${d.legacyStatus} → ${d.newUnifiedStatus}`)
      } else if (d.action === 'SKIPPED') {
        console.log(`  ⏭️  ${d.id} (PR#${d.prNumber}): ${d.reason}`)
      } else {
        console.log(`  ❌ ${d.id} (PR#${d.prNumber}): ${d.error}`)
      }
    })
  }
  
  return results
}

async function repairGRNs(db) {
  console.log('\n' + '='.repeat(80))
  console.log('REPAIRING GRNs (Goods Receipt Notes)')
  console.log('='.repeat(80))
  
  const grns = await db.collection('grns').find({
    unified_grn_status: { $exists: false }
  }).toArray()
  
  const results = {
    total: grns.length,
    repaired: 0,
    skipped: 0,
    errors: 0,
    details: [],
  }
  
  for (const grn of grns) {
    // GRN has two legacy fields - prefer grnStatus if available
    let unifiedStatus
    if (grn.grnStatus === 'APPROVED') {
      unifiedStatus = 'APPROVED'
    } else if (grn.grnStatus === 'RAISED') {
      unifiedStatus = 'RAISED'
    } else {
      unifiedStatus = LEGACY_TO_UNIFIED_GRN_STATUS[grn.status]
    }
    
    if (!unifiedStatus) {
      results.skipped++
      results.details.push({
        id: grn.id,
        grnNumber: grn.grnNumber,
        action: 'SKIPPED',
        reason: `Unknown legacy status: ${grn.status}/${grn.grnStatus}`,
      })
      continue
    }
    
    try {
      await db.collection('grns').updateOne(
        { _id: grn._id },
        {
          $set: {
            unified_grn_status: unifiedStatus,
            unified_grn_status_updated_at: new Date(),
            unified_grn_status_updated_by: 'migration-03',
          }
        }
      )
      results.repaired++
      results.details.push({
        id: grn.id,
        grnNumber: grn.grnNumber,
        action: 'REPAIRED',
        legacyStatus: `${grn.status}/${grn.grnStatus}`,
        newUnifiedStatus: unifiedStatus,
      })
    } catch (error) {
      results.errors++
      results.details.push({
        id: grn.id,
        grnNumber: grn.grnNumber,
        action: 'ERROR',
        error: error.message,
      })
    }
  }
  
  console.log(`Total GRNs to repair: ${results.total}`)
  console.log(`Repaired: ${results.repaired}`)
  console.log(`Skipped (ambiguous): ${results.skipped}`)
  console.log(`Errors: ${results.errors}`)
  
  if (results.details.length > 0 && results.details.length <= 50) {
    console.log('\n--- Repair Details ---')
    results.details.forEach(d => {
      if (d.action === 'REPAIRED') {
        console.log(`  ✅ ${d.id} (GRN#${d.grnNumber}): ${d.legacyStatus} → ${d.newUnifiedStatus}`)
      } else if (d.action === 'SKIPPED') {
        console.log(`  ⏭️  ${d.id} (GRN#${d.grnNumber}): ${d.reason}`)
      } else {
        console.log(`  ❌ ${d.id} (GRN#${d.grnNumber}): ${d.error}`)
      }
    })
  }
  
  return results
}

async function repairInvoices(db) {
  console.log('\n' + '='.repeat(80))
  console.log('REPAIRING INVOICES')
  console.log('='.repeat(80))
  
  const invoices = await db.collection('invoices').find({
    unified_invoice_status: { $exists: false }
  }).toArray()
  
  const results = {
    total: invoices.length,
    repaired: 0,
    skipped: 0,
    errors: 0,
    details: [],
  }
  
  for (const invoice of invoices) {
    const legacyStatus = invoice.invoiceStatus
    const unifiedStatus = LEGACY_TO_UNIFIED_INVOICE_STATUS[legacyStatus]
    
    if (!unifiedStatus) {
      results.skipped++
      results.details.push({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        action: 'SKIPPED',
        reason: `Unknown legacy status: ${legacyStatus}`,
      })
      continue
    }
    
    try {
      await db.collection('invoices').updateOne(
        { _id: invoice._id },
        {
          $set: {
            unified_invoice_status: unifiedStatus,
            unified_invoice_status_updated_at: new Date(),
            unified_invoice_status_updated_by: 'migration-03',
          }
        }
      )
      results.repaired++
      results.details.push({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        action: 'REPAIRED',
        legacyStatus,
        newUnifiedStatus: unifiedStatus,
      })
    } catch (error) {
      results.errors++
      results.details.push({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        action: 'ERROR',
        error: error.message,
      })
    }
  }
  
  console.log(`Total Invoices to repair: ${results.total}`)
  console.log(`Repaired: ${results.repaired}`)
  console.log(`Skipped (ambiguous): ${results.skipped}`)
  console.log(`Errors: ${results.errors}`)
  
  if (results.details.length > 0 && results.details.length <= 50) {
    console.log('\n--- Repair Details ---')
    results.details.forEach(d => {
      if (d.action === 'REPAIRED') {
        console.log(`  ✅ ${d.id} (Invoice#${d.invoiceNumber}): ${d.legacyStatus} → ${d.newUnifiedStatus}`)
      } else if (d.action === 'SKIPPED') {
        console.log(`  ⏭️  ${d.id} (Invoice#${d.invoiceNumber}): ${d.reason}`)
      } else {
        console.log(`  ❌ ${d.id} (Invoice#${d.invoiceNumber}): ${d.error}`)
      }
    })
  }
  
  return results
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
  console.log('║     MIGRATION SCRIPT #3 — STATUS CONSISTENCY REPAIR                          ║')
  console.log('║     Populates unified_*_status fields from legacy status values              ║')
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
    
    // Run all repairs
    const orderResults = await repairOrders(db)
    const prResults = await repairPRs(db)
    const poResults = await repairPOs(db)
    const shipmentResults = await repairShipments(db)
    const grnResults = await repairGRNs(db)
    const invoiceResults = await repairInvoices(db)
    
    // Summary
    console.log('\n' + '═'.repeat(80))
    console.log('REPAIR SUMMARY')
    console.log('═'.repeat(80))
    
    const totalProcessed = orderResults.total + prResults.total + poResults.total +
                           shipmentResults.total + grnResults.total + invoiceResults.total
    const totalRepaired = orderResults.repaired + prResults.repaired + poResults.repaired +
                          shipmentResults.repaired + grnResults.repaired + invoiceResults.repaired
    const totalSkipped = orderResults.skipped + prResults.skipped + poResults.skipped +
                         shipmentResults.skipped + grnResults.skipped + invoiceResults.skipped
    const totalErrors = orderResults.errors + prResults.errors + poResults.errors +
                        shipmentResults.errors + grnResults.errors + invoiceResults.errors
    
    console.log(`
┌─────────────────────┬───────────┬──────────┬─────────┬────────┐
│ Entity              │ Processed │ Repaired │ Skipped │ Errors │
├─────────────────────┼───────────┼──────────┼─────────┼────────┤
│ Orders (non-PR)     │ ${String(orderResults.total).padStart(9)} │ ${String(orderResults.repaired).padStart(8)} │ ${String(orderResults.skipped).padStart(7)} │ ${String(orderResults.errors).padStart(6)} │
│ PRs                 │ ${String(prResults.total).padStart(9)} │ ${String(prResults.repaired).padStart(8)} │ ${String(prResults.skipped).padStart(7)} │ ${String(prResults.errors).padStart(6)} │
│ POs                 │ ${String(poResults.total).padStart(9)} │ ${String(poResults.repaired).padStart(8)} │ ${String(poResults.skipped).padStart(7)} │ ${String(poResults.errors).padStart(6)} │
│ Shipments           │ ${String(shipmentResults.total).padStart(9)} │ ${String(shipmentResults.repaired).padStart(8)} │ ${String(shipmentResults.skipped).padStart(7)} │ ${String(shipmentResults.errors).padStart(6)} │
│ GRNs                │ ${String(grnResults.total).padStart(9)} │ ${String(grnResults.repaired).padStart(8)} │ ${String(grnResults.skipped).padStart(7)} │ ${String(grnResults.errors).padStart(6)} │
│ Invoices            │ ${String(invoiceResults.total).padStart(9)} │ ${String(invoiceResults.repaired).padStart(8)} │ ${String(invoiceResults.skipped).padStart(7)} │ ${String(invoiceResults.errors).padStart(6)} │
├─────────────────────┼───────────┼──────────┼─────────┼────────┤
│ TOTAL               │ ${String(totalProcessed).padStart(9)} │ ${String(totalRepaired).padStart(8)} │ ${String(totalSkipped).padStart(7)} │ ${String(totalErrors).padStart(6)} │
└─────────────────────┴───────────┴──────────┴─────────┴────────┘
`)
    
    console.log(`✅ ${totalRepaired} records repaired`)
    if (totalSkipped > 0) {
      console.log(`⚠️  ${totalSkipped} records skipped (ambiguous legacy status - manual review needed)`)
    }
    if (totalErrors > 0) {
      console.log(`❌ ${totalErrors} errors encountered`)
    }
    
    console.log('\n' + '═'.repeat(80))
    console.log('REPAIR COMPLETE')
    console.log('═'.repeat(80))
    console.log('\nRun migration-02-status-normalization-audit.js to verify results')
    
  } catch (error) {
    console.error('Migration error:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  }
}

main()
