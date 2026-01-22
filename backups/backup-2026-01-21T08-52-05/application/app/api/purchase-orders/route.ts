import { NextResponse } from 'next/server'
import { createPurchaseOrderFromPRs, derivePOShippingStatus } from '@/lib/db/data-access'
// Ensure models are registered
import '@/lib/models/PurchaseOrder'
import '@/lib/models/POOrder'
import '@/lib/models/Order'


// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    }
    
    const { orderIds, poNumber, poDate, companyId, createdByUserId } = body

    // Validate required fields
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one order ID is required' },
        { status: 400 }
      )
    }

    if (!poNumber || !poNumber.trim()) {
      return NextResponse.json(
        { error: 'PO Number is required' },
        { status: 400 }
      )
    }

    if (!poDate) {
      return NextResponse.json(
        { error: 'PO Date is required' },
        { status: 400 }
      )
    }
    
    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      )
    }

    if (!createdByUserId) {
      return NextResponse.json(
        { error: 'Created By User ID is required' },
        { status: 400 }
      )
    }

    // Parse PO date
    const poDateObj = new Date(poDate)
    
    console.log('[API /purchase-orders POST] Creating PO with:', {
      orderIds,
      poNumber: poNumber.trim(),
      poDate: poDateObj.toISOString(),
      companyId,
      createdByUserId
    })

    // Create PO(s) and trigger vendor fulfilment
    try {
      const result = await createPurchaseOrderFromPRs(
        orderIds,
        poNumber.trim(),
        poDateObj,
        companyId,
        createdByUserId
      )
      
      console.log('[API /purchase-orders POST] PO creation successful:', result)
      return NextResponse.json(result, { status: 201 })
    } catch (createError: any) {
      console.error('[API /purchase-orders POST] Error in createPurchaseOrderFromPRs:', createError)
      console.error('[API /purchase-orders POST] Error stack:', createError.stack)
      // Re-throw to be caught by outer catch block
      throw createError
    }
  } catch (error: any) {
    console.error('API Error in /api/purchase-orders POST:', error)
    console.error('Error stack:', error.stack)

    // Return appropriate status code based on error type
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    const isConnectionError = errorMessage.includes('Mongo') || 
                              errorMessage.includes('connection') || 
                              errorMessage.includes('ECONNREFUSED') ||
                              errorMessage.includes('timeout') ||
                              errorMessage.includes('network') ||
                              error?.code === 'ECONNREFUSED' ||
                              error?.code === 'ETIMEDOUT' ||
                              error?.name === 'MongoNetworkError' ||
                              error?.name === 'MongoServerSelectionError'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    // Return 500 for server errors
    return NextResponse.json(
      {
        error: errorMessage,
        type: 'api_error',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const vendorId = searchParams.get('vendorId')
    const poStatus = searchParams.get('poStatus')

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      )
    }

    // Import PurchaseOrder model
    const PurchaseOrder = (await import('@/lib/models/PurchaseOrder')).default
    const connectDB = (await import('@/lib/db/mongodb')).default
    await connectDB()

    // Build query
    const Company = (await import('@/lib/models/Company')).default
    const company = await Company.findOne({ id: companyId })
    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      )
    }
    
    const query: any = { companyId: company.id }

    if (vendorId) {
      // vendorId is now stored as alphanumeric string, not ObjectId
      // Validate it's alphanumeric
      if (/^[A-Za-z0-9_-]{1,50}$/.test(vendorId)) {
        query.vendorId = vendorId
      } else {
        // If it's not a 6-digit string, try to find vendor by string ID
        const Vendor = (await import('@/lib/models/Vendor')).default
        const vendor = await Vendor.findOne({ id: vendorId })
        if (!vendor) {
          return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
        }
        if (vendor) {
          query.vendorId = vendor.id
        }
      }
    }

    if (poStatus) {
      query.unified_po_status = poStatus
    }

    const purchaseOrders = await PurchaseOrder.find(query)
      .populate('companyId', 'id name')
      .populate('created_by_user_id', 'id employeeId firstName lastName email')
      .sort({ po_date: -1, createdAt: -1 })
      .lean()
    
    // Fetch vendor details separately since vendorId is now numeric ID
    const Vendor = (await import('@/lib/models/Vendor')).default
    const vendorIds = Array.from(new Set(purchaseOrders.map((po: any) => po.vendorId).filter(Boolean)))
    const vendors = await Vendor.find({ id: { $in: vendorIds } })
      .select('id name')
      .lean()
    
    const vendorMap = new Map(vendors.map((v: any) => [v.id, v]))
    
    // Add vendor details and derived shipping status to each PO
    const purchaseOrdersWithDetails = await Promise.all(
      purchaseOrders.map(async (po: any) => {
        // Derive shipping status from PR data
        let shippingStatus: string = 'AWAITING_SHIPMENT'
        try {
          shippingStatus = await derivePOShippingStatus(po.id)
        } catch (error: any) {
          console.warn(`[API /purchase-orders GET] Could not derive shipping status for PO ${po.id}:`, error.message)
        }
        
        return {
          ...po,
          vendor: vendorMap.get(po.vendorId) || null,
          shippingStatus // Derived, not persisted
        }
      })
    )
    
    // Convert to plain objects - use string IDs
    const plainPOs = purchaseOrdersWithDetails.map((po: any) => {
      const plain: any = { ...po }
      // Use string IDs for all references
      if (plain.companyId) {
        plain.companyId = typeof plain.companyId === 'object' 
          ? { id: plain.companyId.id, name: plain.companyId.name }
          : { id: String(plain.companyId) }
      }
      // vendorId is already a string (numeric ID)
      if (plain.created_by_user_id) {
        plain.created_by_user_id = typeof plain.created_by_user_id === 'object'
          ? { id: plain.created_by_user_id.id, employeeId: plain.created_by_user_id.employeeId, firstName: plain.created_by_user_id.firstName, lastName: plain.created_by_user_id.lastName, email: plain.created_by_user_id.email }
          : { id: String(plain.created_by_user_id) }
      }
      return plain
    })

    return NextResponse.json(plainPOs)
  } catch (error: any) {
    console.error('API Error in /api/purchase-orders GET:', error)
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
