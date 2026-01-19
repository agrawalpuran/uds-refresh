import { NextResponse } from 'next/server'
import {
  createOrderSuborder,
  updateSuborderShipping,
  getSubordersByOrderId,
  getSubordersByVendorId,
  deriveMasterOrderStatus,
} from '@/lib/db/indent-workflow'
import { getVendorById } from '@/lib/data-mongodb'


// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    let body: any
    try {
      body = await request.json()
    } catch (jsonError) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    const { order_id, vendor_id, vendor_indent_id } = body

    if (!order_id || !vendor_id) {
      return NextResponse.json(
        { error: 'order_id and vendor_id are required' },
        { status: 400 }
      )

    }
    const suborder = await createOrderSuborder({
      order_id,
      vendor_id,
      vendor_indent_id,
    })

    return NextResponse.json({ success: true, suborder }, { status: 201 })
  } catch (error) {
    const err = error as any;
    console.error('Error creating suborder:', error)
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
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }

export async function PATCH(request: Request) {
  try {
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    const {
      suborder_id,
      shipper_name,
      consignment_number,
      shipping_date,
      shipment_status,
      vendorId, // For vendor authorization
    } = body

    if (!suborder_id) {
      return NextResponse.json(
        { error: 'suborder_id is required' },
        { status: 400 }
      )

    // TODO: Add vendor authorization check if vendorId is provided

    }
    const suborder = await updateSuborderShipping({
      suborder_id,
      shipper_name,
      consignment_number,
      shipping_date: shipping_date ? new Date(shipping_date) : undefined,
      shipment_status,
    })

    return NextResponse.json({ success: true, suborder })
  } catch (error) {
    const err = error as any;
    console.error('Error updating suborder:', error)
    console.error('Error updating suborder:', error)
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
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || 
        errorMessage.includes('Not found') || 
        errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    
    // Return 401 for authentication errors
    if (errorMessage.includes('Unauthorized') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('token')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
      )
    
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
    const orderId = searchParams.get('orderId')
    const vendorId = searchParams.get('vendorId')

    if (orderId) {
      const suborders = await getSubordersByOrderId(orderId)
      return NextResponse.json({ success: true, suborders })

    if (vendorId) {
    }
    const suborders = await getSubordersByVendorId(vendorId)
      return NextResponse.json({ success: true, suborders })

    return NextResponse.json(
      { error: 'orderId or vendorId is required' },
      { status: 400 }
    )
  } catch (error) {
    const err = error as any;
    console.error('Error fetching suborders:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || 
        errorMessage.includes('Not found') || 
        errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
}
}}}}}}}}}}
