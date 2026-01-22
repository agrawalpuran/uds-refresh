import { NextResponse } from 'next/server'
import { updatePRAndPOStatusesFromDelivery } from '@/lib/db/data-access'
// Ensure models are registered
import '@/lib/models/Order'
import '@/lib/models/PurchaseOrder'
import '@/lib/models/POOrder'

/**
 * POST /api/admin/update-pr-po-statuses
 * Update existing PR and PO statuses based on underlying order delivery status
 * This is a maintenance/migration endpoint
 * Query params:
 * - companyId: Optional company ID to limit update scope
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId') || undefined

    console.log('[API /admin/update-pr-po-statuses POST] Starting PR/PO status update:', {
      companyId: companyId || 'ALL COMPANIES'
    })

    // Update PR and PO statuses
    const result = await updatePRAndPOStatusesFromDelivery(companyId)

    console.log('[API /admin/update-pr-po-statuses POST] Update complete:', result)

    return NextResponse.json({
      success: true,
      ...result,
      message: `Updated ${result.prsUpdated} PRs and ${result.posUpdated} POs. ${result.errors.length} errors occurred.`
    }, { status: 200 })
  } catch (error: any) {
    console.error('API Error in /api/admin/update-pr-po-statuses POST:', error)
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
