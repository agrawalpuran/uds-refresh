import { NextResponse } from 'next/server'
import {
  getVendorWarehouseById,
  updateVendorWarehouse,
  deleteVendorWarehouse,
} from '@/lib/db/vendor-warehouse-access'

/**
 * GET /api/superadmin/vendor-warehouses/[warehouseRefId]
 * Get vendor warehouse by ID
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

    if (!warehouseRefId) {
      return NextResponse.json(
        { error: 'warehouseRefId is required' },
        { status: 400 }
      )

    const warehouse = await getVendorWarehouseById(warehouseRefId)

    }
    if (!warehouse) {
      return NextResponse.json(
        { error: 'Warehouse not found' },
        { status: 404 }
      )

    return NextResponse.json({ warehouse })
  } catch (error) {
    const err = error as any;
    console.error('API Error in /api/superadmin/vendor-warehouses/[warehouseRefId] GET:', error)
    console.error('API Error in /api/superadmin/vendor-warehouses/[warehouseRefId] GET:', error)
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
 * PUT /api/superadmin/vendor-warehouses/[warehouseRefId]
 * Update vendor warehouse
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
    } catch (jsonError) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })

    if (!warehouseRefId) {
      return NextResponse.json(
        { error: 'warehouseRefId is required' },
        { status: 400 }
      )

    // Validate pincode if provided
    }
    if (body.pincode && !/^\d{6}$/.test(body.pincode)) {
      return NextResponse.json(
        { error: 'Pincode must be exactly 6 digits' },
        { status: 400 }
      )

    const warehouse = await updateVendorWarehouse(
      warehouseRefId,
      body,
      'superadmin'
    )

    return NextResponse.json({ warehouse })
  } catch (error) {
    const err = error as any;
    console.error('API Error in /api/superadmin/vendor-warehouses/[warehouseRefId] PUT:', error)
    console.error('API Error in /api/superadmin/vendor-warehouses/[warehouseRefId] PUT:', error)
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
 * DELETE /api/superadmin/vendor-warehouses/[warehouseRefId]
 * Delete vendor warehouse
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ warehouseRefId: string }> }
) {
  try {
    const resolvedParams = await params
    const warehouseRefId = resolvedParams.warehouseRefId

    if (!warehouseRefId) {
      return NextResponse.json(
        { error: 'warehouseRefId is required' },
        { status: 400 }
      )

    await deleteVendorWarehouse(warehouseRefId)

    return NextResponse.json({ success: true })
  } catch (error) {
    const err = error as any;
    console.error('API Error in /api/superadmin/vendor-warehouses/[warehouseRefId] DELETE:', error)
    console.error('API Error in /api/superadmin/vendor-warehouses/[warehouseRefId] DELETE:', error)
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
}}}}}}}}}}}}}
