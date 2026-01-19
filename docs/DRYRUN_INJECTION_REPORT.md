# DRY-RUN DUAL-WRITE INJECTION REPORT

## Analysis of All Status Update Injection Points

**Document Version:** 1.0.0  
**Created:** 2026-01-15  
**Status:** DIAGNOSTIC REPORT — NO CODE CHANGES MADE  
**Scope:** Full codebase scan for status update locations

---

## Executive Summary

| Entity | Critical | High | Medium | Low | Total |
|--------|----------|------|--------|-----|-------|
| **Order** | 12 | 4 | 3 | 2 | 21 |
| **PR** | 15 | 5 | 4 | 2 | 26 |
| **PO** | 4 | 2 | 2 | 1 | 9 |
| **Shipment** | 6 | 3 | 2 | 1 | 12 |
| **GRN** | 4 | 2 | 2 | 1 | 9 |
| **Invoice** | 3 | 1 | 1 | 1 | 6 |
| **TOTAL** | **44** | **17** | **14** | **8** | **83** |

---

## 1. ORDER STATUS INJECTION POINTS

### SECTION A — CRITICAL (🔴)

#### ORD-C1: Order Approval - Site Admin Flow
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~9785-9786 |
| **Action** | WRITE |
| **Wrapper** | `writeOrderStatusDual()` |

```typescript
// Site Admin approval - move to fulfilment
order.status = 'Awaiting fulfilment'
console.log(`[approveOrder] Site Admin approved. No Company Admin approval required. Moving to fulfilment.`)
```

**Why wrapping required:** Direct status write during approval flow. Critical path for all orders.

---

#### ORD-C2: Order Approval - Company Admin Flow
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~9800-9803 |
| **Action** | WRITE |
| **Wrapper** | `writeOrderStatusDual()` |

```typescript
order.company_admin_approved_by = employee.id || employee.employeeId
order.company_admin_approved_at = new Date()
order.status = 'Awaiting fulfilment'
```

**Why wrapping required:** Direct status write during company admin approval. Critical path for PR workflow.

---

#### ORD-C3: Order Status Update API
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~11034-11037 |
| **Action** | WRITE |
| **Wrapper** | `writeOrderStatusDual()` |

```typescript
const previousStatus = order.status
order.status = status
// OPTION 1 ENHANCEMENT: Automatically set all required shipment/delivery fields
```

**Why wrapping required:** Primary status update function called by API. Handles all status transitions.

---

#### ORD-C4: Bulk Approval - Child Orders Site Admin
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~10130-10133 |
| **Action** | WRITE (BATCH) |
| **Wrapper** | `writeOrderStatusDual()` |

```typescript
} else {
  // No company admin approval needed, move to fulfilment
  childOrder.status = 'Awaiting fulfilment'
  console.log(`[approveOrderByParentId] Site Admin approved order ${childOrder.id}...`)
```

**Why wrapping required:** Bulk status update for split orders. Must wrap each child order update.

---

#### ORD-C5: Bulk Approval - Child Orders Company Admin
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~10190-10193 |
| **Action** | WRITE (BATCH) |
| **Wrapper** | `writeOrderStatusDual()` |

```typescript
childOrder.company_admin_approved_by = employee.id || employee.employeeId
childOrder.company_admin_approved_at = new Date()
childOrder.status = 'Awaiting fulfilment'
```

**Why wrapping required:** Bulk status update during company admin approval of split orders.

---

#### ORD-C6: Legacy Approval Flow
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~10244-10248 |
| **Action** | WRITE (BATCH) |
| **Wrapper** | `writeOrderStatusDual()` |

```typescript
const previousStatus = childOrder.status
if (childOrder.status === 'Awaiting approval' || childOrder.status === 'Awaiting fulfilment') {
  childOrder.status = 'Awaiting fulfilment'
  await childOrder.save()
```

**Why wrapping required:** Legacy workflow path for orders without PR workflow.

---

#### ORD-C7: PR Shipment Status - Auto Status Update
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~13876-13879 |
| **Action** | WRITE (CASCADE) |
| **Wrapper** | `writeOrderStatusDual()` |

```typescript
// AUTO-UPDATE: Update Order status to Dispatched when items are shipped
pr.status = 'Dispatched'

await pr.save()
```

**Why wrapping required:** Cascading status update when shipment is created. Triggers PR status change.

---

#### ORD-C8: PR Delivery Status - Auto Status Update
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~14537-14542 |
| **Action** | WRITE (CASCADE) |
| **Wrapper** | `writeOrderStatusDual()` |

```typescript
// AUTO-UPDATE: Update Order status based on delivery status
if (deliveryStatus === 'DELIVERED') {
  pr.status = 'Delivered'
} else if (deliveryStatus === 'PARTIALLY_DELIVERED') {
  pr.status = 'Dispatched' // Keep as Dispatched if partially delivered
}
```

**Why wrapping required:** Cascading status update when delivery is confirmed. Critical delivery flow.

---

#### ORD-C9: Cascading PR Status Update
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~14749-14752 |
| **Action** | WRITE (CASCADE) |
| **Wrapper** | `writeOrderStatusDual()` |

```typescript
if (prDoc.status !== newPRStatus) {
  prDoc.status = newPRStatus
  prUpdated = true
}
```

**Why wrapping required:** Cascading status recalculation based on item-level delivery.

---

#### ORD-C10: Replacement Order Auto-Approval
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~21597-21599 |
| **Action** | WRITE |
| **Wrapper** | `writeOrderStatusDual()` |

```typescript
// Auto-approve replacement orders since return request is already approved
if (order.status === 'Awaiting approval' || order.status === 'Awaiting fulfilment') {
  order.status = 'Awaiting fulfilment'
}
```

**Why wrapping required:** Auto-approval path for replacement orders.

---

#### ORD-C11: Grouped Approval - Multiple Child Orders
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~10481, 10503, 10520, 10652, 10673, 10689 |
| **Action** | WRITE (BATCH) |
| **Wrapper** | `writeOrderStatusDual()` |

```typescript
// Multiple similar patterns for grouped approval flows
childOrder.status = 'Awaiting fulfilment'
```

**Why wrapping required:** Grouped PR approval flows update multiple order statuses.

---

#### ORD-C12: Direct PR/Order Status Update
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~10842-10843, 10860-10861, 10873-10874 |
| **Action** | WRITE |
| **Wrapper** | `writeOrderStatusDual()` |

```typescript
order.status = 'Awaiting fulfilment'
```

**Why wrapping required:** Direct status updates in various approval paths.

---

### SECTION B — HIGH RISK (🟠)

#### ORD-H1: API Route - Order Status Update
| Attribute | Value |
|-----------|-------|
| **File** | `app/api/orders/route.ts` |
| **Lines** | ~214 |
| **Action** | API CALL |
| **Wrapper** | Via `updateOrderStatus()` |

```typescript
const order = await updateOrderStatus(orderId, status, vendorId)
```

**Why wrapping required:** Entry point for vendor status updates. Calls wrapped function.

---

#### ORD-H2: API Route - Order Approval
| Attribute | Value |
|-----------|-------|
| **File** | `app/api/orders/route.ts` |
| **Lines** | ~194 |
| **Action** | API CALL |
| **Wrapper** | Via `approveOrder()` |

```typescript
const order = await approveOrder(orderId, adminEmail, prNumber, prDate)
```

**Why wrapping required:** Entry point for order approvals. Calls wrapped function.

---

#### ORD-H3: Shipment Execution - Delivery Update
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/shipment-execution.ts` |
| **Lines** | ~793-804 |
| **Action** | WRITE (CASCADE) |
| **Wrapper** | `writeOrderStatusDual()` |

```typescript
if (statusResult.status === 'DELIVERED') {
  await Order.updateOne(
    { pr_number: shipment.prNumber },
    { $set: { deliveryStatus: 'DELIVERED', deliveredDate: ... } }
  )
}
```

**Why wrapping required:** Webhook-triggered cascading update from shipment provider.

---

#### ORD-H4: Shipment Execution - Dispatch Update
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/shipment-execution.ts` |
| **Lines** | ~592-596 |
| **Action** | WRITE |
| **Wrapper** | `writeOrderStatusDual()` |

```typescript
dispatchStatus: 'SHIPPED',
dispatchedDate: new Date(),
```

**Why wrapping required:** Updates order dispatch status during API shipment creation.

---

### SECTION C — MEDIUM RISK (🟡)

#### ORD-M1: Status Query for Vendor
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~7171 |
| **Action** | READ |
| **Wrapper** | N/A (read-only) |

```typescript
.select('... status ... deliveryStatus dispatchStatus ...')
```

**Why noted:** Read query that will need to switch to unified fields in Phase 3.

---

#### ORD-M2: Status Aggregation
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~7742-7748 |
| **Action** | READ (AGGREGATE) |
| **Wrapper** | N/A (read-only) |

```typescript
'Awaiting approval': splitOrders.filter((o: any) => o.status === 'Awaiting approval').length,
'Awaiting fulfilment': splitOrders.filter((o: any) => o.status === 'Awaiting fulfilment').length,
```

**Why noted:** Status aggregation for display. Will need to switch to unified fields.

---

#### ORD-M3: Status Validation Check
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~9619 |
| **Action** | READ (VALIDATION) |
| **Wrapper** | N/A (validation) |

```typescript
if (order.status === 'Awaiting approval' || !order.status) {
```

**Why noted:** Status validation that reads legacy field.

---

### SECTION D — LOW RISK (🟢)

#### ORD-L1: Pending Approval Filter
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~11817 |
| **Action** | READ (FILTER) |
| **Wrapper** | N/A |

```typescript
queryFilter.status = 'Awaiting approval'
```

**Why noted:** Query filter that reads legacy field.

---

#### ORD-L2: Status Display in Logs
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~9563, 9892 |
| **Action** | READ (LOG) |
| **Wrapper** | N/A |

```typescript
console.log(`[approveOrder] ✅ Order found: ${order.id}, Status: ${order.status}...`)
```

**Why noted:** Logging that references status field.

---

## 2. PR STATUS INJECTION POINTS

### SECTION A — CRITICAL (🔴)

#### PR-C1: Site Admin Approval
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~9773-9774 |
| **Action** | WRITE |
| **Wrapper** | `writePRStatusDual()` |

```typescript
order.pr_status = 'SITE_ADMIN_APPROVED'
// CRITICAL FIX: Use string ID, not ObjectId
order.site_admin_approved_by = employee.id || employee.employeeId
```

**Why wrapping required:** Direct pr_status write during site admin approval.

---

#### PR-C2: Move to Company Admin Approval
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~9781 |
| **Action** | WRITE |
| **Wrapper** | `writePRStatusDual()` |

```typescript
order.pr_status = 'PENDING_COMPANY_ADMIN_APPROVAL'
```

**Why wrapping required:** Status transition to company admin approval queue.

---

#### PR-C3: Company Admin Approval
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~9798 |
| **Action** | WRITE |
| **Wrapper** | `writePRStatusDual()` |

```typescript
order.pr_status = 'COMPANY_ADMIN_APPROVED'
```

**Why wrapping required:** Final approval status for PR workflow.

---

#### PR-C4: Bulk Site Admin Approval
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~10120-10128 |
| **Action** | WRITE (BATCH) |
| **Wrapper** | `writePRStatusDual()` |

```typescript
childOrder.pr_status = 'SITE_ADMIN_APPROVED'
...
if (company.require_company_admin_po_approval === true) {
  childOrder.pr_status = 'PENDING_COMPANY_ADMIN_APPROVAL'
}
```

**Why wrapping required:** Bulk PR status update for split orders.

---

#### PR-C5: Bulk Company Admin Approval
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~10188 |
| **Action** | WRITE (BATCH) |
| **Wrapper** | `writePRStatusDual()` |

```typescript
childOrder.pr_status = 'COMPANY_ADMIN_APPROVED'
```

**Why wrapping required:** Bulk PR status update during company admin approval.

---

#### PR-C6: Grouped Approval - Site Admin
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~10473, 10479 |
| **Action** | WRITE (BATCH) |
| **Wrapper** | `writePRStatusDual()` |

```typescript
childOrder.pr_status = 'SITE_ADMIN_APPROVED'
...
childOrder.pr_status = 'PENDING_COMPANY_ADMIN_APPROVAL'
```

**Why wrapping required:** Grouped PR approval flow.

---

#### PR-C7: Grouped Approval - Company Admin
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~10499 |
| **Action** | WRITE (BATCH) |
| **Wrapper** | `writePRStatusDual()` |

```typescript
childOrder.pr_status = 'COMPANY_ADMIN_APPROVED'
```

**Why wrapping required:** Grouped PR approval flow.

---

#### PR-C8: PR Status to PO_CREATED (via PO creation)
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~13521-13524 |
| **Action** | WRITE (CASCADE) |
| **Wrapper** | `writePRStatusDual()` |

```typescript
// When PO is created, PRs should be marked as PO_CREATED
// (Handled during linkPRToPO or similar flow)
```

**Why wrapping required:** PR status changes when linked to PO.

---

#### PR-C9: PR Status to FULLY_DELIVERED
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~14360-14364 |
| **Action** | WRITE (CASCADE) |
| **Wrapper** | `writePRStatusDual()` |

```typescript
$set: { 
  dispatchStatus: 'SHIPPED',
  deliveryStatus: 'DELIVERED',
  pr_status: 'FULLY_DELIVERED',
  status: 'Delivered',
```

**Why wrapping required:** Cascading update when all items delivered.

---

#### PR-C10-15: Additional PR Status Writes
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~10640-10674, 10840 |
| **Action** | WRITE |
| **Wrapper** | `writePRStatusDual()` |

Multiple similar patterns for pr_status updates across different approval flows.

---

### SECTION B — HIGH RISK (🟠)

#### PR-H1: API - PR Shipment Status Update
| Attribute | Value |
|-----------|-------|
| **File** | `app/api/prs/shipment/route.ts` |
| **Lines** | ~779, 829 |
| **Action** | API CALL |
| **Wrapper** | Via `updatePRShipmentStatus()` |

```typescript
const updatedPR = await updatePRShipmentStatus(prId, {...})
```

**Why wrapping required:** Entry point for shipment status updates.

---

#### PR-H2: API - PR Delivery Status Update
| Attribute | Value |
|-----------|-------|
| **File** | `app/api/prs/shipment/route.ts` |
| **Lines** | ~975 |
| **Action** | API CALL |
| **Wrapper** | Via `updatePRDeliveryStatus()` |

```typescript
const updatedPR = await updatePRDeliveryStatus(prId, {...})
```

**Why wrapping required:** Entry point for delivery confirmations.

---

#### PR-H3: Manual Shipment API
| Attribute | Value |
|-----------|-------|
| **File** | `app/api/prs/manual-shipment/route.ts` |
| **Lines** | ~170 |
| **Action** | API CALL |
| **Wrapper** | Via `updatePRShipmentStatus()` |

```typescript
await updatePRShipmentStatus(prData.prId, {...})
```

**Why wrapping required:** Manual shipment creation triggers PR status update.

---

#### PR-H4: dispatchStatus Field Write
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~11045, 13871 |
| **Action** | WRITE |
| **Wrapper** | `writePRStatusDual()` |

```typescript
order.dispatchStatus = 'SHIPPED'
```

**Why wrapping required:** Secondary status field that needs dual-write.

---

#### PR-H5: deliveryStatus Field Write
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~11082, 13874, 14534 |
| **Action** | WRITE |
| **Wrapper** | `writePRStatusDual()` |

```typescript
pr.deliveryStatus = deliveryStatus
```

**Why wrapping required:** Secondary status field that needs dual-write.

---

### SECTION C — MEDIUM RISK (🟡)

#### PR-M1-4: PR Status Query Filters
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~7151-7164, 9611-9612, 9970-9976 |
| **Action** | READ (FILTER) |
| **Wrapper** | N/A (read-only) |

Various query filters on pr_status field that will need to switch to unified fields in Phase 3.

---

### SECTION D — LOW RISK (🟢)

#### PR-L1-2: PR Status Logging
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~9563, 9629, 10138 |
| **Action** | READ (LOG) |
| **Wrapper** | N/A |

Logging statements that reference pr_status.

---

## 3. PO STATUS INJECTION POINTS

### SECTION A — CRITICAL (🔴)

#### PO-C1: PO Creation - Initial Status
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~13523 |
| **Action** | WRITE (CREATE) |
| **Wrapper** | `writePOStatusDual()` |

```typescript
po_status: 'SENT_TO_VENDOR', // Immediately send to vendor for fulfilment
```

**Why wrapping required:** Initial PO status on creation.

---

#### PO-C2: PO Status Update
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~14204-14210 |
| **Action** | WRITE |
| **Wrapper** | `writePOStatusDual()` |

```typescript
if (currentPO.po_status !== newPOStatus) {
  await PurchaseOrder.updateOne(
    { id: poId },
    { $set: { po_status: newPOStatus } }
  )
```

**Why wrapping required:** Direct PO status update function.

---

#### PO-C3: PO Status from PR Delivery (Cascade)
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~14193-14200 |
| **Action** | WRITE (CASCADE) |
| **Wrapper** | `writePOStatusDual()` |

```typescript
// If PO was already SENT_TO_VENDOR or later, keep it (don't downgrade)
else if (['SENT_TO_VENDOR', 'ACKNOWLEDGED', 'IN_FULFILMENT', 'COMPLETED'].includes(currentPO.po_status)) {
  newPOStatus = currentPO.po_status
}
```

**Why wrapping required:** PO status recalculation from PR delivery status.

---

#### PO-C4: PO Status to COMPLETED (via delivery)
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~14214-14215 |
| **Action** | WRITE (CASCADE) |
| **Wrapper** | `writePOStatusDual()` |

```typescript
const finalPOStatus = newPOStatus || currentPO.po_status
if (finalPOStatus === 'COMPLETED') {
```

**Why wrapping required:** Final PO status when all PRs delivered.

---

### SECTION B — HIGH RISK (🟠)

#### PO-H1: API - PO Query
| Attribute | Value |
|-----------|-------|
| **File** | `app/api/purchase-orders/route.ts` |
| **Lines** | ~179 |
| **Action** | READ (FILTER) |
| **Wrapper** | N/A |

```typescript
query.po_status = poStatus
```

**Why noted:** Query filter on legacy field.

---

#### PO-H2: PO Status Validation
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~14195-14196 |
| **Action** | READ (VALIDATION) |
| **Wrapper** | N/A |

```typescript
if (['SENT_TO_VENDOR', 'ACKNOWLEDGED', 'IN_FULFILMENT', 'COMPLETED'].includes(currentPO.po_status))
```

**Why noted:** Validation logic on legacy field.

---

### SECTION C — MEDIUM RISK (🟡)

#### PO-M1-2: PO Status Query/Display
Various read operations on po_status for display and filtering.

---

### SECTION D — LOW RISK (🟢)

#### PO-L1: PO Status Logging
Logging statements that reference po_status.

---

## 4. SHIPMENT STATUS INJECTION POINTS

### SECTION A — CRITICAL (🔴)

#### SHIP-C1: Manual Shipment Creation
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~14025 |
| **Action** | WRITE (CREATE) |
| **Wrapper** | `writeShipmentStatusDual()` |

```typescript
shipmentStatus: 'CREATED', // Default status for manual shipments
```

**Why wrapping required:** Initial shipment status on creation.

---

#### SHIP-C2: API Shipment Creation
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/shipment-execution.ts` |
| **Lines** | ~562 |
| **Action** | WRITE (CREATE) |
| **Wrapper** | `writeShipmentStatusDual()` |

```typescript
shipmentStatus: 'CREATED',
```

**Why wrapping required:** Initial shipment status for API shipments.

---

#### SHIP-C3: Manual Shipment Status Update (to IN_TRANSIT)
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~14305-14308 |
| **Action** | WRITE |
| **Wrapper** | `writeShipmentStatusDual()` |

```typescript
await Shipment.updateOne(
  { shipmentId: shipmentId },
  { $set: { shipmentStatus: 'IN_TRANSIT' } }
)
```

**Why wrapping required:** Shipment status transition when vendor marks as shipped.

---

#### SHIP-C4: Shipment Status to DELIVERED (Bulk)
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~14247-14249 |
| **Action** | WRITE (BATCH) |
| **Wrapper** | `writeShipmentStatusDual()` |

```typescript
const shipmentUpdateResult = await Shipment.updateMany(
  { prNumber: { $in: prNumbers }, shipmentStatus: { $ne: 'DELIVERED' } },
  { $set: { shipmentStatus: 'DELIVERED' } }
)
```

**Why wrapping required:** Bulk update when PO marked as COMPLETED.

---

#### SHIP-C5: Shipment Status to DELIVERED (Single)
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~14576-14579 |
| **Action** | WRITE (BATCH) |
| **Wrapper** | `writeShipmentStatusDual()` |

```typescript
await Shipment.updateMany(
  { shipmentId: { $in: shipmentIds } },
  { $set: { shipmentStatus: 'DELIVERED' } }
)
```

**Why wrapping required:** Update shipments when PR delivery confirmed.

---

#### SHIP-C6: Provider Status Sync
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/shipment-execution.ts` |
| **Lines** | ~766-768 |
| **Action** | WRITE |
| **Wrapper** | `writeShipmentStatusDual()` |

```typescript
const updates: any = {
  shipmentStatus: statusResult.status,
  lastProviderSyncAt: new Date(),
```

**Why wrapping required:** Shipment status update from provider API sync.

---

### SECTION B — HIGH RISK (🟠)

#### SHIP-H1: API Route - Status Update
| Attribute | Value |
|-----------|-------|
| **File** | `app/api/shipments/[shipmentId]/status/route.ts` |
| **Lines** | ~60 |
| **Action** | API CALL |
| **Wrapper** | Via `updateManualShipmentStatus()` |

```typescript
const result = await updateManualShipmentStatus(shipmentId, vendorId)
```

**Why wrapping required:** API entry point for manual status updates.

---

#### SHIP-H2: Pending Shipments Query
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/shipment-execution.ts` |
| **Lines** | ~843-845 |
| **Action** | READ (FILTER) |
| **Wrapper** | N/A |

```typescript
shipmentStatus: { $in: ['CREATED', 'IN_TRANSIT'] },
```

**Why noted:** Query filter that will need unified field.

---

#### SHIP-H3: Final State Check
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/shipment-execution.ts` |
| **Lines** | ~726-727 |
| **Action** | READ (VALIDATION) |
| **Wrapper** | N/A |

```typescript
if (shipment.shipmentStatus === 'DELIVERED' || shipment.shipmentStatus === 'FAILED') {
  return { success: true, updated: false } // Already in final state
}
```

**Why noted:** Terminal state check on legacy field.

---

### SECTION C — MEDIUM RISK (🟡)

#### SHIP-M1-2: Shipment Status Queries
Various read operations on shipmentStatus for filtering and display.

---

### SECTION D — LOW RISK (🟢)

#### SHIP-L1: Shipment Status Logging
Logging statements that reference shipmentStatus.

---

## 5. GRN STATUS INJECTION POINTS

### SECTION A — CRITICAL (🔴)

#### GRN-C1: GRN Creation - Initial Status
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~22041 |
| **Action** | WRITE (CREATE) |
| **Wrapper** | `writeGRNStatusDual()` |

```typescript
grnStatus: 'RAISED', // Simple approval workflow: start as RAISED
```

**Why wrapping required:** Initial GRN status on creation.

---

#### GRN-C2: GRN Acknowledgment (Legacy)
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~22276-22278 |
| **Action** | WRITE |
| **Wrapper** | `writeGRNStatusDual()` |

```typescript
grn.status = 'ACKNOWLEDGED'
grn.grnAcknowledgedByCompany = true
grn.grnAcknowledgedDate = new Date()
```

**Why wrapping required:** Legacy GRN acknowledgment flow.

---

#### GRN-C3: GRN Approval (Simple Workflow)
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~22339-22341 |
| **Action** | WRITE |
| **Wrapper** | `writeGRNStatusDual()` |

```typescript
grn.grnStatus = 'APPROVED'
grn.approvedBy = approvedBy.trim()
grn.approvedAt = new Date()
```

**Why wrapping required:** Simple GRN approval flow.

---

#### GRN-C4: GRN Retrofit (Old to New)
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~22425-22427 |
| **Action** | WRITE (RETROFIT) |
| **Wrapper** | `writeGRNStatusDual()` |

```typescript
if (grn.grnStatus !== 'APPROVED' && (grn.grnAcknowledgedByCompany === true || grn.status === 'ACKNOWLEDGED')) {
  grn.grnStatus = 'APPROVED'
```

**Why wrapping required:** Retrofit logic for old GRNs missing new status.

---

### SECTION B — HIGH RISK (🟠)

#### GRN-H1: API Route - GRN Approval
| Attribute | Value |
|-----------|-------|
| **File** | `app/api/grns/approve/route.ts` |
| **Lines** | ~45 |
| **Action** | API CALL |
| **Wrapper** | Via `approveGRN()` |

```typescript
const approvedGRN = await approveGRN(grnId, approvedBy)
```

**Why wrapping required:** API entry point for GRN approval.

---

#### GRN-H2: Vendor GRN API
| Attribute | Value |
|-----------|-------|
| **File** | `app/api/vendor/grns/route.ts` |
| **Lines** | ~143 |
| **Action** | API CALL |
| **Wrapper** | Via `createGRNByVendor()` |

```typescript
const grn = await createGRNByVendor(...)
```

**Why wrapping required:** Vendor GRN creation entry point.

---

### SECTION C — MEDIUM RISK (🟡)

#### GRN-M1-2: GRN Status Query Filters
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~15279, 22208-22211 |
| **Action** | READ (FILTER) |
| **Wrapper** | N/A |

```typescript
grnStatus: 'APPROVED'
...
{ grnStatus: 'RAISED' },
{ grnStatus: { $exists: false } },
```

**Why noted:** Query filters on grnStatus field.

---

### SECTION D — LOW RISK (🟢)

#### GRN-L1: GRN Status Logging
Logging statements that reference grnStatus.

---

## 6. INVOICE STATUS INJECTION POINTS

### SECTION A — CRITICAL (🔴)

#### INV-C1: Invoice Creation - Initial Status
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~22546 |
| **Action** | WRITE (CREATE) |
| **Wrapper** | `writeInvoiceStatusDual()` |

```typescript
invoiceStatus: 'RAISED',
```

**Why wrapping required:** Initial invoice status on creation.

---

#### INV-C2: Invoice Approval
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~22660-22662 |
| **Action** | WRITE |
| **Wrapper** | `writeInvoiceStatusDual()` |

```typescript
invoice.invoiceStatus = 'APPROVED'
invoice.approvedBy = approvedBy.trim()
invoice.approvedAt = new Date()
```

**Why wrapping required:** Invoice approval status update.

---

#### INV-C3: Invoice Validation
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~22655-22656 |
| **Action** | READ (VALIDATION) |
| **Wrapper** | N/A |

```typescript
if (invoice.invoiceStatus !== 'RAISED') {
  throw new Error(`Invoice ${invoiceId} is not in RAISED status...`)
}
```

**Why noted:** Validation that reads legacy field.

---

### SECTION B — HIGH RISK (🟠)

#### INV-H1: API Route - Invoice Approval
| Attribute | Value |
|-----------|-------|
| **File** | `app/api/company/invoices/approve/route.ts` |
| **Lines** | ~45 |
| **Action** | API CALL |
| **Wrapper** | Via `approveInvoice()` |

```typescript
const approvedInvoice = await approveInvoice(invoiceId, approvedBy)
```

**Why wrapping required:** API entry point for invoice approval.

---

### SECTION C — MEDIUM RISK (🟡)

#### INV-M1: Invoice Status Query
| Attribute | Value |
|-----------|-------|
| **File** | `lib/db/data-access.ts` |
| **Lines** | ~15245, 15296 |
| **Action** | READ (FILTER) |
| **Wrapper** | N/A |

```typescript
invoiceStatus: 'RAISED'
...
invoiceStatus: 'APPROVED'
```

**Why noted:** Query filters on invoiceStatus.

---

### SECTION D — LOW RISK (🟢)

#### INV-L1: Invoice Status Logging
Logging statements that reference invoiceStatus.

---

## SECTION E — RACE CONDITION NOTES

### RC-1: Concurrent Order Approvals

| Attribute | Value |
|-----------|-------|
| **Location** | `approveOrderByParentId()`, `approveGroupedPRByParentIds()` |
| **Description** | Multiple admins could approve the same split order simultaneously |
| **Root Cause** | No locking mechanism when approving child orders |
| **Risk Level** | MEDIUM |
| **Recommendation** | Add optimistic locking via version field or use MongoDB transactions |

---

### RC-2: Shipment Status vs PR Status

| Attribute | Value |
|-----------|-------|
| **Location** | `updateManualShipmentStatus()`, `syncShipmentStatus()` |
| **Description** | Shipment status change triggers PR status cascade, but external webhook may update simultaneously |
| **Root Cause** | No coordination between manual updates and webhook updates |
| **Risk Level** | HIGH |
| **Recommendation** | Add shipment status lock or use atomic PR update with version check |

---

### RC-3: PR Status Conflicts

| Attribute | Value |
|-----------|-------|
| **Location** | Order model: `status` vs `pr_status` vs `dispatchStatus` vs `deliveryStatus` |
| **Description** | Four status fields can become inconsistent |
| **Root Cause** | Multiple fields represent overlapping concepts |
| **Risk Level** | HIGH |
| **Recommendation** | Unified status field (in progress). Use dual-write to sync all fields atomically. |

---

### RC-4: PO Status Cascade Timing

| Attribute | Value |
|-----------|-------|
| **Location** | `updateSinglePOStatus()`, `updatePRAndPOStatusesFromDelivery()` |
| **Description** | PO status depends on aggregating all PR statuses; if PRs update concurrently, PO may have stale data |
| **Root Cause** | PO status calculated from snapshot of PR statuses |
| **Risk Level** | MEDIUM |
| **Recommendation** | Use transaction for PO status recalculation or add eventual consistency check |

---

### RC-5: GRN/Invoice Creation Race

| Attribute | Value |
|-----------|-------|
| **Location** | `createGRNByVendor()`, `createInvoiceByVendor()` |
| **Description** | Unique constraint (one GRN per PO, one Invoice per GRN) could fail under concurrent requests |
| **Root Cause** | Check-then-insert pattern without locking |
| **Risk Level** | LOW |
| **Recommendation** | MongoDB unique index handles this; ensure proper error handling for duplicate key errors |

---

### RC-6: Webhook Out-of-Order Delivery

| Attribute | Value |
|-----------|-------|
| **Location** | `syncShipmentStatus()`, external webhook handlers |
| **Description** | Courier webhooks may arrive out of order (DELIVERED before IN_TRANSIT) |
| **Root Cause** | External system behavior beyond our control |
| **Risk Level** | MEDIUM |
| **Recommendation** | Add status transition validation to reject backwards transitions from webhooks |

---

## Summary Statistics

### Injection Points by Category

| Entity | Direct Write | Cascade | Batch | API Entry | Read-Only |
|--------|--------------|---------|-------|-----------|-----------|
| Order | 10 | 2 | 4 | 2 | 5 |
| PR | 8 | 2 | 6 | 4 | 6 |
| PO | 2 | 2 | 0 | 1 | 4 |
| Shipment | 3 | 1 | 2 | 1 | 5 |
| GRN | 3 | 1 | 0 | 2 | 3 |
| Invoice | 2 | 0 | 0 | 1 | 3 |
| **Total** | **28** | **8** | **12** | **11** | **26** |

### Files Requiring Modification

| File | Injection Points | Priority |
|------|------------------|----------|
| `lib/db/data-access.ts` | 68 | 🔴 CRITICAL |
| `lib/db/shipment-execution.ts` | 6 | 🔴 CRITICAL |
| `app/api/orders/route.ts` | 2 | 🟠 HIGH |
| `app/api/prs/shipment/route.ts` | 3 | 🟠 HIGH |
| `app/api/prs/manual-shipment/route.ts` | 1 | 🟠 HIGH |
| `app/api/shipments/[shipmentId]/status/route.ts` | 1 | 🟠 HIGH |
| `app/api/grns/approve/route.ts` | 1 | 🟠 HIGH |
| `app/api/company/invoices/approve/route.ts` | 1 | 🟠 HIGH |
| `app/api/vendor/grns/route.ts` | 1 | 🟠 HIGH |
| `app/api/vendor/invoices/route.ts` | 1 | 🟠 HIGH |

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-01-15 | Migration Team | Initial dry-run scan |

---

**END OF DRY-RUN INJECTION REPORT**

*This is a diagnostic report only. No code modifications were made. All findings are based on static code analysis.*
