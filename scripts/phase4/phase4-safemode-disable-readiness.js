/**
 * PHASE 4 — SAFE_MODE DISABLE READINESS REPORT
 * 
 * Purpose: Comprehensive analysis to determine if SAFE_MODE can be safely disabled.
 * 
 * Checks:
 * A. Unified Field Integrity
 * B. Status Sync Health
 * C. Cascade Integrity
 * D. Relationship Graph Health
 * E. Legacy Field Dependence Impact
 * F. Dual-write Stability Score
 * G. Recommended Flag Flip Sequence
 * 
 * Safety:
 * - READ-ONLY — no writes, no patches
 * - Analysis only
 * 
 * Usage: node scripts/phase4/phase4-safemode-disable-readiness.js
 * 
 * @version 1.0.0
 * @created 2026-01-16
 */

console.log('═'.repeat(80))
console.log('PHASE 4 — SAFE_MODE DISABLE READINESS REPORT')
console.log('═'.repeat(80))
console.log()
console.log(`Mode: 🔒 READ-ONLY (Analysis Only — No Modifications)`)
console.log(`Timestamp: ${new Date().toISOString()}`)
console.log()

// =============================================================================
// DEPENDENCIES
// =============================================================================

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

const envLocalPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath })
  console.log('📁 Loaded environment from .env.local')
}

const { MongoClient } = require('mongodb')

// =============================================================================
// REPORT STRUCTURE
// =============================================================================

const report = {
  timestamp: new Date().toISOString(),
  sections: {
    A: { name: 'Unified Field Integrity', status: 'PENDING', score: 0, details: [] },
    B: { name: 'Status Sync Health', status: 'PENDING', score: 0, details: [] },
    C: { name: 'Cascade Integrity', status: 'PENDING', score: 0, details: [] },
    D: { name: 'Relationship Graph Health', status: 'PENDING', score: 0, details: [] },
    E: { name: 'Legacy Field Dependence Impact', status: 'PENDING', score: 0, details: [] },
    F: { name: 'Dual-write Stability Score', status: 'PENDING', score: 0, details: [] },
    G: { name: 'Recommended Flag Flip Sequence', status: 'PENDING', sequence: [], details: [] },
  },
  finalVerdict: 'PENDING',
  summary: {
    passed: 0,
    failed: 0,
    totalScore: 0,
  }
}

// =============================================================================
// STATUS MAPPINGS
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

// =============================================================================
// SECTION A: UNIFIED FIELD INTEGRITY
// =============================================================================

async function checkUnifiedFieldIntegrity(db) {
  console.log('\n' + '─'.repeat(80))
  console.log('[SECTION A] UNIFIED FIELD INTEGRITY')
  console.log('─'.repeat(80))
  
  const section = report.sections.A
  let totalRecords = 0
  let withUnified = 0
  
  // Check Orders (non-PR)
  const orders = await db.collection('orders').find({ pr_number: { $exists: false } }).toArray()
  const ordersWithUnified = orders.filter(o => o.unified_status && o.unified_status !== '')
  section.details.push({
    entity: 'Orders',
    total: orders.length,
    withUnified: ordersWithUnified.length,
    coverage: orders.length > 0 ? ((ordersWithUnified.length / orders.length) * 100).toFixed(2) + '%' : '100%'
  })
  totalRecords += orders.length
  withUnified += ordersWithUnified.length
  
  // Check PRs
  const prs = await db.collection('orders').find({ pr_number: { $exists: true, $ne: null } }).toArray()
  const prsWithUnified = prs.filter(p => p.unified_pr_status && p.unified_pr_status !== '')
  section.details.push({
    entity: 'PRs',
    total: prs.length,
    withUnified: prsWithUnified.length,
    coverage: prs.length > 0 ? ((prsWithUnified.length / prs.length) * 100).toFixed(2) + '%' : '100%'
  })
  totalRecords += prs.length
  withUnified += prsWithUnified.length
  
  // Check POs
  const pos = await db.collection('purchaseorders').find({}).toArray()
  const posWithUnified = pos.filter(p => p.unified_po_status && p.unified_po_status !== '')
  section.details.push({
    entity: 'PurchaseOrders',
    total: pos.length,
    withUnified: posWithUnified.length,
    coverage: pos.length > 0 ? ((posWithUnified.length / pos.length) * 100).toFixed(2) + '%' : '100%'
  })
  totalRecords += pos.length
  withUnified += posWithUnified.length
  
  // Check GRNs
  const grns = await db.collection('grns').find({}).toArray()
  const grnsWithUnified = grns.filter(g => g.unified_grn_status && g.unified_grn_status !== '')
  section.details.push({
    entity: 'GRNs',
    total: grns.length,
    withUnified: grnsWithUnified.length,
    coverage: grns.length > 0 ? ((grnsWithUnified.length / grns.length) * 100).toFixed(2) + '%' : '100%'
  })
  totalRecords += grns.length
  withUnified += grnsWithUnified.length
  
  // Check Invoices
  const invoices = await db.collection('invoices').find({}).toArray()
  const invoicesWithUnified = invoices.filter(i => i.unified_invoice_status && i.unified_invoice_status !== '')
  section.details.push({
    entity: 'Invoices',
    total: invoices.length,
    withUnified: invoicesWithUnified.length,
    coverage: invoices.length > 0 ? ((invoicesWithUnified.length / invoices.length) * 100).toFixed(2) + '%' : '100%'
  })
  totalRecords += invoices.length
  withUnified += invoicesWithUnified.length
  
  // Check Shipments
  const shipments = await db.collection('shipments').find({}).toArray()
  const shipmentsWithUnified = shipments.filter(s => s.unified_shipment_status && s.unified_shipment_status !== '')
  section.details.push({
    entity: 'Shipments',
    total: shipments.length,
    withUnified: shipmentsWithUnified.length,
    coverage: shipments.length > 0 ? ((shipmentsWithUnified.length / shipments.length) * 100).toFixed(2) + '%' : '100%'
  })
  totalRecords += shipments.length
  withUnified += shipmentsWithUnified.length
  
  // Calculate score
  section.score = totalRecords > 0 ? ((withUnified / totalRecords) * 100) : 100
  section.status = section.score >= 95 ? 'PASS' : 'FAIL'
  
  // Print results
  console.log()
  for (const detail of section.details) {
    const icon = detail.total === 0 || detail.withUnified === detail.total ? '✅' : '❌'
    console.log(`  ${icon} ${detail.entity}: ${detail.withUnified}/${detail.total} (${detail.coverage})`)
  }
  console.log()
  console.log(`  Score: ${section.score.toFixed(2)}%`)
  console.log(`  Status: ${section.status === 'PASS' ? '✅ PASS' : '❌ FAIL'}`)
}

// =============================================================================
// SECTION B: STATUS SYNC HEALTH
// =============================================================================

async function checkStatusSyncHealth(db) {
  console.log('\n' + '─'.repeat(80))
  console.log('[SECTION B] STATUS SYNC HEALTH')
  console.log('─'.repeat(80))
  
  const section = report.sections.B
  let totalRecords = 0
  let syncedRecords = 0
  
  // Check Orders (non-PR)
  const orders = await db.collection('orders').find({ pr_number: { $exists: false } }).toArray()
  let orderMismatches = 0
  for (const order of orders) {
    const expected = LEGACY_TO_UNIFIED_ORDER[order.status]
    if (expected && order.unified_status !== expected) {
      orderMismatches++
      section.details.push({
        type: 'Order Mismatch',
        id: order.id,
        legacy: order.status,
        unified: order.unified_status,
        expected: expected
      })
    } else {
      syncedRecords++
    }
    totalRecords++
  }
  console.log(`  📊 Orders: ${orders.length - orderMismatches}/${orders.length} synced`)
  
  // Check PRs
  const prs = await db.collection('orders').find({ pr_number: { $exists: true, $ne: null } }).toArray()
  let prMismatches = 0
  for (const pr of prs) {
    const expected = LEGACY_TO_UNIFIED_PR[pr.pr_status]
    if (expected && pr.unified_pr_status !== expected) {
      prMismatches++
      section.details.push({
        type: 'PR Mismatch',
        id: pr.id,
        pr_number: pr.pr_number,
        legacy: pr.pr_status,
        unified: pr.unified_pr_status,
        expected: expected
      })
    } else {
      syncedRecords++
    }
    totalRecords++
  }
  console.log(`  📊 PRs: ${prs.length - prMismatches}/${prs.length} synced`)
  
  // Calculate score
  section.score = totalRecords > 0 ? ((syncedRecords / totalRecords) * 100) : 100
  section.status = section.score >= 98 ? 'PASS' : 'FAIL'
  
  console.log()
  console.log(`  Score: ${section.score.toFixed(2)}%`)
  console.log(`  Status: ${section.status === 'PASS' ? '✅ PASS' : '❌ FAIL'}`)
  
  if (section.details.length > 0 && section.details.length <= 5) {
    console.log(`\n  Mismatches found:`)
    section.details.forEach(d => {
      console.log(`    • ${d.type}: ${d.id} (${d.legacy} → ${d.unified}, expected: ${d.expected})`)
    })
  }
}

// =============================================================================
// SECTION C: CASCADE INTEGRITY
// =============================================================================

async function checkCascadeIntegrity(db) {
  console.log('\n' + '─'.repeat(80))
  console.log('[SECTION C] CASCADE INTEGRITY')
  console.log('─'.repeat(80))
  
  const section = report.sections.C
  let validCascades = 0
  let invalidCascades = 0
  
  // Check PR → PO cascade (PRs with LINKED_TO_PO should have PO)
  const linkedPRs = await db.collection('orders').find({
    pr_number: { $exists: true, $ne: null },
    unified_pr_status: 'LINKED_TO_PO'
  }).toArray()
  
  const poCount = await db.collection('purchaseorders').countDocuments({})
  
  if (linkedPRs.length > 0 && poCount === 0) {
    // PRs claim to be linked but no POs exist — this is a cascade break
    invalidCascades += linkedPRs.length
    section.details.push({
      cascade: 'PR → PO',
      issue: `${linkedPRs.length} PRs marked LINKED_TO_PO but no POs exist`
    })
  } else {
    validCascades++
  }
  console.log(`  📊 PR → PO: ${linkedPRs.length === 0 || poCount > 0 ? '✅ Valid' : `❌ ${linkedPRs.length} broken links`}`)
  
  // Check PO → GRN cascade
  const grnCount = await db.collection('grns').countDocuments({})
  if (poCount > 0 || grnCount === 0) {
    validCascades++
    console.log(`  📊 PO → GRN: ✅ Valid (${poCount} POs, ${grnCount} GRNs)`)
  } else {
    invalidCascades++
    section.details.push({
      cascade: 'PO → GRN',
      issue: `${grnCount} GRNs exist but no POs`
    })
    console.log(`  📊 PO → GRN: ❌ Orphaned GRNs`)
  }
  
  // Check GRN → Invoice cascade
  const invoiceCount = await db.collection('invoices').countDocuments({})
  if (grnCount > 0 || invoiceCount === 0) {
    validCascades++
    console.log(`  📊 GRN → Invoice: ✅ Valid (${grnCount} GRNs, ${invoiceCount} Invoices)`)
  } else {
    invalidCascades++
    section.details.push({
      cascade: 'GRN → Invoice',
      issue: `${invoiceCount} Invoices exist but no GRNs`
    })
    console.log(`  📊 GRN → Invoice: ❌ Orphaned Invoices`)
  }
  
  // Check Shipment → PR cascade
  const shipments = await db.collection('shipments').find({}).toArray()
  let orphanedShipments = 0
  for (const shipment of shipments) {
    const prExists = await db.collection('orders').countDocuments({ pr_number: shipment.prNumber })
    if (prExists === 0) {
      orphanedShipments++
      invalidCascades++
    } else {
      validCascades++
    }
  }
  if (shipments.length === 0) {
    validCascades++
  }
  console.log(`  📊 Shipment → PR: ${orphanedShipments === 0 ? '✅ Valid' : `❌ ${orphanedShipments} orphaned`} (${shipments.length} total)`)
  
  // Calculate score
  const total = validCascades + invalidCascades
  section.score = total > 0 ? ((validCascades / total) * 100) : 100
  section.status = section.score >= 90 ? 'PASS' : 'FAIL'
  
  console.log()
  console.log(`  Score: ${section.score.toFixed(2)}%`)
  console.log(`  Status: ${section.status === 'PASS' ? '✅ PASS' : '❌ FAIL'}`)
}

// =============================================================================
// SECTION D: RELATIONSHIP GRAPH HEALTH
// =============================================================================

async function checkRelationshipGraphHealth(db) {
  console.log('\n' + '─'.repeat(80))
  console.log('[SECTION D] RELATIONSHIP GRAPH HEALTH')
  console.log('─'.repeat(80))
  
  const section = report.sections.D
  let healthyRelationships = 0
  let brokenRelationships = 0
  
  // Check Order → Employee relationship
  const orders = await db.collection('orders').find({}).toArray()
  const employeeIds = await db.collection('employees').distinct('id')
  
  let orphanedOrders = 0
  for (const order of orders) {
    if (order.employeeId && !employeeIds.includes(order.employeeId)) {
      orphanedOrders++
      brokenRelationships++
    } else {
      healthyRelationships++
    }
  }
  section.details.push({
    relationship: 'Order → Employee',
    total: orders.length,
    valid: orders.length - orphanedOrders,
    orphaned: orphanedOrders
  })
  console.log(`  📊 Order → Employee: ${orphanedOrders === 0 ? '✅' : '⚠️ '} ${orders.length - orphanedOrders}/${orders.length} valid`)
  
  // Check Order → Company relationship
  const companyIds = await db.collection('companies').distinct('id')
  let orphanedByCompany = 0
  for (const order of orders) {
    if (order.companyId && !companyIds.includes(order.companyId)) {
      orphanedByCompany++
    }
  }
  section.details.push({
    relationship: 'Order → Company',
    total: orders.length,
    valid: orders.length - orphanedByCompany,
    orphaned: orphanedByCompany
  })
  console.log(`  📊 Order → Company: ${orphanedByCompany === 0 ? '✅' : '⚠️ '} ${orders.length - orphanedByCompany}/${orders.length} valid`)
  
  // Check Order → Vendor relationship
  const vendorIds = await db.collection('vendors').distinct('id')
  let orphanedByVendor = 0
  for (const order of orders) {
    if (order.vendorId && !vendorIds.includes(order.vendorId)) {
      orphanedByVendor++
    }
  }
  section.details.push({
    relationship: 'Order → Vendor',
    total: orders.length,
    valid: orders.length - orphanedByVendor,
    orphaned: orphanedByVendor
  })
  console.log(`  📊 Order → Vendor: ${orphanedByVendor === 0 ? '✅' : '⚠️ '} ${orders.length - orphanedByVendor}/${orders.length} valid`)
  
  // Calculate score (relationships are non-blocking if entity refs exist but entity deleted)
  const totalChecked = healthyRelationships + brokenRelationships
  section.score = totalChecked > 0 ? ((healthyRelationships / totalChecked) * 100) : 100
  section.status = section.score >= 80 ? 'PASS' : 'FAIL'
  
  console.log()
  console.log(`  Score: ${section.score.toFixed(2)}%`)
  console.log(`  Status: ${section.status === 'PASS' ? '✅ PASS' : '❌ FAIL'}`)
}

// =============================================================================
// SECTION E: LEGACY FIELD DEPENDENCE IMPACT
// =============================================================================

async function checkLegacyFieldDependenceImpact(db) {
  console.log('\n' + '─'.repeat(80))
  console.log('[SECTION E] LEGACY FIELD DEPENDENCE IMPACT')
  console.log('─'.repeat(80))
  
  const section = report.sections.E
  
  // Check which legacy fields are still populated
  const legacyFieldsCheck = [
    { collection: 'orders', field: 'status', unified: 'unified_status' },
    { collection: 'orders', field: 'pr_status', unified: 'unified_pr_status' },
    { collection: 'purchaseorders', field: 'po_status', unified: 'unified_po_status' },
    { collection: 'grns', field: 'grnStatus', unified: 'unified_grn_status' },
    { collection: 'invoices', field: 'invoiceStatus', unified: 'unified_invoice_status' },
    { collection: 'shipments', field: 'shipmentStatus', unified: 'unified_shipment_status' },
  ]
  
  let safeToDisable = 0
  let requiresAttention = 0
  
  for (const check of legacyFieldsCheck) {
    const totalWithLegacy = await db.collection(check.collection).countDocuments({
      [check.field]: { $exists: true, $ne: null, $ne: '' }
    })
    const totalWithBoth = await db.collection(check.collection).countDocuments({
      [check.field]: { $exists: true, $ne: null, $ne: '' },
      [check.unified]: { $exists: true, $ne: null, $ne: '' }
    })
    
    const migrated = totalWithLegacy > 0 ? ((totalWithBoth / totalWithLegacy) * 100) : 100
    const status = migrated >= 100 ? 'SAFE' : migrated >= 90 ? 'WARNING' : 'BLOCKING'
    
    section.details.push({
      collection: check.collection,
      legacyField: check.field,
      unifiedField: check.unified,
      totalWithLegacy,
      totalWithBoth,
      migrationPercentage: migrated.toFixed(2) + '%',
      status
    })
    
    if (status === 'SAFE') {
      safeToDisable++
    } else {
      requiresAttention++
    }
    
    const icon = status === 'SAFE' ? '✅' : status === 'WARNING' ? '⚠️ ' : '❌'
    console.log(`  ${icon} ${check.collection}.${check.field}: ${totalWithBoth}/${totalWithLegacy} migrated (${migrated.toFixed(0)}%)`)
  }
  
  // Calculate score
  section.score = legacyFieldsCheck.length > 0 
    ? ((safeToDisable / legacyFieldsCheck.length) * 100) 
    : 100
  section.status = section.score >= 80 ? 'PASS' : 'FAIL'
  
  console.log()
  console.log(`  Safe to disable: ${safeToDisable}/${legacyFieldsCheck.length}`)
  console.log(`  Score: ${section.score.toFixed(2)}%`)
  console.log(`  Status: ${section.status === 'PASS' ? '✅ PASS' : '❌ FAIL'}`)
}

// =============================================================================
// SECTION F: DUAL-WRITE STABILITY SCORE
// =============================================================================

async function checkDualWriteStability(db) {
  console.log('\n' + '─'.repeat(80))
  console.log('[SECTION F] DUAL-WRITE STABILITY SCORE')
  console.log('─'.repeat(80))
  
  const section = report.sections.F
  
  // Check updated_by fields to verify dual-write is working
  const dualWriteChecks = [
    { collection: 'orders', field: 'unified_status_updated_by', filter: { pr_number: { $exists: false } } },
    { collection: 'orders', field: 'unified_pr_status_updated_by', filter: { pr_number: { $exists: true, $ne: null } } },
  ]
  
  let totalWithDualWrite = 0
  let totalRecords = 0
  
  for (const check of dualWriteChecks) {
    const total = await db.collection(check.collection).countDocuments(check.filter)
    const withUpdatedBy = await db.collection(check.collection).countDocuments({
      ...check.filter,
      [check.field]: { $exists: true, $ne: null }
    })
    
    section.details.push({
      collection: check.collection,
      field: check.field,
      total,
      withDualWriteMarker: withUpdatedBy,
      percentage: total > 0 ? ((withUpdatedBy / total) * 100).toFixed(2) + '%' : '100%'
    })
    
    totalWithDualWrite += withUpdatedBy
    totalRecords += total
    
    const icon = total === 0 || withUpdatedBy === total ? '✅' : withUpdatedBy > 0 ? '⚠️ ' : '❌'
    console.log(`  ${icon} ${check.collection}.${check.field}: ${withUpdatedBy}/${total} tracked`)
  }
  
  // Check consistency of dual-write (both fields updated together)
  const ordersWithBoth = await db.collection('orders').countDocuments({
    pr_number: { $exists: false },
    status: { $exists: true, $ne: null },
    unified_status: { $exists: true, $ne: null }
  })
  const ordersTotal = await db.collection('orders').countDocuments({ pr_number: { $exists: false } })
  
  section.details.push({
    check: 'Orders with both legacy + unified',
    count: ordersWithBoth,
    total: ordersTotal,
    percentage: ordersTotal > 0 ? ((ordersWithBoth / ordersTotal) * 100).toFixed(2) + '%' : '100%'
  })
  console.log(`  📊 Orders dual-write: ${ordersWithBoth}/${ordersTotal}`)
  
  const prsWithBoth = await db.collection('orders').countDocuments({
    pr_number: { $exists: true, $ne: null },
    pr_status: { $exists: true, $ne: null },
    unified_pr_status: { $exists: true, $ne: null }
  })
  const prsTotal = await db.collection('orders').countDocuments({ pr_number: { $exists: true, $ne: null } })
  
  section.details.push({
    check: 'PRs with both legacy + unified',
    count: prsWithBoth,
    total: prsTotal,
    percentage: prsTotal > 0 ? ((prsWithBoth / prsTotal) * 100).toFixed(2) + '%' : '100%'
  })
  console.log(`  📊 PRs dual-write: ${prsWithBoth}/${prsTotal}`)
  
  // Calculate score
  const totalDualWrite = ordersWithBoth + prsWithBoth
  const totalForDualWrite = ordersTotal + prsTotal
  section.score = totalForDualWrite > 0 ? ((totalDualWrite / totalForDualWrite) * 100) : 100
  section.status = section.score >= 95 ? 'PASS' : 'FAIL'
  
  console.log()
  console.log(`  Score: ${section.score.toFixed(2)}%`)
  console.log(`  Status: ${section.status === 'PASS' ? '✅ PASS' : '❌ FAIL'}`)
}

// =============================================================================
// SECTION G: RECOMMENDED FLAG FLIP SEQUENCE
// =============================================================================

async function generateFlagFlipSequence(db) {
  console.log('\n' + '─'.repeat(80))
  console.log('[SECTION G] RECOMMENDED FLAG FLIP SEQUENCE')
  console.log('─'.repeat(80))
  
  const section = report.sections.G
  
  // Determine the recommended sequence based on previous checks
  const sequence = []
  
  // Step 1: Disable SAFE_MODE for reads (switch to unified fields)
  sequence.push({
    step: 1,
    action: 'Set DUAL_WRITE_ENABLED=true (if not already)',
    reason: 'Ensure all new writes populate both legacy and unified fields',
    risk: 'LOW',
    prerequisite: 'Unified coverage ≥ 95%'
  })
  
  // Step 2: Switch reads to unified fields
  sequence.push({
    step: 2,
    action: 'Set READ_FROM_UNIFIED=true',
    reason: 'Application now reads from unified fields',
    risk: 'MEDIUM',
    prerequisite: 'Status sync health ≥ 98%'
  })
  
  // Step 3: Disable SAFE_MODE
  sequence.push({
    step: 3,
    action: 'Set SAFE_MODE=false',
    reason: 'Disable safety guards — unified fields are now primary',
    risk: 'MEDIUM',
    prerequisite: 'All previous steps successful, monitoring in place'
  })
  
  // Step 4: Disable dual-write (optional)
  sequence.push({
    step: 4,
    action: 'Set DUAL_WRITE_ENABLED=false (future)',
    reason: 'Stop writing to legacy fields',
    risk: 'HIGH',
    prerequisite: 'Stable operation for 7+ days, legacy field deprecation confirmed'
  })
  
  // Step 5: Remove legacy fields (future maintenance)
  sequence.push({
    step: 5,
    action: 'Remove legacy fields from schema (future)',
    reason: 'Final cleanup — schema simplification',
    risk: 'HIGH',
    prerequisite: 'All consumers migrated, backup verified'
  })
  
  section.sequence = sequence
  section.status = 'PASS'
  section.score = 100
  
  console.log()
  for (const step of sequence) {
    const riskIcon = step.risk === 'LOW' ? '🟢' : step.risk === 'MEDIUM' ? '🟡' : '🔴'
    console.log(`  ${step.step}. ${step.action}`)
    console.log(`     ${riskIcon} Risk: ${step.risk}`)
    console.log(`     📋 Prerequisite: ${step.prerequisite}`)
    console.log()
  }
  
  console.log(`  Status: ✅ PASS (Sequence generated)`)
}

// =============================================================================
// FINAL VERDICT
// =============================================================================

function generateFinalVerdict() {
  console.log('\n' + '═'.repeat(80))
  console.log('FINAL VERDICT')
  console.log('═'.repeat(80))
  
  // Count passes and failures
  const sections = Object.values(report.sections)
  report.summary.passed = sections.filter(s => s.status === 'PASS').length
  report.summary.failed = sections.filter(s => s.status === 'FAIL').length
  report.summary.totalScore = sections.reduce((acc, s) => acc + (s.score || 0), 0) / sections.length
  
  // Determine verdict
  const criticalSections = ['A', 'B', 'C', 'F']
  const criticalPassed = criticalSections.every(key => report.sections[key].status === 'PASS')
  
  if (criticalPassed && report.summary.failed <= 1) {
    report.finalVerdict = 'SAFE_MODE CAN BE DISABLED'
  } else {
    report.finalVerdict = 'SAFE_MODE MUST REMAIN ENABLED'
  }
  
  console.log(`
┌────────────────────────────────────────────────────────────────────────────────┐
│                        SAFE_MODE DISABLE READINESS                             │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  SECTION RESULTS:                                                              │
│    [A] Unified Field Integrity:        ${report.sections.A.status.padEnd(10)} (${report.sections.A.score.toFixed(1)}%)              │
│    [B] Status Sync Health:             ${report.sections.B.status.padEnd(10)} (${report.sections.B.score.toFixed(1)}%)              │
│    [C] Cascade Integrity:              ${report.sections.C.status.padEnd(10)} (${report.sections.C.score.toFixed(1)}%)              │
│    [D] Relationship Graph Health:      ${report.sections.D.status.padEnd(10)} (${report.sections.D.score.toFixed(1)}%)              │
│    [E] Legacy Field Dependence:        ${report.sections.E.status.padEnd(10)} (${report.sections.E.score.toFixed(1)}%)              │
│    [F] Dual-write Stability:           ${report.sections.F.status.padEnd(10)} (${report.sections.F.score.toFixed(1)}%)              │
│    [G] Flag Flip Sequence:             ${report.sections.G.status.padEnd(10)}                          │
│                                                                                │
│  SUMMARY:                                                                      │
│    ✅ Passed:  ${String(report.summary.passed).padStart(2)}/7                                                       │
│    ❌ Failed:  ${String(report.summary.failed).padStart(2)}/7                                                       │
│    📊 Score:   ${report.summary.totalScore.toFixed(1)}%                                                      │
│                                                                                │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  ╔════════════════════════════════════════════════════════════════════════╗   │
│  ║                                                                        ║   │
│  ║   ${report.finalVerdict === 'SAFE_MODE CAN BE DISABLED' ? '✅' : '❌'}  ${report.finalVerdict.padEnd(50)}  ║   │
│  ║                                                                        ║   │
│  ╚════════════════════════════════════════════════════════════════════════╝   │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
`)
  
  if (report.finalVerdict === 'SAFE_MODE CAN BE DISABLED') {
    console.log('  💡 NEXT STEPS:')
    console.log('     1. Follow the flag flip sequence in Section G')
    console.log('     2. Monitor application logs for 24 hours after each step')
    console.log('     3. Have rollback plan ready')
    console.log()
  } else {
    console.log('  ⚠️  BLOCKING ISSUES:')
    for (const [key, section] of Object.entries(report.sections)) {
      if (section.status === 'FAIL') {
        console.log(`     • Section ${key} (${section.name}): Score ${section.score.toFixed(1)}%`)
      }
    }
    console.log()
  }
  
  console.log('🔒 READ-ONLY ANALYSIS COMPLETE — NO DATA WAS MODIFIED')
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
      appName: 'Phase4-SafeModeReadiness',
    })
    
    await client.connect()
    console.log('✅ Connected to MongoDB (Read-Only Mode)\n')
    
    const db = client.db()
    
    // Execute all sections
    await checkUnifiedFieldIntegrity(db)
    await checkStatusSyncHealth(db)
    await checkCascadeIntegrity(db)
    await checkRelationshipGraphHealth(db)
    await checkLegacyFieldDependenceImpact(db)
    await checkDualWriteStability(db)
    await generateFlagFlipSequence(db)
    generateFinalVerdict()
    
    // Save report to JSON
    const resultsPath = path.resolve(process.cwd(), 'reports', 'phase4-safemode-readiness-report.json')
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
