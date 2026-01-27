/**
 * NotificationService - Simple Email Notification Orchestrator
 * 
 * Phase 1: Minimal working implementation for order status notifications.
 * 
 * Features:
 * - Resolves NotificationEvent and NotificationTemplate from database
 * - Renders template placeholders with context data
 * - Sends email via Gmail SMTP
 * - Writes success/failure to NotificationLog
 * - Idempotency: Prevents duplicate sends for same event+order+status
 * - Context validation: Warns on missing placeholders
 * 
 * Limitations (Phase 1):
 * - No routing rules (sends directly to provided employee email)
 * - No retries or async processing
 * - No batching or rate limiting
 */

import connectDB from '../db/mongodb'
import NotificationEvent, { INotificationEvent } from '../models/NotificationEvent'
import NotificationTemplate, { INotificationTemplate } from '../models/NotificationTemplate'
import NotificationLog from '../models/NotificationLog'
import NotificationQueue, { INotificationQueue } from '../models/NotificationQueue'
import { sendEmail, EmailResult } from './EmailProvider'
import {
  isEventEnabledForCompany,
  getEventConfigForCompany,
  getCompanyBranding,
  isInQuietHours,
  getQuietHoursEndTime,
} from './CompanyNotificationConfigService'

// =============================================================================
// TYPES
// =============================================================================

// Context data passed to notification service
export interface NotificationContext {
  // Employee info
  employeeName: string
  employeeEmail: string
  
  // Order info
  orderId?: string
  orderStatus?: string
  previousStatus?: string
  
  // PR/PO info
  prNumber?: string
  poNumber?: string
  
  // Vendor info
  vendorName?: string
  
  // Company info
  companyName?: string
  companyId?: string
  
  // Shipment info
  awbNumber?: string
  shipmentDate?: string
  deliveryDate?: string
  
  // Generic placeholder support
  [key: string]: string | undefined
}

export interface NotificationResult {
  success: boolean
  logId?: string
  messageId?: string
  error?: string
  skipped?: boolean // True if skipped due to duplicate
  correlationId?: string
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Generate a unique correlation ID for tracing
 * Format: NOTIF-{timestamp}-{random}
 */
function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `NOTIF-${timestamp}-${random}`.toUpperCase()
}

/**
 * Generate a unique log ID for NotificationLog
 * Range: 950000-999999
 */
function generateLogId(): string {
  const min = 950000
  const max = 999999
  const randomId = Math.floor(Math.random() * (max - min + 1)) + min
  return randomId.toString()
}

/**
 * Extract all placeholders from a template string
 * Returns array of placeholder names (without braces)
 */
function extractPlaceholders(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g)
  if (!matches) return []
  return matches.map(m => m.replace(/\{\{|\}\}/g, ''))
}

/**
 * Validate context has values for all template placeholders
 * Returns array of missing placeholder names
 */
function findMissingPlaceholders(
  template: string,
  context: NotificationContext
): string[] {
  const placeholders = extractPlaceholders(template)
  return placeholders.filter(p => context[p] === undefined || context[p] === '')
}

/**
 * Render template by replacing {{placeholders}} with context values
 * Keeps original placeholder if no value provided
 */
function renderTemplate(template: string, context: NotificationContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = context[key]
    return value !== undefined && value !== '' ? value : match
  })
}

/**
 * Build idempotency key for duplicate detection
 * Combines eventCode + orderId + status + email
 */
function buildIdempotencyKey(
  eventCode: string,
  context: NotificationContext
): string {
  const parts = [
    eventCode.toUpperCase(),
    context.orderId || 'NO_ORDER',
    context.orderStatus || 'NO_STATUS',
    context.employeeEmail.toLowerCase(),
  ]
  return parts.join('::')
}

/**
 * Check if notification was already sent recently (idempotency check)
 * Looks for SENT status within the last 5 minutes for same event+order+status+email
 */
async function isDuplicateNotification(
  eventId: string,
  context: NotificationContext,
  correlationId: string
): Promise<{ isDuplicate: boolean; existingLogId?: string }> {
  // Only check for duplicates if we have an orderId and status
  if (!context.orderId || !context.orderStatus) {
    return { isDuplicate: false }
  }

  // Look for recent successful sends (last 5 minutes)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
  
  const existingLog = await NotificationLog.findOne({
    eventId,
    recipientEmail: context.employeeEmail.toLowerCase(),
    status: 'SENT',
    sentAt: { $gte: fiveMinutesAgo },
    // Check subject contains orderId and status (since we don't have dedicated fields)
    subject: {
      $regex: context.orderId,
      $options: 'i'
    }
  }).select('logId subject sentAt').lean()

  if (existingLog) {
    // Additional check: verify the subject contains the same status
    const subjectContainsStatus = (existingLog as any).subject?.toLowerCase().includes(context.orderStatus.toLowerCase())
    if (subjectContainsStatus) {
      console.log(`[NotificationService] [${correlationId}] 🔄 Duplicate detected:`, {
        existingLogId: (existingLog as any).logId,
        sentAt: (existingLog as any).sentAt,
        orderId: context.orderId,
        status: context.orderStatus,
      })
      return { isDuplicate: true, existingLogId: (existingLog as any).logId }
    }
  }

  return { isDuplicate: false }
}

/**
 * Log structured error with full context
 */
function logError(
  correlationId: string,
  eventCode: string,
  context: NotificationContext,
  error: Error | string,
  additionalInfo?: Record<string, any>
): void {
  const errorMessage = error instanceof Error ? error.message : error
  const errorStack = error instanceof Error ? error.stack : undefined

  console.error(`[NotificationService] [${correlationId}] ❌ ERROR:`, {
    correlationId,
    eventCode,
    orderId: context.orderId || 'N/A',
    employeeEmail: context.employeeEmail,
    orderStatus: context.orderStatus || 'N/A',
    error: errorMessage,
    stack: errorStack,
    timestamp: new Date().toISOString(),
    ...additionalInfo,
  })
}

/**
 * Log structured warning
 */
function logWarning(
  correlationId: string,
  message: string,
  details?: Record<string, any>
): void {
  console.warn(`[NotificationService] [${correlationId}] ⚠️ WARNING: ${message}`, {
    correlationId,
    timestamp: new Date().toISOString(),
    ...details,
  })
}

/**
 * Log structured info
 */
function logInfo(
  correlationId: string,
  message: string,
  details?: Record<string, any>
): void {
  console.log(`[NotificationService] [${correlationId}] ℹ️ ${message}`, details || '')
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Send notification for a given event
 * 
 * @param eventCode - Event code (e.g., "ORDER_STATUS_CHANGED")
 * @param context - Context data for template rendering and recipient info
 * @returns NotificationResult with success/failure info
 * 
 * Features:
 * - Idempotency: Skips if same notification was sent in last 5 minutes
 * - Validation: Warns on missing template placeholders
 * - Logging: Full context in all log messages
 * 
 * Usage:
 *   await sendNotification('ORDER_STATUS_CHANGED', {
 *     employeeName: 'John Doe',
 *     employeeEmail: 'john@example.com',
 *     orderId: 'ORD-123',
 *     orderStatus: 'Dispatched',
 *     previousStatus: 'Awaiting fulfilment',
 *     companyName: 'Acme Corp'
 *   })
 */
export async function sendNotification(
  eventCode: string,
  context: NotificationContext
): Promise<NotificationResult> {
  const correlationId = generateCorrelationId()
  
  console.log(`\n[NotificationService] [${correlationId}] 📧 ========== SENDING NOTIFICATION ==========`)
  logInfo(correlationId, 'Starting notification', {
    eventCode,
    orderId: context.orderId || 'N/A',
    orderStatus: context.orderStatus || 'N/A',
    recipient: context.employeeEmail,
  })

  try {
    await connectDB()

    // =========================================================================
    // 1. Fetch NotificationEvent
    // =========================================================================
    const event = await NotificationEvent.findOne({
      eventCode: eventCode.toUpperCase(),
      isActive: true,
    }).lean() as INotificationEvent | null

    if (!event) {
      logWarning(correlationId, `Event not found or inactive: ${eventCode}`)
      return {
        success: false,
        error: `Notification event not found: ${eventCode}`,
        correlationId,
      }
    }

    logInfo(correlationId, `Event found: ${event.eventId} - ${event.eventDescription}`)

    // =========================================================================
    // 1.5. COMPANY-SPECIFIC CONFIG CHECK
    // =========================================================================
    const companyId = context.companyId
    
    if (companyId) {
      // Check if event is enabled for this company
      const isEventEnabled = await isEventEnabledForCompany(companyId, eventCode)
      if (!isEventEnabled) {
        logInfo(correlationId, `Event ${eventCode} is disabled for company ${companyId}`)
        return {
          success: true, // Not an error, just disabled
          skipped: true,
          error: `Notification event ${eventCode} is disabled for company ${companyId}`,
          correlationId,
        }
      }

      // Check quiet hours - if in quiet hours, we'll queue instead of send
      // (actual queueing happens after template rendering)
    }

    // =========================================================================
    // 2. IDEMPOTENCY CHECK - Prevent duplicate sends
    // =========================================================================
    const { isDuplicate, existingLogId } = await isDuplicateNotification(
      event.eventId,
      context,
      correlationId
    )

    if (isDuplicate) {
      // Log as skipped duplicate
      const logId = generateLogId()
      const skipLog = new NotificationLog({
        logId,
        queueId: null,
        eventId: event.eventId,
        recipientEmail: context.employeeEmail,
        recipientType: 'EMPLOYEE',
        subject: `[DUPLICATE_SKIPPED] ${eventCode} for ${context.orderId}`,
        status: 'REJECTED', // Use REJECTED for skipped duplicates
        errorMessage: `Duplicate notification skipped. Previous log: ${existingLogId}`,
        providerResponse: {
          skipped: true,
          reason: 'DUPLICATE_SKIPPED',
          previousLogId: existingLogId,
          correlationId,
        },
      })

      await skipLog.save()
      
      logInfo(correlationId, `Duplicate notification skipped`, {
        logId,
        previousLogId: existingLogId,
        orderId: context.orderId,
        status: context.orderStatus,
      })

      return {
        success: true, // Considered success (notification was already sent)
        skipped: true,
        logId,
        correlationId,
        error: `Duplicate notification skipped (previous: ${existingLogId})`,
      }
    }

    // =========================================================================
    // 3. Fetch NotificationTemplate (with company override support)
    // =========================================================================
    const defaultTemplate = await NotificationTemplate.findOne({
      eventId: event.eventId,
      isActive: true,
      language: 'en',
    }).lean() as INotificationTemplate | null

    if (!defaultTemplate) {
      logWarning(correlationId, `Template not found for event: ${eventCode}`)
      return {
        success: false,
        error: `Notification template not found for event: ${eventCode}`,
        correlationId,
      }
    }

    // Check for company-specific template override
    let subjectTemplate = defaultTemplate.subjectTemplate
    let bodyTemplate = defaultTemplate.bodyTemplate
    let usingCustomTemplate = false

    if (companyId) {
      const eventConfig = await getEventConfigForCompany(companyId, eventCode)
      if (eventConfig) {
        if (eventConfig.customSubject) {
          subjectTemplate = eventConfig.customSubject
          usingCustomTemplate = true
        }
        if (eventConfig.customBody) {
          bodyTemplate = eventConfig.customBody
          usingCustomTemplate = true
        }
      }
    }

    // Create template object for rendering
    const template = {
      ...defaultTemplate,
      subjectTemplate,
      bodyTemplate,
    }

    logInfo(correlationId, `Template found: ${defaultTemplate.templateId} - ${defaultTemplate.templateName}${usingCustomTemplate ? ' (with company customization)' : ''}`)

    // =========================================================================
    // 4. CONTEXT VALIDATION - Check for missing placeholders
    // =========================================================================
    const fullTemplate = template.subjectTemplate + ' ' + template.bodyTemplate
    const missingPlaceholders = findMissingPlaceholders(fullTemplate, context)

    if (missingPlaceholders.length > 0) {
      logWarning(correlationId, `Missing placeholders in context`, {
        missingPlaceholders,
        orderId: context.orderId,
        eventCode,
        note: 'Email will be sent with unreplaced placeholders',
      })
    }

    // =========================================================================
    // 5. Get company branding (if applicable)
    // =========================================================================
    let branding = {
      brandName: 'UDS',
      brandColor: '#4A90A4',
      ccEmails: [] as string[],
      bccEmails: [] as string[],
    }

    if (companyId) {
      branding = await getCompanyBranding(companyId)
      logInfo(correlationId, `Applied company branding: ${branding.brandName}`)
    }

    // =========================================================================
    // 6. Render template with context data (including branding)
    // =========================================================================
    const contextWithBranding = {
      ...context,
      brandName: branding.brandName,
      brandColor: branding.brandColor,
    }

    const renderedSubject = renderTemplate(template.subjectTemplate, contextWithBranding)
    let renderedBody = renderTemplate(template.bodyTemplate, contextWithBranding)

    // Apply brand color to header if present
    if (branding.brandColor && branding.brandColor !== '#4A90A4') {
      renderedBody = renderedBody.replace(
        /background-color:\s*#4A90A4/gi,
        `background-color: ${branding.brandColor}`
      )
    }

    logInfo(correlationId, `Rendered subject: ${renderedSubject}`)

    // =========================================================================
    // 6.5. CHECK QUIET HOURS - Queue if in quiet hours
    // =========================================================================
    if (companyId) {
      const inQuietHours = await isInQuietHours(companyId)
      if (inQuietHours) {
        const scheduledFor = await getQuietHoursEndTime(companyId)
        
        if (scheduledFor) {
          // Queue the notification for later delivery
          const queueId = `NQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          
          const queueEntry = new NotificationQueue({
            queueId,
            companyId,
            eventCode,
            recipientEmail: context.employeeEmail,
            recipientType: event.defaultRecipientType || 'EMPLOYEE',
            subject: renderedSubject,
            body: renderedBody,
            context: {
              orderId: context.orderId,
              orderStatus: context.orderStatus,
              employeeName: context.employeeName,
              companyName: context.companyName,
              vendorName: context.vendorName,
            },
            status: 'PENDING',
            reason: 'quiet_hours',
            scheduledFor,
            attempts: 0,
            maxAttempts: 3,
            correlationId,
          })
          
          await queueEntry.save()
          
          logInfo(correlationId, `📥 Notification queued for delivery after quiet hours`, {
            queueId,
            scheduledFor: scheduledFor.toISOString(),
            companyId,
            recipientEmail: context.employeeEmail,
          })
          
          return {
            success: true,
            queued: true,
            queueId,
            scheduledFor: scheduledFor.toISOString(),
            correlationId,
            error: `Queued for delivery at ${scheduledFor.toISOString()} (quiet hours)`,
          }
        }
      }
    }

    // =========================================================================
    // 7. Send email
    // =========================================================================
    const emailResult: EmailResult = await sendEmail({
      to: context.employeeEmail,
      subject: renderedSubject,
      body: renderedBody,
      fromName: `${branding.brandName} Notifications`,
    })

    // =========================================================================
    // 8. Log result to NotificationLog
    // =========================================================================
    const logId = generateLogId()
    const logEntry = new NotificationLog({
      logId,
      queueId: null,
      eventId: event.eventId,
      recipientEmail: context.employeeEmail,
      recipientType: 'EMPLOYEE',
      subject: renderedSubject,
      status: emailResult.success ? 'SENT' : 'FAILED',
      providerMessageId: emailResult.messageId || null,
      errorMessage: emailResult.error || null,
      sentAt: emailResult.success ? new Date() : null,
      providerResponse: {
        messageId: emailResult.messageId,
        error: emailResult.error,
        correlationId,
        companyId: companyId || null,
        brandName: branding.brandName,
        context: {
          orderId: context.orderId,
          orderStatus: context.orderStatus,
          employeeName: context.employeeName,
        },
      },
    })

    await logEntry.save()

    // =========================================================================
    // 9. Return result
    // =========================================================================
    if (emailResult.success) {
      logInfo(correlationId, `✅ Notification sent successfully`, {
        logId,
        messageId: emailResult.messageId,
        orderId: context.orderId,
        status: context.orderStatus,
      })
      return {
        success: true,
        logId,
        messageId: emailResult.messageId,
        correlationId,
      }
    } else {
      logError(correlationId, eventCode, context, emailResult.error || 'Unknown SMTP error', {
        logId,
        smtpError: emailResult.error,
      })
      return {
        success: false,
        logId,
        error: emailResult.error,
        correlationId,
      }
    }
  } catch (error: any) {
    logError(correlationId, eventCode, context, error, {
      phase: 'notification_processing',
    })
    return {
      success: false,
      error: error.message || 'Unknown error',
      correlationId,
    }
  }
}

// =============================================================================
// CONVENIENCE WRAPPERS
// =============================================================================

/**
 * Send order status change notification
 * Convenience wrapper for ORDER_STATUS_CHANGED event
 */
export async function sendOrderStatusNotification(
  employeeEmail: string,
  employeeName: string,
  orderId: string,
  newStatus: string,
  previousStatus: string,
  additionalContext?: Partial<NotificationContext>
): Promise<NotificationResult> {
  return sendNotification('ORDER_STATUS_CHANGED', {
    employeeEmail,
    employeeName,
    orderId,
    orderStatus: newStatus,
    previousStatus,
    ...additionalContext,
  })
}

/**
 * Send PO generated notification
 * Convenience wrapper for PO_GENERATED event
 */
export async function sendPOGeneratedNotification(
  employeeEmail: string,
  employeeName: string,
  poNumber: string,
  additionalContext?: Partial<NotificationContext>
): Promise<NotificationResult> {
  return sendNotification('PO_GENERATED', {
    employeeEmail,
    employeeName,
    poNumber,
    ...additionalContext,
  })
}

/**
 * Send order delivered notification
 * Convenience wrapper for ORDER_MARKED_DELIVERED event
 */
export async function sendOrderDeliveredNotification(
  employeeEmail: string,
  employeeName: string,
  orderId: string,
  additionalContext?: Partial<NotificationContext>
): Promise<NotificationResult> {
  return sendNotification('ORDER_MARKED_DELIVERED', {
    employeeEmail,
    employeeName,
    orderId,
    orderStatus: 'Delivered',
    ...additionalContext,
  })
}

/**
 * Send order shipped notification to employee
 * Triggered when an order is dispatched with tracking information
 */
export async function sendOrderShippedNotification(
  employeeEmail: string,
  employeeName: string,
  orderId: string,
  awbNumber: string,
  additionalContext?: Partial<NotificationContext>
): Promise<NotificationResult> {
  return sendNotification('ORDER_SHIPPED', {
    employeeEmail,
    employeeName,
    orderId,
    awbNumber,
    orderStatus: 'Dispatched',
    ...additionalContext,
  })
}

// =============================================================================
// MULTI-RECIPIENT NOTIFICATION FUNCTIONS
// =============================================================================

import {
  resolveRecipients,
  resolveRecipientsFromOrder,
  RecipientType,
  RecipientContext,
  RecipientInfo,
} from './NotificationRecipientResolver'

/**
 * Send notification to multiple recipient types
 * Resolves recipients based on type and context, then sends to each
 */
export async function sendMultiRecipientNotification(
  eventCode: string,
  recipientTypes: RecipientType[],
  context: RecipientContext & { [key: string]: any },
  additionalContext?: Partial<NotificationContext>
): Promise<{ results: NotificationResult[]; totalSent: number; totalFailed: number }> {
  const results: NotificationResult[] = []
  let totalSent = 0
  let totalFailed = 0

  for (const recipientType of recipientTypes) {
    const recipients = await resolveRecipients(recipientType, context)
    
    for (const recipient of recipients) {
      const result = await sendNotification(eventCode, {
        employeeEmail: recipient.email,
        employeeName: recipient.name,
        recipientType: recipient.type,
        ...additionalContext,
        ...context,
      })
      
      results.push(result)
      if (result.success) totalSent++
      else totalFailed++
    }
  }

  return { results, totalSent, totalFailed }
}

/**
 * Send notification to all relevant parties for an order event
 * Automatically resolves all recipient types based on order data
 */
export async function sendOrderEventNotification(
  eventCode: string,
  order: any,
  recipientTypes: RecipientType[],
  additionalContext?: Partial<NotificationContext>
): Promise<{ results: NotificationResult[]; totalSent: number; totalFailed: number }> {
  const context: RecipientContext = {
    employeeId: order.employeeId,
    vendorId: order.vendorId,
    companyId: order.companyId,
    locationId: order.locationId,
    orderId: order.id || order.orderId,
  }

  const orderContext = {
    orderId: order.id || order.orderId,
    orderStatus: order.status || order.unified_status,
    prNumber: order.prNumber,
    poNumber: order.poNumber,
    vendorName: order.vendorName,
    companyName: order.companyName,
    ...additionalContext,
  }

  return sendMultiRecipientNotification(eventCode, recipientTypes, { ...context, ...orderContext }, orderContext)
}

// =============================================================================
// VENDOR NOTIFICATION WRAPPERS
// =============================================================================

/**
 * Send new order notification to vendor
 */
export async function sendVendorNewOrderNotification(
  vendorEmail: string,
  vendorName: string,
  orderId: string,
  additionalContext?: Partial<NotificationContext>
): Promise<NotificationResult> {
  return sendNotification('VENDOR_NEW_ORDER', {
    employeeEmail: vendorEmail,
    employeeName: vendorName,
    orderId,
    ...additionalContext,
  })
}

/**
 * Send PO received notification to vendor
 */
export async function sendVendorPONotification(
  vendorEmail: string,
  vendorName: string,
  poNumber: string,
  additionalContext?: Partial<NotificationContext>
): Promise<NotificationResult> {
  return sendNotification('VENDOR_PO_RECEIVED', {
    employeeEmail: vendorEmail,
    employeeName: vendorName,
    poNumber,
    ...additionalContext,
  })
}

/**
 * Send shipment reminder to vendor
 */
export async function sendVendorShipmentReminderNotification(
  vendorEmail: string,
  vendorName: string,
  orderId: string,
  additionalContext?: Partial<NotificationContext>
): Promise<NotificationResult> {
  return sendNotification('VENDOR_SHIPMENT_REMINDER', {
    employeeEmail: vendorEmail,
    employeeName: vendorName,
    orderId,
    ...additionalContext,
  })
}

// =============================================================================
// ADMIN NOTIFICATION WRAPPERS
// =============================================================================

/**
 * Send approval required notification to company admin
 */
export async function sendCompanyAdminApprovalNotification(
  adminEmail: string,
  adminName: string,
  orderId: string,
  additionalContext?: Partial<NotificationContext>
): Promise<NotificationResult> {
  return sendNotification('COMPANY_ADMIN_APPROVAL_REQUIRED', {
    employeeEmail: adminEmail,
    employeeName: adminName,
    orderId,
    ...additionalContext,
  })
}

/**
 * Send approval required notification to location admin
 */
export async function sendLocationAdminApprovalNotification(
  adminEmail: string,
  adminName: string,
  orderId: string,
  additionalContext?: Partial<NotificationContext>
): Promise<NotificationResult> {
  return sendNotification('LOCATION_ADMIN_APPROVAL_REQUIRED', {
    employeeEmail: adminEmail,
    employeeName: adminName,
    orderId,
    ...additionalContext,
  })
}

/**
 * Send PO generated notification to location admin
 */
export async function sendLocationAdminPONotification(
  adminEmail: string,
  adminName: string,
  poNumber: string,
  additionalContext?: Partial<NotificationContext>
): Promise<NotificationResult> {
  return sendNotification('LOCATION_ADMIN_PO_GENERATED', {
    employeeEmail: adminEmail,
    employeeName: adminName,
    poNumber,
    ...additionalContext,
  })
}

/**
 * Send PO generated notification to company admin
 */
export async function sendCompanyAdminPONotification(
  adminEmail: string,
  adminName: string,
  poNumber: string,
  additionalContext?: Partial<NotificationContext>
): Promise<NotificationResult> {
  return sendNotification('COMPANY_ADMIN_PO_GENERATED', {
    employeeEmail: adminEmail,
    employeeName: adminName,
    poNumber,
    ...additionalContext,
  })
}

/**
 * Send delivery confirmation to company admin
 */
export async function sendCompanyAdminDeliveryNotification(
  adminEmail: string,
  adminName: string,
  orderId: string,
  additionalContext?: Partial<NotificationContext>
): Promise<NotificationResult> {
  return sendNotification('COMPANY_ADMIN_ORDER_DELIVERED', {
    employeeEmail: adminEmail,
    employeeName: adminName,
    orderId,
    orderStatus: 'Delivered',
    ...additionalContext,
  })
}

// =============================================================================
// GRN NOTIFICATION WRAPPERS
// =============================================================================

/**
 * Send GRN created notification to company admin
 */
export async function sendGRNCreatedNotification(
  adminEmail: string,
  adminName: string,
  grnNumber: string,
  additionalContext?: Partial<NotificationContext>
): Promise<NotificationResult> {
  return sendNotification('GRN_CREATED', {
    employeeEmail: adminEmail,
    employeeName: adminName,
    grnNumber,
    ...additionalContext,
  })
}

/**
 * Send GRN acknowledged notification to vendor
 */
export async function sendGRNAcknowledgedNotification(
  vendorEmail: string,
  vendorName: string,
  grnNumber: string,
  additionalContext?: Partial<NotificationContext>
): Promise<NotificationResult> {
  return sendNotification('GRN_ACKNOWLEDGED', {
    employeeEmail: vendorEmail,
    employeeName: vendorName,
    grnNumber,
    ...additionalContext,
  })
}

/**
 * Send GRN approved notification to vendor
 */
export async function sendGRNApprovedNotification(
  vendorEmail: string,
  vendorName: string,
  grnNumber: string,
  additionalContext?: Partial<NotificationContext>
): Promise<NotificationResult> {
  return sendNotification('GRN_APPROVED', {
    employeeEmail: vendorEmail,
    employeeName: vendorName,
    grnNumber,
    ...additionalContext,
  })
}

// =============================================================================
// INVOICE NOTIFICATION WRAPPERS
// =============================================================================

/**
 * Send invoice created notification to company admin
 */
export async function sendInvoiceCreatedNotification(
  adminEmail: string,
  adminName: string,
  invoiceNumber: string,
  additionalContext?: Partial<NotificationContext>
): Promise<NotificationResult> {
  return sendNotification('INVOICE_CREATED', {
    employeeEmail: adminEmail,
    employeeName: adminName,
    invoiceNumber,
    ...additionalContext,
  })
}

/**
 * Send invoice approved notification to vendor
 */
export async function sendInvoiceApprovedNotification(
  vendorEmail: string,
  vendorName: string,
  invoiceNumber: string,
  additionalContext?: Partial<NotificationContext>
): Promise<NotificationResult> {
  return sendNotification('INVOICE_APPROVED', {
    employeeEmail: vendorEmail,
    employeeName: vendorName,
    invoiceNumber,
    ...additionalContext,
  })
}

/**
 * Send invoice paid notification to vendor
 */
export async function sendInvoicePaidNotification(
  vendorEmail: string,
  vendorName: string,
  invoiceNumber: string,
  additionalContext?: Partial<NotificationContext>
): Promise<NotificationResult> {
  return sendNotification('INVOICE_PAID', {
    employeeEmail: vendorEmail,
    employeeName: vendorName,
    invoiceNumber,
    ...additionalContext,
  })
}

// =============================================================================
// BATCH NOTIFICATION HELPER
// =============================================================================

/**
 * Comprehensive notification dispatcher for order events
 * Sends to all relevant parties based on configuration
 */
export async function dispatchOrderNotifications(
  eventType: 'ORDER_PLACED' | 'ORDER_APPROVED' | 'PO_CREATED' | 'ORDER_DISPATCHED' | 'ORDER_DELIVERED',
  order: any,
  options?: {
    notifyEmployee?: boolean
    notifyVendor?: boolean
    notifyCompanyAdmin?: boolean
    notifyLocationAdmin?: boolean
  }
): Promise<void> {
  const {
    notifyEmployee = true,
    notifyVendor = false,
    notifyCompanyAdmin = false,
    notifyLocationAdmin = false,
  } = options || {}

  const logPrefix = `[dispatchOrderNotifications:${eventType}]`

  // Check if notifications are enabled
  if (process.env.ENABLE_EMAIL_NOTIFICATIONS !== 'true') {
    console.log(`${logPrefix} Email notifications disabled, skipping`)
    return
  }

  const recipientTypes: RecipientType[] = []
  if (notifyEmployee) recipientTypes.push('EMPLOYEE')
  if (notifyVendor) recipientTypes.push('VENDOR')
  if (notifyCompanyAdmin) recipientTypes.push('COMPANY_ADMIN')
  if (notifyLocationAdmin) recipientTypes.push('LOCATION_ADMIN')

  // Map event type to event codes
  const eventCodeMap: Record<string, string> = {
    ORDER_PLACED: 'ORDER_STATUS_CHANGED',
    ORDER_APPROVED: 'ORDER_STATUS_CHANGED',
    PO_CREATED: 'PO_GENERATED',
    ORDER_DISPATCHED: 'ORDER_STATUS_CHANGED',
    ORDER_DELIVERED: 'ORDER_MARKED_DELIVERED',
  }

  const eventCode = eventCodeMap[eventType]
  if (!eventCode) {
    console.warn(`${logPrefix} Unknown event type: ${eventType}`)
    return
  }

  try {
    const { results, totalSent, totalFailed } = await sendOrderEventNotification(
      eventCode,
      order,
      recipientTypes,
      {
        orderStatus: order.status,
        orderId: order.id,
      }
    )

    console.log(`${logPrefix} 📧 Sent ${totalSent} notifications, ${totalFailed} failed`)
    
    for (const result of results) {
      if (result.success) {
        console.log(`${logPrefix} ✅ Notification sent: ${result.correlationId}`)
      } else {
        console.warn(`${logPrefix} ⚠️ Notification failed: ${result.error}`)
      }
    }
  } catch (error: any) {
    console.error(`${logPrefix} ❌ Error dispatching notifications: ${error.message}`)
  }
}

// =============================================================================
// QUEUE PROCESSOR
// =============================================================================

export interface QueueProcessResult {
  processed: number
  sent: number
  failed: number
  errors: Array<{ queueId: string; error: string }>
}

/**
 * Process pending notifications in the queue
 * This should be called periodically (e.g., every 5 minutes via cron/scheduler)
 */
export async function processNotificationQueue(
  options?: {
    batchSize?: number
    companyId?: string  // Optional: process only for specific company
  }
): Promise<QueueProcessResult> {
  await connectDB()
  
  const { batchSize = 50, companyId } = options || {}
  const result: QueueProcessResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    errors: [],
  }
  
  const logPrefix = '[NotificationQueueProcessor]'
  console.log(`${logPrefix} Starting queue processing...`)
  
  try {
    // Build query for pending notifications that are due
    const query: any = {
      status: 'PENDING',
      scheduledFor: { $lte: new Date() },
      attempts: { $lt: 3 }, // Max 3 attempts
    }
    
    if (companyId) {
      query.companyId = companyId
    }
    
    // Fetch pending notifications
    const pendingNotifications = await NotificationQueue.find(query)
      .sort({ scheduledFor: 1 })
      .limit(batchSize)
      .lean()
    
    console.log(`${logPrefix} Found ${pendingNotifications.length} pending notifications to process`)
    
    for (const notification of pendingNotifications) {
      result.processed++
      
      try {
        // Check if company is still in quiet hours
        const stillInQuietHours = await isInQuietHours(notification.companyId)
        
        if (stillInQuietHours) {
          // Reschedule for later
          const newScheduledTime = await getQuietHoursEndTime(notification.companyId)
          if (newScheduledTime) {
            await NotificationQueue.updateOne(
              { queueId: notification.queueId },
              {
                $set: { scheduledFor: newScheduledTime },
                $inc: { attempts: 1 },
              }
            )
            console.log(`${logPrefix} ⏰ Rescheduled ${notification.queueId} to ${newScheduledTime.toISOString()}`)
          }
          continue
        }
        
        // Mark as processing
        await NotificationQueue.updateOne(
          { queueId: notification.queueId },
          {
            $set: {
              status: 'PROCESSING',
              lastAttemptAt: new Date(),
            },
            $inc: { attempts: 1 },
          }
        )
        
        // Get company branding for from name
        const branding = await getCompanyBranding(notification.companyId)
        
        // Send the email
        const emailResult = await sendEmail({
          to: notification.recipientEmail,
          subject: notification.subject,
          body: notification.body,
          fromName: `${branding.brandName} Notifications`,
        })
        
        if (emailResult.success) {
          // Mark as sent
          await NotificationQueue.updateOne(
            { queueId: notification.queueId },
            {
              $set: {
                status: 'SENT',
                processedAt: new Date(),
              },
            }
          )
          
          // Create notification log
          const logId = generateLogId()
          const logEntry = new NotificationLog({
            logId,
            queueId: notification.queueId,
            eventId: null, // We don't have eventId in queue, just eventCode
            recipientEmail: notification.recipientEmail,
            recipientType: notification.recipientType,
            subject: notification.subject,
            status: 'SENT',
            providerMessageId: emailResult.messageId || null,
            sentAt: new Date(),
            providerResponse: {
              messageId: emailResult.messageId,
              correlationId: notification.correlationId,
              fromQueue: true,
              queueId: notification.queueId,
              queueReason: notification.reason,
            },
          })
          await logEntry.save()
          
          result.sent++
          console.log(`${logPrefix} ✅ Sent queued notification ${notification.queueId} to ${notification.recipientEmail}`)
        } else {
          // Mark as failed or retry
          const newAttempts = (notification.attempts || 0) + 1
          const status = newAttempts >= 3 ? 'FAILED' : 'PENDING'
          
          await NotificationQueue.updateOne(
            { queueId: notification.queueId },
            {
              $set: {
                status,
                lastError: emailResult.error,
                // If still retrying, schedule for 5 minutes later
                ...(status === 'PENDING' ? { scheduledFor: new Date(Date.now() + 5 * 60 * 1000) } : {}),
              },
            }
          )
          
          result.failed++
          result.errors.push({
            queueId: notification.queueId,
            error: emailResult.error || 'Unknown error',
          })
          console.error(`${logPrefix} ❌ Failed to send ${notification.queueId}: ${emailResult.error}`)
        }
      } catch (error: any) {
        // Mark as failed
        await NotificationQueue.updateOne(
          { queueId: notification.queueId },
          {
            $set: {
              status: 'FAILED',
              lastError: error.message,
            },
          }
        )
        
        result.failed++
        result.errors.push({
          queueId: notification.queueId,
          error: error.message,
        })
        console.error(`${logPrefix} ❌ Error processing ${notification.queueId}: ${error.message}`)
      }
    }
    
    console.log(`${logPrefix} ✅ Queue processing complete: ${result.sent} sent, ${result.failed} failed`)
    return result
  } catch (error: any) {
    console.error(`${logPrefix} ❌ Queue processing error: ${error.message}`)
    throw error
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  pending: number
  processing: number
  sent: number
  failed: number
  byCompany: Array<{ companyId: string; pending: number }>
}> {
  await connectDB()
  
  const [statusCounts, byCompany] = await Promise.all([
    NotificationQueue.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    NotificationQueue.aggregate([
      { $match: { status: 'PENDING' } },
      { $group: { _id: '$companyId', count: { $sum: 1 } } },
    ]),
  ])
  
  const stats = {
    pending: 0,
    processing: 0,
    sent: 0,
    failed: 0,
    byCompany: byCompany.map(b => ({ companyId: b._id, pending: b.count })),
  }
  
  for (const s of statusCounts) {
    if (s._id === 'PENDING') stats.pending = s.count
    if (s._id === 'PROCESSING') stats.processing = s.count
    if (s._id === 'SENT') stats.sent = s.count
    if (s._id === 'FAILED') stats.failed = s.count
  }
  
  return stats
}
