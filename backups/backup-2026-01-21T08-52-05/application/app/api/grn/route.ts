
import { NextResponse } from 'next/server'
import {
  createGRN,
  submitGRN,
} from '@/lib/db/indent-workflow'

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

    const { vendor_indent_id, vendor_id, grn_number, grn_date, remarks } = body

    if (!vendor_indent_id || !vendor_id || !grn_number || !grn_date) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const grn = await createGRN({
      vendor_indent_id,
      vendor_id,
      grn_number,
      grn_date: new Date(grn_date),
      remarks,
    })

    return NextResponse.json({ success: true, grn }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating GRN:', error)
    
    // Return appropriate status code based on error type
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    const isConnectionError = errorMessage.includes('Mongo') || 
                              errorMessage.includes('connection') || 
                              errorMessage.includes('ECONNREFUSED') ||
                              errorMessage.includes('timeout') ||
                              errorMessage.includes('network') ||
                              (error as any)?.code === 'ECONNREFUSED' ||
                              (error as any)?.code === 'ETIMEDOUT' ||
                              (error as any)?.name === 'MongoNetworkError' ||
                              (error as any)?.name === 'MongoServerSelectionError'
    
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
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
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

    const { grn_id, action } = body

    if (!grn_id || !action) {
      return NextResponse.json(
        { error: 'grn_id and action are required' },
        { status: 400 }
      )
    }

    if (action === 'submit') {
      const grn = await submitGRN(grn_id)
      return NextResponse.json({ success: true, grn })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Error updating GRN:', error)
    
    // Return appropriate status code based on error type
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    const isConnectionError = errorMessage.includes('Mongo') || 
                              errorMessage.includes('connection') || 
                              errorMessage.includes('ECONNREFUSED') ||
                              errorMessage.includes('timeout') ||
                              errorMessage.includes('network') ||
                              (error as any)?.code === 'ECONNREFUSED' ||
                              (error as any)?.code === 'ETIMEDOUT' ||
                              (error as any)?.name === 'MongoNetworkError' ||
                              (error as any)?.name === 'MongoServerSelectionError'
    
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
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
