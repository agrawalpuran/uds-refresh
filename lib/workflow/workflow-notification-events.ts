/**
 * Workflow Notification Events
 * 
 * Defines notification events that should be fired after workflow actions.
 * This module provides event definitions and a helper to fire notifications.
 * 
 * The actual notification sending is delegated to the existing notification
 * service - this module just provides the workflow-specific event definitions.
 * 
 * @module lib/workflow/workflow-notification-events
 */

import { WorkflowEntityType, WORKFLOW_ENTITY_TYPES } from '../models/WorkflowConfiguration'
import { ApproveResultData, RejectResultData } from './workflow-execution-engine'

// =============================================================================
// NOTIFICATION EVENT TYPES
// =============================================================================

/**
 * Workflow notification event types
 */
export const WORKFLOW_NOTIFICATION_EVENTS = {
  // Approval events
  ORDER_APPROVED_AT_STAGE: 'ORDER_APPROVED_AT_STAGE',
  ORDER_FULLY_APPROVED: 'ORDER_FULLY_APPROVED',
  GRN_APPROVED: 'GRN_APPROVED',
  INVOICE_APPROVED_AT_STAGE: 'INVOICE_APPROVED_AT_STAGE',
  INVOICE_FULLY_APPROVED: 'INVOICE_FULLY_APPROVED',
  
  // Rejection events
  ORDER_REJECTED: 'ORDER_REJECTED',
  GRN_REJECTED: 'GRN_REJECTED',
  INVOICE_REJECTED: 'INVOICE_REJECTED',
  
  // Stage transition events
  ORDER_MOVED_TO_NEXT_STAGE: 'ORDER_MOVED_TO_NEXT_STAGE',
  
  // Generic events (for future entities)
  ENTITY_APPROVED: 'ENTITY_APPROVED',
  ENTITY_REJECTED: 'ENTITY_REJECTED',
} as const

export type WorkflowNotificationEvent = typeof WORKFLOW_NOTIFICATION_EVENTS[keyof typeof WORKFLOW_NOTIFICATION_EVENTS]

// =============================================================================
// NOTIFICATION PAYLOAD TYPES
// =============================================================================

/**
 * Base notification payload
 */
export interface WorkflowNotificationPayload {
  event: WorkflowNotificationEvent
  companyId: string
  entityType: WorkflowEntityType
  entityId: string
  timestamp: Date
}

/**
 * Approval notification payload
 */
export interface ApprovalNotificationPayload extends WorkflowNotificationPayload {
  approvedBy: string
  approvedByRole: string
  approvedByName?: string
  fromStage: string
  toStage: string | null
  isTerminal: boolean
  previousStatus: string
  newStatus: string
  auditId: string
}

/**
 * Rejection notification payload
 */
export interface RejectionNotificationPayload extends WorkflowNotificationPayload {
  rejectedBy: string
  rejectedByRole: string
  rejectedByName?: string
  stage: string
  reasonCode: string
  reasonLabel?: string
  remarks?: string
  previousStatus: string
  newStatus: string
  rejectionId: string
}

// =============================================================================
// EVENT BUILDER HELPERS
// =============================================================================

/**
 * Build approval notification payload
 */
export function buildApprovalNotification(
  companyId: string,
  entityType: WorkflowEntityType,
  result: ApproveResultData,
  approverInfo: {
    userId: string
    userRole: string
    userName?: string
  }
): ApprovalNotificationPayload {
  const event = getApprovalEvent(entityType, result.isTerminal)
  
  return {
    event,
    companyId,
    entityType,
    entityId: result.entityId,
    timestamp: new Date(),
    approvedBy: approverInfo.userId,
    approvedByRole: approverInfo.userRole,
    approvedByName: approverInfo.userName,
    fromStage: result.previousStage,
    toStage: result.newStage,
    isTerminal: result.isTerminal,
    previousStatus: result.previousStatus,
    newStatus: result.newStatus,
    auditId: result.auditId,
  }
}

/**
 * Build rejection notification payload
 */
export function buildRejectionNotification(
  companyId: string,
  entityType: WorkflowEntityType,
  result: RejectResultData,
  rejectorInfo: {
    userId: string
    userRole: string
    userName?: string
    reasonCode: string
    reasonLabel?: string
    remarks?: string
  }
): RejectionNotificationPayload {
  const event = getRejectionEvent(entityType)
  
  return {
    event,
    companyId,
    entityType,
    entityId: result.entityId,
    timestamp: new Date(),
    rejectedBy: rejectorInfo.userId,
    rejectedByRole: rejectorInfo.userRole,
    rejectedByName: rejectorInfo.userName,
    stage: result.previousStage,
    reasonCode: rejectorInfo.reasonCode,
    reasonLabel: rejectorInfo.reasonLabel,
    remarks: rejectorInfo.remarks,
    previousStatus: result.previousStatus,
    newStatus: result.newStatus,
    rejectionId: result.rejectionId,
  }
}

/**
 * Get appropriate approval event based on entity type and terminal status
 */
function getApprovalEvent(
  entityType: WorkflowEntityType,
  isTerminal: boolean
): WorkflowNotificationEvent {
  switch (entityType) {
    case WORKFLOW_ENTITY_TYPES.ORDER:
      return isTerminal 
        ? WORKFLOW_NOTIFICATION_EVENTS.ORDER_FULLY_APPROVED
        : WORKFLOW_NOTIFICATION_EVENTS.ORDER_APPROVED_AT_STAGE
    case WORKFLOW_ENTITY_TYPES.GRN:
      return WORKFLOW_NOTIFICATION_EVENTS.GRN_APPROVED
    case WORKFLOW_ENTITY_TYPES.INVOICE:
      return isTerminal
        ? WORKFLOW_NOTIFICATION_EVENTS.INVOICE_FULLY_APPROVED
        : WORKFLOW_NOTIFICATION_EVENTS.INVOICE_APPROVED_AT_STAGE
    default:
      return WORKFLOW_NOTIFICATION_EVENTS.ENTITY_APPROVED
  }
}

/**
 * Get appropriate rejection event based on entity type
 */
function getRejectionEvent(entityType: WorkflowEntityType): WorkflowNotificationEvent {
  switch (entityType) {
    case WORKFLOW_ENTITY_TYPES.ORDER:
      return WORKFLOW_NOTIFICATION_EVENTS.ORDER_REJECTED
    case WORKFLOW_ENTITY_TYPES.GRN:
      return WORKFLOW_NOTIFICATION_EVENTS.GRN_REJECTED
    case WORKFLOW_ENTITY_TYPES.INVOICE:
      return WORKFLOW_NOTIFICATION_EVENTS.INVOICE_REJECTED
    default:
      return WORKFLOW_NOTIFICATION_EVENTS.ENTITY_REJECTED
  }
}

// =============================================================================
// NOTIFICATION TRIGGER (Integration Point)
// =============================================================================

/**
 * Fire workflow notification
 * 
 * This is the integration point with the existing notification service.
 * Implement the actual notification sending logic here.
 * 
 * @param payload The notification payload
 */
export async function fireWorkflowNotification(
  payload: ApprovalNotificationPayload | RejectionNotificationPayload
): Promise<void> {
  try {
    // Log the event for debugging
    console.log(`[WORKFLOW-NOTIFICATION] Event: ${payload.event}`, {
      entityType: payload.entityType,
      entityId: payload.entityId,
      companyId: payload.companyId,
    })
    
    // TODO: Integrate with existing notification service
    // Example integration:
    // 
    // const NotificationService = (await import('../services/NotificationService')).default
    // 
    // await NotificationService.sendNotification({
    //   eventType: payload.event,
    //   companyId: payload.companyId,
    //   entityType: payload.entityType,
    //   entityId: payload.entityId,
    //   data: payload,
    // })
    
    // For now, just log that we would send a notification
    console.log(`[WORKFLOW-NOTIFICATION] Would send notification for ${payload.event}`)
    
  } catch (error: any) {
    // Don't fail the workflow action if notification fails
    console.error('[WORKFLOW-NOTIFICATION] Failed to send notification:', error.message)
  }
}

/**
 * Get notification recipients based on event type and entity
 * 
 * This helper determines who should receive the notification.
 * Implement based on your notification rules.
 */
export function getNotificationRecipients(
  payload: ApprovalNotificationPayload | RejectionNotificationPayload
): {
  toRoles: string[]
  toUsers?: string[]
} {
  // Default recipients based on event type
  const event = payload.event
  
  if (event.includes('REJECTED')) {
    // Rejection notifications typically go to:
    // - The employee who created the order
    // - The previous approvers (if multi-stage)
    return {
      toRoles: ['EMPLOYEE'],
      // toUsers: [payload.entitySnapshot?.employeeId] // If available
    }
  }
  
  if (event.includes('APPROVED')) {
    // Approval notifications depend on whether it's terminal
    if ('isTerminal' in payload && payload.isTerminal) {
      // Final approval - notify employee, vendor
      return {
        toRoles: ['EMPLOYEE', 'VENDOR'],
      }
    } else {
      // Stage approval - notify next approver
      return {
        toRoles: ['COMPANY_ADMIN'], // Or dynamically determine from next stage
      }
    }
  }
  
  return {
    toRoles: ['COMPANY_ADMIN'],
  }
}
