
import { NextResponse } from 'next/server'
import {
  getAllVendorShippingRoutings,
  createVendorShippingRouting,
  getVendorShippingRouting,
} from '@/lib/db/vendor-shipping-routing-access'
import { getAllShipmentServiceProviders } from '@/lib/db/shipping-config-access'

/**
 * GET /api/superadmin/vendor-shipping-routing
 * Get vendor shipping routings (with optional filters)
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const vendorId = searchParams.get('vendorId')
    const companyId = searchParams.get('companyId')
    const shipmentServiceProviderRefId = searchParams.get('shipmentServiceProviderRefId')
    const isActive = searchParams.get('isActive')

    const filters: any = {}

    if (vendorId) filters.vendorId = vendorId
    if (companyId) filters.companyId = companyId
    if (shipmentServiceProviderRefId) {
      filters.shipmentServiceProviderRefId = parseInt(shipmentServiceProviderRefId, 10)
    }
    if (isActive !== null) {
      filters.isActive = isActive === 'true'
    }

    const routings = await getAllVendorShippingRoutings(filters)

    return NextResponse.json({ routings })

  } catch (error: any) {
    console.error('API Error in /api/superadmin/vendor-shipping-routing GET:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'

    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('Invalid JSON')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('Not found') ||
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }

    if (
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('token')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 401 })
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

/**
 * POST /api/superadmin/vendor-shipping-routing
 * Create vendor shipping routing
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
      companyId,
      shipmentServiceProviderRefId,
      primaryCourierCode,
      secondaryCourierCode,
      isActive,
    } = body

    if (!vendorId || !companyId || !shipmentServiceProviderRefId || !primaryCourierCode) {
      return NextResponse.json(
        {
          error:
            'vendorId, companyId, shipmentServiceProviderRefId, and primaryCourierCode are required',
        },
        { status: 400 }
      )
    }

    const routing = await createVendorShippingRouting(
      {
        vendorId,
        companyId,
        shipmentServiceProviderRefId: parseInt(shipmentServiceProviderRefId, 10),
        primaryCourierCode,
        secondaryCourierCode,
        isActive,
      },
      'superadmin'
    )

    return NextResponse.json({ routing })

  } catch (error: any) {
    console.error('API Error in /api/superadmin/vendor-shipping-routing POST:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'

    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('Invalid JSON')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('Not found') ||
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }

    if (
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('token')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 401 })
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
