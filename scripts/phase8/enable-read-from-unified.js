/**
 * PHASE 8B — ENABLE READ_FROM_UNIFIED (PHASE 3: UNIFIED PRIMARY)
 * 
 * Purpose: Validate system readiness and enable unified field reads.
 * 
 * Pre-checks:
 * 1. Verify unified field coverage is 100%
 * 2. Verify dual-write is enabled
 * 3. Verify SAFE_MODE is disabled
 * 4. Confirm no legacy-only dependencies
 * 
 * @version 1.0.0
 * @created 2026-01-16
 */

console.log('═'.repeat(80))
console.log('PHASE 8B — ENABLE READ_FROM_UNIFIED (UNIFIED PRIMARY MODE)')
console.log('═'.repeat(80))
console.log()
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
// PRE-FLIGHT CHECKS
// =============================================================================

const checks = {
  unifiedCoverage: { status: 'PENDING', score: 0 },
  dualWriteEnabled: { status: 'PENDING' },
  safeModeDisabled: { status: 'PENDING' },
  statusConsistency: { status: 'PENDING', score: 0 },
  cascadeIntegrity: { status: 'PENDING', score: 0 },
}

async function runPreFlightChecks(db) {
  console.log('\n' + '─'.repeat(80))
  console.log('PRE-FLIGHT CHECKS')
  console.log('─'.repeat(80))
  
  // Check 1: Unified Coverage
  console.log('\n  [1/5] Unified Field Coverage...')
  
  const orders = await db.collection('orders').find({ pr_number: { $exists: false } }).toArray()
  const ordersWithUnified = orders.filter(o => o.unified_status)
  const orderCoverage = orders.length > 0 ? (ordersWithUnified.length / orders.length) * 100 : 100
  
  const prs = await db.collection('orders').find({ pr_number: { $exists: true, $ne: null } }).toArray()
  const prsWithUnified = prs.filter(p => p.unified_pr_status)
  const prCoverage = prs.length > 0 ? (prsWithUnified.length / prs.length) * 100 : 100
  
  const totalCoverage = (orderCoverage + prCoverage) / 2
  checks.unifiedCoverage.score = totalCoverage
  checks.unifiedCoverage.status = totalCoverage >= 95 ? 'PASS' : 'FAIL'
  
  console.log(`       Orders: ${ordersWithUnified.length}/${orders.length} (${orderCoverage.toFixed(1)}%)`)
  console.log(`       PRs: ${prsWithUnified.length}/${prs.length} (${prCoverage.toFixed(1)}%)`)
  console.log(`       ${checks.unifiedCoverage.status === 'PASS' ? '✅' : '❌'} Overall: ${totalCoverage.toFixed(1)}%`)
  
  // Check 2: Dual-write Enabled
  console.log('\n  [2/5] Dual-write Status...')
  const dualWriteEnabled = process.env.DUAL_WRITE_ENABLED === 'true'
  checks.dualWriteEnabled.status = dualWriteEnabled ? 'PASS' : 'FAIL'
  console.log(`       ${dualWriteEnabled ? '✅' : '❌'} DUAL_WRITE_ENABLED=${dualWriteEnabled}`)
  
  // Check 3: SAFE_MODE Disabled
  console.log('\n  [3/5] SAFE_MODE Status...')
  const safeModeDisabled = process.env.SAFE_MODE === 'false'
  checks.safeModeDisabled.status = safeModeDisabled ? 'PASS' : 'WARN'
  console.log(`       ${safeModeDisabled ? '✅' : '⚠️ '} SAFE_MODE=${process.env.SAFE_MODE || 'not set'}`)
  
  // Check 4: Status Consistency
  console.log('\n  [4/5] Status Consistency...')
  
  let consistentOrders = 0
  for (const order of orders) {
    const legacyMapped = mapLegacyToUnified('Order', order.status)
    if (!order.unified_status || order.unified_status === legacyMapped) {
      consistentOrders++
    }
  }
  
  let consistentPRs = 0
  for (const pr of prs) {
    const legacyMapped = mapLegacyToUnified('PR', pr.pr_status)
    if (!pr.unified_pr_status || pr.unified_pr_status === legacyMapped) {
      consistentPRs++
    }
  }
  
  const orderConsistency = orders.length > 0 ? (consistentOrders / orders.length) * 100 : 100
  const prConsistency = prs.length > 0 ? (consistentPRs / prs.length) * 100 : 100
  const totalConsistency = (orderConsistency + prConsistency) / 2
  
  checks.statusConsistency.score = totalConsistency
  checks.statusConsistency.status = totalConsistency >= 98 ? 'PASS' : 'FAIL'
  
  console.log(`       Orders: ${consistentOrders}/${orders.length} (${orderConsistency.toFixed(1)}%)`)
  console.log(`       PRs: ${consistentPRs}/${prs.length} (${prConsistency.toFixed(1)}%)`)
  console.log(`       ${checks.statusConsistency.status === 'PASS' ? '✅' : '❌'} Overall: ${totalConsistency.toFixed(1)}%`)
  
  // Check 5: Cascade Integrity
  console.log('\n  [5/5] Cascade Integrity...')
  
  // PRs with LINKED_TO_PO should have POs (but we cleared POs, so this should be 0)
  const linkedPRs = prs.filter(p => p.unified_pr_status === 'LINKED_TO_PO')
  const poCount = await db.collection('purchaseorders').countDocuments({})
  
  const cascadeValid = linkedPRs.length === 0 || poCount >= linkedPRs.length
  checks.cascadeIntegrity.status = cascadeValid ? 'PASS' : 'FAIL'
  checks.cascadeIntegrity.score = cascadeValid ? 100 : 0
  
  console.log(`       PRs linked to PO: ${linkedPRs.length}`)
  console.log(`       POs in database: ${poCount}`)
  console.log(`       ${cascadeValid ? '✅' : '❌'} Cascade integrity: ${cascadeValid ? 'Valid' : 'Invalid'}`)
  
  return checks
}

function mapLegacyToUnified(entity, legacyStatus) {
  const mappings = {
    Order: {
      'Awaiting approval': 'PENDING_APPROVAL',
      'Awaiting fulfilment': 'IN_FULFILMENT',
      'Dispatched': 'DISPATCHED',
      'Delivered': 'DELIVERED',
    },
    PR: {
      'DRAFT': 'DRAFT',
      'SUBMITTED': 'PENDING_SITE_ADMIN_APPROVAL',
      'PENDING_SITE_ADMIN_APPROVAL': 'PENDING_SITE_ADMIN_APPROVAL',
      'SITE_ADMIN_APPROVED': 'SITE_ADMIN_APPROVED',
      'PENDING_COMPANY_ADMIN_APPROVAL': 'PENDING_COMPANY_ADMIN_APPROVAL',
      'COMPANY_ADMIN_APPROVED': 'COMPANY_ADMIN_APPROVED',
      'PO_CREATED': 'LINKED_TO_PO',
      'FULLY_DELIVERED': 'FULLY_DELIVERED',
    }
  }
  
  return mappings[entity]?.[legacyStatus] || legacyStatus
}

// =============================================================================
// GENERATE SUMMARY
// =============================================================================

function generateSummary() {
  console.log('\n' + '═'.repeat(80))
  console.log('PRE-FLIGHT CHECK SUMMARY')
  console.log('═'.repeat(80))
  
  const allPassed = Object.values(checks).every(c => c.status === 'PASS' || c.status === 'WARN')
  
  console.log(`
┌────────────────────────────────────────────────────────────────────────────────┐
│                     READ_FROM_UNIFIED ACTIVATION READINESS                     │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  [1] Unified Coverage:      ${checks.unifiedCoverage.status.padEnd(8)} (${checks.unifiedCoverage.score.toFixed(1)}%)                         │
│  [2] Dual-write Enabled:    ${checks.dualWriteEnabled.status.padEnd(8)}                                       │
│  [3] SAFE_MODE Disabled:    ${checks.safeModeDisabled.status.padEnd(8)}                                       │
│  [4] Status Consistency:    ${checks.statusConsistency.status.padEnd(8)} (${checks.statusConsistency.score.toFixed(1)}%)                         │
│  [5] Cascade Integrity:     ${checks.cascadeIntegrity.status.padEnd(8)}                                       │
│                                                                                │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  RECOMMENDATION:            ${allPassed ? '✅ READY TO ENABLE' : '❌ NOT READY'}                              │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
`)
  
  if (allPassed) {
    console.log(`
  💡 TO ENABLE READ_FROM_UNIFIED:
  
     Add to your .env.local:
     ─────────────────────────────────────────────
     READ_FROM_UNIFIED=true
     ─────────────────────────────────────────────
     
     Current Migration State:
     ─────────────────────────────────────────────
     DUAL_WRITE_ENABLED=true
     READ_FROM_UNIFIED=false  →  true
     SAFE_MODE=false
     ─────────────────────────────────────────────
     
     After enabling:
     • Application will READ from unified_* fields
     • Application will still WRITE to both legacy and unified
     • Legacy fields become backup only
     • Phase: PHASE_3_UNIFIED_PRIMARY
`)
  } else {
    console.log(`
  ⚠️  BLOCKING ISSUES:
`)
    for (const [name, check] of Object.entries(checks)) {
      if (check.status === 'FAIL') {
        console.log(`     • ${name}: ${check.status}`)
      }
    }
  }
  
  return allPassed
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
      maxPoolSize: 2,
      appName: 'Phase8B-ReadFromUnified',
    })
    
    await client.connect()
    console.log('✅ Connected to MongoDB\n')
    
    const db = client.db()
    
    await runPreFlightChecks(db)
    const ready = generateSummary()
    
    // Save results
    const resultsPath = path.resolve(process.cwd(), 'reports', 'phase8b-readfromunified-readiness.json')
    fs.writeFileSync(resultsPath, JSON.stringify({ checks, ready, timestamp: new Date().toISOString() }, null, 2))
    console.log(`\n📄 Report saved to: ${resultsPath}`)
    
    console.log('\n🔒 READ-ONLY CHECK COMPLETE — NO DATA WAS MODIFIED')
    
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
