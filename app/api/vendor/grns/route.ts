import { NextResponse } from 'next/server'
import { 
  getPOsEligibleForGRN, 
  createGRNByVendor, 
  getGRNsByVendor,
  // POST-DELIVERY WORKFLOW EXTENSION: Manual order support
  getManualOrdersEligibleForGRN,
  createGRNForManualOrder
} from '@/lib/db/data-access'
// Ensure models are registered
import '@/lib/models/GRN'
import '@/lib/models/PurchaseOrder'
import '@/lib/models/POOrder'
import '@/lib/models/Order'

/**
 * GET /api/vendor/grns
 * Get GRNs raised by vendor OR get eligible items for GRN
 * Query params:
 * - vendorId: Vendor ID (required)
 * - type: 'eligible' | 'manual-eligible' | 'all-eligible' | 'my-grns' (default: 'my-grns')
 *   - 'eligible': POs eligible for GRN (PR→PO workflow)
 *   - 'manual-eligible': Manual orders eligible for GRN (POST-DELIVERY EXTENSION)
 *   - 'all-eligible': Both POs and manual orders eligible for GRN
 *   - 'my-grns': GRNs raised by the vendor
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const vendorId = searchParams.get('vendorId')
    const type = searchParams.get('type') || 'my-grns'

    if (!vendorId) {
      return NextResponse.json(
        { error: 'Vendor ID is required' },
        { status: 400 }
      )
    }

    if (type === 'eligible') {
      // Get POs eligible for GRN creation (PR→PO workflow only)
      const eligiblePOs = await getPOsEligibleForGRN(vendorId)
      return NextResponse.json(eligiblePOs)
    } else if (type === 'manual-eligible') {
      // POST-DELIVERY EXTENSION: Get manual orders eligible for GRN creation
      const eligibleOrders = await getManualOrdersEligibleForGRN(vendorId)
      return NextResponse.json(eligibleOrders)
    } else if (type === 'all-eligible') {
      // POST-DELIVERY EXTENSION: Get both POs and manual orders eligible for GRN
      // This provides a unified view for vendors who handle both workflows
      const [eligiblePOs, eligibleOrders] = await Promise.all([
        getPOsEligibleForGRN(vendorId),
        getManualOrdersEligibleForGRN(vendorId)
      ])
      
      // Combine and mark the source type for each
      const allEligible = [
        ...eligiblePOs.map(po => ({ ...po, sourceType: 'PR_PO' as const })),
        ...eligibleOrders.map(order => ({ ...order, sourceType: 'MANUAL' as const }))
      ]
      
      // Sort by delivery date (most recent first)
      allEligible.sort((a, b) => {
        const dateA = new Date(a.deliveryDate || 0).getTime()
        const dateB = new Date(b.deliveryDate || 0).getTime()
        return dateB - dateA
      })
      
      return NextResponse.json(allEligible)
    } else {
      // Get GRNs raised by vendor (includes both PR_PO and MANUAL GRNs)
      const grns = await getGRNsByVendor(vendorId)
      return NextResponse.json(grns)
    }
  } catch (error: any) {
    console.error('API Error in /api/vendor/grns GET:', error)
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
 * POST /api/vendor/grns
 * Create GRN by vendor
 * 
 * Supports two workflows:
 * 1. PR→PO workflow: Requires poNumber (standard flow)
 * 2. Manual order workflow: Requires orderId instead of poNumber (POST-DELIVERY EXTENSION)
 * 
 * Request body:
 * - For PR→PO: { poNumber, grnNumber, grnDate, vendorId, remarks? }
 * - For Manual: { orderId, grnNumber, grnDate, vendorId, remarks?, sourceType: 'MANUAL' }
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

    const { poNumber, orderId, grnNumber, grnDate, vendorId, remarks, sourceType } = body

    // Common validations
    if (!grnNumber || !grnNumber.trim()) {
      return NextResponse.json(
        { error: 'GRN Number is required' },
        { status: 400 }
      )
    }

    if (!grnDate) {
      return NextResponse.json(
        { error: 'GRN Date is required' },
        { status: 400 }
      )
    }

    if (!vendorId) {
      return NextResponse.json(
        { error: 'Vendor ID is required' },
        { status: 400 }
      )
    }

    // Parse GRN date
    const grnDateObj = new Date(grnDate)

    // ==========================================================================
    // POST-DELIVERY EXTENSION: Handle Manual Order GRN creation
    // If orderId is provided (with sourceType='MANUAL' or without poNumber),
    // use the manual order GRN creation flow
    // ==========================================================================
    if (orderId && (sourceType === 'MANUAL' || !poNumber)) {
      console.log('[API /vendor/grns POST] Creating GRN for Manual Order:', {
        orderId: orderId.trim(),
        grnNumber: grnNumber.trim(),
        grnDate: grnDateObj.toISOString(),
        vendorId,
        sourceType: 'MANUAL'
      })

      const grn = await createGRNForManualOrder(
        orderId.trim(),
        grnNumber.trim(),
        grnDateObj,
        vendorId,
        remarks?.trim()
      )

      console.log('[API /vendor/grns POST] Manual Order GRN created successfully')
      return NextResponse.json(grn, { status: 201 })
    }

    // ==========================================================================
    // Standard PR→PO GRN creation (existing flow)
    // ==========================================================================
    if (!poNumber || !poNumber.trim()) {
      return NextResponse.json(
        { error: 'PO Number is required for PR→PO workflow. For manual orders, provide orderId with sourceType="MANUAL"' },
        { status: 400 }
      )
    }

    console.log('[API /vendor/grns POST] Creating GRN by vendor:', {
      poNumber: poNumber.trim(),
      grnNumber: grnNumber.trim(),
      grnDate: grnDateObj.toISOString(),
      vendorId
    })

    // Create GRN
    const grn = await createGRNByVendor(
      poNumber.trim(),
      grnNumber.trim(),
      grnDateObj,
      vendorId,
      remarks?.trim()
    )

    console.log('[API /vendor/grns POST] GRN created successfully')
    return NextResponse.json(grn, { status: 201 })
  } catch (error: any) {
    console.error('API Error in /api/vendor/grns POST:', error)
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
