
import { NextResponse } from 'next/server'
import { getSystemFeatureConfig, updateSystemFeatureConfig } from '@/lib/db/feature-config-access'
// Ensure models are registered
import '@/lib/models/SystemFeatureConfig'

/**
 * GET /api/superadmin/feature-config
 * Get system feature configuration
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const config = await getSystemFeatureConfig()
    return NextResponse.json(config)
  } catch (error: any) {
    console.error('API Error in /api/superadmin/feature-config GET:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('Invalid JSON')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }
    
    // Return 404 for not found errors
    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('Not found') ||
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }
    
    // Return 401 for authentication errors
    if (
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('token')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 401 })
    }
    
    // Return 500 for server errors
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

/**
 * PUT /api/superadmin/feature-config
 * Update system feature configuration
 */
export async function PUT(request: Request) {
  try {
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const { testOrdersEnabled, updatedBy } = body

    if (testOrdersEnabled === undefined) {
      return NextResponse.json(
        { error: 'At least one field must be provided for update' },
        { status: 400 }
      )
    }

    const config = await updateSystemFeatureConfig(
      {
        testOrdersEnabled,
      },
      updatedBy
    )

    return NextResponse.json(config)

  } catch (error: any) {
    console.error('API Error in /api/superadmin/feature-config PUT:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('Invalid JSON')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }
    
    // Return 404 for not found errors
    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('Not found') ||
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }
    
    // Return 401 for authentication errors
    if (
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('token')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 401 })
    }
    
    // Return 500 for server errors
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
