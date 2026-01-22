/**
 * Admin Notifications Logs API
 * 
 * GET /api/admin/notifications/logs - List notification logs with filtering
 * 
 * Admin-only read-only API for viewing notification logs.
 * Supports pagination, date range filtering, and status filtering.
 * 
 * FUTURE EXTENSION POINTS:
 * - Add companyId filter for multi-tenant isolation
 * - Add channel filter when multi-channel support is added
 * - Add export functionality (CSV, JSON)
 * - Add aggregation endpoints for analytics
 */

import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import NotificationLog from '@/lib/models/NotificationLog'
import NotificationEvent from '@/lib/models/NotificationEvent'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/notifications/logs
 * 
 * Returns paginated notification logs with filtering options.
 * 
 * Query params:
 * - page: Page number (default: 1)
 * - pageSize: Items per page (default: 50, max: 100)
 * - status: Filter by status (SENT, FAILED, BOUNCED, REJECTED)
 * - eventCode: Filter by event code
 * - startDate: Filter logs after this date (ISO string)
 * - endDate: Filter logs before this date (ISO string)
 * - recipientEmail: Filter by recipient email (partial match)
 * - correlationId: Filter by correlation ID (exact match)
 * 
 * FUTURE:
 * - companyId: Filter by company (when multi-tenant)
 * - channel: Filter by channel (when multi-channel)
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB()

    const { searchParams } = new URL(request.url)

    // Pagination params
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)))
    const skip = (page - 1) * pageSize

    // Filter params
    const status = searchParams.get('status')
    const eventCode = searchParams.get('eventCode')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const recipientEmail = searchParams.get('recipientEmail')
    const correlationId = searchParams.get('correlationId')
    // FUTURE: const companyId = searchParams.get('companyId')
    // FUTURE: const channel = searchParams.get('channel')

    // Build query filter
    const filter: any = {}

    // Status filter
    if (status) {
      const validStatuses = ['SENT', 'FAILED', 'BOUNCED', 'REJECTED']
      if (validStatuses.includes(status.toUpperCase())) {
        filter.status = status.toUpperCase()
      }
    }

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {}
      if (startDate) {
        const start = new Date(startDate)
        if (!isNaN(start.getTime())) {
          filter.createdAt.$gte = start
        }
      }
      if (endDate) {
        const end = new Date(endDate)
        if (!isNaN(end.getTime())) {
          // Include the entire end date
          end.setHours(23, 59, 59, 999)
          filter.createdAt.$lte = end
        }
      }
      // Remove if empty
      if (Object.keys(filter.createdAt).length === 0) {
        delete filter.createdAt
      }
    }

    // Recipient email filter (partial match)
    if (recipientEmail) {
      filter.recipientEmail = { $regex: recipientEmail, $options: 'i' }
    }

    // Correlation ID filter (from providerResponse)
    if (correlationId) {
      filter['providerResponse.correlationId'] = correlationId
    }

    // Event code filter requires lookup
    let eventIdFilter: string | null = null
    if (eventCode) {
      const event = await NotificationEvent.findOne({
        eventCode: eventCode.toUpperCase()
      }).select('eventId').lean()
      
      if (event) {
        eventIdFilter = (event as any).eventId
        filter.eventId = eventIdFilter
      } else {
        // No matching event, return empty results
        return NextResponse.json({
          success: true,
          logs: [],
          pagination: {
            page,
            pageSize,
            total: 0,
            totalPages: 0,
          },
        })
      }
    }

    // Count total matching documents
    const total = await NotificationLog.countDocuments(filter)
    const totalPages = Math.ceil(total / pageSize)

    // Fetch logs
    const logs = await NotificationLog.find(filter)
      .sort({ createdAt: -1 }) // Most recent first
      .skip(skip)
      .limit(pageSize)
      .lean()

    // Fetch all events for lookup
    const events = await NotificationEvent.find({}).lean()
    const eventMap = new Map(
      events.map((e: any) => [e.eventId, e])
    )

    // Transform logs for response
    const transformedLogs = logs.map((log: any) => {
      const event = eventMap.get(log.eventId)
      
      // Extract correlationId from providerResponse if available
      const logCorrelationId = log.providerResponse?.correlationId || null
      
      // Determine if this was a skipped duplicate
      const wasSkipped = log.providerResponse?.reason === 'DUPLICATE_SKIPPED'
      
      return {
        // Core fields
        logId: log.logId,
        eventId: log.eventId,
        eventCode: (event as any)?.eventCode || 'UNKNOWN',
        recipientEmail: log.recipientEmail,
        recipientType: log.recipientType,
        subject: log.subject,
        status: log.status,
        
        // Status details
        errorMessage: log.errorMessage || null,
        providerMessageId: log.providerMessageId || null,
        correlationId: logCorrelationId,
        wasSkipped,
        
        // Timestamps
        createdAt: log.createdAt,
        sentAt: log.sentAt || null,
        deliveredAt: log.deliveredAt || null,
        openedAt: log.openedAt || null,
        clickedAt: log.clickedAt || null,
        
        // Context (from providerResponse)
        context: log.providerResponse?.context || null,
        
        // FUTURE EXTENSION FIELDS:
        // companyId: log.companyId || null,
        // channel: log.channel || 'EMAIL',
      }
    })

    return NextResponse.json({
      success: true,
      logs: transformedLogs,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      // Return applied filters for UI reference
      filters: {
        status: status || null,
        eventCode: eventCode || null,
        startDate: startDate || null,
        endDate: endDate || null,
        recipientEmail: recipientEmail || null,
        correlationId: correlationId || null,
      },
    })

  } catch (error: any) {
    console.error('[API] GET /api/admin/notifications/logs error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch logs' },
      { status: 500 }
    )
  }
}
