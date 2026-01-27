# Workflow API Design Document

## Overview

This document describes the **REST-style API layer** that exposes the workflow execution engine to the frontend. The APIs are:

- **Entity-agnostic** - Same endpoints for Order, GRN, Invoice
- **Configuration-driven** - No hardcoded roles or stages
- **Secure** - User context from auth, not request body
- **Standardized** - Consistent request/response formats

---

## Table of Contents

1. [API Endpoints](#api-endpoints)
2. [Authentication](#authentication)
3. [Approve API](#approve-api)
4. [Reject API](#reject-api)
5. [Get Actions API](#get-actions-api)
6. [Error Handling](#error-handling)
7. [Audit Logging](#audit-logging)
8. [Request/Response Examples](#requestresponse-examples)

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/workflow/approve` | Approve entity at current stage |
| POST | `/api/workflow/reject` | Reject entity at current stage |
| GET | `/api/workflow/actions` | Get available actions for user |

---

## Authentication

User context is **NEVER** accepted from request body. All user information comes from:

1. **HTTP Headers** (set by auth middleware):
   - `x-company-id` - Company identifier
   - `x-user-id` - User identifier
   - `x-user-role` - User's role (LOCATION_ADMIN, COMPANY_ADMIN, etc.)
   - `x-user-name` - User's display name (optional)

2. **Cookies** (fallback):
   - `companyId`
   - `userId`
   - `userRole`

### Why Headers/Cookies?

```
┌───────────────────────────────────────────────────────────────────────────┐
│                           SECURITY PRINCIPLE                               │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   ❌ NEVER accept userId or userRole from request body                    │
│      → Allows privilege escalation attacks                                 │
│                                                                            │
│   ✅ ALWAYS extract from authenticated session/token                      │
│      → Auth middleware validates and sets headers                          │
│      → API trusts headers set by server-side middleware                   │
│                                                                            │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Approve API

### Endpoint

```
POST /api/workflow/approve
```

### Request

**Headers:**
```
Content-Type: application/json
x-company-id: 100001
x-user-id: LA-001
x-user-role: LOCATION_ADMIN
x-user-name: Anjali Sharma
```

**Body:**
```json
{
  "entityType": "ORDER",
  "entityId": "ORD-1706000001",
  "remarks": "All items verified, approved"
}
```

### Request Validation

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `entityType` | string | ✅ | Must be: ORDER, GRN, INVOICE, PURCHASE_ORDER, RETURN_REQUEST |
| `entityId` | string | ✅ | Alphanumeric, 1-50 characters |
| `remarks` | string | ❌ | Optional approval remarks |

### Response (Success)

```json
{
  "success": true,
  "data": {
    "entityId": "ORD-1706000001",
    "entityType": "ORDER",
    "action": "APPROVED",
    "previousStage": "LOCATION_APPROVAL",
    "newStage": "COMPANY_APPROVAL",
    "previousStatus": "PENDING_LOCATION_APPROVAL",
    "newStatus": "PENDING_COMPANY_APPROVAL",
    "isFullyApproved": false,
    "auditId": "APR-LXN1234-ABC",
    "approvedAt": "2026-01-22T10:30:00.000Z"
  },
  "timestamp": "2026-01-22T10:30:00.123Z"
}
```

### Response (Final Approval)

```json
{
  "success": true,
  "data": {
    "entityId": "ORD-1706000001",
    "entityType": "ORDER",
    "action": "APPROVED",
    "previousStage": "COMPANY_APPROVAL",
    "newStage": null,
    "previousStatus": "PENDING_COMPANY_APPROVAL",
    "newStatus": "APPROVED",
    "isFullyApproved": true,
    "auditId": "APR-MYX5678-DEF",
    "approvedAt": "2026-01-22T14:45:00.000Z"
  },
  "timestamp": "2026-01-22T14:45:00.456Z"
}
```

### Behavior

```
1. Validate request shape
2. Extract user context from auth headers
3. Call approveEntity() from workflow engine
4. If success:
   - Fire notification (async)
   - Return success response
5. If failure:
   - Return error response with appropriate HTTP status
```

---

## Reject API

### Endpoint

```
POST /api/workflow/reject
```

### Request

**Headers:**
```
Content-Type: application/json
x-company-id: 100001
x-user-id: CA-001
x-user-role: COMPANY_ADMIN
x-user-name: Vikram Singh
```

**Body:**
```json
{
  "entityType": "ORDER",
  "entityId": "ORD-1706000001",
  "reasonCode": "INCOMPLETE_INFORMATION",
  "reasonLabel": "Missing size information",
  "remarks": "Please add sizes for items 2 and 3, then resubmit.",
  "action": "SEND_BACK"
}
```

### Request Validation

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `entityType` | string | ✅ | Must be: ORDER, GRN, INVOICE, etc. |
| `entityId` | string | ✅ | Alphanumeric, 1-50 characters |
| `reasonCode` | string | ✅ | **REQUIRED** - Rejection reason code |
| `reasonLabel` | string | ❌ | Human-readable reason |
| `remarks` | string | ❌ | Detailed rejection remarks |
| `action` | string | ❌ | REJECT, SEND_BACK, CANCEL, HOLD (default: REJECT) |

### Response (Success)

```json
{
  "success": true,
  "data": {
    "entityId": "ORD-1706000001",
    "entityType": "ORDER",
    "action": "REJECTED",
    "stage": "COMPANY_APPROVAL",
    "previousStatus": "PENDING_COMPANY_APPROVAL",
    "newStatus": "REJECTED_BY_COMPANY_ADMIN",
    "reasonCode": "INCOMPLETE_INFORMATION",
    "rejectionId": "REJ-PQR9012-GHI",
    "rejectedAt": "2026-01-22T15:00:00.000Z"
  },
  "timestamp": "2026-01-22T15:00:00.789Z"
}
```

### Behavior

```
1. Validate request shape (reasonCode is MANDATORY)
2. Extract user context from auth headers
3. Call rejectEntity() from workflow engine
4. If success:
   - Fire notification (async)
   - Return success response
5. If failure:
   - Return error response
```

---

## Get Actions API

### Endpoint

```
GET /api/workflow/actions?entityType=ORDER&entityId=ORD-1706000001
```

### Request

**Headers:**
```
x-company-id: 100001
x-user-id: LA-001
x-user-role: LOCATION_ADMIN
```

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `entityType` | string | ✅ | Entity type |
| `entityId` | string | ✅ | Entity ID |

### Response (Success)

```json
{
  "success": true,
  "data": {
    "entityId": "ORD-1706000001",
    "entityType": "ORDER",
    "currentStage": "LOCATION_APPROVAL",
    "currentStageName": "Location Admin Approval",
    "currentStatus": "PENDING_LOCATION_APPROVAL",
    "actions": {
      "canApprove": true,
      "canReject": true,
      "approveDisabledReason": null,
      "rejectDisabledReason": null
    },
    "workflowInfo": {
      "workflowName": "Two-Stage Order Approval",
      "totalStages": 2,
      "currentStageOrder": 1,
      "isTerminal": false,
      "nextStageName": "Company Admin Approval",
      "allowedRoles": ["LOCATION_ADMIN", "SITE_ADMIN"]
    }
  },
  "timestamp": "2026-01-22T10:00:00.000Z"
}
```

### Response (No Permission)

```json
{
  "success": true,
  "data": {
    "entityId": "ORD-1706000001",
    "entityType": "ORDER",
    "currentStage": "COMPANY_APPROVAL",
    "currentStageName": "Company Admin Approval",
    "currentStatus": "PENDING_COMPANY_APPROVAL",
    "actions": {
      "canApprove": false,
      "canReject": false,
      "approveDisabledReason": "Role LOCATION_ADMIN is not allowed at stage COMPANY_APPROVAL",
      "rejectDisabledReason": "Role LOCATION_ADMIN is not allowed at stage COMPANY_APPROVAL"
    },
    "workflowInfo": {
      "workflowName": "Two-Stage Order Approval",
      "totalStages": 2,
      "currentStageOrder": 2,
      "isTerminal": true,
      "nextStageName": null,
      "allowedRoles": ["COMPANY_ADMIN"]
    }
  },
  "timestamp": "2026-01-22T10:00:00.000Z"
}
```

### Use Case

Frontend calls this API to:
1. Show/hide Approve/Reject buttons
2. Display current workflow stage
3. Show who can act (allowedRoles)
4. Show progress (currentStageOrder / totalStages)

---

## Error Handling

### Standard Error Response

```json
{
  "success": false,
  "error": {
    "code": "API_E010",
    "message": "Request validation failed",
    "details": {
      "errors": [
        "entityType is required",
        "reasonCode is required for rejection"
      ]
    }
  },
  "timestamp": "2026-01-22T10:00:00.000Z"
}
```

### HTTP Status Codes

| Status | When Used |
|--------|-----------|
| 200 | Success |
| 400 | Validation error (missing/invalid fields) |
| 401 | Not authenticated |
| 403 | Not authorized (role not allowed) |
| 404 | Entity or workflow not found |
| 422 | Business logic error (invalid state, already processed) |
| 500 | Internal server error |

### API Error Codes

| Code | Constant | HTTP | Description |
|------|----------|------|-------------|
| API_E001 | UNAUTHORIZED | 401 | Not authenticated |
| API_E002 | FORBIDDEN | 403 | Not authorized |
| API_E010 | VALIDATION_ERROR | 400 | Request validation failed |
| API_E011 | MISSING_REQUIRED_FIELD | 400 | Required field missing |
| API_E012 | INVALID_ENTITY_TYPE | 400 | Unknown entity type |
| API_E013 | INVALID_ENTITY_ID | 400 | Invalid entity ID format |
| API_E014 | INVALID_REASON_CODE | 400 | Invalid rejection reason |
| API_E020 | ENTITY_NOT_FOUND | 404 | Entity does not exist |
| API_E021 | WORKFLOW_NOT_FOUND | 404 | No workflow config |
| API_E030 | ACTION_NOT_ALLOWED | 422 | Action not permitted |
| API_E031 | INVALID_STAGE | 422 | Invalid workflow stage |
| API_E032 | ROLE_NOT_PERMITTED | 403 | Role cannot act |
| API_E033 | ALREADY_PROCESSED | 422 | Already approved/rejected |
| API_E500 | INTERNAL_ERROR | 500 | Server error |

### Workflow Engine Error Codes

The API also surfaces workflow engine errors:

| Code | HTTP | Description |
|------|------|-------------|
| WF_E001 | 404 | Entity not found |
| WF_E010 | 404 | Workflow config not found |
| WF_E011 | 422 | Workflow inactive |
| WF_E022 | 422 | No current stage |
| WF_E030 | 403 | Role not allowed |
| WF_E031 | 403 | Approve not allowed |
| WF_E032 | 403 | Reject not allowed |

---

## Audit Logging

Every API call is logged with:

```typescript
interface WorkflowApiAuditLog {
  timestamp: string          // ISO timestamp
  action: 'APPROVE' | 'REJECT' | 'GET_ACTIONS'
  entityType: string
  entityId: string
  companyId: string
  userId: string
  userRole: string
  success: boolean
  errorCode?: string
  errorMessage?: string
  requestPayload?: object    // Sanitized (remarks redacted)
  responseData?: object      // Key fields only
  durationMs: number         // Processing time
  clientIp?: string
  userAgent?: string
}
```

### Example Log Output

```
[WORKFLOW-API] [APPROVE] {
  timestamp: "2026-01-22T10:30:00.000Z",
  action: "APPROVE",
  entityType: "ORDER",
  entityId: "ORD-1706000001",
  companyId: "100001",
  userId: "LA-001",
  userRole: "LOCATION_ADMIN",
  success: true,
  responseData: {
    newStage: "COMPANY_APPROVAL",
    newStatus: "PENDING_COMPANY_APPROVAL",
    isFullyApproved: false
  },
  durationMs: 145
}
```

---

## Request/Response Examples

### Example 1: Location Admin Approves Order

**Request:**
```bash
curl -X POST https://app.example.com/api/workflow/approve \
  -H "Content-Type: application/json" \
  -H "x-company-id: 100001" \
  -H "x-user-id: LA-001" \
  -H "x-user-role: LOCATION_ADMIN" \
  -d '{
    "entityType": "ORDER",
    "entityId": "ORD-1706000001"
  }'
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "entityId": "ORD-1706000001",
    "entityType": "ORDER",
    "action": "APPROVED",
    "previousStage": "LOCATION_APPROVAL",
    "newStage": "COMPANY_APPROVAL",
    "isFullyApproved": false,
    "auditId": "APR-LXN1234"
  }
}
```

### Example 2: Company Admin Rejects Order

**Request:**
```bash
curl -X POST https://app.example.com/api/workflow/reject \
  -H "Content-Type: application/json" \
  -H "x-company-id: 100001" \
  -H "x-user-id: CA-001" \
  -H "x-user-role: COMPANY_ADMIN" \
  -d '{
    "entityType": "ORDER",
    "entityId": "ORD-1706000001",
    "reasonCode": "BUDGET_EXCEEDED",
    "remarks": "Order exceeds monthly budget. Resubmit next month."
  }'
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "entityId": "ORD-1706000001",
    "entityType": "ORDER",
    "action": "REJECTED",
    "stage": "COMPANY_APPROVAL",
    "newStatus": "REJECTED_BY_COMPANY_ADMIN",
    "reasonCode": "BUDGET_EXCEEDED",
    "rejectionId": "REJ-MYX5678"
  }
}
```

### Example 3: Role Not Allowed

**Request:**
```bash
curl -X POST https://app.example.com/api/workflow/approve \
  -H "x-company-id: 100001" \
  -H "x-user-id: EMP-001" \
  -H "x-user-role: EMPLOYEE" \
  -d '{"entityType": "ORDER", "entityId": "ORD-123"}'
```

**Response (403 Forbidden):**
```json
{
  "success": false,
  "error": {
    "code": "WF_E030",
    "message": "Role EMPLOYEE is not allowed to approve at stage LOCATION_APPROVAL. Allowed roles: LOCATION_ADMIN, SITE_ADMIN"
  }
}
```

### Example 4: Missing Reason Code

**Request:**
```bash
curl -X POST https://app.example.com/api/workflow/reject \
  -H "x-company-id: 100001" \
  -H "x-user-id: CA-001" \
  -H "x-user-role: COMPANY_ADMIN" \
  -d '{"entityType": "ORDER", "entityId": "ORD-123"}'
```

**Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "API_E010",
    "message": "Request validation failed",
    "details": {
      "errors": ["reasonCode is required for rejection"]
    }
  }
}
```

---

## Files Created

| File | Purpose |
|------|---------|
| `lib/workflow/api-types.ts` | Request/response types, validation, error codes |
| `app/api/workflow/approve/route.ts` | Approve endpoint |
| `app/api/workflow/reject/route.ts` | Reject endpoint |
| `app/api/workflow/actions/route.ts` | Get actions endpoint |

---

## Summary

The Workflow API layer provides:

✅ **Entity-agnostic endpoints** - Same API for Order, GRN, Invoice  
✅ **No hardcoded logic** - All rules from workflow configuration  
✅ **Secure by design** - User context from auth, not request  
✅ **Standardized responses** - Consistent success/error format  
✅ **Complete audit logging** - Every action tracked  
✅ **Clear error codes** - Specific, actionable error messages  
✅ **Notification integration** - Events fired on success  
