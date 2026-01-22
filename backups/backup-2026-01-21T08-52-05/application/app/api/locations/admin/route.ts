import { NextResponse } from 'next/server'
import { 
  getLocationById,
  updateLocation,
  isCompanyAdmin,
  getEmployeesByCompany
} from '@/lib/db/data-access'
import connectDB from '@/lib/db/mongodb'
import Employee from '@/lib/models/Employee'
import Company from '@/lib/models/Company'

/**
 * POST /api/locations/admin
 * Assign or update Location Admin for a location
 * Body: { locationId, adminId (employeeId), adminEmail, companyId }
 * Authorization: Company Admin only
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    await connectDB()
    
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({ 
        error: 'Invalid JSON in request body' 
      }, { status: 400 })
    }
    
    const { locationId, adminId, adminEmail, companyId } = body

    console.log('POST /api/locations/admin - Request body:', { locationId, adminId, adminEmail, companyId })

    // Validate required parameters
    if (!locationId || !adminEmail || !companyId) {
      console.error('Missing required fields:', { locationId: !!locationId, adminEmail: !!adminEmail, companyId: !!companyId })
      return NextResponse.json({ 
        error: 'Location ID, admin email, and company ID are required' 
      }, { status: 400 })
    }

    // Validate parameter formats
    if (typeof locationId !== 'string' || locationId.trim() === '') {
      return NextResponse.json({ 
        error: 'Invalid location ID format' 
      }, { status: 400 })
    }

    if (typeof adminEmail !== 'string' || adminEmail.trim() === '' || !adminEmail.includes('@')) {
      return NextResponse.json({ 
        error: 'Invalid admin email format' 
      }, { status: 400 })
    }

    if (typeof companyId !== 'string' || companyId.trim() === '') {
      return NextResponse.json({ 
        error: 'Invalid company ID format' 
      }, { status: 400 })
    }

    // Verify Company Admin authorization
    const isAdmin = await isCompanyAdmin(adminEmail, companyId)
    if (!isAdmin) {
      return NextResponse.json({ 
        error: 'Unauthorized: Only Company Admins can assign Location Admins' 
      }, { status: 403 })
    }

    // Get location to verify it belongs to the company
    const location = await getLocationById(locationId)
    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    const locationCompanyId = (location as any).companyId?.id || (location as any).companyId
    if (locationCompanyId !== companyId) {
      return NextResponse.json({ 
        error: 'Location does not belong to your company' 
      }, { status: 403 })
    }

    // Handle adminId assignment or removal
    // adminId can be: string (employeeId), null, undefined, or empty string
    if (adminId && adminId.trim() !== '') {
      // Assign new admin - verify employee exists and belongs to the same company
      const employee = await Employee.findOne({ employeeId: adminId })
      if (!employee) {
        return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
      }

      if (!employee) {
        return NextResponse.json({ 
          error: `Employee not found: ${adminId}` 
        }, { status: 404 })
      }

      // Verify employee belongs to the same company - use string ID
      // CRITICAL: Employee.companyId is stored as STRING ID (6-digit numeric), not ObjectId
      let employeeCompanyId: string | null = null
      if ((employee as any).companyId) {
        if (typeof (employee as any).companyId === 'object' && (employee as any).companyId.id) {
          // Populated companyId object
          employeeCompanyId = (employee as any).companyId.id
        } else if (typeof (employee as any).companyId === 'string') {
          // String ID (could be ObjectId string or company ID string)
          if (/^[A-Za-z0-9_-]{1,50}$/.test((employee as any).companyId)) {
            // It's an alphanumeric company ID string
            employeeCompanyId = (employee as any).companyId
          } else {
            // It's an ObjectId string, need to look up the company
            const company = await Company.findOne({ _id: (employee as any).companyId }).select('id').lean()
            if (company) {
              employeeCompanyId = (company as any).id
            }
          }
        }
      }
      
      if (!employeeCompanyId || employeeCompanyId !== companyId) {
        return NextResponse.json({ 
          error: `Employee ${adminId} does not belong to your company` 
        }, { status: 403 })
      }

      // Update location with new admin
      const updated = await updateLocation(locationId, { adminId })
      return NextResponse.json({ 
        success: true, 
        location: updated,
        message: 'Location Admin assigned successfully'
      })
    } else {
      // Remove Location Admin (adminId is null, undefined, or empty)
      console.log('Removing Location Admin for location:', locationId)
      const updated = await updateLocation(locationId, { adminId: null as any })
      console.log('Location Admin removed successfully:', updated?.id)
      return NextResponse.json({ 
        success: true, 
        location: updated,
        message: 'Location Admin removed successfully'
      })
    }
  } catch (error: any) {
    console.error('API Error in /api/locations/admin POST:', error)
    
    // Return 400 for validation/input errors, 401 for auth errors, 500 for server errors
    if (error.message && (
      error.message.includes('required') ||
      error.message.includes('invalid') ||
      error.message.includes('not found')
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

/**
 * GET /api/locations/admin
 * Get eligible employees for Location Admin assignment
 * Query params: companyId, adminEmail, locationId (optional - if provided, filters by location)
 */
export async function GET(request: Request) {
  try {
    await connectDB()
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const adminEmail = searchParams.get('adminEmail')
    const locationId = searchParams.get('locationId') // Optional: filter by location

    // Validate required parameters
    if (!companyId || !adminEmail) {
      return NextResponse.json({ 
        error: 'Company ID and admin email are required' 
      }, { status: 400 })
    }

    // Validate parameter formats
    if (typeof companyId !== 'string' || companyId.trim() === '') {
      return NextResponse.json({ 
        error: 'Invalid company ID format' 
      }, { status: 400 })
    }

    if (typeof adminEmail !== 'string' || adminEmail.trim() === '' || !adminEmail.includes('@')) {
      return NextResponse.json({ 
        error: 'Invalid admin email format' 
      }, { status: 400 })
    }

    // Verify Company Admin authorization
    const isAdmin = await isCompanyAdmin(adminEmail, companyId)
    if (!isAdmin) {
      return NextResponse.json({ 
        error: 'Unauthorized: Only Company Admins can view eligible employees' 
      }, { status: 403 })
    }

    // Get employees - filter by location if locationId is provided
    let employees: any[] = []

    if (locationId) {
      console.log(`[GET /api/locations/admin] ===== START =====`)
      console.log(`[GET /api/locations/admin] Request params: locationId=${locationId}, companyId=${companyId}, adminEmail=${adminEmail}`)
      
      // Verify location belongs to the company first
      const location = await getLocationById(locationId)
      if (!location) {
        console.error(`[GET /api/locations/admin] Location not found: ${locationId}`)
        return NextResponse.json({ 
          error: 'Location not found' 
        }, { status: 404 })
      }
      
      console.log(`[GET /api/locations/admin] Location found:`, {
        id: (location as any).id,
        name: (location as any).name,
        companyId: (location as any).companyId,
        companyIdType: typeof (location as any).companyId,
        companyIdValue: (location as any).companyId?.id || (location as any).companyId
      })
      
      const locationCompanyId = (location as any).companyId?.id || (location as any).companyId
      console.log(`[GET /api/locations/admin] Location companyId: ${locationCompanyId}, Request companyId: ${companyId}, Match: ${locationCompanyId === companyId}`)
      
      if (locationCompanyId !== companyId) {
        console.error(`[GET /api/locations/admin] Location ${locationId} belongs to company ${locationCompanyId}, but request is for company ${companyId}`)
        return NextResponse.json({ 
          error: 'Location does not belong to your company' 
        }, { status: 403 })
      }
      
      // Get employees for the specific location
      // IMPORTANT: If no location-specific employees found, fallback to ALL company employees
      // This allows assigning Location Admin even if employees don't have locationId set yet
      const { getEmployeesByLocation, getEmployeesByCompany: getEmployeesByCompanyDynamic } = await import('@/lib/db/data-access')
      
      try {
        // Try to get location-specific employees first
        employees = await getEmployeesByLocation(locationId)
        console.log(`[GET /api/locations/admin] getEmployeesByLocation returned ${employees.length} employees for location ${locationId}`)
      } catch (error: any) {
        console.error(`[GET /api/locations/admin] Error in getEmployeesByLocation:`, error.message)
        employees = []
      }
      
      // ALWAYS fallback to all company employees if location-specific query returns 0
      // This is intentional - allows Location Admin assignment even without locationId set on employees
      if (employees.length === 0) {
        console.warn(`[GET /api/locations/admin] No location-specific employees found. Fetching ALL company employees as fallback.`)
        try {
          employees = await getEmployeesByCompanyDynamic(companyId)
          console.log(`[GET /api/locations/admin] Fallback: getEmployeesByCompany returned ${employees.length} total company employees`)
          
          if (employees.length > 0) {
            console.log(`[GET /api/locations/admin] Sample employees (first 3):`, 
              employees.slice(0, 3).map((e: any) => ({
                id: e.id,
                employeeId: e.employeeId,
                location: e.location,
                locationId: e.locationId ? (e.locationId.id || e.locationId) : 'none',
                companyId: e.companyId?.id || e.companyId,
                status: e.status,
                firstName: e.firstName,
                lastName: e.lastName
              }))
            )
          } else {
            console.error(`[GET /api/locations/admin] CRITICAL: No employees found for company ${companyId} at all!`)
          }
        } catch (fallbackError: any) {
          console.error(`[GET /api/locations/admin] CRITICAL: Fallback also failed:`, fallbackError.message)
          console.error(`[GET /api/locations/admin] Fallback error stack:`, fallbackError.stack)
          employees = []
        }
      }
    } else {
      // Get all employees for the company (backward compatibility)
      console.log(`[GET /api/locations/admin] Fetching all employees for companyId: ${companyId}`)
      employees = await getEmployeesByCompany(companyId)
      console.log(`[GET /api/locations/admin] Found ${employees.length} total employees for company`)
    }
    
    // Note: Fallback to all company employees is now handled above in the try-catch block
    // This ensures employees are always available for Location Admin assignment
    
    console.log(`[GET /api/locations/admin] Total employees before filtering: ${employees.length}`)
    
    // CRITICAL: Ensure employee names are decrypted (safety check)
    // Even though getEmployeesByCompany/getEmployeesByLocation should decrypt,
    // we add explicit decryption here as a safety measure
    const { decrypt } = require('@/lib/utils/encryption')
    const decryptedEmployees = employees.map((emp: any) => {
      if (!emp) return null
      const decrypted: any = { ...emp }
      const sensitiveFields = ['firstName', 'lastName', 'email', 'designation']
      
      for (const field of sensitiveFields) {
        if (decrypted[field] && typeof decrypted[field] === 'string' && decrypted[field].includes(':')) {
          try {
            decrypted[field] = decrypt(decrypted[field])
          } catch (error) {
            // If decryption fails, keep original value
            console.warn(`[GET /api/locations/admin] Failed to decrypt employee ${field}:`, error)
          }
        }
      }
      
      return decrypted
    }).filter((emp: any) => emp !== null)
    
    // Return simplified employee list for dropdown
    const eligibleEmployees = decryptedEmployees
      .filter((emp: any) => {
        const isActive = emp.status === 'active'
        if (!isActive && decryptedEmployees.length > 0) {
          console.log(`[GET /api/locations/admin] Filtering out inactive employee: ${emp.employeeId || emp.id} (status: ${emp.status})`)
        }
        return isActive
      })
      .map((emp: any) => ({
        id: emp.id,
        employeeId: emp.employeeId || emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        designation: emp.designation,
        email: emp.email,
        displayName: `${emp.firstName} ${emp.lastName} (${emp.employeeId || emp.id}) - ${emp.designation || 'N/A'}`
      }))
      .sort((a: any, b: any) => {
        // Sort by name
        const nameA = `${a.firstName} ${a.lastName}`.toLowerCase()
        const nameB = `${b.firstName} ${b.lastName}`.toLowerCase()
        return nameA.localeCompare(nameB)
      })

    console.log(`[GET /api/locations/admin] ===== END =====`)
    console.log(`[GET /api/locations/admin] Returning ${eligibleEmployees.length} eligible employees (after filtering for active status).`)
    
    if (eligibleEmployees.length === 0 && employees.length > 0) {
      console.warn(`[GET /api/locations/admin] WARNING: ${employees.length} employees found but all are inactive!`)
    } else if (eligibleEmployees.length === 0 && employees.length === 0) {
      console.error(`[GET /api/locations/admin] CRITICAL: No employees found at all for company ${companyId}!`)
    }

    return NextResponse.json({ employees: eligibleEmployees })
  } catch (error: any) {
    console.error('API Error in /api/locations/admin GET:', error)
    
    // Return 400 for validation/input errors, 500 for server errors
    if (error.message && (
      error.message.includes('required') ||
      error.message.includes('invalid') ||
      error.message.includes('not found') ||
      error.message.includes('Unauthorized')
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
