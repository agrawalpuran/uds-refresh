import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import ShipmentServiceProvider from '@/lib/models/ShipmentServiceProvider'
import { getProviderInstance } from '@/lib/providers/ProviderFactory'

/**
 * GET /api/shipment/provider-couriers
 * Get supported couriers for a provider by providerCode
 * 
 * Query parameters:
 * - providerCode (required): Provider code (e.g., "SHIPROCKET")
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const providerCode = searchParams.get('providerCode')

    if (!providerCode) {
      return NextResponse.json(
        { error: 'providerCode is required' },
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
      console.log(`[provider-couriers] Initializing provider: ${provider.providerCode}`)
      providerInstance = await getProviderInstance(provider.providerCode, undefined)
      console.log(`[provider-couriers] ✅ Provider instance created: ${providerInstance.providerCode}`)
    } catch (error: any) {
      console.error(`[provider-couriers] ❌ Failed to initialize provider:`, error)
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

    // Get supported couriers
    if (!providerInstance?.getSupportedCouriers) {
      return NextResponse.json(
        { error: 'Courier listing not supported by this provider' },
        { status: 400 }
      )
    }

    const result = await providerInstance.getSupportedCouriers()
    if (!result.success) {
      return NextResponse.json(
        { 
          error: result.error || 'Failed to fetch couriers',
          providerCode: provider.providerCode,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      providerCode: provider.providerCode,
      providerName: provider.providerName,
      couriers: result.couriers || [],
    }, { status: 200 })
  } catch (error: any) {
    console.error('[provider-couriers API] Error:', error)
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
