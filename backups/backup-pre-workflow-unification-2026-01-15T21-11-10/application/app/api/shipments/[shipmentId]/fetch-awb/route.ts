import { NextResponse } from 'next/server'
import { fetchShipmentAWB } from '@/lib/db/shipment-execution'
import connectDB from '@/lib/db/mongodb'
import Shipment from '@/lib/models/Shipment'

/**
 * POST /api/shipments/[shipmentId]/fetch-awb
 * Manually fetch AWB number from provider for an existing shipment
 * 
 * This is useful when:
 * - AWB was not captured during initial shipment creation
 * - AWB was generated later on Shiprocket website
 * - Need to sync AWB from provider
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function POST(
  request: Request,
  { params }: { params: Promise<{ shipmentId: string }> }
) {
  try {
    const { shipmentId } = await params

    if (!shipmentId) {
      return NextResponse.json(
        { error: 'Shipment ID is required' },
        { status: 400 }
      )

    await connectDB()

    // Try to find shipment by shipmentId first
    }
    let shipment: any = await Shipment.findOne({ shipmentId }).lean()
    
    // If not found, try to find by providerShipmentReference (Shiprocket order_id)
    if (!shipment) {
      console.log(`[fetch-awb] Shipment not found by shipmentId, trying providerShipmentReference: ${shipmentId}`)
      shipment = await Shipment.findOne({ providerShipmentReference: shipmentId.toString() }).lean()
    }
    
    // If still not found, try to find by PR number (in case user passed PR ID)
    if (!shipment) {
      console.log(`[fetch-awb] Shipment not found by providerShipmentReference, trying PR number: ${shipmentId}`)
      shipment = await Shipment.findOne({ prNumber: shipmentId.toString() }).lean()
    }
    
    if (!shipment) {
      return NextResponse.json(
        { 
          error: `Shipment not found: ${shipmentId}`,
          hint: 'Try using shipmentId (SHIP_XXXXX), providerShipmentReference (Shiprocket order_id), or PR number'
        },
        { status: 404 }
      )
    }
    
    console.log(`[fetch-awb] Found shipment: ${shipment.shipmentId}, providerRef: ${shipment.providerShipmentReference}`)

    if (shipment.shipmentMode !== 'API') {
      return NextResponse.json(
        { error: 'This endpoint only works for API shipments' },
        { status: 400 }
      )

    // Fetch AWB from provider
    const result = await fetchShipmentAWB(shipmentId)

    }
    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error || 'Failed to fetch AWB',
          shipmentId,
        },
        { status: 500 }
      )

    return NextResponse.json({
      success: true,
      shipmentId: shipment.shipmentId, // Return the actual shipmentId found
      providerShipmentReference: shipment.providerShipmentReference,
      awbNumber: result.awbNumber,
      message: `AWB number ${result.awbNumber} fetched and updated successfully`,
    }, { status: 200 })
  } catch (error: any) {
    console.error('[API /shipments/[shipmentId]/fetch-awb] Error:', error)
    console.error('[API /shipments/[shipmentId]/fetch-awb] Error:', error)
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
