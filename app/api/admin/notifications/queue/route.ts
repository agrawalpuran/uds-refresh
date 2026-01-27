/**
 * Notification Queue Management API
 * 
 * GET /api/admin/notifications/queue
 *   - Get queued notifications with filtering and pagination
 * 
 * DELETE /api/admin/notifications/queue
 *   - Cancel/remove queued notifications
 */

import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import NotificationQueue from '@/lib/models/NotificationQueue'

/**
 * GET - List queued notifications
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB()

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const status = searchParams.get('status') // PENDING, PROCESSING, SENT, FAILED
    const companyId = searchParams.get('companyId')
    const eventCode = searchParams.get('eventCode')

    // Build query
    const query: any = {}
    if (status) query.status = status
    if (companyId) query.companyId = companyId
    if (eventCode) query.eventCode = eventCode

    // Count total
    const total = await NotificationQueue.countDocuments(query)

    // Fetch paginated results
    const queue = await NotificationQueue.find(query)
      .sort({ scheduledFor: 1, createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean()

    return NextResponse.json({
      success: true,
      queue,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNext: page * pageSize < total,
        hasPrev: page > 1,
      },
    })
  } catch (error: any) {
    console.error('[GET /api/admin/notifications/queue]', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get queue' },
      { status: 500 }
    )
  }
}

/**
 * DELETE - Cancel queued notifications
 */
export async function DELETE(request: NextRequest) {
  try {
    await connectDB()

    const searchParams = request.nextUrl.searchParams
    const queueId = searchParams.get('queueId')
    const companyId = searchParams.get('companyId')
    const status = searchParams.get('status')

    if (!queueId && !companyId && !status) {
      return NextResponse.json(
        { error: 'Must provide queueId, companyId, or status filter' },
        { status: 400 }
      )
    }

    // Build query for items to cancel
    const query: any = { status: { $in: ['PENDING', 'PROCESSING'] } }
    if (queueId) query.queueId = queueId
    if (companyId) query.companyId = companyId
    if (status) query.status = status

    // Cancel by setting status to CANCELLED
    const result = await NotificationQueue.updateMany(
      query,
      {
        $set: {
          status: 'CANCELLED',
          lastError: 'Manually cancelled via API',
        },
      }
    )

    return NextResponse.json({
      success: true,
      cancelled: result.modifiedCount,
      message: `Cancelled ${result.modifiedCount} queued notifications`,
    })
  } catch (error: any) {
    console.error('[DELETE /api/admin/notifications/queue]', error)
    return NextResponse.json(
      { error: error.message || 'Failed to cancel queue items' },
      { status: 500 }
    )
  }
}
