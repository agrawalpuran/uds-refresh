import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import { updatePRShipmentStatus } from '@/lib/db/data-access'
import { generateShippingId } from '@/lib/db/shipping-config-access'
import { decrementVendorStockOnDispatch } from '@/lib/services/vendor-inventory-service'
// Ensure models are registered
import '@/lib/models/Order'
import '@/lib/models/Shipment'
import '@/lib/models/VendorWarehouse'
import Order from '@/lib/models/Order'
import Shipment from '@/lib/models/Shipment'
import VendorWarehouse from '@/lib/models/VendorWarehouse'

/**
 * POST /api/prs/manual-shipment
 * Create manual shipments for PRs (when company shipment mode = MANUAL)
 * 
 * Body:
 * - vendorId: string (required)
 * - poNumber: string | null (optional, for reference)
 * - warehouseRefId: string | null (optional, warehouse reference)
 * - prs: Array<{
 *     prId: string
 *     prNumber: string
 *     modeOfTransport: 'COURIER' | 'DIRECT' | 'HAND_DELIVERY'
 *     courierServiceProvider?: string (required if modeOfTransport = 'COURIER')
 *     dispatchedDate: string (ISO date string)
 *     shipmentNumber?: string (AWB/docket number)
 *   }>
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    await connectDB()
    
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    }
    
    const { vendorId, poNumber, warehouseRefId, prs } = body

    // Validate required fields
    if (!vendorId) {
      return NextResponse.json(
        { error: 'vendorId is required' },
        { status: 400 }
      )
    }
    
    if (!prs || !Array.isArray(prs) || prs.length === 0) {
      return NextResponse.json(
        { error: 'prs array is required and must not be empty' },
        { status: 400 }
      )
    }

    // Validate each PR data
    for (const pr of prs) {
      if (!pr.prId || !pr.prNumber || !pr.modeOfTransport || !pr.dispatchedDate) {
        return NextResponse.json(
          { error: 'Each PR must have prId, prNumber, modeOfTransport, and dispatchedDate' },
          { status: 400 }
        )
      }
      
      if (pr.modeOfTransport === 'COURIER' && !pr.courierServiceProvider) {
        return NextResponse.json(
          { error: `Courier Service Provider is required for PR ${pr.prNumber} (Mode: COURIER)` },
          { status: 400 }
        )
      }
    }

    // Get warehouse details if warehouseRefId is provided
    let warehouse = null
    if (warehouseRefId) {
      warehouse = await VendorWarehouse.findOne({ warehouseRefId, isActive: true }).lean()
    }

    const createdShipments: any[] = []
    const errors: string[] = []

    // Process each PR
    for (const prData of prs) {
      try {
        // Find the order (PR) by ID
        const order: any = await Order.findOne({ id: prData.prId }).lean()
        if (!order) {
          errors.push(`Order not found: ${prData.prId}`)
          continue
        }

        // Validate vendor authorization - handle both ObjectId and string comparisons
        const orderVendorId = order.vendorId?.toString() || order.vendorId
        const requestVendorId = vendorId?.toString() || vendorId
        if (orderVendorId !== requestVendorId) {
          errors.push(`Vendor ${vendorId} is not authorized for PR ${prData.prNumber} (order vendorId: ${orderVendorId})`)
          continue
        }

        // Check if this is a replacement order
        const isReplacementOrder = order.orderType === 'REPLACEMENT' || !!order.returnRequestId
        
        // Validate status based on order type
        if (isReplacementOrder) {
          // For replacement orders, check dispatchStatus (not just status) to determine if already shipped
          // This handles the case where status was updated but dispatchStatus wasn't
          const dispatchStatus = order.dispatchStatus
          const deliveryStatus = order.deliveryStatus
          const currentStatus = order.status || order.orderStatus
          
          // Only reject if dispatchStatus indicates already shipped/delivered
          if (dispatchStatus === 'SHIPPED' || dispatchStatus === 'IN_TRANSIT' || dispatchStatus === 'DISPATCHED') {
            errors.push(`Replacement order ${prData.prNumber} already shipped (dispatchStatus: ${dispatchStatus})`)
            continue
          }
          if (deliveryStatus === 'DELIVERED' || deliveryStatus === 'FULLY_DELIVERED') {
            errors.push(`Replacement order ${prData.prNumber} already delivered`)
            continue
          }
          // Also reject if cancelled
          if (currentStatus && ['Cancelled', 'CANCELLED'].includes(currentStatus)) {
            errors.push(`Replacement order ${prData.prNumber} is cancelled`)
            continue
          }
          console.log(`[Manual Shipment] Processing REPLACEMENT order ${prData.prNumber} (status: ${currentStatus}, dispatchStatus: ${dispatchStatus || 'N/A'})`)
        } else {
          // Regular PRs must be either:
          // - LINKED_TO_PO (PR-PO workflow: after PO is created)
          // - COMPANY_ADMIN_APPROVED (non-PR-PO workflow: directly after approval)
          // This allows shipping for companies without PR-PO workflow enabled
          const allowedStatuses = ['LINKED_TO_PO', 'COMPANY_ADMIN_APPROVED']
          if (!allowedStatuses.includes(order.unified_pr_status)) {
            errors.push(`PR ${prData.prNumber} is not ready for shipment (current status: ${order.unified_pr_status || 'N/A'}, required: ${allowedStatuses.join(' or ')})`)
            continue
          }
        }

        // Generate shipment ID
        const shipmentId = generateShippingId('SHM')

        // Prepare shipment data
        const dispatchedDate = new Date(prData.dispatchedDate)
        if (isNaN(dispatchedDate.getTime())) {
          errors.push(`Invalid dispatchedDate for PR ${prData.prNumber}`)
          continue
        }

        // Map modeOfTransport to Order format
        // Order uses: 'ROAD' | 'AIR' | 'RAIL' | 'COURIER' | 'OTHER'
        // Manual uses: 'COURIER' | 'DIRECT' | 'HAND_DELIVERY'
        let orderModeOfTransport: 'ROAD' | 'AIR' | 'RAIL' | 'COURIER' | 'OTHER' = 'COURIER'
        if (prData.modeOfTransport === 'COURIER') {
          orderModeOfTransport = 'COURIER'
        } else if (prData.modeOfTransport === 'DIRECT') {
          orderModeOfTransport = 'OTHER' // Direct delivery
        } else if (prData.modeOfTransport === 'HAND_DELIVERY') {
          orderModeOfTransport = 'OTHER' // Hand delivery
        }

        // Create shipment record with all available fields
        // For replacement orders, frontend sends orderId as prNumber (prNumber is required in Shipment model)
        const shipmentData: any = {
          shipmentId,
          prNumber: prData.prNumber, // Always use prNumber (frontend sends orderId for replacement orders)
          poNumber: poNumber || undefined,
          vendorId: String(vendorId),
          shipmentMode: 'MANUAL' as const,
          // Manual shipment fields
          modeOfTransport: prData.modeOfTransport,
          dispatchedDate,
          shipmentNumber: prData.shipmentNumber || undefined,
          // Store courier info
          courierProviderCode: prData.courierServiceProvider || undefined,
          // CRITICAL: For manual shipments, store AWB/SWB number in providerShipmentReference
          // Also store in trackingNumber for consistency (updatePRShipmentStatus may update this)
          providerShipmentReference: prData.shipmentNumber || undefined,
          trackingNumber: prData.shipmentNumber || undefined,
          // Warehouse info (if provided)
          warehouseRefId: warehouseRefId || undefined,
          warehousePincode: warehouse?.pincode || undefined,
          // Package data (if provided in prData - for future extensibility)
          shipmentPackageId: prData.shipmentPackageId || undefined,
          lengthCm: prData.lengthCm || undefined,
          breadthCm: prData.breadthCm || undefined,
          heightCm: prData.heightCm || undefined,
          volumetricWeight: prData.volumetricWeight || undefined,
          // Shipping cost (if provided)
          shippingCost: prData.shippingCost || undefined,
          // Shipment status - set to IN_TRANSIT since items are being dispatched
          shipmentStatus: 'IN_TRANSIT' as const,
          unified_shipment_status: 'IN_TRANSIT',
        }

        const shipment = await Shipment.create(shipmentData)

        // Update order status based on order type
        if (isReplacementOrder) {
          // For replacement orders, update order status directly to Dispatched
          // CRITICAL: Must update dispatchStatus to 'SHIPPED' for getOrdersByVendor status correction to work
          await Order.findOneAndUpdate(
            { id: prData.prId },
            {
              $set: {
                status: 'Dispatched',
                orderStatus: 'Dispatched',
                dispatchStatus: 'SHIPPED',           // Required for status display
                deliveryStatus: 'NOT_DELIVERED',     // Initial delivery status
                dispatchedDate,
                modeOfTransport: orderModeOfTransport,
                trackingNumber: prData.shipmentNumber || undefined,
                carrierName: prData.courierServiceProvider || undefined,
              }
            }
          )
          console.log(`[Manual Shipment] ✅ Updated replacement order ${prData.prId} to Dispatched (dispatchStatus=SHIPPED)`)
          
          // CRITICAL: Decrement inventory for the replacement items being shipped
          // This was missing - replacement orders need inventory decrement just like regular orders
          try {
            const orderItemsForInventory = order.items?.map((item: any) => ({
              uniformId: typeof item.uniformId === 'object' 
                ? (item.uniformId.id || String(item.uniformId._id || item.uniformId))
                : String(item.uniformId),
              size: item.size,
              quantity: item.quantity,
            })) || []
            
            if (orderItemsForInventory.length > 0) {
              console.log(`[Manual Shipment] 📦 Decrementing inventory for replacement order ${prData.prId}:`, orderItemsForInventory)
              const inventoryResult = await decrementVendorStockOnDispatch(
                String(vendorId),
                orderItemsForInventory,
                prData.prId
              )
              
              if (inventoryResult.success) {
                console.log(`[Manual Shipment] ✅ Inventory decremented for replacement order:`, {
                  orderId: prData.prId,
                  decrements: inventoryResult.decrements?.length || 0,
                })
              } else if (inventoryResult.errors?.length > 0) {
                console.error(`[Manual Shipment] ⚠️ Inventory decrement had errors:`, inventoryResult.errors)
                // Don't fail the shipment, just log the warning
              }
            }
          } catch (inventoryError: any) {
            console.error(`[Manual Shipment] ⚠️ Inventory decrement failed:`, inventoryError.message)
            // Don't fail the shipment creation, just log the error
          }
        } else {
          // Update PR shipment status using existing function
          // This ensures consistency with automatic shipment flow
          await updatePRShipmentStatus(
            prData.prId,
            {
              shipperName: 'Vendor',
              carrierName: prData.courierServiceProvider || undefined,
              modeOfTransport: orderModeOfTransport,
              trackingNumber: prData.shipmentNumber || undefined,
              dispatchedDate,
              itemDispatchedQuantities: order.items?.map((item: any, idx: number) => ({
                itemIndex: idx,
                dispatchedQuantity: item.quantity || 0,
              })) || [],
            },
            String(vendorId)
          )
        }

        createdShipments.push({
          shipmentId: shipment.shipmentId,
          prNumber: prData.prNumber,
          prId: prData.prId,
        })

        console.log(`[Manual Shipment] ✅ Created shipment ${shipmentId} for PR ${prData.prNumber}`)
      } catch (error: any) {
        console.error(`[Manual Shipment] ❌ Error processing PR ${prData.prNumber}:`, error)
        errors.push(`Failed to create shipment for PR ${prData.prNumber}: ${error.message}`)
      }
    }

    if (createdShipments.length === 0) {
      return NextResponse.json(
        { 
          error: 'Failed to create any shipments',
          errors,
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      createdCount: createdShipments.length,
      shipments: createdShipments,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('[API /prs/manual-shipment POST] Error:', error)
    console.error('[API /prs/manual-shipment POST] Error:', error)
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

