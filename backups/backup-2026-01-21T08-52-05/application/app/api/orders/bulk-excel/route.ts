import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import connectDB from '@/lib/db/mongodb'
import { 
  getEmployeeByEmployeeId, 
  getEmployeesByCompany, 
  createOrder, 
  validateBulkOrderItemSubcategoryEligibility,
  isLocationAdmin,
  getLocationByAdminEmail,
  isEmployeeInLocation,
  isCompanyAdmin,
  getBranchByAdminEmail,
  getEmployeesByBranch
} from '@/lib/db/data-access'
import Employee from '@/lib/models/Employee'
import Company from '@/lib/models/Company'
import Uniform from '@/lib/models/Uniform'
import mongoose from 'mongoose'

interface BulkOrderRow {
  employeeId: string
  productCode: string // Changed from productId to productCode for clarity
  size: string // Added size field (REQUIRED)
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
 * POST /api/orders/bulk-excel
 * 
 * Process bulk orders from Excel file
 * Uses subcategory-based eligibility validation
 * 
 * Expected Excel format:
 * - Sheet "Bulk Orders" with columns: Employee ID, Product ID, Quantity, Shipping Location
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function POST(request: NextRequest) {
  try {
    await connectDB()
    
    const formData = await request.formData()
    const file = formData.get('file') as File
    const companyId = formData.get('companyId') as string
    const adminEmail = formData.get('adminEmail') as string

    if (!file) {
      return NextResponse.json({ error: 'Excel file is required' }, { status: 400 })
    }
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 })
    }
    if (!adminEmail) {
      return NextResponse.json({ error: 'Admin email is required' }, { status: 400 })
    }

    // Verify company exists - use string ID only
    const company = await Company.findOne({ id: companyId })
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Check authorization (Company Admin only for this feature)
    const isCompanyAdminUser = await isCompanyAdmin(adminEmail, companyId)
    if (!isCompanyAdminUser) {
      return NextResponse.json({ 
        error: 'Unauthorized: Only Company Admins can upload bulk orders via Excel' 
      }, { status: 403 })
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
    const rows = XLSX.utils.sheet_to_json(bulkOrdersSheet, { header: 1 }) as any[][]
    
    if (rows.length < 2) {
      return NextResponse.json({ 
        error: 'Excel file must have at least a header row and one data row' 
      }, { status: 400 })
    }

    // Parse headers (case-insensitive, flexible column matching)
    const headers = (rows[0] || []).map((h: any) => String(h).trim().toLowerCase())
    const employeeIdIndex = headers.findIndex(h => 
      h === 'employee id' || h === 'employeeid' || h === 'employee_no' || h === 'employee no'
    )
    const productCodeIndex = headers.findIndex(h => 
      h === 'product code' || h === 'productcode' || h === 'product id' || h === 'productid' || h === 'product_id'
    )
    const sizeIndex = headers.findIndex(h => 
      h === 'size' || h === 'product size'
    )
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
      const row = rows[i]
      if (!row || row.length === 0) continue // Skip empty rows

      const employeeId = String(row[employeeIdIndex] || '').trim()
      const productCode = String(row[productCodeIndex] || '').trim()
      const size = String(row[sizeIndex] || '').trim()
      const quantity = parseInt(String(row[quantityIndex] || '0')) || 0
      const shippingLocation = shippingLocationIndex >= 0 ? String(row[shippingLocationIndex] || '').trim() : undefined

      // Size is REQUIRED - reject if missing
      if (employeeId && productCode && size && quantity > 0) {
        orders.push({
          employeeId,
          productCode,
          size,
          quantity,
          shippingLocation,
          rowNumber: i + 1 // +1 because we start from row 2 (after header)
        })
      }
    }

    if (orders.length === 0) {
      return NextResponse.json({ 
        error: 'No valid orders found in Excel file' 
      }, { status: 400 })
    }

    // Pre-fetch all employees for company (optimization)
    // CRITICAL FIX: Employee.companyId is stored as STRING ID, not ObjectId - use company.id
    const companyEmployees = await Employee.find({ companyId: company.id })
      .select('_id employeeId id companyId locationId branchId designation gender status')
      .lean()

    const employeeByIdMap = new Map<string, any>()
    const employeeByEmployeeIdMap = new Map<string, any>()
    companyEmployees.forEach((e: any) => {
      if (e.employeeId) employeeByEmployeeIdMap.set(e.employeeId, e)
      if (e.id) employeeByIdMap.set(e.id, e)
    })

    // Pre-fetch all products by readable ID (product code)
    const productCodes = Array.from(new Set(orders.map(o => o.productCode)))
    
    // Find products by readable 'id' field (not ObjectId)
    const products = await Uniform.find({
      id: { $in: productCodes }
    })
      .select('_id id name price sizes sku')
      .lean()

    // Create maps for efficient lookup
    const productByCodeMap = new Map<string, any>() // productCode -> product
    const productByObjectIdMap = new Map<string, any>() // _id -> product
    
    products.forEach((p: any) => {
      const productCode = p.id // Readable product code
      const productObjectId = p._id?.toString()
      
      if (productCode) {
        productByCodeMap.set(productCode, p)
      }
      if (productObjectId) {
        productByObjectIdMap.set(productObjectId, p)
      }
    })

    const results: BulkOrderResult[] = []
    const employeeOrders: Map<string, BulkOrderRow[]> = new Map()

    // Group orders by employee
    for (const order of orders) {
      const employeeId = order.employeeId.trim()
      if (!employeeId) {
        results.push({
          rowNumber: order.rowNumber,
          employeeId: '',
          productCode: order.productCode,
          size: order.size,
          quantity: order.quantity,
          status: 'failed',
          error: 'Employee ID is required'
        })
        continue
      }

      if (!employeeOrders.has(employeeId)) {
        employeeOrders.set(employeeId, [])
      }
      employeeOrders.get(employeeId)!.push(order)
    }

    // Process orders by employee
    for (const [employeeId, employeeOrderRows] of Array.from(employeeOrders.entries())) {
      try {
        // Find employee
        let employee = employeeByEmployeeIdMap.get(employeeId) || employeeByIdMap.get(employeeId)

        if (!employee) {
          // Mark all rows for this employee as failed
          for (const row of employeeOrderRows) {
            results.push({
              rowNumber: row.rowNumber,
              employeeId: row.employeeId,
              productCode: row.productCode,
              size: row.size,
              quantity: row.quantity,
              status: 'failed',
              error: `Employee not found: ${employeeId}`
            })
          }
          continue
        }

        // Check employee is active
        if (employee.status !== 'active') {
          for (const row of employeeOrderRows) {
            results.push({
              rowNumber: row.rowNumber,
              employeeId: row.employeeId,
              productCode: row.productCode,
              size: row.size,
              quantity: row.quantity,
              status: 'failed',
              error: `Employee ${employeeId} is not active`
            })
          }
          continue
        }

        // Get employee ID string for order creation
        const employeeIdString = employee.id || employee.employeeId

        // Validate and collect valid order items
        const validOrderItems: Array<{
          uniformId: string
          uniformName: string
          size: string
          quantity: number
          price: number
          rowNumber: number
        }> = []

        for (const row of employeeOrderRows) {
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

          // Validate quantity
          if (row.quantity <= 0) {
            results.push({
              rowNumber: row.rowNumber,
              employeeId: row.employeeId,
              productCode: row.productCode,
              size: row.size,
              quantity: row.quantity,
              status: 'failed',
              error: `Invalid quantity: ${row.quantity}. Must be greater than 0`
            })
            continue
          }

          // Validate subcategory-based eligibility (use product ObjectId for validation)
          const productObjectId = product._id?.toString()
          if (!productObjectId) {
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

          const validation = await validateBulkOrderItemSubcategoryEligibility(
            employeeIdString,
            productObjectId, // Use ObjectId for validation function
            row.quantity,
            companyId
          )

          if (!validation.valid) {
            results.push({
              rowNumber: row.rowNumber,
              employeeId: row.employeeId,
              productCode: row.productCode,
              size: row.size,
              quantity: row.quantity,
              status: 'failed',
              error: validation.error || 'Eligibility validation failed'
            })
            continue
          }

          // Size is validated and supported - use the exact size from input
          // IMPORTANT: Use readable product 'id' field (not ObjectId) for createOrder
          const productReadableId = product.id || productObjectId
          validOrderItems.push({
            uniformId: productReadableId, // Use readable id field, not ObjectId
            uniformName: product.name || 'Unknown Product',
            size: normalizedSize, // Use the validated size from input
            quantity: row.quantity,
            price: product.price || 0,
            rowNumber: row.rowNumber
          })
        }

        // Create order if there are valid items
        if (validOrderItems.length > 0) {
          try {
            // Get employee for delivery address
            const employeeId = employee.id || employee.employeeId || String(employee._id)
            const fullEmployee: any = await Employee.findOne({ id: employeeId })
              .select('address dispatchPreference')
              .lean()

            const dispatchPreference = fullEmployee?.dispatchPreference || 'standard'
            let estimatedDeliveryTime = '5-7 business days'
            if (dispatchPreference === 'direct') {
              estimatedDeliveryTime = '3-5 business days'
            } else if (dispatchPreference === 'central') {
              estimatedDeliveryTime = '5-7 business days'
            } else {
              estimatedDeliveryTime = '7-10 business days'
            }

            const deliveryAddress = fullEmployee?.address || 'Address not available'

            const savedOrder = await createOrder({
              employeeId: employeeIdString,
              items: validOrderItems.map(item => ({
                uniformId: item.uniformId,
                uniformName: item.uniformName,
                size: item.size,
                quantity: item.quantity,
                price: item.price
              })),
              deliveryAddress: deliveryAddress,
              estimatedDeliveryTime: estimatedDeliveryTime,
              dispatchLocation: employeeOrderRows[0]?.shippingLocation || dispatchPreference,
              usePersonalAddress: false // Bulk uploads always use official location
            })

            // Mark all valid items as successful
            for (const item of validOrderItems) {
              const matchingRow = employeeOrderRows.find(r => r.rowNumber === item.rowNumber)
              results.push({
                rowNumber: item.rowNumber,
                employeeId: employeeId,
                productCode: matchingRow?.productCode || '',
                size: matchingRow?.size || item.size,
                quantity: item.quantity,
                status: 'success',
                orderId: savedOrder.id || savedOrder.parentOrderId
              })
            }
          } catch (err) {
            const catchErr = err as any
            // Mark all items as failed
            for (const item of validOrderItems) {
              const matchingRow = employeeOrderRows.find(r => r.rowNumber === item.rowNumber)
              results.push({
                rowNumber: item.rowNumber,
                employeeId: employeeId,
                productCode: matchingRow?.productCode || '',
                size: matchingRow?.size || item.size,
                quantity: item.quantity,
                status: 'failed',
                error: `Failed to create order: ${catchErr.message}`
              })
            }
          }
        }
      } catch (err) {
        const catchErr = err as any
        // Mark all rows for this employee as failed
        for (const row of employeeOrderRows) {
          results.push({
            rowNumber: row.rowNumber,
            employeeId: row.employeeId,
            productCode: row.productCode,
            size: row.size,
            quantity: row.quantity,
            status: 'failed',
            error: `Error processing employee ${employeeId}: ${catchErr.message}`
          })
        }
      }
    }

    // Sort results by row number
    results.sort((a, b) => a.rowNumber - b.rowNumber);

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: results.length,
        successful: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'failed').length
      }
    })
  } catch (error) {
    const err = error as any
    console.error('Bulk order Excel API Error:', err)
    // Return appropriate status code based on error type
    const errorMessage = err?.message || err?.toString() || 'Internal server error'
    const isConnectionError = errorMessage.includes('Mongo') || 
                              errorMessage.includes('connection') || 
                              errorMessage.includes('ECONNREFUSED') ||
                              errorMessage.includes('timeout') ||
                              errorMessage.includes('network') ||
                              err?.code === 'ECONNREFUSED' ||
                              err?.code === 'ETIMEDOUT' ||
                              err?.name === 'MongoNetworkError' ||
                              err?.name === 'MongoServerSelectionError'
    
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

