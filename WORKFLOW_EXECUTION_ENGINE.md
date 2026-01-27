# Workflow Execution Engine - Design Document

## Overview

The Workflow Execution Engine is a **generic, configuration-driven** engine that handles approvals and rejections for any workflow-enabled entity. It works identically for Order, GRN, Invoice, and any future entity types.

**Key Principles:**
- Never hardcode roles or stage names
- All rules come from workflow configuration
- Entity-agnostic through repository abstraction
- Complete audit trail for all actions

---

## Table of Contents

1. [Architecture](#architecture)
2. [Core Components](#core-components)
3. [Data Contracts](#data-contracts)
4. [Approve Entity Flow](#approve-entity-flow)
5. [Reject Entity Flow](#reject-entity-flow)
6. [Stage Resolution Logic](#stage-resolution-logic)
7. [Error Codes](#error-codes)
8. [Usage Examples](#usage-examples)
9. [Notification Integration](#notification-integration)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      WORKFLOW EXECUTION ENGINE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    WorkflowExecutionEngine                             │  │
│  │                                                                        │  │
│  │    approveEntity()     rejectEntity()     initializeWorkflow()        │  │
│  │    canUserApprove()    canUserReject()    getWorkflowState()          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                    │                    │                                    │
│         ┌─────────┴────────┐   ┌───────┴───────┐                            │
│         ▼                  ▼   ▼               ▼                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐                 │
│  │   Entity    │    │  Workflow   │    │  Audit/Reject   │                 │
│  │ Repository  │    │   Config    │    │   Collections   │                 │
│  │ Abstraction │    │  Lookup     │    │                 │                 │
│  └─────────────┘    └─────────────┘    └─────────────────┘                 │
│         │                  │                    │                            │
│         ▼                  ▼                    ▼                            │
│  ┌───────────┐      ┌───────────┐       ┌─────────────────┐                │
│  │ Order/GRN │      │ Workflow  │       │ ApprovalAudit   │                │
│  │ /Invoice  │      │ Config    │       │ Rejection       │                │
│  │ Models    │      │ Collection│       │ Collections     │                │
│  └───────────┘      └───────────┘       └─────────────────┘                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. WorkflowExecutionEngine (`lib/workflow/workflow-execution-engine.ts`)

The main engine class providing:
- `approveEntity()` - Process approval at current stage
- `rejectEntity()` - Process rejection at current stage
- `canUserApprove()` - Check if user can approve
- `canUserReject()` - Check if user can reject
- `getWorkflowState()` - Get current workflow state
- `initializeWorkflow()` - Initialize entity into workflow

### 2. Entity Repository (`lib/workflow/entity-repository.ts`)

Abstraction layer providing unified interface for:
- Finding entities by ID
- Updating workflow state
- Getting entity snapshots for audit
- Status mapping (unified ↔ legacy)

Implementations:
- `OrderRepository`
- `GRNRepository`
- `InvoiceRepository`

### 3. WorkflowApprovalAudit (`lib/models/WorkflowApprovalAudit.ts`)

Audit collection for tracking all approval actions:
- Stage transitions
- Approver information
- Entity snapshots
- Timing information

### 4. Notification Events (`lib/workflow/workflow-notification-events.ts`)

Event definitions and helpers for workflow notifications:
- Approval events
- Rejection events
- Payload builders

---

## Data Contracts

### Input: ApproveEntityInput

```typescript
interface ApproveEntityInput {
  companyId: string        // Company identifier
  entityType: string       // ORDER | GRN | INVOICE | ...
  entityId: string         // Entity's unique ID
  userId: string           // ID of user performing action
  userRole: string         // Role of user (LOCATION_ADMIN, COMPANY_ADMIN, etc.)
  userName?: string        // Optional: User's display name
  remarks?: string         // Optional: Approval remarks
  metadata?: {             // Optional: Additional context
    source?: 'WEB' | 'API' | 'MOBILE' | 'SYSTEM'
    clientIp?: string
    correlationId?: string
    [key: string]: any
  }
}
```

### Input: RejectEntityInput

```typescript
interface RejectEntityInput {
  companyId: string        // Company identifier
  entityType: string       // ORDER | GRN | INVOICE | ...
  entityId: string         // Entity's unique ID
  userId: string           // ID of user performing action
  userRole: string         // Role of user
  userName?: string        // Optional: User's display name
  reasonCode: string       // REQUIRED: Rejection reason code
  reasonLabel?: string     // Optional: Human-readable reason
  remarks?: string         // Optional: Detailed remarks
  action?: string          // REJECT | SEND_BACK | CANCEL | HOLD (default: REJECT)
  metadata?: {             // Optional: Additional context
    source?: 'WEB' | 'API' | 'MOBILE' | 'SYSTEM'
    clientIp?: string
    correlationId?: string
    [key: string]: any
  }
}
```

### Output: WorkflowResult<T>

```typescript
interface WorkflowResult<T> {
  success: boolean         // Whether operation succeeded
  errorCode?: string       // Error code if failed (e.g., WF_E001)
  errorMessage?: string    // Human-readable error message
  data?: T                 // Result data if successful
}
```

### Output: ApproveResultData

```typescript
interface ApproveResultData {
  entityId: string         // Entity that was approved
  previousStage: string    // Stage before approval
  previousStatus: string   // Status before approval
  newStage: string | null  // New stage (null if terminal)
  newStatus: string        // New status after approval
  isTerminal: boolean      // Whether this was final approval
  auditId: string          // Audit record ID
}
```

### Output: RejectResultData

```typescript
interface RejectResultData {
  entityId: string         // Entity that was rejected
  previousStage: string    // Stage where rejection occurred
  previousStatus: string   // Status before rejection
  newStatus: string        // New status (typically REJECTED)
  rejectionId: string      // Rejection record ID
}
```

---

## Approve Entity Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         APPROVE ENTITY FLOW                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  1. ┌─────────────────┐                                                  │
│     │  Get Entity     │ ─── Entity not found? → Return ENTITY_NOT_FOUND  │
│     │  via Repository │                                                  │
│     └────────┬────────┘                                                  │
│              │                                                            │
│  2. ┌────────▼────────┐                                                  │
│     │  Load Workflow  │ ─── Config not found? → Return WORKFLOW_NOT_FOUND│
│     │  Configuration  │                                                  │
│     └────────┬────────┘                                                  │
│              │                                                            │
│  3. ┌────────▼────────┐                                                  │
│     │  Resolve        │ ─── No stage? → Try initial stage or error      │
│     │  Current Stage  │                                                  │
│     └────────┬────────┘                                                  │
│              │                                                            │
│  4. ┌────────▼────────┐                                                  │
│     │  Validate       │ ─── Role not in allowedRoles? →                  │
│     │  User Role      │     Return ROLE_NOT_ALLOWED                      │
│     └────────┬────────┘                                                  │
│              │                                                            │
│  5. ┌────────▼────────┐                                                  │
│     │  Check Stage    │ ─── canApprove = false? →                        │
│     │  Permissions    │     Return APPROVE_NOT_ALLOWED                   │
│     └────────┬────────┘                                                  │
│              │                                                            │
│  6. ┌────────▼────────┐                                                  │
│     │  Determine      │ ─── isTerminal OR no next stage?                 │
│     │  Next Stage     │     → Entity fully approved                      │
│     └────────┬────────┘                                                  │
│              │                                                            │
│  7. ┌────────▼────────┐                                                  │
│     │  Update Entity  │ ─── Set new status, stage, approval fields       │
│     │  State          │                                                  │
│     └────────┬────────┘                                                  │
│              │                                                            │
│  8. ┌────────▼────────┐                                                  │
│     │  Create Audit   │ ─── Record in WorkflowApprovalAudit             │
│     │  Record         │                                                  │
│     └────────┬────────┘                                                  │
│              │                                                            │
│  9. ┌────────▼────────┐                                                  │
│     │  Return Result  │ ─── Success with ApproveResultData              │
│     │                 │     (Caller fires notification)                  │
│     └─────────────────┘                                                  │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Reject Entity Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          REJECT ENTITY FLOW                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  1. ┌─────────────────┐                                                  │
│     │  Get Entity     │ ─── Entity not found? → Return ENTITY_NOT_FOUND  │
│     │  via Repository │                                                  │
│     └────────┬────────┘                                                  │
│              │                                                            │
│  2. ┌────────▼────────┐                                                  │
│     │  Load Workflow  │ ─── Config not found? → Return WORKFLOW_NOT_FOUND│
│     │  Configuration  │                                                  │
│     └────────┬────────┘                                                  │
│              │                                                            │
│  3. ┌────────▼────────┐                                                  │
│     │  Resolve        │ ─── No stage? → Try initial stage or error      │
│     │  Current Stage  │                                                  │
│     └────────┬────────┘                                                  │
│              │                                                            │
│  4. ┌────────▼────────┐                                                  │
│     │  Validate       │ ─── Role not in allowedRoles? →                  │
│     │  User Role      │     Return ROLE_NOT_ALLOWED                      │
│     └────────┬────────┘                                                  │
│              │                                                            │
│  5. ┌────────▼────────┐                                                  │
│     │  Check Stage    │ ─── canReject = false? →                         │
│     │  Permissions    │     Return REJECT_NOT_ALLOWED                    │
│     └────────┬────────┘                                                  │
│              │                                                            │
│  6. ┌────────▼────────┐                                                  │
│     │  Determine      │ ─── Get status from statusOnRejection            │
│     │  Rejection      │     or default to "REJECTED"                     │
│     │  Status         │                                                  │
│     └────────┬────────┘                                                  │
│              │                                                            │
│  7. ┌────────▼────────┐                                                  │
│     │  Update Entity  │ ─── Set rejected status, clear stage             │
│     │  State          │                                                  │
│     └────────┬────────┘                                                  │
│              │                                                            │
│  8. ┌────────▼────────┐                                                  │
│     │  Create         │ ─── Record in WorkflowRejection collection       │
│     │  Rejection      │     with full audit trail                        │
│     │  Record         │                                                  │
│     └────────┬────────┘                                                  │
│              │                                                            │
│  9. ┌────────▼────────┐                                                  │
│     │  Return Result  │ ─── Success with RejectResultData               │
│     │                 │     (Caller fires notification)                  │
│     └─────────────────┘                                                  │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Stage Resolution Logic

### Determining Current Stage

```typescript
// Priority order:
1. entity.currentWorkflowStage (explicit stage field)
2. If null and status is PENDING_*, derive from initial stage
3. Otherwise, error: NO_CURRENT_STAGE
```

### Determining Next Stage

```typescript
function getNextStage(config, currentStageKey) {
  // 1. Sort stages by order
  const sortedStages = [...config.stages].sort((a, b) => a.order - b.order)
  
  // 2. Find current stage index
  const currentIndex = sortedStages.findIndex(s => s.stageKey === currentStageKey)
  
  // 3. If not found or at last stage, return null (terminal)
  if (currentIndex === -1 || currentIndex === sortedStages.length - 1) {
    return null
  }
  
  // 4. Return next stage
  return sortedStages[currentIndex + 1]
}
```

### Edge Cases

| Scenario | Handling |
|----------|----------|
| Missing stages | Return STAGE_NOT_FOUND |
| Disabled workflow | Return WORKFLOW_INACTIVE |
| Stale entity stage | Validate against current config |
| Optional stages | Include by default (future: check skip conditions) |

---

## Error Codes

| Code | Constant | Description |
|------|----------|-------------|
| WF_E001 | ENTITY_NOT_FOUND | Entity does not exist |
| WF_E002 | ENTITY_UPDATE_FAILED | Failed to update entity |
| WF_E010 | WORKFLOW_NOT_FOUND | No workflow config for company/entity |
| WF_E011 | WORKFLOW_INACTIVE | Workflow is disabled |
| WF_E012 | WORKFLOW_INVALID | Workflow configuration is invalid |
| WF_E020 | STAGE_NOT_FOUND | Stage not in workflow config |
| WF_E021 | STAGE_MISMATCH | Entity stage doesn't match |
| WF_E022 | NO_CURRENT_STAGE | Entity has no current stage |
| WF_E030 | ROLE_NOT_ALLOWED | User role cannot act at stage |
| WF_E031 | APPROVE_NOT_ALLOWED | Stage doesn't allow approval |
| WF_E032 | REJECT_NOT_ALLOWED | Stage doesn't allow rejection |
| WF_E040 | ALREADY_APPROVED | Entity already fully approved |
| WF_E041 | ALREADY_REJECTED | Entity already rejected |
| WF_E042 | INVALID_STATE | Entity in invalid workflow state |
| WF_E050 | AUDIT_FAILED | Failed to create audit record |
| WF_E999 | UNKNOWN_ERROR | Unexpected error |

---

## Usage Examples

### 1. Approving an Order (Location Admin)

```typescript
import { approveEntity, WORKFLOW_ENTITY_TYPES } from '@/lib/workflow/workflow-execution-engine'
import { buildApprovalNotification, fireWorkflowNotification } from '@/lib/workflow/workflow-notification-events'

async function approveOrderAtLocationStage(orderId: string, userId: string) {
  const result = await approveEntity({
    companyId: '100001',
    entityType: WORKFLOW_ENTITY_TYPES.ORDER,
    entityId: orderId,
    userId: userId,
    userRole: 'LOCATION_ADMIN',
    userName: 'Anjali Sharma',
    remarks: 'Approved - all items verified',
    metadata: {
      source: 'WEB',
    }
  })
  
  if (result.success) {
    console.log('Approved!', result.data)
    // { entityId, previousStage, newStage, newStatus, isTerminal, auditId }
    
    // Fire notification
    const notification = buildApprovalNotification(
      '100001',
      WORKFLOW_ENTITY_TYPES.ORDER,
      result.data,
      { userId, userRole: 'LOCATION_ADMIN', userName: 'Anjali Sharma' }
    )
    await fireWorkflowNotification(notification)
    
    if (result.data.isTerminal) {
      console.log('Order fully approved - ready for fulfilment')
    } else {
      console.log(`Order moved to stage: ${result.data.newStage}`)
    }
  } else {
    console.error('Approval failed:', result.errorCode, result.errorMessage)
  }
}
```

### 2. Rejecting an Order (Company Admin)

```typescript
import { rejectEntity, WORKFLOW_ENTITY_TYPES } from '@/lib/workflow/workflow-execution-engine'
import { buildRejectionNotification, fireWorkflowNotification } from '@/lib/workflow/workflow-notification-events'

async function rejectOrderAtCompanyStage(
  orderId: string, 
  userId: string,
  reasonCode: string,
  remarks: string
) {
  const result = await rejectEntity({
    companyId: '100001',
    entityType: WORKFLOW_ENTITY_TYPES.ORDER,
    entityId: orderId,
    userId: userId,
    userRole: 'COMPANY_ADMIN',
    userName: 'Vikram Singh',
    reasonCode: reasonCode,
    reasonLabel: 'Incomplete Information',
    remarks: remarks,
    metadata: {
      source: 'WEB',
    }
  })
  
  if (result.success) {
    console.log('Rejected!', result.data)
    // { entityId, previousStage, previousStatus, newStatus, rejectionId }
    
    // Fire notification
    const notification = buildRejectionNotification(
      '100001',
      WORKFLOW_ENTITY_TYPES.ORDER,
      result.data,
      { 
        userId, 
        userRole: 'COMPANY_ADMIN', 
        userName: 'Vikram Singh',
        reasonCode,
        remarks
      }
    )
    await fireWorkflowNotification(notification)
  } else {
    console.error('Rejection failed:', result.errorCode, result.errorMessage)
  }
}
```

### 3. Checking Permissions Before UI Display

```typescript
import { canUserApprove, canUserReject } from '@/lib/workflow/workflow-execution-engine'

async function getAvailableActions(orderId: string, userRole: string) {
  const [approveCheck, rejectCheck] = await Promise.all([
    canUserApprove('100001', 'ORDER', orderId, userRole),
    canUserReject('100001', 'ORDER', orderId, userRole),
  ])
  
  return {
    canApprove: approveCheck.canApprove,
    canReject: rejectCheck.canReject,
    approveReason: approveCheck.reason,
    rejectReason: rejectCheck.reason,
  }
}
```

### 4. Getting Workflow State for Display

```typescript
import { getWorkflowState } from '@/lib/workflow/workflow-execution-engine'

async function getOrderWorkflowInfo(orderId: string) {
  const state = await getWorkflowState('100001', 'ORDER', orderId)
  
  if (!state.entity) {
    return { error: 'Order not found' }
  }
  
  return {
    currentStage: state.currentStage?.stageName || 'Not in workflow',
    currentStageKey: state.currentStage?.stageKey,
    nextStage: state.nextStage?.stageName || 'Final approval',
    isTerminal: state.isTerminal,
    allowedRoles: state.currentStage?.allowedRoles || [],
    status: state.entity.status,
  }
}
```

### 5. Initializing a New Order into Workflow

```typescript
import { initializeWorkflow } from '@/lib/workflow/workflow-execution-engine'

async function submitOrderForApproval(orderId: string) {
  const result = await initializeWorkflow('100001', 'ORDER', orderId)
  
  if (result.success) {
    console.log('Order submitted for approval')
    console.log('Initial stage:', result.data.initialStage)
    console.log('Initial status:', result.data.initialStatus)
  } else {
    console.error('Failed to submit:', result.errorMessage)
  }
}
```

---

## Notification Integration

The workflow engine does **NOT** send notifications directly. Instead:

1. Engine performs the action and returns result
2. Caller builds notification payload using helpers
3. Caller fires notification

This separation allows:
- Testing workflow logic without notification dependencies
- Different notification strategies per use case
- Batch operations without notification spam

### Notification Events

| Event | When Fired |
|-------|------------|
| ORDER_APPROVED_AT_STAGE | Order approved, more stages pending |
| ORDER_FULLY_APPROVED | Order completed all approval stages |
| ORDER_REJECTED | Order rejected at any stage |
| GRN_APPROVED | GRN approved |
| GRN_REJECTED | GRN rejected |
| INVOICE_APPROVED_AT_STAGE | Invoice approved, more stages pending |
| INVOICE_FULLY_APPROVED | Invoice fully approved |
| INVOICE_REJECTED | Invoice rejected |

---

## Files Created/Modified

| File | Purpose |
|------|---------|
| `lib/models/WorkflowApprovalAudit.ts` | Approval audit schema |
| `lib/workflow/entity-repository.ts` | Entity abstraction layer |
| `lib/workflow/workflow-execution-engine.ts` | Core engine |
| `lib/workflow/workflow-notification-events.ts` | Notification helpers |

---

## Summary

The Workflow Execution Engine provides a **clean, reusable** solution that:

✅ Is **configuration-driven** - all rules from WorkflowConfiguration  
✅ Is **entity-agnostic** - works with any entity via repository pattern  
✅ Provides **complete audit trail** - approval and rejection records  
✅ Has **clear error handling** - standard error codes and messages  
✅ Supports **notification integration** - without tight coupling  
✅ Handles **N-stage workflows** - dynamically from configuration  
✅ Separates concerns - engine, repository, notification  
