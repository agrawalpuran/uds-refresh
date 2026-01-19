
import { NextResponse } from 'next/server'
import {
  getAllShipmentServiceProviders,
  getShipmentServiceProviderById,
  createShipmentServiceProvider,
  updateShipmentServiceProvider,
  deleteShipmentServiceProvider
} from '@/lib/db/shipping-config-access'
// Ensure models are registered
import '@/lib/models/ShipmentServiceProvider'

/**
 * GET /api/superadmin/shipping-providers
 * Get all shipment service providers
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const providerId = searchParams.get('providerId')
    const providerRefId = searchParams.get('providerRefId')
    const includeInactive = searchParams.get('includeInactive') === 'true'

    if (providerRefId) {
      const { getShipmentServiceProviderByRefId } = await import('@/lib/db/shipping-config-access')
      const provider = await getShipmentServiceProviderByRefId(parseInt(providerRefId, 10))
      if (!provider) {
        return NextResponse.json(
          { error: 'Provider not found' },
          { status: 404 }
        )
      }
      return NextResponse.json(provider)
    }

    if (providerId) {
      const provider = await getShipmentServiceProviderById(providerId)
      if (!provider) {
        return NextResponse.json(
          { error: 'Provider not found' },
          { status: 404 }
        )
      }
      return NextResponse.json(provider)
    }

    const providers = await getAllShipmentServiceProviders(includeInactive)
    return NextResponse.json(providers)
  } catch (error: any) {
    console.error('API Error in /api/superadmin/shipping-providers GET:', error)
    console.error('API Error in /api/superadmin/shipping-providers GET:', error)
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
 * POST /api/superadmin/shipping-providers
 * Create a new shipment service provider
 */
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

    const {
      providerCode,
      providerName,
      providerType,
      isActive,
      supportsShipmentCreate,
      supportsTracking,
      supportsServiceabilityCheck,
      supportsCancellation,
      supportsWebhooks,
      apiBaseUrl,
      apiVersion,
      authType,
      documentationUrl,
      authConfig, // Optional authentication configuration
      createdBy
    } = body

    if (!providerCode || !providerName || !providerType) {
      return NextResponse.json(
        { error: 'Missing required fields: providerCode, providerName, providerType' },
        { status: 400 }
      )
    }

    if (!['API_AGGREGATOR', 'DIRECT_COURIER', 'FREIGHT'].includes(providerType)) {
      return NextResponse.json(
        { error: 'Invalid providerType. Must be one of: API_AGGREGATOR, DIRECT_COURIER, FREIGHT' },
        { status: 400 }
      )
    }

    const provider = await createShipmentServiceProvider(
      {
        providerCode,
        providerName,
        providerType,
        isActive,
        supportsShipmentCreate,
        supportsTracking,
        supportsServiceabilityCheck,
        supportsCancellation,
        supportsWebhooks,
        apiBaseUrl,
        apiVersion,
        authType,
        documentationUrl,
        authConfig, // Will be encrypted in data access layer
      },
      createdBy
    )

    return NextResponse.json(provider, { status: 201 })
  } catch (error: any) {
    console.error('API Error in /api/superadmin/shipping-providers POST:', error)
    console.error('API Error in /api/superadmin/shipping-providers POST:', error)
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
 * PUT /api/superadmin/shipping-providers
 * Update a shipment service provider
 */
export async function PUT(request: Request) {
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

    const { providerId, ...updates } = body

    if (!providerId) {
      return NextResponse.json(
        { error: 'providerId is required' },
        { status: 400 }
      )
    }

    if (updates.providerType && !['API_AGGREGATOR', 'DIRECT_COURIER', 'FREIGHT'].includes(updates.providerType)) {
      return NextResponse.json(
        { error: 'Invalid providerType. Must be one of: API_AGGREGATOR, DIRECT_COURIER, FREIGHT' },
        { status: 400 }
      )
    }

    const provider = await updateShipmentServiceProvider(
      providerId,
      updates,
      updates.updatedBy
    )

    return NextResponse.json(provider)
  } catch (error: any) {
    console.error('API Error in /api/superadmin/shipping-providers PUT:', error)
    console.error('API Error in /api/superadmin/shipping-providers PUT:', error)
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
 * DELETE /api/superadmin/shipping-providers
 * Delete a shipment service provider
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const providerId = searchParams.get('providerId')

    if (!providerId) {
      return NextResponse.json(
        { error: 'providerId is required' },
        { status: 400 }
      )
    }

    await deleteShipmentServiceProvider(providerId)

    return NextResponse.json({ success: true, message: 'Provider deleted successfully' })
  } catch (error: any) {
    console.error('API Error in /api/superadmin/shipping-providers DELETE:', error)
    console.error('API Error in /api/superadmin/shipping-providers DELETE:', error)
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
