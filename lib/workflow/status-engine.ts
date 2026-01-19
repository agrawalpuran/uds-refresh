/**
 * Unified Workflow Status Engine
 * 
 * This module provides centralized status management for all workflow entities.
 * It implements DUAL-WRITE logic to maintain backward compatibility while
 * transitioning to unified status fields.
 * 
 * IMPORTANT: This is an ADDITIVE change - no existing fields are removed.
 * 
 * @module lib/workflow/status-engine
 * @version 1.0.0
 * @created 2026-01-15
 */

// =============================================================================
// UNIFIED STATUS TYPE DEFINITIONS
// =============================================================================

/**
 * Unified Order Status (Simple Workflow)
 * Maps to legacy: Order.status
 */
export const UNIFIED_ORDER_STATUS = {
  CREATED: 'CREATED',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  IN_FULFILMENT: 'IN_FULFILMENT',
  DISPATCHED: 'DISPATCHED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const

export type UnifiedOrderStatus = typeof UNIFIED_ORDER_STATUS[keyof typeof UNIFIED_ORDER_STATUS]

/**
 * Unified PR Status (Full Workflow)
 * NOTE: Legacy pr_status field has been removed from the Order schema.
 * Use unified_pr_status exclusively.
 */
export const UNIFIED_PR_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_SITE_ADMIN_APPROVAL: 'PENDING_SITE_ADMIN_APPROVAL',
  SITE_ADMIN_APPROVED: 'SITE_ADMIN_APPROVED',
  PENDING_COMPANY_ADMIN_APPROVAL: 'PENDING_COMPANY_ADMIN_APPROVAL',
  COMPANY_ADMIN_APPROVED: 'COMPANY_ADMIN_APPROVED',
  REJECTED: 'REJECTED',
  LINKED_TO_PO: 'LINKED_TO_PO',
  IN_SHIPMENT: 'IN_SHIPMENT',
  PARTIALLY_DELIVERED: 'PARTIALLY_DELIVERED',
  FULLY_DELIVERED: 'FULLY_DELIVERED',
  CLOSED: 'CLOSED',
} as const

export type UnifiedPRStatus = typeof UNIFIED_PR_STATUS[keyof typeof UNIFIED_PR_STATUS]

/**
 * Unified PO Status
 * Maps to legacy: PurchaseOrder.po_status
 */
export const UNIFIED_PO_STATUS = {
  CREATED: 'CREATED',
  SENT_TO_VENDOR: 'SENT_TO_VENDOR',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  IN_FULFILMENT: 'IN_FULFILMENT',
  PARTIALLY_SHIPPED: 'PARTIALLY_SHIPPED',
  FULLY_SHIPPED: 'FULLY_SHIPPED',
  PARTIALLY_DELIVERED: 'PARTIALLY_DELIVERED',
  FULLY_DELIVERED: 'FULLY_DELIVERED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const

export type UnifiedPOStatus = typeof UNIFIED_PO_STATUS[keyof typeof UNIFIED_PO_STATUS]

/**
 * Unified Shipment Status
 * Maps to legacy: Shipment.shipmentStatus
 */
export const UNIFIED_SHIPMENT_STATUS = {
  CREATED: 'CREATED',
  MANIFESTED: 'MANIFESTED',
  PICKED_UP: 'PICKED_UP',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  RETURNED: 'RETURNED',
  LOST: 'LOST',
} as const

export type UnifiedShipmentStatus = typeof UNIFIED_SHIPMENT_STATUS[keyof typeof UNIFIED_SHIPMENT_STATUS]

/**
 * Unified GRN Status
 * Maps to legacy: GRN.status and GRN.grnStatus
 */
export const UNIFIED_GRN_STATUS = {
  DRAFT: 'DRAFT',
  RAISED: 'RAISED',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  INVOICED: 'INVOICED',
  CLOSED: 'CLOSED',
} as const

export type UnifiedGRNStatus = typeof UNIFIED_GRN_STATUS[keyof typeof UNIFIED_GRN_STATUS]

/**
 * Unified Invoice Status
 * Maps to legacy: Invoice.invoiceStatus
 */
export const UNIFIED_INVOICE_STATUS = {
  RAISED: 'RAISED',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  PAID: 'PAID',
  DISPUTED: 'DISPUTED',
  CANCELLED: 'CANCELLED',
} as const

export type UnifiedInvoiceStatus = typeof UNIFIED_INVOICE_STATUS[keyof typeof UNIFIED_INVOICE_STATUS]

// Legacy type aliases for backward compatibility
export type LegacyOrderStatus = 'Awaiting approval' | 'Awaiting fulfilment' | 'Dispatched' | 'Delivered'
export type LegacyPRStatus = 'DRAFT' | 'SUBMITTED' | 'PENDING_SITE_ADMIN_APPROVAL' | 'SITE_ADMIN_APPROVED' | 'PENDING_COMPANY_ADMIN_APPROVAL' | 'COMPANY_ADMIN_APPROVED' | 'REJECTED_BY_SITE_ADMIN' | 'REJECTED_BY_COMPANY_ADMIN' | 'PO_CREATED' | 'FULLY_DELIVERED'
export type LegacyPOStatus = 'CREATED' | 'SENT_TO_VENDOR' | 'ACKNOWLEDGED' | 'IN_FULFILMENT' | 'COMPLETED' | 'CANCELLED'
export type LegacyShipmentStatus = 'CREATED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED'
export type LegacyGRNStatus = 'CREATED' | 'ACKNOWLEDGED' | 'INVOICED' | 'RECEIVED' | 'CLOSED'
export type LegacyGRNApprovalStatus = 'RAISED' | 'APPROVED'
export type LegacyInvoiceStatus = 'RAISED' | 'APPROVED'

// =============================================================================
// LEGACY TO UNIFIED MAPPING FUNCTIONS
// =============================================================================

/**
 * Map legacy Order.status to Unified Order Status
 */
export function mapLegacyOrderStatusToUnified(
  legacyStatus: string | undefined | null
): UnifiedOrderStatus {
  const mapping: Record<string, UnifiedOrderStatus> = {
    'Awaiting approval': UNIFIED_ORDER_STATUS.PENDING_APPROVAL,
    'Awaiting fulfilment': UNIFIED_ORDER_STATUS.IN_FULFILMENT,
    'Dispatched': UNIFIED_ORDER_STATUS.DISPATCHED,
    'Delivered': UNIFIED_ORDER_STATUS.DELIVERED,
  }
  return mapping[legacyStatus || ''] || UNIFIED_ORDER_STATUS.CREATED
}

/**
 * Map Unified Order Status back to legacy Order.status
 */
export function mapUnifiedOrderStatusToLegacy(
  unifiedStatus: UnifiedOrderStatus
): LegacyOrderStatus {
  const mapping: Record<UnifiedOrderStatus, LegacyOrderStatus> = {
    [UNIFIED_ORDER_STATUS.CREATED]: 'Awaiting approval',
    [UNIFIED_ORDER_STATUS.PENDING_APPROVAL]: 'Awaiting approval',
    [UNIFIED_ORDER_STATUS.APPROVED]: 'Awaiting fulfilment',
    [UNIFIED_ORDER_STATUS.IN_FULFILMENT]: 'Awaiting fulfilment',
    [UNIFIED_ORDER_STATUS.DISPATCHED]: 'Dispatched',
    [UNIFIED_ORDER_STATUS.DELIVERED]: 'Delivered',
    [UNIFIED_ORDER_STATUS.CANCELLED]: 'Awaiting approval', // Legacy doesn't have cancelled
  }
  return mapping[unifiedStatus]
}

/**
 * Map legacy PR status to Unified PR Status
 */
export function mapLegacyPRStatusToUnified(
  legacyStatus: string | undefined | null
): UnifiedPRStatus {
  const mapping: Record<string, UnifiedPRStatus> = {
    'DRAFT': UNIFIED_PR_STATUS.DRAFT,
    'SUBMITTED': UNIFIED_PR_STATUS.PENDING_SITE_ADMIN_APPROVAL,
    'PENDING_SITE_ADMIN_APPROVAL': UNIFIED_PR_STATUS.PENDING_SITE_ADMIN_APPROVAL,
    'SITE_ADMIN_APPROVED': UNIFIED_PR_STATUS.SITE_ADMIN_APPROVED,
    'PENDING_COMPANY_ADMIN_APPROVAL': UNIFIED_PR_STATUS.PENDING_COMPANY_ADMIN_APPROVAL,
    'COMPANY_ADMIN_APPROVED': UNIFIED_PR_STATUS.COMPANY_ADMIN_APPROVED,
    'REJECTED_BY_SITE_ADMIN': UNIFIED_PR_STATUS.REJECTED,
    'REJECTED_BY_COMPANY_ADMIN': UNIFIED_PR_STATUS.REJECTED,
    'PO_CREATED': UNIFIED_PR_STATUS.LINKED_TO_PO,
    'FULLY_DELIVERED': UNIFIED_PR_STATUS.FULLY_DELIVERED,
  }
  return mapping[legacyStatus || ''] || UNIFIED_PR_STATUS.DRAFT
}

/**
 * Map Unified PR Status back to legacy PR status
 */
export function mapUnifiedPRStatusToLegacy(
  unifiedStatus: UnifiedPRStatus
): LegacyPRStatus {
  const mapping: Record<UnifiedPRStatus, LegacyPRStatus> = {
    [UNIFIED_PR_STATUS.DRAFT]: 'DRAFT',
    [UNIFIED_PR_STATUS.PENDING_SITE_ADMIN_APPROVAL]: 'PENDING_SITE_ADMIN_APPROVAL',
    [UNIFIED_PR_STATUS.SITE_ADMIN_APPROVED]: 'SITE_ADMIN_APPROVED',
    [UNIFIED_PR_STATUS.PENDING_COMPANY_ADMIN_APPROVAL]: 'PENDING_COMPANY_ADMIN_APPROVAL',
    [UNIFIED_PR_STATUS.COMPANY_ADMIN_APPROVED]: 'COMPANY_ADMIN_APPROVED',
    [UNIFIED_PR_STATUS.REJECTED]: 'REJECTED_BY_COMPANY_ADMIN', // Default to company admin rejection
    [UNIFIED_PR_STATUS.LINKED_TO_PO]: 'PO_CREATED',
    [UNIFIED_PR_STATUS.IN_SHIPMENT]: 'PO_CREATED', // Legacy doesn't have IN_SHIPMENT
    [UNIFIED_PR_STATUS.PARTIALLY_DELIVERED]: 'PO_CREATED', // Legacy doesn't have PARTIALLY_DELIVERED
    [UNIFIED_PR_STATUS.FULLY_DELIVERED]: 'FULLY_DELIVERED',
    [UNIFIED_PR_STATUS.CLOSED]: 'FULLY_DELIVERED', // Legacy doesn't have CLOSED
  }
  return mapping[unifiedStatus]
}

/**
 * Map legacy PO status to Unified PO Status
 */
export function mapLegacyPOStatusToUnified(
  legacyStatus: string | undefined | null
): UnifiedPOStatus {
  const mapping: Record<string, UnifiedPOStatus> = {
    'CREATED': UNIFIED_PO_STATUS.CREATED,
    'SENT_TO_VENDOR': UNIFIED_PO_STATUS.SENT_TO_VENDOR,
    'ACKNOWLEDGED': UNIFIED_PO_STATUS.ACKNOWLEDGED,
    'IN_FULFILMENT': UNIFIED_PO_STATUS.IN_FULFILMENT,
    'COMPLETED': UNIFIED_PO_STATUS.FULLY_DELIVERED,
    'CANCELLED': UNIFIED_PO_STATUS.CANCELLED,
  }
  return mapping[legacyStatus || ''] || UNIFIED_PO_STATUS.CREATED
}

/**
 * Map Unified PO Status back to legacy PO status
 */
export function mapUnifiedPOStatusToLegacy(
  unifiedStatus: UnifiedPOStatus
): LegacyPOStatus {
  const mapping: Record<UnifiedPOStatus, LegacyPOStatus> = {
    [UNIFIED_PO_STATUS.CREATED]: 'CREATED',
    [UNIFIED_PO_STATUS.SENT_TO_VENDOR]: 'SENT_TO_VENDOR',
    [UNIFIED_PO_STATUS.ACKNOWLEDGED]: 'ACKNOWLEDGED',
    [UNIFIED_PO_STATUS.IN_FULFILMENT]: 'IN_FULFILMENT',
    [UNIFIED_PO_STATUS.PARTIALLY_SHIPPED]: 'IN_FULFILMENT',
    [UNIFIED_PO_STATUS.FULLY_SHIPPED]: 'IN_FULFILMENT',
    [UNIFIED_PO_STATUS.PARTIALLY_DELIVERED]: 'IN_FULFILMENT',
    [UNIFIED_PO_STATUS.FULLY_DELIVERED]: 'COMPLETED',
    [UNIFIED_PO_STATUS.CLOSED]: 'COMPLETED',
    [UNIFIED_PO_STATUS.CANCELLED]: 'CANCELLED',
  }
  return mapping[unifiedStatus]
}

/**
 * Map legacy Shipment status to Unified Shipment Status
 */
export function mapLegacyShipmentStatusToUnified(
  legacyStatus: string | undefined | null
): UnifiedShipmentStatus {
  const mapping: Record<string, UnifiedShipmentStatus> = {
    'CREATED': UNIFIED_SHIPMENT_STATUS.CREATED,
    'IN_TRANSIT': UNIFIED_SHIPMENT_STATUS.IN_TRANSIT,
    'DELIVERED': UNIFIED_SHIPMENT_STATUS.DELIVERED,
    'FAILED': UNIFIED_SHIPMENT_STATUS.FAILED,
  }
  return mapping[legacyStatus || ''] || UNIFIED_SHIPMENT_STATUS.CREATED
}

/**
 * Map Unified Shipment Status back to legacy Shipment status
 */
export function mapUnifiedShipmentStatusToLegacy(
  unifiedStatus: UnifiedShipmentStatus
): LegacyShipmentStatus {
  const mapping: Record<UnifiedShipmentStatus, LegacyShipmentStatus> = {
    [UNIFIED_SHIPMENT_STATUS.CREATED]: 'CREATED',
    [UNIFIED_SHIPMENT_STATUS.MANIFESTED]: 'CREATED',
    [UNIFIED_SHIPMENT_STATUS.PICKED_UP]: 'IN_TRANSIT',
    [UNIFIED_SHIPMENT_STATUS.IN_TRANSIT]: 'IN_TRANSIT',
    [UNIFIED_SHIPMENT_STATUS.OUT_FOR_DELIVERY]: 'IN_TRANSIT',
    [UNIFIED_SHIPMENT_STATUS.DELIVERED]: 'DELIVERED',
    [UNIFIED_SHIPMENT_STATUS.FAILED]: 'FAILED',
    [UNIFIED_SHIPMENT_STATUS.RETURNED]: 'FAILED',
    [UNIFIED_SHIPMENT_STATUS.LOST]: 'FAILED',
  }
  return mapping[unifiedStatus]
}

/**
 * Map legacy GRN status to Unified GRN Status
 */
export function mapLegacyGRNStatusToUnified(
  legacyStatus: string | undefined | null,
  legacyGrnStatus: string | undefined | null
): UnifiedGRNStatus {
  // Prefer grnStatus if available (new field)
  if (legacyGrnStatus === 'APPROVED') {
    return UNIFIED_GRN_STATUS.APPROVED
  }
  if (legacyGrnStatus === 'RAISED') {
    return UNIFIED_GRN_STATUS.RAISED
  }
  
  // Fall back to legacy status field
  const mapping: Record<string, UnifiedGRNStatus> = {
    'CREATED': UNIFIED_GRN_STATUS.RAISED,
    'ACKNOWLEDGED': UNIFIED_GRN_STATUS.APPROVED,
    'INVOICED': UNIFIED_GRN_STATUS.INVOICED,
    'RECEIVED': UNIFIED_GRN_STATUS.APPROVED,
    'CLOSED': UNIFIED_GRN_STATUS.CLOSED,
  }
  return mapping[legacyStatus || ''] || UNIFIED_GRN_STATUS.DRAFT
}

/**
 * Map Unified GRN Status back to legacy status fields
 */
export function mapUnifiedGRNStatusToLegacy(
  unifiedStatus: UnifiedGRNStatus
): { status: LegacyGRNStatus, grnStatus: LegacyGRNApprovalStatus } {
  const mapping: Record<UnifiedGRNStatus, { status: LegacyGRNStatus, grnStatus: LegacyGRNApprovalStatus }> = {
    [UNIFIED_GRN_STATUS.DRAFT]: { status: 'CREATED', grnStatus: 'RAISED' },
    [UNIFIED_GRN_STATUS.RAISED]: { status: 'CREATED', grnStatus: 'RAISED' },
    [UNIFIED_GRN_STATUS.PENDING_APPROVAL]: { status: 'CREATED', grnStatus: 'RAISED' },
    [UNIFIED_GRN_STATUS.APPROVED]: { status: 'ACKNOWLEDGED', grnStatus: 'APPROVED' },
    [UNIFIED_GRN_STATUS.INVOICED]: { status: 'INVOICED', grnStatus: 'APPROVED' },
    [UNIFIED_GRN_STATUS.CLOSED]: { status: 'CLOSED', grnStatus: 'APPROVED' },
  }
  return mapping[unifiedStatus]
}

/**
 * Map legacy Invoice status to Unified Invoice Status
 */
export function mapLegacyInvoiceStatusToUnified(
  legacyStatus: string | undefined | null
): UnifiedInvoiceStatus {
  const mapping: Record<string, UnifiedInvoiceStatus> = {
    'RAISED': UNIFIED_INVOICE_STATUS.RAISED,
    'APPROVED': UNIFIED_INVOICE_STATUS.APPROVED,
  }
  return mapping[legacyStatus || ''] || UNIFIED_INVOICE_STATUS.RAISED
}

/**
 * Map Unified Invoice Status back to legacy Invoice status
 */
export function mapUnifiedInvoiceStatusToLegacy(
  unifiedStatus: UnifiedInvoiceStatus
): LegacyInvoiceStatus {
  const mapping: Record<UnifiedInvoiceStatus, LegacyInvoiceStatus> = {
    [UNIFIED_INVOICE_STATUS.RAISED]: 'RAISED',
    [UNIFIED_INVOICE_STATUS.PENDING_APPROVAL]: 'RAISED',
    [UNIFIED_INVOICE_STATUS.APPROVED]: 'APPROVED',
    [UNIFIED_INVOICE_STATUS.PAID]: 'APPROVED',
    [UNIFIED_INVOICE_STATUS.DISPUTED]: 'RAISED',
    [UNIFIED_INVOICE_STATUS.CANCELLED]: 'RAISED',
  }
  return mapping[unifiedStatus]
}

// =============================================================================
// INCONSISTENCY DETECTION & LOGGING
// =============================================================================

/**
 * Log warning when old and new status fields are inconsistent
 */
export function warnIfInconsistent(
  entityType: string,
  entityId: string,
  oldStatus: string | undefined | null,
  newStatus: string | undefined | null,
  expectedNewStatus: string
): void {
  if (newStatus && newStatus !== expectedNewStatus) {
    console.warn(
      `[STATUS-ENGINE] ⚠️ INCONSISTENCY DETECTED in ${entityType} ${entityId}:`,
      {
        oldStatus,
        currentNewStatus: newStatus,
        expectedNewStatus,
        recommendation: 'Consider running status reconciliation',
        timestamp: new Date().toISOString(),
      }
    )
  }
}

/**
 * Log status transition for audit purposes
 */
export function logStatusTransition(
  entityType: string,
  entityId: string,
  previousStatus: string | undefined | null,
  newStatus: string,
  context?: {
    updatedBy?: string
    reason?: string
    legacyStatus?: string
  }
): void {
  console.log(`[STATUS-ENGINE] ✅ ${entityType} ${entityId} status updated:`, {
    previousStatus: previousStatus || 'N/A',
    newStatus,
    legacyStatus: context?.legacyStatus,
    updatedBy: context?.updatedBy || 'system',
    reason: context?.reason || 'status_update',
    timestamp: new Date().toISOString(),
  })
}

// =============================================================================
// DUAL-WRITE STATUS UPDATE FUNCTIONS
// =============================================================================

export interface StatusUpdateResult {
  success: boolean
  previousLegacyStatus: string | undefined
  newLegacyStatus: string
  previousUnifiedStatus: string | undefined
  newUnifiedStatus: string
  error?: string
}

export interface StatusUpdateContext {
  updatedBy?: string
  reason?: string
}

/**
 * Update Order status with dual-write
 * Writes to both legacy 'status' and new 'unified_status' fields
 * 
 * @deprecated Use safeDualWriteOrderStatus from migrations/dualwrite/status-dualwrite-wrapper.ts instead.
 * This function will be removed when FEATURE_FLAG_REMOVE_OLD_FIELDS is enabled.
 * Cleanup Phase: 4
 */
export async function updateOrderStatusDualWrite(
  orderId: string,
  newUnifiedStatus: UnifiedOrderStatus,
  context: StatusUpdateContext = {}
): Promise<StatusUpdateResult> {
  const Order = (await import('../models/Order')).default
  const connectDB = (await import('../db/mongodb')).default
  
  await connectDB()
  
  try {
    const order = await Order.findOne({ id: orderId })
    if (!order) {
      return { 
        success: false, 
        previousLegacyStatus: undefined,
        newLegacyStatus: '',
        previousUnifiedStatus: undefined,
        newUnifiedStatus: '',
        error: `Order not found: ${orderId}` 
      }
    }
    
    const previousLegacyStatus = order.status
    const previousUnifiedStatus = order.unified_status
    const newLegacyStatus = mapUnifiedOrderStatusToLegacy(newUnifiedStatus)
    
    // Check for inconsistency
    warnIfInconsistent(
      'Order',
      orderId,
      previousLegacyStatus,
      previousUnifiedStatus,
      mapLegacyOrderStatusToUnified(previousLegacyStatus)
    )
    
    // DUAL WRITE: Update both fields
    order.status = newLegacyStatus
    order.unified_status = newUnifiedStatus
    order.unified_status_updated_at = new Date()
    if (context.updatedBy) {
      order.unified_status_updated_by = context.updatedBy
    }
    
    await order.save()
    
    logStatusTransition('Order', orderId, previousUnifiedStatus, newUnifiedStatus, {
      updatedBy: context.updatedBy,
      reason: context.reason,
      legacyStatus: `${previousLegacyStatus} → ${newLegacyStatus}`,
    })
    
    return {
      success: true,
      previousLegacyStatus,
      newLegacyStatus,
      previousUnifiedStatus,
      newUnifiedStatus,
    }
  } catch (error: any) {
    console.error(`[STATUS-ENGINE] ❌ Failed to update Order ${orderId} status:`, error.message)
    return { 
      success: false, 
      previousLegacyStatus: undefined,
      newLegacyStatus: '',
      previousUnifiedStatus: undefined,
      newUnifiedStatus: '',
      error: error.message 
    }
  }
}

/**
 * Update PR status (unified-only mode)
 * Only updates unified_pr_status field (legacy pr_status has been removed)
 * 
 * @deprecated Use safeDualWritePRStatus from migrations/dualwrite/status-dualwrite-wrapper.ts instead.
 * This function will be removed when FEATURE_FLAG_REMOVE_OLD_FIELDS is enabled.
 * Cleanup Phase: 4
 */
export async function updatePRStatusDualWrite(
  prId: string,
  newUnifiedStatus: UnifiedPRStatus,
  context: StatusUpdateContext & { rejectionReason?: string } = {}
): Promise<StatusUpdateResult> {
  const Order = (await import('../models/Order')).default
  const connectDB = (await import('../db/mongodb')).default
  
  await connectDB()
  
  try {
    const pr = await Order.findOne({ id: prId })
    if (!pr) {
      return { 
        success: false, 
        previousLegacyStatus: undefined,
        newLegacyStatus: '',
        previousUnifiedStatus: undefined,
        newUnifiedStatus: '',
        error: `PR (Order) not found: ${prId}` 
      }
    }
    
    const previousUnifiedStatus = pr.unified_pr_status
    const newLegacyStatus = mapUnifiedPRStatusToLegacy(newUnifiedStatus)
    
    // Update unified field only (legacy pr_status removed)
    pr.unified_pr_status = newUnifiedStatus
    pr.unified_pr_status_updated_at = new Date()
    if (context.updatedBy) {
      pr.unified_pr_status_updated_by = context.updatedBy
    }
    
    if (context.rejectionReason && newUnifiedStatus === UNIFIED_PR_STATUS.REJECTED) {
      pr.rejection_reason = context.rejectionReason
    }
    
    await pr.save()
    
    logStatusTransition('PR', prId, previousUnifiedStatus, newUnifiedStatus, {
      updatedBy: context.updatedBy,
      reason: context.reason,
    })
    
    return {
      success: true,
      previousLegacyStatus: undefined,
      newLegacyStatus,
      previousUnifiedStatus,
      newUnifiedStatus,
    }
  } catch (error: any) {
    console.error(`[STATUS-ENGINE] ❌ Failed to update PR ${prId} status:`, error.message)
    return { 
      success: false, 
      previousLegacyStatus: undefined,
      newLegacyStatus: '',
      previousUnifiedStatus: undefined,
      newUnifiedStatus: '',
      error: error.message 
    }
  }
}

/**
 * Update PO status with dual-write
 * Writes to both legacy 'po_status' and new 'unified_po_status' fields
 * 
 * @deprecated Use safeDualWritePOStatus from migrations/dualwrite/status-dualwrite-wrapper.ts instead.
 * This function will be removed when FEATURE_FLAG_REMOVE_OLD_FIELDS is enabled.
 * Cleanup Phase: 4
 */
export async function updatePOStatusDualWrite(
  poId: string,
  newUnifiedStatus: UnifiedPOStatus,
  context: StatusUpdateContext = {}
): Promise<StatusUpdateResult> {
  const PurchaseOrder = (await import('../models/PurchaseOrder')).default
  const connectDB = (await import('../db/mongodb')).default
  
  await connectDB()
  
  try {
    const po = await PurchaseOrder.findOne({ id: poId })
    if (!po) {
      return { 
        success: false, 
        previousLegacyStatus: undefined,
        newLegacyStatus: '',
        previousUnifiedStatus: undefined,
        newUnifiedStatus: '',
        error: `PO not found: ${poId}` 
      }
    }
    
    const previousLegacyStatus = po.po_status
    const previousUnifiedStatus = po.unified_po_status
    const newLegacyStatus = mapUnifiedPOStatusToLegacy(newUnifiedStatus)
    
    // Check for inconsistency
    warnIfInconsistent(
      'PO',
      poId,
      previousLegacyStatus,
      previousUnifiedStatus,
      mapLegacyPOStatusToUnified(previousLegacyStatus)
    )
    
    // DUAL WRITE: Update both fields
    po.po_status = newLegacyStatus
    po.unified_po_status = newUnifiedStatus
    po.unified_po_status_updated_at = new Date()
    if (context.updatedBy) {
      po.unified_po_status_updated_by = context.updatedBy
    }
    
    await po.save()
    
    logStatusTransition('PO', poId, previousUnifiedStatus, newUnifiedStatus, {
      updatedBy: context.updatedBy,
      reason: context.reason,
      legacyStatus: `${previousLegacyStatus} → ${newLegacyStatus}`,
    })
    
    return {
      success: true,
      previousLegacyStatus,
      newLegacyStatus,
      previousUnifiedStatus,
      newUnifiedStatus,
    }
  } catch (error: any) {
    console.error(`[STATUS-ENGINE] ❌ Failed to update PO ${poId} status:`, error.message)
    return { 
      success: false, 
      previousLegacyStatus: undefined,
      newLegacyStatus: '',
      previousUnifiedStatus: undefined,
      newUnifiedStatus: '',
      error: error.message 
    }
  }
}

/**
 * Update Shipment status with dual-write
 * Writes to both legacy 'shipmentStatus' and new 'unified_shipment_status' fields
 * 
 * @deprecated Use safeDualWriteShipmentStatus from migrations/dualwrite/status-dualwrite-wrapper.ts instead.
 * This function will be removed when FEATURE_FLAG_REMOVE_OLD_FIELDS is enabled.
 * Cleanup Phase: 4
 */
export async function updateShipmentStatusDualWrite(
  shipmentId: string,
  newUnifiedStatus: UnifiedShipmentStatus,
  context: StatusUpdateContext & { 
    deliveredDate?: Date
    failureReason?: string 
  } = {}
): Promise<StatusUpdateResult> {
  const Shipment = (await import('../models/Shipment')).default
  const connectDB = (await import('../db/mongodb')).default
  
  await connectDB()
  
  try {
    const shipment = await Shipment.findOne({ shipmentId })
    if (!shipment) {
      return { 
        success: false, 
        previousLegacyStatus: undefined,
        newLegacyStatus: '',
        previousUnifiedStatus: undefined,
        newUnifiedStatus: '',
        error: `Shipment not found: ${shipmentId}` 
      }
    }
    
    const previousLegacyStatus = shipment.shipmentStatus
    const previousUnifiedStatus = shipment.unified_shipment_status
    const newLegacyStatus = mapUnifiedShipmentStatusToLegacy(newUnifiedStatus)
    
    // Check for inconsistency
    warnIfInconsistent(
      'Shipment',
      shipmentId,
      previousLegacyStatus,
      previousUnifiedStatus,
      mapLegacyShipmentStatusToUnified(previousLegacyStatus)
    )
    
    // DUAL WRITE: Update both fields
    shipment.shipmentStatus = newLegacyStatus
    shipment.unified_shipment_status = newUnifiedStatus
    shipment.unified_shipment_status_updated_at = new Date()
    if (context.updatedBy) {
      shipment.unified_shipment_status_updated_by = context.updatedBy
    }
    
    if (context.deliveredDate && newUnifiedStatus === UNIFIED_SHIPMENT_STATUS.DELIVERED) {
      shipment.deliveredDate = context.deliveredDate
    }
    
    if (context.failureReason && [UNIFIED_SHIPMENT_STATUS.FAILED, UNIFIED_SHIPMENT_STATUS.RETURNED, UNIFIED_SHIPMENT_STATUS.LOST].includes(newUnifiedStatus)) {
      shipment.failure_reason = context.failureReason
    }
    
    await shipment.save()
    
    logStatusTransition('Shipment', shipmentId, previousUnifiedStatus, newUnifiedStatus, {
      updatedBy: context.updatedBy,
      reason: context.reason,
      legacyStatus: `${previousLegacyStatus} → ${newLegacyStatus}`,
    })
    
    return {
      success: true,
      previousLegacyStatus,
      newLegacyStatus,
      previousUnifiedStatus,
      newUnifiedStatus,
    }
  } catch (error: any) {
    console.error(`[STATUS-ENGINE] ❌ Failed to update Shipment ${shipmentId} status:`, error.message)
    return { 
      success: false, 
      previousLegacyStatus: undefined,
      newLegacyStatus: '',
      previousUnifiedStatus: undefined,
      newUnifiedStatus: '',
      error: error.message 
    }
  }
}

/**
 * Update GRN status with dual-write
 * Writes to both legacy 'status'/'grnStatus' and new 'unified_grn_status' fields
 * 
 * @deprecated Use safeDualWriteGRNStatus from migrations/dualwrite/status-dualwrite-wrapper.ts instead.
 * This function will be removed when FEATURE_FLAG_REMOVE_OLD_FIELDS is enabled.
 * Cleanup Phase: 4
 */
export async function updateGRNStatusDualWrite(
  grnId: string,
  newUnifiedStatus: UnifiedGRNStatus,
  context: StatusUpdateContext & {
    approvedBy?: string
    approvedAt?: Date
  } = {}
): Promise<StatusUpdateResult> {
  const GRN = (await import('../models/GRN')).default
  const connectDB = (await import('../db/mongodb')).default
  
  await connectDB()
  
  try {
    const grn = await GRN.findOne({ id: grnId })
    if (!grn) {
      return { 
        success: false, 
        previousLegacyStatus: undefined,
        newLegacyStatus: '',
        previousUnifiedStatus: undefined,
        newUnifiedStatus: '',
        error: `GRN not found: ${grnId}` 
      }
    }
    
    const previousLegacyStatus = grn.status
    const previousLegacyGrnStatus = grn.grnStatus
    const previousUnifiedStatus = grn.unified_grn_status
    const newLegacyStatuses = mapUnifiedGRNStatusToLegacy(newUnifiedStatus)
    
    // Check for inconsistency
    warnIfInconsistent(
      'GRN',
      grnId,
      previousLegacyStatus,
      previousUnifiedStatus,
      mapLegacyGRNStatusToUnified(previousLegacyStatus, previousLegacyGrnStatus)
    )
    
    // DUAL WRITE: Update all fields
    grn.status = newLegacyStatuses.status
    grn.grnStatus = newLegacyStatuses.grnStatus
    grn.unified_grn_status = newUnifiedStatus
    grn.unified_grn_status_updated_at = new Date()
    if (context.updatedBy) {
      grn.unified_grn_status_updated_by = context.updatedBy
    }
    
    // Handle approval fields
    if (newUnifiedStatus === UNIFIED_GRN_STATUS.APPROVED) {
      grn.grnAcknowledgedByCompany = true
      grn.approvedBy = context.approvedBy || context.updatedBy
      grn.approvedAt = context.approvedAt || new Date()
      grn.grnAcknowledgedBy = context.approvedBy || context.updatedBy
      grn.grnAcknowledgedDate = context.approvedAt || new Date()
    }
    
    await grn.save()
    
    logStatusTransition('GRN', grnId, previousUnifiedStatus, newUnifiedStatus, {
      updatedBy: context.updatedBy,
      reason: context.reason,
      legacyStatus: `${previousLegacyStatus}/${previousLegacyGrnStatus} → ${newLegacyStatuses.status}/${newLegacyStatuses.grnStatus}`,
    })
    
    return {
      success: true,
      previousLegacyStatus,
      newLegacyStatus: newLegacyStatuses.status,
      previousUnifiedStatus,
      newUnifiedStatus,
    }
  } catch (error: any) {
    console.error(`[STATUS-ENGINE] ❌ Failed to update GRN ${grnId} status:`, error.message)
    return { 
      success: false, 
      previousLegacyStatus: undefined,
      newLegacyStatus: '',
      previousUnifiedStatus: undefined,
      newUnifiedStatus: '',
      error: error.message 
    }
  }
}

/**
 * Update Invoice status with dual-write
 * Writes to both legacy 'invoiceStatus' and new 'unified_invoice_status' fields
 * 
 * @deprecated Use safeDualWriteInvoiceStatus from migrations/dualwrite/status-dualwrite-wrapper.ts instead.
 * This function will be removed when FEATURE_FLAG_REMOVE_OLD_FIELDS is enabled.
 * Cleanup Phase: 4
 */
export async function updateInvoiceStatusDualWrite(
  invoiceId: string,
  newUnifiedStatus: UnifiedInvoiceStatus,
  context: StatusUpdateContext & {
    approvedBy?: string
    approvedAt?: Date
  } = {}
): Promise<StatusUpdateResult> {
  const Invoice = (await import('../models/Invoice')).default
  const connectDB = (await import('../db/mongodb')).default
  
  await connectDB()
  
  try {
    const invoice = await Invoice.findOne({ id: invoiceId })
    if (!invoice) {
      return { 
        success: false, 
        previousLegacyStatus: undefined,
        newLegacyStatus: '',
        previousUnifiedStatus: undefined,
        newUnifiedStatus: '',
        error: `Invoice not found: ${invoiceId}` 
      }
    }
    
    const previousLegacyStatus = invoice.invoiceStatus
    const previousUnifiedStatus = invoice.unified_invoice_status
    const newLegacyStatus = mapUnifiedInvoiceStatusToLegacy(newUnifiedStatus)
    
    // Check for inconsistency
    warnIfInconsistent(
      'Invoice',
      invoiceId,
      previousLegacyStatus,
      previousUnifiedStatus,
      mapLegacyInvoiceStatusToUnified(previousLegacyStatus)
    )
    
    // DUAL WRITE: Update both fields
    invoice.invoiceStatus = newLegacyStatus
    invoice.unified_invoice_status = newUnifiedStatus
    invoice.unified_invoice_status_updated_at = new Date()
    if (context.updatedBy) {
      invoice.unified_invoice_status_updated_by = context.updatedBy
    }
    
    // Handle approval fields
    if (newUnifiedStatus === UNIFIED_INVOICE_STATUS.APPROVED) {
      invoice.approvedBy = context.approvedBy || context.updatedBy
      invoice.approvedAt = context.approvedAt || new Date()
    }
    
    await invoice.save()
    
    logStatusTransition('Invoice', invoiceId, previousUnifiedStatus, newUnifiedStatus, {
      updatedBy: context.updatedBy,
      reason: context.reason,
      legacyStatus: `${previousLegacyStatus} → ${newLegacyStatus}`,
    })
    
    return {
      success: true,
      previousLegacyStatus,
      newLegacyStatus,
      previousUnifiedStatus,
      newUnifiedStatus,
    }
  } catch (error: any) {
    console.error(`[STATUS-ENGINE] ❌ Failed to update Invoice ${invoiceId} status:`, error.message)
    return { 
      success: false, 
      previousLegacyStatus: undefined,
      newLegacyStatus: '',
      previousUnifiedStatus: undefined,
      newUnifiedStatus: '',
      error: error.message 
    }
  }
}

// =============================================================================
// HELPER FUNCTIONS FOR EXISTING CODE MIGRATION
// =============================================================================

/**
 * Sync unified status from legacy status (for existing records)
 * Call this when reading a record to ensure unified status is populated
 */
export function syncUnifiedStatusFromLegacy(
  entity: any,
  entityType: 'Order' | 'PR' | 'PO' | 'Shipment' | 'GRN' | 'Invoice'
): string {
  switch (entityType) {
    case 'Order':
      if (!entity.unified_status) {
        entity.unified_status = mapLegacyOrderStatusToUnified(entity.status)
      }
      return entity.unified_status
    case 'PR':
      // Legacy pr_status field has been removed - return unified_pr_status directly
      return entity.unified_pr_status || 'DRAFT'
    case 'PO':
      if (!entity.unified_po_status) {
        entity.unified_po_status = mapLegacyPOStatusToUnified(entity.po_status)
      }
      return entity.unified_po_status
    case 'Shipment':
      if (!entity.unified_shipment_status) {
        entity.unified_shipment_status = mapLegacyShipmentStatusToUnified(entity.shipmentStatus)
      }
      return entity.unified_shipment_status
    case 'GRN':
      if (!entity.unified_grn_status) {
        entity.unified_grn_status = mapLegacyGRNStatusToUnified(entity.status, entity.grnStatus)
      }
      return entity.unified_grn_status
    case 'Invoice':
      if (!entity.unified_invoice_status) {
        entity.unified_invoice_status = mapLegacyInvoiceStatusToUnified(entity.invoiceStatus)
      }
      return entity.unified_invoice_status
    default:
      return 'UNKNOWN'
  }
}

/**
 * Get effective status for display (prefers unified, falls back to legacy)
 */
export function getEffectiveStatus(
  entity: any,
  entityType: 'Order' | 'PR' | 'PO' | 'Shipment' | 'GRN' | 'Invoice'
): string {
  switch (entityType) {
    case 'Order':
      return entity.unified_status || mapLegacyOrderStatusToUnified(entity.status)
    case 'PR':
      return entity.unified_pr_status || 'DRAFT'
    case 'PO':
      return entity.unified_po_status || mapLegacyPOStatusToUnified(entity.po_status)
    case 'Shipment':
      return entity.unified_shipment_status || mapLegacyShipmentStatusToUnified(entity.shipmentStatus)
    case 'GRN':
      return entity.unified_grn_status || mapLegacyGRNStatusToUnified(entity.status, entity.grnStatus)
    case 'Invoice':
      return entity.unified_invoice_status || mapLegacyInvoiceStatusToUnified(entity.invoiceStatus)
    default:
      return 'UNKNOWN'
  }
}

/**
 * Batch sync unified status for multiple entities
 */
export async function batchSyncUnifiedStatus(
  entityType: 'Order' | 'PR' | 'PO' | 'Shipment' | 'GRN' | 'Invoice',
  filter: Record<string, any> = {}
): Promise<{ updated: number, errors: number }> {
  const connectDB = (await import('../db/mongodb')).default
  await connectDB()
  
  let Model: any
  let legacyField: string
  let unifiedField: string
  let mappingFn: (status: string | undefined | null, status2?: string | undefined | null) => string
  
  switch (entityType) {
    case 'Order':
      Model = (await import('../models/Order')).default
      legacyField = 'status'
      unifiedField = 'unified_status'
      mappingFn = mapLegacyOrderStatusToUnified
      break
    case 'PR':
      Model = (await import('../models/Order')).default
      legacyField = 'pr_status'
      unifiedField = 'unified_pr_status'
      mappingFn = mapLegacyPRStatusToUnified
      break
    case 'PO':
      Model = (await import('../models/PurchaseOrder')).default
      legacyField = 'po_status'
      unifiedField = 'unified_po_status'
      mappingFn = mapLegacyPOStatusToUnified
      break
    case 'Shipment':
      Model = (await import('../models/Shipment')).default
      legacyField = 'shipmentStatus'
      unifiedField = 'unified_shipment_status'
      mappingFn = mapLegacyShipmentStatusToUnified
      break
    case 'GRN':
      Model = (await import('../models/GRN')).default
      legacyField = 'status'
      unifiedField = 'unified_grn_status'
      mappingFn = (status, grnStatus) => mapLegacyGRNStatusToUnified(status, grnStatus)
      break
    case 'Invoice':
      Model = (await import('../models/Invoice')).default
      legacyField = 'invoiceStatus'
      unifiedField = 'unified_invoice_status'
      mappingFn = mapLegacyInvoiceStatusToUnified
      break
    default:
      return { updated: 0, errors: 0 }
  }
  
  let updated = 0
  let errors = 0
  
  // Find records without unified status
  const queryFilter = { ...filter, [unifiedField]: { $exists: false } }
  const records = await Model.find(queryFilter)
  
  for (const record of records) {
    try {
      const legacyStatus = record[legacyField]
      const secondaryStatus = entityType === 'GRN' ? record.grnStatus : undefined
      const newUnifiedStatus = mappingFn(legacyStatus, secondaryStatus)
      
      record[unifiedField] = newUnifiedStatus
      record[`${unifiedField}_updated_at`] = new Date()
      await record.save()
      updated++
    } catch (error: any) {
      console.error(`[STATUS-ENGINE] Error syncing ${entityType} ${record.id}:`, error.message)
      errors++
    }
  }
  
  console.log(`[STATUS-ENGINE] Batch sync ${entityType}: ${updated} updated, ${errors} errors`)
  return { updated, errors }
}
