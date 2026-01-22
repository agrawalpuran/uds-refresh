/**
 * Admin Notifications Logs - Single Log API
 * 
 * GET /api/admin/notifications/logs/:logId - Get single log details
 * 
 * Admin-only read-only API for viewing detailed notification log.
 */

import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import NotificationLog from '@/lib/models/NotificationLog'
import NotificationEvent from '@/lib/models/NotificationEvent'
import NotificationTemplate from '@/lib/models/NotificationTemplate'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/notifications/logs/:logId
 * 
 * Returns detailed information about a single notification log entry.
 * Includes full providerResponse, template info, and event info.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { logId: string } }
) {
  try {
    await connectDB()

    const { logId } = params

    if (!logId) {
      return NextResponse.json(
        { success: false, error: 'Log ID is required' },
        { status: 400 }
      )
    }

    // Fetch log
    const log = await NotificationLog.findOne({ logId }).lean()

    if (!log) {
      return NextResponse.json(
        { success: false, error: `Log not found: ${logId}` },
        { status: 404 }
      )
    }

    // Fetch associated event
    const event = await NotificationEvent.findOne({ 
      eventId: (log as any).eventId 
    }).lean()

    // Fetch template if we have a template ID in providerResponse
    let template = null
    if ((log as any).providerResponse?.templateId) {
      template = await NotificationTemplate.findOne({
        templateId: (log as any).providerResponse.templateId
      }).select('templateId templateName').lean()
    }

    // Build detailed response
    const detailedLog = {
      // Core fields
      logId: (log as any).logId,
      queueId: (log as any).queueId || null,
      eventId: (log as any).eventId,
      
      // Event info
      eventCode: (event as any)?.eventCode || 'UNKNOWN',
      eventDescription: (event as any)?.eventDescription || 'Unknown event',
      
      // Recipient
      recipientEmail: (log as any).recipientEmail,
      recipientType: (log as any).recipientType,
      
      // Content
      subject: (log as any).subject,
      
      // Status
      status: (log as any).status,
      errorMessage: (log as any).errorMessage || null,
      
      // Provider info
      providerMessageId: (log as any).providerMessageId || null,
      providerResponse: (log as any).providerResponse || null,
      
      // Correlation
      correlationId: (log as any).providerResponse?.correlationId || null,
      
      // Flags
      wasSkipped: (log as any).providerResponse?.reason === 'DUPLICATE_SKIPPED',
      previousLogId: (log as any).providerResponse?.previousLogId || null,
      
      // Timestamps
      createdAt: (log as any).createdAt,
      updatedAt: (log as any).updatedAt,
      sentAt: (log as any).sentAt || null,
      deliveredAt: (log as any).deliveredAt || null,
      openedAt: (log as any).openedAt || null,
      clickedAt: (log as any).clickedAt || null,
      
      // Context (order/employee info at time of send)
      context: (log as any).providerResponse?.context || null,
      
      // Template info (if available)
      templateId: template ? (template as any).templateId : null,
      templateName: template ? (template as any).templateName : null,
    }

    return NextResponse.json({
      success: true,
      log: detailedLog,
    })

  } catch (error: any) {
    console.error(`[API] GET /api/admin/notifications/logs/${params.logId} error:`, error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch log' },
      { status: 500 }
    )
  }
}
