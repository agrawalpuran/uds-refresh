/**
 * Cascade Integrity Audit — DRY RUN
 * 
 * Purpose: Analyze PRs with FULLY_DELIVERED status but missing shipment records.
 * Identifies root causes and recommends fixes.
 * 
 * Safety:
 * - DRY_RUN mode ONLY - no writes allowed
 * - Read-only MongoDB connection
 * - Outputs detailed analysis report
 * 
 * Usage: DRY_RUN=true node scripts/phase2/cascade-integrity-audit.js
 * 
 * @version 1.0.0
 * @created 2026-01-16
 */

// =============================================================================
// DRY RUN GATE - MUST BE FIRST
// =============================================================================

const DRY_RUN = process.env.DRY_RUN === 'true'

console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
console.log('║     CASCADE INTEGRITY AUDIT — DRY RUN (NO MODIFICATIONS)                     ║')
console.log('║     Analyzing PRs with delivery status but missing shipments                 ║')
console.log('╚══════════════════════════════════════════════════════════════════════════════╝')
console.log()
console.log(`Mode: ${DRY_RUN ? '🔒 DRY RUN (Analysis Only)' : '⚠️  BLOCKED (DRY_RUN not set)'}`)
console.log(`Timestamp: ${new Date().toISOString()}`)
console.log()

if (!DRY_RUN) {
  console.error('❌ ERROR: DRY_RUN must be set to "true" to run this audit.')
  console.error('   Set environment variable: DRY_RUN=true\n')
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
// ROOT CAUSE CATEGORIES
// =============================================================================

const ROOT_CAUSES = {
  MISSING_SHIPMENT_RECORD: 'Missing Shipment Record',
  SHIPMENT_NOT_DELIVERED: 'Shipment Exists But Not Delivered',
  MANUAL_STATUS_OVERRIDE: 'Manual Status Override (no shipment flow)',
  STATUS_MISMATCH: 'Legacy/Unified Status Mismatch',
  ORPHANED_PR: 'Orphaned PR (no valid workflow)',
  DATA_MIGRATION_ARTIFACT: 'Data Migration Artifact',
  PARTIAL_DELIVERY: 'Partial Delivery Issue',
  UNKNOWN: 'Unknown Root Cause',
}

const RECOMMENDATIONS = {
  MISSING_SHIPMENT_RECORD: 'Create shipment record retroactively OR mark PR as manually fulfilled',
  SHIPMENT_NOT_DELIVERED: 'Update shipment status to DELIVERED to complete cascade',
  MANUAL_STATUS_OVERRIDE: 'Document as manual fulfillment, no action needed if intentional',
  STATUS_MISMATCH: 'Run status consistency repair to align unified_pr_status',
  ORPHANED_PR: 'Archive or delete if test data; investigate if production data',
  DATA_MIGRATION_ARTIFACT: 'Document as legacy data; consider cleanup migration',
  PARTIAL_DELIVERY: 'Verify all items delivered; update status if complete',
  UNKNOWN: 'Manual investigation required',
}

// =============================================================================
// ANALYSIS FUNCTIONS
// =============================================================================

async function analyzeProblematicPRs(db) {
  console.log('\n' + '═'.repeat(80))
  console.log('PHASE 1: IDENTIFYING PROBLEMATIC PRs')
  console.log('═'.repeat(80))
  
  // Find PRs with delivery status but unified_pr_status != FULLY_DELIVERED
  const problematicPRs = await db.collection('orders').find({
    pr_number: { $exists: true, $ne: null },
    $or: [
      { pr_status: 'FULLY_DELIVERED' },
      { deliveryStatus: 'DELIVERED' },
      { dispatchStatus: 'SHIPPED' },
    ],
    unified_pr_status: { $nin: ['FULLY_DELIVERED', null] }
  }).toArray()
  
  console.log(`\nFound ${problematicPRs.length} PRs with potential cascade issues`)
  
  // Also find PRs with shipment status but no shipment record
  const allShipmentPRNumbers = await db.collection('shipments').distinct('prNumber')
  const prsWithShipmentStatus = await db.collection('orders').find({
    pr_number: { $exists: true, $ne: null },
    pr_number: { $nin: allShipmentPRNumbers },
    $or: [
      { dispatchStatus: 'SHIPPED' },
      { dispatchStatus: { $exists: true, $ne: null, $ne: '' } },
      { unified_pr_status: 'IN_SHIPMENT' },
    ]
  }).toArray()
  
  console.log(`Found ${prsWithShipmentStatus.length} PRs with shipment status but no shipment record`)
  
  // Combine and deduplicate
  const allProblematicPRs = new Map()
  
  for (const pr of problematicPRs) {
    allProblematicPRs.set(pr._id.toString(), pr)
  }
  for (const pr of prsWithShipmentStatus) {
    if (!allProblematicPRs.has(pr._id.toString())) {
      allProblematicPRs.set(pr._id.toString(), pr)
    }
  }
  
  return Array.from(allProblematicPRs.values())
}

async function enrichPRData(db, prs) {
  console.log('\n' + '═'.repeat(80))
  console.log('PHASE 2: ENRICHING PR DATA')
  console.log('═'.repeat(80))
  
  const enrichedPRs = []
  
  for (const pr of prs) {
    const enriched = {
      // Identifiers
      _id: pr._id,
      id: pr.id,
      pr_number: pr.pr_number,
      
      // Legacy Status Fields
      legacy: {
        status: pr.status,
        pr_status: pr.pr_status,
        dispatchStatus: pr.dispatchStatus,
        deliveryStatus: pr.deliveryStatus,
      },
      
      // Unified Status Fields
      unified: {
        unified_status: pr.unified_status,
        unified_pr_status: pr.unified_pr_status,
        unified_status_updated_at: pr.unified_status_updated_at,
        unified_status_updated_by: pr.unified_status_updated_by,
        unified_pr_status_updated_at: pr.unified_pr_status_updated_at,
        unified_pr_status_updated_by: pr.unified_pr_status_updated_by,
      },
      
      // Metadata
      metadata: {
        companyId: pr.companyId,
        vendorId: pr.vendorId,
        employeeId: pr.employeeId,
        createdAt: pr.createdAt,
        updatedAt: pr.updatedAt,
      },
      
      // Shipment Info (to be populated)
      shipment: null,
      
      // Analysis Results (to be populated)
      analysis: {
        hasShipment: false,
        shipmentStatus: null,
        rootCause: null,
        recommendation: null,
        conversionType: null, // 'manual' or 'auto' or 'unknown'
        severity: null, // 'critical', 'major', 'minor'
      }
    }
    
    // Check for shipment
    const shipment = await db.collection('shipments').findOne({
      prNumber: pr.pr_number
    })
    
    if (shipment) {
      enriched.analysis.hasShipment = true
      enriched.analysis.shipmentStatus = shipment.shipmentStatus
      enriched.shipment = {
        shipmentId: shipment.shipmentId,
        prNumber: shipment.prNumber,
        shipmentStatus: shipment.shipmentStatus,
        courierStatus: shipment.courierStatus,
        unified_shipment_status: shipment.unified_shipment_status,
        createdAt: shipment.createdAt,
        updatedAt: shipment.updatedAt,
      }
    }
    
    // Determine conversion type
    if (enriched.unified.unified_pr_status_updated_by) {
      const updatedBy = enriched.unified.unified_pr_status_updated_by
      if (updatedBy.includes('migration') || updatedBy.includes('script')) {
        enriched.analysis.conversionType = 'migration'
      } else if (updatedBy.includes('dual-write') || updatedBy.includes('cascade')) {
        enriched.analysis.conversionType = 'auto'
      } else if (updatedBy.includes('admin') || updatedBy.includes('manual')) {
        enriched.analysis.conversionType = 'manual'
      } else {
        enriched.analysis.conversionType = 'unknown'
      }
    } else {
      enriched.analysis.conversionType = 'unknown'
    }
    
    enrichedPRs.push(enriched)
  }
  
  console.log(`Enriched ${enrichedPRs.length} PRs with shipment and metadata`)
  
  return enrichedPRs
}

function analyzeRootCauses(enrichedPRs) {
  console.log('\n' + '═'.repeat(80))
  console.log('PHASE 3: ROOT CAUSE ANALYSIS')
  console.log('═'.repeat(80))
  
  for (const pr of enrichedPRs) {
    const { legacy, unified, analysis, shipment } = pr
    
    // Determine root cause
    if (!analysis.hasShipment) {
      // No shipment record exists
      if (legacy.deliveryStatus === 'DELIVERED' || legacy.pr_status === 'FULLY_DELIVERED') {
        // Has delivery status but no shipment - likely manual override
        pr.analysis.rootCause = ROOT_CAUSES.MANUAL_STATUS_OVERRIDE
        pr.analysis.severity = 'minor'
      } else if (legacy.dispatchStatus === 'SHIPPED') {
        // Claims shipped but no shipment record
        pr.analysis.rootCause = ROOT_CAUSES.MISSING_SHIPMENT_RECORD
        pr.analysis.severity = 'major'
      } else {
        pr.analysis.rootCause = ROOT_CAUSES.ORPHANED_PR
        pr.analysis.severity = 'minor'
      }
    } else {
      // Shipment exists
      if (shipment.shipmentStatus !== 'Delivered' && shipment.shipmentStatus !== 'DELIVERED') {
        // Shipment not delivered but PR claims delivered
        pr.analysis.rootCause = ROOT_CAUSES.SHIPMENT_NOT_DELIVERED
        pr.analysis.severity = 'major'
      } else if (unified.unified_pr_status !== 'FULLY_DELIVERED') {
        // Shipment delivered but unified status not updated
        pr.analysis.rootCause = ROOT_CAUSES.STATUS_MISMATCH
        pr.analysis.severity = 'critical'
      } else {
        pr.analysis.rootCause = ROOT_CAUSES.UNKNOWN
        pr.analysis.severity = 'minor'
      }
    }
    
    // Check for migration artifacts
    if (pr.analysis.conversionType === 'migration' && !analysis.hasShipment) {
      pr.analysis.rootCause = ROOT_CAUSES.DATA_MIGRATION_ARTIFACT
      pr.analysis.severity = 'minor'
    }
    
    // Set recommendation
    pr.analysis.recommendation = RECOMMENDATIONS[
      Object.keys(ROOT_CAUSES).find(key => ROOT_CAUSES[key] === pr.analysis.rootCause)
    ] || RECOMMENDATIONS.UNKNOWN
  }
  
  return enrichedPRs
}

function generateReport(enrichedPRs) {
  console.log('\n' + '═'.repeat(80))
  console.log('CASCADE INTEGRITY AUDIT REPORT')
  console.log('═'.repeat(80))
  
  // ========================
  // DETAILED PR LISTING
  // ========================
  console.log('\n' + '─'.repeat(80))
  console.log('SECTION A: DETAILED PR ANALYSIS')
  console.log('─'.repeat(80))
  
  enrichedPRs.forEach((pr, index) => {
    console.log(`\n┌─ PR #${index + 1} ──────────────────────────────────────────────────────────────┐`)
    console.log(`│ ID: ${pr.id}`)
    console.log(`│ PR Number: ${pr.pr_number}`)
    console.log(`│`)
    console.log(`│ LEGACY STATUS FIELDS:`)
    console.log(`│   status:         ${pr.legacy.status || '(null)'}`)
    console.log(`│   pr_status:      ${pr.legacy.pr_status || '(null)'}`)
    console.log(`│   dispatchStatus: ${pr.legacy.dispatchStatus || '(null)'}`)
    console.log(`│   deliveryStatus: ${pr.legacy.deliveryStatus || '(null)'}`)
    console.log(`│`)
    console.log(`│ UNIFIED STATUS FIELDS:`)
    console.log(`│   unified_status:    ${pr.unified.unified_status || '(null)'}`)
    console.log(`│   unified_pr_status: ${pr.unified.unified_pr_status || '(null)'}`)
    console.log(`│   updated_by:        ${pr.unified.unified_pr_status_updated_by || '(null)'}`)
    console.log(`│   updated_at:        ${pr.unified.unified_pr_status_updated_at || '(null)'}`)
    console.log(`│`)
    console.log(`│ SHIPMENT INDICATOR:`)
    if (pr.analysis.hasShipment) {
      console.log(`│   ✅ Shipment Found`)
      console.log(`│   Shipment ID:     ${pr.shipment.shipmentId}`)
      console.log(`│   Shipment Status: ${pr.shipment.shipmentStatus}`)
      console.log(`│   Unified Status:  ${pr.shipment.unified_shipment_status || '(null)'}`)
    } else {
      console.log(`│   ❌ NO SHIPMENT RECORD FOUND`)
    }
    console.log(`│`)
    console.log(`│ ANALYSIS:`)
    console.log(`│   Root Cause:      ${pr.analysis.rootCause}`)
    console.log(`│   Severity:        ${pr.analysis.severity?.toUpperCase()}`)
    console.log(`│   Conversion Type: ${pr.analysis.conversionType}`)
    console.log(`│`)
    console.log(`│ RECOMMENDATION:`)
    console.log(`│   ${pr.analysis.recommendation}`)
    console.log(`└${'─'.repeat(78)}┘`)
  })
  
  // ========================
  // GROUPED SUMMARY BY ROOT CAUSE
  // ========================
  console.log('\n' + '─'.repeat(80))
  console.log('SECTION B: GROUPED SUMMARY BY ROOT CAUSE')
  console.log('─'.repeat(80))
  
  const byRootCause = {}
  for (const pr of enrichedPRs) {
    const cause = pr.analysis.rootCause
    if (!byRootCause[cause]) {
      byRootCause[cause] = []
    }
    byRootCause[cause].push(pr)
  }
  
  Object.entries(byRootCause).forEach(([cause, prs]) => {
    console.log(`\n📁 ${cause} (${prs.length} PRs)`)
    console.log('   ─────────────────────────────────────────────────────────────')
    console.log(`   PR Numbers: ${prs.map(p => p.pr_number).join(', ')}`)
    console.log(`   Recommendation: ${RECOMMENDATIONS[Object.keys(ROOT_CAUSES).find(k => ROOT_CAUSES[k] === cause)]}`)
    
    // Show severity breakdown
    const bySeverity = prs.reduce((acc, p) => {
      acc[p.analysis.severity] = (acc[p.analysis.severity] || 0) + 1
      return acc
    }, {})
    console.log(`   Severity Breakdown: ${Object.entries(bySeverity).map(([s, c]) => `${s}: ${c}`).join(', ')}`)
  })
  
  // ========================
  // CONVERSION TYPE ANALYSIS
  // ========================
  console.log('\n' + '─'.repeat(80))
  console.log('SECTION C: CONVERSION TYPE ANALYSIS')
  console.log('─'.repeat(80))
  
  const byConversionType = {}
  for (const pr of enrichedPRs) {
    const type = pr.analysis.conversionType
    if (!byConversionType[type]) {
      byConversionType[type] = []
    }
    byConversionType[type].push(pr)
  }
  
  Object.entries(byConversionType).forEach(([type, prs]) => {
    const icon = type === 'auto' ? '🤖' : type === 'manual' ? '👤' : type === 'migration' ? '📦' : '❓'
    console.log(`\n${icon} ${type.toUpperCase()} Conversion (${prs.length} PRs)`)
    console.log(`   PR Numbers: ${prs.map(p => p.pr_number).join(', ')}`)
  })
  
  // ========================
  // SEVERITY SUMMARY
  // ========================
  console.log('\n' + '─'.repeat(80))
  console.log('SECTION D: SEVERITY SUMMARY')
  console.log('─'.repeat(80))
  
  const bySeverity = {}
  for (const pr of enrichedPRs) {
    const severity = pr.analysis.severity
    if (!bySeverity[severity]) {
      bySeverity[severity] = []
    }
    bySeverity[severity].push(pr)
  }
  
  const severityIcons = { critical: '🔴', major: '🟠', minor: '🟡' }
  Object.entries(bySeverity).sort((a, b) => {
    const order = { critical: 0, major: 1, minor: 2 }
    return order[a[0]] - order[b[0]]
  }).forEach(([severity, prs]) => {
    console.log(`\n${severityIcons[severity] || '⚪'} ${severity.toUpperCase()} (${prs.length} PRs)`)
    prs.forEach(pr => {
      console.log(`   • ${pr.pr_number}: ${pr.analysis.rootCause}`)
    })
  })
  
  // ========================
  // FINAL SUMMARY
  // ========================
  console.log('\n' + '═'.repeat(80))
  console.log('FINAL SUMMARY')
  console.log('═'.repeat(80))
  
  const totalPRs = enrichedPRs.length
  const criticalCount = (bySeverity.critical || []).length
  const majorCount = (bySeverity.major || []).length
  const minorCount = (bySeverity.minor || []).length
  const withShipment = enrichedPRs.filter(p => p.analysis.hasShipment).length
  const withoutShipment = enrichedPRs.filter(p => !p.analysis.hasShipment).length
  
  console.log(`
┌────────────────────────────────────────────────────────────────────────────────┐
│ AUDIT SUMMARY                                                                  │
├────────────────────────────────────────────────────────────────────────────────┤
│ Total Problematic PRs:     ${String(totalPRs).padStart(4)}                                               │
│                                                                                │
│ By Severity:                                                                   │
│   🔴 Critical:             ${String(criticalCount).padStart(4)}                                               │
│   🟠 Major:                ${String(majorCount).padStart(4)}                                               │
│   🟡 Minor:                ${String(minorCount).padStart(4)}                                               │
│                                                                                │
│ Shipment Status:                                                               │
│   ✅ With Shipment:        ${String(withShipment).padStart(4)}                                               │
│   ❌ Without Shipment:     ${String(withoutShipment).padStart(4)}                                               │
│                                                                                │
│ Root Causes:                                                                   │
${Object.entries(byRootCause).map(([cause, prs]) => 
  `│   • ${cause.padEnd(30)} ${String(prs.length).padStart(4)} PRs                        │`
).join('\n')}
└────────────────────────────────────────────────────────────────────────────────┘
`)
  
  // ========================
  // RECOMMENDED ACTIONS
  // ========================
  console.log('\n' + '─'.repeat(80))
  console.log('RECOMMENDED ACTIONS')
  console.log('─'.repeat(80))
  
  if (criticalCount > 0) {
    console.log('\n🔴 CRITICAL (Must Fix):')
    console.log('   • Run status consistency repair for mismatched unified_pr_status values')
  }
  
  if (majorCount > 0) {
    console.log('\n🟠 MAJOR (Should Fix):')
    console.log('   • Create missing shipment records for PRs with SHIPPED status')
    console.log('   • OR mark these PRs as manually fulfilled outside shipment flow')
  }
  
  if (minorCount > 0) {
    console.log('\n🟡 MINOR (Optional):')
    console.log('   • Document as known data quality exceptions')
    console.log('   • Consider cleanup during next maintenance window')
  }
  
  console.log('\n🔒 NO DATA WAS MODIFIED — THIS IS A READ-ONLY AUDIT')
  
  return {
    totalPRs,
    bySeverity: { critical: criticalCount, major: majorCount, minor: minorCount },
    byRootCause: Object.fromEntries(Object.entries(byRootCause).map(([k, v]) => [k, v.length])),
    byConversionType: Object.fromEntries(Object.entries(byConversionType).map(([k, v]) => [k, v.length])),
    shipmentStatus: { with: withShipment, without: withoutShipment },
    details: enrichedPRs.map(pr => ({
      id: pr.id,
      pr_number: pr.pr_number,
      legacy: pr.legacy,
      unified: pr.unified,
      hasShipment: pr.analysis.hasShipment,
      rootCause: pr.analysis.rootCause,
      severity: pr.analysis.severity,
      conversionType: pr.analysis.conversionType,
      recommendation: pr.analysis.recommendation,
    }))
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
    // Connect with read-only settings
    client = new MongoClient(mongoUri, {
      readPreference: 'secondaryPreferred',
      retryWrites: false,
      maxPoolSize: 2,
      appName: 'CascadeIntegrityAudit-DryRun',
    })
    
    await client.connect()
    console.log('✅ Connected to MongoDB (Read-Only Mode)\n')
    
    const db = client.db()
    
    // Run analysis phases
    const problematicPRs = await analyzeProblematicPRs(db)
    
    if (problematicPRs.length === 0) {
      console.log('\n✅ No problematic PRs found! All cascade integrity checks pass.')
    } else {
      const enrichedPRs = await enrichPRData(db, problematicPRs)
      const analyzedPRs = analyzeRootCauses(enrichedPRs)
      const report = generateReport(analyzedPRs)
      
      // Save report to JSON
      const resultsPath = path.resolve(process.cwd(), 'reports', 'cascade-integrity-audit.json')
      fs.writeFileSync(resultsPath, JSON.stringify(report, null, 2))
      console.log(`\n📄 Full report saved to: ${resultsPath}`)
    }
    
    console.log('\n' + '═'.repeat(80))
    console.log('🔒 AUDIT COMPLETE — NO DATA WAS MODIFIED')
    console.log('═'.repeat(80))
    
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
