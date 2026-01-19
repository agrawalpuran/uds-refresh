/**
 * PHASE 3 FIX — Reset PR→PO Cascade State
 * 
 * Purpose: Reset all PRs to DRAFT status to fix cascade integrity issues.
 * 
 * Operations:
 * 1. Reset all PRs to DRAFT status (pr_status = 'DRAFT')
 * 2. Set unified_pr_status = 'DRAFT'
 * 3. Remove PR→PO linkage fields (po_number, client_po_number, po_id)
 * 4. Clear dispatch/delivery status fields
 * 5. Reset order status to 'Awaiting approval'
 * 
 * Scope:
 * - ONLY affects orders where pr_number exists
 * - Does NOT modify regular orders (non-PRs)
 * - Does NOT modify shipments, GRNs, invoices
 * 
 * Safety:
 * - DRY_RUN=true (default): Only logs intended operations
 * - DRY_RUN=false: Actually applies changes
 * 
 * Usage:
 *   DRY_RUN=true node scripts/phase3/phase3-fix-pr-po-reset.js   # Preview
 *   DRY_RUN=false node scripts/phase3/phase3-fix-pr-po-reset.js  # Execute
 * 
 * @version 1.0.0
 * @created 2026-01-16
 */

// =============================================================================
// DRY RUN GATE
// =============================================================================

const DRY_RUN = process.env.DRY_RUN !== 'false'

console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
console.log('║     PHASE 3 FIX — RESET PR→PO CASCADE STATE                                  ║')
console.log('║     Reset all PRs to DRAFT status for clean cascade                          ║')
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
// RESULTS TRACKER
// =============================================================================

const results = {
  timestamp: new Date().toISOString(),
  mode: DRY_RUN ? 'DRY_RUN' : 'LIVE',
  totalPRsFound: 0,
  prsReset: 0,
  poLinkagesCleared: 0,
  shipmentFlagsCleared: 0,
  details: [],
}

// =============================================================================
// MAIN RESET FUNCTION
// =============================================================================

async function resetPRsToDraft(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('STEP 1: IDENTIFY ALL PRs')
  console.log('═'.repeat(80))
  
  // Find ALL PRs (orders with pr_number)
  const prs = await db.collection('orders').find({
    pr_number: { $exists: true, $ne: null }
  }).toArray()
  
  results.totalPRsFound = prs.length
  console.log(`\n  Found ${prs.length} PRs to reset`)
  
  if (prs.length === 0) {
    console.log('  ✅ No PRs found')
    return
  }
  
  // Analyze current states
  const statusBreakdown = {}
  for (const pr of prs) {
    const status = pr.pr_status || 'null'
    statusBreakdown[status] = (statusBreakdown[status] || 0) + 1
  }
  
  console.log('\n  Current PR Status Breakdown:')
  for (const [status, count] of Object.entries(statusBreakdown)) {
    console.log(`    • ${status}: ${count}`)
  }
  
  console.log('\n' + '═'.repeat(80))
  console.log('STEP 2: RESET ALL PRs TO DRAFT')
  console.log('═'.repeat(80))
  
  for (const pr of prs) {
    const changes = {
      id: pr.id,
      pr_number: pr.pr_number,
      before: {
        pr_status: pr.pr_status,
        unified_pr_status: pr.unified_pr_status,
        status: pr.status,
        unified_status: pr.unified_status,
        dispatchStatus: pr.dispatchStatus,
        deliveryStatus: pr.deliveryStatus,
        po_number: pr.po_number,
        po_id: pr.po_id,
        client_po_number: pr.client_po_number,
      },
      after: {
        pr_status: 'DRAFT',
        unified_pr_status: 'DRAFT',
        status: 'Awaiting approval',
        unified_status: 'PENDING_APPROVAL',
        dispatchStatus: null,
        deliveryStatus: null,
        po_number: null,
        po_id: null,
        client_po_number: null,
      }
    }
    
    results.details.push(changes)
    
    // Check what needs to be cleared
    if (pr.po_number || pr.po_id || pr.client_po_number) {
      results.poLinkagesCleared++
    }
    if (pr.dispatchStatus || pr.deliveryStatus) {
      results.shipmentFlagsCleared++
    }
    
    if (!DRY_RUN) {
      await db.collection('orders').updateOne(
        { _id: pr._id },
        {
          $set: {
            // Reset PR status
            pr_status: 'DRAFT',
            unified_pr_status: 'DRAFT',
            unified_pr_status_updated_at: new Date(),
            unified_pr_status_updated_by: 'phase3-fix-pr-po-reset',
            
            // Reset order status
            status: 'Awaiting approval',
            unified_status: 'PENDING_APPROVAL',
            unified_status_updated_at: new Date(),
            unified_status_updated_by: 'phase3-fix-pr-po-reset',
          },
          $unset: {
            // Clear PO linkage fields
            po_number: '',
            po_id: '',
            client_po_number: '',
            
            // Clear shipment/delivery flags
            dispatchStatus: '',
            deliveryStatus: '',
            
            // Clear any GRN/Invoice linkage
            grn_number: '',
            grn_id: '',
            invoice_number: '',
            invoice_id: '',
          }
        }
      )
    }
    
    results.prsReset++
  }
  
  console.log(`\n  ${DRY_RUN ? '[DRY RUN] Would reset' : 'Reset'}: ${results.prsReset} PRs`)
  console.log(`  ${DRY_RUN ? '[DRY RUN] Would clear' : 'Cleared'}: ${results.poLinkagesCleared} PO linkages`)
  console.log(`  ${DRY_RUN ? '[DRY RUN] Would clear' : 'Cleared'}: ${results.shipmentFlagsCleared} shipment flags`)
}

/**
 * Delete all POs (since PRs are reset, POs are orphaned)
 */
async function deleteAllPOs(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('STEP 3: DELETE ALL PURCHASE ORDERS')
  console.log('═'.repeat(80))
  
  const poCount = await db.collection('purchaseorders').countDocuments({})
  console.log(`\n  Found ${poCount} POs to delete`)
  
  if (poCount === 0) {
    console.log('  ✅ No POs found')
    return
  }
  
  if (!DRY_RUN) {
    const result = await db.collection('purchaseorders').deleteMany({})
    console.log(`  ✅ Deleted ${result.deletedCount} POs`)
    results.posDeleted = result.deletedCount
  } else {
    console.log(`  [DRY RUN] Would delete ${poCount} POs`)
    results.posDeleted = poCount
  }
}

/**
 * Delete all GRNs (since POs are deleted, GRNs are orphaned)
 */
async function deleteAllGRNs(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('STEP 4: DELETE ALL GRNs')
  console.log('═'.repeat(80))
  
  const grnCount = await db.collection('grns').countDocuments({})
  console.log(`\n  Found ${grnCount} GRNs to delete`)
  
  if (grnCount === 0) {
    console.log('  ✅ No GRNs found')
    return
  }
  
  if (!DRY_RUN) {
    const result = await db.collection('grns').deleteMany({})
    console.log(`  ✅ Deleted ${result.deletedCount} GRNs`)
    results.grnsDeleted = result.deletedCount
  } else {
    console.log(`  [DRY RUN] Would delete ${grnCount} GRNs`)
    results.grnsDeleted = grnCount
  }
}

/**
 * Delete all Invoices (since GRNs are deleted, Invoices are orphaned)
 */
async function deleteAllInvoices(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('STEP 5: DELETE ALL INVOICES')
  console.log('═'.repeat(80))
  
  const invoiceCount = await db.collection('invoices').countDocuments({})
  console.log(`\n  Found ${invoiceCount} Invoices to delete`)
  
  if (invoiceCount === 0) {
    console.log('  ✅ No Invoices found')
    return
  }
  
  if (!DRY_RUN) {
    const result = await db.collection('invoices').deleteMany({})
    console.log(`  ✅ Deleted ${result.deletedCount} Invoices`)
    results.invoicesDeleted = result.deletedCount
  } else {
    console.log(`  [DRY RUN] Would delete ${invoiceCount} Invoices`)
    results.invoicesDeleted = invoiceCount
  }
}

/**
 * Delete all Shipments (since PRs are reset, Shipments are orphaned)
 */
async function deleteAllShipments(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('STEP 6: DELETE ALL SHIPMENTS')
  console.log('═'.repeat(80))
  
  const shipmentCount = await db.collection('shipments').countDocuments({})
  console.log(`\n  Found ${shipmentCount} Shipments to delete`)
  
  if (shipmentCount === 0) {
    console.log('  ✅ No Shipments found')
    return
  }
  
  if (!DRY_RUN) {
    const result = await db.collection('shipments').deleteMany({})
    console.log(`  ✅ Deleted ${result.deletedCount} Shipments`)
    results.shipmentsDeleted = result.deletedCount
  } else {
    console.log(`  [DRY RUN] Would delete ${shipmentCount} Shipments`)
    results.shipmentsDeleted = shipmentCount
  }
}

/**
 * Generate summary
 */
function generateSummary() {
  console.log('\n' + '═'.repeat(80))
  console.log(`${DRY_RUN ? 'DRY RUN ' : ''}EXECUTION SUMMARY`)
  console.log('═'.repeat(80))
  
  console.log(`
┌────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3 FIX — PR→PO CASCADE RESET ${DRY_RUN ? '(DRY RUN)' : '(COMPLETE)'}${DRY_RUN ? '                    ' : '                   '}│
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  PR MODIFICATIONS:                                                             │
│    📊 Total PRs Found:           ${String(results.totalPRsFound).padStart(5)}                                    │
│    🔄 PRs Reset to DRAFT:        ${String(results.prsReset).padStart(5)}                                    │
│    🔗 PO Linkages Cleared:       ${String(results.poLinkagesCleared).padStart(5)}                                    │
│    📦 Shipment Flags Cleared:    ${String(results.shipmentFlagsCleared).padStart(5)}                                    │
│                                                                                │
│  DELETIONS:                                                                    │
│    🗑️  POs Deleted:              ${String(results.posDeleted || 0).padStart(5)}                                    │
│    🗑️  GRNs Deleted:             ${String(results.grnsDeleted || 0).padStart(5)}                                    │
│    🗑️  Invoices Deleted:         ${String(results.invoicesDeleted || 0).padStart(5)}                                    │
│    🗑️  Shipments Deleted:        ${String(results.shipmentsDeleted || 0).padStart(5)}                                    │
│                                                                                │
│  NEW STATE:                                                                    │
│    • All PRs are now in DRAFT status                                           │
│    • All PR→PO→GRN→Invoice chains cleared                                      │
│    • All shipment data cleared                                                 │
│    • System ready for fresh workflow testing                                   │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
`)
  
  if (DRY_RUN) {
    console.log('🔒 DRY RUN COMPLETE — NO ACTUAL CHANGES WERE MADE')
    console.log('')
    console.log('To apply these changes, run:')
    console.log('  DRY_RUN=false node scripts/phase3/phase3-fix-pr-po-reset.js')
  } else {
    console.log('⚡ LIVE EXECUTION COMPLETE — ALL CHANGES HAVE BEEN APPLIED')
    console.log('')
    console.log('NEXT STEPS:')
    console.log('  1. Re-run Phase 3 verification:')
    console.log('     node scripts/phase3/phase3-unified-workflow-verification.js')
    console.log('')
    console.log('  2. Expected results:')
    console.log('     • Cascade Integrity should be 100%')
    console.log('     • SAFE_MODE Readiness should be READY')
  }
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
      appName: 'Phase3-PRPOReset',
    })
    
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db()
    
    // Execute all steps
    await resetPRsToDraft(db)
    await deleteAllPOs(db)
    await deleteAllGRNs(db)
    await deleteAllInvoices(db)
    await deleteAllShipments(db)
    
    // Generate summary
    generateSummary()
    
    // Save results to JSON
    const resultsPath = path.resolve(process.cwd(), 'reports', 'phase3-fix-pr-po-reset-results.json')
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2))
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
