# Workflow Rejection Framework - Design Document

## Overview

This document describes the **configuration-driven rejection framework** for the Uniform Distribution System (UDS). The framework is designed to be:

- **Flexible**: Workflows are configurable per company and entity type
- **Entity-Agnostic**: Works with Order, GRN, Invoice, and future entities
- **Scalable**: Supports 1-stage, 2-stage, or N-stage workflows
- **Enterprise-Grade**: Provides audit trails, analytics, and extensibility

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Collection Schemas](#collection-schemas)
3. [Example Configurations](#example-configurations)
4. [Example Rejection Documents](#example-rejection-documents)
5. [Entity Updates](#entity-updates)
6. [Index Recommendations](#index-recommendations)
7. [Usage Patterns](#usage-patterns)
8. [Flexibility Explanation](#flexibility-explanation)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        WORKFLOW FRAMEWORK                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────┐     ┌──────────────────────┐                  │
│  │ WorkflowConfiguration │     │   WorkflowRejection   │                 │
│  │    (Per Company)      │     │   (Entity-Agnostic)   │                 │
│  │                       │     │                       │                 │
│  │ - entityType          │     │ - entityType          │                 │
│  │ - stages[]            │────▶│ - entityId            │                 │
│  │ - statusMappings      │     │ - workflowStage       │                 │
│  │ - allowedRoles        │     │ - reasonCode          │                 │
│  └──────────────────────┘     │ - rejectedBy          │                 │
│                                │ - previousStatus      │                 │
│                                └──────────────────────┘                 │
│                                           │                              │
│                                           ▼                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                         │
│  │   Order    │  │    GRN     │  │  Invoice   │  (Entity Collections)   │
│  │            │  │            │  │            │                         │
│  │ - status   │  │ - status   │  │ - status   │  ← Lean documents       │
│  │ - stage    │  │ - stage    │  │ - stage    │    (no rejection data)  │
│  └────────────┘  └────────────┘  └────────────┘                         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Collection Schemas

### A. WorkflowConfiguration Collection

**Purpose**: Define approval flows per company and entity type.

**File**: `lib/models/WorkflowConfiguration.ts`

```typescript
interface IWorkflowConfiguration {
  id: string                    // Unique configuration ID
  companyId: string             // Company this config belongs to
  entityType: string            // ORDER | GRN | INVOICE | PURCHASE_ORDER | RETURN_REQUEST
  workflowName: string          // Human-readable name
  workflowDescription?: string  // Optional description
  
  stages: IWorkflowStage[]      // Ordered array of workflow stages
  
  version: number               // Configuration version
  isActive: boolean             // Whether currently active
  isDefault?: boolean           // Template for new companies
  
  // Status mappings
  statusOnSubmission?: string
  statusOnApproval?: Record<string, string>   // stageKey → status
  statusOnRejection?: Record<string, string>  // stageKey → status
  
  createdAt?: Date
  updatedAt?: Date
}

interface IWorkflowStage {
  stageKey: string              // e.g., LOCATION_APPROVAL, COMPANY_APPROVAL
  stageName: string             // Human-readable name
  stageDescription?: string     // Optional description
  allowedRoles: string[]        // Roles that can act at this stage
  order: number                 // Execution order (1-based)
  canApprove: boolean           // Whether stage can approve
  canReject: boolean            // Whether stage can reject
  isTerminal: boolean           // Whether this is final stage
  isOptional?: boolean          // Can be skipped
  timeoutHours?: number         // Auto-escalation (future)
  escalateTo?: string           // Escalation target (future)
}
```

### B. WorkflowRejection Collection (Central, Entity-Agnostic)

**Purpose**: Store all rejections for all entity types in a single collection.

**File**: `lib/models/WorkflowRejection.ts`

```typescript
interface IWorkflowRejection {
  id: string                    // Unique rejection ID
  
  // Entity reference (polymorphic)
  companyId: string             // Company ID
  entityType: string            // ORDER | GRN | INVOICE | etc.
  entityId: string              // Reference to entity's ID
  
  // Workflow context
  workflowConfigId?: string     // Reference to workflow config
  workflowStage: string         // Stage where rejection occurred
  workflowVersion?: number      // Workflow version at rejection time
  
  // Rejection details
  action: string                // REJECT | SEND_BACK | CANCEL | HOLD
  reasonCode: string            // Configurable reason code
  reasonLabel?: string          // Human-readable reason
  remarks?: string              // Free-text comments
  
  // Who rejected
  rejectedBy: string            // User ID
  rejectedByRole: string        // LOCATION_ADMIN | COMPANY_ADMIN | etc.
  rejectedByName?: string       // Denormalized name
  
  // State snapshot
  previousStatus: string        // Status before rejection
  previousStage?: string        // Previous workflow stage
  newStatus: string             // Status after rejection
  
  // Entity snapshot (for audit)
  entitySnapshot?: {
    employeeId?: string
    employeeName?: string
    totalAmount?: number
    pr_number?: string
    // ... extensible
  }
  
  // Resolution tracking
  isResolved?: boolean
  resolvedAt?: Date
  resolvedBy?: string
  resolutionAction?: string
  resolutionRemarks?: string
  
  // Metadata
  metadata?: {
    clientIp?: string
    source?: string             // WEB | API | MOBILE | SYSTEM
    // ... extensible
  }
  
  rejectedAt: Date
  createdAt?: Date
  updatedAt?: Date
}
```

### C. Entity Collections (Order / GRN / Invoice)

Entities should **ONLY** store minimal workflow fields:

```typescript
// Add to existing Order/GRN/Invoice interfaces
{
  // Existing fields...
  
  // NEW: Workflow tracking (minimal)
  currentWorkflowStage?: string     // Current stage key
  workflowConfigId?: string         // Reference to active workflow config
  workflowConfigVersion?: number    // Version for audit trail
}
```

**Important**: No rejection reason, role, or remarks should be embedded in entity documents.

---

## Example Configurations

### Company A: Location Admin → Company Admin (2-Stage Workflow)

```json
{
  "id": "WFC-100001-ORDER-001",
  "companyId": "100001",
  "entityType": "ORDER",
  "workflowName": "Two-Stage Order Approval",
  "workflowDescription": "Orders require Location Admin approval followed by Company Admin approval",
  "stages": [
    {
      "stageKey": "LOCATION_APPROVAL",
      "stageName": "Location Admin Approval",
      "stageDescription": "First-level approval by site/location admin",
      "allowedRoles": ["LOCATION_ADMIN", "SITE_ADMIN"],
      "order": 1,
      "canApprove": true,
      "canReject": true,
      "isTerminal": false
    },
    {
      "stageKey": "COMPANY_APPROVAL",
      "stageName": "Company Admin Approval",
      "stageDescription": "Final approval by company admin",
      "allowedRoles": ["COMPANY_ADMIN"],
      "order": 2,
      "canApprove": true,
      "canReject": true,
      "isTerminal": true
    }
  ],
  "version": 1,
  "isActive": true,
  "statusOnSubmission": "PENDING_LOCATION_APPROVAL",
  "statusOnApproval": {
    "LOCATION_APPROVAL": "PENDING_COMPANY_APPROVAL",
    "COMPANY_APPROVAL": "APPROVED"
  },
  "statusOnRejection": {
    "LOCATION_APPROVAL": "REJECTED_BY_LOCATION_ADMIN",
    "COMPANY_APPROVAL": "REJECTED_BY_COMPANY_ADMIN"
  }
}
```

### Company B: Company Admin Only (1-Stage Workflow)

```json
{
  "id": "WFC-100002-ORDER-001",
  "companyId": "100002",
  "entityType": "ORDER",
  "workflowName": "Single-Stage Order Approval",
  "workflowDescription": "Orders require only Company Admin approval",
  "stages": [
    {
      "stageKey": "COMPANY_APPROVAL",
      "stageName": "Company Admin Approval",
      "stageDescription": "Direct approval by company admin",
      "allowedRoles": ["COMPANY_ADMIN"],
      "order": 1,
      "canApprove": true,
      "canReject": true,
      "isTerminal": true
    }
  ],
  "version": 1,
  "isActive": true,
  "statusOnSubmission": "PENDING_COMPANY_APPROVAL",
  "statusOnApproval": {
    "COMPANY_APPROVAL": "APPROVED"
  },
  "statusOnRejection": {
    "COMPANY_APPROVAL": "REJECTED"
  }
}
```

---

## Example Rejection Documents

### Order Rejected at Location Admin Stage

```json
{
  "id": "REJ-LXN1234-ABC",
  "companyId": "100001",
  "entityType": "ORDER",
  "entityId": "ORD-1706000001",
  "workflowConfigId": "WFC-100001-ORDER-001",
  "workflowStage": "LOCATION_APPROVAL",
  "workflowVersion": 1,
  "action": "REJECT",
  "reasonCode": "ELIGIBILITY_EXHAUSTED",
  "reasonLabel": "Employee eligibility exhausted",
  "remarks": "Employee has already consumed their annual uniform quota. Please verify eligibility before resubmitting.",
  "rejectedBy": "LA-100001-001",
  "rejectedByRole": "LOCATION_ADMIN",
  "rejectedByName": "Anjali Sharma",
  "previousStatus": "PENDING_LOCATION_APPROVAL",
  "newStatus": "REJECTED_BY_LOCATION_ADMIN",
  "entitySnapshot": {
    "employeeId": "EMP-BLR-001",
    "employeeName": "Rahul Kumar",
    "pr_number": "PR-2026-00123",
    "totalAmount": 5000
  },
  "metadata": {
    "source": "WEB",
    "clientIp": "192.168.1.100"
  },
  "rejectedAt": "2026-01-21T10:30:00.000Z",
  "isResolved": false
}
```

### Order Rejected at Company Admin Stage

```json
{
  "id": "REJ-MYX5678-DEF",
  "companyId": "100001",
  "entityType": "ORDER",
  "entityId": "ORD-1706000002",
  "workflowConfigId": "WFC-100001-ORDER-001",
  "workflowStage": "COMPANY_APPROVAL",
  "workflowVersion": 1,
  "action": "SEND_BACK",
  "reasonCode": "INCOMPLETE_INFORMATION",
  "reasonLabel": "Incomplete order information",
  "remarks": "Size information is missing for some items. Please update the order with correct sizes and resubmit.",
  "rejectedBy": "CA-100001-001",
  "rejectedByRole": "COMPANY_ADMIN",
  "rejectedByName": "Vikram Singh",
  "previousStatus": "PENDING_COMPANY_APPROVAL",
  "previousStage": "LOCATION_APPROVAL",
  "newStatus": "SENT_BACK_FOR_CORRECTION",
  "entitySnapshot": {
    "employeeId": "EMP-MUM-005",
    "employeeName": "Priya Patel",
    "pr_number": "PR-2026-00124",
    "totalAmount": 7500,
    "site_admin_approved_at": "2026-01-20T09:00:00.000Z"
  },
  "rejectedAt": "2026-01-21T14:45:00.000Z",
  "isResolved": false
}
```

---

## Entity Updates

### Minimal Fields to Add to Entity Schemas

```typescript
// In Order.ts, GRN.ts, Invoice.ts
{
  // Add these fields (all optional for backward compatibility)
  currentWorkflowStage: {
    type: String,
    required: false,
    trim: true,
    maxlength: 50,
    index: true,
  },
  workflowConfigId: {
    type: String,
    required: false,
  },
  workflowConfigVersion: {
    type: Number,
    required: false,
  },
}
```

---

## Index Recommendations

### WorkflowConfiguration Indexes

```javascript
// Primary lookup: Active workflow for company/entity
{ companyId: 1, entityType: 1, isActive: 1 }

// Unique active workflow per company/entity
{ companyId: 1, entityType: 1, isActive: 1 } [unique, partial: isActive=true]

// Default template lookup
{ entityType: 1, isDefault: 1 }
```

### WorkflowRejection Indexes

```javascript
// Entity rejection history (most common query)
{ entityType: 1, entityId: 1, rejectedAt: -1 }

// Company-wide rejection queries
{ companyId: 1, entityType: 1, rejectedAt: -1 }

// Date range reports
{ companyId: 1, rejectedAt: -1 }

// Unresolved rejections
{ companyId: 1, isResolved: 1, rejectedAt: -1 }

// Analytics by reason
{ companyId: 1, reasonCode: 1, rejectedAt: -1 }

// Analytics by stage
{ companyId: 1, workflowStage: 1, rejectedAt: -1 }

// Rejector activity
{ rejectedBy: 1, rejectedAt: -1 }
```

---

## Usage Patterns

### 1. Processing a Rejection

```typescript
import { createRejection } from '@/lib/services/workflow-rejection-service'

const result = await createRejection({
  companyId: '100001',
  entityType: 'ORDER',
  entityId: 'ORD-1706000001',
  workflowStage: 'LOCATION_APPROVAL',
  rejectedBy: 'LA-100001-001',
  rejectedByRole: 'LOCATION_ADMIN',
  rejectedByName: 'Anjali Sharma',
  reasonCode: 'ELIGIBILITY_EXHAUSTED',
  remarks: 'Employee quota exhausted',
  previousStatus: 'PENDING_LOCATION_APPROVAL',
  entitySnapshot: { employeeId: 'EMP-001', employeeName: 'Rahul' },
})

if (result.success) {
  // Update entity status
  await Order.updateOne(
    { id: 'ORD-1706000001' },
    { 
      unified_pr_status: result.newStatus,
      currentWorkflowStage: null, // Reset stage on rejection
    }
  )
}
```

### 2. Processing an Approval

```typescript
import { processApproval } from '@/lib/services/workflow-rejection-service'

const result = await processApproval({
  companyId: '100001',
  entityType: 'ORDER',
  entityId: 'ORD-1706000001',
  currentStage: 'LOCATION_APPROVAL',
  approvedBy: 'LA-100001-001',
  approvedByRole: 'LOCATION_ADMIN',
})

if (result.success) {
  if (result.isTerminal) {
    // Final approval - order is approved
    await Order.updateOne(
      { id: 'ORD-1706000001' },
      { unified_pr_status: result.newStatus }
    )
  } else {
    // Move to next stage
    await Order.updateOne(
      { id: 'ORD-1706000001' },
      { 
        unified_pr_status: result.newStatus,
        currentWorkflowStage: result.nextStage,
      }
    )
  }
}
```

### 3. Getting Rejection History

```typescript
import { getEntityRejectionHistory } from '@/lib/services/workflow-rejection-service'

const rejections = await getEntityRejectionHistory(
  'ORDER',
  'ORD-1706000001',
  { limit: 10, includeResolved: true }
)
```

### 4. Rejection Analytics

```typescript
import { getRejectionStatistics } from '@/lib/services/workflow-rejection-service'

const stats = await getRejectionStatistics(
  '100001',                    // companyId
  'ORDER',                     // entityType (optional)
  new Date('2026-01-01'),      // dateFrom (optional)
  new Date('2026-01-31')       // dateTo (optional)
)

// stats = {
//   totalRejections: 45,
//   unresolvedCount: 12,
//   byReasonCode: [
//     { reasonCode: 'ELIGIBILITY_EXHAUSTED', count: 15 },
//     { reasonCode: 'INCOMPLETE_INFORMATION', count: 10 },
//     ...
//   ],
//   byStage: [
//     { workflowStage: 'LOCATION_APPROVAL', count: 25 },
//     { workflowStage: 'COMPANY_APPROVAL', count: 20 },
//   ],
//   byRole: [
//     { rejectedByRole: 'LOCATION_ADMIN', count: 25 },
//     { rejectedByRole: 'COMPANY_ADMIN', count: 20 },
//   ]
// }
```

---

## Flexibility Explanation

### How Flexibility is Achieved

1. **Workflow stages are data, not code**
   - Adding/removing stages is a configuration change, not a code change
   - New roles can be added to `allowedRoles` without code deployment

2. **Entity-agnostic rejection storage**
   - Single `WorkflowRejection` collection handles all entity types
   - Adding a new entity type (e.g., `RETURN_REQUEST`) requires only:
     - Adding the type to the enum
     - Creating a workflow configuration
     - No schema changes needed

3. **Status mappings are configurable**
   - `statusOnApproval` and `statusOnRejection` map stages to statuses
   - Different companies can have different status names

4. **Extensible metadata**
   - `entitySnapshot` and `metadata` use flexible schemas
   - Future fields can be added without migrations

### Scenario: Company Removes Location Admin Stage

**Before** (2-stage workflow):
```
Employee → Location Admin → Company Admin → Approved
```

**After** (1-stage workflow):
```
Employee → Company Admin → Approved
```

**Required changes**:
1. Update `WorkflowConfiguration.stages` to have only `COMPANY_APPROVAL`
2. Set `statusOnSubmission` to `'PENDING_COMPANY_APPROVAL'`
3. **No code changes needed**

The rejection service automatically:
- Validates actions against the current workflow configuration
- Applies the correct status from `statusOnRejection`
- Works seamlessly with 1, 2, or N stages

---

## Files Created

| File | Purpose |
|------|---------|
| `lib/models/WorkflowConfiguration.ts` | Workflow configuration schema |
| `lib/models/WorkflowRejection.ts` | Rejection record schema |
| `lib/services/workflow-rejection-service.ts` | Business logic service |
| `scripts/seed-workflow-configurations.ts` | Seed example configurations |

## Running the Seed Script

```bash
npx tsx scripts/seed-workflow-configurations.ts
```

This will create:
- 6 workflow configurations (various companies/entity types)
- 4 example rejection documents

---

## Summary

This framework provides an **enterprise-grade, future-proof rejection system** that:

✅ Is **configuration-driven** - no hardcoded roles or stages  
✅ Is **entity-agnostic** - works with any workflow-enabled entity  
✅ Keeps entities **lean** - rejection data stored centrally  
✅ Supports **1 to N stages** - adapts to any company's needs  
✅ Provides **full audit trail** - with entity snapshots and metadata  
✅ Enables **analytics** - rejection patterns, bottlenecks, role activity  
✅ Is **extensible** - new entity types without schema changes  
