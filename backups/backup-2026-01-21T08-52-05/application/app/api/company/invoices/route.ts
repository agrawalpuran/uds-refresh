import { NextResponse } from 'next/server'
import { getInvoicesForCompany, approveInvoice } from '@/lib/db/data-access'
// Ensure models are registered
import '@/lib/models/Invoice'

/**
 * GET /api/company/invoices
 * Get invoices for company admin
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    const invoices = await getInvoicesForCompany(companyId || undefined)
    return NextResponse.json(invoices)
  } catch (error: any) {
    console.error('API Error in /api/company/invoices GET:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('not found')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || errorMessage.includes('Not found') || errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    }
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

