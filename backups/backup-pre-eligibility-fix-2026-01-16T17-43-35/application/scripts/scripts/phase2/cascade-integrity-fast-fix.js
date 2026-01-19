/**
 * CASCADE INTEGRITY FAST FIX — Consolidated Repair Script
 * 
 * Purpose: Aggressively fix all cascade integrity issues.
 * Assumption: ALL DATA IS TEST DATA — deletions and modifications are acceptable.
 * 
 * Operations:
 * 1. Delete PRs with FULLY_DELIVERED/DELIVERED but no shipment
 * 2. Reset PRs with shipment flags but no shipment to DRAFT
 * 3. Force Order unified_status to match legacy status
 * 4. Delete orphan POs, GRNs, Invoices
 * 5. Fix unified fields to match legacy or defaults
 * 
 * Safety:
 * - DRY_RUN=true (default): Only logs intended operations
 * - DRY_RUN=false: Actually applies changes
 * 
 * Usage:
 *   DRY_RUN=true node scripts/phase2/cascade-integrity-fast-fix.js   # Preview
 *   DRY_RUN=false node scripts/phase2/cascade-integrity-fast-fix.js  # Execute
 * 
 * @version 1.0.0
 * @created 2026-01-16
 */

// =============================================================================
// DRY RUN GATE
// =============================================================================

const DRY_RUN = process.env.DRY_RUN !== 'false'

console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
console.log('║     CASCADE INTEGRITY FAST FIX — CONSOLIDATED REPAIR SCRIPT                  ║')
console.log('║     Aggressive cleanup for test data                                         ║')
console.log('╚══════════════════════════════════════════════════════════════════════════════╝')
console.log()
console.log(`Mode: ${DRY_RUN ? '🔒 DRY RUN (Preview Only — No Changes)' : '⚡ LIVE MODE (Changes Will Be Applied!)'}`)
console.log(`Timestamp: ${new Date().toISOString()}`)
console.log()

if (!DRY_RUN) {
  console.log('⚠️  WARNING: LIVE MODE — All changes will be permanent!')
  console.log('⚠️  This script assumes ALL DATA IS TEST DATA.')
  console.log()
}

// =============================================================================
// DEPENDENCIES
// =============================================================================

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

// Load .env.local
const envLocalPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath })
  console.log('📁 Loaded environment from .env.local')
}

const { MongoClient } = require('mongodb')

// =============================================================================
// STATUS MAPPINGS
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

const LEGACY_TO_UNIFIED_GRN_STATUS = {
  'CREATED': 'RAISED',
  'RAISED': 'RAISED',
  'ACKNOWLEDGED': 'APPROVED',
  'APPROVED': 'APPROVED',
  'INVOICED': 'INVOICED',
  'RECEIVED': 'APPROVED',
  'CLOSED': 'CLOSED',
}

const LEGACY_TO_UNIFIED_INVOICE_STATUS = {
  'RAISED': 'RAISED',
  'APPROVED': 'APPROVED',
}

// =============================================================================
// RESULTS TRACKER
// =============================================================================

const results = {
  prsDeleted: 0,
  prsRepaired: 0,
  ordersRepaired: 0,
  shipmentsRepaired: 0,
  orphanPOsDeleted: 0,
  orphanGRNsDeleted: 0,
  orphanInvoicesDeleted: 0,
  details: {
    deletedPRs: [],
    repairedPRs: [],
    repairedOrders: [],
    repairedShipments: [],
    deletedPOs: [],
    deletedGRNs: [],
    deletedInvoices: [],
  }
}

// =============================================================================
// REPAIR FUNCTIONS
// =============================================================================

/**
 * STEP 1: Delete PRs with FULLY_DELIVERED/DELIVERED status but no shipment
 */
async function deletePRsWithNoShipment(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('STEP 1: DELETE PRs WITH DELIVERED STATUS BUT NO SHIPMENT')
  console.log('═'.repeat(80))
  
  // Get all PR numbers that have shipments
  const shipmentPRNumbers = await db.collection('shipments').distinct('prNumber')
  
  // Find PRs with delivery status but no shipment
  const prsToDelete = await db.collection('orders').find({
    pr_number: { $exists: true, $ne: null, $nin: shipmentPRNumbers },
    $or: [
      { deliveryStatus: 'DELIVERED' },
      { pr_status: 'FULLY_DELIVERED' },
      { status: 'Delivered' },
    ]
  }).toArray()
  
  console.log(`\n  Found ${prsToDelete.length} PRs with DELIVERED status but no shipment record`)
  
  if (prsToDelete.length === 0) {
    console.log('  ✅ No PRs to delete')
    return
  }
  
  for (const pr of prsToDelete) {
    console.log(`  🗑️  ${DRY_RUN ? '[DRY RUN]' : ''} DELETE PR: ${pr.pr_number} (ID: ${pr.id})`)
    console.log(`      status: ${pr.status}, pr_status: ${pr.pr_status}, deliveryStatus: ${pr.deliveryStatus}`)
    
    results.details.deletedPRs.push({
      id: pr.id,
      pr_number: pr.pr_number,
      status: pr.status,
      pr_status: pr.pr_status,
    })
    
    if (!DRY_RUN) {
      await db.collection('orders').deleteOne({ _id: pr._id })
    }
    results.prsDeleted++
  }
  
  console.log(`\n  ${DRY_RUN ? '[DRY RUN] Would delete' : 'Deleted'}: ${results.prsDeleted} PRs`)
}

/**
 * STEP 2: Reset PRs with shipment flags but no shipment to DRAFT
 */
async function resetPRsWithOrphanedShipmentFlags(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('STEP 2: RESET PRs WITH SHIPMENT FLAGS BUT NO SHIPMENT')
  console.log('═'.repeat(80))
  
  const shipmentPRNumbers = await db.collection('shipments').distinct('prNumber')
  
  // Find PRs with dispatch/delivery status but no shipment (and not deleted in step 1)
  const prsToReset = await db.collection('orders').find({
    pr_number: { $exists: true, $ne: null, $nin: shipmentPRNumbers },
    $or: [
      { dispatchStatus: { $exists: true, $nin: [null, '', 'AWAITING_FULFILMENT'] } },
      { deliveryStatus: { $exists: true, $nin: [null, '', 'NOT_DELIVERED'] } },
    ],
    // Exclude already-delivered (those were deleted in step 1)
    status: { $ne: 'Delivered' },
    pr_status: { $ne: 'FULLY_DELIVERED' },
  }).toArray()
  
  console.log(`\n  Found ${prsToReset.length} PRs with orphaned shipment flags`)
  
  if (prsToReset.length === 0) {
    console.log('  ✅ No PRs to reset')
    return
  }
  
  for (const pr of prsToReset) {
    console.log(`  🔄 ${DRY_RUN ? '[DRY RUN]' : ''} RESET PR: ${pr.pr_number} (ID: ${pr.id})`)
    console.log(`      BEFORE: pr_status=${pr.pr_status}, dispatchStatus=${pr.dispatchStatus}, deliveryStatus=${pr.deliveryStatus}`)
    console.log(`      AFTER:  pr_status=DRAFT, dispatchStatus=removed, deliveryStatus=removed`)
    
    results.details.repairedPRs.push({
      id: pr.id,
      pr_number: pr.pr_number,
      before: { pr_status: pr.pr_status, dispatchStatus: pr.dispatchStatus, deliveryStatus: pr.deliveryStatus },
      after: { pr_status: 'DRAFT', dispatchStatus: null, deliveryStatus: null },
    })
    
    if (!DRY_RUN) {
      await db.collection('orders').updateOne(
        { _id: pr._id },
        {
          $set: {
            pr_status: 'DRAFT',
            unified_pr_status: 'DRAFT',
            unified_pr_status_updated_at: new Date(),
            unified_pr_status_updated_by: 'cascade-integrity-fast-fix',
            status: 'Awaiting approval',
            unified_status: 'PENDING_APPROVAL',
            unified_status_updated_at: new Date(),
            unified_status_updated_by: 'cascade-integrity-fast-fix',
          },
          $unset: {
            dispatchStatus: '',
            deliveryStatus: '',
          }
        }
      )
    }
    results.prsRepaired++
  }
  
  console.log(`\n  ${DRY_RUN ? '[DRY RUN] Would reset' : 'Reset'}: ${results.prsRepaired} PRs`)
}

/**
 * STEP 3: Fix inconsistent Orders (force unified_status to match legacy)
 */
async function repairInconsistentOrders(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('STEP 3: REPAIR INCONSISTENT ORDERS')
  console.log('═'.repeat(80))
  
  // Find all orders where unified_status doesn't match expected value from legacy
  const orders = await db.collection('orders').find({
    pr_number: { $exists: false } // Only regular orders, not PRs
  }).toArray()
  
  let repaired = 0
  
  for (const order of orders) {
    const expectedUnified = LEGACY_TO_UNIFIED_ORDER_STATUS[order.status]
    
    if (!expectedUnified) {
      // Unknown legacy status - set both to defaults
      console.log(`  ⚠️  ${DRY_RUN ? '[DRY RUN]' : ''} Order ${order.id}: Unknown status "${order.status}" → Setting to PENDING_APPROVAL`)
      
      results.details.repairedOrders.push({
        id: order.id,
        before: { status: order.status, unified_status: order.unified_status },
        after: { status: 'Awaiting approval', unified_status: 'PENDING_APPROVAL' },
        reason: 'unknown_status',
      })
      
      if (!DRY_RUN) {
        await db.collection('orders').updateOne(
          { _id: order._id },
          {
            $set: {
              status: 'Awaiting approval',
              unified_status: 'PENDING_APPROVAL',
              unified_status_updated_at: new Date(),
              unified_status_updated_by: 'cascade-integrity-fast-fix',
            }
          }
        )
      }
      repaired++
    } else if (order.unified_status !== expectedUnified) {
      // Mismatch - force unified to match
      console.log(`  🔄 ${DRY_RUN ? '[DRY RUN]' : ''} Order ${order.id}: unified_status "${order.unified_status}" → "${expectedUnified}"`)
      
      results.details.repairedOrders.push({
        id: order.id,
        before: { status: order.status, unified_status: order.unified_status },
        after: { status: order.status, unified_status: expectedUnified },
        reason: 'mismatch',
      })
      
      if (!DRY_RUN) {
        await db.collection('orders').updateOne(
          { _id: order._id },
          {
            $set: {
              unified_status: expectedUnified,
              unified_status_updated_at: new Date(),
              unified_status_updated_by: 'cascade-integrity-fast-fix',
            }
          }
        )
      }
      repaired++
    }
  }
  
  // Also fix PRs with status mismatches
  const prs = await db.collection('orders').find({
    pr_number: { $exists: true, $ne: null }
  }).toArray()
  
  for (const pr of prs) {
    const expectedUnifiedPR = LEGACY_TO_UNIFIED_PR_STATUS[pr.pr_status]
    
    if (expectedUnifiedPR && pr.unified_pr_status !== expectedUnifiedPR) {
      console.log(`  🔄 ${DRY_RUN ? '[DRY RUN]' : ''} PR ${pr.pr_number}: unified_pr_status "${pr.unified_pr_status}" → "${expectedUnifiedPR}"`)
      
      results.details.repairedOrders.push({
        id: pr.id,
        pr_number: pr.pr_number,
        before: { pr_status: pr.pr_status, unified_pr_status: pr.unified_pr_status },
        after: { pr_status: pr.pr_status, unified_pr_status: expectedUnifiedPR },
        reason: 'pr_mismatch',
      })
      
      if (!DRY_RUN) {
        await db.collection('orders').updateOne(
          { _id: pr._id },
          {
            $set: {
              unified_pr_status: expectedUnifiedPR,
              unified_pr_status_updated_at: new Date(),
              unified_pr_status_updated_by: 'cascade-integrity-fast-fix',
            }
          }
        )
      }
      repaired++
    }
  }
  
  results.ordersRepaired = repaired
  console.log(`\n  ${DRY_RUN ? '[DRY RUN] Would repair' : 'Repaired'}: ${repaired} orders/PRs`)
}

/**
 * STEP 4: Repair shipments with incorrect status
 */
async function repairInconsistentShipments(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('STEP 4: REPAIR INCONSISTENT SHIPMENTS')
  console.log('═'.repeat(80))
  
  // Find shipments where PR says DELIVERED but shipment says CREATED
  const shipments = await db.collection('shipments').find({}).toArray()
  
  let repaired = 0
  
  for (const shipment of shipments) {
    // Check the associated PR
    const pr = await db.collection('orders').findOne({ pr_number: shipment.prNumber })
    
    if (!pr) {
      console.log(`  ⚠️  ${DRY_RUN ? '[DRY RUN]' : ''} Shipment ${shipment.shipmentId}: Orphaned (PR not found) — Deleting`)
      
      if (!DRY_RUN) {
        await db.collection('shipments').deleteOne({ _id: shipment._id })
      }
      continue
    }
    
    // If PR has DELIVERED status but shipment is CREATED, update shipment
    if ((pr.deliveryStatus === 'DELIVERED' || pr.status === 'Delivered') && 
        shipment.shipmentStatus !== 'DELIVERED' && shipment.shipmentStatus !== 'Delivered') {
      
      console.log(`  🔄 ${DRY_RUN ? '[DRY RUN]' : ''} Shipment ${shipment.shipmentId}: "${shipment.shipmentStatus}" → "DELIVERED"`)
      
      results.details.repairedShipments.push({
        shipmentId: shipment.shipmentId,
        prNumber: shipment.prNumber,
        before: shipment.shipmentStatus,
        after: 'DELIVERED',
      })
      
      if (!DRY_RUN) {
        await db.collection('shipments').updateOne(
          { _id: shipment._id },
          {
            $set: {
              shipmentStatus: 'DELIVERED',
              unified_shipment_status: 'DELIVERED',
              unified_shipment_status_updated_at: new Date(),
              unified_shipment_status_updated_by: 'cascade-integrity-fast-fix',
            }
          }
        )
      }
      repaired++
    }
    
    // If PR has DISPATCHED status but shipment is not IN_TRANSIT
    else if ((pr.dispatchStatus === 'SHIPPED' || pr.status === 'Dispatched') && 
             shipment.shipmentStatus === 'CREATED') {
      
      console.log(`  🔄 ${DRY_RUN ? '[DRY RUN]' : ''} Shipment ${shipment.shipmentId}: "${shipment.shipmentStatus}" → "IN_TRANSIT"`)
      
      results.details.repairedShipments.push({
        shipmentId: shipment.shipmentId,
        prNumber: shipment.prNumber,
        before: shipment.shipmentStatus,
        after: 'IN_TRANSIT',
      })
      
      if (!DRY_RUN) {
        await db.collection('shipments').updateOne(
          { _id: shipment._id },
          {
            $set: {
              shipmentStatus: 'IN_TRANSIT',
              unified_shipment_status: 'IN_TRANSIT',
              unified_shipment_status_updated_at: new Date(),
              unified_shipment_status_updated_by: 'cascade-integrity-fast-fix',
            }
          }
        )
      }
      repaired++
    }
  }
  
  results.shipmentsRepaired = repaired
  console.log(`\n  ${DRY_RUN ? '[DRY RUN] Would repair' : 'Repaired'}: ${repaired} shipments`)
}

/**
 * STEP 5: Delete orphan POs (not linked to valid PRs)
 */
async function deleteOrphanPOs(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('STEP 5: DELETE ORPHAN PURCHASE ORDERS')
  console.log('═'.repeat(80))
  
  const pos = await db.collection('purchaseorders').find({}).toArray()
  let deleted = 0
  
  for (const po of pos) {
    // Check if any PR references this PO
    const linkedPRs = await db.collection('orders').countDocuments({
      pr_number: { $exists: true },
      $or: [
        { po_number: po.client_po_number },
        { po_id: po.id },
      ]
    })
    
    if (linkedPRs === 0) {
      console.log(`  🗑️  ${DRY_RUN ? '[DRY RUN]' : ''} DELETE PO: ${po.client_po_number} (ID: ${po.id}) — No linked PRs`)
      
      results.details.deletedPOs.push({
        id: po.id,
        client_po_number: po.client_po_number,
      })
      
      if (!DRY_RUN) {
        await db.collection('purchaseorders').deleteOne({ _id: po._id })
      }
      deleted++
    } else {
      // Fix unified status if needed
      const expectedUnified = LEGACY_TO_UNIFIED_PO_STATUS[po.po_status]
      if (expectedUnified && po.unified_po_status !== expectedUnified) {
        console.log(`  🔄 ${DRY_RUN ? '[DRY RUN]' : ''} FIX PO: ${po.client_po_number} unified_po_status "${po.unified_po_status}" → "${expectedUnified}"`)
        
        if (!DRY_RUN) {
          await db.collection('purchaseorders').updateOne(
            { _id: po._id },
            {
              $set: {
                unified_po_status: expectedUnified,
                unified_po_status_updated_at: new Date(),
                unified_po_status_updated_by: 'cascade-integrity-fast-fix',
              }
            }
          )
        }
      }
    }
  }
  
  results.orphanPOsDeleted = deleted
  console.log(`\n  ${DRY_RUN ? '[DRY RUN] Would delete' : 'Deleted'}: ${deleted} orphan POs`)
}

/**
 * STEP 6: Delete orphan GRNs (not linked to valid POs)
 */
async function deleteOrphanGRNs(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('STEP 6: DELETE ORPHAN GRNs')
  console.log('═'.repeat(80))
  
  const grns = await db.collection('grns').find({}).toArray()
  const validPONumbers = await db.collection('purchaseorders').distinct('client_po_number')
  const validPOIds = await db.collection('purchaseorders').distinct('id')
  
  let deleted = 0
  
  for (const grn of grns) {
    const isLinked = validPONumbers.includes(grn.poNumber) || validPOIds.includes(grn.po_id)
    
    if (!isLinked) {
      console.log(`  🗑️  ${DRY_RUN ? '[DRY RUN]' : ''} DELETE GRN: ${grn.grnNumber} (ID: ${grn.id}) — No linked PO`)
      
      results.details.deletedGRNs.push({
        id: grn.id,
        grnNumber: grn.grnNumber,
      })
      
      if (!DRY_RUN) {
        await db.collection('grns').deleteOne({ _id: grn._id })
      }
      deleted++
    } else {
      // Fix unified status if needed
      let expectedUnified = LEGACY_TO_UNIFIED_GRN_STATUS[grn.grnStatus] || LEGACY_TO_UNIFIED_GRN_STATUS[grn.status]
      if (expectedUnified && grn.unified_grn_status !== expectedUnified) {
        console.log(`  🔄 ${DRY_RUN ? '[DRY RUN]' : ''} FIX GRN: ${grn.grnNumber} unified_grn_status "${grn.unified_grn_status}" → "${expectedUnified}"`)
        
        if (!DRY_RUN) {
          await db.collection('grns').updateOne(
            { _id: grn._id },
            {
              $set: {
                unified_grn_status: expectedUnified,
                unified_grn_status_updated_at: new Date(),
                unified_grn_status_updated_by: 'cascade-integrity-fast-fix',
              }
            }
          )
        }
      }
    }
  }
  
  results.orphanGRNsDeleted = deleted
  console.log(`\n  ${DRY_RUN ? '[DRY RUN] Would delete' : 'Deleted'}: ${deleted} orphan GRNs`)
}

/**
 * STEP 7: Delete orphan Invoices (not linked to valid GRNs)
 */
async function deleteOrphanInvoices(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('STEP 7: DELETE ORPHAN INVOICES')
  console.log('═'.repeat(80))
  
  const invoices = await db.collection('invoices').find({}).toArray()
  const validGRNNumbers = await db.collection('grns').distinct('grnNumber')
  const validGRNIds = await db.collection('grns').distinct('id')
  
  let deleted = 0
  
  for (const invoice of invoices) {
    const isLinked = validGRNNumbers.includes(invoice.grnNumber) || validGRNIds.includes(invoice.grn_id)
    
    if (!isLinked) {
      console.log(`  🗑️  ${DRY_RUN ? '[DRY RUN]' : ''} DELETE Invoice: ${invoice.invoiceNumber} (ID: ${invoice.id}) — No linked GRN`)
      
      results.details.deletedInvoices.push({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
      })
      
      if (!DRY_RUN) {
        await db.collection('invoices').deleteOne({ _id: invoice._id })
      }
      deleted++
    } else {
      // Fix unified status if needed
      const expectedUnified = LEGACY_TO_UNIFIED_INVOICE_STATUS[invoice.invoiceStatus]
      if (expectedUnified && invoice.unified_invoice_status !== expectedUnified) {
        console.log(`  🔄 ${DRY_RUN ? '[DRY RUN]' : ''} FIX Invoice: ${invoice.invoiceNumber} unified_invoice_status "${invoice.unified_invoice_status}" → "${expectedUnified}"`)
        
        if (!DRY_RUN) {
          await db.collection('invoices').updateOne(
            { _id: invoice._id },
            {
              $set: {
                unified_invoice_status: expectedUnified,
                unified_invoice_status_updated_at: new Date(),
                unified_invoice_status_updated_by: 'cascade-integrity-fast-fix',
              }
            }
          )
        }
      }
    }
  }
  
  results.orphanInvoicesDeleted = deleted
  console.log(`\n  ${DRY_RUN ? '[DRY RUN] Would delete' : 'Deleted'}: ${deleted} orphan Invoices`)
}

/**
 * Generate final summary
 */
function generateSummary() {
  console.log('\n' + '═'.repeat(80))
  console.log(`${DRY_RUN ? 'DRY RUN ' : ''}EXECUTION SUMMARY`)
  console.log('═'.repeat(80))
  
  console.log(`
┌────────────────────────────────────────────────────────────────────────────────┐
│ CASCADE INTEGRITY FAST FIX — ${DRY_RUN ? 'DRY RUN PREVIEW' : 'EXECUTION COMPLETE'}${DRY_RUN ? '              ' : '           '}│
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  DELETIONS:                                                                    │
│    🗑️  PRs Deleted:              ${String(results.prsDeleted).padStart(4)}                                       │
│    🗑️  Orphan POs Deleted:       ${String(results.orphanPOsDeleted).padStart(4)}                                       │
│    🗑️  Orphan GRNs Deleted:      ${String(results.orphanGRNsDeleted).padStart(4)}                                       │
│    🗑️  Orphan Invoices Deleted:  ${String(results.orphanInvoicesDeleted).padStart(4)}                                       │
│                                                                                │
│  REPAIRS:                                                                      │
│    🔄 PRs Reset to DRAFT:        ${String(results.prsRepaired).padStart(4)}                                       │
│    🔄 Orders/PRs Fixed:          ${String(results.ordersRepaired).padStart(4)}                                       │
│    🔄 Shipments Fixed:           ${String(results.shipmentsRepaired).padStart(4)}                                       │
│                                                                                │
│  TOTAL CHANGES:                  ${String(
    results.prsDeleted + results.prsRepaired + results.ordersRepaired + 
    results.shipmentsRepaired + results.orphanPOsDeleted + 
    results.orphanGRNsDeleted + results.orphanInvoicesDeleted
  ).padStart(4)}                                       │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
`)
  
  if (DRY_RUN) {
    console.log('🔒 DRY RUN COMPLETE — NO ACTUAL CHANGES WERE MADE')
    console.log('')
    console.log('To apply these changes, run:')
    console.log('  DRY_RUN=false node scripts/phase2/cascade-integrity-fast-fix.js')
  } else {
    console.log('⚡ LIVE EXECUTION COMPLETE — ALL CHANGES HAVE BEEN APPLIED')
  }
  
  return results
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  const mongoUri = process.env.MONGODB_URI
  if (!mongoUri) {
    console.error('❌ ERROR: MONGODB_URI environment variable not set')
    process.exit(1)
  }
  
  let client
  try {
    client = new MongoClient(mongoUri, {
      retryWrites: !DRY_RUN,
      maxPoolSize: 5,
      appName: 'CascadeIntegrityFastFix',
    })
    
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db()
    
    // Execute all repair steps
    await deletePRsWithNoShipment(db)
    await resetPRsWithOrphanedShipmentFlags(db)
    await repairInconsistentOrders(db)
    await repairInconsistentShipments(db)
    await deleteOrphanPOs(db)
    await deleteOrphanGRNs(db)
    await deleteOrphanInvoices(db)
    
    // Generate summary
    const finalResults = generateSummary()
    
    // Save results to JSON
    const resultsPath = path.resolve(process.cwd(), 'reports', 'cascade-integrity-fast-fix-results.json')
    fs.writeFileSync(resultsPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      mode: DRY_RUN ? 'DRY_RUN' : 'LIVE',
      ...finalResults,
    }, null, 2))
    console.log(`\n📄 Results saved to: ${resultsPath}`)
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    if (client) {
      await client.close()
      console.log('\n🔒 Connection closed')
    }
  }
}

main()
