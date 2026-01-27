/**
 * Workflow Events - Canonical Event Definitions
 * 
 * Defines standard workflow events emitted by the workflow engine.
 * These events drive the notification system without hardcoding
 * entity-specific or stage-specific logic.
 * 
 * Event-Driven Design:
 * - Workflow engine emits events (fire-and-forget)
 * - Notification orchestrator subscribes to events
 * - Mapping configuration determines who gets notified
 * 
 * @module lib/workflow/workflow-events
 */

import { WorkflowEntityType } from '../models/WorkflowConfiguration'

// =============================================================================
// WORKFLOW EVENT TYPES
// =============================================================================

/**
 * Canonical workflow event types
 * These are standard events that apply to ALL workflow-enabled entities
 */
export const WORKFLOW_EVENT_TYPES = {
  // Submission events
  ENTITY_SUBMITTED: 'ENTITY_SUBMITTED',           // New entity submitted for approval
  ENTITY_RESUBMITTED: 'ENTITY_RESUBMITTED',       // Rejected entity resubmitted
  
  // Approval events
  ENTITY_APPROVED: 'ENTITY_APPROVED',             // Final approval (workflow complete)
  ENTITY_APPROVED_AT_STAGE: 'ENTITY_APPROVED_AT_STAGE', // Approved at intermediate stage
  
  // Rejection events
  ENTITY_REJECTED: 'ENTITY_REJECTED',             // Rejected (workflow terminated)
  ENTITY_REJECTED_AT_STAGE: 'ENTITY_REJECTED_AT_STAGE', // Rejected at specific stage
  
  // Cancellation events
  ENTITY_CANCELLED: 'ENTITY_CANCELLED',           // Entity cancelled by owner/admin
  
  // Stage transition events
  ENTITY_MOVED_TO_STAGE: 'ENTITY_MOVED_TO_STAGE', // Entity moved to next stage
  
  // Reminder events (for cron jobs)
  APPROVAL_REMINDER: 'APPROVAL_REMINDER',         // Pending approval reminder
  APPROVAL_ESCALATION: 'APPROVAL_ESCALATION',     // Approval escalated due to timeout
  
  // Send-back events
  ENTITY_SENT_BACK: 'ENTITY_SENT_BACK',           // Sent back for correction (not rejected)
} as const

export type WorkflowEventType = typeof WORKFLOW_EVENT_TYPES[keyof typeof WORKFLOW_EVENT_TYPES]

// =============================================================================
// WORKFLOW EVENT PAYLOAD
// =============================================================================

/**
 * Base payload for all workflow events
 * Contains common fields required by notification orchestrator
 */
export interface WorkflowEventPayload {
  // Event metadata
  eventId: string              // Unique event ID (for idempotency)
  eventType: WorkflowEventType // Type of event
  eventTimestamp: string       // ISO timestamp when event occurred
  
  // Entity identification
  companyId: string            // Company ID
  entityType: WorkflowEntityType // ORDER, GRN, INVOICE, etc.
  entityId: string             // Entity's business ID (e.g., ORD-123)
  
  // Workflow state
  currentStage: string | null  // Current workflow stage key
  previousStage?: string       // Previous stage (for stage transitions)
  currentStatus: string        // Current entity status
  previousStatus?: string      // Previous status
  
  // Actor information (who triggered the event)
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
  
  // Entity snapshot (key fields for templates)
  entitySnapshot: {
    displayId?: string         // e.g., PR number, GRN number
    createdBy?: string         // Original requester
    createdByEmail?: string    // Original requester email
    createdByName?: string     // Original requester name
    totalAmount?: number       // For orders/invoices
    itemCount?: number         // Number of items
    vendorId?: string
    vendorName?: string
    locationId?: string
    locationName?: string
    [key: string]: any         // Additional entity-specific fields
  }
  
  // Extensibility
  metadata?: Record<string, any>
}

/**
 * Extended payload for stage-specific events
 */
export interface StageEventPayload extends WorkflowEventPayload {
  stageInfo: {
    stageKey: string
    stageName: string
    stageOrder: number
    isTerminal: boolean
    allowedRoles: string[]
  }
  nextStageInfo?: {
    stageKey: string
    stageName: string
    stageOrder: number
    allowedRoles: string[]
  }
}

// =============================================================================
// EVENT BUILDER UTILITIES
// =============================================================================

/**
 * Generate unique event ID
 */
export function generateEventId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `WFE-${timestamp}-${random}`.toUpperCase()
}

/**
 * Build event payload for entity submission
 */
export function buildSubmissionEvent(params: {
  companyId: string
  entityType: WorkflowEntityType
  entityId: string
  currentStage: string
  currentStatus: string
  triggeredBy: WorkflowEventPayload['triggeredBy']
  entitySnapshot: WorkflowEventPayload['entitySnapshot']
  isResubmission?: boolean
  metadata?: Record<string, any>
}): WorkflowEventPayload {
  return {
    eventId: generateEventId(),
    eventType: params.isResubmission 
      ? WORKFLOW_EVENT_TYPES.ENTITY_RESUBMITTED 
      : WORKFLOW_EVENT_TYPES.ENTITY_SUBMITTED,
    eventTimestamp: new Date().toISOString(),
    companyId: params.companyId,
    entityType: params.entityType,
    entityId: params.entityId,
    currentStage: params.currentStage,
    currentStatus: params.currentStatus,
    triggeredBy: params.triggeredBy,
    entitySnapshot: params.entitySnapshot,
    metadata: params.metadata,
  }
}

/**
 * Build event payload for approval
 */
export function buildApprovalEvent(params: {
  companyId: string
  entityType: WorkflowEntityType
  entityId: string
  currentStage: string
  previousStage?: string
  currentStatus: string
  previousStatus?: string
  triggeredBy: WorkflowEventPayload['triggeredBy']
  entitySnapshot: WorkflowEventPayload['entitySnapshot']
  isTerminal: boolean
  stageInfo?: StageEventPayload['stageInfo']
  nextStageInfo?: StageEventPayload['nextStageInfo']
  metadata?: Record<string, any>
}): StageEventPayload {
  return {
    eventId: generateEventId(),
    eventType: params.isTerminal 
      ? WORKFLOW_EVENT_TYPES.ENTITY_APPROVED 
      : WORKFLOW_EVENT_TYPES.ENTITY_APPROVED_AT_STAGE,
    eventTimestamp: new Date().toISOString(),
    companyId: params.companyId,
    entityType: params.entityType,
    entityId: params.entityId,
    currentStage: params.currentStage,
    previousStage: params.previousStage,
    currentStatus: params.currentStatus,
    previousStatus: params.previousStatus,
    triggeredBy: params.triggeredBy,
    entitySnapshot: params.entitySnapshot,
    stageInfo: params.stageInfo || {
      stageKey: params.currentStage,
      stageName: params.currentStage,
      stageOrder: 0,
      isTerminal: params.isTerminal,
      allowedRoles: [],
    },
    nextStageInfo: params.nextStageInfo,
    metadata: params.metadata,
  }
}

/**
 * Build event payload for rejection
 */
export function buildRejectionEvent(params: {
  companyId: string
  entityType: WorkflowEntityType
  entityId: string
  currentStage: string
  currentStatus: string
  previousStatus?: string
  triggeredBy: WorkflowEventPayload['triggeredBy']
  entitySnapshot: WorkflowEventPayload['entitySnapshot']
  rejection: WorkflowEventPayload['rejection']
  stageInfo?: StageEventPayload['stageInfo']
  metadata?: Record<string, any>
}): StageEventPayload {
  return {
    eventId: generateEventId(),
    eventType: WORKFLOW_EVENT_TYPES.ENTITY_REJECTED,
    eventTimestamp: new Date().toISOString(),
    companyId: params.companyId,
    entityType: params.entityType,
    entityId: params.entityId,
    currentStage: params.currentStage,
    currentStatus: params.currentStatus,
    previousStatus: params.previousStatus,
    triggeredBy: params.triggeredBy,
    entitySnapshot: params.entitySnapshot,
    rejection: params.rejection,
    stageInfo: params.stageInfo || {
      stageKey: params.currentStage,
      stageName: params.currentStage,
      stageOrder: 0,
      isTerminal: false,
      allowedRoles: [],
    },
    metadata: params.metadata,
  }
}

/**
 * Build event payload for stage transition
 */
export function buildStageTransitionEvent(params: {
  companyId: string
  entityType: WorkflowEntityType
  entityId: string
  currentStage: string
  previousStage: string
  currentStatus: string
  triggeredBy: WorkflowEventPayload['triggeredBy']
  entitySnapshot: WorkflowEventPayload['entitySnapshot']
  stageInfo: StageEventPayload['stageInfo']
  nextStageInfo?: StageEventPayload['nextStageInfo']
  metadata?: Record<string, any>
}): StageEventPayload {
  return {
    eventId: generateEventId(),
    eventType: WORKFLOW_EVENT_TYPES.ENTITY_MOVED_TO_STAGE,
    eventTimestamp: new Date().toISOString(),
    companyId: params.companyId,
    entityType: params.entityType,
    entityId: params.entityId,
    currentStage: params.currentStage,
    previousStage: params.previousStage,
    currentStatus: params.currentStatus,
    triggeredBy: params.triggeredBy,
    entitySnapshot: params.entitySnapshot,
    stageInfo: params.stageInfo,
    nextStageInfo: params.nextStageInfo,
    metadata: params.metadata,
  }
}

// =============================================================================
// EVENT EMITTER INTERFACE
// =============================================================================

/**
 * Event listener type
 */
export type WorkflowEventListener = (event: WorkflowEventPayload) => Promise<void>

/**
 * Simple in-memory event bus for workflow events
 * In production, this could be replaced with Redis Pub/Sub, Kafka, etc.
 */
class WorkflowEventBus {
  private listeners: Map<WorkflowEventType | '*', WorkflowEventListener[]> = new Map()
  
  /**
   * Subscribe to a specific event type
   */
  subscribe(eventType: WorkflowEventType | '*', listener: WorkflowEventListener): () => void {
    const existing = this.listeners.get(eventType) || []
    this.listeners.set(eventType, [...existing, listener])
    
    // Return unsubscribe function
    return () => {
      const current = this.listeners.get(eventType) || []
      this.listeners.set(eventType, current.filter(l => l !== listener))
    }
  }
  
  /**
   * Emit an event to all subscribers
   * Fire-and-forget: workflow does not wait for listeners
   */
  async emit(event: WorkflowEventPayload): Promise<void> {
    console.log(`[WorkflowEventBus] Emitting event: ${event.eventType}`, {
      eventId: event.eventId,
      entityType: event.entityType,
      entityId: event.entityId,
      currentStage: event.currentStage,
    })
    
    // Get specific listeners
    const specificListeners = this.listeners.get(event.eventType) || []
    // Get wildcard listeners
    const wildcardListeners = this.listeners.get('*') || []
    
    const allListeners = [...specificListeners, ...wildcardListeners]
    
    if (allListeners.length === 0) {
      console.log(`[WorkflowEventBus] No listeners for event: ${event.eventType}`)
      return
    }
    
    // Fire-and-forget: Don't await, just log errors
    for (const listener of allListeners) {
      listener(event).catch(error => {
        console.error(`[WorkflowEventBus] Listener error for ${event.eventType}:`, error)
      })
    }
  }
}

// Singleton event bus instance
export const workflowEventBus = new WorkflowEventBus()

// =============================================================================
// EXPORTS
// =============================================================================

export {
  WorkflowEventBus,
}
