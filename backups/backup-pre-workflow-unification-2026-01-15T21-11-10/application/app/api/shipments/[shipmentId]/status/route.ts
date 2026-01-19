import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import { updateManualShipmentStatus } from '@/lib/db/data-access'
// Ensure models are registered
import '@/lib/models/Shipment'
import '@/lib/models/Order'
import '@/lib/models/POOrder'
import '@/lib/models/PurchaseOrder'

/**
 * PUT /api/shipments/[shipmentId]/status
 * Update manual shipment status to "Shipped" (IN_TRANSIT) and trigger cascading updates
 */
export const dynamic = 'force-dynamic'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ shipmentId: string }> }
) {
  try {
    await connectDB()
    
    const { shipmentId } = await params
    
    // Parse JSON body
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    }
    
    const { vendorId, status } = body
    
    // Validate required fields
    if (!vendorId) {
      return NextResponse.json(
        { error: 'vendorId is required' },
        { status: 400 }
      )
    }
    
    // Validate status (currently only support marking as "shipped" which maps to IN_TRANSIT)
    if (status && status !== 'IN_TRANSIT' && status !== 'shipped' && status !== 'Shipped') {
      return NextResponse.json(
        { error: `Status "${status}" is not supported. Only "shipped" (IN_TRANSIT) is currently supported for manual shipments.` },
        { status: 400 }
      )
    }
    
    console.log('[API /shipments/[shipmentId]/status PUT] Updating manual shipment status:', {
      shipmentId,
      vendorId,
      requestedStatus: status || 'shipped (default)'
    })
    
    // Update shipment status and trigger cascading updates
    const result = await updateManualShipmentStatus(shipmentId, vendorId)
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to update shipment status' },
        { status: 400 }
      )
    }
    
    console.log('[API /shipments/[shipmentId]/status PUT] Shipment status updated successfully:', {
      shipmentId,
      prUpdated: result.prUpdated,
      poUpdated: result.poUpdated
    })
    
    return NextResponse.json({
      success: true,
      shipment: result.shipment,
      prUpdated: result.prUpdated,
      poUpdated: result.poUpdated,
    }, { status: 200 })
  } catch (error: any) {
    console.error('[API /shipments/[shipmentId]/status PUT] Error:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('Invalid JSON') ||
        errorMessage.includes('not authorized') ||
        errorMessage.includes('not found')) {
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
