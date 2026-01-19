
import { NextResponse } from 'next/server'
import { getGRNsRaisedByVendors } from '@/lib/db/data-access'

// Ensure models are registered
import '@/lib/models/GRN'
import '@/lib/models/PurchaseOrder'
import '@/lib/models/POOrder'
import '@/lib/models/Order'

/**
 * POST /api/grns
 * NOTE: GRN creation is now vendor-led workflow
 * Vendors create GRNs via /api/vendor/grns endpoint
 * This endpoint is kept for backward compatibility but returns an error
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    return NextResponse.json(
      { error: 'GRN creation is now vendor-led. Please use /api/vendor/grns endpoint.' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error(`[API] Error in POST handler:`, error)
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
 * GET /api/grns
 * Get GRNs for a company
 * Supports:
 * - companyId
 * - vendorId
 * - status
 * - raisedByVendors=true (companyId optional)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const vendorId = searchParams.get('vendorId')
    const status = searchParams.get('status') as 'CREATED' | 'RECEIVED' | 'CLOSED' | null
    const raisedByVendors = searchParams.get('raisedByVendors') === 'true'

    // If raisedByVendors=true, use new function
    if (raisedByVendors) {
      const grns = await getGRNsRaisedByVendors(companyId || undefined)
      return NextResponse.json(grns)
    }

    // Standard query requires companyId
    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      )
    }

    // Standard queries: GRNs raised by vendors for the company
    const grns = await getGRNsRaisedByVendors(companyId)

    // Apply optional filters
    let filteredGRNs = grns

    if (vendorId) {
      filteredGRNs = filteredGRNs.filter((g: any) => g.vendorId === vendorId)
    }

    if (status) {
      filteredGRNs = filteredGRNs.filter((g: any) => g.status === status)
    }

    return NextResponse.json(filteredGRNs)

  } catch (error: any) {
    console.error('API Error in /api/grns GET:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    const isConnectionError =
      errorMessage.includes('Mongo') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('timeout') ||
      error?.code === 'ECONNREFUSED' ||
      error?.name === 'MongoNetworkError'

    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('Not found') ||
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }

    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

    return NextResponse.json(
      {
        error: errorMessage,
        type: isConnectionError ? 'database_connection_error' : 'api_error'
      },
      { status: isConnectionError ? 503 : 500 }
    )
  }
}

/**
 * PUT /api/grns
 * NOTE: GRN status updates are now handled via approval workflow
 */
export async function PUT(request: Request) {
  try {
    return NextResponse.json(
      { error: 'GRN status updates are handled via approval/acknowledgment endpoints.' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error(`[API] Error in PUT handler:`, error)
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
