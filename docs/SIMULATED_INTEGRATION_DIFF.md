# SIMULATED DUAL-WRITE INTEGRATION DIFF

## Simulation Mode — NO CODE CHANGES APPLIED

**Document Version:** 1.0.0  
**Created:** 2026-01-15  
**Status:** SIMULATION ONLY — READ-ONLY PREVIEW  
**Purpose:** Preview how dual-write wrappers would be integrated

---

## ⚠️ IMPORTANT NOTICE

This document contains **SIMULATED DIFFS ONLY**.

- ❌ No files have been modified
- ❌ No code has been changed
- ❌ No imports have been added
- ❌ No commits have been made

This is a **planning document** to visualize the integration approach.

---

## Table of Contents

1. [ORDER Status Integration Diffs](#1-order-status-integration-diffs)
2. [PR Status Integration Diffs](#2-pr-status-integration-diffs)
3. [PO Status Integration Diffs](#3-po-status-integration-diffs)
4. [SHIPMENT Status Integration Diffs](#4-shipment-status-integration-diffs)
5. [GRN Status Integration Diffs](#5-grn-status-integration-diffs)
6. [INVOICE Status Integration Diffs](#6-invoice-status-integration-diffs)
7. [Import Statement Additions](#7-import-statement-additions)

---

## 1. ORDER STATUS INTEGRATION DIFFS

### 🔴 CRITICAL — ORD-C1: Site Admin Approval

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 9783–9790
INJECTION: writeOrderStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

    if (company.require_company_admin_po_approval === true) {
      // Move to Company Admin approval
      order.pr_status = 'PENDING_COMPANY_ADMIN_APPROVAL'
      console.log(`[approveOrder] Site Admin approved. Moving to Company Admin approval.`)
    } else {
      // No company admin approval needed, move to fulfilment
      order.status = 'Awaiting fulfilment'
      console.log(`[approveOrder] Site Admin approved. No Company Admin approval required. Moving to fulfilment.`)
    }


+++ SUGGESTED (SIMULATION ONLY) +++

    if (company.require_company_admin_po_approval === true) {
      // Move to Company Admin approval
      await writePRStatusDual({
        orderId: order.id,
        legacyField: 'pr_status',
        oldValue: order.pr_status,
        newValue: 'PENDING_COMPANY_ADMIN_APPROVAL',
        updatedBy: employee.id || employee.employeeId,
        source: 'approveOrder',
        metadata: { approvalType: 'site_admin', nextStep: 'company_admin' }
      })
      console.log(`[approveOrder] Site Admin approved. Moving to Company Admin approval.`)
    } else {
      // No company admin approval needed, move to fulfilment
      await writeOrderStatusDual({
        orderId: order.id,
        legacyField: 'status',
        oldValue: order.status,
        newValue: 'Awaiting fulfilment',
        updatedBy: employee.id || employee.employeeId,
        source: 'approveOrder',
        metadata: { approvalType: 'site_admin', noCompanyAdminRequired: true }
      })
      console.log(`[approveOrder] Site Admin approved. No Company Admin approval required. Moving to fulfilment.`)
    }

────────────────────────────────────────────────────────────────
```

---

### 🔴 CRITICAL — ORD-C2: Company Admin Approval

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 9796–9804
INJECTION: writeOrderStatusDual() + writePRStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

    // Update PR status to COMPANY_ADMIN_APPROVED
    order.pr_status = 'COMPANY_ADMIN_APPROVED'
    // CRITICAL FIX: Use string ID, not ObjectId
    order.company_admin_approved_by = employee.id || employee.employeeId
    order.company_admin_approved_at = new Date()
    order.status = 'Awaiting fulfilment'
    console.log(`[approveOrder] Company Admin approved. Moving to fulfilment.`)


+++ SUGGESTED (SIMULATION ONLY) +++

    // Update PR status to COMPANY_ADMIN_APPROVED
    await writePRStatusDual({
      orderId: order.id,
      legacyField: 'pr_status',
      oldValue: order.pr_status,
      newValue: 'COMPANY_ADMIN_APPROVED',
      updatedBy: employee.id || employee.employeeId,
      source: 'approveOrder',
      metadata: { approvalType: 'company_admin' }
    })
    // CRITICAL FIX: Use string ID, not ObjectId
    order.company_admin_approved_by = employee.id || employee.employeeId
    order.company_admin_approved_at = new Date()
    await writeOrderStatusDual({
      orderId: order.id,
      legacyField: 'status',
      oldValue: order.status,
      newValue: 'Awaiting fulfilment',
      updatedBy: employee.id || employee.employeeId,
      source: 'approveOrder',
      metadata: { approvalType: 'company_admin' }
    })
    console.log(`[approveOrder] Company Admin approved. Moving to fulfilment.`)

────────────────────────────────────────────────────────────────
```

---

### 🔴 CRITICAL — ORD-C3: Generic Order Status Update

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 11034–11045
INJECTION: writeOrderStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

  const previousStatus = order.status
  order.status = status
  
  // OPTION 1 ENHANCEMENT: Automatically set all required shipment/delivery fields
  if (status === 'Dispatched') {
    // Update dispatch fields
    
    // Set dispatch status
    order.dispatchStatus = 'SHIPPED'
    
    // Set dispatched date if not already set
    if (!order.dispatchedDate) {
      order.dispatchedDate = new Date()
    }


+++ SUGGESTED (SIMULATION ONLY) +++

  const previousStatus = order.status
  
  // Dual-write: Update both legacy and unified status
  await writeOrderStatusDual({
    orderId: order.id,
    legacyField: 'status',
    oldValue: previousStatus,
    newValue: status,
    updatedBy: vendorId || 'system',
    source: 'updateOrderStatus',
    metadata: { vendorId }
  })
  
  // OPTION 1 ENHANCEMENT: Automatically set all required shipment/delivery fields
  if (status === 'Dispatched') {
    // Update dispatch fields (also dual-write)
    
    // Set dispatch status
    await writeOrderStatusDual({
      orderId: order.id,
      legacyField: 'dispatchStatus',
      oldValue: order.dispatchStatus,
      newValue: 'SHIPPED',
      updatedBy: vendorId || 'system',
      source: 'updateOrderStatus',
      metadata: { cascade: true, parentStatus: status }
    })
    
    // Set dispatched date if not already set
    if (!order.dispatchedDate) {
      order.dispatchedDate = new Date()
    }

────────────────────────────────────────────────────────────────
```

---

### 🔴 CRITICAL — ORD-C4: Bulk Child Order Approval (Site Admin)

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 10118–10140
INJECTION: writePRStatusDual() + writeOrderStatusDual() (loop)
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

    for (const childOrder of childOrders) {
      const previousStatus = childOrder.status
      const previousPRStatus = childOrder.pr_status
      
      // PR number and date MUST be provided by Site Admin
      childOrder.pr_number = prNumber.trim()
      childOrder.pr_date = prDate
      
      // Update PR status to SITE_ADMIN_APPROVED
      childOrder.pr_status = 'SITE_ADMIN_APPROVED'
      childOrder.site_admin_approved_by = employee.id || employee.employeeId
      childOrder.site_admin_approved_at = new Date()
      
      if (company.require_company_admin_po_approval === true) {
        childOrder.pr_status = 'PENDING_COMPANY_ADMIN_APPROVAL'
      } else {
        childOrder.status = 'Awaiting fulfilment'
      }
      
      await childOrder.save()
      updatedCount++
    }


+++ SUGGESTED (SIMULATION ONLY) +++

    for (const childOrder of childOrders) {
      const previousStatus = childOrder.status
      const previousPRStatus = childOrder.pr_status
      
      // PR number and date MUST be provided by Site Admin
      childOrder.pr_number = prNumber.trim()
      childOrder.pr_date = prDate
      
      // Update PR status to SITE_ADMIN_APPROVED (dual-write)
      await writePRStatusDual({
        orderId: childOrder.id,
        legacyField: 'pr_status',
        oldValue: previousPRStatus,
        newValue: 'SITE_ADMIN_APPROVED',
        updatedBy: employee.id || employee.employeeId,
        source: 'approveOrderByParentId',
        metadata: { bulk: true, parentOrderId }
      })
      childOrder.site_admin_approved_by = employee.id || employee.employeeId
      childOrder.site_admin_approved_at = new Date()
      
      if (company.require_company_admin_po_approval === true) {
        await writePRStatusDual({
          orderId: childOrder.id,
          legacyField: 'pr_status',
          oldValue: 'SITE_ADMIN_APPROVED',
          newValue: 'PENDING_COMPANY_ADMIN_APPROVAL',
          updatedBy: employee.id || employee.employeeId,
          source: 'approveOrderByParentId',
          metadata: { bulk: true, transition: 'to_company_admin' }
        })
      } else {
        await writeOrderStatusDual({
          orderId: childOrder.id,
          legacyField: 'status',
          oldValue: previousStatus,
          newValue: 'Awaiting fulfilment',
          updatedBy: employee.id || employee.employeeId,
          source: 'approveOrderByParentId',
          metadata: { bulk: true, noCompanyAdminRequired: true }
        })
      }
      
      await childOrder.save()
      updatedCount++
    }

────────────────────────────────────────────────────────────────
```

---

### 🔴 CRITICAL — ORD-C7: Auto-Update to Dispatched (Shipment)

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 13870–13880
INJECTION: writeOrderStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

  pr.modeOfTransport = shipmentData.modeOfTransport
  pr.trackingNumber = shipmentData.trackingNumber?.trim()
  pr.dispatchStatus = 'SHIPPED'
  pr.dispatchedDate = shipmentData.dispatchedDate
  pr.expectedDeliveryDate = shipmentData.expectedDeliveryDate
  pr.deliveryStatus = deliveryStatus
  pr.items = updatedItems as any
  
  // AUTO-UPDATE: Update Order status to Dispatched when items are shipped
  pr.status = 'Dispatched'
  
  await pr.save()


+++ SUGGESTED (SIMULATION ONLY) +++

  pr.modeOfTransport = shipmentData.modeOfTransport
  pr.trackingNumber = shipmentData.trackingNumber?.trim()
  
  // Dual-write: dispatchStatus
  await writeOrderStatusDual({
    orderId: pr.id,
    legacyField: 'dispatchStatus',
    oldValue: pr.dispatchStatus,
    newValue: 'SHIPPED',
    updatedBy: 'system',
    source: 'updatePRShipmentStatus',
    metadata: { shipmentData }
  })
  
  pr.dispatchedDate = shipmentData.dispatchedDate
  pr.expectedDeliveryDate = shipmentData.expectedDeliveryDate
  
  // Dual-write: deliveryStatus
  await writeOrderStatusDual({
    orderId: pr.id,
    legacyField: 'deliveryStatus',
    oldValue: pr.deliveryStatus,
    newValue: deliveryStatus,
    updatedBy: 'system',
    source: 'updatePRShipmentStatus',
    metadata: { shipmentData }
  })
  
  pr.items = updatedItems as any
  
  // AUTO-UPDATE: Update Order status to Dispatched when items are shipped (dual-write)
  await writeOrderStatusDual({
    orderId: pr.id,
    legacyField: 'status',
    oldValue: pr.status,
    newValue: 'Dispatched',
    updatedBy: 'system',
    source: 'updatePRShipmentStatus',
    metadata: { autoUpdate: true, trigger: 'shipment_created' }
  })
  
  await pr.save()

────────────────────────────────────────────────────────────────
```

---

### 🔴 CRITICAL — ORD-C8: Auto-Update to Delivered (Delivery Confirmation)

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 14530–14545
INJECTION: writeOrderStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

  pr.receivedBy = deliveryData.receivedBy?.trim()
  pr.deliveryRemarks = deliveryData.deliveryRemarks?.trim()
  pr.deliveryStatus = deliveryStatus
  pr.items = updatedItems as any
  
  // AUTO-UPDATE: Update Order status based on delivery status
  if (deliveryStatus === 'DELIVERED') {
    pr.status = 'Delivered'
  } else if (deliveryStatus === 'PARTIALLY_DELIVERED') {
    pr.status = 'Dispatched' // Keep as Dispatched if partially delivered
  }
  // If NOT_DELIVERED, keep current status


+++ SUGGESTED (SIMULATION ONLY) +++

  pr.receivedBy = deliveryData.receivedBy?.trim()
  pr.deliveryRemarks = deliveryData.deliveryRemarks?.trim()
  
  // Dual-write: deliveryStatus
  await writeOrderStatusDual({
    orderId: pr.id,
    legacyField: 'deliveryStatus',
    oldValue: pr.deliveryStatus,
    newValue: deliveryStatus,
    updatedBy: deliveryData.receivedBy || 'system',
    source: 'updatePRDeliveryStatus',
    metadata: { deliveryData }
  })
  
  pr.items = updatedItems as any
  
  // AUTO-UPDATE: Update Order status based on delivery status (dual-write)
  if (deliveryStatus === 'DELIVERED') {
    await writeOrderStatusDual({
      orderId: pr.id,
      legacyField: 'status',
      oldValue: pr.status,
      newValue: 'Delivered',
      updatedBy: deliveryData.receivedBy || 'system',
      source: 'updatePRDeliveryStatus',
      metadata: { autoUpdate: true, trigger: 'delivery_confirmed' }
    })
  } else if (deliveryStatus === 'PARTIALLY_DELIVERED') {
    await writeOrderStatusDual({
      orderId: pr.id,
      legacyField: 'status',
      oldValue: pr.status,
      newValue: 'Dispatched', // Keep as Dispatched if partially delivered
      updatedBy: deliveryData.receivedBy || 'system',
      source: 'updatePRDeliveryStatus',
      metadata: { autoUpdate: true, trigger: 'partial_delivery' }
    })
  }
  // If NOT_DELIVERED, keep current status

────────────────────────────────────────────────────────────────
```

---

### 🔴 CRITICAL — ORD-C9: Cascading PR Status Recalculation

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 14745–14770
INJECTION: writeOrderStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

          if (prDoc.status !== newPRStatus) {
            prDoc.status = newPRStatus
            prUpdated = true
          }
          
          if (prDoc.dispatchStatus !== newDispatchStatus) {
            prDoc.dispatchStatus = newDispatchStatus
            prUpdated = true
          }
          
          if (prDoc.deliveryStatus !== newDeliveryStatus) {
            prDoc.deliveryStatus = newDeliveryStatus
            prUpdated = true
          }
          
          if (prUpdated) {
            await prDoc.save()
            result.prsUpdated++
          }


+++ SUGGESTED (SIMULATION ONLY) +++

          if (prDoc.status !== newPRStatus) {
            await writeOrderStatusDual({
              orderId: prDoc.id,
              legacyField: 'status',
              oldValue: prDoc.status,
              newValue: newPRStatus,
              updatedBy: 'system',
              source: 'updatePRAndPOStatusesFromDelivery',
              metadata: { cascade: true, recalculation: true }
            })
            prUpdated = true
          }
          
          if (prDoc.dispatchStatus !== newDispatchStatus) {
            await writeOrderStatusDual({
              orderId: prDoc.id,
              legacyField: 'dispatchStatus',
              oldValue: prDoc.dispatchStatus,
              newValue: newDispatchStatus,
              updatedBy: 'system',
              source: 'updatePRAndPOStatusesFromDelivery',
              metadata: { cascade: true, recalculation: true }
            })
            prUpdated = true
          }
          
          if (prDoc.deliveryStatus !== newDeliveryStatus) {
            await writeOrderStatusDual({
              orderId: prDoc.id,
              legacyField: 'deliveryStatus',
              oldValue: prDoc.deliveryStatus,
              newValue: newDeliveryStatus,
              updatedBy: 'system',
              source: 'updatePRAndPOStatusesFromDelivery',
              metadata: { cascade: true, recalculation: true }
            })
            prUpdated = true
          }
          
          if (prUpdated) {
            await prDoc.save()
            result.prsUpdated++
          }

────────────────────────────────────────────────────────────────
```

---

### 🔴 CRITICAL — ORD-C11: Delivery Status Set

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 11078–11095
INJECTION: writeOrderStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

  // For Delivered status
  if (status === 'Delivered') {
    
    // Set delivery status
    order.deliveryStatus = 'DELIVERED'
    
    // Set delivered date if not already set
    if (!order.deliveredDate) {
      order.deliveredDate = new Date()
    }
    
    // Ensure dispatch status is set (should be SHIPPED before delivery)
    if (!order.dispatchStatus || order.dispatchStatus === 'AWAITING_FULFILMENT') {
      order.dispatchStatus = 'SHIPPED'
      if (!order.dispatchedDate) {
        order.dispatchedDate = order.deliveredDate // Use delivered date as fallback
      }
    }


+++ SUGGESTED (SIMULATION ONLY) +++

  // For Delivered status
  if (status === 'Delivered') {
    
    // Set delivery status (dual-write)
    await writeOrderStatusDual({
      orderId: order.id,
      legacyField: 'deliveryStatus',
      oldValue: order.deliveryStatus,
      newValue: 'DELIVERED',
      updatedBy: vendorId || 'system',
      source: 'updateOrderStatus',
      metadata: { parentStatus: status }
    })
    
    // Set delivered date if not already set
    if (!order.deliveredDate) {
      order.deliveredDate = new Date()
    }
    
    // Ensure dispatch status is set (should be SHIPPED before delivery)
    if (!order.dispatchStatus || order.dispatchStatus === 'AWAITING_FULFILMENT') {
      await writeOrderStatusDual({
        orderId: order.id,
        legacyField: 'dispatchStatus',
        oldValue: order.dispatchStatus,
        newValue: 'SHIPPED',
        updatedBy: vendorId || 'system',
        source: 'updateOrderStatus',
        metadata: { parentStatus: status, fallback: true }
      })
      if (!order.dispatchedDate) {
        order.dispatchedDate = order.deliveredDate // Use delivered date as fallback
      }
    }

────────────────────────────────────────────────────────────────
```

---

### 🟠 HIGH — ORD-H3: Shipment Execution - Delivery Cascade

```
────────────────────────────────────────────────────────────────
FILE: lib/db/shipment-execution.ts
LINES: 792–805
INJECTION: writeOrderStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

    // If delivered, update PR/Order delivery status
    if (statusResult.status === 'DELIVERED') {
      await Order.updateOne(
        { pr_number: shipment.prNumber },
        {
          $set: {
            deliveryStatus: 'DELIVERED',
            deliveredDate: statusResult.deliveredDate || new Date(),
            trackingNumber: statusResult.trackingNumber || shipment.trackingNumber,
            logisticsTrackingUrl: statusResult.trackingUrl || shipment.trackingUrl,
          },
        }
      )


+++ SUGGESTED (SIMULATION ONLY) +++

    // If delivered, update PR/Order delivery status (dual-write)
    if (statusResult.status === 'DELIVERED') {
      // Get current order for old value
      const currentOrder = await Order.findOne({ pr_number: shipment.prNumber }).lean()
      
      await writeOrderStatusDual({
        orderId: currentOrder?.id,
        legacyField: 'deliveryStatus',
        oldValue: currentOrder?.deliveryStatus,
        newValue: 'DELIVERED',
        updatedBy: 'shipment-sync',
        source: 'syncShipmentStatus',
        metadata: { 
          shipmentId: shipment.shipmentId,
          prNumber: shipment.prNumber,
          providerStatus: statusResult.status
        }
      })
      
      // Also update other fields (non-status, no dual-write needed)
      await Order.updateOne(
        { pr_number: shipment.prNumber },
        {
          $set: {
            deliveredDate: statusResult.deliveredDate || new Date(),
            trackingNumber: statusResult.trackingNumber || shipment.trackingNumber,
            logisticsTrackingUrl: statusResult.trackingUrl || shipment.trackingUrl,
          },
        }
      )

────────────────────────────────────────────────────────────────
```

---

### 🟠 HIGH — ORD-H4: Shipment Execution - Dispatch Update

```
────────────────────────────────────────────────────────────────
FILE: lib/db/shipment-execution.ts
LINES: 590–598
INJECTION: writeOrderStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

        // Update order with shipment details
        await Order.updateOne(
          { id: order.id },
          {
            $set: {
              logisticsTrackingUrl: result.trackingUrl,
              logisticsPayloadRef: result.providerShipmentReference,
              dispatchStatus: 'SHIPPED',
              dispatchedDate: new Date(),
            },
          }
        )


+++ SUGGESTED (SIMULATION ONLY) +++

        // Update order with shipment details (dual-write for status)
        await writeOrderStatusDual({
          orderId: order.id,
          legacyField: 'dispatchStatus',
          oldValue: order.dispatchStatus,
          newValue: 'SHIPPED',
          updatedBy: 'api-shipment',
          source: 'createApiShipment',
          metadata: { 
            providerId: result.providerId,
            shipmentReference: result.providerShipmentReference
          }
        })
        
        // Update other non-status fields
        await Order.updateOne(
          { id: order.id },
          {
            $set: {
              logisticsTrackingUrl: result.trackingUrl,
              logisticsPayloadRef: result.providerShipmentReference,
              dispatchedDate: new Date(),
            },
          }
        )

────────────────────────────────────────────────────────────────
```

---

## 2. PR STATUS INTEGRATION DIFFS

### 🔴 CRITICAL — PR-C1: Site Admin Approval (PR Status)

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 9771–9776
INJECTION: writePRStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

    order.pr_status = 'SITE_ADMIN_APPROVED'
    // CRITICAL FIX: Use string ID, not ObjectId
    order.site_admin_approved_by = employee.id || employee.employeeId
    order.site_admin_approved_at = new Date()


+++ SUGGESTED (SIMULATION ONLY) +++

    // Dual-write: pr_status
    await writePRStatusDual({
      orderId: order.id,
      legacyField: 'pr_status',
      oldValue: order.pr_status,
      newValue: 'SITE_ADMIN_APPROVED',
      updatedBy: employee.id || employee.employeeId,
      source: 'approveOrder',
      metadata: { approvalType: 'site_admin', prNumber: order.pr_number }
    })
    // CRITICAL FIX: Use string ID, not ObjectId
    order.site_admin_approved_by = employee.id || employee.employeeId
    order.site_admin_approved_at = new Date()

────────────────────────────────────────────────────────────────
```

---

### 🔴 CRITICAL — PR-C8: PR Status to PO_CREATED

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: ~13521 (during PO creation flow)
INJECTION: writePRStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

    // After PO is created, update PRs linked to it
    for (const prId of linkedPRIds) {
      const pr = await Order.findOne({ id: prId })
      if (pr) {
        pr.pr_status = 'PO_CREATED'
        await pr.save()
      }
    }


+++ SUGGESTED (SIMULATION ONLY) +++

    // After PO is created, update PRs linked to it (dual-write)
    for (const prId of linkedPRIds) {
      const pr = await Order.findOne({ id: prId })
      if (pr) {
        await writePRStatusDual({
          orderId: pr.id,
          legacyField: 'pr_status',
          oldValue: pr.pr_status,
          newValue: 'PO_CREATED',
          updatedBy: creatingEmployee.id,
          source: 'createPurchaseOrder',
          metadata: { poId: newPO.id, poNumber: newPO.po_number }
        })
        await pr.save()
      }
    }

────────────────────────────────────────────────────────────────
```

---

### 🔴 CRITICAL — PR-C9: PR Status to FULLY_DELIVERED (via updateMany)

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 14355–14370
INJECTION: writePRStatusDual() (batch)
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

            await Order.updateOne(
              { id: pr.id },
              { 
                $set: { 
                  dispatchStatus: 'SHIPPED',
                  deliveryStatus: 'DELIVERED',
                  pr_status: 'FULLY_DELIVERED',
                  status: 'Delivered',
                  deliveredDate: new Date()
                }
              }
            )


+++ SUGGESTED (SIMULATION ONLY) +++

            // Dual-write: multiple status fields for PR
            await writePRStatusDual({
              orderId: pr.id,
              legacyField: 'pr_status',
              oldValue: pr.pr_status,
              newValue: 'FULLY_DELIVERED',
              updatedBy: 'system',
              source: 'updateSinglePOStatus',
              metadata: { cascade: true, poCompleted: true }
            })
            
            await writeOrderStatusDual({
              orderId: pr.id,
              legacyField: 'dispatchStatus',
              oldValue: pr.dispatchStatus,
              newValue: 'SHIPPED',
              updatedBy: 'system',
              source: 'updateSinglePOStatus',
              metadata: { cascade: true }
            })
            
            await writeOrderStatusDual({
              orderId: pr.id,
              legacyField: 'deliveryStatus',
              oldValue: pr.deliveryStatus,
              newValue: 'DELIVERED',
              updatedBy: 'system',
              source: 'updateSinglePOStatus',
              metadata: { cascade: true }
            })
            
            await writeOrderStatusDual({
              orderId: pr.id,
              legacyField: 'status',
              oldValue: pr.status,
              newValue: 'Delivered',
              updatedBy: 'system',
              source: 'updateSinglePOStatus',
              metadata: { cascade: true }
            })
            
            await Order.updateOne(
              { id: pr.id },
              { $set: { deliveredDate: new Date() } }
            )

────────────────────────────────────────────────────────────────
```

---

## 3. PO STATUS INTEGRATION DIFFS

### 🔴 CRITICAL — PO-C1: PO Creation Initial Status

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 13519–13526
INJECTION: writePOStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

    const newPO = await PurchaseOrder.create({
      id: poId,
      po_number: poNumber.trim(),
      po_date: poDate,
      vendor_id: vendorId,
      client_po_number: poNumber.trim(),
      po_date: poDate,
      po_status: 'SENT_TO_VENDOR', // Immediately send to vendor for fulfilment
      created_by_user_id: creatingEmployee.id || creatingEmployee.employeeId
    })


+++ SUGGESTED (SIMULATION ONLY) +++

    // Note: For CREATE operations, we set initial status directly
    // but also call dual-write wrapper for consistency
    const initialPOStatus = 'SENT_TO_VENDOR'
    
    const newPO = await PurchaseOrder.create({
      id: poId,
      po_number: poNumber.trim(),
      po_date: poDate,
      vendor_id: vendorId,
      client_po_number: poNumber.trim(),
      po_date: poDate,
      po_status: initialPOStatus,
      unified_po_status: mapLegacyToUnifiedPOStatus(initialPOStatus), // Dual-write on create
      unified_po_status_updated_at: new Date(),
      unified_po_status_updated_by: creatingEmployee.id || creatingEmployee.employeeId,
      created_by_user_id: creatingEmployee.id || creatingEmployee.employeeId
    })
    
    // Log dual-write on creation
    console.log(`[createPurchaseOrder] PO ${poId} created with dual-write: po_status=${initialPOStatus}, unified_po_status=${mapLegacyToUnifiedPOStatus(initialPOStatus)}`)

────────────────────────────────────────────────────────────────
```

---

### 🔴 CRITICAL — PO-C2: PO Status Update

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 14203–14210
INJECTION: writePOStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

  // Update PO status if it changed
  if (currentPO.po_status !== newPOStatus) {
    await PurchaseOrder.updateOne(
      { id: poId },
      { $set: { po_status: newPOStatus } }
    )
    console.log(`[updateSinglePOStatus] Updated PO ${poId} status from ${currentPO.po_status} to ${newPOStatus}`)
  }


+++ SUGGESTED (SIMULATION ONLY) +++

  // Update PO status if it changed (dual-write)
  if (currentPO.po_status !== newPOStatus) {
    await writePOStatusDual({
      poId: poId,
      legacyField: 'po_status',
      oldValue: currentPO.po_status,
      newValue: newPOStatus,
      updatedBy: 'system',
      source: 'updateSinglePOStatus',
      metadata: { prCount: prs.length }
    })
    console.log(`[updateSinglePOStatus] Updated PO ${poId} status from ${currentPO.po_status} to ${newPOStatus} (dual-write)`)
  }

────────────────────────────────────────────────────────────────
```

---

## 4. SHIPMENT STATUS INTEGRATION DIFFS

### 🔴 CRITICAL — SHIP-C1: Manual Shipment Creation

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 14020–14030
INJECTION: writeShipmentStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

    const newShipment = await Shipment.create({
      shipmentId: shipmentId,
      prNumber: prNumber,
      shipmentMode: 'MANUAL',
      shipperName: shipmentData.shipperName,
      trackingNumber: shipmentData.trackingNumber,
      ...
      shipmentStatus: 'CREATED', // Default status for manual shipments
      lastProviderSyncAt: undefined,
      rawProviderResponse: undefined,
    })


+++ SUGGESTED (SIMULATION ONLY) +++

    const initialShipmentStatus = 'CREATED'
    
    const newShipment = await Shipment.create({
      shipmentId: shipmentId,
      prNumber: prNumber,
      shipmentMode: 'MANUAL',
      shipperName: shipmentData.shipperName,
      trackingNumber: shipmentData.trackingNumber,
      ...
      shipmentStatus: initialShipmentStatus,
      unified_shipment_status: mapLegacyToUnifiedShipmentStatus(initialShipmentStatus), // Dual-write on create
      unified_shipment_status_updated_at: new Date(),
      unified_shipment_status_updated_by: 'vendor',
      lastProviderSyncAt: undefined,
      rawProviderResponse: undefined,
    })
    
    console.log(`[createManualShipment] Shipment ${shipmentId} created with dual-write: shipmentStatus=${initialShipmentStatus}`)

────────────────────────────────────────────────────────────────
```

---

### 🔴 CRITICAL — SHIP-C2: API Shipment Creation

```
────────────────────────────────────────────────────────────────
FILE: lib/db/shipment-execution.ts
LINES: 555–570
INJECTION: writeShipmentStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

    // Create shipment record
    const shipment = await Shipment.create({
      shipmentId,
      prNumber: order.pr_number,
      poId: order.purchaseOrderId,
      shipmentMode: 'API',
      providerId: result.providerId,
      providerShipmentReference: result.providerShipmentReference,
      ...
      shipmentStatus: 'CREATED',
      lastProviderSyncAt: new Date(),
      rawProviderResponse: result.rawResponse,
    })


+++ SUGGESTED (SIMULATION ONLY) +++

    const initialShipmentStatus = 'CREATED'
    
    // Create shipment record (dual-write)
    const shipment = await Shipment.create({
      shipmentId,
      prNumber: order.pr_number,
      poId: order.purchaseOrderId,
      shipmentMode: 'API',
      providerId: result.providerId,
      providerShipmentReference: result.providerShipmentReference,
      ...
      shipmentStatus: initialShipmentStatus,
      unified_shipment_status: mapLegacyToUnifiedShipmentStatus(initialShipmentStatus), // Dual-write
      unified_shipment_status_updated_at: new Date(),
      unified_shipment_status_updated_by: 'api-shipment',
      lastProviderSyncAt: new Date(),
      rawProviderResponse: result.rawResponse,
    })

────────────────────────────────────────────────────────────────
```

---

### 🔴 CRITICAL — SHIP-C3: Manual Shipment Status to IN_TRANSIT

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 14303–14310
INJECTION: writeShipmentStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

    // Update shipment status to IN_TRANSIT (vendor marking as shipped)
    await Shipment.updateOne(
      { shipmentId: shipmentId },
      { $set: { shipmentStatus: 'IN_TRANSIT' } }
    )


+++ SUGGESTED (SIMULATION ONLY) +++

    // Update shipment status to IN_TRANSIT (vendor marking as shipped) - dual-write
    await writeShipmentStatusDual({
      shipmentId: shipmentId,
      legacyField: 'shipmentStatus',
      oldValue: currentShipment.shipmentStatus,
      newValue: 'IN_TRANSIT',
      updatedBy: vendorId,
      source: 'updateManualShipmentStatus',
      metadata: { action: 'vendor_ship' }
    })

────────────────────────────────────────────────────────────────
```

---

### 🔴 CRITICAL — SHIP-C4: Bulk Shipment Status to DELIVERED

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 14245–14250
INJECTION: writeShipmentStatusDual() (batch)
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

        // Update all shipments for all PRs under this PO to DELIVERED status
        const shipmentUpdateResult = await Shipment.updateMany(
          { prNumber: { $in: prNumbers }, shipmentStatus: { $ne: 'DELIVERED' } },
          { $set: { shipmentStatus: 'DELIVERED' } }
        )


+++ SUGGESTED (SIMULATION ONLY) +++

        // Update all shipments for all PRs under this PO to DELIVERED status (dual-write)
        // First, get current shipments to log old values
        const shipmentsToUpdate = await Shipment.find({
          prNumber: { $in: prNumbers },
          shipmentStatus: { $ne: 'DELIVERED' }
        }).lean()
        
        for (const shipment of shipmentsToUpdate) {
          await writeShipmentStatusDual({
            shipmentId: shipment.shipmentId,
            legacyField: 'shipmentStatus',
            oldValue: shipment.shipmentStatus,
            newValue: 'DELIVERED',
            updatedBy: 'system',
            source: 'updateSinglePOStatus',
            metadata: { cascade: true, poCompleted: true, prNumber: shipment.prNumber }
          })
        }

────────────────────────────────────────────────────────────────
```

---

### 🔴 CRITICAL — SHIP-C6: Provider Status Sync

```
────────────────────────────────────────────────────────────────
FILE: lib/db/shipment-execution.ts
LINES: 765–790
INJECTION: writeShipmentStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

    // Update shipment
    const updates: any = {
      shipmentStatus: statusResult.status,
      lastProviderSyncAt: new Date(),
      rawProviderResponse: statusResult.rawResponse,
    }
    
    ...
    
    await Shipment.updateOne({ shipmentId }, { $set: updates })


+++ SUGGESTED (SIMULATION ONLY) +++

    // Update shipment (dual-write for status)
    await writeShipmentStatusDual({
      shipmentId: shipmentId,
      legacyField: 'shipmentStatus',
      oldValue: shipment.shipmentStatus,
      newValue: statusResult.status,
      updatedBy: 'provider-sync',
      source: 'syncShipmentStatus',
      metadata: {
        providerId: shipment.providerId,
        providerReference: shipment.providerShipmentReference,
        rawStatus: statusResult.rawResponse?.status
      }
    })
    
    // Update non-status fields separately
    const nonStatusUpdates: any = {
      lastProviderSyncAt: new Date(),
      rawProviderResponse: statusResult.rawResponse,
    }
    
    if (statusResult.trackingNumber) {
      nonStatusUpdates.trackingNumber = statusResult.trackingNumber
    }
    if (statusResult.trackingUrl) {
      nonStatusUpdates.trackingUrl = statusResult.trackingUrl
    }
    
    await Shipment.updateOne({ shipmentId }, { $set: nonStatusUpdates })

────────────────────────────────────────────────────────────────
```

---

## 5. GRN STATUS INTEGRATION DIFFS

### 🔴 CRITICAL — GRN-C1: GRN Creation Initial Status

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 22035–22045
INJECTION: writeGRNStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

  const newGRN = await GRN.create({
    id: grnId,
    grnNumber: grnNumber.trim(),
    grnDate: grnDate,
    poId: po.id,
    vendorId: vendorId,
    ...
    grnRaisedByVendor: true,
    grnAcknowledgedByCompany: false,
    grnStatus: 'RAISED', // Simple approval workflow: start as RAISED
    remarks: remarks?.trim()
  })


+++ SUGGESTED (SIMULATION ONLY) +++

  const initialGRNStatus = 'RAISED'
  
  const newGRN = await GRN.create({
    id: grnId,
    grnNumber: grnNumber.trim(),
    grnDate: grnDate,
    poId: po.id,
    vendorId: vendorId,
    ...
    grnRaisedByVendor: true,
    grnAcknowledgedByCompany: false,
    grnStatus: initialGRNStatus,
    unified_grn_status: mapLegacyToUnifiedGRNStatus(initialGRNStatus), // Dual-write on create
    unified_grn_status_updated_at: new Date(),
    unified_grn_status_updated_by: vendorId,
    remarks: remarks?.trim()
  })
  
  console.log(`[createGRNByVendor] GRN ${grnId} created with dual-write: grnStatus=${initialGRNStatus}`)

────────────────────────────────────────────────────────────────
```

---

### 🔴 CRITICAL — GRN-C2: GRN Acknowledgment (Legacy)

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 22273–22280
INJECTION: writeGRNStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

  // Update GRN
  grn.status = 'ACKNOWLEDGED'
  grn.grnAcknowledgedByCompany = true
  grn.grnAcknowledgedDate = new Date()
  grn.grnAcknowledgedBy = acknowledgedBy.trim()
  
  await grn.save()


+++ SUGGESTED (SIMULATION ONLY) +++

  // Update GRN (dual-write)
  await writeGRNStatusDual({
    grnId: grn.id,
    legacyField: 'status',
    oldValue: grn.status,
    newValue: 'ACKNOWLEDGED',
    updatedBy: acknowledgedBy.trim(),
    source: 'acknowledgeGRN',
    metadata: { legacyWorkflow: true }
  })
  grn.grnAcknowledgedByCompany = true
  grn.grnAcknowledgedDate = new Date()
  grn.grnAcknowledgedBy = acknowledgedBy.trim()
  
  await grn.save()

────────────────────────────────────────────────────────────────
```

---

### 🔴 CRITICAL — GRN-C3: GRN Approval (Simple Workflow)

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 22337–22345
INJECTION: writeGRNStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

  // Update GRN
  grn.grnStatus = 'APPROVED'
  grn.approvedBy = approvedBy.trim()
  grn.approvedAt = new Date()
  
  await grn.save()


+++ SUGGESTED (SIMULATION ONLY) +++

  // Update GRN (dual-write)
  await writeGRNStatusDual({
    grnId: grn.id,
    legacyField: 'grnStatus',
    oldValue: grn.grnStatus,
    newValue: 'APPROVED',
    updatedBy: approvedBy.trim(),
    source: 'approveGRN',
    metadata: { simpleWorkflow: true }
  })
  grn.approvedBy = approvedBy.trim()
  grn.approvedAt = new Date()
  
  await grn.save()

────────────────────────────────────────────────────────────────
```

---

### 🔴 CRITICAL — GRN-C4: GRN Retrofit

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 22424–22435
INJECTION: writeGRNStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

  // Retrofit: If GRN was approved via old workflow but doesn't have grnStatus set, update it
  if (grn.grnStatus !== 'APPROVED' && (grn.grnAcknowledgedByCompany === true || grn.status === 'ACKNOWLEDGED')) {
    grn.grnStatus = 'APPROVED'
    if (!grn.approvedBy && grn.grnAcknowledgedBy) {
      grn.approvedBy = grn.grnAcknowledgedBy
    }
    if (!grn.approvedAt && grn.grnAcknowledgedDate) {
      grn.approvedAt = grn.grnAcknowledgedDate
    }
    await grn.save()
    console.log(`[createInvoiceByVendor] ✅ Retrofit: Updated GRN ${grnId} to have grnStatus = APPROVED`)
  }


+++ SUGGESTED (SIMULATION ONLY) +++

  // Retrofit: If GRN was approved via old workflow but doesn't have grnStatus set, update it (dual-write)
  if (grn.grnStatus !== 'APPROVED' && (grn.grnAcknowledgedByCompany === true || grn.status === 'ACKNOWLEDGED')) {
    await writeGRNStatusDual({
      grnId: grn.id,
      legacyField: 'grnStatus',
      oldValue: grn.grnStatus,
      newValue: 'APPROVED',
      updatedBy: grn.grnAcknowledgedBy || 'system',
      source: 'createInvoiceByVendor',
      metadata: { retrofit: true, legacyApproval: true }
    })
    if (!grn.approvedBy && grn.grnAcknowledgedBy) {
      grn.approvedBy = grn.grnAcknowledgedBy
    }
    if (!grn.approvedAt && grn.grnAcknowledgedDate) {
      grn.approvedAt = grn.grnAcknowledgedDate
    }
    await grn.save()
    console.log(`[createInvoiceByVendor] ✅ Retrofit: Updated GRN ${grnId} to have grnStatus = APPROVED (dual-write)`)
  }

────────────────────────────────────────────────────────────────
```

---

## 6. INVOICE STATUS INTEGRATION DIFFS

### 🔴 CRITICAL — INV-C1: Invoice Creation Initial Status

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 22540–22550
INJECTION: writeInvoiceStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

  const newInvoice = await Invoice.create({
    id: invoiceId,
    invoiceNumber: invoiceNumber.trim(),
    invoiceDate: invoiceDate,
    grnId: grn.id,
    vendorId: vendorId,
    ...
    invoiceItems: invoiceItems,
    invoiceAmount: finalAmount,
    invoiceStatus: 'RAISED',
    raisedBy: vendorId,
    remarks: remarks?.trim(),
  })


+++ SUGGESTED (SIMULATION ONLY) +++

  const initialInvoiceStatus = 'RAISED'
  
  const newInvoice = await Invoice.create({
    id: invoiceId,
    invoiceNumber: invoiceNumber.trim(),
    invoiceDate: invoiceDate,
    grnId: grn.id,
    vendorId: vendorId,
    ...
    invoiceItems: invoiceItems,
    invoiceAmount: finalAmount,
    invoiceStatus: initialInvoiceStatus,
    unified_invoice_status: mapLegacyToUnifiedInvoiceStatus(initialInvoiceStatus), // Dual-write on create
    unified_invoice_status_updated_at: new Date(),
    unified_invoice_status_updated_by: vendorId,
    raisedBy: vendorId,
    remarks: remarks?.trim(),
  })
  
  console.log(`[createInvoiceByVendor] Invoice ${invoiceId} created with dual-write: invoiceStatus=${initialInvoiceStatus}`)

────────────────────────────────────────────────────────────────
```

---

### 🔴 CRITICAL — INV-C2: Invoice Approval

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LINES: 22657–22665
INJECTION: writeInvoiceStatusDual()
────────────────────────────────────────────────────────────────

--- ORIGINAL ---

  // Update invoice
  invoice.invoiceStatus = 'APPROVED'
  invoice.approvedBy = approvedBy.trim()
  invoice.approvedAt = new Date()
  
  await invoice.save()


+++ SUGGESTED (SIMULATION ONLY) +++

  // Update invoice (dual-write)
  await writeInvoiceStatusDual({
    invoiceId: invoice.id,
    legacyField: 'invoiceStatus',
    oldValue: invoice.invoiceStatus,
    newValue: 'APPROVED',
    updatedBy: approvedBy.trim(),
    source: 'approveInvoice',
    metadata: { }
  })
  invoice.approvedBy = approvedBy.trim()
  invoice.approvedAt = new Date()
  
  await invoice.save()

────────────────────────────────────────────────────────────────
```

---

## 7. IMPORT STATEMENT ADDITIONS

### Required Imports for lib/db/data-access.ts

```
────────────────────────────────────────────────────────────────
FILE: lib/db/data-access.ts
LOCATION: Top of file (after existing imports)
────────────────────────────────────────────────────────────────

+++ SUGGESTED IMPORT (SIMULATION ONLY) +++

// Dual-write wrapper imports for unified status migration
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

────────────────────────────────────────────────────────────────
```

---

### Required Imports for lib/db/shipment-execution.ts

```
────────────────────────────────────────────────────────────────
FILE: lib/db/shipment-execution.ts
LOCATION: Top of file (after existing imports)
────────────────────────────────────────────────────────────────

+++ SUGGESTED IMPORT (SIMULATION ONLY) +++

// Dual-write wrapper imports for unified status migration
import {
  writeOrderStatusDual,
  writeShipmentStatusDual,
  mapLegacyToUnifiedShipmentStatus,
} from '@/migrations/dualwrite/status-dualwrite-wrapper'

────────────────────────────────────────────────────────────────
```

---

## Summary of Simulated Changes

### Files Affected (Simulation Only)

| File | Critical Diffs | High Diffs | Total |
|------|---------------|------------|-------|
| `lib/db/data-access.ts` | 28 | 4 | 32 |
| `lib/db/shipment-execution.ts` | 4 | 2 | 6 |
| **TOTAL** | **32** | **6** | **38** |

### Wrapper Function Usage (Simulation Only)

| Wrapper Function | Usage Count |
|-----------------|-------------|
| `writeOrderStatusDual()` | 18 |
| `writePRStatusDual()` | 8 |
| `writePOStatusDual()` | 3 |
| `writeShipmentStatusDual()` | 6 |
| `writeGRNStatusDual()` | 4 |
| `writeInvoiceStatusDual()` | 2 |
| **TOTAL** | **41** |

---

## ⚠️ REMINDER

This document is a **SIMULATION ONLY**.

No code has been modified. No files have been changed. No imports have been added.

This is a planning document to:
1. Visualize the integration approach
2. Review the scope of changes
3. Identify potential issues before implementation
4. Prepare for the actual integration phase

---

## Next Steps (Post-Simulation)

1. ☐ Review all simulated diffs
2. ☐ Validate wrapper function signatures
3. ☐ Confirm mapping function availability
4. ☐ Plan integration order (by risk level)
5. ☐ Schedule integration window
6. ☐ Prepare rollback scripts
7. ☐ Enable observation mode first

---

**END OF SIMULATED INTEGRATION DIFF**

*Document generated: 2026-01-15*  
*Status: SIMULATION MODE — NO CODE CHANGES APPLIED*
