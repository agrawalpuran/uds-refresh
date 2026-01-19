/**
 * Vendor Inventory Service
 * 
 * Centralized service for managing vendor inventory operations.
 * 
 * Business Rules:
 * - Inventory is decremented when shipment is DISPATCHED (not when order is placed)
 * - Inventory is incremented when return is approved AND marked as stocked back
 * - Replacement orders decrement the NEW size, increment the ORIGINAL size on delivery
 * - IMPORTANT: Inventory records must exist and have sufficient stock before dispatch
 * 
 * @module lib/services/vendor-inventory-service
 * @version 1.1.0
 * @created 2026-01-16
 * @modified 2026-01-18
 */

import connectDB from '../db/mongodb'
import VendorInventory from '../models/VendorInventory'
import Vendor from '../models/Vendor'

// =============================================================================
// INVENTORY VALIDATION (Pre-Dispatch Check)
// =============================================================================

export interface InventoryValidationItem {
  uniformId: string
  size: string
  quantity: number
  productName?: string
}

export interface InventoryValidationResult {
  valid: boolean
  errors: string[]
  details: Array<{
    productId: string
    size: string
    requestedQty: number
    availableStock: number
    sufficient: boolean
    inventoryExists: boolean
  }>
}

/**
 * Validate that vendor has sufficient inventory for all order items
 * 
 * BUSINESS RULE: Before dispatching an order, ensure inventory exists
 * and has sufficient stock for all items. This prevents overselling.
 * 
 * @param vendorId Vendor ID (string)
 * @param orderItems Array of order items to validate
 * @returns Validation result with details per item
 */
export async function validateInventoryForDispatch(
  vendorId: string,
  orderItems: InventoryValidationItem[]
): Promise<InventoryValidationResult> {
  const result: InventoryValidationResult = {
    valid: true,
    errors: [],
    details: [],
  }

  await connectDB()

  try {
    console.log(`\n[INVENTORY-VALIDATE] ========== INVENTORY VALIDATION START ==========`)
    console.log(`[INVENTORY-VALIDATE] Vendor ID: ${vendorId}`)
    console.log(`[INVENTORY-VALIDATE] Items to validate: ${orderItems.length}`)
    
    // Validate vendor exists
    const vendor = await Vendor.findOne({ id: vendorId })
    if (!vendor) {
      result.valid = false
      result.errors.push(`Vendor not found: ${vendorId}`)
      console.error(`[INVENTORY-VALIDATE] ❌ Vendor not found: ${vendorId}`)
      return result
    }
    console.log(`[INVENTORY-VALIDATE] ✅ Vendor found: ${vendor.name}`)

    // DIAGNOSTIC: List all inventory records for this vendor
    const allVendorInventory = await VendorInventory.find({ vendorId: vendorId }).lean()
    console.log(`[INVENTORY-VALIDATE] 📦 Vendor has ${allVendorInventory.length} inventory records:`)
    allVendorInventory.forEach((inv: any, idx: number) => {
      console.log(`[INVENTORY-VALIDATE]   ${idx + 1}. productId="${inv.productId}", totalStock=${inv.totalStock}`)
    })

    // Check inventory for each item
    for (const item of orderItems) {
      console.log(`\n[INVENTORY-VALIDATE] 🔍 Checking item:`)
      console.log(`[INVENTORY-VALIDATE]   uniformId (from order): "${item.uniformId}"`)
      console.log(`[INVENTORY-VALIDATE]   productName: "${item.productName || 'N/A'}"`)
      console.log(`[INVENTORY-VALIDATE]   size: "${item.size}", quantity: ${item.quantity}`)
      
      if (!item.size || !item.quantity) {
        console.warn(`[INVENTORY-VALIDATE]   ⚠️ Skipping - missing size or quantity`)
        continue
      }

      // Find inventory record
      const inventory = await VendorInventory.findOne({
        vendorId: vendorId,
        productId: item.uniformId,
      })

      console.log(`[INVENTORY-VALIDATE]   Query: { vendorId: "${vendorId}", productId: "${item.uniformId}" }`)
      console.log(`[INVENTORY-VALIDATE]   Result: ${inventory ? 'FOUND' : 'NOT FOUND'}`)

      const inventoryExists = !!inventory
      let availableStock = 0

      if (inventory) {
        const sizeInventory = inventory.sizeInventory instanceof Map
          ? inventory.sizeInventory
          : new Map(Object.entries(inventory.sizeInventory || {}))
        availableStock = sizeInventory.get(item.size) || 0
        console.log(`[INVENTORY-VALIDATE]   ✅ Inventory found: size "${item.size}" has ${availableStock} in stock`)
      } else {
        // DIAGNOSTIC: Check if inventory exists with different productId format
        const possibleMatches = allVendorInventory.filter((inv: any) => 
          inv.productId?.includes(item.uniformId) || item.uniformId?.includes(inv.productId)
        )
        if (possibleMatches.length > 0) {
          console.log(`[INVENTORY-VALIDATE]   ⚠️ POSSIBLE ID MISMATCH DETECTED!`)
          console.log(`[INVENTORY-VALIDATE]   Looking for productId="${item.uniformId}"`)
          console.log(`[INVENTORY-VALIDATE]   But found similar: ${possibleMatches.map((m: any) => `"${m.productId}"`).join(', ')}`)
        }
      }

      const sufficient = availableStock >= item.quantity

      result.details.push({
        productId: item.uniformId,
        size: item.size,
        requestedQty: item.quantity,
        availableStock,
        sufficient,
        inventoryExists,
      })

      if (!inventoryExists) {
        result.valid = false
        const productLabel = item.productName || item.uniformId
        result.errors.push(`No inventory record exists for product "${productLabel}" (ID: ${item.uniformId}). Vendor must add inventory first.`)
        console.log(`[INVENTORY-VALIDATE]   ❌ FAILED: No inventory record`)
      } else if (!sufficient) {
        result.valid = false
        const productLabel = item.productName || item.uniformId
        result.errors.push(`Insufficient stock for product "${productLabel}" size ${item.size}: requested ${item.quantity}, available ${availableStock}`)
        console.log(`[INVENTORY-VALIDATE]   ❌ FAILED: Insufficient stock (need ${item.quantity}, have ${availableStock})`)
      } else {
        console.log(`[INVENTORY-VALIDATE]   ✅ PASSED: Sufficient stock`)
      }
    }

    console.log(`\n[INVENTORY-VALIDATE] ========== VALIDATION RESULT ==========`)
    console.log(`[INVENTORY-VALIDATE] Valid: ${result.valid}`)
    console.log(`[INVENTORY-VALIDATE] Items checked: ${result.details.length}`)
    console.log(`[INVENTORY-VALIDATE] Errors: ${result.errors.length}`)
    if (result.errors.length > 0) {
      result.errors.forEach((err, idx) => console.log(`[INVENTORY-VALIDATE]   ${idx + 1}. ${err}`))
    }
    console.log(`[INVENTORY-VALIDATE] ========== VALIDATION END ==========\n`)

  } catch (error: any) {
    console.error(`[INVENTORY-VALIDATE] ❌ Error validating inventory:`, error.message)
    result.valid = false
    result.errors.push(`Inventory validation failed: ${error.message}`)
  }

  return result
}

// =============================================================================
// INVENTORY DECREMENT (Shipment Dispatched)
// =============================================================================

export interface InventoryDecrementResult {
  success: boolean
  decrements: Array<{
    productId: string
    size: string
    previousStock: number
    newStock: number
    quantity: number
  }>
  errors: string[]
}

/**
 * Decrement vendor inventory when shipment is dispatched
 * 
 * BUSINESS RULE: Inventory is consumed when items are SHIPPED OUT,
 * NOT when the order is placed. This reflects actual physical stock movement.
 * 
 * IMPORTANT: This function now REQUIRES inventory to exist and have sufficient stock.
 * Use validateInventoryForDispatch() before calling this function.
 * 
 * @param vendorId Vendor ID (string, 6-digit numeric)
 * @param orderItems Array of order items with product and size info
 * @param orderId Order ID for audit trail
 * @param skipValidation If true, skips pre-validation (use only if already validated)
 * @returns Result with decrements applied
 */
export async function decrementVendorStockOnDispatch(
  vendorId: string,
  orderItems: Array<{
    uniformId: string
    size: string
    quantity: number
  }>,
  orderId: string,
  skipValidation: boolean = false
): Promise<InventoryDecrementResult> {
  const result: InventoryDecrementResult = {
    success: false,
    decrements: [],
    errors: [],
  }

  await connectDB()

  try {
    // Validate vendor exists
    const vendor = await Vendor.findOne({ id: vendorId })
    if (!vendor) {
      result.errors.push(`Vendor not found: ${vendorId}`)
      return result
    }

    // Pre-validate inventory if not skipped
    if (!skipValidation) {
      const validation = await validateInventoryForDispatch(vendorId, orderItems)
      if (!validation.valid) {
        result.errors = validation.errors
        console.error(`[INVENTORY] ❌ Pre-dispatch validation failed:`, validation.errors)
        return result
      }
    }

    // Process each order item
    for (const item of orderItems) {
      if (!item.size || !item.quantity) {
        console.warn(`[INVENTORY] Skipping item without size or quantity:`, item)
        continue
      }

      // Find inventory record - MUST exist (validated above)
      const inventory = await VendorInventory.findOne({
        vendorId: vendorId,
        productId: item.uniformId,
      })

      if (!inventory) {
        // This should not happen if validation passed, but handle defensively
        const errorMsg = `No inventory record found for vendor ${vendorId}, product ${item.uniformId}. Vendor must add inventory before dispatch.`
        console.error(`[INVENTORY] ❌ ${errorMsg}`)
        result.errors.push(errorMsg)
        continue
      }

      // Get current size inventory
      const sizeInventory = inventory.sizeInventory instanceof Map
        ? new Map(inventory.sizeInventory)
        : new Map(Object.entries(inventory.sizeInventory || {}))

      const currentStock = sizeInventory.get(item.size) || 0
      
      // Check sufficient stock (defensive - should be validated already)
      if (currentStock < item.quantity) {
        const errorMsg = `Insufficient stock for product ${item.uniformId} size ${item.size}: requested ${item.quantity}, available ${currentStock}`
        console.error(`[INVENTORY] ❌ ${errorMsg}`)
        result.errors.push(errorMsg)
        continue
      }

      const newStock = currentStock - item.quantity

      console.log(`[INVENTORY] DECREMENT: vendor=${vendorId}, product=${item.uniformId}, size=${item.size}, qty=${item.quantity}, ${currentStock} -> ${newStock}, order=${orderId}`)

      // Record the decrement
      result.decrements.push({
        productId: item.uniformId,
        size: item.size,
        previousStock: currentStock,
        newStock,
        quantity: item.quantity,
      })

      // Apply the decrement
      sizeInventory.set(item.size, newStock)

      // Calculate new total stock
      let totalStock = 0
      for (const qty of sizeInventory.values()) {
        totalStock += qty
      }

      inventory.sizeInventory = sizeInventory
      inventory.totalStock = totalStock
      inventory.markModified('sizeInventory')
      await inventory.save()

      console.log(`[INVENTORY] ✅ Vendor ${vendorId} inventory decremented: product ${item.uniformId}, size ${item.size}, ${currentStock} -> ${newStock}`)
    }

    // Success only if no errors
    result.success = result.errors.length === 0
  } catch (error: any) {
    console.error(`[INVENTORY] ❌ Error decrementing inventory:`, error.message)
    result.errors.push(error.message)
  }

  return result
}

// =============================================================================
// INVENTORY INCREMENT (Return Stocked Back)
// =============================================================================

export interface InventoryIncrementResult {
  success: boolean
  increment: {
    productId: string
    size: string
    previousStock: number
    newStock: number
    quantity: number
  } | null
  error?: string
}

/**
 * Increment vendor inventory when return is approved and stocked back
 * 
 * BUSINESS RULE: Inventory is restored when returned items are
 * physically received and added back to stock.
 * 
 * @param vendorId Vendor ID (string, 6-digit numeric)
 * @param productId Product ID (uniformId)
 * @param size Size of the returned item
 * @param quantity Quantity being returned
 * @param returnRequestId Return request ID for audit trail
 * @returns Result with increment applied
 */
export async function incrementVendorStockOnReturn(
  vendorId: string,
  productId: string,
  size: string,
  quantity: number,
  returnRequestId: string
): Promise<InventoryIncrementResult> {
  const result: InventoryIncrementResult = {
    success: false,
    increment: null,
  }

  await connectDB()

  try {
    // Validate vendor exists
    const vendor = await Vendor.findOne({ id: vendorId })
    if (!vendor) {
      result.error = `Vendor not found: ${vendorId}`
      return result
    }

    // Find or create inventory record
    let inventory = await VendorInventory.findOne({
      vendorId: vendorId,
      productId: productId,
    })

    if (!inventory) {
      console.warn(`[INVENTORY] ⚠️ No inventory record found for vendor ${vendorId}, product ${productId}. Creating with 0 stock.`)
      const inventoryId = `VEND-INV-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`
      inventory = await VendorInventory.create({
        id: inventoryId,
        vendorId: vendorId,
        productId: productId,
        sizeInventory: new Map(),
        totalStock: 0,
        lowInventoryThreshold: new Map(),
      })
    }

    // Get current size inventory
    const sizeInventory = inventory.sizeInventory instanceof Map
      ? new Map(inventory.sizeInventory)
      : new Map(Object.entries(inventory.sizeInventory || {}))

    const currentStock = sizeInventory.get(size) || 0
    const newStock = currentStock + quantity

    console.log(`[INVENTORY] INCREMENT: vendor=${vendorId}, product=${productId}, size=${size}, qty=${quantity}, ${currentStock} -> ${newStock}, return=${returnRequestId}`)

    // Record the increment
    result.increment = {
      productId,
      size,
      previousStock: currentStock,
      newStock,
      quantity,
    }

    // Apply the increment
    sizeInventory.set(size, newStock)

    // Calculate new total stock
    let totalStock = 0
    for (const qty of sizeInventory.values()) {
      totalStock += qty
    }

    inventory.sizeInventory = sizeInventory
    inventory.totalStock = totalStock
    inventory.markModified('sizeInventory')
    await inventory.save()

    console.log(`[INVENTORY] ✅ Vendor ${vendorId} inventory incremented: product ${productId}, size ${size}, ${currentStock} -> ${newStock}`)

    result.success = true
  } catch (error: any) {
    console.error(`[INVENTORY] ❌ Error incrementing inventory:`, error.message)
    result.error = error.message
  }

  return result
}
