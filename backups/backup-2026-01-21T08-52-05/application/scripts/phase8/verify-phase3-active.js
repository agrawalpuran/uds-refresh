/**
 * PHASE 8B — VERIFY PHASE 3 (UNIFIED PRIMARY) IS ACTIVE
 * 
 * Purpose: Confirm READ_FROM_UNIFIED is enabled and system is in Phase 3.
 * 
 * @version 1.0.0
 * @created 2026-01-16
 */

console.log('═'.repeat(80))
console.log('PHASE 3 ACTIVATION VERIFICATION')
console.log('═'.repeat(80))
console.log()

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

const envLocalPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath })
}

console.log(`Timestamp: ${new Date().toISOString()}`)
console.log()

// =============================================================================
// MIGRATION STATE CHECK
// =============================================================================

const dualWrite = process.env.DUAL_WRITE_ENABLED === 'true'
const readUnified = process.env.READ_FROM_UNIFIED === 'true'
const safeMode = process.env.SAFE_MODE !== 'false'

// Determine current phase
let phase = 'UNKNOWN'
if (safeMode && !dualWrite && !readUnified) {
  phase = 'PHASE_0_LEGACY_ONLY'
} else if (safeMode && dualWrite && !readUnified) {
  phase = 'PHASE_1_DUAL_WRITE_SAFE'
} else if (!safeMode && dualWrite && !readUnified) {
  phase = 'PHASE_2_SAFE_MODE_DISABLED'
} else if (!safeMode && dualWrite && readUnified) {
  phase = 'PHASE_3_UNIFIED_PRIMARY'
} else if (!safeMode && !dualWrite && readUnified) {
  phase = 'PHASE_4_UNIFIED_ONLY'
}

const isPhase3 = phase === 'PHASE_3_UNIFIED_PRIMARY'

console.log(`
┌────────────────────────────────────────────────────────────────────────────────┐
│                    UNIFIED WORKFLOW MIGRATION STATUS                           │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  ENVIRONMENT FLAGS:                                                            │
│    DUAL_WRITE_ENABLED:    ${dualWrite ? '✅ true ' : '❌ false'}                                      │
│    READ_FROM_UNIFIED:     ${readUnified ? '✅ true ' : '❌ false'}                                      │
│    SAFE_MODE:             ${safeMode ? '⚠️  true ' : '✅ false'}                                      │
│                                                                                │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  CURRENT PHASE:           ${phase.padEnd(30)}                   │
│                                                                                │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  ╔════════════════════════════════════════════════════════════════════════╗   │
│  ║                                                                        ║   │
│  ║   ${isPhase3 ? '✅  PHASE 3 (UNIFIED PRIMARY) IS NOW ACTIVE!            ' : '❌  PHASE 3 IS NOT YET ACTIVE                        '}   ║   │
│  ║                                                                        ║   │
│  ╚════════════════════════════════════════════════════════════════════════╝   │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
`)

if (isPhase3) {
  console.log(`
  🎉 CONGRATULATIONS! PHASE 3 (UNIFIED PRIMARY) IS ACTIVE!

  What this means:
  ────────────────────────────────────────────────────────────────────────────────
  ✅ Application will READ from unified_* fields (unified_status, unified_pr_status, etc.)
  ✅ Application will WRITE to BOTH legacy AND unified fields (dual-write)
  ✅ Legacy fields are now BACKUP only
  ✅ Unified fields are the SOURCE OF TRUTH
  
  Runtime Behavior:
  ────────────────────────────────────────────────────────────────────────────────
  • Orders: unified_status is primary
  • PRs: unified_pr_status is primary
  • POs: unified_po_status is primary
  • GRNs: unified_grn_status is primary
  • Invoices: unified_invoice_status is primary
  • Shipments: unified_shipment_status is primary
  
  Next Steps:
  ────────────────────────────────────────────────────────────────────────────────
  1. Monitor application logs for 24-48 hours
  2. Run end-to-end workflow tests
  3. After stable operation, consider disabling dual-write (Phase 4)
`)
} else {
  console.log(`
  ⚠️  Phase 3 is not active. Current phase: ${phase}
  
  To activate Phase 3, ensure:
  • DUAL_WRITE_ENABLED=true
  • READ_FROM_UNIFIED=true
  • SAFE_MODE=false
`)
}

// Save verification result
const result = {
  timestamp: new Date().toISOString(),
  flags: {
    DUAL_WRITE_ENABLED: dualWrite,
    READ_FROM_UNIFIED: readUnified,
    SAFE_MODE: safeMode
  },
  phase,
  isPhase3Active: isPhase3
}

const resultsPath = path.resolve(process.cwd(), 'reports', 'phase3-activation-verification.json')
fs.writeFileSync(resultsPath, JSON.stringify(result, null, 2))
console.log(`\n📄 Verification saved to: ${resultsPath}`)
