/**
 * Status Dual-Write Wrapper Functions
 * 
 * This module provides isolated wrapper functions for dual-write status updates.
 * These functions DO NOT execute updates - they return prepared update payloads
 * for both legacy and unified status fields.
 * 
 * IMPORTANT:
 * - Does NOT modify any existing production source files
 * - Does NOT execute database updates
 * - Does NOT change schema definitions
 * - Returns update payloads as objects for review/execution elsewhere
 * 
 * @module migrations/dualwrite/status-dualwrite-wrapper
 * @version 1.0.0
 * @created 2026-01-15
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Unified Order Status (Simple Workflow)
 */
export type UnifiedOrderStatus =
  | 'CREATED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'IN_FULFILMENT'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'CANCELLED'

/**
 * Unified PR Status (Full Workflow)
 */
export type UnifiedPRStatus =
  | 'DRAFT'
  | 'PENDING_SITE_ADMIN_APPROVAL'
  | 'SITE_ADMIN_APPROVED'
  | 'PENDING_COMPANY_ADMIN_APPROVAL'
  | 'COMPANY_ADMIN_APPROVED'
  | 'REJECTED'
  | 'LINKED_TO_PO'
  | 'IN_SHIPMENT'
  | 'PARTIALLY_DELIVERED'
  | 'FULLY_DELIVERED'
  | 'CLOSED'

/**
 * Unified PO Status
 */
export type UnifiedPOStatus =
  | 'CREATED'
  | 'SENT_TO_VENDOR'
  | 'ACKNOWLEDGED'
  | 'IN_FULFILMENT'
  | 'PARTIALLY_SHIPPED'
  | 'FULLY_SHIPPED'
  | 'PARTIALLY_DELIVERED'
  | 'FULLY_DELIVERED'
  | 'CLOSED'
  | 'CANCELLED'

/**
 * Unified Shipment Status
 */
export type UnifiedShipmentStatus =
  | 'CREATED'
  | 'MANIFESTED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FAILED'
  | 'RETURNED'
  | 'LOST'

/**
 * Unified GRN Status
 */
export type UnifiedGRNStatus =
  | 'DRAFT'
  | 'RAISED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'INVOICED'
  | 'CLOSED'

/**
 * Unified Invoice Status
 */
export type UnifiedInvoiceStatus =
  | 'RAISED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PAID'
  | 'DISPUTED'
  | 'CANCELLED'

/**
 * Legacy Order Status
 */
export type LegacyOrderStatus =
  | 'Awaiting approval'
  | 'Awaiting fulfilment'
  | 'Dispatched'
  | 'Delivered'

/**
 * Legacy PR Status
 */
export type LegacyPRStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_SITE_ADMIN_APPROVAL'
  | 'SITE_ADMIN_APPROVED'
  | 'PENDING_COMPANY_ADMIN_APPROVAL'
  | 'COMPANY_ADMIN_APPROVED'
  | 'REJECTED_BY_SITE_ADMIN'
  | 'REJECTED_BY_COMPANY_ADMIN'
  | 'PO_CREATED'
  | 'FULLY_DELIVERED'

/**
 * Legacy PO Status
 */
export type LegacyPOStatus =
  | 'CREATED'
  | 'SENT_TO_VENDOR'
  | 'ACKNOWLEDGED'
  | 'IN_FULFILMENT'
  | 'COMPLETED'
  | 'CANCELLED'

/**
 * Legacy Shipment Status
 */
export type LegacyShipmentStatus = 'CREATED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED'

/**
 * Legacy GRN Status
 */
export type LegacyGRNStatus = 'CREATED' | 'ACKNOWLEDGED' | 'INVOICED' | 'RECEIVED' | 'CLOSED'

/**
 * Legacy GRN Approval Status
 */
export type LegacyGRNApprovalStatus = 'RAISED' | 'APPROVED'

/**
 * Legacy Invoice Status
 */
export type LegacyInvoiceStatus = 'RAISED' | 'APPROVED'

/**
 * Context for status updates
 */
export interface StatusUpdateContext {
  updatedBy?: string
  reason?: string
  source?: string
  metadata?: Record<string, unknown>
}

/**
 * Dual-write result structure
 */
export interface DualWriteResult {
  entityType: string
  entityId: string
  legacyUpdate: Record<string, unknown>
  unifiedUpdate: Record<string, unknown>
  auditLog: AuditLogEntry
  validation: ValidationResult
}

/**
 * Audit log entry for status_migration_logs collection
 */
export interface AuditLogEntry {
  entityType: 'Order' | 'PR' | 'PO' | 'Shipment' | 'GRN' | 'Invoice'
  entityId: string
  action: 'STATUS_UPDATE' | 'STATUS_SYNC' | 'STATUS_REPAIR'
  previousLegacyStatus: string | null
  newLegacyStatus: string | null
  previousUnifiedStatus: string | null
  newUnifiedStatus: string | null
  source: string
  updatedBy: string | null
  timestamp: Date
  metadata: Record<string, unknown>
}

/**
 * Validation result structure
 */
export interface ValidationResult {
  valid: boolean
  reason?: string
  warnings: string[]
}

// =============================================================================
// STATUS MAPPING DEFINITIONS
// =============================================================================

/**
 * Legacy to Unified Status Mapping
 * Maps legacy field values to unified status values
 */
export const LegacyToUnifiedStatusMap = {
  // ORDER_STATUS → unified_status
  ORDER_STATUS: {
    'Awaiting approval': 'PENDING_APPROVAL' as UnifiedOrderStatus,
    'Awaiting fulfilment': 'IN_FULFILMENT' as UnifiedOrderStatus,
    'Dispatched': 'DISPATCHED' as UnifiedOrderStatus,
    'Delivered': 'DELIVERED' as UnifiedOrderStatus,
  },

  // PR_STATUS → unified_pr_status
  PR_STATUS: {
    'DRAFT': 'DRAFT' as UnifiedPRStatus,
    'SUBMITTED': 'PENDING_SITE_ADMIN_APPROVAL' as UnifiedPRStatus,
    'PENDING_SITE_ADMIN_APPROVAL': 'PENDING_SITE_ADMIN_APPROVAL' as UnifiedPRStatus,
    'SITE_ADMIN_APPROVED': 'SITE_ADMIN_APPROVED' as UnifiedPRStatus,
    'PENDING_COMPANY_ADMIN_APPROVAL': 'PENDING_COMPANY_ADMIN_APPROVAL' as UnifiedPRStatus,
    'COMPANY_ADMIN_APPROVED': 'COMPANY_ADMIN_APPROVED' as UnifiedPRStatus,
    'REJECTED_BY_SITE_ADMIN': 'REJECTED' as UnifiedPRStatus,
    'REJECTED_BY_COMPANY_ADMIN': 'REJECTED' as UnifiedPRStatus,
    'PO_CREATED': 'LINKED_TO_PO' as UnifiedPRStatus,
    'FULLY_DELIVERED': 'FULLY_DELIVERED' as UnifiedPRStatus,
  },

  // PO_STATUS → unified_po_status
  PO_STATUS: {
    'CREATED': 'CREATED' as UnifiedPOStatus,
    'SENT_TO_VENDOR': 'SENT_TO_VENDOR' as UnifiedPOStatus,
    'ACKNOWLEDGED': 'ACKNOWLEDGED' as UnifiedPOStatus,
    'IN_FULFILMENT': 'IN_FULFILMENT' as UnifiedPOStatus,
    'COMPLETED': 'FULLY_DELIVERED' as UnifiedPOStatus,
    'CANCELLED': 'CANCELLED' as UnifiedPOStatus,
  },

  // SHIPMENT_STATUS → unified_shipment_status
  SHIPMENT_STATUS: {
    'CREATED': 'CREATED' as UnifiedShipmentStatus,
    'IN_TRANSIT': 'IN_TRANSIT' as UnifiedShipmentStatus,
    'DELIVERED': 'DELIVERED' as UnifiedShipmentStatus,
    'FAILED': 'FAILED' as UnifiedShipmentStatus,
  },

  // GRN_STATUS → unified_grn_status (from grnStatus field)
  GRN_STATUS: {
    'RAISED': 'RAISED' as UnifiedGRNStatus,
    'APPROVED': 'APPROVED' as UnifiedGRNStatus,
  },

  // GRN_LEGACY_STATUS → unified_grn_status (from status field)
  GRN_LEGACY_STATUS: {
    'CREATED': 'RAISED' as UnifiedGRNStatus,
    'ACKNOWLEDGED': 'APPROVED' as UnifiedGRNStatus,
    'INVOICED': 'INVOICED' as UnifiedGRNStatus,
    'RECEIVED': 'APPROVED' as UnifiedGRNStatus,
    'CLOSED': 'CLOSED' as UnifiedGRNStatus,
  },

  // INVOICE_STATUS → unified_invoice_status
  INVOICE_STATUS: {
    'RAISED': 'RAISED' as UnifiedInvoiceStatus,
    'APPROVED': 'APPROVED' as UnifiedInvoiceStatus,
  },
}

/**
 * Unified to Legacy Status Mapping
 * Maps unified status values back to legacy field values
 */
export const UnifiedToLegacyStatusMap = {
  // unified_status → ORDER_STATUS (status field)
  ORDER_STATUS: {
    'CREATED': 'Awaiting approval' as LegacyOrderStatus,
    'PENDING_APPROVAL': 'Awaiting approval' as LegacyOrderStatus,
    'APPROVED': 'Awaiting fulfilment' as LegacyOrderStatus,
    'IN_FULFILMENT': 'Awaiting fulfilment' as LegacyOrderStatus,
    'DISPATCHED': 'Dispatched' as LegacyOrderStatus,
    'DELIVERED': 'Delivered' as LegacyOrderStatus,
    'CANCELLED': 'Awaiting approval' as LegacyOrderStatus, // Legacy has no CANCELLED, default fallback
  },

  // unified_pr_status → PR_STATUS (pr_status field)
  PR_STATUS: {
    'DRAFT': 'DRAFT' as LegacyPRStatus,
    'PENDING_SITE_ADMIN_APPROVAL': 'PENDING_SITE_ADMIN_APPROVAL' as LegacyPRStatus,
    'SITE_ADMIN_APPROVED': 'SITE_ADMIN_APPROVED' as LegacyPRStatus,
    'PENDING_COMPANY_ADMIN_APPROVAL': 'PENDING_COMPANY_ADMIN_APPROVAL' as LegacyPRStatus,
    'COMPANY_ADMIN_APPROVED': 'COMPANY_ADMIN_APPROVED' as LegacyPRStatus,
    'REJECTED': 'REJECTED_BY_COMPANY_ADMIN' as LegacyPRStatus, // Default to company admin rejection
    'LINKED_TO_PO': 'PO_CREATED' as LegacyPRStatus,
    'IN_SHIPMENT': 'PO_CREATED' as LegacyPRStatus, // Legacy has no IN_SHIPMENT
    'PARTIALLY_DELIVERED': 'PO_CREATED' as LegacyPRStatus, // Legacy has no PARTIALLY_DELIVERED
    'FULLY_DELIVERED': 'FULLY_DELIVERED' as LegacyPRStatus,
    'CLOSED': 'FULLY_DELIVERED' as LegacyPRStatus, // Legacy has no CLOSED
  },

  // unified_po_status → PO_STATUS (po_status field)
  PO_STATUS: {
    'CREATED': 'CREATED' as LegacyPOStatus,
    'SENT_TO_VENDOR': 'SENT_TO_VENDOR' as LegacyPOStatus,
    'ACKNOWLEDGED': 'ACKNOWLEDGED' as LegacyPOStatus,
    'IN_FULFILMENT': 'IN_FULFILMENT' as LegacyPOStatus,
    'PARTIALLY_SHIPPED': 'IN_FULFILMENT' as LegacyPOStatus, // Legacy has no PARTIALLY_SHIPPED
    'FULLY_SHIPPED': 'IN_FULFILMENT' as LegacyPOStatus, // Legacy has no FULLY_SHIPPED
    'PARTIALLY_DELIVERED': 'IN_FULFILMENT' as LegacyPOStatus, // Legacy has no PARTIALLY_DELIVERED
    'FULLY_DELIVERED': 'COMPLETED' as LegacyPOStatus,
    'CLOSED': 'COMPLETED' as LegacyPOStatus, // Legacy has no CLOSED
    'CANCELLED': 'CANCELLED' as LegacyPOStatus,
  },

  // unified_shipment_status → SHIPMENT_STATUS (shipmentStatus field)
  SHIPMENT_STATUS: {
    'CREATED': 'CREATED' as LegacyShipmentStatus,
    'MANIFESTED': 'CREATED' as LegacyShipmentStatus, // Legacy has no MANIFESTED
    'PICKED_UP': 'IN_TRANSIT' as LegacyShipmentStatus, // Legacy has no PICKED_UP
    'IN_TRANSIT': 'IN_TRANSIT' as LegacyShipmentStatus,
    'OUT_FOR_DELIVERY': 'IN_TRANSIT' as LegacyShipmentStatus, // Legacy has no OUT_FOR_DELIVERY
    'DELIVERED': 'DELIVERED' as LegacyShipmentStatus,
    'FAILED': 'FAILED' as LegacyShipmentStatus,
    'RETURNED': 'FAILED' as LegacyShipmentStatus, // Legacy has no RETURNED
    'LOST': 'FAILED' as LegacyShipmentStatus, // Legacy has no LOST
  },

  // unified_grn_status → GRN_STATUS (grnStatus field) + GRN_LEGACY_STATUS (status field)
  GRN_STATUS: {
    'DRAFT': { grnStatus: 'RAISED' as LegacyGRNApprovalStatus, status: 'CREATED' as LegacyGRNStatus },
    'RAISED': { grnStatus: 'RAISED' as LegacyGRNApprovalStatus, status: 'CREATED' as LegacyGRNStatus },
    'PENDING_APPROVAL': { grnStatus: 'RAISED' as LegacyGRNApprovalStatus, status: 'CREATED' as LegacyGRNStatus },
    'APPROVED': { grnStatus: 'APPROVED' as LegacyGRNApprovalStatus, status: 'ACKNOWLEDGED' as LegacyGRNStatus },
    'INVOICED': { grnStatus: 'APPROVED' as LegacyGRNApprovalStatus, status: 'INVOICED' as LegacyGRNStatus },
    'CLOSED': { grnStatus: 'APPROVED' as LegacyGRNApprovalStatus, status: 'CLOSED' as LegacyGRNStatus },
  },

  // unified_invoice_status → INVOICE_STATUS (invoiceStatus field)
  INVOICE_STATUS: {
    'RAISED': 'RAISED' as LegacyInvoiceStatus,
    'PENDING_APPROVAL': 'RAISED' as LegacyInvoiceStatus, // Legacy has no PENDING_APPROVAL
    'APPROVED': 'APPROVED' as LegacyInvoiceStatus,
    'PAID': 'APPROVED' as LegacyInvoiceStatus, // Legacy has no PAID
    'DISPUTED': 'RAISED' as LegacyInvoiceStatus, // Legacy has no DISPUTED
    'CANCELLED': 'RAISED' as LegacyInvoiceStatus, // Legacy has no CANCELLED
  },
}

// =============================================================================
// STATUS TRANSITION RULES
// =============================================================================

/**
 * Valid status transitions for each entity type
 * Defines allowed forward transitions only
 */
const StatusTransitionRules = {
  ORDER: {
    'CREATED': ['PENDING_APPROVAL', 'CANCELLED'],
    'PENDING_APPROVAL': ['APPROVED', 'CANCELLED'],
    'APPROVED': ['IN_FULFILMENT', 'CANCELLED'],
    'IN_FULFILMENT': ['DISPATCHED', 'CANCELLED'],
    'DISPATCHED': ['DELIVERED'],
    'DELIVERED': [], // Terminal state
    'CANCELLED': [], // Terminal state
  } as Record<string, string[]>,

  PR: {
    'DRAFT': ['PENDING_SITE_ADMIN_APPROVAL'],
    'PENDING_SITE_ADMIN_APPROVAL': ['SITE_ADMIN_APPROVED', 'REJECTED'],
    'SITE_ADMIN_APPROVED': ['PENDING_COMPANY_ADMIN_APPROVAL'],
    'PENDING_COMPANY_ADMIN_APPROVAL': ['COMPANY_ADMIN_APPROVED', 'REJECTED'],
    'COMPANY_ADMIN_APPROVED': ['LINKED_TO_PO'],
    'REJECTED': [], // Terminal state
    'LINKED_TO_PO': ['IN_SHIPMENT'],
    'IN_SHIPMENT': ['PARTIALLY_DELIVERED', 'FULLY_DELIVERED'],
    'PARTIALLY_DELIVERED': ['FULLY_DELIVERED'],
    'FULLY_DELIVERED': ['CLOSED'],
    'CLOSED': [], // Terminal state
  } as Record<string, string[]>,

  PO: {
    'CREATED': ['SENT_TO_VENDOR', 'CANCELLED'],
    'SENT_TO_VENDOR': ['ACKNOWLEDGED', 'CANCELLED'],
    'ACKNOWLEDGED': ['IN_FULFILMENT', 'CANCELLED'],
    'IN_FULFILMENT': ['PARTIALLY_SHIPPED', 'FULLY_SHIPPED', 'CANCELLED'],
    'PARTIALLY_SHIPPED': ['FULLY_SHIPPED', 'PARTIALLY_DELIVERED'],
    'FULLY_SHIPPED': ['PARTIALLY_DELIVERED', 'FULLY_DELIVERED'],
    'PARTIALLY_DELIVERED': ['FULLY_DELIVERED'],
    'FULLY_DELIVERED': ['CLOSED'],
    'CLOSED': [], // Terminal state
    'CANCELLED': [], // Terminal state
  } as Record<string, string[]>,

  SHIPMENT: {
    'CREATED': ['MANIFESTED', 'PICKED_UP', 'FAILED'],
    'MANIFESTED': ['PICKED_UP', 'FAILED'],
    'PICKED_UP': ['IN_TRANSIT', 'FAILED'],
    'IN_TRANSIT': ['OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED', 'LOST'],
    'OUT_FOR_DELIVERY': ['DELIVERED', 'FAILED', 'RETURNED'],
    'DELIVERED': [], // Terminal state
    'FAILED': ['RETURNED'],
    'RETURNED': [], // Terminal state
    'LOST': [], // Terminal state
  } as Record<string, string[]>,

  GRN: {
    'DRAFT': ['RAISED'],
    'RAISED': ['PENDING_APPROVAL', 'APPROVED'],
    'PENDING_APPROVAL': ['APPROVED'],
    'APPROVED': ['INVOICED', 'CLOSED'],
    'INVOICED': ['CLOSED'],
    'CLOSED': [], // Terminal state
  } as Record<string, string[]>,

  INVOICE: {
    'RAISED': ['PENDING_APPROVAL', 'APPROVED', 'DISPUTED', 'CANCELLED'],
    'PENDING_APPROVAL': ['APPROVED', 'DISPUTED', 'CANCELLED'],
    'APPROVED': ['PAID'],
    'PAID': [], // Terminal state
    'DISPUTED': ['RAISED', 'CANCELLED'],
    'CANCELLED': [], // Terminal state
  } as Record<string, string[]>,
}

// =============================================================================
// VALIDATION HELPER
// =============================================================================

/**
 * Validate a status transition
 * 
 * Rules:
 * - Prevents invalid backwards transitions
 * - Prevents skipping states
 * - Returns validation result (does NOT throw errors)
 * 
 * @param entity - Entity type ('Order', 'PR', 'PO', 'Shipment', 'GRN', 'Invoice')
 * @param currentStatus - Current status value (can be null for new records)
 * @param newStatus - New status value to transition to
 * @returns ValidationResult with valid flag and optional reason/warnings
 */
export function validateStatusTransition(
  entity: 'Order' | 'PR' | 'PO' | 'Shipment' | 'GRN' | 'Invoice',
  currentStatus: string | null | undefined,
  newStatus: string
): ValidationResult {
  const warnings: string[] = []
  
  // If no current status, any transition is valid (new record)
  if (!currentStatus) {
    return { valid: true, warnings: [] }
  }

  // Same status - no transition needed
  if (currentStatus === newStatus) {
    warnings.push(`Status unchanged: ${currentStatus} → ${newStatus}`)
    return { valid: true, warnings }
  }

  // Get transition rules for entity type
  const rules = StatusTransitionRules[entity.toUpperCase() as keyof typeof StatusTransitionRules]
  if (!rules) {
    warnings.push(`Unknown entity type: ${entity}`)
    return { valid: true, warnings } // Allow unknown entities with warning
  }

  // Check if current status has defined transitions
  const allowedTransitions = rules[currentStatus]
  if (!allowedTransitions) {
    warnings.push(`Unknown current status: ${currentStatus} for entity ${entity}`)
    return { valid: true, warnings } // Allow unknown statuses with warning
  }

  // Check if new status is in allowed transitions
  if (!allowedTransitions.includes(newStatus)) {
    // Check if it's a backwards transition
    const allStatuses = Object.keys(rules)
    const currentIndex = allStatuses.indexOf(currentStatus)
    const newIndex = allStatuses.indexOf(newStatus)
    
    let reason = `Invalid transition: ${currentStatus} → ${newStatus} for ${entity}`
    
    if (newIndex >= 0 && newIndex < currentIndex) {
      reason = `Backwards transition not allowed: ${currentStatus} → ${newStatus} for ${entity}`
    } else if (newIndex < 0) {
      reason = `Unknown target status: ${newStatus} for ${entity}`
    } else {
      reason = `Status skipping not allowed: ${currentStatus} → ${newStatus} for ${entity}. Allowed: [${allowedTransitions.join(', ')}]`
    }
    
    return { valid: false, reason, warnings }
  }

  return { valid: true, warnings }
}

// =============================================================================
// DUAL-WRITE WRAPPER FUNCTIONS
// =============================================================================

/**
 * Safe Dual-Write for Order Status
 * 
 * Prepares update payloads for both legacy and unified status fields.
 * Does NOT execute updates - returns prepared payloads.
 * 
 * @param orderId - Order ID
 * @param newUnifiedStatus - New unified order status
 * @param currentLegacyStatus - Current legacy status (for audit)
 * @param currentUnifiedStatus - Current unified status (for audit)
 * @param context - Optional context metadata
 * @returns DualWriteResult with prepared update payloads
 */
export function safeDualWriteOrderStatus(
  orderId: string,
  newUnifiedStatus: UnifiedOrderStatus,
  currentLegacyStatus: string | null = null,
  currentUnifiedStatus: string | null = null,
  context: StatusUpdateContext = {}
): DualWriteResult {
  const timestamp = new Date()
  
  // Validate transition
  const validation = validateStatusTransition('Order', currentUnifiedStatus, newUnifiedStatus)
  
  // Map unified → legacy
  const newLegacyStatus = UnifiedToLegacyStatusMap.ORDER_STATUS[newUnifiedStatus] || currentLegacyStatus || 'Awaiting approval'
  
  // Prepare legacy field update
  const legacyUpdate = {
    // Legacy field: status
    status: newLegacyStatus,
    // NOTE: This update should be applied to orders collection
    // where: { id: orderId }
  }
  
  // Prepare unified field update
  const unifiedUpdate = {
    // Unified field: unified_status
    unified_status: newUnifiedStatus,
    unified_status_updated_at: timestamp,
    unified_status_updated_by: context.updatedBy || 'dual-write-wrapper',
  }
  
  // Prepare audit log entry
  const auditLog: AuditLogEntry = {
    entityType: 'Order',
    entityId: orderId,
    action: 'STATUS_UPDATE',
    previousLegacyStatus: currentLegacyStatus,
    newLegacyStatus: newLegacyStatus,
    previousUnifiedStatus: currentUnifiedStatus,
    newUnifiedStatus: newUnifiedStatus,
    source: context.source || 'dual-write-wrapper',
    updatedBy: context.updatedBy || null,
    timestamp,
    metadata: {
      ...context.metadata,
      reason: context.reason,
      validationResult: validation,
    },
  }
  
  return {
    entityType: 'Order',
    entityId: orderId,
    legacyUpdate,
    unifiedUpdate,
    auditLog,
    validation,
  }
}

/**
 * Safe Dual-Write for PR Status
 * 
 * @param prId - PR (Order with pr_number) ID
 * @param newUnifiedStatus - New unified PR status
 * @param currentLegacyStatus - Current legacy pr_status
 * @param currentUnifiedStatus - Current unified_pr_status
 * @param context - Optional context metadata
 * @returns DualWriteResult with prepared update payloads
 */
export function safeDualWritePRStatus(
  prId: string,
  newUnifiedStatus: UnifiedPRStatus,
  currentLegacyStatus: string | null = null,
  currentUnifiedStatus: string | null = null,
  context: StatusUpdateContext = {}
): DualWriteResult {
  const timestamp = new Date()
  
  // Validate transition
  const validation = validateStatusTransition('PR', currentUnifiedStatus, newUnifiedStatus)
  
  // Map unified → legacy
  const newLegacyStatus = UnifiedToLegacyStatusMap.PR_STATUS[newUnifiedStatus] || currentLegacyStatus || 'DRAFT'
  
  // Prepare legacy field update
  const legacyUpdate = {
    // Legacy field: pr_status
    pr_status: newLegacyStatus,
    // Additional legacy fields based on status
    ...(newUnifiedStatus === 'REJECTED' && context.metadata?.rejectionReason
      ? { rejection_reason: context.metadata.rejectionReason }
      : {}),
    // NOTE: This update should be applied to orders collection
    // where: { id: prId, pr_number: { $exists: true } }
  }
  
  // Prepare unified field update
  const unifiedUpdate = {
    // Unified field: unified_pr_status
    unified_pr_status: newUnifiedStatus,
    unified_pr_status_updated_at: timestamp,
    unified_pr_status_updated_by: context.updatedBy || 'dual-write-wrapper',
    ...(newUnifiedStatus === 'REJECTED' && context.metadata?.rejectionReason
      ? { rejection_reason: context.metadata.rejectionReason }
      : {}),
  }
  
  // Prepare audit log entry
  const auditLog: AuditLogEntry = {
    entityType: 'PR',
    entityId: prId,
    action: 'STATUS_UPDATE',
    previousLegacyStatus: currentLegacyStatus,
    newLegacyStatus: newLegacyStatus,
    previousUnifiedStatus: currentUnifiedStatus,
    newUnifiedStatus: newUnifiedStatus,
    source: context.source || 'dual-write-wrapper',
    updatedBy: context.updatedBy || null,
    timestamp,
    metadata: {
      ...context.metadata,
      reason: context.reason,
      validationResult: validation,
    },
  }
  
  return {
    entityType: 'PR',
    entityId: prId,
    legacyUpdate,
    unifiedUpdate,
    auditLog,
    validation,
  }
}

/**
 * Safe Dual-Write for PO Status
 * 
 * @param poId - PurchaseOrder ID
 * @param newUnifiedStatus - New unified PO status
 * @param currentLegacyStatus - Current legacy po_status
 * @param currentUnifiedStatus - Current unified_po_status
 * @param context - Optional context metadata
 * @returns DualWriteResult with prepared update payloads
 */
export function safeDualWritePOStatus(
  poId: string,
  newUnifiedStatus: UnifiedPOStatus,
  currentLegacyStatus: string | null = null,
  currentUnifiedStatus: string | null = null,
  context: StatusUpdateContext = {}
): DualWriteResult {
  const timestamp = new Date()
  
  // Validate transition
  const validation = validateStatusTransition('PO', currentUnifiedStatus, newUnifiedStatus)
  
  // Map unified → legacy
  const newLegacyStatus = UnifiedToLegacyStatusMap.PO_STATUS[newUnifiedStatus] || currentLegacyStatus || 'CREATED'
  
  // Prepare legacy field update
  const legacyUpdate = {
    // Legacy field: po_status
    po_status: newLegacyStatus,
    // NOTE: This update should be applied to purchaseorders collection
    // where: { id: poId }
  }
  
  // Prepare unified field update
  const unifiedUpdate = {
    // Unified field: unified_po_status
    unified_po_status: newUnifiedStatus,
    unified_po_status_updated_at: timestamp,
    unified_po_status_updated_by: context.updatedBy || 'dual-write-wrapper',
  }
  
  // Prepare audit log entry
  const auditLog: AuditLogEntry = {
    entityType: 'PO',
    entityId: poId,
    action: 'STATUS_UPDATE',
    previousLegacyStatus: currentLegacyStatus,
    newLegacyStatus: newLegacyStatus,
    previousUnifiedStatus: currentUnifiedStatus,
    newUnifiedStatus: newUnifiedStatus,
    source: context.source || 'dual-write-wrapper',
    updatedBy: context.updatedBy || null,
    timestamp,
    metadata: {
      ...context.metadata,
      reason: context.reason,
      validationResult: validation,
    },
  }
  
  return {
    entityType: 'PO',
    entityId: poId,
    legacyUpdate,
    unifiedUpdate,
    auditLog,
    validation,
  }
}

/**
 * Safe Dual-Write for Shipment Status
 * 
 * @param shipmentId - Shipment ID
 * @param newUnifiedStatus - New unified shipment status
 * @param currentLegacyStatus - Current legacy shipmentStatus
 * @param currentUnifiedStatus - Current unified_shipment_status
 * @param context - Optional context metadata
 * @returns DualWriteResult with prepared update payloads
 */
export function safeDualWriteShipmentStatus(
  shipmentId: string,
  newUnifiedStatus: UnifiedShipmentStatus,
  currentLegacyStatus: string | null = null,
  currentUnifiedStatus: string | null = null,
  context: StatusUpdateContext = {}
): DualWriteResult {
  const timestamp = new Date()
  
  // Validate transition
  const validation = validateStatusTransition('Shipment', currentUnifiedStatus, newUnifiedStatus)
  
  // Map unified → legacy
  const newLegacyStatus = UnifiedToLegacyStatusMap.SHIPMENT_STATUS[newUnifiedStatus] || currentLegacyStatus || 'CREATED'
  
  // Prepare legacy field update
  const legacyUpdate: Record<string, unknown> = {
    // Legacy field: shipmentStatus
    shipmentStatus: newLegacyStatus,
    // Additional fields based on status
    ...(newUnifiedStatus === 'DELIVERED' && context.metadata?.deliveredDate
      ? { deliveredDate: context.metadata.deliveredDate }
      : {}),
    // NOTE: This update should be applied to shipments collection
    // where: { shipmentId: shipmentId }
  }
  
  // Prepare unified field update
  const unifiedUpdate: Record<string, unknown> = {
    // Unified field: unified_shipment_status
    unified_shipment_status: newUnifiedStatus,
    unified_shipment_status_updated_at: timestamp,
    unified_shipment_status_updated_by: context.updatedBy || 'dual-write-wrapper',
    ...(newUnifiedStatus === 'DELIVERED' && context.metadata?.deliveredDate
      ? { deliveredDate: context.metadata.deliveredDate }
      : {}),
    ...(['FAILED', 'RETURNED', 'LOST'].includes(newUnifiedStatus) && context.metadata?.failureReason
      ? { failure_reason: context.metadata.failureReason }
      : {}),
  }
  
  // Prepare audit log entry
  const auditLog: AuditLogEntry = {
    entityType: 'Shipment',
    entityId: shipmentId,
    action: 'STATUS_UPDATE',
    previousLegacyStatus: currentLegacyStatus,
    newLegacyStatus: newLegacyStatus as string,
    previousUnifiedStatus: currentUnifiedStatus,
    newUnifiedStatus: newUnifiedStatus,
    source: context.source || 'dual-write-wrapper',
    updatedBy: context.updatedBy || null,
    timestamp,
    metadata: {
      ...context.metadata,
      reason: context.reason,
      validationResult: validation,
    },
  }
  
  return {
    entityType: 'Shipment',
    entityId: shipmentId,
    legacyUpdate,
    unifiedUpdate,
    auditLog,
    validation,
  }
}

/**
 * Safe Dual-Write for GRN Status
 * 
 * @param grnId - GRN ID
 * @param newUnifiedStatus - New unified GRN status
 * @param currentLegacyStatus - Current legacy status (format: "status/grnStatus")
 * @param currentUnifiedStatus - Current unified_grn_status
 * @param context - Optional context metadata
 * @returns DualWriteResult with prepared update payloads
 */
export function safeDualWriteGRNStatus(
  grnId: string,
  newUnifiedStatus: UnifiedGRNStatus,
  currentLegacyStatus: string | null = null,
  currentUnifiedStatus: string | null = null,
  context: StatusUpdateContext = {}
): DualWriteResult {
  const timestamp = new Date()
  
  // Validate transition
  const validation = validateStatusTransition('GRN', currentUnifiedStatus, newUnifiedStatus)
  
  // Map unified → legacy (GRN has two legacy fields)
  const legacyStatuses = UnifiedToLegacyStatusMap.GRN_STATUS[newUnifiedStatus] || {
    grnStatus: 'RAISED',
    status: 'CREATED',
  }
  
  // Prepare legacy field update
  const legacyUpdate: Record<string, unknown> = {
    // Legacy fields: status and grnStatus
    status: legacyStatuses.status,
    grnStatus: legacyStatuses.grnStatus,
    // Additional fields based on status
    ...(newUnifiedStatus === 'APPROVED'
      ? {
          grnAcknowledgedByCompany: true,
          grnAcknowledgedDate: timestamp,
          grnAcknowledgedBy: context.updatedBy || 'system',
          approvedBy: context.updatedBy || 'system',
          approvedAt: timestamp,
        }
      : {}),
    // NOTE: This update should be applied to grns collection
    // where: { id: grnId }
  }
  
  // Prepare unified field update
  const unifiedUpdate: Record<string, unknown> = {
    // Unified field: unified_grn_status
    unified_grn_status: newUnifiedStatus,
    unified_grn_status_updated_at: timestamp,
    unified_grn_status_updated_by: context.updatedBy || 'dual-write-wrapper',
  }
  
  // Prepare audit log entry
  const auditLog: AuditLogEntry = {
    entityType: 'GRN',
    entityId: grnId,
    action: 'STATUS_UPDATE',
    previousLegacyStatus: currentLegacyStatus,
    newLegacyStatus: `${legacyStatuses.status}/${legacyStatuses.grnStatus}`,
    previousUnifiedStatus: currentUnifiedStatus,
    newUnifiedStatus: newUnifiedStatus,
    source: context.source || 'dual-write-wrapper',
    updatedBy: context.updatedBy || null,
    timestamp,
    metadata: {
      ...context.metadata,
      reason: context.reason,
      validationResult: validation,
    },
  }
  
  return {
    entityType: 'GRN',
    entityId: grnId,
    legacyUpdate,
    unifiedUpdate,
    auditLog,
    validation,
  }
}

/**
 * Safe Dual-Write for Invoice Status
 * 
 * @param invoiceId - Invoice ID
 * @param newUnifiedStatus - New unified invoice status
 * @param currentLegacyStatus - Current legacy invoiceStatus
 * @param currentUnifiedStatus - Current unified_invoice_status
 * @param context - Optional context metadata
 * @returns DualWriteResult with prepared update payloads
 */
export function safeDualWriteInvoiceStatus(
  invoiceId: string,
  newUnifiedStatus: UnifiedInvoiceStatus,
  currentLegacyStatus: string | null = null,
  currentUnifiedStatus: string | null = null,
  context: StatusUpdateContext = {}
): DualWriteResult {
  const timestamp = new Date()
  
  // Validate transition
  const validation = validateStatusTransition('Invoice', currentUnifiedStatus, newUnifiedStatus)
  
  // Map unified → legacy
  const newLegacyStatus = UnifiedToLegacyStatusMap.INVOICE_STATUS[newUnifiedStatus] || currentLegacyStatus || 'RAISED'
  
  // Prepare legacy field update
  const legacyUpdate: Record<string, unknown> = {
    // Legacy field: invoiceStatus
    invoiceStatus: newLegacyStatus,
    // Additional fields based on status
    ...(newUnifiedStatus === 'APPROVED'
      ? {
          approvedBy: context.updatedBy || 'system',
          approvedAt: timestamp,
        }
      : {}),
    // NOTE: This update should be applied to invoices collection
    // where: { id: invoiceId }
  }
  
  // Prepare unified field update
  const unifiedUpdate: Record<string, unknown> = {
    // Unified field: unified_invoice_status
    unified_invoice_status: newUnifiedStatus,
    unified_invoice_status_updated_at: timestamp,
    unified_invoice_status_updated_by: context.updatedBy || 'dual-write-wrapper',
  }
  
  // Prepare audit log entry
  const auditLog: AuditLogEntry = {
    entityType: 'Invoice',
    entityId: invoiceId,
    action: 'STATUS_UPDATE',
    previousLegacyStatus: currentLegacyStatus,
    newLegacyStatus: newLegacyStatus as string,
    previousUnifiedStatus: currentUnifiedStatus,
    newUnifiedStatus: newUnifiedStatus,
    source: context.source || 'dual-write-wrapper',
    updatedBy: context.updatedBy || null,
    timestamp,
    metadata: {
      ...context.metadata,
      reason: context.reason,
      validationResult: validation,
    },
  }
  
  return {
    entityType: 'Invoice',
    entityId: invoiceId,
    legacyUpdate,
    unifiedUpdate,
    auditLog,
    validation,
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get legacy status from unified status
 * Returns the original value if mapping not found (no deletion of unknown values)
 */
export function getlegacyStatusFromUnified(
  entityType: 'Order' | 'PR' | 'PO' | 'Shipment' | 'GRN' | 'Invoice',
  unifiedStatus: string,
  originalLegacyStatus?: string | null
): string | { grnStatus: string; status: string } {
  switch (entityType) {
    case 'Order':
      return UnifiedToLegacyStatusMap.ORDER_STATUS[unifiedStatus as UnifiedOrderStatus] || originalLegacyStatus || 'Awaiting approval'
    case 'PR':
      return UnifiedToLegacyStatusMap.PR_STATUS[unifiedStatus as UnifiedPRStatus] || originalLegacyStatus || 'DRAFT'
    case 'PO':
      return UnifiedToLegacyStatusMap.PO_STATUS[unifiedStatus as UnifiedPOStatus] || originalLegacyStatus || 'CREATED'
    case 'Shipment':
      return UnifiedToLegacyStatusMap.SHIPMENT_STATUS[unifiedStatus as UnifiedShipmentStatus] || originalLegacyStatus || 'CREATED'
    case 'GRN':
      return UnifiedToLegacyStatusMap.GRN_STATUS[unifiedStatus as UnifiedGRNStatus] || { grnStatus: 'RAISED', status: 'CREATED' }
    case 'Invoice':
      return UnifiedToLegacyStatusMap.INVOICE_STATUS[unifiedStatus as UnifiedInvoiceStatus] || originalLegacyStatus || 'RAISED'
    default:
      return originalLegacyStatus || 'UNKNOWN'
  }
}

/**
 * Get unified status from legacy status
 * Returns the original value if mapping not found (no deletion of unknown values)
 */
export function getUnifiedStatusFromLegacy(
  entityType: 'Order' | 'PR' | 'PO' | 'Shipment' | 'GRN' | 'Invoice',
  legacyStatus: string,
  originalUnifiedStatus?: string | null
): string {
  switch (entityType) {
    case 'Order':
      return LegacyToUnifiedStatusMap.ORDER_STATUS[legacyStatus as LegacyOrderStatus] || originalUnifiedStatus || 'CREATED'
    case 'PR':
      return LegacyToUnifiedStatusMap.PR_STATUS[legacyStatus as LegacyPRStatus] || originalUnifiedStatus || 'DRAFT'
    case 'PO':
      return LegacyToUnifiedStatusMap.PO_STATUS[legacyStatus as LegacyPOStatus] || originalUnifiedStatus || 'CREATED'
    case 'Shipment':
      return LegacyToUnifiedStatusMap.SHIPMENT_STATUS[legacyStatus as LegacyShipmentStatus] || originalUnifiedStatus || 'CREATED'
    case 'GRN':
      return LegacyToUnifiedStatusMap.GRN_STATUS[legacyStatus as LegacyGRNApprovalStatus] || 
             LegacyToUnifiedStatusMap.GRN_LEGACY_STATUS[legacyStatus as LegacyGRNStatus] || 
             originalUnifiedStatus || 'DRAFT'
    case 'Invoice':
      return LegacyToUnifiedStatusMap.INVOICE_STATUS[legacyStatus as LegacyInvoiceStatus] || originalUnifiedStatus || 'RAISED'
    default:
      return originalUnifiedStatus || 'UNKNOWN'
  }
}
