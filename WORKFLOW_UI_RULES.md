# Workflow UI Rules - Design Document

## Overview

The UI Rules layer is a **backend-driven permissions engine** that tells the frontend exactly what actions are available for the current user at the current workflow stage. This ensures:

1. **Single Source of Truth** - Business rules live in ONE place (backend)
2. **Security** - Frontend can't be trusted to enforce permissions
3. **Flexibility** - Change workflow rules without deploying frontend
4. **Consistency** - Same rules apply to web, mobile, API clients

---

## Table of Contents

1. [Why Backend-Driven UI Rules?](#why-backend-driven-ui-rules)
2. [API Endpoint](#api-endpoint)
3. [Response Structure](#response-structure)
4. [Sample Responses](#sample-responses)
5. [Actions Evaluated](#actions-evaluated)
6. [Rejection Configuration](#rejection-configuration)
7. [Edge Cases](#edge-cases)
8. [Frontend Integration](#frontend-integration)

---

## Why Backend-Driven UI Rules?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     WHY BACKEND-DRIVEN UI RULES?                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ❌ ANTI-PATTERN: Duplicating rules in frontend                            │
│      - Frontend checks: if (userRole === 'COMPANY_ADMIN') showApproveBtn()  │
│      - Backend checks: same logic again                                      │
│      - Result: Logic divergence, security holes, maintenance nightmare       │
│                                                                              │
│   ✅ CORRECT PATTERN: Backend tells frontend what to show                   │
│      - Frontend asks: "What can I do?"                                       │
│      - Backend evaluates ALL rules and returns: { canApprove: true/false }  │
│      - Frontend just renders based on response                               │
│      - Result: Single source of truth, secure, easy to maintain             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Benefits

| Benefit | Description |
|---------|-------------|
| **No Logic Duplication** | Workflow rules exist only in backend |
| **Instant Rule Changes** | Update config, frontend adapts automatically |
| **Security** | Backend validates ALL actions regardless of UI |
| **Multi-Platform** | Same rules for web, mobile, API |
| **A/B Testing** | Test different workflows without frontend deploy |
| **Audit Trail** | All permission checks logged centrally |

---

## API Endpoint

### GET /api/workflow/ui-rules

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `entityType` | string | ✅ | ORDER, GRN, INVOICE, etc. |
| `entityId` | string | ✅ | Entity's unique ID |

**Headers:**
```
x-company-id: 100001
x-user-id: LA-001
x-user-role: LOCATION_ADMIN
x-user-name: Anjali Sharma (optional)
```

**Example Request:**
```bash
curl -X GET "https://app.example.com/api/workflow/ui-rules?entityType=ORDER&entityId=ORD-1706000001" \
  -H "x-company-id: 100001" \
  -H "x-user-id: LA-001" \
  -H "x-user-role: LOCATION_ADMIN"
```

---

## Response Structure

```typescript
interface UIRulesResponse {
  // Entity identification
  entityId: string
  entityType: string
  entityStatus: string
  
  // Workflow state
  workflowState: 'IN_WORKFLOW' | 'COMPLETED' | 'REJECTED' | 'NOT_IN_WORKFLOW' | 'NO_WORKFLOW_CONFIG'
  currentStage: string | null
  currentStageName: string | null
  
  // What actions are allowed
  allowedActions: {
    canApprove: ActionPermission
    canReject: ActionPermission
    canResubmit: ActionPermission
    canCancel: ActionPermission
    canView: ActionPermission
    canEdit: ActionPermission
  }
  
  // Rejection configuration (for UI)
  rejectionConfig: {
    isAllowed: boolean
    isReasonMandatory: boolean
    isRemarksMandatory: boolean
    maxRemarksLength: number
    allowedReasonCodes: ReasonCodeOption[]
    allowedActions: RejectionActionOption[]
  }
  
  // Workflow progress (for progress bar/stepper)
  workflowProgress: {
    totalStages: number
    currentStageOrder: number
    completedStages: number
    percentComplete: number
    stages: StageInfo[]
  } | null
  
  // Messages for UI display
  informationalMessage: string | null
  statusMessage: string | null
  nextActionHint: string | null
  
  // Role information
  userRoleInfo: {
    currentRole: string
    isAllowedAtCurrentStage: boolean
    allowedRolesAtCurrentStage: string[]
  }
  
  // Metadata
  evaluatedAt: string
  workflowConfigId: string | null
  workflowConfigVersion: number | null
}

interface ActionPermission {
  allowed: boolean
  reason?: string
  requiresConfirmation?: boolean
  confirmationMessage?: string
}

interface ReasonCodeOption {
  code: string
  label: string
  description?: string
  requiresRemarks?: boolean
  category?: string
}
```

---

## Sample Responses

### 1. User Allowed to Approve/Reject (Location Admin at Location Stage)

```json
{
  "success": true,
  "data": {
    "entityId": "ORD-1706000001",
    "entityType": "ORDER",
    "entityStatus": "PENDING_LOCATION_APPROVAL",
    
    "workflowState": "IN_WORKFLOW",
    "currentStage": "LOCATION_APPROVAL",
    "currentStageName": "Location Admin Approval",
    
    "allowedActions": {
      "canApprove": {
        "allowed": true,
        "reason": "You can approve and move to next stage",
        "requiresConfirmation": false
      },
      "canReject": {
        "allowed": true,
        "reason": "You can reject this entity with a reason",
        "requiresConfirmation": true,
        "confirmationMessage": "Are you sure you want to reject this entity?"
      },
      "canResubmit": {
        "allowed": false,
        "reason": "Entity is pending approval"
      },
      "canCancel": {
        "allowed": false,
        "reason": "Only the owner or admin can cancel"
      },
      "canView": {
        "allowed": true,
        "reason": "User can view this entity"
      },
      "canEdit": {
        "allowed": false,
        "reason": "Entity is pending approval"
      }
    },
    
    "rejectionConfig": {
      "isAllowed": true,
      "isReasonMandatory": true,
      "isRemarksMandatory": false,
      "maxRemarksLength": 2000,
      "allowedReasonCodes": [
        {
          "code": "ELIGIBILITY_EXHAUSTED",
          "label": "Eligibility Exhausted",
          "description": "Employee has no remaining eligibility",
          "category": "ELIGIBILITY"
        },
        {
          "code": "INVALID_QUANTITY",
          "label": "Invalid Quantity",
          "description": "Quantity exceeds allowed limit",
          "category": "QUANTITY"
        },
        {
          "code": "INCOMPLETE_INFORMATION",
          "label": "Incomplete Information",
          "description": "Required information is missing",
          "requiresRemarks": true
        },
        {
          "code": "OTHER",
          "label": "Other",
          "description": "Other reason",
          "requiresRemarks": true
        }
      ],
      "allowedActions": [
        { "action": "REJECT", "label": "Reject", "description": "Permanently reject" },
        { "action": "SEND_BACK", "label": "Send Back for Correction", "description": "Return for corrections" }
      ]
    },
    
    "workflowProgress": {
      "totalStages": 2,
      "currentStageOrder": 1,
      "completedStages": 0,
      "percentComplete": 0,
      "stages": [
        {
          "stageKey": "LOCATION_APPROVAL",
          "stageName": "Location Admin Approval",
          "order": 1,
          "status": "CURRENT",
          "allowedRoles": ["LOCATION_ADMIN", "SITE_ADMIN"],
          "isTerminal": false
        },
        {
          "stageKey": "COMPANY_APPROVAL",
          "stageName": "Company Admin Approval",
          "order": 2,
          "status": "PENDING",
          "allowedRoles": ["COMPANY_ADMIN"],
          "isTerminal": true
        }
      ]
    },
    
    "informationalMessage": "You can approve or reject this entity as LOCATION_ADMIN",
    "statusMessage": "Pending Location Admin Approval",
    "nextActionHint": "Approve to move to Company Admin Approval, or reject with a reason",
    
    "userRoleInfo": {
      "currentRole": "LOCATION_ADMIN",
      "isAllowedAtCurrentStage": true,
      "allowedRolesAtCurrentStage": ["LOCATION_ADMIN", "SITE_ADMIN"]
    },
    
    "evaluatedAt": "2026-01-22T10:30:00.000Z",
    "workflowConfigId": "WFC-100001-ORDER-001",
    "workflowConfigVersion": 1
  },
  "timestamp": "2026-01-22T10:30:00.123Z"
}
```

### 2. User Allowed to View Only (Location Admin at Company Stage)

```json
{
  "success": true,
  "data": {
    "entityId": "ORD-1706000001",
    "entityType": "ORDER",
    "entityStatus": "PENDING_COMPANY_APPROVAL",
    
    "workflowState": "IN_WORKFLOW",
    "currentStage": "COMPANY_APPROVAL",
    "currentStageName": "Company Admin Approval",
    
    "allowedActions": {
      "canApprove": {
        "allowed": false,
        "reason": "Your role (LOCATION_ADMIN) is not authorized to approve at this stage. Allowed roles: COMPANY_ADMIN"
      },
      "canReject": {
        "allowed": false,
        "reason": "Your role (LOCATION_ADMIN) is not authorized to reject at this stage. Allowed roles: COMPANY_ADMIN"
      },
      "canResubmit": {
        "allowed": false,
        "reason": "Entity is pending approval"
      },
      "canCancel": {
        "allowed": false,
        "reason": "Only the owner or admin can cancel"
      },
      "canView": {
        "allowed": true,
        "reason": "User can view this entity"
      },
      "canEdit": {
        "allowed": false,
        "reason": "Entity is pending approval"
      }
    },
    
    "rejectionConfig": {
      "isAllowed": false,
      "isReasonMandatory": true,
      "isRemarksMandatory": false,
      "maxRemarksLength": 2000,
      "allowedReasonCodes": [],
      "allowedActions": []
    },
    
    "workflowProgress": {
      "totalStages": 2,
      "currentStageOrder": 2,
      "completedStages": 1,
      "percentComplete": 50,
      "stages": [
        {
          "stageKey": "LOCATION_APPROVAL",
          "stageName": "Location Admin Approval",
          "order": 1,
          "status": "COMPLETED",
          "allowedRoles": ["LOCATION_ADMIN"],
          "isTerminal": false
        },
        {
          "stageKey": "COMPANY_APPROVAL",
          "stageName": "Company Admin Approval",
          "order": 2,
          "status": "CURRENT",
          "allowedRoles": ["COMPANY_ADMIN"],
          "isTerminal": true
        }
      ]
    },
    
    "informationalMessage": "Waiting for COMPANY_ADMIN to take action",
    "statusMessage": "Pending Company Admin Approval",
    "nextActionHint": null,
    
    "userRoleInfo": {
      "currentRole": "LOCATION_ADMIN",
      "isAllowedAtCurrentStage": false,
      "allowedRolesAtCurrentStage": ["COMPANY_ADMIN"]
    },
    
    "evaluatedAt": "2026-01-22T14:00:00.000Z",
    "workflowConfigId": "WFC-100001-ORDER-001",
    "workflowConfigVersion": 1
  }
}
```

### 3. Entity Already Approved

```json
{
  "success": true,
  "data": {
    "entityId": "ORD-1706000001",
    "entityType": "ORDER",
    "entityStatus": "APPROVED",
    
    "workflowState": "COMPLETED",
    "currentStage": null,
    "currentStageName": null,
    
    "allowedActions": {
      "canApprove": {
        "allowed": false,
        "reason": "Entity is already fully approved"
      },
      "canReject": {
        "allowed": false,
        "reason": "Entity is already fully approved"
      },
      "canResubmit": {
        "allowed": false,
        "reason": "Entity is already fully approved"
      },
      "canCancel": {
        "allowed": false,
        "reason": "Entity is already fully approved"
      },
      "canView": {
        "allowed": true,
        "reason": "User can view this entity"
      },
      "canEdit": {
        "allowed": false,
        "reason": "Entity is already fully approved"
      }
    },
    
    "rejectionConfig": {
      "isAllowed": false,
      "isReasonMandatory": true,
      "isRemarksMandatory": false,
      "maxRemarksLength": 2000,
      "allowedReasonCodes": [],
      "allowedActions": []
    },
    
    "workflowProgress": {
      "totalStages": 2,
      "currentStageOrder": 2,
      "completedStages": 2,
      "percentComplete": 100,
      "stages": [
        {
          "stageKey": "LOCATION_APPROVAL",
          "stageName": "Location Admin Approval",
          "order": 1,
          "status": "COMPLETED",
          "allowedRoles": ["LOCATION_ADMIN"],
          "isTerminal": false
        },
        {
          "stageKey": "COMPANY_APPROVAL",
          "stageName": "Company Admin Approval",
          "order": 2,
          "status": "COMPLETED",
          "allowedRoles": ["COMPANY_ADMIN"],
          "isTerminal": true
        }
      ]
    },
    
    "informationalMessage": null,
    "statusMessage": "This entity has been fully approved",
    "nextActionHint": null,
    
    "userRoleInfo": {
      "currentRole": "LOCATION_ADMIN",
      "isAllowedAtCurrentStage": false,
      "allowedRolesAtCurrentStage": []
    },
    
    "evaluatedAt": "2026-01-22T16:00:00.000Z",
    "workflowConfigId": "WFC-100001-ORDER-001",
    "workflowConfigVersion": 1
  }
}
```

### 4. Entity Rejected (Can Resubmit)

```json
{
  "success": true,
  "data": {
    "entityId": "ORD-1706000001",
    "entityType": "ORDER",
    "entityStatus": "REJECTED_BY_COMPANY_ADMIN",
    
    "workflowState": "REJECTED",
    "currentStage": "COMPANY_APPROVAL",
    "currentStageName": "Company Admin Approval",
    
    "allowedActions": {
      "canApprove": {
        "allowed": false,
        "reason": "Entity has been rejected"
      },
      "canReject": {
        "allowed": false,
        "reason": "Entity has been rejected"
      },
      "canResubmit": {
        "allowed": true,
        "reason": "You can resubmit this entity for approval"
      },
      "canCancel": {
        "allowed": false,
        "reason": "Entity has been rejected"
      },
      "canView": {
        "allowed": true,
        "reason": "User can view this entity"
      },
      "canEdit": {
        "allowed": true,
        "reason": "You can edit this rejected entity before resubmitting"
      }
    },
    
    "informationalMessage": null,
    "statusMessage": "This entity has been rejected",
    "nextActionHint": "Edit the entity and resubmit for approval",
    
    "userRoleInfo": {
      "currentRole": "EMPLOYEE",
      "isAllowedAtCurrentStage": false,
      "allowedRolesAtCurrentStage": ["COMPANY_ADMIN"]
    }
  }
}
```

### 5. No Workflow Configured

```json
{
  "success": true,
  "data": {
    "entityId": "ORD-1706000001",
    "entityType": "ORDER",
    "entityStatus": "DRAFT",
    
    "workflowState": "NO_WORKFLOW_CONFIG",
    "currentStage": null,
    "currentStageName": null,
    
    "allowedActions": {
      "canApprove": {
        "allowed": false,
        "reason": "No workflow configured for this entity type"
      },
      "canReject": {
        "allowed": false,
        "reason": "No workflow configured for this entity type"
      },
      "canResubmit": {
        "allowed": false,
        "reason": "No workflow configured for this entity type"
      },
      "canCancel": {
        "allowed": true,
        "reason": "You can cancel this entity"
      },
      "canView": {
        "allowed": true,
        "reason": "You can view this entity"
      },
      "canEdit": {
        "allowed": true,
        "reason": "You can edit this entity"
      }
    },
    
    "rejectionConfig": {
      "isAllowed": false,
      "isReasonMandatory": true,
      "isRemarksMandatory": false,
      "maxRemarksLength": 2000,
      "allowedReasonCodes": [],
      "allowedActions": []
    },
    
    "workflowProgress": null,
    
    "informationalMessage": "No approval workflow is configured for this entity type",
    "statusMessage": "No workflow configured",
    "nextActionHint": "Contact administrator to configure workflow",
    
    "userRoleInfo": {
      "currentRole": "COMPANY_ADMIN",
      "isAllowedAtCurrentStage": false,
      "allowedRolesAtCurrentStage": []
    },
    
    "workflowConfigId": null,
    "workflowConfigVersion": null
  }
}
```

---

## Actions Evaluated

| Action | Description | When Allowed |
|--------|-------------|--------------|
| `canApprove` | User can approve entity | User role in stage's allowedRoles AND stage.canApprove=true |
| `canReject` | User can reject entity | User role in stage's allowedRoles AND stage.canReject=true |
| `canResubmit` | User can resubmit rejected entity | Entity is REJECTED AND user is owner or admin |
| `canCancel` | User can cancel entity | User is owner or admin |
| `canView` | User can view entity | Always true (if entity exists) |
| `canEdit` | User can edit entity | Entity is REJECTED AND user is owner or admin |

---

## Rejection Configuration

When rejection is allowed, the API returns:

| Field | Description |
|-------|-------------|
| `isReasonMandatory` | Always true - reason code required |
| `isRemarksMandatory` | Usually false - remarks optional |
| `maxRemarksLength` | Maximum 2000 characters |
| `allowedReasonCodes` | Entity-specific reason codes for dropdown |
| `allowedActions` | REJECT, SEND_BACK, HOLD |

### Entity-Specific Reason Codes

**Order Reasons:**
- ELIGIBILITY_EXHAUSTED
- EMPLOYEE_NOT_ELIGIBLE
- INVALID_QUANTITY
- PRODUCT_UNAVAILABLE
- BUDGET_EXCEEDED
- SIZE_MISMATCH

**GRN Reasons:**
- QUANTITY_MISMATCH
- QUALITY_ISSUE
- DAMAGED_GOODS
- WRONG_ITEMS
- MISSING_DOCUMENTATION

**Invoice Reasons:**
- PRICING_DISCREPANCY
- TAX_CALCULATION_ERROR
- PO_MISMATCH
- GRN_NOT_APPROVED
- AMOUNT_EXCEEDS_LIMIT

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Entity not found | Returns 404 with all actions disabled |
| Workflow not configured | Returns workflowState='NO_WORKFLOW_CONFIG' |
| Entity already approved | All approval actions disabled |
| Entity already rejected | canResubmit/canEdit may be allowed |
| User role not in workflow | All approval actions disabled with reason |
| Disabled workflow | Same as "not configured" |

---

## Frontend Integration

### React Example

```tsx
import { useState, useEffect } from 'react'

interface UIRules {
  allowedActions: {
    canApprove: { allowed: boolean; reason?: string; confirmationMessage?: string }
    canReject: { allowed: boolean; reason?: string }
  }
  rejectionConfig: {
    allowedReasonCodes: Array<{ code: string; label: string }>
  }
  statusMessage: string | null
}

function OrderApprovalActions({ orderId }: { orderId: string }) {
  const [rules, setRules] = useState<UIRules | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    fetch(`/api/workflow/ui-rules?entityType=ORDER&entityId=${orderId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setRules(data.data)
        }
        setLoading(false)
      })
  }, [orderId])
  
  if (loading) return <div>Loading...</div>
  if (!rules) return <div>Error loading actions</div>
  
  return (
    <div>
      {/* Status Message */}
      <p>{rules.statusMessage}</p>
      
      {/* Approve Button - only shown if allowed */}
      {rules.allowedActions.canApprove.allowed && (
        <button onClick={() => handleApprove(orderId)}>
          Approve
        </button>
      )}
      
      {/* Reject Button - only shown if allowed */}
      {rules.allowedActions.canReject.allowed && (
        <button onClick={() => showRejectModal(rules.rejectionConfig)}>
          Reject
        </button>
      )}
      
      {/* Show reason if action is disabled */}
      {!rules.allowedActions.canApprove.allowed && (
        <p className="text-gray-500">
          {rules.allowedActions.canApprove.reason}
        </p>
      )}
    </div>
  )
}
```

### Key Integration Points

1. **Call UI Rules API** on page load or entity change
2. **Conditionally render** buttons based on `allowed` field
3. **Show disabled state** with `reason` as tooltip
4. **Populate rejection dropdown** from `allowedReasonCodes`
5. **Show confirmation dialog** if `requiresConfirmation=true`
6. **Display progress bar** from `workflowProgress`

---

## Files Created

| File | Purpose |
|------|---------|
| `lib/workflow/ui-rules-service.ts` | UI Rules evaluation engine |
| `app/api/workflow/ui-rules/route.ts` | API endpoint |

---

## Summary

The UI Rules layer provides:

✅ **Backend-driven permissions** - No logic duplication in frontend  
✅ **Rich UI metadata** - Messages, progress, confirmations  
✅ **Entity-specific rejection codes** - Configurable per entity type  
✅ **Graceful edge case handling** - Not found, no config, already processed  
✅ **Role-aware evaluation** - Dynamic from workflow config  
✅ **Workflow progress** - For UI progress bars/steppers  
