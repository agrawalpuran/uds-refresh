import { NextResponse } from 'next/server'
import { getProviderWithAuth } from '@/lib/db/shipping-config-access'
import { getProviderInstance } from '@/lib/providers/ProviderFactory'
import { updateShipmentServiceProvider } from '@/lib/db/shipping-config-access'
// Ensure models are registered
import '@/lib/models/ShipmentServiceProvider'

/**
 * POST /api/superadmin/shipping-providers/[providerId]/test-connection
 * Test connection to provider using stored authentication
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function POST(
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

    // Parse request body to get test credentials (if provided)
    let testCredentials: any = null
    let body: any = {}
    try {
      body = await request.json()
      if (body.authConfig) {
        testCredentials = body.authConfig
      }
    } catch {
      // No body or invalid JSON, continue with stored auth
    }

    // Get provider by ID first to get providerRefId
    const { getShipmentServiceProviderById } = await import('@/lib/db/shipping-config-access')
    const providerById = await getShipmentServiceProviderById(providerId, true)
    
    if (!providerById) {
      return NextResponse.json(
        { error: 'Provider not found' },
        { status: 404 }
      )
    }

    // Get provider with decrypted authConfig using providerRefId (internal use only)
    let provider = providerById
    let authConfig = testCredentials // Use test credentials if provided
    
    if (!authConfig && providerById.providerRefId) {
      try {
        provider = await getProviderWithAuth(providerById.providerRefId)
        authConfig = provider.authConfig
      } catch (error) {
        // If authConfig fetch fails, use providerById without auth
        console.warn('Could not load authConfig, using provider without auth:', error)
      }
    } else if (!authConfig && provider.authConfig) {
      authConfig = provider.authConfig
    }
    
    if (!provider) {
      return NextResponse.json(
        { error: 'Provider not found' },
        { status: 404 }
      )
    }

    if (!authConfig) {
      return NextResponse.json(
        { 
          error: 'Authentication not configured',
          message: 'Please enter authentication credentials in the form or save them first'
        },
        { status: 400 }
      )
    }

    // Initialize provider with auth (from form or stored)
    let providerInstance
    try {
      // Map authConfig to credentials based on authType
      const credentials: any = {}
      
      if (authConfig.authType === 'API_KEY' && authConfig.credentials?.apiKey) {
        credentials.apiKey = authConfig.credentials.apiKey
        credentials.apiSecret = authConfig.credentials.password || authConfig.credentials.clientSecret || ''
      } else if (authConfig.authType === 'TOKEN' && authConfig.credentials?.token) {
        credentials.accessToken = authConfig.credentials.token
      } else if (authConfig.authType === 'BASIC' && authConfig.credentials?.username && authConfig.credentials?.password) {
        credentials.email = authConfig.credentials.username // For Shiprocket, username is email
        credentials.password = authConfig.credentials.password
      } else if (authConfig.authType === 'OAUTH2' && authConfig.credentials?.oauth) {
        credentials.apiKey = authConfig.credentials.oauth.clientId
        credentials.apiSecret = authConfig.credentials.oauth.clientSecret
      }

      providerInstance = await getProviderInstance(provider.providerCode, credentials)
    } catch (initError: any) {
      // Update health status
      await updateShipmentServiceProvider(
        providerId,
        {
          lastHealthCheckAt: new Date(),
          lastHealthStatus: 'UNHEALTHY',
          lastHealthMessage: `Initialization failed: ${initError.message}`,
        },
        'system'
      )

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to initialize provider',
          message: initError.message,
        },
        { status: 500 }
      )
    }

    // Perform health check
    let healthResult
    try {
      healthResult = await providerInstance.healthCheck()
    } catch (healthError: any) {
      // Update health status
      await updateShipmentServiceProvider(
        providerId,
        {
          lastHealthCheckAt: new Date(),
          lastHealthStatus: 'UNHEALTHY',
          lastHealthMessage: `Health check failed: ${healthError.message}`,
        },
        'system'
      )

      return NextResponse.json(
        {
          success: false,
          error: 'Health check failed',
          message: healthError.message,
        },
        { status: 500 }
      )
    }

    // Update health status
    await updateShipmentServiceProvider(
      providerId,
      {
        lastHealthCheckAt: new Date(),
        lastHealthStatus: healthResult.healthy ? 'HEALTHY' : 'UNHEALTHY',
        lastHealthMessage: healthResult.message || healthResult.error || 'Connection test completed',
      },
      'system'
    )

    return NextResponse.json({
      success: healthResult.healthy,
      message: healthResult.message || 'Connection test completed',
      responseTime: healthResult.responseTime,
      status: healthResult.healthy ? 'HEALTHY' : 'UNHEALTHY',
    })
  } catch (error: any) {
    console.error('API Error in /api/superadmin/shipping-providers/[providerId]/test-connection POST:', error)
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
