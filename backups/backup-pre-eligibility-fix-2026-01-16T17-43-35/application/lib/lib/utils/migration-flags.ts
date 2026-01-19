/**
 * Migration Flag Utilities
 * 
 * Centralized flag management for unified workflow migration.
 * 
 * Flag Definitions:
 * - DUAL_WRITE_ENABLED: Writes to both legacy and unified fields
 * - READ_FROM_UNIFIED: Reads from unified fields instead of legacy
 * - SAFE_MODE: Controls overall migration safety (disabled = unified primary)
 * 
 * SAFE_MODE is considered DISABLED when:
 *   SAFE_MODE=false OR (READ_FROM_UNIFIED=true AND DUAL_WRITE_ENABLED=true)
 * 
 * @version 1.0.0
 * @created 2026-01-16
 */

export const MigrationFlags = {
  /**
   * Check if dual-write is enabled
   */
  isDualWriteEnabled(): boolean {
    return process.env.DUAL_WRITE_ENABLED === 'true'
  },

  /**
   * Check if reads should come from unified fields
   */
  isReadFromUnifiedEnabled(): boolean {
    return process.env.READ_FROM_UNIFIED === 'true'
  },

  /**
   * Check if SAFE_MODE is explicitly disabled
   */
  isSafeModeDisabled(): boolean {
    return process.env.SAFE_MODE === 'false'
  },

  /**
   * Check if SAFE_MODE is enabled (default: true if not set)
   */
  isSafeModeEnabled(): boolean {
    return process.env.SAFE_MODE !== 'false'
  },

  /**
   * Get current migration phase
   */
  getCurrentPhase(): string {
    const safeMode = !this.isSafeModeDisabled()
    const dualWrite = this.isDualWriteEnabled()
    const readUnified = this.isReadFromUnifiedEnabled()

    if (safeMode && !dualWrite && !readUnified) {
      return 'PHASE_0_LEGACY_ONLY'
    }
    if (safeMode && dualWrite && !readUnified) {
      return 'PHASE_1_DUAL_WRITE_SAFE'
    }
    if (!safeMode && dualWrite && !readUnified) {
      return 'PHASE_2_SAFE_MODE_DISABLED'
    }
    if (!safeMode && dualWrite && readUnified) {
      return 'PHASE_3_UNIFIED_PRIMARY'
    }
    if (!safeMode && !dualWrite && readUnified) {
      return 'PHASE_4_UNIFIED_ONLY'
    }
    return 'UNKNOWN'
  },

  /**
   * Get migration state summary
   */
  getState(): {
    safeMode: boolean
    dualWrite: boolean
    readUnified: boolean
    phase: string
  } {
    return {
      safeMode: this.isSafeModeEnabled(),
      dualWrite: this.isDualWriteEnabled(),
      readUnified: this.isReadFromUnifiedEnabled(),
      phase: this.getCurrentPhase()
    }
  },

  /**
   * Log current migration state (for debugging)
   */
  logState(): void {
    const state = this.getState()
    console.log(`[MigrationFlags] Phase: ${state.phase}`)
    console.log(`[MigrationFlags] SAFE_MODE: ${state.safeMode ? 'ENABLED' : 'DISABLED'}`)
    console.log(`[MigrationFlags] DUAL_WRITE_ENABLED: ${state.dualWrite}`)
    console.log(`[MigrationFlags] READ_FROM_UNIFIED: ${state.readUnified}`)
  }
}

export default MigrationFlags
