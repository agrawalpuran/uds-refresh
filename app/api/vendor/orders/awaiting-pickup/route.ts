import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import Shipment from '@/lib/models/Shipment'
import ShipmentPickup from '@/lib/models/ShipmentPickup'
import Order from '@/lib/models/Order'
import VendorWarehouse from '@/lib/models/VendorWarehouse'
import Employee from '@/lib/models/Employee'
import Company from '@/lib/models/Company'
import { decrypt } from '@/lib/utils/encryption'

/**
 * GET /api/vendor/orders/awaiting-pickup
 * Get all orders with API shipments that are awaiting pickup scheduling
 * 
 * Criteria:
 * - shipmentMode = 'API'
 * - AWB number exists
 * - No pickup scheduled OR latest pickup status is not PICKED_UP
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const vendorId = searchParams.get('vendorId')

    if (!vendorId) {
      return NextResponse.json(
        { error: 'Vendor ID is required' },
        { status: 400 }
      )
    }

    await connectDB()

    // Find all API shipments for this vendor with AWB
    const shipments = await Shipment.find({
      vendorId: vendorId,
      shipmentMode: 'API',
      $or: [
        { courierAwbNumber: { $exists: true, $nin: [null, ''] } },
        { trackingNumber: { $exists: true, $nin: [null, ''] } },
      ],
    })
      .sort({ createdAt: -1 })
      .lean()

    // Get latest pickup for each shipment
    const shipmentIds = shipments.map(s => s.shipmentId)
    const latestPickups = await ShipmentPickup.aggregate([
      { $match: { shipmentId: { $in: shipmentIds } } },
      { $sort: { createdAt: -1 } },
      { $group: {
        _id: '$shipmentId',
        latestPickup: { $first: '$$ROOT' }
      }},
    ])

    const pickupMap = new Map()
    latestPickups.forEach((item: any) => {
      pickupMap.set(item._id, item.latestPickup)
    })

    // Filter shipments that are awaiting pickup
    // (no pickup OR pickup status is not PICKED_UP)
    const awaitingPickupShipments = shipments.filter(shipment => {
      const latestPickup = pickupMap.get(shipment.shipmentId)
      const awbNumber = shipment.courierAwbNumber || shipment.trackingNumber
      
      // Must have AWB
      if (!awbNumber) return false
      
      // No pickup scheduled OR pickup not PICKED_UP
      return !latestPickup || latestPickup.pickupStatus !== 'PICKED_UP'
    })

    // Get order details for these shipments
    const prNumbers = awaitingPickupShipments.map(s => s.prNumber)
    const orders = await Order.find({
      pr_number: { $in: prNumbers },
      vendorId: vendorId,
    })
      .lean()
    
    // Manually populate employeeId and companyId since populate doesn't work with string IDs
    for (const order of orders) {
      if (order.employeeId) {
        const employee = await Employee.findOne({ id: order.employeeId }).select('id firstName lastName email mobile').lean()
        if (employee) {
          (order as any).employeeId = employee
        }
      }
      if (order.companyId) {
        const company = await Company.findOne({ id: order.companyId }).select('id name').lean()
        if (company) {
          (order as any).companyId = company
        }
      }
    }

    // Get warehouse information
    const warehouseIds = [...new Set(awaitingPickupShipments.map(s => s.warehouseRefId).filter(Boolean))]
    const warehouses = await VendorWarehouse.find({
      warehouseRefId: { $in: warehouseIds },
      vendorId: vendorId,
    }).lean()

    const warehouseMap = new Map()
    warehouses.forEach(w => {
      warehouseMap.set(w.warehouseRefId, w)
    })

    // Combine shipment and order data
    const ordersAwaitingPickup = awaitingPickupShipments.map(shipment => {
      const order = orders.find(o => o.pr_number === shipment.prNumber)
      const latestPickup = pickupMap.get(shipment.shipmentId)
      const warehouse = shipment.warehouseRefId ? warehouseMap.get(shipment.warehouseRefId) : null
      const awbNumber = shipment.courierAwbNumber || shipment.trackingNumber

      return {
        orderId: order?.id || shipment.prNumber,
        prNumber: shipment.prNumber,
        poNumber: shipment.poNumber,
        shipmentId: shipment.shipmentId,
        awbNumber: awbNumber,
        courierProviderCode: shipment.courierProviderCode,
        providerShipmentReference: shipment.providerShipmentReference,
        shipmentStatus: shipment.shipmentStatus,
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
        order: order ? {
          id: order.id,
          pr_number: order.pr_number,
          employeeName: order.employeeName ? decrypt(order.employeeName) : '',
          companyName: order.companyName ? decrypt(order.companyName) : '',
          status: order.status,
          dispatchStatus: order.dispatchStatus,
          dispatchedDate: order.dispatchedDate,
        } : null,
        latestPickup: latestPickup ? {
          pickupId: latestPickup.shipmentPickupId,
          pickupStatus: latestPickup.pickupStatus,
          pickupDate: latestPickup.pickupDate,
          pickupTimeSlot: latestPickup.pickupTimeSlot,
        } : null,
        createdAt: shipment.createdAt,
      }
    })

    return NextResponse.json({
      success: true,
      orders: ordersAwaitingPickup,
      count: ordersAwaitingPickup.length,
    }, { status: 200 })
  } catch (error: any) {
    console.error('[API /vendor/orders/awaiting-pickup] Error:', error)
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
