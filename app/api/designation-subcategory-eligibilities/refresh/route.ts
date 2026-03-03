
/**
 * POST /api/designation-subcategory-eligibilities/refresh
 * Refresh employee eligibility based on subcategory-based designation eligibility
 * 
 * This endpoint recomputes eligibility for all employees with a specific designation
 * based on the subcategory-level eligibility rules.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/utils/api-auth-context'
import connectDB from '@/lib/db/mongodb'
import mongoose from 'mongoose'
import DesignationSubcategoryEligibility from '@/lib/models/DesignationSubcategoryEligibility'
import Subcategory from '@/lib/models/Subcategory'
import Category from '@/lib/models/Category'
import ProductCategory from '@/lib/models/ProductCategory'
import Employee from '@/lib/models/Employee'
import Company from '@/lib/models/Company'
import { validateAndGetCompanyId } from '@/lib/utils/api-auth'
import { decrypt } from '@/lib/utils/encryption'
import { normalizeCategoryName } from '@/lib/db/category-helpers'

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

/** Escape special regex characters so designationId can be used in a case-insensitive match */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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

    const { companyId, designationId, gender = 'unisex' } = body
    
    if (!companyId || !designationId) {
      return NextResponse.json(
        { error: 'companyId and designationId are required' },
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
    const company = await Company.findOne({ id: validatedCompanyId })
    
    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      )
    }
    
    // Get all active designation-subcategory eligibilities - case-insensitive designation match
    const designationTrimmed = designationId.trim()
    const eligibilities = await DesignationSubcategoryEligibility.find({
      companyId: company.id,
      designationId: { $regex: new RegExp(`^${escapeRegex(designationTrimmed)}$`, 'i') },
      gender: gender === 'unisex' ? { $in: ['male', 'female', 'unisex'] } : gender,
      status: 'active'
    }).lean()
    
    if (eligibilities.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No active eligibility rules found for designation "${designationId}" and gender "${gender}"`,
        employeesUpdated: 0
      })
    }
    
    // Get all subcategory string IDs
    const subcategoryIds = eligibilities
      .map(e => String(e.subCategoryId))
      .filter(Boolean)
    
    // CRITICAL FIX: parentCategoryId is stored as STRING ID, not ObjectId - cannot use populate
    // Get all subcategories - use string IDs
    const subcategories = await Subcategory.find({
      id: { $in: subcategoryIds },
      companyId: company.id,
      status: 'active'
    })
      .select('id name parentCategoryId')
      .lean()
    
    // Manually fetch parent categories (Category first, then ProductCategory for missing IDs)
    const uniqueParentCategoryIds = [...new Set(subcategories.map((s: any) => s.parentCategoryId).filter(Boolean))]
    let parentCategories = await Category.find({ id: { $in: uniqueParentCategoryIds } })
      .select('id name')
      .lean()
    const foundIds = new Set(parentCategories.map((c: any) => c.id))
    const missingIds = uniqueParentCategoryIds.filter((id: string) => !foundIds.has(id))
    if (missingIds.length > 0) {
      const productCategories = await ProductCategory.find({
        id: { $in: missingIds },
        companyId: company.id
      })
        .select('id name')
        .lean()
      parentCategories = [...parentCategories, ...productCategories]
    }
    const parentCategoryMap = new Map(parentCategories.map((c: any) => [c.id, c]))
    
    // Create a map: subcategoryId -> subcategory data with parent category - use string IDs
    const subcategoryMapById = new Map<string, any>()
    for (const subcat of subcategories) {
      const subcatId = (subcat as any).id
      const parentCategory = (subcat as any).parentCategoryId ? parentCategoryMap.get((subcat as any).parentCategoryId) : null
      subcategoryMapById.set(subcatId, {
        ...subcat,
        parentCategoryId: parentCategory ? parentCategory.id : (subcat as any).parentCategoryId,
        parentCategory
      })
    }
    
    // Aggregate eligibility by parent category
    const categoryEligibility: Record<string, { quantity: number; renewalFrequency: number }> = {}
    
    for (const elig of eligibilities) {
      const subcatId = String(elig.subCategoryId)
      const subcat = subcategoryMapById.get(subcatId)
      
      if (subcat && subcat.parentCategory) {
        const parentCategory = subcat.parentCategory
        const rawCategoryName = parentCategory.name?.toLowerCase() || ''
        const categoryName = normalizeCategoryName(rawCategoryName)
        // Map to legacy Employee.eligibility keys only (shirt, pant, shoe, jacket)
        const categoryKey = mapNormalizedToLegacy(categoryName)
        
        if (categoryKey) {
          if (!categoryEligibility[categoryKey]) {
            categoryEligibility[categoryKey] = { quantity: 0, renewalFrequency: 6 }
          }
          
          // Sum quantities for same category (multiple subcategories can map to same category)
          categoryEligibility[categoryKey].quantity += elig.quantity || 0
          
          // Use maximum renewal frequency (convert years to months)
          const renewalFrequency = elig.renewalFrequency || 6
          const renewalUnit = elig.renewalUnit || 'months'
          const frequencyMonths = renewalUnit === 'years' ? renewalFrequency * 12 : renewalFrequency
          categoryEligibility[categoryKey].renewalFrequency = Math.max(
            categoryEligibility[categoryKey].renewalFrequency,
            frequencyMonths
          )
        }
      }
    }
    
    // Find all employees with this designation and company - use string ID
    const allEmployees = await Employee.find({ companyId: company.id }).lean()
    
    // Filter employees by designation (handle encryption)
    const matchingEmployees: any[] = []
    for (const emp of allEmployees) {
      let empDesignation = emp.designation
      if (empDesignation && typeof empDesignation === 'string' && empDesignation.includes(':')) {
        try {
          empDesignation = decrypt(empDesignation)
        } catch (error) {
          continue
        }
      }
      
      // Check if designation matches (case-insensitive)
      if (empDesignation && empDesignation.trim().toLowerCase() === designationId.trim().toLowerCase()) {
        // Check gender filter
        if (gender === 'unisex' || !gender || emp.gender === gender) {
          matchingEmployees.push(emp)
        }
      }
    }
    
    if (matchingEmployees.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No employees found with designation "${designationId}" and gender "${gender || 'all'}"`,
        employeesUpdated: 0
      })
    }
    
    // Update employee eligibility
    let updatedCount = 0
    for (const emp of matchingEmployees) {
      try {
        // Use string ID to find employee
        const employee = await Employee.findOne({ id: emp.id || emp.employeeId })
        if (!employee) {
          console.warn(`Refresh: employee not found (id: ${emp.id || emp.employeeId}), skipping`)
          continue
        }
        {
          // Reset eligibility to defaults
          employee.eligibility = {
            shirt: 0,
            pant: 0,
            shoe: 0,
            jacket: 0
          }
          
          employee.cycleDuration = {
            shirt: 6,
            pant: 6,
            shoe: 6,
            jacket: 12
          }
          
          // Apply new eligibility from subcategories
          for (const [categoryKey, data] of Object.entries(categoryEligibility)) {
            if (categoryKey === 'shirt') {
              employee.eligibility.shirt = data.quantity
              employee.cycleDuration.shirt = data.renewalFrequency
            } else if (categoryKey === 'pant' || categoryKey === 'trouser') {
              employee.eligibility.pant = data.quantity
              employee.cycleDuration.pant = data.renewalFrequency
            } else if (categoryKey === 'shoe') {
              employee.eligibility.shoe = data.quantity
              employee.cycleDuration.shoe = data.renewalFrequency
            } else if (categoryKey === 'jacket' || categoryKey === 'blazer') {
              employee.eligibility.jacket = data.quantity
              employee.cycleDuration.jacket = data.renewalFrequency
            }
          }
          
          await employee.save()
          updatedCount++
        }
      } catch (error: any) {
        console.error(`Error updating employee ${emp.id || emp.employeeId}:`, error)
        // Continue with other employees
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Successfully refreshed eligibility for ${updatedCount} employee(s)`,
      employeesUpdated: updatedCount
    })
    
  } catch (error: any) {
    console.error('Error refreshing employee eligibility:', error)
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
 * Map normalized category name to legacy Employee.eligibility keys (shirt, pant, shoe, jacket).
 * Uses same normalization as category-helpers; only legacy keys are written to Employee.
 */
function mapNormalizedToLegacy(normalizedName: string): string | null {
  if (!normalizedName) return null
  const lower = normalizedName.toLowerCase().trim()
  if (lower === 'shirt') return 'shirt'
  if (lower === 'pant' || lower === 'trouser') return 'pant'
  if (lower === 'shoe') return 'shoe'
  if (lower === 'jacket' || lower === 'blazer') return 'jacket'
  return null
}
