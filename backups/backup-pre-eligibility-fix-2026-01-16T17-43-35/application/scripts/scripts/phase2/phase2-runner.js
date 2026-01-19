/**
 * Phase 2 Data Verification Runner
 * 
 * Purpose: Executes all Phase 2 verification queries in read-only mode
 *          and outputs results to JSON files for analysis.
 * 
 * Safety Features:
 * - DRY_RUN gate (required)
 * - Read-only MongoDB connection
 * - All write operations blocked
 * - Results saved to /reports directory
 * 
 * Usage: 
 *   DRY_RUN=true node scripts/phase2/phase2-runner.js
 * 
 * @version 1.0.0
 * @created 2026-01-15
 */

// =============================================================================
// DRY RUN GATE - MUST BE FIRST
// =============================================================================

const DRY_RUN = process.env.DRY_RUN === 'true'

console.log('╔═══════════════════════════════════════════════════════════════════╗')
console.log('║          PHASE 2 — DATA VERIFICATION RUNNER                       ║')
console.log('╠═══════════════════════════════════════════════════════════════════╣')
console.log(`║  Mode: ${DRY_RUN ? '🔒 DRY RUN (Safe - Read Only)' : '⚠️  LIVE MODE (BLOCKED)'}`)
console.log(`║  Time: ${new Date().toISOString()}`)
console.log('╚═══════════════════════════════════════════════════════════════════╝')

if (!DRY_RUN) {
  console.error('\n❌ FATAL: DRY_RUN must be set to "true" to execute Phase 2.')
  console.error('   This is a safety measure to prevent accidental data access.')
  console.error('   Set environment variable: DRY_RUN=true\n')
  process.exit(1)
}

// =============================================================================
// DEPENDENCIES
// =============================================================================

const fs = require('fs')
const path = require('path')

// =============================================================================
// REPORT CONFIGURATION
// =============================================================================

const REPORTS_DIR = path.resolve(process.cwd(), 'reports')
const RESULTS_FILE = path.join(REPORTS_DIR, 'phase2-results.json')

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true })
}

// =============================================================================
// RESULTS STRUCTURE
// =============================================================================

const results = {
  metadata: {
    version: '1.0.0',
    executedAt: new Date().toISOString(),
    mode: 'DRY_RUN',
    status: 'IN_PROGRESS',
  },
  checks: {
    unifiedCoverage: null,
    statusMismatches: null,
    cascadeIntegrity: null,
    orphanRelationships: null,
    objectIdRemnants: null,
    databaseHealth: null,
  },
  summary: {
    totalChecks: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
    overallStatus: 'PENDING',
  },
  errors: [],
}

// =============================================================================
// STATUS MAPPING REFERENCES (for mismatch detection)
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

// =============================================================================
// CHECK 1: UNIFIED COVERAGE
// =============================================================================

async function checkUnifiedCoverage(db) {
  console.log('\n═══════════════════════════════════════════════════════════════════')
  console.log('CHECK 1: UNIFIED STATUS FIELD COVERAGE')
  console.log('═══════════════════════════════════════════════════════════════════')
  
  const coverageResults = {
    orders: { total: 0, withUnified: 0, coverage: 0 },
    prs: { total: 0, withUnified: 0, coverage: 0 },
    purchaseOrders: { total: 0, withUnified: 0, coverage: 0 },
    grns: { total: 0, withUnified: 0, coverage: 0 },
    invoices: { total: 0, withUnified: 0, coverage: 0 },
  }
  
  try {
    // Orders (non-PR)
    console.log('\n  📊 Checking Orders (unified_status)...')
    const orderStats = await db.collection('orders').aggregate([
      { $match: { pr_number: { $exists: false } } },
      { $facet: {
        total: [{ $count: 'count' }],
        withUnified: [{ $match: { unified_status: { $exists: true, $ne: null } } }, { $count: 'count' }]
      }}
    ]).toArray()
    
    coverageResults.orders.total = orderStats[0]?.total?.[0]?.count || 0
    coverageResults.orders.withUnified = orderStats[0]?.withUnified?.[0]?.count || 0
    coverageResults.orders.coverage = coverageResults.orders.total > 0 
      ? ((coverageResults.orders.withUnified / coverageResults.orders.total) * 100).toFixed(2)
      : 100
    console.log(`     Total: ${coverageResults.orders.total}, With Unified: ${coverageResults.orders.withUnified}, Coverage: ${coverageResults.orders.coverage}%`)
    
    // PRs
    console.log('\n  📊 Checking PRs (unified_pr_status)...')
    const prStats = await db.collection('orders').aggregate([
      { $match: { pr_number: { $exists: true, $ne: null } } },
      { $facet: {
        total: [{ $count: 'count' }],
        withUnified: [{ $match: { unified_pr_status: { $exists: true, $ne: null } } }, { $count: 'count' }]
      }}
    ]).toArray()
    
    coverageResults.prs.total = prStats[0]?.total?.[0]?.count || 0
    coverageResults.prs.withUnified = prStats[0]?.withUnified?.[0]?.count || 0
    coverageResults.prs.coverage = coverageResults.prs.total > 0
      ? ((coverageResults.prs.withUnified / coverageResults.prs.total) * 100).toFixed(2)
      : 100
    console.log(`     Total: ${coverageResults.prs.total}, With Unified: ${coverageResults.prs.withUnified}, Coverage: ${coverageResults.prs.coverage}%`)
    
    // Purchase Orders
    console.log('\n  📊 Checking PurchaseOrders (unified_po_status)...')
    const poStats = await db.collection('purchaseorders').aggregate([
      { $facet: {
        total: [{ $count: 'count' }],
        withUnified: [{ $match: { unified_po_status: { $exists: true, $ne: null } } }, { $count: 'count' }]
      }}
    ]).toArray()
    
    coverageResults.purchaseOrders.total = poStats[0]?.total?.[0]?.count || 0
    coverageResults.purchaseOrders.withUnified = poStats[0]?.withUnified?.[0]?.count || 0
    coverageResults.purchaseOrders.coverage = coverageResults.purchaseOrders.total > 0
      ? ((coverageResults.purchaseOrders.withUnified / coverageResults.purchaseOrders.total) * 100).toFixed(2)
      : 100
    console.log(`     Total: ${coverageResults.purchaseOrders.total}, With Unified: ${coverageResults.purchaseOrders.withUnified}, Coverage: ${coverageResults.purchaseOrders.coverage}%`)
    
    // GRNs
    console.log('\n  📊 Checking GRNs (unified_grn_status)...')
    const grnStats = await db.collection('grns').aggregate([
      { $facet: {
        total: [{ $count: 'count' }],
        withUnified: [{ $match: { unified_grn_status: { $exists: true, $ne: null } } }, { $count: 'count' }]
      }}
    ]).toArray()
    
    coverageResults.grns.total = grnStats[0]?.total?.[0]?.count || 0
    coverageResults.grns.withUnified = grnStats[0]?.withUnified?.[0]?.count || 0
    coverageResults.grns.coverage = coverageResults.grns.total > 0
      ? ((coverageResults.grns.withUnified / coverageResults.grns.total) * 100).toFixed(2)
      : 100
    console.log(`     Total: ${coverageResults.grns.total}, With Unified: ${coverageResults.grns.withUnified}, Coverage: ${coverageResults.grns.coverage}%`)
    
    // Invoices
    console.log('\n  📊 Checking Invoices (unified_invoice_status)...')
    const invoiceStats = await db.collection('invoices').aggregate([
      { $facet: {
        total: [{ $count: 'count' }],
        withUnified: [{ $match: { unified_invoice_status: { $exists: true, $ne: null } } }, { $count: 'count' }]
      }}
    ]).toArray()
    
    coverageResults.invoices.total = invoiceStats[0]?.total?.[0]?.count || 0
    coverageResults.invoices.withUnified = invoiceStats[0]?.withUnified?.[0]?.count || 0
    coverageResults.invoices.coverage = coverageResults.invoices.total > 0
      ? ((coverageResults.invoices.withUnified / coverageResults.invoices.total) * 100).toFixed(2)
      : 100
    console.log(`     Total: ${coverageResults.invoices.total}, With Unified: ${coverageResults.invoices.withUnified}, Coverage: ${coverageResults.invoices.coverage}%`)
    
    // Determine pass/fail
    const allCoverageAbove99 = 
      parseFloat(coverageResults.orders.coverage) >= 99.9 &&
      parseFloat(coverageResults.prs.coverage) >= 99.9 &&
      parseFloat(coverageResults.purchaseOrders.coverage) >= 99.9 &&
      parseFloat(coverageResults.grns.coverage) >= 99.9 &&
      parseFloat(coverageResults.invoices.coverage) >= 99.9
    
    coverageResults.status = allCoverageAbove99 ? 'PASS' : 'FAIL'
    coverageResults.passCriteria = '≥ 99.9% coverage for all entities'
    
    console.log(`\n  ${coverageResults.status === 'PASS' ? '✅' : '❌'} Coverage Check: ${coverageResults.status}`)
    
    return coverageResults
    
  } catch (err) {
    console.error('  ❌ Error checking unified coverage:', err.message)
    return { error: err.message, status: 'ERROR' }
  }
}

// =============================================================================
// CHECK 2: STATUS MISMATCHES
// =============================================================================

async function checkStatusMismatches(db) {
  console.log('\n═══════════════════════════════════════════════════════════════════')
  console.log('CHECK 2: STATUS MISMATCHES (Legacy vs Unified)')
  console.log('═══════════════════════════════════════════════════════════════════')
  
  const mismatchResults = {
    orders: { count: 0, samples: [] },
    prs: { count: 0, samples: [] },
    purchaseOrders: { count: 0, samples: [] },
    grns: { count: 0, samples: [] },
    invoices: { count: 0, samples: [] },
  }
  
  try {
    // Order mismatches
    console.log('\n  🔍 Checking Order status mismatches...')
    const orderMismatches = await db.collection('orders').find({
      pr_number: { $exists: false },
      unified_status: { $exists: true, $ne: null },
      $or: [
        { status: 'Awaiting approval', unified_status: { $ne: 'PENDING_APPROVAL' } },
        { status: 'Awaiting fulfilment', unified_status: { $ne: 'IN_FULFILMENT' } },
        { status: 'Dispatched', unified_status: { $ne: 'DISPATCHED' } },
        { status: 'Delivered', unified_status: { $ne: 'DELIVERED' } }
      ]
    }).project({ id: 1, status: 1, unified_status: 1 }).limit(10).toArray()
    
    mismatchResults.orders.count = orderMismatches.length
    mismatchResults.orders.samples = orderMismatches
    console.log(`     Mismatches found: ${mismatchResults.orders.count}`)
    
    // PR mismatches
    console.log('\n  🔍 Checking PR status mismatches...')
    const prMismatches = await db.collection('orders').find({
      pr_number: { $exists: true, $ne: null },
      unified_pr_status: { $exists: true, $ne: null },
      $or: [
        { pr_status: 'REJECTED_BY_SITE_ADMIN', unified_pr_status: { $ne: 'REJECTED' } },
        { pr_status: 'REJECTED_BY_COMPANY_ADMIN', unified_pr_status: { $ne: 'REJECTED' } },
        { pr_status: 'PO_CREATED', unified_pr_status: { $ne: 'LINKED_TO_PO' } }
      ]
    }).project({ id: 1, pr_number: 1, pr_status: 1, unified_pr_status: 1 }).limit(10).toArray()
    
    mismatchResults.prs.count = prMismatches.length
    mismatchResults.prs.samples = prMismatches
    console.log(`     Mismatches found: ${mismatchResults.prs.count}`)
    
    // PO mismatches
    console.log('\n  🔍 Checking PO status mismatches...')
    const poMismatches = await db.collection('purchaseorders').find({
      unified_po_status: { $exists: true, $ne: null },
      $or: [
        { po_status: 'COMPLETED', unified_po_status: { $nin: ['FULLY_DELIVERED', 'CLOSED'] } }
      ]
    }).project({ id: 1, po_status: 1, unified_po_status: 1 }).limit(10).toArray()
    
    mismatchResults.purchaseOrders.count = poMismatches.length
    mismatchResults.purchaseOrders.samples = poMismatches
    console.log(`     Mismatches found: ${mismatchResults.purchaseOrders.count}`)
    
    // GRN mismatches
    console.log('\n  🔍 Checking GRN status mismatches...')
    const grnMismatches = await db.collection('grns').find({
      unified_grn_status: { $exists: true, $ne: null },
      $or: [
        { status: 'CREATED', grnStatus: 'RAISED', unified_grn_status: { $ne: 'RAISED' } },
        { grnStatus: 'APPROVED', unified_grn_status: { $ne: 'APPROVED' } }
      ]
    }).project({ id: 1, status: 1, grnStatus: 1, unified_grn_status: 1 }).limit(10).toArray()
    
    mismatchResults.grns.count = grnMismatches.length
    mismatchResults.grns.samples = grnMismatches
    console.log(`     Mismatches found: ${mismatchResults.grns.count}`)
    
    // Invoice mismatches
    console.log('\n  🔍 Checking Invoice status mismatches...')
    const invoiceMismatches = await db.collection('invoices').find({
      unified_invoice_status: { $exists: true, $ne: null },
      $or: [
        { invoiceStatus: 'RAISED', unified_invoice_status: { $ne: 'RAISED' } },
        { invoiceStatus: 'APPROVED', unified_invoice_status: { $ne: 'APPROVED' } }
      ]
    }).project({ id: 1, invoiceStatus: 1, unified_invoice_status: 1 }).limit(10).toArray()
    
    mismatchResults.invoices.count = invoiceMismatches.length
    mismatchResults.invoices.samples = invoiceMismatches
    console.log(`     Mismatches found: ${mismatchResults.invoices.count}`)
    
    // Determine pass/fail
    const totalMismatches = 
      mismatchResults.orders.count +
      mismatchResults.prs.count +
      mismatchResults.purchaseOrders.count +
      mismatchResults.grns.count +
      mismatchResults.invoices.count
    
    mismatchResults.totalMismatches = totalMismatches
    mismatchResults.status = totalMismatches === 0 ? 'PASS' : 'FAIL'
    mismatchResults.passCriteria = '0 mismatches'
    
    console.log(`\n  ${mismatchResults.status === 'PASS' ? '✅' : '❌'} Mismatch Check: ${mismatchResults.status} (${totalMismatches} total)`)
    
    return mismatchResults
    
  } catch (err) {
    console.error('  ❌ Error checking mismatches:', err.message)
    return { error: err.message, status: 'ERROR' }
  }
}

// =============================================================================
// CHECK 3: CASCADE INTEGRITY
// =============================================================================

async function checkCascadeIntegrity(db) {
  console.log('\n═══════════════════════════════════════════════════════════════════')
  console.log('CHECK 3: CASCADE INTEGRITY')
  console.log('═══════════════════════════════════════════════════════════════════')
  
  const cascadeResults = {
    deliveredNotUnified: { count: 0, samples: [] },
    dispatchIncomplete: { count: 0, samples: [] },
    prDeliveryIncomplete: { count: 0, samples: [] },
    shipmentOrderIncomplete: { count: 0, samples: [] },
  }
  
  try {
    // C1: Delivered but unified != DELIVERED
    console.log('\n  🔗 Checking: Delivered orders with wrong unified_status...')
    const c1 = await db.collection('orders').find({
      status: 'Delivered',
      unified_status: { $exists: true, $nin: ['DELIVERED', null] }
    }).project({ id: 1, status: 1, unified_status: 1 }).limit(10).toArray()
    
    cascadeResults.deliveredNotUnified.count = c1.length
    cascadeResults.deliveredNotUnified.samples = c1
    console.log(`     Found: ${c1.length}`)
    
    // C2: Dispatch incomplete
    console.log('\n  🔗 Checking: Dispatched orders with wrong unified_status...')
    const c2 = await db.collection('orders').find({
      $or: [{ status: 'Dispatched' }, { dispatchStatus: 'SHIPPED' }],
      unified_status: { $exists: true, $nin: ['DISPATCHED', 'DELIVERED', null] }
    }).project({ id: 1, status: 1, dispatchStatus: 1, unified_status: 1 }).limit(10).toArray()
    
    cascadeResults.dispatchIncomplete.count = c2.length
    cascadeResults.dispatchIncomplete.samples = c2
    console.log(`     Found: ${c2.length}`)
    
    // C3: PR delivery incomplete
    console.log('\n  🔗 Checking: PRs with delivery status but wrong unified_pr_status...')
    const c3 = await db.collection('orders').find({
      pr_number: { $exists: true },
      $or: [{ pr_status: 'FULLY_DELIVERED' }, { deliveryStatus: 'DELIVERED' }],
      unified_pr_status: { $exists: true, $nin: ['FULLY_DELIVERED', null] }
    }).project({ id: 1, pr_number: 1, pr_status: 1, deliveryStatus: 1, unified_pr_status: 1 }).limit(10).toArray()
    
    cascadeResults.prDeliveryIncomplete.count = c3.length
    cascadeResults.prDeliveryIncomplete.samples = c3
    console.log(`     Found: ${c3.length}`)
    
    // C4: Shipment → Order cascade
    console.log('\n  🔗 Checking: Delivered shipments with undelivered orders...')
    const c4 = await db.collection('shipments').aggregate([
      { $match: { shipmentStatus: 'Delivered' } },
      { $lookup: {
        from: 'orders',
        localField: 'prNumber',
        foreignField: 'pr_number',
        as: 'order'
      }},
      { $unwind: { path: '$order', preserveNullAndEmptyArrays: false } },
      { $match: { 'order.unified_status': { $nin: ['DELIVERED', null] } } },
      { $project: { shipmentId: 1, prNumber: 1, shipmentStatus: 1, orderUnifiedStatus: '$order.unified_status' } },
      { $limit: 10 }
    ]).toArray()
    
    cascadeResults.shipmentOrderIncomplete.count = c4.length
    cascadeResults.shipmentOrderIncomplete.samples = c4
    console.log(`     Found: ${c4.length}`)
    
    // Determine pass/fail
    const totalIncomplete = 
      cascadeResults.deliveredNotUnified.count +
      cascadeResults.dispatchIncomplete.count +
      cascadeResults.prDeliveryIncomplete.count +
      cascadeResults.shipmentOrderIncomplete.count
    
    cascadeResults.totalIncomplete = totalIncomplete
    cascadeResults.status = totalIncomplete === 0 ? 'PASS' : 'FAIL'
    cascadeResults.passCriteria = '0 incomplete cascades'
    
    console.log(`\n  ${cascadeResults.status === 'PASS' ? '✅' : '❌'} Cascade Check: ${cascadeResults.status} (${totalIncomplete} total)`)
    
    return cascadeResults
    
  } catch (err) {
    console.error('  ❌ Error checking cascades:', err.message)
    return { error: err.message, status: 'ERROR' }
  }
}

// =============================================================================
// CHECK 4: ORPHAN RELATIONSHIPS
// =============================================================================

async function checkOrphanRelationships(db) {
  console.log('\n═══════════════════════════════════════════════════════════════════')
  console.log('CHECK 4: ORPHAN RELATIONSHIPS')
  console.log('═══════════════════════════════════════════════════════════════════')
  
  const orphanResults = {
    orphanedShipments: { count: 0, samples: [] },
    prsWithoutShipments: { count: 0, samples: [] },
    grnsWithoutPOs: { count: 0, samples: [] },
    invoicesWithoutGRNs: { count: 0, samples: [] },
  }
  
  try {
    // O1: Orphaned shipments
    console.log('\n  🔍 Checking: Orphaned shipments...')
    const o1 = await db.collection('shipments').aggregate([
      { $lookup: {
        from: 'orders',
        localField: 'prNumber',
        foreignField: 'pr_number',
        as: 'order'
      }},
      { $match: { order: { $size: 0 } } },
      { $project: { shipmentId: 1, prNumber: 1, vendorId: 1, shipmentStatus: 1 } },
      { $limit: 10 }
    ]).toArray()
    
    orphanResults.orphanedShipments.count = o1.length
    orphanResults.orphanedShipments.samples = o1
    console.log(`     Found: ${o1.length}`)
    
    // O2: PRs claiming shipment but no shipment record
    console.log('\n  🔍 Checking: PRs with shipment status but no shipment...')
    const shipmentPRNumbers = await db.collection('shipments').distinct('prNumber')
    const o2 = await db.collection('orders').find({
      pr_number: { $exists: true, $ne: null, $nin: shipmentPRNumbers },
      $or: [
        { dispatchStatus: 'SHIPPED' },
        { unified_pr_status: 'IN_SHIPMENT' }
      ]
    }).project({ id: 1, pr_number: 1, dispatchStatus: 1, unified_pr_status: 1 }).limit(10).toArray()
    
    orphanResults.prsWithoutShipments.count = o2.length
    orphanResults.prsWithoutShipments.samples = o2
    console.log(`     Found: ${o2.length}`)
    
    // O3: GRNs without POs
    console.log('\n  🔍 Checking: GRNs without matching POs...')
    const poNumbers = await db.collection('purchaseorders').distinct('client_po_number')
    const o3 = await db.collection('grns').find({
      poNumber: { $nin: poNumbers }
    }).project({ id: 1, poNumber: 1, companyId: 1 }).limit(10).toArray()
    
    orphanResults.grnsWithoutPOs.count = o3.length
    orphanResults.grnsWithoutPOs.samples = o3
    console.log(`     Found: ${o3.length}`)
    
    // O4: Invoices without GRNs
    console.log('\n  🔍 Checking: Invoices without matching GRNs...')
    const grnIds = await db.collection('grns').distinct('id')
    const o4 = await db.collection('invoices').find({
      grnId: { $nin: grnIds }
    }).project({ id: 1, grnId: 1, companyId: 1 }).limit(10).toArray()
    
    orphanResults.invoicesWithoutGRNs.count = o4.length
    orphanResults.invoicesWithoutGRNs.samples = o4
    console.log(`     Found: ${o4.length}`)
    
    // Determine pass/fail
    const totalOrphans = 
      orphanResults.orphanedShipments.count +
      orphanResults.prsWithoutShipments.count +
      orphanResults.grnsWithoutPOs.count +
      orphanResults.invoicesWithoutGRNs.count
    
    orphanResults.totalOrphans = totalOrphans
    orphanResults.status = totalOrphans === 0 ? 'PASS' : 'WARN'
    orphanResults.passCriteria = '0 orphaned records'
    
    console.log(`\n  ${orphanResults.status === 'PASS' ? '✅' : '⚠️'} Orphan Check: ${orphanResults.status} (${totalOrphans} total)`)
    
    return orphanResults
    
  } catch (err) {
    console.error('  ❌ Error checking orphans:', err.message)
    return { error: err.message, status: 'ERROR' }
  }
}

// =============================================================================
// CHECK 5: OBJECTID/HEX REMNANTS
// =============================================================================

async function checkObjectIdRemnants(db) {
  console.log('\n═══════════════════════════════════════════════════════════════════')
  console.log('CHECK 5: OBJECTID / HEX STRING REMNANTS')
  console.log('═══════════════════════════════════════════════════════════════════')
  
  const hexPattern = /^[0-9a-fA-F]{24}$/
  
  const remnantResults = {
    checks: [],
    totalRemnants: 0,
  }
  
  const fieldsToCheck = [
    { collection: 'employees', field: 'id' },
    { collection: 'employees', field: 'companyId' },
    { collection: 'orders', field: 'id' },
    { collection: 'orders', field: 'employeeId' },
    { collection: 'orders', field: 'companyId' },
    { collection: 'orders', field: 'vendorId' },
    { collection: 'vendors', field: 'id' },
    { collection: 'productvendors', field: 'productId' },
    { collection: 'productvendors', field: 'vendorId' },
    { collection: 'vendorinventories', field: 'vendorId' },
    { collection: 'vendorinventories', field: 'productId' },
    { collection: 'shipments', field: 'id' },
    { collection: 'shipments', field: 'vendorId' },
  ]
  
  try {
    for (const { collection, field } of fieldsToCheck) {
      console.log(`\n  🔍 Checking ${collection}.${field}...`)
      
      const query = {}
      query[field] = { $regex: hexPattern }
      
      const count = await db.collection(collection).countDocuments(query)
      
      remnantResults.checks.push({
        collection,
        field,
        hexStringCount: count,
        status: count === 0 ? 'PASS' : 'FAIL'
      })
      
      remnantResults.totalRemnants += count
      console.log(`     Hex strings found: ${count}`)
    }
    
    remnantResults.status = remnantResults.totalRemnants === 0 ? 'PASS' : 'FAIL'
    remnantResults.passCriteria = '0 hex string remnants'
    
    console.log(`\n  ${remnantResults.status === 'PASS' ? '✅' : '❌'} ObjectId/Hex Check: ${remnantResults.status} (${remnantResults.totalRemnants} total)`)
    
    return remnantResults
    
  } catch (err) {
    console.error('  ❌ Error checking ObjectId remnants:', err.message)
    return { error: err.message, status: 'ERROR' }
  }
}

// =============================================================================
// CHECK 6: DATABASE HEALTH
// =============================================================================

async function checkDatabaseHealth(db) {
  console.log('\n═══════════════════════════════════════════════════════════════════')
  console.log('CHECK 6: DATABASE HEALTH')
  console.log('═══════════════════════════════════════════════════════════════════')
  
  const healthResults = {
    connectionStatus: null,
    collections: [],
    indexStats: [],
  }
  
  try {
    // Connection status
    console.log('\n  📊 Checking connection status...')
    const adminDb = db.admin()
    const pingResult = await adminDb.ping()
    healthResults.connectionStatus = { ping: pingResult, status: 'HEALTHY' }
    console.log('     Connection: HEALTHY')
    
    // Collection counts
    console.log('\n  📊 Checking collection counts...')
    const collections = ['orders', 'purchaseorders', 'grns', 'invoices', 'shipments', 'employees', 'vendors']
    
    for (const collName of collections) {
      const count = await db.collection(collName).estimatedDocumentCount()
      healthResults.collections.push({ name: collName, count })
      console.log(`     ${collName}: ${count} documents`)
    }
    
    healthResults.status = 'PASS'
    healthResults.passCriteria = 'Database responding and collections accessible'
    
    console.log(`\n  ✅ Database Health: PASS`)
    
    return healthResults
    
  } catch (err) {
    console.error('  ❌ Error checking database health:', err.message)
    return { error: err.message, status: 'ERROR' }
  }
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  let db = null
  
  try {
    // Load bootstrap module
    const { getReadOnlyDb, closeConnection } = require('./mongo-bootstrap')
    
    // Connect to database
    db = await getReadOnlyDb()
    
    // Run all checks
    results.checks.unifiedCoverage = await checkUnifiedCoverage(db)
    results.checks.statusMismatches = await checkStatusMismatches(db)
    results.checks.cascadeIntegrity = await checkCascadeIntegrity(db)
    results.checks.orphanRelationships = await checkOrphanRelationships(db)
    results.checks.objectIdRemnants = await checkObjectIdRemnants(db)
    results.checks.databaseHealth = await checkDatabaseHealth(db)
    
    // Calculate summary
    const checkStatuses = Object.values(results.checks).map(c => c?.status)
    results.summary.totalChecks = checkStatuses.length
    results.summary.passed = checkStatuses.filter(s => s === 'PASS').length
    results.summary.failed = checkStatuses.filter(s => s === 'FAIL').length
    results.summary.warnings = checkStatuses.filter(s => s === 'WARN').length
    results.summary.overallStatus = results.summary.failed === 0 ? 'PASS' : 'FAIL'
    
    results.metadata.status = 'COMPLETED'
    results.metadata.completedAt = new Date().toISOString()
    
    // Close connection
    await closeConnection()
    
  } catch (err) {
    results.metadata.status = 'ERROR'
    results.errors.push({ message: err.message, stack: err.stack })
    console.error('\n❌ Fatal error:', err.message)
  }
  
  // Save results
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2))
  
  // Print summary
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗')
  console.log('║                    PHASE 2 VERIFICATION SUMMARY                   ║')
  console.log('╠═══════════════════════════════════════════════════════════════════╣')
  console.log(`║  Total Checks: ${results.summary.totalChecks}`)
  console.log(`║  ✅ Passed: ${results.summary.passed}`)
  console.log(`║  ❌ Failed: ${results.summary.failed}`)
  console.log(`║  ⚠️  Warnings: ${results.summary.warnings}`)
  console.log(`║`)
  console.log(`║  Overall: ${results.summary.overallStatus === 'PASS' ? '✅ READY FOR PHASE 3' : '❌ ISSUES FOUND - REVIEW REQUIRED'}`)
  console.log(`║`)
  console.log(`║  Results saved to: ${RESULTS_FILE}`)
  console.log('╚═══════════════════════════════════════════════════════════════════╝')
  
  process.exit(results.summary.failed > 0 ? 1 : 0)
}

// Run main
main()
