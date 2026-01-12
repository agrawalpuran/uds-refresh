import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import connectDB from '@/lib/db/mongodb'
import { getEmployeesByCompany } from '@/lib/db/data-access'
import { getProductsForDesignation } from '@/lib/db/data-access'
import Employee from '@/lib/models/Employee'
import Company from '@/lib/models/Company'
import Subcategory from '@/lib/models/Subcategory'
import ProductSubcategoryMapping from '@/lib/models/ProductSubcategoryMapping'
import Uniform from '@/lib/models/Uniform'
import DesignationSubcategoryEligibility from '@/lib/models/DesignationSubcategoryEligibility'
import mongoose from 'mongoose'
import { decrypt } from '@/lib/utils/encryption'

/**
 * Generate Excel template for bulk order upload
 * 
 * Template contains 3 sheets:
 * 1. Employee Reference (read-only) - All active employees for the company
 * 2. Product Reference (read-only) - All products available via subcategory eligibility
 * 3. Bulk Orders (input sheet) - Where Company Admin enters orders
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  try {
    await connectDB()
    
    const searchParams = request.nextUrl.searchParams
    const companyId = searchParams.get('companyId')
    const adminEmail = searchParams.get('adminEmail')

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      )

    }
    if (!adminEmail) {
      return NextResponse.json(
        { error: 'Admin email is required' },
        { status: 400 }
      )

    // Verify company exists - use string ID only
    const company = await Company.findOne({ id: companyId })
    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      )

    // Verify admin access (Company Admin only for this feature)
    }
    const { isCompanyAdmin } = await import('@/lib/db/data-access')
    const isAdmin = await isCompanyAdmin(adminEmail, companyId)
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized: Only Company Admins can download bulk order templates' },
        { status: 403 }
      )

    // ============================================================
    // SHEET 1: EMPLOYEE REFERENCE (READ-ONLY)
    // ============================================================
    }
    const employees = await Employee.find({ companyId: company.id, status: 'active' })
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

      let location = emp.location
      if (location && typeof location === 'string' && location.includes(':')) {
        try {
          location = decrypt(location)
        } catch (error) {
          // Keep original if decryption fails
        }
      }

      return {
        'Employee ID': emp.employeeId || emp.id || '',
        'Employee Name': `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'N/A',
        'Designation': designation || 'N/A',
        'Location': location || 'N/A'
      }
    })

    // ============================================================
    // SHEET 2: PRODUCT REFERENCE (READ-ONLY)
    // Get all products available via subcategory eligibility
    // ============================================================
    // Get all unique designations for the company
    const allEmployees = await Employee.find({ companyId: company.id, status: 'active' })
      .select('designation gender')
      .lean()

    const designationSet = new Set<string>()
    const genderSet = new Set<'male' | 'female' | 'unisex'>()

    allEmployees.forEach((emp: any) => {
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

    // Get all products eligible for ANY designation in the company
    const allEligibleProductIds = new Set<string>()
    const productDetailsMap = new Map<string, {
      id: string
      name: string
      subcategory: string
      vendor: string
      sku: string
      sizes?: string
    }>()

    // Get all active subcategory eligibilities for this company
    const allEligibilities = await DesignationSubcategoryEligibility.find({
      companyId: company.id,
      status: 'active'
    })
      .populate('subCategoryId', 'id name parentCategoryId')
      .lean()

    const eligibleSubcategoryIds = new Set<string>()
    allEligibilities.forEach((elig: any) => {
      // Use string ID from subcategory
      const subcatId = elig.subCategoryId?.id || String(elig.subCategoryId)
      if (subcatId) {
        eligibleSubcategoryIds.add(subcatId)
      }
    })

    // Get all product-subcategory mappings for eligible subcategories
    if (eligibleSubcategoryIds.size > 0) {
      const productMappings = await ProductSubcategoryMapping.find({
        subCategoryId: { $in: Array.from(eligibleSubcategoryIds) },
        companyId: company.id
      })
        .populate('productId', 'id name sku vendorId')
        .populate('subCategoryId', 'id name')
        .lean()

      // Get all unique product string IDs to fetch vendor info
      const productIds = new Set<string>()
      productMappings.forEach((m: any) => {
        const productId = m.productId?.id || String(m.productId)
        if (productId) {
          productIds.add(productId)
        }
      })

      // Fetch products with vendor info using string IDs
      const products = await Uniform.find({
        id: { $in: Array.from(productIds) }
      })
        .populate('vendorId', 'id name')
        .lean()

      // Create a map of productId -> vendor name
      const productVendorMap = new Map<string, string>()
      products.forEach((p: any) => {
        const productId = p.id
        const vendorName = p.vendorId?.name || 'N/A'
        if (productId) {
          productVendorMap.set(productId, vendorName)
        }
      })

      productMappings.forEach((mapping: any) => {
        // Use string product ID
        const productReadableId = mapping.productId?.id || String(mapping.productId)
        const productName = mapping.productId?.name || 'Unknown'
        const productSku = mapping.productId?.sku || 'N/A'
        const subcategoryName = mapping.subCategoryId?.name || 'Unknown'
        const vendorName = productVendorMap.get(productReadableId) || 'N/A'

        // Get product from products array to get sizes
        const product = products.find((p: any) => p.id === productReadableId)
        const supportedSizes = product?.sizes || []

        if (productReadableId) {
          allEligibleProductIds.add(productReadableId)
          if (!productDetailsMap.has(productReadableId)) {
            productDetailsMap.set(productReadableId, {
              id: productReadableId, // Use readable ID
              name: productName,
              subcategory: subcategoryName,
              vendor: vendorName,
              sku: productSku,
              sizes: supportedSizes.join(', ') // Supported sizes as comma-separated string
            })
          }
        }
      })
    }

    // Build product reference data
    const productData = Array.from(productDetailsMap.values()).map(p => ({
      'Product Code': p.id, // Changed from 'Product ID' to 'Product Code' for clarity
      'Product Name': p.name,
      'Supported Sizes': p.sizes || 'N/A', // Added supported sizes
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
        'Product Code': '', // Changed from 'Product ID' to 'Product Code' to match Product Reference sheet
        'Size': '', // Added Size column (REQUIRED)
        'Quantity': '',
        'Shipping Location': ''
      }
    ]

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook()

    // Sheet 1: Employee Reference
    const employeeSheet = workbook.addWorksheet('Employee Reference')
    if (employeeData.length > 0) {
      employeeSheet.addRow(Object.keys(employeeData[0])) // headers
      employeeData.forEach(row => employeeSheet.addRow(Object.values(row)))
    }

    // Sheet 2: Product Reference
    const productSheet = workbook.addWorksheet('Product Reference')
    if (productData.length > 0) {
      productSheet.addRow(Object.keys(productData[0])) // headers
      productData.forEach(row => productSheet.addRow(Object.values(row)))
    }

    // Sheet 3: Bulk Orders (input sheet)
    const bulkOrdersSheet = workbook.addWorksheet('Bulk Orders')
    if (bulkOrdersData.length > 0) {
      bulkOrdersSheet.addRow(Object.keys(bulkOrdersData[0])) // headers
      bulkOrdersData.forEach(row => bulkOrdersSheet.addRow(Object.values(row)))
    }

    // Generate Excel buffer
    const excelBuffer = await workbook.xlsx.writeBuffer()

    // Return Excel file
    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="bulk_order_template_${companyId}_${Date.now().xlsx"`
      }
    })
  } catch (error: any) {
    console.error('Error generating bulk order template:', error)
    console.error('Error generating bulk order template:', error)
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
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || 
        errorMessage.includes('Not found') || 
        errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    
    // Return 401 for authentication errors
    if (errorMessage.includes('Unauthorized') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('token')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
      )
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

