import { NextResponse } from 'next/server'
import { getProductSizeChart } from '@/lib/db/data-access'


// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(
  request: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await params

    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      )
    }

    // Validate product ID format (alphanumeric)
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(productId)) {
      return NextResponse.json(
        { error: 'Invalid product ID format. Must be alphanumeric (1-50 characters).' },
        { status: 400 }
      )
    }

    const sizeChart = await getProductSizeChart(productId)

    if (!sizeChart) {
      return NextResponse.json(
        { error: 'Size chart not found for this product' },
        { status: 404 }
      )
    }

    return NextResponse.json(sizeChart, { status: 200 })
  } catch (error) {
    const err = error as any
    console.error('Error fetching size chart:', err)
    const errorMessage = err?.message || err?.toString() || 'Internal server error'
    
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
