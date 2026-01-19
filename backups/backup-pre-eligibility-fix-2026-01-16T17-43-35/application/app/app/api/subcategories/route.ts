
/**
 * Company Admin Subcategory Management APIs
 * 
 * Subcategories are COMPANY-SPECIFIC and managed by Company Admin.
 * Each subcategory has a parent category (global).
 * 
 * SECURITY: All operations validate companyId from auth context.
 */

import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import Subcategory from '@/lib/models/Subcategory'
import Category from '@/lib/models/Category'
import { validateAndGetCompanyId } from '@/lib/utils/api-auth'
import mongoose from 'mongoose'

/**
 * GET /api/subcategories
 * Get subcategories for a company (filtered by category if provided)
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    await connectDB()
    
    const searchParams = request.nextUrl.searchParams
    const companyId = searchParams.get('companyId')
    const categoryId = searchParams.get('categoryId') // Optional: filter by parent category
    const status = searchParams.get('status') // Optional: 'active' | 'inactive'
    
    console.log('[API /subcategories] Request params:', { companyId, categoryId, status })
    
    // Validate companyId from authenticated user context
    let validatedCompanyId: string
    try {
      const authContext = await validateAndGetCompanyId(request, companyId)
      validatedCompanyId = authContext.companyId
      console.log('[API /subcategories] Validated companyId:', validatedCompanyId)
    } catch (error: any) {
      console.error('[API /subcategories] ❌ Authentication failed:', error.message)
      return NextResponse.json(
        { error: error.message || 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Get company - use string ID
    const Company = mongoose.model('Company')
    const company = await Company.findOne({ id: validatedCompanyId })
    
    if (!company) {
      console.error('[API /subcategories] ❌ Company not found for ID:', validatedCompanyId)
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      )
    }
    
    console.log('[API /subcategories] Found company:', { id: company.id })
    
    // Build query - use string IDs
    const query: any = {
      companyId: company.id
    }
    
    if (categoryId) {
      // Find parent category - use string ID
      const parentCategory = await Category.findOne({ id: categoryId })
      
      if (!parentCategory) {
        console.error('[API /subcategories] ❌ Parent category not found:', categoryId)
        return NextResponse.json(
          { error: 'Parent category not found' },
          { status: 404 }
        )
      }
      
      query.parentCategoryId = parentCategory.id
      console.log('[API /subcategories] Filtering by parent category:', parentCategory.name)
    }
    
    if (status === 'active' || status === 'inactive') {
      query.status = status
      console.log('[API /subcategories] Filtering by status:', status)
    }
    
    console.log('[API /subcategories] Query:', {
      companyId: query.companyId?.toString(),
      parentCategoryId: query.parentCategoryId?.toString(),
      status: query.status
    })
    
    // First, check if ANY subcategories exist for this company (for debugging)
    const allCompanySubcategories = await Subcategory.find({ companyId: company.id }).lean()
    console.log('[API /subcategories] All subcategories for company (no filters):', {
      count: allCompanySubcategories.length,
      breakdown: {
        active: allCompanySubcategories.filter((s: any) => s.status === 'active').length,
        inactive: allCompanySubcategories.filter((s: any) => s.status === 'inactive').length,
      },
      samples: allCompanySubcategories.slice(0, 3).map((s: any) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        companyId: s.companyId?.toString(),
      }))
    })
    
    const subcategories = await Subcategory.find(query)
      .sort({ name: 1 })
      .lean()
    
    console.log('[API /subcategories] Found subcategories with query:', {
      count: subcategories.length,
      raw: subcategories.map((s: any) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        companyId: s.companyId?.toString(),
        parentCategoryId: s.parentCategoryId,
        parentCategoryIdType: typeof s.parentCategoryId,
      }))
    })
    
    // CRITICAL FIX: parentCategoryId is stored as STRING ID, not ObjectId
    // Manually fetch parent categories using string IDs
    const uniqueParentCategoryIds = [...new Set(subcategories.map((s: any) => s.parentCategoryId).filter(Boolean))]
    const parentCategories = await Category.find({ id: { $in: uniqueParentCategoryIds } })
      .select('id name isSystemCategory')
      .lean()
    const parentCategoryMap = new Map(parentCategories.map((c: any) => [c.id, c]))
    
    // Map subcategories to response format
    const mappedSubcategories = subcategories.map((sub: any) => {
      // parentCategoryId is a STRING ID, not ObjectId - fetch parent category manually
      const parentCategoryId = sub.parentCategoryId
      const parentCategory = parentCategoryId ? parentCategoryMap.get(parentCategoryId) : null
      
      return {
        id: sub.id,
        _id: sub._id.toString(),
        name: sub.name,
        parentCategoryId: parentCategoryId?.toString() || null,
        parentCategory: parentCategory ? {
          id: parentCategory.id,
          name: parentCategory.name,
          isSystemCategory: parentCategory.isSystemCategory
        } : null,
        companyId: sub.companyId.toString(),
        status: sub.status,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt
      }
    })
    
    console.log('[API /subcategories] Mapped subcategories:', {
      count: mappedSubcategories.length,
      subcategories: mappedSubcategories.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        hasParentCategory: !!s.parentCategory,
        parentCategoryName: s.parentCategory?.name,
        parentCategoryId: s.parentCategoryId,
      }))
    })
    
    return NextResponse.json({
      success: true,
      subcategories: mappedSubcategories
    })
  } catch (error: any) {
    console.error('[API /subcategories] ❌ Error fetching subcategories:', error)
    console.error('[API /subcategories] Error stack:', error.stack)
    
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
      { error: error.message || 'Failed to fetch subcategories' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/subcategories
 * Create a new subcategory (Company Admin only)
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB()
    
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const { companyId, parentCategoryId, name } = body
    
    if (!parentCategoryId || !name) {
      return NextResponse.json(
        { error: 'parentCategoryId and name are required' },
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

    const Company = mongoose.model('Company')
    const company = await Company.findOne({ id: validatedCompanyId })
    
    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      )
    }

    // Find parent category - use string ID
    const parentCategory = await Category.findOne({ id: parentCategoryId })
    
    if (!parentCategory) {
      return NextResponse.json(
        { error: 'Parent category not found' },
        { status: 404 }
      )
    }

    if (parentCategory.status !== 'active') {
      return NextResponse.json(
        { error: 'Parent category is not active' },
        { status: 400 }
      )
    }
    
    // Check if subcategory with same name already exists for this company/category
    const existing = await Subcategory.findOne({
      parentCategoryId: parentCategory.id,
      companyId: company.id,
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
    })
    
    if (existing) {
      return NextResponse.json(
        { error: 'Subcategory with this name already exists for this category and company' },
        { status: 409 }
      )
    }

    // Generate new subcategory ID
    let subcategoryId = 600001
    while (await Subcategory.findOne({ id: subcategoryId.toString() })) {
      subcategoryId++
    }
    
    // Create subcategory - use string IDs
    const subcategory = await Subcategory.create({
      id: subcategoryId.toString(),
      name: name.trim(),
      parentCategoryId: parentCategory.id,
      companyId: company.id,
      status: 'active'
    })
    
    // Manually populate parent category since populate doesn't work with string IDs
    if (subcategory.parentCategoryId) {
      const parentCategory = await Category.findOne({ id: subcategory.parentCategoryId }).select('id name isSystemCategory').lean()
      if (parentCategory) {
        (subcategory as any).parentCategory = parentCategory
      }
    }
    
    return NextResponse.json({
      success: true,
      subcategory: {
        id: subcategory.id,
        name: subcategory.name,
        parentCategoryId: String(subcategory.parentCategoryId),
        parentCategory: {
          id: (subcategory.parentCategoryId as any).id,
          name: (subcategory.parentCategoryId as any).name
        },
        companyId: String(subcategory.companyId),
        status: subcategory.status
      }
    })

  } catch (error: any) {
    console.error('Error creating subcategory:', error)
    
    // Handle duplicate key error
    if (error.code === 11000 || error.message.includes('already exists')) {
      return NextResponse.json(
        { error: 'Subcategory with this name already exists for this category and company' },
        { status: 409 }
      )
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to create subcategory' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/subcategories
 * Update a subcategory (Company Admin only)
 */
export async function PUT(request: NextRequest) {
  try {
    await connectDB()
    
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    }

    const { subcategoryId, name, status } = body
    
    if (!subcategoryId) {
      return NextResponse.json(
        { error: 'subcategoryId is required' },
        { status: 400 }
      )
    }
    
    // Find subcategory - use string ID
    const subcategory = await Subcategory.findOne({ id: subcategoryId })
    
    if (!subcategory) {
      return NextResponse.json(
        { error: 'Subcategory not found' },
        { status: 404 }
      )
    }
    
    // Validate companyId from authenticated user context and ensure subcategory belongs to user's company
    try {
      const authContext = await validateAndGetCompanyId(request)
      // Compare string IDs directly
      const subcategoryCompanyId = String(subcategory.companyId)
      
      if (subcategoryCompanyId !== authContext.companyId) {
        return NextResponse.json(
          { error: 'Forbidden: Subcategory does not belong to your company' },
          { status: 403 }
        )
      }
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Update fields
    if (name !== undefined && name !== subcategory.name) {
      const trimmedName = name.trim()
      
      // Check if new name conflicts
      const existing = await Subcategory.findOne({
        parentCategoryId: subcategory.parentCategoryId,
        companyId: subcategory.companyId,
        name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
        id: { $ne: subcategory.id }
      })
      
      if (existing) {
        return NextResponse.json(
          { error: 'Subcategory with this name already exists for this category and company' },
          { status: 409 }
        )
      }
      
      subcategory.name = trimmedName
    }
    
    if (status !== undefined) {
      if (status !== 'active' && status !== 'inactive') {
        return NextResponse.json(
          { error: 'Status must be "active" or "inactive"' },
          { status: 400 }
        )
      }
      subcategory.status = status
    }
    
    await subcategory.save()
    await subcategory.populate('parentCategoryId', 'id name')
    
    return NextResponse.json({
      success: true,
      subcategory: {
        id: subcategory.id,
        name: subcategory.name,
        parentCategoryId: String(subcategory.parentCategoryId),
        companyId: String(subcategory.companyId),
        status: subcategory.status
      }
    })
  } catch (error: any) {
    console.error('Error updating subcategory:', error)
    console.error('Error updating subcategory:', error)
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

/**
 * DELETE /api/subcategories
 * Soft delete a subcategory (Company Admin only)
 */
export async function DELETE(request: NextRequest) {
  try {
    await connectDB()
    
    const searchParams = request.nextUrl.searchParams
    const subcategoryId = searchParams.get('subcategoryId')
    
    if (!subcategoryId) {
      return NextResponse.json(
        { error: 'subcategoryId is required' },
        { status: 400 }
      )
    }
    
    // Find subcategory - use string ID
    const subcategory = await Subcategory.findOne({ id: subcategoryId })
    
    if (!subcategory) {
      return NextResponse.json(
        { error: 'Subcategory not found' },
        { status: 404 }
      )
    }
    
    // Validate companyId from authenticated user context and ensure subcategory belongs to user's company
    try {
      const authContext = await validateAndGetCompanyId(request)
      // Compare string IDs directly
      const subcategoryCompanyId = String(subcategory.companyId)
      
      if (subcategoryCompanyId !== authContext.companyId) {
        return NextResponse.json(
          { error: 'Forbidden: Subcategory does not belong to your company' },
          { status: 403 }
        )
      }
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Check if subcategory has active product mappings - use string ID
    const ProductSubcategoryMapping = mongoose.model('ProductSubcategoryMapping')
    const mappingCount = await ProductSubcategoryMapping.countDocuments({
      subCategoryId: subcategory.id
    })
    
    if (mappingCount > 0) {
      return NextResponse.json(
        { 
          error: `Cannot delete subcategory: ${mappingCount} product mapping(s) exist`,
          mappingCount 
        },
        { status: 409 }
      )
    }
    
    // Check if subcategory has active eligibilities - use string ID
    const DesignationSubcategoryEligibility = mongoose.model('DesignationSubcategoryEligibility')
    const eligibilityCount = await DesignationSubcategoryEligibility.countDocuments({
      subCategoryId: subcategory.id,
      status: 'active'
    })
    
    if (eligibilityCount > 0) {
      return NextResponse.json(
        { 
          error: `Cannot delete subcategory: ${eligibilityCount} active eligibility(ies) exist`,
          eligibilityCount 
        },
        { status: 409 }
      )
    }
    
    // Soft delete
    subcategory.status = 'inactive'
    await subcategory.save()
    
    return NextResponse.json({
      success: true,
      message: 'Subcategory deleted successfully'
    })
  } catch (error: any) {
    console.error('Error deleting subcategory:', error)
    console.error('Error deleting subcategory:', error)
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
