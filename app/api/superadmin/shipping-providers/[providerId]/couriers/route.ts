import { NextResponse } from 'next/server'
import { getShipmentServiceProviderById, updateShipmentServiceProvider } from '@/lib/db/shipping-config-access'
import '@/lib/models/ShipmentServiceProvider'

/**
 * GET /api/superadmin/shipping-providers/[providerId]/couriers
 * Get current supported couriers for a provider
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const resolvedParams = await params
    const { providerId } = resolvedParams

    if (!providerId) {
      return NextResponse.json(
        { error: 'providerId is required' },
        { status: 400 }
      )
    }

    const provider = await getShipmentServiceProviderById(providerId)
    if (!provider) {
      return NextResponse.json(
        { error: 'Provider not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      couriers: provider.supportedCouriers || [],
      count: provider.supportedCouriers?.length || 0,
    })
  } catch (error: any) {
    console.error('API Error in /api/superadmin/shipping-providers/[providerId]/couriers GET:', error)
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

/**
 * PUT /api/superadmin/shipping-providers/[providerId]/couriers
 * Update supported couriers list (merge with existing)
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const resolvedParams = await params
    const { providerId } = resolvedParams

    if (!providerId) {
      return NextResponse.json(
        { error: 'providerId is required' },
        { status: 400 }
      )
    }

    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError) {
      return NextResponse.json({ 
        error: 'Invalid JSON in request body' 
      }, { status: 400 })
    }
    const { couriers } = body

    if (!Array.isArray(couriers)) {
      return NextResponse.json(
        { error: 'couriers must be an array' },
        { status: 400 }
      )
    }

    // Get current provider to merge with existing couriers
    const currentProvider = await getShipmentServiceProviderById(providerId)
    if (!currentProvider) {
      return NextResponse.json(
        { error: 'Provider not found' },
        { status: 404 }
      )
    }

    // Merge couriers: Update existing by courierCode, add new ones
    const existingCouriers = currentProvider.supportedCouriers || []
    const courierMap = new Map<string, any>()

    // First, add all existing couriers to map
    existingCouriers.forEach((courier: any) => {
      courierMap.set(courier.courierCode.toUpperCase(), courier)
    })

    // Then, update/add couriers from request
    couriers.forEach((courier: any) => {
      const courierCode = courier.courierCode?.toUpperCase()
      if (!courierCode) {
        console.warn('Skipping courier without courierCode:', courier)
        return
      }

      const existing = courierMap.get(courierCode)
      if (existing) {
        // Update existing courier (preserve source if it was MANUAL)
        courierMap.set(courierCode, {
          ...existing,
          courierName: courier.courierName || existing.courierName,
          serviceTypes: courier.serviceTypes || existing.serviceTypes || [],
          isActive: courier.isActive !== undefined ? courier.isActive : existing.isActive,
          // Preserve source if it was MANUAL, otherwise update to API_SYNC
          source: existing.source === 'MANUAL' ? 'MANUAL' : (courier.source || 'API_SYNC'),
          lastSyncedAt: courier.source === 'API_SYNC' ? new Date() : existing.lastSyncedAt,
        })
      } else {
        // Add new courier
        courierMap.set(courierCode, {
          courierCode: courierCode,
          courierName: courier.courierName || courierCode,
          serviceTypes: courier.serviceTypes || [],
          isActive: courier.isActive !== undefined ? courier.isActive : true,
          source: courier.source || 'API_SYNC',
          lastSyncedAt: courier.source === 'API_SYNC' ? new Date() : undefined,
        })
      }
    })

    // Convert map back to array
    const mergedCouriers = Array.from(courierMap.values())

    // Update provider using providerId
    await updateShipmentServiceProvider(
      providerId,
      {
        supportedCouriers: mergedCouriers,
      },
      'superadmin'
    )

    return NextResponse.json({
      success: true,
      message: 'Couriers updated successfully',
      couriers: mergedCouriers,
      count: mergedCouriers.length,
    })
  } catch (error: any) {
    console.error('API Error in /api/superadmin/shipping-providers/[providerId]/couriers PUT:', error)
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
