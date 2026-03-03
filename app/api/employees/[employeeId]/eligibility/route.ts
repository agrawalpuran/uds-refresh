import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/utils/api-auth-context'
import { getEmployeeEligibilityFromDesignation } from '@/lib/db/data-access'

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const resolvedParams = await params
    const employeeId = resolvedParams.employeeId

    if (!employeeId) {
      return NextResponse.json(
        { error: 'Missing employee ID' },
        { status: 400 }
      )
    }

    const eligibility = await getEmployeeEligibilityFromDesignation(employeeId)
    return NextResponse.json(eligibility, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    })

  } catch (error: any) {
    console.error('Error fetching employee eligibility:', error)
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
