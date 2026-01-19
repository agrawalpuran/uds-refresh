import { NextResponse } from 'next/server'
import { 
  getEmployeeByEmployeeId, 
  getEmployeesByCompany, 
  createOrder, 
  getConsumedEligibility,
  getProductsByCompany,
  isLocationAdmin,
  getLocationByAdminEmail,
  isEmployeeInLocation,
  validateEmployeeEligibility,
  isCompanyAdmin,
  getBranchByAdminEmail,
  getEmployeesByBranch
} from '@/lib/db/data-access'
import connectDB from '@/lib/db/mongodb'
import Uniform from '@/lib/models/Uniform'
import Employee from '@/lib/models/Employee'
import Company from '@/lib/models/Company'
// Ensure models are registered before use (order matters for dependencies)
import '@/lib/models/ProductCategory' // Must be loaded before Subcategory
import '@/lib/models/Category' // Must be loaded before Subcategory (Subcategory references it)
import '@/lib/models/Subcategory' // Depends on Category

interface BulkOrderRow {
  employeeId: string
  sku: string
  size: string
  quantity: number
  rowNumber: number
}

interface BulkOrderResult {
  rowNumber: number
  employeeId: string
  sku: string
  size: string
  quantity: number
  status: 'success' | 'failed'
  orderId?: string
  error?: string
}


// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
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
    const { orders, companyId, adminEmail } = body

    if (!orders || !Array.isArray(orders)) {
      return NextResponse.json({ error: 'Invalid orders data' }, { status: 400 })

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 })

    }
    if (!adminEmail) {
      return NextResponse.json({ error: 'Admin email is required' }, { status: 400 })

    // Verify company exists
    const company = await Company.findOne({ id: companyId })
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    // Check if user is Company Admin, Location Admin, or Branch Admin
    const isCompanyAdminUser = await isCompanyAdmin(adminEmail, companyId)
    const locationAdminLocation = await getLocationByAdminEmail(adminEmail)
    }
    if (!locationAdminLocation) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    const isLocationAdminUser = locationAdminLocation !== null
    const branchAdminBranch = await getBranchByAdminEmail(adminEmail)
    if (!branchAdminBranch) {
      return NextResponse.json({ error: 'Branch not found' }, { status: 404 })
    const isBranchAdminUser = branchAdminBranch !== null

    // Authorization: Must be either Company Admin, Location Admin, or Branch Admin
    }
    if (!isCompanyAdminUser && !isLocationAdminUser && !isBranchAdminUser) {
      return NextResponse.json({ 
        error: 'Unauthorized: Only Company Admins, Location Admins, or Branch Admins can bulk upload orders' 
      }, { status: 403 })

    // If Location Admin, get their location ID
    let locationAdminLocationId: string | null = null
    if (isLocationAdminUser && locationAdminLocation) {
      locationAdminLocationId = locationAdminLocation.id || locationAdminLocation._id?.toString() || null
    }

    // If Branch Admin, get their branch ID
    let branchAdminBranchId: string | null = null
    if (isBranchAdminUser && branchAdminBranch) {
      branchAdminBranchId = branchAdminBranch.id || branchAdminBranch._id?.toString() || null
    }

    // OPTIMIZATION: Pre-fetch all employees for company once (indexed query) - use string ID
    const companyEmployees = await Employee.find({ companyId: company.id })
      .select('_id employeeId id companyId locationId branchId')
      .lean()
    
    // OPTIMIZATION: Create Maps for O(1) lookups instead of O(n) searches
    const employeeByIdMap = new Map<string, any>()
    const employeeByEmployeeIdMap = new Map<string, any>()
    companyEmployees.forEach((e: any) => {
      if (e.employeeId) employeeByEmployeeIdMap.set(e.employeeId, e)
      if (e.id) employeeByIdMap.set(e.id, e)
    })
    const companyEmployeeIds = new Set(companyEmployees.map((e: any) => e.employeeId || e.id))

    // Get all products for this company
    const companyProducts = await getProductsByCompany(companyId)
    const productBySku = new Map<string, any>()
    companyProducts.forEach((p: any) => {
      productBySku.set(p.sku, p)
    })

    const results: BulkOrderResult[] = []
    const employeeOrders: Map<string, BulkOrderRow[]> = new Map()

    // Group orders by employee
    for (const order of orders) {
      const employeeId = order.employeeId?.trim()
      if (!employeeId) {
        results.push({
          rowNumber: order.rowNumber || 0,
          employeeId: '',
          sku: order.sku || '',
          size: order.size || '',
          quantity: order.quantity || 0,
          status: 'failed',
          error: 'Employee ID is required'
        })
        continue
      }

      if (!employeeOrders.has(employeeId)) {
        employeeOrders.set(employeeId, [])
      }
      employeeOrders.get(employeeId)!.push({
        employeeId,
        sku: order.sku?.trim() || '',
        size: order.size?.trim() || '',
        quantity: parseInt(order.quantity) || 0,
        rowNumber: order.rowNumber || 0
      })
    }

    // OPTIMIZATION: Batch employee lookups - use pre-fetched Map instead of individual queries
    for (const [employeeId, employeeOrderRows] of Array.from(employeeOrders.entries())) {
      try {
        // OPTIMIZATION: Use Map lookup (O(1)) instead of database query (O(log n))
        let employee = employeeByEmployeeIdMap.get(employeeId) || employeeByIdMap.get(employeeId)
        
        // If not found in pre-fetched employees, employee doesn't belong to company
        if (!employee) {
          // Mark all rows for this employee as failed
          for (const row of employeeOrderRows) {
            results.push({
              rowNumber: row.rowNumber,
              employeeId: row.employeeId,
              sku: row.sku,
              size: row.size,
              quantity: row.quantity,
              status: 'failed',
              error: `Employee not found: ${employeeId}`
            })
          }
          continue
        }

        // OPTIMIZATION: Employee already verified to belong to company (from pre-fetch query)
        // No need to re-verify companyId match - all employees in Map belong to company

        // If Location Admin, verify employee belongs to their location
        if (isLocationAdminUser && locationAdminLocationId) {
          const employeeLocationId = (employee as any).locationId?.toString() || null
          const locationAdminLocationObjectId = locationAdminLocation?._id?.toString() || null
          
          // Check if employee belongs to Location Admin's location
          const employeeBelongsToLocation = await isEmployeeInLocation(
            (employee as any).id || (employee as any)._id?.toString(),
            locationAdminLocationObjectId || locationAdminLocationId
          )

          if (!employeeBelongsToLocation && employeeLocationId !== locationAdminLocationObjectId) {
            // Mark all rows for this employee as failed
            for (const row of employeeOrderRows) {
              results.push({
                rowNumber: row.rowNumber,
                employeeId: row.employeeId,
                sku: row.sku,
                size: row.size,
                quantity: row.quantity,
                status: 'failed',
                error: `Employee ${employeeId} does not belong to your location. Location Admins can only upload orders for employees in their assigned location.`
              })
            }
            continue
          }
        }

        // If Branch Admin, verify employee belongs to their branch - use string IDs
        if (isBranchAdminUser && branchAdminBranchId) {
          const employeeBranchId = String((employee as any).branchId || '')
          
          // OPTIMIZATION: Check branchId directly from pre-fetched employee data first
          if (employeeBranchId && employeeBranchId === branchAdminBranchId) {
            // Employee belongs to branch - continue processing
          } else {
            // Fallback: query branch employees only if branchId doesn't match
            const branchEmployees = await getEmployeesByBranch(branchAdminBranchId)
            const branchEmployeeIds = new Set(branchEmployees.map((e: any) => 
              e.employeeId || e.id
            ))
            
            const employeeIdForCheck = (employee as any).employeeId || (employee as any).id
            
            if (!branchEmployeeIds.has(employeeIdForCheck)) {
              // Mark all rows for this employee as failed
              for (const row of employeeOrderRows) {
                results.push({
                  rowNumber: row.rowNumber,
                  employeeId: row.employeeId,
                  sku: row.sku,
                  size: row.size,
                  quantity: row.quantity,
                  status: 'failed',
                  error: `Employee ${employeeId} does not belong to your branch. Branch Admins can only upload orders for employees in their assigned branch.`
                })
              }
              continue
            }
          }
        }

        // Get employee ID string for validation
        const employeeIdString = (employee as any).id || (employee as any).employeeId

        // First pass: Validate all rows and collect valid items
        const validOrderItems: Array<{
          uniformId: string
          uniformName: string
          size: string
          quantity: number
          price: number
          rowNumber: number
          category: string
        }> = []

        for (const row of employeeOrderRows) {
          // Find product by SKU
          const product = productBySku.get(row.sku)
          if (!product) {
            results.push({
              rowNumber: row.rowNumber,
              employeeId: row.employeeId,
              sku: row.sku,
              size: row.size,
              quantity: row.quantity,
              status: 'failed',
              error: `Product not found for SKU: ${row.sku}`
            })
            continue
          }

          // Verify product is linked to company
          if (!companyProducts.some((p: any) => p.id === product.id)) {
            results.push({
              rowNumber: row.rowNumber,
              employeeId: row.employeeId,
              sku: row.sku,
              size: row.size,
              quantity: row.quantity,
              status: 'failed',
              error: `Product ${row.sku} is not available for your company`
            })
            continue
          }

          // Validate size
          if (!product.sizes || !product.sizes.includes(row.size)) {
            results.push({
              rowNumber: row.rowNumber,
              employeeId: row.employeeId,
              sku: row.sku,
              size: row.size,
              quantity: row.quantity,
              status: 'failed',
              error: `Invalid size ${row.size} for product ${row.sku}. Available sizes: ${product.sizes.join(', ')`
            })
            continue
          }

          // Validate quantity
          if (row.quantity <= 0) {
            results.push({
              rowNumber: row.rowNumber,
              employeeId: row.employeeId,
              sku: row.sku,
              size: row.size,
              quantity: row.quantity,
              status: 'failed',
              error: `Invalid quantity: ${row.quantity}. Must be greater than 0`
            })
            continue
          }

          // Add to valid items
          validOrderItems.push({
            uniformId: product.id,
            uniformName: product.name,
            size: row.size,
            quantity: row.quantity,
            price: product.price || 0,
            rowNumber: row.rowNumber,
            category: product.category
          })
        }

        // Use reusable eligibility validation function
        const eligibilityValidation = await validateEmployeeEligibility(
          employeeIdString,
          validOrderItems.map(item => ({
            uniformId: item.uniformId,
            uniformName: item.uniformName,
            category: item.category as 'shirt' | 'pant' | 'shoe' | 'jacket' | 'accessory',
            quantity: item.quantity
          }))
        )

        // Filter out items that failed eligibility check
        const orderItems = eligibilityValidation.valid
          ? validOrderItems
          : validOrderItems.filter(item => {
              // Check if this item caused an error
              const itemError = eligibilityValidation.errors.find(
                e => e.item === item.uniformName && e.category === item.category
              )
              return !itemError
            })

        // Add eligibility errors to results
        if (!eligibilityValidation.valid) {
          for (const error of eligibilityValidation.errors) {
            const item = validOrderItems.find(i => i.uniformName === error.item && i.category === error.category)
            if (item) {
              results.push({
                rowNumber: item.rowNumber,
                employeeId: employeeId,
                sku: employeeOrderRows.find(r => r.rowNumber === item.rowNumber)?.sku || '',
                size: item.size,
                quantity: item.quantity,
                status: 'failed',
                error: error.error
              })
            }
          }
        }

        // If validation passed, create the order
        if (orderItems.length > 0) {
          try {
            // Calculate estimated delivery time
            const dispatchPreference = (employee as any).dispatchPreference || 'standard'
            let estimatedDeliveryTime = '5-7 business days'
            if (dispatchPreference === 'direct') {
              estimatedDeliveryTime = '3-5 business days'
            } else if (dispatchPreference === 'central') {
              estimatedDeliveryTime = '5-7 business days'
            } else {
              estimatedDeliveryTime = '7-10 business days'
            }

            // Determine delivery address based on company config
            // If company doesn't allow personal address delivery, use location address
            const allowPersonalAddressDelivery = company.allowPersonalAddressDelivery ?? false
            const usePersonalAddress = false // Bulk uploads always use official location (default)
            
            // Get delivery address (will be determined by createOrder based on company config)
            const deliveryAddress = (employee as any).address || 'Address not available'

            const savedOrder = await createOrder({
              employeeId: employeeIdString,
              items: orderItems.map(item => ({
                uniformId: item.uniformId,
                uniformName: item.uniformName,
                size: item.size,
                quantity: item.quantity,
                price: item.price
              })),
              deliveryAddress: deliveryAddress,
              estimatedDeliveryTime: estimatedDeliveryTime,
              dispatchLocation: dispatchPreference,
              usePersonalAddress: usePersonalAddress // Always false for bulk uploads (use official location)
            })

            // Mark all items as successful
            for (const item of orderItems) {
              const row = employeeOrderRows.find(r => r.rowNumber === item.rowNumber)
              results.push({
                rowNumber: item.rowNumber,
                employeeId: employeeId,
                sku: row?.sku || '',
                size: item.size,
                quantity: item.quantity,
                status: 'success',
                orderId: savedOrder.id
              })
            }
          } catch (error: any) {
            // Mark all items as failed
            for (const item of orderItems) {
              const row = employeeOrderRows.find(r => r.rowNumber === item.rowNumber)
              results.push({
                rowNumber: item.rowNumber,
                employeeId: employeeId,
                sku: row?.sku || '',
                size: item.size,
                quantity: item.quantity,
                status: 'failed',
                error: `Failed to create order: ${error.message}`
              })
            }
          }
        }
      } catch (error: any) {
        // Mark all rows for this employee as failed
        for (const row of employeeOrderRows) {
          results.push({
            rowNumber: row.rowNumber,
            employeeId: row.employeeId,
            sku: row.sku,
            size: row.size,
            quantity: row.quantity,
            status: 'failed',
            error: `Error processing employee ${employeeId}: ${error.message}`
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
  } catch (error: any) {
    console.error('Bulk order API Error:', error)
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

