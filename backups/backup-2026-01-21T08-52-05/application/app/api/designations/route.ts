
import { NextResponse } from 'next/server'
import { 
  getUniqueDesignationsByCompany,
  getUniqueShirtSizesByCompany,
  getUniquePantSizesByCompany,
  getUniqueShoeSizesByCompany
} from '@/lib/db/data-access'
import '@/lib/models/Employee' // Ensure model is registered

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const type = searchParams.get('type') // 'designation', 'shirtSize', 'pantSize', 'shoeSize'

    if (!companyId) {
      return NextResponse.json(
        { error: 'Missing required parameter: companyId' },
        { status: 400 }
      )
    }

    if (type === 'shirtSize') {
      const sizes = await getUniqueShirtSizesByCompany(companyId)
      return NextResponse.json(sizes)
    } else if (type === 'pantSize') {
      const sizes = await getUniquePantSizesByCompany(companyId)
      return NextResponse.json(sizes)
    } else if (type === 'shoeSize') {
      const sizes = await getUniqueShoeSizesByCompany(companyId)
      return NextResponse.json(sizes)
    } else {
      // Default: return designations
      const designations = await getUniqueDesignationsByCompany(companyId)
      return NextResponse.json(designations)
    }
  } catch (error: any) {
    console.error('API Error in /api/designations:', error)
    
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    const isConnectionError =
      errorMessage.includes('Mongo') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('network') ||
      error?.code === 'ECONNREFUSED' ||
      error?.code === 'ETIMEDOUT' ||
      error?.name === 'MongoNetworkError' ||
      error?.name === 'MongoServerSelectionError'

    // Return 400 for validation/input errors
    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('not found') ||
      errorMessage.includes('Invalid JSON')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
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
