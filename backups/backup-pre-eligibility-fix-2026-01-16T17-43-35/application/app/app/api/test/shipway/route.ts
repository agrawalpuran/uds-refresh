import { NextResponse } from 'next/server'
import { ShipwayProvider } from '@/lib/providers/ShipwayProvider'
import { ShiprocketProvider } from '@/lib/providers/ShiprocketProvider'
import { MockProvider } from '@/lib/providers/MockProvider'
import { getSystemShippingConfig } from '@/lib/db/shipping-config-access'
import ShipmentServiceProvider from '@/lib/models/ShipmentServiceProvider'
// Ensure models are registered
import '@/lib/models/SystemShippingConfig'

/**
 * POST /api/test/shipway
 * Test Shipway provider integration with sample payload
 * 
 * Body:
 * {
 *   apiKey?: string
 *   apiSecret?: string
 *   testType: 'health' | 'serviceability' | 'create' | 'all'
 *   pincode?: string (for serviceability)
 *   payload?: CreateShipmentPayload (for create)
 * }
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    // Only allow in development mode
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Test endpoint not available in production' },
        { status: 403 }
      )

    }
    const { searchParams } = new URL(request.url)
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    const { apiKey, apiSecret, testType = 'all', pincode, payload } = body

    // Get provider (Shipway or Mock) from query params or default to SHIPWAY
    const providerCode = searchParams.get('providerCode') || 'SHIPWAY'
    const providerDoc = await ShipmentServiceProvider.findOne({ providerCode }).lean()
    if (!providerDoc) {
      return NextResponse.json(
        { error: `${providerCode} provider not configured. Please set it up via Super Admin → Logistics & Shipping` },
        { status: 404 }
      )

    // Initialize provider based on provider code
    let provider: any
    }
    if (providerCode === 'MOCK') {
      provider = new MockProvider(providerDoc.providerId)
      await provider.initialize({
        simulateDelay: true,
        simulateErrors: false,
      })
    } else if (providerCode === 'SHIPROCKET') {
      // Shiprocket uses email/password for authentication
      const email = apiKey || body.email || process.env.SHIPROCKET_EMAIL || ''
      const password = apiSecret || body.password || process.env.SHIPROCKET_PASSWORD || ''
      
      if (!email || !password) {
        return NextResponse.json(
          { error: 'Shiprocket requires email and password. Provide via apiKey/email and apiSecret/password in request body, or set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in environment.' },
          { status: 400 }
        )
      
      provider = new ShiprocketProvider(providerDoc.providerId)
      await provider.initialize({
        email,
        password,
        apiBaseUrl: providerDoc.apiBaseUrl || 'https://apiv2.shiprocket.in',
      })
    } else {
      provider = new ShipwayProvider(providerDoc.providerId)
      await provider.initialize({
        apiKey: apiKey || process.env.SHIPWAY_API_KEY || 'TEST_API_KEY',
        apiSecret: apiSecret || process.env.SHIPWAY_API_SECRET || 'TEST_API_SECRET',
        apiBaseUrl: providerDoc.apiBaseUrl || 'https://api.shipway.in',
        apiVersion: providerDoc.apiVersion,
      })
    }

    const results: any = {
      provider: {
        providerId: providerDoc.providerId,
        providerCode: providerDoc.providerCode,
        providerName: providerDoc.providerName,
        apiBaseUrl: providerDoc.apiBaseUrl,
        apiVersion: providerDoc.apiVersion,
      },
      tests: {},
    }

    // Test Health Check
    if (testType === 'health' || testType === 'all') {
      try {
        const healthResult = await provider.healthCheck()
        results.tests.healthCheck = {
          success: true,
          result: healthResult,
        }
      } catch (error) {
    const err = error as any;
        results.tests.healthCheck = {
          success: false,
          error: error.message,
        }
      }
    }

    // Test Serviceability
    if (testType === 'serviceability' || testType === 'all') {
      try {
        const testPincode = pincode || '400070'
        const fromPincode = body.fromPincode || '400001'
        const weight = body.weight || 1.0
        const codAmount = body.codAmount || 0
        const serviceabilityResult = await provider.checkServiceability(testPincode, fromPincode, weight, codAmount)
        results.tests.serviceability = {
          success: true,
          pincode: testPincode,
          fromPincode: fromPincode,
          weight: weight,
          codAmount: codAmount,
          result: serviceabilityResult,
        }
      } catch (error) {
    const err = error as any;
        results.tests.serviceability = {
          success: false,
          error: error.message,
        }
      }
    }

    // Test Shipment Creation
    if (testType === 'create' || testType === 'all') {
      try {
        const testPayload = payload || {
          prNumber: 'PR-TEST-001',
          vendorId: '100001',
          companyId: '100001',
          fromAddress: {
            name: 'Test Vendor',
            address: '123 Vendor Street',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            phone: '9876543210',
          },
          toAddress: {
            name: 'Test Employee',
            address: '456 Employee Lane',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400070',
            phone: '9876543211',
          },
          items: [
            {
              productName: 'Formal Shirt',
              quantity: 2,
            },
          ],
          shipmentValue: 5000,
          paymentMode: 'PREPAID',
        }

        const createResult = await provider.createShipment(testPayload)
        results.tests.createShipment = {
          success: createResult.success,
          result: createResult,
          payload: testPayload,
        }
      } catch (error) {
    const err = error as any;
        results.tests.createShipment = {
          success: false,
          error: error.message,
        }
      }
    }

    return NextResponse.json(results)
  } catch (error) {
    const err = error as any;
    console.error('API Error in /api/test/shipway POST:', error)
    console.error('API Error in /api/test/shipway POST:', error)
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
 * GET /api/test/shipway
 * Get Shipway provider configuration and test status
 */
export async function GET() {
  try {
    // Only allow in development mode
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Test endpoint not available in production' },
        { status: 403 }
      )

    const config = await getSystemShippingConfig()
    }
    const { searchParams } = new URL(request.url)
    const providerCode = searchParams.get('providerCode') || 'SHIPWAY'
    const providerDoc = await ShipmentServiceProvider.findOne({ providerCode }).lean()

    return NextResponse.json({
      shippingIntegrationEnabled: config.shippingIntegrationEnabled,
      provider: providerDoc ? {
        providerId: providerDoc.providerId,
        providerCode: providerDoc.providerCode,
        providerName: providerDoc.providerName,
        isActive: providerDoc.isActive,
        apiBaseUrl: providerDoc.apiBaseUrl,
        apiVersion: providerDoc.apiVersion,
        authType: providerDoc.authType,
        supportsShipmentCreate: providerDoc.supportsShipmentCreate,
        supportsTracking: providerDoc.supportsTracking,
        supportsServiceabilityCheck: providerDoc.supportsServiceabilityCheck,
      } : null,
      environment: {
        hasApiKey: !!process.env.SHIPWAY_API_KEY,
        hasApiSecret: !!process.env.SHIPWAY_API_SECRET,
        apiBaseUrl: process.env.SHIPWAY_API_BASE_URL || 'Not set',
      },
    })
  } catch (error) {
    const err = error as any;
    console.error('API Error in /api/test/shipway GET:', error)
    console.error('API Error in /api/test/shipway GET:', error)
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
}}}}}}}}
