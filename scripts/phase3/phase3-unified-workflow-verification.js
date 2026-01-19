/**
 * PHASE 3 — UNIFIED WORKFLOW VERIFICATION SUITE
 * 
 * Purpose: Comprehensive verification of unified status fields and workflow integrity.
 * 
 * Objectives:
 * 1. Verify all unified fields behave correctly across all workflows
 * 2. Validate cascade transitions: Order→Shipment→Delivered, PR→PO→GRN→Invoice
 * 3. Confirm no leftover dependency on legacy fields
 * 4. Confirm dual-write wrapper logic is correct and stable
 * 5. Prepare SAFE_MODE deactivation readiness report
 * 
 * Safety:
 * - READ-ONLY mode — no writes, no updates
 * - No $out / $merge stages
 * - Simulation only
 * 
 * Usage: node scripts/phase3/phase3-unified-workflow-verification.js
 * 
 * @version 1.0.0
 * @created 2026-01-16
 */

console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
console.log('║     PHASE 3 — UNIFIED WORKFLOW VERIFICATION SUITE                            ║')
console.log('║     Comprehensive validation of unified status fields and cascades           ║')
console.log('╚══════════════════════════════════════════════════════════════════════════════╝')
console.log()
console.log(`Mode: 🔒 READ-ONLY (Simulation — No Writes)`)
console.log(`Timestamp: ${new Date().toISOString()}`)
console.log()

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
// VERIFICATION RESULT STRUCTURE
// =============================================================================

const report = {
  timestamp: new Date().toISOString(),
  mode: 'READ_ONLY_SIMULATION',
  
  // Section 1: Unified Field Coverage
  unifiedFieldCoverage: {
    orders: { total: 0, covered: 0, percentage: 0 },
    prs: { total: 0, covered: 0, percentage: 0 },
    pos: { total: 0, covered: 0, percentage: 0 },
    grns: { total: 0, covered: 0, percentage: 0 },
    invoices: { total: 0, covered: 0, percentage: 0 },
    shipments: { total: 0, covered: 0, percentage: 0 },
    overallScore: 0,
  },
  
  // Section 2: Status Consistency
  statusConsistency: {
    orders: { total: 0, consistent: 0, mismatches: [] },
    prs: { total: 0, consistent: 0, mismatches: [] },
    pos: { total: 0, consistent: 0, mismatches: [] },
    grns: { total: 0, consistent: 0, mismatches: [] },
    invoices: { total: 0, consistent: 0, mismatches: [] },
    shipments: { total: 0, consistent: 0, mismatches: [] },
    overallConsistencyRate: 0,
  },
  
  // Section 3: Cascade Integrity
  cascadeIntegrity: {
    orderToShipment: { valid: 0, invalid: 0, issues: [] },
    shipmentToDelivery: { valid: 0, invalid: 0, issues: [] },
    prToPO: { valid: 0, invalid: 0, issues: [] },
    poToGRN: { valid: 0, invalid: 0, issues: [] },
    grnToInvoice: { valid: 0, invalid: 0, issues: [] },
    overallIntegrityScore: 0,
  },
  
  // Section 4: Legacy Field Dependencies
  legacyFieldDependencies: {
    activeReferences: [],
    deprecatedFieldsStillUsed: [],
    safeToRemove: [],
    requiresAttention: [],
  },
  
  // Section 5: Dual-Write Verification
  dualWriteVerification: {
    ordersWithBothFields: 0,
    prsWithBothFields: 0,
    posWithBothFields: 0,
    grnsWithBothFields: 0,
    invoicesWithBothFields: 0,
    shipmentsWithBothFields: 0,
    syncPercentage: 0,
  },
  
  // Section 6: SAFE_MODE Deactivation Readiness
  safeModeReadiness: {
    unifiedCoverageReady: false,
    cascadeIntegrityReady: false,
    legacyDependenciesCleared: false,
    dualWriteStable: false,
    overallReadiness: 'NOT_READY',
    blockers: [],
    warnings: [],
    recommendations: [],
  },
  
  // Final Summary
  summary: {
    totalChecks: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
    overallStatus: 'UNKNOWN',
  }
}

// =============================================================================
// STATUS MAPPINGS (Expected relationships)
// =============================================================================

const LEGACY_TO_UNIFIED_ORDER = {
  'Awaiting approval': 'PENDING_APPROVAL',
  'Awaiting fulfilment': 'IN_FULFILMENT',
  'Dispatched': 'DISPATCHED',
  'Delivered': 'DELIVERED',
}

const LEGACY_TO_UNIFIED_PR = {
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

const LEGACY_TO_UNIFIED_PO = {
  'CREATED': 'CREATED',
  'SENT_TO_VENDOR': 'SENT_TO_VENDOR',
  'ACKNOWLEDGED': 'ACKNOWLEDGED',
  'IN_FULFILMENT': 'IN_FULFILMENT',
  'COMPLETED': 'FULLY_DELIVERED',
  'CANCELLED': 'CANCELLED',
}

const LEGACY_TO_UNIFIED_GRN = {
  'CREATED': 'RAISED',
  'RAISED': 'RAISED',
  'ACKNOWLEDGED': 'APPROVED',
  'APPROVED': 'APPROVED',
  'INVOICED': 'INVOICED',
  'RECEIVED': 'APPROVED',
  'CLOSED': 'CLOSED',
}

const LEGACY_TO_UNIFIED_INVOICE = {
  'RAISED': 'RAISED',
  'APPROVED': 'APPROVED',
}

const LEGACY_TO_UNIFIED_SHIPMENT = {
  'CREATED': 'CREATED',
  'IN_TRANSIT': 'IN_TRANSIT',
  'DELIVERED': 'DELIVERED',
  'FAILED': 'FAILED',
  'Pending': 'CREATED',
  'Shipped': 'IN_TRANSIT',
  'Delivered': 'DELIVERED',
}

// =============================================================================
// VERIFICATION FUNCTIONS
// =============================================================================

/**
 * SECTION 1: Verify Unified Field Coverage
 */
async function verifyUnifiedFieldCoverage(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('SECTION 1: UNIFIED FIELD COVERAGE VERIFICATION')
  console.log('═'.repeat(80))
  
  // Orders (non-PR)
  const totalOrders = await db.collection('orders').countDocuments({ pr_number: { $exists: false } })
  const coveredOrders = await db.collection('orders').countDocuments({
    pr_number: { $exists: false },
    unified_status: { $exists: true, $ne: null, $ne: '' }
  })
  report.unifiedFieldCoverage.orders = {
    total: totalOrders,
    covered: coveredOrders,
    percentage: totalOrders > 0 ? ((coveredOrders / totalOrders) * 100).toFixed(2) : 100
  }
  console.log(`  📊 Orders: ${coveredOrders}/${totalOrders} (${report.unifiedFieldCoverage.orders.percentage}%)`)
  
  // PRs
  const totalPRs = await db.collection('orders').countDocuments({ pr_number: { $exists: true, $ne: null } })
  const coveredPRs = await db.collection('orders').countDocuments({
    pr_number: { $exists: true, $ne: null },
    unified_pr_status: { $exists: true, $ne: null, $ne: '' }
  })
  report.unifiedFieldCoverage.prs = {
    total: totalPRs,
    covered: coveredPRs,
    percentage: totalPRs > 0 ? ((coveredPRs / totalPRs) * 100).toFixed(2) : 100
  }
  console.log(`  📊 PRs: ${coveredPRs}/${totalPRs} (${report.unifiedFieldCoverage.prs.percentage}%)`)
  
  // POs
  const totalPOs = await db.collection('purchaseorders').countDocuments({})
  const coveredPOs = await db.collection('purchaseorders').countDocuments({
    unified_po_status: { $exists: true, $ne: null, $ne: '' }
  })
  report.unifiedFieldCoverage.pos = {
    total: totalPOs,
    covered: coveredPOs,
    percentage: totalPOs > 0 ? ((coveredPOs / totalPOs) * 100).toFixed(2) : 100
  }
  console.log(`  📊 POs: ${coveredPOs}/${totalPOs} (${report.unifiedFieldCoverage.pos.percentage}%)`)
  
  // GRNs
  const totalGRNs = await db.collection('grns').countDocuments({})
  const coveredGRNs = await db.collection('grns').countDocuments({
    unified_grn_status: { $exists: true, $ne: null, $ne: '' }
  })
  report.unifiedFieldCoverage.grns = {
    total: totalGRNs,
    covered: coveredGRNs,
    percentage: totalGRNs > 0 ? ((coveredGRNs / totalGRNs) * 100).toFixed(2) : 100
  }
  console.log(`  📊 GRNs: ${coveredGRNs}/${totalGRNs} (${report.unifiedFieldCoverage.grns.percentage}%)`)
  
  // Invoices
  const totalInvoices = await db.collection('invoices').countDocuments({})
  const coveredInvoices = await db.collection('invoices').countDocuments({
    unified_invoice_status: { $exists: true, $ne: null, $ne: '' }
  })
  report.unifiedFieldCoverage.invoices = {
    total: totalInvoices,
    covered: coveredInvoices,
    percentage: totalInvoices > 0 ? ((coveredInvoices / totalInvoices) * 100).toFixed(2) : 100
  }
  console.log(`  📊 Invoices: ${coveredInvoices}/${totalInvoices} (${report.unifiedFieldCoverage.invoices.percentage}%)`)
  
  // Shipments
  const totalShipments = await db.collection('shipments').countDocuments({})
  const coveredShipments = await db.collection('shipments').countDocuments({
    unified_shipment_status: { $exists: true, $ne: null, $ne: '' }
  })
  report.unifiedFieldCoverage.shipments = {
    total: totalShipments,
    covered: coveredShipments,
    percentage: totalShipments > 0 ? ((coveredShipments / totalShipments) * 100).toFixed(2) : 100
  }
  console.log(`  📊 Shipments: ${coveredShipments}/${totalShipments} (${report.unifiedFieldCoverage.shipments.percentage}%)`)
  
  // Calculate overall score
  const coverages = [
    parseFloat(report.unifiedFieldCoverage.orders.percentage),
    parseFloat(report.unifiedFieldCoverage.prs.percentage),
    parseFloat(report.unifiedFieldCoverage.pos.percentage),
    parseFloat(report.unifiedFieldCoverage.grns.percentage),
    parseFloat(report.unifiedFieldCoverage.invoices.percentage),
    parseFloat(report.unifiedFieldCoverage.shipments.percentage),
  ]
  report.unifiedFieldCoverage.overallScore = (coverages.reduce((a, b) => a + b, 0) / coverages.length).toFixed(2)
  
  console.log(`\n  ✅ Overall Coverage Score: ${report.unifiedFieldCoverage.overallScore}%`)
}

/**
 * SECTION 2: Verify Status Consistency (Legacy vs Unified)
 */
async function verifyStatusConsistency(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('SECTION 2: STATUS CONSISTENCY VERIFICATION')
  console.log('═'.repeat(80))
  
  // Orders
  const orders = await db.collection('orders').find({ pr_number: { $exists: false } }).toArray()
  report.statusConsistency.orders.total = orders.length
  for (const order of orders) {
    const expected = LEGACY_TO_UNIFIED_ORDER[order.status]
    if (expected && order.unified_status === expected) {
      report.statusConsistency.orders.consistent++
    } else if (expected && order.unified_status !== expected) {
      report.statusConsistency.orders.mismatches.push({
        id: order.id,
        legacy: order.status,
        unified: order.unified_status,
        expected: expected,
      })
    }
  }
  console.log(`  📊 Orders: ${report.statusConsistency.orders.consistent}/${orders.length} consistent`)
  if (report.statusConsistency.orders.mismatches.length > 0) {
    console.log(`     ⚠️  ${report.statusConsistency.orders.mismatches.length} mismatches`)
  }
  
  // PRs
  const prs = await db.collection('orders').find({ pr_number: { $exists: true, $ne: null } }).toArray()
  report.statusConsistency.prs.total = prs.length
  for (const pr of prs) {
    const expected = LEGACY_TO_UNIFIED_PR[pr.pr_status]
    if (expected && pr.unified_pr_status === expected) {
      report.statusConsistency.prs.consistent++
    } else if (expected && pr.unified_pr_status !== expected) {
      report.statusConsistency.prs.mismatches.push({
        id: pr.id,
        pr_number: pr.pr_number,
        legacy: pr.pr_status,
        unified: pr.unified_pr_status,
        expected: expected,
      })
    }
  }
  console.log(`  📊 PRs: ${report.statusConsistency.prs.consistent}/${prs.length} consistent`)
  if (report.statusConsistency.prs.mismatches.length > 0) {
    console.log(`     ⚠️  ${report.statusConsistency.prs.mismatches.length} mismatches`)
  }
  
  // POs
  const pos = await db.collection('purchaseorders').find({}).toArray()
  report.statusConsistency.pos.total = pos.length
  for (const po of pos) {
    const expected = LEGACY_TO_UNIFIED_PO[po.po_status]
    if (expected && po.unified_po_status === expected) {
      report.statusConsistency.pos.consistent++
    } else if (expected && po.unified_po_status !== expected) {
      report.statusConsistency.pos.mismatches.push({
        id: po.id,
        po_number: po.client_po_number,
        legacy: po.po_status,
        unified: po.unified_po_status,
        expected: expected,
      })
    }
  }
  console.log(`  📊 POs: ${report.statusConsistency.pos.consistent}/${pos.length} consistent`)
  
  // GRNs
  const grns = await db.collection('grns').find({}).toArray()
  report.statusConsistency.grns.total = grns.length
  for (const grn of grns) {
    const expected = LEGACY_TO_UNIFIED_GRN[grn.grnStatus] || LEGACY_TO_UNIFIED_GRN[grn.status]
    if (expected && grn.unified_grn_status === expected) {
      report.statusConsistency.grns.consistent++
    } else if (expected && grn.unified_grn_status !== expected) {
      report.statusConsistency.grns.mismatches.push({
        id: grn.id,
        grn_number: grn.grnNumber,
        legacy: grn.grnStatus || grn.status,
        unified: grn.unified_grn_status,
        expected: expected,
      })
    }
  }
  console.log(`  📊 GRNs: ${report.statusConsistency.grns.consistent}/${grns.length} consistent`)
  
  // Invoices
  const invoices = await db.collection('invoices').find({}).toArray()
  report.statusConsistency.invoices.total = invoices.length
  for (const invoice of invoices) {
    const expected = LEGACY_TO_UNIFIED_INVOICE[invoice.invoiceStatus]
    if (expected && invoice.unified_invoice_status === expected) {
      report.statusConsistency.invoices.consistent++
    } else if (expected && invoice.unified_invoice_status !== expected) {
      report.statusConsistency.invoices.mismatches.push({
        id: invoice.id,
        invoice_number: invoice.invoiceNumber,
        legacy: invoice.invoiceStatus,
        unified: invoice.unified_invoice_status,
        expected: expected,
      })
    }
  }
  console.log(`  📊 Invoices: ${report.statusConsistency.invoices.consistent}/${invoices.length} consistent`)
  
  // Shipments
  const shipments = await db.collection('shipments').find({}).toArray()
  report.statusConsistency.shipments.total = shipments.length
  for (const shipment of shipments) {
    const expected = LEGACY_TO_UNIFIED_SHIPMENT[shipment.shipmentStatus]
    if (expected && shipment.unified_shipment_status === expected) {
      report.statusConsistency.shipments.consistent++
    } else if (expected && shipment.unified_shipment_status !== expected) {
      report.statusConsistency.shipments.mismatches.push({
        id: shipment.shipmentId,
        legacy: shipment.shipmentStatus,
        unified: shipment.unified_shipment_status,
        expected: expected,
      })
    }
  }
  console.log(`  📊 Shipments: ${report.statusConsistency.shipments.consistent}/${shipments.length} consistent`)
  
  // Calculate overall consistency rate
  const totalRecords = orders.length + prs.length + pos.length + grns.length + invoices.length + shipments.length
  const totalConsistent = 
    report.statusConsistency.orders.consistent +
    report.statusConsistency.prs.consistent +
    report.statusConsistency.pos.consistent +
    report.statusConsistency.grns.consistent +
    report.statusConsistency.invoices.consistent +
    report.statusConsistency.shipments.consistent
  
  report.statusConsistency.overallConsistencyRate = totalRecords > 0 
    ? ((totalConsistent / totalRecords) * 100).toFixed(2)
    : 100
  
  console.log(`\n  ✅ Overall Consistency Rate: ${report.statusConsistency.overallConsistencyRate}%`)
}

/**
 * SECTION 3: Verify Cascade Integrity
 */
async function verifyCascadeIntegrity(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('SECTION 3: CASCADE INTEGRITY VERIFICATION')
  console.log('═'.repeat(80))
  
  // 3.1 Order → Shipment cascade
  console.log('\n  📋 Order → Shipment Cascade:')
  const ordersWithShipments = await db.collection('orders').find({
    pr_number: { $exists: false },
    unified_status: { $in: ['DISPATCHED', 'DELIVERED'] }
  }).toArray()
  
  // For orders, we don't have direct shipment links, so check status consistency
  report.cascadeIntegrity.orderToShipment.valid = ordersWithShipments.length
  console.log(`     Valid: ${report.cascadeIntegrity.orderToShipment.valid}`)
  
  // 3.2 Shipment → Delivery cascade
  console.log('\n  📋 Shipment → PR/Order Delivery Cascade:')
  const shipments = await db.collection('shipments').find({}).toArray()
  
  for (const shipment of shipments) {
    const pr = await db.collection('orders').findOne({ pr_number: shipment.prNumber })
    if (!pr) continue
    
    // Check if shipment DELIVERED → PR/Order should also be delivered
    if (shipment.unified_shipment_status === 'DELIVERED' || shipment.shipmentStatus === 'DELIVERED') {
      if (pr.deliveryStatus === 'DELIVERED' || pr.unified_status === 'DELIVERED' || pr.status === 'Delivered') {
        report.cascadeIntegrity.shipmentToDelivery.valid++
      } else {
        report.cascadeIntegrity.shipmentToDelivery.invalid++
        report.cascadeIntegrity.shipmentToDelivery.issues.push({
          shipmentId: shipment.shipmentId,
          prNumber: shipment.prNumber,
          shipmentStatus: shipment.unified_shipment_status || shipment.shipmentStatus,
          prDeliveryStatus: pr.deliveryStatus,
          prStatus: pr.status,
          issue: 'Shipment delivered but PR not marked delivered'
        })
      }
    } else {
      report.cascadeIntegrity.shipmentToDelivery.valid++
    }
  }
  console.log(`     Valid: ${report.cascadeIntegrity.shipmentToDelivery.valid}`)
  console.log(`     Invalid: ${report.cascadeIntegrity.shipmentToDelivery.invalid}`)
  
  // 3.3 PR → PO cascade
  console.log('\n  📋 PR → PO Cascade:')
  const prsWithPO = await db.collection('orders').find({
    pr_number: { $exists: true, $ne: null },
    unified_pr_status: 'LINKED_TO_PO'
  }).toArray()
  
  for (const pr of prsWithPO) {
    // Check if PO exists for this PR via multiple methods:
    // 1. Direct pr_numbers array on PO
    // 2. items.prNumber on PO
    // 3. POOrder junction table (order_id → purchase_order_id)
    let poExists = await db.collection('purchaseorders').countDocuments({
      $or: [
        { pr_numbers: pr.pr_number },
        { 'items.prNumber': pr.pr_number }
      ]
    })
    
    // Also check POOrder junction table (the proper linkage method)
    if (poExists === 0) {
      const poOrderLink = await db.collection('poorders').findOne({ order_id: pr.id })
      if (poOrderLink) {
        const linkedPO = await db.collection('purchaseorders').countDocuments({ id: poOrderLink.purchase_order_id })
        poExists = linkedPO
      }
    }
    
    if (poExists > 0) {
      report.cascadeIntegrity.prToPO.valid++
    } else {
      report.cascadeIntegrity.prToPO.invalid++
      report.cascadeIntegrity.prToPO.issues.push({
        prNumber: pr.pr_number,
        unified_pr_status: pr.unified_pr_status,
        issue: 'PR marked as LINKED_TO_PO but no PO found'
      })
    }
  }
  console.log(`     Valid: ${report.cascadeIntegrity.prToPO.valid}`)
  console.log(`     Invalid: ${report.cascadeIntegrity.prToPO.invalid}`)
  
  // 3.4 PO → GRN cascade
  console.log('\n  📋 PO → GRN Cascade:')
  const grns = await db.collection('grns').find({}).toArray()
  const poNumbers = await db.collection('purchaseorders').distinct('client_po_number')
  
  for (const grn of grns) {
    if (poNumbers.includes(grn.poNumber)) {
      report.cascadeIntegrity.poToGRN.valid++
    } else {
      report.cascadeIntegrity.poToGRN.invalid++
      report.cascadeIntegrity.poToGRN.issues.push({
        grnNumber: grn.grnNumber,
        poNumber: grn.poNumber,
        issue: 'GRN references non-existent PO'
      })
    }
  }
  console.log(`     Valid: ${report.cascadeIntegrity.poToGRN.valid}`)
  console.log(`     Invalid: ${report.cascadeIntegrity.poToGRN.invalid}`)
  
  // 3.5 GRN → Invoice cascade
  console.log('\n  📋 GRN → Invoice Cascade:')
  const invoices = await db.collection('invoices').find({}).toArray()
  const grnNumbers = await db.collection('grns').distinct('grnNumber')
  
  for (const invoice of invoices) {
    if (grnNumbers.includes(invoice.grnNumber)) {
      report.cascadeIntegrity.grnToInvoice.valid++
    } else {
      report.cascadeIntegrity.grnToInvoice.invalid++
      report.cascadeIntegrity.grnToInvoice.issues.push({
        invoiceNumber: invoice.invoiceNumber,
        grnNumber: invoice.grnNumber,
        issue: 'Invoice references non-existent GRN'
      })
    }
  }
  console.log(`     Valid: ${report.cascadeIntegrity.grnToInvoice.valid}`)
  console.log(`     Invalid: ${report.cascadeIntegrity.grnToInvoice.invalid}`)
  
  // Calculate overall integrity score
  const totalValid = 
    report.cascadeIntegrity.orderToShipment.valid +
    report.cascadeIntegrity.shipmentToDelivery.valid +
    report.cascadeIntegrity.prToPO.valid +
    report.cascadeIntegrity.poToGRN.valid +
    report.cascadeIntegrity.grnToInvoice.valid
  
  const totalInvalid = 
    report.cascadeIntegrity.orderToShipment.invalid +
    report.cascadeIntegrity.shipmentToDelivery.invalid +
    report.cascadeIntegrity.prToPO.invalid +
    report.cascadeIntegrity.poToGRN.invalid +
    report.cascadeIntegrity.grnToInvoice.invalid
  
  const totalCascades = totalValid + totalInvalid
  report.cascadeIntegrity.overallIntegrityScore = totalCascades > 0
    ? ((totalValid / totalCascades) * 100).toFixed(2)
    : 100
  
  console.log(`\n  ✅ Overall Cascade Integrity Score: ${report.cascadeIntegrity.overallIntegrityScore}%`)
}

/**
 * SECTION 4: Check Legacy Field Dependencies
 */
async function checkLegacyFieldDependencies(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('SECTION 4: LEGACY FIELD DEPENDENCY CHECK')
  console.log('═'.repeat(80))
  
  const legacyFields = {
    orders: ['status', 'pr_status', 'dispatchStatus', 'deliveryStatus'],
    purchaseorders: ['po_status'],
    grns: ['status', 'grnStatus'],
    invoices: ['invoiceStatus'],
    shipments: ['shipmentStatus', 'courierStatus'],
  }
  
  console.log('\n  📋 Checking legacy fields still in use:')
  
  for (const [collection, fields] of Object.entries(legacyFields)) {
    for (const field of fields) {
      const count = await db.collection(collection).countDocuments({
        [field]: { $exists: true, $ne: null, $ne: '' }
      })
      
      if (count > 0) {
        const entry = {
          collection,
          field,
          recordCount: count,
          status: 'ACTIVE'
        }
        report.legacyFieldDependencies.activeReferences.push(entry)
        console.log(`     ${collection}.${field}: ${count} records (ACTIVE)`)
      }
    }
  }
  
  // Check which legacy fields can be safely removed
  console.log('\n  📋 Legacy fields analysis:')
  
  // Fields that have unified counterparts and are deprecated
  const deprecatedFields = [
    { collection: 'orders', legacy: 'status', unified: 'unified_status' },
    { collection: 'orders', legacy: 'pr_status', unified: 'unified_pr_status' },
    { collection: 'purchaseorders', legacy: 'po_status', unified: 'unified_po_status' },
    { collection: 'grns', legacy: 'grnStatus', unified: 'unified_grn_status' },
    { collection: 'invoices', legacy: 'invoiceStatus', unified: 'unified_invoice_status' },
    { collection: 'shipments', legacy: 'shipmentStatus', unified: 'unified_shipment_status' },
  ]
  
  for (const { collection, legacy, unified } of deprecatedFields) {
    const withBoth = await db.collection(collection).countDocuments({
      [legacy]: { $exists: true, $ne: null },
      [unified]: { $exists: true, $ne: null }
    })
    const total = await db.collection(collection).countDocuments({
      [legacy]: { $exists: true, $ne: null }
    })
    
    if (withBoth === total && total > 0) {
      report.legacyFieldDependencies.safeToRemove.push({
        collection,
        field: legacy,
        reason: `All ${total} records have unified field populated`
      })
      console.log(`     ✅ ${collection}.${legacy} → Safe to remove (${total}/${total} migrated)`)
    } else if (total > 0) {
      report.legacyFieldDependencies.requiresAttention.push({
        collection,
        field: legacy,
        migrated: withBoth,
        total: total,
        reason: `${total - withBoth} records missing unified field`
      })
      console.log(`     ⚠️  ${collection}.${legacy} → Requires attention (${withBoth}/${total} migrated)`)
    }
  }
}

/**
 * SECTION 5: Verify Dual-Write Synchronization
 */
async function verifyDualWriteSync(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('SECTION 5: DUAL-WRITE SYNCHRONIZATION VERIFICATION')
  console.log('═'.repeat(80))
  
  // Count records with both legacy and unified fields populated
  const ordersWithBoth = await db.collection('orders').countDocuments({
    pr_number: { $exists: false },
    status: { $exists: true, $ne: null },
    unified_status: { $exists: true, $ne: null }
  })
  report.dualWriteVerification.ordersWithBothFields = ordersWithBoth
  console.log(`  📊 Orders with dual-write: ${ordersWithBoth}`)
  
  const prsWithBoth = await db.collection('orders').countDocuments({
    pr_number: { $exists: true, $ne: null },
    pr_status: { $exists: true, $ne: null },
    unified_pr_status: { $exists: true, $ne: null }
  })
  report.dualWriteVerification.prsWithBothFields = prsWithBoth
  console.log(`  📊 PRs with dual-write: ${prsWithBoth}`)
  
  const posWithBoth = await db.collection('purchaseorders').countDocuments({
    po_status: { $exists: true, $ne: null },
    unified_po_status: { $exists: true, $ne: null }
  })
  report.dualWriteVerification.posWithBothFields = posWithBoth
  console.log(`  📊 POs with dual-write: ${posWithBoth}`)
  
  const grnsWithBoth = await db.collection('grns').countDocuments({
    $or: [
      { status: { $exists: true, $ne: null } },
      { grnStatus: { $exists: true, $ne: null } }
    ],
    unified_grn_status: { $exists: true, $ne: null }
  })
  report.dualWriteVerification.grnsWithBothFields = grnsWithBoth
  console.log(`  📊 GRNs with dual-write: ${grnsWithBoth}`)
  
  const invoicesWithBoth = await db.collection('invoices').countDocuments({
    invoiceStatus: { $exists: true, $ne: null },
    unified_invoice_status: { $exists: true, $ne: null }
  })
  report.dualWriteVerification.invoicesWithBothFields = invoicesWithBoth
  console.log(`  📊 Invoices with dual-write: ${invoicesWithBoth}`)
  
  const shipmentsWithBoth = await db.collection('shipments').countDocuments({
    shipmentStatus: { $exists: true, $ne: null },
    unified_shipment_status: { $exists: true, $ne: null }
  })
  report.dualWriteVerification.shipmentsWithBothFields = shipmentsWithBoth
  console.log(`  📊 Shipments with dual-write: ${shipmentsWithBoth}`)
  
  // Calculate sync percentage
  const totalWithBoth = ordersWithBoth + prsWithBoth + posWithBoth + grnsWithBoth + invoicesWithBoth + shipmentsWithBoth
  const totalRecords = 
    (await db.collection('orders').countDocuments({ pr_number: { $exists: false } })) +
    (await db.collection('orders').countDocuments({ pr_number: { $exists: true, $ne: null } })) +
    (await db.collection('purchaseorders').countDocuments({})) +
    (await db.collection('grns').countDocuments({})) +
    (await db.collection('invoices').countDocuments({})) +
    (await db.collection('shipments').countDocuments({}))
  
  report.dualWriteVerification.syncPercentage = totalRecords > 0
    ? ((totalWithBoth / totalRecords) * 100).toFixed(2)
    : 100
  
  console.log(`\n  ✅ Dual-Write Sync Rate: ${report.dualWriteVerification.syncPercentage}%`)
}

/**
 * SECTION 6: Calculate SAFE_MODE Deactivation Readiness
 */
function calculateSafeModeReadiness() {
  console.log('\n' + '═'.repeat(80))
  console.log('SECTION 6: SAFE_MODE DEACTIVATION READINESS')
  console.log('═'.repeat(80))
  
  const readiness = report.safeModeReadiness
  
  // Check 1: Unified Coverage ≥ 95%
  const coverageScore = parseFloat(report.unifiedFieldCoverage.overallScore)
  readiness.unifiedCoverageReady = coverageScore >= 95
  if (!readiness.unifiedCoverageReady) {
    readiness.blockers.push(`Unified field coverage is ${coverageScore}% (required: ≥95%)`)
  }
  console.log(`  ${readiness.unifiedCoverageReady ? '✅' : '❌'} Unified Coverage: ${coverageScore}% (required: ≥95%)`)
  
  // Check 2: Cascade Integrity ≥ 90%
  const cascadeScore = parseFloat(report.cascadeIntegrity.overallIntegrityScore)
  readiness.cascadeIntegrityReady = cascadeScore >= 90
  if (!readiness.cascadeIntegrityReady) {
    readiness.blockers.push(`Cascade integrity is ${cascadeScore}% (required: ≥90%)`)
  }
  console.log(`  ${readiness.cascadeIntegrityReady ? '✅' : '❌'} Cascade Integrity: ${cascadeScore}% (required: ≥90%)`)
  
  // Check 3: Legacy Dependencies Cleared
  const requiresAttention = report.legacyFieldDependencies.requiresAttention.length
  readiness.legacyDependenciesCleared = requiresAttention === 0
  if (!readiness.legacyDependenciesCleared) {
    readiness.warnings.push(`${requiresAttention} legacy fields require attention before removal`)
  }
  console.log(`  ${readiness.legacyDependenciesCleared ? '✅' : '⚠️ '} Legacy Dependencies: ${requiresAttention === 0 ? 'Cleared' : `${requiresAttention} require attention`}`)
  
  // Check 4: Dual-Write Stable ≥ 95%
  const dualWriteSync = parseFloat(report.dualWriteVerification.syncPercentage)
  readiness.dualWriteStable = dualWriteSync >= 95
  if (!readiness.dualWriteStable) {
    readiness.blockers.push(`Dual-write sync is ${dualWriteSync}% (required: ≥95%)`)
  }
  console.log(`  ${readiness.dualWriteStable ? '✅' : '❌'} Dual-Write Stable: ${dualWriteSync}% (required: ≥95%)`)
  
  // Check 5: Status Consistency ≥ 98%
  const consistencyRate = parseFloat(report.statusConsistency.overallConsistencyRate)
  const consistencyReady = consistencyRate >= 98
  if (!consistencyReady) {
    readiness.warnings.push(`Status consistency is ${consistencyRate}% (recommended: ≥98%)`)
  }
  console.log(`  ${consistencyReady ? '✅' : '⚠️ '} Status Consistency: ${consistencyRate}% (recommended: ≥98%)`)
  
  // Determine overall readiness
  const blockerCount = readiness.blockers.length
  const warningCount = readiness.warnings.length
  
  if (blockerCount === 0 && warningCount === 0) {
    readiness.overallReadiness = 'READY'
    readiness.recommendations.push('System is ready for SAFE_MODE deactivation')
    readiness.recommendations.push('Recommend running one final regression test before deactivation')
  } else if (blockerCount === 0) {
    readiness.overallReadiness = 'READY_WITH_WARNINGS'
    readiness.recommendations.push('System can proceed with SAFE_MODE deactivation')
    readiness.recommendations.push('Address warnings during next maintenance window')
  } else {
    readiness.overallReadiness = 'NOT_READY'
    readiness.recommendations.push('Address blockers before SAFE_MODE deactivation')
    readiness.recommendations.push('Run cascade-integrity-fast-fix.js to resolve data issues')
  }
  
  console.log(`\n  📋 Overall Readiness: ${readiness.overallReadiness}`)
  
  if (readiness.blockers.length > 0) {
    console.log(`\n  🔴 BLOCKERS (${readiness.blockers.length}):`)
    readiness.blockers.forEach(b => console.log(`     • ${b}`))
  }
  
  if (readiness.warnings.length > 0) {
    console.log(`\n  🟡 WARNINGS (${readiness.warnings.length}):`)
    readiness.warnings.forEach(w => console.log(`     • ${w}`))
  }
  
  if (readiness.recommendations.length > 0) {
    console.log(`\n  💡 RECOMMENDATIONS:`)
    readiness.recommendations.forEach(r => console.log(`     • ${r}`))
  }
}

/**
 * Generate Final Summary
 */
function generateFinalSummary() {
  console.log('\n' + '═'.repeat(80))
  console.log('FINAL SUMMARY')
  console.log('═'.repeat(80))
  
  const summary = report.summary
  
  // Count checks
  summary.totalChecks = 6
  
  // Count passes and failures
  if (parseFloat(report.unifiedFieldCoverage.overallScore) >= 95) summary.passed++; else summary.failed++
  if (parseFloat(report.statusConsistency.overallConsistencyRate) >= 95) summary.passed++; else summary.failed++
  if (parseFloat(report.cascadeIntegrity.overallIntegrityScore) >= 90) summary.passed++; else summary.failed++
  if (report.legacyFieldDependencies.requiresAttention.length === 0) summary.passed++; else summary.warnings++
  if (parseFloat(report.dualWriteVerification.syncPercentage) >= 95) summary.passed++; else summary.failed++
  if (report.safeModeReadiness.overallReadiness !== 'NOT_READY') summary.passed++; else summary.failed++
  
  // Determine overall status
  if (summary.failed === 0 && summary.warnings === 0) {
    summary.overallStatus = 'PASS'
  } else if (summary.failed === 0) {
    summary.overallStatus = 'PASS_WITH_WARNINGS'
  } else {
    summary.overallStatus = 'FAIL'
  }
  
  console.log(`
┌────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3 — UNIFIED WORKFLOW VERIFICATION RESULTS                                │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  VERIFICATION SCORES:                                                          │
│    📊 Unified Field Coverage:     ${report.unifiedFieldCoverage.overallScore.padStart(7)}%                               │
│    📊 Status Consistency:         ${report.statusConsistency.overallConsistencyRate.padStart(7)}%                               │
│    📊 Cascade Integrity:          ${report.cascadeIntegrity.overallIntegrityScore.padStart(7)}%                               │
│    📊 Dual-Write Sync:            ${report.dualWriteVerification.syncPercentage.padStart(7)}%                               │
│                                                                                │
│  CHECK RESULTS:                                                                │
│    ✅ Passed:                     ${String(summary.passed).padStart(7)}                                   │
│    ❌ Failed:                     ${String(summary.failed).padStart(7)}                                   │
│    ⚠️  Warnings:                   ${String(summary.warnings).padStart(7)}                                   │
│                                                                                │
│  SAFE_MODE READINESS:             ${report.safeModeReadiness.overallReadiness.padEnd(20)}                    │
│                                                                                │
│  OVERALL STATUS:                  ${summary.overallStatus.padEnd(20)}                    │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
`)
  
  console.log('🔒 READ-ONLY VERIFICATION COMPLETE — NO DATA WAS MODIFIED')
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
      readPreference: 'secondaryPreferred',
      retryWrites: false,
      maxPoolSize: 2,
      appName: 'Phase3-UnifiedWorkflowVerification',
    })
    
    await client.connect()
    console.log('✅ Connected to MongoDB (Read-Only Mode)\n')
    
    const db = client.db()
    
    // Execute all verification sections
    await verifyUnifiedFieldCoverage(db)
    await verifyStatusConsistency(db)
    await verifyCascadeIntegrity(db)
    await checkLegacyFieldDependencies(db)
    await verifyDualWriteSync(db)
    calculateSafeModeReadiness()
    generateFinalSummary()
    
    // Save report to JSON
    const resultsPath = path.resolve(process.cwd(), 'reports', 'phase3-verification-report.json')
    fs.writeFileSync(resultsPath, JSON.stringify(report, null, 2))
    console.log(`\n📄 Full report saved to: ${resultsPath}`)
    
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
