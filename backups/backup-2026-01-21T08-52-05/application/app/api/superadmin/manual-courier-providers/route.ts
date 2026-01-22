
import { NextResponse } from 'next/server'
import {
  getAllManualCourierProviders,
  createManualCourierProvider,
} from '@/lib/db/manual-courier-provider-access'
// Ensure model is registered
import '@/lib/models/ManualCourierProvider'

/**
 * GET /api/superadmin/manual-courier-providers
 * Get all manual courier providers
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const isActive = searchParams.get('isActive')

    const filters: any = {}
    if (isActive !== null && isActive !== '') {
      filters.isActive = isActive === 'true'
    }

    const couriers = await getAllManualCourierProviders(filters)

    return NextResponse.json({ couriers })
  } catch (error: any) {
    console.error('[API /superadmin/manual-courier-providers GET] Error:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('Invalid JSON')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }
    
    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('Not found') ||
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }
    
    if (
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('token')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 401 })
    }
    
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

/**
 * POST /api/superadmin/manual-courier-providers
 * Create manual courier provider
 */
export async function POST(request: Request) {
  try {
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const {
      courierCode,
      courierName,
      isActive,
      contactWebsite,
      supportPhone,
      remarks,
    } = body

    if (!courierCode || !courierName) {
      return NextResponse.json(
        { error: 'courierCode and courierName are required' },
        { status: 400 }
      )
    }

    // Validate courierCode format
    if (!/^[A-Z0-9_-]+$/i.test(courierCode)) {
      return NextResponse.json(
        { error: 'Courier code must be alphanumeric with hyphens/underscores only' },
        { status: 400 }
      )
    }

    console.log('[API /superadmin/manual-courier-providers POST] Creating courier:', courierCode)

    const courier = await createManualCourierProvider({
      courierCode,
      courierName,
      isActive,
      contactWebsite,
      supportPhone,
      remarks,
    })

    console.log('[API /superadmin/manual-courier-providers POST] Courier created successfully:', courier.courierRefId)
    
    return NextResponse.json({ courier })

  } catch (error: any) {
    console.error('[API /superadmin/manual-courier-providers POST] Error:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('Invalid JSON')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }
    
    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('Not found') ||
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }
    
    if (
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('token')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 401 })
    }
    
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
