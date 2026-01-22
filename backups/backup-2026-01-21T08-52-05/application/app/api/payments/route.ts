import { NextResponse } from 'next/server'
import {
  createPayment,
  completePayment,
} from '@/lib/db/indent-workflow'


// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    }
    const { invoice_id, vendor_id, payment_reference, payment_date, amount_paid, action } = body

    if (action === 'create') {
      if (!invoice_id || !vendor_id || !payment_reference || !payment_date || !amount_paid) {
        return NextResponse.json(
          { error: 'Missing required fields' },
          { status: 400 }
        )
      }
      const payment = await createPayment({
        invoice_id,
        vendor_id,
        payment_reference,
        payment_date: new Date(payment_date),
        amount_paid,
      })

      return NextResponse.json({ success: true, payment }, { status: 201 })
    }

    if (action === 'complete') {
      if (!invoice_id) {
        return NextResponse.json(
          { error: 'invoice_id is required' },
          { status: 400 }
        )
      }

      // Find payment by invoice_id
      const Payment = (await import('@/lib/models/Payment')).default
      const payment: any = await Payment.findOne({ invoice_id }).lean()
      
      if (!payment) {
        return NextResponse.json(
          { error: 'Payment not found' },
          { status: 404 }
        )
      }
      const completedPayment = await completePayment(payment._id)
      
      return NextResponse.json({ success: true, payment: completedPayment })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )
  } catch (error) {
    const err = error as any
    console.error('Error processing payment:', err)
    const errorMessage = err?.message || err?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('Invalid JSON') ||
        errorMessage.includes('not found')) {
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
