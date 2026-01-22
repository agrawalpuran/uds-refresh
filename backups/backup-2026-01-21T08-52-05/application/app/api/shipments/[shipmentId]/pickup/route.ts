import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import Shipment from '@/lib/models/Shipment'
import ShipmentPickup from '@/lib/models/ShipmentPickup'
import VendorWarehouse from '@/lib/models/VendorWarehouse'
import ShipmentServiceProvider from '@/lib/models/ShipmentServiceProvider'

/**
 * GET /api/shipments/[shipmentId]/pickup
 * Get pickup details for a shipment
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(
  request: Request,
  { params }: { params: Promise<{ shipmentId: string }> }
) {
  try {
    const { shipmentId } = await params

    await connectDB()

    // Find shipment
    const shipment = await Shipment.findOne({ shipmentId }).lean()
    if (!shipment) {
      return NextResponse.json(
        { error: `Shipment ${shipmentId} not found` },
        { status: 404 }
      )

    // Get latest pickup record
    }
    const latestPickup = await ShipmentPickup.findOne({ shipmentId })
      .sort({ createdAt: -1 })
      .lean()

    // Get all pickup history (for timeline)
    const pickupHistory = await ShipmentPickup.find({ shipmentId })
      .sort({ createdAt: -1 })
      .lean()

    // Get warehouse information if available
    let warehouse = null
    if (latestPickup?.warehouseId) {
      warehouse = await VendorWarehouse.findOne({ 
        warehouseRefId: latestPickup.warehouseId,
        vendorId: shipment.vendorId,
      }).lean()
    }

    // Get provider information
    let provider = null
    if (shipment.providerId) {
      provider = await ShipmentServiceProvider.findOne({ 
        providerId: shipment.providerId 
      }).lean()
    }

    return NextResponse.json({
      success: true,
      shipment: {
        shipmentId: shipment.shipmentId,
        shipmentMode: shipment.shipmentMode,
        awbNumber: shipment.courierAwbNumber || shipment.trackingNumber,
        courierProviderCode: shipment.courierProviderCode,
        shipmentStatus: shipment.shipmentStatus,
      },
      latestPickup: latestPickup ? {
        pickupId: latestPickup.shipmentPickupId,
        pickupStatus: latestPickup.pickupStatus,
        pickupDate: latestPickup.pickupDate,
        pickupTimeSlot: latestPickup.pickupTimeSlot,
        pickupReferenceId: latestPickup.pickupReferenceId,
        contactName: latestPickup.contactName,
        contactPhone: latestPickup.contactPhone,
        createdAt: latestPickup.createdAt,
      } : null,
      pickupHistory: pickupHistory.map(p => ({
        pickupId: p.shipmentPickupId,
        pickupStatus: p.pickupStatus,
        pickupDate: p.pickupDate,
        pickupTimeSlot: p.pickupTimeSlot,
        createdAt: p.createdAt,
      })),
      warehouse: warehouse ? {
        warehouseId: warehouse.warehouseRefId,
        warehouseName: warehouse.warehouseName,
        address: {
          addressLine1: warehouse.addressLine1,
          addressLine2: warehouse.addressLine2,
          city: warehouse.city,
          state: warehouse.state,
          pincode: warehouse.pincode,
        },
        contactName: warehouse.contactName,
        contactPhone: warehouse.contactPhone,
      } : null,
      provider: provider ? {
        providerCode: provider.providerCode,
        providerName: provider.providerName,
      } : null,
    }, { status: 200 })

  } catch (error) {
    const err = error as any;
    console.error('[API /shipments/[shipmentId]/pickup] Error:', error)
    console.error('[API /shipments/[shipmentId]/pickup] Error:', error)
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
}}}}
