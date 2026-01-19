import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import ShipmentServiceProvider from '@/lib/models/ShipmentServiceProvider'
import { getProviderInstance } from '@/lib/providers/ProviderFactory'

/**
 * POST /api/shipment/serviceability
 * Check serviceability for a provider by providerCode
 * 
 * Body:
 * - providerCode (required): Provider code (e.g., "SHIPROCKET")
 * - fromPincode (required): Source pincode
 * - pincode (required): Destination pincode
 * - weight (optional): Weight in kg (default: 1.0)
 * - codAmount (optional): COD amount (default: 0)
 * - courierCode (optional): Specific courier code to check
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    }

    const { providerCode, fromPincode, pincode, weight, codAmount, courierCode } = body

    if (!providerCode) {
      return NextResponse.json(
        { error: 'providerCode is required' },
        { status: 400 }
      )
    }

    if (!fromPincode || !pincode) {
      return NextResponse.json(
        { error: 'fromPincode and pincode are required' },
        { status: 400 }
      )
    }

    // Validate pincode format
    const destinationPincode = String(pincode).trim()
    const sourcePincode = String(fromPincode).trim()
    
    if (!/^\d{6}$/.test(destinationPincode)) {
      return NextResponse.json(
        { error: 'Destination pincode must be a valid 6-digit number' },
        { status: 400 }
      )
    }

    if (!/^\d{6}$/.test(sourcePincode)) {
      return NextResponse.json(
        { error: 'Source pincode must be a valid 6-digit number' },
        { status: 400 }
      )
    }
    
    if (sourcePincode === destinationPincode) {
      return NextResponse.json(
        { error: 'Source and destination pincodes must be different' },
        { status: 400 }
      )
    }

    await connectDB()

    // Get provider by code
    const provider: any = await ShipmentServiceProvider.findOne({ 
      providerCode: providerCode.toUpperCase() 
    }).lean()

    if (!provider) {
      return NextResponse.json(
        { error: `Provider not found: ${providerCode}` },
        { status: 404 }
      )
    }

    if (!provider.isActive) {
      return NextResponse.json(
        { error: `Provider is not active: ${providerCode}` },
        { status: 400 }
      )
    }

    // Get provider instance
    let providerInstance
    try {
      console.log(`[serviceability] Initializing provider: ${provider.providerCode}`)
      providerInstance = await getProviderInstance(provider.providerCode, undefined)
      console.log(`[serviceability] ✅ Provider instance created: ${providerInstance.providerCode}`)
    } catch (error: any) {
      console.error(`[serviceability] ❌ Failed to initialize provider:`, error)
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

    // Check serviceability
    const shipmentWeight = weight || 1.0
    const cod = codAmount || 0

    console.log(`[serviceability] Checking serviceability from ${sourcePincode} to ${destinationPincode}`)
    
    const result: any = await providerInstance?.checkServiceability(
      destinationPincode,
      sourcePincode,
      shipmentWeight,
      cod,
      courierCode
    )

    const serviceable = result.serviceable === true || result.success === true

    return NextResponse.json({
      success: true,
      serviceable,
      message: result.message || (serviceable ? 'Serviceable' : 'Not serviceable'),
      cost: result.cost || result.rate || undefined,
      estimatedDays: result.estimatedDays || result.estimated_days,
      providerCode: provider.providerCode,
      providerName: provider.providerName,
    }, { status: 200 })
  } catch (error: any) {
    console.error('[serviceability API] Error:', error)
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
