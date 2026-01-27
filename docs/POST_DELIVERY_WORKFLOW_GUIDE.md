# Post-Delivery Workflow Extension for Manual Orders

## Overview

This document describes the extension that enables GRN (Goods Receipt Note) and Invoice creation for **Manual Orders** - orders that were created without going through the PR → PO workflow.

### Background

The UDS application has two order creation paths:

1. **PR → PO Workflow**: Orders go through Purchase Requisition → Purchase Order flow
   - Already supports: Delivery → GRN → Invoice
   
2. **Manual Order Workflow**: Orders created directly without PR/PO
   - Previously stopped at "Delivered" state
   - **Now supports**: Delivery → GRN → Invoice (via this extension)

## Key Principle: Shared Post-Delivery Layer

After delivery, both workflows converge into a **shared post-delivery layer**:

```
PR → PO Workflow:    PR → PO → Delivery → GRN → Invoice
Manual Workflow:     Order → Delivery → GRN → Invoice
                                        ↑
                           Shared Post-Delivery Layer
```

## Implementation Details

### 1. Source Type Field

A new `sourceType` field has been added to identify order origin:

```typescript
// In Order model
sourceType?: 'PR_PO' | 'MANUAL'
```

- `'PR_PO'`: Order from PR → PO workflow (uses PO for GRN)
- `'MANUAL'`: Direct order without PO (uses orderId for GRN)

This field is **automatically set during order creation** based on company's `enable_pr_po_workflow` setting.

### 2. Extended GRN Model

The GRN model now supports both workflows:

```typescript
// New fields in GRN model
orderId?: string        // Direct order reference (for MANUAL orders)
sourceType?: 'PR_PO' | 'MANUAL'  // GRN source type

// poNumber is now optional (sparse unique index)
poNumber?: string       // Required for PR_PO, null for MANUAL
```

**Key Constraints:**
- `poNumber` has a **sparse unique index** (only enforced when present)
- `orderId` has a **sparse unique index** (only enforced when present)
- One GRN per PO (for PR_PO orders)
- One GRN per Order (for MANUAL orders)

### 3. Extended Invoice Model

The Invoice model also supports both workflows:

```typescript
// New fields in Invoice model
orderId?: string        // Direct order reference (for MANUAL orders)
sourceType?: 'PR_PO' | 'MANUAL'

// poNumber is now optional
poNumber?: string       // May be null for MANUAL orders
```

## API Changes

### GET /api/vendor/grns

New query parameter values for `type`:

| Type | Description |
|------|-------------|
| `eligible` | POs eligible for GRN (PR→PO workflow only) |
| `manual-eligible` | Manual orders eligible for GRN (**NEW**) |
| `all-eligible` | Both POs and manual orders eligible (**NEW**) |
| `my-grns` | GRNs raised by the vendor (default) |

**Example:**
```
GET /api/vendor/grns?vendorId=123456&type=manual-eligible
GET /api/vendor/grns?vendorId=123456&type=all-eligible
```

### POST /api/vendor/grns

Now supports two request formats:

**For PR → PO workflow (existing):**
```json
{
  "poNumber": "PO-123456",
  "grnNumber": "GRN-001",
  "grnDate": "2026-01-26",
  "vendorId": "123456",
  "remarks": "Optional remarks"
}
```

**For Manual Orders (NEW):**
```json
{
  "orderId": "ORD-123456-ABC",
  "grnNumber": "GRN-002",
  "grnDate": "2026-01-26",
  "vendorId": "123456",
  "sourceType": "MANUAL",
  "remarks": "Optional remarks"
}
```

The API automatically determines the workflow based on:
1. If `sourceType: 'MANUAL'` is provided → Manual order workflow
2. If `orderId` is provided without `poNumber` → Manual order workflow
3. If `poNumber` is provided → PR→PO workflow

## Eligibility Criteria

### For GRN Creation

**PR → PO Orders:**
- PO must be `FULLY_DELIVERED`
- All linked PRs must have `deliveryStatus = 'DELIVERED'`
- No existing GRN for the PO

**Manual Orders:**
- Order must have `deliveryStatus = 'DELIVERED'` (or `unified_status = 'DELIVERED'`)
- Order must NOT be linked to a PO (no POOrder mapping)
- All items must have `deliveredQuantity >= orderedQuantity`
- No existing GRN for the order

### For Invoice Creation

Same for both workflows:
- GRN must be `APPROVED` (or `grnAcknowledgedByCompany = true`)
- No existing invoice for the GRN

## Data Access Functions

### New Functions

```typescript
// Get manual orders eligible for GRN
getManualOrdersEligibleForGRN(vendorId: string): Promise<any[]>

// Create GRN for a manual order
createGRNForManualOrder(
  orderId: string,
  grnNumber: string,
  grnDate: Date,
  vendorId: string,
  remarks?: string
): Promise<any>
```

### Existing Functions (Unchanged)

```typescript
// PR → PO workflow (unchanged)
getPOsEligibleForGRN(vendorId: string): Promise<any[]>
createGRNByVendor(poNumber, grnNumber, grnDate, vendorId, remarks?): Promise<any>

// Invoice creation (works for both, minor enhancement)
createInvoiceByVendor(grnId, ...): Promise<any>
```

## Backward Compatibility

### No Breaking Changes

1. **Existing APIs**: All existing API contracts remain unchanged
2. **Existing Data**: No migration required for existing orders
3. **PR → PO Workflow**: Continues to work exactly as before
4. **Optional Fields**: All new fields are optional with sensible defaults

### Existing Orders Behavior

- Orders created **before** this extension will have `sourceType = undefined`
- These orders are treated as **legacy orders**
- To enable GRN for existing delivered manual orders:
  - Option 1: Leave as-is (not GRN eligible)
  - Option 2: Update `sourceType = 'MANUAL'` for orders that should be eligible

## UI Integration Notes

### Vendor Dashboard

Vendors should see GRN/Invoice buttons based on:

1. **GRN Button**:
   - Show for POs that are `FULLY_DELIVERED` without existing GRN
   - Show for Manual Orders that are `DELIVERED` without existing GRN

2. **Invoice Button**:
   - Show only when GRN is `APPROVED`
   - Show only when no existing Invoice for the GRN

### Example UI Logic

```typescript
// Check if can create GRN
const canCreateGRN = (item) => {
  if (item.sourceType === 'MANUAL') {
    return item.deliveryStatus === 'DELIVERED' && !item.hasGRN;
  } else {
    return item.shippingStatus === 'FULLY_DELIVERED' && !item.hasGRN;
  }
};

// Check if can create Invoice  
const canCreateInvoice = (grn) => {
  return (grn.grnStatus === 'APPROVED' || grn.grnAcknowledgedByCompany) 
         && !grn.invoiceId;
};
```

## Testing Checklist

### Manual Order GRN Flow

- [ ] Create order with `enable_pr_po_workflow = false`
- [ ] Verify order has `sourceType = 'MANUAL'`
- [ ] Mark order as delivered
- [ ] Verify order appears in `type=manual-eligible` response
- [ ] Create GRN for manual order
- [ ] Verify GRN has `sourceType = 'MANUAL'` and `orderId`
- [ ] Verify GRN does NOT have `poNumber`
- [ ] Approve GRN
- [ ] Create Invoice from GRN
- [ ] Verify Invoice has `sourceType = 'MANUAL'` and `orderId`

### PR → PO Flow (Regression)

- [ ] Verify existing PR → PO workflow still works
- [ ] Verify PO-based GRN creation unchanged
- [ ] Verify Invoice creation from PO-based GRN unchanged

### API Compatibility

- [ ] `type=eligible` returns only POs (not manual orders)
- [ ] `type=manual-eligible` returns only manual orders
- [ ] `type=all-eligible` returns both with correct `sourceType`
- [ ] `type=my-grns` returns all vendor GRNs (both types)

## Schema Changes Summary

### Order Model
```diff
+ sourceType?: 'PR_PO' | 'MANUAL'
```

### GRN Model
```diff
- poNumber: string (required)
+ poNumber?: string (optional, sparse unique index)
+ orderId?: string (sparse unique index)
+ sourceType?: 'PR_PO' | 'MANUAL'
```

### Invoice Model
```diff
- poNumber: string (required)
+ poNumber?: string (optional)
+ orderId?: string
+ sourceType?: 'PR_PO' | 'MANUAL'
```

## Error Messages

| Scenario | Error Message |
|----------|---------------|
| Manual order not delivered | "Order {orderId} is not fully delivered (current status: {status}). Order must be fully delivered before creating GRN." |
| Order has PO link | "Order {orderId} is linked to PO. Use the standard GRN creation flow for PR→PO orders." |
| GRN already exists | "GRN already exists for order {orderId}. Only one GRN per order is allowed." |
| Item not fully delivered | "Order {orderId} item {itemName} has delivered quantity ({delivered}) less than ordered quantity ({ordered}). All items must be fully delivered before creating GRN." |

## Notes for Developers

1. **Feature Flag Compatibility**: This extension works with `DUAL_WRITE_ENABLED` flag for unified status fields.

2. **Email Notifications**: GRN/Invoice creation for manual orders sends the same notifications as PR→PO, with order ID shown instead of PO number.

3. **No Data Migration Required**: Existing orders and GRNs are not affected. New fields are optional.

4. **Index Changes**: New sparse indexes added for `orderId` on GRN model. These are non-breaking.
