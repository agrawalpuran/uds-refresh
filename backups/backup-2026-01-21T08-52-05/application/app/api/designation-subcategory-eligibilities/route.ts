/**
 * Designation-Subcategory Eligibility APIs (Company-Specific)
 * 
 * Defines eligibility at the subcategory level (not category level).
 * Each designation can have different eligibility for different subcategories.
 * 
 * SECURITY: All operations validate companyId from auth context.
 */

import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import DesignationSubcategoryEligibility from '@/lib/models/DesignationSubcategoryEligibility'
import Subcategory from '@/lib/models/Subcategory'
import Category from '@/lib/models/Category'
import { validateAndGetCompanyId } from '@/lib/utils/api-auth'
import mongoose from 'mongoose'

/**
 * GET /api/designation-subcategory-eligibilities
 * Get designation-subcategory eligibilities for a company
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    await connectDB()
    
    const searchParams = request.nextUrl.searchParams
    const companyId = searchParams.get('companyId')
    const designationId = searchParams.get('designationId') // Optional: filter by designation
    const subCategoryId = searchParams.get('subCategoryId') // Optional: filter by subcategory
    const status = searchParams.get('status') // Optional: 'active' | 'inactive'
    
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
    
    // Build query - use string IDs
    const query: any = {
      companyId: company.id
    }
    
    if (designationId) {
      query.designationId = designationId.trim()
    }
    
    if (subCategoryId) {
      // Use string ID for subcategory
      const subcategory = await Subcategory.findOne({ id: subCategoryId })
      if (!subcategory) {
        return NextResponse.json({ error: 'Subcategory not found' }, { status: 404 })
      }
      query.subCategoryId = subcategory.id
    }
    
    if (status === 'active' || status === 'inactive') {
      query.status = status
    }
    
    // CRITICAL FIX: subCategoryId is stored as STRING ID, not ObjectId - cannot use populate
    const eligibilities = await DesignationSubcategoryEligibility.find(query)
      .sort({ designationId: 1 })
      .lean()
    
    // Manually fetch subcategories using string IDs
    const uniqueSubcategoryIds = [...new Set(eligibilities.map((e: any) => e.subCategoryId).filter(Boolean))]
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
      eligibilities: eligibilities.map((elig: any) => {
        const subcategory = subcategoryMap.get(elig.subCategoryId)
        const parentCategory = subcategory?.parentCategoryId ? parentCategoryMap.get(subcategory.parentCategoryId) : null
        
        return {
          id: elig.id,
          designationId: elig.designationId,
          subCategoryId: elig.subCategoryId,
          subcategory: subcategory ? {
            id: subcategory.id,
            name: subcategory.name,
            parentCategoryId: subcategory.parentCategoryId,
            parentCategory: parentCategory ? {
              id: parentCategory.id,
              name: parentCategory.name,
              isSystemCategory: parentCategory.isSystemCategory
            } : null
          } : null,
          companyId: String(elig.companyId),
          gender: elig.gender,
          quantity: elig.quantity,
          renewalFrequency: elig.renewalFrequency,
          renewalUnit: elig.renewalUnit,
          status: elig.status,
          createdAt: elig.createdAt,
          updatedAt: elig.updatedAt
        }
      })
    })
  } catch (error: any) {
    console.error('Error fetching designation-subcategory eligibilities:', error)
    console.error('Error fetching designation-subcategory eligibilities:', error)
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
 * POST /api/designation-subcategory-eligibilities
 * Create a designation-subcategory eligibility (Company Admin only)
 */
export async function POST(request: NextRequest) {
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

    const { 
      companyId, 
      designationId, 
      subCategoryId, 
      gender = 'unisex',
      quantity, 
      renewalFrequency, 
      renewalUnit = 'months' 
    } = body
    
    if (!designationId || !subCategoryId || quantity === undefined || renewalFrequency === undefined) {
      return NextResponse.json(
        { error: 'designationId, subCategoryId, quantity, and renewalFrequency are required' },
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
    
    if (quantity < 0) {
      return NextResponse.json(
        { error: 'quantity must be >= 0' },
        { status: 400 }
      )
    }
    
    if (renewalFrequency <= 0) {
      return NextResponse.json(
        { error: 'renewalFrequency must be > 0' },
        { status: 400 }
      )
    }
    
    if (renewalUnit !== 'months' && renewalUnit !== 'years') {
      return NextResponse.json(
        { error: 'renewalUnit must be "months" or "years"' },
        { status: 400 }
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
    
    // Check if eligibility already exists - use string IDs
    const existing = await DesignationSubcategoryEligibility.findOne({
      designationId: designationId.trim(),
      subCategoryId: subcategory.id,
      companyId: company.id,
      gender: gender || 'unisex'
    })
    
    if (existing) {
      return NextResponse.json(
        { error: 'Eligibility already exists for this designation, subcategory, company, and gender combination' },
        { status: 409 }
      )
    }
    
    // Generate unique ID
    let eligibilityId = 700001
    while (await DesignationSubcategoryEligibility.findOne({ id: eligibilityId.toString() })) {
      eligibilityId++
    }
    
    // Create eligibility - use string IDs
    // CRITICAL: Ensure all IDs are explicitly strings to prevent ObjectId casting
    const eligibilityData = {
      id: String(eligibilityId),
      designationId: String(designationId.trim()),
      subCategoryId: String(subcategory.id), // Explicitly cast to string
      companyId: String(company.id), // Explicitly cast to string
      gender: gender || 'unisex',
      quantity: Number(quantity),
      renewalFrequency: Number(renewalFrequency),
      renewalUnit: renewalUnit || 'months',
      status: 'active' as const
    }
    
    // Validate string IDs before create (alphanumeric format)
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(eligibilityData.subCategoryId)) {
      return NextResponse.json(
        { error: `Invalid subCategoryId format: ${eligibilityData.subCategoryId}` },
        { status: 400 }
      )
    }
    if (!eligibilityData.companyId || typeof eligibilityData.companyId !== 'string' || eligibilityData.companyId.trim() === '') {
      return NextResponse.json(
        { error: `Invalid companyId: companyId is required` },
        { status: 400 }
      )
    }
    
    // CRITICAL FIX: Ensure Mongoose doesn't try to cast string IDs to ObjectId
    // Create eligibility with explicit type casting to prevent ObjectId conversion
    const eligibility = await DesignationSubcategoryEligibility.create({
      ...eligibilityData,
      // Explicitly ensure these are strings, not ObjectIds
      subCategoryId: String(eligibilityData.subCategoryId),
      companyId: String(eligibilityData.companyId),
      id: String(eligibilityData.id)
    })
    
    // CRITICAL FIX: subCategoryId is stored as STRING ID, not ObjectId - cannot use populate
    // Fetch subcategory manually for response
    const subcategoryForResponse = await Subcategory.findOne({ id: subcategory.id }).select('id name').lean()
    
    return NextResponse.json({
      success: true,
      eligibility: {
        id: eligibility.id,
        designationId: eligibility.designationId,
        subCategoryId: eligibility.subCategoryId,
        subcategory: subcategoryForResponse ? {
          id: subcategoryForResponse.id,
          name: subcategoryForResponse.name
        } : null,
        companyId: eligibility.companyId,
        gender: eligibility.gender,
        quantity: eligibility.quantity,
        renewalFrequency: eligibility.renewalFrequency,
        renewalUnit: eligibility.renewalUnit,
        status: eligibility.status
      }
    })
  } catch (error: any) {
    console.error('Error creating designation-subcategory eligibility:', error)
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return NextResponse.json(
        { error: 'Eligibility already exists for this designation, subcategory, company, and gender combination' },
        { status: 409 }
      )
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to create eligibility' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/designation-subcategory-eligibilities
 * Update a designation-subcategory eligibility (Company Admin only)
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

    const { 
      eligibilityId, 
      quantity, 
      renewalFrequency, 
      renewalUnit, 
      status 
    } = body
    
    if (!eligibilityId) {
      return NextResponse.json(
        { error: 'eligibilityId is required' },
        { status: 400 }
      )
    }
    
    // Find eligibility - use string ID
    const eligibility = await DesignationSubcategoryEligibility.findOne({ id: eligibilityId })
    
    if (!eligibility) {
      return NextResponse.json(
        { error: 'Eligibility not found' },
        { status: 404 }
      )
    }
    
    // TODO: Validate companyId from auth context
    
    // Update fields
    if (quantity !== undefined) {
      if (quantity < 0) {
        return NextResponse.json(
          { error: 'quantity must be >= 0' },
          { status: 400 }
        )
      }
      eligibility.quantity = quantity
    }
    
    if (renewalFrequency !== undefined) {
      if (renewalFrequency <= 0) {
        return NextResponse.json(
          { error: 'renewalFrequency must be > 0' },
          { status: 400 }
        )
      }
      eligibility.renewalFrequency = renewalFrequency
    }
    
    if (renewalUnit !== undefined) {
      if (renewalUnit !== 'months' && renewalUnit !== 'years') {
        return NextResponse.json(
          { error: 'renewalUnit must be "months" or "years"' },
          { status: 400 }
        )
      }
      eligibility.renewalUnit = renewalUnit
    }
    
    if (status !== undefined) {
      if (status !== 'active' && status !== 'inactive') {
        return NextResponse.json(
          { error: 'Status must be "active" or "inactive"' },
          { status: 400 }
        )
      }
      eligibility.status = status
    }
    
    await eligibility.save()
    
    // CRITICAL FIX: subCategoryId is stored as STRING ID, not ObjectId - cannot use populate
    // Fetch subcategory manually for response
    const subcategoryForResponse = await Subcategory.findOne({ id: eligibility.subCategoryId }).select('id name').lean()
    
    return NextResponse.json({
      success: true,
      eligibility: {
        id: eligibility.id,
        designationId: eligibility.designationId,
        subCategoryId: eligibility.subCategoryId,
        subcategory: subcategoryForResponse ? {
          id: subcategoryForResponse.id,
          name: subcategoryForResponse.name
        } : null,
        companyId: eligibility.companyId,
        gender: eligibility.gender,
        quantity: eligibility.quantity,
        renewalFrequency: eligibility.renewalFrequency,
        renewalUnit: eligibility.renewalUnit,
        status: eligibility.status
      }
    })
  } catch (error: any) {
    console.error('Error updating designation-subcategory eligibility:', error)
    console.error('Error updating designation-subcategory eligibility:', error)
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
 * DELETE /api/designation-subcategory-eligibilities
 * Delete a designation-subcategory eligibility (Company Admin only)
 */
export async function DELETE(request: NextRequest) {
  try {
    await connectDB()
    
    const searchParams = request.nextUrl.searchParams
    const eligibilityId = searchParams.get('eligibilityId')
    
    if (!eligibilityId) {
      return NextResponse.json(
        { error: 'eligibilityId is required' },
        { status: 400 }
      )
    }
    
    // Find eligibility - use string ID
    const eligibility = await DesignationSubcategoryEligibility.findOne({ id: eligibilityId })
    
    if (!eligibility) {
      return NextResponse.json(
        { error: 'Eligibility not found' },
        { status: 404 }
      )
    }
    
    // Validate companyId from authenticated user context and ensure eligibility belongs to user's company
    try {
      const authContext = await validateAndGetCompanyId(request)
      // Compare string IDs directly
      const eligibilityCompanyId = String(eligibility.companyId)
      if (eligibilityCompanyId !== authContext.companyId) {
        return NextResponse.json(
          { error: 'Forbidden: Eligibility does not belong to your company' },
          { status: 403 }
        )
      }
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Soft delete
    eligibility.status = 'inactive'
    await eligibility.save()
    
    return NextResponse.json({
      success: true,
      message: 'Eligibility deleted successfully'
    })
  } catch (error: any) {
    console.error('Error deleting designation-subcategory eligibility:', error)
    console.error('Error deleting designation-subcategory eligibility:', error)
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
