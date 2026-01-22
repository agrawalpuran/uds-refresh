
import { NextResponse } from 'next/server'
import { getVendorInventory, updateVendorInventory, getLowStockItems, getVendorInventorySummary } from '@/lib/db/data-access'
import '@/lib/models/VendorInventory' // Ensure model is registered

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const vendorId = searchParams.get('vendorId')
    const productId = searchParams.get('productId')
    const lowStock = searchParams.get('lowStock') === 'true'
    const summary = searchParams.get('summary') === 'true'

    if (!vendorId) {
      return NextResponse.json({ error: 'Vendor ID is required' }, { status: 400 })
    }

    // Get low stock items
    if (lowStock) {
      const lowStockItems = await getLowStockItems(vendorId)
      return NextResponse.json(lowStockItems)
    }

    // Get inventory summary
    if (summary) {
      const summaryData = await getVendorInventorySummary(vendorId)
      return NextResponse.json(summaryData)
    }

    // Get inventory
    const inventory = await getVendorInventory(vendorId, productId || undefined)
    return NextResponse.json(inventory)
  } catch (error: any) {
    console.error('API Error in /api/vendor-inventory GET:', error)
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

export async function PUT(request: Request) {
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

    const { vendorId, productId, sizeInventory, lowInventoryThreshold } = body

    if (!vendorId || !productId) {
      return NextResponse.json(
        { error: 'Vendor ID and Product ID are required' },
        { status: 400 }
      )
    }

    if (!sizeInventory || typeof sizeInventory !== 'object') {
      return NextResponse.json(
        { error: 'sizeInventory must be an object with size: quantity pairs' },
        { status: 400 }
      )
    }

    // lowInventoryThreshold is optional
    const updated = await updateVendorInventory(
      vendorId, 
      productId, 
      sizeInventory,
      lowInventoryThreshold // Optional parameter
    )
    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('API Error in /api/vendor-inventory PUT:', error)
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
}
