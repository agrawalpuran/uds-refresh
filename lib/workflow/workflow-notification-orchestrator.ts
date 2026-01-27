/**
 * Workflow Notification Orchestrator
 * 
 * Central orchestrator that:
 * 1. Subscribes to workflow events
 * 2. Loads notification mappings
 * 3. Resolves recipients
 * 4. Resolves templates
 * 5. Sends notifications
 * 6. Logs results
 * 
 * Design Principles:
 * - Decoupled from workflow engine (fire-and-forget)
 * - Configuration-driven (no hardcoded logic)
 * - Graceful failures (never breaks workflow)
 * - DEMO_MODE support for safe testing
 * 
 * @module lib/workflow/workflow-notification-orchestrator
 */

import connectDB from '../db/mongodb'
import WorkflowNotificationMapping, {
  IWorkflowNotificationMapping,
  NOTIFICATION_CHANNELS,
  NotificationChannel,
} from '../models/WorkflowNotificationMapping'
import NotificationEvent from '../models/NotificationEvent'
import NotificationTemplate from '../models/NotificationTemplate'
import NotificationLog from '../models/NotificationLog'
import { sendEmail, EmailResult } from '../services/EmailProvider'
import { getCompanyBranding, isEventEnabledForCompany } from '../services/CompanyNotificationConfigService'
import { 
  WorkflowEventPayload, 
  WorkflowEventType,
  workflowEventBus,
  WORKFLOW_EVENT_TYPES,
} from './workflow-events'
import { 
  resolveWorkflowRecipients, 
  ResolvedRecipient,
  ResolutionContext,
} from './workflow-recipient-resolver'

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Demo mode check - when true, logs only, does not send
 */
function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true' || process.env.NODE_ENV === 'test'
}

/**
 * Check if notifications are enabled
 */
function areNotificationsEnabled(): boolean {
  return process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true'
}

/**
 * Max retry attempts for failed notifications
 */
const MAX_RETRY_ATTEMPTS = 3

/**
 * Retry delay in milliseconds (5 minutes)
 */
const RETRY_DELAY_MS = 5 * 60 * 1000

// =============================================================================
// TYPES
// =============================================================================

/**
 * Template context for rendering
 */
export interface TemplateContext {
  // Event info
  eventType: string
  eventTimestamp: string
  
  // Entity info
  entityType: string
  entityId: string
  entityDisplayId: string
  currentStage: string
  currentStageName: string
  currentStatus: string
  previousStatus: string
  
  // Rejection info
  rejectedBy: string
  rejectionReason: string
  rejectionRemarks: string
  
  // Approval info
  approvedBy: string
  approvedByRole: string
  
  // Requestor info
  requestorName: string
  requestorEmail: string
  
  // Company info
  companyId: string
  companyName: string
  brandName: string
  brandColor: string
  
  // Entity-specific info
  vendorName: string
  locationName: string
  totalAmount: string
  itemCount: string
  
  // Generic placeholders
  [key: string]: string | undefined
}

/**
 * Notification send result
 */
export interface NotificationSendResult {
  success: boolean
  logId?: string
  messageId?: string
  error?: string
  demoMode?: boolean
  recipient: string
  channel: NotificationChannel
}

/**
 * Orchestration result for a single event
 */
export interface OrchestrationResult {
  eventId: string
  eventType: WorkflowEventType
  entityType: string
  entityId: string
  mappingsFound: number
  recipientsResolved: number
  notificationsSent: number
  notificationsFailed: number
  results: NotificationSendResult[]
  errors: string[]
  demoMode: boolean
  timestamp: string
}

// =============================================================================
// TEMPLATE UTILITIES
// =============================================================================

/**
 * Build template context from event payload
 */
function buildTemplateContext(
  event: WorkflowEventPayload,
  branding: { brandName: string; brandColor: string }
): TemplateContext {
  const { entitySnapshot, triggeredBy, rejection } = event
  
  return {
    // Event info
    eventType: event.eventType,
    eventTimestamp: new Date(event.eventTimestamp).toLocaleString(),
    
    // Entity info
    entityType: formatEntityType(event.entityType),
    entityId: event.entityId,
    entityDisplayId: entitySnapshot.displayId || event.entityId,
    currentStage: event.currentStage || '',
    currentStageName: formatStageName(event.currentStage || ''),
    currentStatus: formatStatus(event.currentStatus),
    previousStatus: formatStatus(event.previousStatus || ''),
    
    // Rejection info
    rejectedBy: rejection ? triggeredBy.userName : '',
    rejectionReason: rejection?.reasonLabel || rejection?.reasonCode || '',
    rejectionRemarks: rejection?.remarks || '',
    
    // Approval info
    approvedBy: triggeredBy.userName,
    approvedByRole: formatRole(triggeredBy.userRole),
    
    // Requestor info
    requestorName: entitySnapshot.createdByName || '',
    requestorEmail: entitySnapshot.createdByEmail || '',
    
    // Company info
    companyId: event.companyId,
    companyName: entitySnapshot.companyName || branding.brandName,
    brandName: branding.brandName,
    brandColor: branding.brandColor,
    
    // Entity-specific info
    vendorName: entitySnapshot.vendorName || '',
    locationName: entitySnapshot.locationName || '',
    totalAmount: entitySnapshot.totalAmount?.toLocaleString() || '',
    itemCount: entitySnapshot.itemCount?.toString() || '',
    
    // Pass through all entity snapshot fields
    ...Object.fromEntries(
      Object.entries(entitySnapshot)
        .map(([k, v]) => [k, v?.toString() || ''])
    ),
  }
}

/**
 * Render template with context
 */
function renderTemplate(template: string, context: TemplateContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = context[key]
    return value !== undefined && value !== '' ? value : match
  })
}

/**
 * Format entity type for display
 */
function formatEntityType(entityType: string): string {
  const typeMap: Record<string, string> = {
    ORDER: 'Order',
    GRN: 'GRN',
    INVOICE: 'Invoice',
    PURCHASE_ORDER: 'Purchase Order',
    RETURN_REQUEST: 'Return Request',
  }
  return typeMap[entityType] || entityType
}

/**
 * Format stage name for display
 */
function formatStageName(stageKey: string): string {
  return stageKey
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Format status for display
 */
function formatStatus(status: string): string {
  return status
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Format role for display
 */
function formatRole(role: string): string {
  return role
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}

// =============================================================================
// LOG UTILITIES
// =============================================================================

/**
 * Generate unique log ID (950000-999999 range)
 */
function generateLogId(): string {
  const min = 950000
  const max = 999999
  return (Math.floor(Math.random() * (max - min + 1)) + min).toString()
}

/**
 * Create notification log entry
 */
async function createNotificationLog(params: {
  eventId: string
  recipientEmail: string
  recipientType: string
  subject: string
  status: 'SENT' | 'FAILED'
  messageId?: string
  errorMessage?: string
  providerResponse?: Record<string, any>
}): Promise<string> {
  const logId = generateLogId()
  
  try {
    const log = new NotificationLog({
      logId,
      queueId: null,
      eventId: params.eventId,
      recipientEmail: params.recipientEmail.toLowerCase(),
      recipientType: params.recipientType,
      subject: params.subject,
      status: params.status,
      providerMessageId: params.messageId || null,
      errorMessage: params.errorMessage || null,
      sentAt: params.status === 'SENT' ? new Date() : null,
      providerResponse: params.providerResponse || null,
    })
    
    await log.save()
  } catch (error) {
    console.error('[NotificationOrchestrator] Failed to create log entry:', error)
  }
  
  return logId
}

// =============================================================================
// MAIN ORCHESTRATION FUNCTIONS
// =============================================================================

/**
 * Process a workflow event and send notifications
 */
export async function processWorkflowEvent(
  event: WorkflowEventPayload
): Promise<OrchestrationResult> {
  const startTime = Date.now()
  const result: OrchestrationResult = {
    eventId: event.eventId,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    mappingsFound: 0,
    recipientsResolved: 0,
    notificationsSent: 0,
    notificationsFailed: 0,
    results: [],
    errors: [],
    demoMode: isDemoMode(),
    timestamp: new Date().toISOString(),
  }
  
  const logPrefix = `[NotificationOrchestrator] [${event.eventId}]`
  
  console.log(`${logPrefix} Processing workflow event: ${event.eventType}`, {
    entityType: event.entityType,
    entityId: event.entityId,
    currentStage: event.currentStage,
  })
  
  try {
    await connectDB()
    
    // Check if notifications are enabled
    if (!areNotificationsEnabled()) {
      console.log(`${logPrefix} Notifications disabled (ENABLE_EMAIL_NOTIFICATIONS !== 'true')`)
      return result
    }
    
    // 1. Load notification mappings
    const mappings = await loadNotificationMappings(event)
    result.mappingsFound = mappings.length
    
    if (mappings.length === 0) {
      console.log(`${logPrefix} No notification mappings found for event`)
      return result
    }
    
    console.log(`${logPrefix} Found ${mappings.length} notification mapping(s)`)
    
    // 2. Get company branding
    const branding = await getCompanyBranding(event.companyId)
    
    // 3. Build template context
    const templateContext = buildTemplateContext(event, branding)
    
    // 4. Process each mapping
    for (const mapping of mappings) {
      try {
        // Check conditions
        if (!checkMappingConditions(mapping, event)) {
          console.log(`${logPrefix} Mapping ${mapping.id} skipped due to conditions`)
          continue
        }
        
        // Resolve recipients
        const excludeEmails = mapping.excludeActionPerformer && event.triggeredBy.userEmail
          ? [event.triggeredBy.userEmail]
          : []
        
        const resolutionContext: ResolutionContext = {
          event,
          customRecipients: mapping.customRecipients,
          excludeEmails,
        }
        
        const { recipients, errors: resolverErrors } = await resolveWorkflowRecipients(
          mapping.recipientResolvers,
          resolutionContext
        )
        
        if (resolverErrors.length > 0) {
          result.errors.push(...resolverErrors)
        }
        
        result.recipientsResolved += recipients.length
        
        console.log(`${logPrefix} Resolved ${recipients.length} recipient(s) for mapping ${mapping.id}`)
        
        // 5. Send notifications for each channel
        for (const channelConfig of mapping.channels) {
          // Load template
          const template = await loadTemplate(
            channelConfig.templateKey,
            event.eventType,
            channelConfig.channel
          )
          
          if (!template) {
            result.errors.push(`Template not found: ${channelConfig.templateKey}`)
            continue
          }
          
          // Send to each recipient
          for (const recipient of recipients) {
            const sendResult = await sendNotificationToRecipient(
              recipient,
              template,
              templateContext,
              channelConfig.channel,
              branding,
              event,
              result.demoMode
            )
            
            result.results.push(sendResult)
            
            if (sendResult.success) {
              result.notificationsSent++
            } else {
              result.notificationsFailed++
              if (sendResult.error) {
                result.errors.push(sendResult.error)
              }
            }
          }
        }
      } catch (mappingError: any) {
        result.errors.push(`Mapping ${mapping.id} failed: ${mappingError.message}`)
        console.error(`${logPrefix} Error processing mapping ${mapping.id}:`, mappingError)
      }
    }
    
    const duration = Date.now() - startTime
    console.log(`${logPrefix} Orchestration complete in ${duration}ms:`, {
      sent: result.notificationsSent,
      failed: result.notificationsFailed,
      errors: result.errors.length,
      demoMode: result.demoMode,
    })
    
  } catch (error: any) {
    result.errors.push(`Orchestration failed: ${error.message}`)
    console.error(`${logPrefix} Orchestration error:`, error)
  }
  
  return result
}

/**
 * Load notification mappings for an event
 */
async function loadNotificationMappings(
  event: WorkflowEventPayload
): Promise<IWorkflowNotificationMapping[]> {
  // Custom static method would be ideal, but for safety, implement inline
  const query: any = {
    isActive: true,
    eventType: event.eventType,
    $or: [
      { companyId: event.companyId },
      { companyId: '*' },
    ],
  }
  
  // Add entity type filter
  query.$or = [
    ...query.$or.map((q: any) => ({ ...q, entityType: event.entityType })),
    ...query.$or.map((q: any) => ({ ...q, entityType: '*' })),
  ]
  
  const mappings = await WorkflowNotificationMapping.find(query)
    .sort({ priority: -1, companyId: -1 }) // Higher priority first, company-specific before global
    .lean()
  
  // Filter by stage if specified
  return mappings.filter(m => {
    if (!m.stageKey) return true // No stage filter = applies to all
    return m.stageKey === event.currentStage
  })
}

/**
 * Check if mapping conditions are met
 */
function checkMappingConditions(
  mapping: IWorkflowNotificationMapping,
  event: WorkflowEventPayload
): boolean {
  const { conditions } = mapping
  
  if (!conditions) return true
  
  // Check minimum amount
  if (conditions.minAmount !== undefined && conditions.minAmount !== null) {
    const amount = event.entitySnapshot.totalAmount || 0
    if (amount < conditions.minAmount) return false
  }
  
  // Check entity status
  if (conditions.entityStatuses && conditions.entityStatuses.length > 0) {
    if (!conditions.entityStatuses.includes(event.currentStatus)) return false
  }
  
  // Check performer role
  if (conditions.roles && conditions.roles.length > 0) {
    if (!conditions.roles.includes(event.triggeredBy.userRole)) return false
  }
  
  return true
}

/**
 * Load notification template
 */
async function loadTemplate(
  templateKey: string,
  eventType: WorkflowEventType,
  channel: NotificationChannel
): Promise<{ subject: string; body: string } | null> {
  try {
    // First try to find by templateKey directly
    let template = await NotificationTemplate.findOne({
      $or: [
        { templateId: templateKey },
        { templateName: templateKey },
      ],
      isActive: true,
    }).lean()
    
    // If not found, try to find by event code
    if (!template) {
      const eventCode = mapEventTypeToEventCode(eventType)
      const notifEvent = await NotificationEvent.findOne({
        eventCode,
        isActive: true,
      }).lean()
      
      if (notifEvent) {
        template = await NotificationTemplate.findOne({
          eventId: (notifEvent as any).eventId,
          isActive: true,
        }).lean()
      }
    }
    
    if (template) {
      return {
        subject: (template as any).subjectTemplate,
        body: (template as any).bodyTemplate,
      }
    }
    
    // Return default template if nothing found
    return getDefaultTemplate(eventType)
    
  } catch (error) {
    console.error('[NotificationOrchestrator] Error loading template:', error)
    return getDefaultTemplate(eventType)
  }
}

/**
 * Map workflow event type to notification event code
 */
function mapEventTypeToEventCode(eventType: WorkflowEventType): string {
  const mapping: Record<WorkflowEventType, string> = {
    [WORKFLOW_EVENT_TYPES.ENTITY_SUBMITTED]: 'ORDER_SUBMITTED',
    [WORKFLOW_EVENT_TYPES.ENTITY_RESUBMITTED]: 'ORDER_RESUBMITTED',
    [WORKFLOW_EVENT_TYPES.ENTITY_APPROVED]: 'ORDER_APPROVED',
    [WORKFLOW_EVENT_TYPES.ENTITY_APPROVED_AT_STAGE]: 'ORDER_STAGE_APPROVED',
    [WORKFLOW_EVENT_TYPES.ENTITY_REJECTED]: 'ORDER_REJECTED',
    [WORKFLOW_EVENT_TYPES.ENTITY_REJECTED_AT_STAGE]: 'ORDER_STAGE_REJECTED',
    [WORKFLOW_EVENT_TYPES.ENTITY_CANCELLED]: 'ORDER_CANCELLED',
    [WORKFLOW_EVENT_TYPES.ENTITY_MOVED_TO_STAGE]: 'ORDER_STAGE_CHANGED',
    [WORKFLOW_EVENT_TYPES.APPROVAL_REMINDER]: 'APPROVAL_REMINDER',
    [WORKFLOW_EVENT_TYPES.APPROVAL_ESCALATION]: 'APPROVAL_ESCALATION',
    [WORKFLOW_EVENT_TYPES.ENTITY_SENT_BACK]: 'ORDER_SENT_BACK',
  }
  return mapping[eventType] || eventType
}

/**
 * Get default template for event type
 */
function getDefaultTemplate(eventType: WorkflowEventType): { subject: string; body: string } {
  const templates: Record<string, { subject: string; body: string }> = {
    [WORKFLOW_EVENT_TYPES.ENTITY_SUBMITTED]: {
      subject: '{{entityType}} {{entityDisplayId}} submitted for approval',
      body: `
        <p>A new {{entityType}} has been submitted for your approval.</p>
        <p><strong>{{entityType}} ID:</strong> {{entityDisplayId}}</p>
        <p><strong>Submitted by:</strong> {{requestorName}}</p>
        <p><strong>Current Stage:</strong> {{currentStageName}}</p>
        <p>Please review and take action.</p>
      `,
    },
    [WORKFLOW_EVENT_TYPES.ENTITY_APPROVED]: {
      subject: '{{entityType}} {{entityDisplayId}} has been approved',
      body: `
        <p>Your {{entityType}} has been fully approved.</p>
        <p><strong>{{entityType}} ID:</strong> {{entityDisplayId}}</p>
        <p><strong>Approved by:</strong> {{approvedBy}}</p>
        <p><strong>Status:</strong> {{currentStatus}}</p>
      `,
    },
    [WORKFLOW_EVENT_TYPES.ENTITY_APPROVED_AT_STAGE]: {
      subject: '{{entityType}} {{entityDisplayId}} approved at {{currentStageName}}',
      body: `
        <p>{{entityType}} has been approved at the {{currentStageName}} stage.</p>
        <p><strong>{{entityType}} ID:</strong> {{entityDisplayId}}</p>
        <p><strong>Approved by:</strong> {{approvedBy}}</p>
        <p>It will now move to the next approval stage.</p>
      `,
    },
    [WORKFLOW_EVENT_TYPES.ENTITY_REJECTED]: {
      subject: '{{entityType}} {{entityDisplayId}} has been rejected',
      body: `
        <p>Your {{entityType}} has been rejected.</p>
        <p><strong>{{entityType}} ID:</strong> {{entityDisplayId}}</p>
        <p><strong>Rejected by:</strong> {{rejectedBy}}</p>
        <p><strong>Reason:</strong> {{rejectionReason}}</p>
        <p><strong>Remarks:</strong> {{rejectionRemarks}}</p>
        <p>Please review and resubmit if needed.</p>
      `,
    },
    [WORKFLOW_EVENT_TYPES.APPROVAL_REMINDER]: {
      subject: 'Reminder: {{entityType}} {{entityDisplayId}} pending your approval',
      body: `
        <p>This is a reminder that {{entityType}} {{entityDisplayId}} is pending your approval.</p>
        <p><strong>Submitted by:</strong> {{requestorName}}</p>
        <p><strong>Current Stage:</strong> {{currentStageName}}</p>
        <p>Please review and take action.</p>
      `,
    },
  }
  
  return templates[eventType] || {
    subject: '{{entityType}} {{entityDisplayId}} - {{currentStatus}}',
    body: `<p>{{entityType}} {{entityDisplayId}} status update: {{currentStatus}}</p>`,
  }
}

/**
 * Send notification to a single recipient
 */
async function sendNotificationToRecipient(
  recipient: ResolvedRecipient,
  template: { subject: string; body: string },
  context: TemplateContext,
  channel: NotificationChannel,
  branding: { brandName: string; brandColor: string },
  event: WorkflowEventPayload,
  demoMode: boolean
): Promise<NotificationSendResult> {
  const logPrefix = `[NotificationOrchestrator] [${event.eventId}]`
  
  // Render template
  const subject = renderTemplate(template.subject, context)
  const body = renderTemplate(template.body, context)
  
  // Demo mode: log only
  if (demoMode) {
    console.log(`${logPrefix} [DEMO_MODE] Would send to ${recipient.email}:`, {
      channel,
      subject,
      recipientRole: recipient.role,
    })
    
    return {
      success: true,
      demoMode: true,
      recipient: recipient.email,
      channel,
    }
  }
  
  // Send based on channel
  if (channel === NOTIFICATION_CHANNELS.EMAIL) {
    try {
      const emailResult: EmailResult = await sendEmail({
        to: recipient.email,
        subject,
        body,
        fromName: `${branding.brandName} Notifications`,
      })
      
      // Log result
      const logId = await createNotificationLog({
        eventId: event.eventId,
        recipientEmail: recipient.email,
        recipientType: recipient.role,
        subject,
        status: emailResult.success ? 'SENT' : 'FAILED',
        messageId: emailResult.messageId,
        errorMessage: emailResult.error,
        providerResponse: {
          channel,
          resolvedBy: recipient.resolvedBy,
          eventType: event.eventType,
          entityId: event.entityId,
        },
      })
      
      if (emailResult.success) {
        console.log(`${logPrefix} ✅ Email sent to ${recipient.email}`)
      } else {
        console.error(`${logPrefix} ❌ Email failed to ${recipient.email}: ${emailResult.error}`)
      }
      
      return {
        success: emailResult.success,
        logId,
        messageId: emailResult.messageId,
        error: emailResult.error,
        recipient: recipient.email,
        channel,
      }
    } catch (error: any) {
      console.error(`${logPrefix} Email send error:`, error)
      return {
        success: false,
        error: error.message,
        recipient: recipient.email,
        channel,
      }
    }
  }
  
  // Other channels (IN_APP, WHATSAPP, etc.) - placeholder for future
  console.log(`${logPrefix} Channel ${channel} not yet implemented, skipping ${recipient.email}`)
  return {
    success: false,
    error: `Channel ${channel} not implemented`,
    recipient: recipient.email,
    channel,
  }
}

// =============================================================================
// EVENT BUS INTEGRATION
// =============================================================================

/**
 * Initialize the notification orchestrator
 * Subscribes to all workflow events
 */
export function initializeNotificationOrchestrator(): void {
  console.log('[NotificationOrchestrator] Initializing...')
  
  // Subscribe to all workflow events
  workflowEventBus.subscribe('*', async (event) => {
    try {
      await processWorkflowEvent(event)
    } catch (error) {
      console.error('[NotificationOrchestrator] Error processing event:', error)
      // Never throw - notifications should not break workflow
    }
  })
  
  console.log('[NotificationOrchestrator] Initialized and listening for workflow events')
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  buildTemplateContext,
  renderTemplate,
  loadNotificationMappings,
  checkMappingConditions,
  loadTemplate,
  sendNotificationToRecipient,
  isDemoMode,
  areNotificationsEnabled,
}
