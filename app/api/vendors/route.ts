
import { NextResponse } from 'next/server'
import { getAllVendors, getVendorById, getVendorByEmail, createVendor, updateVendor } from '@/lib/db/data-access'

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const vendorId = searchParams.get('vendorId')
    const email = searchParams.get('email')

    if (email) {
      // CRITICAL: Sanitize and validate email before querying
      const sanitizedEmail = email.trim()
      // Check if this is a role-check (returns 200 with null instead of 404)
      const roleCheck = searchParams.get('roleCheck') === 'true'
      
      console.log(`[API /vendors] Looking up vendor by email: ${sanitizedEmail}${roleCheck ? ' (role check)' : ''}`)
      
      try {
        const vendor = await getVendorByEmail(sanitizedEmail)
        if (!vendor) {
          // For role checks, return 200 with null instead of 404
          // This prevents browser console from logging 404 errors
          if (roleCheck) {
            return NextResponse.json(null)
          }
          console.log(`[API /vendors] Vendor not found for email: ${sanitizedEmail}`)
          return NextResponse.json({ error: 'Vendor not found with this email' }, { status: 404 })
        }
        console.log(`[API /vendors] ✅ Vendor found: ${vendor.id} (${vendor.name})`)
        return NextResponse.json(vendor)
      } catch (dbError: any) {
        // CRITICAL: Differentiate between "not found" and "database error"
        console.error(`[API /vendors] ❌ Database error during vendor lookup:`, dbError)

        // Check if it's a MongoDB connection error
        if (
          dbError?.message &&
          (
            dbError.message.includes('Password contains unescaped characters') ||
            dbError.message.includes('MongoParseError') ||
            dbError.message.includes('connection') ||
            dbError.message.includes('authentication')
          )
        ) {
          console.error(`[API /vendors] ❌ CRITICAL: MongoDB connection/authentication error`)
          return NextResponse.json({ 
            error: 'Database connection error. Please contact system administrator.',
            details: 'MongoDB connection failed',
            code: 'DB_CONNECTION_ERROR'
          }, { status: 500 })
        }

        // For other errors, return generic error (don't expose vendor existence)
        return NextResponse.json({ 
          error: 'Error looking up vendor. Please try again.',
          code: 'QUERY_ERROR'
        }, { status: 500 })
      }
    }

    if (vendorId) {
      const vendor = await getVendorById(vendorId)
      if (!vendor) {
        return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
      }
      return NextResponse.json(vendor)
    }

    const vendors = await getAllVendors()
    return NextResponse.json(vendors)
  } catch (error: any) {
    console.error('[API /vendors] ❌ Unexpected error:', error)
    // Return appropriate status code based on error type
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    const isConnectionError = errorMessage.includes('Mongo') || 
                              errorMessage.includes('connection') || 
                              errorMessage.includes('ECONNREFUSED') ||
                              errorMessage.includes('timeout') ||
                              errorMessage.includes('network') ||
                              error?.code === 'ECONNREFUSED' ||
                              error?.code === 'ETIMEDOUT' ||
                              error?.name === 'MongoNetworkError' ||
                              error?.name === 'MongoServerSelectionError'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
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
    
    // Validate required fields
    if (!body.name || !body.email) {
      return NextResponse.json({ 
        error: 'Vendor name and email are required' 
      }, { status: 400 })
    }

    const vendor = await createVendor(body)
    return NextResponse.json(vendor)
  } catch (error: any) {
    console.error('API Error:', error)
    
    // Return 400 for validation errors, 500 for server errors
    if (error?.message && (
      error.message.includes('required') ||
      error.message.includes('invalid') ||
      error.message.includes('duplicate') ||
      error.message.includes('already exists')
    )) {
      return NextResponse.json({ 
        error: error.message || 'Invalid request' 
      }, { status: 400 })
    }
    
    // Return appropriate status code based on error type
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    const isConnectionError = errorMessage.includes('Mongo') || 
                              errorMessage.includes('connection') || 
                              errorMessage.includes('ECONNREFUSED') ||
                              errorMessage.includes('timeout') ||
                              errorMessage.includes('network') ||
                              (error as any)?.code === 'ECONNREFUSED' ||
                              (error as any)?.code === 'ETIMEDOUT' ||
                              (error as any)?.name === 'MongoNetworkError' ||
                              (error as any)?.name === 'MongoServerSelectionError'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
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
    
    const { vendorId, ...vendorData } = body
    
    if (!vendorId) {
      return NextResponse.json({ error: 'Vendor ID is required' }, { status: 400 })
    }
    
    // Validate vendor ID format
    if (typeof vendorId !== 'string' || vendorId.trim() === '') {
      return NextResponse.json({ 
        error: 'Invalid vendor ID format' 
      }, { status: 400 })
    }
    
    const vendor = await updateVendor(vendorId, vendorData)
    return NextResponse.json(vendor)
  } catch (error: any) {
    console.error('API Error:', error)
    
    // Return 400 for validation errors, 500 for server errors
    if (error?.message && (
      error.message.includes('required') ||
      error.message.includes('invalid') ||
      error.message.includes('not found')
    )) {
      return NextResponse.json({ 
        error: error.message || 'Invalid request' 
      }, { status: 400 })
    }
    
    // Return appropriate status code based on error type
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    const isConnectionError = errorMessage.includes('Mongo') || 
                              errorMessage.includes('connection') || 
                              errorMessage.includes('ECONNREFUSED') ||
                              errorMessage.includes('timeout') ||
                              errorMessage.includes('network') ||
                              (error as any)?.code === 'ECONNREFUSED' ||
                              (error as any)?.code === 'ETIMEDOUT' ||
                              (error as any)?.name === 'MongoNetworkError' ||
                              (error as any)?.name === 'MongoServerSelectionError'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
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
