import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/utils/api-auth-context'
import {
  getOrderMTMMeasurements,
  getOrderItemMTMMeasurement,
  createOrderMTMMeasurement,
} from '@/lib/db/mtm-data-access'

export const dynamic = 'force-dynamic'

/**
 * GET /api/mtm/order-measurements
 * 
 * Query params:
 *   orderId (required) - Order to get MTM measurements for
 *   itemIndex (optional) - Get measurement for a specific item index
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('orderId')
    const itemIndex = searchParams.get('itemIndex')

    if (!orderId) {
      return NextResponse.json(
        { error: 'orderId is required' },
        { status: 400 }
      )
    }

    if (itemIndex !== null) {
      const index = parseInt(itemIndex, 10)
      if (isNaN(index) || index < 0) {
        return NextResponse.json(
          { error: 'itemIndex must be a non-negative integer' },
          { status: 400 }
        )
      }

      const measurement = await getOrderItemMTMMeasurement(orderId, index)
      if (!measurement) {
        return NextResponse.json(
          { error: 'No MTM measurement found for this order item' },
          { status: 404 }
        )
      }
      return NextResponse.json(measurement)
    }

    const measurements = await getOrderMTMMeasurements(orderId)
    return NextResponse.json(measurements)
  } catch (error: any) {
    console.error('[API] GET /api/mtm/order-measurements error:', error)
    const errorMessage = error?.message || 'Internal server error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

/**
 * POST /api/mtm/order-measurements
 * 
 * Creates MTM measurement record for an order item.
 * Called during order creation when an item has fit_type === 'MTM'.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const { order_id, item_index, product_id, mtm_specification_id, measurements } = body

    if (!order_id || item_index === undefined || !product_id || !mtm_specification_id || !measurements) {
      return NextResponse.json(
        { error: 'order_id, item_index, product_id, mtm_specification_id, and measurements are required' },
        { status: 400 }
      )
    }

    if (!Array.isArray(measurements) || measurements.length === 0) {
      return NextResponse.json(
        { error: 'measurements must be a non-empty array' },
        { status: 400 }
      )
    }

    const record = await createOrderMTMMeasurement(body)
    return NextResponse.json(record, { status: 201 })
  } catch (error: any) {
    console.error('[API] POST /api/mtm/order-measurements error:', error)
    const errorMessage = error?.message || 'Internal server error'
    if (errorMessage.includes('duplicate') || errorMessage.includes('E11000')) {
      return NextResponse.json(
        { error: 'MTM measurement record already exists for this order item' },
        { status: 409 }
      )
    }
    if (errorMessage.includes('required')) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
