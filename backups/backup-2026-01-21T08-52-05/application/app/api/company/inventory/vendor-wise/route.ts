
import { NextResponse } from 'next/server'
import { getVendorWiseInventoryForCompany, isCompanyAdmin } from '@/lib/db/data-access'
import '@/lib/models/VendorInventory' // Ensure model is registered

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const email = searchParams.get('email')
    
    // Validate required parameters
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 })
    }
    
    // Role check: Only Company Admin can access this endpoint
    if (!email) {
      return NextResponse.json({ error: 'Email is required for authorization' }, { status: 401 })
    }
    
    const isAdmin = await isCompanyAdmin(email, companyId)
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Access denied. Only Company Admin can view vendor inventory.' },
        { status: 403 }
      )
    }
    
    // Fetch vendor-wise inventory for the company
    const inventory = await getVendorWiseInventoryForCompany(companyId)
    
    return NextResponse.json(inventory)

  } catch (error: any) {
    console.error('API Error in /api/company/inventory/vendor-wise GET:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400
    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('Invalid JSON')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }
    
    // Return 404
    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('Not found') ||
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }
    
    // Return 401
    if (
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('token')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 401 })
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

// Explicitly disable POST, PUT, DELETE methods for read-only endpoint
export async function POST() {
  try {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
  } catch (error: any) {
    console.error('[API] Error in POST handler:', error)
    const errorMessage = error?.message || 'Internal server error'

    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('Invalid JSON')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('Not found') ||
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }

    if (
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('token')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 401 })
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

export async function PUT() {
  try {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
  } catch (error: any) {
    console.error('[API] Error in PUT handler:', error)
    const errorMessage = error?.message || 'Internal server error'

    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('Invalid JSON')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('Not found') ||
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }

    if (
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('token')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 401 })
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
  } catch (error: any) {
    console.error('[API] Error in DELETE handler:', error)
    const errorMessage = error?.message || 'Internal server error'

    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('Invalid JSON')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('Not found') ||
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }

    if (
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('token')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 401 })
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
