import { NextResponse } from 'next/server'
import { getGRNsPendingAcknowledgment, acknowledgeGRN } from '@/lib/db/data-access'
// Ensure models are registered
import '@/lib/models/GRN'

/**
 * GET /api/company/grns/acknowledge
 * Get GRNs pending acknowledgment by Company Admin
 * Query params:
 * - companyId: Company ID (optional filter)
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || undefined

    const grns = await getGRNsPendingAcknowledgment(companyId)
    return NextResponse.json(grns)
  } catch (error: any) {
    console.error('API Error in /api/company/grns/acknowledge GET:', error)
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
    }
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || 
        errorMessage.includes('Not found') || 
        errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    }
    
    // Return 401 for authentication errors
    if (errorMessage.includes('Unauthorized') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('token')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
      )
    }
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * POST /api/company/grns/acknowledge
 * Acknowledge GRN by Company Admin
 */
export async function POST(request: Request) {
  try {
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    }
    
    const { grnId, acknowledgedBy } = body

    // Validate required fields
    if (!grnId) {
      return NextResponse.json(
        { error: 'GRN ID is required' },
        { status: 400 }
      )
    }
    if (!acknowledgedBy || !acknowledgedBy.trim()) {
      return NextResponse.json(
        { error: 'Acknowledged By (Company Admin ID/name) is required' },
        { status: 400 }
      )
    }

    console.log('[API /company/grns/acknowledge POST] Acknowledging GRN:', {
      grnId,
      acknowledgedBy: acknowledgedBy.trim()
    })

    // Acknowledge GRN
    const grn = await acknowledgeGRN(grnId, acknowledgedBy.trim())

    console.log('[API /company/grns/acknowledge POST] GRN acknowledged successfully')
    return NextResponse.json(grn, { status: 200 })
  } catch (error: any) {
    console.error('API Error in /api/company/grns/acknowledge POST:', error)
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
    }
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || 
        errorMessage.includes('Not found') || 
        errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    }
    
    // Return 401 for authentication errors
    if (errorMessage.includes('Unauthorized') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('token')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
      )
    }
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}