import { NextResponse } from 'next/server'
import { approveInvoice } from '@/lib/db/data-access'
// Ensure models are registered
import '@/lib/models/Invoice'

/**
 * POST /api/company/invoices/approve
 * Approve invoice by Company Admin
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
    
    const { invoiceId, approvedBy } = body

    if (!invoiceId) {
      return NextResponse.json(
        { error: 'Invoice ID is required' },
        { status: 400 }
      )
    }
    if (!approvedBy) {
      return NextResponse.json(
        { error: 'Approved By (Company Admin identifier) is required' },
        { status: 400 }
      )
    }

    console.log('[API /company/invoices/approve POST] Approving invoice:', {
      invoiceId,
      approvedBy
    })

    const approvedInvoice = await approveInvoice(invoiceId, approvedBy)

    console.log('[API /company/invoices/approve POST] Invoice approved successfully')
    return NextResponse.json(approvedInvoice, { status: 200 })
  } catch (error: any) {
    console.error('API Error in /api/company/invoices/approve POST:', error)
    console.error('API Error in /api/company/invoices/approve POST:', error)
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