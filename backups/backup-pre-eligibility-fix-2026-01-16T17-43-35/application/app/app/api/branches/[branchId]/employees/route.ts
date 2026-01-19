
import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import Branch from '@/lib/models/Branch'
import Employee from '@/lib/models/Employee'
import Location from '@/lib/models/Location'
import mongoose from 'mongoose'

/**
 * GET /api/branches/[branchId]/employees
 * Get employees for a branch
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ branchId: string }> }
) {
  try {
    await connectDB()

    const { branchId } = await params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '10')

    // Find branch - use string ID only
    const branch = await Branch.findOne({ id: branchId }).lean()
    if (!branch) {
      return NextResponse.json(
        { error: `Branch not found: ${branchId}` },
        { status: 404 }
      )
    }

    // Use branch.id (string ID)
    const branchIdStr = branch.id
    
    // Extract companyId as string ID (handle both populated and non-populated cases)
    let companyIdStr: string
    if (typeof branch.companyId === 'object' && branch.companyId !== null && 'id' in branch.companyId) {
      companyIdStr = String((branch.companyId as any).id)
    } else {
      companyIdStr = String(branch.companyId)
    }

    // Find Location(s) that correspond to this Branch (by name, city, state)
    // Employees are linked to Locations, not directly to Branches
    const matchingLocations = await Location.find({
      companyId: companyIdStr,
      name: branch.name,
      city: branch.city,
      state: branch.state
    }).select('id').lean()

    const locationIds = matchingLocations.map(loc => loc.id).filter(Boolean)
    console.log(`[branches/[branchId]/employees] Found ${locationIds.length} matching Location(s) for branch ${branchIdStr}`)

    // Use raw MongoDB collection to query employees efficiently
    // This bypasses Mongoose validation and allows flexible ID format matching
    const db = mongoose.connection.db
    if (!db) {
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      )
    }

    // Query employees by locationId (string IDs) OR branchId (string ID) - no ObjectId fallbacks
    // Employees can be linked to Branches via Locations (locationId) or directly (branchId as string)
    const queryConditions: any[] = []
    
    // Query by locationId using string IDs if Locations found
    if (locationIds.length > 0) {
      queryConditions.push({ locationId: { $in: locationIds } })
    }
    
    // Also try querying by branchId as string ID (in case employees have branchId stored as string)
    queryConditions.push({ branchId: branchIdStr })

    // Query employees using $or to check both locationId and branchId
    const employees = await db.collection('employees').find({
      status: 'active',
      $or: queryConditions
    })
      .limit(limit)
      .toArray()
    
    console.log(`[branches/[branchId]/employees] Query conditions: ${JSON.stringify(queryConditions)}, found ${employees.length} employees for branch ${branchIdStr}`)

    // Format employees - extract only needed fields
    const formattedEmployees = employees.map((emp: any) => ({
      _id: emp._id,
      id: emp.id,
      employeeId: emp.employeeId,
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email
    }))

    return NextResponse.json(formattedEmployees)
  } catch (error: any) {
    console.error('API Error in /api/branches/[branchId]/employees GET:', error)
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
``
