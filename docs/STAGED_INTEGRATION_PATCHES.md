# STAGED DUAL-WRITE INTEGRATION PATCHES

## Feature Flag Protected — Awaiting Approval

**Document Version:** 1.0.0  
**Created:** 2026-01-15  
**Status:** STAGED — NOT APPLIED  
**Feature Flag:** `DUAL_WRITE_ENABLED`

---

## ⚠️ CRITICAL NOTICE

These patches are **STAGED ONLY**.

- ❌ NO patches have been applied
- ❌ NO code has been modified
- ❌ NO imports have been added
- ❌ NO commits have been made

**EXPLICIT APPROVAL REQUIRED** before applying any patch.

---

## Feature Flag Configuration

### Environment Variable

```bash
# .env.local (or .env)
DUAL_WRITE_ENABLED=false  # Set to "true" to enable dual-write
```

### Usage Pattern

All patches follow this pattern:

```typescript
if (process.env.DUAL_WRITE_ENABLED === "true") {
    // NEW: Dual-write to both legacy and unified fields
    await writeSomeStatusDual({ ... });
} else {
    // LEGACY: Original behavior (unchanged)
    entity.status = newStatus;
}
```

---

## Table of Contents

1. [🔴 CRITICAL PATCHES](#-critical-patches)
2. [🟠 HIGH-RISK PATCHES](#-high-risk-patches)
3. [🟡 MEDIUM PATCHES](#-medium-patches)
4. [🟢 LOW PATCHES](#-low-patches)
5. [📦 IMPORT PATCHES](#-import-patches)

---

# 🔴 CRITICAL PATCHES

## PATCH-001: Import Statements for data-access.ts

```diff
================================================================================
FILE: lib/db/data-access.ts
LOCATION: After line ~50 (after existing imports)
RISK: 🔴 CRITICAL (required for all other patches)
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -50,6 +50,25 @@ import VendorIndent from '@/lib/models/VendorIndent'
 import ProductVendorLink from '@/lib/models/ProductVendorLink'
 import VendorInventory from '@/lib/models/VendorInventory'
 
+// =============================================================================
+// DUAL-WRITE INTEGRATION (Feature Flag: DUAL_WRITE_ENABLED)
+// =============================================================================
+import {
+  writeOrderStatusDual,
+  writePRStatusDual,
+  writePOStatusDual,
+  writeShipmentStatusDual,
+  writeGRNStatusDual,
+  writeInvoiceStatusDual,
+  mapLegacyToUnifiedOrderStatus,
+  mapLegacyToUnifiedPRStatus,
+  mapLegacyToUnifiedPOStatus,
+  mapLegacyToUnifiedShipmentStatus,
+  mapLegacyToUnifiedGRNStatus,
+  mapLegacyToUnifiedInvoiceStatus,
+} from '@/migrations/dualwrite/status-dualwrite-wrapper'
+
 // Connection
 import connectDB from './mongodb'
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-002: Order Status Update (updateOrderStatus function)

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 11034-11040
FUNCTION: updateOrderStatus()
WRAPPER: writeOrderStatusDual()
RISK: 🔴 CRITICAL
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -11034,7 +11034,26 @@ export async function updateOrderStatus(
   }
   
   const previousStatus = order.status
-  order.status = status
+  
+  // DUAL-WRITE: Order status update
+  if (process.env.DUAL_WRITE_ENABLED === "true") {
+    await writeOrderStatusDual({
+      orderId: order.id,
+      legacyField: 'status',
+      oldValue: previousStatus,
+      newValue: status,
+      updatedBy: vendorId || 'system',
+      source: 'updateOrderStatus',
+      metadata: { vendorId, timestamp: new Date().toISOString() }
+    });
+    // Note: writeOrderStatusDual updates both legacy and unified fields
+    // The order object needs to be refreshed or manually updated
+    order.status = status;
+  } else {
+    // LEGACY: Original behavior
+    order.status = status;
+  }
   
   // OPTION 1 ENHANCEMENT: Automatically set all required shipment/delivery fields
   if (status === 'Dispatched') {
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-003: Dispatch Status Update (within updateOrderStatus)

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 11043-11048
FUNCTION: updateOrderStatus() - Dispatch handling
WRAPPER: writeOrderStatusDual()
RISK: 🔴 CRITICAL
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -11043,7 +11043,23 @@ export async function updateOrderStatus(
   if (status === 'Dispatched') {
     // Update dispatch fields
     
-    // Set dispatch status
-    order.dispatchStatus = 'SHIPPED'
+    // DUAL-WRITE: Dispatch status update
+    if (process.env.DUAL_WRITE_ENABLED === "true") {
+      await writeOrderStatusDual({
+        orderId: order.id,
+        legacyField: 'dispatchStatus',
+        oldValue: order.dispatchStatus,
+        newValue: 'SHIPPED',
+        updatedBy: vendorId || 'system',
+        source: 'updateOrderStatus',
+        metadata: { parentStatus: status, cascade: true }
+      });
+      order.dispatchStatus = 'SHIPPED';
+    } else {
+      // LEGACY: Original behavior
+      order.dispatchStatus = 'SHIPPED';
+    }
     
     // Set dispatched date if not already set
     if (!order.dispatchedDate) {
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-004: Delivery Status Update (within updateOrderStatus)

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 11078-11085
FUNCTION: updateOrderStatus() - Delivery handling
WRAPPER: writeOrderStatusDual()
RISK: 🔴 CRITICAL
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -11078,8 +11078,24 @@ export async function updateOrderStatus(
   // For Delivered status
   if (status === 'Delivered') {
     
-    // Set delivery status
-    order.deliveryStatus = 'DELIVERED'
+    // DUAL-WRITE: Delivery status update
+    if (process.env.DUAL_WRITE_ENABLED === "true") {
+      await writeOrderStatusDual({
+        orderId: order.id,
+        legacyField: 'deliveryStatus',
+        oldValue: order.deliveryStatus,
+        newValue: 'DELIVERED',
+        updatedBy: vendorId || 'system',
+        source: 'updateOrderStatus',
+        metadata: { parentStatus: status, cascade: true }
+      });
+      order.deliveryStatus = 'DELIVERED';
+    } else {
+      // LEGACY: Original behavior
+      order.deliveryStatus = 'DELIVERED';
+    }
     
     // Set delivered date if not already set
     if (!order.deliveredDate) {
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-005: Site Admin Approval - PR Status

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 9771-9776
FUNCTION: approveOrder() - Site Admin
WRAPPER: writePRStatusDual()
RISK: 🔴 CRITICAL
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -9771,7 +9771,23 @@ export async function approveOrder(
     console.log(`[approveOrder] Site Admin provided PR number: ${prNumber}`)
     console.log(`[approveOrder] Site Admin provided PR date: ${prDate.toISOString()}`)
     
-    order.pr_status = 'SITE_ADMIN_APPROVED'
+    // DUAL-WRITE: PR status update for Site Admin approval
+    if (process.env.DUAL_WRITE_ENABLED === "true") {
+      await writePRStatusDual({
+        orderId: order.id,
+        legacyField: 'pr_status',
+        oldValue: order.pr_status,
+        newValue: 'SITE_ADMIN_APPROVED',
+        updatedBy: employee.id || employee.employeeId,
+        source: 'approveOrder',
+        metadata: { approvalType: 'site_admin', prNumber: order.pr_number }
+      });
+      order.pr_status = 'SITE_ADMIN_APPROVED';
+    } else {
+      // LEGACY: Original behavior
+      order.pr_status = 'SITE_ADMIN_APPROVED';
+    }
     // CRITICAL FIX: Use string ID, not ObjectId
     order.site_admin_approved_by = employee.id || employee.employeeId
     order.site_admin_approved_at = new Date()
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-006: Site Admin Approval - Move to Company Admin

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 9779-9786
FUNCTION: approveOrder() - Transition to Company Admin
WRAPPER: writePRStatusDual() + writeOrderStatusDual()
RISK: 🔴 CRITICAL
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -9779,10 +9779,42 @@ export async function approveOrder(
     if (company.require_company_admin_po_approval === true) {
       // Move to Company Admin approval
-      order.pr_status = 'PENDING_COMPANY_ADMIN_APPROVAL'
+      // DUAL-WRITE: Transition to Company Admin approval
+      if (process.env.DUAL_WRITE_ENABLED === "true") {
+        await writePRStatusDual({
+          orderId: order.id,
+          legacyField: 'pr_status',
+          oldValue: 'SITE_ADMIN_APPROVED',
+          newValue: 'PENDING_COMPANY_ADMIN_APPROVAL',
+          updatedBy: employee.id || employee.employeeId,
+          source: 'approveOrder',
+          metadata: { transition: 'site_to_company_admin' }
+        });
+        order.pr_status = 'PENDING_COMPANY_ADMIN_APPROVAL';
+      } else {
+        // LEGACY: Original behavior
+        order.pr_status = 'PENDING_COMPANY_ADMIN_APPROVAL';
+      }
       console.log(`[approveOrder] Site Admin approved. Moving to Company Admin approval.`)
     } else {
       // No company admin approval needed, move to fulfilment
-      order.status = 'Awaiting fulfilment'
+      // DUAL-WRITE: Move directly to fulfilment
+      if (process.env.DUAL_WRITE_ENABLED === "true") {
+        await writeOrderStatusDual({
+          orderId: order.id,
+          legacyField: 'status',
+          oldValue: order.status,
+          newValue: 'Awaiting fulfilment',
+          updatedBy: employee.id || employee.employeeId,
+          source: 'approveOrder',
+          metadata: { approvalType: 'site_admin', noCompanyAdminRequired: true }
+        });
+        order.status = 'Awaiting fulfilment';
+      } else {
+        // LEGACY: Original behavior
+        order.status = 'Awaiting fulfilment';
+      }
       console.log(`[approveOrder] Site Admin approved. No Company Admin approval required. Moving to fulfilment.`)
     }
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-007: Company Admin Approval

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 9796-9804
FUNCTION: approveOrder() - Company Admin
WRAPPER: writePRStatusDual() + writeOrderStatusDual()
RISK: 🔴 CRITICAL
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -9796,11 +9796,43 @@ export async function approveOrder(
   } else if (isCompanyAdminApproval) {
     console.log(`[approveOrder] Company Admin approval for order ${orderId}`)
     
-    // Update PR status to COMPANY_ADMIN_APPROVED
-    order.pr_status = 'COMPANY_ADMIN_APPROVED'
+    // DUAL-WRITE: Company Admin approval - PR status
+    if (process.env.DUAL_WRITE_ENABLED === "true") {
+      await writePRStatusDual({
+        orderId: order.id,
+        legacyField: 'pr_status',
+        oldValue: order.pr_status,
+        newValue: 'COMPANY_ADMIN_APPROVED',
+        updatedBy: employee.id || employee.employeeId,
+        source: 'approveOrder',
+        metadata: { approvalType: 'company_admin' }
+      });
+      order.pr_status = 'COMPANY_ADMIN_APPROVED';
+    } else {
+      // LEGACY: Original behavior
+      order.pr_status = 'COMPANY_ADMIN_APPROVED';
+    }
     // CRITICAL FIX: Use string ID, not ObjectId
     order.company_admin_approved_by = employee.id || employee.employeeId
     order.company_admin_approved_at = new Date()
-    order.status = 'Awaiting fulfilment'
+    // DUAL-WRITE: Company Admin approval - Order status
+    if (process.env.DUAL_WRITE_ENABLED === "true") {
+      await writeOrderStatusDual({
+        orderId: order.id,
+        legacyField: 'status',
+        oldValue: order.status,
+        newValue: 'Awaiting fulfilment',
+        updatedBy: employee.id || employee.employeeId,
+        source: 'approveOrder',
+        metadata: { approvalType: 'company_admin' }
+      });
+      order.status = 'Awaiting fulfilment';
+    } else {
+      // LEGACY: Original behavior
+      order.status = 'Awaiting fulfilment';
+    }
     console.log(`[approveOrder] Company Admin approved. Moving to fulfilment.`)
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-008: PR Shipment Status Update - Dispatch

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 13869-13880
FUNCTION: updatePRShipmentStatus()
WRAPPER: writeOrderStatusDual()
RISK: 🔴 CRITICAL
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -13869,15 +13869,63 @@ export async function updatePRShipmentStatus(
   pr.modeOfTransport = shipmentData.modeOfTransport
   pr.trackingNumber = shipmentData.trackingNumber?.trim()
-  pr.dispatchStatus = 'SHIPPED'
+  
+  // DUAL-WRITE: Dispatch status
+  if (process.env.DUAL_WRITE_ENABLED === "true") {
+    await writeOrderStatusDual({
+      orderId: pr.id,
+      legacyField: 'dispatchStatus',
+      oldValue: pr.dispatchStatus,
+      newValue: 'SHIPPED',
+      updatedBy: 'system',
+      source: 'updatePRShipmentStatus',
+      metadata: { shipmentData: { shipperName: shipmentData.shipperName } }
+    });
+    pr.dispatchStatus = 'SHIPPED';
+  } else {
+    // LEGACY: Original behavior
+    pr.dispatchStatus = 'SHIPPED';
+  }
+  
   pr.dispatchedDate = shipmentData.dispatchedDate
   pr.expectedDeliveryDate = shipmentData.expectedDeliveryDate
-  pr.deliveryStatus = deliveryStatus
+  
+  // DUAL-WRITE: Delivery status
+  if (process.env.DUAL_WRITE_ENABLED === "true") {
+    await writeOrderStatusDual({
+      orderId: pr.id,
+      legacyField: 'deliveryStatus',
+      oldValue: pr.deliveryStatus,
+      newValue: deliveryStatus,
+      updatedBy: 'system',
+      source: 'updatePRShipmentStatus',
+      metadata: { calculated: true }
+    });
+    pr.deliveryStatus = deliveryStatus;
+  } else {
+    // LEGACY: Original behavior
+    pr.deliveryStatus = deliveryStatus;
+  }
+  
   pr.items = updatedItems as any
   
   // AUTO-UPDATE: Update Order status to Dispatched when items are shipped
-  pr.status = 'Dispatched'
+  // DUAL-WRITE: Order status to Dispatched
+  if (process.env.DUAL_WRITE_ENABLED === "true") {
+    await writeOrderStatusDual({
+      orderId: pr.id,
+      legacyField: 'status',
+      oldValue: pr.status,
+      newValue: 'Dispatched',
+      updatedBy: 'system',
+      source: 'updatePRShipmentStatus',
+      metadata: { autoUpdate: true, trigger: 'shipment_created' }
+    });
+    pr.status = 'Dispatched';
+  } else {
+    // LEGACY: Original behavior
+    pr.status = 'Dispatched';
+  }
   
   await pr.save()
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-009: PR Delivery Status Update

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 14530-14545
FUNCTION: updatePRDeliveryStatus()
WRAPPER: writeOrderStatusDual()
RISK: 🔴 CRITICAL
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -14530,16 +14530,48 @@ export async function updatePRDeliveryStatus(
   pr.receivedBy = deliveryData.receivedBy?.trim()
   pr.deliveryRemarks = deliveryData.deliveryRemarks?.trim()
-  pr.deliveryStatus = deliveryStatus
+  
+  // DUAL-WRITE: Delivery status
+  if (process.env.DUAL_WRITE_ENABLED === "true") {
+    await writeOrderStatusDual({
+      orderId: pr.id,
+      legacyField: 'deliveryStatus',
+      oldValue: pr.deliveryStatus,
+      newValue: deliveryStatus,
+      updatedBy: deliveryData.receivedBy || 'system',
+      source: 'updatePRDeliveryStatus',
+      metadata: { deliveryRemarks: deliveryData.deliveryRemarks }
+    });
+    pr.deliveryStatus = deliveryStatus;
+  } else {
+    // LEGACY: Original behavior
+    pr.deliveryStatus = deliveryStatus;
+  }
+  
   pr.items = updatedItems as any
   
   // AUTO-UPDATE: Update Order status based on delivery status
   if (deliveryStatus === 'DELIVERED') {
-    pr.status = 'Delivered'
+    // DUAL-WRITE: Order status to Delivered
+    if (process.env.DUAL_WRITE_ENABLED === "true") {
+      await writeOrderStatusDual({
+        orderId: pr.id,
+        legacyField: 'status',
+        oldValue: pr.status,
+        newValue: 'Delivered',
+        updatedBy: deliveryData.receivedBy || 'system',
+        source: 'updatePRDeliveryStatus',
+        metadata: { autoUpdate: true, trigger: 'delivery_confirmed' }
+      });
+      pr.status = 'Delivered';
+    } else {
+      // LEGACY: Original behavior
+      pr.status = 'Delivered';
+    }
   } else if (deliveryStatus === 'PARTIALLY_DELIVERED') {
-    pr.status = 'Dispatched' // Keep as Dispatched if partially delivered
+    // DUAL-WRITE: Keep as Dispatched for partial
+    if (process.env.DUAL_WRITE_ENABLED === "true") {
+      await writeOrderStatusDual({
+        orderId: pr.id,
+        legacyField: 'status',
+        oldValue: pr.status,
+        newValue: 'Dispatched',
+        updatedBy: deliveryData.receivedBy || 'system',
+        source: 'updatePRDeliveryStatus',
+        metadata: { autoUpdate: true, trigger: 'partial_delivery' }
+      });
+      pr.status = 'Dispatched';
+    } else {
+      // LEGACY: Original behavior
+      pr.status = 'Dispatched';
+    }
   }
   // If NOT_DELIVERED, keep current status
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-010: PO Status Update

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 14203-14212
FUNCTION: updateSinglePOStatus()
WRAPPER: writePOStatusDual()
RISK: 🔴 CRITICAL
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -14203,11 +14203,27 @@ async function updateSinglePOStatus(
   
   // Update PO status if it changed
   if (currentPO.po_status !== newPOStatus) {
-    await PurchaseOrder.updateOne(
-      { id: poId },
-      { $set: { po_status: newPOStatus } }
-    )
-    console.log(`[updateSinglePOStatus] Updated PO ${poId} status from ${currentPO.po_status} to ${newPOStatus}`)
+    // DUAL-WRITE: PO status update
+    if (process.env.DUAL_WRITE_ENABLED === "true") {
+      await writePOStatusDual({
+        poId: poId,
+        legacyField: 'po_status',
+        oldValue: currentPO.po_status,
+        newValue: newPOStatus,
+        updatedBy: 'system',
+        source: 'updateSinglePOStatus',
+        metadata: { prCount: prs.length }
+      });
+      console.log(`[updateSinglePOStatus] Updated PO ${poId} status from ${currentPO.po_status} to ${newPOStatus} (dual-write)`);
+    } else {
+      // LEGACY: Original behavior
+      await PurchaseOrder.updateOne(
+        { id: poId },
+        { $set: { po_status: newPOStatus } }
+      );
+      console.log(`[updateSinglePOStatus] Updated PO ${poId} status from ${currentPO.po_status} to ${newPOStatus}`);
+    }
   }
```

**Approval Required:** [ ] YES / [ ] NO

---

# 🟠 HIGH-RISK PATCHES

## PATCH-011: Bulk Child Order Approval (Site Admin)

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 10118-10140
FUNCTION: approveOrderByParentId() - Site Admin bulk
WRAPPER: writePRStatusDual() + writeOrderStatusDual()
RISK: 🟠 HIGH
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -10118,24 +10118,72 @@ export async function approveOrderByParentId(
     for (const childOrder of childOrders) {
       const previousStatus = childOrder.status
       const previousPRStatus = childOrder.pr_status
       
       // PR number and date MUST be provided by Site Admin
       childOrder.pr_number = prNumber.trim()
       childOrder.pr_date = prDate
       
-      // Update PR status to SITE_ADMIN_APPROVED
-      childOrder.pr_status = 'SITE_ADMIN_APPROVED'
+      // DUAL-WRITE: PR status to SITE_ADMIN_APPROVED
+      if (process.env.DUAL_WRITE_ENABLED === "true") {
+        await writePRStatusDual({
+          orderId: childOrder.id,
+          legacyField: 'pr_status',
+          oldValue: previousPRStatus,
+          newValue: 'SITE_ADMIN_APPROVED',
+          updatedBy: employee.id || employee.employeeId,
+          source: 'approveOrderByParentId',
+          metadata: { bulk: true, parentOrderId }
+        });
+        childOrder.pr_status = 'SITE_ADMIN_APPROVED';
+      } else {
+        // LEGACY: Original behavior
+        childOrder.pr_status = 'SITE_ADMIN_APPROVED';
+      }
+      
       childOrder.site_admin_approved_by = employee.id || employee.employeeId
       childOrder.site_admin_approved_at = new Date()
       
       if (company.require_company_admin_po_approval === true) {
-        childOrder.pr_status = 'PENDING_COMPANY_ADMIN_APPROVAL'
+        // DUAL-WRITE: Transition to Company Admin
+        if (process.env.DUAL_WRITE_ENABLED === "true") {
+          await writePRStatusDual({
+            orderId: childOrder.id,
+            legacyField: 'pr_status',
+            oldValue: 'SITE_ADMIN_APPROVED',
+            newValue: 'PENDING_COMPANY_ADMIN_APPROVAL',
+            updatedBy: employee.id || employee.employeeId,
+            source: 'approveOrderByParentId',
+            metadata: { bulk: true, transition: 'to_company_admin' }
+          });
+          childOrder.pr_status = 'PENDING_COMPANY_ADMIN_APPROVAL';
+        } else {
+          // LEGACY: Original behavior
+          childOrder.pr_status = 'PENDING_COMPANY_ADMIN_APPROVAL';
+        }
         console.log(`[approveOrderByParentId] Site Admin approved order ${childOrder.id}. Moving to Company Admin approval.`)
       } else {
-        childOrder.status = 'Awaiting fulfilment'
+        // DUAL-WRITE: Move to fulfilment
+        if (process.env.DUAL_WRITE_ENABLED === "true") {
+          await writeOrderStatusDual({
+            orderId: childOrder.id,
+            legacyField: 'status',
+            oldValue: previousStatus,
+            newValue: 'Awaiting fulfilment',
+            updatedBy: employee.id || employee.employeeId,
+            source: 'approveOrderByParentId',
+            metadata: { bulk: true, noCompanyAdminRequired: true }
+          });
+          childOrder.status = 'Awaiting fulfilment';
+        } else {
+          // LEGACY: Original behavior
+          childOrder.status = 'Awaiting fulfilment';
+        }
         console.log(`[approveOrderByParentId] Site Admin approved order ${childOrder.id}. No Company Admin approval required. Moving to fulfilment.`)
       }
       
       await childOrder.save()
       updatedCount++
     }
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-012: GRN Creation Initial Status

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 22035-22045
FUNCTION: createGRNByVendor()
WRAPPER: N/A (initial create - direct field set)
RISK: 🟠 HIGH
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -22035,6 +22035,8 @@ export async function createGRNByVendor(
     grnRaisedByVendor: true,
     grnAcknowledgedByCompany: false,
     grnStatus: 'RAISED', // Simple approval workflow: start as RAISED
+    unified_grn_status: process.env.DUAL_WRITE_ENABLED === "true" ? mapLegacyToUnifiedGRNStatus('RAISED') : undefined,
+    unified_grn_status_updated_at: process.env.DUAL_WRITE_ENABLED === "true" ? new Date() : undefined,
+    unified_grn_status_updated_by: process.env.DUAL_WRITE_ENABLED === "true" ? vendorId : undefined,
     remarks: remarks?.trim()
   })
+  
+  if (process.env.DUAL_WRITE_ENABLED === "true") {
+    console.log(`[createGRNByVendor] GRN ${grnId} created with dual-write: grnStatus=RAISED`);
+  }
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-013: GRN Approval

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 22337-22345
FUNCTION: approveGRN()
WRAPPER: writeGRNStatusDual()
RISK: 🟠 HIGH
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -22337,8 +22337,24 @@ export async function approveGRN(
   }
   
   // Update GRN
-  grn.grnStatus = 'APPROVED'
-  grn.approvedBy = approvedBy.trim()
+  // DUAL-WRITE: GRN status to APPROVED
+  if (process.env.DUAL_WRITE_ENABLED === "true") {
+    await writeGRNStatusDual({
+      grnId: grn.id,
+      legacyField: 'grnStatus',
+      oldValue: grn.grnStatus,
+      newValue: 'APPROVED',
+      updatedBy: approvedBy.trim(),
+      source: 'approveGRN',
+      metadata: { simpleWorkflow: true }
+    });
+    grn.grnStatus = 'APPROVED';
+  } else {
+    // LEGACY: Original behavior
+    grn.grnStatus = 'APPROVED';
+  }
+  grn.approvedBy = approvedBy.trim();
   grn.approvedAt = new Date()
   
   await grn.save()
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-014: Invoice Creation Initial Status

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 22540-22550
FUNCTION: createInvoiceByVendor()
WRAPPER: N/A (initial create - direct field set)
RISK: 🟠 HIGH
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -22540,6 +22540,8 @@ export async function createInvoiceByVendor(
     invoiceItems: invoiceItems,
     invoiceAmount: finalAmount,
     invoiceStatus: 'RAISED',
+    unified_invoice_status: process.env.DUAL_WRITE_ENABLED === "true" ? mapLegacyToUnifiedInvoiceStatus('RAISED') : undefined,
+    unified_invoice_status_updated_at: process.env.DUAL_WRITE_ENABLED === "true" ? new Date() : undefined,
+    unified_invoice_status_updated_by: process.env.DUAL_WRITE_ENABLED === "true" ? vendorId : undefined,
     raisedBy: vendorId,
     remarks: remarks?.trim(),
   })
+  
+  if (process.env.DUAL_WRITE_ENABLED === "true") {
+    console.log(`[createInvoiceByVendor] Invoice ${invoiceId} created with dual-write: invoiceStatus=RAISED`);
+  }
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-015: Invoice Approval

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 22657-22665
FUNCTION: approveInvoice()
WRAPPER: writeInvoiceStatusDual()
RISK: 🟠 HIGH
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -22657,8 +22657,24 @@ export async function approveInvoice(
   }
   
   // Update invoice
-  invoice.invoiceStatus = 'APPROVED'
-  invoice.approvedBy = approvedBy.trim()
+  // DUAL-WRITE: Invoice status to APPROVED
+  if (process.env.DUAL_WRITE_ENABLED === "true") {
+    await writeInvoiceStatusDual({
+      invoiceId: invoice.id,
+      legacyField: 'invoiceStatus',
+      oldValue: invoice.invoiceStatus,
+      newValue: 'APPROVED',
+      updatedBy: approvedBy.trim(),
+      source: 'approveInvoice',
+      metadata: {}
+    });
+    invoice.invoiceStatus = 'APPROVED';
+  } else {
+    // LEGACY: Original behavior
+    invoice.invoiceStatus = 'APPROVED';
+  }
+  invoice.approvedBy = approvedBy.trim();
   invoice.approvedAt = new Date()
   
   await invoice.save()
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-016: Shipment Creation - Manual

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 14020-14030
FUNCTION: createManualShipment() (within updatePRShipmentStatus)
WRAPPER: N/A (initial create - direct field set)
RISK: 🟠 HIGH
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -14020,6 +14020,8 @@ async function createManualShipment(
       ...
       shipmentStatus: 'CREATED', // Default status for manual shipments
+      unified_shipment_status: process.env.DUAL_WRITE_ENABLED === "true" ? mapLegacyToUnifiedShipmentStatus('CREATED') : undefined,
+      unified_shipment_status_updated_at: process.env.DUAL_WRITE_ENABLED === "true" ? new Date() : undefined,
+      unified_shipment_status_updated_by: process.env.DUAL_WRITE_ENABLED === "true" ? 'vendor' : undefined,
       lastProviderSyncAt: undefined,
       rawProviderResponse: undefined,
     })
+    
+    if (process.env.DUAL_WRITE_ENABLED === "true") {
+      console.log(`[createManualShipment] Shipment ${shipmentId} created with dual-write: shipmentStatus=CREATED`);
+    }
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-017: Manual Shipment Status to IN_TRANSIT

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 14303-14310
FUNCTION: updateManualShipmentStatus()
WRAPPER: writeShipmentStatusDual()
RISK: 🟠 HIGH
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -14303,10 +14303,26 @@ export async function updateManualShipmentStatus(
     }
     
     // Update shipment status to IN_TRANSIT (vendor marking as shipped)
-    await Shipment.updateOne(
-      { shipmentId: shipmentId },
-      { $set: { shipmentStatus: 'IN_TRANSIT' } }
-    )
+    // DUAL-WRITE: Shipment status to IN_TRANSIT
+    if (process.env.DUAL_WRITE_ENABLED === "true") {
+      await writeShipmentStatusDual({
+        shipmentId: shipmentId,
+        legacyField: 'shipmentStatus',
+        oldValue: currentShipment.shipmentStatus,
+        newValue: 'IN_TRANSIT',
+        updatedBy: vendorId,
+        source: 'updateManualShipmentStatus',
+        metadata: { action: 'vendor_ship' }
+      });
+      console.log(`[updateManualShipmentStatus] Shipment ${shipmentId} updated to IN_TRANSIT (dual-write)`);
+    } else {
+      // LEGACY: Original behavior
+      await Shipment.updateOne(
+        { shipmentId: shipmentId },
+        { $set: { shipmentStatus: 'IN_TRANSIT' } }
+      );
+    }
```

**Approval Required:** [ ] YES / [ ] NO

---

# 🟡 MEDIUM PATCHES

## PATCH-018: Import Statements for shipment-execution.ts

```diff
================================================================================
FILE: lib/db/shipment-execution.ts
LOCATION: After line ~20 (after existing imports)
RISK: 🟡 MEDIUM
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/shipment-execution.ts
+++ b/lib/db/shipment-execution.ts
@@ -20,6 +20,16 @@ import Shipment from '@/lib/models/Shipment'
 import Order from '@/lib/models/Order'
 import { logShipmentApiCall } from './shipment-logging'
 
+// =============================================================================
+// DUAL-WRITE INTEGRATION (Feature Flag: DUAL_WRITE_ENABLED)
+// =============================================================================
+import {
+  writeOrderStatusDual,
+  writeShipmentStatusDual,
+  mapLegacyToUnifiedShipmentStatus,
+} from '@/migrations/dualwrite/status-dualwrite-wrapper'
+
 // Provider imports
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-019: API Shipment Creation

```diff
================================================================================
FILE: lib/db/shipment-execution.ts
LINES: 555-570
FUNCTION: createApiShipment()
WRAPPER: N/A (initial create - direct field set)
RISK: 🟡 MEDIUM
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/shipment-execution.ts
+++ b/lib/db/shipment-execution.ts
@@ -555,6 +555,8 @@ export async function createApiShipment(
       ...
       shipmentStatus: 'CREATED',
+      unified_shipment_status: process.env.DUAL_WRITE_ENABLED === "true" ? mapLegacyToUnifiedShipmentStatus('CREATED') : undefined,
+      unified_shipment_status_updated_at: process.env.DUAL_WRITE_ENABLED === "true" ? new Date() : undefined,
+      unified_shipment_status_updated_by: process.env.DUAL_WRITE_ENABLED === "true" ? 'api-shipment' : undefined,
       lastProviderSyncAt: new Date(),
       rawProviderResponse: result.rawResponse,
     })
+    
+    if (process.env.DUAL_WRITE_ENABLED === "true") {
+      console.log(`[createApiShipment] Shipment ${shipmentId} created with dual-write: shipmentStatus=CREATED`);
+    }
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-020: Shipment Provider Status Sync

```diff
================================================================================
FILE: lib/db/shipment-execution.ts
LINES: 765-790
FUNCTION: syncShipmentStatus()
WRAPPER: writeShipmentStatusDual()
RISK: 🟡 MEDIUM
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/shipment-execution.ts
+++ b/lib/db/shipment-execution.ts
@@ -765,11 +765,27 @@ export async function syncShipmentStatus(shipmentId: string) {
     }
 
     // Update shipment
-    const updates: any = {
-      shipmentStatus: statusResult.status,
-      lastProviderSyncAt: new Date(),
-      rawProviderResponse: statusResult.rawResponse,
+    // DUAL-WRITE: Shipment status from provider
+    if (process.env.DUAL_WRITE_ENABLED === "true") {
+      await writeShipmentStatusDual({
+        shipmentId: shipmentId,
+        legacyField: 'shipmentStatus',
+        oldValue: shipment.shipmentStatus,
+        newValue: statusResult.status,
+        updatedBy: 'provider-sync',
+        source: 'syncShipmentStatus',
+        metadata: {
+          providerId: shipment.providerId,
+          providerReference: shipment.providerShipmentReference
+        }
+      });
+      console.log(`[syncShipmentStatus] Shipment ${shipmentId} synced to ${statusResult.status} (dual-write)`);
     }
+    
+    // Update non-status fields (always legacy)
+    const updates: any = {
+      lastProviderSyncAt: new Date(),
+      rawProviderResponse: statusResult.rawResponse,
+    };
+    
+    // Include status update only if dual-write is disabled
+    if (process.env.DUAL_WRITE_ENABLED !== "true") {
+      updates.shipmentStatus = statusResult.status;
+    }
 
     if (statusResult.trackingNumber) {
       updates.trackingNumber = statusResult.trackingNumber
@@ -790,6 +790,26 @@ export async function syncShipmentStatus(shipmentId: string) {
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-021: Shipment Execution - Cascade to Order Delivery

```diff
================================================================================
FILE: lib/db/shipment-execution.ts
LINES: 792-805
FUNCTION: syncShipmentStatus() - Cascade to Order
WRAPPER: writeOrderStatusDual()
RISK: 🟡 MEDIUM
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/shipment-execution.ts
+++ b/lib/db/shipment-execution.ts
@@ -792,14 +792,32 @@ export async function syncShipmentStatus(shipmentId: string) {
     // If delivered, update PR/Order delivery status
     if (statusResult.status === 'DELIVERED') {
-      await Order.updateOne(
-        { pr_number: shipment.prNumber },
-        {
-          $set: {
-            deliveryStatus: 'DELIVERED',
-            deliveredDate: statusResult.deliveredDate || new Date(),
-            trackingNumber: statusResult.trackingNumber || shipment.trackingNumber,
-            logisticsTrackingUrl: statusResult.trackingUrl || shipment.trackingUrl,
+      // DUAL-WRITE: Cascade delivery status to Order
+      if (process.env.DUAL_WRITE_ENABLED === "true") {
+        const currentOrder = await Order.findOne({ pr_number: shipment.prNumber }).lean();
+        if (currentOrder) {
+          await writeOrderStatusDual({
+            orderId: currentOrder.id,
+            legacyField: 'deliveryStatus',
+            oldValue: currentOrder.deliveryStatus,
+            newValue: 'DELIVERED',
+            updatedBy: 'shipment-sync',
+            source: 'syncShipmentStatus',
+            metadata: { 
+              shipmentId: shipment.shipmentId,
+              prNumber: shipment.prNumber,
+              providerStatus: statusResult.status
+            }
+          });
+        }
+      }
+      
+      // Update other non-status fields
+      await Order.updateOne(
+        { pr_number: shipment.prNumber },
+        {
+          $set: {
+            deliveryStatus: process.env.DUAL_WRITE_ENABLED === "true" ? undefined : 'DELIVERED',
+            deliveredDate: statusResult.deliveredDate || new Date(),
+            trackingNumber: statusResult.trackingNumber || shipment.trackingNumber,
+            logisticsTrackingUrl: statusResult.trackingUrl || shipment.trackingUrl,
           },
         }
       )
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-022: GRN Acknowledgment (Legacy Flow)

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 22273-22280
FUNCTION: acknowledgeGRN()
WRAPPER: writeGRNStatusDual()
RISK: 🟡 MEDIUM
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -22273,8 +22273,24 @@ export async function acknowledgeGRN(
   }
   
   // Update GRN
-  grn.status = 'ACKNOWLEDGED'
-  grn.grnAcknowledgedByCompany = true
+  // DUAL-WRITE: GRN status to ACKNOWLEDGED (legacy field)
+  if (process.env.DUAL_WRITE_ENABLED === "true") {
+    await writeGRNStatusDual({
+      grnId: grn.id,
+      legacyField: 'status',
+      oldValue: grn.status,
+      newValue: 'ACKNOWLEDGED',
+      updatedBy: acknowledgedBy.trim(),
+      source: 'acknowledgeGRN',
+      metadata: { legacyWorkflow: true }
+    });
+    grn.status = 'ACKNOWLEDGED';
+  } else {
+    // LEGACY: Original behavior
+    grn.status = 'ACKNOWLEDGED';
+  }
+  grn.grnAcknowledgedByCompany = true;
   grn.grnAcknowledgedDate = new Date()
   grn.grnAcknowledgedBy = acknowledgedBy.trim()
   
   await grn.save()
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-023: PO Creation Initial Status

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 13519-13526
FUNCTION: createPurchaseOrder()
WRAPPER: N/A (initial create - direct field set)
RISK: 🟡 MEDIUM
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -13519,6 +13519,8 @@ export async function createPurchaseOrder(
       vendor_id: vendorId,
       client_po_number: poNumber.trim(),
       po_date: poDate,
       po_status: 'SENT_TO_VENDOR', // Immediately send to vendor for fulfilment
+      unified_po_status: process.env.DUAL_WRITE_ENABLED === "true" ? mapLegacyToUnifiedPOStatus('SENT_TO_VENDOR') : undefined,
+      unified_po_status_updated_at: process.env.DUAL_WRITE_ENABLED === "true" ? new Date() : undefined,
+      unified_po_status_updated_by: process.env.DUAL_WRITE_ENABLED === "true" ? (creatingEmployee.id || creatingEmployee.employeeId) : undefined,
       created_by_user_id: creatingEmployee.id || creatingEmployee.employeeId
     })
+    
+    if (process.env.DUAL_WRITE_ENABLED === "true") {
+      console.log(`[createPurchaseOrder] PO ${poId} created with dual-write: po_status=SENT_TO_VENDOR`);
+    }
```

**Approval Required:** [ ] YES / [ ] NO

---

# 🟢 LOW PATCHES

## PATCH-024: Replacement Order Auto-Approval

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 21595-21600
FUNCTION: createReplacementOrder()
WRAPPER: writeOrderStatusDual()
RISK: 🟢 LOW
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -21595,8 +21595,24 @@ export async function createReplacementOrder(
       }
       // Auto-approve replacement orders since return request is already approved
       if (order.status === 'Awaiting approval' || order.status === 'Awaiting fulfilment') {
-        order.status = 'Awaiting fulfilment'
+        // DUAL-WRITE: Auto-approve replacement order
+        if (process.env.DUAL_WRITE_ENABLED === "true") {
+          await writeOrderStatusDual({
+            orderId: order.id,
+            legacyField: 'status',
+            oldValue: order.status,
+            newValue: 'Awaiting fulfilment',
+            updatedBy: 'system',
+            source: 'createReplacementOrder',
+            metadata: { autoApprove: true, returnRequestId: returnRequest.id }
+          });
+          order.status = 'Awaiting fulfilment';
+        } else {
+          // LEGACY: Original behavior
+          order.status = 'Awaiting fulfilment';
+        }
       }
       await order.save()
```

**Approval Required:** [ ] YES / [ ] NO

---

## PATCH-025: GRN Retrofit (Old to New Status)

```diff
================================================================================
FILE: lib/db/data-access.ts
LINES: 22424-22435
FUNCTION: createInvoiceByVendor() - GRN Retrofit
WRAPPER: writeGRNStatusDual()
RISK: 🟢 LOW
STATUS: STAGED — DO NOT APPLY
================================================================================

--- a/lib/db/data-access.ts
+++ b/lib/db/data-access.ts
@@ -22424,7 +22424,23 @@ export async function createInvoiceByVendor(
   // Retrofit: If GRN was approved via old workflow but doesn't have grnStatus set, update it
   if (grn.grnStatus !== 'APPROVED' && (grn.grnAcknowledgedByCompany === true || grn.status === 'ACKNOWLEDGED')) {
-    grn.grnStatus = 'APPROVED'
+    // DUAL-WRITE: Retrofit GRN status
+    if (process.env.DUAL_WRITE_ENABLED === "true") {
+      await writeGRNStatusDual({
+        grnId: grn.id,
+        legacyField: 'grnStatus',
+        oldValue: grn.grnStatus,
+        newValue: 'APPROVED',
+        updatedBy: grn.grnAcknowledgedBy || 'system',
+        source: 'createInvoiceByVendor',
+        metadata: { retrofit: true, legacyApproval: true }
+      });
+      grn.grnStatus = 'APPROVED';
+    } else {
+      // LEGACY: Original behavior
+      grn.grnStatus = 'APPROVED';
+    }
     if (!grn.approvedBy && grn.grnAcknowledgedBy) {
       grn.approvedBy = grn.grnAcknowledgedBy
     }
```

**Approval Required:** [ ] YES / [ ] NO

---

# 📦 IMPORT PATCHES

## Summary of Required Imports

### lib/db/data-access.ts

```typescript
// Required imports (from PATCH-001)
import {
  writeOrderStatusDual,
  writePRStatusDual,
  writePOStatusDual,
  writeShipmentStatusDual,
  writeGRNStatusDual,
  writeInvoiceStatusDual,
  mapLegacyToUnifiedOrderStatus,
  mapLegacyToUnifiedPRStatus,
  mapLegacyToUnifiedPOStatus,
  mapLegacyToUnifiedShipmentStatus,
  mapLegacyToUnifiedGRNStatus,
  mapLegacyToUnifiedInvoiceStatus,
} from '@/migrations/dualwrite/status-dualwrite-wrapper'
```

### lib/db/shipment-execution.ts

```typescript
// Required imports (from PATCH-018)
import {
  writeOrderStatusDual,
  writeShipmentStatusDual,
  mapLegacyToUnifiedShipmentStatus,
} from '@/migrations/dualwrite/status-dualwrite-wrapper'
```

---

# Patch Summary

## By Risk Level

| Risk | Count | Status |
|------|-------|--------|
| 🔴 CRITICAL | 10 | STAGED |
| 🟠 HIGH | 7 | STAGED |
| 🟡 MEDIUM | 6 | STAGED |
| 🟢 LOW | 2 | STAGED |
| **TOTAL** | **25** | **STAGED** |

## By Entity

| Entity | Patches |
|--------|---------|
| Order Status | 8 |
| PR Status | 6 |
| PO Status | 2 |
| Shipment Status | 5 |
| GRN Status | 3 |
| Invoice Status | 2 |
| **TOTAL** | **26** |

## By File

| File | Patches |
|------|---------|
| lib/db/data-access.ts | 22 |
| lib/db/shipment-execution.ts | 4 |
| **TOTAL** | **26** |

---

# Approval Checklist

Before applying patches, ensure:

- [ ] All patches reviewed by team lead
- [ ] Feature flag environment variable configured
- [ ] Dual-write wrapper functions tested
- [ ] Database backup completed
- [ ] Rollback plan prepared
- [ ] Monitoring/alerting configured
- [ ] Test environment validated

---

# Application Instructions

**DO NOT APPLY UNTIL APPROVED**

When ready to apply:

1. Set `DUAL_WRITE_ENABLED=false` in environment
2. Apply patches in order (PATCH-001 first for imports)
3. Run full test suite
4. Deploy to staging
5. Set `DUAL_WRITE_ENABLED=true` in staging only
6. Monitor for 24-48 hours
7. If successful, promote to production

---

**END OF STAGED PATCHES**

*Document generated: 2026-01-15*  
*Status: STAGED — AWAITING EXPLICIT APPROVAL*  
*Feature Flag: DUAL_WRITE_ENABLED (default: false)*
