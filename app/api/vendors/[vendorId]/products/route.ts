import { NextResponse } from 'next/server'
import { getProductsByVendor, getProductsByVendorAndCompany } from '@/lib/db/data-access'

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

/**
 * GET /api/vendors/[vendorId]/products
 * Returns products for a vendor, optionally filtered by company.
 * 
 * Query params:
 *   - companyId: Optional. If provided, returns only products linked to both the vendor AND the company.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ vendorId: string }> }
) {
  try {
    // CRITICAL: In Next.js 15+, params is a Promise that must be awaited
    const { vendorId } = await params
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')

    if (!vendorId) {
      return NextResponse.json({ error: 'Vendor ID is required' }, { status: 400 })
    }

    let products: any[]

    if (companyId) {
      console.log(`[API /vendors/${vendorId}/products] Fetching products filtered by company ${companyId}`)
      products = await getProductsByVendorAndCompany(vendorId, companyId)
    } else {
      console.log(`[API /vendors/${vendorId}/products] Fetching all products for vendor`)
      products = await getProductsByVendor(vendorId)
    }
    
    console.log(`[API /vendors/${vendorId}/products] Found ${products.length} products`)
    
    return NextResponse.json(products)
  } catch (error: any) {
    console.error('[API /vendors/[vendorId]/products] Error:', error)
    
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
