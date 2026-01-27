# Workflow Notification Mapping - Design Document

## Overview

The Notification Mapping layer is a **configuration-driven notification system** that automatically sends notifications based on workflow events. It integrates with the existing notification framework while adding workflow-specific capabilities.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    NOTIFICATION FLOW ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐    ┌─────────────┐    ┌──────────────┐    ┌────────────┐ │
│   │  Workflow   │───>│   Event     │───>│ Notification │───>│  Email/    │ │
│   │   Engine    │    │    Bus      │    │ Orchestrator │    │  In-App    │ │
│   └─────────────┘    └─────────────┘    └──────────────┘    └────────────┘ │
│         │                  │                   │                    │       │
│         │                  │                   │                    │       │
│         │                  │                   ▼                    │       │
│         │                  │         ┌──────────────┐              │       │
│         │                  │         │   Mapping    │              │       │
│         │                  │         │    Config    │              │       │
│         │                  │         └──────────────┘              │       │
│         │                  │                   │                    │       │
│         │                  │                   ▼                    │       │
│         │                  │         ┌──────────────┐              │       │
│         │                  │         │  Recipient   │              │       │
│         │                  │         │  Resolver    │              │       │
│         │                  │         └──────────────┘              │       │
│         │                  │                   │                    │       │
│         │                  │                   ▼                    │       │
│         │                  │         ┌──────────────┐              │       │
│         │                  │         │  Template    │              │       │
│         │                  │         │   Engine     │              │       │
│         │                  │         └──────────────┘              │       │
│         │                  │                   │                    │       │
│         │                  │                   ▼                    ▼       │
│         │                  │         ┌──────────────────────────────┐      │
│         │                  │         │      Notification Log        │      │
│         │                  │         └──────────────────────────────┘      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Table of Contents

1. [Design Principles](#design-principles)
2. [Workflow Events](#workflow-events)
3. [Notification Mapping Schema](#notification-mapping-schema)
4. [Recipient Resolution](#recipient-resolution)
5. [Template Strategy](#template-strategy)
6. [Execution Flow](#execution-flow)
7. [Failure Handling](#failure-handling)
8. [Examples](#examples)
9. [Files Created](#files-created)

---

## Design Principles

### Event-Driven Architecture
- Notifications are triggered by **workflow events**, not entity changes
- Workflow engine emits events (fire-and-forget)
- Notification orchestrator subscribes to events independently

### Configuration-Driven
- No hardcoded stages, roles, or email addresses
- Mappings stored in MongoDB, editable via UI
- Different companies can have different notification rules

### Graceful Degradation
- Notification failures never break the workflow
- All errors logged but not propagated
- DEMO_MODE support for safe testing

### Reusability
- Same framework for Order, GRN, Invoice
- Generic recipient resolvers work across entities
- Templates use common placeholders

---

## Workflow Events

### Canonical Event Types

```typescript
const WORKFLOW_EVENT_TYPES = {
  // Submission events
  ENTITY_SUBMITTED: 'ENTITY_SUBMITTED',           // New entity submitted
  ENTITY_RESUBMITTED: 'ENTITY_RESUBMITTED',       // Rejected entity resubmitted
  
  // Approval events
  ENTITY_APPROVED: 'ENTITY_APPROVED',             // Final approval
  ENTITY_APPROVED_AT_STAGE: 'ENTITY_APPROVED_AT_STAGE', // Intermediate approval
  
  // Rejection events
  ENTITY_REJECTED: 'ENTITY_REJECTED',             // Workflow terminated
  ENTITY_REJECTED_AT_STAGE: 'ENTITY_REJECTED_AT_STAGE', // Stage-specific rejection
  
  // Other events
  ENTITY_CANCELLED: 'ENTITY_CANCELLED',           // Entity cancelled
  ENTITY_MOVED_TO_STAGE: 'ENTITY_MOVED_TO_STAGE', // Stage transition
  ENTITY_SENT_BACK: 'ENTITY_SENT_BACK',           // Sent back for correction
  
  // Reminder events (cron)
  APPROVAL_REMINDER: 'APPROVAL_REMINDER',
  APPROVAL_ESCALATION: 'APPROVAL_ESCALATION',
}
```

### Event Payload Structure

```typescript
interface WorkflowEventPayload {
  // Event metadata
  eventId: string              // Unique ID for idempotency
  eventType: WorkflowEventType
  eventTimestamp: string       // ISO timestamp
  
  // Entity identification
  companyId: string
  entityType: 'ORDER' | 'GRN' | 'INVOICE' | ...
  entityId: string             // e.g., "ORD-1706000001"
  
  // Workflow state
  currentStage: string | null
  previousStage?: string
  currentStatus: string
  previousStatus?: string
  
  // Actor information
  triggeredBy: {
    userId: string
    userName: string
    userRole: string
    userEmail?: string
  }
  
  // Rejection details (for rejection events)
  rejection?: {
    reasonCode: string
    reasonLabel: string
    remarks?: string
  }
  
  // Entity snapshot
  entitySnapshot: {
    displayId?: string         // PR number, GRN number, etc.
    createdBy?: string
    createdByEmail?: string
    createdByName?: string
    totalAmount?: number
    itemCount?: number
    vendorId?: string
    vendorName?: string
    locationId?: string
    locationName?: string
    [key: string]: any
  }
  
  metadata?: Record<string, any>
}
```

### Example Event: Order Rejected

```json
{
  "eventId": "WFE-LZ8K9X2-ABC123",
  "eventType": "ENTITY_REJECTED",
  "eventTimestamp": "2026-01-22T10:30:00.000Z",
  
  "companyId": "100001",
  "entityType": "ORDER",
  "entityId": "ORD-1706000001",
  
  "currentStage": "REJECTED",
  "previousStage": "COMPANY_APPROVAL",
  "currentStatus": "REJECTED_BY_COMPANY_ADMIN",
  "previousStatus": "PENDING_COMPANY_APPROVAL",
  
  "triggeredBy": {
    "userId": "CA-001",
    "userName": "Rahul Verma",
    "userRole": "COMPANY_ADMIN",
    "userEmail": "rahul@company.com"
  },
  
  "rejection": {
    "reasonCode": "BUDGET_EXCEEDED",
    "reasonLabel": "Budget Exceeded",
    "remarks": "Exceeds quarterly budget allocation. Please reduce quantity or wait for next quarter."
  },
  
  "entitySnapshot": {
    "displayId": "PR-2026-00001",
    "createdBy": "EMP-001",
    "createdByEmail": "john.doe@company.com",
    "createdByName": "John Doe",
    "totalAmount": 15000,
    "itemCount": 5,
    "vendorId": "V-001",
    "vendorName": "Acme Uniforms",
    "locationId": "LOC-001",
    "locationName": "Mumbai HQ"
  }
}
```

---

## Notification Mapping Schema

### Collection: `workflow_notification_mappings`

```typescript
interface IWorkflowNotificationMapping {
  id: string                    // e.g., "NM-ORDER-REJECTED-001"
  
  // Scope
  companyId: string             // Company ID or '*' for global default
  entityType: string            // 'ORDER', 'GRN', 'INVOICE', or '*'
  
  // Trigger
  eventType: string             // ENTITY_REJECTED, ENTITY_APPROVED, etc.
  stageKey?: string             // Optional: specific stage only
  
  // Recipients
  recipientResolvers: string[]  // How to find recipients
  customRecipients?: [          // Static recipients
    { email: string, name?: string, role?: string }
  ]
  excludeActionPerformer?: boolean
  
  // Channels
  channels: [
    {
      channel: 'EMAIL' | 'IN_APP' | 'WHATSAPP'
      templateKey: string
      priority?: 'HIGH' | 'NORMAL' | 'LOW'
      delayMinutes?: number
    }
  ]
  
  // Conditions (optional)
  conditions?: {
    minAmount?: number
    entityStatuses?: string[]
    roles?: string[]
    customCondition?: string
  }
  
  isActive: boolean
  priority: number              // Higher = evaluated first
  description?: string
}
```

### Recipient Resolvers

| Resolver | Description |
|----------|-------------|
| `REQUESTOR` | Original entity creator/submitter |
| `ENTITY_OWNER` | Owner of the entity |
| `CURRENT_STAGE_ROLE` | Users with roles allowed at current stage |
| `PREVIOUS_STAGE_ROLE` | Users who acted at previous stage |
| `NEXT_STAGE_ROLE` | Users with roles allowed at next stage |
| `ACTION_PERFORMER` | User who performed the action |
| `COMPANY_ADMIN` | All company admins |
| `LOCATION_ADMIN` | Location admins for entity's location |
| `FINANCE_ADMIN` | Finance admins |
| `VENDOR` | Vendor associated with entity |
| `CUSTOM` | Static email addresses from config |

### Example Mapping: Notify Requestor on Rejection

```json
{
  "id": "NM-ORDER-REJECTED-TO-REQUESTOR",
  "companyId": "*",
  "entityType": "ORDER",
  "eventType": "ENTITY_REJECTED",
  "stageKey": null,
  
  "recipientResolvers": ["REQUESTOR"],
  "excludeActionPerformer": true,
  
  "channels": [
    {
      "channel": "EMAIL",
      "templateKey": "ORDER_REJECTED_REQUESTOR",
      "priority": "HIGH"
    }
  ],
  
  "isActive": true,
  "priority": 10,
  "description": "Notify requestor when their order is rejected"
}
```

### Example Mapping: Notify Next Approver on Stage Approval

```json
{
  "id": "NM-ORDER-STAGE-APPROVED-NEXT",
  "companyId": "100001",
  "entityType": "ORDER",
  "eventType": "ENTITY_APPROVED_AT_STAGE",
  "stageKey": "LOCATION_APPROVAL",
  
  "recipientResolvers": ["NEXT_STAGE_ROLE"],
  "excludeActionPerformer": true,
  
  "channels": [
    {
      "channel": "EMAIL",
      "templateKey": "ORDER_PENDING_APPROVAL",
      "priority": "NORMAL"
    }
  ],
  
  "conditions": {
    "minAmount": 1000
  },
  
  "isActive": true,
  "priority": 20,
  "description": "Notify Company Admin when Location Admin approves orders > 1000"
}
```

---

## Recipient Resolution

### Resolution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    RECIPIENT RESOLUTION FLOW                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. Get recipient resolvers from mapping                        │
│      ["REQUESTOR", "COMPANY_ADMIN"]                             │
│                                                                  │
│   2. For each resolver:                                          │
│      ┌─────────────────────────────────────────────────────┐    │
│      │  REQUESTOR → Look up entity.createdBy email         │    │
│      │  COMPANY_ADMIN → Query users with role=COMPANY_ADMIN│    │
│      │  NEXT_STAGE_ROLE → Get allowedRoles from workflow   │    │
│      │  VENDOR → Look up vendor contact email              │    │
│      └─────────────────────────────────────────────────────┘    │
│                                                                  │
│   3. Deduplicate emails                                          │
│                                                                  │
│   4. Exclude action performer (if configured)                    │
│                                                                  │
│   5. Validate email formats                                      │
│                                                                  │
│   6. Return resolved recipients                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Resolution Examples

**Event: ENTITY_SUBMITTED**
- Resolver: `CURRENT_STAGE_ROLE`
- If currentStage = `LOCATION_APPROVAL`
- Workflow config says `allowedRoles = ['LOCATION_ADMIN']`
- Query: `db.users.find({ companyId: '100001', role: 'LOCATION_ADMIN', locationId: 'LOC-001' })`
- Result: All Location Admins for that location

**Event: ENTITY_REJECTED**
- Resolver: `REQUESTOR`
- Look up: `entitySnapshot.createdByEmail`
- Result: Original submitter's email

**Event: ENTITY_APPROVED (final)**
- Resolvers: `['REQUESTOR', 'COMPANY_ADMIN', 'VENDOR']`
- Multiple recipients notified

---

## Template Strategy

### Template Placeholders

Templates use `{{placeholder}}` syntax:

| Placeholder | Description |
|-------------|-------------|
| `{{entityType}}` | "Order", "GRN", "Invoice" |
| `{{entityId}}` | Entity's business ID |
| `{{entityDisplayId}}` | PR number, GRN number, etc. |
| `{{currentStage}}` | Current workflow stage |
| `{{currentStageName}}` | Human-readable stage name |
| `{{currentStatus}}` | Entity status |
| `{{previousStatus}}` | Previous status |
| `{{requestorName}}` | Original submitter name |
| `{{approvedBy}}` | Approver name |
| `{{rejectedBy}}` | Rejector name |
| `{{rejectionReason}}` | Rejection reason label |
| `{{rejectionRemarks}}` | Detailed rejection remarks |
| `{{vendorName}}` | Vendor name |
| `{{locationName}}` | Location name |
| `{{totalAmount}}` | Total amount |
| `{{brandName}}` | Company brand name |
| `{{brandColor}}` | Company brand color |

### Example Template: Order Rejected

**Subject:**
```
Your {{entityType}} {{entityDisplayId}} has been rejected
```

**Body:**
```html
<div style="font-family: Arial, sans-serif;">
  <div style="background: {{brandColor}}; color: white; padding: 20px;">
    <h1>{{brandName}}</h1>
  </div>
  
  <div style="padding: 20px;">
    <p>Dear {{requestorName}},</p>
    
    <p>Your {{entityType}} <strong>{{entityDisplayId}}</strong> has been rejected.</p>
    
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 10px; border: 1px solid #ddd;"><strong>Rejected By:</strong></td>
        <td style="padding: 10px; border: 1px solid #ddd;">{{rejectedBy}}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #ddd;"><strong>Reason:</strong></td>
        <td style="padding: 10px; border: 1px solid #ddd;">{{rejectionReason}}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #ddd;"><strong>Remarks:</strong></td>
        <td style="padding: 10px; border: 1px solid #ddd;">{{rejectionRemarks}}</td>
      </tr>
    </table>
    
    <p style="margin-top: 20px;">
      Please review the feedback and resubmit if needed.
    </p>
  </div>
</div>
```

---

## Execution Flow

### End-to-End Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NOTIFICATION EXECUTION FLOW                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. WORKFLOW ENGINE emits event                                              │
│     workflowEventBus.emit(rejectionEvent)                                   │
│                                                                              │
│  2. ORCHESTRATOR receives event (async, non-blocking)                        │
│     ├─ Check if notifications enabled                                        │
│     └─ Check if DEMO_MODE                                                    │
│                                                                              │
│  3. LOAD MAPPINGS                                                            │
│     ├─ Query: { companyId, entityType, eventType, isActive: true }          │
│     ├─ Fall back to global defaults (companyId: '*') if none found          │
│     └─ Filter by stageKey if specified                                       │
│                                                                              │
│  4. FOR EACH MAPPING:                                                        │
│     ├─ Check conditions (minAmount, entityStatuses, etc.)                   │
│     ├─ Resolve recipients                                                    │
│     │   ├─ Execute each resolver                                             │
│     │   ├─ Deduplicate                                                       │
│     │   └─ Exclude action performer if configured                           │
│     └─ For each channel:                                                     │
│         ├─ Load template                                                     │
│         ├─ Render template with context                                      │
│         └─ Send notification                                                 │
│                                                                              │
│  5. LOG RESULTS                                                              │
│     ├─ Create NotificationLog entry (same collection as existing)           │
│     ├─ Log success/failure                                                   │
│     └─ Include eventId, recipientType, status                               │
│                                                                              │
│  6. RETURN (never throw)                                                     │
│     └─ Workflow continues regardless of notification success                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Failure Handling

### Retry Strategy

```typescript
// Basic retry (3 attempts)
const MAX_RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 5 * 60 * 1000 // 5 minutes

// On failure:
// 1. Log error
// 2. If attempts < MAX_RETRY_ATTEMPTS, queue for retry
// 3. If all retries exhausted, mark as FAILED in log
```

### DEMO_MODE Support

```typescript
function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true' || process.env.NODE_ENV === 'test'
}

// In demo mode:
// - Log notification details
// - Return success without sending
// - No side effects
```

### Graceful Failures

```typescript
// Notification orchestrator NEVER throws
// Workflow engine continues regardless of notification success

workflowEventBus.subscribe('*', async (event) => {
  try {
    await processWorkflowEvent(event)
  } catch (error) {
    console.error('[NotificationOrchestrator] Error:', error)
    // Never rethrow - workflow must not fail due to notifications
  }
})
```

---

## Examples

### Example 1: Complete Rejection Notification Flow

**Scenario:** Company Admin rejects an Order

**Step 1: Workflow Engine emits event**
```typescript
workflowEventBus.emit({
  eventId: 'WFE-LZ8K9X2-ABC123',
  eventType: 'ENTITY_REJECTED',
  companyId: '100001',
  entityType: 'ORDER',
  entityId: 'ORD-1706000001',
  currentStage: 'REJECTED',
  previousStage: 'COMPANY_APPROVAL',
  currentStatus: 'REJECTED_BY_COMPANY_ADMIN',
  triggeredBy: {
    userId: 'CA-001',
    userName: 'Rahul Verma',
    userRole: 'COMPANY_ADMIN',
    userEmail: 'rahul@company.com'
  },
  rejection: {
    reasonCode: 'BUDGET_EXCEEDED',
    reasonLabel: 'Budget Exceeded',
    remarks: 'Exceeds quarterly budget allocation.'
  },
  entitySnapshot: {
    displayId: 'PR-2026-00001',
    createdByEmail: 'john.doe@company.com',
    createdByName: 'John Doe'
  }
})
```

**Step 2: Orchestrator loads mappings**
```javascript
// Found: NM-ORDER-REJECTED-TO-REQUESTOR
{
  recipientResolvers: ['REQUESTOR'],
  channels: [{ channel: 'EMAIL', templateKey: 'ORDER_REJECTED_REQUESTOR' }]
}
```

**Step 3: Resolve recipients**
```javascript
// Resolver: REQUESTOR
// → entitySnapshot.createdByEmail = 'john.doe@company.com'
// Result: [{ email: 'john.doe@company.com', name: 'John Doe', role: 'REQUESTOR' }]
```

**Step 4: Send email**
```
To: john.doe@company.com
Subject: Your Order PR-2026-00001 has been rejected
Body: [Rendered HTML with rejection details]
```

**Step 5: Log result**
```javascript
// NotificationLog entry
{
  logId: '950123',
  eventId: 'WFE-LZ8K9X2-ABC123',
  recipientEmail: 'john.doe@company.com',
  recipientType: 'REQUESTOR',
  subject: 'Your Order PR-2026-00001 has been rejected',
  status: 'SENT',
  sentAt: '2026-01-22T10:30:05.000Z'
}
```

### Example 2: Notification Log Entry

```json
{
  "logId": "950456",
  "queueId": null,
  "eventId": "WFE-LZ8K9X2-ABC123",
  "recipientEmail": "john.doe@company.com",
  "recipientType": "REQUESTOR",
  "subject": "Your Order PR-2026-00001 has been rejected",
  "status": "SENT",
  "providerMessageId": "msg-12345-abcde",
  "sentAt": "2026-01-22T10:30:05.000Z",
  "providerResponse": {
    "channel": "EMAIL",
    "resolvedBy": "REQUESTOR",
    "eventType": "ENTITY_REJECTED",
    "entityId": "ORD-1706000001"
  },
  "createdAt": "2026-01-22T10:30:05.000Z"
}
```

### Example 3: Mapping for Multi-Stage Workflow

**Company A: Location Admin → Company Admin**

```json
[
  {
    "id": "NM-ORDER-SUBMITTED-LOC",
    "companyId": "100001",
    "entityType": "ORDER",
    "eventType": "ENTITY_SUBMITTED",
    "recipientResolvers": ["CURRENT_STAGE_ROLE"],
    "channels": [{ "channel": "EMAIL", "templateKey": "ORDER_PENDING_APPROVAL" }],
    "description": "Notify Location Admin when order submitted"
  },
  {
    "id": "NM-ORDER-APPROVED-LOC-TO-CA",
    "companyId": "100001",
    "entityType": "ORDER",
    "eventType": "ENTITY_APPROVED_AT_STAGE",
    "stageKey": "LOCATION_APPROVAL",
    "recipientResolvers": ["NEXT_STAGE_ROLE"],
    "channels": [{ "channel": "EMAIL", "templateKey": "ORDER_PENDING_APPROVAL" }],
    "description": "Notify Company Admin after Location Admin approves"
  },
  {
    "id": "NM-ORDER-APPROVED-FINAL",
    "companyId": "100001",
    "entityType": "ORDER",
    "eventType": "ENTITY_APPROVED",
    "recipientResolvers": ["REQUESTOR", "VENDOR"],
    "channels": [{ "channel": "EMAIL", "templateKey": "ORDER_APPROVED" }],
    "description": "Notify requestor and vendor when order fully approved"
  }
]
```

---

## Files Created

| File | Purpose |
|------|---------|
| `lib/workflow/workflow-events.ts` | Canonical event types and event bus |
| `lib/models/WorkflowNotificationMapping.ts` | MongoDB schema for notification mappings |
| `lib/workflow/workflow-recipient-resolver.ts` | Dynamic recipient resolution |
| `lib/workflow/workflow-notification-orchestrator.ts` | Main orchestration service |

---

## Integration with Existing Framework

| Existing Component | How We Integrate |
|--------------------|------------------|
| `NotificationLog` | Same collection, same schema |
| `NotificationTemplate` | Use existing templates via templateKey |
| `NotificationEvent` | Map workflow events to existing event codes |
| `EmailProvider` | Reuse existing sendEmail function |
| `CompanyNotificationConfigService` | Reuse branding and quiet hours |

---

## Summary

The Notification Mapping layer provides:

✅ **Event-driven notifications** - Triggered by workflow events  
✅ **Configuration-driven** - No hardcoded logic  
✅ **Dynamic recipient resolution** - Based on workflow and entity  
✅ **Entity-agnostic** - Works for Order, GRN, Invoice  
✅ **Company-specific** - Different rules per company  
✅ **Graceful degradation** - Never breaks workflow  
✅ **DEMO_MODE support** - Safe testing  
✅ **Audit logging** - Full notification history  
