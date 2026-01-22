/**
 * Eligibility Service
 * 
 * Centralized service for managing employee eligibility operations.
 * 
 * Business Rules:
 * - Eligibility is decremented when an order is PLACED (not when shipped)
 * - Eligibility is incremented when a return is APPROVED
 * - Replacement orders should NOT double-decrement eligibility
 * 
 * @module lib/services/eligibility-service
 * @version 1.0.0
 * @created 2026-01-16
 */

import connectDB from '../db/mongodb'
import Employee from '../models/Employee'
import Uniform from '../models/Uniform'
import { getCategoryByIdOrName } from '../db/category-helpers'

// =============================================================================
// ELIGIBILITY DECREMENT (Order Placement)
// =============================================================================

export interface EligibilityDecrementResult {
  success: boolean
  decrements: Array<{
    categoryName: string
    previousValue: number
    newValue: number
    quantity: number
  }>
  errors: string[]
}

/**
 * Decrement employee eligibility when an order is placed
 * 
 * BUSINESS RULE: Eligibility is consumed immediately when order is created,
 * NOT when the order is shipped or delivered.
 * 
 * @param employeeId Employee ID (string, 6-digit numeric)
 * @param orderItems Array of order items with product info
 * @param orderId Order ID for audit trail
 * @param isReplacementOrder If true, skip decrement (eligibility already consumed)
 * @returns Result with decrements applied
 */
export async function decrementEligibilityOnOrderPlacement(
  employeeId: string,
  orderItems: Array<{
    uniformId: string
    quantity: number
  }>,
  orderId: string,
  isReplacementOrder: boolean = false
): Promise<EligibilityDecrementResult> {
  const result: EligibilityDecrementResult = {
    success: false,
    decrements: [],
    errors: [],
  }

  // CRITICAL: Skip decrement for replacement orders to avoid double-counting
  // Replacement orders are created when a return is approved - the original
  // eligibility was already consumed by the original order
  if (isReplacementOrder) {
    console.log(`[ELIGIBILITY] Skipping decrement for replacement order ${orderId} - eligibility already consumed by original order`)
    result.success = true
    return result
  }

  await connectDB()

  try {
    // Find employee
    let employee = await Employee.findOne({ employeeId: employeeId })
    if (!employee) {
      employee = await Employee.findOne({ id: employeeId })
    }
    if (!employee) {
      result.errors.push(`Employee not found: ${employeeId}`)
      return result
    }

    // Get company for category lookup
    const companyId = employee.companyId?.toString() || ''

    // Process each order item
    for (const item of orderItems) {
      // Get product to determine category
      const product = await Uniform.findOne({ id: item.uniformId })
      if (!product) {
        result.errors.push(`Product not found: ${item.uniformId}`)
        continue
      }

      // Determine category name
      let categoryName: string | null = null
      if (product.categoryId) {
        const category = await getCategoryByIdOrName(companyId, product.categoryId.toString())
        if (category) {
          categoryName = category.name.toLowerCase()
        }
      } else if (product.category) {
        categoryName = (product.category as string).toLowerCase()
      }

      if (!categoryName) {
        result.errors.push(`Category not found for product: ${item.uniformId}`)
        continue
      }

      // Get current eligibility for this category
      const currentEligibility = employee.eligibility || {}
      const currentValue = (currentEligibility as any)[categoryName] || 0
      const newValue = Math.max(0, currentValue - item.quantity)

      console.log(`[ELIGIBILITY] DECREMENT: employee=${employeeId}, category=${categoryName}, qty=${item.quantity}, ${currentValue} -> ${newValue}, order=${orderId}`)

      // Record the decrement
      result.decrements.push({
        categoryName,
        previousValue: currentValue,
        newValue,
        quantity: item.quantity,
      })

      // Apply the decrement
      if (!employee.eligibility) {
        employee.eligibility = {} as any
      }
      (employee.eligibility as any)[categoryName] = newValue
      employee.markModified('eligibility')
    }

    // Save employee
    if (result.decrements.length > 0) {
      await employee.save()
      console.log(`[ELIGIBILITY] ✅ Employee ${employeeId} eligibility decremented for order ${orderId}`)
    }

    result.success = true
  } catch (error: any) {
    console.error(`[ELIGIBILITY] ❌ Error decrementing eligibility:`, error.message)
    result.errors.push(error.message)
  }

  return result
}

// =============================================================================
// ELIGIBILITY INCREMENT (Return Approval)
// =============================================================================

export interface EligibilityIncrementResult {
  success: boolean
  increment: {
    categoryName: string
    previousValue: number
    newValue: number
    quantity: number
  } | null
  error?: string
}

/**
 * Increment employee eligibility when a return is approved
 * 
 * BUSINESS RULE: Eligibility is restored when a return request is approved,
 * regardless of whether it's a replacement or refund.
 * 
 * @param employeeId Employee ID (string, 6-digit numeric)
 * @param productId Product ID (uniformId)
 * @param quantity Quantity being returned
 * @param returnRequestId Return request ID for audit trail
 * @returns Result with increment applied
 */
export async function incrementEligibilityOnReturnApproval(
  employeeId: string,
  productId: string,
  quantity: number,
  returnRequestId: string
): Promise<EligibilityIncrementResult> {
  const result: EligibilityIncrementResult = {
    success: false,
    increment: null,
  }

  await connectDB()

  try {
    // Find employee
    let employee = await Employee.findOne({ employeeId: employeeId })
    if (!employee) {
      employee = await Employee.findOne({ id: employeeId })
    }
    if (!employee) {
      result.error = `Employee not found: ${employeeId}`
      return result
    }

    // Get company for category lookup
    const companyId = employee.companyId?.toString() || ''

    // Get product to determine category
    const product = await Uniform.findOne({ id: productId })
    if (!product) {
      result.error = `Product not found: ${productId}`
      return result
    }

    // Determine category name
    let categoryName: string | null = null
    if (product.categoryId) {
      const category = await getCategoryByIdOrName(companyId, product.categoryId.toString())
      if (category) {
        categoryName = category.name.toLowerCase()
      }
    } else if (product.category) {
      categoryName = (product.category as string).toLowerCase()
    }

    if (!categoryName) {
      result.error = `Category not found for product: ${productId}`
      return result
    }

    // Get current eligibility for this category
    const currentEligibility = employee.eligibility || {}
    const currentValue = (currentEligibility as any)[categoryName] || 0
    const newValue = currentValue + quantity

    console.log(`[ELIGIBILITY] INCREMENT: employee=${employeeId}, category=${categoryName}, qty=${quantity}, ${currentValue} -> ${newValue}, return=${returnRequestId}`)

    // Record the increment
    result.increment = {
      categoryName,
      previousValue: currentValue,
      newValue,
      quantity,
    }

    // Apply the increment
    if (!employee.eligibility) {
      employee.eligibility = {} as any
    }
    (employee.eligibility as any)[categoryName] = newValue
    employee.markModified('eligibility')
    await employee.save()
    
    console.log(`[ELIGIBILITY] ✅ Employee ${employeeId} eligibility incremented for return ${returnRequestId}`)

    result.success = true
  } catch (error: any) {
    console.error(`[ELIGIBILITY] ❌ Error incrementing eligibility:`, error.message)
    result.error = error.message
  }

  return result
}
