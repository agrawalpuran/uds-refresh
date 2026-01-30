import { NextResponse } from 'next/server'
import { 
  createLocation,
  getLocationsByCompany,
  getLocationById,
  updateLocation,
  deleteLocation,
  getAllLocations,
  isCompanyAdmin,
  getLocationByAdminEmail
} from '@/lib/db/data-access'

/**
 * GET /api/locations
 * Query params:
 * - companyId: Get locations for a specific company
 * - locationId: Get a specific location
 * - email: Check if user is Company Admin (for authorization)
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const locationId = searchParams.get('locationId')
    const email = searchParams.get('email')
    const getByAdminEmail = searchParams.get('getByAdminEmail') === 'true'

    // Get location by admin email
    if (getByAdminEmail && email) {
      const location = await getLocationByAdminEmail(email)
      // Return 200 with null instead of 404 - 404 is expected when user is not a location admin
      // This prevents console errors for normal cases
      return NextResponse.json(location || null, { status: 200 })
    }
    // Get specific location
    if (locationId) {
      const location = await getLocationById(locationId)
      if (!location) {
        return NextResponse.json({ error: 'Location not found' }, { status: 404 })
      }
      return NextResponse.json(location)
    }
    // Get locations for a company
    if (companyId) {
      // Verify authorization if email provided
      if (email) {
        const isAdmin = await isCompanyAdmin(email, companyId)
        if (!isAdmin) {
          return NextResponse.json({ error: 'Unauthorized: Company Admin access required' }, { status: 403 })
        }
      }
      
      const locations = await getLocationsByCompany(companyId)
      return NextResponse.json(locations)
    }

    // Get all locations (Super Admin only - no auth check here, should be done at UI level)
    const locations = await getAllLocations()
    return NextResponse.json(locations)
  } catch (error: any) {
    console.error('API Error:', error)
    
    // Return 400 for validation/input errors, 401 for auth errors, 500 for server errors
    if (error.message && (
      error.message.includes('required') ||
      error.message.includes('invalid') ||
      error.message.includes('not found') ||
      error.message.includes('Missing')
    )) {
      return NextResponse.json({ 
        error: error.message || 'Invalid request' 
      }, { status: 400 })
    }
    
    if (error.message && error.message.includes('Unauthorized')) {
      return NextResponse.json({ 
        error: error.message || 'Unauthorized' 
      }, { status: 401 })
    }
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

/**
 * POST /api/locations
 * Create a new location
 * Body: { name, companyId, adminId, address?, city?, state?, pincode?, phone?, email?, status? }
 * Authorization: Company Admin of the specified company
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
      name, 
      companyId, 
      adminId, 
      adminEmail, 
      email, 
      address, 
      address_line_1, 
      address_line_2, 
      address_line_3, 
      city, 
      state, 
      pincode, 
      country,
      phone, 
      locationEmail, 
      status 
    } = body

    // Validate required fields (adminId is now optional)
    if (!name || !companyId) {
      return NextResponse.json({ 
        error: 'Missing required fields: name and companyId are required' 
      }, { status: 400 })
    }
    
    // Validate parameter formats
    if (typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ 
        error: 'Invalid name format' 
      }, { status: 400 })
    }
    
    if (typeof companyId !== 'string' || companyId.trim() === '') {
      return NextResponse.json({ 
        error: 'Invalid company ID format' 
      }, { status: 400 })
    }
    
    // Use adminEmail from body or email parameter
    const userEmail = adminEmail || email

    // Verify authorization: user must be Company Admin
    if (!userEmail) {
      return NextResponse.json({ error: 'Email is required for authorization' }, { status: 401 })
    }

    const isAdmin = await isCompanyAdmin(userEmail, companyId)
    if (!isAdmin) {
      return NextResponse.json({ 
        error: 'Unauthorized: Only Company Admins can create locations' 
      }, { status: 403 })
    }

    // Create location (adminId is optional)
    // Support both old format (address) and new format (address_line_1, address_line_2, address_line_3)
    const location = await createLocation({
      name,
      companyId,
      adminId: adminId || undefined, // Optional
      address_line_1: address_line_1 || address || '',
      address_line_2: address_line_2,
      address_line_3: address_line_3,
      city,
      state,
      pincode,
      country,
      phone,
      email: locationEmail, // Use locationEmail to avoid conflict with user email
      status: status || 'active'
    })

    return NextResponse.json(location, { status: 201 })
  } catch (error: any) {
    console.error('API Error:', error)
    
    // Return 400 for validation/input errors, 401 for auth errors, 500 for server errors
    if (error.message && (
      error.message.includes('required') ||
      error.message.includes('invalid') ||
      error.message.includes('not found') ||
      error.message.includes('Missing')
    )) {
      return NextResponse.json({ 
        error: error.message || 'Invalid request' 
      }, { status: 400 })
    }
    
    if (error.message && error.message.includes('Unauthorized')) {
      return NextResponse.json({ 
        error: error.message || 'Unauthorized' 
      }, { status: 401 })
    }
    
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

/**
 * PATCH /api/locations
 * Update a location
 * Body: { locationId, email, ...updateFields }
 * Authorization: Company Admin of the location's company
 */
export async function PATCH(request: Request) {
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
    
    // Extract adminEmail for authorization (logged-in user's email)
    // email in updateFields is the location's contact email
    const { locationId, adminEmail, email, ...updateFields } = body

    if (!locationId) {
      return NextResponse.json({ error: 'Location ID is required' }, { status: 400 })
    }
    
    // Validate parameter format
    if (typeof locationId !== 'string' || locationId.trim() === '') {
      return NextResponse.json({ 
        error: 'Invalid location ID format' 
      }, { status: 400 })
    }

    // Use adminEmail for authorization (logged-in user's email)
    const userEmail = adminEmail?.trim().toLowerCase()
    if (!userEmail) {
      console.error('[PATCH /locations] Missing adminEmail:', { adminEmail, email, body })
      return NextResponse.json({ error: 'Admin email is required for authorization' }, { status: 401 })
    }

    console.log('[PATCH /locations] Request received:', { locationId, userEmail: adminEmail, hasAdminEmail: !!adminEmail, hasLocationEmail: !!email })

    // Get location to find its company
    const location = await getLocationById(locationId)
    if (!location) {
      console.error('[PATCH /locations] Location not found:', locationId)
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // Extract companyId - handle both populated and non-populated cases
    let companyId: string | null = null
    if (location.companyId) {
      if (typeof location.companyId === 'object' && location.companyId !== null) {
        // Populated: { _id: ObjectId, id: '100001', name: '...' }
        companyId = location.companyId.id || null
      } else if (typeof location.companyId === 'string') {
        // String ID
        companyId = location.companyId
      }
    }

    if (!companyId) {
      console.error('[PATCH /locations] Location has no associated company:', { locationId, location, companyIdType: typeof location.companyId })
      return NextResponse.json({ 
        error: 'Location has no associated company'
      }, { status: 400 })
    }

    console.log('[PATCH /locations] Authorization check:', { userEmail, companyId, locationId })
    const isAdmin = await isCompanyAdmin(userEmail, companyId)
    console.log('[PATCH /locations] isCompanyAdmin result:', isAdmin, { userEmail, companyId })
    
    if (!isAdmin) {
      console.error('[PATCH /locations] Authorization failed:', { 
        userEmail, 
        companyId, 
        locationId,
        locationCompanyId: location.companyId 
      })
      return NextResponse.json({ 
        error: 'Unauthorized: Only Company Admins can update locations' 
      }, { status: 403 })
    }
    
    console.log('[PATCH /locations] Authorization successful, proceeding with update')

    // Include email (location's contact email) in updateFields if provided
    const finalUpdateFields = email ? { ...updateFields, email } : updateFields
    const updated = await updateLocation(locationId, finalUpdateFields)
    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('API Error:', error)
    
    
    // Return 400 for validation/input errors, 401 for auth errors, 500 for server errors
    if (error.message && (
      error.message.includes('required') ||
      error.message.includes('invalid') ||
      error.message.includes('not found') ||
      error.message.includes('Missing')
    )) {
      return NextResponse.json({ 
        error: error.message || 'Invalid request' 
      }, { status: 400 })
    
    if (error.message && error.message.includes('Unauthorized')) {
      return NextResponse.json({ 
        error: error.message || 'Unauthorized' 
      }, { status: 401 })
    }
    
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
}

/**
 * DELETE /api/locations
 * Delete a location
 * Query params: locationId, adminEmail, companyId
 * Authorization: Company Admin of the location's company
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const locationId = searchParams.get('locationId')
    const adminEmail = searchParams.get('adminEmail')
    const companyId = searchParams.get('companyId')

    if (!locationId || !adminEmail || !companyId) {
      return NextResponse.json({ 
        error: 'Location ID, admin email, and company ID are required' 
      }, { status: 400 })
    }

    // Verify authorization: user must be Company Admin
    const isAdmin = await isCompanyAdmin(adminEmail, companyId)
    if (!isAdmin) {
      return NextResponse.json({ 
        error: 'Unauthorized: Only Company Admins can delete locations' 
      }, { status: 403 })
    }

    // Delete location
    await deleteLocation(locationId)
    return NextResponse.json({ success: true, message: 'Location deleted successfully' })
  } catch (error: any) {
    console.error('API Error:', error)
    
    // Return 400 for validation/input errors, 401 for auth errors, 500 for server errors
    if (error.message && (
      error.message.includes('required') ||
      error.message.includes('invalid') ||
      error.message.includes('not found') ||
      error.message.includes('Missing')
    )) {
      return NextResponse.json({ 
        error: error.message || 'Invalid request' 
      }, { status: 400 })
    }
    
    if (error.message && error.message.includes('Unauthorized')) {
      return NextResponse.json({ 
        error: error.message || 'Unauthorized' 
      }, { status: 401 })
    }
    
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

