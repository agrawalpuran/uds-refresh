import { NextResponse } from 'next/server'
import {
  getVendorShippingRoutingById,
  updateVendorShippingRouting,
  deleteVendorShippingRouting,
} from '@/lib/db/vendor-shipping-routing-access'

/**
 * GET /api/superadmin/vendor-shipping-routing/[routingId]
 * Get vendor shipping routing by ID
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ routingId: string }> }
) {
  try {
    // Handle both Promise and direct params (Next.js 13+ vs 15+)
    const resolvedParams = await params
    const { routingId } = resolvedParams

    if (!routingId || routingId === 'undefined' || routingId.trim() === '') {
      return NextResponse.json(
        { error: 'Routing ID is required' },
        { status: 400 }
      )
    }

    const routing = await getVendorShippingRoutingById(routingId)

    if (!routing) {
      return NextResponse.json(
        { error: `Routing not found: ${routingId}` },
        { status: 404 }
      )
    }

    return NextResponse.json({ routing })
  } catch (error: any) {
    console.error('API Error in /api/superadmin/vendor-shipping-routing/[routingId] GET:', error)
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
 * PUT /api/superadmin/vendor-shipping-routing/[routingId]
 * Update vendor shipping routing
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ routingId: string }> }
) {
  try {
    // Handle both Promise and direct params (Next.js 13+ vs 15+)
    const resolvedParams = await params
    const { routingId } = resolvedParams
    
    console.log('[API PUT /vendor-shipping-routing] Received routingId:', routingId)
    
    if (!routingId || routingId === 'undefined' || routingId.trim() === '') {
      console.error('[API PUT /vendor-shipping-routing] Invalid routingId:', routingId)
      return NextResponse.json(
        { error: 'Routing ID is required and cannot be undefined' },
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
    const { primaryCourierCode, secondaryCourierCode, isActive } = body

    console.log('[API PUT /vendor-shipping-routing] Updating routing:', {
      routingId,
      primaryCourierCode,
      secondaryCourierCode,
      isActive,
    })

    const routing = await updateVendorShippingRouting(
      routingId,
      {
        primaryCourierCode,
        secondaryCourierCode,
        isActive,
      },
      'superadmin'
    )

    console.log('[API PUT /vendor-shipping-routing] Successfully updated routing:', routingId)
    return NextResponse.json({ routing })
  } catch (error: any) {
    console.error('API Error in /api/superadmin/vendor-shipping-routing/[routingId] PUT:', error)
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
 * DELETE /api/superadmin/vendor-shipping-routing/[routingId]
 * Delete vendor shipping routing
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ routingId: string }> }
) {
  try {
    // Handle both Promise and direct params (Next.js 13+ vs 15+)
    const resolvedParams = await params
    const { routingId } = resolvedParams

    if (!routingId || routingId === 'undefined' || routingId.trim() === '') {
      return NextResponse.json(
        { error: 'Routing ID is required' },
        { status: 400 }
      )
    }

    await deleteVendorShippingRouting(routingId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('API Error in /api/superadmin/vendor-shipping-routing/[routingId] DELETE:', error)
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
