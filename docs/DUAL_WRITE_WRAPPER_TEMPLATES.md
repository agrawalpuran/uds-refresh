# Dual-Write Wrapper Templates

## Ready-to-Use Building Blocks for Status Migration

**Document Version:** 1.0.0  
**Created:** 2026-01-15  
**Status:** TEMPLATES ONLY — NOT YET INTEGRATED  
**Purpose:** Provide reusable code templates for dual-write migration layer

---

## Table of Contents

1. [Wrapper Function Templates](#1-wrapper-function-templates)
2. [Status Mapping Helpers](#2-status-mapping-helpers)
3. [Transition Validation Rules](#3-transition-validation-rules)
4. [Execution Plan for Later](#4-execution-plan-for-later)

---

## 1. Wrapper Function Templates

These are standalone template functions that will be plugged into the system later.
They do NOT import any models, do NOT perform database writes, and do NOT call existing code.

### 1.1 Common Types and Interfaces

```typescript
/**
 * Common types used by all wrapper templates
 * File: migrations/dualwrite/types.ts
 */

// ============================================================================
// RESULT TYPES
// ============================================================================

export interface DualWriteOperation {
  collection: string
  filter: Record<string, unknown>
  legacyFieldUpdates: Record<string, unknown>
  unifiedFieldUpdates: Record<string, unknown>
  auditEntry: AuditLogEntry
  validation: TransitionValidationResult
}

export interface TransitionValidationResult {
  valid: boolean
  reason?: string
  warnings: string[]
}

export interface AuditLogEntry {
  entityType: string
  entityId: string
  action: 'STATUS_UPDATE'
  previousLegacyStatus: string | null
  newLegacyStatus: string
  previousUnifiedStatus: string | null
  newUnifiedStatus: string
  source: string
  updatedBy: string | null
  timestamp: Date
  metadata: Record<string, unknown>
}

export interface StatusUpdateMetadata {
  updatedBy?: string
  source?: string
  reason?: string
  [key: string]: unknown
}
```

---

### 1.2 writeOrderStatusDual()

```typescript
/**
 * TEMPLATE: Dual-write wrapper for Order status updates
 * 
 * This template prepares update operations for both legacy and unified
 * Order status fields. It does NOT execute database operations.
 * 
 * @param orderId - The order's unique identifier
 * @param oldLegacyStatus - Current legacy status value (or null)
 * @param newLegacyStatus - Target legacy status value
 * @param oldUnifiedStatus - Current unified status value (or null)
 * @param metadata - Additional context for the update
 * @returns DualWriteOperation describing the update to be performed
 */
function writeOrderStatusDual(
  orderId: string,
  oldLegacyStatus: string | null,
  newLegacyStatus: string,
  oldUnifiedStatus: string | null,
  metadata: StatusUpdateMetadata = {}
): DualWriteOperation {
  const timestamp = new Date()
  
  // Map legacy → unified
  const newUnifiedStatus = mapOrderLegacyToUnified(newLegacyStatus)
  
  // Validate transition (unified status is canonical)
  const validation = validateOrderTransition(oldUnifiedStatus, newUnifiedStatus)
  
  // Build update operations
  const legacyFieldUpdates = {
    status: newLegacyStatus,
  }
  
  const unifiedFieldUpdates = {
    unified_status: newUnifiedStatus,
    unified_status_updated_at: timestamp,
    unified_status_updated_by: metadata.updatedBy || 'system',
  }
  
  // Build audit entry
  const auditEntry: AuditLogEntry = {
    entityType: 'Order',
    entityId: orderId,
    action: 'STATUS_UPDATE',
    previousLegacyStatus: oldLegacyStatus,
    newLegacyStatus: newLegacyStatus,
    previousUnifiedStatus: oldUnifiedStatus,
    newUnifiedStatus: newUnifiedStatus,
    source: metadata.source || 'dual-write-wrapper',
    updatedBy: metadata.updatedBy || null,
    timestamp,
    metadata: {
      reason: metadata.reason,
      validationResult: validation,
    },
  }
  
  return {
    collection: 'orders',
    filter: { id: orderId },
    legacyFieldUpdates,
    unifiedFieldUpdates,
    auditEntry,
    validation,
  }
}
```

---

### 1.3 writePRStatusDual()

```typescript
/**
 * TEMPLATE: Dual-write wrapper for PR (Purchase Requisition) status updates
 * 
 * PRs are stored in the orders collection with pr_number field set.
 * This template handles the pr_status field mapping.
 * 
 * @param prId - The PR's unique identifier (order.id)
 * @param oldLegacyStatus - Current legacy pr_status value (or null)
 * @param newLegacyStatus - Target legacy pr_status value
 * @param oldUnifiedStatus - Current unified_pr_status value (or null)
 * @param metadata - Additional context for the update
 * @returns DualWriteOperation describing the update to be performed
 */
function writePRStatusDual(
  prId: string,
  oldLegacyStatus: string | null,
  newLegacyStatus: string,
  oldUnifiedStatus: string | null,
  metadata: StatusUpdateMetadata = {}
): DualWriteOperation {
  const timestamp = new Date()
  
  // Map legacy → unified
  const newUnifiedStatus = mapPRLegacyToUnified(newLegacyStatus)
  
  // Validate transition
  const validation = validatePRTransition(oldUnifiedStatus, newUnifiedStatus)
  
  // Build update operations
  const legacyFieldUpdates: Record<string, unknown> = {
    pr_status: newLegacyStatus,
  }
  
  // Handle rejection reason if applicable
  if (newUnifiedStatus === 'REJECTED' && metadata.rejectionReason) {
    legacyFieldUpdates.rejection_reason = metadata.rejectionReason
  }
  
  const unifiedFieldUpdates: Record<string, unknown> = {
    unified_pr_status: newUnifiedStatus,
    unified_pr_status_updated_at: timestamp,
    unified_pr_status_updated_by: metadata.updatedBy || 'system',
  }
  
  // Handle rejection reason for unified field
  if (newUnifiedStatus === 'REJECTED' && metadata.rejectionReason) {
    unifiedFieldUpdates.rejection_reason = metadata.rejectionReason
  }
  
  // Build audit entry
  const auditEntry: AuditLogEntry = {
    entityType: 'PR',
    entityId: prId,
    action: 'STATUS_UPDATE',
    previousLegacyStatus: oldLegacyStatus,
    newLegacyStatus: newLegacyStatus,
    previousUnifiedStatus: oldUnifiedStatus,
    newUnifiedStatus: newUnifiedStatus,
    source: metadata.source || 'dual-write-wrapper',
    updatedBy: metadata.updatedBy || null,
    timestamp,
    metadata: {
      reason: metadata.reason,
      rejectionReason: metadata.rejectionReason,
      validationResult: validation,
    },
  }
  
  return {
    collection: 'orders',
    filter: { id: prId, pr_number: { $exists: true } },
    legacyFieldUpdates,
    unifiedFieldUpdates,
    auditEntry,
    validation,
  }
}
```

---

### 1.4 writePOStatusDual()

```typescript
/**
 * TEMPLATE: Dual-write wrapper for PO (Purchase Order) status updates
 * 
 * @param poId - The PO's unique identifier
 * @param oldLegacyStatus - Current legacy po_status value (or null)
 * @param newLegacyStatus - Target legacy po_status value
 * @param oldUnifiedStatus - Current unified_po_status value (or null)
 * @param metadata - Additional context for the update
 * @returns DualWriteOperation describing the update to be performed
 */
function writePOStatusDual(
  poId: string,
  oldLegacyStatus: string | null,
  newLegacyStatus: string,
  oldUnifiedStatus: string | null,
  metadata: StatusUpdateMetadata = {}
): DualWriteOperation {
  const timestamp = new Date()
  
  // Map legacy → unified
  const newUnifiedStatus = mapPOLegacyToUnified(newLegacyStatus)
  
  // Validate transition
  const validation = validatePOTransition(oldUnifiedStatus, newUnifiedStatus)
  
  // Build update operations
  const legacyFieldUpdates = {
    po_status: newLegacyStatus,
  }
  
  const unifiedFieldUpdates = {
    unified_po_status: newUnifiedStatus,
    unified_po_status_updated_at: timestamp,
    unified_po_status_updated_by: metadata.updatedBy || 'system',
  }
  
  // Build audit entry
  const auditEntry: AuditLogEntry = {
    entityType: 'PO',
    entityId: poId,
    action: 'STATUS_UPDATE',
    previousLegacyStatus: oldLegacyStatus,
    newLegacyStatus: newLegacyStatus,
    previousUnifiedStatus: oldUnifiedStatus,
    newUnifiedStatus: newUnifiedStatus,
    source: metadata.source || 'dual-write-wrapper',
    updatedBy: metadata.updatedBy || null,
    timestamp,
    metadata: {
      reason: metadata.reason,
      validationResult: validation,
    },
  }
  
  return {
    collection: 'purchaseorders',
    filter: { id: poId },
    legacyFieldUpdates,
    unifiedFieldUpdates,
    auditEntry,
    validation,
  }
}
```

---

### 1.5 writeShipmentStatusDual()

```typescript
/**
 * TEMPLATE: Dual-write wrapper for Shipment status updates
 * 
 * @param shipmentId - The Shipment's unique identifier
 * @param oldLegacyStatus - Current legacy shipmentStatus value (or null)
 * @param newLegacyStatus - Target legacy shipmentStatus value
 * @param oldUnifiedStatus - Current unified_shipment_status value (or null)
 * @param metadata - Additional context for the update
 * @returns DualWriteOperation describing the update to be performed
 */
function writeShipmentStatusDual(
  shipmentId: string,
  oldLegacyStatus: string | null,
  newLegacyStatus: string,
  oldUnifiedStatus: string | null,
  metadata: StatusUpdateMetadata = {}
): DualWriteOperation {
  const timestamp = new Date()
  
  // Map legacy → unified
  const newUnifiedStatus = mapShipmentLegacyToUnified(newLegacyStatus)
  
  // Validate transition
  const validation = validateShipmentTransition(oldUnifiedStatus, newUnifiedStatus)
  
  // Build update operations
  const legacyFieldUpdates: Record<string, unknown> = {
    shipmentStatus: newLegacyStatus,
  }
  
  // Handle delivered date
  if (newUnifiedStatus === 'DELIVERED' && metadata.deliveredDate) {
    legacyFieldUpdates.deliveredDate = metadata.deliveredDate
  }
  
  const unifiedFieldUpdates: Record<string, unknown> = {
    unified_shipment_status: newUnifiedStatus,
    unified_shipment_status_updated_at: timestamp,
    unified_shipment_status_updated_by: metadata.updatedBy || 'system',
  }
  
  // Handle delivered date for unified
  if (newUnifiedStatus === 'DELIVERED' && metadata.deliveredDate) {
    unifiedFieldUpdates.deliveredDate = metadata.deliveredDate
  }
  
  // Handle failure reason
  if (['FAILED', 'RETURNED', 'LOST'].includes(newUnifiedStatus) && metadata.failureReason) {
    unifiedFieldUpdates.failure_reason = metadata.failureReason
  }
  
  // Build audit entry
  const auditEntry: AuditLogEntry = {
    entityType: 'Shipment',
    entityId: shipmentId,
    action: 'STATUS_UPDATE',
    previousLegacyStatus: oldLegacyStatus,
    newLegacyStatus: newLegacyStatus,
    previousUnifiedStatus: oldUnifiedStatus,
    newUnifiedStatus: newUnifiedStatus,
    source: metadata.source || 'dual-write-wrapper',
    updatedBy: metadata.updatedBy || null,
    timestamp,
    metadata: {
      reason: metadata.reason,
      deliveredDate: metadata.deliveredDate,
      failureReason: metadata.failureReason,
      validationResult: validation,
    },
  }
  
  return {
    collection: 'shipments',
    filter: { shipmentId: shipmentId },
    legacyFieldUpdates,
    unifiedFieldUpdates,
    auditEntry,
    validation,
  }
}
```

---

### 1.6 writeGRNStatusDual()

```typescript
/**
 * TEMPLATE: Dual-write wrapper for GRN (Goods Receipt Note) status updates
 * 
 * GRN has two legacy status fields: 'status' and 'grnStatus'.
 * This template handles both.
 * 
 * @param grnId - The GRN's unique identifier
 * @param oldLegacyStatus - Current legacy status value (format: "status/grnStatus" or null)
 * @param newUnifiedStatus - Target unified GRN status value
 * @param oldUnifiedStatus - Current unified_grn_status value (or null)
 * @param metadata - Additional context for the update
 * @returns DualWriteOperation describing the update to be performed
 */
function writeGRNStatusDual(
  grnId: string,
  oldLegacyStatus: string | null,
  newUnifiedStatus: string,
  oldUnifiedStatusParam: string | null,
  metadata: StatusUpdateMetadata = {}
): DualWriteOperation {
  const timestamp = new Date()
  
  // Map unified → legacy (GRN has two legacy fields)
  const legacyStatuses = mapGRNUnifiedToLegacy(newUnifiedStatus)
  
  // Validate transition
  const validation = validateGRNTransition(oldUnifiedStatusParam, newUnifiedStatus)
  
  // Build update operations
  const legacyFieldUpdates: Record<string, unknown> = {
    status: legacyStatuses.status,
    grnStatus: legacyStatuses.grnStatus,
  }
  
  // Handle approval fields
  if (newUnifiedStatus === 'APPROVED') {
    legacyFieldUpdates.grnAcknowledgedByCompany = true
    legacyFieldUpdates.grnAcknowledgedDate = timestamp
    legacyFieldUpdates.grnAcknowledgedBy = metadata.updatedBy || 'system'
    legacyFieldUpdates.approvedBy = metadata.updatedBy || 'system'
    legacyFieldUpdates.approvedAt = timestamp
  }
  
  const unifiedFieldUpdates: Record<string, unknown> = {
    unified_grn_status: newUnifiedStatus,
    unified_grn_status_updated_at: timestamp,
    unified_grn_status_updated_by: metadata.updatedBy || 'system',
  }
  
  // Build audit entry
  const auditEntry: AuditLogEntry = {
    entityType: 'GRN',
    entityId: grnId,
    action: 'STATUS_UPDATE',
    previousLegacyStatus: oldLegacyStatus,
    newLegacyStatus: `${legacyStatuses.status}/${legacyStatuses.grnStatus}`,
    previousUnifiedStatus: oldUnifiedStatusParam,
    newUnifiedStatus: newUnifiedStatus,
    source: metadata.source || 'dual-write-wrapper',
    updatedBy: metadata.updatedBy || null,
    timestamp,
    metadata: {
      reason: metadata.reason,
      validationResult: validation,
    },
  }
  
  return {
    collection: 'grns',
    filter: { id: grnId },
    legacyFieldUpdates,
    unifiedFieldUpdates,
    auditEntry,
    validation,
  }
}
```

---

### 1.7 writeInvoiceStatusDual()

```typescript
/**
 * TEMPLATE: Dual-write wrapper for Invoice status updates
 * 
 * @param invoiceId - The Invoice's unique identifier
 * @param oldLegacyStatus - Current legacy invoiceStatus value (or null)
 * @param newLegacyStatus - Target legacy invoiceStatus value
 * @param oldUnifiedStatus - Current unified_invoice_status value (or null)
 * @param metadata - Additional context for the update
 * @returns DualWriteOperation describing the update to be performed
 */
function writeInvoiceStatusDual(
  invoiceId: string,
  oldLegacyStatus: string | null,
  newLegacyStatus: string,
  oldUnifiedStatus: string | null,
  metadata: StatusUpdateMetadata = {}
): DualWriteOperation {
  const timestamp = new Date()
  
  // Map legacy → unified
  const newUnifiedStatus = mapInvoiceLegacyToUnified(newLegacyStatus)
  
  // Validate transition
  const validation = validateInvoiceTransition(oldUnifiedStatus, newUnifiedStatus)
  
  // Build update operations
  const legacyFieldUpdates: Record<string, unknown> = {
    invoiceStatus: newLegacyStatus,
  }
  
  // Handle approval fields
  if (newUnifiedStatus === 'APPROVED') {
    legacyFieldUpdates.approvedBy = metadata.updatedBy || 'system'
    legacyFieldUpdates.approvedAt = timestamp
  }
  
  const unifiedFieldUpdates: Record<string, unknown> = {
    unified_invoice_status: newUnifiedStatus,
    unified_invoice_status_updated_at: timestamp,
    unified_invoice_status_updated_by: metadata.updatedBy || 'system',
  }
  
  // Build audit entry
  const auditEntry: AuditLogEntry = {
    entityType: 'Invoice',
    entityId: invoiceId,
    action: 'STATUS_UPDATE',
    previousLegacyStatus: oldLegacyStatus,
    newLegacyStatus: newLegacyStatus,
    previousUnifiedStatus: oldUnifiedStatus,
    newUnifiedStatus: newUnifiedStatus,
    source: metadata.source || 'dual-write-wrapper',
    updatedBy: metadata.updatedBy || null,
    timestamp,
    metadata: {
      reason: metadata.reason,
      validationResult: validation,
    },
  }
  
  return {
    collection: 'invoices',
    filter: { id: invoiceId },
    legacyFieldUpdates,
    unifiedFieldUpdates,
    auditEntry,
    validation,
  }
}
```

---

## 2. Status Mapping Helpers

These are pure functions with no database access. They handle bidirectional status mapping with safe fallbacks for unknown values.

### 2.1 ORDER_STATUS Mapping

```typescript
/**
 * ORDER_STATUS Mapping Helpers
 * File: migrations/dualwrite/mappings/order-status.ts
 */

// Legacy Order Status Values
type LegacyOrderStatus = 
  | 'Awaiting approval'
  | 'Awaiting fulfilment'
  | 'Dispatched'
  | 'Delivered'

// Unified Order Status Values
type UnifiedOrderStatus =
  | 'CREATED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'IN_FULFILMENT'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'CANCELLED'

// Legacy → Unified Mapping Table
const ORDER_LEGACY_TO_UNIFIED: Record<string, UnifiedOrderStatus> = {
  'Awaiting approval': 'PENDING_APPROVAL',
  'Awaiting fulfilment': 'IN_FULFILMENT',
  'Dispatched': 'DISPATCHED',
  'Delivered': 'DELIVERED',
}

// Unified → Legacy Mapping Table
const ORDER_UNIFIED_TO_LEGACY: Record<UnifiedOrderStatus, LegacyOrderStatus> = {
  'CREATED': 'Awaiting approval',
  'PENDING_APPROVAL': 'Awaiting approval',
  'APPROVED': 'Awaiting fulfilment',
  'IN_FULFILMENT': 'Awaiting fulfilment',
  'DISPATCHED': 'Dispatched',
  'DELIVERED': 'Delivered',
  'CANCELLED': 'Awaiting approval', // Fallback - legacy has no CANCELLED
}

/**
 * Map legacy Order status to unified status
 * Returns 'CREATED' as safe fallback for unknown values
 */
function mapOrderLegacyToUnified(legacyStatus: string | null | undefined): UnifiedOrderStatus {
  if (!legacyStatus) return 'CREATED'
  return ORDER_LEGACY_TO_UNIFIED[legacyStatus] || 'CREATED'
}

/**
 * Map unified Order status to legacy status
 * Returns 'Awaiting approval' as safe fallback for unknown values
 */
function mapOrderUnifiedToLegacy(unifiedStatus: string | null | undefined): LegacyOrderStatus {
  if (!unifiedStatus) return 'Awaiting approval'
  return ORDER_UNIFIED_TO_LEGACY[unifiedStatus as UnifiedOrderStatus] || 'Awaiting approval'
}

/**
 * Check if a legacy status value is known
 */
function isKnownOrderLegacyStatus(status: string): boolean {
  return status in ORDER_LEGACY_TO_UNIFIED
}

/**
 * Check if a unified status value is known
 */
function isKnownOrderUnifiedStatus(status: string): boolean {
  return status in ORDER_UNIFIED_TO_LEGACY
}
```

---

### 2.2 PR_STATUS Mapping

```typescript
/**
 * PR_STATUS Mapping Helpers
 * File: migrations/dualwrite/mappings/pr-status.ts
 */

// Legacy PR Status Values
type LegacyPRStatus =
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

// Unified PR Status Values
type UnifiedPRStatus =
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

// Legacy → Unified Mapping Table
const PR_LEGACY_TO_UNIFIED: Record<string, UnifiedPRStatus> = {
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

// Unified → Legacy Mapping Table
const PR_UNIFIED_TO_LEGACY: Record<UnifiedPRStatus, LegacyPRStatus> = {
  'DRAFT': 'DRAFT',
  'PENDING_SITE_ADMIN_APPROVAL': 'PENDING_SITE_ADMIN_APPROVAL',
  'SITE_ADMIN_APPROVED': 'SITE_ADMIN_APPROVED',
  'PENDING_COMPANY_ADMIN_APPROVAL': 'PENDING_COMPANY_ADMIN_APPROVAL',
  'COMPANY_ADMIN_APPROVED': 'COMPANY_ADMIN_APPROVED',
  'REJECTED': 'REJECTED_BY_COMPANY_ADMIN', // Default rejection type
  'LINKED_TO_PO': 'PO_CREATED',
  'IN_SHIPMENT': 'PO_CREATED', // Legacy has no IN_SHIPMENT
  'PARTIALLY_DELIVERED': 'PO_CREATED', // Legacy has no PARTIALLY_DELIVERED
  'FULLY_DELIVERED': 'FULLY_DELIVERED',
  'CLOSED': 'FULLY_DELIVERED', // Legacy has no CLOSED
}

/**
 * Map legacy PR status to unified status
 * Returns 'DRAFT' as safe fallback for unknown values
 */
function mapPRLegacyToUnified(legacyStatus: string | null | undefined): UnifiedPRStatus {
  if (!legacyStatus) return 'DRAFT'
  return PR_LEGACY_TO_UNIFIED[legacyStatus] || 'DRAFT'
}

/**
 * Map unified PR status to legacy status
 * Returns 'DRAFT' as safe fallback for unknown values
 */
function mapPRUnifiedToLegacy(unifiedStatus: string | null | undefined): LegacyPRStatus {
  if (!unifiedStatus) return 'DRAFT'
  return PR_UNIFIED_TO_LEGACY[unifiedStatus as UnifiedPRStatus] || 'DRAFT'
}

/**
 * Check if a legacy status value is known
 */
function isKnownPRLegacyStatus(status: string): boolean {
  return status in PR_LEGACY_TO_UNIFIED
}

/**
 * Check if a unified status value is known
 */
function isKnownPRUnifiedStatus(status: string): boolean {
  return status in PR_UNIFIED_TO_LEGACY
}
```

---

### 2.3 PO_STATUS Mapping

```typescript
/**
 * PO_STATUS Mapping Helpers
 * File: migrations/dualwrite/mappings/po-status.ts
 */

// Legacy PO Status Values
type LegacyPOStatus =
  | 'CREATED'
  | 'SENT_TO_VENDOR'
  | 'ACKNOWLEDGED'
  | 'IN_FULFILMENT'
  | 'COMPLETED'
  | 'CANCELLED'

// Unified PO Status Values
type UnifiedPOStatus =
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

// Legacy → Unified Mapping Table
const PO_LEGACY_TO_UNIFIED: Record<string, UnifiedPOStatus> = {
  'CREATED': 'CREATED',
  'SENT_TO_VENDOR': 'SENT_TO_VENDOR',
  'ACKNOWLEDGED': 'ACKNOWLEDGED',
  'IN_FULFILMENT': 'IN_FULFILMENT',
  'COMPLETED': 'FULLY_DELIVERED',
  'CANCELLED': 'CANCELLED',
}

// Unified → Legacy Mapping Table
const PO_UNIFIED_TO_LEGACY: Record<UnifiedPOStatus, LegacyPOStatus> = {
  'CREATED': 'CREATED',
  'SENT_TO_VENDOR': 'SENT_TO_VENDOR',
  'ACKNOWLEDGED': 'ACKNOWLEDGED',
  'IN_FULFILMENT': 'IN_FULFILMENT',
  'PARTIALLY_SHIPPED': 'IN_FULFILMENT', // Legacy has no PARTIALLY_SHIPPED
  'FULLY_SHIPPED': 'IN_FULFILMENT', // Legacy has no FULLY_SHIPPED
  'PARTIALLY_DELIVERED': 'IN_FULFILMENT', // Legacy has no PARTIALLY_DELIVERED
  'FULLY_DELIVERED': 'COMPLETED',
  'CLOSED': 'COMPLETED', // Legacy has no CLOSED
  'CANCELLED': 'CANCELLED',
}

/**
 * Map legacy PO status to unified status
 * Returns 'CREATED' as safe fallback for unknown values
 */
function mapPOLegacyToUnified(legacyStatus: string | null | undefined): UnifiedPOStatus {
  if (!legacyStatus) return 'CREATED'
  return PO_LEGACY_TO_UNIFIED[legacyStatus] || 'CREATED'
}

/**
 * Map unified PO status to legacy status
 * Returns 'CREATED' as safe fallback for unknown values
 */
function mapPOUnifiedToLegacy(unifiedStatus: string | null | undefined): LegacyPOStatus {
  if (!unifiedStatus) return 'CREATED'
  return PO_UNIFIED_TO_LEGACY[unifiedStatus as UnifiedPOStatus] || 'CREATED'
}

/**
 * Check if a legacy status value is known
 */
function isKnownPOLegacyStatus(status: string): boolean {
  return status in PO_LEGACY_TO_UNIFIED
}

/**
 * Check if a unified status value is known
 */
function isKnownPOUnifiedStatus(status: string): boolean {
  return status in PO_UNIFIED_TO_LEGACY
}
```

---

### 2.4 SHIPMENT_STATUS Mapping

```typescript
/**
 * SHIPMENT_STATUS Mapping Helpers
 * File: migrations/dualwrite/mappings/shipment-status.ts
 */

// Legacy Shipment Status Values
type LegacyShipmentStatus =
  | 'CREATED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'FAILED'

// Unified Shipment Status Values
type UnifiedShipmentStatus =
  | 'CREATED'
  | 'MANIFESTED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FAILED'
  | 'RETURNED'
  | 'LOST'

// Legacy → Unified Mapping Table
const SHIPMENT_LEGACY_TO_UNIFIED: Record<string, UnifiedShipmentStatus> = {
  'CREATED': 'CREATED',
  'IN_TRANSIT': 'IN_TRANSIT',
  'DELIVERED': 'DELIVERED',
  'FAILED': 'FAILED',
}

// Unified → Legacy Mapping Table
const SHIPMENT_UNIFIED_TO_LEGACY: Record<UnifiedShipmentStatus, LegacyShipmentStatus> = {
  'CREATED': 'CREATED',
  'MANIFESTED': 'CREATED', // Legacy has no MANIFESTED
  'PICKED_UP': 'IN_TRANSIT', // Legacy has no PICKED_UP
  'IN_TRANSIT': 'IN_TRANSIT',
  'OUT_FOR_DELIVERY': 'IN_TRANSIT', // Legacy has no OUT_FOR_DELIVERY
  'DELIVERED': 'DELIVERED',
  'FAILED': 'FAILED',
  'RETURNED': 'FAILED', // Legacy has no RETURNED
  'LOST': 'FAILED', // Legacy has no LOST
}

/**
 * Map legacy Shipment status to unified status
 * Returns 'CREATED' as safe fallback for unknown values
 */
function mapShipmentLegacyToUnified(legacyStatus: string | null | undefined): UnifiedShipmentStatus {
  if (!legacyStatus) return 'CREATED'
  return SHIPMENT_LEGACY_TO_UNIFIED[legacyStatus] || 'CREATED'
}

/**
 * Map unified Shipment status to legacy status
 * Returns 'CREATED' as safe fallback for unknown values
 */
function mapShipmentUnifiedToLegacy(unifiedStatus: string | null | undefined): LegacyShipmentStatus {
  if (!unifiedStatus) return 'CREATED'
  return SHIPMENT_UNIFIED_TO_LEGACY[unifiedStatus as UnifiedShipmentStatus] || 'CREATED'
}

/**
 * Check if a legacy status value is known
 */
function isKnownShipmentLegacyStatus(status: string): boolean {
  return status in SHIPMENT_LEGACY_TO_UNIFIED
}

/**
 * Check if a unified status value is known
 */
function isKnownShipmentUnifiedStatus(status: string): boolean {
  return status in SHIPMENT_UNIFIED_TO_LEGACY
}
```

---

### 2.5 GRN_STATUS Mapping

```typescript
/**
 * GRN_STATUS Mapping Helpers
 * File: migrations/dualwrite/mappings/grn-status.ts
 * 
 * NOTE: GRN has TWO legacy status fields:
 * - status: 'CREATED' | 'ACKNOWLEDGED' | 'INVOICED' | 'RECEIVED' | 'CLOSED'
 * - grnStatus: 'RAISED' | 'APPROVED'
 */

// Legacy GRN Status Values (main status field)
type LegacyGRNStatus =
  | 'CREATED'
  | 'ACKNOWLEDGED'
  | 'INVOICED'
  | 'RECEIVED'
  | 'CLOSED'

// Legacy GRN Approval Status Values (grnStatus field)
type LegacyGRNApprovalStatus = 'RAISED' | 'APPROVED'

// Combined Legacy Status (for mapping purposes)
interface LegacyGRNCombinedStatus {
  status: LegacyGRNStatus
  grnStatus: LegacyGRNApprovalStatus
}

// Unified GRN Status Values
type UnifiedGRNStatus =
  | 'DRAFT'
  | 'RAISED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'INVOICED'
  | 'CLOSED'

// Legacy → Unified Mapping Table (from grnStatus field)
const GRN_APPROVAL_TO_UNIFIED: Record<string, UnifiedGRNStatus> = {
  'RAISED': 'RAISED',
  'APPROVED': 'APPROVED',
}

// Legacy → Unified Mapping Table (from status field, fallback)
const GRN_STATUS_TO_UNIFIED: Record<string, UnifiedGRNStatus> = {
  'CREATED': 'RAISED',
  'ACKNOWLEDGED': 'APPROVED',
  'INVOICED': 'INVOICED',
  'RECEIVED': 'APPROVED',
  'CLOSED': 'CLOSED',
}

// Unified → Legacy Mapping Table (returns both fields)
const GRN_UNIFIED_TO_LEGACY: Record<UnifiedGRNStatus, LegacyGRNCombinedStatus> = {
  'DRAFT': { status: 'CREATED', grnStatus: 'RAISED' },
  'RAISED': { status: 'CREATED', grnStatus: 'RAISED' },
  'PENDING_APPROVAL': { status: 'CREATED', grnStatus: 'RAISED' },
  'APPROVED': { status: 'ACKNOWLEDGED', grnStatus: 'APPROVED' },
  'INVOICED': { status: 'INVOICED', grnStatus: 'APPROVED' },
  'CLOSED': { status: 'CLOSED', grnStatus: 'APPROVED' },
}

/**
 * Map legacy GRN status to unified status
 * Prefers grnStatus field if available, falls back to status field
 * Returns 'DRAFT' as safe fallback for unknown values
 */
function mapGRNLegacyToUnified(
  legacyStatus: string | null | undefined,
  legacyGrnStatus: string | null | undefined
): UnifiedGRNStatus {
  // Prefer grnStatus if available
  if (legacyGrnStatus && legacyGrnStatus in GRN_APPROVAL_TO_UNIFIED) {
    return GRN_APPROVAL_TO_UNIFIED[legacyGrnStatus]
  }
  // Fall back to status field
  if (legacyStatus && legacyStatus in GRN_STATUS_TO_UNIFIED) {
    return GRN_STATUS_TO_UNIFIED[legacyStatus]
  }
  return 'DRAFT'
}

/**
 * Map unified GRN status to legacy statuses
 * Returns both 'status' and 'grnStatus' fields
 */
function mapGRNUnifiedToLegacy(unifiedStatus: string | null | undefined): LegacyGRNCombinedStatus {
  if (!unifiedStatus) {
    return { status: 'CREATED', grnStatus: 'RAISED' }
  }
  return GRN_UNIFIED_TO_LEGACY[unifiedStatus as UnifiedGRNStatus] || { status: 'CREATED', grnStatus: 'RAISED' }
}

/**
 * Check if a legacy grnStatus value is known
 */
function isKnownGRNApprovalStatus(status: string): boolean {
  return status in GRN_APPROVAL_TO_UNIFIED
}

/**
 * Check if a legacy status value is known
 */
function isKnownGRNLegacyStatus(status: string): boolean {
  return status in GRN_STATUS_TO_UNIFIED
}

/**
 * Check if a unified status value is known
 */
function isKnownGRNUnifiedStatus(status: string): boolean {
  return status in GRN_UNIFIED_TO_LEGACY
}
```

---

### 2.6 INVOICE_STATUS Mapping

```typescript
/**
 * INVOICE_STATUS Mapping Helpers
 * File: migrations/dualwrite/mappings/invoice-status.ts
 */

// Legacy Invoice Status Values
type LegacyInvoiceStatus = 'RAISED' | 'APPROVED'

// Unified Invoice Status Values
type UnifiedInvoiceStatus =
  | 'RAISED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PAID'
  | 'DISPUTED'
  | 'CANCELLED'

// Legacy → Unified Mapping Table
const INVOICE_LEGACY_TO_UNIFIED: Record<string, UnifiedInvoiceStatus> = {
  'RAISED': 'RAISED',
  'APPROVED': 'APPROVED',
}

// Unified → Legacy Mapping Table
const INVOICE_UNIFIED_TO_LEGACY: Record<UnifiedInvoiceStatus, LegacyInvoiceStatus> = {
  'RAISED': 'RAISED',
  'PENDING_APPROVAL': 'RAISED', // Legacy has no PENDING_APPROVAL
  'APPROVED': 'APPROVED',
  'PAID': 'APPROVED', // Legacy has no PAID
  'DISPUTED': 'RAISED', // Legacy has no DISPUTED
  'CANCELLED': 'RAISED', // Legacy has no CANCELLED
}

/**
 * Map legacy Invoice status to unified status
 * Returns 'RAISED' as safe fallback for unknown values
 */
function mapInvoiceLegacyToUnified(legacyStatus: string | null | undefined): UnifiedInvoiceStatus {
  if (!legacyStatus) return 'RAISED'
  return INVOICE_LEGACY_TO_UNIFIED[legacyStatus] || 'RAISED'
}

/**
 * Map unified Invoice status to legacy status
 * Returns 'RAISED' as safe fallback for unknown values
 */
function mapInvoiceUnifiedToLegacy(unifiedStatus: string | null | undefined): LegacyInvoiceStatus {
  if (!unifiedStatus) return 'RAISED'
  return INVOICE_UNIFIED_TO_LEGACY[unifiedStatus as UnifiedInvoiceStatus] || 'RAISED'
}

/**
 * Check if a legacy status value is known
 */
function isKnownInvoiceLegacyStatus(status: string): boolean {
  return status in INVOICE_LEGACY_TO_UNIFIED
}

/**
 * Check if a unified status value is known
 */
function isKnownInvoiceUnifiedStatus(status: string): boolean {
  return status in INVOICE_UNIFIED_TO_LEGACY
}
```

---

## 3. Transition Validation Rules

These are pure functions that validate status transitions based on the state machine rules defined in the integration plan.

### 3.1 Transition Validation Result Type

```typescript
/**
 * Common result type for all transition validators
 * File: migrations/dualwrite/validators/types.ts
 */

interface TransitionValidationResult {
  valid: boolean
  reason?: string
  warnings: string[]
}
```

---

### 3.2 validateOrderTransition()

```typescript
/**
 * Validate Order status transitions
 * File: migrations/dualwrite/validators/order-validator.ts
 */

// Valid Order Status Transitions (state machine)
const ORDER_TRANSITIONS: Record<string, string[]> = {
  'CREATED': ['PENDING_APPROVAL', 'CANCELLED'],
  'PENDING_APPROVAL': ['APPROVED', 'CANCELLED'],
  'APPROVED': ['IN_FULFILMENT', 'CANCELLED'],
  'IN_FULFILMENT': ['DISPATCHED', 'CANCELLED'],
  'DISPATCHED': ['DELIVERED'],
  'DELIVERED': [], // Terminal state
  'CANCELLED': [], // Terminal state
}

/**
 * Validate an Order status transition
 * 
 * @param currentStatus - Current unified status (or null for new records)
 * @param newStatus - Target unified status
 * @returns TransitionValidationResult
 */
function validateOrderTransition(
  currentStatus: string | null | undefined,
  newStatus: string
): TransitionValidationResult {
  const warnings: string[] = []
  
  // New record - any initial status is valid
  if (!currentStatus) {
    return { valid: true, warnings: [] }
  }
  
  // Same status - no transition
  if (currentStatus === newStatus) {
    warnings.push(`Status unchanged: ${currentStatus}`)
    return { valid: true, warnings }
  }
  
  // Check if current status is known
  const allowedTransitions = ORDER_TRANSITIONS[currentStatus]
  if (!allowedTransitions) {
    warnings.push(`Unknown current status: ${currentStatus}`)
    return { valid: true, warnings } // Allow with warning
  }
  
  // Check if transition is allowed
  if (!allowedTransitions.includes(newStatus)) {
    // Determine reason
    const allStatuses = Object.keys(ORDER_TRANSITIONS)
    const currentIndex = allStatuses.indexOf(currentStatus)
    const newIndex = allStatuses.indexOf(newStatus)
    
    if (newIndex >= 0 && newIndex < currentIndex) {
      return {
        valid: false,
        reason: `Backwards transition not allowed: ${currentStatus} → ${newStatus}`,
        warnings,
      }
    }
    
    if (allowedTransitions.length === 0) {
      return {
        valid: false,
        reason: `Cannot transition from terminal state: ${currentStatus}`,
        warnings,
      }
    }
    
    return {
      valid: false,
      reason: `Invalid transition: ${currentStatus} → ${newStatus}. Allowed: [${allowedTransitions.join(', ')}]`,
      warnings,
    }
  }
  
  return { valid: true, warnings }
}
```

---

### 3.3 validatePRTransition()

```typescript
/**
 * Validate PR status transitions
 * File: migrations/dualwrite/validators/pr-validator.ts
 */

// Valid PR Status Transitions (state machine)
const PR_TRANSITIONS: Record<string, string[]> = {
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
}

/**
 * Validate a PR status transition
 * 
 * @param currentStatus - Current unified PR status (or null for new records)
 * @param newStatus - Target unified PR status
 * @returns TransitionValidationResult
 */
function validatePRTransition(
  currentStatus: string | null | undefined,
  newStatus: string
): TransitionValidationResult {
  const warnings: string[] = []
  
  // New record - any initial status is valid
  if (!currentStatus) {
    return { valid: true, warnings: [] }
  }
  
  // Same status - no transition
  if (currentStatus === newStatus) {
    warnings.push(`Status unchanged: ${currentStatus}`)
    return { valid: true, warnings }
  }
  
  // Check if current status is known
  const allowedTransitions = PR_TRANSITIONS[currentStatus]
  if (!allowedTransitions) {
    warnings.push(`Unknown current status: ${currentStatus}`)
    return { valid: true, warnings }
  }
  
  // Check if transition is allowed
  if (!allowedTransitions.includes(newStatus)) {
    const allStatuses = Object.keys(PR_TRANSITIONS)
    const currentIndex = allStatuses.indexOf(currentStatus)
    const newIndex = allStatuses.indexOf(newStatus)
    
    if (newIndex >= 0 && newIndex < currentIndex) {
      return {
        valid: false,
        reason: `Backwards transition not allowed: ${currentStatus} → ${newStatus}`,
        warnings,
      }
    }
    
    if (allowedTransitions.length === 0) {
      return {
        valid: false,
        reason: `Cannot transition from terminal state: ${currentStatus}`,
        warnings,
      }
    }
    
    return {
      valid: false,
      reason: `Invalid transition: ${currentStatus} → ${newStatus}. Allowed: [${allowedTransitions.join(', ')}]`,
      warnings,
    }
  }
  
  return { valid: true, warnings }
}
```

---

### 3.4 validatePOTransition()

```typescript
/**
 * Validate PO status transitions
 * File: migrations/dualwrite/validators/po-validator.ts
 */

// Valid PO Status Transitions (state machine)
const PO_TRANSITIONS: Record<string, string[]> = {
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
}

/**
 * Validate a PO status transition
 * 
 * @param currentStatus - Current unified PO status (or null for new records)
 * @param newStatus - Target unified PO status
 * @returns TransitionValidationResult
 */
function validatePOTransition(
  currentStatus: string | null | undefined,
  newStatus: string
): TransitionValidationResult {
  const warnings: string[] = []
  
  if (!currentStatus) {
    return { valid: true, warnings: [] }
  }
  
  if (currentStatus === newStatus) {
    warnings.push(`Status unchanged: ${currentStatus}`)
    return { valid: true, warnings }
  }
  
  const allowedTransitions = PO_TRANSITIONS[currentStatus]
  if (!allowedTransitions) {
    warnings.push(`Unknown current status: ${currentStatus}`)
    return { valid: true, warnings }
  }
  
  if (!allowedTransitions.includes(newStatus)) {
    const allStatuses = Object.keys(PO_TRANSITIONS)
    const currentIndex = allStatuses.indexOf(currentStatus)
    const newIndex = allStatuses.indexOf(newStatus)
    
    if (newIndex >= 0 && newIndex < currentIndex) {
      return {
        valid: false,
        reason: `Backwards transition not allowed: ${currentStatus} → ${newStatus}`,
        warnings,
      }
    }
    
    if (allowedTransitions.length === 0) {
      return {
        valid: false,
        reason: `Cannot transition from terminal state: ${currentStatus}`,
        warnings,
      }
    }
    
    return {
      valid: false,
      reason: `Invalid transition: ${currentStatus} → ${newStatus}. Allowed: [${allowedTransitions.join(', ')}]`,
      warnings,
    }
  }
  
  return { valid: true, warnings }
}
```

---

### 3.5 validateShipmentTransition()

```typescript
/**
 * Validate Shipment status transitions
 * File: migrations/dualwrite/validators/shipment-validator.ts
 */

// Valid Shipment Status Transitions (state machine)
const SHIPMENT_TRANSITIONS: Record<string, string[]> = {
  'CREATED': ['MANIFESTED', 'PICKED_UP', 'FAILED'],
  'MANIFESTED': ['PICKED_UP', 'FAILED'],
  'PICKED_UP': ['IN_TRANSIT', 'FAILED'],
  'IN_TRANSIT': ['OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED', 'LOST'],
  'OUT_FOR_DELIVERY': ['DELIVERED', 'FAILED', 'RETURNED'],
  'DELIVERED': [], // Terminal state
  'FAILED': ['RETURNED'],
  'RETURNED': [], // Terminal state
  'LOST': [], // Terminal state
}

/**
 * Validate a Shipment status transition
 * 
 * @param currentStatus - Current unified Shipment status (or null for new records)
 * @param newStatus - Target unified Shipment status
 * @returns TransitionValidationResult
 */
function validateShipmentTransition(
  currentStatus: string | null | undefined,
  newStatus: string
): TransitionValidationResult {
  const warnings: string[] = []
  
  if (!currentStatus) {
    return { valid: true, warnings: [] }
  }
  
  if (currentStatus === newStatus) {
    warnings.push(`Status unchanged: ${currentStatus}`)
    return { valid: true, warnings }
  }
  
  const allowedTransitions = SHIPMENT_TRANSITIONS[currentStatus]
  if (!allowedTransitions) {
    warnings.push(`Unknown current status: ${currentStatus}`)
    return { valid: true, warnings }
  }
  
  if (!allowedTransitions.includes(newStatus)) {
    // Special case: Shipment can go to FAILED from most states
    // but backwards transitions are still not allowed
    const terminalStates = ['DELIVERED', 'RETURNED', 'LOST']
    
    if (terminalStates.includes(currentStatus)) {
      return {
        valid: false,
        reason: `Cannot transition from terminal state: ${currentStatus}`,
        warnings,
      }
    }
    
    return {
      valid: false,
      reason: `Invalid transition: ${currentStatus} → ${newStatus}. Allowed: [${allowedTransitions.join(', ')}]`,
      warnings,
    }
  }
  
  return { valid: true, warnings }
}
```

---

### 3.6 validateGRNTransition()

```typescript
/**
 * Validate GRN status transitions
 * File: migrations/dualwrite/validators/grn-validator.ts
 */

// Valid GRN Status Transitions (state machine)
const GRN_TRANSITIONS: Record<string, string[]> = {
  'DRAFT': ['RAISED'],
  'RAISED': ['PENDING_APPROVAL', 'APPROVED'],
  'PENDING_APPROVAL': ['APPROVED'],
  'APPROVED': ['INVOICED', 'CLOSED'],
  'INVOICED': ['CLOSED'],
  'CLOSED': [], // Terminal state
}

/**
 * Validate a GRN status transition
 * 
 * @param currentStatus - Current unified GRN status (or null for new records)
 * @param newStatus - Target unified GRN status
 * @returns TransitionValidationResult
 */
function validateGRNTransition(
  currentStatus: string | null | undefined,
  newStatus: string
): TransitionValidationResult {
  const warnings: string[] = []
  
  if (!currentStatus) {
    return { valid: true, warnings: [] }
  }
  
  if (currentStatus === newStatus) {
    warnings.push(`Status unchanged: ${currentStatus}`)
    return { valid: true, warnings }
  }
  
  const allowedTransitions = GRN_TRANSITIONS[currentStatus]
  if (!allowedTransitions) {
    warnings.push(`Unknown current status: ${currentStatus}`)
    return { valid: true, warnings }
  }
  
  if (!allowedTransitions.includes(newStatus)) {
    const allStatuses = Object.keys(GRN_TRANSITIONS)
    const currentIndex = allStatuses.indexOf(currentStatus)
    const newIndex = allStatuses.indexOf(newStatus)
    
    if (newIndex >= 0 && newIndex < currentIndex) {
      return {
        valid: false,
        reason: `Backwards transition not allowed: ${currentStatus} → ${newStatus}`,
        warnings,
      }
    }
    
    if (allowedTransitions.length === 0) {
      return {
        valid: false,
        reason: `Cannot transition from terminal state: ${currentStatus}`,
        warnings,
      }
    }
    
    return {
      valid: false,
      reason: `Invalid transition: ${currentStatus} → ${newStatus}. Allowed: [${allowedTransitions.join(', ')}]`,
      warnings,
    }
  }
  
  return { valid: true, warnings }
}
```

---

### 3.7 validateInvoiceTransition()

```typescript
/**
 * Validate Invoice status transitions
 * File: migrations/dualwrite/validators/invoice-validator.ts
 */

// Valid Invoice Status Transitions (state machine)
const INVOICE_TRANSITIONS: Record<string, string[]> = {
  'RAISED': ['PENDING_APPROVAL', 'APPROVED', 'DISPUTED', 'CANCELLED'],
  'PENDING_APPROVAL': ['APPROVED', 'DISPUTED', 'CANCELLED'],
  'APPROVED': ['PAID'],
  'PAID': [], // Terminal state
  'DISPUTED': ['RAISED', 'CANCELLED'],
  'CANCELLED': [], // Terminal state
}

/**
 * Validate an Invoice status transition
 * 
 * @param currentStatus - Current unified Invoice status (or null for new records)
 * @param newStatus - Target unified Invoice status
 * @returns TransitionValidationResult
 */
function validateInvoiceTransition(
  currentStatus: string | null | undefined,
  newStatus: string
): TransitionValidationResult {
  const warnings: string[] = []
  
  if (!currentStatus) {
    return { valid: true, warnings: [] }
  }
  
  if (currentStatus === newStatus) {
    warnings.push(`Status unchanged: ${currentStatus}`)
    return { valid: true, warnings }
  }
  
  const allowedTransitions = INVOICE_TRANSITIONS[currentStatus]
  if (!allowedTransitions) {
    warnings.push(`Unknown current status: ${currentStatus}`)
    return { valid: true, warnings }
  }
  
  if (!allowedTransitions.includes(newStatus)) {
    // Special case: DISPUTED can go back to RAISED
    if (currentStatus === 'DISPUTED' && newStatus === 'RAISED') {
      return { valid: true, warnings: ['Re-raising disputed invoice'] }
    }
    
    if (allowedTransitions.length === 0) {
      return {
        valid: false,
        reason: `Cannot transition from terminal state: ${currentStatus}`,
        warnings,
      }
    }
    
    return {
      valid: false,
      reason: `Invalid transition: ${currentStatus} → ${newStatus}. Allowed: [${allowedTransitions.join(', ')}]`,
      warnings,
    }
  }
  
  return { valid: true, warnings }
}
```

---

## 4. Execution Plan for Later

This section describes how these templates will be integrated into the UDS system during Phase 1 (Observation Mode).

### 4.1 Injection Points

| Wrapper Function | Target Location | Legacy Function to Wrap |
|------------------|-----------------|-------------------------|
| `writeOrderStatusDual()` | `lib/db/data-access.ts` ~line 2400 | `updateOrderStatus()` |
| `writePRStatusDual()` | `lib/db/data-access.ts` ~line 3200 | `approvePRBySiteAdmin()`, `approvePRByCompanyAdmin()`, `rejectPR()` |
| `writePRStatusDual()` | `lib/db/data-access.ts` ~line 8000 | `updatePRShipmentStatus()`, `updatePRDeliveryStatus()` |
| `writePOStatusDual()` | `lib/db/data-access.ts` ~line 5300 | `updatePOStatus()`, `updateSinglePOStatus()` |
| `writeShipmentStatusDual()` | `lib/db/data-access.ts` ~line 10300 | `updateManualShipmentStatus()`, `updateShipmentFromWebhook()` |
| `writeGRNStatusDual()` | `lib/db/data-access.ts` ~line 12300 | `acknowledgeGRN()`, `approveGRN()` |
| `writeInvoiceStatusDual()` | `lib/db/data-access.ts` ~line 14300 | `approveInvoice()` |

### 4.2 Integration Pattern

When integrating, follow this pattern at each injection point:

```
BEFORE (existing code):
─────────────────────────
const order = await Order.findOne({ id: orderId })
order.status = 'Awaiting fulfilment'
await order.save()

AFTER (with wrapper - Observation Mode):
────────────────────────────────────────
const order = await Order.findOne({ id: orderId })

// Generate dual-write operation (LOG ONLY)
const dualWriteOp = writeOrderStatusDual(
  orderId,
  order.status,           // old legacy
  'Awaiting fulfilment',  // new legacy
  order.unified_status,   // old unified
  { updatedBy: currentUser.id, source: 'api' }
)

// LOG the operation (do not apply yet)
console.log('[DUAL-WRITE-OBSERVATION]', JSON.stringify(dualWriteOp.auditEntry))

// Continue with existing behavior
order.status = 'Awaiting fulfilment'
await order.save()
```

### 4.3 Feature Flag Integration

Use environment variables to control dual-write behavior:

```
# Environment Variables for Dual-Write Control

# Master switch - enables/disables all dual-write
DUAL_WRITE_ENABLED=false

# Mode control
# - 'observation': Log only, no writes
# - 'shadow': Write to unified, read from legacy
# - 'read-switch': Write to both, read from unified
# - 'cleanup': Write to unified only
DUAL_WRITE_MODE=observation

# Validation control
# - true: Block invalid transitions
# - false: Warn but allow invalid transitions
DUAL_WRITE_BLOCK_INVALID=false

# Logging control
# - true: Log all operations to console
# - false: Log only to status_migration_logs collection
DUAL_WRITE_VERBOSE_LOGGING=true
```

### 4.4 Graceful Fallback Strategy

If any wrapper fails, the system should continue with legacy behavior:

```
try {
  const dualWriteOp = writeOrderStatusDual(...)
  
  if (DUAL_WRITE_ENABLED) {
    if (DUAL_WRITE_MODE === 'shadow' || DUAL_WRITE_MODE === 'read-switch') {
      // Apply both updates
      await Order.updateOne(
        dualWriteOp.filter,
        { $set: { ...dualWriteOp.legacyFieldUpdates, ...dualWriteOp.unifiedFieldUpdates } }
      )
    }
    // Log audit entry
    await db.collection('status_migration_logs').insertOne(dualWriteOp.auditEntry)
  }
} catch (dualWriteError) {
  // Log error but DO NOT fail the operation
  console.error('[DUAL-WRITE-ERROR]', dualWriteError.message)
  
  // Fall back to legacy-only update
  await Order.updateOne({ id: orderId }, { $set: { status: newStatus } })
}
```

### 4.5 Rollout Sequence

```
Step 1: Deploy wrapper files (no integration)
        ↓
Step 2: Add feature flags to environment (disabled)
        ↓
Step 3: Integrate wrappers at injection points (observation mode)
        ↓
Step 4: Enable DUAL_WRITE_ENABLED=true
        ↓
Step 5: Monitor logs for 2 weeks
        ↓
Step 6: Switch to DUAL_WRITE_MODE=shadow
        ↓
Step 7: Monitor consistency for 2 weeks
        ↓
Step 8: Switch to DUAL_WRITE_MODE=read-switch
        ↓
Step 9: Monitor for issues, test rollback
        ↓
Step 10: Switch to DUAL_WRITE_MODE=cleanup
```

### 4.6 File Organization

Suggested file structure for the dual-write layer:

```
migrations/
└── dualwrite/
    ├── index.ts                    # Main export file
    ├── types.ts                    # Common types and interfaces
    ├── wrappers/
    │   ├── order-wrapper.ts        # writeOrderStatusDual()
    │   ├── pr-wrapper.ts           # writePRStatusDual()
    │   ├── po-wrapper.ts           # writePOStatusDual()
    │   ├── shipment-wrapper.ts     # writeShipmentStatusDual()
    │   ├── grn-wrapper.ts          # writeGRNStatusDual()
    │   └── invoice-wrapper.ts      # writeInvoiceStatusDual()
    ├── mappings/
    │   ├── order-status.ts         # ORDER_STATUS mappings
    │   ├── pr-status.ts            # PR_STATUS mappings
    │   ├── po-status.ts            # PO_STATUS mappings
    │   ├── shipment-status.ts      # SHIPMENT_STATUS mappings
    │   ├── grn-status.ts           # GRN_STATUS mappings
    │   └── invoice-status.ts       # INVOICE_STATUS mappings
    ├── validators/
    │   ├── order-validator.ts      # validateOrderTransition()
    │   ├── pr-validator.ts         # validatePRTransition()
    │   ├── po-validator.ts         # validatePOTransition()
    │   ├── shipment-validator.ts   # validateShipmentTransition()
    │   ├── grn-validator.ts        # validateGRNTransition()
    │   └── invoice-validator.ts    # validateInvoiceTransition()
    └── utils/
        ├── feature-flags.ts        # Feature flag utilities
        ├── logging.ts              # Audit logging utilities
        └── fallback.ts             # Fallback handling utilities
```

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-15 | Migration Team | Initial document with all templates |

---

**END OF WRAPPER TEMPLATES DOCUMENT**

*These are building block templates only. They have not been integrated into the UDS codebase and will not cause any side effects until explicitly integrated following the execution plan.*
