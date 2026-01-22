/**
 * Admin Notifications Templates - Single Template API
 * 
 * GET  /api/admin/notifications/templates/:templateId - Get single template
 * PUT  /api/admin/notifications/templates/:templateId - Update template
 * 
 * Admin-only API for managing individual notification templates.
 * Supports updating subject, body, and active status.
 * Does NOT support deletion - use isActive toggle instead.
 * 
 * FUTURE EXTENSION POINTS:
 * - Add companyId for per-company template overrides
 * - Add channel field when multi-channel support is added
 * - Add version history tracking
 */

import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import NotificationTemplate from '@/lib/models/NotificationTemplate'
import NotificationEvent from '@/lib/models/NotificationEvent'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/notifications/templates/:templateId
 * 
 * Returns a single template with full details including event info.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { templateId: string } }
) {
  try {
    await connectDB()

    const { templateId } = params

    if (!templateId) {
      return NextResponse.json(
        { success: false, error: 'Template ID is required' },
        { status: 400 }
      )
    }

    // Fetch template
    const template = await NotificationTemplate.findOne({ templateId }).lean()

    if (!template) {
      return NextResponse.json(
        { success: false, error: `Template not found: ${templateId}` },
        { status: 404 }
      )
    }

    // Fetch associated event
    const event = await NotificationEvent.findOne({ 
      eventId: (template as any).eventId 
    }).lean()

    // Extract placeholders
    const allPlaceholders = extractPlaceholders(
      (template as any).subjectTemplate + ' ' + (template as any).bodyTemplate
    )

    return NextResponse.json({
      success: true,
      template: {
        ...(template as any),
        eventCode: (event as any)?.eventCode || 'UNKNOWN',
        eventDescription: (event as any)?.eventDescription || 'Unknown event',
        eventIsActive: (event as any)?.isActive ?? false,
        defaultRecipientType: (event as any)?.defaultRecipientType || 'EMPLOYEE',
        supportedPlaceholders: allPlaceholders,
      },
    })

  } catch (error: any) {
    console.error(`[API] GET /api/admin/notifications/templates/${params.templateId} error:`, error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch template' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/admin/notifications/templates/:templateId
 * 
 * Updates a notification template.
 * 
 * Allowed fields:
 * - subjectTemplate: Email subject with {{placeholders}}
 * - bodyTemplate: Email body (HTML) with {{placeholders}}
 * - isActive: Enable/disable the template
 * - templateName: Human-readable name
 * 
 * NOT allowed (protected fields):
 * - templateId: Immutable
 * - eventId: Cannot change event association
 * - language: Cannot change language (create new template instead)
 * 
 * Validation:
 * - Subject template must be 1-500 characters
 * - Body template must not be empty
 * - Warns if placeholders are used that don't match event's expected data
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { templateId: string } }
) {
  try {
    await connectDB()

    const { templateId } = params

    if (!templateId) {
      return NextResponse.json(
        { success: false, error: 'Template ID is required' },
        { status: 400 }
      )
    }

    // Parse request body
    let body: any
    try {
      body = await request.json()
    } catch (e) {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    // Fetch existing template
    const existingTemplate = await NotificationTemplate.findOne({ templateId })

    if (!existingTemplate) {
      return NextResponse.json(
        { success: false, error: `Template not found: ${templateId}` },
        { status: 404 }
      )
    }

    // Build update object (only allowed fields)
    const updates: any = {}
    const warnings: string[] = []

    // Validate and apply subjectTemplate
    if (body.subjectTemplate !== undefined) {
      const subject = String(body.subjectTemplate).trim()
      if (subject.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Subject template cannot be empty' },
          { status: 400 }
        )
      }
      if (subject.length > 500) {
        return NextResponse.json(
          { success: false, error: 'Subject template cannot exceed 500 characters' },
          { status: 400 }
        )
      }
      updates.subjectTemplate = subject
    }

    // Validate and apply bodyTemplate
    if (body.bodyTemplate !== undefined) {
      const bodyContent = String(body.bodyTemplate).trim()
      if (bodyContent.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Body template cannot be empty' },
          { status: 400 }
        )
      }
      updates.bodyTemplate = bodyContent
    }

    // Apply isActive toggle
    if (body.isActive !== undefined) {
      updates.isActive = Boolean(body.isActive)
    }

    // Apply templateName
    if (body.templateName !== undefined) {
      const name = String(body.templateName).trim()
      if (name.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Template name cannot be empty' },
          { status: 400 }
        )
      }
      if (name.length > 100) {
        return NextResponse.json(
          { success: false, error: 'Template name cannot exceed 100 characters' },
          { status: 400 }
        )
      }
      updates.templateName = name
    }

    // Check for protected field modifications (reject silently or warn)
    if (body.templateId && body.templateId !== templateId) {
      warnings.push('templateId cannot be changed')
    }
    if (body.eventId && body.eventId !== existingTemplate.eventId) {
      warnings.push('eventId cannot be changed')
    }
    if (body.language && body.language !== existingTemplate.language) {
      warnings.push('language cannot be changed')
    }

    // If no valid updates, return error
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    // Validate placeholders if template content changed
    if (updates.subjectTemplate || updates.bodyTemplate) {
      const newSubject = updates.subjectTemplate || existingTemplate.subjectTemplate
      const newBody = updates.bodyTemplate || existingTemplate.bodyTemplate
      const newPlaceholders = extractPlaceholders(newSubject + ' ' + newBody)
      
      // Check for potentially invalid placeholders (just warn, don't block)
      const knownPlaceholders = [
        'employeeName', 'employeeEmail', 'orderId', 'orderStatus', 'previousStatus',
        'prNumber', 'poNumber', 'vendorName', 'companyName', 'companyId',
        'awbNumber', 'shipmentDate', 'deliveryDate'
      ]
      const unknownPlaceholders = newPlaceholders.filter(p => !knownPlaceholders.includes(p))
      if (unknownPlaceholders.length > 0) {
        warnings.push(`Unknown placeholders detected: ${unknownPlaceholders.join(', ')}. They may not be replaced at runtime.`)
      }
    }

    // Apply updates
    Object.assign(existingTemplate, updates)
    await existingTemplate.save()

    // Fetch updated template with event info
    const event = await NotificationEvent.findOne({ 
      eventId: existingTemplate.eventId 
    }).lean()

    const allPlaceholders = extractPlaceholders(
      existingTemplate.subjectTemplate + ' ' + existingTemplate.bodyTemplate
    )

    console.log(`[API] PUT /api/admin/notifications/templates/${templateId} - Updated successfully`, {
      templateId,
      updates: Object.keys(updates),
      warnings,
    })

    return NextResponse.json({
      success: true,
      template: {
        templateId: existingTemplate.templateId,
        templateName: existingTemplate.templateName,
        eventId: existingTemplate.eventId,
        subjectTemplate: existingTemplate.subjectTemplate,
        bodyTemplate: existingTemplate.bodyTemplate,
        language: existingTemplate.language,
        isActive: existingTemplate.isActive,
        createdAt: existingTemplate.createdAt,
        updatedAt: existingTemplate.updatedAt,
        eventCode: (event as any)?.eventCode || 'UNKNOWN',
        eventDescription: (event as any)?.eventDescription || 'Unknown event',
        eventIsActive: (event as any)?.isActive ?? false,
        defaultRecipientType: (event as any)?.defaultRecipientType || 'EMPLOYEE',
        supportedPlaceholders: allPlaceholders,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    })

  } catch (error: any) {
    console.error(`[API] PUT /api/admin/notifications/templates/${params.templateId} error:`, error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update template' },
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
  const placeholders = [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))]
  return placeholders.sort()
}
