import { NextResponse } from 'next/server'
import { getShipmentServiceProviderById, getProviderWithAuth } from '@/lib/db/shipping-config-access'
import { getProviderInstance } from '@/lib/providers/ProviderFactory'
import '@/lib/models/ShipmentServiceProvider'

/**
 * GET /api/superadmin/shipping-providers/[providerId]/couriers/sync
 * Fetch available couriers from the provider API and return normalized list
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    // Handle both Promise and direct params (Next.js 15 compatibility)
    const resolvedParams = await params
    const { providerId } = resolvedParams

    if (!providerId) {
      return NextResponse.json(
        { error: 'providerId is required' },
        { status: 400 }
      )
    }

    // Get provider by providerId first to get providerRefId
    const provider = await getShipmentServiceProviderById(providerId, true) // Include auth for internal use
    if (!provider) {
      return NextResponse.json(
        { error: 'Provider not found' },
        { status: 404 }
      )
    }

    if (!provider.providerRefId) {
      return NextResponse.json(
        { error: 'Provider Ref ID not found. Please ensure provider has been migrated.' },
        { status: 400 }
      )
    }

    if (!provider.authConfig) {
      return NextResponse.json(
        { error: 'Provider authentication not configured' },
        { status: 400 }
      )
    }

    // Get provider with decrypted authConfig
    const providerWithAuth = await getProviderWithAuth(provider.providerRefId)
    if (!providerWithAuth || !providerWithAuth.authConfig) {
      return NextResponse.json(
        { error: 'Provider authentication not configured' },
        { status: 400 }
      )
    }

    // Get provider instance using stored authConfig
    const providerInstance = await getProviderInstance(provider.providerCode)

    // Check if provider supports courier listing
    if (!providerInstance.getSupportedCouriers) {
      return NextResponse.json(
        { 
          error: 'Courier listing not supported by this provider',
          supported: false,
        },
        { status: 400 }
      )
    }

    // Fetch couriers from provider
    const result = await providerInstance.getSupportedCouriers()

    if (!result.success || !result.couriers) {
      return NextResponse.json(
        {
          error: result.error || 'Failed to fetch couriers',
          supported: true,
        },
        { status: 500 }
      )
    }

    // Normalize couriers to UDS format
    const normalizedCouriers = result.couriers.map((courier) => ({
      courierCode: courier.courierCode,
      courierName: courier.courierName,
      serviceTypes: courier.serviceTypes || [],
      isActive: courier.isActive ?? true, // Default to active for new couriers
      source: 'API_SYNC' as const,
      lastSyncedAt: new Date(),
    }))

    return NextResponse.json({
      success: true,
      couriers: normalizedCouriers,
      count: normalizedCouriers.length,
      providerCode: provider.providerCode,
      providerName: provider.providerName,
    })
  } catch (error: any) {
    console.error('API Error in /api/superadmin/shipping-providers/[providerId]/couriers/sync GET:', error)
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
