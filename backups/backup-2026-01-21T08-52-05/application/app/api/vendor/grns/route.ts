import { NextResponse } from 'next/server'
import { getPOsEligibleForGRN, createGRNByVendor, getGRNsByVendor } from '@/lib/db/data-access'
// Ensure models are registered
import '@/lib/models/GRN'
import '@/lib/models/PurchaseOrder'
import '@/lib/models/POOrder'
import '@/lib/models/Order'

/**
 * GET /api/vendor/grns
 * Get GRNs raised by vendor OR get POs eligible for GRN
 * Query params:
 * - vendorId: Vendor ID (required)
 * - type: 'eligible' | 'my-grns' (default: 'my-grns')
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
      // Get POs eligible for GRN creation
      const eligiblePOs = await getPOsEligibleForGRN(vendorId)
      return NextResponse.json(eligiblePOs)
    } else {
      // Get GRNs raised by vendor
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

    const { poNumber, grnNumber, grnDate, vendorId, remarks } = body

    // Validate required fields
    if (!poNumber || !poNumber.trim()) {
      return NextResponse.json(
        { error: 'PO Number is required' },
        { status: 400 }
      )
    }

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
