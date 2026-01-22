
import { NextResponse } from 'next/server'
import { markFeedbackAsViewed, getCompanyByAdminEmail } from '@/lib/db/data-access'

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const { companyId, adminEmail } = body
    
    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      )
    }

    if (!adminEmail) {
      return NextResponse.json(
        { error: 'Admin email is required' },
        { status: 400 }
      )
    }

    // Validate that the admin has access to this company
    const company = await getCompanyByAdminEmail(adminEmail.trim().toLowerCase())
    if (!company) {
      return NextResponse.json(
        { error: 'Unauthorized: Admin email not found or not a Company Admin' },
        { status: 403 }
      )
    }

    // Verify the companyId matches the admin's company
    const companyIdStr = String(company.id || company._id?.toString() || '')
    const requestCompanyIdStr = String(companyId || '')

    if (
      companyIdStr !== requestCompanyIdStr &&
      company._id?.toString() !== requestCompanyIdStr
    ) {
      return NextResponse.json(
        { error: 'Forbidden: Admin does not have access to this company' },
        { status: 403 }
      )
    }

    // Use the validated company ID (from company object, not request)
    const validatedCompanyId = company.id || company._id?.toString() || companyId

    // Mark feedback as viewed
    await markFeedbackAsViewed(validatedCompanyId, adminEmail)

    return NextResponse.json({
      success: true,
      message: 'Feedback marked as viewed'
    })

  } catch (error: any) {
    console.error('Error marking feedback as viewed:', error)
    console.error('Error stack:', error.stack)

    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('Invalid JSON')
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

    // Return 401 for authentication errors
    if (
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('token')
    ) {
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
