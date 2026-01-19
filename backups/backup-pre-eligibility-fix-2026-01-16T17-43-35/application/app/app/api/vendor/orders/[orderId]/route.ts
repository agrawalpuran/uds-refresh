import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import Order from '@/lib/models/Order'
import Shipment from '@/lib/models/Shipment'
import POOrder from '@/lib/models/POOrder'
import PurchaseOrder from '@/lib/models/PurchaseOrder'
import Employee from '@/lib/models/Employee'
import Company from '@/lib/models/Company'
import Uniform from '@/lib/models/Uniform'

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
    }

    await connectDB()

    // Find order and verify vendor authorization
    const order = await Order.findOne({ id: orderId, vendorId }).lean()
    
    // Manually populate employeeId, companyId, and items.uniformId since populate doesn't work with string IDs
    if (order) {
      if (order.employeeId) {
        const employee = await Employee.findOne({ id: order.employeeId }).select('id firstName lastName email').lean()
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
      if (order.items && Array.isArray(order.items)) {
        for (const item of order.items) {
          if (item.uniformId) {
            const uniform = await Uniform.findOne({ id: item.uniformId }).select('id name').lean()
            if (uniform) {
              (item as any).uniformId = uniform
            }
          }
        }
      }
    }

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found or access denied' },
        { status: 404 }
      )
    }

    // Find PO(s) for this order via POOrder mapping - use string IDs
    const poOrderMappings = await POOrder.find({ order_id: order.id })
      .lean()

    let poNumber: string | null = null
    let poDate: Date | null = null
    let allPRs: any[] = [order] // Start with the current order

    if (poOrderMappings.length > 0) {
      // Get the first PO ID (primary PO)
      const primaryPOId = poOrderMappings[0].purchase_order_id
      
      // Manually fetch PurchaseOrder using string ID
      if (primaryPOId) {
        const primaryPO = await PurchaseOrder.findOne({ id: primaryPOId })
          .select('id client_po_number po_date')
          .lean()
        
        if (primaryPO) {
          poNumber = primaryPO.client_po_number || null
          poDate = primaryPO.po_date ? new Date(primaryPO.po_date) : null

          // Find all other orders (PRs) under the same PO - use string IDs
          const allPOOrderMappings = await POOrder.find({ purchase_order_id: primaryPOId })
            .lean()

          // Extract order string IDs
          const allOrderIds = allPOOrderMappings
            .map((m: any) => {
              if (m.order_id) {
                // order_id is already a string ID
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

