/**
 * Product-Subcategory Mapping APIs (Company-Specific)
 * 
 * Maps products to subcategories with company-specific context.
 * The SAME product can be mapped to DIFFERENT subcategories for DIFFERENT companies.
 * 
 * SECURITY: All operations validate companyId from auth context.
 */

import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import ProductSubcategoryMapping from '@/lib/models/ProductSubcategoryMapping'
import Subcategory from '@/lib/models/Subcategory'
import Category from '@/lib/models/Category'
import Uniform from '@/lib/models/Uniform'
import { validateAndGetCompanyId } from '@/lib/utils/api-auth'
import mongoose from 'mongoose'

/**
 * GET /api/product-subcategory-mappings
 * Get product-subcategory mappings for a company
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    await connectDB()
    
    const searchParams = request.nextUrl.searchParams
    const companyId = searchParams.get('companyId')
    const productId = searchParams.get('productId') // Optional: filter by product
    const subCategoryId = searchParams.get('subCategoryId') // Optional: filter by subcategory
    
    // CRITICAL FIX: Allow both Company Admin AND Employee access for read operations
    // Employees need to read mappings to see products in catalog
    let validatedCompanyId: string
    try {
      // First try Company Admin authentication
      const authContext = await validateAndGetCompanyId(request, companyId)
      validatedCompanyId = authContext.companyId
    } catch (adminError: any) {
      // If Company Admin auth fails, try Employee authentication
      try {
        const { getUserEmailFromRequest } = await import('@/lib/utils/api-auth')
        const { getEmployeeByEmail } = await import('@/lib/db/data-access')
        
        const userEmail = await getUserEmailFromRequest(request)
        if (!userEmail) {
          return NextResponse.json(
            { error: 'Unauthorized: No user email provided' },
            { status: 401 }
          )
        }
        
        // Get employee and validate they belong to the requested company
        const employee = await getEmployeeByEmail(userEmail)
        if (!employee) {
          return NextResponse.json(
            { error: 'Unauthorized: User is not an employee' },
            { status: 401 }
          )
        }
        
        // Extract companyId from employee
        let employeeCompanyId: string | undefined
        if (employee.companyId) {
          if (typeof employee.companyId === 'object' && employee.companyId !== null) {
            employeeCompanyId = employee.companyId.id ? String(employee.companyId.id) : undefined
          } else if (typeof employee.companyId === 'number') {
            employeeCompanyId = String(employee.companyId)
          } else if (typeof employee.companyId === 'string') {
            employeeCompanyId = employee.companyId
          }
        }
        
        if (!employeeCompanyId) {
          return NextResponse.json(
            { error: 'Unauthorized: Employee has no company assigned' },
            { status: 401 }
          )
        }
        
        // Validate requested companyId matches employee's company
        if (companyId && companyId !== employeeCompanyId) {
          return NextResponse.json(
            { error: 'Forbidden: Cannot access mappings for other companies' },
            { status: 403 }
          )
        }
        
        validatedCompanyId = employeeCompanyId
      } catch (employeeError: any) {
        // Both Company Admin and Employee auth failed
        return NextResponse.json(
          { error: 'Unauthorized: User is not a Company Admin or Employee' },
          { status: 401 }
        )
      }
    }
    
    // Get company - use string ID
    const Company = mongoose.model('Company')
    const company = await Company.findOne({ id: validatedCompanyId })
    
    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      )
    }
    
    // Build query - use string IDs
    const query: any = {
      companyId: company.id
    }
    
    if (productId) {
      // Try to find product by string id field
      const Uniform = mongoose.model('Uniform')
      const product = await Uniform.findOne({ id: productId })
      if (!product) {
        return NextResponse.json({ error: 'Uniform not found' }, { status: 404 })
      }
      query.productId = product.id
    }
    
    if (subCategoryId) {
      // Use string ID for subcategory
      const subcategory = await Subcategory.findOne({ id: subCategoryId })
      if (!subcategory) {
        return NextResponse.json({ error: 'Subcategory not found' }, { status: 404 })
      }
      query.subCategoryId = subcategory.id
    }
    
    // CRITICAL FIX: productId and subCategoryId are stored as STRING IDs, not ObjectIds - cannot use populate
    const mappings = await ProductSubcategoryMapping.find(query).lean()
    
    // Manually fetch products using string IDs
    const uniqueProductIds = [...new Set(mappings.map((m: any) => m.productId).filter(Boolean))]
    const products = await Uniform.find({ id: { $in: uniqueProductIds } })
      .select('id name category categoryId gender price image sku')
      .lean()
    const productMap = new Map(products.map((p: any) => [p.id, p]))
    
    // Manually fetch subcategories using string IDs
    const uniqueSubcategoryIds = [...new Set(mappings.map((m: any) => m.subCategoryId).filter(Boolean))]
    const subcategories = await Subcategory.find({ id: { $in: uniqueSubcategoryIds } })
      .select('id name parentCategoryId')
      .lean()
    const subcategoryMap = new Map(subcategories.map((s: any) => [s.id, s]))
    
    // Manually fetch parent categories
    const uniqueParentCategoryIds = [...new Set(subcategories.map((s: any) => s.parentCategoryId).filter(Boolean))]
    const parentCategories = await Category.find({ id: { $in: uniqueParentCategoryIds } })
      .select('id name isSystemCategory')
      .lean()
    const parentCategoryMap = new Map(parentCategories.map((c: any) => [c.id, c]))
    
    return NextResponse.json({
      success: true,
      mappings: mappings.map((mapping: any) => {
        const product = productMap.get(mapping.productId)
        const subcategory = subcategoryMap.get(mapping.subCategoryId)
        const parentCategory = subcategory?.parentCategoryId ? parentCategoryMap.get(subcategory.parentCategoryId) : null
        
        return {
          id: mapping.id,
          productId: mapping.productId,
          product: product ? {
            id: product.id,
            name: product.name,
            category: product.category,
            categoryId: product.categoryId || '',
            gender: product.gender,
            price: product.price,
            image: product.image,
            sku: product.sku
          } : null,
          subCategoryId: mapping.subCategoryId,
          subcategory: subcategory ? {
            id: subcategory.id,
            name: subcategory.name,
            parentCategoryId: subcategory.parentCategoryId || '',
            parentCategory: parentCategory ? {
              id: parentCategory.id,
              name: parentCategory.name,
              isSystemCategory: parentCategory.isSystemCategory
            } : null
          } : null,
          companyId: String(mapping.companyId),
          companySpecificPrice: mapping.companySpecificPrice,
          createdAt: mapping.createdAt,
          updatedAt: mapping.updatedAt
        }
      })
    })
  } catch (error: any) {
    console.error('Error fetching product-subcategory mappings:', error)
    
    // Return 400 for validation/input errors, 401 for auth errors, 500 for server errors
    if (error.message && (
      error.message.includes('required') ||
      error.message.includes('invalid') ||
      error.message.includes('Unauthorized')
    )) {
      return NextResponse.json(
        { error: error.message || 'Invalid request' },
        { status: error.message.includes('Unauthorized') ? 401 : 400 }
      )
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to fetch mappings' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/product-subcategory-mappings
 * Create a product-subcategory mapping (Company Admin only)
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB()
    
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    }

    const { companyId, productId, subCategoryId, companySpecificPrice } = body
    
    if (!productId || !subCategoryId) {
      return NextResponse.json(
        { error: 'productId and subCategoryId are required' },
        { status: 400 }
      )
    }
    
    // Validate companyId from authenticated user context
    let validatedCompanyId: string
    try {
      const authContext = await validateAndGetCompanyId(request, companyId)
      validatedCompanyId = authContext.companyId
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Get company - use string ID
    const Company = mongoose.model('Company')
    const company = await Company.findOne({ id: validatedCompanyId })
    
    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      )
    }
    
    // Get product - use string ID
    const Uniform = mongoose.model('Uniform')
    const product = await Uniform.findOne({ id: productId })
    
    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }
    
    // Get subcategory - use string ID and validate it belongs to the company
    const subcategory = await Subcategory.findOne({ id: subCategoryId })
    
    if (!subcategory) {
      return NextResponse.json(
        { error: 'Subcategory not found' },
        { status: 404 }
      )
    }
    
    // CRITICAL SECURITY CHECK: Ensure subcategory belongs to the company - use string IDs
    if (String(subcategory.companyId) !== company.id) {
      return NextResponse.json(
        { error: 'Subcategory does not belong to the specified company' },
        { status: 403 }
      )
    }
    
    if (subcategory.status !== 'active') {
      return NextResponse.json(
        { error: 'Subcategory is not active' },
        { status: 400 }
      )
    }
    
    // Check if mapping already exists - use string IDs
    const existing = await ProductSubcategoryMapping.findOne({
      productId: product.id,
      subCategoryId: subcategory.id,
      companyId: company.id
    })
    
    if (existing) {
      console.log('[POST /product-subcategory-mappings] Mapping already exists:', {
        productId: product.id,
        subCategoryId: subcategory.id,
        companyId: validatedCompanyId
      })
      return NextResponse.json(
        { error: 'Product-subcategory mapping already exists for this company' },
        { status: 409 }
      )
    }
    
    // Log before creation for debugging
    console.log('[POST /product-subcategory-mappings] Creating mapping:', {
      productId: product.id,
      subCategoryId: subcategory.id,
      companyId: validatedCompanyId,
      companySpecificPrice
    })
    
    // Create mapping - use string IDs
    let mapping
    try {
      mapping = await ProductSubcategoryMapping.create({
        productId: product.id,
        subCategoryId: subcategory.id,
        companyId: company.id,
        companySpecificPrice: companySpecificPrice !== undefined ? companySpecificPrice : undefined
      })
      console.log('[POST /product-subcategory-mappings] ✅ Mapping created successfully:', {
        mappingId: mapping.id,
        productId: product.id,
        subCategoryId: subcategory.id
      })
    } catch (createError: any) {
      console.error('[POST /product-subcategory-mappings] ❌ Error during ProductSubcategoryMapping.create():', {
        error: createError.message,
        errorCode: createError.code,
        errorName: createError.name,
        stack: createError.stack,
        productId: product.id,
        subCategoryId: subcategory.id,
        companyId: validatedCompanyId
      })
      throw createError // Re-throw to be caught by outer catch block
    }
    
    // Manually populate productId and subCategoryId since populate doesn't work with string IDs
    if (mapping.productId) {
      const product = await Uniform.findOne({ id: mapping.productId }).select('id name').lean()
      if (product) {
        (mapping as any).productId = product
      }
    }
    if (mapping.subCategoryId) {
      const subcategory = await Subcategory.findOne({ id: mapping.subCategoryId }).select('id name').lean()
      if (subcategory) {
        (mapping as any).subCategoryId = subcategory
      }
    }
    
    // Return string 'id' fields for consistency with GET endpoint
    const populatedProduct = mapping.productId as any
    const populatedSubcategory = mapping.subCategoryId as any
    
    return NextResponse.json({
      success: true,
      mapping: {
        id: mapping.id,
        productId: populatedProduct?.id || product.id, // Use string 'id' field
        subCategoryId: populatedSubcategory?.id || subcategory.id, // Use string 'id' field
        companyId: String(mapping.companyId),
        companySpecificPrice: mapping.companySpecificPrice
      }
    })
  } catch (error: any) {
    console.error('[POST /product-subcategory-mappings] ❌ CRITICAL ERROR creating mapping:', {
      errorMessage: error.message,
      errorCode: error.code,
      errorName: error.name,
      errorStack: error.stack,
      errorString: String(error),
      errorType: typeof error,
      errorKeys: Object.keys(error || {})
    })
    
    // Handle duplicate key error (MongoDB unique constraint violation)
    if (error.code === 11000) {
      console.error('[POST /product-subcategory-mappings] Duplicate key error (11000):', error.keyPattern || error.keyValue)
      return NextResponse.json(
        { error: 'Product-subcategory mapping already exists for this company' },
        { status: 409 }
      )
    }
    
    // Handle validation errors from pre-save hook
    if (error.name === 'ValidationError' || error.message?.includes('Subcategory')) {
      console.error('[POST /product-subcategory-mappings] Validation error from pre-save hook:', error.message)
      return NextResponse.json(
        { error: error.message || 'Validation failed: Subcategory validation error' },
        { status: 400 }
      )
    }
    
    // Return detailed error for debugging (in production, you might want to sanitize this)
    return NextResponse.json(
      { 
        error: error.message || 'Failed to create mapping',
        details: process.env.NODE_ENV === 'development' ? {
          code: error.code,
          name: error.name,
          stack: error.stack
        } : undefined
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/product-subcategory-mappings
 * Delete a product-subcategory mapping (Company Admin only)
 */
export async function DELETE(request: NextRequest) {
  try {
    await connectDB()
    
    const searchParams = request.nextUrl.searchParams
    const mappingId = searchParams.get('mappingId')
    
    if (!mappingId) {
      return NextResponse.json(
        { error: 'mappingId is required' },
        { status: 400 }
      )
    }
    
    // Find mapping - use string ID only
    const mappingIdStr = String(mappingId)
    const mapping = await ProductSubcategoryMapping.findOne({ id: mappingIdStr })
    
    if (!mapping) {
      return NextResponse.json(
        { error: 'Mapping not found' },
        { status: 404 }
      )
    }
    
    // Validate companyId from authenticated user context and ensure mapping belongs to user's company
    try {
      const authContext = await validateAndGetCompanyId(request)
      // Compare string IDs directly
      const mappingCompanyId = String(mapping.companyId)
      if (mappingCompanyId !== authContext.companyId) {
        return NextResponse.json(
          { error: 'Forbidden: Mapping does not belong to your company' },
          { status: 403 }
        )
      }
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Delete mapping - use string ID
    await ProductSubcategoryMapping.deleteOne({ id: (mapping as any).id })
    
    return NextResponse.json({
      success: true,
      message: 'Product-subcategory mapping deleted successfully'
    })
  } catch (error: any) {
    console.error('Error deleting product-subcategory mapping:', error)
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
