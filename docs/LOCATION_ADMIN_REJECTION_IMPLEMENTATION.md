# Location Admin Order Rejection - Implementation Guide

## Overview

This document describes the configuration-driven implementation of Location Admin rejection behavior for Orders in the UDS workflow system.

**Key Principle**: All behavior is driven by configuration. No hardcoded roles, stage names, or business rules in code.

---

## 1. Schema Extensions

### IStageRejectionConfig (NEW)

Added to `lib/models/WorkflowConfiguration.ts`:

```typescript
interface IStageRejectionConfig {
  // Workflow termination
  isTerminalOnReject: boolean         // Workflow ends immediately on rejection
  stopFurtherStagesOnReject: boolean  // No subsequent stages triggered
  
  // Validation
  isReasonCodeMandatory: boolean      // Always true (system requirement)
  isRemarksMandatory: boolean         // Configurable per stage
  maxRemarksLength?: number           // Default: 2000
  allowedReasonCodes?: string[]       // Restrict to specific codes
  
  // Notifications
  notifyRolesOnReject: string[]       // Who to notify (resolved via mapping)
  notifyRequestor: boolean            // Notify original submitter
  excludeFromNotification?: string[]  // Exclude specific roles
  
  // Visibility
  visibleToRolesAfterReject: string[] // Who can see rejected entity
  hiddenFromRolesAfterReject?: string[] // Who cannot see
  
  // Override (future)
  allowOverrideRoles?: string[]       // Roles that can override rejection
  
  // Resubmission
  resubmissionStrategy: 'NEW_ENTITY' | 'SAME_ENTITY'
  allowResubmission: boolean
  resubmissionAllowedRoles?: string[]
  
  // Status
  rejectedStatus?: string             // Override default 'REJECTED'
}
```

---

## 2. Example Configurations

### 2.1 Location Admin Rejection (Default - Remarks OPTIONAL)

```json
{
  "id": "WF-ORDER-ICICI-001",
  "companyId": "1",
  "entityType": "ORDER",
  "workflowName": "ICICI Order Approval Workflow",
  "isActive": true,
  "stages": [
    {
      "stageKey": "LOCATION_APPROVAL",
      "stageName": "Location Admin Approval",
      "order": 1,
      "allowedRoles": ["LOCATION_ADMIN", "SITE_ADMIN"],
      "canApprove": true,
      "canReject": true,
      "isTerminal": false,
      "rejectionConfig": {
        "isTerminalOnReject": true,
        "stopFurtherStagesOnReject": true,
        "isReasonCodeMandatory": true,
        "isRemarksMandatory": false,
        "notifyRolesOnReject": ["REQUESTOR"],
        "notifyRequestor": true,
        "excludeFromNotification": ["COMPANY_ADMIN"],
        "visibleToRolesAfterReject": ["REQUESTOR", "LOCATION_ADMIN"],
        "hiddenFromRolesAfterReject": ["COMPANY_ADMIN"],
        "resubmissionStrategy": "NEW_ENTITY",
        "allowResubmission": true,
        "resubmissionAllowedRoles": ["REQUESTOR"],
        "rejectedStatus": "REJECTED_BY_LOCATION_ADMIN"
      }
    },
    {
      "stageKey": "COMPANY_APPROVAL",
      "stageName": "Company Admin Approval",
      "order": 2,
      "allowedRoles": ["COMPANY_ADMIN"],
      "canApprove": true,
      "canReject": true,
      "isTerminal": true,
      "rejectionConfig": {
        "isTerminalOnReject": true,
        "isRemarksMandatory": true,
        "notifyRolesOnReject": ["REQUESTOR", "LOCATION_ADMIN"],
        "visibleToRolesAfterReject": ["REQUESTOR", "LOCATION_ADMIN", "COMPANY_ADMIN"],
        "resubmissionStrategy": "NEW_ENTITY",
        "allowResubmission": true
      }
    }
  ],
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

### 2.2 Future Configuration: Remarks MANDATORY

```json
{
  "stageKey": "LOCATION_APPROVAL",
  "stageName": "Location Admin Approval",
  "rejectionConfig": {
    "isTerminalOnReject": true,
    "isRemarksMandatory": true,
    "maxRemarksLength": 500,
    "notifyRolesOnReject": ["REQUESTOR", "COMPANY_ADMIN"],
    "visibleToRolesAfterReject": ["REQUESTOR", "LOCATION_ADMIN", "COMPANY_ADMIN"]
  }
}
```

### 2.3 Future Configuration: Company Admin Can Override

```json
{
  "stageKey": "LOCATION_APPROVAL",
  "rejectionConfig": {
    "isTerminalOnReject": false,
    "stopFurtherStagesOnReject": false,
    "allowOverrideRoles": ["COMPANY_ADMIN"],
    "requireApprovalForOverride": true,
    "notifyRolesOnReject": ["REQUESTOR", "COMPANY_ADMIN"],
    "visibleToRolesAfterReject": ["REQUESTOR", "LOCATION_ADMIN", "COMPANY_ADMIN"]
  }
}
```

### 2.4 Future Configuration: Same Entity Resubmission

```json
{
  "stageKey": "LOCATION_APPROVAL",
  "rejectionConfig": {
    "isTerminalOnReject": true,
    "resubmissionStrategy": "SAME_ENTITY",
    "allowResubmission": true,
    "resubmissionAllowedRoles": ["REQUESTOR", "COMPANY_ADMIN"]
  }
}
```

---

## 3. Rejection Engine Pseudocode

```pseudocode
function rejectEntity(input):
    // 1. Validate entity exists and belongs to company
    entity = repository.findById(input.entityId)
    if not entity or entity.companyId != input.companyId:
        return error("Entity not found")
    
    // 2. Validate user can reject at current stage
    validation = validateRejectionPermission(input.companyId, input.entityType, entity, input.userRole)
    if not validation.valid:
        return error(validation.errorMessage)
    
    currentStage = validation.stage
    config = validation.config
    
    // 3. Get effective rejection config (CONFIGURATION-DRIVEN)
    rejectionConfig = getEffectiveRejectionConfig(config, currentStage.stageKey)
    
    // 4. Validate input against config
    if not input.reasonCode:
        return error("Reason code is required")  // System requirement
    
    if rejectionConfig.isRemarksMandatory and not input.remarks:
        return error("Remarks are required at this stage")  // Config-driven
    
    if rejectionConfig.allowedReasonCodes and input.reasonCode not in rejectionConfig.allowedReasonCodes:
        return error("Invalid reason code for this stage")
    
    // 5. Determine new status (CONFIGURATION-DRIVEN)
    newStatus = rejectionConfig.rejectedStatus 
                or config.statusOnRejection[currentStage.stageKey] 
                or "REJECTED"
    
    // 6. Update entity
    entity.status = newStatus
    if rejectionConfig.isTerminalOnReject:
        entity.currentStage = null  // Workflow ends
    repository.save(entity)
    
    // 7. Create rejection record
    rejection = createRejectionRecord(...)
    
    // 8. Return result with config for caller
    return {
        success: true,
        data: {
            newStatus,
            isTerminal: rejectionConfig.isTerminalOnReject,
            notifyRoles: rejectionConfig.notifyRolesOnReject,
            visibleToRoles: rejectionConfig.visibleToRolesAfterReject,
            resubmissionStrategy: rejectionConfig.resubmissionStrategy
        }
    }
```

---

## 4. Notification Flow

Notifications are NOT hardcoded in the rejection engine. Instead:

1. **Rejection engine emits generic event**: `ENTITY_REJECTED_AT_STAGE`
2. **Event payload includes**:
   - `entityType`, `entityId`, `companyId`
   - `stageKey`, `rejectorRole`
   - `rejectionConfig.notifyRolesOnReject`
3. **Notification orchestrator**:
   - Looks up `WorkflowNotificationMapping` for the event
   - Resolves recipients using `RECIPIENT_RESOLVERS`
   - Sends notifications via configured channels

### Example Notification Mapping

```json
{
  "companyId": "1",
  "entityType": "ORDER",
  "eventType": "ENTITY_REJECTED_AT_STAGE",
  "stageKey": "LOCATION_APPROVAL",
  "recipientResolvers": ["REQUESTOR"],
  "excludeActionPerformer": true,
  "channels": [
    {
      "channel": "EMAIL",
      "templateKey": "ORDER_REJECTED_BY_LOCATION_ADMIN"
    }
  ]
}
```

---

## 5. UI Rules Response

When UI calls `evaluateUIRules()` for a rejected entity:

```json
{
  "workflowState": "REJECTED",
  "allowedActions": {
    "canApprove": { "allowed": false, "reason": "Entity has been rejected" },
    "canReject": { "allowed": false, "reason": "Entity has been rejected" },
    "canResubmit": { 
      "allowed": true, 
      "reason": "You must create a new request to resubmit",
      "requiresConfirmation": true,
      "confirmationMessage": "This will create a new request. Continue?"
    },
    "canEdit": { "allowed": false, "reason": "This rejection requires creating a new request" },
    "canView": { "allowed": true }
  },
  "rejectionConfig": {
    "isAllowed": false,
    "isReasonMandatory": true,
    "isRemarksMandatory": false
  }
}
```

---

## 6. Flexibility Preserved

| Future Requirement | Configuration Change Only |
|--------------------|---------------------------|
| Company Admin can view Location Admin rejections | `visibleToRolesAfterReject: ["...", "COMPANY_ADMIN"]` |
| Company Admin can override rejections | `allowOverrideRoles: ["COMPANY_ADMIN"]` |
| Remarks become mandatory | `isRemarksMandatory: true` |
| Same entity resubmission | `resubmissionStrategy: "SAME_ENTITY"` |
| Different notifications | Update `WorkflowNotificationMapping` |
| Add Finance approval stage | Add new stage to `stages[]` array |
| Restrict reason codes per stage | `allowedReasonCodes: ["CODE1", "CODE2"]` |

**No code changes required for any of the above.**

---

## 7. API Response Format

When an order is rejected via API:

```json
{
  "success": true,
  "data": {
    "entityId": "ORD-2024-001",
    "previousStatus": "PENDING_LOCATION_APPROVAL",
    "newStatus": "REJECTED_BY_LOCATION_ADMIN",
    "isTerminal": true,
    "rejectionId": "REJ-XYZ123",
    "notifyRoles": ["REQUESTOR"],
    "visibleToRoles": ["REQUESTOR", "LOCATION_ADMIN"],
    "resubmissionStrategy": "NEW_ENTITY",
    "allowResubmission": true
  }
}
```

---

## 8. Files Modified

| File | Changes |
|------|---------|
| `lib/models/WorkflowConfiguration.ts` | Added `IStageRejectionConfig`, `IGlobalRejectionConfig`, `getEffectiveRejectionConfig()` |
| `lib/workflow/workflow-execution-engine.ts` | `rejectEntity()` now reads from config, validates remarks, returns rich result |
| `lib/workflow/ui-rules-service.ts` | `buildRejectionConfig()` uses stage config, `evaluateResubmitPermission()` honors config |

---

## 9. Migration Notes

Existing workflow configurations without `rejectionConfig` will use system defaults:

```typescript
SYSTEM_DEFAULT_REJECTION_CONFIG = {
  isTerminalOnReject: true,
  isRemarksMandatory: false,
  resubmissionStrategy: 'NEW_ENTITY',
  notifyRolesOnReject: ['REQUESTOR'],
  visibleToRolesAfterReject: ['REQUESTOR', 'COMPANY_ADMIN'],
  // ... other defaults
}
```

This ensures backward compatibility while enabling new features through configuration.
