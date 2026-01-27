/**
 * Notification Events API
 * GET /api/admin/notifications/events - List all events
 * POST /api/admin/notifications/events - Create new event
 */

import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import NotificationEvent from '@/lib/models/NotificationEvent'

// GET - List all notification events
export async function GET() {
  try {
    await connectDB()
    
    const events = await NotificationEvent.find()
      .sort({ eventCode: 1 })
      .lean()
    
    return NextResponse.json({
      success: true,
      events: events.map(e => ({
        eventId: e.eventId,
        eventCode: e.eventCode,
        eventDescription: e.eventDescription,
        defaultRecipientType: e.defaultRecipientType,
        isActive: e.isActive,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      }))
    })
  } catch (error: any) {
    console.error('[GET /api/admin/notifications/events] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

// POST - Create new notification event
export async function POST(request: NextRequest) {
  try {
    await connectDB()
    
    const body = await request.json()
    const { eventCode, eventDescription, defaultRecipientType, isActive } = body
    
    // Validation
    if (!eventCode?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Event code is required' },
        { status: 400 }
      )
    }
    if (!eventDescription?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Event description is required' },
        { status: 400 }
      )
    }
    
    // Check for duplicate
    const existing = await NotificationEvent.findOne({ 
      eventCode: eventCode.toUpperCase().replace(/\s+/g, '_') 
    })
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Event code "${eventCode}" already exists` },
        { status: 400 }
      )
    }
    
    // Generate unique eventId
    const lastEvent = await NotificationEvent.findOne().sort({ eventId: -1 })
    const lastId = lastEvent?.eventId ? parseInt(lastEvent.eventId) : 500000
    const newEventId = String(lastId + 1)
    
    // Create event
    const event = await NotificationEvent.create({
      eventId: newEventId,
      eventCode: eventCode.toUpperCase().replace(/\s+/g, '_'),
      eventDescription: eventDescription.trim(),
      defaultRecipientType: defaultRecipientType || 'EMPLOYEE',
      isActive: isActive !== false,
    })
    
    console.log(`[POST /api/admin/notifications/events] Created event: ${event.eventCode}`)
    
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
    console.error('[POST /api/admin/notifications/events] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
