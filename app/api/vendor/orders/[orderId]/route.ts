import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import Order from '@/lib/models/Order'
import Shipment from '@/lib/models/Shipment'
import POOrder from '@/lib/models/POOrder'

/**
 * GET /api/vendor/orders/[orderId]
 * Get order details with shipment information for vendor
 * Returns all PRs (orders) under the same PO for PO-centric view
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params
    const { searchParams } = new URL(request.url)
    const vendorId = searchParams.get('vendorId')

    if (!vendorId) {
      return NextResponse.json(
        { error: 'Vendor ID is required' },
        { status: 400 }
      )

    await connectDB()

    // Find order and verify vendor authorization
    }
    const order = await Order.findOne({ id: orderId, vendorId })
      .populate('employeeId', 'id firstName lastName email')
      .populate('companyId', 'id name')
      .populate('items.uniformId', 'id name')
      .lean()

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found or access denied' },
        { status: 404 }
      )

    // Find PO(s) for this order via POOrder mapping - use string IDs
    }
    const poOrderMappings = await POOrder.find({ order_id: order.id })
      .populate('purchase_order_id', 'id client_po_number po_date')
      .lean()

    let poNumber: string | null = null
    let poDate: Date | null = null
    let allPRs: any[] = [order] // Start with the current order

    if (poOrderMappings.length > 0) {
      // Use the first PO (primary PO)
      const primaryPO = poOrderMappings[0].purchase_order_id as any
      poNumber = primaryPO?.client_po_number || null
      poDate = primaryPO?.po_date ? new Date(primaryPO.po_date) : null

      // Find all other orders (PRs) under the same PO - use string IDs
      if (primaryPO?.id) {
        const allPOOrderMappings = await POOrder.find({ purchase_order_id: primaryPO.id })
          .populate('order_id', 'id')
          .lean()

        // Extract order string IDs
        const allOrderIds = allPOOrderMappings
          .map((m: any) => {
            if (m.order_id) {
              // If populated, use id from the document
              if (typeof m.order_id === 'object' && m.order_id.id) {
                return m.order_id.id
              }
              // If it's already a string, use it directly
              return String(m.order_id)
            }
            return null
          })
          .filter(Boolean)

        if (allOrderIds.length > 0) {
          // Fetch all orders (PRs) for this PO, ensuring they belong to the same vendor - use string IDs
          const allOrdersForPO = await Order.find({
            id: { $in: allOrderIds },
            vendorId: vendorId
          })
            .populate('employeeId', 'id firstName lastName email')
            .populate('companyId', 'id name')
            .populate('items.uniformId', 'id name')
            .lean()

          allPRs = allOrdersForPO
        }
      }
    }

    // Fetch shipments for all PRs
    const shipmentsMap = new Map<string, any>()
    for (const pr of allPRs) {
      let shipment = null
      if (pr.shipmentId) {
        shipment = await Shipment.findOne({ shipmentId: pr.shipmentId }).lean()
      } else if (pr.pr_number) {
        shipment = await Shipment.findOne({ prNumber: pr.pr_number, vendorId }).lean()
      }
      if (shipment) {
        shipmentsMap.set(pr.id, shipment)
      }
    }

    return NextResponse.json({
      success: true,
      poNumber,
      poDate,
      prs: allPRs.map((pr: any) => ({
        ...pr,
        shipment: shipmentsMap.get(pr.id) || null
      })),
      // Keep backward compatibility - return first PR as 'order' and its shipment
      order: allPRs[0],
      shipment: shipmentsMap.get(allPRs[0].id) || null,
    }, { status: 200 })
  } catch (error: any) {
    console.error('[API /vendor/orders/[orderId]] Error:', error)
    console.error('[API /vendor/orders/[orderId]] Error:', error)
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

