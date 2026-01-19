import { NextResponse } from 'next/server'
import {
  createIndentHeader,
  getIndentById,
  getVendorIndentsByIndentId,
} from '@/lib/db/indent-workflow'
import { isCompanyAdmin } from '@/lib/db/data-access'


// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
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
    const {
      client_indent_number,
      indent_date,
      companyId,
      site_id,
      created_by_user_id,
      created_by_role,
      adminEmail, // For authorization
    } = body

    // Validate required fields
    if (!client_indent_number || !indent_date || !companyId || !created_by_user_id || !created_by_role) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Authorization check (only Company Admin or Site Admin can create indents)
    let isAdmin = false
    if (created_by_role === 'COMPANY_ADMIN' && adminEmail) {
      isAdmin = await isCompanyAdmin(adminEmail, companyId)
    }
    if (!isAdmin) {
        return NextResponse.json(
          { error: 'Unauthorized: Only Company Admins can create indents' },
          { status: 403 }
        )
    }

    const indent = await createIndentHeader({
      client_indent_number,
      indent_date: new Date(indent_date),
      companyId,
      site_id,
      created_by_user_id,
      created_by_role,
    })

    return NextResponse.json({ success: true, indent }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating indent:', error)
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
    
    // Return 403 for authorization errors
    if (errorMessage.includes('Unauthorized') || errorMessage.includes('Forbidden')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 403 }
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
    const { searchParams } = new URL(request.url)
    const indentId = searchParams.get('indentId')

    if (!indentId) {
      return NextResponse.json(
        { error: 'indentId is required' },
        { status: 400 }
      )
    }

    const indent = await getIndentById(indentId)
    
    if (!indent) {
      return NextResponse.json(
        { error: 'Indent not found' },
        { status: 404 }
      )
    }

    // Get vendor indents
    const vendorIndents = await getVendorIndentsByIndentId(indentId)

    return NextResponse.json({
      success: true,
      indent,
      vendorIndents,
    })
  } catch (error: any) {
    console.error('Error fetching indent:', error)
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
