/**
 * Company Event-Specific Notification API
 * 
 * Endpoints for managing a specific notification event for a company.
 * 
 * GET /api/admin/company/[companyId]/notifications/events/[eventCode]
 *   - Get event config for company
 * 
 * PUT /api/admin/company/[companyId]/notifications/events/[eventCode]
 *   - Update event config (enable/disable, custom template)
 * 
 * PATCH /api/admin/company/[companyId]/notifications/events/[eventCode]
 *   - Quick toggle enable/disable
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getEventConfigForCompany,
  updateEventConfig,
  toggleEventForCompany,
  isEventEnabledForCompany,
} from '@/lib/services/CompanyNotificationConfigService'
import { getTemplateForCompany } from '@/lib/services/CompanyNotificationConfigService'

// GET - Get event config for company
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string; eventCode: string }> }
) {
  try {
    const { companyId, eventCode } = await params

    if (!companyId || !eventCode) {
      return NextResponse.json(
        { error: 'Company ID and Event Code are required' },
        { status: 400 }
      )
    }

    const eventConfig = await getEventConfigForCompany(companyId, eventCode)
    const isEnabled = await isEventEnabledForCompany(companyId, eventCode)
    const template = await getTemplateForCompany(companyId, eventCode)

    return NextResponse.json({
      success: true,
      companyId,
      eventCode: eventCode.toUpperCase(),
      isEnabled,
      hasCustomConfig: !!eventConfig,
      config: eventConfig || {
        eventCode: eventCode.toUpperCase(),
        isEnabled: true,
        customSubject: null,
        customBody: null,
        recipients: [],
      },
      template: template || null,
    })
  } catch (error: any) {
    console.error('[GET /api/admin/company/[companyId]/notifications/events/[eventCode]]', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get event config' },
      { status: 500 }
    )
  }
}

// PUT - Update event config (full update)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string; eventCode: string }> }
) {
  try {
    const { companyId, eventCode } = await params
    const body = await request.json()

    if (!companyId || !eventCode) {
      return NextResponse.json(
        { error: 'Company ID and Event Code are required' },
        { status: 400 }
      )
    }

    const {
      isEnabled,
      customSubject,
      customBody,
      recipients,
      updatedBy,
    } = body

    const config = await updateEventConfig(
      companyId,
      eventCode,
      {
        isEnabled,
        customSubject,
        customBody,
        recipients,
      },
      updatedBy
    )

    return NextResponse.json({
      success: true,
      companyId,
      eventCode: eventCode.toUpperCase(),
      config,
    })
  } catch (error: any) {
    console.error('[PUT /api/admin/company/[companyId]/notifications/events/[eventCode]]', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update event config' },
      { status: 500 }
    )
  }
}

// PATCH - Quick toggle enable/disable
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string; eventCode: string }> }
) {
  try {
    const { companyId, eventCode } = await params
    const body = await request.json()

    if (!companyId || !eventCode) {
      return NextResponse.json(
        { error: 'Company ID and Event Code are required' },
        { status: 400 }
      )
    }

    const { isEnabled, updatedBy } = body

    if (isEnabled === undefined) {
      return NextResponse.json(
        { error: 'isEnabled is required' },
        { status: 400 }
      )
    }

    const config = await toggleEventForCompany(companyId, eventCode, isEnabled, updatedBy)

    return NextResponse.json({
      success: true,
      companyId,
      eventCode: eventCode.toUpperCase(),
      isEnabled,
      config,
    })
  } catch (error: any) {
    console.error('[PATCH /api/admin/company/[companyId]/notifications/events/[eventCode]]', error)
    return NextResponse.json(
      { error: error.message || 'Failed to toggle event' },
      { status: 500 }
    )
  }
}
