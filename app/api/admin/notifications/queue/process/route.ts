/**
 * Notification Queue Processing API
 * 
 * POST /api/admin/notifications/queue/process
 *   - Process pending notifications in the queue
 *   - Should be called periodically (e.g., every 5 minutes via cron/scheduler)
 * 
 * GET /api/admin/notifications/queue/process
 *   - Get queue statistics
 * 
 * Security: Should be protected with a secret key in production
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  processNotificationQueue,
  getQueueStats,
} from '@/lib/services/NotificationService'

// Secret key for cron/scheduler authentication (optional)
const QUEUE_PROCESSOR_SECRET = process.env.NOTIFICATION_QUEUE_SECRET

/**
 * GET - Get queue statistics
 */
export async function GET(request: NextRequest) {
  try {
    // Optional: Verify secret for production security
    const authHeader = request.headers.get('x-queue-secret')
    if (QUEUE_PROCESSOR_SECRET && authHeader !== QUEUE_PROCESSOR_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const stats = await getQueueStats()

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[GET /api/admin/notifications/queue/process]', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get queue stats' },
      { status: 500 }
    )
  }
}

/**
 * POST - Process the notification queue
 */
export async function POST(request: NextRequest) {
  try {
    // Optional: Verify secret for production security
    const authHeader = request.headers.get('x-queue-secret')
    if (QUEUE_PROCESSOR_SECRET && authHeader !== QUEUE_PROCESSOR_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse options from request body
    let options: { batchSize?: number; companyId?: string } = {}
    try {
      const body = await request.json()
      options = {
        batchSize: body.batchSize,
        companyId: body.companyId,
      }
    } catch {
      // No body provided, use defaults
    }

    console.log('[POST /api/admin/notifications/queue/process] Starting queue processing...')

    const result = await processNotificationQueue(options)

    return NextResponse.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[POST /api/admin/notifications/queue/process]', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process queue' },
      { status: 500 }
    )
  }
}
