
import { NextResponse } from 'next/server'
import { createProductFeedback, getProductFeedback } from '@/lib/db/data-access'

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    let body: any
    try {
      body = await request.json()
    } catch (parseError: any) {
      console.error('API Error in /api/feedback POST - JSON parsing:', parseError.message)
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
    
    const { orderId, productId, employeeId, companyId, vendorId, rating, comment } = body
    
    // Validate required fields
    if (!orderId || !productId || !employeeId || !companyId || !rating) {
      return NextResponse.json(
        { error: 'Missing required fields: orderId, productId, employeeId, companyId, rating' },
        { status: 400 }
      )
    }
    
    // Validate rating
    if (typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return NextResponse.json(
        { error: 'Rating must be an integer between 1 and 5' },
        { status: 400 }
      )
    }
    
    // Get user email from request body (sent by client)
    const userEmail = body.userEmail
    if (!userEmail) {
      return NextResponse.json(
        { error: 'User email is required' },
        { status: 401 }
      )
    }
    
    // Create feedback
    const feedback = await createProductFeedback({
      orderId,
      productId,
      employeeId,
      companyId,
      vendorId,
      rating,
      comment,
    })
    
    return NextResponse.json({ success: true, feedback })
  } catch (error: any) {
    console.error('API Error in /api/feedback POST:', error)
    console.error('Error stack:', error.stack)
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
    
    // Return 401 for authentication errors
    if (errorMessage.includes('Unauthorized') || errorMessage.includes('authentication')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
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
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    let searchParams: URLSearchParams
    try {
      const url = new URL(request.url)
      searchParams = url.searchParams
    } catch (urlError: any) {
      console.error('API Error in /api/feedback GET - URL parsing:', urlError.message)
      return NextResponse.json(
        { error: 'Invalid request URL' },
        { status: 400 }
      )
    }
    
    const orderId = searchParams.get('orderId')
    const productId = searchParams.get('productId')
    const employeeId = searchParams.get('employeeId')
    const companyId = searchParams.get('companyId')
    const vendorId = searchParams.get('vendorId')
    
    // Get user email from query params (sent by client)
    const userEmail = searchParams.get('userEmail')
    if (!userEmail) {
      return NextResponse.json(
        { error: 'User email is required' },
        { status: 401 }
      )
    }
    
    // Get feedback with role-based access control
    const feedback = await getProductFeedback(userEmail, {
      orderId: orderId || undefined,
      productId: productId || undefined,
      employeeId: employeeId || undefined,
      companyId: companyId || undefined,
      vendorId: vendorId || undefined,
    })
    
    return NextResponse.json({ success: true, feedback })
  } catch (error: any) {
    console.error('API Error in /api/feedback GET:', error)
    console.error('Error stack:', error.stack)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing')) {
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
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
