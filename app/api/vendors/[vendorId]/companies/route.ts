import { NextResponse } from 'next/server'
import { getCompaniesByVendor } from '@/lib/db/data-access'

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

/**
 * GET /api/vendors/[vendorId]/companies
 * Returns all companies that a specific vendor supplies products to.
 * This is derived from ProductVendor + ProductCompany relationships.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ vendorId: string }> }
) {
  try {
    // CRITICAL: In Next.js 15+, params is a Promise that must be awaited
    const { vendorId } = await params

    if (!vendorId) {
      return NextResponse.json({ error: 'Vendor ID is required' }, { status: 400 })
    }

    console.log(`[API /vendors/${vendorId}/companies] Fetching companies for vendor`)
    
    const companies = await getCompaniesByVendor(vendorId)
    
    console.log(`[API /vendors/${vendorId}/companies] Found ${companies.length} companies`)
    
    return NextResponse.json(companies)
  } catch (error: any) {
    console.error('[API /vendors/[vendorId]/companies] Error:', error)
    
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

    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
