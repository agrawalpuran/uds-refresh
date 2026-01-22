import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import Shipment from '@/lib/models/Shipment'
import ShipmentApiLog from '@/lib/models/ShipmentApiLog'
import Order from '@/lib/models/Order'
import { createProvider } from '@/lib/providers/ProviderFactory'

/**
 * GET /api/shipments/diagnose?orderId=55555555
 * Diagnostic endpoint to show all response payloads for troubleshooting
 * 
 * Query params:
 * - orderId: Order ID, PR Number, Shiprocket order_id, or shipmentId
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('orderId')

    if (!orderId) {
      return NextResponse.json(
        { error: 'orderId query parameter is required' },
        { status: 400 }
      )

    await connectDB()

    }
    const diagnostics: any = {
      searchQuery: orderId,
      timestamp: new Date().toISOString(),
    }

    // Try to find shipment by various IDs
    let shipment = await Shipment.findOne({ shipmentId: orderId }).lean()
    if (!shipment) {
      shipment = await Shipment.findOne({ providerShipmentReference: orderId.toString() }).lean()
    }
    if (!shipment) {
      shipment = await Shipment.findOne({ prNumber: orderId.toString() }).lean()
    }

    // Try to find order
    let order = await Order.findOne({ id: orderId }).lean()
    if (!order) {
      order = await Order.findOne({ pr_number: orderId.toString() }).lean()
    }

    if (!shipment && !order) {
      return NextResponse.json(
        {
          error: `No shipment or order found for: ${orderId}`,
          hint: 'Try using shipmentId (SHIP_XXXXX), providerShipmentReference (Shiprocket order_id), or PR number',
        },
        { status: 404 }
      )
    }

    // Add shipment info
    if (shipment) {
      diagnostics.shipment = {
        shipmentId: shipment.shipmentId,
        prNumber: shipment.prNumber,
        vendorId: shipment.vendorId,
        shipmentMode: shipment.shipmentMode,
        shipmentStatus: shipment.shipmentStatus,
        providerId: shipment.providerId,
        providerShipmentReference: shipment.providerShipmentReference,
        trackingNumber: shipment.trackingNumber,
        courierAwbNumber: shipment.courierAwbNumber,
        courierProviderCode: shipment.courierProviderCode,
        courierStatus: shipment.courierStatus,
        createdAt: shipment.createdAt,
        updatedAt: shipment.updatedAt,
      }

      // Get API logs for this shipment - search by providerShipmentReference too
      const apiLogs = await ShipmentApiLog.find({
        $or: [
          { shipmentId: shipment.shipmentId },
          { providerId: shipment.providerId },
          // Also search in request/response payloads for order_id
          { 'requestPayload.prNumber': shipment.prNumber },
          { 'responsePayload.order_id': shipment.providerShipmentReference },
        ],
      })
        .sort({ timestamp: -1 })
        .limit(20)
        .lean()

      diagnostics.apiLogs = apiLogs.map((log: any) => {
        const response = log.responsePayload || {}
        return {
          logId: log.logId,
          operationType: log.operationType,
          httpStatus: log.httpStatus,
          success: log.success,
          errorDetails: log.errorDetails,
          timestamp: log.timestamp,
          // FULL REQUEST PAYLOAD SENT TO SHIPROCKET
          requestPayload: log.requestPayload,
          // FULL RESPONSE PAYLOAD FROM SHIPROCKET (COMPLETE)
          responsePayload: log.responsePayload,
          // Break down response for easier viewing
          responseBreakdown: {
            // Create Order Response
            createResponse: response.createResponse || response.fullResult?.rawResponse?.createResponse,
            // Assign AWB Response
            awbAssignResponse: response.awbAssignResponse || response.fullResult?.rawResponse?.awbAssignResponse,
            // Order Details Response (fetched using order_id)
            orderDetailsResponse: response.orderDetailsResponse || response.fullResult?.rawResponse?.orderDetailsResponse,
            // Extracted fields
            extractedFields: response.extractedFields,
          },
          // Extract key fields from all responses for easy viewing
          extractedFields: {
            // From createResponse
            order_id: response.createResponse?.order_id || response.fullResult?.rawResponse?.createResponse?.order_id,
            shipment_id: response.createResponse?.shipment_id || response.fullResult?.rawResponse?.createResponse?.shipment_id,
            // From awbAssignResponse
            awb_from_assign: response.awbAssignResponse?.awb_code || response.awbAssignResponse?.awbCode || response.awbAssignResponse?.awb,
            // From orderDetailsResponse (most reliable)
            awb_from_order_details: response.orderDetailsResponse?.awb_code || 
                                    response.orderDetailsResponse?.awbCode || 
                                    response.orderDetailsResponse?.awb ||
                                    response.orderDetailsResponse?.tracking_number ||
                                    response.orderDetailsResponse?.trackingNumber,
            // Final AWB (from extractedFields)
            final_awb: response.extractedFields?.awb_code || response.fullResult?.awbNumber,
            status: response.orderDetailsResponse?.status || response.createResponse?.status,
            courier_name: response.orderDetailsResponse?.courier_name || response.awbAssignResponse?.courier_name,
          },
        }
      })

      // If it's an API shipment, fetch full order details from Shiprocket
      if (shipment.shipmentMode === 'API' && shipment.providerId && shipment.providerShipmentReference) {
        try {
          const provider = await createProvider(shipment.providerId)
          if (provider) {
            console.log(`[diagnose] Fetching order details from Shiprocket for order_id: ${shipment.providerShipmentReference}`)
            
            // Fetch order details using the provider's internal method
            // We'll use getShipmentStatus which calls /v1/external/orders/show/{order_id}
            const statusResult = await provider.getShipmentStatus(shipment.providerShipmentReference)
            
            diagnostics.shiprocketOrderDetails = {
              method: 'getShipmentStatus',
              orderId: shipment.providerShipmentReference,
              success: statusResult.success,
              status: statusResult.status,
              trackingNumber: statusResult.trackingNumber,
              trackingUrl: statusResult.trackingUrl,
              error: statusResult.error,
              // FULL RAW RESPONSE FROM SHIPROCKET
              fullRawResponse: statusResult.rawResponse,
            }

            // Also try to get order details directly if provider supports it
            // For Shiprocket, getShipmentStatus with order_id returns full order details
            if (statusResult.rawResponse) {
              diagnostics.shiprocketOrderDetails.parsed = {
                order_id: statusResult.rawResponse.order_id,
                shipment_id: statusResult.rawResponse.shipment_id,
                awb_code: statusResult.rawResponse.awb_code || statusResult.rawResponse.awbCode || statusResult.rawResponse.awb,
                tracking_number: statusResult.rawResponse.tracking_number || statusResult.rawResponse.trackingNumber,
                status: statusResult.rawResponse.status || statusResult.rawResponse.shipment_status,
                courier_name: statusResult.rawResponse.courier_name || statusResult.rawResponse.courierName,
                // Show all keys in response to help identify structure
                allKeys: Object.keys(statusResult.rawResponse),
              }
            }
          }
        } catch (error) {
    const err = error as any;
          diagnostics.shiprocketOrderDetails = {
            error: error.message,
            stack: error.stack,
          }
        }
      }

      // Include raw provider response from shipment
      if (shipment.courierResponseRaw) {
        diagnostics.shipmentRawProviderResponse = shipment.courierResponseRaw
      }
      if (shipment.rawProviderResponse) {
        diagnostics.shipmentRawProviderResponse = shipment.rawProviderResponse
      }
    }

    // Add order info
    if (order) {
      diagnostics.order = {
        id: order.id,
        pr_number: order.pr_number,
        vendorId: order.vendorId,
        status: order.status,
        deliveryStatus: order.deliveryStatus,
        shipmentId: order.shipmentId,
        trackingNumber: order.trackingNumber,
        logisticsProviderCode: order.logisticsProviderCode,
        logisticsTrackingUrl: order.logisticsTrackingUrl,
        logisticsPayloadRef: order.logisticsPayloadRef,
        dispatchStatus: order.dispatchStatus,
        dispatchedDate: order.dispatchedDate,
      }
    }

    return NextResponse.json(diagnostics, { status: 200 })
  } catch (error) {
    const err = error as any;
    console.error('[API /shipments/diagnose] Error:', error)
    console.error('[API /shipments/diagnose] Error:', error)
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
