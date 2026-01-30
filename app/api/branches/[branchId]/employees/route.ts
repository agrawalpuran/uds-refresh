
import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import Employee from '@/lib/models/Employee'
import Location from '@/lib/models/Location'
import mongoose from 'mongoose'

/**
 * GET /api/branches/[branchId]/employees
 * Get employees for a branch (now uses Location collection)
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

    console.log(`[branches/[branchId]/employees] Received branchId: "${branchId}", limit: ${limit}`)

    // Find location (branch) - use string ID only
    const location = await Location.findOne({ id: branchId }).lean()
    console.log(`[branches/[branchId]/employees] Location lookup result:`, location ? `Found: ${location.name} (id: ${location.id})` : 'NOT FOUND')
    
    if (!location) {
      return NextResponse.json(
        { error: `Branch not found: ${branchId}` },
        { status: 404 }
      )
    }

    // Use location.id (string ID)
    const locationIdStr = location.id
    
    // Extract companyId as string ID
    const companyIdStr = String(location.companyId)

    console.log(`[branches/[branchId]/employees] Looking for employees in location ${locationIdStr} (company: ${companyIdStr})`)

    // Use raw MongoDB collection to query employees efficiently
    const db = mongoose.connection.db
    if (!db) {
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      )
    }

    // Query employees by locationId - employees are linked via locationId
    const query = {
      status: 'active',
      locationId: locationIdStr
    }
    console.log(`[branches/[branchId]/employees] Querying employees with:`, JSON.stringify(query))
    
    const employees = await db.collection('employees').find(query)
      .limit(limit)
      .toArray()
    
    console.log(`[branches/[branchId]/employees] Found ${employees.length} employees for location ${locationIdStr}`)
    if (employees.length > 0) {
      console.log(`[branches/[branchId]/employees] First employee:`, employees[0].employeeId, employees[0].firstName, employees[0].lastName)
    }

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
