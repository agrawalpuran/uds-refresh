import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import connectDB from '@/lib/db/mongodb'
import { getLocationByAdminEmail } from '@/lib/db/data-access'
import Employee from '@/lib/models/Employee'
import Location from '@/lib/models/Location'
import Subcategory from '@/lib/models/Subcategory'
import ProductSubcategoryMapping from '@/lib/models/ProductSubcategoryMapping'
import Uniform from '@/lib/models/Uniform'
import DesignationSubcategoryEligibility from '@/lib/models/DesignationSubcategoryEligibility'
import { ProductVendor } from '@/lib/models/Relationship'
import mongoose from 'mongoose'
import { decrypt } from '@/lib/utils/encryption'

/**
 * Generate Excel template for Site Admin bulk order upload
 * 
 * Template contains 3 sheets:
 * 1. Employee Reference (read-only) - ONLY employees belonging to Site Admin's location
 * 2. Product Reference (read-only) - Products available via subcategory eligibility
 * 3. Bulk Orders (input sheet) - Where Site Admin enters orders
 * 
 * STRICT SITE SCOPING: Only employees from Site Admin's location are included
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  try {
    await connectDB()
    
    const searchParams = request.nextUrl.searchParams
    const adminEmail = searchParams.get('adminEmail')

    if (!adminEmail) {
      return NextResponse.json(
        { error: 'Admin email is required' },
        { status: 400 }
      )
    }

    // Verify Site Admin access
    const location = await getLocationByAdminEmail(adminEmail.trim().toLowerCase())
    if (!location) {
      return NextResponse.json(
        { error: 'Unauthorized: Only Site Admins can download bulk order templates' },
        { status: 403 }
      )
    }

    // Use location string ID directly
    const locationIdStr = location.id
    if (!locationIdStr) {
      return NextResponse.json(
        { error: 'Location ID not found' },
        { status: 400 }
      )
    }

    // ============================================================
    // SHEET 1: EMPLOYEE REFERENCE (READ-ONLY) - SITE SCOPED
    // ============================================================
    // Get ONLY employees belonging to this location - use string ID
    const employees = await Employee.find({ 
      locationId: locationIdStr,
      status: 'active' 
    })
      .select('employeeId id firstName lastName designation location')
      .lean()

    const employeeData = employees.map((emp: any) => {
      let designation = emp.designation
      if (designation && typeof designation === 'string' && designation.includes(':')) {
        try {
          designation = decrypt(designation)
        } catch (error) {
          // Keep original if decryption fails
        }
      }

      let locationName = location.name || 'N/A'
      if (emp.location && typeof emp.location === 'string' && emp.location.includes(':')) {
        try {
          locationName = decrypt(emp.location)
        } catch (error) {
          // Keep original if decryption fails
        }
      }

      return {
        'Employee ID': emp.employeeId || emp.id || '',
        'Employee Name': `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'N/A',
        'Designation': designation || 'N/A',
        'Site Name': locationName
      }
    })

    // ============================================================
    // SHEET 2: PRODUCT REFERENCE (READ-ONLY)
    // Get products available via subcategory eligibility for employees in this location
    // ============================================================
    // Get all unique designations for employees in this location
    const locationEmployees = await Employee.find({ 
      locationId: locationIdStr,
      status: 'active' 
    })
      .select('designation gender companyId')
      .lean()

    if (locationEmployees.length === 0) {
      return NextResponse.json(
        { error: 'No active employees found in your location. Please add employees first.' },
        { status: 400 }
      )
    }

    const designationSet = new Set<string>()
    const genderSet = new Set<'male' | 'female' | 'unisex'>()
    const companyId = locationEmployees[0]?.companyId

    if (!companyId) {
      return NextResponse.json(
        { error: 'Location employees must belong to a company' },
        { status: 400 }
      )
    }

    locationEmployees.forEach((emp: any) => {
      let designation = emp.designation
      if (designation && typeof designation === 'string' && designation.includes(':')) {
        try {
          designation = decrypt(designation)
        } catch (error) {
          // Keep original if decryption fails
        }
      }
      if (designation) {
        designationSet.add(designation.trim())
      }
      if (emp.gender) {
        genderSet.add(emp.gender)
      }
    })

    // Get all products eligible for designations in this location
    const allEligibleProductIds = new Set<string>()
    const productDetailsMap = new Map<string, {
      id: string
      name: string
      subcategory: string
      vendor: string
      sku: string
      sizes: string[]
    }>()

    // Get all active subcategory eligibilities for this company
    // CRITICAL FIX: subCategoryId is stored as STRING ID, not ObjectId - cannot use populate
    const allEligibilities = await DesignationSubcategoryEligibility.find({
      companyId: companyId,
      status: 'active'
    }).lean()

    const eligibleSubcategoryIds = new Set<string>()
    allEligibilities.forEach((elig: any) => {
      // Use string ID directly
      const subcatId = String(elig.subCategoryId)
      if (subcatId) {
        eligibleSubcategoryIds.add(subcatId)
      }
    })

    // Get all product-subcategory mappings for eligible subcategories - use string IDs
    // CRITICAL FIX: subCategoryId is stored as STRING ID, not ObjectId - cannot use populate
    const productMappings = await ProductSubcategoryMapping.find({
      subCategoryId: { $in: Array.from(eligibleSubcategoryIds) },
      companyId: String(companyId)
    }).lean()
    
    // Manually fetch subcategories using string IDs
    const subcategories = await Subcategory.find({
      id: { $in: Array.from(eligibleSubcategoryIds) }
    }).select('id name parentCategoryId').lean()
    const subcategoryMap = new Map(subcategories.map((s: any) => [s.id, s]))

    // Get all product string IDs from mappings
    const productIds = new Set<string>()
    productMappings.forEach((mapping: any) => {
      const productId = String(mapping.productId)
      if (productId) {
        productIds.add(productId)
      }
    })

    // Fetch all products with their details - use string IDs
    const products = await Uniform.find({
      id: { $in: Array.from(productIds) }
    })
      .lean()

    // Build product details map
    for (const product of products) {
      const productId = (product as any).id
      const subcategoryMapping = productMappings.find((m: any) => 
        String(m.productId) === productId
      )
      
      if (subcategoryMapping) {
        const subcategory = subcategoryMap.get(String(subcategoryMapping.subCategoryId))
        const subcategoryName = subcategory?.name || 'N/A'
        
        // Get vendor name - use string product ID
        const productVendor: any = await ProductVendor.findOne({ productId: productId }).lean()
        let vendorName = 'N/A'
        if (productVendor?.vendorId) {
          const vendor = await Vendor.findOne({ id: productVendor.vendorId }).select('name').lean()
          if (vendor) {
            vendorName = vendor.name || 'N/A'
          }
        }

        productDetailsMap.set(productId, {
          id: productId,
          name: product.name || 'Unknown Product',
          subcategory: subcategoryName,
          vendor: vendorName,
          sku: product.sku || 'N/A',
          sizes: product.sizes || []
        })
      }
    }

    // Build product reference data
    const productData = Array.from(productDetailsMap.values()).map(p => ({
      'Product Code': p.id,
      'Product Name': p.name,
      'Supported Sizes': p.sizes ? p.sizes.join(', ') : 'N/A',
      'Subcategory': p.subcategory,
      'Vendor': p.vendor,
      'SKU': p.sku
    }))

    // ============================================================
    // SHEET 3: BULK ORDERS (INPUT SHEET)
    // ============================================================
    const bulkOrdersData = [
      {
        'Employee ID': '',
        'Product Code': '',
        'Size': '',
        'Quantity': '',
        'Shipping Location': ''
      }
    ]

    // Create workbook
    const workbook = XLSX.utils.book_new()

    // Add sheets
    const employeeSheet = XLSX.utils.json_to_sheet(employeeData)
    const productSheet = XLSX.utils.json_to_sheet(productData)
    const bulkOrdersSheet = XLSX.utils.json_to_sheet(bulkOrdersData)

    XLSX.utils.book_append_sheet(workbook, employeeSheet, 'Employee Reference')
    XLSX.utils.book_append_sheet(workbook, productSheet, 'Product Reference')
    XLSX.utils.book_append_sheet(workbook, bulkOrdersSheet, 'Bulk Orders')

    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    // Return Excel file
    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="site_bulk_order_template_${locationIdStr || 'template'}.xlsx"`,
      },
    })
  } catch (error) {
    const err = error as any
    console.error('Error generating site bulk order template:', err)
    const errorMessage = err?.message || err?.toString() || 'Internal server error'
    
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

