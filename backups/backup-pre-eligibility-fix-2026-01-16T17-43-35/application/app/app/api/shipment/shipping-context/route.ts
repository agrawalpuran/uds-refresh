import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import Company from '@/lib/models/Company'
import { getActiveVendorRoutingForCompany } from '@/lib/db/vendor-shipping-routing-access'
import { getPrimaryVendorWarehouse } from '@/lib/db/vendor-warehouse-access'

/**
 * GET /api/shipment/shipping-context
 * Resolves shipping context for a company and vendor
 * Returns: shipping mode, routing info, courier details, pincodes
 * 
 * Query parameters:
 * - companyId (required): Company ID
 * - vendorId (required): Vendor ID
 * - destinationPincode (optional): Destination pincode (if not provided, will be null)
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const vendorId = searchParams.get('vendorId')
    const destinationPincode = searchParams.get('destinationPincode') || null

    if (!companyId || !vendorId) {
      return NextResponse.json(
        { error: 'companyId and vendorId are required' },
        { status: 400 }
      )
    }

    await connectDB()

    // Get company to check shipmentRequestMode
    const company = await Company.findOne({ id: companyId })
      .select('shipmentRequestMode name')
      .lean()

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      )
    }

    // Ensure company is a single document (not an array)
    const companyDoc = Array.isArray(company) ? company[0] : company

    // Resolve shipping mode (source of truth)
    // Priority: 1. VendorShippingRouting.shipmentMode (if present), 2. Company.shipmentRequestMode, 3. Default MANUAL
    const shippingMode = (companyDoc as any)?.shipmentRequestMode || 'MANUAL'

    // Get vendor routing if AUTOMATIC mode
    let vendorRouting = null
    let hasRouting = false
    let primaryCourier = null
    let secondaryCourier = null

    if (shippingMode === 'AUTOMATIC') {
      vendorRouting = await getActiveVendorRoutingForCompany(vendorId, companyId)
      hasRouting = !!vendorRouting
    }
    
    if (vendorRouting) {
      primaryCourier = {
        code: vendorRouting.primaryCourierCode,
        name: null, // Will be resolved from provider couriers
      }
      if (vendorRouting.secondaryCourierCode) {
        secondaryCourier = {
          code: vendorRouting.secondaryCourierCode,
          name: null,
        }
      }
    }

    // Get source pincode (from primary warehouse)
    const primaryWarehouse = await getPrimaryVendorWarehouse(vendorId)
    const sourcePincode = primaryWarehouse?.pincode || null

    // Destination pincode is passed from frontend (already resolved from order/location)
    // If not provided, it will be null and UI can handle it appropriately

    // Serviceability will be checked on-demand by the UI
    // We return the pincodes so the UI can trigger serviceability checks

    const response = {
      shippingMode,
      hasRouting,
      primaryCourier,
      secondaryCourier,
      sourcePincode,
      destinationPincode,
      vendorRouting: vendorRouting ? {
        routingId: vendorRouting.routingId,
        primaryCourierCode: vendorRouting.primaryCourierCode,
        secondaryCourierCode: vendorRouting.secondaryCourierCode,
        providerCode: vendorRouting.provider?.providerCode,
        providerName: vendorRouting.provider?.providerName,
      } : null,
      company: {
        id: companyId,
        name: (companyDoc as any)?.name || 'Unknown',
        shipmentRequestMode: (companyDoc as any)?.shipmentRequestMode || 'MANUAL',
      },
      warehouse: primaryWarehouse ? {
        warehouseRefId: primaryWarehouse.warehouseRefId,
        warehouseName: primaryWarehouse.warehouseName,
        pincode: primaryWarehouse.pincode,
        city: primaryWarehouse.city,
        state: primaryWarehouse.state,
      } : null,
    }

    console.log('[shipping-context API] ✅ Successfully resolved shipping context:', {
      companyId,
      vendorId,
      shippingMode,
      hasRouting,
      sourcePincode,
      destinationPincode,
      primaryCourierCode: primaryCourier?.code,
      secondaryCourierCode: secondaryCourier?.code,
    })

    return NextResponse.json(response, { status: 200 })
  } catch (error: any) {
    console.error('[shipping-context API] Error:', error)
    console.error('[shipping-context API] Error:', error)
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