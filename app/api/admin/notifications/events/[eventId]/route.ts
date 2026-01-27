/**
 * Single Notification Event API
 * GET /api/admin/notifications/events/[eventId] - Get event details
 * PUT /api/admin/notifications/events/[eventId] - Update event
 * DELETE /api/admin/notifications/events/[eventId] - Delete event
 */

import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import NotificationEvent from '@/lib/models/NotificationEvent'
import NotificationTemplate from '@/lib/models/NotificationTemplate'

interface RouteParams {
  params: Promise<{ eventId: string }>
}

// GET - Get single event
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { eventId } = await params
    await connectDB()
    
    const event = await NotificationEvent.findOne({ eventId }).lean()
    
    if (!event) {
      return NextResponse.json(
        { success: false, error: 'Event not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      event: {
        eventId: event.eventId,
        eventCode: event.eventCode,
        eventDescription: event.eventDescription,
        defaultRecipientType: event.defaultRecipientType,
        isActive: event.isActive,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      }
    })
  } catch (error: any) {
    console.error('[GET /api/admin/notifications/events/[eventId]] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// PUT - Update event
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { eventId } = await params
    await connectDB()
    
    const body = await request.json()
    const { eventCode, eventDescription, defaultRecipientType, isActive } = body
    
    const event = await NotificationEvent.findOne({ eventId })
    
    if (!event) {
      return NextResponse.json(
        { success: false, error: 'Event not found' },
        { status: 404 }
      )
    }
    
    // Update fields
    if (eventCode !== undefined) {
      const normalizedCode = eventCode.toUpperCase().replace(/\s+/g, '_')
      // Check for duplicate if code is changing
      if (normalizedCode !== event.eventCode) {
        const existing = await NotificationEvent.findOne({ eventCode: normalizedCode })
        if (existing) {
          return NextResponse.json(
            { success: false, error: `Event code "${eventCode}" already exists` },
            { status: 400 }
          )
        }
      }
      event.eventCode = normalizedCode
    }
    if (eventDescription !== undefined) {
      event.eventDescription = eventDescription.trim()
    }
    if (defaultRecipientType !== undefined) {
      event.defaultRecipientType = defaultRecipientType
    }
    if (isActive !== undefined) {
      event.isActive = isActive
    }
    
    await event.save()
    
    console.log(`[PUT /api/admin/notifications/events/${eventId}] Updated event: ${event.eventCode}`)
    
    return NextResponse.json({
      success: true,
      event: {
        eventId: event.eventId,
        eventCode: event.eventCode,
        eventDescription: event.eventDescription,
        defaultRecipientType: event.defaultRecipientType,
        isActive: event.isActive,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      }
    })
  } catch (error: any) {
    console.error('[PUT /api/admin/notifications/events/[eventId]] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// DELETE - Delete event and associated templates
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { eventId } = await params
    await connectDB()
    
    const event = await NotificationEvent.findOne({ eventId })
    
    if (!event) {
      return NextResponse.json(
        { success: false, error: 'Event not found' },
        { status: 404 }
      )
    }
    
    // Delete associated templates first
    const deletedTemplates = await NotificationTemplate.deleteMany({ eventId })
    
    // Delete the event
    await NotificationEvent.deleteOne({ eventId })
    
    console.log(`[DELETE /api/admin/notifications/events/${eventId}] Deleted event: ${event.eventCode} and ${deletedTemplates.deletedCount} template(s)`)
    
    return NextResponse.json({
      success: true,
      message: `Event "${event.eventCode}" deleted along with ${deletedTemplates.deletedCount} template(s)`
    })
  } catch (error: any) {
    console.error('[DELETE /api/admin/notifications/events/[eventId]] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
