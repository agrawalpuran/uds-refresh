import { NextResponse, NextRequest } from 'next/server'
// Ensure Branch model is registered before Employee queries
import '@/lib/models/Branch'
import { 
  getAllEmployees, 
  getEmployeeByEmail, 
  getEmployeeById, 
  getEmployeesByCompany,
  createEmployee,
  updateEmployee,
  deleteEmployee
} from '@/lib/db/data-access'
import { getUserEmailFromRequest } from '@/lib/utils/api-auth'


// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')
    const employeeId = searchParams.get('employeeId')
    const companyId = searchParams.get('companyId')
    
    // Extract user email for role-based data processing
    const userEmail = await getUserEmailFromRequest(request)

    if (email) {
      console.log(`[API /api/employees] Getting employee by email: ${email}`)
      // For self-view, use the email parameter as userEmail (employee viewing their own data)
      const requestingUserEmail = userEmail || email
      const employee = await getEmployeeByEmail(email, requestingUserEmail)
      if (!employee) {
        console.log(`[API /api/employees] Employee not found for email: ${email}`)
        return NextResponse.json(null, { status: 404 })
      }
      console.log(`[API /api/employees] Employee found:`, {
        id: employee.id,
        email: employee.email,
        companyId: employee.companyId,
        companyIdType: typeof employee.companyId,
        companyName: employee.companyName
      })
      console.log(`[API /api/employees] Full employee object keys:`, Object.keys(employee))
      return NextResponse.json(employee)
    }

    if (employeeId) {
      const forShipment = searchParams.get('forShipment') === 'true'
      const employee = await getEmployeeById(employeeId, userEmail || undefined, forShipment)
      if (!employee) {
        return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
      }
      return NextResponse.json(employee)
    }

    if (companyId) {
      console.log(`[API /api/employees] Getting employees for companyId: ${companyId}, userEmail: ${userEmail || 'NOT PROVIDED'}`)
      const employees = await getEmployeesByCompany(companyId, userEmail || undefined)
      console.log(`[API /api/employees] Returning ${employees?.length || 0} employees for companyId: ${companyId}`)
      if (employees && employees.length > 0) {
        console.log(`[API /api/employees] First employee sample:`, {
          id: employees[0].id,
          employeeId: employees[0].employeeId,
          firstName: employees[0].firstName,
          lastName: employees[0].lastName,
          firstNameEncrypted: employees[0].firstName?.includes(':'),
          lastNameEncrypted: employees[0].lastName?.includes(':'),
          companyId: employees[0].companyId
        })
      }
      return NextResponse.json(employees)
    }

    const employees = await getAllEmployees(userEmail || undefined)
    return NextResponse.json(employees)
  } catch (error: any) {
    console.error('API Error in /api/employees:', error)
    console.error('Error stack:', error.stack)
    
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
        errorMessage.includes('not found')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    // Return 500 for server errors
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || errorMessage.includes('Not found') || errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ 
      error: errorMessage,
      type: isConnectionError ? 'database_connection_error' : 'api_error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
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
    
    // Validate that companyId is provided and not empty
    if (!body.companyId || body.companyId.trim() === '') {
      return NextResponse.json({ 
        error: 'companyId is required and cannot be empty. Every employee must be associated with a company.'
      }, { status: 400 })
    }
    
    // companyName is optional - it will be derived from companyId lookup
    // Remove companyName from body to ensure it's always derived from companyId
    if (body.companyName) {
      delete body.companyName
    }
    
    const employee = await createEmployee(body)
    
    return NextResponse.json(employee, { status: 201 })
  } catch (error: any) {
    console.error('API Error creating employee:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to create employee'
    }, { status: 400 })
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
    
    const { employeeId, ...updateData } = body
    
    if (!employeeId) {
      return NextResponse.json({ 
        error: 'Employee ID is required'
      }, { status: 400 })
    }
    const employee = await updateEmployee(employeeId, updateData)
    
    return NextResponse.json(employee)
  } catch (error: any) {
    console.error('API Error updating employee:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to update employee'
    }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    
    if (!employeeId) {
      return NextResponse.json({ 
        error: 'Employee ID is required'
      }, { status: 400 })
    }
    
    await deleteEmployee(employeeId)
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('API Error deleting employee:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to delete employee'
    }, { status: 400 });
  }
}
