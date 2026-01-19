
import { NextResponse } from 'next/server'
import {
  getVendorWarehouses,
  createVendorWarehouse,
} from '@/lib/db/vendor-warehouse-access'

/**
 * GET /api/superadmin/vendor-warehouses
 * Get vendor warehouses (with optional filters)
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const vendorId = searchParams.get('vendorId')
    const isActive = searchParams.get('isActive')
    const isPrimary = searchParams.get('isPrimary')

    if (!vendorId) {
      return NextResponse.json(
        { error: 'vendorId is required' },
        { status: 400 }
      )
    }

    const filters: any = {}
    if (isActive !== null) {
      filters.isActive = isActive === 'true'
    }
    if (isPrimary !== null) {
      filters.isPrimary = isPrimary === 'true'
    }

    const warehouses = await getVendorWarehouses(vendorId, filters)

    return NextResponse.json({ warehouses })
  } catch (error: any) {
    console.error('API Error in /api/superadmin/vendor-warehouses GET:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'

    // Return 400 for validation/input errors
    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('Invalid JSON')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

    // Return 404 for not found errors
    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('Not found') ||
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }

    // Return 401 for authentication errors
    if (
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('token')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 401 })
    }

    // Return 500 for server errors
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

/**
 * POST /api/superadmin/vendor-warehouses
 * Create vendor warehouse
 */
export async function POST(request: Request) {
  try {
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const {
      vendorId,
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

    if (!vendorId || !warehouseName || !addressLine1 || !city || !state || !pincode) {
      return NextResponse.json(
        { error: 'vendorId, warehouseName, addressLine1, city, state, and pincode are required' },
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

    const warehouse = await createVendorWarehouse(
      {
        vendorId,
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
      'superadmin'
    )

    return NextResponse.json({ warehouse })
  } catch (error: any) {
    console.error('API Error in /api/superadmin/vendor-warehouses POST:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'

    // Return 400 for validation/input errors
    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('Invalid JSON')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

    // Return 404 for not found errors
    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('Not found') ||
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }

    // Return 401 for authentication errors
    if (
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('token')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 401 })
    }

    // Return 500 for server errors
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
