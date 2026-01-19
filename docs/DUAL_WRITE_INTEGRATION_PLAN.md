# Dual-Write Integration Plan

## Unified Status Migration — Complete Integration Strategy

**Document Version:** 1.0.0  
**Created:** 2026-01-15  
**Status:** PLANNING DOCUMENT — NO CHANGES TO BE APPLIED  
**Author:** System Migration Team

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Call Graph Mapping](#2-call-graph-mapping)
3. [Integration Strategy (Phased)](#3-integration-strategy-phased)
4. [Validation Requirements](#4-validation-requirements)
5. [Monitoring + Alerting Requirements](#5-monitoring--alerting-requirements)
6. [Backward Compatibility Impact Analysis](#6-backward-compatibility-impact-analysis)
7. [Risk Mitigation and Rollback Plan](#7-risk-mitigation-and-rollback-plan)
8. [Final Checklist](#8-final-checklist)

---

## 1. System Overview

### 1.1 What the Dual-Write Layer Does

The dual-write layer is a non-intrusive migration mechanism that ensures **both legacy status fields and new unified status fields** are updated simultaneously during any status change operation. It acts as an intermediary wrapper around existing status update logic.

**Key Functions:**
- Intercepts status update calls
- Maps legacy status values to unified status values (and vice versa)
- Prepares update payloads for both field sets
- Validates status transitions against defined state machine rules
- Generates audit logs for tracking and compliance
- Returns structured results without executing database operations directly

### 1.2 Why Dual-Write is Needed

The current UDS system has evolved organically, resulting in:

| Problem | Description |
|---------|-------------|
| **Status Field Fragmentation** | Multiple overlapping status fields: `status`, `pr_status`, `dispatchStatus`, `deliveryStatus`, `grnStatus`, `invoiceStatus` |
| **Inconsistent Transitions** | Different workflows use different status values for similar states |
| **Mixed Entity Design** | The `Order` model serves dual purposes (Orders and PRs), causing confusion |
| **Cascading Complexity** | Status updates trigger cascading updates across multiple entities without clear rules |
| **Audit Gap** | No centralized logging of status transitions for debugging or compliance |

Dual-write addresses these by introducing **unified status fields** that will eventually become the single source of truth.

### 1.3 Benefits Provided

| Benefit | Description |
|---------|-------------|
| **Zero Downtime Migration** | Gradual transition without breaking existing functionality |
| **Data Consistency** | Both legacy and unified fields stay synchronized |
| **Audit Trail** | Every status change is logged with context |
| **Validation Layer** | Invalid transitions are caught before database writes |
| **Rollback Capability** | Legacy fields remain functional if issues arise |
| **Future-Proof Design** | Unified status model supports new workflows without schema changes |

### 1.4 System Components Affected

The dual-write layer will eventually touch the following parts of the system:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          COMPONENTS TO BE WRAPPED                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  DATA ACCESS LAYER                                                          │
│  └── lib/db/data-access.ts                                                  │
│      ├── Order status updates                                               │
│      ├── PR status updates                                                  │
│      ├── PO status updates                                                  │
│      ├── Shipment status updates                                            │
│      ├── GRN status updates                                                 │
│      └── Invoice status updates                                             │
│                                                                             │
│  API ROUTES                                                                 │
│  └── app/api/                                                               │
│      ├── orders/[id]/status/route.ts                                        │
│      ├── prs/[id]/approve/route.ts                                          │
│      ├── prs/shipment/route.ts                                              │
│      ├── pos/[id]/status/route.ts                                           │
│      ├── shipments/[id]/status/route.ts                                     │
│      ├── grns/[id]/approve/route.ts                                         │
│      └── invoices/[id]/approve/route.ts                                     │
│                                                                             │
│  WEBHOOK HANDLERS                                                           │
│  └── app/api/webhooks/                                                      │
│      └── shiprocket/route.ts (courier status updates)                       │
│                                                                             │
│  BACKGROUND JOBS (if applicable)                                            │
│  └── scripts/                                                               │
│      └── sync-shipment-status.ts                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.5 Potential Risk Areas

| Risk Area | Severity | Description |
|-----------|----------|-------------|
| **Cascading Updates** | HIGH | A single status change may trigger multiple cascading updates; dual-write must handle all of them |
| **Transaction Boundaries** | MEDIUM | Dual-write must occur within the same transaction as the original write to prevent partial updates |
| **Performance Impact** | LOW | Additional logging and validation adds minor overhead |
| **Mapping Gaps** | MEDIUM | Some legacy status values may not have direct unified equivalents |
| **Race Conditions** | MEDIUM | Concurrent updates to the same entity could cause field inconsistency |
| **Webhook Handlers** | HIGH | External systems (Shiprocket, etc.) push status updates that must also dual-write |

---

## 2. Call Graph Mapping

This section identifies all locations in the codebase where status updates occur.

### 2.1 Order Status Updates

| Location | Function/Pattern | Wrapper to Use |
|----------|------------------|----------------|
| `lib/db/data-access.ts` ~line 2400-2500 | `updateOrderStatus()` | `safeDualWriteOrderStatus()` |
| `lib/db/data-access.ts` ~line 2600-2700 | Direct `Order.updateOne()` calls in approval flows | `safeDualWriteOrderStatus()` |
| `app/api/orders/[id]/approve/route.ts` | PATCH handler for order approval | `safeDualWriteOrderStatus()` |
| `app/api/orders/[id]/status/route.ts` | Direct status update endpoint | `safeDualWriteOrderStatus()` |

**Current Logic Pattern:**
```
1. Fetch order by ID
2. Validate authorization
3. Update order.status directly via Order.updateOne() or order.save()
4. Return updated order
```

**Integration Point:** Wrap the status assignment before the database write.

---

### 2.2 PR Status Updates

| Location | Function/Pattern | Wrapper to Use |
|----------|------------------|----------------|
| `lib/db/data-access.ts` ~line 3200-3400 | `approvePRBySiteAdmin()` | `safeDualWritePRStatus()` |
| `lib/db/data-access.ts` ~line 3500-3700 | `approvePRByCompanyAdmin()` | `safeDualWritePRStatus()` |
| `lib/db/data-access.ts` ~line 3800-4000 | `rejectPR()` | `safeDualWritePRStatus()` |
| `lib/db/data-access.ts` ~line 8000-8200 | `updatePRShipmentStatus()` | `safeDualWritePRStatus()` |
| `lib/db/data-access.ts` ~line 8300-8500 | `updatePRDeliveryStatus()` | `safeDualWritePRStatus()` |
| `app/api/prs/[id]/approve/route.ts` | Site/Company admin approval endpoints | `safeDualWritePRStatus()` |
| `app/api/prs/shipment/route.ts` | Shipment and delivery status updates | `safeDualWritePRStatus()` |

**Current Logic Pattern:**
```
1. Fetch PR (Order with pr_number)
2. Validate authorization and current status
3. Update pr_status, dispatchStatus, or deliveryStatus
4. Trigger cascading updates (PO status, etc.)
5. Return updated PR
```

**Integration Point:** Wrap PR status changes; handle cascading updates separately.

---

### 2.3 PO Status Updates

| Location | Function/Pattern | Wrapper to Use |
|----------|------------------|----------------|
| `lib/db/data-access.ts` ~line 5000-5200 | `createPurchaseOrder()` (initial status) | `safeDualWritePOStatus()` |
| `lib/db/data-access.ts` ~line 5300-5500 | `updatePOStatus()` | `safeDualWritePOStatus()` |
| `lib/db/data-access.ts` ~line 5600-5800 | `updateSinglePOStatus()` | `safeDualWritePOStatus()` |
| `lib/db/data-access.ts` ~line 9000-9200 | Cascading PO status from PR delivery | `safeDualWritePOStatus()` |
| `app/api/pos/[id]/status/route.ts` | Direct PO status update endpoint | `safeDualWritePOStatus()` |

**Current Logic Pattern:**
```
1. Fetch PO by ID
2. Validate authorization
3. Update po_status
4. If all linked PRs delivered → mark PO as COMPLETED
5. Return updated PO
```

**Integration Point:** Wrap both direct updates and cascading updates.

---

### 2.4 Shipment Status Updates

| Location | Function/Pattern | Wrapper to Use |
|----------|------------------|----------------|
| `lib/db/data-access.ts` ~line 10000-10200 | `createShipment()` (initial status) | `safeDualWriteShipmentStatus()` |
| `lib/db/data-access.ts` ~line 10300-10500 | `updateManualShipmentStatus()` | `safeDualWriteShipmentStatus()` |
| `lib/db/data-access.ts` ~line 10600-10800 | `updateShipmentFromWebhook()` | `safeDualWriteShipmentStatus()` |
| `app/api/shipments/[id]/status/route.ts` | Manual status update endpoint | `safeDualWriteShipmentStatus()` |
| `app/api/webhooks/shiprocket/route.ts` | Courier webhook handler | `safeDualWriteShipmentStatus()` |

**Current Logic Pattern:**
```
1. Receive status update (manual or webhook)
2. Map courier status to internal shipmentStatus
3. Update shipment record
4. Trigger cascading updates to PR/Order delivery status
5. Return result
```

**Integration Point:** Wrap at the point where shipmentStatus is assigned; cascading to PR must also use dual-write.

---

### 2.5 GRN Status Updates

| Location | Function/Pattern | Wrapper to Use |
|----------|------------------|----------------|
| `lib/db/data-access.ts` ~line 12000-12200 | `createGRNByVendor()` (initial status) | `safeDualWriteGRNStatus()` |
| `lib/db/data-access.ts` ~line 12300-12500 | `acknowledgeGRN()` | `safeDualWriteGRNStatus()` |
| `lib/db/data-access.ts` ~line 12600-12800 | `approveGRN()` | `safeDualWriteGRNStatus()` |
| `app/api/grns/[id]/approve/route.ts` | GRN approval endpoint | `safeDualWriteGRNStatus()` |

**Current Logic Pattern:**
```
1. Fetch GRN by ID
2. Validate authorization
3. Update status and/or grnStatus fields
4. Set approval metadata (approvedBy, approvedAt)
5. Trigger invoice creation if applicable
6. Return updated GRN
```

**Integration Point:** Wrap status assignment; ensure both legacy `status` and `grnStatus` are handled.

---

### 2.6 Invoice Status Updates

| Location | Function/Pattern | Wrapper to Use |
|----------|------------------|----------------|
| `lib/db/data-access.ts` ~line 14000-14200 | `createInvoiceByVendor()` (initial status) | `safeDualWriteInvoiceStatus()` |
| `lib/db/data-access.ts` ~line 14300-14500 | `approveInvoice()` | `safeDualWriteInvoiceStatus()` |
| `app/api/invoices/[id]/approve/route.ts` | Invoice approval endpoint | `safeDualWriteInvoiceStatus()` |

**Current Logic Pattern:**
```
1. Fetch Invoice by ID
2. Validate authorization
3. Update invoiceStatus
4. Set approval metadata (approvedBy, approvedAt)
5. Return updated Invoice
```

**Integration Point:** Wrap invoiceStatus assignment.

---

## 3. Integration Strategy (Phased)

### Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PHASED INTEGRATION TIMELINE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHASE 1          PHASE 2           PHASE 3           PHASE 4              │
│  Observation      Shadow Mode       Read-Switch       Cleanup              │
│  (2 weeks)        (2 weeks)         (2 weeks)         (1 week)             │
│                                                                             │
│  ┌──────────┐    ┌──────────┐      ┌──────────┐      ┌──────────┐          │
│  │ LOG ONLY │───▶│ DUAL     │─────▶│ READ     │─────▶│ LEGACY   │          │
│  │ NO WRITE │    │ WRITE    │      │ UNIFIED  │      │ CLEANUP  │          │
│  └──────────┘    └──────────┘      └──────────┘      └──────────┘          │
│                                                                             │
│  Legacy: READ    Legacy: READ/WRITE  Legacy: WRITE   Legacy: DEPRECATED    │
│  Unified: -      Unified: WRITE      Unified: READ   Unified: READ/WRITE   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### PHASE 1 — Observation Mode (No Writes)

**Duration:** 2 weeks  
**Risk Level:** LOW  
**Goal:** Capture current status transition patterns without changing behavior

#### What Happens:
- Wrapper functions are called but **only log** the status transitions
- No writes to unified status fields
- Legacy fields remain the sole source of truth
- Generate a "status-diff" report showing what unified values **would be**

#### Implementation Approach:
1. Import wrapper functions into target locations (see Section 2)
2. Call wrapper after existing status update
3. Log the returned payload to `status_migration_logs` collection
4. Do NOT apply the `legacyUpdate` or `unifiedUpdate` payloads

#### Expected Outputs:
- Log entries for every status transition
- Statistics on transition frequency by entity type
- Identification of unmapped legacy status values
- List of validation warnings (invalid transitions in current system)

#### Success Criteria:
- 100% of status updates are logged
- No impact on response times (< 5ms overhead)
- No errors in production
- Status-diff report generated daily

---

### PHASE 2 — Dual-Write Shadow Mode

**Duration:** 2 weeks  
**Risk Level:** MEDIUM  
**Goal:** Write to unified fields while keeping legacy as source of truth

#### What Happens:
- Both legacy AND unified fields are updated simultaneously
- Legacy fields remain the **read source** for all application logic
- Unified fields are updated but not read by the application
- Monitoring compares legacy vs unified for consistency

#### Implementation Approach:
1. Apply both `legacyUpdate` and `unifiedUpdate` payloads from wrapper
2. Use atomic updates ($set both in single operation)
3. Insert audit log entry
4. All reads still use legacy fields

#### Expected Outputs:
- Unified status fields populated for all records
- Consistency report: % of records where legacy ≠ unified (expected: 0%)
- Performance metrics (write overhead)
- Error logs for any failed dual-writes

#### Success Criteria:
- 99.9%+ consistency between legacy and unified
- No increase in error rates
- Write latency increase < 10ms
- All validation warnings documented

---

### PHASE 3 — Read-Switch Mode

**Duration:** 2 weeks  
**Risk Level:** HIGH  
**Goal:** Switch reads to unified fields while maintaining dual-write

#### What Happens:
- Application logic reads from **unified status fields**
- Dual-write continues (both legacy and unified updated)
- Legacy fields become "backup" for rollback
- Identify code paths still reading legacy fields

#### Implementation Approach:
1. Update read queries to use `unified_*_status` fields
2. Continue dual-writing for backward compatibility
3. Add deprecation warnings for legacy field reads
4. Monitor for any code paths using legacy fields

#### Expected Outputs:
- List of deprecated code paths still reading legacy
- Performance comparison (read times)
- Incident count from switch
- User-reported issues

#### Success Criteria:
- Zero user-reported issues from read switch
- All critical paths use unified fields
- Legacy reads identified and documented
- Rollback tested and validated

---

### PHASE 4 — Cleanup Mode

**Duration:** 1 week  
**Risk Level:** LOW (if Phase 3 successful)  
**Goal:** Remove legacy field writes and prepare for deprecation

#### What Happens:
- Stop writing to legacy status fields
- Mark legacy fields as deprecated in schema
- Prepare final database migration to remove legacy fields
- Update documentation

#### Implementation Approach:
1. Remove legacy field writes from wrapper functions
2. Add schema deprecation comments
3. Generate migration script to drop legacy fields (not executed)
4. Update API documentation

#### Expected Outputs:
- Wrapper functions only write unified fields
- Migration script ready for final cleanup
- Updated documentation
- Deprecation notices in code

#### Success Criteria:
- No application errors after legacy write removal
- All tests pass with unified fields only
- Migration script validated in staging
- Documentation complete

---

## 4. Validation Requirements

### 4.1 State Machine Validation

Each entity has defined valid transitions. The wrapper functions must validate:

| Entity | Valid Transitions |
|--------|-------------------|
| **Order** | CREATED → PENDING_APPROVAL → APPROVED → IN_FULFILMENT → DISPATCHED → DELIVERED |
| **PR** | DRAFT → PENDING_SITE_ADMIN_APPROVAL → SITE_ADMIN_APPROVED → PENDING_COMPANY_ADMIN_APPROVAL → COMPANY_ADMIN_APPROVED → LINKED_TO_PO → IN_SHIPMENT → FULLY_DELIVERED → CLOSED |
| **PO** | CREATED → SENT_TO_VENDOR → ACKNOWLEDGED → IN_FULFILMENT → FULLY_SHIPPED → FULLY_DELIVERED → CLOSED |
| **Shipment** | CREATED → MANIFESTED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED |
| **GRN** | DRAFT → RAISED → APPROVED → INVOICED → CLOSED |
| **Invoice** | RAISED → PENDING_APPROVAL → APPROVED → PAID |

### 4.2 Invalid Transition Detection

The validation helper must detect:

| Validation Type | Description | Action |
|-----------------|-------------|--------|
| **Backwards Transition** | Moving from a later state to an earlier state | Log warning, allow with flag |
| **State Skipping** | Jumping over intermediate states | Log warning, allow with flag |
| **Terminal State Exit** | Attempting to change a terminal state (DELIVERED, CLOSED, etc.) | Log warning, block by default |
| **Unknown Status** | Transitioning to/from unmapped status values | Log warning, preserve original |

### 4.3 Stuck/Unresolved State Detection

Identify records that have been in transitional states for too long:

| State | Maximum Duration | Alert Action |
|-------|------------------|--------------|
| PENDING_APPROVAL | 7 days | Generate report |
| IN_TRANSIT | 14 days | Flag for review |
| PENDING_SITE_ADMIN_APPROVAL | 5 days | Notify site admin |
| PENDING_COMPANY_ADMIN_APPROVAL | 5 days | Notify company admin |
| RAISED (GRN/Invoice) | 10 days | Flag for follow-up |

### 4.4 Shipment-Based Cascade Verification

When a shipment status changes to DELIVERED:

1. ✓ All linked PR items should have `deliveredQuantity` updated
2. ✓ PR `deliveryStatus` should be DELIVERED or PARTIALLY_DELIVERED
3. ✓ If all PRs under a PO are delivered, PO status should be FULLY_DELIVERED
4. ✓ Order status should reflect delivery completion

**Verification Query:** After each shipment DELIVERED update, query related entities to confirm cascade completed.

### 4.5 Legacy vs Unified Consistency Check

After every dual-write:

| Check | Expected Result |
|-------|-----------------|
| `order.status` maps to `order.unified_status` | Values should be equivalent per mapping |
| `order.pr_status` maps to `order.unified_pr_status` | Values should be equivalent per mapping |
| `po.po_status` maps to `po.unified_po_status` | Values should be equivalent per mapping |
| `shipment.shipmentStatus` maps to `shipment.unified_shipment_status` | Values should be equivalent per mapping |
| `grn.grnStatus` + `grn.status` maps to `grn.unified_grn_status` | Values should be equivalent per mapping |
| `invoice.invoiceStatus` maps to `invoice.unified_invoice_status` | Values should be equivalent per mapping |

---

## 5. Monitoring + Alerting Requirements

### 5.1 Log Categories

| Log Category | Purpose | Retention |
|--------------|---------|-----------|
| `STATUS_UPDATE` | Normal status transitions | 90 days |
| `STATUS_MISMATCH` | Legacy ≠ Unified after dual-write | 180 days |
| `INVALID_TRANSITION` | Validation failures | 180 days |
| `CASCADE_FAILURE` | Cascading update did not complete | 180 days |
| `UNIFIED_NOT_UPDATED` | Unified field was not written | 180 days |

### 5.2 Log Format

Each log entry should follow this structure:

```
{
  "timestamp": "2026-01-15T10:30:00.000Z",
  "level": "INFO | WARN | ERROR",
  "category": "STATUS_UPDATE | STATUS_MISMATCH | ...",
  "entityType": "Order | PR | PO | Shipment | GRN | Invoice",
  "entityId": "ORD-001",
  "transition": {
    "previousLegacy": "Awaiting approval",
    "newLegacy": "Awaiting fulfilment",
    "previousUnified": "PENDING_APPROVAL",
    "newUnified": "APPROVED"
  },
  "validation": {
    "valid": true | false,
    "reason": "...",
    "warnings": []
  },
  "context": {
    "updatedBy": "admin@example.com",
    "source": "api | webhook | migration | system",
    "reason": "Admin approved order"
  },
  "metadata": { ... }
}
```

### 5.3 Example Log Outputs

**Normal Status Update:**
```
[INFO] [STATUS_UPDATE] Order ORD-001: PENDING_APPROVAL → APPROVED
       Legacy: "Awaiting approval" → "Awaiting fulfilment"
       Updated by: admin@example.com
       Source: api
```

**Mismatch Detected:**
```
[WARN] [STATUS_MISMATCH] Order ORD-002: Legacy ≠ Unified after dual-write
       Legacy: "Dispatched" (expected: "Awaiting fulfilment")
       Unified: "APPROVED"
       Action: Manual review required
```

**Invalid Transition:**
```
[WARN] [INVALID_TRANSITION] PR PR-003: FULLY_DELIVERED → DRAFT
       Reason: Backwards transition not allowed
       Action: Logged but not blocked (observation mode)
```

**Cascade Failure:**
```
[ERROR] [CASCADE_FAILURE] Shipment SHIP-001 → DELIVERED
        Expected cascade: PR PR-001 deliveryStatus → DELIVERED
        Actual: PR PR-001 deliveryStatus = NOT_DELIVERED
        Action: Alert generated, manual intervention required
```

### 5.4 Alerting Thresholds

| Metric | Threshold | Alert Level | Action |
|--------|-----------|-------------|--------|
| Status Mismatch Rate | > 1% | WARNING | Review logs |
| Status Mismatch Rate | > 3% | CRITICAL | Pause dual-write |
| Invalid Transition Rate | > 5% | WARNING | Review transition rules |
| Cascade Failure Count | > 10/hour | CRITICAL | Investigate immediately |
| Unified Not Updated | > 0 | WARNING | Fix wrapper integration |
| Average Dual-Write Latency | > 50ms | WARNING | Performance review |

### 5.5 Dashboard Metrics

| Metric | Description |
|--------|-------------|
| Total Status Updates (24h) | Count of all status changes |
| Updates by Entity Type | Breakdown by Order, PR, PO, etc. |
| Mismatch Count | Legacy ≠ Unified count |
| Invalid Transitions | Count of validation failures |
| Cascade Success Rate | % of cascades that completed correctly |
| Average Latency | Mean time for dual-write operation |
| Records Missing Unified | Count of records without unified status |

---

## 6. Backward Compatibility Impact Analysis

### 6.1 API Consumers

| Consumer | Impact | Required Testing |
|----------|--------|------------------|
| **Internal Admin Panel** | LOW - Will read from unified fields after Phase 3 | Full regression on status displays |
| **Vendor Portal** | LOW - Status displays may show different values | Verify status label mappings |
| **Employee Ordering App** | LOW - Order status displays | Verify order tracking page |
| **External API Integrations** | MEDIUM - If they read status fields directly | Communicate changes, provide migration guide |
| **Mobile App** | LOW - Status displays | Verify all status-dependent UI |
| **Reporting/Analytics** | MEDIUM - Queries may reference legacy fields | Update queries to use unified fields |

### 6.2 Admin Panel UI

| Component | Current Behavior | After Integration |
|-----------|------------------|-------------------|
| Order List | Displays `order.status` | Will display `order.unified_status` (Phase 3) |
| PR Approval Queue | Filters by `pr_status` | Will filter by `unified_pr_status` (Phase 3) |
| PO Management | Shows `po_status` | Will show `unified_po_status` (Phase 3) |
| Shipment Tracking | Uses `shipmentStatus` | Will use `unified_shipment_status` (Phase 3) |
| GRN List | Shows `grnStatus` | Will show `unified_grn_status` (Phase 3) |
| Invoice List | Shows `invoiceStatus` | Will show `unified_invoice_status` (Phase 3) |

**Testing Required:**
- Verify all status dropdowns populate correctly
- Verify all status filters work with unified values
- Verify status badge colors map correctly
- Verify status history displays both legacy and unified

### 6.3 Vendor Portal

| Feature | Impact | Testing |
|---------|--------|---------|
| PO Status View | Will show unified PO status | Verify mapping |
| Shipment Updates | Dual-write applies | Verify webhook handling |
| GRN Creation | Initial status dual-written | Verify initial status |
| Invoice Creation | Initial status dual-written | Verify initial status |

### 6.4 Employee Ordering Flows

| Flow | Impact | Testing |
|------|--------|---------|
| Place Order | Initial status dual-written | Verify CREATED status |
| Track Order | Status display changes | Verify tracking page |
| PR Submission | pr_status dual-written | Verify approval flow |

### 6.5 Migration Scripts

| Script | Status | Action Required |
|--------|--------|-----------------|
| `migration-02-status-normalization-audit.js` | Ready | Run before Phase 2 |
| `migration-03-status-consistency-repair.js` | Ready | Run before Phase 2 |
| `migration-04-orphaned-relationships-audit.js` | Ready | Run before Phase 2 |
| `migration-05-optional-cleanup.js` | Ready | Manual execution only |
| `migration-06-setup-migration-logs.js` | Ready | Run before Phase 1 |

### 6.6 Testing Matrix

| Area | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|------|---------|---------|---------|---------|
| Order CRUD | ✓ | ✓ | ✓✓ | ✓ |
| PR Approval Flow | ✓ | ✓ | ✓✓ | ✓ |
| PO Management | ✓ | ✓ | ✓✓ | ✓ |
| Shipment Tracking | ✓ | ✓ | ✓✓ | ✓ |
| GRN Flow | ✓ | ✓ | ✓✓ | ✓ |
| Invoice Flow | ✓ | ✓ | ✓✓ | ✓ |
| Webhook Handling | ✓ | ✓ | ✓✓ | ✓ |
| Reports/Analytics | - | ✓ | ✓✓ | ✓ |
| Admin Panel | ✓ | ✓ | ✓✓✓ | ✓ |
| Vendor Portal | ✓ | ✓ | ✓✓✓ | ✓ |

Legend: ✓ = Basic test, ✓✓ = Enhanced test, ✓✓✓ = Full regression

---

## 7. Risk Mitigation and Rollback Plan

### 7.1 Risk Matrix

| Risk | Likelihood | Impact | Severity | Mitigation |
|------|------------|--------|----------|------------|
| Dual-write fails silently | LOW | HIGH | **HIGH** | Log every operation, alert on failures |
| Legacy/Unified mismatch | MEDIUM | MEDIUM | **MEDIUM** | Consistency checks after every write |
| Cascading update breaks | MEDIUM | HIGH | **HIGH** | Test cascades thoroughly, monitor |
| Performance degradation | LOW | MEDIUM | **LOW** | Benchmark before/after, optimize |
| Webhook handler misses dual-write | MEDIUM | MEDIUM | **MEDIUM** | Audit all webhook paths |
| Invalid transitions block operations | LOW | HIGH | **MEDIUM** | Warn but don't block in Phase 1-2 |
| Rollback data loss | LOW | HIGH | **HIGH** | Backup before each phase |
| UI displays wrong status | MEDIUM | LOW | **LOW** | Thorough UI testing in Phase 3 |

### 7.2 Immediate Rollback Steps

**If issues detected during Phase 1 (Observation):**
1. Remove wrapper function calls from code
2. Disable logging to `status_migration_logs`
3. No data changes required

**If issues detected during Phase 2 (Shadow Mode):**
1. Stop writing to unified fields
2. Run consistency check: verify legacy fields unchanged
3. Mark unified fields as stale (add `_stale` suffix to values)
4. Revert to Phase 1 or disable entirely

**If issues detected during Phase 3 (Read-Switch):**
1. Switch reads back to legacy fields (revert code)
2. Continue dual-writing (don't lose unified data)
3. Investigate mismatch source
4. Return to Phase 2

**If issues detected during Phase 4 (Cleanup):**
1. Re-enable legacy field writes
2. Return to Phase 3
3. Sync unified → legacy if needed

### 7.3 Quick Disable Mechanism

Implement a feature flag system:

| Flag | Values | Effect |
|------|--------|--------|
| `DUAL_WRITE_ENABLED` | true/false | Enables/disables dual-write entirely |
| `DUAL_WRITE_MODE` | observation/shadow/read-switch/cleanup | Controls current phase |
| `DUAL_WRITE_LOG_ONLY` | true/false | Force observation mode |
| `DUAL_WRITE_BLOCK_INVALID` | true/false | Whether to block invalid transitions |

**To disable quickly:**
```
Set DUAL_WRITE_ENABLED=false
```

### 7.4 Data Consistency Recovery

**If unified fields are corrupted:**

1. **Identify affected records:**
   - Query records where `unified_*_status` doesn't match expected mapping from legacy
   
2. **Run repair script:**
   - Use `migration-03-status-consistency-repair.js` to re-sync unified from legacy
   
3. **Verify repair:**
   - Run `migration-02-status-normalization-audit.js` to confirm consistency

**If legacy fields are corrupted (should not happen with dual-write):**

1. **Identify affected records:**
   - Query records where legacy status doesn't match unified mapping
   
2. **Manual review required:**
   - Legacy corruption requires manual investigation
   - Check audit logs for source of corruption
   
3. **Restore from backup if needed:**
   - Use timestamped backups to restore specific records

### 7.5 Rollback Testing Schedule

| Test | Frequency | Description |
|------|-----------|-------------|
| Phase 2 → Phase 1 rollback | Before Phase 2 start | Verify can disable dual-write |
| Phase 3 → Phase 2 rollback | Before Phase 3 start | Verify can switch reads back |
| Phase 4 → Phase 3 rollback | Before Phase 4 start | Verify can re-enable legacy writes |
| Full rollback | Monthly | Test complete disable and recovery |

---

## 8. Final Checklist

### 8.1 Pre-Integration Checklist

#### Mapping Validation
- [ ] All legacy ORDER_STATUS values have unified mappings
- [ ] All legacy PR_STATUS values have unified mappings
- [ ] All legacy PO_STATUS values have unified mappings
- [ ] All legacy SHIPMENT_STATUS values have unified mappings
- [ ] All legacy GRN_STATUS values have unified mappings
- [ ] All legacy INVOICE_STATUS values have unified mappings
- [ ] Bidirectional mappings are consistent (legacy→unified→legacy = original)
- [ ] Unknown values are preserved (not deleted)

#### Wrapper Function Testing
- [ ] `safeDualWriteOrderStatus()` tested with dry-run
- [ ] `safeDualWritePRStatus()` tested with dry-run
- [ ] `safeDualWritePOStatus()` tested with dry-run
- [ ] `safeDualWriteShipmentStatus()` tested with dry-run
- [ ] `safeDualWriteGRNStatus()` tested with dry-run
- [ ] `safeDualWriteInvoiceStatus()` tested with dry-run
- [ ] All wrappers return expected payload structure
- [ ] Validation warnings generated for invalid transitions

#### Schema Verification
- [ ] `unified_status` field exists on Order model
- [ ] `unified_pr_status` field exists on Order model
- [ ] `unified_po_status` field exists on PurchaseOrder model
- [ ] `unified_shipment_status` field exists on Shipment model
- [ ] `unified_grn_status` field exists on GRN model
- [ ] `unified_invoice_status` field exists on Invoice model
- [ ] All unified fields are indexed
- [ ] No breaking changes to existing fields

#### Cascade Logic
- [ ] Shipment → PR cascade paths identified
- [ ] PR → PO cascade paths identified
- [ ] PO → Order cascade paths identified (if applicable)
- [ ] No infinite loop scenarios detected
- [ ] All cascade points will use dual-write

#### Monitoring Setup
- [ ] `status_migration_logs` collection created
- [ ] Logging pipeline configured
- [ ] Alert thresholds defined
- [ ] Dashboard metrics identified
- [ ] Retention policy configured

#### Backup Preparation
- [ ] Full database backup completed
- [ ] Backup verified and restorable
- [ ] Backup location documented
- [ ] Point-in-time recovery tested

#### Rollback Validation
- [ ] Rollback steps documented
- [ ] Rollback tested in staging
- [ ] Feature flags implemented
- [ ] Quick disable mechanism tested

### 8.2 Phase Gate Checklist

#### Before Phase 1 (Observation)
- [ ] All pre-integration checks passed
- [ ] Migration script 06 executed (logging setup)
- [ ] Dry-run completed successfully
- [ ] Team briefed on observation mode

#### Before Phase 2 (Shadow Mode)
- [ ] Phase 1 ran for minimum 2 weeks
- [ ] No critical issues in observation logs
- [ ] Status-diff report reviewed
- [ ] Unmapped values addressed
- [ ] Performance baseline established

#### Before Phase 3 (Read-Switch)
- [ ] Phase 2 ran for minimum 2 weeks
- [ ] Consistency rate > 99.9%
- [ ] No cascade failures in logs
- [ ] All UI components tested
- [ ] Rollback tested

#### Before Phase 4 (Cleanup)
- [ ] Phase 3 ran for minimum 2 weeks
- [ ] Zero user-reported issues
- [ ] All legacy reads deprecated
- [ ] Final migration script prepared
- [ ] Documentation updated

### 8.3 Sign-Off Requirements

| Phase | Sign-Off Required From |
|-------|------------------------|
| Phase 1 Start | Technical Lead |
| Phase 2 Start | Technical Lead + QA Lead |
| Phase 3 Start | Technical Lead + QA Lead + Product Owner |
| Phase 4 Start | Technical Lead + QA Lead + Product Owner + Stakeholder |

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-15 | Migration Team | Initial document |

---

**END OF INTEGRATION PLAN**

*This is a planning document only. No code changes or database modifications should be made based on this document without proper approval and following the phased approach outlined above.*
