import { NextResponse } from 'next/server'
import {
  getManualCourierProviderById,
  updateManualCourierProvider,
  deleteManualCourierProvider,
} from '@/lib/db/manual-courier-provider-access'

/**
 * GET /api/superadmin/manual-courier-providers/[courierRefId]
 * Get manual courier provider by ID
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(
  request: Request,
  { params }: { params: Promise<{ courierRefId: string }> }
) {
  try {
    const { courierRefId } = await params

    const courier = await getManualCourierProviderById(courierRefId)

    if (!courier) {
      return NextResponse.json(
        { error: 'Courier not found' },
        { status: 404 }
      )

    return NextResponse.json({ courier })
  } catch (error) {
    const err = error as any;
    console.error('[API /superadmin/manual-courier-providers/[courierRefId] GET] Error:', error)
    console.error('[API /superadmin/manual-courier-providers/[courierRefId] GET] Error:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || 
        errorMessage.includes('Not found') || 
        errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    
    // Return 401 for authentication errors
    if (errorMessage.includes('Unauthorized') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('token')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
      )
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/superadmin/manual-courier-providers/[courierRefId]
 * Update manual courier provider
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ courierRefId: string }> }
) {
  try {
    const { courierRefId } = await params
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    const {
      courierCode,
      courierName,
      isActive,
      contactWebsite,
      supportPhone,
      remarks,
    } = body

    // Validate courierCode format if provided
    if (courierCode && !/^[A-Z0-9_-]+$/i.test(courierCode)) {
      return NextResponse.json(
        { error: 'Courier code must be alphanumeric with hyphens/underscores only' },
        { status: 400 }
      )

    const courier = await updateManualCourierProvider(courierRefId, {
      courierCode,
      courierName,
      isActive,
      contactWebsite,
      supportPhone,
      remarks,
    })

    return NextResponse.json({ courier })
  } catch (error) {
    const err = error as any;
    console.error('[API /superadmin/manual-courier-providers/[courierRefId] PUT] Error:', error)
    console.error('[API /superadmin/manual-courier-providers/[courierRefId] PUT] Error:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || 
        errorMessage.includes('Not found') || 
        errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    
    // Return 401 for authentication errors
    if (errorMessage.includes('Unauthorized') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('token')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
      )
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/superadmin/manual-courier-providers/[courierRefId]
 * Delete manual courier provider (soft delete)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ courierRefId: string }> }
) {
  try {
    const { courierRefId } = await params

    await deleteManualCourierProvider(courierRefId)

    return NextResponse.json({ success: true })
  } catch (error) {
    const err = error as any;
    console.error('[API /superadmin/manual-courier-providers/[courierRefId] DELETE] Error:', error)
    console.error('[API /superadmin/manual-courier-providers/[courierRefId] DELETE] Error:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || 
        errorMessage.includes('Not found') || 
        errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    
    // Return 401 for authentication errors
    if (errorMessage.includes('Unauthorized') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('token')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
      )
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
}}}}}}}}}}}}
