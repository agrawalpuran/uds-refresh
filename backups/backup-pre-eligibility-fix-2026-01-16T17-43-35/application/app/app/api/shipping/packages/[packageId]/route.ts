import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import {
  getShipmentPackageById,
  updateShipmentPackage,
  deleteShipmentPackage,
} from '@/lib/db/shipment-package-access'

/**
 * GET /api/shipping/packages/:packageId
 * Get a specific shipment package
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(
  request: Request,
  { params }: { params: Promise<{ packageId: string }> }
) {
  try {
    const resolvedParams = await params
    const { packageId } = resolvedParams

    if (!packageId) {
      return NextResponse.json(
        { error: 'packageId is required' },
        { status: 400 }
      )

    await connectDB()

    const package_ = await getShipmentPackageById(packageId)

    }
    if (!package_) {
      return NextResponse.json(
        { error: 'Package not found' },
        { status: 404 }
      )

    return NextResponse.json({
      success: true,
      package: package_,
    }, { status: 200 })
  } catch (error) {
    const err = error as any;
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
 * PUT /api/shipping/packages/:packageId
 * Update a shipment package
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ packageId: string }> }
) {
  try {
    const resolvedParams = await params
    const { packageId } = resolvedParams
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    const { packageName, lengthCm, breadthCm, heightCm, volumetricDivisor, isActive } = body

    if (!packageId) {
      return NextResponse.json(
        { error: 'packageId is required' },
        { status: 400 }
      )

    // Validation
    }
    if (lengthCm !== undefined && lengthCm <= 0) {
      return NextResponse.json(
        { error: 'lengthCm must be a positive number' },
        { status: 400 }
      )

    if (breadthCm !== undefined && breadthCm <= 0) {
      return NextResponse.json(
        { error: 'breadthCm must be a positive number' },
        { status: 400 }
      )

    }
    if (heightCm !== undefined && heightCm <= 0) {
      return NextResponse.json(
        { error: 'heightCm must be a positive number' },
        { status: 400 }
      )

    if (volumetricDivisor !== undefined && volumetricDivisor <= 0) {
      return NextResponse.json(
        { error: 'volumetricDivisor must be a positive number' },
        { status: 400 }
      )

    await connectDB()

    }
    const package_ = await updateShipmentPackage(
      packageId,
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

    return NextResponse.json({
      success: true,
      package: package_,
    }, { status: 200 })
  } catch (error) {
    const err = error as any;
    console.error('[packages API] PUT Error:', error)
    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      )
    return NextResponse.json(
      {
        error: error.message || 'Unknown error occurred',
        type: 'api_error',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
}

/**
 * DELETE /api/shipping/packages/:packageId
 * Delete a shipment package
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ packageId: string }> }
) {
  try {
    const resolvedParams = await params
    const { packageId } = resolvedParams

    if (!packageId) {
      return NextResponse.json(
        { error: 'packageId is required' },
        { status: 400 }
      )

    await connectDB()

    await deleteShipmentPackage(packageId)

    return NextResponse.json({
      success: true,
      message: 'Package deleted successfully',
    }, { status: 200 })
  } catch (error) {
    const err = error as any;
    console.error('[packages API] DELETE Error:', error)
    if (error.message?.includes('not found')) {
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      )
    return NextResponse.json(
      {
        error: error.message || 'Unknown error occurred',
        type: 'api_error',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
}
}}}}}}}}}}}}
