import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import ProductCategory from '@/lib/models/ProductCategory'
import mongoose from 'mongoose'
import {
  getCategoriesByCompany,
  getCategoryByIdOrName,
  ensureSystemCategories
} from '@/lib/db/category-helpers'

/**
 * GET /api/categories
 * Get all categories for a company
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  try {
    await connectDB()
    
    const searchParams = request.nextUrl.searchParams
    const companyId = searchParams.get('companyId')
    
    if (!companyId) {
      return NextResponse.json(
        { error: 'companyId is required' },
        { status: 400 }
      )
    }
    
    // Ensure system categories exist
    await ensureSystemCategories(companyId)
    
    // Get all categories
    const categories = await getCategoriesByCompany(companyId)
    
    return NextResponse.json({
      success: true,
      categories
    })
  } catch (error: any) {
    console.error('Error fetching categories:', error)
    
    // Return appropriate status code based on error type
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    const isConnectionError = errorMessage.includes('Mongo') || 
                              errorMessage.includes('connection') || 
                              errorMessage.includes('ECONNREFUSED') ||
                              errorMessage.includes('timeout') ||
                              error?.code === 'ECONNREFUSED' ||
                              error?.name === 'MongoNetworkError'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('not found')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    // Return 503 for connection errors, 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: isConnectionError ? 503 : 500 }
    )
  }
}

/**
 * POST /api/categories
 * Create a new category
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
    
    const { companyId, name, renewalUnit = 'months' } = body
    
    if (!companyId || !name) {
      return NextResponse.json(
        { error: 'companyId and name are required' },
        { status: 400 }
      )
    }
    
    // Get company - use string ID
    const Company = mongoose.model('Company')
    const company = await Company.findOne({ id: companyId })
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }
    
    // Check if category with same name already exists - use string ID
    const existing = await ProductCategory.findOne({
      companyId: company.id,
      name: { $regex: new RegExp(`^${name}$`, 'i') }
    })
    
    if (existing) {
      return NextResponse.json(
        { error: 'Category with this name already exists' },
        { status: 409 }
      )
    }
    
    // Generate unique ID
    let categoryId = 500001
    while (await ProductCategory.findOne({ id: categoryId.toString() })) {
      categoryId++
    }
    
    // Create category - use string ID
    const category = await ProductCategory.create({
      id: categoryId.toString(),
      name: name.trim(),
      companyId: company.id,
      renewalUnit: renewalUnit === 'years' ? 'years' : 'months',
      isSystemCategory: false,
      status: 'active'
    })
    
    return NextResponse.json({
      success: true,
      category: {
        id: category.id,
        name: category.name,
        companyId: String(category.companyId),
        renewalUnit: category.renewalUnit,
        isSystemCategory: category.isSystemCategory,
        status: category.status
      }
    })
  } catch (error: any) {
    console.error('Error creating category:', error)
    console.error('Error creating category:', error)
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
 * PUT /api/categories
 * Update a category
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
    
    const { categoryId, name, renewalUnit, status } = body
    
    if (!categoryId) {
      return NextResponse.json(
        { error: 'categoryId is required' },
        { status: 400 }
      )
    }
    
    // Find category - use string ID
    const category = await ProductCategory.findOne({ id: categoryId })
    
    if (!category) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      )
    }
    
    // Update fields
    if (name !== undefined) {
      category.name = name.trim()
    }
    if (renewalUnit !== undefined) {
      category.renewalUnit = renewalUnit === 'years' ? 'years' : 'months'
    }
    if (status !== undefined) {
      category.status = status === 'inactive' ? 'inactive' : 'active'
    }
    
    await category.save()
    
    return NextResponse.json({
      success: true,
      category: {
        id: category.id,
        name: category.name,
        companyId: String(category.companyId),
        renewalUnit: category.renewalUnit,
        isSystemCategory: category.isSystemCategory,
        status: category.status
      }
    })
  } catch (error: any) {
    console.error('Error updating category:', error)
    console.error('Error updating category:', error)
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
 * DELETE /api/categories
 * Delete a category (soft delete by setting status to inactive)
 */
export async function DELETE(request: NextRequest) {
  try {
    await connectDB()
    
    const searchParams = request.nextUrl.searchParams
    const categoryId = searchParams.get('categoryId')
    
    if (!categoryId) {
      return NextResponse.json(
        { error: 'categoryId is required' },
        { status: 400 }
      )
    }
    
    // Find category - use string ID
    const category = await ProductCategory.findOne({ id: categoryId })
    
    if (!category) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      )
    }
    
    // Don't allow deleting system categories
    if (category.isSystemCategory) {
      return NextResponse.json(
        { error: 'Cannot delete system categories' },
        { status: 403 }
      )
    }
    
    // Soft delete
    category.status = 'inactive'
    await category.save()
    
    return NextResponse.json({
      success: true,
      message: 'Category deleted successfully'
    })
  } catch (error: any) {
    console.error('Error deleting category:', error)
    console.error('Error deleting category:', error)
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

