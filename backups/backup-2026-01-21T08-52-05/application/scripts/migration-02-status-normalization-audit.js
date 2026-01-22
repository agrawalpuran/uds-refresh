/**
 * Migration Script #2 — STATUS NORMALIZATION AUDIT
 * 
 * Purpose: Scan all entities and detect records where unified_*_status fields
 *          are NULL or inconsistent with legacy status fields.
 * 
 * Actions: READ-ONLY - No modifications to any records
 * 
 * Usage: node scripts/migration-02-status-normalization-audit.js
 * 
 * @version 1.0.0
 * @created 2026-01-15
 */

require('dotenv').config()
const mongoose = require('mongoose')

// =============================================================================
// STATUS MAPPING FUNCTIONS (for comparison)
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
// AUDIT FUNCTIONS
// =============================================================================

async function auditOrders(db) {
  console.log('\n' + '='.repeat(80))
  console.log('AUDITING ORDERS (Simple Workflow)')
  console.log('='.repeat(80))
  
  const orders = await db.collection('orders').find({
    pr_number: { $exists: false } // Regular orders, not PRs
  }).toArray()
  
  const report = {
    total: orders.length,
    nullUnifiedStatus: [],
    inconsistent: [],
    consistent: 0,
  }
  
  for (const order of orders) {
    if (!order.unified_status) {
      report.nullUnifiedStatus.push({
        id: order.id,
        legacyStatus: order.status,
        expectedUnified: LEGACY_TO_UNIFIED_ORDER_STATUS[order.status] || 'CREATED',
      })
    } else {
      const expectedUnified = LEGACY_TO_UNIFIED_ORDER_STATUS[order.status] || 'CREATED'
      if (order.unified_status !== expectedUnified) {
        report.inconsistent.push({
          id: order.id,
          legacyStatus: order.status,
          currentUnified: order.unified_status,
          expectedUnified,
        })
      } else {
        report.consistent++
      }
    }
  }
  
  console.log(`\nTotal Orders (non-PR): ${report.total}`)
  console.log(`Consistent: ${report.consistent}`)
  console.log(`Null unified_status: ${report.nullUnifiedStatus.length}`)
  console.log(`Inconsistent: ${report.inconsistent.length}`)
  
  if (report.nullUnifiedStatus.length > 0) {
    console.log('\n--- Orders with NULL unified_status ---')
    report.nullUnifiedStatus.slice(0, 20).forEach(r => {
      console.log(`  ID: ${r.id} | Legacy: ${r.legacyStatus} | Expected: ${r.expectedUnified}`)
    })
    if (report.nullUnifiedStatus.length > 20) {
      console.log(`  ... and ${report.nullUnifiedStatus.length - 20} more`)
    }
  }
  
  if (report.inconsistent.length > 0) {
    console.log('\n--- Orders with INCONSISTENT unified_status ---')
    report.inconsistent.slice(0, 20).forEach(r => {
      console.log(`  ID: ${r.id} | Legacy: ${r.legacyStatus} | Current: ${r.currentUnified} | Expected: ${r.expectedUnified}`)
    })
    if (report.inconsistent.length > 20) {
      console.log(`  ... and ${report.inconsistent.length - 20} more`)
    }
  }
  
  return report
}

async function auditPRs(db) {
  console.log('\n' + '='.repeat(80))
  console.log('AUDITING PRs (Purchase Requisitions)')
  console.log('='.repeat(80))
  
  const prs = await db.collection('orders').find({
    pr_number: { $exists: true, $ne: null }
  }).toArray()
  
  const report = {
    total: prs.length,
    nullUnifiedPRStatus: [],
    inconsistent: [],
    consistent: 0,
  }
  
  for (const pr of prs) {
    if (!pr.unified_pr_status) {
      report.nullUnifiedPRStatus.push({
        id: pr.id,
        prNumber: pr.pr_number,
        legacyStatus: pr.pr_status,
        expectedUnified: LEGACY_TO_UNIFIED_PR_STATUS[pr.pr_status] || 'DRAFT',
      })
    } else {
      const expectedUnified = LEGACY_TO_UNIFIED_PR_STATUS[pr.pr_status] || 'DRAFT'
      if (pr.unified_pr_status !== expectedUnified) {
        report.inconsistent.push({
          id: pr.id,
          prNumber: pr.pr_number,
          legacyStatus: pr.pr_status,
          currentUnified: pr.unified_pr_status,
          expectedUnified,
        })
      } else {
        report.consistent++
      }
    }
  }
  
  console.log(`\nTotal PRs: ${report.total}`)
  console.log(`Consistent: ${report.consistent}`)
  console.log(`Null unified_pr_status: ${report.nullUnifiedPRStatus.length}`)
  console.log(`Inconsistent: ${report.inconsistent.length}`)
  
  if (report.nullUnifiedPRStatus.length > 0) {
    console.log('\n--- PRs with NULL unified_pr_status ---')
    report.nullUnifiedPRStatus.slice(0, 20).forEach(r => {
      console.log(`  ID: ${r.id} | PR#: ${r.prNumber} | Legacy: ${r.legacyStatus} | Expected: ${r.expectedUnified}`)
    })
    if (report.nullUnifiedPRStatus.length > 20) {
      console.log(`  ... and ${report.nullUnifiedPRStatus.length - 20} more`)
    }
  }
  
  if (report.inconsistent.length > 0) {
    console.log('\n--- PRs with INCONSISTENT unified_pr_status ---')
    report.inconsistent.slice(0, 20).forEach(r => {
      console.log(`  ID: ${r.id} | PR#: ${r.prNumber} | Legacy: ${r.legacyStatus} | Current: ${r.currentUnified} | Expected: ${r.expectedUnified}`)
    })
    if (report.inconsistent.length > 20) {
      console.log(`  ... and ${report.inconsistent.length - 20} more`)
    }
  }
  
  return report
}

async function auditPOs(db) {
  console.log('\n' + '='.repeat(80))
  console.log('AUDITING POs (Purchase Orders)')
  console.log('='.repeat(80))
  
  const pos = await db.collection('purchaseorders').find({}).toArray()
  
  const report = {
    total: pos.length,
    nullUnifiedStatus: [],
    inconsistent: [],
    consistent: 0,
  }
  
  for (const po of pos) {
    if (!po.unified_po_status) {
      report.nullUnifiedStatus.push({
        id: po.id,
        poNumber: po.client_po_number,
        legacyStatus: po.po_status,
        expectedUnified: LEGACY_TO_UNIFIED_PO_STATUS[po.po_status] || 'CREATED',
      })
    } else {
      const expectedUnified = LEGACY_TO_UNIFIED_PO_STATUS[po.po_status] || 'CREATED'
      if (po.unified_po_status !== expectedUnified) {
        report.inconsistent.push({
          id: po.id,
          poNumber: po.client_po_number,
          legacyStatus: po.po_status,
          currentUnified: po.unified_po_status,
          expectedUnified,
        })
      } else {
        report.consistent++
      }
    }
  }
  
  console.log(`\nTotal POs: ${report.total}`)
  console.log(`Consistent: ${report.consistent}`)
  console.log(`Null unified_po_status: ${report.nullUnifiedStatus.length}`)
  console.log(`Inconsistent: ${report.inconsistent.length}`)
  
  if (report.nullUnifiedStatus.length > 0) {
    console.log('\n--- POs with NULL unified_po_status ---')
    report.nullUnifiedStatus.slice(0, 20).forEach(r => {
      console.log(`  ID: ${r.id} | PO#: ${r.poNumber} | Legacy: ${r.legacyStatus} | Expected: ${r.expectedUnified}`)
    })
    if (report.nullUnifiedStatus.length > 20) {
      console.log(`  ... and ${report.nullUnifiedStatus.length - 20} more`)
    }
  }
  
  if (report.inconsistent.length > 0) {
    console.log('\n--- POs with INCONSISTENT unified_po_status ---')
    report.inconsistent.slice(0, 20).forEach(r => {
      console.log(`  ID: ${r.id} | PO#: ${r.poNumber} | Legacy: ${r.legacyStatus} | Current: ${r.currentUnified} | Expected: ${r.expectedUnified}`)
    })
    if (report.inconsistent.length > 20) {
      console.log(`  ... and ${report.inconsistent.length - 20} more`)
    }
  }
  
  return report
}

async function auditShipments(db) {
  console.log('\n' + '='.repeat(80))
  console.log('AUDITING SHIPMENTS')
  console.log('='.repeat(80))
  
  const shipments = await db.collection('shipments').find({}).toArray()
  
  const report = {
    total: shipments.length,
    nullUnifiedStatus: [],
    inconsistent: [],
    consistent: 0,
  }
  
  for (const shipment of shipments) {
    if (!shipment.unified_shipment_status) {
      report.nullUnifiedStatus.push({
        id: shipment.shipmentId,
        prNumber: shipment.prNumber,
        legacyStatus: shipment.shipmentStatus,
        expectedUnified: LEGACY_TO_UNIFIED_SHIPMENT_STATUS[shipment.shipmentStatus] || 'CREATED',
      })
    } else {
      const expectedUnified = LEGACY_TO_UNIFIED_SHIPMENT_STATUS[shipment.shipmentStatus] || 'CREATED'
      if (shipment.unified_shipment_status !== expectedUnified) {
        report.inconsistent.push({
          id: shipment.shipmentId,
          prNumber: shipment.prNumber,
          legacyStatus: shipment.shipmentStatus,
          currentUnified: shipment.unified_shipment_status,
          expectedUnified,
        })
      } else {
        report.consistent++
      }
    }
  }
  
  console.log(`\nTotal Shipments: ${report.total}`)
  console.log(`Consistent: ${report.consistent}`)
  console.log(`Null unified_shipment_status: ${report.nullUnifiedStatus.length}`)
  console.log(`Inconsistent: ${report.inconsistent.length}`)
  
  if (report.nullUnifiedStatus.length > 0) {
    console.log('\n--- Shipments with NULL unified_shipment_status ---')
    report.nullUnifiedStatus.slice(0, 20).forEach(r => {
      console.log(`  ID: ${r.id} | PR#: ${r.prNumber} | Legacy: ${r.legacyStatus} | Expected: ${r.expectedUnified}`)
    })
    if (report.nullUnifiedStatus.length > 20) {
      console.log(`  ... and ${report.nullUnifiedStatus.length - 20} more`)
    }
  }
  
  if (report.inconsistent.length > 0) {
    console.log('\n--- Shipments with INCONSISTENT unified_shipment_status ---')
    report.inconsistent.slice(0, 20).forEach(r => {
      console.log(`  ID: ${r.id} | PR#: ${r.prNumber} | Legacy: ${r.legacyStatus} | Current: ${r.currentUnified} | Expected: ${r.expectedUnified}`)
    })
    if (report.inconsistent.length > 20) {
      console.log(`  ... and ${report.inconsistent.length - 20} more`)
    }
  }
  
  return report
}

async function auditGRNs(db) {
  console.log('\n' + '='.repeat(80))
  console.log('AUDITING GRNs (Goods Receipt Notes)')
  console.log('='.repeat(80))
  
  const grns = await db.collection('grns').find({}).toArray()
  
  const report = {
    total: grns.length,
    nullUnifiedStatus: [],
    inconsistent: [],
    consistent: 0,
  }
  
  for (const grn of grns) {
    // GRN has two legacy fields: status and grnStatus
    // Prefer grnStatus if available
    let expectedUnified
    if (grn.grnStatus === 'APPROVED') {
      expectedUnified = 'APPROVED'
    } else if (grn.grnStatus === 'RAISED') {
      expectedUnified = 'RAISED'
    } else {
      expectedUnified = LEGACY_TO_UNIFIED_GRN_STATUS[grn.status] || 'DRAFT'
    }
    
    if (!grn.unified_grn_status) {
      report.nullUnifiedStatus.push({
        id: grn.id,
        grnNumber: grn.grnNumber,
        legacyStatus: grn.status,
        legacyGrnStatus: grn.grnStatus,
        expectedUnified,
      })
    } else {
      if (grn.unified_grn_status !== expectedUnified) {
        report.inconsistent.push({
          id: grn.id,
          grnNumber: grn.grnNumber,
          legacyStatus: grn.status,
          legacyGrnStatus: grn.grnStatus,
          currentUnified: grn.unified_grn_status,
          expectedUnified,
        })
      } else {
        report.consistent++
      }
    }
  }
  
  console.log(`\nTotal GRNs: ${report.total}`)
  console.log(`Consistent: ${report.consistent}`)
  console.log(`Null unified_grn_status: ${report.nullUnifiedStatus.length}`)
  console.log(`Inconsistent: ${report.inconsistent.length}`)
  
  if (report.nullUnifiedStatus.length > 0) {
    console.log('\n--- GRNs with NULL unified_grn_status ---')
    report.nullUnifiedStatus.slice(0, 20).forEach(r => {
      console.log(`  ID: ${r.id} | GRN#: ${r.grnNumber} | Legacy: ${r.legacyStatus}/${r.legacyGrnStatus} | Expected: ${r.expectedUnified}`)
    })
    if (report.nullUnifiedStatus.length > 20) {
      console.log(`  ... and ${report.nullUnifiedStatus.length - 20} more`)
    }
  }
  
  if (report.inconsistent.length > 0) {
    console.log('\n--- GRNs with INCONSISTENT unified_grn_status ---')
    report.inconsistent.slice(0, 20).forEach(r => {
      console.log(`  ID: ${r.id} | GRN#: ${r.grnNumber} | Legacy: ${r.legacyStatus}/${r.legacyGrnStatus} | Current: ${r.currentUnified} | Expected: ${r.expectedUnified}`)
    })
    if (report.inconsistent.length > 20) {
      console.log(`  ... and ${report.inconsistent.length - 20} more`)
    }
  }
  
  return report
}

async function auditInvoices(db) {
  console.log('\n' + '='.repeat(80))
  console.log('AUDITING INVOICES')
  console.log('='.repeat(80))
  
  const invoices = await db.collection('invoices').find({}).toArray()
  
  const report = {
    total: invoices.length,
    nullUnifiedStatus: [],
    inconsistent: [],
    consistent: 0,
  }
  
  for (const invoice of invoices) {
    if (!invoice.unified_invoice_status) {
      report.nullUnifiedStatus.push({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        legacyStatus: invoice.invoiceStatus,
        expectedUnified: LEGACY_TO_UNIFIED_INVOICE_STATUS[invoice.invoiceStatus] || 'RAISED',
      })
    } else {
      const expectedUnified = LEGACY_TO_UNIFIED_INVOICE_STATUS[invoice.invoiceStatus] || 'RAISED'
      if (invoice.unified_invoice_status !== expectedUnified) {
        report.inconsistent.push({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          legacyStatus: invoice.invoiceStatus,
          currentUnified: invoice.unified_invoice_status,
          expectedUnified,
        })
      } else {
        report.consistent++
      }
    }
  }
  
  console.log(`\nTotal Invoices: ${report.total}`)
  console.log(`Consistent: ${report.consistent}`)
  console.log(`Null unified_invoice_status: ${report.nullUnifiedStatus.length}`)
  console.log(`Inconsistent: ${report.inconsistent.length}`)
  
  if (report.nullUnifiedStatus.length > 0) {
    console.log('\n--- Invoices with NULL unified_invoice_status ---')
    report.nullUnifiedStatus.slice(0, 20).forEach(r => {
      console.log(`  ID: ${r.id} | Invoice#: ${r.invoiceNumber} | Legacy: ${r.legacyStatus} | Expected: ${r.expectedUnified}`)
    })
    if (report.nullUnifiedStatus.length > 20) {
      console.log(`  ... and ${report.nullUnifiedStatus.length - 20} more`)
    }
  }
  
  if (report.inconsistent.length > 0) {
    console.log('\n--- Invoices with INCONSISTENT unified_invoice_status ---')
    report.inconsistent.slice(0, 20).forEach(r => {
      console.log(`  ID: ${r.id} | Invoice#: ${r.invoiceNumber} | Legacy: ${r.legacyStatus} | Current: ${r.currentUnified} | Expected: ${r.expectedUnified}`)
    })
    if (report.inconsistent.length > 20) {
      console.log(`  ... and ${report.inconsistent.length - 20} more`)
    }
  }
  
  return report
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
  console.log('║     MIGRATION SCRIPT #2 — STATUS NORMALIZATION AUDIT                         ║')
  console.log('║     READ-ONLY — No modifications will be made                                ║')
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
    const orderReport = await auditOrders(db)
    const prReport = await auditPRs(db)
    const poReport = await auditPOs(db)
    const shipmentReport = await auditShipments(db)
    const grnReport = await auditGRNs(db)
    const invoiceReport = await auditInvoices(db)
    
    // Summary
    console.log('\n' + '═'.repeat(80))
    console.log('AUDIT SUMMARY')
    console.log('═'.repeat(80))
    
    const totalRecords = orderReport.total + prReport.total + poReport.total + 
                         shipmentReport.total + grnReport.total + invoiceReport.total
    const totalNull = orderReport.nullUnifiedStatus.length + prReport.nullUnifiedPRStatus.length +
                      poReport.nullUnifiedStatus.length + shipmentReport.nullUnifiedStatus.length +
                      grnReport.nullUnifiedStatus.length + invoiceReport.nullUnifiedStatus.length
    const totalInconsistent = orderReport.inconsistent.length + prReport.inconsistent.length +
                              poReport.inconsistent.length + shipmentReport.inconsistent.length +
                              grnReport.inconsistent.length + invoiceReport.inconsistent.length
    const totalConsistent = orderReport.consistent + prReport.consistent + poReport.consistent +
                            shipmentReport.consistent + grnReport.consistent + invoiceReport.consistent
    
    console.log(`
┌─────────────────────┬─────────┬───────────────┬──────────────┬────────────┐
│ Entity              │ Total   │ NULL Unified  │ Inconsistent │ Consistent │
├─────────────────────┼─────────┼───────────────┼──────────────┼────────────┤
│ Orders (non-PR)     │ ${String(orderReport.total).padStart(7)} │ ${String(orderReport.nullUnifiedStatus.length).padStart(13)} │ ${String(orderReport.inconsistent.length).padStart(12)} │ ${String(orderReport.consistent).padStart(10)} │
│ PRs                 │ ${String(prReport.total).padStart(7)} │ ${String(prReport.nullUnifiedPRStatus.length).padStart(13)} │ ${String(prReport.inconsistent.length).padStart(12)} │ ${String(prReport.consistent).padStart(10)} │
│ POs                 │ ${String(poReport.total).padStart(7)} │ ${String(poReport.nullUnifiedStatus.length).padStart(13)} │ ${String(poReport.inconsistent.length).padStart(12)} │ ${String(poReport.consistent).padStart(10)} │
│ Shipments           │ ${String(shipmentReport.total).padStart(7)} │ ${String(shipmentReport.nullUnifiedStatus.length).padStart(13)} │ ${String(shipmentReport.inconsistent.length).padStart(12)} │ ${String(shipmentReport.consistent).padStart(10)} │
│ GRNs                │ ${String(grnReport.total).padStart(7)} │ ${String(grnReport.nullUnifiedStatus.length).padStart(13)} │ ${String(grnReport.inconsistent.length).padStart(12)} │ ${String(grnReport.consistent).padStart(10)} │
│ Invoices            │ ${String(invoiceReport.total).padStart(7)} │ ${String(invoiceReport.nullUnifiedStatus.length).padStart(13)} │ ${String(invoiceReport.inconsistent.length).padStart(12)} │ ${String(invoiceReport.consistent).padStart(10)} │
├─────────────────────┼─────────┼───────────────┼──────────────┼────────────┤
│ TOTAL               │ ${String(totalRecords).padStart(7)} │ ${String(totalNull).padStart(13)} │ ${String(totalInconsistent).padStart(12)} │ ${String(totalConsistent).padStart(10)} │
└─────────────────────┴─────────┴───────────────┴──────────────┴────────────┘
`)
    
    if (totalNull > 0) {
      console.log(`⚠️  ${totalNull} records need unified_*_status fields populated`)
      console.log('   Run migration-03-status-consistency-repair.js to fix')
    }
    
    if (totalInconsistent > 0) {
      console.log(`⚠️  ${totalInconsistent} records have inconsistent unified_*_status values`)
      console.log('   Review and decide whether to repair or keep current values')
    }
    
    if (totalNull === 0 && totalInconsistent === 0) {
      console.log('✅ All records have consistent unified_*_status fields')
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
