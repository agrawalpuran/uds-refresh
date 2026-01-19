
import { NextResponse } from 'next/server'
import { getReturnRequestsByCompany } from '@/lib/db/data-access'

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const status = searchParams.get('status')

    if (!companyId) {
      return NextResponse.json(
        { error: 'Missing required parameter: companyId' },
        { status: 400 }
      )
    }

    // Only pass status if it's a valid value (not empty string)
    const statusFilter = status && status.trim() ? status.trim() : undefined

    const returnRequests = await getReturnRequestsByCompany(companyId, statusFilter)
    return NextResponse.json(returnRequests, { status: 200 })
  } catch (error: any) {
    console.error('Error fetching company return requests:', error)
    console.error('Error stack:', error.stack)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'

    // Return 400 for validation/input errors
    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing')
    ) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }

    // Return 404 for not found errors
    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('Not found') ||
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    }

    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
