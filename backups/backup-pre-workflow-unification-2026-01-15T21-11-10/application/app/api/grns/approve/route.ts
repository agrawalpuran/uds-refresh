import { NextResponse } from 'next/server'
import { approveGRN } from '@/lib/db/data-access'
// Ensure models are registered
import '@/lib/models/GRN'

/**
 * POST /api/grns/approve
 * Approve GRN by Company Admin (Simple Approval Workflow)
 * Updates grnStatus from RAISED to APPROVED
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
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
    const { grnId, approvedBy } = body

    if (!grnId) {
      return NextResponse.json(
        { error: 'GRN ID is required' },
        { status: 400 }
      )
    }
    if (!approvedBy) {
      return NextResponse.json(
        { error: 'Approved By (Company Admin identifier) is required' },
        { status: 400 }
      )
    }

    console.log('[API /grns/approve POST] Approving GRN:', {
      grnId,
      approvedBy
    })

    const approvedGRN = await approveGRN(grnId, approvedBy)

    console.log('[API /grns/approve POST] GRN approved successfully')
    return NextResponse.json(approvedGRN, { status: 200 })
  } catch (error: any) {
    console.error('API Error in /api/grns/approve POST:', error)
    console.error('API Error in /api/grns/approve POST:', error)
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

