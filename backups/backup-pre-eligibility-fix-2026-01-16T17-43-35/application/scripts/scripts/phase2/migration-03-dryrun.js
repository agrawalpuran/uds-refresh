/**
 * Migration Script #3 — DRY RUN PREVIEW
 * 
 * Purpose: Preview what migration-03 would do WITHOUT making any changes.
 * 
 * Safety:
 * - DRY_RUN mode ONLY - no writes allowed
 * - Uses read-only MongoDB connection
 * - Generates detailed report of planned updates
 * 
 * Usage: DRY_RUN=true node scripts/phase2/migration-03-dryrun.js
 * 
 * @version 1.0.0
 * @created 2026-01-16
 */

// =============================================================================
// DRY RUN GATE - MUST BE FIRST
// =============================================================================

const DRY_RUN = process.env.DRY_RUN === 'true'

console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
console.log('║     MIGRATION SCRIPT #3 — DRY RUN PREVIEW (NO WRITES)                        ║')
console.log('║     Shows what unified status backfill would do                              ║')
console.log('╚══════════════════════════════════════════════════════════════════════════════╝')
console.log()
console.log(`Mode: ${DRY_RUN ? '🔒 DRY RUN (Preview Only)' : '⚠️  BLOCKED (DRY_RUN not set)'}`)
console.log(`Timestamp: ${new Date().toISOString()}`)
console.log()

if (!DRY_RUN) {
  console.error('❌ ERROR: DRY_RUN must be set to "true" to run this preview.')
  console.error('   Set environment variable: DRY_RUN=true')
  console.error('   This is a safety measure.\n')
  process.exit(1)
}

// =============================================================================
// DEPENDENCIES
// =============================================================================

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

// Load .env.local first (Next.js convention), then .env
const envLocalPath = path.resolve(process.cwd(), '.env.local')
const envPath = path.resolve(process.cwd(), '.env')

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath })
  console.log('📁 Loaded environment from .env.local')
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
  console.log('📁 Loaded environment from .env')
}

const { MongoClient } = require('mongodb')

// =============================================================================
// STATUS MAPPINGS (same as migration-03)
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
  'Pending': 'CREATED',
  'Shipped': 'IN_TRANSIT',
  'Delivered': 'DELIVERED',
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
// PREVIEW FUNCTIONS
// =============================================================================

async function previewOrders(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('PREVIEW: ORDERS (Simple Workflow)')
  console.log('═'.repeat(80))
  
  const orders = await db.collection('orders').find({
    pr_number: { $exists: false },
    $or: [
      { unified_status: { $exists: false } },
      { unified_status: null }
    ]
  }).toArray()
  
  const preview = {
    total: orders.length,
    willRepair: 0,
    willSkip: 0,
    details: [],
  }
  
  for (const order of orders) {
    const legacyStatus = order.status
    const unifiedStatus = LEGACY_TO_UNIFIED_ORDER_STATUS[legacyStatus]
    
    if (!unifiedStatus) {
      preview.willSkip++
      preview.details.push({
        id: order.id,
        action: 'WILL_SKIP',
        reason: `Unknown legacy status: "${legacyStatus}"`,
        legacyStatus,
      })
    } else {
      preview.willRepair++
      preview.details.push({
        id: order.id,
        action: 'WILL_REPAIR',
        legacyStatus,
        newUnifiedStatus: unifiedStatus,
      })
    }
  }
  
  console.log(`\n  📊 Records needing update: ${preview.total}`)
  console.log(`  ✅ Will be repaired: ${preview.willRepair}`)
  console.log(`  ⏭️  Will be skipped: ${preview.willSkip}`)
  
  if (preview.details.length > 0) {
    console.log('\n  --- Detailed Preview ---')
    preview.details.forEach(d => {
      if (d.action === 'WILL_REPAIR') {
        console.log(`    ✅ ${d.id}: "${d.legacyStatus}" → "${d.newUnifiedStatus}"`)
      } else {
        console.log(`    ⏭️  ${d.id}: ${d.reason}`)
      }
    })
  }
  
  return preview
}

async function previewPRs(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('PREVIEW: PRs (Purchase Requisitions)')
  console.log('═'.repeat(80))
  
  const prs = await db.collection('orders').find({
    pr_number: { $exists: true, $ne: null },
    $or: [
      { unified_pr_status: { $exists: false } },
      { unified_pr_status: null }
    ]
  }).toArray()
  
  const preview = {
    total: prs.length,
    willRepair: 0,
    willSkip: 0,
    details: [],
    statusDistribution: {},
  }
  
  for (const pr of prs) {
    const legacyStatus = pr.pr_status
    const unifiedStatus = LEGACY_TO_UNIFIED_PR_STATUS[legacyStatus]
    
    // Track status distribution
    preview.statusDistribution[legacyStatus] = (preview.statusDistribution[legacyStatus] || 0) + 1
    
    if (!unifiedStatus) {
      preview.willSkip++
      preview.details.push({
        id: pr.id,
        prNumber: pr.pr_number,
        action: 'WILL_SKIP',
        reason: `Unknown legacy status: "${legacyStatus}"`,
        legacyStatus,
      })
    } else {
      preview.willRepair++
      preview.details.push({
        id: pr.id,
        prNumber: pr.pr_number,
        action: 'WILL_REPAIR',
        legacyStatus,
        newUnifiedStatus: unifiedStatus,
      })
    }
  }
  
  console.log(`\n  📊 Records needing update: ${preview.total}`)
  console.log(`  ✅ Will be repaired: ${preview.willRepair}`)
  console.log(`  ⏭️  Will be skipped: ${preview.willSkip}`)
  
  // Show status distribution
  console.log('\n  --- Status Distribution ---')
  Object.entries(preview.statusDistribution)
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => {
      const unified = LEGACY_TO_UNIFIED_PR_STATUS[status] || '❌ UNKNOWN'
      console.log(`    ${status} (${count}) → ${unified}`)
    })
  
  // Show sample repairs (limit to 20)
  if (preview.details.length > 0) {
    const samplesToShow = Math.min(preview.details.length, 20)
    console.log(`\n  --- Sample Preview (${samplesToShow} of ${preview.details.length}) ---`)
    preview.details.slice(0, samplesToShow).forEach(d => {
      if (d.action === 'WILL_REPAIR') {
        console.log(`    ✅ PR#${d.prNumber}: "${d.legacyStatus}" → "${d.newUnifiedStatus}"`)
      } else {
        console.log(`    ⏭️  PR#${d.prNumber}: ${d.reason}`)
      }
    })
    if (preview.details.length > 20) {
      console.log(`    ... and ${preview.details.length - 20} more`)
    }
  }
  
  return preview
}

async function previewPOs(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('PREVIEW: POs (Purchase Orders)')
  console.log('═'.repeat(80))
  
  const pos = await db.collection('purchaseorders').find({
    $or: [
      { unified_po_status: { $exists: false } },
      { unified_po_status: null }
    ]
  }).toArray()
  
  const preview = {
    total: pos.length,
    willRepair: 0,
    willSkip: 0,
    details: [],
    statusDistribution: {},
  }
  
  for (const po of pos) {
    const legacyStatus = po.po_status
    const unifiedStatus = LEGACY_TO_UNIFIED_PO_STATUS[legacyStatus]
    
    preview.statusDistribution[legacyStatus] = (preview.statusDistribution[legacyStatus] || 0) + 1
    
    if (!unifiedStatus) {
      preview.willSkip++
      preview.details.push({
        id: po.id,
        poNumber: po.client_po_number,
        action: 'WILL_SKIP',
        reason: `Unknown legacy status: "${legacyStatus}"`,
        legacyStatus,
      })
    } else {
      preview.willRepair++
      preview.details.push({
        id: po.id,
        poNumber: po.client_po_number,
        action: 'WILL_REPAIR',
        legacyStatus,
        newUnifiedStatus: unifiedStatus,
      })
    }
  }
  
  console.log(`\n  📊 Records needing update: ${preview.total}`)
  console.log(`  ✅ Will be repaired: ${preview.willRepair}`)
  console.log(`  ⏭️  Will be skipped: ${preview.willSkip}`)
  
  console.log('\n  --- Status Distribution ---')
  Object.entries(preview.statusDistribution)
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => {
      const unified = LEGACY_TO_UNIFIED_PO_STATUS[status] || '❌ UNKNOWN'
      console.log(`    ${status} (${count}) → ${unified}`)
    })
  
  return preview
}

async function previewShipments(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('PREVIEW: SHIPMENTS')
  console.log('═'.repeat(80))
  
  const shipments = await db.collection('shipments').find({
    $or: [
      { unified_shipment_status: { $exists: false } },
      { unified_shipment_status: null }
    ]
  }).toArray()
  
  const preview = {
    total: shipments.length,
    willRepair: 0,
    willSkip: 0,
    details: [],
    statusDistribution: {},
  }
  
  for (const shipment of shipments) {
    const legacyStatus = shipment.shipmentStatus
    const unifiedStatus = LEGACY_TO_UNIFIED_SHIPMENT_STATUS[legacyStatus]
    
    preview.statusDistribution[legacyStatus || 'NULL'] = (preview.statusDistribution[legacyStatus || 'NULL'] || 0) + 1
    
    if (!unifiedStatus) {
      preview.willSkip++
      preview.details.push({
        id: shipment.shipmentId,
        prNumber: shipment.prNumber,
        action: 'WILL_SKIP',
        reason: `Unknown legacy status: "${legacyStatus}"`,
        legacyStatus,
      })
    } else {
      preview.willRepair++
      preview.details.push({
        id: shipment.shipmentId,
        prNumber: shipment.prNumber,
        action: 'WILL_REPAIR',
        legacyStatus,
        newUnifiedStatus: unifiedStatus,
      })
    }
  }
  
  console.log(`\n  📊 Records needing update: ${preview.total}`)
  console.log(`  ✅ Will be repaired: ${preview.willRepair}`)
  console.log(`  ⏭️  Will be skipped: ${preview.willSkip}`)
  
  console.log('\n  --- Status Distribution ---')
  Object.entries(preview.statusDistribution)
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => {
      const unified = LEGACY_TO_UNIFIED_SHIPMENT_STATUS[status] || '❌ UNKNOWN'
      console.log(`    ${status} (${count}) → ${unified}`)
    })
  
  return preview
}

async function previewGRNs(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('PREVIEW: GRNs (Goods Receipt Notes)')
  console.log('═'.repeat(80))
  
  const grns = await db.collection('grns').find({
    $or: [
      { unified_grn_status: { $exists: false } },
      { unified_grn_status: null }
    ]
  }).toArray()
  
  const preview = {
    total: grns.length,
    willRepair: 0,
    willSkip: 0,
    details: [],
    statusDistribution: {},
  }
  
  for (const grn of grns) {
    let unifiedStatus
    if (grn.grnStatus === 'APPROVED') {
      unifiedStatus = 'APPROVED'
    } else if (grn.grnStatus === 'RAISED') {
      unifiedStatus = 'RAISED'
    } else {
      unifiedStatus = LEGACY_TO_UNIFIED_GRN_STATUS[grn.status]
    }
    
    const statusKey = `${grn.status || 'null'}/${grn.grnStatus || 'null'}`
    preview.statusDistribution[statusKey] = (preview.statusDistribution[statusKey] || 0) + 1
    
    if (!unifiedStatus) {
      preview.willSkip++
      preview.details.push({
        id: grn.id,
        grnNumber: grn.grnNumber,
        action: 'WILL_SKIP',
        reason: `Unknown legacy status: ${statusKey}`,
        legacyStatus: statusKey,
      })
    } else {
      preview.willRepair++
      preview.details.push({
        id: grn.id,
        grnNumber: grn.grnNumber,
        action: 'WILL_REPAIR',
        legacyStatus: statusKey,
        newUnifiedStatus: unifiedStatus,
      })
    }
  }
  
  console.log(`\n  📊 Records needing update: ${preview.total}`)
  console.log(`  ✅ Will be repaired: ${preview.willRepair}`)
  console.log(`  ⏭️  Will be skipped: ${preview.willSkip}`)
  
  console.log('\n  --- Status Distribution (status/grnStatus) ---')
  Object.entries(preview.statusDistribution)
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => {
      console.log(`    ${status} (${count})`)
    })
  
  return preview
}

async function previewInvoices(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('PREVIEW: INVOICES')
  console.log('═'.repeat(80))
  
  const invoices = await db.collection('invoices').find({
    $or: [
      { unified_invoice_status: { $exists: false } },
      { unified_invoice_status: null }
    ]
  }).toArray()
  
  const preview = {
    total: invoices.length,
    willRepair: 0,
    willSkip: 0,
    details: [],
    statusDistribution: {},
  }
  
  for (const invoice of invoices) {
    const legacyStatus = invoice.invoiceStatus
    const unifiedStatus = LEGACY_TO_UNIFIED_INVOICE_STATUS[legacyStatus]
    
    preview.statusDistribution[legacyStatus || 'NULL'] = (preview.statusDistribution[legacyStatus || 'NULL'] || 0) + 1
    
    if (!unifiedStatus) {
      preview.willSkip++
      preview.details.push({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        action: 'WILL_SKIP',
        reason: `Unknown legacy status: "${legacyStatus}"`,
        legacyStatus,
      })
    } else {
      preview.willRepair++
      preview.details.push({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        action: 'WILL_REPAIR',
        legacyStatus,
        newUnifiedStatus: unifiedStatus,
      })
    }
  }
  
  console.log(`\n  📊 Records needing update: ${preview.total}`)
  console.log(`  ✅ Will be repaired: ${preview.willRepair}`)
  console.log(`  ⏭️  Will be skipped: ${preview.willSkip}`)
  
  console.log('\n  --- Status Distribution ---')
  Object.entries(preview.statusDistribution)
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => {
      const unified = LEGACY_TO_UNIFIED_INVOICE_STATUS[status] || '❌ UNKNOWN'
      console.log(`    ${status} (${count}) → ${unified}`)
    })
  
  return preview
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
    // Connect with read-only settings
    client = new MongoClient(mongoUri, {
      readPreference: 'secondaryPreferred',
      retryWrites: false,
      maxPoolSize: 2,
      appName: 'Migration03-DryRun',
    })
    
    await client.connect()
    console.log('✅ Connected to MongoDB (Read-Only Mode)\n')
    
    const db = client.db()
    
    // Run all previews
    const orderPreview = await previewOrders(db)
    const prPreview = await previewPRs(db)
    const poPreview = await previewPOs(db)
    const shipmentPreview = await previewShipments(db)
    const grnPreview = await previewGRNs(db)
    const invoicePreview = await previewInvoices(db)
    
    // Summary
    console.log('\n' + '═'.repeat(80))
    console.log('DRY RUN SUMMARY — MIGRATION #3 PREVIEW')
    console.log('═'.repeat(80))
    
    const totalNeedUpdate = orderPreview.total + prPreview.total + poPreview.total +
                           shipmentPreview.total + grnPreview.total + invoicePreview.total
    const totalWillRepair = orderPreview.willRepair + prPreview.willRepair + poPreview.willRepair +
                            shipmentPreview.willRepair + grnPreview.willRepair + invoicePreview.willRepair
    const totalWillSkip = orderPreview.willSkip + prPreview.willSkip + poPreview.willSkip +
                          shipmentPreview.willSkip + grnPreview.willSkip + invoicePreview.willSkip
    
    console.log(`
┌─────────────────────┬─────────────┬─────────────┬─────────────┐
│ Entity              │ Need Update │ Will Repair │ Will Skip   │
├─────────────────────┼─────────────┼─────────────┼─────────────┤
│ Orders (non-PR)     │ ${String(orderPreview.total).padStart(11)} │ ${String(orderPreview.willRepair).padStart(11)} │ ${String(orderPreview.willSkip).padStart(11)} │
│ PRs                 │ ${String(prPreview.total).padStart(11)} │ ${String(prPreview.willRepair).padStart(11)} │ ${String(prPreview.willSkip).padStart(11)} │
│ POs                 │ ${String(poPreview.total).padStart(11)} │ ${String(poPreview.willRepair).padStart(11)} │ ${String(poPreview.willSkip).padStart(11)} │
│ Shipments           │ ${String(shipmentPreview.total).padStart(11)} │ ${String(shipmentPreview.willRepair).padStart(11)} │ ${String(shipmentPreview.willSkip).padStart(11)} │
│ GRNs                │ ${String(grnPreview.total).padStart(11)} │ ${String(grnPreview.willRepair).padStart(11)} │ ${String(grnPreview.willSkip).padStart(11)} │
│ Invoices            │ ${String(invoicePreview.total).padStart(11)} │ ${String(invoicePreview.willRepair).padStart(11)} │ ${String(invoicePreview.willSkip).padStart(11)} │
├─────────────────────┼─────────────┼─────────────┼─────────────┤
│ TOTAL               │ ${String(totalNeedUpdate).padStart(11)} │ ${String(totalWillRepair).padStart(11)} │ ${String(totalWillSkip).padStart(11)} │
└─────────────────────┴─────────────┴─────────────┴─────────────┘
`)
    
    console.log('═'.repeat(80))
    console.log('🔒 DRY RUN COMPLETE — NO CHANGES WERE MADE')
    console.log('═'.repeat(80))
    console.log()
    console.log('To apply these changes, run the actual migration:')
    console.log('  node scripts/migration-03-status-consistency-repair.js')
    console.log()
    
    // Save results to JSON
    const results = {
      timestamp: new Date().toISOString(),
      mode: 'DRY_RUN',
      summary: {
        totalNeedUpdate,
        totalWillRepair,
        totalWillSkip,
      },
      entities: {
        orders: orderPreview,
        prs: prPreview,
        pos: poPreview,
        shipments: shipmentPreview,
        grns: grnPreview,
        invoices: invoicePreview,
      }
    }
    
    const resultsPath = path.resolve(process.cwd(), 'reports', 'migration-03-dryrun-results.json')
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2))
    console.log(`Results saved to: ${resultsPath}`)
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    if (client) {
      await client.close()
      console.log('\n🔒 Connection closed')
    }
  }
}

main()
