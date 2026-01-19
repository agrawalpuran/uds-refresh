import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import Shipment from '@/lib/models/Shipment'
import ShipmentPickup from '@/lib/models/ShipmentPickup'
import VendorWarehouse from '@/lib/models/VendorWarehouse'
import { createProvider } from '@/lib/providers/ProviderFactory'
import { validateAndNormalizePhone } from '@/lib/utils/phone-validation'
import { generateShippingId } from '@/lib/db/shipping-config-access'

/**
 * POST /api/shipments/[shipmentId]/pickup/schedule
 * Schedule a pickup for an API-backed shipment
 * 
 * Eligibility Rules:
 * - shipmentMode must be 'API' (AUTOMATIC)
 * - AWB number must exist
 * - shipmentStatus should be 'CREATED' (READY_FOR_PICKUP)
 * - Pickup must not already be PICKED_UP
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function POST(
  request: Request,
  { params }: { params: Promise<{ shipmentId: string }> }
) {
  try {
    const { shipmentId } = await params
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })

    await connectDB()

    // Find shipment
    const shipment = await Shipment.findOne({ shipmentId }).lean()
    if (!shipment) {
      return NextResponse.json(
        { error: `Shipment ${shipmentId} not found` },
        { status: 404 }
      )

    // ====================================================
    // ELIGIBILITY VALIDATION
    // ====================================================
    
    // Rule 1: Must be API shipment (AUTOMATIC mode)
    }
    if (shipment.shipmentMode !== 'API') {
      return NextResponse.json(
        { 
          error: 'Pickup scheduling is only available for API-backed shipments',
          reason: 'shipmentMode is MANUAL',
        },
        { status: 400 }
      )

    // Rule 2: providerShipmentReference MUST exist for API shipments
    if (!shipment.providerShipmentReference || !shipment.providerShipmentReference.trim()) {
      console.error(`[API /shipments/${shipmentId}/pickup/schedule] ❌ CRITICAL: providerShipmentReference missing`)
      console.error(`[API /shipments/${shipmentId}/pickup/schedule] Internal shipmentId: ${shipmentId}`)
      console.error(`[API /shipments/${shipmentId}/pickup/schedule] Shipment mode: ${shipment.shipmentMode}`)
      return NextResponse.json(
        { 
          error: 'Provider shipment reference is missing. Cannot schedule pickup via aggregator API.',
          reason: 'providerShipmentReference not found in shipment',
          internalShipmentId: shipmentId,
          hint: 'This shipment may have been created improperly. Please check shipment creation logs.',
        },
        { status: 400 }
      )

    // Rule 3: AWB number must exist
    const awbNumber = shipment.courierAwbNumber || shipment.trackingNumber
    if (!awbNumber || !awbNumber.trim()) {
      return NextResponse.json(
        { 
          error: 'AWB number is required for pickup scheduling',
          reason: 'AWB not found in shipment',
        },
        { status: 400 }
      )

    // Rule 4: Check if pickup already exists and is PICKED_UP
    const existingPickup = await ShipmentPickup.findOne({ shipmentId })
      .sort({ createdAt: -1 })
      .lean()
    
    if (existingPickup && existingPickup.pickupStatus === 'PICKED_UP') {
      return NextResponse.json(
        { 
          error: 'Pickup has already been completed. Cannot schedule new pickup.',
          reason: 'pickupStatus is PICKED_UP',
        },
        { status: 400 }
      )

    // ====================================================
    // PHONE VALIDATION (BEFORE API CALL)
    // ====================================================
    const phoneValidation = validateAndNormalizePhone(body.contactPhone, false)
    }
    if (!phoneValidation.isValid) {
      return NextResponse.json(
        { 
          error: phoneValidation.error || 'Invalid phone number',
          field: 'contactPhone',
        },
        { status: 400 }
      )
    const normalizedPhone = phoneValidation.normalizedPhone!

    // ====================================================
    // FETCH WAREHOUSE INFORMATION
    // ====================================================
    if (!body.warehouseId) {
      return NextResponse.json(
        { error: 'warehouseId is required' },
        { status: 400 }
      )

    }
    const warehouse = await VendorWarehouse.findOne({ 
      warehouseRefId: body.warehouseId,
      vendorId: shipment.vendorId,
    }).lean()

    if (!warehouse) {
      return NextResponse.json(
        { error: `Warehouse ${body.warehouseId} not found` },
        { status: 404 }
      )

    // ====================================================
    // CREATE PROVIDER INSTANCE
    // ====================================================
    }
    if (!shipment.providerId) {
      return NextResponse.json(
        { error: 'Provider ID not found in shipment' },
        { status: 400 }
      )

    const provider = await createProvider(
      shipment.providerId,
      undefined, // companyId not needed if provider is already initialized
      shipment.companyShippingProviderId
    )

    if (!provider) {
      return NextResponse.json(
        { error: 'Failed to initialize shipping provider' },
        { status: 500 }
      )

    // Check if provider supports pickup scheduling
    }
    if (!provider.schedulePickup) {
      return NextResponse.json(
        { error: 'Pickup scheduling is not supported by this provider' },
        { status: 400 }
      )

    // ====================================================
    // BUILD PICKUP PAYLOAD
    // ====================================================
    const pickupDate = body.pickupDate ? new Date(body.pickupDate) : new Date()
    // Default to next working day if not provided
    if (!body.pickupDate) {
      pickupDate.setDate(pickupDate.getDate() + 1)
    }

    const pickupPayload = {
      awbNumber: awbNumber,
      // CRITICAL: Use providerShipmentReference (NOT internal shipmentId)
      // This is the aggregator's shipment reference (e.g., Shiprocket order_id)
      providerShipmentReference: shipment.providerShipmentReference,
      warehouseId: body.warehouseId,
      pickupDate: pickupDate,
      pickupTimeSlot: body.pickupTimeSlot || '10:00-13:00',
      contactName: body.contactName || warehouse.contactName || warehouse.warehouseName,
      contactPhone: normalizedPhone,
      warehouseAddress: {
        addressLine1: warehouse.addressLine1,
        addressLine2: warehouse.addressLine2,
        city: warehouse.city,
        state: warehouse.state,
        pincode: warehouse.pincode,
        country: 'India',
      },
    }

    // ====================================================
    // CALL PROVIDER API
    // ====================================================
    console.log(`[API /shipments/${shipmentId}/pickup/schedule] ==========================================`)
    console.log(`[API /shipments/${shipmentId}/pickup/schedule] Scheduling pickup via ${provider.providerCode}`)
    console.log(`[API /shipments/${shipmentId}/pickup/schedule] Internal shipmentId (UDS): ${shipmentId}`)
    console.log(`[API /shipments/${shipmentId}/pickup/schedule] Provider shipment reference: ${shipment.providerShipmentReference}`)
    console.log(`[API /shipments/${shipmentId}/pickup/schedule] ⚠️  Using providerShipmentReference for aggregator API call`)
    console.log(`[API /shipments/${shipmentId}/pickup/schedule] ==========================================`)
    const pickupResult = await provider.schedulePickup(pickupPayload)

    // ====================================================
    // CRITICAL VALIDATION: Only proceed if Shiprocket confirms success
    // ====================================================
    if (!pickupResult.success) {
      console.error(`[API /shipments/${shipmentId}/pickup/schedule] ==========================================`)
      console.error(`[API /shipments/${shipmentId}/pickup/schedule] ❌ PICKUP SCHEDULING FAILED`)
      console.error(`[API /shipments/${shipmentId}/pickup/schedule] Error:`, pickupResult.error)
      console.error(`[API /shipments/${shipmentId}/pickup/schedule] Raw response:`, JSON.stringify(pickupResult.rawResponse, null, 2))
      console.error(`[API /shipments/${shipmentId}/pickup/schedule] ==========================================`)
      
      // DO NOT create pickup record on failure
      // DO NOT update shipment/order status on failure
      return NextResponse.json(
        { 
          success: false,
          error: pickupResult.error || 'Failed to schedule pickup via Shiprocket',
          details: pickupResult.rawResponse,
          message: 'Pickup was NOT scheduled. Please check the error details and try again.',
        },
        { status: 500 }
      )

    // Additional validation: Ensure pickupReferenceId exists
    if (!pickupResult.pickupReferenceId || !pickupResult.pickupReferenceId.trim()) {
      console.error(`[API /shipments/${shipmentId}/pickup/schedule] ==========================================`)
      console.error(`[API /shipments/${shipmentId}/pickup/schedule] ❌ VALIDATION FAILED - No pickup reference ID`)
      console.error(`[API /shipments/${shipmentId}/pickup/schedule] Pickup result:`, JSON.stringify(pickupResult, null, 2))
      console.error(`[API /shipments/${shipmentId}/pickup/schedule] ==========================================`)
      
      return NextResponse.json(
        { 
          success: false,
          error: 'Pickup scheduling failed: Shiprocket did not return a pickup reference ID. Pickup was NOT scheduled.',
          details: pickupResult.rawResponse,
          message: 'Pickup was NOT scheduled. Please check Shiprocket dashboard and try again.',
        },
        { status: 500 }
      )

    // ====================================================
    // SAVE PICKUP RECORD (ONLY after Shiprocket confirms success)
    // ====================================================
    console.log(`[API /shipments/${shipmentId}/pickup/schedule] ==========================================`)
    console.log(`[API /shipments/${shipmentId}/pickup/schedule] ✅ VALIDATION PASSED - Creating pickup record`)
    console.log(`[API /shipments/${shipmentId}/pickup/schedule] Pickup Reference ID: ${pickupResult.pickupReferenceId}`)
    console.log(`[API /shipments/${shipmentId}/pickup/schedule] ==========================================`)
    
    const pickupId = generateShippingId('PICKUP')
    const pickupStatus = existingPickup ? 'RESCHEDULED' : 'SCHEDULED'

    const shipmentPickup = new ShipmentPickup({
      shipmentPickupId: pickupId,
      shipmentId: shipmentId,
      providerCode: provider.providerCode,
      awbNumber: awbNumber,
      pickupReferenceId: pickupResult.pickupReferenceId, // Must exist (validated above)
      pickupStatus: pickupStatus,
      pickupDate: pickupDate,
      pickupTimeSlot: pickupResult.pickupTimeSlot || body.pickupTimeSlot || '10:00-13:00',
      warehouseId: body.warehouseId,
      contactName: pickupPayload.contactName,
      contactPhone: normalizedPhone,
      rawProviderResponse: pickupResult.rawResponse,
    })

    await shipmentPickup.save()

    console.log(`[API /shipments/${shipmentId}/pickup/schedule] ==========================================`)
    console.log(`[API /shipments/${shipmentId}/pickup/schedule] ✅ PICKUP RECORD CREATED`)
    console.log(`[API /shipments/${shipmentId}/pickup/schedule] Pickup ID: ${pickupId}`)
    console.log(`[API /shipments/${shipmentId}/pickup/schedule] Pickup Reference ID: ${pickupResult.pickupReferenceId}`)
    console.log(`[API /shipments/${shipmentId}/pickup/schedule] Status: ${pickupStatus}`)
    console.log(`[API /shipments/${shipmentId}/pickup/schedule] ==========================================`)

    return NextResponse.json({
      success: true,
      pickupId: pickupId,
      pickupReferenceId: pickupResult.pickupReferenceId,
      pickupDate: pickupDate,
      pickupTimeSlot: pickupResult.pickupTimeSlot,
      pickupStatus: pickupStatus,
      message: pickupResult.message || 'Pickup scheduled successfully',
    }, { status: 200 })
  } catch (error) {
    const err = error as any;
    console.error('[API /shipments/[shipmentId]/pickup/schedule] Error:', error)
    console.error('[API /shipments/[shipmentId]/pickup/schedule] Error:', error)
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
}}}}}}}}}}
