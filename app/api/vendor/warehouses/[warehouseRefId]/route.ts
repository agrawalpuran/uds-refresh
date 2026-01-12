import { NextResponse } from 'next/server'
import {
  getVendorWarehouseById,
  updateVendorWarehouse,
  deleteVendorWarehouse,
} from '@/lib/db/vendor-warehouse-access'

/**
 * Helper to get vendor ID from request
 */
function getVendorIdFromRequest(request: Request): string | null {
  // Try to get from URL params
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
 * GET /api/vendor/warehouses/[warehouseRefId]
 * Get warehouse by ID (only if it belongs to the authenticated vendor)
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(
  request: Request,
  { params }: { params: Promise<{ warehouseRefId: string }> }
) {
  try {
    const resolvedParams = await params
    const warehouseRefId = resolvedParams.warehouseRefId
    const vendorId = getVendorIdFromRequest(request)

    if (!warehouseRefId) {
      return NextResponse.json(
        { error: 'warehouseRefId is required' },
        { status: 400 }
      )
    }

    if (!vendorId) {
      return NextResponse.json(
        { error: 'Vendor ID is required. Please ensure you are logged in as a vendor.' },
        { status: 401 }
      )
    }

    const warehouse = await getVendorWarehouseById(warehouseRefId)

    if (!warehouse) {
      return NextResponse.json(
        { error: 'Warehouse not found' },
        { status: 404 }
      )
    }

    // Security: Ensure warehouse belongs to the authenticated vendor
    if (warehouse.vendorId !== vendorId) {
      return NextResponse.json(
        { error: 'Access denied. This warehouse does not belong to your vendor account.' },
        { status: 403 }
      )
    }

    return NextResponse.json({ warehouse })
  } catch (error: any) {
    console.error('API Error in /api/vendor/warehouses/[warehouseRefId] GET:', error)
    console.error('API Error in /api/vendor/warehouses/[warehouseRefId] GET:', error)
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
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || 
        errorMessage.includes('Not found') || 
        errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    
    // Return 401 for authentication errors
    if (errorMessage.includes('Unauthorized') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('token')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
      )
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/vendor/warehouses/[warehouseRefId]
 * Update warehouse (only if it belongs to the authenticated vendor)
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ warehouseRefId: string }> }
) {
  try {
    const resolvedParams = await params
    const warehouseRefId = resolvedParams.warehouseRefId
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    }
    const vendorId = getVendorIdFromRequest(request)

    if (!warehouseRefId) {
      return NextResponse.json(
        { error: 'warehouseRefId is required' },
        { status: 400 }
      )

    }
    if (!vendorId) {
      return NextResponse.json(
        { error: 'Vendor ID is required. Please ensure you are logged in as a vendor.' },
        { status: 401 }
      )

    // Verify warehouse exists and belongs to vendor
    const existingWarehouse = await getVendorWarehouseById(warehouseRefId)
    if (!existingWarehouse) {
      return NextResponse.json(
        { error: 'Warehouse not found' },
        { status: 404 }
      )

    }
    if (existingWarehouse.vendorId !== vendorId) {
      return NextResponse.json(
        { error: 'Access denied. This warehouse does not belong to your vendor account.' },
        { status: 403 }
      )

    // Validate pincode if provided
    if (body.pincode && !/^\d{6}$/.test(body.pincode)) {
      return NextResponse.json(
        { error: 'Pincode must be exactly 6 digits' },
        { status: 400 }
      )

    const warehouse = await updateVendorWarehouse(
      warehouseRefId,
      body,
      'vendor' // Mark as updated by vendor
    )

    return NextResponse.json({ warehouse })
  } catch (error: any) {
    console.error('API Error in /api/vendor/warehouses/[warehouseRefId] PUT:', error)
    console.error('API Error in /api/vendor/warehouses/[warehouseRefId] PUT:', error)
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
 * DELETE /api/vendor/warehouses/[warehouseRefId]
 * Delete warehouse (only if it belongs to the authenticated vendor)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ warehouseRefId: string }> }
) {
  try {
    const resolvedParams = await params
    const warehouseRefId = resolvedParams.warehouseRefId
    const vendorId = getVendorIdFromRequest(request)

    if (!warehouseRefId) {
      return NextResponse.json(
        { error: 'warehouseRefId is required' },
        { status: 400 }
      )

    }
    if (!vendorId) {
      return NextResponse.json(
        { error: 'Vendor ID is required. Please ensure you are logged in as a vendor.' },
        { status: 401 }
      )
    }

    // Verify warehouse exists and belongs to vendor
    const existingWarehouse = await getVendorWarehouseById(warehouseRefId)
    if (!existingWarehouse) {
      return NextResponse.json(
        { error: 'Warehouse not found' },
        { status: 404 }
      )
    }

    if (existingWarehouse.vendorId !== vendorId) {
      return NextResponse.json(
        { error: 'Access denied. This warehouse does not belong to your vendor account.' },
        { status: 403 }
      )
    }

    await deleteVendorWarehouse(warehouseRefId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('API Error in /api/vendor/warehouses/[warehouseRefId] DELETE:', error)
    console.error('API Error in /api/vendor/warehouses/[warehouseRefId] DELETE:', error)
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
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || 
        errorMessage.includes('Not found') || 
        errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    
    // Return 401 for authentication errors
    if (errorMessage.includes('Unauthorized') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('token')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
      )
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

