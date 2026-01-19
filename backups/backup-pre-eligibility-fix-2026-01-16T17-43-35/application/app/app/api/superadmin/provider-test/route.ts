import { NextResponse } from 'next/server'
import { getShipmentServiceProviderById } from '@/lib/db/shipping-config-access'
import { getProviderInstance } from '@/lib/providers/ProviderFactory'
import { createTestLog } from '@/lib/db/provider-test-access'
import '@/lib/models/LogisticsProviderTestLog'

/**
 * POST /api/superadmin/provider-test
 * Run diagnostic tests on a logistics provider
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    const { providerId, testType, testParams, executedBy } = body

    if (!providerId || !testType) {
      return NextResponse.json(
        { error: 'providerId and testType are required' },
        { status: 400 }
      )

    // Get provider configuration
    const provider = await getShipmentServiceProviderById(providerId)
    }
    if (!provider) {
      return NextResponse.json(
        { error: 'Provider not found' },
        { status: 404 }
      )

    // Get provider instance (without company credentials for test mode)
    // For testing, we'll use test credentials from request OR stored authConfig
    let providerInstance
    try {
      console.log(`[provider-test] Initializing provider: ${provider.providerCode} (ID: ${provider.providerId})`)
      console.log(`[provider-test] Provider Ref ID: ${provider.providerRefId || 'NOT SET'}`)
      console.log(`[provider-test] Has authConfig in DB: ${provider.hasAuthConfig || false}`)
      
      // Build credentials from test params if provided, otherwise getProviderInstance will use stored authConfig
      const credentials: any = {}
      if (testParams?.email || testParams?.apiKey) {
        // For Shiprocket, email should be passed as email, not apiKey
        if (provider.providerCode === 'SHIPROCKET' || provider.providerCode === 'SHIPROCKET_ICICI') {
          credentials.email = testParams?.email || testParams?.apiKey
        } else {
          credentials.apiKey = testParams?.email || testParams?.apiKey
        }
      }
      if (testParams?.password || testParams?.apiSecret) {
        // For Shiprocket, password should be passed as password, not apiSecret
        if (provider.providerCode === 'SHIPROCKET' || provider.providerCode === 'SHIPROCKET_ICICI') {
          credentials.password = testParams?.password || testParams?.apiSecret
        } else {
          credentials.apiSecret = testParams?.password || testParams?.apiSecret
        }
      }
      if (testParams?.token) {
        credentials.accessToken = testParams?.token
      }
      if (testParams?.refreshToken) {
        credentials.refreshToken = testParams?.refreshToken
      }

      // If no credentials provided in testParams, getProviderInstance will automatically use stored authConfig
      // Pass undefined to let getProviderInstance fetch stored authConfig from database
      const hasTestCredentials = Object.keys(credentials).length > 0
      console.log(`[provider-test] Using test credentials: ${hasTestCredentials}`)
      if (hasTestCredentials) {
        console.log(`[provider-test] Test credentials keys: ${Object.keys(credentials).join(', ')`)
      }
      
      providerInstance = await getProviderInstance(
        provider.providerCode, 
        hasTestCredentials ? credentials : undefined
      )
      
      console.log(`[provider-test] ✅ Provider instance created: ${providerInstance.providerCode}`)
    } catch (error) {
    const err = error as any;
      console.error(`[provider-test] ❌ Failed to initialize provider ${provider.providerCode}:`, error)
      console.error(`[provider-test] Error stack:`, error.stack)
      return NextResponse.json(
        { 
          success: false,
          error: `Failed to initialize provider: ${error.message}`,
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
          providerCode: provider.providerCode,
          providerRefId: provider.providerRefId,
        },
        { status: 500 }
      )

    let result: any = {}
    let success = false
    let errorMessage: string | undefined

    const requestPayload = { testType, testParams }

    try {
      switch (testType) {
        case 'HEALTH':
          result = await providerInstance.healthCheck()
          success = result.healthy === true
          break

        case 'SERVICEABILITY':
          // Trim and validate pincodes
          const destinationPincode = (testParams?.pincode || '').trim()
          const sourcePincode = (testParams?.fromPincode || '').trim()
          
          if (!destinationPincode) {
            throw new Error('Destination pincode is required for serviceability test')
          }
          if (!sourcePincode) {
            throw new Error('Source pincode is required for serviceability test')
          }
          
          // Validate pincode format (6 digits)
          if (!/^\d{6}$/.test(destinationPincode)) {
            throw new Error('Destination pincode must be a valid 6-digit number')
          }
          if (!/^\d{6}$/.test(sourcePincode)) {
            throw new Error('Source pincode must be a valid 6-digit number')
          }
          
          // Ensure pincodes are different
          if (sourcePincode === destinationPincode) {
            throw new Error('Source and destination pincodes must be different')
          }
          
          console.log(`[SERVICEABILITY] Checking serviceability from ${sourcePincode} to ${destinationPincode}`)
          
          result = await providerInstance.checkServiceability(
            destinationPincode,
            sourcePincode,
            testParams.weight,
            testParams.codAmount,
            testParams.courierCode
          )
          // ServiceabilityResult may have serviceable or success field
          success = result.serviceable === true || (result as any).success === true
          break

        case 'RATE':
          if (!testParams?.fromPincode || !testParams?.toPincode || !testParams?.weight) {
            throw new Error('fromPincode, toPincode, and weight are required for rate test')
          }
          if (providerInstance.getShippingRates) {
            result = await providerInstance.getShippingRates(
              testParams.fromPincode,
              testParams.toPincode,
              testParams.weight,
              testParams.codAmount || 0,
              testParams.dimensions
            )
            success = result.success === true
          } else {
            throw new Error('Rate estimation not supported by this provider')
          }
          break

        case 'TRACKING':
          if (!testParams?.providerShipmentReference) {
            throw new Error('Docket number is required for tracking test')
          }
          
          const docketNumber = (testParams.providerShipmentReference || '').trim()
          if (!docketNumber) {
            throw new Error('Docket number cannot be empty')
          }
          
          console.log(`[TRACKING] Checking status for docket: ${docketNumber}`)
          if (testParams.courierCode) {
            console.log(`[TRACKING] With courier: ${testParams.courierCode}`)
          }
          
          result = await providerInstance.getShipmentStatus(docketNumber)
          
          // Check if result indicates success
          success = result.success === true
          
          // If not successful, provide more detailed error information
          if (!success) {
            console.error(`[TRACKING] Status check failed:`, {
              docketNumber,
              error: result.error,
              status: result.status,
              rawResponse: result.rawResponse
            })
            
            // Try to extract more meaningful error message
            if (result.rawResponse?.error) {
              result.error = result.rawResponse.error.message || result.rawResponse.error || result.error
            }
          } else {
            console.log(`[TRACKING] Status check successful:`, {
              docketNumber,
              status: result.status,
              trackingNumber: result.trackingNumber
            })
          }
          break

        case 'COURIERS':
          if (providerInstance.getSupportedCouriers) {
            result = await providerInstance.getSupportedCouriers()
            success = result.success === true
          } else {
            throw new Error('Courier listing not supported by this provider')
          }
          break

        default:
          throw new Error(`Unknown test type: ${testType}`)
      }
    } catch (error) {
    const err = error as any;
      success = false
      errorMessage = error.message
      result = { error: error.message }
    }

    // Log the test
    await createTestLog({
      providerId,
      testType,
      requestPayload,
      responsePayload: result,
      success,
      errorMessage,
      executedBy: executedBy || 'superadmin',
    })

    return NextResponse.json({
      success,
      testType,
      result,
      error: errorMessage,
    })
  } catch (error) {
    const err = error as any;
    console.error('API Error in /api/superadmin/provider-test POST:', error)
    console.error('API Error in /api/superadmin/provider-test POST:', error)
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
}

/**
 * GET /api/superadmin/provider-test
 * Get test logs for a provider
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const providerId = searchParams.get('providerId')
    const testType = searchParams.get('testType') as any
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    if (!providerId) {
      return NextResponse.json(
        { error: 'providerId is required' },
        { status: 400 }
      )

    }
    const { getTestLogs } = await import('@/lib/db/provider-test-access')
    const logs = await getTestLogs(providerId, testType, limit)

    return NextResponse.json({ logs })
  } catch (error) {
    const err = error as any;
    console.error('API Error in /api/superadmin/provider-test GET:', error)
    console.error('API Error in /api/superadmin/provider-test GET:', error)
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
}
}}}}}}}}}}
