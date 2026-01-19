# Pre-Workflow Unification Backup

**Created:** 2026-01-15T21:11:10  
**Purpose:** Full backup before implementing unified workflow status fields

---

## 📦 What's Being Backed Up

This backup captures the complete state of the application BEFORE implementing:
1. Unified status fields for all workflow entities
2. Dual-write logic for backward compatibility
3. Centralized status engine (`/lib/workflow/status-engine.ts`)

---

## 📁 Backup Contents

### Application Files

```
application/
├── lib/
│   ├── models/
│   │   ├── Order.ts           # Will add: unified_status, unified_pr_status
│   │   ├── PurchaseOrder.ts   # Will add: unified_po_status
│   │   ├── Shipment.ts        # Will add: unified_shipment_status
│   │   ├── GRN.ts             # Will add: unified_grn_status
│   │   ├── Invoice.ts         # Will add: unified_invoice_status
│   │   └── IndentHeader.ts    # Reference only
│   └── db/
│       ├── data-access.ts     # Will redirect status updates to status-engine
│       ├── shipment-execution.ts
│       └── indent-workflow.ts
└── app/
    └── api/
        ├── prs/               # PR shipment routes
        ├── orders/            # Order routes
        ├── shipments/         # Shipment routes
        ├── grns/              # GRN routes
        ├── invoices/          # Invoice routes
        └── purchase-orders/   # PO routes
```

### Database Collections

| Collection | Documents | Workflow? | Notes |
|------------|-----------|-----------|-------|
| orders | 78 | 🔶 Yes | Will add unified_status, unified_pr_status fields |
| purchaseorders | 61 | 🔶 Yes | Will add unified_po_status field |
| shipments | 60 | 🔶 Yes | Will add unified_shipment_status field |
| grns | 14 | 🔶 Yes | Will add unified_grn_status field |
| invoices | 8 | 🔶 Yes | Will add unified_invoice_status field |
| poorders | 72 | 🔶 Yes | Junction table (no status changes) |
| companies | 3 | 🔶 Yes | Reference data |
| vendors | 3 | 🔶 Yes | Reference data |
| employees | 34 | 🔶 Yes | Reference data |
| vendorinventories | 15 | 🔶 Yes | Reference data |

**Total: 41 collections, 619 documents**

---

## 🔄 Changes to Implement

### New Fields (ADDITIVE - no removals)

| Entity | New Field | Type | Purpose |
|--------|-----------|------|---------|
| Order | `unified_status` | String | Unified order status |
| Order | `unified_pr_status` | String | Unified PR status |
| Order | `unified_status_updated_at` | Date | Audit timestamp |
| Order | `unified_pr_status_updated_at` | Date | Audit timestamp |
| PurchaseOrder | `unified_po_status` | String | Unified PO status |
| PurchaseOrder | `unified_po_status_updated_at` | Date | Audit timestamp |
| Shipment | `unified_shipment_status` | String | Unified shipment status |
| Shipment | `unified_shipment_status_updated_at` | Date | Audit timestamp |
| GRN | `unified_grn_status` | String | Unified GRN status |
| GRN | `unified_grn_status_updated_at` | Date | Audit timestamp |
| Invoice | `unified_invoice_status` | String | Unified invoice status |
| Invoice | `unified_invoice_status_updated_at` | Date | Audit timestamp |

### New File

- `/lib/workflow/status-engine.ts` - Centralized status management

### Modified Files (DUAL-WRITE only)

All status updates will write to BOTH:
1. Legacy field (e.g., `status`, `pr_status`)
2. New unified field (e.g., `unified_status`, `unified_pr_status`)

---

## 🔙 How to Restore

### Option 1: Restore Application Files

```powershell
cd "c:\Users\pagrawal\OneDrive - CSG Systems Inc\Personal\Cursor AI\uniform-distribution-system"

# Restore model files
Copy-Item "backups\backup-pre-workflow-unification-2026-01-15T21-11-10\application\lib\models\*" -Destination "lib\models\" -Force

# Restore data-access files
Copy-Item "backups\backup-pre-workflow-unification-2026-01-15T21-11-10\application\lib\db\*" -Destination "lib\db\" -Force

# Restore API routes
Copy-Item "backups\backup-pre-workflow-unification-2026-01-15T21-11-10\application\app\api\*" -Destination "app\api\" -Recurse -Force

# Delete new workflow directory if created
Remove-Item "lib\workflow" -Recurse -Force -ErrorAction SilentlyContinue
```

### Option 2: Restore Database

```bash
# Using mongorestore (if MongoDB Tools installed)
mongorestore --uri="mongodb://localhost:27017/uniform-distribution" \
  "backups/backup-pre-workflow-unification-2026-01-15T21-11-10/database"

# Or restore individual collections from JSON files
node scripts/restore-collection.js orders
node scripts/restore-collection.js purchaseorders
# etc.
```

---

## ⚠️ Important Notes

1. **NO BREAKING CHANGES** - All changes are additive
2. **DUAL-WRITE** - Both old and new fields are always updated
3. **READ LOGIC UNCHANGED** - Only write paths are modified
4. **BACKWARD COMPATIBLE** - Legacy code continues to work

---

## 📋 Verification Checklist

Before proceeding with implementation, verify:

- [x] Application files backed up
- [x] Database backed up (619 documents)
- [x] Backup manifest created
- [ ] Backup verified (can restore if needed)

---

## 🚀 Ready to Proceed

Once verified, implementation will:

1. Create `/lib/workflow/status-engine.ts`
2. Add new fields to models (Order, PurchaseOrder, Shipment, GRN, Invoice)
3. Update data-access.ts to use dual-write via status-engine
4. Add console.warn for inconsistency detection

**All changes are SAFE and REVERSIBLE.**
