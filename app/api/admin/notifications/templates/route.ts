/**
 * Admin Notifications Templates API
 * 
 * GET  /api/admin/notifications/templates - List all templates with event info
 * 
 * Admin-only API for managing notification templates.
 * 
 * FUTURE EXTENSION POINTS:
 * - Add companyId filter for per-company templates
 * - Add channel filter (email, sms, push) when multi-channel support is added
 * - Add routing rules association
 */

import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import NotificationTemplate from '@/lib/models/NotificationTemplate'
import NotificationEvent from '@/lib/models/NotificationEvent'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/notifications/templates
 * 
 * Returns all notification templates with their associated event information.
 * Used by admin UI to display and manage templates.
 * 
 * Query params (future):
 * - companyId: Filter templates by company (when per-company templates are added)
 * - channel: Filter by notification channel (when multi-channel is added)
 * - isActive: Filter by active status
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB()

    // Get query params for filtering (future-proofing)
    const { searchParams } = new URL(request.url)
    const isActiveFilter = searchParams.get('isActive')
    // FUTURE: const companyId = searchParams.get('companyId')
    // FUTURE: const channel = searchParams.get('channel')

    // Build query filter
    const filter: any = {}
    if (isActiveFilter !== null) {
      filter.isActive = isActiveFilter === 'true'
    }

    // Fetch all templates
    const templates = await NotificationTemplate.find(filter)
      .sort({ eventId: 1, language: 1 })
      .lean()

    // Fetch all events to join with templates
    const events = await NotificationEvent.find({})
      .lean()

    // Create event lookup map
    const eventMap = new Map(
      events.map((e: any) => [e.eventId, e])
    )

    // Join templates with event data and extract supported placeholders
    const templatesWithEvents = templates.map((template: any) => {
      const event = eventMap.get(template.eventId)
      
      // Extract placeholders from template
      const allPlaceholders = extractPlaceholders(
        template.subjectTemplate + ' ' + template.bodyTemplate
      )

      return {
        // Template fields
        templateId: template.templateId,
        templateName: template.templateName,
        eventId: template.eventId,
        subjectTemplate: template.subjectTemplate,
        bodyTemplate: template.bodyTemplate,
        language: template.language,
        isActive: template.isActive,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
        
        // Joined event fields
        eventCode: event?.eventCode || 'UNKNOWN',
        eventDescription: event?.eventDescription || 'Unknown event',
        eventIsActive: event?.isActive ?? false,
        defaultRecipientType: event?.defaultRecipientType || 'EMPLOYEE',
        
        // Derived fields
        supportedPlaceholders: allPlaceholders,
        
        // FUTURE EXTENSION FIELDS (empty for now):
        // companyId: template.companyId || null,  // Per-company templates
        // channel: template.channel || 'EMAIL',   // Multi-channel support
        // routingRuleId: template.routingRuleId,  // Routing rules association
      }
    })

    return NextResponse.json({
      success: true,
      templates: templatesWithEvents,
      count: templatesWithEvents.length,
      // FUTURE: pagination info
      // page: 1,
      // pageSize: 50,
      // totalPages: 1,
    })

  } catch (error: any) {
    console.error('[API] GET /api/admin/notifications/templates error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch templates' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/notifications/templates
 * 
 * Create a new notification template
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB()
    
    const body = await request.json()
    const { templateName, eventId, subjectTemplate, bodyTemplate, language, isActive } = body
    
    // Validation
    if (!templateName?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Template name is required' },
        { status: 400 }
      )
    }
    if (!eventId) {
      return NextResponse.json(
        { success: false, error: 'Event ID is required' },
        { status: 400 }
      )
    }
    if (!subjectTemplate?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Subject template is required' },
        { status: 400 }
      )
    }
    if (!bodyTemplate?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Body template is required' },
        { status: 400 }
      )
    }
    
    // Verify event exists
    const event = await NotificationEvent.findOne({ eventId })
    if (!event) {
      return NextResponse.json(
        { success: false, error: 'Event not found' },
        { status: 404 }
      )
    }
    
    // Generate unique templateId
    const lastTemplate = await NotificationTemplate.findOne().sort({ templateId: -1 })
    const lastId = lastTemplate?.templateId ? parseInt(lastTemplate.templateId) : 600000
    const newTemplateId = String(lastId + 1)
    
    // Create template
    const template = await NotificationTemplate.create({
      templateId: newTemplateId,
      templateName: templateName.trim(),
      eventId,
      subjectTemplate: subjectTemplate.trim(),
      bodyTemplate: bodyTemplate.trim(),
      language: language || 'en',
      isActive: isActive !== false,
    })
    
    console.log(`[POST /api/admin/notifications/templates] Created template: ${template.templateName}`)
    
    // Extract placeholders for response
    const allPlaceholders = extractPlaceholders(
      template.subjectTemplate + ' ' + template.bodyTemplate
    )
    
    return NextResponse.json({
      success: true,
      template: {
        templateId: template.templateId,
        templateName: template.templateName,
        eventId: template.eventId,
        subjectTemplate: template.subjectTemplate,
        bodyTemplate: template.bodyTemplate,
        language: template.language,
        isActive: template.isActive,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
        eventCode: event.eventCode,
        eventDescription: event.eventDescription,
        eventIsActive: event.isActive,
        defaultRecipientType: event.defaultRecipientType,
        supportedPlaceholders: allPlaceholders,
      }
    })
  } catch (error: any) {
    console.error('[POST /api/admin/notifications/templates] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

/**
 * Extract all {{placeholder}} names from a template string
 */
function extractPlaceholders(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g)
  if (!matches) return []
  // Deduplicate and sort
  const placeholders = [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))]
  return placeholders.sort()
}
