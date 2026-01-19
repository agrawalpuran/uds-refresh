import { NextResponse } from 'next/server'
import { 
  createLocation,
  getLocationsByCompany,
  isCompanyAdmin,
  getCompanyById
} from '@/lib/db/data-access'
import connectDB from '@/lib/db/mongodb'
import Location from '@/lib/models/Location'
import Employee from '@/lib/models/Employee'
import Company from '@/lib/models/Company'

interface BulkLocationRow {
  name: string
  adminId?: string // Employee ID (6-digit numeric string) - Location Admin
  address?: string
  city?: string
  state?: string
  pincode?: string
  phone?: string
  email?: string
  status?: 'active' | 'inactive'
  rowNumber: number
}

interface BulkLocationResult {
  rowNumber: number
  name: string
  locationId?: string
  status: 'success' | 'failed'
  error?: string
}


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
    const { locations, companyId, adminEmail } = body

    if (!locations || !Array.isArray(locations)) {
      return NextResponse.json({ error: 'Invalid locations data' }, { status: 400 })
    }

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 })
    }

    if (!adminEmail) {
      return NextResponse.json({ error: 'Admin email is required' }, { status: 400 })
    }

    // Verify company exists
    const company = await Company.findOne({ id: companyId })
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Verify Company Admin permissions
    const isAdmin = await isCompanyAdmin(adminEmail, companyId)
    if (!isAdmin) {
      return NextResponse.json({ 
        error: 'Unauthorized: Only company admins can bulk upload locations' 
      }, { status: 403 })
    }

    // Get existing locations for this company to check duplicates
    const existingLocations = await getLocationsByCompany(companyId)
    const existingLocationNames = new Set(
      existingLocations.map((loc: any) => loc.name.toLowerCase().trim())
    )

    // Get all employees for this company (for adminId validation)
    // CRITICAL FIX: Employee.companyId is stored as STRING ID, not ObjectId - use company.id
    const companyEmployees = await Employee.find({ companyId: company.id }).lean()
    const companyEmployeeIds = new Set(
      companyEmployees.map((e: any) => e.employeeId || e.id)
    )

    const results: BulkLocationResult[] = []
    const processedLocationNames = new Set<string>() // Track names in current batch to prevent duplicates

    // Process each location row
    for (const locationRow of locations) {
      const row: BulkLocationRow = {
        name: locationRow.name?.trim() || '',
        adminId: locationRow.adminId?.trim(),
        address: locationRow.address?.trim(),
        city: locationRow.city?.trim(),
        state: locationRow.state?.trim(),
        pincode: locationRow.pincode?.trim(),
        phone: locationRow.phone?.trim(),
        email: locationRow.email?.trim(),
        status: locationRow.status || 'active',
        rowNumber: locationRow.rowNumber || 0
      }

      // Validate mandatory fields
      if (!row.name) {
        results.push({
          rowNumber: row.rowNumber,
          name: row.name,
          status: 'failed',
          error: 'Location name is required'
        })
        continue
      }

      // Check for duplicate location name in existing locations
      const normalizedName = row.name.toLowerCase().trim()
      if (existingLocationNames.has(normalizedName)) {
        results.push({
          rowNumber: row.rowNumber,
          name: row.name,
          status: 'failed',
          error: `Location with name "${row.name}" already exists for this company`
        })
        continue
      }

      // Check for duplicate location name in current batch
      if (processedLocationNames.has(normalizedName)) {
        results.push({
          rowNumber: row.rowNumber,
          name: row.name,
          status: 'failed',
          error: `Duplicate location name "${row.name}" in upload file`
        })
        continue
      }

      // Validate adminId if provided
      if (row.adminId) {
        if (!companyEmployeeIds.has(row.adminId)) {
          results.push({
            rowNumber: row.rowNumber,
            name: row.name,
            status: 'failed',
            error: `Location Admin employee ID "${row.adminId}" not found or does not belong to this company`
          })
          continue
        }
      }

      // Validate status
      if (row.status && !['active', 'inactive'].includes(row.status)) {
        results.push({
          rowNumber: row.rowNumber,
          name: row.name,
          status: 'failed',
          error: `Invalid status "${row.status}". Must be "active" or "inactive"`
        })
        continue
      }

      // Create location (adminId is now optional in createLocation)
      try {
        const location = await createLocation({
          name: row.name,
          companyId: companyId,
          adminId: row.adminId, // Optional - can be undefined
          address_line_1: row.address || row.name || 'Address not provided',
          city: row.city || 'Unknown',
          state: row.state || 'Unknown',
          pincode: row.pincode || '000000',
          phone: row.phone,
          email: row.email,
          status: row.status as 'active' | 'inactive'
        })

        results.push({
          rowNumber: row.rowNumber,
          name: row.name,
          locationId: location.id,
          status: 'success'
        })

        // Mark name as processed
        processedLocationNames.add(normalizedName)
        // Add to existing names to prevent duplicates in subsequent rows
        existingLocationNames.add(normalizedName)

      } catch (error: any) {
        results.push({
          rowNumber: row.rowNumber,
          name: row.name,
          status: 'failed',
          error: error.message || 'Failed to create location'
        })
      }
    }

    // Summary
    const successCount = results.filter(r => r.status === 'success').length
    const failureCount = results.filter(r => r.status === 'failed').length

    return NextResponse.json({
      success: true,
      total: locations.length,
      successful: successCount,
      failed: failureCount,
      results: results
    }, { status: 200 })
  } catch (error: any) {
    console.error('API Error in /api/locations/bulk POST:', error)
    // Return appropriate status code based on error type
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
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
