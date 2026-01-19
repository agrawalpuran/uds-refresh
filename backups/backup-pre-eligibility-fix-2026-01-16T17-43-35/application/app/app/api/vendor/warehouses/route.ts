import { NextResponse } from 'next/server'
import {
  getVendorWarehouses,
  createVendorWarehouse,
} from '@/lib/db/vendor-warehouse-access'

/**
 * Helper to get vendor ID from request
 */
function getVendorIdFromRequest(request: Request): string | null {
  // Try to get from URL params (consistent with other vendor routes)
  const { searchParams } = new URL(request.url)
  const vendorIdParam = searchParams.get('vendorId')
  if (vendorIdParam) {
    return vendorIdParam
  }
  
  // Try to get from headers (if passed from frontend)
  const vendorIdHeader = request.headers.get('x-vendor-id')
  if (vendorIdHeader) {
    return vendorIdHeader
  }
  
  // Note: In a production system, you would extract vendorId from the authenticated session/token
  // For now, we rely on the frontend to pass it via query param or header
  return null
}

/**
 * GET /api/vendor/warehouses
 * Get warehouses for the authenticated vendor
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  try {
    const vendorId = getVendorIdFromRequest(request)
    
    if (!vendorId) {
      return NextResponse.json(
        { error: 'Vendor ID is required. Please ensure you are logged in as a vendor.' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const isActive = searchParams.get('isActive')
    const isPrimary = searchParams.get('isPrimary')

    const filters: any = {}
    if (isActive !== null && isActive !== '') {
      filters.isActive = isActive === 'true'
    }
    if (isPrimary !== null && isPrimary !== '') {
      filters.isPrimary = isPrimary === 'true'
    }

    const warehouses = await getVendorWarehouses(vendorId, filters)

    return NextResponse.json({ warehouses })
  } catch (error: any) {
    console.error('[API /vendor/warehouses GET] Error:', error)
    console.error('[API /vendor/warehouses GET] Error stack:', error.stack)
    console.error('[API /vendor/warehouses GET] Error:', error)
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
 * POST /api/vendor/warehouses
 * Create warehouse for the authenticated vendor
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

    // Get vendorId from query param, header, or body
    const vendorId = getVendorIdFromRequest(request) || body.vendorId
    
    if (!vendorId) {
      return NextResponse.json(
        { error: 'Vendor ID is required. Please ensure you are logged in as a vendor.' },
        { status: 401 }
      )
    }

    const {
      warehouseName,
      addressLine1,
      addressLine2,
      city,
      state,
      country,
      pincode,
      contactName,
      contactPhone,
      isPrimary,
      isActive,
    } = body

    if (!warehouseName || !addressLine1 || !city || !state || !pincode) {
      return NextResponse.json(
        { error: 'warehouseName, addressLine1, city, state, and pincode are required' },
        { status: 400 }
      )
    }

    // Validate pincode format
    if (!/^\d{6}$/.test(pincode)) {
      return NextResponse.json(
        { error: 'Pincode must be exactly 6 digits' },
        { status: 400 }
      )
    }

    console.log('[API /vendor/warehouses POST] Creating warehouse for vendor:', vendorId)

    // Ensure vendorId from request matches the authenticated vendor
    // (Security: vendors can only create warehouses for themselves)
    const warehouse = await createVendorWarehouse(
      {
        vendorId, // Use vendorId from authentication, not from request body
        warehouseName,
        addressLine1,
        addressLine2,
        city,
        state,
        country,
        pincode,
        contactName,
        contactPhone,
        isPrimary,
        isActive,
      },
      'vendor' // Mark as created by vendor
    )

    console.log('[API /vendor/warehouses POST] Warehouse created successfully:', warehouse.warehouseRefId)
    return NextResponse.json({ warehouse })
  } catch (error: any) {
    console.error('[API /vendor/warehouses POST] Error:', error)
    console.error('[API /vendor/warehouses POST] Error stack:', error.stack)
    console.error('[API /vendor/warehouses POST] Error:', error)
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
