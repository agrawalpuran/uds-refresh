/**
 * Company Notification Configuration API
 * 
 * Endpoints for managing company-specific notification settings.
 * 
 * GET /api/admin/company/[companyId]/notifications
 *   - Get all notification events with company-specific settings
 * 
 * PUT /api/admin/company/[companyId]/notifications
 *   - Update company notification settings (master switch, branding, etc.)
 * 
 * DELETE /api/admin/company/[companyId]/notifications
 *   - Reset to system defaults (delete company config)
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getCompanyNotificationConfig,
  getAllEventConfigsForCompany,
  upsertCompanyNotificationConfig,
  deleteCompanyNotificationConfig,
  toggleAllNotificationsForCompany,
} from '@/lib/services/CompanyNotificationConfigService'

// GET - Get company notification config with all events
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      )
    }

    // Get company config
    const config = await getCompanyNotificationConfig(companyId)

    // Get all events with company-specific status
    const events = await getAllEventConfigsForCompany(companyId)

    return NextResponse.json({
      success: true,
      companyId,
      config: config || {
        notificationsEnabled: true,
        eventConfigs: [],
        ccEmails: [],
        bccEmails: [],
      },
      events,
    })
  } catch (error: any) {
    console.error('[GET /api/admin/company/[companyId]/notifications]', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get notification config' },
      { status: 500 }
    )
  }
}

// PUT - Update company notification config
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params
    const body = await request.json()

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      )
    }

    const {
      notificationsEnabled,
      brandName,
      brandColor,
      logoUrl,
      ccEmails,
      bccEmails,
      quietHoursEnabled,
      quietHoursStart,
      quietHoursEnd,
      quietHoursTimezone,
      updatedBy,
    } = body

    // Build update object (only include provided fields)
    const updates: any = {}
    
    if (notificationsEnabled !== undefined) updates.notificationsEnabled = notificationsEnabled
    if (brandName !== undefined) updates.brandName = brandName
    if (brandColor !== undefined) updates.brandColor = brandColor
    if (logoUrl !== undefined) updates.logoUrl = logoUrl
    if (ccEmails !== undefined) updates.ccEmails = ccEmails
    if (bccEmails !== undefined) updates.bccEmails = bccEmails
    if (quietHoursEnabled !== undefined) updates.quietHoursEnabled = quietHoursEnabled
    if (quietHoursStart !== undefined) updates.quietHoursStart = quietHoursStart
    if (quietHoursEnd !== undefined) updates.quietHoursEnd = quietHoursEnd
    if (quietHoursTimezone !== undefined) updates.quietHoursTimezone = quietHoursTimezone

    const config = await upsertCompanyNotificationConfig(companyId, updates, updatedBy)

    return NextResponse.json({
      success: true,
      companyId,
      config,
    })
  } catch (error: any) {
    console.error('[PUT /api/admin/company/[companyId]/notifications]', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update notification config' },
      { status: 500 }
    )
  }
}

// DELETE - Reset to system defaults
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      )
    }

    const deleted = await deleteCompanyNotificationConfig(companyId)

    return NextResponse.json({
      success: true,
      companyId,
      deleted,
      message: deleted 
        ? 'Company notification config deleted, system defaults will apply'
        : 'No custom config found for this company',
    })
  } catch (error: any) {
    console.error('[DELETE /api/admin/company/[companyId]/notifications]', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete notification config' },
      { status: 500 }
    )
  }
}
