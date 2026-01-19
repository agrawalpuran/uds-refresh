
import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import {
  getAllShipmentPackages,
  createShipmentPackage,
} from '@/lib/db/shipment-package-access'

/**
 * GET /api/shipping/packages
 * Get all shipment packages (optionally filtered by active status)
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('activeOnly') === 'true'

    await connectDB()

    const packages = await getAllShipmentPackages(activeOnly)

    return NextResponse.json(
      {
        success: true,
        packages,
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('[packages API] GET Error:', error)
    console.error('[packages API] GET Error:', error)
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
 * POST /api/shipping/packages
 * Create a new shipment package
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

    const { packageName, lengthCm, breadthCm, heightCm, volumetricDivisor, isActive } = body

    // Validation
    if (!packageName || !packageName.trim()) {
      return NextResponse.json(
        { error: 'packageName is required' },
        { status: 400 }
      )
    }

    if (!lengthCm || lengthCm <= 0) {
      return NextResponse.json(
        { error: 'lengthCm must be a positive number' },
        { status: 400 }
      )
    }

    if (!breadthCm || breadthCm <= 0) {
      return NextResponse.json(
        { error: 'breadthCm must be a positive number' },
        { status: 400 }
      )
    }

    if (!heightCm || heightCm <= 0) {
      return NextResponse.json(
        { error: 'heightCm must be a positive number' },
        { status: 400 }
      )
    }

    if (volumetricDivisor !== undefined && volumetricDivisor <= 0) {
      return NextResponse.json(
        { error: 'volumetricDivisor must be a positive number' },
        { status: 400 }
      )
    }

    await connectDB()

    const package_ = await createShipmentPackage(
      {
        packageName,
        lengthCm,
        breadthCm,
        heightCm,
        volumetricDivisor,
        isActive,
      },
      'superadmin' // TODO: Get from auth context
    )

    return NextResponse.json(
      {
        success: true,
        package: package_,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('[packages API] POST Error:', error)
    console.error('[packages API] POST Error:', error)
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
