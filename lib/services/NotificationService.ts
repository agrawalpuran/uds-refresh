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
import { sendEmail, EmailResult } from './EmailProvider'

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
    // 3. Fetch NotificationTemplate
    // =========================================================================
    const template = await NotificationTemplate.findOne({
      eventId: event.eventId,
      isActive: true,
      language: 'en',
    }).lean() as INotificationTemplate | null

    if (!template) {
      logWarning(correlationId, `Template not found for event: ${eventCode}`)
      return {
        success: false,
        error: `Notification template not found for event: ${eventCode}`,
        correlationId,
      }
    }

    logInfo(correlationId, `Template found: ${template.templateId} - ${template.templateName}`)

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
    // 5. Render template with context data
    // =========================================================================
    const renderedSubject = renderTemplate(template.subjectTemplate, context)
    const renderedBody = renderTemplate(template.bodyTemplate, context)

    logInfo(correlationId, `Rendered subject: ${renderedSubject}`)

    // =========================================================================
    // 6. Send email
    // =========================================================================
    const emailResult: EmailResult = await sendEmail({
      to: context.employeeEmail,
      subject: renderedSubject,
      body: renderedBody,
    })

    // =========================================================================
    // 7. Log result to NotificationLog
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
        context: {
          orderId: context.orderId,
          orderStatus: context.orderStatus,
          employeeName: context.employeeName,
        },
      },
    })

    await logEntry.save()

    // =========================================================================
    // 8. Return result
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
