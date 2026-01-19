
import { NextResponse } from 'next/server'
import { createReturnRequest, validateReturnEligibility } from '@/lib/db/data-access'

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
      originalOrderId,
      originalOrderItemIndex,
      requestedQty,
      requestedSize,
      reason,
      comments,
      requestedBy,
      returnWindowDays,
    } = body

    // Validate required fields
    if (
      !originalOrderId ||
      originalOrderItemIndex === undefined ||
      !requestedQty ||
      !requestedSize ||
      !requestedBy
    ) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: originalOrderId, originalOrderItemIndex, requestedQty, requestedSize, requestedBy'
        },
        { status: 400 }
      )
    }

    // Create return request
    const returnRequest = await createReturnRequest({
      originalOrderId,
      originalOrderItemIndex: parseInt(originalOrderItemIndex),
      requestedQty: parseInt(requestedQty),
      requestedSize,
      reason,
      comments,
      requestedBy,
      returnWindowDays: returnWindowDays || 14,
    })

    return NextResponse.json(returnRequest, { status: 201 })
  } catch (error: any) {
    console.error('Error creating return request:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create return request' },
      { status: 400 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('orderId')
    const itemIndex = searchParams.get('itemIndex')
    const requestedQty = searchParams.get('requestedQty')
    const returnWindowDays = searchParams.get('returnWindowDays')

    // Validate eligibility
    if (!orderId || itemIndex === null || !requestedQty) {
      return NextResponse.json(
        { error: 'Missing required parameters: orderId, itemIndex, requestedQty' },
        { status: 400 }
      )
    }

    const validation = await validateReturnEligibility(
      orderId,
      parseInt(itemIndex),
      parseInt(requestedQty),
      returnWindowDays ? parseInt(returnWindowDays) : 14
    )

    return NextResponse.json(validation, { status: 200 })
  } catch (error: any) {
    console.error('Error validating return eligibility:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to validate return eligibility' },
      { status: 400 }
    )
  }
}
