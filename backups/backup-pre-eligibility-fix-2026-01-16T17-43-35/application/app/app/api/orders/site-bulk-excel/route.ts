import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import connectDB from '@/lib/db/mongodb'
import { 
  getEmployeeByEmployeeId, 
  getLocationByAdminEmail,
  isLocationAdmin,
  isEmployeeInLocation,
  createOrder, 
  validateBulkOrderItemSubcategoryEligibility
} from '@/lib/db/data-access'
import Employee from '@/lib/models/Employee'
import Location from '@/lib/models/Location'
import Uniform from '@/lib/models/Uniform'
import mongoose from 'mongoose'

interface BulkOrderRow {
  employeeId: string
  productCode: string
  size: string
  quantity: number
  shippingLocation?: string
  rowNumber: number
}

interface BulkOrderResult {
  rowNumber: number
  employeeId: string
  productCode: string
  size: string
  quantity: number
  status: 'success' | 'failed'
  orderId?: string
  error?: string
}

/**
 * POST /api/orders/site-bulk-excel
 * 
 * Process bulk orders from Excel file for Site Admin
 * STRICT SITE SCOPING: Only employees from Site Admin's location are allowed
 * 
 * Expected Excel format:
 * - Sheet "Bulk Orders" with columns: Employee ID, Product Code, Size, Quantity, Shipping Location
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function POST(request: NextRequest) {
  try {
    await connectDB()
    
    const formData = await request.formData()
    const file = formData.get('file') as File
    const adminEmail = formData.get('adminEmail') as string

    if (!file) {
      return NextResponse.json({ error: 'Excel file is required' }, { status: 400 })
    }
    if (!adminEmail) {
      return NextResponse.json({ error: 'Admin email is required' }, { status: 400 })
    }

    // Verify Site Admin access and get location
    const location = await getLocationByAdminEmail(adminEmail.trim().toLowerCase())
    if (!location) {
      return NextResponse.json({ 
        error: 'Unauthorized: Only Site Admins can upload bulk orders via Excel' 
      }, { status: 403 })
    }

    // Use location string ID directly
    const locationIdStr = location.id
    if (!locationIdStr) {
      return NextResponse.json({ 
        error: 'Location ID not found' 
      }, { status: 400 })
    }

    const locationName = location.name || 'Location'
    
    // Get companyId from location for eligibility validation - use string ID
    let companyId: string | null = null
    if (location.companyId) {
      companyId = String(location.companyId)
    }
    
    if (!companyId) {
      return NextResponse.json({ 
        error: 'Company ID not found for location' 
      }, { status: 400 })
    }

    // Read Excel file
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })

    // Get "Bulk Orders" sheet
    const bulkOrdersSheet = workbook.Sheets['Bulk Orders']
    if (!bulkOrdersSheet) {
      return NextResponse.json({ 
        error: 'Excel file must contain a "Bulk Orders" sheet' 
      }, { status: 400 })
    }

    // Convert sheet to JSON
    const rows = XLSX.utils.sheet_to_json(bulkOrdersSheet, { header: 1, defval: '' })

    if (rows.length < 2) {
      return NextResponse.json({ 
        error: 'Excel must contain at least a header row and one data row' 
      }, { status: 400 })
    }

    // Parse headers (case-insensitive, flexible column matching)
    const headers = (Array.isArray(rows[0]) ? rows[0] : []).map((h: any) => String(h).trim().toLowerCase())
    const employeeIdIndex = headers.findIndex(h => 
      h === 'employee id' || h === 'employeeid' || h === 'employee_no' || h === 'employee no'
    )
    const productCodeIndex = headers.findIndex(h => 
      h === 'product code' || h === 'productcode' || h === 'product_code' || h === 'product id' || h === 'productid' || h === 'product_id'
    )
    const sizeIndex = headers.findIndex(h => h === 'size')
    const quantityIndex = headers.findIndex(h => 
      h === 'quantity' || h === 'qty' || h === 'qty.'
    )
    const shippingLocationIndex = headers.findIndex(h => 
      h === 'shipping location' || h === 'shippinglocation' || h === 'location' || h === 'dispatch location'
    )
    if (employeeIdIndex === -1 || productCodeIndex === -1 || sizeIndex === -1 || quantityIndex === -1) {
      return NextResponse.json({ 
        error: 'Excel must contain columns: Employee ID, Product Code, Size, Quantity' 
      }, { status: 400 })
    }

    // Parse orders from Excel
    const orders: BulkOrderRow[] = []
    for (let i = 1; i < rows.length; i++) {
      const row: any = rows[i]
      if (!row || !Array.isArray(row) || row.length === 0) continue // Skip empty rows

      const employeeId = String(row[employeeIdIndex] || '').trim()
      const productCode = String(row[productCodeIndex] || '').trim()
      const size = String(row[sizeIndex] || '').trim()
      const quantity = parseInt(String(row[quantityIndex] || '0')) || 0
      const shippingLocation = shippingLocationIndex >= 0 ? String(row[shippingLocationIndex] || '').trim() : undefined

      if (employeeId && productCode && size && quantity > 0) {
        orders.push({
          employeeId,
          productCode,
          size,
          quantity,
          shippingLocation,
          rowNumber: i + 1
        })
      }
    }

    if (orders.length === 0) {
      return NextResponse.json({ 
        error: 'No valid orders found in Excel file' 
      }, { status: 400 })
    }

    // Get all employees in this location for validation - use string ID
    const locationEmployees = await Employee.find({ 
      locationId: locationIdStr,
      status: 'active' 
    })
      .lean()

    const locationEmployeeIds = new Set<string>()
    const locationEmployeeMap = new Map<string, any>()
    
    locationEmployees.forEach((emp: any) => {
      const empId = emp.employeeId || emp.id
      if (empId) {
        locationEmployeeIds.add(String(empId))
        locationEmployeeMap.set(String(empId), emp)
      }
    })

    // Get all products by code for validation - use string IDs only
    const productCodes = Array.from(new Set(orders.map(o => o.productCode)))
    const products = await Uniform.find({
      id: { $in: productCodes }
    })
      .lean()

    const productByCodeMap = new Map<string, any>()
    products.forEach((product: any) => {
      if (product.id) {
        productByCodeMap.set(product.id, product)
      }
    })

    // Process each order with STRICT SITE VALIDATION
    const results: BulkOrderResult[] = []
    const validOrderItems: any[] = []
    const orderGroups = new Map<string, any[]>() // Group by employeeId

    for (const row of orders) {
      // CRITICAL SITE VALIDATION: Check if employee belongs to Site Admin's location
      if (!locationEmployeeIds.has(row.employeeId)) {
        results.push({
          rowNumber: row.rowNumber,
          employeeId: row.employeeId,
          productCode: row.productCode,
          size: row.size,
          quantity: row.quantity,
          status: 'failed',
          error: `Employee ${row.employeeId} does not belong to your site (${location.name || locationIdStr}). Only employees from your location can be ordered for.`
        })
        continue
      }

      const employee = locationEmployeeMap.get(row.employeeId)
      if (!employee) {
        results.push({
          rowNumber: row.rowNumber,
          employeeId: row.employeeId,
          productCode: row.productCode,
          size: row.size,
          quantity: row.quantity,
          status: 'failed',
          error: `Employee ${row.employeeId} not found in your location`
        })
        continue
      }

      // Verify employee is active
      if (employee.status !== 'active') {
        results.push({
          rowNumber: row.rowNumber,
          employeeId: row.employeeId,
          productCode: row.productCode,
          size: row.size,
          quantity: row.quantity,
          status: 'failed',
          error: `Employee ${row.employeeId} is not active`
        })
        continue
      }

      // Find product by readable product code
      const product = productByCodeMap.get(row.productCode)
      if (!product) {
        results.push({
          rowNumber: row.rowNumber,
          employeeId: row.employeeId,
          productCode: row.productCode,
          size: row.size,
          quantity: row.quantity,
          status: 'failed',
          error: `Product not found: ${row.productCode}. Please use Product Code from the Product Reference sheet.`
        })
        continue
      }

      // Validate size (CRITICAL - Size must be supported by product)
      const productSizes = product.sizes || []
      const normalizedSize = row.size.trim()
      const isSizeSupported = productSizes.some((s: string) => 
        s.trim().toLowerCase() === normalizedSize.toLowerCase()
      )

      if (!isSizeSupported) {
        results.push({
          rowNumber: row.rowNumber,
          employeeId: row.employeeId,
          productCode: row.productCode,
          size: row.size,
          quantity: row.quantity,
          status: 'failed',
          error: `Size "${row.size}" is not supported for this product. Supported sizes: ${productSizes.join(', ')}`
        })
        continue
      }

      // Validate eligibility (subcategory-based) - use string product ID
      const productId = product.id
      if (!productId) {
        results.push({
          rowNumber: row.rowNumber,
          employeeId: row.employeeId,
          productCode: row.productCode,
          size: row.size,
          quantity: row.quantity,
          status: 'failed',
          error: `Invalid product data: ${row.productCode}`
        })
        continue
      }

      try {
        // Use employeeId (readable ID) for validation
        const employeeIdForValidation = employee.employeeId || employee.id || String(employee._id)
        
        const validation = await validateBulkOrderItemSubcategoryEligibility(
          employeeIdForValidation,
          productId, // Use string ID for validation function
          row.quantity,
          companyId // CRITICAL: Pass companyId, not size!
        )

        if (!validation.valid) {
          results.push({
            rowNumber: row.rowNumber,
            employeeId: row.employeeId,
            productCode: row.productCode,
            size: row.size,
            quantity: row.quantity,
            status: 'failed',
            error: validation.error || 'Product not eligible for this employee'
          })
          continue
        }
      } catch (eligError: any) {
        results.push({
          rowNumber: row.rowNumber,
          employeeId: row.employeeId,
          productCode: row.productCode,
          size: row.size,
          quantity: row.quantity,
          status: 'failed',
          error: `Eligibility validation failed: ${eligError.message || 'Unknown error'}`
        })
        continue
      }

      // All validations passed - add to valid orders
      validOrderItems.push({
        uniformId: product.id,
        uniformName: product.name || 'Unknown Product',
        size: normalizedSize,
        quantity: row.quantity,
        price: product.price || 0,
        rowNumber: row.rowNumber
      })

      // Group by employeeId for order creation
      if (!orderGroups.has(row.employeeId)) {
        orderGroups.set(row.employeeId, [])
      }
      orderGroups.get(row.employeeId)!.push({
        uniformId: product.id,
        uniformName: product.name || 'Unknown Product',
        size: normalizedSize,
        quantity: row.quantity,
        price: product.price || 0,
        rowNumber: row.rowNumber
      })
    }

    // Create orders (one per employee)
    for (const [employeeId, items] of Array.from(orderGroups.entries())) {
      const employee = locationEmployeeMap.get(employeeId)
      if (!employee) continue

      try {
        // Get employee for delivery address and dispatch preference - use string ID
        const fullEmployee: any = await Employee.findOne({ 
          id: employee.id || employee.employeeId 
        })
          .select('address dispatchPreference employeeId id')
          .lean()

        if (!fullEmployee) {
          // Mark all items for this employee as failed
          items.forEach(item => {
            results.push({
              rowNumber: item.rowNumber,
              employeeId: employeeId,
              productCode: productByCodeMap.get(item.uniformId)?.id || item.uniformId,
              size: item.size,
              quantity: item.quantity,
              status: 'failed',
              error: `Employee not found: ${employeeId}`
            })
          })
          continue
        }

        // Use employeeId or id field for createOrder
        const employeeIdString = fullEmployee.employeeId || fullEmployee.id

        const dispatchPreference = fullEmployee?.dispatchPreference || 'standard'
        let estimatedDeliveryTime = '5-7 business days'
        if (dispatchPreference === 'direct') {
          estimatedDeliveryTime = '3-5 business days'
        } else if (dispatchPreference === 'central') {
          estimatedDeliveryTime = '5-7 business days'
        } else {
          estimatedDeliveryTime = '7-10 business days'
        }

        const deliveryAddress = fullEmployee?.address || items[0]?.shippingLocation || location.address || 'Address not available'

        const order = await createOrder({
          employeeId: employeeIdString,
          items: items.map(item => ({
            uniformId: item.uniformId,
            uniformName: item.uniformName,
            size: item.size,
            quantity: item.quantity,
            price: item.price
          })),
          deliveryAddress: deliveryAddress,
          estimatedDeliveryTime: estimatedDeliveryTime, // CRITICAL: Required field
          dispatchLocation: items[0]?.shippingLocation || dispatchPreference,
          usePersonalAddress: false // Bulk uploads always use official location
        })

        // Mark all items for this employee as successful
        items.forEach(item => {
          results.push({
            rowNumber: item.rowNumber,
            employeeId: employeeId,
            productCode: productByCodeMap.get(item.uniformId)?.id || item.uniformId,
            size: item.size,
            quantity: item.quantity,
            status: 'success',
            orderId: order.id
          })
        })
      } catch (orderError: any) {
        // Mark all items for this employee as failed
        items.forEach(item => {
          results.push({
            rowNumber: item.rowNumber,
            employeeId: employeeId,
            productCode: productByCodeMap.get(item.uniformId)?.id || item.uniformId,
            size: item.size,
            quantity: item.quantity,
            status: 'failed',
            error: `Failed to create order: ${orderError.message || 'Unknown error'}`
          })
        })
      }
    }

    // Calculate summary
    const summary = {
      total: results.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length
    }

    return NextResponse.json({
      summary,
      results,
      location: {
        id: locationIdStr,
        name: location.name
      }
    })
  } catch (error) {
    const err = error as any
    console.error('Error processing site bulk orders:', err)
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

