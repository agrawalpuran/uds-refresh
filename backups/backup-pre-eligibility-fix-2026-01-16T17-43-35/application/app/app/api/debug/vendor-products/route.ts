
import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/db/mongodb'

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    await connectDB()
    const { searchParams } = new URL(request.url)
    const vendorId = searchParams.get('vendorId')
    
    if (!vendorId) {
      return NextResponse.json({ error: 'vendorId is required' }, { status: 400 })
    }

    if (!mongoose.connection.db) {
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      )
    }

    const db = mongoose.connection.db
    if (!db) {
      return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
    }
    
    console.log(`[DEBUG API] Starting debug for vendorId: ${vendorId}`)
    
    const debugInfo: any = {
      vendorId,
      steps: []
    }
    
    // Step 1: Find vendor
    const vendor = await db.collection('vendors').findOne({ id: vendorId })
    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found', debugInfo }, { status: 404 })
    }
    
    debugInfo.vendor = {
      name: vendor.name,
      id: vendor.id,
      _id: vendor._id?.toString(),
      _idType: vendor._id?.constructor?.name
    }
    
    // Use vendor's string ID
    const vendorIdStr = vendor.id || String(vendor._id || '')
    
    // Step 2: Query ProductVendor with string ID
    const productVendorLinks1 = await db.collection('productvendors').find({ 
      vendorId: vendorIdStr 
    }).toArray()
    
    debugInfo.steps.push({
      method: 'String ID query',
      query: { vendorId: vendorIdStr },
      found: productVendorLinks1.length
    })
    
    // Step 3: Get ALL ProductVendor links for manual filtering
    const allLinks = await db.collection('productvendors').find({}).toArray()
    debugInfo.totalProductVendorLinks = allLinks.length
    
    // Step 4: Manual filtering by string ID
    const matchedLinks = allLinks.filter((link: any) => {
      const linkVendorId = link.vendorId?.id || String(link.vendorId || '')
      return linkVendorId === vendorIdStr || String(link.vendorId) === vendorIdStr
    })
    
    debugInfo.steps.push({
      method: 'Manual filter',
      found: matchedLinks.length
    })
    
    debugInfo.sampleLinks = allLinks.slice(0, 5).map((link: any) => ({
      vendorId: link.vendorId?.toString ? link.vendorId.toString() : String(link.vendorId || ''),
      vendorIdType: typeof link.vendorId,
      vendorIdConstructor: link.vendorId?.constructor?.name,
      productId: link.productId?.toString ? link.productId.toString() : String(link.productId || ''),
      matches: matchedLinks.some(m => m === link)
    }))
    
    // Step 6: Extract product IDs and query products
    let products: any[] = []
    if (matchedLinks.length > 0) {
      // Extract string IDs from links - handle both ObjectId and string formats
      const productStringIds = matchedLinks.map((link: any) => {
        const productId = link.productId
        if (typeof productId === 'string') return productId
        if (productId?.toString) return productId.toString()
        return null
      }).filter((id: any): id is string => id !== null)
      
      // Query products by string ID first (preferred)
      products = await db.collection('uniforms').find({
        id: { $in: productStringIds }
      }).toArray()
      
      // Fallback: if no products found by string id, try ObjectId matching
      if (products.length === 0) {
        const productObjectIds = matchedLinks.map((link: any) => {
          const productId = link.productId
          if (productId instanceof mongoose.Types.ObjectId) {
            return productId
          }
          if (mongoose.Types.ObjectId.isValid(productId)) {
            return new mongoose.Types.ObjectId(productId)
          }
          return null
        }).filter((id: any): id is mongoose.Types.ObjectId => id !== null)
        
        products = await db.collection('uniforms').find({
          _id: { $in: productObjectIds }
        }).toArray()
      }
      
      debugInfo.products = products.map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        _id: p._id?.toString()
      }))
    }
    
    return NextResponse.json({
      success: true,
      vendor: debugInfo.vendor,
      productVendorLinks: {
        objectIdQuery: productVendorLinks1.length,
        stringQuery: productVendorLinks2.length,
        manualFilter: matchedLinks.length,
        totalInDatabase: allLinks.length
      },
      products: {
        count: products.length,
        items: debugInfo.products || []
      },
      debug: debugInfo
    })
  } catch (error: any) {
    console.error('[DEBUG API] Error:', error)
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
        errorMessage.includes('not found') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
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
      { error: errorMessage, type: isConnectionError ? 'database_connection_error' : 'api_error' },
      { status: isConnectionError ? 503 : 500 }
    )
  }
}
