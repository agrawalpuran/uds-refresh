import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import Shipment from '@/lib/models/Shipment'

/**
 * GET /api/shipments/query
 * Query shipments to find AWB numbers
 * 
 * Query params:
 * - shipmentId: Shipment ID
 * - prNumber: PR Number
 * - vendorId: Vendor ID
 * - limit: Number of results (default: 10)
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const shipmentId = searchParams.get('shipmentId')
    const prNumber = searchParams.get('prNumber')
    const vendorId = searchParams.get('vendorId')
    const limit = parseInt(searchParams.get('limit') || '10', 10)

    await connectDB()

    let query: any = {}
    if (shipmentId) {
      query.shipmentId = shipmentId
    }
    if (prNumber) {
      query.prNumber = prNumber
    }
    if (vendorId) {
      query.vendorId = vendorId
    }

    const shipments = await Shipment.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()

    return NextResponse.json({
      success: true,
      count: shipments.length,
      shipments: shipments.map(s => ({
        shipmentId: s.shipmentId,
        prNumber: s.prNumber,
        vendorId: s.vendorId,
        shipmentMode: s.shipmentMode,
        shipmentStatus: s.shipmentStatus,
        providerId: s.providerId,
        companyShippingProviderId: s.companyShippingProviderId,
        providerShipmentReference: s.providerShipmentReference,
        trackingNumber: s.trackingNumber,
        trackingUrl: s.trackingUrl,
        // Courier AWB data
        courierAwbNumber: s.courierAwbNumber || null,
        courierProviderCode: s.courierProviderCode || null,
        courierStatus: s.courierStatus || null,
        courierTrackingUrl: s.courierTrackingUrl || null,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
    }, { status: 200 })
  } catch (error) {
    const err = error as any;
    console.error('[API /shipments/query] Error:', error)
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
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || errorMessage.includes('Not found') || errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}}}
