# Phase 2 — Data Verification Execution Guide

## Overview

This guide provides step-by-step instructions for executing Phase 2 data verification checks for the SAFE_MODE deactivation process.

**Version:** 1.0.0  
**Created:** 2026-01-15  
**Status:** Ready for Execution

---

## Prerequisites

Before running Phase 2 verification:

| Requirement | Status | How to Check |
|-------------|--------|--------------|
| Node.js v18+ | Required | `node --version` |
| npm installed | Required | `npm --version` |
| dotenv package | Required | `npm list dotenv` |
| mongodb package | Required | `npm list mongodb` |
| mongoose package | Required | `npm list mongoose` |
| MongoDB access | Required | Connection string in `.env` |

---

## Quick Start

```bash
# 1. Navigate to project root
cd /path/to/uniform-distribution-system

# 2. Install dependencies (if not installed)
npm install dotenv mongodb mongoose --save-dev

# 3. Create .env file (see Connection Examples below)
echo "MONGODB_URI=your-connection-string" > .env

# 4. Validate environment
DRY_RUN=true node scripts/phase2/validate-env.js

# 5. Test read-only connection
DRY_RUN=true node scripts/phase2/mongo-bootstrap.js

# 6. Run Phase 2 verification
DRY_RUN=true node scripts/phase2/phase2-runner.js

# 7. Review results
cat reports/phase2-results.json
```

---

## Connection Examples

### Local MongoDB

```bash
# .env file
MONGODB_URI=mongodb://localhost:27017/uds
```

### MongoDB Atlas

```bash
# .env file
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/uds?retryWrites=false&w=majority
```

### Docker MongoDB

```bash
# Start MongoDB container
docker run -d --name mongodb -p 27017:27017 mongo:6.0

# .env file
MONGODB_URI=mongodb://localhost:27017/uds
```

### MongoDB with Authentication

```bash
# .env file
MONGODB_URI=mongodb://admin:password@localhost:27017/uds?authSource=admin
```

---

## Safety Features

### DRY_RUN Gate

All scripts require `DRY_RUN=true` to execute. This is a safety measure to prevent accidental database modifications.

```bash
# ✅ Correct - DRY_RUN enabled
DRY_RUN=true node scripts/phase2/phase2-runner.js

# ❌ Blocked - DRY_RUN not set
node scripts/phase2/phase2-runner.js
# Error: DRY_RUN must be set to "true" to proceed
```

### Read-Only Mode

The `mongo-bootstrap.js` module enforces read-only mode:

| Protection | Description |
|------------|-------------|
| `readPreference: 'secondaryPreferred'` | Prefer replica reads |
| `retryWrites: false` | No automatic retry of writes |
| `maxPoolSize: 2` | Minimal connection pool |
| Blocked operations | insertOne, updateOne, deleteOne, etc. |

### Blocked Operations

The following operations are blocked and will throw errors:

- `insertOne`, `insertMany`
- `updateOne`, `updateMany`
- `replaceOne`
- `deleteOne`, `deleteMany`
- `findOneAndUpdate`, `findOneAndReplace`, `findOneAndDelete`
- `bulkWrite`
- `drop`, `dropCollection`, `dropDatabase`
- `createIndex`, `dropIndex`, `dropIndexes`
- `rename`

---

## Phase 2 Checks

### Check 1: Unified Coverage

**Purpose:** Verify that unified status fields are populated for all entities.

**Pass Criteria:** ≥ 99.9% coverage for all entities

| Entity | Legacy Field | Unified Field |
|--------|--------------|---------------|
| Orders | `status` | `unified_status` |
| PRs | `pr_status` | `unified_pr_status` |
| PurchaseOrders | `po_status` | `unified_po_status` |
| GRNs | `status`, `grnStatus` | `unified_grn_status` |
| Invoices | `invoiceStatus` | `unified_invoice_status` |

### Check 2: Status Mismatches

**Purpose:** Detect records where legacy and unified statuses don't align.

**Pass Criteria:** 0 mismatches

**Status Mappings:**
```
Order:
  'Awaiting approval' → 'PENDING_APPROVAL'
  'Awaiting fulfilment' → 'IN_FULFILMENT'
  'Dispatched' → 'DISPATCHED'
  'Delivered' → 'DELIVERED'

PR:
  'REJECTED_BY_SITE_ADMIN' → 'REJECTED'
  'REJECTED_BY_COMPANY_ADMIN' → 'REJECTED'
  'PO_CREATED' → 'LINKED_TO_PO'
```

### Check 3: Cascade Integrity

**Purpose:** Verify that status cascades completed successfully.

**Pass Criteria:** 0 incomplete cascades

**Cascade Paths Checked:**
- Order delivered → unified_status = DELIVERED
- Order dispatched → unified_status = DISPATCHED
- PR fully delivered → unified_pr_status = FULLY_DELIVERED
- Shipment delivered → Order unified_status = DELIVERED

### Check 4: Orphan Relationships

**Purpose:** Detect broken relationships between entities.

**Pass Criteria:** 0 orphaned records (or documented exceptions)

**Relationships Checked:**
- Shipments → Orders (via prNumber)
- PRs with shipment status → Shipments
- GRNs → PurchaseOrders (via poNumber)
- Invoices → GRNs (via grnId)

### Check 5: ObjectId/Hex Remnants

**Purpose:** Detect any remaining ObjectId or hex-string IDs.

**Pass Criteria:** 0 hex string remnants (excluding `_id`)

**Fields Checked:**
- employees.id, employees.companyId
- orders.id, orders.employeeId, orders.companyId, orders.vendorId
- vendors.id
- productvendors.productId, productvendors.vendorId
- vendorinventories.vendorId, vendorinventories.productId
- shipments.id, shipments.vendorId

### Check 6: Database Health

**Purpose:** Verify database connectivity and basic health.

**Pass Criteria:** Database responding and collections accessible

**Checks:**
- Ping response
- Collection document counts
- Connection pool status

---

## Output Files

| File | Description |
|------|-------------|
| `reports/env-validation-results.json` | Environment validation results |
| `reports/phase2-results.json` | Full Phase 2 verification results |

### Results Structure

```json
{
  "metadata": {
    "version": "1.0.0",
    "executedAt": "2026-01-15T12:00:00.000Z",
    "mode": "DRY_RUN",
    "status": "COMPLETED"
  },
  "checks": {
    "unifiedCoverage": { "status": "PASS", ... },
    "statusMismatches": { "status": "PASS", ... },
    "cascadeIntegrity": { "status": "PASS", ... },
    "orphanRelationships": { "status": "PASS", ... },
    "objectIdRemnants": { "status": "PASS", ... },
    "databaseHealth": { "status": "PASS", ... }
  },
  "summary": {
    "totalChecks": 6,
    "passed": 6,
    "failed": 0,
    "warnings": 0,
    "overallStatus": "PASS"
  }
}
```

---

## Pass/Fail Criteria

### All Checks Must Pass

| Check | Pass Criteria | Action if Failed |
|-------|---------------|------------------|
| Unified Coverage | ≥ 99.9% | Run migration-03 to backfill |
| Status Mismatches | 0 mismatches | Review and fix manually |
| Cascade Integrity | 0 incomplete | Investigate cascade logic |
| Orphan Relationships | 0 orphans | Run cleanup or document |
| ObjectId Remnants | 0 hex strings | Run ID migration script |
| Database Health | PASS | Check connection/credentials |

### Overall Status

| Condition | Status | Next Step |
|-----------|--------|-----------|
| All 6 checks PASS | ✅ READY | Proceed to Phase 3 |
| Any check FAIL | ❌ BLOCKED | Fix issues before proceeding |
| Warnings only | ⚠️ REVIEW | Document and get approval |

---

## Troubleshooting

### Error: DRY_RUN must be set to "true"

```bash
# Fix: Set DRY_RUN environment variable
DRY_RUN=true node scripts/phase2/phase2-runner.js
```

### Error: Cannot find module 'dotenv'

```bash
# Fix: Install dotenv
npm install dotenv --save-dev
```

### Error: MONGODB_URI environment variable is not set

```bash
# Fix: Create .env file with connection string
echo "MONGODB_URI=mongodb://localhost:27017/uds" > .env
```

### Error: Database connection failed

1. Check if MongoDB is running
2. Verify connection string format
3. Check network connectivity
4. Verify credentials (if using authentication)

```bash
# Test MongoDB connection
mongosh "mongodb://localhost:27017/uds" --eval "db.runCommand({ping:1})"
```

### Error: Read-only violation

This error indicates the script attempted a write operation. This should not happen with the provided scripts. If it does:

1. Do not proceed
2. Report the issue
3. Review the script that triggered the error

---

## Security Considerations

1. **Never commit `.env` files** - Add `.env` to `.gitignore`
2. **Use least-privilege accounts** - Create read-only database user
3. **Audit access** - Review who has access to connection strings
4. **Rotate credentials** - Change passwords after sharing

### Creating a Read-Only MongoDB User

```javascript
// Connect as admin
use admin

// Create read-only user for Phase 2
db.createUser({
  user: "phase2_readonly",
  pwd: "secure_password",
  roles: [
    { role: "read", db: "uds" }
  ]
})
```

---

## Execution Checklist

Before running Phase 2:

- [ ] Backup database (if not already done)
- [ ] Verify MongoDB is accessible
- [ ] Create `.env` file with `MONGODB_URI`
- [ ] Install required packages (dotenv, mongodb, mongoose)
- [ ] Run validate-env.js successfully
- [ ] Run mongo-bootstrap.js successfully
- [ ] Confirm DRY_RUN=true is set

After running Phase 2:

- [ ] Review `reports/phase2-results.json`
- [ ] Verify all checks passed
- [ ] Document any warnings or exceptions
- [ ] Save results for audit trail
- [ ] Get sign-off from team lead

---

## Support

If you encounter issues not covered in this guide:

1. Check the error message carefully
2. Review the scripts for comments
3. Check MongoDB logs for connection issues
4. Verify all prerequisites are met

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-15 | Initial release |

---

*Document generated as part of UDS Unified Workflow Migration Project*
