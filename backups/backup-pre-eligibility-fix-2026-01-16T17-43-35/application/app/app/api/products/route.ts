
import { NextResponse } from 'next/server'
import { 
  getAllProducts, 
  getProductsByCompany, 
  getAllProductsByCompany, 
  getProductById, 
  getProductsForDesignation, 
  getProductsByVendor, 
  createProduct, 
  updateProduct, 
  deleteProduct 
} from '@/lib/db/data-access'
import '@/lib/models/DesignationProductEligibility' // Ensure model is registered

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const productId = searchParams.get('productId')
    const designation = searchParams.get('designation')
    const vendorId = searchParams.get('vendorId')
    const all = searchParams.get('all') === 'true' // Flag to get all products without vendor filter

    if (productId) {
      const product = await getProductById(productId)
      if (!product) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 })
      }
      return NextResponse.json(product)
    }

    if (vendorId) {
      // 🔍 INSTRUMENTATION: API boundary
      console.log('[API] /api/products GET - vendorId received:', vendorId, 'type:', typeof vendorId)
      
      // CRITICAL SECURITY: Get products linked to this vendor via ProductVendor relationships
      // This MUST return ONLY products explicitly assigned to the vendor
      const products = await getProductsByVendor(vendorId)
      
      // CRITICAL VALIDATION: Ensure we're not returning all products
      // If products.length is suspiciously high (> 50), log a warning
      if (products && products.length > 50) {
        console.error('[API] /api/products GET - ⚠️ WARNING: Returning suspiciously high number of products:', products.length)
        console.error('[API] /api/products GET - This may indicate a data isolation issue!')
        console.error('[API] /api/products GET - Vendor ID:', vendorId)
        console.error('[API] /api/products GET - Product count:', products.length)
      }
      
      console.log('[API] /api/products GET - products returned:', {
        count: products?.length || 0,
        isArray: Array.isArray(products),
        sample: products?.[0] || null,
        productNames: products?.slice(0, 5).map((p: any) => p.name) || []
      })
      
      // CRITICAL: Return products (already filtered by getProductsByVendor)
      // getProductsByVendor enforces ProductVendor relationship filtering
      return NextResponse.json(products || [])
    }

    if (companyId && designation) {
      // Filter products by company AND designation AND gender
      const gender = searchParams.get('gender') as 'male' | 'female' | undefined
      const products = await getProductsForDesignation(companyId, designation, gender)
      console.log(`Products for company ${companyId}, designation ${designation}, gender ${gender || 'unisex'}: ${products.length} products`)
      return NextResponse.json(products)
    }

    if (companyId) {
      // If 'all=true' is specified, return all products without vendor filter (for category extraction)
      if (all) {
        const products = await getAllProductsByCompany(companyId)
        return NextResponse.json(products)
      }
      // Otherwise, return only products with vendor fulfillment (for catalog/ordering)
      const products = await getProductsByCompany(companyId)
      return NextResponse.json(products)
    }

    const products = await getAllProducts()
    return NextResponse.json(products)
  } catch (error: any) {
    console.error('API Error in /api/products:', error)
    console.error('Error stack:', error.stack)
    
    const errorMessage = error.message || 'Unknown error occurred'
    const isConnectionError = errorMessage.includes('Mongo') || errorMessage.includes('connection')
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || errorMessage.includes('Not found') || errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ 
      error: errorMessage,
      type: isConnectionError ? 'database_connection_error' : 'api_error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    // Parse JSON body with error handling
    let productData: any
    try {
      productData = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({ 
        error: 'Invalid JSON in request body' 
      }, { status: 400 })
    }
    
    // Validate required fields
    if (!productData.name || !productData.companyId) {
      return NextResponse.json({ 
        error: 'Product name and company ID are required' 
      }, { status: 400 })
    }

    const newProduct = await createProduct(productData)
    return NextResponse.json(newProduct, { status: 201 })
  } catch (error: any) {
    console.error('API Error in /api/products POST:', error)
    
    // Return 400 for validation errors, 500 for server errors
    if (error.message && (
      error.message.includes('required') ||
      error.message.includes('invalid') ||
      error.message.includes('not found')
    )) {
      return NextResponse.json({ 
        error: error.message || 'Invalid request' 
      }, { status: 400 })
    }
    
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

export async function PUT(request: Request) {
  try {
    // Parse JSON body with error handling
    let productData: any
    try {
      productData = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({ 
        error: 'Invalid JSON in request body' 
      }, { status: 400 })
    }
    
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId')
    
    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 })
    }
    
    // Use productData as updateData (already parsed above)
    const updateData = productData
    
    // If vendorId is provided in updateData, validate vendor ownership
    if (updateData.vendorId) {
      console.log(`[API] /api/products PUT - Validating vendor ownership for product ${productId}, vendor ${updateData.vendorId}`)
      
      // Get products for this vendor
      const vendorProducts = await getProductsByVendor(updateData.vendorId)
      const productBelongsToVendor = vendorProducts.some((p: any) => p.id === productId)
      
      if (!productBelongsToVendor) {
        console.error(`[API] /api/products PUT - Vendor ${updateData.vendorId} does not own product ${productId}`)
        return NextResponse.json({ 
          error: 'You do not have permission to update this product. It does not belong to your vendor.' 
        }, { status: 403 })
      }
      
      // Remove vendorId from updateData before passing to updateProduct (vendors cannot change ownership)
      delete updateData.vendorId
      console.log(`[API] /api/products PUT - Vendor ownership validated, proceeding with update`)
    }
    
    const updatedProduct = await updateProduct(productId, updateData)
    return NextResponse.json(updatedProduct)
  } catch (error: any) {
    console.error('API Error in /api/products PUT:', error)
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

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId')
    
    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 })
    }
    
    await deleteProduct(productId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('API Error in /api/products DELETE:', error)
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
