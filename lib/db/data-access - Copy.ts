/**
 * MongoDB Data Access Layer
 * This file contains all database query functions
 */

import connectDB from './mongodb'
import mongoose from 'mongoose'
// Import Branch first to ensure it's registered before Employee uses it
import Branch from '../models/Branch'
import Uniform, { IUniform } from '../models/Uniform'
import Vendor, { IVendor } from '../models/Vendor'
import Company, { ICompany } from '../models/Company'
import Employee, { IEmployee } from '../models/Employee'
import Order, { IOrder } from '../models/Order'
import CompanyAdmin from '../models/CompanyAdmin'
import Location from '../models/Location'
import LocationAdmin from '../models/LocationAdmin'
import { ProductCompany, ProductVendor } from '../models/Relationship'
// VendorCompany relationships are now derived from ProductCompany + ProductVendor
// No need to import VendorCompany model
import DesignationProductEligibility from '../models/DesignationProductEligibility'
import DesignationSubcategoryEligibility from '../models/DesignationSubcategoryEligibility'
import Subcategory from '../models/Subcategory'
import ProductSubcategoryMapping from '../models/ProductSubcategoryMapping'
import VendorInventory from '../models/VendorInventory'
import ProductFeedback from '../models/ProductFeedback'
import ReturnRequest from '../models/ReturnRequest'
import ProductSizeChart from '../models/ProductSizeChart'
// Ensure Category model is registered (required by Subcategory)
import Category from '../models/Category'
import ProductCategory from '../models/ProductCategory'
// Indent workflow models
import IndentHeader from '../models/IndentHeader'
import VendorIndent from '../models/VendorIndent'
import OrderSuborder from '../models/OrderSuborder'
import GoodsReceiptNote from '../models/GoodsReceiptNote'
import VendorInvoice from '../models/VendorInvoice'
import Payment from '../models/Payment'
import PurchaseOrder from '../models/PurchaseOrder'
import POOrder from '../models/POOrder'
import GRN from '../models/GRN'
import Invoice from '../models/Invoice'
import SystemShippingConfig from '../models/SystemShippingConfig'
import ShipmentServiceProvider from '../models/ShipmentServiceProvider'
import CompanyShippingProvider from '../models/CompanyShippingProvider'
import { getCurrentCycleDates, isDateInCurrentCycle } from '../utils/eligibility-cycles'
import {
  getCategoriesByCompany,
  getCategoryByIdOrName,
  getProductCategoryId,
  getProductCategoryName,
  normalizeCategoryName,
  ensureSystemCategories
} from './category-helpers'

// Ensure Branch model is registered
if (!mongoose.models.Branch) {
  require('../models/Branch')
}

// Ensure Category model is registered (required by Subcategory and other models)
if (!mongoose.models.Category) {
  require('../models/Category')
}

/**
 * Helper function to convert companyId from ObjectId to numeric ID
 * This is the single source of truth for companyId conversion
 */
// DEPRECATED: This function is no longer needed as all IDs are now strings
// Kept for backward compatibility during migration - will be removed
async function convertCompanyIdToNumericId(companyId: any): Promise<string | null> {
  if (!companyId) {
    return null
  }
  
  // If already a string, validate and return
  const companyIdStr = String(companyId)
  if (/^\d{6}$/.test(companyIdStr)) {
    return companyIdStr
  }
  
  // Invalid format
  console.warn(`[convertCompanyIdToNumericId] ⚠️ Invalid companyId format: ${companyIdStr} (expected 6-digit numeric string)`)
  return null
}

// Helper to convert MongoDB document to plain object
function toPlainObject(doc: any): any {
  if (!doc) return null
  if (Array.isArray(doc)) {
    return doc.map((d) => toPlainObject(d))
  }
  const obj = doc.toObject ? doc.toObject() : doc
  // Convert ObjectId to string for id fields, but preserve existing id field if it exists
  if (obj._id) {
    // Only set id from _id if id doesn't already exist (preserve the actual id field)
    if (!obj.id) {
      obj.id = obj._id.toString()
    }
    delete obj._id
  }
  // Convert ObjectIds in arrays to strings
  if (obj.companyIds && Array.isArray(obj.companyIds)) {
    obj.companyIds = obj.companyIds.map((id: any) => {
      if (id && typeof id === 'object' && id.id) {
        return id.id // If populated, use the id field
      }
      return id.toString()
    })
  }
  // vendorId removed from Uniform model - use ProductVendor collection instead
  // branchId and branchName removed - use locationId instead
  // Handle companyId - if it's null, don't process it (will be fixed in getEmployeeByEmail)
  // If it exists, convert it properly
  if (obj.companyId !== null && obj.companyId !== undefined) {
    // Handle populated companyId (object with id and name) or ObjectId
    if (obj.companyId && typeof obj.companyId === 'object') {
      if (obj.companyId.id) {
        // Populated object - use the id field (this is the company's string 'id' field like 'COMP-INDIGO')
        obj.companyId = obj.companyId.id
      } else if (obj.companyId._id) {
        // Populated object with _id but no id field - this shouldn't happen if populate worked correctly
        // Keep as _id string for now, will be converted in getEmployeeByEmail
        obj.companyId = obj.companyId._id.toString()
      } else if (obj.companyId.toString) {
        // ObjectId - convert to string, will be converted to company string ID in getEmployeeByEmail
        obj.companyId = obj.companyId.toString()
      }
    } else if (typeof obj.companyId === 'string') {
      // Already a string - check if it's an ObjectId string (24 hex chars) or company string ID
      // If it's an ObjectId string, it will be converted in getEmployeeByEmail
      // If it's already a company string ID (like 'COMP-INDIGO'), keep it
      obj.companyId = obj.companyId
    }
  }
  // Note: If companyId is null, we leave it as null - getEmployeeByEmail will fix it from raw document
  if (obj.employeeId) {
    if (obj.employeeId && typeof obj.employeeId === 'object' && obj.employeeId.id) {
      obj.employeeId = obj.employeeId.id
    } else {
      obj.employeeId = obj.employeeId.toString()
    }
  }
  if (obj.items && Array.isArray(obj.items)) {
    obj.items = obj.items.map((item: any) => ({
      ...item,
      uniformId: item.uniformId?.toString() || (item.uniformId?.id || item.uniformId),
      productId: item.productId || item.uniformId?.id || item.uniformId?.toString(), // Ensure productId is included
      // Ensure price and quantity are preserved as numbers
      price: typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0,
      quantity: typeof item.quantity === 'number' ? item.quantity : parseInt(item.quantity) || 0,
    }))
  }
  // Ensure numeric IDs are included in order objects
  if (obj.employeeIdNum !== undefined) {
    obj.employeeIdNum = obj.employeeIdNum
  }
  if (obj.companyIdNum !== undefined) {
    obj.companyIdNum = typeof obj.companyIdNum === 'number' ? obj.companyIdNum : Number(obj.companyIdNum) || obj.companyIdNum
  }
  // Handle vendorId population - ensure vendorName is available
  if (obj.vendorId) {
    if (typeof obj.vendorId === 'object' && obj.vendorId !== null) {
      // Populated vendorId - preserve the object but also ensure vendorName is set
      if (obj.vendorId.name && !obj.vendorName) {
        obj.vendorName = obj.vendorId.name
      }
      // Keep vendorId as object for frontend access
    } else if (typeof obj.vendorId === 'string') {
      // vendorId is an ObjectId string - vendorName should be set during order creation
      // If not, we can't get it here without a lookup
    }
  }
  // Ensure total is preserved as a number
  if (obj.total !== undefined) {
    obj.total = typeof obj.total === 'number' ? obj.total : parseFloat(obj.total) || 0
  }
  // Explicitly preserve attribute fields (they should be preserved by default, but ensure they're included)
  // Attributes are optional fields, so preserve them if they exist
  if ('attribute1_name' in obj) obj.attribute1_name = obj.attribute1_name
  if ('attribute1_value' in obj) obj.attribute1_value = obj.attribute1_value
  if ('attribute2_name' in obj) obj.attribute2_name = obj.attribute2_name
  if ('attribute2_value' in obj) obj.attribute2_value = obj.attribute2_value
  if ('attribute3_name' in obj) obj.attribute3_name = obj.attribute3_name
  if ('attribute3_value' in obj) obj.attribute3_value = obj.attribute3_value
  // Explicitly preserve company settings boolean fields (ensure they're always included, even if false)
  // For company objects, always include these fields with defaults if missing
  if (obj.id && typeof obj.id === 'string' && /^\d{6}$/.test(obj.id)) {
    // This is a company object (has 6-digit numeric ID)
    // Always include boolean settings fields, defaulting to false if not present
    // BUT: Only default if the field truly doesn't exist (use 'in' operator, not !== undefined)
    // This is critical because a field can be explicitly set to false, which is different from undefined
    if (!('showPrices' in obj)) obj.showPrices = false
    if (!('allowPersonalPayments' in obj)) obj.allowPersonalPayments = false
    if (!('allowPersonalAddressDelivery' in obj)) obj.allowPersonalAddressDelivery = false
    // CRITICAL: Only default enableEmployeeOrder if it doesn't exist in the object
    // If it exists (even as false), preserve the actual value
    if (!('enableEmployeeOrder' in obj)) {
      obj.enableEmployeeOrder = false
    } else {
      // Field exists - ensure it's a boolean
      obj.enableEmployeeOrder = Boolean(obj.enableEmployeeOrder)
    }
  } else {
    // For other objects, preserve if they exist
    if ('showPrices' in obj) obj.showPrices = obj.showPrices
    if ('allowPersonalPayments' in obj) obj.allowPersonalPayments = obj.allowPersonalPayments
    if ('allowPersonalAddressDelivery' in obj) obj.allowPersonalAddressDelivery = obj.allowPersonalAddressDelivery
    if ('enableEmployeeOrder' in obj) obj.enableEmployeeOrder = Boolean(obj.enableEmployeeOrder)
  }
  return obj
}

// ========== UNIFORM/PRODUCT FUNCTIONS ==========

export async function getProductsByCompany(companyId: string | number): Promise<any[]> {
  try {
    await connectDB()
  } catch (error: any) {
    console.error('[getProductsByCompany] Database connection error:', error.message)
    return [] // Return empty array on connection error
  }
  
  if (!companyId && companyId !== 0) {
    console.warn('getProductsByCompany: companyId is empty or undefined')
    return []
  }
  
  // Convert companyId to number if it's a string representation of a number
  let numericCompanyId: number | null = null
  if (typeof companyId === 'string') {
    // Try to parse as number
    const parsed = Number(companyId)
    if (!isNaN(parsed) && isFinite(parsed)) {
      numericCompanyId = parsed
    }
  } else if (typeof companyId === 'number') {
    numericCompanyId = companyId
  }
  
  // Find company by numeric ID first (since company.id is now numeric)
  let company = null
  if (numericCompanyId !== null) {
    company = await Company.findOne({ id: numericCompanyId })
    if (company) {
      console.log(`getProductsByCompany: Found company by numeric ID: ${numericCompanyId} (${company.name})`)
    }
  }
  
  // No longer needed - all IDs are strings now
  // Removed ObjectId fallback lookup
  
  // If still not found, try as string ID (for backward compatibility)
  if (!company && typeof companyId === 'string') {
    company = await Company.findOne({ id: companyId })
    if (company) {
      console.log(`getProductsByCompany: Found company by string ID: ${companyId} (${company.name})`)
      numericCompanyId = company.id
    }
  }
  
  if (!company) {
    console.warn(`getProductsByCompany: Company not found for companyId: ${companyId} (type: ${typeof companyId})`)
    // List available companies for debugging
    const allCompanies = await Company.find({}, 'id name').limit(5).lean() as any
    console.warn(`getProductsByCompany: Available companies:`, allCompanies.map((c: any) => `${c.id} (${c.name})`))
    return []
  }

  // Only get products directly linked via ProductCompany relationship
  // Use raw MongoDB collection for reliable ObjectId comparison
  const db = mongoose.connection.db
    if (!db) {
    throw new Error('Database connection not available')
  }
  if (!db) {
    console.warn('getProductsByCompany: Database connection not available')
    return []
  }
  
  const companyIdStr = company.id
  const allProductCompanyLinks = await db.collection('productcompanies').find({}).toArray()
  
  // Filter by string comparison for reliable ObjectId matching
  const productCompanyLinks = allProductCompanyLinks.filter((link: any) => {
    if (!link.companyId) return false
    const linkCompanyIdStr = link.companyId.toString ? link.companyId.toString() : String(link.companyId)
    return linkCompanyIdStr === companyIdStr
  })
  
  console.log(`getProductsByCompany: Found ${productCompanyLinks.length} ProductCompany relationships for company ${companyId} (${company.name || 'Unknown'})`)
  
  if (productCompanyLinks.length === 0) {
    console.warn(`getProductsByCompany: No ProductCompany relationships found for company ${companyId} (${company.name || 'Unknown'})`)
    console.warn(`  - This means products are not linked to this company via ProductCompany relationships`)
    console.warn(`  - Total ProductCompany relationships in database: ${allProductCompanyLinks.length}`)
    if (allProductCompanyLinks.length > 0) {
      const sampleLinks = allProductCompanyLinks.slice(0, 3)
      console.warn(`  - Sample relationships:`, sampleLinks.map((l: any) => ({
        productId: l.productId?.toString?.() || l.productId,
        companyId: l.companyId?.toString?.() || l.companyId
      })))
    }
    return []
  }
  
  // Get product string IDs from the relationships
  const productIdStrs = productCompanyLinks
    .map((link: any) => {
      if (!link.productId) return null
      // Handle both string IDs and ObjectId strings (for backward compatibility during migration)
      if (typeof link.productId === 'string') {
        return link.productId
      }
      // If it's an object with an id field, use that
      if (link.productId && typeof link.productId === 'object' && link.productId.id) {
        return link.productId.id
      }
      // Otherwise convert to string
      return link.productId.toString ? link.productId.toString() : String(link.productId)
    })
    .filter((id: any) => id !== null && id !== undefined)
  
  if (productIdStrs.length === 0) {
    console.log(`No valid product IDs found in relationships for company ${companyId}`)
    return []
  }
  
  console.log(`getProductsByCompany: Looking for ${productIdStrs.length} products with IDs: ${productIdStrs.slice(0, 3).join(', ')}...`)

  // Fetch products using string IDs directly
  const products = await Uniform.find({
    id: { $in: productIdStrs },
  })
    .populate('vendorId', 'id name')
    .lean() as any
  
  console.log(`getProductsByCompany: Found ${(products as any).length} products using string ID query`)

  console.log(`getProductsByCompany(${companyId}): Mongoose query returned ${products.length} products`)
  
  // If Mongoose query returns 0, log warning but return empty array
  // (No fallback needed since we're using string IDs directly)
  if (!products || products.length === 0) {
    console.warn(`getProductsByCompany: No products found for company ${companyId}`)
    return []
  }
  
  // Process products
  const productsToUse = products.map((p: any) => {
      const product: any = { 
        ...p,
        // Explicitly preserve attribute fields
        attribute1_name: p.attribute1_name,
        attribute1_value: p.attribute1_value,
        attribute2_name: p.attribute2_name,
        attribute2_value: p.attribute2_value,
        attribute3_name: p.attribute3_name,
        attribute3_value: p.attribute3_value,
      }
      // Convert _id to proper format
      if (product._id) {
    product._id = new mongoose.Types.ObjectId(
    product._id.toString())
      }
      // vendorId removed from Uniform model - use ProductVendor collection instead
      return product
    })
  
  // Filter products to only include those that have vendors linked for fulfillment
  // A product must have:
  // 1. A ProductVendor relationship (vendor supplies the product)
  // If product is linked to company and has vendors, it can be fulfilled
  
  if (productsToUse.length === 0) {
    return []
  }
  
  // Get all ProductVendor links for all products at once (using raw MongoDB)
  // Use the productIdStrs we already have from the ProductCompany relationships
  const allProductVendorLinks = await db.collection('productvendors').find({}).toArray()
  
  const productVendorLinks = allProductVendorLinks.filter((link: any) => {
    if (!link.productId) return false
    const linkProductIdStr = link.productId.toString ? link.productId.toString() : String(link.productId)
    return productIdStrs.includes(linkProductIdStr)
  })
  
  // Populate vendor details manually
  const allVendors = await db.collection('vendors').find({}).toArray()
  const vendorMap = new Map()
  allVendors.forEach((v: any) => {
    vendorMap.set(v._id.toString(), { id: v.id, name: v.name })
  })
  
  // Enhance links with vendor details
  const enhancedProductVendorLinks = productVendorLinks.map((link: any) => {
    return {
      productId: link.productId,
      vendorId: {
        _id: link.vendorId,
        id: vendorMap.get(link.vendorId?.toString())?.id,
        name: vendorMap.get(link.vendorId?.toString())?.name
      }
    };
  })
  
  // Create a map of product ObjectId -> set of vendor ObjectIds that supply it
  const productVendorMap = new Map<string, Set<string>>()
  for (const pvLink of enhancedProductVendorLinks) {
    const productId = pvLink.productId?.toString()
    const vendorId = pvLink.vendorId?._id?.toString()
    
    if (productId && vendorId) {
      if (!productVendorMap.has(productId)) {
        productVendorMap.set(productId, new Set())
      }
      productVendorMap.get(productId)!.add(vendorId)
    }
  }
  
  // Filter products: only include those that have at least one vendor that supplies the product
  // Check if there are ANY vendors in the system at all (not just for these products)
  const hasAnyVendorsInSystem = allVendors.length > 0
  
  const productsWithVendors = productsToUse.filter((product: any) => {
    const productIdStr = product._id.toString()
    const vendorsForProduct = productVendorMap.get(productIdStr)
    
    // If no vendors exist in the system at all, show all products (for initial setup)
    if (!hasAnyVendorsInSystem) {
      console.log(`getProductsByCompany: No vendors in system, showing product ${product.id} (${product.name}) without vendor requirement`)
      return true
    }
    
    // If vendors exist in system, products MUST have vendors to be shown
    if (!vendorsForProduct || vendorsForProduct.size === 0) {
      console.log(`getProductsByCompany: Product ${product.id} (${product.name}) has no vendors linked - skipping (vendors exist in system)`)
      return false
    }
    
    // Product is linked to company and has vendors - it can be fulfilled
    return true
  })
  
  console.log(`getProductsByCompany(${companyId}): Filtered to ${productsWithVendors.length} products${hasAnyVendorsInSystem ? ' with vendors for fulfillment' : ' (no vendors in system, showing all)'}`)
  
  // Enhance products with all vendors that can fulfill them
  const enhancedProducts = productsWithVendors.map((product: any) => {
    const productIdStr = product._id.toString()
    const vendorsForProduct = productVendorMap.get(productIdStr) || new Set()
    
    // Get all vendors that supply this product
    const availableVendors: any[] = []
    for (const vendorIdStr of vendorsForProduct) {
      // Find vendor details from enhancedProductVendorLinks
      const pvLink = enhancedProductVendorLinks.find((link: any) => 
        link.productId?.toString() === productIdStr && 
        link.vendorId?._id?.toString() === vendorIdStr
      );
      if (pvLink && pvLink.vendorId) {
        availableVendors.push({
          id: pvLink.vendorId.id || pvLink.vendorId._id?.toString(),
          name: pvLink.vendorId.name || 'Unknown Vendor'
        })
      }
    }
    
    // Convert to plain object and add vendors array
    const plainProduct = toPlainObject(product)
    plainProduct.vendors = availableVendors
    // vendorId removed - use vendors array from ProductVendor collection instead
    // Explicitly preserve attribute fields (ensure they're included in response)
    if ((product as any).attribute1_name !== undefined) plainProduct.attribute1_name = (product as any).attribute1_name
    if ((product as any).attribute1_value !== undefined) plainProduct.attribute1_value = (product as any).attribute1_value
    if ((product as any).attribute2_name !== undefined) plainProduct.attribute2_name = (product as any).attribute2_name
    if ((product as any).attribute2_value !== undefined) plainProduct.attribute2_value = (product as any).attribute2_value
    if ((product as any).attribute3_name !== undefined) plainProduct.attribute3_name = (product as any).attribute3_name
    if ((product as any).attribute3_value !== undefined) plainProduct.attribute3_value = (product as any).attribute3_value
    
    return plainProduct
  })
  
  return enhancedProducts
}

// Get all products linked to a company (without vendor fulfillment filter)
// This is useful for category extraction and other purposes where we need all linked products
export async function getAllProductsByCompany(companyId: string | number): Promise<any[]> {
  try {
    await connectDB()
  } catch (error: any) {
    console.error('[getAllProductsByCompany] Database connection error:', error.message)
    return []
  }
  
  try {
    if (!companyId && companyId !== 0) {
      console.warn('getAllProductsByCompany: companyId is empty or undefined')
      return []
    }
  
  // Convert companyId to number if it's a string representation of a number
  let numericCompanyId: number | null = null
  if (typeof companyId === 'string') {
    // Try to parse as number
    const parsed = Number(companyId)
    if (!isNaN(parsed) && isFinite(parsed)) {
      numericCompanyId = parsed
    }
  } else if (typeof companyId === 'number') {
    numericCompanyId = companyId
  }
  
  // Find company by numeric ID first (since company.id is now numeric)
  let company = null
  if (numericCompanyId !== null) {
    company = await Company.findOne({ id: numericCompanyId })
    if (company) {
      console.log(`getAllProductsByCompany: Found company by numeric ID: ${numericCompanyId} (${company.name})`)
    }
  }
  
  // Removed ObjectId fallback - all companies should use string IDs
  
  // If still not found, try as string ID (for backward compatibility)
  if (!company && typeof companyId === 'string') {
    company = await Company.findOne({ id: companyId })
    if (company) {
      console.log(`getAllProductsByCompany: Found company by string ID: ${companyId} (${company.name})`)
      numericCompanyId = company.id
    }
  }
  
  if (!company) {
    console.warn(`getAllProductsByCompany: Company not found for companyId: ${companyId} (type: ${typeof companyId})`)
    // List available companies for debugging
    const allCompanies = await Company.find({}, 'id name').limit(5).lean() as any
    console.warn(`getAllProductsByCompany: Available companies:`, allCompanies.map((c: any) => `${c.id} (${c.name})`))
    return []
  }

  // Get all products directly linked via ProductCompany relationship
  // Use raw MongoDB collection for reliable ObjectId comparison (same approach as getProductsByCompany)
  const db = mongoose.connection.db
  if (!db) {
    throw new Error('Database connection not available')
  }
  
  // Use company string ID instead of _id
  const companyIdStr = company.id
  const allProductCompanyLinks = await db.collection('productcompanies').find({}).toArray()
  
  // Filter by string ID matching (supports both string IDs and ObjectId strings for backward compatibility)
  const productCompanyLinks = allProductCompanyLinks.filter((link: any) => {
    if (!link.companyId) return false
    // Handle both string IDs and ObjectId strings (for backward compatibility during migration)
    const linkCompanyIdStr = typeof link.companyId === 'string' 
      ? link.companyId 
      : (link.companyId?.toString ? link.companyId.toString() : String(link.companyId))
    return linkCompanyIdStr === companyIdStr
  })
  
  console.log(`getAllProductsByCompany: Found ${productCompanyLinks.length} ProductCompany relationships for company ${companyId} (${
    company.name || 'Unknown'})`)
  
  if (productCompanyLinks.length === 0) {
    console.log(`getAllProductsByCompany: No products directly linked to company ${companyId}`)
    return []
  }
  
  // Get product string IDs from the relationships
  const productIdStrs = productCompanyLinks
    .map((link: any) => {
      if (!link.productId) return null
      // Handle both string IDs and ObjectId strings (for backward compatibility during migration)
      if (typeof link.productId === 'string') {
        return link.productId
      }
      // If it's an object with an id field, use that
      if (link.productId && typeof link.productId === 'object' && link.productId.id) {
        return link.productId.id
      }
      // Otherwise convert to string
      return link.productId.toString ? link.productId.toString() : String(link.productId)
    })
    .filter((id: any) => id !== null && id !== undefined)
  
  if (productIdStrs.length === 0) {
    console.log(`getAllProductsByCompany: No valid product IDs found in relationships for company ${companyId}`)
    return []
  }
  
  console.log(`getAllProductsByCompany: Looking for ${productIdStrs.length} products with IDs: ${productIdStrs.slice(0, 3).join(', ')}...`)

  // Fetch products using string IDs directly
  const products = await Uniform.find({
    id: { $in: productIdStrs },
  })
    .populate('vendorId', 'id name')
    .lean() as any
  
  console.log(`getAllProductsByCompany: Found ${(products as any).length} products using string ID query`)

  console.log(`getAllProductsByCompany(${companyId}): Mongoose query returned ${products.length} products (all, without vendor filter)`)
  
  // If Mongoose query returns 0, log warning but return empty array
  // (No fallback needed since we're using string IDs directly)
  if (!products || products.length === 0) {
    console.warn(`getAllProductsByCompany: No products found for company ${companyId}`)
    return []
  }
  
  // Process products
  const productsToUse = products.map((p: any) => {
    const product: any = { 
      ...p,
      // Explicitly preserve attribute fields
      attribute1_name: p.attribute1_name,
      attribute1_value: p.attribute1_value,
      attribute2_name: p.attribute2_name,
      attribute2_value: p.attribute2_value,
      attribute3_name: p.attribute3_name,
      attribute3_value: p.attribute3_value,
    }
    // Convert _id to proper format
    if (product._id) {
    product._id = new mongoose.Types.ObjectId(
    product._id.toString())
    }
    // vendorId removed from Uniform model - use ProductVendor collection instead
    return product
  })
  
  // Convert to plain objects and ensure attributes are preserved
  return productsToUse.map((p: any) => {
    const plain = toPlainObject(p)
    // Explicitly preserve attribute fields
    if (p.attribute1_name !== undefined) plain.attribute1_name = p.attribute1_name
    if (p.attribute1_value !== undefined) plain.attribute1_value = p.attribute1_value
    if (p.attribute2_name !== undefined) plain.attribute2_name = p.attribute2_name
    if (p.attribute2_value !== undefined) plain.attribute2_value = p.attribute2_value
    if (p.attribute3_name !== undefined) plain.attribute3_name = p.attribute3_name
    if (p.attribute3_value !== undefined) plain.attribute3_value = p.attribute3_value
    return plain
  })
  } catch (error: any) {
    console.error('[getAllProductsByCompany] Error:', error.message)
    return []
  }
}

/**
 * CRITICAL: Vendor Product Fetch - STRICT ProductVendor Relationship Enforcement
 * 
 * SINGLE SOURCE OF TRUTH: ProductVendor relationships (created by Super Admin)
 * 
 * This function:
 * 1. Uses centralized vendor resolution (single source of truth)
 * 2. ONLY uses ProductVendor relationships - NO FALLBACKS
 * 3. Returns empty array if no ProductVendor relationships exist
 * 4. Ensures vendors see ONLY products explicitly assigned to them
 * 5. Includes comprehensive logging for debugging
 * 
 * NO FALLBACKS TO:
 * - Inventory records (vendors may have inventory for products not assigned)
 * - Orders (vendors may have fulfilled orders for products not assigned)
 * 
 * This ensures strict access control and data integrity.
 */
export async function getProductsByVendor(vendorId: string): Promise<any[]> {
  try {
    await connectDB()
  } catch (error: any) {
    console.error('[getProductsByVendor] Database connection error:', error.message)
    return []
  }
  
  try {
  // 🔍 LOG: Service boundary - COMPREHENSIVE DEBUGGING
  console.log(`\n╔════════════════════════════════════════════════════════════╗`)
  console.log(`║  [getProductsByVendor] START - COMPREHENSIVE DEBUGGING     ║`)
  console.log(`╚════════════════════════════════════════════════════════════╝`)
  console.log(`[getProductsByVendor] Input vendorId: "${vendorId}" (type: ${typeof vendorId})`)
  console.log(`[getProductsByVendor] vendorId length: ${vendorId?.length || 0}`)
  console.log(`[getProductsByVendor] vendorId trimmed: "${vendorId?.trim() || ''}"`)
  
  // STEP 1: Get vendor document directly from database (CRITICAL FIX)
  // We MUST use the vendor's ACTUAL _id from the database (not a newly created ObjectId)
  // This is the exact ObjectId that was stored in ProductVendor relationships when they were created
  const db = mongoose.connection.db
  if (!db) {
    throw new Error('Database connection not available')
  }

  const vendor = await db.collection('vendors').findOne({ id: vendorId })
  if (!vendor) {
    console.warn(`[getProductsByVendor] Vendor not found: ${vendorId}`)
    return [] // Return empty array instead of throwing
  }
  
  // CRITICAL: Use the vendor's ACTUAL _id from the database
  // Handle both ObjectId and String formats (MongoDB can store _id as either)
  const vendorAny = vendor as any
  let vendorDbObjectId: mongoose.Types.ObjectId
  if (vendorAny._id instanceof mongoose.Types.ObjectId) {
    vendorDbObjectId = vendorAny._id
  } else if (mongoose.Types.ObjectId.isValid(vendorAny._id)) {
    vendorDbObjectId = new mongoose.Types.ObjectId(vendorAny._id)
  } else {
    throw new Error(`Invalid vendor _id format: ${vendorAny._id} (type: ${typeof vendorAny._id})`)
  }
  
  console.log(`[getProductsByVendor] Vendor _id format: ${vendorAny._id?.constructor?.name || typeof vendorAny._id}`)
  console.log(`[getProductsByVendor] Converted to ObjectId: ${vendorDbObjectId.toString()}`)
  
  const vendorName = vendorAny.name || 'Unknown Vendor'
  
  console.log(`[getProductsByVendor] ✅ Vendor found: ${vendorName} (${vendorId})`)
  console.log(`[getProductsByVendor] Using vendor DB _id: ${vendorDbObjectId.toString()} (type: ${vendorDbObjectId.constructor.name})`)

  // STEP 2: Query ProductVendor relationships using vendor's string ID
  console.log(`[getProductsByVendor] Querying ProductVendor relationships for vendor: ${vendorName} (${vendorId})`)
  console.log(`[getProductsByVendor] 🔍 Querying with vendor string ID: ${vendorId}`)
  
  // Use ProductVendor model with string IDs (schema uses string vendorId)
  const productVendorLinks = await ProductVendor.find({ 
    vendorId: vendorId 
  }).lean() as any

  console.log(`[getProductsByVendor] ✅ ProductVendor relationships found: ${productVendorLinks.length}`)
  
  // Extract product string IDs from ProductVendor relationships
  let productIds: string[] = []
  if (productVendorLinks.length > 0) {
    productIds = productVendorLinks
      .map((link: any) => String(link.productId))
      .filter((id: string) => id && id.trim() !== '')
    
    console.log(`[getProductsByVendor] Extracted ${productIds.length} product string IDs`)
    console.log(`[getProductsByVendor] Extracted ${productIds.length} product IDs from ProductVendor relationships`)
    if (productIds.length > 0) {
      console.log(`[getProductsByVendor] Product IDs extracted:`, productIds.map((id: any) => id.toString()))
    }
  } else {
    // CRITICAL: NO FALLBACKS - ProductVendor relationships are the SINGLE SOURCE OF TRUTH
    // If no ProductVendor relationships exist, vendor has NO assigned products
    // Do NOT fall back to inventory or orders - this would show unassigned products
    console.log(`[getProductsByVendor] ⚠️ No ProductVendor relationships found for vendor ${vendorName} (${vendorId})`)
    console.log(`[getProductsByVendor] ⚠️ This vendor has NO products assigned via ProductVendor relationships`)
    console.log(`[getProductsByVendor] ⚠️ Returning empty array - vendor must have products assigned by Super Admin`)
    console.log(`[getProductsByVendor] ⚠️ NOT using fallback to inventory/orders (would violate access control)`)
    
    // Log diagnostic info but DO NOT use it for fallback
    const inventoryCount = await VendorInventory.countDocuments({ vendorId: vendorDbObjectId })
    const orderCount = await Order.countDocuments({ vendorId: vendorDbObjectId })
    console.log(`[getProductsByVendor] Diagnostic (for reference only, NOT used):`, {
      inventoryRecords: inventoryCount,
      ordersWithVendor: orderCount,
      note: 'These are NOT used as fallback - ProductVendor relationships are required'
    })
    
    // Return empty array - vendor has no assigned products
    return []
  }

  // STEP 3: Validate we have products
  if (productIds.length === 0) {
    console.error(`[getProductsByVendor] ❌ CRITICAL: No products found for vendor ${vendorName} (${vendorId})`)
    console.error(`[getProductsByVendor] Diagnostic info:`)
    console.error(`  - ProductVendor relationships: ${productVendorLinks.length}`)
    console.error(`  - Inventory records: ${await VendorInventory.countDocuments({ vendorId: vendorDbObjectId })}`)
    console.error(`  - Orders with vendor: ${await Order.countDocuments({ vendorId: vendorDbObjectId })}`)
    console.error(`[getProductsByVendor] This vendor has no products linked via any method.`)
    return []
  }

  console.log(`[getProductsByVendor] ✅ Proceeding with ${productIds.length} product IDs`)

  // STEP 4: Fetch products from database
  console.log(`[getProductsByVendor] Querying uniforms collection for ${productIds.length} products`)
  console.log(`[getProductsByVendor] Product ObjectIds to query:`, productIds.map(id => id.toString()))
  
  // 🔍 DIAGNOSTIC: Log ObjectId types before query
  console.log(`[getProductsByVendor] 🔍 DIAGNOSTIC: ObjectId types before query:`)
  productIds.forEach((id: any, idx: number) => {
    console.log(`[getProductsByVendor]   productIds[${idx}]:`, {
      id: id.toString(),
      type: id.constructor.name,
      isValid: mongoose.Types.ObjectId.isValid(id),
      instanceOf: id instanceof mongoose.Types.ObjectId
    })
  })
  
  let products = await Uniform.find({
    _id: { $in: productIds },
  })
    .lean() as any

  console.log(`[getProductsByVendor] Products query result: ${products.length} products found by _id`)
  
  // CRITICAL SECURITY CHECK: Ensure query didn't return more products than expected
  if (products.length > productIds.length) {
    console.error(`[getProductsByVendor] ❌❌❌ CRITICAL SECURITY VIOLATION: Query returned ${products.length} products but only ${productIds.length} ProductVendor relationships exist!`)
    console.error(`[getProductsByVendor] This should NEVER happen - the query should only return products in productIds array!`)
    console.error(`[getProductsByVendor] Products returned:`, products.map((p: any) => `${p.name} (${p.id}, _id: ${p._id?.toString()})`))
    console.error(`[getProductsByVendor] Expected productIds:`, productIds.map(id => id.toString()))
    console.error(`[getProductsByVendor] ❌ Filtering to ONLY products that match productIds...`)
    
    // CRITICAL: Filter to ONLY products that match productIds
    const productIdStrings = new Set(productIds.map(id => id.toString()))
    const filteredProducts = products.filter((p: any) => {
      const pIdStr = p._id?.toString() || String(p._id || '')
      return productIdStrings.has(pIdStr)
    })
    
    console.error(`[getProductsByVendor] After filtering: ${filteredProducts.length} products (removed ${products.length - filteredProducts.length} invalid products)`)
    products = filteredProducts
    
    // If still too many, this is a critical MongoDB/Mongoose bug
    if (products.length > productIds.length) {
      console.error(`[getProductsByVendor] ❌❌❌ STILL TOO MANY AFTER FILTERING! This indicates a critical bug in MongoDB query!`)
      console.error(`[getProductsByVendor] Limiting to first ${productIds.length} products as emergency safeguard`)
      products = products.slice(0, productIds.length)
    }
  }
  
  // If no products found, log diagnostic info
  if (products.length === 0 && productIds.length > 0) {
    console.warn(`[getProductsByVendor] ⚠️ No products found by _id. Checking if products exist in database...`)
    
    // Get all products to see what's available
    const allProducts = await Uniform.find({}).select('_id id name').limit(10).lean() as any
    console.log(`[getProductsByVendor] Sample products in database:`, allProducts.map((p: any) => ({
      _id: p._id?.toString(),
      id: p.id,
      name: p.name
    })))
    
    // Try to find products by matching ObjectId strings
    const productIdStrings = productIds.map(id => id.toString())
    const matchingProducts = allProducts.filter((p: any) => {
      const pIdStr = p._id?.toString ? p._id.toString() : String(p._id || '')
      return productIdStrings.includes(pIdStr)
    })
    
    if (matchingProducts.length > 0) {
      console.log(`[getProductsByVendor] Found ${matchingProducts.length} products by string comparison`)
      
      // 🔍 DIAGNOSTIC: Log the matching products and their _id types
      console.log(`[getProductsByVendor] 🔍 DIAGNOSTIC: Matching products _id details:`)
      matchingProducts.forEach((p: any, idx: number) => {
        const pIdStr = p._id?.toString ? p._id.toString() : String(p._id || '')
        console.log(`[getProductsByVendor]   matchingProducts[${idx}]:`, {
          _id: p._id,
          _idType: typeof p._id,
          _idConstructor: p._id?.constructor?.name,
          _idString: pIdStr,
          isValid: mongoose.Types.ObjectId.isValid(pIdStr),
          id: p.id,
          name: p.name
        })
      })
      
      // CRITICAL FIX: Use the matching products directly instead of re-querying
      // Since we already have the products from allProducts, just use them
      // But we need to fetch full product data (not just _id, id, name)
      const matchingProductIds = matchingProducts.map((p: any) => {
        const pIdStr = p._id?.toString ? p._id.toString() : String(p._id || '')
        if (mongoose.Types.ObjectId.isValid(pIdStr)) {
          return new mongoose.Types.ObjectId(pIdStr)
        }
        return null
      }).filter((id: any) => id !== null) as mongoose.Types.ObjectId[]
      
      console.log(`[getProductsByVendor] Fetching full product data for ${matchingProductIds.length} products`)
      console.log(`[getProductsByVendor] 🔍 DIAGNOSTIC: ObjectIds to query:`, matchingProductIds.map(oid => ({
        oid: oid.toString(),
        type: oid.constructor.name,
        isValid: mongoose.Types.ObjectId.isValid(oid)
      })))
      
      // CRITICAL FIX: Products exist but findById with ObjectId fails
      // Query by numeric 'id' field instead (which we have from matchingProducts)
      console.log(`[getProductsByVendor] Products found by string comparison. Fetching full product data by numeric id...`)
      
      const numericIds = matchingProducts.map((p: any) => p.id).filter((id: any) => id)
      console.log(`[getProductsByVendor] 🔍 DIAGNOSTIC: Numeric IDs to query:`, numericIds)
      
      if (numericIds.length > 0) {
        // CRITICAL SECURITY: Ensure numericIds count matches productIds count
        // If numericIds has more items than productIds, we have a data inconsistency
        if (numericIds.length > productIds.length) {
          console.error(`[getProductsByVendor] ❌ CRITICAL SECURITY VIOLATION: numericIds (${numericIds.length}) exceeds productIds (${productIds.length})!`)
          console.error(`[getProductsByVendor] This indicates a bug in the fallback logic - limiting to productIds count`)
          numericIds.splice(productIds.length) // Limit to productIds count
        }
        
        // Query by numeric 'id' field (this is the reliable field)
        // CRITICAL: Only query for the exact numericIds we extracted from matchingProducts
        products = await Uniform.find({
          id: { $in: numericIds }
        }).lean() as any
        
        console.log(`[getProductsByVendor] Query by numeric id result: ${products.length} products found`)
        
        // CRITICAL SECURITY: If query returned more products than expected, this is a violation
        if (products.length > productIds.length) {
          console.error(`[getProductsByVendor] ❌ CRITICAL SECURITY VIOLATION: Query returned ${products.length} products but only ${productIds.length} ProductVendor relationships exist!`)
          console.error(`[getProductsByVendor] This indicates the query is returning products not assigned to this vendor!`)
          console.error(`[getProductsByVendor] Products returned:`, products.map((p: any) => `${p.name} (${p.id})`))
          console.error(`[getProductsByVendor] Expected productIds:`, productIds.map(id => id.toString()))
        }
        
        // CRITICAL: After finding products by numeric id, we need to verify their _id matches productIds
        // If products were found by numeric id but their _id doesn't match productIds, we have a data inconsistency
        if (products.length > 0) {
          console.log(`[getProductsByVendor] 🔍 Verifying product _id matches productIds from ProductVendor links...`)
          const productIdStrings = productIds.map(id => id.toString())
          const verifiedProducts = products.filter((p: any) => {
            const pIdStr = p._id?.toString() || String(p._id || '')
            const matches = productIdStrings.includes(pIdStr)
            if (!matches) {
              console.error(`[getProductsByVendor] ❌ SECURITY: Product ${p.id} (${p.name}) has _id ${pIdStr} which doesn't match any productId from ProductVendor links - REMOVING`)
              console.error(`[getProductsByVendor]   This indicates a data inconsistency - product exists but ProductVendor link points to different _id`)
            }
            return matches
          })
          
          if (verifiedProducts.length < products.length) {
            console.error(`[getProductsByVendor] ❌ SECURITY VIOLATION: Removed ${products.length - verifiedProducts.length} products with mismatched _id`)
            products = verifiedProducts
          }
          
          // CRITICAL: Final check - ensure we don't return more products than ProductVendor relationships
          if (products.length > productIds.length) {
            console.error(`[getProductsByVendor] ❌ CRITICAL: After verification, still have ${products.length} products but only ${productIds.length} ProductVendor relationships!`)
            console.error(`[getProductsByVendor] Limiting to first ${productIds.length} products that match productIds`)
            // Limit to only products that match productIds (should already be filtered, but double-check)
            const limitedProducts = products.slice(0, productIds.length).filter((p: any) => {
              const pIdStr = p._id?.toString() || String(p._id || '')
              return productIds.some(id => id.toString() === pIdStr)
            })
            console.error(`[getProductsByVendor] After limiting: ${limitedProducts.length} products`)
            products = limitedProducts
          }
        }
        
        if (products.length === 0) {
          // Fallback: Query individually
          console.log(`[getProductsByVendor] ⚠️ Query by $in failed, trying individual queries...`)
          const directProducts: any[] = []
          for (const numericId of numericIds) {
            try {
              const directProduct = await Uniform.findOne({ id: numericId }).lean() as any
              if (directProduct) {
                // Verify id matches productIds (using string id field)
                const pIdStr = (directProduct as any).id || String((directProduct as any).id || '')
                const productIdStrings = (productIds || []).map((id: any) => String(id))
                if (productIdStrings.includes(pIdStr)) {
                directProducts.push(directProduct)
                  console.log(`[getProductsByVendor] ✅ Found product by numeric id: ${numericId} (verified id match)`)
                } else {
                  console.warn(`[getProductsByVendor] ⚠️ Product ${numericId} found but id ${pIdStr} doesn't match ProductVendor links`)
                }
              } else {
                console.log(`[getProductsByVendor] ❌ Product not found by numeric id: ${numericId}`)
              }
            } catch (err: any) {
              console.error(`[getProductsByVendor] ❌ Error querying product ${numericId}:`, err.message)
            }
          }
          if (directProducts.length > 0) {
            products = directProducts
            console.log(`[getProductsByVendor] ✅ Using ${directProducts.length} products from individual queries`)
          }
        }
      }
      
      if (products.length === 0) {
        console.error(`[getProductsByVendor] ❌ All query methods failed. Products exist but cannot be retrieved.`)
      }
    } else {
      // CRITICAL: Product IDs from ProductVendor do not match any products in database
      // This indicates orphaned ProductVendor relationships (product was deleted but relationship remains)
      // DO NOT fall back to inventory - this would show unassigned products
      console.error(`[getProductsByVendor] ❌ CRITICAL: Product IDs from ProductVendor do not match any products in database`)
      console.error(`[getProductsByVendor] This indicates data inconsistency - ProductVendor relationships may be orphaned`)
      console.error(`[getProductsByVendor] NOT using fallback to inventory (would violate access control)`)
      console.error(`[getProductsByVendor] Returning empty array - orphaned relationships should be cleaned up by Super Admin`)
      
      // Return empty array - orphaned relationships should not show products
      return []
    }
  }
  
  // Validate products match productIds (security check)
  if (products.length > productIds.length) {
    console.error(`[getProductsByVendor] ❌ SECURITY: Found ${products.length} products but only ${productIds.length} ProductVendor relationships!`)
    // Filter to only products that match productIds
    const productIdSet = new Set(productIds)
    products = products.filter((p: any) => productIdSet.has(p.id))
    console.error(`[getProductsByVendor] After filtering: ${products.length} products`)
  }
  
  if (products.length < productIds.length) {
    const foundProductIds = new Set(products.map((p: any) => p.id))
    const missingProductIds = productIds.filter(id => !foundProductIds.has(id))
    console.warn(`[getProductsByVendor] ⚠️ Some product IDs not found: expected ${productIds.length}, found ${products.length}`)
    console.warn(`[getProductsByVendor] Missing product IDs:`, missingProductIds)
  }
  
  console.log(`[getProductsByVendor] ✅ Successfully found ${products.length} products`)

  // CRITICAL SECURITY: Get inventory data ONLY for products in productIds (from ProductVendor relationships)
  // This ensures we never return inventory for unassigned products
  // Use string IDs for vendorId and productId
  const inventoryRecords = await VendorInventory.find({
    vendorId: vendorId,
    productId: { $in: productIds }, // CRITICAL: Only inventory for assigned products
  })
    .lean() as any
  
  console.log(`[getProductsByVendor] ✅ Found ${inventoryRecords.length} inventory record(s) for ${productIds.length} assigned product(s)`)
  
  // CRITICAL VALIDATION: Verify all inventory records are for products in productIds
  const productIdStrings = new Set(productIds.map(id => id.toString()))
  const invalidInventory = inventoryRecords.filter((inv: any) => {
    const invProductIdStr = inv.productId?.toString() || String(inv.productId || '')
    return !productIdStrings.has(invProductIdStr)
  })
  
  if (invalidInventory.length > 0) {
    console.error(`[getProductsByVendor] ❌ CRITICAL SECURITY VIOLATION: Found ${invalidInventory.length} inventory record(s) for products NOT in ProductVendor relationships!`)
    console.error(`[getProductsByVendor] These inventory records will be IGNORED to prevent data leakage`)
    invalidInventory.forEach((inv: any) => {
      console.error(`[getProductsByVendor]   - Inventory ID: ${inv.id}, Product ID: ${inv.productId?.toString() || 'N/A'}`)
    })
  }
  
  // Filter out invalid inventory records
  const validInventoryRecords = inventoryRecords.filter((inv: any) => {
    const invProductIdStr = inv.productId?.toString() || String(inv.productId || '')
    return productIdStrings.has(invProductIdStr)
  })
  
  if (validInventoryRecords.length < inventoryRecords.length) {
    console.error(`[getProductsByVendor] ❌ Removed ${inventoryRecords.length - validInventoryRecords.length} invalid inventory record(s)`)
  }

  // Create a map of productId -> inventory (using ONLY valid inventory records)
  const inventoryMap = new Map()
  validInventoryRecords.forEach((inv: any) => {
    const productIdStr = inv.productId?.toString()
    if (productIdStr) {
      // Convert Map to object if needed
      const sizeInventory = inv.sizeInventory instanceof Map
        ? Object.fromEntries(inv.sizeInventory)
        : inv.sizeInventory || {}
      
      const productIdForMap = productIdStr || String(inv.productId || '')
      inventoryMap.set(productIdForMap, {
        sizeInventory,
        totalStock: inv.totalStock || 0,
      })
    }
  })

  // Attach inventory data to products - use string ID
  const productsWithInventory = products.map((product: any) => {
    const productId = product.id
    const inventory = inventoryMap.get(productId) || {
      sizeInventory: {},
      totalStock: 0,
    }

    const plainProduct = toPlainObject(product)
    // Explicitly preserve attribute fields
    if (product.attribute1_name !== undefined) plainProduct.attribute1_name = product.attribute1_name
    if (product.attribute1_value !== undefined) plainProduct.attribute1_value = product.attribute1_value
    if (product.attribute2_name !== undefined) plainProduct.attribute2_name = product.attribute2_name
    if (product.attribute2_value !== undefined) plainProduct.attribute2_value = product.attribute2_value
    if (product.attribute3_name !== undefined) plainProduct.attribute3_name = product.attribute3_name
    if (product.attribute3_value !== undefined) plainProduct.attribute3_value = product.attribute3_value

    return {
      ...plainProduct,
      inventory: inventory.sizeInventory,
      totalStock: inventory.totalStock,
      stock: inventory.totalStock,
    }
  })

  // Security validation: Ensure all products match productIds from ProductVendor relationships
  const productIdSet = new Set(productIds)
  const validatedProducts = productsWithInventory.filter((p: any) => {
    return productIdSet.has(p.id)
  })
  
  if (validatedProducts.length < productsWithInventory.length) {
    console.error(`[getProductsByVendor] ❌ SECURITY: Removed ${productsWithInventory.length - validatedProducts.length} products not in ProductVendor relationships`)
  }
  
  // Final security check: Ensure product count doesn't exceed ProductVendor relationships
  if (validatedProducts.length > productVendorLinks.length) {
    console.error(`[getProductsByVendor] ❌ SECURITY: Returning ${validatedProducts.length} products but only ${productVendorLinks.length} ProductVendor relationships!`)
    return []
  }
  
  // Final logging
  console.log(`[getProductsByVendor] ✅ FINAL RESULT:`)
  console.log(`[getProductsByVendor] Vendor: ${vendorName} (${vendorId})`)
  console.log(`[getProductsByVendor] ProductVendor relationships: ${productVendorLinks.length}`)
  console.log(`[getProductsByVendor] Products returned: ${validatedProducts.length}`)
  
  if (validatedProducts.length < productVendorLinks.length) {
    console.warn(`[getProductsByVendor] ⚠️ Product count (${validatedProducts.length}) is less than ProductVendor relationships (${productVendorLinks.length})`)
    console.warn(`[getProductsByVendor] This may indicate orphaned ProductVendor relationships`)
  }
  
  if (validatedProducts.length > 0) {
    console.log(`[getProductsByVendor] ✅ SUCCESS - Products found:`)
    validatedProducts.forEach((p: any, idx: number) => {
      console.log(`[getProductsByVendor]   ${idx + 1}. ${p.name} (SKU: ${p.sku}, ID: ${p.id})`)
    })
  } else if (productVendorLinks.length === 0) {
    console.log(`[getProductsByVendor] ✅ Correctly returning empty array - vendor has no ProductVendor relationships`)
    console.log(`[getProductsByVendor] ⚠️  Vendor ${vendorName} needs products assigned via Super Admin → Product to Vendor`)
  } else {
    console.error(`[getProductsByVendor] ❌ CRITICAL: Returning empty array despite having ${productIds.length} product IDs`)
    console.error(`[getProductsByVendor] This indicates a data inconsistency. Products exist but cannot be returned.`)
    console.error(`[getProductsByVendor] Diagnostic:`)
    console.error(`  - ProductVendor links: ${productVendorLinks.length}`)
    console.error(`  - Product IDs extracted: ${productIds.length}`)
    console.error(`  - Products found: ${productsWithInventory.length}`)
  }
  
  console.log(`[getProductsByVendor] END\n`)

  return productsWithInventory
  } catch (error: any) {
    console.error('[getProductsByVendor] Error:', error.message)
    return []
  }
}

export async function getAllProducts(): Promise<any[]> {
  await connectDB()
  
  const products = await Uniform.find()
    .populate('vendorId', 'id name')
    .lean() as any

  // Convert to plain objects and ensure attributes are preserved
  return products.map((p: any) => {
    const plain = toPlainObject(p)
    // Explicitly preserve attribute fields
    if (p.attribute1_name !== undefined) plain.attribute1_name = p.attribute1_name
    if (p.attribute1_value !== undefined) plain.attribute1_value = p.attribute1_value
    if (p.attribute2_name !== undefined) plain.attribute2_name = p.attribute2_name
    if (p.attribute2_value !== undefined) plain.attribute2_value = p.attribute2_value
    if (p.attribute3_name !== undefined) plain.attribute3_name = p.attribute3_name
    if (p.attribute3_value !== undefined) plain.attribute3_value = p.attribute3_value
    return plain
  })
}

export async function createProduct(productData: {
  name: string
  category: 'shirt' | 'pant' | 'shoe' | 'jacket' | 'accessory'
  gender: 'male' | 'female' | 'unisex'
  sizes: string[]
  price: number
  image: string
  sku: string
  vendorId?: string
  stock?: number
  // Optional SKU attributes
  attribute1_name?: string
  attribute1_value?: string | number
  attribute2_name?: string
  attribute2_value?: string | number
  attribute3_name?: string
  attribute3_value?: string | number
}): Promise<any> {
  await connectDB()
  
  // Generate unique 6-digit numeric product ID (starting from 200001)
  let nextProductId = 200001
  const existingProducts = await Uniform.find({})
    .sort({ id: -1 })
    .limit(1)
    .lean() as any
  
  if (existingProducts.length > 0) {
    const lastId = existingProducts[0].id
    if (/^\d{6}$/.test(String(lastId))) {
      const lastIdNum = parseInt(String(lastId), 10)
      if (lastIdNum >= 200001 && lastIdNum < 300000) {
        nextProductId = lastIdNum + 1
      }
    }
  }
  
  let productId = String(nextProductId).padStart(6, '0')
  
  // Check if this ID already exists (safety check)
    const existingProduct = await Uniform.findOne({ id: productId })
  if (existingProduct) {
    // Find next available ID
    for (let i = nextProductId + 1; i < 300000; i++) {
      const testId = String(i).padStart(6, '0')
      const exists = await Uniform.findOne({ id: testId })
      if (!exists) {
        productId = testId
        break
      }
    }
  }
  
  // Check if SKU already exists
  const existingBySku = await Uniform.findOne({ sku: productData.sku })
  if (existingBySku) {
    throw new Error(`Product with SKU already exists: ${productData.sku}`)
  }
  
  // Handle vendor if provided (optional - can be linked later via relationships)
  // vendorId removed from Uniform model - use ProductVendor collection to link products to vendors
  
  const productDataToCreate: any = {
    id: productId,
    name: productData.name,
    category: productData.category,
    gender: productData.gender,
    sizes: productData.sizes || [],
    price: productData.price,
    image: productData.image || '',
    sku: productData.sku,
    companyIds: [],
  }
  
  // Add optional attributes (only include if name is provided - name is required for attribute to be valid)
  // This ensures attributes are saved to the database when provided
  if (productData.attribute1_name !== undefined && productData.attribute1_name !== null && String(productData.attribute1_name).trim() !== '') {
    productDataToCreate.attribute1_name = String(productData.attribute1_name).trim()
    if (productData.attribute1_value !== undefined && productData.attribute1_value !== null && String(productData.attribute1_value).trim() !== '') {
      productDataToCreate.attribute1_value = productData.attribute1_value
    } else {
      // Even if value is empty, save the name (value can be added later)
      productDataToCreate.attribute1_value = null
    }
  }
  if (productData.attribute2_name !== undefined && productData.attribute2_name !== null && String(productData.attribute2_name).trim() !== '') {
    productDataToCreate.attribute2_name = String(productData.attribute2_name).trim()
    if (productData.attribute2_value !== undefined && productData.attribute2_value !== null && String(productData.attribute2_value).trim() !== '') {
      productDataToCreate.attribute2_value = productData.attribute2_value
    } else {
      productDataToCreate.attribute2_value = null
    }
  }
  if (productData.attribute3_name !== undefined && productData.attribute3_name !== null && String(productData.attribute3_name).trim() !== '') {
    productDataToCreate.attribute3_name = String(productData.attribute3_name).trim()
    if (productData.attribute3_value !== undefined && productData.attribute3_value !== null && String(productData.attribute3_value).trim() !== '') {
      productDataToCreate.attribute3_value = productData.attribute3_value
    } else {
      productDataToCreate.attribute3_value = null
    }
  }
  
  // ============================================================
  // FORENSIC DIAGNOSTIC: STEP 3 - INSPECT ACTUAL PAYLOAD
  // ============================================================
  console.log('\n╔════════════════════════════════════════════════════════════╗')
  console.log('║  FORENSIC: PRODUCT PAYLOAD INSPECTION                     ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
  console.log('[FORENSIC] Product data to create:')
  console.log(JSON.stringify(productDataToCreate, null, 2))
  console.log('\n[FORENSIC] Field-by-field type analysis:')
  Object.keys(productDataToCreate).forEach(key => {
    const value = productDataToCreate[key]
    const type = typeof value
    const isArray = Array.isArray(value)
    console.log(`  ${key}: ${isArray ? 'Array' : type} = ${isArray ? `[${value.length} items]` : JSON.stringify(value)}`)
  })
  
  // ============================================================
  // FORENSIC DIAGNOSTIC: STEP 4 - SCHEMA VS PAYLOAD COMPARISON
  // ============================================================
  console.log('\n[FORENSIC] Schema requirements vs Payload:')
  const schemaChecks = {
    'id': {
      required: true,
      type: 'string',
      validation: '6 digits',
      provided: productDataToCreate.id,
      typeMatch: typeof productDataToCreate.id === 'string',
      validationMatch: /^\d{6}$/.test(String(productDataToCreate.id || '')),
    },
    'name': {
      required: true,
      type: 'string',
      provided: productDataToCreate.name,
      typeMatch: typeof productDataToCreate.name === 'string',
      notEmpty: productDataToCreate.name && String(productDataToCreate.name).trim().length > 0,
    },
    'category': {
      required: true,
      type: 'string',
      enum: ['shirt', 'pant', 'shoe', 'jacket', 'accessory'],
      provided: productDataToCreate.category,
      typeMatch: typeof productDataToCreate.category === 'string',
      enumMatch: ['shirt', 'pant', 'shoe', 'jacket', 'accessory'].includes(productDataToCreate.category),
    },
    'gender': {
      required: true,
      type: 'string',
      enum: ['male', 'female', 'unisex'],
      provided: productDataToCreate.gender,
      typeMatch: typeof productDataToCreate.gender === 'string',
      enumMatch: ['male', 'female', 'unisex'].includes(productDataToCreate.gender),
    },
    'sizes': {
      required: true,
      type: 'array',
      provided: productDataToCreate.sizes,
      isArray: Array.isArray(productDataToCreate.sizes),
      notEmpty: Array.isArray(productDataToCreate.sizes) && productDataToCreate.sizes.length > 0,
    },
    'price': {
      required: true,
      type: 'number',
      provided: productDataToCreate.price,
      typeMatch: typeof productDataToCreate.price === 'number',
      isFinite: typeof productDataToCreate.price === 'number' && isFinite(productDataToCreate.price),
    },
    'image': {
      required: true,
      type: 'string',
      provided: productDataToCreate.image,
      typeMatch: typeof productDataToCreate.image === 'string',
      notEmpty: productDataToCreate.image && String(productDataToCreate.image).trim().length > 0,
    },
    'sku': {
      required: true,
      type: 'string',
      provided: productDataToCreate.sku,
      typeMatch: typeof productDataToCreate.sku === 'string',
      notEmpty: productDataToCreate.sku && String(productDataToCreate.sku).trim().length > 0,
    },
    'companyIds': {
      required: false,
      type: 'array',
      default: [],
      provided: productDataToCreate.companyIds,
      isArray: Array.isArray(productDataToCreate.companyIds),
    },
  }
  
  Object.keys(schemaChecks).forEach(field => {
    const check = schemaChecks[field as keyof typeof schemaChecks] as any
    const status = check.required 
      ? ((check.typeMatch !== undefined ? check.typeMatch : true) && (check.enumMatch !== undefined ? check.enumMatch : true) && (check.notEmpty !== undefined ? check.notEmpty : true) && (check.validationMatch !== undefined ? check.validationMatch : true) && (check.isFinite !== undefined ? check.isFinite : true))
      : 'N/A (optional)'
    console.log(`  ${field}:`)
    console.log(`    Required: ${check.required}`)
    console.log(`    Expected Type: ${check.type}`)
    if (check.enum) console.log(`    Enum: ${JSON.stringify(check.enum)}`)
    if (check.validation) console.log(`    Validation: ${check.validation}`)
    console.log(`    Provided: ${JSON.stringify(check.provided)}`)
    console.log(`    Type Match: ${check.typeMatch !== undefined ? check.typeMatch : 'N/A'}`)
    if (check.enumMatch !== undefined) console.log(`    Enum Match: ${check.enumMatch}`)
    if (check.validationMatch !== undefined) console.log(`    Validation Match: ${check.validationMatch}`)
    if (check.notEmpty !== undefined) console.log(`    Not Empty: ${check.notEmpty}`)
    if (check.isFinite !== undefined) console.log(`    Is Finite: ${check.isFinite}`)
    console.log(`    ✅ Status: ${status === true ? 'PASS' : status === false ? '❌ FAIL' : status}`)
  })
  
  // ============================================================
  // FORENSIC DIAGNOSTIC: STEP 6 - FORCE ERROR SURFACING
  // ============================================================
  console.log('\n[FORENSIC] Attempting Uniform.create()...')
  let newProduct
  try {
    newProduct = await Uniform.create(productDataToCreate)
    console.log('[FORENSIC] ✅ Uniform.create() succeeded')
    console.log('[FORENSIC] Created product object:')
    console.log(JSON.stringify(newProduct.toObject(), null, 2))
  } catch (err: any) {
    console.error('\n╔════════════════════════════════════════════════════════════╗')
    console.error('║  ❌ UNIFORM SAVE FAILED - VALIDATION ERROR                ║')
    console.error('╚════════════════════════════════════════════════════════════╝')
    console.error(`[FORENSIC] Error Name: ${err.name}`)
    console.error(`[FORENSIC] Error Message: ${err.message}`)
    console.error(`[FORENSIC] Error Code: ${err.code || 'N/A'}`)
    if (err.errors) {
      console.error('[FORENSIC] Validation Errors:')
      Object.keys(err.errors).forEach(key => {
        const error = err.errors[key]
        console.error(`  ${key}:`)
        console.error(`    Kind: ${error.kind}`)
        console.error(`    Path: ${error.path}`)
        console.error(`    Value: ${JSON.stringify(error.value)}`)
        console.error(`    Message: ${error.message}`)
      })
    }
    if (err.keyPattern) {
      console.error('[FORENSIC] Duplicate Key Pattern:')
      console.error(JSON.stringify(err.keyPattern, null, 2))
    }
    if (err.keyValue) {
      console.error('[FORENSIC] Duplicate Key Value:')
      console.error(JSON.stringify(err.keyValue, null, 2))
    }
    console.error('[FORENSIC] Full Error Stack:')
    console.error(err.stack)
    throw err
  }
  
  // Fetch the created product with populated fields using the string ID (more reliable)
  const created = await Uniform.findOne({ id: productId })
    .populate('vendorId', 'id name')
    .lean() as any
  
  if (created) {
    return toPlainObject(created)
  }
  
  // Fallback: try to use the created product directly
  await newProduct.populate('vendorId', 'id name')
  return toPlainObject(newProduct)
}

export async function updateProduct(
  productId: string,
  updateData: {
    name?: string
    category?: 'shirt' | 'pant' | 'shoe' | 'jacket' | 'accessory'
    gender?: 'male' | 'female' | 'unisex'
    sizes?: string[]
    price?: number
    image?: string
    sku?: string
    vendorId?: string
    stock?: number
    // Optional SKU attributes
    attribute1_name?: string
    attribute1_value?: string | number
    attribute2_name?: string
    attribute2_value?: string | number
    attribute3_name?: string
    attribute3_value?: string | number
  }
): Promise<any> {
  await connectDB()
  
  // First, verify the product exists and get its current SKU for validation
  let product: any = await Uniform.findOne({ id: productId }).lean() as any
  
  // Removed ObjectId fallback - all products should use string IDs
  
  if (!product) {
    console.warn(`[updateProduct] Product not found: ${productId}`)
    return null // Return null instead of throwing - let API route handle 404
  }
  
  // Handle SKU update (check for duplicates) - must check before update
  if (updateData.sku !== undefined && updateData.sku !== (product as any).sku) {
    const existingBySku = await Uniform.findOne({ sku: updateData.sku }).lean() as any
    if (existingBySku && (existingBySku as any).id !== productId) {
      throw new Error(`Product with SKU already exists: ${updateData.sku}`)
    }
  }
  
  // Build update object - only include fields that are defined
  const updateObject: any = {}
  if (updateData.name !== undefined) updateObject.name = updateData.name
  if (updateData.category !== undefined) updateObject.category = updateData.category
  if (updateData.gender !== undefined) updateObject.gender = updateData.gender
  if (updateData.sizes !== undefined) updateObject.sizes = updateData.sizes
  if (updateData.price !== undefined) updateObject.price = updateData.price
  if (updateData.image !== undefined) updateObject.image = updateData.image
  if (updateData.sku !== undefined) updateObject.sku = updateData.sku
  
  console.log('[updateProduct] Update data received:', JSON.stringify(updateData, null, 2))
  
  // Update optional attributes (only save if name is provided - name is required for attribute to be valid)
  // IMPORTANT: Check for both undefined and empty string, as form data may send empty strings
  if (updateData.attribute1_name !== undefined) {
    const attr1Name = updateData.attribute1_name ? String(updateData.attribute1_name).trim() : ''
    if (attr1Name !== '') {
      // Name is provided - save it
      updateObject.attribute1_name = attr1Name
      // Save value if provided, otherwise don't include it (preserve existing or leave empty)
      if (updateData.attribute1_value !== undefined && updateData.attribute1_value !== null && String(updateData.attribute1_value).trim() !== '') {
        updateObject.attribute1_value = updateData.attribute1_value
      }
      // Note: If value is empty, we don't set it to null - we just don't update it
    } else {
      // Name is empty - clear the entire attribute
      updateObject.attribute1_name = null
      updateObject.attribute1_value = null
    }
  } else if (updateData.attribute1_value !== undefined) {
    // Only value is being updated (name not provided, preserve existing name)
    if (updateData.attribute1_value !== null && String(updateData.attribute1_value).trim() !== '') {
      updateObject.attribute1_value = updateData.attribute1_value
    } else {
      // Value is being cleared
      updateObject.attribute1_value = null
    }
  }
  
  if (updateData.attribute2_name !== undefined) {
    const attr2Name = updateData.attribute2_name ? String(updateData.attribute2_name).trim() : ''
    if (attr2Name !== '') {
      updateObject.attribute2_name = attr2Name
      if (updateData.attribute2_value !== undefined && updateData.attribute2_value !== null && String(updateData.attribute2_value).trim() !== '') {
        updateObject.attribute2_value = updateData.attribute2_value
      }
    } else {
      updateObject.attribute2_name = null
      updateObject.attribute2_value = null
    }
  } else if (updateData.attribute2_value !== undefined) {
    if (updateData.attribute2_value !== null && String(updateData.attribute2_value).trim() !== '') {
      updateObject.attribute2_value = updateData.attribute2_value
    } else {
      updateObject.attribute2_value = null
    }
  }
  
  if (updateData.attribute3_name !== undefined) {
    const attr3Name = updateData.attribute3_name ? String(updateData.attribute3_name).trim() : ''
    if (attr3Name !== '') {
      updateObject.attribute3_name = attr3Name
      if (updateData.attribute3_value !== undefined && updateData.attribute3_value !== null && String(updateData.attribute3_value).trim() !== '') {
        updateObject.attribute3_value = updateData.attribute3_value
      }
    } else {
      updateObject.attribute3_name = null
      updateObject.attribute3_value = null
    }
  } else if (updateData.attribute3_value !== undefined) {
    if (updateData.attribute3_value !== null && String(updateData.attribute3_value).trim() !== '') {
      updateObject.attribute3_value = updateData.attribute3_value
    } else {
      updateObject.attribute3_value = null
    }
  }
  
  // Build the update query - use $set for all fields
  // Only use $unset to remove fields when name is explicitly cleared
  const updateQuery: any = { $set: {} }
  const unsetFields: any = {}
  
  // Process attributes specially: if name is being cleared, unset both name and value
  // Otherwise, set the name and value (value can be null if not provided)
  const attributeNames = ['attribute1', 'attribute2', 'attribute3']
  attributeNames.forEach(attrPrefix => {
    const nameKey = `${attrPrefix}_name`
    const valueKey = `${attrPrefix}_value`
    
    if (nameKey in updateObject) {
      if (updateObject[nameKey] === null) {
        // Name is being cleared - unset both name and value
        unsetFields[nameKey] = ''
        unsetFields[valueKey] = ''
      } else {
        // Name is being set - include it in $set
        updateQuery.$set[nameKey] = updateObject[nameKey]
        // If value is also being updated, include it (even if null)
        if (valueKey in updateObject) {
          if (updateObject[valueKey] === null) {
            // Value is being cleared but name exists - unset only the value
            unsetFields[valueKey] = ''
          } else {
            updateQuery.$set[valueKey] = updateObject[valueKey]
          }
        }
      }
    } else if (valueKey in updateObject) {
      // Only value is being updated (name not provided)
      if (updateObject[valueKey] === null) {
        unsetFields[valueKey] = ''
      } else {
        updateQuery.$set[valueKey] = updateObject[valueKey]
      }
    }
  })
  
  // Process non-attribute fields
  Object.keys(updateObject).forEach(key => {
    if (!key.startsWith('attribute')) {
      if (updateObject[key] === null) {
        unsetFields[key] = ''
      } else {
        updateQuery.$set[key] = updateObject[key]
      }
    }
  })
  
  if (Object.keys(unsetFields).length > 0) {
    updateQuery.$unset = unsetFields
  }
  
  // Use findOneAndUpdate to update directly in database (avoids save() issues)
  // Try by id field first
  let updated = await Uniform.findOneAndUpdate(
    { id: productId },
    updateQuery,
    { new: true, runValidators: true }
  ).lean() as any
  
  // Removed ObjectId fallback - all products should use string IDs
  if (!updated) {
    // Try findOneAndUpdate as fallback
    updated = await Uniform.findOneAndUpdate(
      { id: productId },
      updateQuery,
      { new: true, runValidators: true }
    ).lean() as any
  }
  
  if (!updated) {
    console.warn(`[updateProduct] Product not found for update: ${productId}`)
    return null // Return null instead of throwing - let API route handle 404
  }
  
  return toPlainObject(updated)
}

export async function deleteProduct(productId: string): Promise<void> {
  await connectDB()
  
  const product = await Uniform.findOne({ id: productId })
  if (!product) {
    console.warn(`[deleteProduct] Product not found: ${productId}`)
    return // Return early instead of throwing - let API route handle 404
  }
  
  // Delete product-company relationships
  await ProductCompany.deleteMany({ productId: 
    product._id })
  
  // Delete product-vendor relationships
  await ProductVendor.deleteMany({ productId: 
    product._id })
  
  // Delete the product
  await Uniform.deleteOne({ _id: product._id })
}

export async function getProductById(productId: string): Promise<any | null> {
  try {
    await connectDB()
  } catch (error: any) {
    console.error('[getProductById] Database connection error:', error.message)
    return null
  }
  
  try {
    if (!productId) {
      console.warn('[getProductById] No productId provided.')
      return null
    }
    
    // Try finding by the 'id' field (string ID) first
    let product = await Uniform.findOne({ id: productId })
      .populate('vendorId', 'id name')
      .lean() as any

    // Removed ObjectId fallback - all products should use string IDs
    
    if (!product) {
      console.warn(`[getProductById] No product found for ID: ${productId}`)
      return null
    }
    
    const plain = toPlainObject(product)
    // Explicitly preserve attribute fields
    const productAny = product as any
    if (productAny.attribute1_name !== undefined) plain.attribute1_name = productAny.attribute1_name
    if (productAny.attribute1_value !== undefined) plain.attribute1_value = productAny.attribute1_value
    if (productAny.attribute2_name !== undefined) plain.attribute2_name = productAny.attribute2_name
    if (productAny.attribute2_value !== undefined) plain.attribute2_value = productAny.attribute2_value
    if (productAny.attribute3_name !== undefined) plain.attribute3_name = productAny.attribute3_name
    if (productAny.attribute3_value !== undefined) plain.attribute3_value = productAny.attribute3_value
    
    return plain
  } catch (error: any) {
    console.error('[getProductById] Error:', error.message)
    return null
  }
}

// ========== VENDOR FUNCTIONS ==========

export async function getAllVendors(): Promise<any[]> {
  try {
    await connectDB()
  } catch (error: any) {
    console.error('[getAllVendors] Database connection error:', error.message)
    return []
  }
  
  try {
    const vendors = await Vendor.find().lean() as any
    return vendors.map((v: any) => toPlainObject(v))
  } catch (error: any) {
    console.error('[getAllVendors] Error:', error.message)
    return []
  }
}

export async function getVendorById(vendorId: string): Promise<any | null> {
  try {
    await connectDB()
  } catch (error: any) {
    console.error('[getVendorById] Database connection error:', error.message)
    return null
  }
  
  try {
    const vendor = await Vendor.findOne({ id: vendorId }).lean() as any
    return vendor ? toPlainObject(vendor) : null
  } catch (error: any) {
    console.error('[getVendorById] Error:', error.message)
    return null
  }
}

export async function getVendorByEmail(email: string): Promise<any | null> {
  try {
    await connectDB()
  } catch (error: any) {
    console.error('[getVendorByEmail] Database connection error:', error.message)
    return null
  }
  
  try {
    console.log(`[getVendorByEmail] ========================================`)
  console.log(`[getVendorByEmail] 🚀 LOOKING UP VENDOR BY EMAIL`)
  console.log(`[getVendorByEmail] Input email: "${email}"`)
  console.log(`[getVendorByEmail] Input type: ${typeof email}`)
  
  if (!email) {
    console.log(`[getVendorByEmail] ❌ Email is empty, returning null`)
    return null
  }
  
  const normalizedEmail = email.trim().toLowerCase()
  console.log(`[getVendorByEmail] Normalized email: "${normalizedEmail}"`)
  
  // Try case-insensitive search using regex
  console.log(`[getVendorByEmail] 🔍 Attempting regex search...`)
  let vendor = await Vendor.findOne({ 
    email: { $regex: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
  }).lean() as any
  
  if (vendor) {
    const vendorAny = vendor as any
    console.log(`[getVendorByEmail] ✅ Found vendor via regex: ${vendorAny.name} (id: ${vendorAny.id}, _id: ${vendorAny._id?.toString()})`)
    console.log(`[getVendorByEmail] Vendor email in DB: "${vendorAny.email}"`)
  } else {
    console.log(`[getVendorByEmail] ⚠️ Regex search returned no results, trying manual comparison...`)
    
    // If not found, try fetching all and comparing (fallback)
    const allVendors = await Vendor.find({}).lean() as any
    console.log(`[getVendorByEmail] Fetched ${allVendors.length} vendor(s) for manual comparison`)
    
    for (const v of allVendors) {
      const vEmailNormalized = v.email ? v.email.trim().toLowerCase() : ''
      console.log(`[getVendorByEmail]   Comparing: "${vEmailNormalized}" with "${normalizedEmail}"`)
      if (vEmailNormalized === normalizedEmail) {
        vendor = v
        const vendorAny = vendor as any
        console.log(`[getVendorByEmail] ✅ Found vendor via manual comparison: ${vendorAny.name} (id: ${vendorAny.id}, _id: ${vendorAny._id?.toString()})`)
        break
      }
    }
    
    if (!vendor) {
      console.log(`[getVendorByEmail] ❌ Vendor not found for email: "${email}"`)
      console.log(`[getVendorByEmail] Available vendor emails:`, allVendors.map((v: any) => v.email || 'N/A'))
    }
  }
  
    const result = vendor ? toPlainObject(vendor) : null
    if (result) {
      console.log(`[getVendorByEmail] ✅ Returning vendor: ${result.name} (id: ${result.id})`)
    } else {
      console.log(`[getVendorByEmail] ❌ Returning null (vendor not found)`)
    }
    console.log(`[getVendorByEmail] ========================================`)
    
    return result
  } catch (error: any) {
    console.error('[getVendorByEmail] Error:', error.message)
    return null
  }
}

export async function createVendor(vendorData: {
  name: string
  email: string
  phone: string
  logo: string
  website: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  theme?: 'light' | 'dark' | 'custom'
}): Promise<any> {
  await connectDB()
  
  // Check if email already exists
  const existingByEmail = await Vendor.findOne({ email: vendorData.email })
  if (existingByEmail) {
    throw new Error(`Vendor with email already exists: ${vendorData.email}`)
  }
  
  // Generate next 6-digit numeric vendor ID
  // Find the highest existing vendor ID
  let nextVendorId = 100001
  const existingVendors = await Vendor.find({})
    .sort({ id: -1 })
    .limit(1)
    .lean() as any
  
  if (existingVendors.length > 0) {
    const lastId = existingVendors[0].id
    // Extract numeric part if it's already numeric
    if (/^\d{6}$/.test(lastId)) {
      const lastIdNum = parseInt(lastId, 10)
      nextVendorId = lastIdNum + 1
    } else {
      // If old format exists, start from 100001
      nextVendorId = 100001
    }
  }
  
  // Ensure it's 6 digits
  let vendorId = String(nextVendorId).padStart(6, '0')
  
  // Check if this ID already exists (shouldn't happen, but safety check)
  const existingById = await Vendor.findOne({ id: vendorId })
  if (existingById) {
    // Find next available ID
    let foundId = false
    for (let i = nextVendorId + 1; i < 999999; i++) {
      const testId = String(i).padStart(6, '0')
      const exists = await Vendor.findOne({ id: testId })
      if (!exists) {
        vendorId = testId
        foundId = true
        break
      }
    }
    if (!foundId) {
      throw new Error('Unable to generate unique vendor ID')
    }
  }
  
  const vendorDataToCreate: any = {
    id: vendorId,
    name: vendorData.name,
    email: vendorData.email,
    phone: vendorData.phone,
    logo: vendorData.logo,
    website: vendorData.website,
    primaryColor: vendorData.primaryColor,
    secondaryColor: vendorData.secondaryColor,
    accentColor: vendorData.accentColor,
    theme: vendorData.theme || 'light',
  }
  
  const newVendor = await Vendor.create(vendorDataToCreate)
  return toPlainObject(newVendor)
}

export async function updateVendor(vendorId: string, vendorData: {
  name?: string
  email?: string
  phone?: string
  logo?: string
  website?: string
  primaryColor?: string
  secondaryColor?: string
  accentColor?: string
  theme?: 'light' | 'dark' | 'custom'
}): Promise<any> {
  await connectDB()
  
  console.log(`[updateVendor] Starting update for vendorId: ${vendorId}`)
  console.log(`[updateVendor] Update data:`, vendorData)
  
  // Find vendor by id field (not _id)
  let vendor = await Vendor.findOne({ id: vendorId })
  
  // Removed ObjectId fallback - all vendors should use string IDs
  
  if (!vendor) {
    // List available vendors for debugging
    const allVendors = await Vendor.find({}, 'id name').limit(5).lean() as any
    console.error(`[updateVendor] Vendor not found. Available vendor IDs: ${availableIds || 'none'}`)
    throw new Error(`Vendor not found with id: ${vendorId}`)
  }
  
  console.log(`[updateVendor] Vendor found:`, {
    id: 
    vendor.id,
    name: 
    vendor.name,
    id: 
    vendor.id
  })
  
  // If email is being updated, check if it conflicts with another vendor
  if (vendorData.email && vendorData.email !== vendor.email) {
    const existingByEmail = await Vendor.findOne({ email: vendorData.email })
    if (existingByEmail && existingByEmail.id !== vendorId && existingByEmail._id.toString() !== vendor._id.toString()) {
      throw new Error(`Vendor with email already exists: ${vendorData.email}`)
    }
  }
  
  // Build update object with only provided fields
  const updateData: any = {}
  if (vendorData.name !== undefined) updateData.name = vendorData.name
  if (vendorData.email !== undefined) updateData.email = vendorData.email
  if (vendorData.phone !== undefined) updateData.phone = vendorData.phone
  if (vendorData.logo !== undefined) updateData.logo = vendorData.logo
  if (vendorData.website !== undefined) updateData.website = vendorData.website
  if (vendorData.primaryColor !== undefined) updateData.primaryColor = vendorData.primaryColor
  if (vendorData.secondaryColor !== undefined) updateData.secondaryColor = vendorData.secondaryColor
  if (vendorData.accentColor !== undefined) updateData.accentColor = vendorData.accentColor
  if (vendorData.theme !== undefined) updateData.theme = vendorData.theme
  
  console.log(`[updateVendor] Update data to apply:`, updateData)
  console.log(`[updateVendor] Query filter: { _id: ${
    vendor._id.toString()} }`)
  
  // Use findOneAndUpdate to avoid _id lookup issues
  // Use id field instead of _id for the query to be more reliable
  let updatedVendor
  try {
    updatedVendor = await Vendor.findOneAndUpdate(
      { id: vendorId }, // Use id field for query (more reliable)
      { $set: updateData },
      { new: true, runValidators: true }
    )
    
    console.log(`[updateVendor] findOneAndUpdate result:`, updatedVendor ? 'Success' : 'Null')
  } catch (updateError: any) {
    console.error(`[updateVendor] Error during findOneAndUpdate:`, {
      error: updateError.message,
      stack: updateError.stack,
      vendorId,
      vendor_id: 
    vendor._id.toString()
    })
    throw new Error(`Failed to update vendor: ${updateError.message}`)
  }
  
  if (!updatedVendor) {
    // Try alternative approach: update the document directly
    console.log(`[updateVendor] findOneAndUpdate returned null, trying direct update`)
    try {
      // Update fields directly on the vendor document
      Object.assign(vendor, updateData)
      await 
    vendor.save()
      updatedVendor = vendor
      console.log(`[updateVendor] Direct save successful`)
    } catch (saveError: any) {
      console.error(`[updateVendor] Direct save also failed:`, {
        error: saveError.message,
        stack: saveError.stack
      })
      throw new Error(`Failed to update vendor with id: ${vendorId}. Error: ${saveError.message}`)
    }
  }
  
  console.log(`[updateVendor] ✅ Update successful for vendor ${vendorId}`)
  return toPlainObject(updatedVendor)
}

// ========== COMPANY FUNCTIONS ==========

export async function createCompany(companyData: {
  name: string
  logo: string
  website: string
  primaryColor: string
  secondaryColor?: string
  showPrices?: boolean
  allowPersonalPayments?: boolean
}): Promise<any> {
  await connectDB()
  
  // Check if company name already exists
  const existingByName = await Company.findOne({ name: companyData.name })
  if (existingByName) {
    throw new Error(`Company with name already exists: ${companyData.name}`)
  }
  
  // Generate next 6-digit numeric company ID (starting from 100001)
  let nextCompanyId = 100001
  const existingCompanies = await Company.find({})
    .sort({ id: -1 })
    .limit(1)
    .lean() as any
  
  if (existingCompanies.length > 0) {
    const lastId = existingCompanies[0].id
    if (/^\d{6}$/.test(String(lastId))) {
      const lastIdNum = parseInt(String(lastId), 10)
      if (lastIdNum >= 100001 && lastIdNum < 200000) {
        nextCompanyId = lastIdNum + 1
      }
    }
  }
  
  let companyId = String(nextCompanyId).padStart(6, '0')
  
  // Check if this ID already exists (safety check)
  const existingById = await Company.findOne({ id: companyId })
  if (existingById) {
    // Find next available ID
    for (let i = nextCompanyId + 1; i < 200000; i++) {
      const testId = String(i).padStart(6, '0')
      const exists = await Company.findOne({ id: testId })
      if (!exists) {
        companyId = testId
        break
      }
    }
  }
  
  const companyDataToCreate: any = {
    id: companyId,
    name: companyData.name,
    logo: companyData.logo,
    website: companyData.website,
    primaryColor: companyData.primaryColor,
    secondaryColor: companyData.secondaryColor || '#f76b1c',
    showPrices: companyData.showPrices || false,
    allowPersonalPayments: companyData.allowPersonalPayments || false,
  }
  
  const newCompany = await Company.create(companyDataToCreate)
  return toPlainObject(newCompany)
}

export async function getAllCompanies(): Promise<any[]> {
  await connectDB()
  
  const companies = await Company.find()
    .populate('adminId', 'id employeeId firstName lastName email')
    .lean() as any
  
  return companies.map((c: any) => {
    const plain = toPlainObject(c)
    // Preserve _id for ObjectId matching (needed for companyId conversion)
    if (c._id) {
      plain._id = c._id.toString()
    }
    return plain
  })
}

// ========== LOCATION FUNCTIONS ==========

/**
 * Create a new Location
 * @param locationData Location data including companyId and adminId (required)
 * @returns Created location object
 */
export async function createLocation(locationData: {
  name: string
  companyId: string // Company ID (6-digit numeric string)
  adminId?: string // Employee ID (6-digit numeric string) - Location Admin (optional)
  address_line_1: string
  address_line_2?: string
  address_line_3?: string
  city: string
  state: string
  pincode: string
  country?: string
  phone?: string
  email?: string
  status?: 'active' | 'inactive'
}): Promise<any> {
  await connectDB()
  
  // Find company by ID
  const company = await Company.findOne({ id: locationData.companyId })
  if (!company) {
    throw new Error(`Company not found: ${locationData.companyId}`)
  }
  
  // Find employee (Location Admin) by employeeId if provided
  let adminEmployee = null
  if (locationData.adminId) {
    adminEmployee = await Employee.findOne({ employeeId: locationData.adminId })
    if (!adminEmployee) {
      console.warn(`[createLocation] Employee not found for Location Admin: ${locationData.adminId}`)
      throw new Error(`Employee not found for Location Admin: ${locationData.adminId}`) // Keep as error - invalid input
    }
    
    // Verify employee belongs to the same company
    const employeeCompanyId = typeof adminEmployee.companyId === 'object' && adminEmployee.companyId?.id
      ? adminEmployee.companyId.id
      : (await Company.findOne({ id: String(adminEmployee.companyId) }))?.id
    
    if (employeeCompanyId !== locationData.companyId) {
      throw new Error(`Employee ${locationData.adminId} does not belong to company ${locationData.companyId}`)
    }
  }
  
  // Check if location name already exists for this company
  const existingLocation = await Location.findOne({ 
    companyId: 
    company._id, 
    name: locationData.name.trim() 
  })
  if (existingLocation) {
    throw new Error(`Location with name "${locationData.name}" already exists for this company`)
  }
  
  // Generate next 6-digit numeric location ID (starting from 400001)
  let nextLocationId = 400001
  const existingLocations = await Location.find({})
    .sort({ id: -1 })
    .limit(1)
    .lean() as any
  
  if (existingLocations.length > 0) {
    const lastId = existingLocations[0].id
    if (/^\d{6}$/.test(String(lastId))) {
      const lastIdNum = parseInt(String(lastId), 10)
      if (lastIdNum >= 400001 && lastIdNum < 500000) {
        nextLocationId = lastIdNum + 1
      }
    }
  }
  
  let locationId = String(nextLocationId).padStart(6, '0')
  
  // Check if this ID already exists (safety check)
  const existingById = await Location.findOne({ id: locationId })
  if (existingById) {
    // Find next available ID
    for (let i = nextLocationId + 1; i < 500000; i++) {
      const testId = String(i).padStart(6, '0')
      const exists = await Location.findOne({ id: testId })
      if (!exists) {
        locationId = testId
        break
      }
    }
  }
  
  // Create location with structured address fields
  const locationDataToCreate: any = {
    id: locationId,
    name: locationData.name.trim(),
    companyId: 
    company._id,
    address_line_1: locationData.address_line_1.trim(),
    address_line_2: locationData.address_line_2?.trim(),
    address_line_3: locationData.address_line_3?.trim(),
    city: locationData.city.trim(),
    state: locationData.state.trim(),
    pincode: locationData.pincode.trim(),
    country: locationData.country?.trim() || 'India',
    status: locationData.status || 'active',
  }
  
  // Add adminId if provided
  if (adminEmployee) {
    locationDataToCreate.adminId = adminEmployee._id
  }
  
  // Add optional fields
  if (locationData.phone) locationDataToCreate.phone = locationData.phone.trim()
  if (locationData.email) locationDataToCreate.email = locationData.email.trim()
  
  const newLocation = await Location.create(locationDataToCreate)
  
  // Create LocationAdmin relationship if admin exists
  if (adminEmployee) {
    // Use employee.id (6-digit numeric string) instead of ObjectId
    const employeeIdString = adminEmployee.id || adminEmployee.employeeId
    if (!employeeIdString) {
      console.warn(`[createLocation] Admin employee ${adminEmployee._id} has no id or employeeId field`)
    } else {
      await LocationAdmin.findOneAndUpdate(
        { locationId: newLocation.id, employeeId: employeeIdString },
        { locationId: newLocation.id, employeeId: employeeIdString },
        { upsert: true }
      )
    }
  }
  
  // Populate and return
  const populated = await Location.findOne({ id: String(newLocation.id) })
    .populate('companyId', 'id name')
    .populate('adminId', 'id employeeId firstName lastName email')
    .lean() as any
  
}

/**
 * Get all locations for a company
 * @param companyId Company ID (6-digit numeric string)
 * @returns Array of locations
 */
export async function getLocationsByCompany(companyId: string): Promise<any[]> {
  try {
    await connectDB()
  } catch (error: any) {
    console.error('[getLocationsByCompany] Database connection error:', error.message)
    return []
  }
  
  try {
    const company = await Company.findOne({ id: companyId }).lean() as any
    if (!company) {
      return []
    }
  
    const locations = await Location.find({ companyId: (company as any).id })
      .populate('companyId', 'id name')
      .populate('adminId', 'id employeeId firstName lastName email')
      .sort({ name: 1 })
      .lean() as any
    
    return locations.map((l: any) => toPlainObject(l))
  } catch (error: any) {
    console.error('[getLocationsByCompany] Error:', error.message)
    return []
  }
}

/**
 * Get location by ID
 * @param locationId Location ID (6-digit numeric string)
 * @returns Location object or null
 */
export async function getLocationById(locationId: string): Promise<any | null> {
  try {
    await connectDB()
  } catch (error: any) {
    console.error('[getLocationById] Database connection error:', error.message)
    return null
  }
  
  try {
    // Normalize and validate
    const normalizedId = String(locationId)
    if (!/^\d{6}$/.test(normalizedId)) {
      console.warn(`[getLocationById] Invalid locationId format: ${normalizedId}`)
      return null
    }
    
    const location = await Location.findOne({ id: normalizedId }).lean() as any
    
    if (!location) {
      return null
    }
    
    // Manual join for companyId
    if ((location as any).companyId) {
      const company = await Company.findOne({ id: (location as any).companyId }).lean() as any
      if (company) {
        (location as any).companyId = toPlainObject(company)
      }
    }
    
    // Manual join for adminId
    if ((location as any).adminId) {
      const admin = await Employee.findOne({ id: (location as any).adminId }).lean() as any
      if (admin) {
        (location as any).adminId = toPlainObject(admin)
      }
    }
    
    return toPlainObject(location)
  } catch (error: any) {
    console.error('[getLocationById] Error:', error.message)
    return null
  }
}

/**
 * Update location
 * @param locationId Location ID
 * @param updateData Fields to update
 * @returns Updated location
 */
export async function updateLocation(
  locationId: string,
  updateData: {
    name?: string
    adminId?: string // New Location Admin employee ID
    address_line_1?: string
    address_line_2?: string
    address_line_3?: string
    city?: string
    state?: string
    pincode?: string
    country?: string
    phone?: string
    email?: string
    status?: 'active' | 'inactive'
  }
): Promise<any> {
  await connectDB()
  
  const location = await Location.findOne({ id: locationId })
  if (!location) {
    console.warn(`[updateLocation] Location not found: ${locationId}`);
    return null // Return null instead of throwing - let API route handle 404
  }
  
  // If updating admin (including removal)
  if (updateData.adminId !== undefined) {
      if (updateData.adminId) {
        // Assign new admin - populate companyId to ensure we can compare
        const newAdmin = await Employee.findOne({ employeeId: updateData.adminId })
          .populate('companyId', 'id name')
        if (!newAdmin) {
          throw new Error(`Employee not found: ${updateData.adminId}`)
        }
        
        // Verify employee belongs to same company as location
        // Extract location's company ID
        // Note: (location as any).companyId is NOT populated, so it's an ObjectId
        let locationCompanyId: string | null = null
        if ((location as any).companyId) {
          // (location as any).companyId is an ObjectId (not populated), so fetch the company
          const locationCompany = await Company.findOne({ id: String((location as any).companyId) }).select('id').lean() as any
          if (locationCompany) {
            locationCompanyId = (locationCompany as any).id
          }
        }
        
        if (!locationCompanyId) {
          throw new Error(`Location ${locationId} has no associated company`)
        }
        
        // Extract employee's company ID
        // Note: newAdmin.companyId is populated, so it should be an object with id property
        let employeeCompanyId: string | null = null
        if (newAdmin.companyId) {
          if (typeof newAdmin.companyId === 'object') {
            // Populated: { _id: ObjectId, id: '100004', name: '...' }
            if (newAdmin.companyId.id) {
              employeeCompanyId = newAdmin.companyId.id
            } else {
              // Populated but id field missing - try to fetch by string ID
              const employeeCompany = await Company.findOne({ id: String((newAdmin.companyId as any).id || newAdmin.companyId) }).select('id').lean() as any
              if (employeeCompany && employeeCompany.id) {
                employeeCompanyId = employeeCompany.id
              }
            }
          } else if (typeof newAdmin.companyId === 'string') {
            // Not populated: string ID - fetch company
            const employeeCompany = await Company.findOne({ id: newAdmin.companyId }).select('id').lean() as any
            if (employeeCompany && employeeCompany.id) {
              employeeCompanyId = employeeCompany.id
            }
          }
        }
        
        if (!employeeCompanyId) {
          throw new Error(`Employee ${updateData.adminId} has no associated company`)
        }
        
        console.log(`[updateLocation] Company ID comparison: locationCompanyId=${locationCompanyId}, employeeCompanyId=${employeeCompanyId}`)
        
        if (!locationCompanyId || !employeeCompanyId || employeeCompanyId !== locationCompanyId) {
          throw new Error(`Employee ${updateData.adminId} does not belong to location's company. Location company: ${locationCompanyId}, Employee company: ${employeeCompanyId}`)
        }
        
        // Update adminId - use string ID
        (location as any).adminId = String((newAdmin as any).id || (newAdmin as any).employeeId)
        
        // Update LocationAdmin relationship (remove old, add new)
        // Use employee.id (6-digit numeric string) instead of ObjectId
        const employeeIdString = (newAdmin as any).id || (newAdmin as any).employeeId
      if (!employeeIdString) {
        console.warn(`[updateLocation] Admin employee has no id or employeeId field`)
      } else {
        await LocationAdmin.findOneAndDelete({ locationId: location.id })
        await LocationAdmin.create({
          locationId: location.id,
          employeeId: employeeIdString
        })
      }
    } else {
      // Remove admin (adminId is null/undefined/empty string)
      // Set to null explicitly so Mongoose will update the field
      (location as any).adminId = null as any
      // Remove LocationAdmin relationship (safe - won't error if record doesn't exist)
      try {
        const deleted = await LocationAdmin.findOneAndDelete({ locationId: location.id })
        if (!deleted) {
          // LocationAdmin record might not exist, which is fine
          console.log('LocationAdmin record not found for deletion (this is OK):', location.id)
        }
      } catch (error: any) {
        // Log but don't fail - LocationAdmin deletion is not critical
        console.error('Error deleting LocationAdmin record (non-critical):', error.message)
      }
    }
  }
  
  // Update other fields
  const locationDoc = location as any
  if (updateData.name !== undefined) locationDoc.name = updateData.name.trim()
  if (updateData.address_line_1 !== undefined) locationDoc.address_line_1 = updateData.address_line_1.trim()
  if (updateData.address_line_2 !== undefined) locationDoc.address_line_2 = updateData.address_line_2?.trim()
  if (updateData.address_line_3 !== undefined) locationDoc.address_line_3 = updateData.address_line_3?.trim()
  if (updateData.city !== undefined) locationDoc.city = updateData.city.trim()
  if (updateData.state !== undefined) locationDoc.state = updateData.state.trim()
  if (updateData.pincode !== undefined) locationDoc.pincode = updateData.pincode.trim()
  if (updateData.country !== undefined) locationDoc.country = updateData.country.trim()
  if (updateData.phone !== undefined) locationDoc.phone = updateData.phone?.trim()
  if (updateData.email !== undefined) locationDoc.email = updateData.email?.trim()
  if (updateData.status !== undefined) locationDoc.status = updateData.status
  
  await locationDoc.save()
  
  // Populate and return
  const populated = await Location.findOne({ id: String(locationDoc.id) })
    .populate('companyId', 'id name')
    .populate('adminId', 'id employeeId firstName lastName email')
    .lean() as any
  
  return toPlainObject(populated)
}

/**
 * Delete location
 * @param locationId Location ID
 * @returns Success status
 */
export async function deleteLocation(locationId: string): Promise<void> {
  await connectDB()
  
  const location = await Location.findOne({ id: locationId })
  if (!location) {
    console.warn(`[deleteLocation] Location not found: ${locationId}`);
    return // Return void instead of null
  }
  
  // Check if any employees are assigned to this location
  const employeesWithLocation = await Employee.countDocuments({ locationId: 
    location.id })
  if (employeesWithLocation > 0) {
    throw new Error(`Cannot delete location: ${employeesWithLocation} employee(s) are assigned to this location`)
  }
  
  // Delete LocationAdmin relationships
  await LocationAdmin.deleteMany({ locationId: 
    location.id })
  
  // Delete location
  await Location.deleteOne({ id: 
    location.id })
}

/**
 * Get all locations (for Super Admin)
 * @returns Array of all locations
 */
export async function getAllLocations(): Promise<any[]> {
  await connectDB()
  
  const locations = await Location.find({})
    .populate('companyId', 'id name')
    .populate('adminId', 'id employeeId firstName lastName email')
    .sort({ companyId: 1, name: 1 })
    .lean() as any
  
  return locations.map((l: any) => toPlainObject(l))
}

export async function getCompanyById(companyId: string | number): Promise<any | null> {
  await connectDB()
  
  // Convert companyId to number if it's a string representation of a number
  let numericCompanyId: number | null = null
  if (typeof companyId === 'string') {
    const parsed = Number(companyId)
    if (!isNaN(parsed) && isFinite(parsed)) {
      numericCompanyId = parsed
    }
  } else if (typeof companyId === 'number') {
    numericCompanyId = companyId
  }
  
  // Find company by numeric ID first (since company.id is now numeric)
  // Explicitly select all fields including enableEmployeeOrder, allowLocationAdminViewFeedback, allowEligibilityConsumptionReset, and workflow fields
  let company = null
  if (numericCompanyId !== null) {
    company = await Company.findOne({ id: numericCompanyId })
      .select('id name logo website primaryColor secondaryColor showPrices allowPersonalPayments allowPersonalAddressDelivery enableEmployeeOrder allowLocationAdminViewFeedback allowEligibilityConsumptionReset enable_pr_po_workflow enable_site_admin_pr_approval require_company_admin_po_approval allow_multi_pr_po enable_site_admin_approval require_company_admin_approval adminId createdAt updatedAt')
      .populate('adminId', 'id employeeId firstName lastName email')
      .lean() as any
  
  // If not found by numeric ID, try as string ID (for backward compatibility)
  if (!company && typeof companyId === 'string') {
    company = await Company.findOne({ id: companyId })
      .select('id name logo website primaryColor secondaryColor showPrices allowPersonalPayments allowPersonalAddressDelivery enableEmployeeOrder allowLocationAdminViewFeedback allowEligibilityConsumptionReset enable_pr_po_workflow enable_site_admin_pr_approval require_company_admin_po_approval allow_multi_pr_po enable_site_admin_approval require_company_admin_approval adminId createdAt updatedAt')
      .lean() as any
    
    // Manual join for adminId
    if (company && (company as any).adminId) {
      const admin = await Employee.findOne({ id: (company as any).adminId }).lean() as any
      if (admin) {
        (company as any).adminId = toPlainObject(admin)
      }
    }
   
  return company ? toPlainObject(company) : null
}
  }
}
export async function updateCompanySettings(
  companyId: string,
  settings: { 
    showPrices?: boolean
    allowPersonalPayments?: boolean
    enableEmployeeOrder?: boolean
    allowLocationAdminViewFeedback?: boolean
    allowEligibilityConsumptionReset?: boolean
    logo?: string
    primaryColor?: string
    secondaryColor?: string
    name?: string
    // PR → PO Workflow Configuration
    enable_pr_po_workflow?: boolean
    enable_site_admin_pr_approval?: boolean
    require_company_admin_po_approval?: boolean
    allow_multi_pr_po?: boolean
    // Shipping Configuration
    shipmentRequestMode?: 'MANUAL' | 'AUTOMATIC'
  }
): Promise<any> {
  await connectDB()
  
  // Try to find company by numeric ID (string or number)
  let company = null
  const numericId = typeof companyId === 'string' ? Number(companyId) : companyId
  if (!isNaN(numericId) && isFinite(numericId)) {
    company = await Company.findOne({ id: String(numericId) })
  }
  
  // If not found, try as string ID
  if (!company) {
    company = await Company.findOne({ id: companyId })
  }
  
  if (!company) {
    console.warn(`[updateCompanySettings] Company not found for ID: ${companyId} (type: ${typeof companyId})`)
    return // Return null instead of throwing - let API route handle 404
  }
  
  if (settings.showPrices !== undefined) {
    company.showPrices = settings.showPrices
  }
  
  if (settings.allowPersonalPayments !== undefined) {
    company.allowPersonalPayments = settings.allowPersonalPayments
  }
  
  if (settings.enableEmployeeOrder !== undefined) {
    // Explicitly set the field to ensure it's saved to database (even if false)
    console.log(`[updateCompanySettings] Setting enableEmployeeOrder to: ${settings.enableEmployeeOrder} (type: ${typeof settings.enableEmployeeOrder})`)
    const boolValue = Boolean(settings.enableEmployeeOrder) // Ensure it's a boolean
    company.enableEmployeeOrder = boolValue
    // Mark the field as modified to ensure Mongoose saves it
    company.markModified('enableEmployeeOrder')
    // Also explicitly set it using set() to ensure it's tracked
    company.set('enableEmployeeOrder', boolValue)
    console.log(`[updateCompanySettings] After setting - 
    company.enableEmployeeOrder=${company.enableEmployeeOrder}, type=${typeof 
    company.enableEmployeeOrder}`)
  } else {
    console.log(`[updateCompanySettings] enableEmployeeOrder is undefined in settings`)
  }
  
  if (settings.allowLocationAdminViewFeedback !== undefined) {
    const boolValue = Boolean(settings.allowLocationAdminViewFeedback)
    company.allowLocationAdminViewFeedback = boolValue
    company.markModified('allowLocationAdminViewFeedback')
    company.set('allowLocationAdminViewFeedback', boolValue)
  }
  
  if (settings.allowEligibilityConsumptionReset !== undefined) {
    const boolValue = Boolean(settings.allowEligibilityConsumptionReset)
    company.allowEligibilityConsumptionReset = boolValue
    company.markModified('allowEligibilityConsumptionReset')
    company.set('allowEligibilityConsumptionReset', boolValue)
  }
  
  if (settings.logo !== undefined) {
    company.logo = settings.logo
  }
  
  if (settings.primaryColor !== undefined) {
    company.primaryColor = settings.primaryColor
  }
  
  if (settings.secondaryColor !== undefined) {
    company.secondaryColor = settings.secondaryColor
  }
  
  if (settings.name !== undefined) {
    company.name = settings.name
  }
  
  // PR → PO Workflow Configuration
  if (settings.enable_pr_po_workflow !== undefined) {
    const boolValue = Boolean(settings.enable_pr_po_workflow)
    company.enable_pr_po_workflow = boolValue
    company.markModified('enable_pr_po_workflow')
    company.set('enable_pr_po_workflow', boolValue)
  }
  
  if (settings.enable_site_admin_pr_approval !== undefined) {
    const boolValue = Boolean(settings.enable_site_admin_pr_approval)
    company.enable_site_admin_pr_approval = boolValue
    company.markModified('enable_site_admin_pr_approval')
    company.set('enable_site_admin_pr_approval', boolValue)
    // Sync to deprecated field for backward compatibility
    company.enable_site_admin_approval = boolValue
  }
  
  if (settings.require_company_admin_po_approval !== undefined) {
    const boolValue = Boolean(settings.require_company_admin_po_approval)
    company.require_company_admin_po_approval = boolValue
    company.markModified('require_company_admin_po_approval')
    company.set('require_company_admin_po_approval', boolValue)
    // Sync to deprecated field for backward compatibility
    company.require_company_admin_approval = boolValue
  }
  
  if (settings.allow_multi_pr_po !== undefined) {
    const boolValue = Boolean(settings.allow_multi_pr_po)
    company.allow_multi_pr_po = boolValue
    company.markModified('allow_multi_pr_po')
    company.set('allow_multi_pr_po', boolValue)
  }
  
  // Shipping Configuration
  if (settings.shipmentRequestMode !== undefined) {
    if (settings.shipmentRequestMode !== 'MANUAL' && settings.shipmentRequestMode !== 'AUTOMATIC') {
      throw new Error('shipmentRequestMode must be either MANUAL or AUTOMATIC')
    }
    company.shipmentRequestMode = settings.shipmentRequestMode
    company.markModified('shipmentRequestMode')
    company.set('shipmentRequestMode', settings.shipmentRequestMode)
  }
  
  // Log before save
  console.log(`[updateCompanySettings] Before save - 
    company.enableEmployeeOrder=${company.enableEmployeeOrder}, type=${typeof 
    company.enableEmployeeOrder}`)
  console.log(`[updateCompanySettings] Company document _id: ${company._id}, id: ${company.id}`)
  
  // Save the company - explicitly save to ensure enableEmployeeOrder is persisted
  // Use updateOne with raw MongoDB if save fails (fallback)
  try {
  await 
    company.save({ validateBeforeSave: true })
  } catch (saveError: any) {
    console.error(`[updateCompanySettings] Error saving company document:`, saveError)
    // Fallback: Use raw MongoDB updateOne
    const db = mongoose.connection.db
       if (!db) {
    throw new Error('Database connection not available')
  }
  if (db) {
      const queryId = !isNaN(numericId) && isFinite(numericId) ? String(numericId) : companyId
      const updateResult = await db.collection('companies').updateOne(
        { id: queryId },
        { 
          $set: {
            ...(settings.showPrices !== undefined && { showPrices: settings.showPrices }),
            ...(settings.allowPersonalPayments !== undefined && { allowPersonalPayments: settings.allowPersonalPayments }),
            ...(settings.enableEmployeeOrder !== undefined && { enableEmployeeOrder: settings.enableEmployeeOrder }),
            ...(settings.allowLocationAdminViewFeedback !== undefined && { allowLocationAdminViewFeedback: settings.allowLocationAdminViewFeedback }),
            ...(settings.allowEligibilityConsumptionReset !== undefined && { allowEligibilityConsumptionReset: settings.allowEligibilityConsumptionReset }),
            ...(settings.logo !== undefined && { logo: settings.logo }),
            ...(settings.primaryColor !== undefined && { primaryColor: settings.primaryColor }),
            ...(settings.secondaryColor !== undefined && { secondaryColor: settings.secondaryColor }),
            ...(settings.name !== undefined && { name: settings.name }),
            ...(settings.enable_pr_po_workflow !== undefined && { enable_pr_po_workflow: settings.enable_pr_po_workflow }),
            ...(settings.enable_site_admin_pr_approval !== undefined && { 
              enable_site_admin_pr_approval: settings.enable_site_admin_pr_approval,
              enable_site_admin_approval: settings.enable_site_admin_pr_approval // Sync deprecated field
            }),
            ...(settings.require_company_admin_po_approval !== undefined && { 
              require_company_admin_po_approval: settings.require_company_admin_po_approval,
              require_company_admin_approval: settings.require_company_admin_po_approval // Sync deprecated field
            }),
            ...(settings.allow_multi_pr_po !== undefined && { allow_multi_pr_po: settings.allow_multi_pr_po }),
          }
        }
      )
      if (updateResult.matchedCount === 0) {
        console.warn(`[updateCompanySettings] Company not found for update: ${companyId}`)
        return null // Return null instead of throwing - let API route handle 404
      }
      console.log(`[updateCompanySettings] Updated company using raw MongoDB updateOne`)
    } else {
      throw saveError
    }
  }
  
  // Verify the save by checking the database directly using raw MongoDB query
  const db = mongoose.connection.db
     if (!db) {
    throw new Error('Database connection not available')
  }
  let rawDbValue: boolean | null = null
  if (db) {
    // Use the same ID format we used to find the company
    const queryId = !isNaN(numericId) && isFinite(numericId) ? String(numericId) : companyId
    const rawCompany = await db.collection('companies').findOne({ id: queryId })
    rawDbValue = rawCompany?.enableEmployeeOrder !== undefined ? Boolean(rawCompany.enableEmployeeOrder) : null
    console.log(`[updateCompanySettings] Raw DB value after save - enableEmployeeOrder=${rawDbValue}, type=${typeof rawDbValue}, exists=${rawCompany?.enableEmployeeOrder !== undefined}`)
  }
  
  console.log(`[updateCompanySettings] After save - 
    company.enableEmployeeOrder=${company.enableEmployeeOrder}`)
  
  // Fetch the updated company using Mongoose document (not lean) to ensure all fields are included
  // Then convert to plain object
  // Use the same ID format we used to find the company
  let updatedDoc = null
  const queryId = !isNaN(numericId) && isFinite(numericId) ? String(numericId) : companyId
  updatedDoc = await Company.findOne({ id: queryId })
    .select('id name logo website primaryColor secondaryColor showPrices allowPersonalPayments allowPersonalAddressDelivery enableEmployeeOrder allowLocationAdminViewFeedback allowEligibilityConsumptionReset enable_pr_po_workflow enable_site_admin_pr_approval require_company_admin_po_approval allow_multi_pr_po adminId createdAt updatedAt')
  
  // If not found, try with original companyId
  if (!updatedDoc) {
    updatedDoc = await Company.findOne({ id: companyId })
      .select('id name logo website primaryColor secondaryColor showPrices allowPersonalPayments allowPersonalAddressDelivery enableEmployeeOrder allowLocationAdminViewFeedback allowEligibilityConsumptionReset enable_pr_po_workflow enable_site_admin_pr_approval require_company_admin_po_approval allow_multi_pr_po adminId createdAt updatedAt')
  }
  
  if (!updatedDoc) {
    // Fallback: try to use the saved company directly (convert to plain object)
    const savedPlain = company.toObject ? 
    company.toObject() : company
    console.log(`[updateCompanySettings] Using saved company directly, enableEmployeeOrder=${savedPlain.enableEmployeeOrder}`)
    return toPlainObject(savedPlain)
  }
  
  // Convert Mongoose document to plain object - this ensures enableEmployeeOrder is included
  const updated = updatedDoc.toObject ? updatedDoc.toObject() : updatedDoc
  
  // CRITICAL FIX: Override with raw database value if available (raw DB is source of truth)
  // This ensures we use the actual database value, not Mongoose's interpretation
  if (rawDbValue !== null && rawDbValue !== undefined) {
    updated.enableEmployeeOrder = Boolean(rawDbValue)
    console.log(`[updateCompanySettings] Overriding Mongoose value with raw DB value: enableEmployeeOrder=${rawDbValue}`)
  }
  
  // Log the value to verify it's being read correctly
  console.log(`[updateCompanySettings] Final company ${companyId}, enableEmployeeOrder=${updated.enableEmployeeOrder}, type=${typeof updated.enableEmployeeOrder}`)
  console.log(`[updateCompanySettings] Updated object keys:`, Object.keys(updated))
  console.log(`[updateCompanySettings] Updated object enableEmployeeOrder property:`, 'enableEmployeeOrder' in updated)
  
  // Double-check by querying raw MongoDB (reuse existing db variable)
  if (db) {
    const rawCheck = await db.collection('companies').findOne({ id: companyId })
    console.log(`[updateCompanySettings] Final raw DB check - enableEmployeeOrder=${rawCheck?.enableEmployeeOrder}, type=${typeof rawCheck?.enableEmployeeOrder}`)
  }
  
  const plainObj = toPlainObject(updated)
  console.log(`[updateCompanySettings] After toPlainObject - enableEmployeeOrder=${plainObj.enableEmployeeOrder}, type=${typeof plainObj.enableEmployeeOrder}`)
  
  return plainObj
}

// ========== BRANCH FUNCTIONS ==========

export async function getAllBranches(): Promise<any[]> {
  await connectDB()
  
  const branches = await Branch.find()
    .populate('companyId', 'id name')
    .populate('adminId', 'id employeeId firstName lastName email designation')
    .lean() as any
  
  return branches.map((b: any) => toPlainObject(b))
}

export async function getBranchById(branchId: string): Promise<any | null> {
  try {
    await connectDB()
  } catch (error: any) {
    console.error('[getBranchById] Database connection error:', error.message)
    return null
  }
  
  try {
    const branch = await Branch.findOne({ id: branchId })
      .populate('companyId', 'id name')
      .populate('adminId', 'id employeeId firstName lastName email designation')
      .lean() as any
    
    return branch ? toPlainObject(branch) : null
  } catch (error: any) {
    console.error('[getBranchById] Error:', error.message)
    return null
  }
}

export async function getBranchesByCompany(companyId: string): Promise<any[]> {
  try {
    await connectDB()
  } catch (error: any) {
    console.error('[getBranchesByCompany] Database connection error:', error.message)
    return []
  }
  
  try {
    const company = await Company.findOne({ id: companyId })
    if (!company) return []

    const branches = await Branch.find({ companyId: company.id })
      .populate('companyId', 'id name')
      .populate('adminId', 'id employeeId firstName lastName email designation')
      .lean() as any

    return branches.map((b: any) => toPlainObject(b))
  } catch (error: any) {
    console.error('[getBranchesByCompany] Error:', error.message)
    return []
  }
}

export async function getEmployeesByBranch(branchId: string): Promise<any[]> {
  try {
    await connectDB()
  } catch (error: any) {
    console.error('[getEmployeesByBranch] Database connection error:', error.message)
    return []
  }
  
  try {
    const branch = await Branch.findOne({ id: branchId })
    if (!branch) return []

    const employees = await Employee.find({ branchId: branch.id })
      .populate('companyId', 'id name')
      .populate({
        path: 'branchId',
        select: 'id name address_line_1 city state pincode',
        strictPopulate: false
      })
      .lean() as any

    return employees.map((e: any) => toPlainObject(e))
  } catch (error: any) {
    console.error('[getEmployeesByBranch] Error:', error.message)
    return []
  }
}

/**
 * Create a new branch
 * @param branchData Branch data including structured address fields
 * @returns Created branch
 */
export async function createBranch(branchData: {
  name: string
  companyId: string // Company ID (6-digit numeric string)
  adminId?: string // Employee ID (6-digit numeric string) - Branch Admin (optional)
  address_line_1: string
  address_line_2?: string
  address_line_3?: string
  city: string
  state: string
  pincode: string
  country?: string
  phone?: string
  email?: string
  status?: 'active' | 'inactive'
}): Promise<any> {
  await connectDB()
  
  // Find company by ID
  const company = await Company.findOne({ id: branchData.companyId })
  if (!company) {
    console.warn(`[createBranch] Company not found: ${branchData.companyId}`)
    throw new Error(`Company not found: ${branchData.companyId}`) // Keep as error - invalid input
  }
  
  // Find employee (Branch Admin) by employeeId if provided
  let adminEmployee = null
  if (branchData.adminId) {
    adminEmployee = await Employee.findOne({ employeeId: branchData.adminId })
    if (!adminEmployee) {
      throw new Error(`Employee not found for Branch Admin: ${branchData.adminId}`)
    }
    
    // Verify employee belongs to the same company
    const employeeCompanyId = typeof adminEmployee.companyId === 'object' && adminEmployee.companyId?.id
      ? adminEmployee.companyId.id
      : (await Company.findOne({ id: String(adminEmployee.companyId) }))?.id
    
    if (employeeCompanyId !== branchData.companyId) {
      throw new Error(`Employee ${branchData.adminId} does not belong to company ${branchData.companyId}`)
    }
  }
  
  // Generate next 6-digit numeric branch ID
  let nextBranchId = 200001
  const existingBranches = await Branch.find({})
    .sort({ id: -1 })
    .limit(1)
    .lean() as any
  
  if (existingBranches.length > 0) {
    const lastId = existingBranches[0].id
    if (/^\d{6}$/.test(String(lastId))) {
      const lastIdNum = parseInt(String(lastId), 10)
      if (lastIdNum >= 200001) {
        nextBranchId = lastIdNum + 1
      }
    }
  }
  
  let branchId = String(nextBranchId).padStart(6, '0')
  
  // Check if this ID already exists (safety check)
  const existingById = await Branch.findOne({ id: branchId })
  if (existingById) {
    // Find next available ID
    for (let i = nextBranchId + 1; i < 300000; i++) {
      const testId = String(i).padStart(6, '0')
      const exists = await Branch.findOne({ id: testId })
      if (!exists) {
        branchId = testId
        break
      }
    }
  }
  
  // Create branch with structured address fields
  const branchDataToCreate: any = {
    id: branchId,
    name: branchData.name.trim(),
    companyId: company._id,
    address_line_1: branchData.address_line_1.trim(),
    address_line_2: branchData.address_line_2?.trim(),
    address_line_3: branchData.address_line_3?.trim(),
    city: branchData.city.trim(),
    state: branchData.state.trim(),
    pincode: branchData.pincode.trim(),
    country: branchData.country?.trim() || 'India',
    status: branchData.status || 'active',
  }
  
  // Add optional fields
  if (branchData.phone) branchDataToCreate.phone = branchData.phone.trim()
  if (branchData.email) branchDataToCreate.email = branchData.email.trim()
  
  // Add adminId if provided
  if (adminEmployee) {
    branchDataToCreate.adminId = adminEmployee._id
  }
  
  const newBranch = await Branch.create(branchDataToCreate)
  
  // Populate and return
  const populated = await Branch.findOne({ id: String(newBranch.id) })
    .populate('companyId', 'id name')
    .populate('adminId', 'id employeeId firstName lastName email designation')
    .lean() as any
  
  return populated ? toPlainObject(populated) : null
}

/**
 * Update branch
 * @param branchId Branch ID
 * @param updateData Fields to update
 * @returns Updated branch
 */
export async function updateBranch(
  branchId: string,
  updateData: {
    name?: string
    adminId?: string // New Branch Admin employee ID
    address_line_1?: string
    address_line_2?: string
    address_line_3?: string
    city?: string
    state?: string
    pincode?: string
    country?: string
    phone?: string
    email?: string
    status?: 'active' | 'inactive'
  }
): Promise<any> {
  await connectDB()
  
  const branch = await Branch.findOne({ id: branchId })
  if (!branch) {
    console.warn(`[updateBranch] Branch not found: ${branchId}`)
    return null // Return null instead of throwing - let API route handle 404
  }
  
  // Update name if provided
  if (updateData.name !== undefined) {
    branch.name = updateData.name.trim()
  }
  
  // Update address fields if provided
  if (updateData.address_line_1 !== undefined) {
    branch.address_line_1 = updateData.address_line_1.trim()
  }
  if (updateData.address_line_2 !== undefined) {
    branch.address_line_2 = updateData.address_line_2?.trim()
  }
  if (updateData.address_line_3 !== undefined) {
    branch.address_line_3 = updateData.address_line_3?.trim()
  }
  if (updateData.city !== undefined) {
    branch.city = updateData.city.trim()
  }
  if (updateData.state !== undefined) {
    branch.state = updateData.state.trim()
  }
  if (updateData.pincode !== undefined) {
    branch.pincode = updateData.pincode.trim()
  }
  if (updateData.country !== undefined) {
    branch.country = updateData.country.trim()
  }
  
  // Update optional fields
  if (updateData.phone !== undefined) {
    branch.phone = updateData.phone?.trim()
  }
  if (updateData.email !== undefined) {
    branch.email = updateData.email?.trim()
  }
  if (updateData.status !== undefined) {
    branch.status = updateData.status
  }
  
  // Update admin if provided
  if (updateData.adminId !== undefined) {
    if (updateData.adminId) {
      const adminEmployee = await Employee.findOne({ employeeId: updateData.adminId })
      if (!adminEmployee) {
        throw new Error(`Employee not found for Branch Admin: ${updateData.adminId}`)
      }
      
      // Verify employee belongs to the same company
      const employeeCompanyId = typeof adminEmployee.companyId === 'object' && adminEmployee.companyId?.id
        ? adminEmployee.companyId.id
        : (await Company.findOne({ id: String(adminEmployee.companyId) }))?.id
      
      const branchCompanyId = typeof branch.companyId === 'object' && branch.companyId?.id
        ? branch.companyId.id
        : (await Company.findOne({ id: String(branch.companyId) }))?.id
      
      if (employeeCompanyId !== branchCompanyId) {
        throw new Error(`Employee ${updateData.adminId} does not belong to branch's company`)
      }
      
      branch.adminId = adminEmployee._id
    } else {
      branch.adminId = undefined
    }
  }
  
  await branch.save()
  
  // Populate and return
  const updated = await Branch.findOne({ id: String(branch.id) })
    .populate('companyId', 'id name')
    .populate('adminId', 'id employeeId firstName lastName email designation')
    .lean() as any
  
  return updated ? toPlainObject(updated) : null
}

/**
 * Delete branch
 * @param branchId Branch ID
 * @returns true if deleted
 */
export async function deleteBranch(branchId: string): Promise<boolean> {
  await connectDB()
  
  const branch = await Branch.findOne({ id: branchId })
  if (!branch) {
    console.warn(`[updateBranch] Branch not found: ${branchId}`)
    return false // Return null instead of throwing - let API route handle 404
  }
  
  await Branch.deleteOne({ id: branchId })
  return true
}

// ========== COMPANY ADMIN FUNCTIONS (Multiple Admins) ==========

export async function addCompanyAdmin(companyId: string, employeeId: string, canApproveOrders: boolean = false): Promise<void> {
  await connectDB()
  
  const company = await Company.findOne({ id: companyId })
  if (!company) {
    throw new Error(`Company not found: ${companyId}`)
  }
  
  // Try multiple lookup methods to find the employee
  let employee: any = null
  
  // Method 1: Try by id field (most common)
  employee = await Employee.findOne({ id: employeeId }).populate('companyId')
  
  // Method 2: If not found, try by employeeId field (business ID like "IND-001")
  if (!employee) {
    employee = await Employee.findOne({ employeeId: employeeId }).populate('companyId')
  }
  
  // Removed ObjectId fallback - all employees should use string IDs
  
  // Method 4: If still not found and employeeId looks like an email, try by email (with encryption handling)
  if (!employee && employeeId.includes('@')) {
    const { encrypt, decrypt } = require('../utils/encryption')
    // Normalize email: trim and lowercase for consistent comparison (same as login flow)
    const normalizedEmail = employeeId.trim().toLowerCase()
    
    console.log(`[addCompanyAdmin] Looking up employee by email: ${normalizedEmail}`)
    
    try {
      // Try encrypted email lookup (email should be encrypted in DB)
      const encryptedEmail = encrypt(normalizedEmail)
      employee = await Employee.findOne({ email: encryptedEmail }).populate('companyId')
      if (employee) {
        console.log(`[addCompanyAdmin] ✅ Found employee via encrypted email lookup`)
      }
    } catch (error) {
      console.warn(`[addCompanyAdmin] Encryption failed, trying decryption matching:`, error)
    }
    
    // If not found with encrypted lookup, try decryption matching (handles different encryption formats)
    if (!employee) {
      const allEmployees = await Employee.find({ companyId: 
    company._id }).populate('companyId').lean() as any
      for (const emp of allEmployees) {
        if (emp.email && typeof emp.email === 'string') {
          try {
            const decryptedEmail = decrypt(emp.email)
            // Normalize both for comparison (case-insensitive)
            if (decryptedEmail && decryptedEmail.trim().toLowerCase() === normalizedEmail) {
              console.log(`[addCompanyAdmin] ✅ Found employee via decryption: ${decryptedEmail}`)
              employee = await Employee.findOne({ id: String(emp.id || emp.employeeId) }).populate('companyId')
              break
            }
          } catch (error) {
            // Skip employees with decryption errors
            continue
          }
        }
      }
    }
  }
  
  if (!employee) {
    throw new Error(`Employee not found: ${employeeId}. Please ensure the employee exists and belongs to the company.`)
  }
  
  // Verify employee belongs to this company
  // First, try to get the raw companyId without population
  let employeeRaw = await Employee.findOne({ 
    $or: [
      { id: employeeId },
      { employeeId: employeeId }
    ]
  }).lean() as any
  if (!employeeRaw) {
    throw new Error(`Employee not found: ${employeeId}`);
  }
  
  // Extract raw companyId from employee
  const employeeCompanyIdRaw = employeeRaw.companyId;
  
  // Normalize both IDs as strings
  const employeeCompanyIdStr = employeeCompanyIdRaw ? employeeCompanyIdRaw.toString() : null;
  const companyIdStr = company.id;
  
  console.log(
    `[addCompanyAdmin] Debug - Employee: ${employeeId}, Employee companyId: ${employeeCompanyIdStr}, Company id: ${companyIdStr}`
  );
  
  // Verify employee belongs to company
  if (!employeeCompanyIdStr || employeeCompanyIdStr !== companyIdStr) {
    const employeeDisplayId = employeeRaw.employeeId || employeeRaw.id || employeeId;
    throw new Error(
      `Employee ${employeeDisplayId} does not belong to company ${companyId} (${company.name}).`
    );
  }
  
  // DB Connection
  const db = mongoose.connection.db;
  
  if (!db) {
    throw new Error("Database connection not available");
  }
  
  // Remove any existing admin record
  await db.collection("companyadmins").deleteMany({
    companyId: company._id,
    employeeId: employee._id,
  });
  
  // Insert new admin record
  const adminRecord = await db.collection("companyadmins").insertOne({
    companyId: company._id,
    employeeId: employee._id,
    canApproveOrders,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  
  // Confirm record exists
  if (!adminRecord.insertedId) {
    throw new Error(`Failed to create admin record for employee ${employeeId}`);
  }
  
  // Verify stored record
  const verifyRecord = await db
    .collection("companyadmins")
    .findOne({ _id: adminRecord.insertedId });
  
  if (!verifyRecord) {
    throw new Error(`Admin record was created but cannot be found: ${adminRecord.insertedId}`);
  }
  
  console.log(
    `[addCompanyAdmin] Verified admin record. employeeId: ${verifyRecord.employeeId?.toString()}`
  );
  
  console.log(
    `Successfully added employee ${employeeId} (${employee.id || employee._id}) as admin for company ${companyId} (canApproveOrders: ${canApproveOrders})`
  );
  
  // End of addCompanyAdmin function
  }
  
  
  
  // ========== REMOVE COMPANY ADMIN ==========
  export async function removeCompanyAdmin(
    companyId: string,
    employeeId: string
  ): Promise<void> {
    await connectDB();
  
    if (!employeeId) {
      throw new Error("Employee ID is required");
    }
  
    const company = await Company.findOne({ id: companyId });
  
    if (!company) {
      throw new Error(`Company not found: ${companyId}`);
    }
  
    // Find employee by either id or employeeId
    let employee: any =
      (await Employee.findOne({ id: employeeId })) ||
      (await Employee.findOne({ employeeId }));
  
    if (!employee) {
      throw new Error(`Employee not found: ${employeeId}`);
    }
  
    // Attempt direct delete
    let result = await CompanyAdmin.findOneAndDelete({
      companyId: company._id,
      employeeId: employee._id,
    });
  
    // If not found, fallback through manual comparison
    if (!result) {
      const allAdmins = await CompanyAdmin.find({ companyId: company._id }).lean();
  
      for (const adm of allAdmins) {
        const admCompanyIdStr = adm.companyId?.toString();
        const admEmployeeIdStr = adm.employeeId?.toString();
        const targetEmployeeIdStr = employee._id.toString();
  
        if (admCompanyIdStr === companyId && admEmployeeIdStr === targetEmployeeIdStr) {
          result = await CompanyAdmin.findByIdAndDelete(adm._id);
          break;
        }
      }
    }
  
    // Final fallback
    if (!result) {
      const populatedAdmins = await CompanyAdmin.find({ companyId: company._id })
        .populate("employeeId", "id employeeId")
        .lean();
  
      for (const adm of populatedAdmins) {
        if (adm.employeeId?.id === employeeId || adm.employeeId?.employeeId === employeeId) {
          result = await CompanyAdmin.findByIdAndDelete(adm._id);
          break;
        }
      }
    }
  
    if (!result) {
      throw new Error(`Admin relationship not found for employee ${employeeId} (${employee.id || employee.employeeId}) in company ${companyId}`)
    }
  }


export async function updateCompanyAdminPrivileges(companyId: string, employeeId: string, canApproveOrders: boolean): Promise<void> {
  await connectDB()
  
  if (!employeeId) {
    throw new Error('Employee ID is required')
  }
  
  const company = await Company.findOne({ id: companyId })
  if (!company) {
    throw new Error(`Company not found: ${companyId}`)
  }
  
  // Try multiple lookup methods to find the employee
  let employee: any = null
  
  // Method 1: Try by id field (most common)
  employee = await Employee.findOne({ id: employeeId })
  
  // Method 2: If not found, try by employeeId field (business ID like "IND-001")
  if (!employee) {
    employee = await Employee.findOne({ employeeId: employeeId })
  }
  
  // Removed ObjectId fallback - all employees should use string IDs
  
  if (!employee) {
    throw new Error(`Employee not found: ${employeeId}`)
  }
  
  const admin = await CompanyAdmin.findOne({
    companyId: 
    company._id,
    employeeId: 
    employee._id,
  })
  
  if (!admin) {
    throw new Error(`Employee ${employeeId} is not an admin of company ${companyId}`)
  }
  
  admin.canApproveOrders = canApproveOrders
  await admin.save()
  
  console.log(`Successfully updated admin privileges for ${employeeId} (${
    employee.id || 
    employee.employeeId}) in company ${companyId}`)
}

export async function getCompanyAdmins(companyId: string): Promise<any[]> {
  try {
    await connectDB()
  } catch (error: any) {
    console.error('[getCompanyAdmins] Database connection error:', error.message)
    return []
  }
  
  try {
  await connectDB()
  
  const company = await Company.findOne({ id: companyId })
  if (!company) {
    console.log(`[getCompanyAdmins] Company ${companyId} not found, returning empty array`)
    return []
  }
  
  const admins = await CompanyAdmin.find({ companyId: company._id })
    .populate({
      path: 'employeeId',
      select: 'id employeeId firstName lastName email',
      model: 'Employee'
    })
    .lean() as any
  
  if (admins.length > 0) {
    console.log(`[getCompanyAdmins] Admin employeeIds (raw):`, admins.map((a: any) => ({
      employeeId: a.employeeId,
      isNull: a.employeeId === null,
      isObject: typeof a.employeeId === 'object',
      populated: a.employeeId?.employeeId || 'N/A'
    })))
  }
  
  // Filter out admins with null or invalid employeeId
  // Also manually populate if populate failed
  const validAdmins = []
  const { decrypt } = require('../utils/encryption')
  
  for (const admin of admins) {
    if (!admin.employeeId) {
      console.log(`[getCompanyAdmins] Admin has null employeeId, trying manual lookup:`, admin._id)
      // Use raw MongoDB collection to get the actual ObjectId
      const db = mongoose.connection.db
         if (!db) {
    throw new Error('Database connection not available')
  }
  const rawAdmin = await db.collection('companyadmins').findOne({ _id: admin._id })
      if (rawAdmin && rawAdmin.employeeId) {
        console.log(`[getCompanyAdmins] Raw admin employeeId:`, rawAdmin.employeeId, 'type:', typeof rawAdmin.employeeId)
        
        // Convert employeeId to string for reliable comparison
        const employeeIdStr = rawAdmin.employeeId.toString()
        
        // Find all employees and match by string comparison (more reliable than direct ObjectId query)
        const allEmployees = await db.collection('employees').find({}).toArray()
        const employee = allEmployees.find((e: any) => e._id.toString() === employeeIdStr)
        
        if (employee) {
          console.log(`[getCompanyAdmins] Found employee via string matching: ${employee.employeeId || employee.id || employee._id}`)
          // Convert to format expected by the rest of the code
          admin.employeeId = {
            _id: 
    employee._id,
            id: 
    employee.id || 
    employee._id.toString(),
            employeeId: 
    employee.employeeId,
            firstName: 
    employee.firstName,
            lastName: 
    employee.lastName,
            email: 
    employee.email,
            companyName: 
    employee.companyName
          }
          validAdmins.push(admin)
          console.log(`[getCompanyAdmins] Manually populated employee: ${
    employee.employeeId || 
    employee.id || 
    employee._id}`)
        } else {
          console.log(`[getCompanyAdmins] Employee not found for admin:`, admin._id, 'employeeId:', employeeIdStr)
          // Don't delete - the employee might exist but lookup is failing
          console.log(`[getCompanyAdmins] Keeping admin record - employee lookup failed but record exists`)
        }
      } else {
        console.log(`[getCompanyAdmins] Filtering out admin with null employeeId:`, admin._id)
      }
      continue
    }
    
    // If populated, check if employee exists and has required fields
    if (typeof admin.employeeId === 'object') {
      if (!admin.employeeId._id && !admin.employeeId.id && !admin.employeeId.employeeId) {
        console.log(`[getCompanyAdmins] Invalid populated employee, trying manual lookup:`, admin._id)
        // Try manual lookup using raw collection
        const db = mongoose.connection.db
           if (!db) {
    throw new Error('Database connection not available')
  }
  const rawAdmin = await db.collection('companyadmins').findOne({ _id: admin._id })
        if (rawAdmin && rawAdmin.employeeId) {
          let employee = await Employee.findOne({ id: String(rawAdmin.employeeId) })
            .select('id employeeId firstName lastName email')
            .lean() as any
          
          if (!employee) {
            const employeeByMongoId = await db.collection('employees').findOne({ _id: rawAdmin.employeeId })
            if (employeeByMongoId) {
              employee = employeeByMongoId
            }
          }
          
          if (employee) {
            admin.employeeId = employee
            validAdmins.push(admin)
            console.log(`[getCompanyAdmins] Manually populated employee: ${employee.employeeId || employee.id || 
    employee._id}`)
            continue
          }
        }
        console.log(`[getCompanyAdmins] Filtering out admin with invalid populated employee:`, admin._id)
        continue
      }
    }
    
    validAdmins.push(admin)
  }
  
  console.log(`[getCompanyAdmins] Valid admins after filtering: ${validAdmins.length}`)
  
  // Decrypt employee data and format properly
  const formattedAdmins = validAdmins.map((admin: any) => {
    const adminObj: any = {
      employeeId: admin.employeeId?._id?.toString() || admin.employeeId?.toString() || admin.employeeId,
      canApproveOrders: admin.canApproveOrders || false,
      companyId: admin.companyId?.toString() || admin.companyId,
    }
    
    // If employee is populated, decrypt and add employee data
    if (admin.employeeId && typeof admin.employeeId === 'object') {
      const emp = admin.employeeId
      const sensitiveFields = ['email', 'firstName', 'lastName']
      
      adminObj.employee = {
        id: emp.id,
        employeeId: emp.employeeId,
        email: emp.email || '',
        firstName: emp.firstName || '',
        lastName: emp.lastName || '',
        companyName: emp.companyName || ''
      }
      
      // Decrypt sensitive fields
      for (const field of sensitiveFields) {
        if (adminObj.employee[field] && typeof adminObj.employee[field] === 'string' && adminObj.employee[field].includes(':')) {
          try {
            adminObj.employee[field] = decrypt(adminObj.employee[field])
          } catch (error) {
            // Keep original if decryption fails
            console.warn(`Failed to decrypt ${field} for employee ${emp.id}:`, error)
          }
        }
      }
    }
    
    return adminObj
  })
  
    return formattedAdmins
  } catch (error: any) {
    console.error('[getCompanyAdmins] Error:', error.message)
    return []
  }
}

export async function isCompanyAdmin(email: string, companyId: string): Promise<boolean> {
  await connectDB()
  
  // Since email is encrypted, we need to find employee by decrypting
  const { encrypt, decrypt } = require('../utils/encryption')
  // Normalize email: trim and lowercase (same as login flow)
  const normalizedEmail = email.trim().toLowerCase()
  let encryptedEmail: string
  
  try {
    encryptedEmail = encrypt(normalizedEmail)
  } catch (error) {
    console.warn('[isCompanyAdmin] Encryption failed:', error)
    encryptedEmail = ''
  }
  
  // Try finding with encrypted email first
  let employee = await Employee.findOne({ email: encryptedEmail }).lean() as any
  
  // If not found, try decryption matching
  if (!employee && encryptedEmail) {
    const allEmployees = await Employee.find({}).lean() as any
    for (const emp of allEmployees) {
      if (emp.email && typeof emp.email === 'string') {
        try {
          const decryptedEmail = decrypt(emp.email)
          // Normalize both for comparison (case-insensitive)
          if (decryptedEmail && decryptedEmail.trim().toLowerCase() === normalizedEmail) {
            employee = emp
            break
          }
        } catch (error) {
          continue
        }
      }
    }
  }
  
  if (!employee) {
    console.warn('[isCompanyAdmin] Employee not found for email:', normalizedEmail)
    return false
  }
  
  const company = await Company.findOne({ id: companyId })
  if (!company) {
    console.warn('[isCompanyAdmin] Company not found:', companyId)
    return false
  }
  
  // Use raw MongoDB collection for reliable lookup
  const db = mongoose.connection.db
    if (!db) {
    throw new Error('Database connection not available')
  }
   if (!db) {
    console.error('[isCompanyAdmin] Database connection not available')
    return false
  }
  
  // Ensure we have proper ObjectIds
  const employeeObjectId = employee._id instanceof mongoose.Types.ObjectId 
    ? 
    employee._id 
    : new mongoose.Types.ObjectId(employee._id)
  const companyObjectId = company._id instanceof mongoose.Types.ObjectId 
    ? 
    company._id 
    : new mongoose.Types.ObjectId(company._id)
  
  console.log('[isCompanyAdmin] Looking up admin record:', {
    email: normalizedEmail,
    companyIdString: companyId,
    employeeId: 
    employeeObjectId.toString(),
    employeeObjectIdType: 
    employeeObjectId.constructor.name,
    companyObjectId: companyObjectId.toString(),
    companyObjectIdType: companyObjectId.constructor.name,
    companyName: 
    company.name
  })
  
  // Try using CompanyAdmin model first (more reliable) - Mongoose handles ObjectId conversion
  const CompanyAdmin = require('../models/CompanyAdmin').default
  let admin = await CompanyAdmin.findOne({
    companyId: companyObjectId,
    employeeId: employeeObjectId
  }).lean() as any
  
  if (admin) {
    console.log('[isCompanyAdmin] ✅ Found admin via CompanyAdmin model:', {
      adminId: admin._id?.toString(),
      employeeId: admin.employeeId?.toString(),
      companyId: admin.companyId?.toString()
    })
    return true
  }
  
  console.log('[isCompanyAdmin] Not found via CompanyAdmin model, trying raw MongoDB query...')
  
  // Fallback to raw MongoDB collection lookup with proper ObjectId comparison
  // Use MongoDB query with ObjectId for reliable matching
  const adminRecord = await db.collection('companyadmins').findOne({
    companyId: companyObjectId,
    employeeId: employeeObjectId
  })
  
  if (adminRecord) {
    console.log('[isCompanyAdmin] ✅ Found admin via raw MongoDB query:', {
      adminId: adminRecord._id?.toString(),
      employeeId: adminRecord.employeeId?.toString(),
      companyId: 
    adminRecord.companyId?.toString()
    })
    return true
  }
  
  // Additional fallback: Get all admins for this company and check employeeId
  // The issue: companyadmins stores ObjectIds (hexadecimal), but we need to match them correctly
  // Get all admins for this company using ObjectId
  const allCompanyAdmins = await db.collection('companyadmins').find({
    companyId: companyObjectId
  }).toArray()
  
  console.log('[isCompanyAdmin] Total admins for company:', allCompanyAdmins.length)
  
  if (allCompanyAdmins.length > 0) {
    console.log('[isCompanyAdmin] Sample admin record:', {
      firstAdmin: {
        _id: allCompanyAdmins[0]._id?.toString(),
        employeeId: allCompanyAdmins[0].employeeId?.toString(),
        employeeIdType: allCompanyAdmins[0].employeeId?.constructor?.name,
        companyId: allCompanyAdmins[0].companyId?.toString(),
        companyIdType: allCompanyAdmins[0].companyId?.constructor?.name
      },
      searchingFor: {
        employeeId: 
    employeeObjectId.toString(),
        employeeIdType: 
    employeeObjectId.constructor.name,
        companyId: companyObjectId.toString(),
        companyIdType: companyObjectId.constructor.name
      }
    })
  }
  
  // Try string comparison - convert both to strings for reliable matching
  const employeeIdStr = employeeObjectId.toString()
  const companyIdStr = companyObjectId.toString()
  
  // Also try to match by employee numeric ID if ObjectId doesn't match
  // Some records might have been created with mismatched ObjectIds
  const employeeNumericId = employee.id || 
    employee.employeeId
  const companyNumericId = company.id
  
  console.log('[isCompanyAdmin] Trying multiple matching strategies:', {
    employeeObjectIdStr: employeeIdStr,
    employeeNumericId: employeeNumericId,
    companyObjectIdStr: companyIdStr,
    companyNumericId: companyNumericId
  })
  
  // Strategy 1: Try direct ObjectId string comparison first (fastest)
  admin = allCompanyAdmins.find((a: any) => {
    if (!a.employeeId || !a.companyId) return false
    
    const aEmployeeIdStr = a.employeeId.toString()
    const aCompanyIdStr = a.companyId.toString()
    
    // Direct ObjectId string comparison
    if (aEmployeeIdStr === employeeIdStr && aCompanyIdStr === companyIdStr) {
      console.log('[isCompanyAdmin] ✅ Found admin via ObjectId string comparison:', {
        adminId: a._id?.toString(),
        employeeId: aEmployeeIdStr,
        companyId: aCompanyIdStr
      })
      return true
    }
    
    return false
  })
  
  // Strategy 2: If ObjectId match failed, try matching by numeric IDs
  // This handles cases where companyadmins has ObjectIds that don't match the current employee/company ObjectIds
  // but the numeric IDs do match
  if (!admin) {
    // Check all admins in parallel by looking up their employees/companies
    const adminChecks = allCompanyAdmins.map(async (a: any) => {
      if (!a.employeeId || !a.companyId) return null
      
      try {
        // Find the employee and company by their string IDs stored in companyadmins
        const [storedEmployee, storedCompany] = await Promise.all([
          Employee.findOne({ id: String(a.employeeId) }).lean() as any,
          Company.findOne({ id: String(a.companyId) }).lean() as any
        ])
        
        if (storedEmployee && storedCompany) {
          const storedEmployeeNumericId = storedEmployee.id || storedEmployee.employeeId
          const storedCompanyNumericId = storedCompany.id
          
          // Check if numeric IDs match
          if (storedEmployeeNumericId === employeeNumericId && storedCompanyNumericId === companyNumericId) {
            console.log('[isCompanyAdmin] ✅ Found admin via numeric ID match:', {
              adminId: a._id?.toString(),
              storedEmployeeObjectId: a.employeeId.toString(),
              storedEmployeeNumericId,
              searchingEmployeeNumericId: employeeNumericId,
              storedCompanyNumericId,
              searchingCompanyNumericId: companyNumericId
            })
            return a
          }
        }
      } catch (error) {
        // Error finding employee/company, skip this admin
      }
      
      return null
    })
    
    const adminResults = await Promise.all(adminChecks)
    admin = adminResults.find((a: any) => a !== null) || undefined
  }
  
  const isAdmin = !!admin
  console.log('[isCompanyAdmin] Final result:', {
    email: normalizedEmail,
    companyIdString: companyId,
    employeeId: employeeIdStr,
    companyObjectId: companyIdStr,
    foundAdmin: !!admin,
    isAdmin,
    allCompanyAdminsCount: allCompanyAdmins.length
  })
  
  if (!isAdmin) {
    // Log all admins for this company to help debug
    console.log('[isCompanyAdmin] Admins for this company:', allCompanyAdmins.map((a: any) => ({
      adminId: a._id?.toString(),
      employeeId: a.employeeId?.toString(),
      employeeIdType: a.employeeId?.constructor?.name,
      matchesEmployee: a.employeeId?.toString() === employeeIdStr,
      companyId: a.companyId?.toString(),
      companyIdType: a.companyId?.constructor?.name
    })))
  }
  
  return isAdmin
}

export async function canApproveOrders(email: string, companyId: string): Promise<boolean> {
  await connectDB()
  
  // Since email is encrypted, we need to find employee by decrypting
  const { encrypt, decrypt } = require('../utils/encryption')
  const trimmedEmail = email.trim()
  let encryptedEmail: string
  
  try {
    encryptedEmail = encrypt(trimmedEmail)
  } catch (error) {
    encryptedEmail = ''
  }
  
  // Try finding with encrypted email first
  let employee = await Employee.findOne({ email: encryptedEmail }).lean() as any
  
  // If not found, try decryption matching
  if (!employee && encryptedEmail) {
    const allEmployees = await Employee.find({}).lean() as any
    for (const emp of allEmployees) {
      if (emp.email && typeof emp.email === 'string') {
        try {
          const decryptedEmail = decrypt(emp.email)
          if (decryptedEmail.toLowerCase() === trimmedEmail.toLowerCase()) {
            employee = emp
            break
          }
        } catch (error) {
          continue
        }
      }
    }
  }
  
  if (!employee) {
    return false
  }
  
  const company = await Company.findOne({ id: companyId })
  if (!company) {
    return false
  }
  
  // Use raw MongoDB collection for reliable lookup (similar to isCompanyAdmin)
  const db = mongoose.connection.db
    if (!db) {
    throw new Error('Database connection not available')
  }
   if (!db) {
    // Fallback to Mongoose if raw DB not available
  const admin = await CompanyAdmin.findOne({
    companyId: 
    company._id,
    employeeId: 
    employee._id,
  })
    return admin?.canApproveOrders || false
  }
  
  const employeeIdStr = (employee._id || employee.id).toString()
  const companyIdStr = company.id
  
  // Find all admins and match by string comparison
  const allAdmins = await db.collection('companyadmins').find({}).toArray()
  const admin = allAdmins.find((a: any) => 
    a.employeeId && 
    a.employeeId.toString() === employeeIdStr &&
    a.companyId &&
    a.companyId.toString() === companyIdStr
  )
  
  return admin?.canApproveOrders || false
}

// ========== BRANCH ADMIN AUTHORIZATION FUNCTIONS ==========

/**
 * Check if an employee is a Branch Admin for a specific branch
 * @param email Employee email
 * @param branchId Branch ID (string)
 * @returns true if employee is Branch Admin for the branch
 */
export async function isBranchAdmin(email: string, branchId: string): Promise<boolean> {
  await connectDB()
  
  // Find employee by email (handle encryption)
  const { encrypt, decrypt } = require('../utils/encryption')
  const trimmedEmail = email.trim()
  let encryptedEmail: string
  
  try {
    encryptedEmail = encrypt(trimmedEmail)
  } catch (error) {
    encryptedEmail = ''
  }
  
  // Try finding with encrypted email first
  let employee = await Employee.findOne({ email: encryptedEmail }).lean() as any
  
  // If not found, try decryption matching
  if (!employee && encryptedEmail) {
    const allEmployees = await Employee.find({}).lean() as any
    for (const emp of allEmployees) {
      if (emp.email && typeof emp.email === 'string') {
        try {
          const decryptedEmail = decrypt(emp.email)
          if (decryptedEmail.toLowerCase() === trimmedEmail.toLowerCase()) {
            employee = emp
            break
          }
        } catch (error) {
          continue
        }
      }
    }
  }
  
  if (!employee) {
    return false
  }
  
  // Find branch
  const Branch = require('../models/Branch').default
  const branch = await Branch.findOne({ id: branchId })
  if (!branch) {
    return false
  }
  
  // Check if employee is the Branch Admin
  const employeeIdStr = (employee._id || employee.id).toString()
  const branchAdminIdStr = branch.adminId?.toString()
  
  return employeeIdStr === branchAdminIdStr
}

/**
 * Get the branch for which an employee is Branch Admin
 * @param email Employee email
 * @returns Branch object if employee is a Branch Admin, null otherwise
 */
export async function getBranchByAdminEmail(email: string): Promise<any | null> {
  await connectDB()
  
  // Find employee by email (handle encryption)
  const { encrypt, decrypt } = require('../utils/encryption')
  const trimmedEmail = email.trim()
  let encryptedEmail: string
  
  try {
    encryptedEmail = encrypt(trimmedEmail)
  } catch (error) {
    encryptedEmail = ''
  }
  
  // Try finding with encrypted email first
  let employee = await Employee.findOne({ email: encryptedEmail }).lean() as any
  
  // If not found, try decryption matching
  if (!employee && encryptedEmail) {
    const allEmployees = await Employee.find({}).lean() as any
    for (const emp of allEmployees) {
      if (emp.email && typeof emp.email === 'string') {
        try {
          const decryptedEmail = decrypt(emp.email)
          if (decryptedEmail.toLowerCase() === trimmedEmail.toLowerCase()) {
            employee = emp
            break
          }
        } catch (error) {
          continue
        }
      }
    }
  }
  
  if (!employee) {
    return null
  }
  
  // Find branch where this employee is admin
  const Branch = require('../models/Branch').default
  const branch = await Branch.findOne({ adminId: employee._id })
    .populate('companyId', 'id name')
    .lean() as any
  
  if (!branch) {
    return null
  }
  
  return toPlainObject(branch)
}

// ========== LOCATION ADMIN AUTHORIZATION FUNCTIONS ==========

/**
 * Check if an employee is a Location Admin for a specific location
 * @param email Employee email
 * @param locationId Location ID (6-digit numeric string)
 * @returns true if employee is Location Admin for the location
 */
export async function isLocationAdmin(email: string, locationId: string): Promise<boolean> {
  await connectDB()
  
  // Find employee by email (handle encryption)
  const { encrypt, decrypt } = require('../utils/encryption')
  const trimmedEmail = email.trim()
  let encryptedEmail: string
  
  try {
    encryptedEmail = encrypt(trimmedEmail)
  } catch (error) {
    encryptedEmail = ''
  }
  
  // Try finding with encrypted email first
  let employee = await Employee.findOne({ email: encryptedEmail }).lean() as any
  
  // If not found, try decryption matching
  if (!employee && encryptedEmail) {
    const allEmployees = await Employee.find({}).lean() as any
    for (const emp of allEmployees) {
      if (emp.email && typeof emp.email === 'string') {
        try {
          const decryptedEmail = decrypt(emp.email)
          if (decryptedEmail.toLowerCase() === trimmedEmail.toLowerCase()) {
            employee = emp
            break
          }
        } catch (error) {
          continue
        }
      }
    }
  }
  
  if (!employee) {
    return false
  }
  
  // Find location
  const location = await Location.findOne({ id: locationId })
  if (!location) {
    return false
  }
  
  // Check if employee is the Location Admin
  const employeeIdStr = (employee._id || employee.id).toString()
  const locationAdminIdStr = (location as any).adminId?.toString()
  
  return employeeIdStr === locationAdminIdStr
}

/**
 * Get the location ID for which an employee is Location Admin
 * @param email Employee email
 * @returns Location ID if employee is a Location Admin, null otherwise
 */
export async function getLocationByAdminEmail(email: string): Promise<any | null> {
  await connectDB()
  
  // Find employee by email (handle encryption)
  const { encrypt, decrypt } = require('../utils/encryption')
  const trimmedEmail = email.trim()
  let encryptedEmail: string
  
  try {
    encryptedEmail = encrypt(trimmedEmail)
  } catch (error) {
    encryptedEmail = ''
  }
  
  // Try finding with encrypted email first
  let employee = await Employee.findOne({ email: encryptedEmail }).lean() as any
  
  // If not found, try decryption matching
  if (!employee && encryptedEmail) {
    const allEmployees = await Employee.find({}).lean() as any
    for (const emp of allEmployees) {
      if (emp.email && typeof emp.email === 'string') {
        try {
          const decryptedEmail = decrypt(emp.email)
          if (decryptedEmail.toLowerCase() === trimmedEmail.toLowerCase()) {
            employee = emp
            break
          }
        } catch (error) {
          continue
        }
      }
    }
  }
  
  if (!employee) {
    return null
  }
  
  // Find location where this employee is admin
  // CRITICAL: Handle both ObjectId and string formats for adminId
  // Some locations may have adminId stored as string (legacy data)
  let location = await Location.findOne({ adminId: 
    employee._id })
    .populate('companyId', 'id name')
    .populate('adminId', 'id employeeId firstName lastName email')
    .lean() as any
  
  if (!location) {
    const adminIdString = employee._id.toString()
    location = await Location.findOne({ adminId: adminIdString })
      .populate('companyId', 'id name')
      .populate('adminId', 'id employeeId firstName lastName email')
      .lean() as any
    
    if (location) {
      console.log(`[getLocationByAdminEmail] ⚠️  Found location with string adminId, fixing to ObjectId format`)
      try {
        await Location.updateOne(
          { id: location.id },
          { $set: { adminId: String(employee.id || employee.employeeId) } }
        )
        console.log(`[getLocationByAdminEmail] ✅ Fixed location ${location.id} adminId format`)
      } catch (error: any) {
        console.error(`[getLocationByAdminEmail] ❌ Error fixing location adminId:`, error.message)
      }
    }
  }
  
  return location ? toPlainObject(location) : null
}

/**
 * Check if an employee is a regular employee (not Company Admin or Location Admin)
 * Used for enableEmployeeOrder enforcement: only regular employees are restricted
 * @param email Employee email
 * @param companyId Company ID (6-digit numeric string)
 * @returns true if employee is a regular employee (not admin)
 */
export async function isRegularEmployee(email: string, companyId: string): Promise<boolean> {
  await connectDB()
  
  // Check if employee is Company Admin
  const isAdmin = await isCompanyAdmin(email, companyId)
  if (isAdmin) {
    return false // Company Admin is not a regular employee
  }
  
  // Check if employee is Location Admin
  const location = await getLocationByAdminEmail(email)
  if (location) {
    return false // Location Admin is not a regular employee
  }
  
  // Check if employee is Branch Admin (if branch functionality exists)
  // Note: Branch functionality may have been replaced by Location, but check for backward compatibility
  try {
    const branch = await getBranchByAdminEmail(email)
    if (branch) {
      return false // Branch Admin is not a regular employee
    }
  } catch (error) {
    // Branch functionality might not exist, ignore
  }
  
  // If not any type of admin, it's a regular employee
  return true
}

/**
 * Verify that an employee belongs to a specific location
 * Used for Location Admin authorization: Location Admin can only manage employees of their location
 * @param employeeId Employee ID (6-digit numeric string)
 * @param locationId Location ID (6-digit numeric string)
 * @returns true if employee belongs to the location
 */
export async function isEmployeeInLocation(employeeId: string, locationId: string): Promise<boolean> {
  await connectDB()
  
  const employee = await Employee.findOne({ employeeId: employeeId })
  if (!employee) {
    return false
  }
  
  const location = await Location.findOne({ id: locationId })
  if (!location) {
    return false
  }
  
  // Check if employee's locationId matches
  if (!employee.locationId) {
    return false // Employee has no location assigned
  }
  
  const employeeLocationIdStr = String(employee.locationId)
  const locationIdStr = String(location.id)
  
  return employeeLocationIdStr === locationIdStr
}

/**
 * Get all employees for a specific location
 * @param locationId Location ID (6-digit numeric string or ObjectId)
 * @returns Array of employees
 */
export async function getEmployeesByLocation(locationId: string): Promise<any[]> {
  try {
    await connectDB()
  } catch (error: any) {
    console.error('[getEmployeesByLocation] Database connection error:', error.message)
    return []
  }
  
  try {
  // Find location by id (string) - locationId is always a 6-digit string like "400006"
  // Do NOT try to use it as ObjectId (_id) as it will cause cast errors
  const location = await Location.findOne({ id: locationId })
  
  if (!location) {
    console.warn(`[getEmployeesByLocation] Location not found: ${locationId}`)
    return []
  }
  
  console.log(`[getEmployeesByLocation] Found location: ${location.id} (${location._id}), name: ${location.name}`)
  console.log(`[getEmployeesByLocation] Location companyId type: ${typeof 
    (location as any).companyId}, value:`, 
    (location as any).companyId)
  
  // Find employees with this locationId (using ObjectId)
  let employees = await Employee.find({ locationId: 
    location._id })
    .populate('companyId', 'id name')
    .populate('locationId', 'id name')
    .sort({ employeeId: 1 })
    .lean() as any
  
  
  // Also try matching by location.id string if employees have locationId populated with id field
  if (employees.length === 0) {
    // Extract companyId ObjectId properly - handle both populated and non-populated cases
    let companyObjectId = null
    if ((location as any).companyId) {
      if (typeof (location as any).companyId === 'object') {
        // Populated: { _id: ObjectId, id: '100004', name: '...' }
        companyObjectId = (location as any).companyId._id || 
    (location as any).companyId
      } else if (typeof (location as any).companyId === 'string') {
        // ObjectId string or company ID string
        if ((location as any).companyId.length === 24 && /^[0-9a-fA-F]{24}$/.test((location as any).companyId)) {
          // It's an ObjectId string
          const mongoose = require('mongoose')
          companyObjectId = new mongoose.Types.ObjectId((location as any).companyId)
        } else {
          // It's a company ID string (like '100004'), need to look up the company
          const Company = require('../models/Company').default
          const company = await Company.findOne({ id: 
            (location as any).companyId }).select('_id').lean() as any
          if (company) {
            companyObjectId = company._id
          }
        }
      }
    }
    
    if (!companyObjectId) {
      console.warn(`[getEmployeesByLocation] Could not extract companyId ObjectId from location. Location companyId:`, 
        (location as any).companyId)
      // Try to get company by location's companyId string if available
      if ((location as any).companyId && typeof (location as any).companyId === 'object' && (location as any).companyId.id) {
        const Company = require('../models/Company').default
        const company = await Company.findOne({ id: 
          (location as any).companyId.id }).select('_id').lean() as any
        if (company) {
          companyObjectId = company._id
        }
      }
    }
    
    if (!companyObjectId) {
      console.error(`[getEmployeesByLocation] Cannot query employees: no valid companyId ObjectId found`)
      return []
    }
    
    console.log(`[getEmployeesByLocation] Querying employees for company ObjectId: ${companyObjectId}`)
    const allCompanyEmployees = await Employee.find({ 
      companyId: companyObjectId
    })
      .populate('companyId', 'id name')
      .populate('locationId', 'id name')
      .sort({ employeeId: 1 })
      .lean() as any
    
    const matchedByLocationIdString = allCompanyEmployees.filter((emp: any) => {
      if (emp.locationId) {
        const empLocationId = typeof emp.locationId === 'object' 
          ? (emp.locationId.id || emp.locationId._id?.toString())
          : emp.locationId
        return empLocationId === 
    location.id || empLocationId === 
    location._id?.toString()
      }
      return false
    })
    
    if (matchedByLocationIdString.length > 0) {
      console.log(`[getEmployeesByLocation] Found ${matchedByLocationIdString.length} employees by locationId string match`)
      employees = matchedByLocationIdString
    }
  }
  
  // Fallback: If no employees found by locationId, try matching by location name (text field)
  // This handles cases where employees might not have locationId set but have location text field
  if (employees.length === 0) {
    const locationName = location.name
    console.log(`[getEmployeesByLocation] Trying fallback: searching by location name "${locationName}"`)
    
    // Extract key location identifiers from location name
    // Examples: "ICICI Bank Chennai Branch" -> ["chennai"]
    //           "Mumbai Office" -> ["mumbai"]
    const locationNameLower = locationName.toLowerCase()
    const locationNameParts = locationNameLower.split(/\s+/)
    
    // Find city/location keywords (exclude common words)
    const excludeWords = ['bank', 'branch', 'office', 'location', 'icici', 'indigo', 'company', 'ltd', 'limited']
    const keyWords = locationNameParts
      .filter((part: string) => part.length > 2 && !excludeWords.includes(part))
      .map((part: string) => part.trim())
    
    // Also try city name from location if available
    if (location.city) {
      keyWords.push(
    location.city.toLowerCase())
    }
    
    console.log(`[getEmployeesByLocation] Searching for employees with location containing keywords:`, keyWords)
    
    // Get all employees for the same company as the location
    // Extract companyId ObjectId properly - handle both populated and non-populated cases
    let companyObjectId = null
    if ((location as any).companyId) {
      if (typeof (location as any).companyId === 'object') {
        // Populated: { _id: ObjectId, id: '100004', name: '...' }
        companyObjectId = (location as any).companyId._id || 
    (location as any).companyId
      } else if (typeof (location as any).companyId === 'string') {
        // ObjectId string or company ID string
        if ((location as any).companyId.length === 24 && /^[0-9a-fA-F]{24}$/.test((location as any).companyId)) {
          // It's an ObjectId string
          const mongoose = require('mongoose')
          companyObjectId = new mongoose.Types.ObjectId((location as any).companyId)
        } else {
          // It's a company ID string (like '100004'), need to look up the company
          const Company = require('../models/Company').default
          const company = await Company.findOne({ id: 
            (location as any).companyId }).select('_id').lean() as any
          if (company) {
            companyObjectId = company._id
          }
        }
      }
    }
    
    if (!companyObjectId) {
      console.warn(`[getEmployeesByLocation] Location has no valid companyId, cannot filter employees. Location companyId:`, 
        (location as any).companyId)
      return []
    }
    
    console.log(`[getEmployeesByLocation] Querying employees for company ObjectId: ${companyObjectId}`)
    const allCompanyEmployees = await Employee.find({ companyId: companyObjectId })
      .populate('companyId', 'id name')
      .populate('locationId', 'id name')
      .sort({ employeeId: 1 })
      .lean() as any
    
    
    // Location field is NOT encrypted (not employee PII) - use as plaintext
    const filteredByLocationName = allCompanyEmployees.filter((emp: any) => {
      if (!emp.location) return false
      
      // Location is stored as plaintext - no decryption needed
      const empLocationText = emp.location
      const empLocationLower = empLocationText.toLowerCase()
      
      // Check if any keyword appears in employee location
      const matchesKeyword = keyWords.some((keyword: string) => 
        empLocationLower.includes(keyword) || keyword.includes(empLocationLower)
      )
      
      // Also check direct/partial matches
      const directMatch = empLocationLower === locationNameLower ||
                         empLocationLower.includes(locationNameLower) ||
                         locationNameLower.includes(empLocationLower)
      
      if (matchesKeyword || directMatch) {
        console.log(`[getEmployeesByLocation] Matched employee ${emp.employeeId || emp.id}: location="${empLocationText}" with location name="${locationName}"`)
        return true
      }
      return false
    })
    
    if (filteredByLocationName.length > 0) {
      console.log(`[getEmployeesByLocation] Found ${filteredByLocationName.length} employees by location name fallback`)
      employees = filteredByLocationName
    } else {
      console.warn(`[getEmployeesByLocation] No employees found even with fallback matching. Location: "${locationName}", Keywords:`, keyWords)
      console.log(`[getEmployeesByLocation] Sample employee locations:`, 
        allCompanyEmployees.slice(0, 5).map((e: any) => ({ 
          id: e.employeeId || e.id, 
          location: e.location,
          locationId: e.locationId ? (e.locationId.id || e.locationId) : 'none'
        }))
      )
    }
  }
  
  // Decrypt employee fields (required since we use .lean())
  // CRITICAL: Include 'location' in sensitiveFields for Company Admin - they need to see decrypted locations
  const { decrypt } = require('../utils/encryption')
  const decryptedEmployees = employees.map((e: any) => {
    if (!e) return null
    const sensitiveFields = ['email', 'mobile', 'address', 'firstName', 'lastName', 'designation', 'location']
    for (const field of sensitiveFields) {
      if (e[field] && typeof e[field] === 'string' && e[field].includes(':')) {
        try {
          e[field] = decrypt(e[field])
        } catch (error) {
          // If decryption fails, keep original value
        }
      }
    }
    return e
  }).filter((e: any) => e !== null)
  
  console.log(`[getEmployeesByLocation] Returning ${decryptedEmployees.length} employees after decryption`)
  
  return decryptedEmployees.map((e: any) => toPlainObject(e))
  } catch (error: any) {
    console.error('[getEmployeesByLocation] Error:', error.message)
    return []
  }
}

export async function getCompanyByAdminEmail(email: string): Promise<any | null> {
  console.log(`[getCompanyByAdminEmail] ========================================`)
  console.log(`[getCompanyByAdminEmail] 🚀 FUNCTION CALLED`)
  console.log(`[getCompanyByAdminEmail] Input email: "${email}"`)
  console.log(`[getCompanyByAdminEmail] Input type: ${typeof email}`)
  console.log(`[getCompanyByAdminEmail] Input length: ${email?.length || 0}`)
  
  await connectDB()
  console.log(`[getCompanyByAdminEmail] ✅ Database connected`)
  
  if (!email) {
    console.error(`[getCompanyByAdminEmail] ❌ Email is empty or null`)
    console.log(`[getCompanyByAdminEmail] ========================================`)
    return null
  }
  
  // Normalize email: trim and lowercase for consistent comparison
  const normalizedEmail = email.trim().toLowerCase()
  console.log(`[getCompanyByAdminEmail] Normalized email: "${normalizedEmail}"`)
  console.log(`[getCompanyByAdminEmail] Normalization: trim="${email.trim()}", lowercase="${email.trim().toLowerCase()}"`)
  
  console.log(`[getCompanyByAdminEmail] 🔍 STEP 1: Looking up employee by email...`)
  console.log(`[getCompanyByAdminEmail] Calling getEmployeeByEmail("${normalizedEmail}")...`)
  
  const employeeStartTime = Date.now()
  // Use getEmployeeByEmail which has robust fallback logic for finding employees
  // This ensures we can find the employee even if encryption doesn't match exactly
  const employee = await getEmployeeByEmail(normalizedEmail)
  const employeeDuration = Date.now() - employeeStartTime
  
  console.log(`[getCompanyByAdminEmail] ⏱️ getEmployeeByEmail completed in ${employeeDuration}ms`)
  
  if (!employee) {
    console.error(`[getCompanyByAdminEmail] ❌ STEP 1 FAILED: Employee not found`)
    console.error(`[getCompanyByAdminEmail] Email searched: "${normalizedEmail}"`)
    console.error(`[getCompanyByAdminEmail] This means the employee does not exist in the database`)
    console.error(`[getCompanyByAdminEmail] Possible causes:`)
    console.error(`[getCompanyByAdminEmail]   1. Email not in database`)
    console.error(`[getCompanyByAdminEmail]   2. Email encryption mismatch`)
    console.error(`[getCompanyByAdminEmail]   3. Email case/whitespace mismatch`)
    console.log(`[getCompanyByAdminEmail] ========================================`)
    return null
  }
  
  console.log(`[getCompanyByAdminEmail] ✅ STEP 1 SUCCESS: Employee found`)
  console.log(`[getCompanyByAdminEmail] Employee details:`, {
    id: 
    employee.id,
    employeeId: 
    employee.employeeId,
    email: 
    employee.email,
    _id: 
    employee._id?.toString(),
    _idType: typeof 
    employee._id,
    companyId: 
    employee.companyId,
    companyIdType: typeof 
    employee.companyId
  })
  
  // Find company where this employee is an admin
  // We need the employee's _id (ObjectId) to match against admin records
  // Since getEmployeeByEmail returns a plain object, we need to fetch the raw employee document
  const db = mongoose.connection.db
    if (!db) {
    throw new Error('Database connection not available')
  }
   if (!db) {
    console.error(`[getCompanyByAdminEmail] Database connection not available`)
    return null
  }
  
  // Get the employee's _id from the database
  // getEmployeeByEmail now preserves _id, so we can use it directly
  let employeeObjectId: mongoose.Types.ObjectId | null = null
  
  console.log(`[getCompanyByAdminEmail] 🔍 Getting employee _id. Employee object:`, {
    id: 
    employee.id,
    employeeId: 
    employee.employeeId,
    _id: 
    employee._id,
    _idType: typeof 
    employee._id,
    email: 
    employee.email
  })
  
  // Method 1: Use _id directly from employee object (getEmployeeByEmail preserves it)
  if (employee._id) {
    if (typeof employee._id === 'string' && mongoose.Types.ObjectId.isValid(employee._id)) {
      employeeObjectId = new mongoose.Types.ObjectId(employee._id)
      console.log(`[getCompanyByAdminEmail] ✅ Using _id from employee object: ${
    employeeObjectId.toString()}`)
    } else if (employee._id instanceof mongoose.Types.ObjectId) {
      employeeObjectId = employee._id
      console.log(`[getCompanyByAdminEmail] ✅ Using ObjectId _id from employee object: ${
    employeeObjectId.toString()}`)
    }
  }
  
  // Method 2: Fallback - get _id from raw MongoDB document using 
    employee.id
  if (!employeeObjectId && employee.id && db) {
    const rawEmployee = await db.collection('employees').findOne({ id: 
    employee.id })
    if (rawEmployee && rawEmployee._id) {
      employeeObjectId = rawEmployee._id instanceof mongoose.Types.ObjectId
        ? 
    rawEmployee._id
        : new mongoose.Types.ObjectId(
    rawEmployee._id.toString())
      console.log(`[getCompanyByAdminEmail] ✅ Found _id using 
    employee.id: ${employeeObjectId?.toString()}`)
    }
  }
  
  if (!employeeObjectId) {
    console.error(`[getCompanyByAdminEmail] ❌ CRITICAL: Could not find employee _id`)
    console.error(`[getCompanyByAdminEmail] Employee object:`, {
      id: 
    employee.id,
      employeeId: 
    employee.employeeId,
      email: 
    employee.email,
      _id: 
    employee._id,
      _idType: typeof 
    employee._id
    })
    console.error(`[getCompanyByAdminEmail] This is a critical error - cannot proceed without employee _id`)
    console.log(`[getCompanyByAdminEmail] ========================================`)
    return null
  }
  
  console.log(`[getCompanyByAdminEmail] ✅ Employee _id successfully retrieved: ${
    employeeObjectId.toString()}`)
  
  console.log(`[getCompanyByAdminEmail] 🔍 STEP 2: Looking for admin record`)
  console.log(`[getCompanyByAdminEmail] Employee _id (ObjectId): ${
    employeeObjectId.toString()}`)
  console.log(`[getCompanyByAdminEmail] Employee _id type: ${employeeObjectId instanceof mongoose.Types.ObjectId ? 'ObjectId' : typeof employeeObjectId}`)
  
  // Find admin record using direct MongoDB query with ObjectId (most reliable)
  // Admin records store employeeId as ObjectId, so we can query directly
  if (!db) {
    console.error(`[getCompanyByAdminEmail] Database connection not available`)
    return null
  }
  
  console.log(`[getCompanyByAdminEmail] Querying companyadmins collection with employeeId: ${employeeObjectId}`)
  let adminRecord = await db.collection('companyadmins').findOne({
    employeeId: employeeObjectId
  })
  
  if (adminRecord) {
    console.log(`[getCompanyByAdminEmail] ✅ STEP 2 SUCCESS: Admin record found via direct query`)
    console.log(`[getCompanyByAdminEmail] Admin record:`, {
      _id: adminRecord._id?.toString(),
      employeeId: 
    adminRecord.employeeId?.toString(),
      employeeIdType: 
    adminRecord.employeeId instanceof mongoose.Types.ObjectId ? 'ObjectId' : typeof 
    adminRecord.employeeId,
      companyId: 
    adminRecord.companyId?.toString(),
      canApproveOrders: 
    adminRecord.canApproveOrders
    })
  } else {
    // Fallback: Try to find all admins and log for debugging
    console.error(`[getCompanyByAdminEmail] ❌ Direct query failed, trying fallback...`)
    const allAdmins = await db.collection('companyadmins').find({}).toArray()
    console.error(`[getCompanyByAdminEmail] Found ${allAdmins.length} total admin records`)
    console.error(`[getCompanyByAdminEmail] 📋 All admin records:`, allAdmins.map((a: any, index: number) => ({
      index,
      _id: a._id?.toString(),
      employeeId: a.employeeId?.toString(),
      employeeIdType: a.employeeId instanceof mongoose.Types.ObjectId ? 'ObjectId' : typeof a.employeeId,
      companyId: a.companyId?.toString(),
      canApproveOrders: a.canApproveOrders,
      matches: a.employeeId?.toString() === 
    employeeObjectId.toString() ? '✅ MATCH' : '❌ NO MATCH'
    })))
    
    // Try fallback matching with string comparison
    const fallbackMatch = allAdmins.find((a: any) => {
      if (!a.employeeId) return false
      return a.employeeId.toString() === 
    employeeObjectId.toString()
    })
    
    if (fallbackMatch) {
      console.log(`[getCompanyByAdminEmail] ✅ Found via fallback string comparison`)
      adminRecord = fallbackMatch
    } else {
      console.error(`[getCompanyByAdminEmail] ❌ STEP 2 FAILED: No admin record found`)
      console.error(`[getCompanyByAdminEmail] Employee _id searched: ${
    employeeObjectId.toString()}`)
      console.error(`[getCompanyByAdminEmail] Employee details:`, {
        id: 
    employee.id,
        employeeId: 
    employee.employeeId,
        _id: 
    employee._id?.toString(),
        email: normalizedEmail,
        employeeEmail: 
    employee.email
      })
      console.error(`[getCompanyByAdminEmail] Possible causes:`)
      console.error(`[getCompanyByAdminEmail]   1. Employee not assigned as company admin`)
      console.error(`[getCompanyByAdminEmail]   2. Admin record employeeId format mismatch`)
      console.error(`[getCompanyByAdminEmail]   3. Admin record employeeId doesn't match employee _id`)
      console.log(`[getCompanyByAdminEmail] ========================================`)
      return null
    }
  }
  
  // Final check - if still no admin record found, return null
  if (!adminRecord) {
    console.error(`[getCompanyByAdminEmail] ❌ STEP 2 FAILED: No admin record found after all attempts`)
    console.error(`[getCompanyByAdminEmail] Employee _id searched: ${
    employeeObjectId.toString()}`)
    console.error(`[getCompanyByAdminEmail] Employee details:`, {
      id: 
    employee.id,
      employeeId: 
    employee.employeeId,
      _id: 
    employee._id?.toString(),
      email: normalizedEmail,
      employeeEmail: 
    employee.email
    })
    console.error(`[getCompanyByAdminEmail] Possible causes:`)
    console.error(`[getCompanyByAdminEmail]   1. Employee not assigned as company admin`)
    console.error(`[getCompanyByAdminEmail]   2. Admin record employeeId format mismatch`)
    console.error(`[getCompanyByAdminEmail]   3. Admin record employeeId doesn't match employee _id`)
    console.log(`[getCompanyByAdminEmail] ========================================`)
    return null
  }
  
  console.log(`[getCompanyByAdminEmail] ✅ STEP 2 SUCCESS: Admin record found`)
  console.log(`[getCompanyByAdminEmail] Admin record:`, {
    _id: 
    adminRecord._id?.toString(),
    employeeId: 
    adminRecord.employeeId?.toString(),
    companyId: 
    adminRecord.companyId?.toString(),
    companyIdType: 
    adminRecord.companyId instanceof mongoose.Types.ObjectId ? 'ObjectId' : typeof 
    adminRecord.companyId,
    canApproveOrders: 
    adminRecord.canApproveOrders
  })
  
  // STEP 3: Get the company using direct MongoDB query with ObjectId (most reliable)
  // Convert companyId to ObjectId for reliable query
  let companyObjectId: mongoose.Types.ObjectId
  if (adminRecord.companyId instanceof mongoose.Types.ObjectId) {
    companyObjectId = adminRecord.companyId
  } else {
    try {
      companyObjectId = new mongoose.Types.ObjectId(
    adminRecord.companyId.toString())
    } catch (error) {
      console.error(`[getCompanyByAdminEmail] ❌ CRITICAL: Cannot convert companyId to ObjectId: ${adminRecord.companyId}`)
      console.error(`[getCompanyByAdminEmail] Error:`, error)
      console.log(`[getCompanyByAdminEmail] ========================================`)
      return null
    }
  }
  
  const companyIdStr = companyObjectId.toString()
  console.log(`[getCompanyByAdminEmail] 🔍 STEP 3: Looking for company`)
  console.log(`[getCompanyByAdminEmail] Company _id (ObjectId): ${companyIdStr}`)
  console.log(`[getCompanyByAdminEmail] Company _id type: ${companyObjectId instanceof mongoose.Types.ObjectId ? 'ObjectId' : typeof companyObjectId}`)
  
  // Use direct MongoDB query with ObjectId (most reliable)
  console.log(`[getCompanyByAdminEmail] Querying companies collection with _id: ${companyObjectId}`)
  let companyDoc = await db.collection('companies').findOne({
    _id: companyObjectId
  })
  
  if (companyDoc) {
    console.log(`[getCompanyByAdminEmail] ✅ STEP 3 SUCCESS: Company found via direct query`)
    console.log(`[getCompanyByAdminEmail] Company: ${companyDoc.name} (id: ${companyDoc.id}, _id: ${
    companyDoc._id?.toString()})`)
  } else {
    // Fallback: Try to find all companies and match by string comparison (for debugging)
    console.error(`[getCompanyByAdminEmail] ❌ Direct query failed, trying fallback...`)
    const allCompanies = await db.collection('companies').find({}).toArray()
    console.error(`[getCompanyByAdminEmail] Found ${allCompanies.length} total companies`)
    console.error(`[getCompanyByAdminEmail] 📋 All companies:`, allCompanies.map((c: any, index: number) => ({
      index,
      _id: c._id?.toString(),
      id: c.id,
      name: c.name,
      _idType: c._id instanceof mongoose.Types.ObjectId ? 'ObjectId' : typeof c._id,
      matches: c._id?.toString() === companyIdStr ? '✅ MATCH' : '❌ NO MATCH'
    })))
    
    // Try fallback matching with string comparison
    const fallbackMatch = allCompanies.find((c: any) => {
      if (!c._id) return false
      return c._id.toString() === companyIdStr
    })
    
    if (fallbackMatch) {
      console.log(`[getCompanyByAdminEmail] ✅ Found via fallback string comparison`)
      companyDoc = fallbackMatch
    } else {
      console.error(`[getCompanyByAdminEmail] ❌ STEP 3 FAILED: No company found`)
      console.error(`[getCompanyByAdminEmail] Company _id searched: ${companyIdStr}`)
      console.error(`[getCompanyByAdminEmail] Admin record companyId: ${
    adminRecord.companyId?.toString()}`)
      console.error(`[getCompanyByAdminEmail] Possible causes:`)
      console.error(`[getCompanyByAdminEmail]   1. Company was deleted`)
      console.error(`[getCompanyByAdminEmail]   2. Admin record has incorrect companyId`)
      console.error(`[getCompanyByAdminEmail]   3. Company _id format mismatch`)
      console.log(`[getCompanyByAdminEmail] ========================================`)
      return null
    }
  }
  
  // Final check - if still no company found, return null
  if (!companyDoc) {
    console.error(`[getCompanyByAdminEmail] ❌ STEP 3 FAILED: No company found after all attempts`)
    console.error(`[getCompanyByAdminEmail] Company _id searched: ${companyIdStr}`)
    console.error(`[getCompanyByAdminEmail] Admin record companyId: ${
    adminRecord.companyId?.toString()}`)
    console.log(`[getCompanyByAdminEmail] ========================================`)
    return null
  }
  
  console.log(`[getCompanyByAdminEmail] ✅ STEP 3 SUCCESS: Company found`)
  console.log(`[getCompanyByAdminEmail] Company: ${companyDoc.name} (id: ${companyDoc.id}, type: ${typeof 
    companyDoc.id})`)
  
  // Convert to format expected by the rest of the code
  const company = toPlainObject(companyDoc)
  
  // Ensure 
    // company.id is preserved (should be numeric now)
  if (companyDoc.id !== undefined) {
    company.id = companyDoc.id
  }
  
  console.log(`[getCompanyByAdminEmail] ✅ FINAL SUCCESS: Returning company`)
  console.log(`[getCompanyByAdminEmail] Return value:`, {
    id: 
    company.id,
    idType: typeof 
    company.id,
    name: 
    company.name,
    hasId: !!
    company.id,
    hasName: !!
    company.name
  })
  console.log(`[getCompanyByAdminEmail] ========================================`)
  return company
}

// Legacy function for backward compatibility (keeps old adminId field)
export async function setCompanyAdmin(companyId: string, employeeId: string): Promise<void> {
  // Use new multiple admin system
  await addCompanyAdmin(companyId, employeeId, false)
  
  // Also update legacy adminId field for backward compatibility
  const company = await Company.findOne({ id: companyId })
  if (company) {
    const employee = await Employee.findOne({ id: employeeId })
    if (employee) {
      company.adminId = employee._id
      await company.save()
    }
  }
}

// ========== EMPLOYEE FUNCTIONS ==========

export async function getAllEmployees(): Promise<any[]> {
  try {
    await connectDB()
  } catch (error: any) {
    console.error('[getAllEmployees] Database connection error:', error.message)
    return []
  }
  
  try {
    const employees = await Employee.find()
      .populate('companyId', 'id name')
      .populate('locationId', 'id name address city state pincode')
      .lean() as any

    // CRITICAL: Include 'location' in sensitiveFields for Company Admin - they need to see decrypted locations
    const { decrypt } = require('../utils/encryption')
    const decryptedEmployees = employees.map((e: any) => {
      const sensitiveFields = ['email', 'mobile', 'address', 'firstName', 'lastName', 'designation', 'location']
      for (const field of sensitiveFields) {
        if (e[field] && typeof e[field] === 'string' && e[field].includes(':')) {
          try {
            e[field] = decrypt(e[field])
          } catch (error) {
            console.warn(`Failed to decrypt field ${field} for employee ${e.id}:`, error)
          }
        }
      }
      return e
    })

    return decryptedEmployees.map((e: any) => toPlainObject(e))
  } catch (error: any) {
    console.error('[getAllEmployees] Error:', error.message)
    return []
  }
}

export async function getEmployeeByEmail(email: string): Promise<any | null> {
  try {
    await connectDB()
  } catch (error: any) {
    console.error('[getEmployeeByEmail] Database connection error:', error.message)
    return null
  }
  
  try {
    if (!email) {
      return null
    }
  
  // Normalize email: trim whitespace and convert to lowercase for consistent comparison
  // This ensures emails are compared consistently regardless of case or whitespace
  const trimmedEmail = email.trim().toLowerCase()
  
  // Since email is encrypted in the database, we need to encrypt the search term
  // or search through all employees and decrypt to match
  // The more efficient approach is to encrypt the search term and query
  
  const { encrypt, decrypt } = require('../utils/encryption')
  let encryptedEmail: string
  
  try {
    encryptedEmail = encrypt(trimmedEmail)
  } catch (error) {
    console.warn('Failed to encrypt email for query, will use decryption matching:', error)
    encryptedEmail = ''
  }
  
  // Try finding with encrypted email first (faster)
  // Use raw MongoDB query to get the employee with companyId ObjectId
  const db = mongoose.connection.db
     if (!db) {
    throw new Error('Database connection not available')
  }
  let employee: any = null
  
  if (db && encryptedEmail) {
    // First, try with encrypted email (for encrypted data)
    // NOTE: This will only work if the email was encrypted with the EXACT same normalized value
    // Due to random IVs, even the same email encrypts differently each time
    // So this lookup is mainly for recently created employees with normalized emails
    let rawEmployee = await db.collection('employees').findOne({ email: encryptedEmail })
    
    if (rawEmployee) {
      console.log(`[getEmployeeByEmail] ✅ Found employee via encrypted email lookup (direct match)`)
    }
    
    // If not found with encrypted email, try with plain text email (for plain text data - legacy)
    if (!rawEmployee) {
      rawEmployee = await db.collection('employees').findOne({ email: trimmedEmail })
      if (rawEmployee) {
        console.log(`[getEmployeeByEmail] ✅ Found employee via plain text email lookup (legacy data)`)
      }
    }
    
    // Also try case-insensitive plain text search (for legacy data)
    if (!rawEmployee) {
      rawEmployee = await db.collection('employees').findOne({ 
        email: { $regex: new RegExp(`^${trimmedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      })
      if (rawEmployee) {
        console.log(`[getEmployeeByEmail] ✅ Found employee via case-insensitive plain text lookup (legacy data)`)
      }
    }
    
    if (rawEmployee) {
      console.log(`[getEmployeeByEmail] Raw employee companyId:`, rawEmployee.companyId, 'Type:', typeof rawEmployee.companyId)
      
      // Now fetch with Mongoose to get decryption
      // Use id field instead of _id
      const employeeId = rawEmployee.id || 
    rawEmployee.employeeId
      if (employeeId) {
        employee = await Employee.findOne({ id: employeeId }).lean() as any
        
        // Manual join for companyId
        if (employee && employee.companyId) {
          const company = await Company.findOne({ id: 
    employee.companyId }).lean() as any
          if (company) {
    employee.companyId = toPlainObject(company)
          }
        }
        
        // Manual join for locationId
        if (employee && employee.locationId) {
          const location = await Location.findOne({ id: 
    employee.locationId }).lean() as any
          if (location) {
    employee.locationId = toPlainObject(location)
          }
        }
        
        console.log(`[getEmployeeByEmail] Mongoose employee companyId:`, employee?.companyId, 'Type:', typeof employee?.companyId)
      }
    }
  }
  
  // Fallback: if raw query didn't work, try Mongoose query
  if (!employee && encryptedEmail) {
    employee = await Employee.findOne({ email: encryptedEmail }).lean() as any
    
    // Manual join for companyId
    if (employee && employee.companyId) {
      const company = await Company.findOne({ id: 
    employee.companyId }).lean() as any
      if (company) {
    employee.companyId = toPlainObject(company)
      }
    }
    
    // Manual join for locationId
    if (employee && employee.locationId) {
      const location = await Location.findOne({ id: 
    employee.locationId }).lean() as any
      if (location) {
    employee.locationId = toPlainObject(location)
      }
    }
  }
  
  // Fallback: if still not found, try decryption-based search (works even if encryption format doesn't match)
  // This MUST run regardless of whether encryptedEmail was set, because encryption uses random IVs
  // CRITICAL FIX: Also handle plain text emails (user may have manually replaced encrypted email with plain text)
  if (!employee) {
    console.log(`[getEmployeeByEmail] ⚠️  Primary lookups failed for: ${trimmedEmail}`)
    console.log(`[getEmployeeByEmail] Starting comprehensive fallback search...`)
    
    // Use raw MongoDB to get all employees (faster than Mongoose for bulk operations)
    const db = mongoose.connection.db
       if (!db) {
    throw new Error('Database connection not available')
  }
  if (db) {
      // First, try direct plain text match (handles manually replaced plain text emails)
      console.log(`[getEmployeeByEmail] Trying plain text email match...`)
      const plainTextEmployee = await db.collection('employees').findOne({ email: trimmedEmail })
      if (plainTextEmployee) {
        console.log(`[getEmployeeByEmail] ✅ Found employee via plain text email match`)
        // Fetch with Mongoose using id field
        const employeeId = plainTextEmployee.id || plainTextEmployee.employeeId
        if (employeeId) {
          employee = await Employee.findOne({ id: employeeId }).lean() as any
          
          // Manual join for companyId
          if (employee && employee.companyId) {
            const company = await Company.findOne({ id: 
    employee.companyId }).lean() as any
            if (company) {
    employee.companyId = toPlainObject(company)
            }
          }
          
          // Manual join for locationId
          if (employee && employee.locationId) {
            const location = await Location.findOne({ id: 
    employee.locationId }).lean() as any
            if (location) {
    employee.locationId = toPlainObject(location)
            }
          }
          
          console.log(`[getEmployeeByEmail] Employee ID: ${employee?.id || employee?.employeeId}`)
        }
      }
    }
    
    // If still not found, try decryption-based search for encrypted emails
    if (!employee) {
      console.log(`[getEmployeeByEmail] Trying decryption-based search for encrypted emails...`)
      // For encrypted values, we can't do regex search easily
      // So we'll fall back to fetching all and decrypting (less efficient but works)
      const allEmployees = await Employee.find({}).lean() as any
      
      console.log(`[getEmployeeByEmail] Checking ${allEmployees.length} employees via decryption...`)
      let checkedCount = 0
      for (const emp of allEmployees) {
        if (emp.email && typeof emp.email === 'string') {
          checkedCount++
          try {
            // Skip if already plain text (we already checked that)
            if (!emp.email.includes(':')) {
              // Plain text email - check if it matches
              if (emp.email.toLowerCase() === trimmedEmail) {
                console.log(`[getEmployeeByEmail] ✅ Found employee via plain text match in decryption loop: ${emp.email}`)
                employee = emp
                // Manual join for companyId
                if (employee.companyId) {
                  const company = await Company.findOne({ id: 
    employee.companyId }).lean() as any
                  if (company) {
    employee.companyId = toPlainObject(company)
                  }
                }
                break
              }
              continue
            }
            
            // Encrypted email - try to decrypt
            const decryptedEmail = decrypt(emp.email)
            // Check if decryption succeeded - be more lenient to avoid false negatives
            // Decryption succeeded if:
            // 1. Result is different from input (was actually encrypted)
            // 2. Result doesn't contain ':' (not still encrypted)
            // 3. Result is reasonable length (not corrupted)
            // 4. Result contains '@' (looks like an email)
            const isDecrypted = decryptedEmail && 
                               decryptedEmail !== emp.email && 
                               !decryptedEmail.includes(':') && 
                               decryptedEmail.length > 0 &&
                               decryptedEmail.length < 200 &&
                               decryptedEmail.includes('@')
            
            // Check if email matches (case-insensitive - both should already be lowercase)
            // trimmedEmail is already lowercase, so compare directly
            if (isDecrypted && decryptedEmail.toLowerCase() === trimmedEmail) {
              console.log(`[getEmployeeByEmail] ✅ Found employee via decryption fallback: ${decryptedEmail}`)
              console.log(`[getEmployeeByEmail] Employee ID: ${emp.id || emp.employeeId}, _id: ${emp._id}`)
              employee = emp
              // CRITICAL: Decrypt the email field itself so it matches what the caller expects
    employee.email = decryptedEmail
              console.log(`[getEmployeeByEmail] Set 
    employee.email to: ${employee.email}`)
              // Decrypt all sensitive fields for this employee
              if (employee.firstName && typeof employee.firstName === 'string' && employee.firstName.includes(':')) {
                try { 
    employee.firstName = decrypt(employee.firstName) } catch {}
              }
              if (employee.lastName && typeof employee.lastName === 'string' && employee.lastName.includes(':')) {
                try { 
    employee.lastName = decrypt(employee.lastName) } catch {}
              }
              if (employee.mobile && typeof employee.mobile === 'string' && employee.mobile.includes(':')) {
                try { 
    employee.mobile = decrypt(employee.mobile) } catch {}
              }
              if (employee.address && typeof employee.address === 'string' && employee.address.includes(':')) {
                try { 
    employee.address = decrypt(employee.address) } catch {}
              }
              if (employee.designation && typeof employee.designation === 'string' && employee.designation.includes(':')) {
                try { 
    employee.designation = decrypt(employee.designation) } catch {}
              }
              // Manual join for companyId
              if (employee.companyId) {
                const company = await Company.findOne({ id: 
    employee.companyId }).lean() as any
                if (company) {
    employee.companyId = toPlainObject(company)
                }
              }
              break
            }
          } catch (error) {
            // Skip employees with decryption errors silently (don't log for every employee)
            continue
          }
        }
      }
      console.log(`[getEmployeeByEmail] Decryption fallback completed. Checked ${checkedCount} employees. Employee found: ${!!employee}`)
    }
  }

  if (!employee) {
    console.warn(`[getEmployeeByEmail] ❌ Employee not found after all lookup methods for: ${trimmedEmail}`)
    return null
  }
  
  // Ensure companyId is set correctly (should already be a string from manual joins above)
  // No conversion needed - companyId is already a string
  if (employee && !employee.companyId && db) {
    // Fallback: try to get from raw document if missing
    let rawEmp: any = null
    if (employee.id) {
      rawEmp = await db.collection('employees').findOne({ id: 
    employee.id })
    }
    if (!rawEmp && employee.employeeId) {
      rawEmp = await db.collection('employees').findOne({ employeeId: 
    employee.employeeId })
    }
    
    if (rawEmp && rawEmp.companyId) {
      // companyId should already be a string, but validate
      const companyIdStr = String(rawEmp.companyId)
      if (/^\d{6}$/.test(companyIdStr)) {
    employee.companyId = companyIdStr
        // Manual join
        const company = await Company.findOne({ id: companyIdStr }).lean() as any
        if (company) {
    employee.companyId = toPlainObject(company)
        }
      }
    }
  }
  
  // CRITICAL: Since we use .lean(), Mongoose post hooks don't run, so we must manually decrypt
  // Decrypt email and other sensitive fields if they're still encrypted
  if (employee) {
    const { decrypt } = require('../utils/encryption')
    const sensitiveFields = ['email', 'mobile', 'address', 'firstName', 'lastName', 'designation']
    for (const field of sensitiveFields) {
      if (employee[field] && typeof employee[field] === 'string' && employee[field].includes(':')) {
        try {
          const decrypted = decrypt(employee[field])
          // Only use decrypted value if decryption succeeded (different from original and reasonable length)
          // For email, also check it contains @ to ensure it's a valid email
          const isValidDecryption = decrypted && 
                                   decrypted !== employee[field] && 
                                   !decrypted.includes(':') && 
                                   decrypted.length > 0 &&
                                   decrypted.length < 200 &&
                                   (field !== 'email' || decrypted.includes('@'))
          if (isValidDecryption) {
            employee[field] = decrypted
          }
        } catch (error) {
          // Keep original if decryption fails - don't log for every employee
          continue
        }
      }
    }
  }
  
  const plainEmployee = toPlainObject(employee)
  
  // companyId should already be a string or populated object from manual joins above
  // No conversion needed
  
    return plainEmployee
  } catch (error: any) {
    console.error('[getEmployeeByEmail] Error:', error.message)
    return null
  }
}

export async function getEmployeeById(employeeId: string): Promise<any | null> {
  try {
    await connectDB()
  } catch (error: any) {
    console.error('[getEmployeeById] Database connection error:', error.message)
    return null
  }
  
  try {
    // Normalize and validate
    const normalizedId = String(employeeId)
    if (!/^\d{6}$/.test(normalizedId)) {
      console.warn(`[getEmployeeById] Invalid employeeId format: ${normalizedId}`)
      return null
    }
    
    const employee = await Employee.findOne({ id: normalizedId }).lean() as any
    
    if (!employee) return null
    
    // Manual join for companyId
    if (employee.companyId) {
      const company = await Company.findOne({ id: employee.companyId }).lean() as any
      if (company) {
    employee.companyId = toPlainObject(company)
      }
    }
    
    // Manual join for locationId
    if (employee.locationId) {
      const location = await Location.findOne({ id: 
    employee.locationId }).lean() as any
      if (location) {
    employee.locationId = toPlainObject(location)
      }
    }
  
  // Since we used .lean(), the post hooks don't run, so we need to manually decrypt sensitive fields
  const { decrypt } = require('../utils/encryption')
  const sensitiveFields = ['email', 'mobile', 'firstName', 'lastName', 'designation']
  const addressFields = ['address_line_1', 'address_line_2', 'address_line_3', 'city', 'state', 'pincode']
  
  for (const field of sensitiveFields) {
    if (employee[field] && typeof employee[field] === 'string' && employee[field].includes(':')) {
      try {
        employee[field] = decrypt(employee[field])
      } catch (error) {
        console.warn(`Failed to decrypt field ${field} for employee ${employeeId}:`, error)
      }
    }
  }
  
  // Decrypt address fields
  for (const field of addressFields) {
    if (employee[field] && typeof employee[field] === 'string' && employee[field].includes(':')) {
      try {
        employee[field] = decrypt(employee[field])
      } catch (error) {
        console.warn(`Failed to decrypt address field ${field} for employee ${employeeId}:`, error)
      }
    }
  }
  
  const plainEmployee = toPlainObject(employee)
  
  // Address is now embedded, no need to extract from addressId
  // Create address object for backward compatibility with UI
  if (plainEmployee.address_line_1) {
    plainEmployee.address = {
      address_line_1: plainEmployee.address_line_1 || '',
      address_line_2: plainEmployee.address_line_2 || '',
      address_line_3: plainEmployee.address_line_3 || '',
      city: plainEmployee.city || '',
      state: plainEmployee.state || '',
      pincode: plainEmployee.pincode || '',
      country: plainEmployee.country || 'India',
    }
  }
  
  // Ensure companyId is converted to company string ID (not ObjectId)
  if (plainEmployee.companyId) {
    if (typeof plainEmployee.companyId === 'object' && plainEmployee.companyId !== null) {
      if (plainEmployee.companyId.id) {
        plainEmployee.companyId = plainEmployee.companyId.id
      } else if (plainEmployee.companyId._id) {
        const db = mongoose.connection.db
         if (!db) {
          throw new Error('Database connection not available')
        }
        try {
          const companyIdStr = plainEmployee.companyId._id.toString()
          const allCompanies = await db.collection('companies').find({}).toArray()
          const companyDoc = allCompanies.find((c: any) => c._id.toString() === companyIdStr)
          if (companyDoc && companyDoc.id) {
            plainEmployee.companyId = companyDoc.id
          }
        } catch (error) {
          console.warn(`[getEmployeeById] Error converting companyId:`, error)
        }
      }
    } else if (typeof plainEmployee.companyId === 'string' && /^[0-9a-fA-F]{24}$/.test(plainEmployee.companyId)) {
      const db = mongoose.connection.db
       if (!db) {
        throw new Error('Database connection not available')
      }
      try {
        const allCompanies = await db.collection('companies').find({}).toArray()
        const companyDoc = allCompanies.find((c: any) => c._id.toString() === plainEmployee.companyId)
        if (companyDoc && companyDoc.id) {
          plainEmployee.companyId = companyDoc.id
        }
      } catch (error) {
        console.warn(`[getEmployeeById] Error converting companyId ObjectId:`, error)
      }
    }
  }
  
    return plainEmployee
  } catch (error: any) {
    console.error('[getEmployeeById] Error:', error.message)
    return null
  }
}

export async function getEmployeeByPhone(phone: string): Promise<any | null> {
  await connectDB()
  
  if (!phone) {
    return null
  }
  
  // Normalize phone number (remove spaces, dashes, etc.)
  let normalizedPhone = phone.trim().replace(/[\s\-\(\)]/g, '')
  
  // Since mobile is encrypted in the database, we need to encrypt the search term
  const { encrypt, decrypt } = require('../utils/encryption')
  
  // Generate multiple phone number format variations to try
  // Phone numbers can be stored in different formats in the database
  const phoneVariations: string[] = []
  
  // 1. Original format (as received)
  phoneVariations.push(normalizedPhone)
  
  // 2. If it starts with +91, try without +
  if (normalizedPhone.startsWith('+91')) {
    phoneVariations.push(normalizedPhone.substring(1)) // Remove +
    phoneVariations.push(normalizedPhone.substring(3)) // Remove +91
  }
  // 3. If it starts with 91 (without +), try without country code
  else if (normalizedPhone.startsWith('91') && normalizedPhone.length === 12) {
    phoneVariations.push('+' + normalizedPhone) // Add +
    phoneVariations.push(normalizedPhone.substring(2)) // Remove 91
  }
  // 4. If it's 10 digits (Indian number without country code), try with country code
  else if (normalizedPhone.length === 10 && /^\d+$/.test(normalizedPhone)) {
    phoneVariations.push('+91' + normalizedPhone) // Add +91
    phoneVariations.push('91' + normalizedPhone) // Add 91
    if (normalizedPhone.startsWith('0')) {
      phoneVariations.push(normalizedPhone.substring(1)) // Remove leading 0
      phoneVariations.push('+91' + normalizedPhone.substring(1)) // Remove 0 and add +91
    }
  }
  // 5. If it starts with 0, try without 0
  else if (normalizedPhone.startsWith('0') && normalizedPhone.length === 11) {
    phoneVariations.push(normalizedPhone.substring(1)) // Remove 0
    phoneVariations.push('+91' + normalizedPhone.substring(1)) // Remove 0 and add +91
    phoneVariations.push('91' + normalizedPhone.substring(1)) // Remove 0 and add 91
  }
  
  // Remove duplicates
  const uniqueVariations = [...new Set(phoneVariations)]
  
  console.log(`[getEmployeeByPhone] Trying phone number variations for: ${phone.substring(0, 5)}...`, uniqueVariations.length, 'variations')
  
  // Try finding with each phone number variation
  const db = mongoose.connection.db
     if (!db) {
    throw new Error('Database connection not available')
  }
  let employee: any = null
  
  // Try each variation
  for (const phoneVar of uniqueVariations) {
    if (!phoneVar || phoneVar.length === 0) continue
    
    let encryptedPhone: string = ''
    try {
      encryptedPhone = encrypt(phoneVar)
    } catch (error) {
      console.warn(`[getEmployeeByPhone] Failed to encrypt phone variation "${phoneVar}":`, error)
      continue
    }
    
    if (!encryptedPhone) continue
    
    // Try finding with encrypted phone
    if (db) {
      const rawEmployee = await db.collection('employees').findOne({ mobile: encryptedPhone })
      
      if (rawEmployee) {
        // Found employee! Now fetch with Mongoose to get populated fields and decryption
        employee = await Employee.findOne({ mobile: encryptedPhone })
          .populate('companyId', 'id name')
          .populate('locationId', 'id name address city state pincode')
          .lean() as any
        
        if (employee) {
          console.log(`[getEmployeeByPhone] ✅ Found employee with phone variation: ${phoneVar.substring(0, 5)}...`)
          break // Found employee, stop searching
        }
      }
    }
    
    // Also try Mongoose query as fallback
    if (!employee) {
      employee = await Employee.findOne({ mobile: encryptedPhone })
        .populate('companyId', 'id name')
        .populate('locationId', 'id name address city state pincode')
        .lean() as any
      
      if (employee) {
        console.log(`[getEmployeeByPhone] ✅ Found employee with Mongoose query (variation: ${phoneVar.substring(0, 5)}...)`)
        break // Found employee, stop searching
      }
    }
  }
  
  // If still not found, try decryption-based search (slower but more thorough)
  if (!employee && db) {
    console.log(`[getEmployeeByPhone] Trying decryption-based search...`)
    try {
      const allEmployees = await db.collection('employees').find({}).toArray()
      for (const emp of allEmployees) {
        if (emp.mobile && typeof emp.mobile === 'string') {
          try {
            const decryptedMobile = decrypt(emp.mobile)
            // Check if any variation matches
            for (const phoneVar of uniqueVariations) {
              if (decryptedMobile === phoneVar || decryptedMobile.replace(/[\s\-\(\)]/g, '') === phoneVar) {
                // Found match! Fetch with Mongoose
                employee = await Employee.findOne({ _id: emp._id })
                  .populate('companyId', 'id name')
                  .populate('locationId', 'id name address city state pincode')
                  .lean() as any
                console.log(`[getEmployeeByPhone] ✅ Found employee via decryption search`)
                break
              }
            }
            if (employee) break
          } catch (decryptError) {
            // Skip employees with decryption errors
            continue
          }
        }
      }
    } catch (error) {
      console.warn(`[getEmployeeByPhone] Decryption-based search failed:`, error)
    }
  }
  
  if (!employee) {
    console.log(`[getEmployeeByPhone] ❌ Employee not found for phone: ${phone.substring(0, 5)}... (tried ${uniqueVariations.length} variations)`)
    return null
  }
  
  // Ensure companyId is properly set
  if (employee.companyId) {
    if (typeof employee.companyId === 'object' && employee.companyId !== null) {
      if (employee.companyId.id) {
    employee.companyId = employee.companyId.id
      } else if (employee.companyId._id) {
        const db = mongoose.connection.db
           if (!db) {
    throw new Error('Database connection not available')
  }
  if (db) {
          try {
            const companyIdStr = employee.companyId._id.toString()
            const allCompanies = await db.collection('companies').find({}).toArray()
            const companyDoc = allCompanies.find((c: any) => c._id.toString() === companyIdStr)
            if (companyDoc && companyDoc.id) {
    employee.companyId = companyDoc.id
            }
          } catch (error) {
            console.warn(`[getEmployeeByPhone] Error converting companyId:`, error)
          }
        }
      }
    }
  }
  
  // Decrypt sensitive fields (required since we use .lean())
  const sensitiveFields = ['email', 'mobile', 'address', 'firstName', 'lastName', 'designation']
  for (const field of sensitiveFields) {
    if (employee[field] && typeof employee[field] === 'string' && employee[field].includes(':')) {
      try {
        employee[field] = decrypt(employee[field])
      } catch (error) {
        console.warn(`Failed to decrypt field ${field} for employee:`, error)
      }
    }
  }
  
  const plainEmployee = toPlainObject(employee)
  
  // Ensure companyId is converted to company string ID
  if (plainEmployee.companyId) {
    if (typeof plainEmployee.companyId === 'object' && plainEmployee.companyId !== null) {
      if (plainEmployee.companyId.id) {
        plainEmployee.companyId = plainEmployee.companyId.id
      }
    }
  }
  
  return plainEmployee
}

export async function getEmployeeByEmployeeId(employeeId: string): Promise<any | null> {
  await connectDB()
  
  const employee = await Employee.findOne({ employeeId: employeeId })
    .populate('companyId', 'id name')
    .lean() as any
  
  
  const plainEmployee = toPlainObject(employee)
  
  // Ensure companyId is converted to company string ID (not ObjectId)
  if (plainEmployee.companyId) {
    if (typeof plainEmployee.companyId === 'object' && plainEmployee.companyId !== null) {
      if (plainEmployee.companyId.id) {
        plainEmployee.companyId = plainEmployee.companyId.id
      } else if (plainEmployee.companyId._id) {
        const db = mongoose.connection.db
           if (!db) {
    throw new Error('Database connection not available')
  }
  if (db) {
          try {
            const companyIdStr = plainEmployee.companyId._id.toString()
            const allCompanies = await db.collection('companies').find({}).toArray()
            const companyDoc = allCompanies.find((c: any) => c._id.toString() === companyIdStr)
            if (companyDoc && companyDoc.id) {
              plainEmployee.companyId = companyDoc.id
            }
          } catch (error) {
            console.warn(`[getEmployeeByEmployeeId] Error converting companyId:`, error)
          }
        }
      }
    } else if (typeof plainEmployee.companyId === 'string' && /^[0-9a-fA-F]{24}$/.test(plainEmployee.companyId)) {
      const db = mongoose.connection.db
         if (!db) {
    throw new Error('Database connection not available')
  }
  if (db) {
        try {
          const allCompanies = await db.collection('companies').find({}).toArray()
          const companyDoc = allCompanies.find((c: any) => c._id.toString() === plainEmployee.companyId)
          if (companyDoc && companyDoc.id) {
            plainEmployee.companyId = companyDoc.id
          }
        } catch (error) {
          console.warn(`[getEmployeeByEmployeeId] Error converting companyId ObjectId:`, error)
        }
      }
    }
  }
  
  return plainEmployee
}

export async function getEmployeesByCompany(companyId: string): Promise<any[]> {
  await connectDB()
  
  console.log(`[getEmployeesByCompany] Looking up company with id: ${companyId}`)
  const company = await Company.findOne({ id: companyId }).select('_id id name').lean() as any
  if (!company) {
    console.warn(`[getEmployeesByCompany] Company not found with id: ${companyId}`)
    return []
  }

  console.log(`[getEmployeesByCompany] Found company: ${company.name} (${company.id}), ObjectId: ${company._id}`)

  // OPTIMIZATION: Use indexed query directly instead of fetch-all + filter
  // This leverages the companyId index for O(log n) lookup instead of O(n) scan
  // Direct indexed query - much faster than fetch-all
  console.log(`[getEmployeesByCompany] Querying employees with companyId: ${company._id}`)
  const query = Employee.find({ companyId: 
    company._id })
    .populate('companyId', 'id name')
    .populate('locationId', 'id name address city state pincode')
    .populate('addressId') // Populate the Address record

  const employees = await query.lean()
  
  
  // Extract structured address data for employees with addressId
  const { getAddressById } = require('../utils/address-service')
  for (const employee of employees) {
    if (employee.addressId) {
      if (typeof employee.addressId === 'object' && employee.addressId !== null) {
        // Address is populated
    employee.address = {
          address_line_1: 
    employee.addressId.address_line_1 || '',
          address_line_2: 
    employee.addressId.address_line_2 || '',
          address_line_3: 
    employee.addressId.address_line_3 || '',
          city: 
    employee.addressId.city || '',
          state: 
    employee.addressId.state || '',
          pincode: 
    employee.addressId.pincode || '',
          country: 
    employee.addressId.country || 'India',
        }
    employee.addressId = employee.addressId._id?.toString() || 
    employee.addressId.toString()
      } else {
        // addressId exists but not populated - fetch it
        try {
          // Safely convert addressId to string
          const addressIdStr = employee.addressId?.toString ? 
    employee.addressId.toString() : String(employee.addressId)
          if (addressIdStr) {
            const address = await getAddressById(addressIdStr)
          if (address) {
    employee.address = {
              address_line_1: address.address_line_1 || '',
              address_line_2: address.address_line_2 || '',
              address_line_3: address.address_line_3 || '',
              city: address.city || '',
              state: address.state || '',
              pincode: address.pincode || '',
              country: address.country || 'India',
            }
          }
          }
        } catch (error: any) {
          console.warn(`Failed to fetch address for employee ${employee.id}:`, error?.message || error)
          // Continue without address - don't fail the entire request
        }
      }
    }
  }
  
  if (!employees || employees.length === 0) {
    console.warn(`[getEmployeesByCompany] No employees found for company ${companyId} (${company.name})`)
    return []
  }

  // Decrypt sensitive fields (required since we use .lean())
  // CRITICAL: Include 'location' in sensitiveFields for Company Admin - they need to see decrypted locations
  // NOTE: 'address' field is skipped if it's already an object (structured address from addressId)
  const { decrypt } = require('../utils/encryption')
  const companyIdStr = company.id
  const companyStringId = company.id
  
  let decryptedEmployees: any[] = []
  try {
    decryptedEmployees = await Promise.all(employees.map(async (e: any) => {
    if (!e) return null
      try {
    const sensitiveFields = ['email', 'mobile', 'firstName', 'lastName', 'designation', 'location']
    for (const field of sensitiveFields) {
      if (e[field] && typeof e[field] === 'string' && e[field].includes(':')) {
        try {
          e[field] = decrypt(e[field])
        } catch (error) {
          // If decryption fails, keep original value
        }
      }
    }
        
        // Decrypt address fields
        const employeeAddressFields = ['address_line_1', 'address_line_2', 'address_line_3', 'city', 'state', 'pincode']
        for (const field of employeeAddressFields) {
          if (e[field] && typeof e[field] === 'string' && e[field].includes(':')) {
            try {
              e[field] = decrypt(e[field])
      } catch (error) {
        // If decryption fails, keep original value
      }
    }
        }
        
        // Create address object for backward compatibility with UI
        if (e.address_line_1) {
          e.address = {
            address_line_1: e.address_line_1 || '',
            address_line_2: e.address_line_2 || '',
            address_line_3: e.address_line_3 || '',
            city: e.city || '',
            state: e.state || '',
            pincode: e.pincode || '',
            country: e.country || 'India',
          }
        }
        
    // OPTIMIZATION: Set companyId directly from company lookup (already have it)
    if (e.companyId) {
      if (typeof e.companyId === 'object' && e.companyId._id) {
        e.companyId = e.companyId.id || companyStringId
      } else if (typeof e.companyId === 'string' && e.companyId.length === 24 && /^[0-9a-fA-F]{24}$/.test(e.companyId)) {
        // ObjectId string - use the company ID we already have
        e.companyId = companyStringId
      }
        } else {
      // Fallback: set from known company
      e.companyId = companyStringId
    }
        
        return e
      } catch (error: any) {
        console.error(`Error processing employee ${e.id}:`, error?.message || error)
        // Return the employee even if there was an error processing it
        return e
      }
    }))
    decryptedEmployees = decryptedEmployees.filter((e: any) => e !== null)
  } catch (error: any) {
    console.error('[getEmployeesByCompany] Error in Promise.all:', error?.message || error)
    console.error('[getEmployeesByCompany] Error stack:', error?.stack)
    // Return empty array or partial results instead of throwing
    decryptedEmployees = decryptedEmployees || []
  }
  
  // Convert to plain objects
  const plainEmployees = decryptedEmployees.map((e: any) => toPlainObject(e)).filter((e: any) => e !== null)
  
  return plainEmployees
}

export async function getUniqueDesignationsByCompany(companyId: string): Promise<string[]> {
  await connectDB()
  
  const company = await Company.findOne({ id: companyId })
  if (!company) return []

  // Get all employees for this company (we need to decrypt designations)
  // Using find instead of distinct to get decrypted values through Mongoose hooks
  const employees = await Employee.find({ 
    companyId: 
    company._id,
    designation: { $exists: true, $ne: null, $ne: '' }
  })
    .select('designation')
    .lean() as any

  const { decrypt } = require('../utils/encryption')
  // Use a Map to store normalized (lowercase) -> original designation mapping
  // This ensures case-insensitive uniqueness while preserving original case for display
  const designationMap = new Map<string, string>()
  
  for (const emp of employees) {
    if (emp.designation) {
      let designation = emp.designation as string
      
      // Handle both encrypted and plain text designations
      if (typeof designation === 'string') {
        // Check if it looks encrypted (contains ':' which is the separator in our encryption format)
        // But also check if it's a valid base64-like string pattern
        if (designation.includes(':') && designation.length > 20) {
          // Likely encrypted - try to decrypt
          try {
            const decrypted = decrypt(designation)
            // Only use decrypted value if it's valid (not empty, not the same as encrypted)
            if (decrypted && decrypted.trim().length > 0 && decrypted !== designation) {
              designation = decrypted
            }
            // If decryption returns empty or same value, treat as plain text
          } catch (error) {
            // Decryption failed - might be plain text that happens to contain ':'
            // Or might be corrupted data - skip encrypted-looking values
            console.warn(`[getUniqueDesignationsByCompany] Failed to decrypt designation, skipping: ${designation.substring(0, 50)}...`)
            continue
          }
        }
        // If we get here, designation is either plain text or successfully decrypted
        
        // Clean and normalize for case-insensitive uniqueness
        if (designation && typeof designation === 'string' && designation.trim().length > 0) {
          const trimmed = designation.trim()
          
          // Skip if it still looks like encrypted data (very long, base64-like)
          if (trimmed.length > 100 || /^[A-Za-z0-9+/=:]+$/.test(trimmed) && trimmed.length > 50) {
            console.warn(`[getUniqueDesignationsByCompany] Skipping potential encrypted designation: ${trimmed.substring(0, 50)}...`)
            continue
          }
          
          const normalized = trimmed.toLowerCase()
          // Store the first occurrence (or prefer capitalized versions)
          if (!designationMap.has(normalized)) {
            designationMap.set(normalized, trimmed)
          } else {
            // If we already have this designation, prefer the one with better capitalization
            // (e.g., prefer "Co-Pilot" over "co-pilot")
            const existing = designationMap.get(normalized)!
            // Prefer the one that starts with uppercase
            if (trimmed[0] && trimmed[0] === trimmed[0].toUpperCase() && 
                existing[0] && existing[0] !== existing[0].toUpperCase()) {
              designationMap.set(normalized, trimmed)
            }
          }
        }
      }
    }
  }

  // Convert to array and sort alphabetically (case-insensitive)
  return Array.from(designationMap.values()).sort((a, b) => 
    a.toLowerCase().localeCompare(b.toLowerCase())
  )
}

/**
 * Get unique shirt sizes for a company
 * @param companyId Company ID (6-digit numeric string)
 * @returns Array of unique shirt sizes
 */
export async function getUniqueShirtSizesByCompany(companyId: string): Promise<string[]> {
  await connectDB()
  
  const company = await Company.findOne({ id: companyId })
  if (!company) return []

  const employees = await Employee.find({ 
    companyId: company._id,
    shirtSize: { $exists: true, $ne: null, $ne: '' }
  })
    .select('shirtSize')
    .lean() as any

  const sizeSet = new Set<string>()
  
  for (const emp of employees) {
    if (emp.shirtSize) {
      let size = emp.shirtSize as string
      // Check if it's encrypted
      if (typeof size === 'string' && size.includes(':')) {
        try {
          size = decrypt(size)
        } catch (error) {
          continue
        }
      }
      if (size && typeof size === 'string' && size.trim().length > 0) {
        sizeSet.add(size.trim())
      }
    }
  }

  // Sort sizes intelligently (handle numeric and alphanumeric)
  return Array.from(sizeSet).sort((a, b) => {
    // Try to parse as numbers first
    const aNum = parseFloat(a)
    const bNum = parseFloat(b)
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum
    }
    // Otherwise sort alphabetically
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  })
}

/**
 * Get unique pant sizes for a company
 * @param companyId Company ID (6-digit numeric string)
 * @returns Array of unique pant sizes
 */
export async function getUniquePantSizesByCompany(companyId: string): Promise<string[]> {
  await connectDB()
  
  const company = await Company.findOne({ id: companyId })
  if (!company) return []

  const employees = await Employee.find({ 
    companyId: company._id,
    pantSize: { $exists: true, $ne: null, $ne: '' }
  })
    .select('pantSize')
    .lean() as any

  const sizeSet = new Set<string>()
  
  for (const emp of employees) {
    if (emp.pantSize) {
      let size = emp.pantSize as string
      // Check if it's encrypted
      if (typeof size === 'string' && size.includes(':')) {
        try {
          size = decrypt(size)
        } catch (error) {
          continue
        }
      }
      if (size && typeof size === 'string' && size.trim().length > 0) {
        sizeSet.add(size.trim())
      }
    }
  }

  // Sort sizes intelligently (handle numeric and alphanumeric)
  return Array.from(sizeSet).sort((a, b) => {
    const aNum = parseFloat(a)
    const bNum = parseFloat(b)
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum
    }
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  })
}

/**
 * Get unique shoe sizes for a company
 * @param companyId Company ID (6-digit numeric string)
 * @returns Array of unique shoe sizes
 */
export async function getUniqueShoeSizesByCompany(companyId: string): Promise<string[]> {
  await connectDB()
  
  const company = await Company.findOne({ id: companyId })
  if (!company) return []

  const employees = await Employee.find({ 
    companyId: company._id,
    shoeSize: { $exists: true, $ne: null, $ne: '' }
  })
    .select('shoeSize')
    .lean() as any

  const sizeSet = new Set<string>()
  
  for (const emp of employees) {
    if (emp.shoeSize) {
      let size = emp.shoeSize as string
      // Check if it's encrypted
      if (typeof size === 'string' && size.includes(':')) {
        try {
          size = decrypt(size)
        } catch (error) {
          continue
        }
      }
      if (size && typeof size === 'string' && size.trim().length > 0) {
        sizeSet.add(size.trim())
      }
    }
  }

  // Sort sizes intelligently (handle numeric and alphanumeric)
  return Array.from(sizeSet).sort((a, b) => {
    const aNum = parseFloat(a)
    const bNum = parseFloat(b)
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return aNum - bNum
    }
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  })
}

export async function createEmployee(employeeData: {
  employeeId?: string
  firstName: string
  lastName: string
  designation: string
  gender: 'male' | 'female'
  location: string
  email: string
  mobile: string
  shirtSize: string
  pantSize: string
  shoeSize: string
  address?: string // DEPRECATED: Use addressData instead. Kept for backward compatibility.
  addressData?: { // New structured address format
    address_line_1: string
    address_line_2?: string
    address_line_3?: string
    city: string
    state: string
    pincode: string
    country?: string
  }
  companyId: string
  companyName?: string // Optional - will be derived from companyId lookup
  branchId?: string
  branchName?: string
  locationId?: string // Location ID (6-digit numeric string) - official delivery location
  eligibility?: { shirt: number; pant: number; shoe: number; jacket: number }
  cycleDuration?: { shirt: number; pant: number; shoe: number; jacket: number }
  dispatchPreference?: 'direct' | 'central' | 'regional'
  status?: 'active' | 'inactive'
  period?: string
  dateOfJoining?: Date
}): Promise<any> {
  await connectDB()
  
  // Find company by companyId only - companyName is not used for lookup
  const company = await Company.findOne({ id: employeeData.companyId })
  if (!company) {
    throw new Error(`Company not found: ${employeeData.companyId}`)
  }

  // Generate unique 6-digit numeric employee ID if not provided (starting from 300001)
  let employeeId = employeeData.employeeId
  if (!employeeId) {
    // Find the highest existing employee ID
    let nextEmployeeId = 300001
    const existingEmployees = await Employee.find({})
      .sort({ id: -1 })
      .limit(1)
      .lean() as any
    
    if (existingEmployees.length > 0) {
      const lastId = existingEmployees[0].id
      if (/^\d{6}$/.test(String(lastId))) {
        const lastIdNum = parseInt(String(lastId), 10)
        if (lastIdNum >= 300001 && lastIdNum < 400000) {
          nextEmployeeId = lastIdNum + 1
        }
      }
    }
    
    employeeId = String(nextEmployeeId).padStart(6, '0')
    
    // Check if this ID already exists (safety check)
    const existingById = await Employee.findOne({ id: employeeId })
    if (existingById) {
      // Find next available ID
      for (let i = nextEmployeeId + 1; i < 400000; i++) {
        const testId = String(i).padStart(6, '0')
        const exists = await Employee.findOne({ id: testId })
        if (!exists) {
          employeeId = testId
          break
        }
      }
    }
  }

  // Check if employee ID already exists
  const existingById = await Employee.findOne({ id: employeeId })
  if (existingById) {
    throw new Error(`Employee ID already exists: ${employeeId}`)
  }

  // Check if email already exists (email is encrypted, so we need to encrypt the search term)
  const { encrypt } = require('../utils/encryption')
  let encryptedEmail: string
  try {
    encryptedEmail = encrypt(employeeData.email.trim())
  } catch (error) {
    console.warn('Failed to encrypt email for duplicate check:', error)
    encryptedEmail = ''
  }
  
  // Try finding with encrypted email
  let existingByEmail = null
  if (encryptedEmail) {
    existingByEmail = await Employee.findOne({ email: encryptedEmail })
  }
  
  // If not found with encrypted email, also check by decrypting all emails (fallback)
  if (!existingByEmail) {
    const allEmployees = await Employee.find({}).select('email').lean() as any
    for (const emp of allEmployees) {
      if (emp.email && typeof emp.email === 'string') {
        try {
          const { decrypt } = require('../utils/encryption')
          const decryptedEmail = decrypt(emp.email)
          if (decryptedEmail.toLowerCase() === employeeData.email.trim().toLowerCase()) {
            existingByEmail = emp
            break
          }
        } catch (error) {
          // Skip employees with decryption errors
          continue
        }
      }
    }
  }
  
  if (existingByEmail) {
    throw new Error(`Employee with email already exists: ${employeeData.email}`)
  }

  // Handle address - prepare embedded address fields
  let addressFields = {
    address_line_1: 'Address not specified',
    address_line_2: undefined as string | undefined,
    address_line_3: undefined as string | undefined,
    city: 'New Delhi',
    state: 'Delhi',
    pincode: '110001',
    country: 'India',
  }
  
  if (employeeData.addressData) {
    // Use structured address data directly
    addressFields = {
      address_line_1: employeeData.addressData.address_line_1,
      address_line_2: employeeData.addressData.address_line_2,
      address_line_3: employeeData.addressData.address_line_3,
      city: employeeData.addressData.city,
      state: employeeData.addressData.state,
      pincode: employeeData.addressData.pincode,
      country: employeeData.addressData.country || 'India',
    }
  } else if (employeeData.address) {
    // Legacy: If old address string is provided, try to parse it
    const { parseLegacyAddress } = require('../utils/address-service')
    try {
      const parsedAddress = parseLegacyAddress(employeeData.address)
      addressFields = {
        address_line_1: parsedAddress.address_line_1 || employeeData.address.substring(0, 255) || 'Address not specified',
        address_line_2: parsedAddress.address_line_2,
        address_line_3: parsedAddress.address_line_3,
        city: parsedAddress.city || 'New Delhi',
        state: parsedAddress.state || 'Delhi',
        pincode: parsedAddress.pincode || '110001',
        country: parsedAddress.country || 'India',
      }
    } catch (error: any) {
      console.warn(`Failed to parse address from legacy format for employee ${employeeId}:`, error.message)
      // Use default values
      addressFields.address_line_1 = employeeData.address.substring(0, 255) || 'Address not specified'
    }
  }

  // Get location if locationId is provided
  let locationIdObj = null
  if (employeeData.locationId) {
    const Location = require('../models/Location').default
    // Fetch location with populated companyId for reliable company ID extraction
    const location = await Location.findOne({ id: employeeData.locationId })
      .populate('companyId', 'id name')
      .lean() as any
    
    if (!location) {
      console.warn(`[createOrUpdateEmployee] Location not found: ${employeeData.locationId}`);
      return null // Return null instead of throwing - let API route handle 404
    }
    
    // Verify location belongs to the same company
    let locationCompanyId: string | null = null
    if ((location as any).companyId) {
      if (typeof (location as any).companyId === 'object' && (location as any).companyId !== null && !Array.isArray((location as any).companyId)) {
        // Populated company object (from .populate())
        if ((location as any).companyId.id && typeof (location as any).companyId.id === 'string') {
          locationCompanyId = String((location as any).companyId.id).trim()
        } else if ((location as any).companyId._id) {
          // Populated but no id field - fetch company
          const locCompany = await Company.findOne({ id: String(
            (location as any).companyId.id || 
            (location as any).companyId._id) }).select('id').lean() as any
          if (locCompany) {
            locationCompanyId = String(locCompany.id).trim()
          }
        }
      } else if (typeof (location as any).companyId === 'string') {
        // String ID - fetch company
        const locCompany = await Company.findOne({ id: 
          (location as any).companyId }).select('id').lean() as any
        if (locCompany) {
          locationCompanyId = String(locCompany.id).trim()
        }
      }
    }
    
    // Validate that we have a valid company ID
    if (!locationCompanyId) {
      throw new Error(`Cannot determine location's company ID for location ${employeeData.locationId}. The location may have an invalid company association.`)
    }
    
    // Ensure employeeData.companyId is a string for comparison
    const employeeCompanyIdStr = String(employeeData.companyId).trim()
    
    if (locationCompanyId !== employeeCompanyIdStr) {
      throw new Error(`Location ${employeeData.locationId} does not belong to company ${employeeCompanyIdStr}`)
    }
    
    // Get location document _id (since we used .lean(), we need to fetch it again or use the _id from lean result)
    if (location._id) {
      locationIdObj = location._id
    } else {
      // Fallback: fetch location document if _id is missing (shouldn't happen)
      const locationDoc = await Location.findOne({ id: employeeData.locationId })
      if (locationDoc) {
        locationIdObj = locationDoc._id
      } else {
        throw new Error(`Location ${employeeData.locationId} not found when setting employee location`)
      }
    }
  }

  const newEmployee = new Employee({
    id: employeeId,
    employeeId: employeeId,
    firstName: employeeData.firstName,
    lastName: employeeData.lastName,
    designation: employeeData.designation,
    gender: employeeData.gender,
    location: employeeData.location,
    email: employeeData.email,
    mobile: employeeData.mobile,
    shirtSize: employeeData.shirtSize,
    pantSize: employeeData.pantSize,
    shoeSize: employeeData.shoeSize,
    // Set embedded address fields
    address_line_1: addressFields.address_line_1,
    address_line_2: addressFields.address_line_2,
    address_line_3: addressFields.address_line_3,
    city: addressFields.city,
    state: addressFields.state,
    pincode: addressFields.pincode,
    country: addressFields.country,
    companyId: company._id,
    companyName: company.name, // Derived from company lookup, not from input
    locationId: locationIdObj, // Official delivery location (optional for backward compatibility)
    eligibility: employeeData.eligibility || { shirt: 0, pant: 0, shoe: 0, jacket: 0 },
    cycleDuration: employeeData.cycleDuration || { shirt: 6, pant: 6, shoe: 6, jacket: 12 },
    dispatchPreference: employeeData.dispatchPreference || 'direct',
    status: employeeData.status || 'active',
    period: employeeData.period || '2024-2025',
    dateOfJoining: employeeData.dateOfJoining || new Date('2025-10-01T00:00:00.000Z'),
  })

  await newEmployee.save()
  
  // Fetch the created employee with populated fields
  const created = await Employee.findOne({ id: employeeId })
    .populate('companyId', 'id name')
    .populate('locationId', 'id name address city state pincode')
    .lean() as any

  return toPlainObject(created)
}

export async function updateEmployee(
  employeeId: string,
  updateData: {
    firstName?: string
    lastName?: string
    designation?: string
    gender?: 'male' | 'female'
    location?: string
    email?: string
    mobile?: string
    shirtSize?: string
    pantSize?: string
    shoeSize?: string
    address?: string // DEPRECATED: Use addressData instead. Kept for backward compatibility.
    addressData?: { // New structured address format
      address_line_1: string
      address_line_2?: string
      address_line_3?: string
      city: string
      state: string
      pincode: string
      country?: string
    }
    companyId?: string
    // companyName removed - it's derived from companyId lookup only
    locationId?: string // Location ID (6-digit numeric string) - official delivery location
    eligibility?: { shirt: number; pant: number; shoe: number; jacket: number }
    cycleDuration?: { shirt: number; pant: number; shoe: number; jacket: number }
    dispatchPreference?: 'direct' | 'central' | 'regional'
    status?: 'active' | 'inactive'
    period?: string
    dateOfJoining?: Date
  }
): Promise<any> {
  await connectDB()
  
  // Fetch employee with companyId populated for proper validation
  const employee = await Employee.findOne({ id: employeeId })
    .populate('companyId', 'id name')
  
  if (!employee) {
    throw new Error(`Employee not found: ${employeeId}`)
  }

  // Check if email is being updated and if it conflicts with another employee
  // Since email is encrypted, we need to handle this carefully
  if (updateData.email) {
    // Decrypt current employee email to compare
    const { encrypt, decrypt } = require('../utils/encryption')
    let currentEmail = employee.email
    try {
      if (typeof currentEmail === 'string' && currentEmail.includes(':')) {
        currentEmail = decrypt(currentEmail)
      }
    } catch (error) {
      // If decryption fails, keep original
    }
    
    // Only check if email is actually changing
    if (updateData.email.trim().toLowerCase() !== currentEmail.toLowerCase()) {
      // Encrypt the new email to check for duplicates
      let encryptedNewEmail: string
      try {
        encryptedNewEmail = encrypt(updateData.email.trim())
      } catch (error) {
        console.warn('Failed to encrypt email for duplicate check:', error)
        encryptedNewEmail = ''
      }
      
      // Try finding with encrypted email
      let existingByEmail = null
      if (encryptedNewEmail) {
        existingByEmail = await Employee.findOne({ 
          email: encryptedNewEmail,
          _id: { $ne: 
    employee._id }
        })
      }
      
      // If not found, check by decrypting all emails (fallback)
      if (!existingByEmail) {
        const allEmployees = await Employee.find({ _id: { $ne: 
    employee._id } })
          .select('email')
          .lean() as any
        for (const emp of allEmployees) {
          if (emp.email && typeof emp.email === 'string') {
            try {
              const decryptedEmail = decrypt(emp.email)
              if (decryptedEmail.toLowerCase() === updateData.email.trim().toLowerCase()) {
                existingByEmail = emp
                break
              }
            } catch (error) {
              continue
            }
          }
        }
      }
      
      if (existingByEmail) {
        throw new Error(`Employee with email already exists: ${updateData.email}`)
      }
    }
  }

  // Validate and update companyId if provided - it cannot be removed or set to empty
  if (updateData.companyId !== undefined) {
    if (!updateData.companyId || (typeof updateData.companyId === 'string' && updateData.companyId.trim() === '')) {
      throw new Error('companyId cannot be empty or null. Every employee must be associated with a company.')
    }
    
    // Verify the company exists
    const company = await Company.findOne({ id: updateData.companyId })
    if (!company) {
      throw new Error(`Company not found: ${updateData.companyId}`)
    }
    
    // Update companyId - always set from company lookup
    employee.companyId = company._id
    // Update companyName to match the company (derived from companyId, for display purposes only)
    employee.companyName = company.name
  }
  
  // If companyName is provided in updateData, ignore it - it's derived from companyId only
  // This ensures companyName is always in sync with the company table

  // Update location if locationId is provided
  if (updateData.locationId !== undefined) {
    if (updateData.locationId) {
      const Location = require('../models/Location').default
      // Fetch location with populated companyId for reliable company ID extraction
      const location = await Location.findOne({ id: updateData.locationId })
        .populate('companyId', 'id name')
        .lean() as any
      
      if (!location) {
        console.warn(`[updateEmployee] Location not found: ${updateData.locationId}`);
        return null // Return null instead of throwing - let API route handle 404
      }
      
      // Verify location belongs to the employee's company
      // Get employee's company ID - handle both populated and ObjectId cases
      let employeeCompanyId: string | null = null
      if (employee.companyId) {
        if (typeof employee.companyId === 'object' && employee.companyId !== null && !Array.isArray(employee.companyId)) {
          // Populated company object
          if (employee.companyId.id && typeof employee.companyId.id === 'string') {
            employeeCompanyId = String(employee.companyId.id).trim()
          } else if (employee.companyId._id) {
            // Populated but no id field - fetch company
            const empCompany = await Company.findById(
              employee.companyId._id).select('id').lean() as any
            if (empCompany) {
              employeeCompanyId = String(empCompany.id).trim()
            }
          }
        } else if (typeof employee.companyId === 'string' || employee.companyId instanceof mongoose.Types.ObjectId) {
          // ObjectId string or ObjectId - fetch company
          const empCompany = await Company.findById(employee.companyId).select('id').lean() as any
          if (empCompany) {
            employeeCompanyId = String(empCompany.id).trim()
          }
        }
      }
      
      // Get location's company ID - handle both populated and ObjectId cases
      let locationCompanyId: string | null = null
      if ((location as any).companyId) {
        if (typeof (location as any).companyId === 'object' && (location as any).companyId !== null && !Array.isArray((location as any).companyId)) {
          // Populated company object (from .populate())
          if ((location as any).companyId.id && typeof (location as any).companyId.id === 'string') {
            locationCompanyId = String((location as any).companyId.id).trim()
          } else if ((location as any).companyId._id) {
            // Populated but no id field - fetch company
            const locCompany = await Company.findById(
              (location as any).companyId._id).select('id').lean() as any
            if (locCompany) {
              locationCompanyId = String(locCompany.id).trim()
            }
          }
        } else if (typeof (location as any).companyId === 'string' || (location as any).companyId instanceof mongoose.Types.ObjectId) {
          // ObjectId string or ObjectId - fetch company
          const locCompany = await Company.findById((location as any).companyId).select('id').lean() as any
          if (locCompany) {
            locationCompanyId = String(locCompany.id).trim()
          }
        }
      }
      
      // Validate that we have valid company IDs
      if (!employeeCompanyId) {
        throw new Error(`Cannot determine employee's company ID. Please ensure the employee has a valid company association.`)
      }
      
      if (!locationCompanyId) {
        throw new Error(`Cannot determine location's company ID for location ${updateData.locationId}. The location may have an invalid company association.`)
      }
      
      // Debug logging
      console.log(`[updateEmployee] Location-Company validation:`, {
        employeeId: 
    employee.employeeId || 
    employee.id,
        locationId: updateData.locationId,
        employeeCompanyId: employeeCompanyId,
        locationCompanyId: locationCompanyId,
        match: employeeCompanyId === locationCompanyId
      })
      
      // Compare company IDs (both should be strings at this point)
      if (locationCompanyId !== employeeCompanyId) {
        throw new Error(`Location ${updateData.locationId} does not belong to employee's company. Employee company: ${employeeCompanyId}, Location company: ${locationCompanyId}`)
      }
      
      // Set locationId - .lean() preserves _id field
      if (location._id) {
    employee.locationId = location._id
      } else {
        // Fallback: fetch location document if _id is missing (shouldn't happen)
        const locationDoc = await Location.findOne({ id: updateData.locationId })
        if (locationDoc) {
    employee.locationId = locationDoc._id
        } else {
          throw new Error(`Location ${updateData.locationId} not found when setting employee location`)
        }
      }
    } else {
      employee.locationId = undefined
    }
  }

  // Handle address update - set embedded address fields directly
  if (updateData.addressData) {
    // Set structured address fields directly
    employee.address_line_1 = updateData.addressData.address_line_1
    employee.address_line_2 = updateData.addressData.address_line_2
    employee.address_line_3 = updateData.addressData.address_line_3
    employee.city = updateData.addressData.city
    employee.state = updateData.addressData.state
    employee.pincode = updateData.addressData.pincode
    employee.country = updateData.addressData.country || 'India'
  } else if (updateData.address) {
    // Legacy: If old address string is provided, try to parse and set embedded fields
    const { parseLegacyAddress } = require('../utils/address-service')
    try {
      const parsedAddress = parseLegacyAddress(updateData.address)
      // Use dummy values if parsing fails
    employee.address_line_1 = parsedAddress.address_line_1 || updateData.address.substring(0, 255) || 'Address not specified'
    employee.address_line_2 = parsedAddress.address_line_2
    employee.address_line_3 = parsedAddress.address_line_3
    employee.city = parsedAddress.city || 'New Delhi'
    employee.state = parsedAddress.state || 'Delhi'
    employee.pincode = parsedAddress.pincode || '110001'
    employee.country = parsedAddress.country || 'India'
    } catch (error: any) {
      console.warn(`Failed to parse address from legacy format for employee ${employeeId}:`, error.message)
      // Use dummy values
    employee.address_line_1 = updateData.address.substring(0, 255) || 'Address not specified'
    employee.city = 'New Delhi'
    employee.state = 'Delhi'
    employee.pincode = '110001'
    employee.country = 'India'
    }
  }

  // Update other fields
  if (updateData.firstName !== undefined) employee.firstName = updateData.firstName
  if (updateData.lastName !== undefined) employee.lastName = updateData.lastName
  if (updateData.designation !== undefined) employee.designation = updateData.designation
  if (updateData.gender !== undefined) employee.gender = updateData.gender
  if (updateData.location !== undefined) employee.location = updateData.location
  if (updateData.email !== undefined) employee.email = updateData.email
  if (updateData.mobile !== undefined) employee.mobile = updateData.mobile
  if (updateData.shirtSize !== undefined) employee.shirtSize = updateData.shirtSize
  if (updateData.pantSize !== undefined) employee.pantSize = updateData.pantSize
  if (updateData.shoeSize !== undefined) employee.shoeSize = updateData.shoeSize
  // Address fields are handled above via addressData or legacy address parsing
  if (updateData.eligibility !== undefined) employee.eligibility = updateData.eligibility
  if (updateData.cycleDuration !== undefined) employee.cycleDuration = updateData.cycleDuration
  if (updateData.dispatchPreference !== undefined) employee.dispatchPreference = updateData.dispatchPreference
  if (updateData.status !== undefined) employee.status = updateData.status
  if (updateData.period !== undefined) employee.period = updateData.period
  if (updateData.dateOfJoining !== undefined) employee.dateOfJoining = updateData.dateOfJoining

  await 
    employee.save()
  
  // Fetch the updated employee with populated fields
  const updated = await Employee.findOne({ id: employeeId })
    .populate('companyId', 'id name')
    .populate('locationId', 'id name address city state pincode')
    .lean() as any

  
  // Since we used .lean(), the post hooks don't run, so we need to manually decrypt sensitive fields
  const { decrypt } = require('../utils/encryption')
  const sensitiveFields = ['email', 'mobile', 'address', 'firstName', 'lastName', 'designation']
  for (const field of sensitiveFields) {
    if (updated[field] && typeof updated[field] === 'string' && updated[field].includes(':')) {
      try {
        updated[field] = decrypt(updated[field])
      } catch (error) {
        console.warn(`Failed to decrypt field ${field} for employee ${employeeId}:`, error)
      }
    }
  }

  return toPlainObject(updated)
}

export async function deleteEmployee(employeeId: string): Promise<boolean> {
  await connectDB()
  
  const employee = await Employee.findOne({ id: employeeId })
  if (!employee) {
    throw new Error(`Employee not found: ${employeeId}`)
  }

  await Employee.deleteOne({ id: employeeId })
  return true
}

// ========== VENDOR-PRODUCT-COMPANY MAPPING FUNCTIONS ==========

/**
 * Find which vendor(s) supply a specific product to a specific company
 * Returns an array of vendors (for multi-vendor support), or empty array if no vendors found
 * If preferFirst is true, returns only the first vendor (for backward compatibility)
 */
export async function getVendorsForProductCompany(
  productId: string, 
  companyId: string | number, 
  preferFirst: boolean = true
): Promise<Array<{ vendorId: string, vendorName: string }>> {
  await connectDB()
  
  console.log(`[getVendorsForProductCompany] ===== FUNCTION CALLED =====`)
  console.log(`[getVendorsForProductCompany] Looking for productId=${productId} (type: ${typeof productId}), companyId=${companyId} (type: ${typeof companyId})`)
  
  // Find product and company by their string/numeric IDs
  // Handle both string and numeric product IDs
  let product = await Uniform.findOne({ id: productId })
  if (!product) {
    // If productId is numeric, try converting to string
    const productIdStr = String(productId)
    product = await Uniform.findOne({ id: productIdStr })
  }
  if (!product) {
    // If productId is string, try converting to number
    const productIdNum = Number(productId)
    if (!isNaN(productIdNum)) {
      product = await Uniform.findOne({ id: productIdNum })
    }
  }
  if (!product) {
    console.error(`[getVendorsForProductCompany] Product not found: ${productId} (type: ${typeof productId})`)
    // List available products for debugging
    const allProducts = await Uniform.find({}, 'id name').limit(5).lean() as any
    return []
  }
  
  // Try to find company - handle both numeric and string IDs
  let company = await Company.findOne({ id: companyId })
  if (!company) {
    // If companyId is numeric, try converting to string
    const companyIdStr = String(companyId)
    company = await Company.findOne({ id: companyIdStr })
  }
  
  if (!company) {
    console.error(`[getVendorsForProductCompany] Company not found: ${companyId} (type: ${typeof companyId})`)
    // List available companies for debugging
    const allCompanies = await Company.find({}, 'id name').limit(5).lean() as any
    return []
  }
  
  console.log(`[getVendorsForProductCompany] Found product: ${product.id}, company: ${company.id}`)
  console.log(`[getVendorsForProductCompany] Product _id: ${product._id}, Company _id: ${company._id}`)
  
  // Check if product is directly linked to company
  // Use raw MongoDB as fallback for more reliable lookup
  const db = mongoose.connection.db
     if (!db) {
    throw new Error('Database connection not available')
  }
  let productCompanyLink = await ProductCompany.findOne({
    productId: 
    product._id,
    companyId: 
    company._id
  })
  
  // Fallback: use raw MongoDB collection if Mongoose lookup fails
  if (!productCompanyLink && db) {
    console.log(`[getVendorsForProductCompany] ProductCompany not found via Mongoose, trying raw MongoDB collection`)
    const rawProductCompanies = await db.collection('productcompanies').find({
      productId: 
    product._id,
      companyId: 
    company._id
    }).toArray()
    
    if (rawProductCompanies.length > 0) {
      console.log(`[getVendorsForProductCompany] ✓ Found ProductCompany link in raw collection`)
      // Set productCompanyLink to a truthy value so the function continues
      // We know the relationship exists, so we can proceed even if Mongoose query fails
      productCompanyLink = rawProductCompanies[0] as any
    }
  }
  
  if (!productCompanyLink) {
    console.error(`[getVendorsForProductCompany] ❌ Product ${productId} (${
    product.name || 
    product.id}) is not linked to company ${companyId} (${
    company.name || 
    company.id})`)
    console.error(`[getVendorsForProductCompany] Product _id: ${product._id}, Company _id: ${company._id}`)
    // List existing ProductCompany relationships for debugging
    const allProductCompanies = await ProductCompany.find({ productId: 
    product._id }).populate('companyId', 'id name').limit(5).lean() as any
    
    // Also check raw collection
    if (db) {
      const rawProductCompanies = await db.collection('productcompanies').find({ productId: 
    product._id }).toArray()
      console.error(`[getVendorsForProductCompany] Raw ProductCompany links for product:`, rawProductCompanies.map((pc: any) => `companyId=${pc.companyId?.toString()}`))
    }
    return []
  }
  
  console.log(`[getVendorsForProductCompany] ✓ Product-Company link found`)
  
  // ALWAYS use raw MongoDB for ProductVendor lookup - most reliable method
  if (!db) {
    console.error(`[getVendorsForProductCompany] Database connection not available`)
    return []
  }
  
  const productIdStr = product._id.toString()
  console.log(`[getVendorsForProductCompany] Searching for ProductVendor links with productId: ${productIdStr}`)
  
  // Get all ProductVendor links from raw collection
  const rawProductVendors = await db.collection('productvendors').find({}).toArray()
  console.log(`[getVendorsForProductCompany] Total ProductVendor links in DB: ${rawProductVendors.length}`)
  
  console.log(`[getVendorsForProductCompany] Filtering by productId=${productIdStr}`)
  
  // Filter by productId - ProductCompany link already validates company access
  // ProductVendor links are product-vendor only (no companyId needed)
  const matchingLinks = rawProductVendors.filter((pv: any) => {
    if (!pv.productId) return false
    const pvProductIdStr = pv.productId.toString()
    return pvProductIdStr === productIdStr
  })
  
  console.log(`[getVendorsForProductCompany] Found ${matchingLinks.length} ProductVendor link(s) for product ${productId} and company ${companyId}`)
  
  if (matchingLinks.length === 0) {
    console.error(`[getVendorsForProductCompany] ❌ No ProductVendor relationships found for product ${productId} (${
    product.name || 
    product.id})`)
    console.error(`[getVendorsForProductCompany] Product _id: ${productIdStr}`)
    console.error(`[getVendorsForProductCompany] All ProductVendor links in DB:`)
    rawProductVendors.forEach((pv: any, i: number) => {
      console.error(`  ${i + 1}. productId: ${pv.productId?.toString()}, vendorId: ${pv.vendorId?.toString()}`)
    })
    return []
  }
  
  // Get all vendors for lookup
  const allVendors = await db.collection('vendors').find({}).toArray()
  const vendorMap = new Map<string, { id: string, name: string, _id: any }>()
  allVendors.forEach((v: any) => {
    vendorMap.set(v._id.toString(), { id: v.id, name: v.name, _id: v._id })
  })
  
  // Extract vendor information from matching links
  const matchingVendors: Array<{ vendorId: string, vendorName: string }> = []
  const uniqueVendorIds = new Set<string>()
  
  for (const pvLink of matchingLinks) {
    if (!pvLink.vendorId) {
      console.warn(`[getVendorsForProductCompany] ProductVendor link has no vendorId`)
      continue
    }
    
    const vendorIdStr = pvLink.vendorId.toString()
    
    // CRITICAL FIX: Deduplicate vendors (prevent same vendor added multiple times)
    if (uniqueVendorIds.has(vendorIdStr)) {
      console.warn(`[getVendorsForProductCompany] ⚠️ Duplicate ProductVendor link detected for vendorId: ${vendorIdStr}`)
      continue
    }
    uniqueVendorIds.add(vendorIdStr)
    
    const vendor = vendorMap.get(vendorIdStr)
    
    if (vendor) {
      matchingVendors.push({
        vendorId: vendor.id,
        vendorName: vendor.name || 'Unknown Vendor'
      })
      console.log(`[getVendorsForProductCompany] ✓ Added vendor: ${vendor.id} (${vendor.name})`)
    } else {
      console.warn(`[getVendorsForProductCompany] Vendor not found for vendorId: ${vendorIdStr}`)
    }
  }
  
  // CRITICAL VALIDATION: A product should only be linked to ONE vendor
  // If multiple vendors are found, this indicates a data integrity issue
  if (matchingVendors.length > 1) {
    console.error(`[getVendorsForProductCompany] ❌ CRITICAL: Product ${productId} (${
    product.name || 
    product.id}) is linked to MULTIPLE vendors!`)
    console.error(`[getVendorsForProductCompany] This violates the business rule: "A product can only be linked to one vendor"`)
    console.error(`[getVendorsForProductCompany] Vendors found:`, matchingVendors.map(v => `${v.vendorId} (${v.vendorName})`))
    console.error(`[getVendorsForProductCompany] ⚠️ Returning FIRST vendor, but this is a DATA INTEGRITY ISSUE`)
    console.error(`[getVendorsForProductCompany] ⚠️ Please fix ProductVendor relationships in the database`)
    
    // Return first vendor but log the issue
    // In production, you might want to throw an error instead
    return [matchingVendors[0]]
  }
  
  // Return results
  if (matchingVendors.length === 0) {
    console.error(`[getVendorsForProductCompany] No vendors found for product ${productId}`)
  } else {
    console.log(`[getVendorsForProductCompany] ✓ Returning ${matchingVendors.length} vendor(s):`, matchingVendors.map(v => `${v.vendorId} (${v.vendorName})`))
  }
  
  // If preferFirst is true, return only the first vendor
  if (preferFirst && matchingVendors.length > 0) {
    return [matchingVendors[0]]
  }
  
  return matchingVendors
}

/**
 * Find which vendor supplies a specific product to a specific company
 * Returns the vendor ID and name, or null if no vendor found
 * This is a convenience wrapper that returns only the first vendor (for backward compatibility)
 */
export async function getVendorForProductCompany(productId: string, companyId: string): Promise<{ vendorId: string, vendorName: string } | null> {
  await connectDB()
  
  const vendors = await getVendorsForProductCompany(productId, companyId, true)
  return vendors.length > 0 ? vendors[0] : null
}

// ========== ORDER FUNCTIONS ==========

export async function getAllOrders(): Promise<any[]> {
  await connectDB()
  
  const orders = await Order.find()
    .populate('employeeId', 'id firstName lastName email')
    .populate('companyId', 'id name')
    .populate('items.uniformId', 'id name')
    .sort({ orderDate: -1 })
    .lean() as any

}

export async function getOrdersByCompany(companyId: string): Promise<any[]> {
  await connectDB()
  
  const company = await Company.findOne({ id: companyId })
  if (!company) return []

  const orders = await Order.find({ companyId: company._id })
    .populate('employeeId', 'id firstName lastName email locationId')
    .populate('companyId', 'id name')
    .populate('items.uniformId', 'id name')
    .sort({ orderDate: -1 })
    .lean() as any

  // Fetch vendor names for all unique vendorIds
  const vendorIds = [...new Set(orders.map((o: any) => o.vendorId).filter(Boolean))]
  const vendors = await Vendor.find({ id: { $in: vendorIds } }).select('id name').lean() as any

  const transformedOrders = orders.map((o: any) => {
    const plain = toPlainObject(o)
    // Add vendorName from vendorMap if missing
    if (!plain.vendorName && plain.vendorId && vendorMap.has(plain.vendorId)) {
      plain.vendorName = vendorMap.get(plain.vendorId)
    }
    return plain
  })
  
  // Debug logging
  if (transformedOrders.length > 0) {
    console.log(`getOrdersByCompany(${companyId}): Found ${transformedOrders.length} orders`)
    const firstOrder = transformedOrders[0]
    console.log('Sample order:', {
      id: firstOrder.id,
      total: firstOrder.total,
      itemsCount: firstOrder.items?.length,
      vendorName: firstOrder.vendorName,
      vendorId: firstOrder.vendorId,
      items: firstOrder.items?.map((i: any) => ({ price: i.price, quantity: i.quantity, total: i.price * i.quantity }))
    })
  }
  
  return transformedOrders
}

/**
 * Get all orders for employees in a specific location
 * @param locationId Location ID (6-digit numeric string or ObjectId)
 * @returns Array of orders for employees in that location
 */
export async function getOrdersByLocation(locationId: string): Promise<any[]> {
  await connectDB()
  
  const Location = require('../models/Location').default
  const location = await Location.findOne({ 
    $or: [
      { id: locationId },
      { _id: locationId }
    ]
  })
  
  if (!location) {
    return []
  }

  // Get all employees in this location
  const locationEmployees = await Employee.find({ locationId: location._id })
    .select('_id employeeId id')
    .lean() as any
  
  if (locationEmployees.length === 0) {
    return []
  }

  // Get employee ObjectIds
  // Get employee string IDs
  const employeeIds = locationEmployees.map((e: any) => e.id || e.employeeId).filter((id: any) => id)

  // Find orders for these employees
  const orders = await Order.find({ employeeId: { $in: employeeIds } })
    .populate('employeeId', 'id firstName lastName email locationId')
    .populate('companyId', 'id name')
    .populate('items.uniformId', 'id name')
    .sort({ orderDate: -1 })
    .lean() as any

  // Fetch vendor names for all unique vendorIds
  const vendorIds = [...new Set(orders.map((o: any) => o.vendorId).filter(Boolean))]
  const vendors = await Vendor.find({ id: { $in: vendorIds } }).select('id name').lean() as any
  const vendorMap = new Map(vendors.map((v: any) => [v.id, v.name]))

  return orders.map((o: any) => {
    const plain = toPlainObject(o)
    // Add vendorName from vendorMap if missing
    if (!plain.vendorName && plain.vendorId && vendorMap.has(plain.vendorId)) {
      plain.vendorName = vendorMap.get(plain.vendorId)
    }
    return plain
  })
}

export async function getOrdersByVendor(vendorId: string): Promise<any[]> {
  await connectDB()
  
  console.log(`[getOrdersByVendor] ========================================`)
  console.log(`[getOrdersByVendor] 🚀 FETCHING ORDERS FOR VENDOR: ${vendorId}`)
  
  // Find vendor - use string ID only
  const vendor = await Vendor.findOne({ id: vendorId })
  
  if (!vendor) {
    console.error(`[getOrdersByVendor] ❌ Vendor not found: ${vendorId}`)
    // List available vendors for debugging
    const allVendors = await Vendor.find({}, 'id name _id').limit(5).lean() as any
    return []
  }
  
  console.log(`[getOrdersByVendor] ✅ Vendor found: ${vendor.name} (id: ${vendor.id}, _id: ${vendor._id})`)

  // CRITICAL FIX: Orders now store vendorId as 6-digit numeric string, NOT ObjectId
  // Query using 
    // vendor.id (numeric string) instead of vendor._id (ObjectId)
  const vendorNumericId = String(vendor.id).trim()
  console.log(`[getOrdersByVendor] Querying orders with vendorId (numeric): ${vendorNumericId}`)
  
  // Query orders by numeric vendor ID (6-digit string)
  // CRITICAL: Vendors should ONLY see orders that are:
  // - Approved by Company Admin (pr_status = 'COMPANY_ADMIN_APPROVED')
  // - OR have PO created (pr_status = 'PO_CREATED')
  // - OR are replacement orders (orderType = 'REPLACEMENT') - these are auto-approved
  // This ensures vendors don't see orders until Company Admin approval and PO assignment
  // Replacement orders are an exception as they're created after company admin approval of return request
  const vendorOrderQuery: any = {
    vendorId: vendorNumericId,
    $or: [
      { pr_status: { $in: ['COMPANY_ADMIN_APPROVED', 'PO_CREATED'] } },
      { orderType: 'REPLACEMENT' }
    ]
  }
  
  console.log(`[getOrdersByVendor] Filtering orders: vendorId=${vendorNumericId}, (pr_status in [COMPANY_ADMIN_APPROVED, PO_CREATED] OR orderType = REPLACEMENT)`)
  
  // Include PR fields (pr_number, pr_date) for display
  // Include shipping_address fields for destination address display
  // Include orderType and returnRequestId for replacement orders
  // Note: items array includes all fields (dispatchedQuantity, deliveredQuantity) automatically
  let orders = await Order.find(vendorOrderQuery)
    .select('id employeeId employeeName items total status orderDate dispatchLocation companyId deliveryAddress parentOrderId vendorId vendorName isPersonalPayment personalPaymentAmount createdAt pr_number pr_date pr_status deliveryStatus dispatchStatus shipping_address_line_1 shipping_address_line_2 shipping_address_line_3 shipping_city shipping_state shipping_pincode shipping_country orderType returnRequestId')
    .populate('employeeId', 'id firstName lastName email locationId')
    .populate('companyId', 'id name')
    .populate('items.uniformId', 'id name')
    .sort({ orderDate: -1 })
    .lean() as any
  
  
  // If no orders found with numeric ID, try ObjectId as fallback (for legacy orders)
  // Apply same approval filter for legacy orders
  if (orders.length === 0 && mongoose.Types.ObjectId.isValid(vendorNumericId) === false) {
    console.log(`[getOrdersByVendor] No orders found with numeric ID, trying ObjectId fallback for legacy orders...`)
    const legacyOrderQuery: any = {
      vendorId: 
    vendor._id,
      $or: [
        { pr_status: { $in: ['COMPANY_ADMIN_APPROVED', 'PO_CREATED'] } },
        { orderType: 'REPLACEMENT' }
      ]
    }
    const legacyOrders = await Order.find(legacyOrderQuery)
      .select('id employeeId employeeName items total status orderDate dispatchLocation companyId deliveryAddress parentOrderId vendorId vendorName isPersonalPayment personalPaymentAmount createdAt pr_number pr_date pr_status deliveryStatus dispatchStatus shipping_address_line_1 shipping_address_line_2 shipping_address_line_3 shipping_city shipping_state shipping_pincode shipping_country orderType returnRequestId')
      .populate('employeeId', 'id firstName lastName email locationId')
      .populate('companyId', 'id name')
      .populate('items.uniformId', 'id name')
      .sort({ orderDate: -1 })
      .lean() as any
    
    console.log(`[getOrdersByVendor] Found ${legacyOrders.length} approved legacy order(s) with ObjectId vendorId (after Company Admin approval filter)`)
    console.log(`[getOrdersByVendor] ⚠️ These orders should be migrated to use numeric vendorId`)
    orders = legacyOrders
  }
  
  if (orders.length === 0) {
    console.log(`[getOrdersByVendor] ✅ No orders found for vendor ${vendor.name} (${vendor.id})`)
    console.log(`[getOrdersByVendor] This is expected if vendor has no orders`)
  }
  
  // Add vendor name to orders (since vendorId is now a string, not a populated reference)
  const vendorName = vendor.name
  orders = orders.map((order: any) => ({
    ...order,
    vendorName: vendorName,
    vendorId: vendorNumericId // Ensure vendorId is the numeric string
  }))
  
  // Fetch PO and PR numbers for orders via POOrder mapping
  const poMap = new Map<string, any[]>()
  
  if (orders.length > 0) {
    try {
      const orderIds = orders.map((o: any) => o._id).filter(Boolean)
      
      if (orderIds.length > 0) {
        const poOrderMappings = await POOrder.find({ order_id: { $in: orderIds } })
          .populate('purchase_order_id', 'id client_po_number po_date')
          .lean() as any
        
        for (const mapping of poOrderMappings) {
          const orderId = (mapping.order_id as any)?.toString()
          const po = mapping.purchase_order_id as any
          
          if (orderId && po) {
            if (!poMap.has(orderId)) {
              poMap.set(orderId, [])
            }
            poMap.get(orderId)!.push({
              poNumber: po?.client_po_number || '',
              poId: po?.id || '',
              poDate: po?.po_date || null
            })
          }
        }
      }
    } catch (error: any) {
      console.error(`[getOrdersByVendor] ⚠️ Error fetching PO mappings:`, error.message)
      // Continue without PO details rather than failing completely
    }
  }
  
  // Add PO and PR numbers to orders
  orders = orders.map((order: any) => {
    const orderId = order._id?.toString()
    const poDetails = orderId ? (poMap.get(orderId) || []) : []
    return {
      ...order,
      poNumbers: poDetails.map((po: any) => po.poNumber).filter(Boolean),
      poDetails: poDetails, // Full PO details array
      prNumber: order.pr_number || null, // PR number is already in order
      prDate: order.pr_date || null
    }
  })
  
  // Log order details for debugging
  console.log(`[getOrdersByVendor] 📋 Order Summary:`)
  orders.forEach((order: any, idx: number) => {
    console.log(`[getOrdersByVendor]   ${idx + 1}. Order ID: ${order.id}, Status: ${order.status}, PR: ${order.prNumber || 'N/A'}, PO: ${order.poNumbers?.join(', ') || 'N/A'}, ParentOrderId: ${(order as any).parentOrderId || 'N/A'}, VendorId: ${order.vendorId || 'N/A'}`)
  })
  
  // CRITICAL: Check for split orders (orders with parentOrderId)
  const splitOrders = orders.filter((o: any) => o.parentOrderId)
  if (splitOrders.length > 0) {
    console.log(`[getOrdersByVendor] 📦 Found ${splitOrders.length} split order(s) (with parentOrderId)`)
    splitOrders.forEach((order: any) => {
      console.log(`[getOrdersByVendor]   - ${order.id} (parent: ${order.parentOrderId})`)
    })
  }
  
  console.log(`[getOrdersByVendor] ✅ Returning ${orders.length} order(s)`)
  console.log(`[getOrdersByVendor] ========================================`)

  return orders.map((o: any) => toPlainObject(o))
}

// ========== VENDOR REPORTS FUNCTIONS ==========

/**
 * Get sales patterns for a vendor (daily, weekly, monthly trends)
 */
export async function getVendorSalesPatterns(vendorId: string, period: 'daily' | 'weekly' | 'monthly' = 'monthly'): Promise<{
  period: string
  revenue: number
  orderCount: number
  avgOrderValue: number
}[]> {
  await connectDB()
  
  const vendor = await Vendor.findOne({ id: vendorId })
  if (!vendor) return []

  const orders = await Order.find({ vendorId: vendor._id })
    .select('orderDate total status')
    .lean() as any


  // Group orders by period
  const periodMap = new Map<string, { revenue: number; orderCount: number }>()

  orders.forEach((order: any) => {
    const date = new Date(order.orderDate)
    let periodKey = ''

    if (period === 'daily') {
      periodKey = date.toISOString().split('T')[0] // YYYY-MM-DD
    } else if (period === 'weekly') {
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay()) // Start of week (Sunday)
      periodKey = weekStart.toISOString().split('T')[0]
    } else { // monthly
      periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` // YYYY-MM
    }

    if (!periodMap.has(periodKey)) {
      periodMap.set(periodKey, { revenue: 0, orderCount: 0 })
    }

    const periodData = periodMap.get(periodKey)!
    periodData.revenue += order.total || 0
    periodData.orderCount += 1
  })

  // Convert to array and sort by period
  const patterns = Array.from(periodMap.entries())
    .map(([periodKey, data]) => ({
      period: periodKey,
      revenue: data.revenue,
      orderCount: data.orderCount,
      avgOrderValue: data.orderCount > 0 ? data.revenue / data.orderCount : 0
    }))
    .sort((a, b) => a.period.localeCompare(b.period))

  return patterns
}

/**
 * Get order status breakdown for a vendor
 */
export async function getVendorOrderStatusBreakdown(vendorId: string): Promise<{
  status: string
  count: number
  revenue: number
  percentage: number
}[]> {
  await connectDB()
  
  const vendor = await Vendor.findOne({ id: vendorId })
  if (!vendor) return []

  const orders = await Order.find({ vendorId: vendor._id })
    .select('status total')
    .lean() as any


  const statusMap = new Map<string, { count: number; revenue: number }>()

  orders.forEach((order: any) => {
    const status = order.status || 'Unknown'
    if (!statusMap.has(status)) {
      statusMap.set(status, { count: 0, revenue: 0 })
    }
    const statusData = statusMap.get(status)!
    statusData.count += 1
    statusData.revenue += order.total || 0
  })

  const totalOrders = orders.length

  return Array.from(statusMap.entries())
    .map(([status, data]) => ({
      status,
      count: data.count,
      revenue: data.revenue,
      percentage: totalOrders > 0 ? (data.count / totalOrders) * 100 : 0
    }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Get business volume per company for a vendor
 */
export async function getVendorBusinessVolumeByCompany(vendorId: string): Promise<{
  companyId: string
  companyName: string
  orderCount: number
  revenue: number
  avgOrderValue: number
  percentage: number
}> {
  await connectDB()
  
  const vendor = await Vendor.findOne({ id: vendorId })
  if (!vendor) return []

  const orders = await Order.find({ vendorId: vendor._id })
    .populate('companyId', 'id name')
    .select('companyId total')
    .lean() as any


  const companyMap = new Map<string, { companyName: string; orderCount: number; revenue: number }>()
  let totalRevenue = 0

  orders.forEach((order: any) => {
    const companyId = order.companyId?._id?.toString() || order.companyId?.toString() || 'Unknown'
    const companyName = order.companyId?.name || 'Unknown Company'
    const revenue = order.total || 0

    if (!companyMap.has(companyId)) {
      companyMap.set(companyId, { companyName, orderCount: 0, revenue: 0 })
    }

    const companyData = companyMap.get(companyId)!
    companyData.orderCount += 1
    companyData.revenue += revenue
    totalRevenue += revenue
  })

  return Array.from(companyMap.entries())
    .map(([companyId, data]) => ({
      companyId,
      companyName: data.companyName,
      orderCount: data.orderCount,
      revenue: data.revenue,
      avgOrderValue: data.orderCount > 0 ? data.revenue / data.orderCount : 0,
      percentage: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0
    }))
    .sort((a, b) => b.revenue - a.revenue)
}

/**
 * Get comprehensive vendor report data
 */
export async function getVendorReports(vendorId: string): Promise<{
  salesPatterns: {
    daily: Array<{ period: string; revenue: number; orderCount: number; avgOrderValue: number }>
    weekly: Array<{ period: string; revenue: number; orderCount: number; avgOrderValue: number }>
    monthly: Array<{ period: string; revenue: number; orderCount: number; avgOrderValue: number }>
  }
  orderStatusBreakdown: Array<{ status: string; count: number; revenue: number; percentage: number }>
  businessVolumeByCompany: Array<{ companyId: string; companyName: string; orderCount: number; revenue: number; avgOrderValue: number; percentage: number }>
  summary: {
    totalRevenue: number
    totalOrders: number
    avgOrderValue: number
    totalCompanies: number
  }
}> {
  await connectDB()
  
  const vendor = await Vendor.findOne({ id: vendorId })
  if (!vendor) {
    console.warn(`[updateVendor] Vendor not found: ${vendorId}`);
    return null // Return null instead of throwing - let API route handle 404
  }

  const [salesPatternsDaily, salesPatternsWeekly, salesPatternsMonthly, orderStatusBreakdown, businessVolumeByCompany] = await Promise.all([
    getVendorSalesPatterns(vendorId, 'daily'),
    getVendorSalesPatterns(vendorId, 'weekly'),
    getVendorSalesPatterns(vendorId, 'monthly'),
    getVendorOrderStatusBreakdown(vendorId),
    getVendorBusinessVolumeByCompany(vendorId)
  ])

  // Calculate summary
  const totalRevenue = orderStatusBreakdown.reduce((sum: any, item: any) => sum + item.revenue, 0)
  const totalOrders = orderStatusBreakdown.reduce((sum: any, item: any) => sum + item.count, 0)
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
  const totalCompanies = businessVolumeByCompany.length

  return {
    salesPatterns: {
      daily: salesPatternsDaily,
      weekly: salesPatternsWeekly,
      monthly: salesPatternsMonthly
    },
    orderStatusBreakdown,
    businessVolumeByCompany,
    summary: {
      totalRevenue,
      totalOrders,
      avgOrderValue,
      totalCompanies
    }
  }
}

/**
 * Calculate aggregated order status for multi-vendor (split) orders
 * 
 * This function implements granular status display for employee-facing order views:
 * - Dispatch status: "Awaiting Dispatch" | "Partially Dispatched" | "Dispatched"
 * - Delivery status: "Awaiting Delivery" | "Partially Delivered" | "Delivered"
 * 
 * @param splitOrders Array of child orders (vendor suborders) for a split order
 * @returns Aggregated status string for employee display
 */
function calculateAggregatedOrderStatus(splitOrders: any[]): string {
  if (!splitOrders || splitOrders.length === 0) {
    return 'Awaiting approval'
  }
  
  // For single-vendor orders, return the status as-is (no aggregation needed)
  if (splitOrders.length === 1) {
    return splitOrders[0].status || 'Awaiting approval'
  }
  
  // Count orders by status
  const statusCounts = {
    'Awaiting approval': 0,
    'Awaiting fulfilment': 0,
    'Dispatched': 0,
    'Delivered': 0
  }
  
  splitOrders.forEach((order: any) => {
    const status = order.status || 'Awaiting approval'
    if (status in statusCounts) {
      statusCounts[status as keyof typeof statusCounts]++
    }
  })
  
  const totalOrders = splitOrders.length
  
  // DELIVERY STATUS (highest priority - check delivery first)
  const deliveredCount = statusCounts['Delivered']
  if (deliveredCount > 0) {
    if (deliveredCount === totalOrders) {
      // All orders delivered
      return 'Delivered'
    } else {
      // Some delivered, some not
      return 'Partially Delivered'
    }
  }
  
  // STEP 2: DISPATCH STATUS (check dispatch if not all delivered)
  const dispatchedCount = statusCounts['Dispatched']
  const awaitingFulfilmentCount = statusCounts['Awaiting fulfilment']
  const awaitingApprovalCount = statusCounts['Awaiting approval']
  
  // If any orders are still awaiting approval, return that status
  // (Can't have dispatch/delivery status if still in approval)
  if (awaitingApprovalCount > 0) {
    return 'Awaiting approval'
  }
  
  // All remaining orders are either "Awaiting fulfilment" or "Dispatched"
  if (dispatchedCount === 0) {
    // None dispatched - all are in "Awaiting fulfilment"
    // This means we're "Awaiting Dispatch"
    return 'Awaiting Dispatch'
  } else if (dispatchedCount === totalOrders) {
    // All dispatched (but not delivered)
    // This means we're "Awaiting Delivery"
    return 'Awaiting Delivery'
  } else {
    // Some dispatched, some still in "Awaiting fulfilment"
    return 'Partially Dispatched'
  }
}

export async function getOrdersByEmployee(employeeId: string): Promise<any[]> {
  await connectDB()
  
  // OPTIMIZATION: Combine employee lookups into single query with $or
  const employee = await Employee.findOne({
    $or: [
      { employeeId: employeeId },
      { id: employeeId }
    ]
  }).select('_id employeeId id').lean()
  
  if (!employee) {
    return []
  }

  // OPTIMIZATION: Build query conditions once, use indexed fields
  const employeeIdNum = employee.employeeId || employee.id
  const orderQueryConditions: any[] = [
    { employeeId: 
    employee._id } // Primary: ObjectId reference (indexed)
  ]
  
  // Add employeeIdNum conditions for backward compatibility
  if (employeeIdNum) {
    orderQueryConditions.push({ employeeIdNum: employeeIdNum })
    if (typeof employeeIdNum !== 'string') {
      orderQueryConditions.push({ employeeIdNum: String(employeeIdNum) })
    }
  }
  
  const orderQuery: any = orderQueryConditions.length > 1 ? { $or: orderQueryConditions } : orderQueryConditions[0]

  // OPTIMIZATION: Use select() to limit fields, reduce payload size
  const orders = await Order.find(orderQuery)
    .select('id employeeId employeeIdNum employeeName items total status orderDate dispatchLocation companyId deliveryAddress parentOrderId vendorId vendorName isPersonalPayment personalPaymentAmount createdAt')
    .populate('employeeId', 'id firstName lastName email')
    .populate('companyId', 'id name')
    .populate('items.uniformId', 'id name')
    .sort({ orderDate: -1 })
    .lean() as any
  
  // Fetch vendor names for all unique vendorIds
  const vendorIds = [...new Set(orders.map((o: any) => o.vendorId).filter(Boolean))]
  const vendors = await Vendor.find({ id: { $in: vendorIds } }).select('id name').lean() as any
  
  // Add vendorName to orders
  orders.forEach((o: any) => {
    if (!o.vendorName && o.vendorId && vendorMap.has(o.vendorId)) {
      o.vendorName = vendorMap.get(o.vendorId)
    }
  })

  // Group orders by parentOrderId if they are split orders
  const orderMap = new Map<string, any[]>()
  const standaloneOrders: any[] = []

  for (const order of orders) {
    const plainOrder = toPlainObject(order)
    if (plainOrder.parentOrderId) {
      if (!orderMap.has(plainOrder.parentOrderId)) {
        orderMap.set(plainOrder.parentOrderId, [])
      }
      orderMap.get(plainOrder.parentOrderId)!.push(plainOrder)
    } else {
      standaloneOrders.push(plainOrder)
    }
  }

  // Create grouped orders (one per parentOrderId) and add standalone orders
  const groupedOrders: any[] = []
  
  for (const [parentOrderId, splitOrders] of orderMap.entries()) {
    // Sort split orders by vendor name for consistency
    splitOrders.sort((a, b) => (a.vendorName || '').localeCompare(b.vendorName || ''))
    
    // Create a grouped order object
    const totalAmount = splitOrders.reduce((sum: any, o: any) => sum + (o.total || 0), 0)
    const totalItems = splitOrders.reduce((sum: any, o: any) => sum + (o.items?.length || 0), 0)
    const allItems = splitOrders.flatMap(o => o.items || [])
    
    // NEW STATUS AGGREGATION LOGIC: Calculate granular status for multi-vendor orders
    // This provides accurate partial progress visibility for employees:
    // - "Partially Dispatched" when some vendors dispatch but others haven't
    // - "Partially Delivered" when some vendors deliver but others haven't
    // - "Awaiting Dispatch" when none are dispatched
    // - "Awaiting Delivery" when all dispatched but none delivered
    const aggregatedStatus = calculateAggregatedOrderStatus(splitOrders)
    
    console.log(`[getOrdersByEmployee] Split order status aggregation:`, {
      parentOrderId,
      childOrders: splitOrders.map((o: any) => ({ id: o.id, status: o.status, vendor: o.vendorName })),
      aggregatedStatus,
      statusBreakdown: {
        'Awaiting approval': splitOrders.filter((o: any) => o.status === 'Awaiting approval').length,
        'Awaiting fulfilment': splitOrders.filter((o: any) => o.status === 'Awaiting fulfilment').length,
        'Dispatched': splitOrders.filter((o: any) => o.status === 'Dispatched').length,
        'Delivered': splitOrders.filter((o: any) => o.status === 'Delivered').length,
      },
      note: 'Using granular status aggregation for accurate partial progress display'
    })
    
    // For split orders, also create item-level status mapping
    // Each item should know which child order it belongs to and that order's status
    const itemsWithStatus = allItems.map((item: any, globalIndex: number) => {
      // Find which child order this item belongs to
      let currentIndex = 0
      for (const childOrder of splitOrders) {
        const childItems = childOrder.items || []
        if (globalIndex >= currentIndex && globalIndex < currentIndex + childItems.length) {
          return {
            ...item,
            _itemStatus: childOrder.status, // Store the status of the child order containing this item
            _childOrderId: childOrder.id // Store the child order ID for reference
          }
        }
        currentIndex += childItems.length
      }
      return item
    })
    
    groupedOrders.push({
      ...splitOrders[0], // Use first order as base
      id: parentOrderId, // Use parent order ID as the main ID
      isSplitOrder: true,
      splitOrders: splitOrders,
      status: aggregatedStatus, // Use calculated aggregated status
      total: totalAmount,
      items: itemsWithStatus, // Items with per-item status
      vendorCount: splitOrders.length,
      vendors: splitOrders.map(o => o.vendorName).filter(Boolean)
    })
  }

  // Combine grouped and standalone orders, sorted by date
  const allOrders = [...groupedOrders, ...standaloneOrders]
  allOrders.sort((a, b) => {
    const dateA = new Date(a.orderDate || 0).getTime()
    const dateB = new Date(b.orderDate || 0).getTime()
    return dateB - dateA
  })

  return allOrders
}

export async function getOrdersByParentOrderId(parentOrderId: string): Promise<any[]> {
  await connectDB()
  
  const orders = await Order.find({ parentOrderId: parentOrderId })
    .populate('employeeId', 'id firstName lastName email')
    .populate('companyId', 'id name')
    .populate('items.uniformId', 'id name')
    .sort({ orderDate: -1 })
    .lean() as any

  // Fetch vendor names for all unique vendorIds
  const vendorIds = [...new Set(orders.map((o: any) => o.vendorId).filter(Boolean))]
  const vendors = await Vendor.find({ id: { $in: vendorIds } }).select('id name').lean() as any

  return orders.map((o: any) => {
    const plain = toPlainObject(o)
    // Add vendorName from vendorMap if missing
    if (!plain.vendorName && plain.vendorId && vendorMap.has(plain.vendorId)) {
      plain.vendorName = vendorMap.get(plain.vendorId)
    }
    return plain
  })
}

/**
 * Get employee eligibility from designation rules
 * Falls back to employee-level eligibility if no designation rule exists
 * Now returns dynamic categories instead of hard-coded ones
 */
export async function getEmployeeEligibilityFromDesignation(employeeId: string): Promise<{
  eligibility: Record<string, number> // Dynamic category eligibility: { "shirt": 2, "pant": 2, "custom-category": 1, ... }
  cycleDurations: Record<string, number> // Dynamic category cycle durations: { "shirt": 6, "pant": 6, ... }
  // Legacy fields for backward compatibility
  shirt: number
  pant: number
  shoe: number
  jacket: number
}> {
  await connectDB()
  
  // Use employeeId field instead of id field
  let employee = await Employee.findOne({ employeeId: employeeId })
  if (!employee) {
    // Fallback: try by id field for backward compatibility
    employee = await Employee.findOne({ id: employeeId })
  }
  if (!employee) {
    // Return empty eligibility with defaults
    return {
      eligibility: {},
      cycleDurations: {},
      shirt: 0,
      pant: 0,
      shoe: 0,
      jacket: 0
    }
  }

  // Get company ID
  // Use string ID for company lookup
  const company = await Company.findOne({ id: String(employee.companyId) })
  if (!company) {
    // Fallback to employee-level eligibility (legacy format)
    const legacyEligibility = {
      shirt: 
    employee.eligibility?.shirt || 0,
      pant: 
    employee.eligibility?.pant || 0,
      shoe: 
    employee.eligibility?.shoe || 0,
      jacket: 
    employee.eligibility?.jacket || 0,
    }
    const legacyCycleDurations = employee.cycleDuration || { shirt: 6, pant: 6, shoe: 6, jacket: 12 }
    
    // Convert to dynamic format
    const eligibility: Record<string, number> = {}
    const cycleDurations: Record<string, number> = {}
    
    // Map legacy categories to dynamic format
    if (legacyEligibility.shirt > 0) eligibility['shirt'] = legacyEligibility.shirt
    if (legacyEligibility.pant > 0) eligibility['pant'] = legacyEligibility.pant
    if (legacyEligibility.shoe > 0) eligibility['shoe'] = legacyEligibility.shoe
    if (legacyEligibility.jacket > 0) eligibility['jacket'] = legacyEligibility.jacket
    
    Object.keys(legacyCycleDurations).forEach(key => {
      cycleDurations[key] = (legacyCycleDurations as any)[key]
    })
    
    return {
      eligibility,
      cycleDurations,
      ...legacyEligibility
    }
  }

  // CRITICAL FIX: Use subcategory-based eligibility instead of old category-based system
  // Decrypt employee designation for matching
  const { decrypt } = require('../utils/encryption')
  let normalizedDesignation = employee.designation || ''
  if (normalizedDesignation && typeof normalizedDesignation === 'string' && normalizedDesignation.includes(':')) {
    try {
      normalizedDesignation = decrypt(normalizedDesignation)
    } catch (error) {
      console.warn('Failed to decrypt employee designation for eligibility lookup:', error)
    }
  }
  normalizedDesignation = normalizedDesignation.trim()
  
  const employeeGender = employee.gender || 'unisex'
  const genderFilter = employeeGender === 'unisex' || !employeeGender 
    ? { $in: ['male', 'female', 'unisex'] } 
    : employeeGender
  
  console.log(`[getEmployeeEligibilityFromDesignation] Checking subcategory eligibility for:`)
  console.log(`  - companyId: ${company._id}`)
  console.log(`  - designationId: "${normalizedDesignation}"`)
  console.log(`  - gender: ${JSON.stringify(genderFilter)}`)
  
  // Query DesignationSubcategoryEligibility (subcategory-based)
  const subcategoryEligibilities = await DesignationSubcategoryEligibility.find({
    companyId: 
    company._id,
    designationId: normalizedDesignation,
    gender: genderFilter,
    status: 'active'
  })
    .populate('subCategoryId', 'id name parentCategoryId')
    .lean() as any
  
  
  // CRITICAL MIGRATION: Subcategory eligibility is the SINGLE source of truth
  // NO category-based fallback allowed
  if (subcategoryEligibilities.length === 0) {
    console.log(`[getEmployeeEligibilityFromDesignation] ⚠️ NO SUBCATEGORY ELIGIBILITY FOUND`)
    console.log(`[getEmployeeEligibilityFromDesignation] Returning empty eligibility (no category-based fallback)`)
    console.log(`[getEmployeeEligibilityFromDesignation] This is intentional - subcategory eligibility is required`)
    
    // Return empty eligibility - no fallback to category-based or employee-level
    // This ensures that eligibility MUST be configured at subcategory level
    return {
      eligibility: {},
      cycleDurations: {},
      shirt: 0,
      pant: 0,
      shoe: 0,
      jacket: 0
    }
    }
    
  // Process subcategory-based eligibility
  {
    // Aggregate subcategory eligibility by parent category
    const eligibility: Record<string, number> = {}
    const cycleDurations: Record<string, number> = {}
    let legacyEligibility = { shirt: 0, pant: 0, shoe: 0, jacket: 0 }
    
    // Get all subcategories with their parent categories
    const subcategoryIds = subcategoryEligibilities
      .map(e => e.subCategoryId)
      .filter(Boolean)
      .map((s: any) => {
        if (mongoose.Types.ObjectId.isValid(s)) {
          return new mongoose.Types.ObjectId(s)
        }
        return s
      })
    
    const subcategories = await Subcategory.find({
      _id: { $in: subcategoryIds },
      companyId: 
    company._id,
      status: 'active'
    })
      .populate('parentCategoryId', 'id name')
      .lean() as any
    
    const subcategoryMap = new Map()
    for (const subcat of subcategories) {
      const subcatId = (subcat as any)._id.toString()
      subcategoryMap.set(subcatId, subcat)
    }
    
    // Aggregate eligibility by parent category
    for (const elig of subcategoryEligibilities) {
      const subcatId = elig.subCategoryId?._id?.toString() || elig.subCategoryId?.toString()
      if (!subcatId) continue
      
      const subcat = subcategoryMap.get(subcatId)
      if (!subcat || !subcat.parentCategoryId) continue
      
      const parentCategory = subcat.parentCategoryId
      const categoryName = parentCategory.name?.toLowerCase() || ''
      if (!categoryName) continue
      
      const quantity = elig.quantity || 0
      const renewalFrequency = elig.renewalFrequency || 6
      const renewalUnit = elig.renewalUnit || 'months'
      const cycleMonths = renewalUnit === 'years' ? renewalFrequency * 12 : renewalFrequency
      
      // Aggregate quantities for same category
      if (!eligibility[categoryName]) {
        eligibility[categoryName] = 0
        cycleDurations[categoryName] = cycleMonths
      }
      eligibility[categoryName] += quantity
      
      // Use the longest cycle duration for the category
      if (cycleMonths > cycleDurations[categoryName]) {
        cycleDurations[categoryName] = cycleMonths
      }
        
      // Update legacy eligibility
      const normalizedCategory = normalizeCategoryName(categoryName)
      if (normalizedCategory === 'shirt' || categoryName === 'shirt') {
        legacyEligibility.shirt += quantity
      } else if (normalizedCategory === 'pant' || categoryName === 'pant' || categoryName === 'trouser') {
        legacyEligibility.pant += quantity
      } else if (normalizedCategory === 'shoe' || categoryName === 'shoe') {
        legacyEligibility.shoe += quantity
      } else if (normalizedCategory === 'jacket' || categoryName === 'jacket' || categoryName === 'blazer') {
        legacyEligibility.jacket += quantity
        }
    }
    
    console.log(`[getEmployeeEligibilityFromDesignation] Aggregated eligibility:`, {
      eligibility,
      legacyEligibility
    })
    
    return {
      eligibility,
      cycleDurations,
      ...legacyEligibility
    }
  }

  // CRITICAL MIGRATION: No fallback to employee-level eligibility
  // Subcategory eligibility is the ONLY source of truth
  // If no subcategory eligibility exists, return empty (already handled above)
  // This code should never be reached, but included for safety
  console.warn(`[getEmployeeEligibilityFromDesignation] ⚠️ Unexpected code path - returning empty eligibility`)
  return {
    eligibility: {},
    cycleDurations: {},
    shirt: 0,
    pant: 0,
    shoe: 0,
    jacket: 0
  }
}

export async function getConsumedEligibility(employeeId: string): Promise<{
  consumed: Record<string, number> // Dynamic category consumption: { "shirt": 1, "pant": 2, "custom-category": 0, ... }
  // Legacy fields for backward compatibility
  shirt: number
  pant: number
  shoe: number
  jacket: number
}> {
  await connectDB()
  
  // Use employeeId field instead of id field
  let employee = await Employee.findOne({ employeeId: employeeId })
  if (!employee) {
    // Fallback: try by id field for backward compatibility
    employee = await Employee.findOne({ id: employeeId })
  }
  if (!employee) {
    return { consumed: {}, shirt: 0, pant: 0, shoe: 0, jacket: 0 }
  }

  // Get company
  // Use string ID for company lookup
  const company = await Company.findOne({ id: String(employee.companyId) })
  if (!company) {
    return { consumed: {}, shirt: 0, pant: 0, shoe: 0, jacket: 0 }
  }

  // Ensure system categories exist
  await ensureSystemCategories(company.id)

  // Get all categories for this company
  const categories = await getCategoriesByCompany(company.id)
  const categoryMap = new Map<string, any>()
  categories.forEach(cat => {
    categoryMap.set(cat.name.toLowerCase(), cat)
    categoryMap.set(normalizeCategoryName(cat.name), cat)
  })

  // Get employee's date of joining (default to Oct 1, 2025 if not set)
  const dateOfJoining = employee.dateOfJoining 
    ? new Date(employee.dateOfJoining) 
    : new Date('2025-10-01T00:00:00.000Z')

  // Get cycle durations from designation rules (or fallback to employee-level)
  const { cycleDurations } = await getEmployeeEligibilityFromDesignation(employeeId)

  // Get all orders that count towards consumed eligibility (all except cancelled)
  // We'll filter by item-specific cycles below
  const orders = await Order.find({
    employeeId: 
    employee._id,
    status: { $in: ['Awaiting approval', 'Awaiting fulfilment', 'Dispatched', 'Delivered'] }
  })
    .populate('items.uniformId', 'id category categoryId')
    .lean() as any

  const consumed: Record<string, number> = {}
  categories.forEach(cat => {
    consumed[cat.name.toLowerCase()] = 0
  })
  
  // Legacy consumed for backward compatibility
  const legacyConsumed = { shirt: 0, pant: 0, shoe: 0, jacket: 0 }

  // Get eligibility reset dates for this employee (if any)
  const resetDates = employee.eligibilityResetDates || {}

  // Sum up quantities by category from orders in their respective current cycles
  for (const order of orders) {
    const orderDate = order.orderDate ? new Date(order.orderDate) : null
    if (!orderDate) {
      continue
    }

    for (const item of order.items || []) {
      const uniform = item.uniformId
      if (!uniform || typeof uniform !== 'object') {
        continue
      }

      // Get category name (handle both old and new formats)
      let categoryName: string | null = null
      
      // Try new format first (categoryId)
      if ('categoryId' in uniform && uniform.categoryId) {
        const categoryId = uniform.categoryId.toString()
        const category = await getCategoryByIdOrName(company.id, categoryId)
        if (category) {
          categoryName = category.name.toLowerCase()
        }
      }
      
      // Fallback to old format (category string)
      if (!categoryName && 'category' in uniform && uniform.category) {
        categoryName = normalizeCategoryName(uniform.category as string)
        // Try to find matching category
        const category = await getCategoryByIdOrName(company.id, categoryName)
        if (category) {
          categoryName = category.name.toLowerCase()
        }
      }

      if (!categoryName) {
        continue
      }

      const quantity = item.quantity || 0
      
      // Check if order date is after the reset date for this category (if reset date exists)
      const resetDate = resetDates[categoryName as keyof typeof resetDates]
      if (resetDate && orderDate < new Date(resetDate)) {
        // Order is before reset date, skip it
        continue
      }
      
      // Get cycle duration for this category
      const cycleDuration = cycleDurations[categoryName] || cycleDurations[normalizeCategoryName(categoryName)] || 6
      
      // Check if order date is in current cycle for this specific item type
      const inCurrentCycle = isDateInCurrentCycle(orderDate, categoryName, dateOfJoining, cycleDuration)
      
      if (inCurrentCycle) {
        // Add to consumed eligibility
        if (!consumed[categoryName]) {
          consumed[categoryName] = 0
        }
        consumed[categoryName] += quantity
        
        // Update legacy consumed for backward compatibility
        if (categoryName === 'shirt') {
          legacyConsumed.shirt += quantity
        } else if (categoryName === 'pant' || categoryName === 'trouser') {
          legacyConsumed.pant += quantity
        } else if (categoryName === 'shoe') {
          legacyConsumed.shoe += quantity
        } else if (categoryName === 'jacket' || categoryName === 'blazer') {
          legacyConsumed.jacket += quantity
        }
      }
    }
  }

  return {
    consumed,
    ...legacyConsumed
  }
}

/**
 * Reusable eligibility validation function
 * Validates if order items would exceed employee eligibility limits
 * Used by both single order creation and bulk uploads
 * Now works with dynamic categories
 * 
 * @param employeeId Employee ID (6-digit numeric string)
 * @param orderItems Array of order items with category and quantity
 * @returns Validation result with success status and error details
 */
export async function validateEmployeeEligibility(
  employeeId: string,
  orderItems: Array<{
    uniformId: string
    uniformName: string
    category: string // Now accepts any category string (dynamic)
    quantity: number
  }>
): Promise<{
  valid: boolean
  errors: Array<{ item: string, category: string, error: string }>
  remainingEligibility: Record<string, number> // Dynamic: { "shirt": 2, "pant": 1, "custom-category": 0, ... }
  // Legacy fields for backward compatibility
  legacyRemainingEligibility?: { shirt: number, pant: number, shoe: number, jacket: number }
}> {
  await connectDB()
  
  // Find employee
  let employee = await Employee.findOne({ employeeId: employeeId })
  if (!employee) {
    employee = await Employee.findOne({ id: employeeId })
  }
  if (!employee) {
    return {
      valid: false,
      errors: [{ item: 'Employee', category: 'general', error: `Employee not found: ${employeeId}` }],
      remainingEligibility: {},
      legacyRemainingEligibility: { shirt: 0, pant: 0, shoe: 0, jacket: 0 }
    }
  }
  
  // Get company
  // Use string ID for company lookup
  const company = await Company.findOne({ id: String(employee.companyId) })
  if (!company) {
    return {
      valid: false,
      errors: [{ item: 'Employee', category: 'general', error: `Company not found for employee: ${employeeId}` }],
      remainingEligibility: {},
      legacyRemainingEligibility: { shirt: 0, pant: 0, shoe: 0, jacket: 0 }
    }
  }

  // Ensure system categories exist
  await ensureSystemCategories(company.id)

  // Get all categories for this company
  const categories = await getCategoriesByCompany(company.id)
  const categoryMap = new Map<string, any>()
  categories.forEach(cat => {
    categoryMap.set(cat.name.toLowerCase(), cat)
    categoryMap.set(normalizeCategoryName(cat.name), cat)
  })
  
  // Get employee eligibility (from designation rules or employee-level)
  // Function now returns: { eligibility: Record<string, number>, cycleDurations, shirt, pant, shoe, jacket }
  const eligibilityData = await getEmployeeEligibilityFromDesignation(employeeId)
  
  // Get consumed eligibility
  const consumedData = await getConsumedEligibility(employeeId)
  
  // Calculate remaining eligibility dynamically
  const remainingEligibility: Record<string, number> = {}
  const legacyRemainingEligibility = {
    shirt: Math.max(0, (eligibilityData.shirt || 0) - (consumedData.shirt || 0)),
    pant: Math.max(0, (eligibilityData.pant || 0) - (consumedData.pant || 0)),
    shoe: Math.max(0, (eligibilityData.shoe || 0) - (consumedData.shoe || 0)),
    jacket: Math.max(0, (eligibilityData.jacket || 0) - (consumedData.jacket || 0))
  }
  
  // Build dynamic remaining eligibility for all categories
  for (const category of categories) {
    const categoryKey = category.name.toLowerCase()
    const totalElig = eligibilityData.eligibility[categoryKey] || 0
    const consumed = consumedData.consumed[categoryKey] || 0
    remainingEligibility[categoryKey] = Math.max(0, totalElig - consumed)
  }
  
  // Validate each order item
  const errors: Array<{ item: string, category: string, error: string }> = []
  const categoryQuantities: Record<string, number> = {}
  
  // Initialize category quantities
  categories.forEach(cat => {
    categoryQuantities[cat.name.toLowerCase()] = 0
  })
  
  // Sum quantities by category from order items
  for (const item of orderItems) {
    const category = normalizeCategoryName(item.category)
    
    // Find matching category
    let categoryKey = category
    for (const [key, cat] of categoryMap.entries()) {
      if (normalizeCategoryName(key) === category || key === category) {
        categoryKey = cat.name.toLowerCase()
        break
      }
    }
    
    if (!categoryQuantities[categoryKey]) {
      categoryQuantities[categoryKey] = 0
    }
    categoryQuantities[categoryKey] += item.quantity || 0
  }
  
  // Check if quantities exceed remaining eligibility for each category
  for (const [categoryKey, requestedQty] of Object.entries(categoryQuantities)) {
    const available = remainingEligibility[categoryKey] || 0
    if (requestedQty > available) {
      const item = orderItems.find(i => {
        const itemCategory = normalizeCategoryName(i.category)
        return itemCategory === categoryKey || itemCategory === normalizeCategoryName(categoryKey)
      })
      
      errors.push({
        item: item?.uniformName || categoryKey,
        category: categoryKey,
        error: `Exceeds eligibility: Requested ${requestedQty}, Available ${available}`
      })
    }
  }
  
  // Also check legacy categories for backward compatibility
  const legacyCategories = ['shirt', 'pant', 'shoe', 'jacket']
  for (const legacyCat of legacyCategories) {
    const requestedQty = categoryQuantities[legacyCat] || 0
    const available = legacyRemainingEligibility[legacyCat as keyof typeof legacyRemainingEligibility]
    if (requestedQty > available) {
      const item = orderItems.find(i => normalizeCategoryName(i.category) === legacyCat)
      if (!errors.some(e => e.category === legacyCat)) {
        errors.push({
          item: item?.uniformName || legacyCat,
          category: legacyCat,
          error: `Exceeds eligibility: Requested ${requestedQty}, Available ${available}`
        })
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    remainingEligibility,
    legacyRemainingEligibility
  }
}

/**
 * Validate bulk order item using subcategory-based eligibility
 * 
 * This function validates that:
 * 1. Employee exists and is active
 * 2. Employee has a designation
 * 3. Designation has subcategory eligibility
 * 4. Product is mapped to an eligible subcategory for the company
 * 5. Quantity doesn't exceed subcategory eligibility limits
 */
export async function validateBulkOrderItemSubcategoryEligibility(
  employeeId: string,
  productId: string,
  quantity: number,
  companyId: string
): Promise<{
  valid: boolean
  error?: string
  eligibleQuantity?: number
  subcategoryName?: string
}> {
  await connectDB()

  // Find employee
  let employee = await Employee.findOne({ employeeId: employeeId })
  if (!employee) {
    employee = await Employee.findOne({ id: employeeId })
  }
  if (!employee) {
    return { valid: false, error: `Employee not found: ${employeeId}` }
  }

  // Check employee is active
  if (employee.status !== 'active') {
    return { valid: false, error: `Employee ${employeeId} is not active` }
  }

  // Get company - use string ID only
  const company = await Company.findOne({ id: companyId })
  if (!company) {
    return { valid: false, error: `Company not found: ${companyId}` }
  }

  // Verify employee belongs to company
  if (String(employee.companyId) !== String(company.id)) {
    return { valid: false, error: `Employee ${employeeId} does not belong to company ${companyId}` }
  }

  // Get employee designation (decrypt if needed)
  let designation = employee.designation
  if (designation && typeof designation === 'string' && designation.includes(':')) {
    try {
      const { decrypt } = await import('@/lib/utils/encryption')
      designation = decrypt(designation)
    } catch (error) {
      // Keep original if decryption fails
    }
  }

  if (!designation || designation.trim().length === 0) {
    return { valid: false, error: `Employee ${employeeId} has no designation assigned` }
  }

  const normalizedDesignation = designation.trim()
  const employeeGender = employee.gender || 'unisex'
  const genderFilter = employeeGender === 'unisex' ? { $in: ['male', 'female', 'unisex'] } : employeeGender

  // Check for subcategory-based eligibility - use string ID
  const subcategoryEligibilities = await DesignationSubcategoryEligibility.find({
    companyId: company.id,
    designationId: normalizedDesignation,
    gender: genderFilter,
    status: 'active'
  })
    .populate('subCategoryId', 'id name')
    .lean() as any

  if (subcategoryEligibilities.length === 0) {
    return { valid: false, error: `No eligibility defined for designation "${normalizedDesignation}". Employee cannot order any products.` }
  }

  // Get eligible subcategory IDs - use string IDs
  const eligibleSubcategoryIds = subcategoryEligibilities
    .map(e => e.subCategoryId?.id || String(e.subCategoryId))
    .filter(Boolean)

  if (eligibleSubcategoryIds.length === 0) {
    return { valid: false, error: `No valid subcategories found for designation "${normalizedDesignation}"` }
  }

  // Find product - use string ID only
  const product = await Uniform.findOne({ id: productId }).select('id').lean() as any
  if (!product) {
    return { valid: false, error: `Invalid product ID: ${productId}` }
  }

  // Check if product is mapped to any eligible subcategory - use string IDs
  const productMappings = await ProductSubcategoryMapping.find({
    productId: product.id,
    subCategoryId: { $in: eligibleSubcategoryIds },
    companyId: company.id
  })
    .populate('subCategoryId', 'id name')
    .lean() as any

  if (productMappings.length === 0) {
    // Try to get product name for better error message - use string ID
    let productName = productId
    try {
      const productForName = await Uniform.findOne({ id: productId }).select('name id').lean() as any
      productName = (productForName as any).name || (productForName as any).id || productId
    } catch (error) {
      // Use productId if lookup fails
    }
    return { valid: false, error: `Product "${productName}" is not mapped to any eligible subcategory for designation "${normalizedDesignation}"` }
  }

  // Find the matching eligibility rule for the subcategory
  let maxAllowedQuantity = 0
  let matchingSubcategoryName = ''

  for (const mapping of productMappings) {
    const subcategoryId = mapping.subCategoryId?._id?.toString() || mapping.subCategoryId?.toString()
    const eligibility = subcategoryEligibilities.find(
      e => (e.subCategoryId?._id?.toString() || e.subCategoryId?.toString()) === subcategoryId
    )

    if (eligibility) {
      const eligibleQty = eligibility.quantity || 0
      if (eligibleQty > maxAllowedQuantity) {
        maxAllowedQuantity = eligibleQty
        matchingSubcategoryName = mapping.subCategoryId?.name || 'Unknown'
      }
    }
  }

  if (maxAllowedQuantity === 0) {
    return { valid: false, error: `No quantity allowed for product ${productId} under designation "${normalizedDesignation}"` }
  }

  // Check consumed eligibility (simplified - just check if quantity exceeds allowed)
  // Note: This is a simplified check. For full cycle-based validation, we'd need to check consumed eligibility
  if (quantity > maxAllowedQuantity) {
    return {
      valid: false,
      error: `Quantity ${quantity} exceeds allowed quantity ${maxAllowedQuantity} for subcategory "${matchingSubcategoryName}"`,
      eligibleQuantity: maxAllowedQuantity,
      subcategoryName: matchingSubcategoryName
    }
  }

  return {
    valid: true,
    eligibleQuantity: maxAllowedQuantity,
    subcategoryName: matchingSubcategoryName
  }
}

export async function createOrder(orderData: {
  employeeId: string
  items: Array<{
    uniformId: string
    uniformName: string
    size: string
    quantity: number
    price: number
  }>
  deliveryAddress: string
  estimatedDeliveryTime: string
  dispatchLocation?: string
  isPersonalPayment?: boolean
  personalPaymentAmount?: number
  usePersonalAddress?: boolean // Flag: true if using personal address, false if using official location (default: false)
}): Promise<any> {
  await connectDB()
  
  // Find employee and company - use employeeId field first
  console.log(`[createOrder] Looking for employee with employeeId=${orderData.employeeId} (type: ${typeof orderData.employeeId})`)
  
  // Use employeeId field first (primary lookup)
  let employee = await Employee.findOne({ employeeId: orderData.employeeId })
  
  // If not found by employeeId, try by id field (fallback for backward compatibility)
  // Find employee - try employeeId first, then id field (both are string IDs)
  if (!employee) {
    console.log(`[createOrder] Employee not found by employeeId, trying id field`)
    employee = await Employee.findOne({ id: orderData.employeeId })
  }
  
  if (!employee) {
    console.error(`[createOrder] ❌ Employee not found with any ID format: ${orderData.employeeId}`)
    // List available employees for debugging
    const sampleEmployees = await Employee.find({}, 'id employeeId email firstName lastName').limit(5).lean() as any
    throw new Error(`Employee not found: ${orderData.employeeId}. Please ensure you are logged in with a valid employee account.`)
  }
  
  console.log(`[createOrder] ✓ Found employee: id=${employee.id}, employeeId=${employee.employeeId}, email=${employee.email}`)
  console.log(`[createOrder] Employee companyId type=${typeof 
    employee.companyId}, value=${employee.companyId}`)
  console.log(`[createOrder] Employee companyId isObject=${typeof 
    employee.companyId === 'object'}, isNull=${
    employee.companyId === null}`)

  // Use raw MongoDB collection to reliably get the employee's companyId ObjectId
  // This is necessary because Mongoose populate might fail or return inconsistent data
  const db = mongoose.connection.db
    if (!db) {
    throw new Error('Database connection not available')
  }
   if (!db) {
    throw new Error('Database connection not available')
  }

  // Get raw employee document - use string ID fields only
  // Try employeeId field first, then id field (both are string IDs)
  let rawEmployee = await db.collection('employees').findOne({ employeeId: orderData.employeeId })
  
  if (!rawEmployee) {
    rawEmployee = await db.collection('employees').findOne({ id: orderData.employeeId })
  }
  
  if (!rawEmployee) {
    console.error(`[createOrder] ❌ Raw employee document not found for any ID format: ${orderData.employeeId}`)
    throw new Error(`Employee not found: ${orderData.employeeId}. Please ensure you are logged in with a valid employee account.`)
  }

  console.log(`[createOrder] Raw employee companyId:`, 
    rawEmployee.companyId, 'Type:', typeof 
    rawEmployee.companyId)
  
  // Extract companyId ObjectId from raw document
  let companyIdObjectId: any = null
  if (rawEmployee.companyId) {
    companyIdObjectId = rawEmployee.companyId
    console.log(`[createOrder] Extracted companyId ObjectId from raw document: ${companyIdObjectId.toString()}`)
  } else {
    console.error(`[createOrder] Raw employee document has no companyId`)
  }
  
  // ENFORCEMENT: Check if employee order is enabled (only for regular employees, not admins)
  // Get employee email to check admin status
  const { decrypt } = require('../utils/encryption')
  let employeeEmail: string | null = null
  if (employee.email) {
    try {
      if (typeof employee.email === 'string' && employee.email.includes(':')) {
        employeeEmail = decrypt(employee.email)
      } else {
        employeeEmail = employee.email
      }
    } catch (error) {
      console.warn('[createOrder] Failed to decrypt employee email for enforcement check')
    }
  }
  
  // Get company ID string for checking
  const companyIdString = await (async () => {
    if (companyIdObjectId) {
      const companyDoc = await Company.findById(companyIdObjectId).select('id').lean() as any
    }
    return null
  })()
  
  // If we have employee email and company ID, check enforcement
  if (employeeEmail && companyIdString) {
    const isAdmin = await isCompanyAdmin(employeeEmail, companyIdString)
    const location = await getLocationByAdminEmail(employeeEmail)
    
    // If not an admin, check if employee order is enabled
    if (!isAdmin && !location) {
      const company = await Company.findById(companyIdObjectId).select('enableEmployeeOrder').lean() as any
      if (!company) {
        throw new Error('Employee orders are currently disabled for your company. Please contact your administrator.')
      }
    }
  }
  
  // Find company using ObjectId from raw document
  let company
  if (!companyIdObjectId) {
    console.error(`[createOrder] Employee ${orderData.employeeId} has no companyId in raw document`)
    // Employee must have a companyId - this is a data integrity issue
    // List available companies for debugging
    const allCompanies = await Company.find({}, 'id name').limit(10).lean() as any
    throw new Error(`Employee ${orderData.employeeId} has no companyId. Please ensure the employee is linked to a valid company using companyId.`)
  } else {
    // Use ObjectId to find company
    const companyIdStr = companyIdObjectId.toString()
    console.log(`[createOrder] Looking for company by ObjectId: ${companyIdStr}`)
    
    // Ensure companyIdObjectId is a proper ObjectId instance
    let companyObjectId: mongoose.Types.ObjectId
    if (companyIdObjectId instanceof mongoose.Types.ObjectId) {
      companyObjectId = companyIdObjectId
    } else if (typeof companyIdObjectId === 'string') {
      companyObjectId = new mongoose.Types.ObjectId(companyIdObjectId)
    } else {
      companyObjectId = companyIdObjectId
    }
    
    // Try findById first - explicitly select workflow flags
    company = await Company.findById(companyObjectId)
      .select('id name _id enable_pr_po_workflow enable_site_admin_pr_approval require_company_admin_po_approval allow_multi_pr_po allowPersonalAddressDelivery')
    
    if (!company) {
      console.warn(`[createOrder] Company not found by ObjectId ${companyIdStr}, trying alternative lookup methods`)
      
      // Method 1: Try raw MongoDB collection lookup
      const allCompanies = await db.collection('companies').find({}).toArray()
      console.log(`[createOrder] Found ${allCompanies.length} companies in raw collection`)
      
      const companyDoc = allCompanies.find((c: any) => {
        const cIdStr = c._id.toString()
        return cIdStr === companyIdStr
      })
      
      if (companyDoc) {
        console.log(`[createOrder] ✓ Found company in raw collection: id=${companyDoc.id}, name=${companyDoc.name}, _id=${companyDoc._id}`)
        // Try multiple ways to fetch using Mongoose - explicitly select workflow flags
        company = await Company.findById(companyDoc._id)
          .select('id name _id enable_pr_po_workflow enable_site_admin_pr_approval require_company_admin_po_approval allow_multi_pr_po allowPersonalAddressDelivery')
        
        if (!company) {
          // Try by numeric id - explicitly select workflow flags
          if (companyDoc.id) {
            company = await Company.findOne({ id: 
    companyDoc.id })
              .select('id name _id enable_pr_po_workflow enable_site_admin_pr_approval require_company_admin_po_approval allow_multi_pr_po allowPersonalAddressDelivery')
          }
        }
        
        if (!company) {
          // Try by name as last resort - explicitly select workflow flags
          if (companyDoc.name) {
            company = await Company.findOne({ name: 
    companyDoc.name })
              .select('id name _id enable_pr_po_workflow enable_site_admin_pr_approval require_company_admin_po_approval allow_multi_pr_po allowPersonalAddressDelivery')
          }
        }
      } else {
        console.error(`[createOrder] ❌ Company not found in raw collection with _id: ${companyIdStr}`)
        console.error(`[createOrder] Available company _id values:`)
        allCompanies.slice(0, 10).forEach((c: any) => {
          console.error(`[createOrder]   _id=${c._id.toString()}, id=${c.id}, name=${c.name}`)
        })
      }
      
      if (!company) {
        console.error(`[createOrder] ❌ Company not found by ObjectId ${companyIdStr} after all lookup attempts`)
        // List available companies for debugging
        const allCompaniesList = await Company.find({}, 'id name _id').limit(10).lean() as any
        console.error(`[createOrder] Looking for company with _id matching: ${companyIdStr}`)
        throw new Error(`Company not found for employee: ${orderData.employeeId} (companyId ObjectId: ${companyIdStr}). Please ensure the employee is linked to a valid company using companyId.`)
      }
    }
  }
  
  if (!company) {
    console.error(`[createOrder] Company lookup failed for employee ${orderData.employeeId}`)
    console.error(`[createOrder] companyId ObjectId was: ${companyIdObjectId?.toString() || 'null'}`)
    // List available companies for debugging
    const allCompanies = await Company.find({}, 'id name').limit(10).lean() as any
    throw new Error(`Company not found for employee: ${orderData.employeeId}. Please ensure the employee is linked to a valid company.`)
  }
  
  console.log(`[createOrder] ✓ Found company: id=${company.id}, name=${company.name}, _id=${company._id}`)
  console.log(`[createOrder] Company workflow flags:`)
  console.log(`[createOrder]   enable_pr_po_workflow: ${company.enable_pr_po_workflow} (type: ${typeof 
    company.enable_pr_po_workflow})`)
  console.log(`[createOrder]   enable_site_admin_pr_approval: ${company.enable_site_admin_pr_approval} (type: ${typeof 
    company.enable_site_admin_pr_approval})`)
  console.log(`[createOrder]   require_company_admin_po_approval: ${company.require_company_admin_po_approval} (type: ${typeof 
    company.require_company_admin_po_approval})`)

  // ========== DELIVERY LOCATION VALIDATION & SHIPPING ADDRESS EXTRACTION ==========
  // Enforce company-level delivery location rules based on allowPersonalAddressDelivery
  const allowPersonalAddressDelivery = company.allowPersonalAddressDelivery ?? false // Default: false for backward compatibility
  
  // Structured shipping address fields (required by Order model)
  let shippingAddress: {
    shipping_address_line_1: string
    shipping_address_line_2?: string
    shipping_address_line_3?: string
    shipping_city: string
    shipping_state: string
    shipping_pincode: string
    shipping_country: string
  }
  
  let deliveryAddressToUse: string // For backward compatibility/display
  
  // Helper function to extract structured address from employee
  const extractEmployeeAddress = (emp: any) => {
    if (emp.address_line_1) {
      // Employee has structured address
      return {
        shipping_address_line_1: emp.address_line_1 || '',
        shipping_address_line_2: emp.address_line_2 || '',
        shipping_address_line_3: emp.address_line_3 || '',
        shipping_city: emp.city || 'New Delhi',
        shipping_state: emp.state || 'Delhi',
        shipping_pincode: emp.pincode || '110001',
        shipping_country: emp.country || 'India',
      }
    } else if (emp.address && typeof emp.address === 'string') {
      // Legacy address string - use as L1, set defaults for others
      return {
        shipping_address_line_1: emp.address.substring(0, 255) || 'Address not available',
        shipping_address_line_2: '',
        shipping_address_line_3: '',
        shipping_city: 'New Delhi',
        shipping_state: 'Delhi',
        shipping_pincode: '110001',
        shipping_country: 'India',
      }
    } else {
      // No address - use defaults
      return {
        shipping_address_line_1: 'Address not available',
        shipping_address_line_2: '',
        shipping_address_line_3: '',
        shipping_city: 'New Delhi',
        shipping_state: 'Delhi',
        shipping_pincode: '110001',
        shipping_country: 'India',
      }
    }
  }
  
  // Helper function to extract structured address from location
  const extractLocationAddress = (loc: any) => {
    if (loc.address_line_1) {
      // Location has structured address
      return {
        shipping_address_line_1: loc.address_line_1 || '',
        shipping_address_line_2: loc.address_line_2 || '',
        shipping_address_line_3: loc.address_line_3 || '',
        shipping_city: loc.city || '',
        shipping_state: loc.state || '',
        shipping_pincode: loc.pincode || '',
        shipping_country: loc.country || 'India',
      }
    } else {
      // Location missing structured address - use defaults
      return {
        shipping_address_line_1: loc.name || 'Location address not available',
        shipping_address_line_2: '',
        shipping_address_line_3: '',
        shipping_city: 'New Delhi',
        shipping_state: 'Delhi',
        shipping_pincode: '110001',
        shipping_country: 'India',
      }
    }
  }
  
  // If company does NOT allow personal address delivery
  if (!allowPersonalAddressDelivery) {
    // Personal address must NOT be selectable - enforce official location delivery only
    if (orderData.usePersonalAddress === true) {
      throw new Error('Personal address delivery is not allowed for this company. Orders must be delivered to the official location.')
    }
    
    // Get employee's official location address
    if (!employee.locationId) {
      // For backward compatibility: if employee has no locationId, use their personal address as fallback
      console.warn(`[createOrder] Employee ${orderData.employeeId} has no locationId. Using personal address as fallback.`)
      shippingAddress = extractEmployeeAddress(employee)
      deliveryAddressToUse = orderData.deliveryAddress || 
    employee.address || 'Address not available'
    } else {
      // Employee has locationId - fetch location and use its address
      const Location = require('../models/Location').default
      const location = await Location.findById(employee.locationId)
      
      if (!location) {
        throw new Error(`Employee's assigned location not found. Please ensure the employee has a valid location assigned.`)
      }
      
      shippingAddress = extractLocationAddress(location)
      
      // Build location address string for display/backward compatibility
      const locationAddressParts = [
    location.address_line_1,
    location.address_line_2,
    location.address_line_3,
    location.city,
    location.state,
    location.pincode
      ].filter(Boolean)
      
      deliveryAddressToUse = locationAddressParts.length > 0
        ? locationAddressParts.join(', ')
        : 
    location.name || 'Location address not available'
      
      console.log(`[createOrder] Using official location address: ${deliveryAddressToUse}`)
    }
  } else {
    // Company ALLOWS personal address delivery
    if (orderData.usePersonalAddress === true) {
      // Employee explicitly chose personal address
      shippingAddress = extractEmployeeAddress(employee)
      deliveryAddressToUse = orderData.deliveryAddress || 
    employee.address || 'Address not available'
      console.log(`[createOrder] Using personal address (explicitly chosen): ${deliveryAddressToUse}`)
    } else {
      // Default: use official location address
      if (!employee.locationId) {
        // Fallback to personal address if no locationId
        console.warn(`[createOrder] Employee ${orderData.employeeId} has no locationId. Using personal address as default.`)
        shippingAddress = extractEmployeeAddress(employee)
        deliveryAddressToUse = orderData.deliveryAddress || 
    employee.address || 'Address not available'
      } else {
        // Employee has locationId - use official location address as default
        const Location = require('../models/Location').default
        const location = await Location.findById(employee.locationId)
        
        if (!location) {
          // Fallback to personal address if location not found
          console.warn(`[createOrder] Employee's location not found. Using personal address as fallback.`)
          shippingAddress = extractEmployeeAddress(employee)
          deliveryAddressToUse = orderData.deliveryAddress || 
    employee.address || 'Address not available'
        } else {
          shippingAddress = extractLocationAddress(location)
          
          // Build location address string for display
          const locationAddressParts = [
    location.address_line_1,
    location.address_line_2,
    location.address_line_3,
    location.city,
    location.state,
    location.pincode
          ].filter(Boolean)
          
          deliveryAddressToUse = locationAddressParts.length > 0
            ? locationAddressParts.join(', ')
            : 
    location.name || 'Location address not available'
          
          console.log(`[createOrder] Using official location address (default): ${deliveryAddressToUse}`)
        }
      }
    }
  }
  
  // Validate required shipping address fields
  if (!shippingAddress.shipping_address_line_1 || !shippingAddress.shipping_city || !shippingAddress.shipping_state || !shippingAddress.shipping_pincode) {
    console.error(`[createOrder] ❌ Missing required shipping address fields:`, shippingAddress)
    throw new Error('Shipping address is incomplete. Please ensure the employee or location has a complete address (L1, City, State, Pincode).')
  }
  
  // ========== END DELIVERY LOCATION VALIDATION & SHIPPING ADDRESS EXTRACTION ==========

  // Get company numeric ID for vendor lookup
  const companyStringId = company.id
  if (!companyStringId) {
    console.error(`[createOrder] Company found but has no numeric id field! Company _id: ${company._id}`)
    throw new Error(`Company found but missing numeric ID. Please ensure the company has a valid numeric ID.`)
  }
  console.log(`[createOrder] Using company ID for vendor lookup: ${companyStringId}`)

  // Group items by vendor
  const itemsByVendor = new Map<string, Array<{
    uniformId: mongoose.Types.ObjectId
    productId: string // Numeric/string product ID for correlation
    uniformName: string
    size: string
    quantity: number
    price: number
  }>>()

  const vendorInfoMap = new Map<string, { vendorId: string, vendorName: string, vendorObjectId: mongoose.Types.ObjectId }>()

  // Process each item and find its vendor
  for (const item of orderData.items) {
      console.log(`[createOrder] Processing order item: productId=${item.uniformId}, productName=${item.uniformName}, companyId=${companyStringId}`)
      
      // Try finding by readable 'id' field first (most common case)
      let uniform = await Uniform.findOne({ id: item.uniformId })
      
      // Removed ObjectId fallback - all products should use string IDs
      
      if (!uniform) {
        console.error(`[createOrder] Uniform not found for productId=${item.uniformId} (tried both id field and _id)`)
        throw new Error(`Product not found: ${item.uniformName || item.uniformId}`)
      }

      // Use price from item if provided and > 0, otherwise use product price
      const itemPrice = (item.price && item.price > 0) ? item.price : (uniform.price || 0)

    // Find all vendors for this product-company combination (multi-vendor support)
    console.log(`[createOrder] Looking for vendors for product ${item.uniformId} (${uniform.name || item.uniformName}) and company ${companyStringId}`)
    const vendors = await getVendorsForProductCompany(item.uniformId, companyStringId, false)
    console.log(`[createOrder] Found ${vendors.length} vendor(s) for product ${item.uniformId}`)
    
    if (!vendors || vendors.length === 0) {
      console.error(`[createOrder] ❌ No vendor found for product ${item.uniformId} (${uniform.name || item.uniformName}) and company ${companyStringId}`)
      console.error(`[createOrder] This means either:`)
      console.error(`[createOrder]   1. Product ${item.uniformId} is not linked to company ${companyStringId} (ProductCompany relationship missing)`)
      console.error(`[createOrder]   2. Product ${item.uniformId} is not linked to any vendor (ProductVendor relationship missing)`)
      throw new Error(`No vendor found for product "${uniform.name || item.uniformName}" (${item.uniformId}). Please ensure the product is linked to your company and to at least one vendor.`)
    }

    // CRITICAL VALIDATION: Ensure only one vendor is returned
    // A product should only be linked to ONE vendor (business rule)
    if (vendors.length > 1) {
      console.error(`[createOrder] ❌ CRITICAL: Product ${item.uniformId} (${uniform.name || item.uniformName}) is linked to MULTIPLE vendors!`)
      console.error(`[createOrder] Vendors:`, vendors.map(v => `${v.vendorId} (${v.vendorName})`))
      console.error(`[createOrder] This violates the business rule: "A product can only be linked to one vendor"`)
      throw new Error(`Product "${uniform.name || item.uniformName}" is linked to multiple vendors. Please fix ProductVendor relationships in the database.`)
    }
    
    if (vendors.length === 0) {
      console.error(`[createOrder] ❌ No vendors returned for product ${item.uniformId}`)
      throw new Error(`No vendor found for product "${uniform.name || item.uniformName}" (${item.uniformId}).`)
    }
    
    // Use the single vendor (business rule: one product = one vendor)
    const vendorInfo = vendors[0]
    console.log(`[createOrder] ✅ Using vendor: ${vendorInfo.vendorId} (${vendorInfo.vendorName})`)
    console.log(`[createOrder]    Product: ${item.uniformId} (${uniform.name || item.uniformName})`)

    // CRITICAL FIX: Get vendor ObjectId from database - verify vendor exists
    const vendor = await Vendor.findOne({ id: 
    vendorInfo.vendorId })
    if (!vendor) {
      console.error(`[createOrder] ❌ Vendor not found: ${vendorInfo.vendorId}`)
      throw new Error(`Vendor not found: ${vendorInfo.vendorId}`)
    }
    console.log(`[createOrder] ✓ Vendor found: ${vendor.id}, _id=${vendor._id}`)
    
    // CRITICAL VALIDATION: Verify vendorId matches
    if (vendor.id !== vendorInfo.vendorId) {
      console.error(`[createOrder] ❌ CRITICAL: Vendor ID mismatch!`)
      console.error(`[createOrder]    Expected: ${vendorInfo.vendorId}`)
      console.error(`[createOrder]    Found: ${vendor.id}`)
      throw new Error(`Vendor ID mismatch: Expected ${vendorInfo.vendorId}, but found ${vendor.id}`)
    }
    
    // CRITICAL FIX: Use vendor._id.toString() as key to ensure consistency
    const vendorKey = vendor._id.toString()

    // Group items by vendor
    if (!itemsByVendor.has(vendorKey)) {
      itemsByVendor.set(vendorKey, [])
      vendorInfoMap.set(vendorKey, {
        vendorId: vendor.id, // Use vendor.id from database
        vendorName: vendor.name, // Use vendor.name from database (not vendorInfo.vendorName)
        vendorObjectId: vendor._id // Use vendor._id from database
      })
      console.log(`[createOrder] Added vendor to map: ${vendorKey} -> ${vendor.id} (${vendor.name})`)
    }

    itemsByVendor.get(vendorKey)!.push({
        uniformId: uniform._id,
        productId: uniform.id, // Store numeric/string product ID for correlation
        uniformName: item.uniformName,
        size: item.size,
        quantity: item.quantity,
        price: itemPrice,
    })
  }

  // Generate parent order ID (for grouping split orders)
  const parentOrderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`

  // Create separate orders for each vendor
  const createdOrders = []
  const employeeName = `${employee.firstName} ${employee.lastName}`
  
  // Get numeric IDs for correlation
  const employeeIdNum = employee.employeeId || 
    employee.id // Use employeeId field first, fallback to id
  const companyIdNum = company.id // Company.id is already numeric

  console.log(`[createOrder] ========================================`)
  console.log(`[createOrder] 📦 CREATING MULTI-VENDOR ORDER`)
  console.log(`[createOrder] Parent Order ID: ${parentOrderId}`)
  console.log(`[createOrder] Vendors: ${itemsByVendor.size}`)
  itemsByVendor.forEach((items: any, vid: number) => {
    const vendorInfo = vendorInfoMap.get(vid)!
    console.log(`[createOrder]   - Vendor: ${vendorInfo.vendorName} (${vid}), Items: ${items.length}`)
  })
  console.log(`[createOrder] ========================================`)

  let isFirstOrder = true
  for (const [vendorKey, items] of itemsByVendor.entries()) {
    const vendorInfo = vendorInfoMap.get(vendorKey)
    if (!vendorInfo) {
      console.error(`[createOrder] ❌ CRITICAL: Vendor info not found for key: ${vendorKey}`)
      throw new Error(`Vendor info not found for key: ${vendorKey}`)
    }
    
    // CRITICAL FIX: Re-verify vendor exists in database before creating order
    // This ensures we use the actual vendor data from the database, not cached data
    // Use numeric id field first (most reliable) since we already have it
    let vendor = await Vendor.findOne({ id: 
    vendorInfo.vendorId })
    
    // Fallback: If not found by numeric id, try by ObjectId
    if (!vendor) {
      console.warn(`[createOrder] ⚠️ Vendor not found by numeric id ${vendorInfo.vendorId}, trying by ObjectId: ${
    vendorInfo.vendorObjectId.toString()}`)
      vendor = await Vendor.findById(vendorInfo.vendorObjectId)
    }
    
    // Final fallback: Try raw MongoDB collection lookup
    if (!vendor) {
      console.warn(`[createOrder] ⚠️ Vendor not found by ObjectId, trying raw MongoDB collection lookup`)
      const db = mongoose.connection.db
         if (!db) {
    throw new Error('Database connection not available')
  }
  if (db) {
        // Try by ObjectId first
        let rawVendor = await db.collection('vendors').findOne({ _id: 
    vendorInfo.vendorObjectId })
        
        // If not found, try by numeric id
        if (!rawVendor) {
          rawVendor = await db.collection('vendors').findOne({ id: 
    vendorInfo.vendorId })
        }
        
        if (rawVendor) {
          // Convert raw vendor to Mongoose document using the _id from raw document
          vendor = await Vendor.findById(rawVendor._id)
          
          // If still not found, try by numeric id
          if (!vendor) {
            vendor = await Vendor.findOne({ id: 
    rawVendor.id })
          }
        }
      }
    }
    
    if (!vendor) {
      console.error(`[createOrder] ❌ CRITICAL: Vendor not found in database after all lookup attempts`)
      console.error(`[createOrder]    vendorObjectId: ${
    vendorInfo.vendorObjectId.toString()}`)
      console.error(`[createOrder]    vendorId (numeric): ${vendorInfo.vendorId}`)
      console.error(`[createOrder]    vendorName: ${vendorInfo.vendorName}`)
      
      // List available vendors for debugging
      const allVendors = await Vendor.find({}, 'id name _id').limit(5).lean() as any
      
      throw new Error(`Vendor not found: ${vendorInfo.vendorId}. Please ensure the vendor exists in the database.`)
    }
    
    // CRITICAL VALIDATION: Verify vendorObjectId matches 
    vendor._id
    if (vendorInfo.vendorObjectId.toString() !== vendor._id.toString()) {
      console.error(`[createOrder] ❌ CRITICAL: Vendor ObjectId mismatch!`)
      console.error(`[createOrder]    
    vendorInfo.vendorObjectId: ${
    vendorInfo.vendorObjectId.toString()}`)
      console.error(`[createOrder]    
    vendor._id: ${
    vendor._id.toString()}`)
      throw new Error(`Vendor ObjectId mismatch: vendorInfo.vendorObjectId (${vendorInfo.vendorObjectId.toString()}) does not match vendor._id (${vendor._id.toString()})`)
    }
    
    console.log(`[createOrder] Processing vendor: ${vendor.id} (${vendor.name}), Key: ${vendorKey}`)
    
    // Calculate total for this vendor's order
    const total = items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0)

    // Generate unique order ID for this vendor order
    // Use vendor.id (numeric/string) for order ID generation, not vendorKey (ObjectId string)
    const orderId = `${parentOrderId}-${(vendor as any).id.substring(0, 8).toUpperCase()}`

    // CRITICAL FIX: For split orders, ALL orders should start with 'Awaiting approval'
    // This ensures all vendor orders are visible in the approval queue
    // The previous logic that set child orders to 'Awaiting fulfilment' was causing them to be invisible
    // After approval, ALL orders will be updated to 'Awaiting fulfilment' atomically
    const orderStatus = 'Awaiting approval' // All orders require approval, even split orders
    
    // Determine PR status based on workflow configuration
    let prStatus: string | undefined = undefined
    let prNumber: string | undefined = undefined
    let prDate: Date | undefined = undefined
    
    // Check if PR/PO workflow is enabled
    // Use explicit boolean check and handle undefined/null cases
    const isWorkflowEnabled = company.enable_pr_po_workflow === true || 
    company.enable_pr_po_workflow === 'true'
    const isSiteAdminApprovalRequired = company.enable_site_admin_pr_approval === true || 
    company.enable_site_admin_pr_approval === 'true'
    
    console.log(`[createOrder] Workflow configuration check:`)
    console.log(`[createOrder]   enable_pr_po_workflow (raw): ${company.enable_pr_po_workflow} (type: ${typeof 
    company.enable_pr_po_workflow})`)
    console.log(`[createOrder]   enable_site_admin_pr_approval (raw): ${company.enable_site_admin_pr_approval} (type: ${typeof 
    company.enable_site_admin_pr_approval})`)
    console.log(`[createOrder]   isWorkflowEnabled: ${isWorkflowEnabled}`)
    console.log(`[createOrder]   isSiteAdminApprovalRequired: ${isSiteAdminApprovalRequired}`)
    
    if (isWorkflowEnabled) {
      // Check if site admin approval is required
      if (isSiteAdminApprovalRequired) {
        // Order must go to Site Admin first
        // IMPORTANT: Do NOT generate PR number/date here - Location Admin will enter them during approval
        prNumber = undefined
        prDate = undefined
        prStatus = 'PENDING_SITE_ADMIN_APPROVAL'
        console.log(`[createOrder] ✅ PR workflow enabled with Site Admin approval required. Setting PR status to: ${prStatus}`)
        console.log(`[createOrder] ⚠️ PR Number/Date will be entered by Location Admin during approval`)
      } else {
        // Skip site admin approval, go directly to Company Admin
        // For Company Admin approval, we can generate PR number/date if needed
        // (Company Admin might also enter them, but we can provide defaults)
        prNumber = `PR-${company.id}-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`
        prDate = new Date()
        prStatus = 'PENDING_COMPANY_ADMIN_APPROVAL'
        console.log(`[createOrder] ✅ PR workflow enabled but Site Admin approval not required. Setting PR status to: ${prStatus}`)
      }
    } else {
      // PR/PO workflow not enabled - use legacy approval flow
      console.log(`[createOrder] ⚠️ PR/PO workflow not enabled (enable_pr_po_workflow=${company.enable_pr_po_workflow}). Using legacy approval flow.`)
    }
    
    console.log(`[createOrder] Creating order for vendor ${vendor.name} (${vendor.id}):`)
    console.log(`[createOrder]   Order ID: ${orderId}`)
    console.log(`[createOrder]   Status: ${orderStatus}`)
    console.log(`[createOrder]   PR Status: ${prStatus || 'N/A'}`)
    console.log(`[createOrder]   PR Number: ${prNumber || 'N/A'}`)
    console.log(`[createOrder]   Parent Order ID: ${parentOrderId}`)
    console.log(`[createOrder]   Vendor ObjectId: ${
    vendor._id.toString()}`)
    console.log(`[createOrder]   Items: ${items.length}, Total: ₹${total}`)

    // CRITICAL FIX: Create order using vendor data from database, NOT from vendorInfo map
    // This ensures we use the actual vendor name and _id from the database
  const order = await Order.create({
    id: orderId,
    employeeId: 
    employee._id,
    employeeIdNum: employeeIdNum, // Numeric/string employee ID for correlation
      employeeName: employeeName,
      items: items, // Each item already has productId
    total: total,
    status: orderStatus,
    orderDate: new Date(),
    dispatchLocation: orderData.dispatchLocation || 
    employee.dispatchPreference || 'standard',
    companyId: 
    company._id,
    companyIdNum: companyIdNum, // Numeric company ID for correlation
    // Structured shipping address fields (REQUIRED by Order model)
    shipping_address_line_1: shippingAddress.shipping_address_line_1,
    shipping_address_line_2: shippingAddress.shipping_address_line_2,
    shipping_address_line_3: shippingAddress.shipping_address_line_3,
    shipping_city: shippingAddress.shipping_city,
    shipping_state: shippingAddress.shipping_state,
    shipping_pincode: shippingAddress.shipping_pincode,
    shipping_country: shippingAddress.shipping_country || 'India',
    // Legacy field for backward compatibility (deprecated)
    deliveryAddress: deliveryAddressToUse,
    estimatedDeliveryTime: orderData.estimatedDeliveryTime,
      parentOrderId: parentOrderId, // Link to parent order
      vendorId: vendor.id, // CRITICAL FIX: Store 6-digit numeric vendor ID (not ObjectId)
      vendorName: vendor.name, // CRITICAL FIX: Use vendor.name from database, not vendorInfo.vendorName
      isPersonalPayment: orderData.isPersonalPayment || false,
      personalPaymentAmount: orderData.personalPaymentAmount || 0,
      // PR (Purchase Requisition) Extension Fields
      pr_number: prNumber,
      pr_date: prDate,
      pr_status: prStatus,
  })
    
    // CRITICAL VERIFICATION: Verify order was created with correct vendorId (numeric ID)
    if (order.vendorId !== vendor.id) {
      console.error(`[createOrder] ❌ CRITICAL: Order created with WRONG vendorId!`)
      console.error(`[createOrder]    Expected: ${vendor.id} (numeric ID)`)
      console.error(`[createOrder]    Actual: ${order.vendorId}`)
      throw new Error(`Order created with incorrect vendorId. Expected ${vendor.id}, but got ${order.vendorId}`)
    }
    
    console.log(`[createOrder] ✅ Order created successfully:`)
    console.log(`[createOrder]    Order ID: ${order.id}`)
    console.log(`[createOrder]    Order _id: ${order._id}`)
    console.log(`[createOrder]    VendorId: ${order.vendorId} (numeric ID)`)
    console.log(`[createOrder]    VendorName: ${order.vendorName}`)
    console.log(`[createOrder]    Items: ${items.length}`)

    console.log(`[createOrder] ✅ Order created: ${order.id}, _id: ${order._id}, vendorId: ${order.vendorId?.toString()}`)

    isFirstOrder = false

    // Populate and add to results
    const populatedOrder = await Order.findById(order._id)
      .populate('employeeId', 'id firstName lastName email')
      .populate('companyId', 'id name')
      .populate('items.uniformId', 'id name')
      .populate('vendorId', 'id name')
      .lean() as any

    createdOrders.push(toPlainObject(populatedOrder))
  }

  // If only one order was created, return it directly
  // Otherwise, return the first order with metadata about split orders
  if (createdOrders.length === 1) {
    return createdOrders[0]
  }

  // Return the first order with information about split orders
  // The frontend can query for all orders with the same parentOrderId
  return {
    ...createdOrders[0],
    isSplitOrder: true,
    parentOrderId: parentOrderId,
    totalOrders: createdOrders.length,
    splitOrders: createdOrders.map(o => ({
      orderId: o.id,
      vendorName: o.vendorName,
      total: o.total,
      itemCount: o.items?.length || 0
    }))
  }
}

export async function approveOrder(orderId: string, adminEmail: string, prNumber?: string, prDate?: Date): Promise<any> {
  await connectDB()
  
  console.log(`[approveOrder] ========================================`)
  console.log(`[approveOrder] 🚀 APPROVING ORDER: ${orderId}`)
  console.log(`[approveOrder] Admin Email: ${adminEmail}`)
  console.log(`[approveOrder] PR Number: ${prNumber || 'N/A'}`)
  console.log(`[approveOrder] PR Date: ${prDate ? 
    prDate.toISOString() : 'N/A'}`)
  
  // First, try to find order by id field
  let order = await Order.findOne({ id: orderId })
  
  // If not found by id, check if orderId is a parentOrderId (from grouped approval view)
  // This happens when getPendingApprovals returns parent order ID as the id field
  if (!order) {
    console.log(`[approveOrder] Order not found by id, checking if orderId is a parentOrderId...`)
    const ordersWithParent = await Order.find({ parentOrderId: orderId })
    if (ordersWithParent.length > 0) {
      console.log(`[approveOrder] ✅ Found ${ordersWithParent.length} child order(s) with parentOrderId: ${orderId}`)
      console.log(`[approveOrder] Redirecting to approveOrderByParentId...`)
      // This is a parent order ID, approve all child orders
      return await approveOrderByParentId(orderId, adminEmail, prNumber, prDate)
    }
    
    // If still not found, throw error
    console.error(`[approveOrder] ❌ Order not found: ${orderId}`)
    throw new Error(`Order not found: ${orderId}`)
  }
  
  console.log(`[approveOrder] ✅ Order found: ${order.id}, Status: ${order.status}, PR Status: ${order.pr_status || 'N/A'}, ParentOrderId: ${order.parentOrderId || 'N/A'}`)
  
  // CRITICAL FIX: If this order has a parentOrderId, approve ALL child orders atomically
  // This ensures all vendor orders in a split order are approved together
  if (order.parentOrderId) {
    console.log(`[approveOrder] Order has parentOrderId: ${order.parentOrderId}`)
    console.log(`[approveOrder] Redirecting to approveOrderByParentId to approve all child orders...`)
    return await approveOrderByParentId(order.parentOrderId, adminEmail, prNumber, prDate)
  }
  
  // Get company to check workflow settings
  const db = mongoose.connection.db
    if (!db) {
    throw new Error('Database connection not available')
  }
   if (!db) {
    throw new Error('Database connection not available')
  }

  // Convert companyId to ObjectId if needed (handle both ObjectId and string)
  let companyIdObjectId: any = order.companyId
  if (companyIdObjectId && !(companyIdObjectId instanceof mongoose.Types.ObjectId)) {
    if (mongoose.Types.ObjectId.isValid(companyIdObjectId)) {
      companyIdObjectId = new mongoose.Types.ObjectId(companyIdObjectId)
    }
  }

  let company = await Company.findById(companyIdObjectId)
  
  // Fallback: Use raw MongoDB if Mongoose lookup fails
  if (!company) {
    const companyIdStr = companyIdObjectId?.toString()
    console.log(`[approveOrder] Company not found by ObjectId ${companyIdStr}, trying raw MongoDB lookup`)
    
    // Try raw MongoDB lookup with proper ObjectId conversion
    const rawCompany = await db.collection('companies').findOne({ _id: companyIdObjectId })
    if (rawCompany) {
      // Try to find using Mongoose with the raw company data
      if (rawCompany.id) {
        company = await Company.findOne({ id: rawCompany.id })
      }
      if (!company && rawCompany._id) {
        company = await Company.findById(rawCompany._id)
      }
    }
    
    // If still not found, try lookup by business ID (companyIdNum from order)
    if (!company && order.companyIdNum) {
      console.log(`[approveOrder] Trying lookup by business ID: ${order.companyIdNum}`)
      company = await Company.findOne({ id: String(order.companyIdNum) })
    }
    
    if (!company) {
      console.error(`[approveOrder] Company not found for order ${orderId}, companyId: ${companyIdStr}, companyIdNum: ${order.companyIdNum}`)
    throw new Error(`Company not found for order ${orderId}`)
    }
  }
  
  // For PR workflow, check pr_status instead of status
  const isSiteAdminApproval = order.pr_status === 'PENDING_SITE_ADMIN_APPROVAL'
  const isCompanyAdminApproval = order.pr_status === 'PENDING_COMPANY_ADMIN_APPROVAL'
  
  // If pr_status is not set but company has PR workflow enabled, determine the correct status
  let shouldBeSiteAdminApproval = false
  if (!order.pr_status && company.enable_pr_po_workflow === true && company.enable_site_admin_pr_approval === true) {
    // Order was created before PR workflow was fully enabled, but company now requires site admin approval
    // Check if order is in a state that would require site admin approval
    if (order.status === 'Awaiting approval' || !order.status) {
      shouldBeSiteAdminApproval = true
      console.log(`[approveOrder] ⚠️ Order ${orderId} has no pr_status but company requires site admin approval. Treating as site admin approval.`)
    }
  }
  
  console.log(`[approveOrder] PR Workflow Check:`)
  console.log(`[approveOrder]   isSiteAdminApproval: ${isSiteAdminApproval}`)
  console.log(`[approveOrder]   isCompanyAdminApproval: ${isCompanyAdminApproval}`)
  console.log(`[approveOrder]   shouldBeSiteAdminApproval: ${shouldBeSiteAdminApproval}`)
  console.log(`[approveOrder]   order.pr_status: ${order.pr_status || 'undefined'}`)
  console.log(`[approveOrder]   
    company.enable_pr_po_workflow: ${company.enable_pr_po_workflow}`)
  console.log(`[approveOrder]   
    company.enable_site_admin_pr_approval: ${company.enable_site_admin_pr_approval}`)
  
  // Only check status for legacy orders (no PR workflow)
  if (!isSiteAdminApproval && !isCompanyAdminApproval && !shouldBeSiteAdminApproval && order.status !== 'Awaiting approval') {
    throw new Error(`Order ${orderId} is not in 'Awaiting approval' status (current: ${order.status}, pr_status: ${order.pr_status || 'N/A'})`)
  }
  
  // Find employee by email (handle encryption)
  // Use the same pattern as canApproveOrders for reliable lookup
  const { encrypt, decrypt } = require('../utils/encryption')
  const trimmedEmail = adminEmail.trim()
  let encryptedEmail: string
  
  try {
    encryptedEmail = encrypt(trimmedEmail)
  } catch (error) {
    encryptedEmail = ''
  }
  
  // Try finding with encrypted email first
  let employee = await Employee.findOne({ email: encryptedEmail }).lean() as any
  
  // If not found, try decryption matching
  if (!employee && encryptedEmail) {
    const allEmployees = await Employee.find({}).lean() as any
    for (const emp of allEmployees) {
      if (emp.email && typeof emp.email === 'string') {
        try {
          const decryptedEmail = decrypt(emp.email)
          if (decryptedEmail.toLowerCase() === trimmedEmail.toLowerCase()) {
            employee = emp
            break
          }
        } catch (error) {
          continue
        }
      }
    }
  }
  
  if (!employee) {
    throw new Error(`Employee not found: ${adminEmail}`)
  }
  
  // Check if this is a Site Admin approval (PR workflow)
  // Use the already computed values from above (computed before employee lookup)
  const finalIsSiteAdminApproval = isSiteAdminApproval || shouldBeSiteAdminApproval
  
  console.log(`[approveOrder] Final approval type determination:`)
  console.log(`[approveOrder]   finalIsSiteAdminApproval: ${finalIsSiteAdminApproval}`)
  console.log(`[approveOrder]   isCompanyAdminApproval: ${isCompanyAdminApproval}`)
  
  if (finalIsSiteAdminApproval) {
    // Site Admin approval flow
    console.log(`[approveOrder] Processing Site Admin approval for order ${orderId}`)
    
    // Get the order's employee (the one who placed the order)
    const orderEmployee = await Employee.findById(order.employeeId).lean() as any
    if (!orderEmployee || !(orderEmployee as any).locationId) {
      throw new Error(`Order's employee not found or has no location assigned`)
    }
    
    // Verify user is a Site Admin (Location Admin) for the order's employee's location
    const Location = require('../models/Location').default
    const employeeLocation = await Location.findById((orderEmployee as any).locationId).lean() as any
    
    if (!employeeLocation || !(employeeLocation as any).adminId) {
      throw new Error(`Order's employee location not found or has no admin assigned`)
    }
    
    // Check if the approving user is the location admin
    // Handle ObjectId comparison robustly (similar to isCompanyAdmin)
    let locationAdminId: any = (employeeLocation as any).adminId
    let approvingEmployeeId: any = employee._id
    
    // Convert both to ObjectId for reliable comparison
    if (!(locationAdminId instanceof mongoose.Types.ObjectId)) {
      if (mongoose.Types.ObjectId.isValid(locationAdminId)) {
        locationAdminId = new mongoose.Types.ObjectId(locationAdminId)
      }
    }
    if (!(approvingEmployeeId instanceof mongoose.Types.ObjectId)) {
      if (mongoose.Types.ObjectId.isValid(approvingEmployeeId)) {
        approvingEmployeeId = new mongoose.Types.ObjectId(approvingEmployeeId)
      }
    }
    
    const locationAdminIdStr = locationAdminId.toString()
    const approvingEmployeeIdStr = approvingEmployeeId.toString()
    
    console.log(`[approveOrder] Site Admin authorization check:`)
    console.log(`[approveOrder]   locationAdminId: ${locationAdminIdStr} (type: ${typeof locationAdminId})`)
    console.log(`[approveOrder]   approvingEmployeeId: ${approvingEmployeeIdStr} (type: ${typeof approvingEmployeeId})`)
    
    if (locationAdminIdStr !== approvingEmployeeIdStr) {
      // Additional check: try comparing by numeric employee ID as fallback
      const locationAdminEmployee = await Employee.findById(locationAdminId).lean() as any
      const approvingEmployee = await Employee.findById(approvingEmployeeId).lean() as any
      
      if (locationAdminEmployee && approvingEmployee) {
        const locationAdminEmployeeId = (locationAdminEmployee as any).id || (locationAdminEmployee as any).employeeId
        const approvingEmployeeIdNum = (approvingEmployee as any).id || (approvingEmployee as any).employeeId
        
        console.log(`[approveOrder] Fallback check by numeric ID:`)
        console.log(`[approveOrder]   locationAdminEmployeeId: ${locationAdminEmployeeId}`)
        console.log(`[approveOrder]   approvingEmployeeIdNum: ${approvingEmployeeIdNum}`)
        
        if (locationAdminEmployeeId && approvingEmployeeIdNum && locationAdminEmployeeId.toString() === approvingEmployeeIdNum.toString()) {
          console.log(`[approveOrder] ✅ Authorization passed via numeric ID fallback`)
        } else {
          throw new Error(`User ${adminEmail} is not the Site Admin (Location Admin) for this order's location`)
        }
      } else {
        throw new Error(`User ${adminEmail} is not the Site Admin (Location Admin) for this order's location`)
      }
    } else {
      console.log(`[approveOrder] ✅ Authorization passed via ObjectId comparison`)
    }
    
    // Update PR status to SITE_ADMIN_APPROVED
    // PR number and date MUST be provided by Site Admin (required for site admin approval)
    if (!prNumber || !prNumber.trim()) {
      throw new Error('PR Number is required for Site Admin approval')
    }
    if (!prDate) {
      throw new Error('PR Date is required for Site Admin approval')
    }
    
    // Set PR number and date (overwrite any auto-generated values)
    order.pr_number = prNumber.trim()
    order.pr_date = prDate
    console.log(`[approveOrder] Site Admin provided PR number: ${
    prNumber.trim()}`)
    console.log(`[approveOrder] Site Admin provided PR date: ${
    prDate.toISOString()}`)
    
    order.pr_status = 'SITE_ADMIN_APPROVED'
    order.site_admin_approved_by = employee._id
    order.site_admin_approved_at = new Date()
    
    // Check if company admin approval is required
    if (company.require_company_admin_po_approval === true) {
      // Move to Company Admin approval
      order.pr_status = 'PENDING_COMPANY_ADMIN_APPROVAL'
      console.log(`[approveOrder] Site Admin approved. Moving to Company Admin approval.`)
    } else {
      // No company admin approval needed, move to fulfilment
      order.status = 'Awaiting fulfilment'
      console.log(`[approveOrder] Site Admin approved. No Company Admin approval required. Moving to fulfilment.`)
    }
  } else if (isCompanyAdminApproval) {
    // Company Admin approval flow
    console.log(`[approveOrder] Processing Company Admin approval for order ${orderId}`)
    
    const canApprove = await canApproveOrders(adminEmail, company.id)
    if (!canApprove) {
      throw new Error(`User ${adminEmail} does not have permission to approve orders as Company Admin`)
    }
    
    // Update PR status to COMPANY_ADMIN_APPROVED
    order.pr_status = 'COMPANY_ADMIN_APPROVED'
    order.company_admin_approved_by = employee._id
    order.company_admin_approved_at = new Date()
    order.status = 'Awaiting fulfilment'
    console.log(`[approveOrder] Company Admin approved. Moving to fulfilment.`)
  } else {
    // Legacy approval flow (no PR workflow)
    console.log(`[approveOrder] Processing legacy approval for order ${orderId}`)
  
    const canApprove = await canApproveOrders(adminEmail, company.id)
    if (!canApprove) {
      throw new Error(`User ${adminEmail} does not have permission to approve orders`)
    }
    
    // Update order status
    order.status = 'Awaiting fulfilment'
  }
  
  await order.save()
  
  // Populate and return
  const populatedOrder = await Order.findById(order._id)
    .populate('employeeId', 'id firstName lastName email')
    .populate('companyId', 'id name')
    .populate('items.uniformId', 'id name')
    .lean() as any
  
  // Manually fetch vendor information if vendorId exists
  let vendorName = null
  if (populatedOrder && (populatedOrder as any).vendorId) {
    const vendorIdValue = (populatedOrder as any).vendorId
    // vendorId is now a string (6-digit numeric), not ObjectId
    if (typeof vendorIdValue === 'string' && /^\d{6}$/.test(vendorIdValue)) {
      const vendor = await Vendor.findOne({ id: vendorIdValue }).select('id name').lean() as any
      if (vendor) {
        vendorName = (vendor as any).name
      }
    }
  }
  
  const result = toPlainObject(populatedOrder)
  if (vendorName) {
    (result as any).vendorName = vendorName
  }
  
  return result
}

async function approveOrderByParentId(parentOrderId: string, adminEmail: string, prNumber?: string, prDate?: Date): Promise<any> {
  await connectDB()
  
  console.log(`[approveOrderByParentId] ========================================`)
  console.log(`[approveOrderByParentId] 🚀 APPROVING PARENT ORDER: ${parentOrderId}`)
  console.log(`[approveOrderByParentId] Admin Email: ${adminEmail}`)
  console.log(`[approveOrderByParentId] PR Number: ${prNumber || 'N/A'}`)
  console.log(`[approveOrderByParentId] PR Date: ${prDate ? 
    prDate.toISOString() : 'N/A'}`)
  
  // Find all orders with this parentOrderId
  const childOrders = await Order.find({ parentOrderId: parentOrderId })
  console.log(`[approveOrderByParentId] Found ${childOrders.length} child order(s) with parentOrderId: ${parentOrderId}`)
  
  if (childOrders.length === 0) {
    console.error(`[approveOrderByParentId] ❌ No orders found with parentOrderId: ${parentOrderId}`)
    throw new Error(`No orders found with parentOrderId: ${parentOrderId}`)
  }
  
  // Log all child orders before approval
  childOrders.forEach((order: any, idx: number) => {
    console.log(`[approveOrderByParentId] Child Order ${idx + 1}:`, {
      orderId: order.id,
      status: order.status,
      vendorId: order.vendorId?.toString() || 'N/A',
      vendorName: (order as any).vendorName || 'N/A',
      itemCount: order.items?.length || 0,
      total: order.total
    })
  })
  
  // CRITICAL FIX: Allow approval even if no orders are in "Awaiting approval" status
  // This handles cases where:
  // 1. Orders were created with different initial statuses (first = "Awaiting approval", others = "Awaiting fulfilment")
  // 2. Orders were partially approved in a previous attempt
  // 3. Orders need to be synchronized to "Awaiting fulfilment" after parent approval
  const pendingOrders = childOrders.filter(o => o.status === 'Awaiting approval')
  const fulfilmentOrders = childOrders.filter(o => o.status === 'Awaiting fulfilment')
  
  console.log(`[approveOrderByParentId] Status breakdown:`, {
    awaitingApproval: pendingOrders.length,
    awaitingFulfilment: fulfilmentOrders.length,
    total: childOrders.length
  })
  
  // If no orders are awaiting approval, but some are awaiting fulfilment, that's OK
  // This happens when child orders were created with "Awaiting fulfilment" status
  // We still need to approve them to ensure they're visible to vendors
  if (pendingOrders.length === 0 && fulfilmentOrders.length === 0) {
    console.error(`[approveOrderByParentId] ❌ No orders with parentOrderId ${parentOrderId} are in 'Awaiting approval' or 'Awaiting fulfilment' status`)
    console.error(`[approveOrderByParentId] All orders are in status:`, childOrders.map(o => o.status))
    throw new Error(`No orders with parentOrderId ${parentOrderId} are in 'Awaiting approval' or 'Awaiting fulfilment' status. All orders are already processed.`)
  }
  
  // Log that we're proceeding with approval
  if (pendingOrders.length === 0) {
    console.log(`[approveOrderByParentId] ⚠️ No orders in 'Awaiting approval' status, but ${fulfilmentOrders.length} order(s) in 'Awaiting fulfilment' status`)
    console.log(`[approveOrderByParentId] ✅ Proceeding with approval to synchronize all child orders`)
  }
  
  // Verify admin can approve orders (check once using first order's company)
  const firstOrder = childOrders[0]
  
  // Use raw MongoDB for reliable ObjectId lookup
  const db = mongoose.connection.db
    if (!db) {
    throw new Error('Database connection not available')
  }
   if (!db) {
    throw new Error('Database connection not available')
  }

  // Convert companyId to ObjectId if needed (handle both ObjectId and string)
  let companyIdObjectId: any = firstOrder.companyId
  if (companyIdObjectId && !(companyIdObjectId instanceof mongoose.Types.ObjectId)) {
    if (mongoose.Types.ObjectId.isValid(companyIdObjectId)) {
      companyIdObjectId = new mongoose.Types.ObjectId(companyIdObjectId)
    }
  }

  let company = await Company.findById(companyIdObjectId)
  
  // Fallback: Use raw MongoDB if Mongoose lookup fails
  if (!company) {
    const companyIdStr = companyIdObjectId?.toString()
    console.log(`[approveOrderByParentId] Company not found by ObjectId ${companyIdStr}, trying raw MongoDB lookup`)
    
    // Try raw MongoDB lookup with proper ObjectId conversion
    const rawCompany = await db.collection('companies').findOne({ _id: companyIdObjectId })
    if (rawCompany) {
      // Try to find using Mongoose with the raw company data
      if (rawCompany.id) {
        company = await Company.findOne({ id: rawCompany.id })
      }
      if (!company && rawCompany._id) {
        company = await Company.findById(rawCompany._id)
      }
    }
    
    // If still not found, try lookup by business ID (companyIdNum from order)
    if (!company && firstOrder.companyIdNum) {
      console.log(`[approveOrderByParentId] Trying lookup by business ID: ${firstOrder.companyIdNum}`)
      company = await Company.findOne({ id: String(firstOrder.companyIdNum) })
    }
    
    if (!company) {
      console.error(`[approveOrderByParentId] Company not found for parent order ${parentOrderId}, companyId: ${companyIdStr}, companyIdNum: ${firstOrder.companyIdNum}`)
      const allCompanies = await Company.find({}, 'id name _id').limit(5).lean() as any
      throw new Error(`Company not found for parent order ${parentOrderId}`)
    }
  }
  
  // Find employee by email (handle encryption)
  // Use the same pattern as canApproveOrders for reliable lookup
  const { encrypt, decrypt } = require('../utils/encryption')
  const trimmedEmail = adminEmail.trim()
  let encryptedEmail: string
  
  try {
    encryptedEmail = encrypt(trimmedEmail)
  } catch (error) {
    encryptedEmail = ''
  }
  
  // Try finding with encrypted email first
  let employee = await Employee.findOne({ email: encryptedEmail }).lean() as any
  
  // If not found, try decryption matching
  if (!employee && encryptedEmail) {
    const allEmployees = await Employee.find({}).lean() as any
    for (const emp of allEmployees) {
      if (emp.email && typeof emp.email === 'string') {
        try {
          const decryptedEmail = decrypt(emp.email)
          if (decryptedEmail.toLowerCase() === trimmedEmail.toLowerCase()) {
            employee = emp
            break
          }
        } catch (error) {
          continue
        }
      }
    }
  }
  
  if (!employee) {
    throw new Error(`Employee not found: ${adminEmail}`)
  }
  
  // Check if this is a site admin approval (PR workflow)
  // Check the first order's PR status to determine the approval type
  const firstOrderPRStatus = firstOrder.pr_status
  const isSiteAdminApproval = firstOrderPRStatus === 'PENDING_SITE_ADMIN_APPROVAL'
  const isCompanyAdminApproval = firstOrderPRStatus === 'PENDING_COMPANY_ADMIN_APPROVAL'
  
  if (isSiteAdminApproval) {
    // Site Admin approval flow for split orders
    console.log(`[approveOrderByParentId] Processing Site Admin approval for parent order ${parentOrderId}`)
    
    // Get the first order's employee (the one who placed the order)
    const orderEmployee = await Employee.findById(firstOrder.employeeId).lean() as any
    if (!orderEmployee || !(orderEmployee as any).locationId) {
      throw new Error(`Order's employee not found or has no location assigned`)
    }
    
    // Verify user is a Site Admin (Location Admin) for the order's employee's location
    const Location = require('../models/Location').default
    const employeeLocation = await Location.findById((orderEmployee as any).locationId).lean() as any
    
    if (!employeeLocation || !(employeeLocation as any).adminId) {
      throw new Error(`Order's employee location not found or has no admin assigned`)
    }
    
    // Check if the approving user is the location admin (robust ObjectId comparison)
    let locationAdminId: any = (employeeLocation as any).adminId
    let approvingEmployeeId: any = employee._id
    
    // Convert both to ObjectId for reliable comparison
    if (!(locationAdminId instanceof mongoose.Types.ObjectId)) {
      if (mongoose.Types.ObjectId.isValid(locationAdminId)) {
        locationAdminId = new mongoose.Types.ObjectId(locationAdminId)
      }
    }
    if (!(approvingEmployeeId instanceof mongoose.Types.ObjectId)) {
      if (mongoose.Types.ObjectId.isValid(approvingEmployeeId)) {
        approvingEmployeeId = new mongoose.Types.ObjectId(approvingEmployeeId)
      }
    }
    
    const locationAdminIdStr = locationAdminId.toString()
    const approvingEmployeeIdStr = approvingEmployeeId.toString()
    
    console.log(`[approveOrderByParentId] Site Admin authorization check:`)
    console.log(`[approveOrderByParentId]   locationAdminId: ${locationAdminIdStr} (type: ${typeof locationAdminId})`)
    console.log(`[approveOrderByParentId]   approvingEmployeeId: ${approvingEmployeeIdStr} (type: ${typeof approvingEmployeeId})`)
    
    if (locationAdminIdStr !== approvingEmployeeIdStr) {
      // Additional check: try comparing by numeric employee ID as fallback
      const locationAdminEmployee = await Employee.findById(locationAdminId).lean() as any
      const approvingEmployee = await Employee.findById(approvingEmployeeId).lean() as any
      
      if (locationAdminEmployee && approvingEmployee) {
        const locationAdminEmployeeId = (locationAdminEmployee as any).id || (locationAdminEmployee as any).employeeId
        const approvingEmployeeIdNum = (approvingEmployee as any).id || (approvingEmployee as any).employeeId
        
        console.log(`[approveOrderByParentId] Fallback check by numeric ID:`)
        console.log(`[approveOrderByParentId]   locationAdminEmployeeId: ${locationAdminEmployeeId}`)
        console.log(`[approveOrderByParentId]   approvingEmployeeIdNum: ${approvingEmployeeIdNum}`)
        
        if (locationAdminEmployeeId && approvingEmployeeIdNum && locationAdminEmployeeId.toString() === approvingEmployeeIdNum.toString()) {
          console.log(`[approveOrderByParentId] ✅ Authorization passed via numeric ID fallback`)
        } else {
          throw new Error(`User ${adminEmail} is not the Site Admin (Location Admin) for this order's location`)
        }
      } else {
        throw new Error(`User ${adminEmail} is not the Site Admin (Location Admin) for this order's location`)
      }
    } else {
      console.log(`[approveOrderByParentId] ✅ Authorization passed via ObjectId comparison`)
    }
    
    // Update all child orders with site admin approval
    console.log(`[approveOrderByParentId] 🔄 Updating all child orders with Site Admin approval...`)
    
    let updatedCount = 0
    for (const childOrder of childOrders) {
      const previousStatus = childOrder.status
      const previousPRStatus = childOrder.pr_status
      
      // PR number and date MUST be provided by Site Admin (required for site admin approval)
      if (!prNumber || !prNumber.trim()) {
        throw new Error(`PR Number is required for Site Admin approval of order ${childOrder.id}`)
      }
      if (!prDate) {
        throw new Error(`PR Date is required for Site Admin approval of order ${childOrder.id}`)
      }
      
      // Set PR number and date (overwrite any auto-generated values)
      childOrder.pr_number = prNumber.trim()
      childOrder.pr_date = prDate
      console.log(`[approveOrderByParentId] Site Admin provided PR number: ${
    prNumber.trim()} for order ${childOrder.id}`)
      console.log(`[approveOrderByParentId] Site Admin provided PR date: ${
    prDate.toISOString()} for order ${childOrder.id}`)
      
      // Update PR status to SITE_ADMIN_APPROVED
      childOrder.pr_status = 'SITE_ADMIN_APPROVED'
      childOrder.site_admin_approved_by = employee._id
      childOrder.site_admin_approved_at = new Date()
      
      // Check if company admin approval is required
      if (company.require_company_admin_po_approval === true) {
        // Move to Company Admin approval
        childOrder.pr_status = 'PENDING_COMPANY_ADMIN_APPROVAL'
        console.log(`[approveOrderByParentId] Site Admin approved order ${childOrder.id}. Moving to Company Admin approval.`)
      } else {
        // No company admin approval needed, move to fulfilment
        childOrder.status = 'Awaiting fulfilment'
        console.log(`[approveOrderByParentId] Site Admin approved order ${childOrder.id}. No Company Admin approval required. Moving to fulfilment.`)
      }
      
      await childOrder.save()
      updatedCount++
      console.log(`[approveOrderByParentId] ✅ Updated order ${childOrder.id}: status=${previousStatus}→${childOrder.status}, pr_status=${previousPRStatus}→${childOrder.pr_status}`)
    }
    
    console.log(`[approveOrderByParentId] ✅ Updated ${updatedCount} of ${childOrders.length} child order(s) with Site Admin approval`)
    
    // Return the first order as representative
    const populatedOrder = await Order.findById(firstOrder._id)
      .populate('employeeId', 'id firstName lastName email')
      .populate('companyId', 'id name')
      .populate('items.uniformId', 'id name')
      .lean() as any
    
    // Manually fetch vendor information if vendorId exists
    let vendorName = null
    if (populatedOrder && (populatedOrder as any).vendorId) {
      const vendorIdValue = (populatedOrder as any).vendorId
      // vendorId is now a string (6-digit numeric), not ObjectId
      if (typeof vendorIdValue === 'string' && /^\d{6}$/.test(vendorIdValue)) {
        const vendor = await Vendor.findOne({ id: vendorIdValue }).select('id name').lean() as any
        if (vendor) {
          vendorName = (vendor as any).name
        }
      }
    }
    
    const result = toPlainObject(populatedOrder)
    if (vendorName) {
      (result as any).vendorName = vendorName
    }
    
    return result
  } else if (isCompanyAdminApproval) {
    // Company Admin approval flow
    console.log(`[approveOrderByParentId] Processing Company Admin approval for parent order ${parentOrderId}`)
    
    const canApprove = await canApproveOrders(adminEmail, company.id)
    if (!canApprove) {
      throw new Error(`User ${adminEmail} does not have permission to approve orders as Company Admin`)
    }
    
    // Update all child orders with company admin approval
    console.log(`[approveOrderByParentId] 🔄 Updating all child orders with Company Admin approval...`)
    
    let updatedCount = 0
    for (const childOrder of childOrders) {
      const previousStatus = childOrder.status
      
      // Update PR status to COMPANY_ADMIN_APPROVED
      childOrder.pr_status = 'COMPANY_ADMIN_APPROVED'
      childOrder.company_admin_approved_by = employee._id
      childOrder.company_admin_approved_at = new Date()
      childOrder.status = 'Awaiting fulfilment'
      
      await childOrder.save()
      updatedCount++
      console.log(`[approveOrderByParentId] ✅ Updated order ${childOrder.id}: ${previousStatus} → Awaiting fulfilment`)
    }
    
    console.log(`[approveOrderByParentId] ✅ Updated ${updatedCount} of ${childOrders.length} child order(s) with Company Admin approval`)
    
    // Return the first order as representative
    const populatedOrder = await Order.findById(firstOrder._id)
      .populate('employeeId', 'id firstName lastName email')
      .populate('companyId', 'id name')
      .populate('items.uniformId', 'id name')
      .lean() as any
    
    // Manually fetch vendor information if vendorId exists
    let vendorName = null
    if (populatedOrder && (populatedOrder as any).vendorId) {
      const vendorIdValue = (populatedOrder as any).vendorId
      // vendorId is now a string (6-digit numeric), not ObjectId
      if (typeof vendorIdValue === 'string' && /^\d{6}$/.test(vendorIdValue)) {
        const vendor = await Vendor.findOne({ id: vendorIdValue }).select('id name').lean() as any
        if (vendor) {
          vendorName = (vendor as any).name
        }
      }
    }
    
    const result = toPlainObject(populatedOrder)
    if (vendorName) {
      (result as any).vendorName = vendorName
    }
    
    return result
  } else {
    // Legacy approval flow (no PR workflow)
    console.log(`[approveOrderByParentId] Processing legacy approval for parent order ${parentOrderId}`)
  
    const canApprove = await canApproveOrders(adminEmail, company.id)
    if (!canApprove) {
      throw new Error(`User ${adminEmail} does not have permission to approve orders`)
    }
    
    // CRITICAL FIX: Approve ALL child orders (including those that skipped approval)
    // This ensures all vendor orders are synchronized to "Awaiting fulfilment" status
    // and are visible to vendors after parent approval
    console.log(`[approveOrderByParentId] 🔄 Updating all child orders to 'Awaiting fulfilment' status...`)
    
    let updatedCount = 0
    for (const childOrder of childOrders) {
      const previousStatus = childOrder.status
      if (childOrder.status === 'Awaiting approval' || childOrder.status === 'Awaiting fulfilment') {
        childOrder.status = 'Awaiting fulfilment'
        await childOrder.save()
        updatedCount++
        console.log(`[approveOrderByParentId] ✅ Updated order ${childOrder.id}: ${previousStatus} → Awaiting fulfilment`)
        console.log(`[approveOrderByParentId]    Vendor: ${(childOrder as any).vendorName || 'N/A'} (${childOrder.vendorId?.toString() || 'N/A'})`)
      } else {
        console.log(`[approveOrderByParentId] ⚠️ Skipping order ${childOrder.id} (status: ${previousStatus}, not awaiting approval/fulfilment)`)
      }
    }
    
    console.log(`[approveOrderByParentId] ✅ Updated ${updatedCount} of ${childOrders.length} child order(s)`)
    
    // CRITICAL: Verify all orders were updated correctly
    const verifyOrders = await Order.find({ parentOrderId: parentOrderId }).select('id status vendorId vendorName').lean() as any
    verifyOrders.forEach((order: any, idx: number) => {
      console.log(`[approveOrderByParentId]   ${idx + 1}. ${order.id}: status=${order.status}, vendorId=${order.vendorId?.toString() || 'N/A'}, vendorName=${(order as any).vendorName || 'N/A'}`)
    })
    
    // Return the first order as representative
    const populatedOrder = await Order.findById(firstOrder._id)
      .populate('employeeId', 'id firstName lastName email')
      .populate('companyId', 'id name')
      .populate('items.uniformId', 'id name')
      .lean() as any
    
    // Manually fetch vendor information if vendorId exists
    let vendorName = null
    if (populatedOrder && (populatedOrder as any).vendorId) {
      const vendorIdValue = (populatedOrder as any).vendorId
      // vendorId is now a string (6-digit numeric), not ObjectId
      if (typeof vendorIdValue === 'string' && /^\d{6}$/.test(vendorIdValue)) {
        const vendor = await Vendor.findOne({ id: vendorIdValue }).select('id name').lean() as any
        if (vendor) {
          vendorName = (vendor as any).name
        }
      }
    }
    
    const result = toPlainObject(populatedOrder)
    if (vendorName) {
      (result as any).vendorName = vendorName
    }
    
    return result
  }
}

export async function bulkApproveOrders(orderIds: string[], adminEmail: string, prDataMap?: Map<string, { prNumber: string, prDate: Date }>): Promise<{ success: string[], failed: Array<{ orderId: string, error: string }> }> {
  await connectDB()
  
  const results = {
    success: [] as string[],
    failed: [] as Array<{ orderId: string, error: string }>
  }
  
  // Verify admin can approve orders (check once for all orders)
  // Find employee by email (handle encryption)
  // Use the same pattern as canApproveOrders for reliable lookup
  const { encrypt, decrypt } = require('../utils/encryption')
  const trimmedEmail = adminEmail.trim()
  let encryptedEmail: string
  
  try {
    encryptedEmail = encrypt(trimmedEmail)
  } catch (error) {
    encryptedEmail = ''
  }
  
  // Try finding with encrypted email first
  let employee = await Employee.findOne({ email: encryptedEmail }).lean() as any
  
  // If not found, try decryption matching
  if (!employee && encryptedEmail) {
    const allEmployees = await Employee.find({}).lean() as any
    for (const emp of allEmployees) {
      if (emp.email && typeof emp.email === 'string') {
        try {
          const decryptedEmail = decrypt(emp.email)
          if (decryptedEmail.toLowerCase() === trimmedEmail.toLowerCase()) {
            employee = emp
            break
          }
        } catch (error) {
          continue
        }
      }
    }
  }
  
  if (!employee) {
    throw new Error(`Employee not found: ${adminEmail}`)
  }
  
  // Track processed parentOrderIds to avoid duplicate approvals
  const processedParentIds = new Set<string>()
  
  // Process each order
  for (const orderId of orderIds) {
    try {
      // First, try to find order by id field
      let order = await Order.findOne({ id: orderId })
      
      // If not found by id, check if orderId is a parentOrderId (from grouped approval view)
      if (!order) {
        const ordersWithParent = await Order.find({ parentOrderId: orderId })
        if (ordersWithParent.length > 0) {
          // This is a parent order ID, approve all child orders
          if (processedParentIds.has(orderId)) {
            // Already processed this parent order, skip
            results.success.push(orderId)
            continue
          }
          processedParentIds.add(orderId)
          
          // Approve all orders with this parentOrderId
          const childOrders = await Order.find({ parentOrderId: orderId })
          if (childOrders.length === 0) {
            results.failed.push({ orderId, error: 'No child orders found' })
            continue
          }
          
          // Verify admin can approve orders for this company (check once per parent)
          // Use raw MongoDB for reliable ObjectId lookup
          const db = mongoose.connection.db
             if (!db) {
    throw new Error('Database connection not available')
  }
  let company = null
          
          if (db) {
            // Convert companyId to ObjectId if needed
            let companyIdObjectId: any = childOrders[0].companyId
            if (companyIdObjectId && !(companyIdObjectId instanceof mongoose.Types.ObjectId)) {
              if (mongoose.Types.ObjectId.isValid(companyIdObjectId)) {
                companyIdObjectId = new mongoose.Types.ObjectId(companyIdObjectId)
              }
            }
            
            company = await Company.findById(companyIdObjectId)
            
            // Fallback: Use raw MongoDB if Mongoose lookup fails
            if (!company) {
              const companyIdStr = companyIdObjectId?.toString()
              const rawCompany = await db.collection('companies').findOne({ _id: companyIdObjectId })
              if (rawCompany) {
                if (rawCompany.id) {
                  company = await Company.findOne({ id: rawCompany.id })
                }
                if (!company && rawCompany._id) {
                  company = await Company.findById(rawCompany._id)
                }
              }
              
              // If still not found, try lookup by business ID
              if (!company && childOrders[0].companyIdNum) {
                company = await Company.findOne({ id: String(childOrders[0].companyIdNum) })
              }
            }
          } else {
            company = await Company.findById(childOrders[0].companyId)
          }
          
          if (!company) {
            results.failed.push({ orderId, error: 'Company not found' })
            continue
          }
          
          // Check if this is a site admin approval (PR workflow)
          const firstChildOrderPRStatus = childOrders[0].pr_status
          const isSiteAdminApproval = firstChildOrderPRStatus === 'PENDING_SITE_ADMIN_APPROVAL'
          const isCompanyAdminApproval = firstChildOrderPRStatus === 'PENDING_COMPANY_ADMIN_APPROVAL'
          
          if (isSiteAdminApproval) {
            // Site Admin approval flow for split orders
            // REQUIRED: Validate PR data is provided
            const prData = prDataMap?.get(orderId)
            if (!prData || !prData.prNumber || !prData.prNumber.trim() || !prData.prDate) {
              results.failed.push({ orderId, error: 'PR Number and PR Date are required for site admin approval' })
              continue
            }
            
            // Get the first order's employee (the one who placed the order)
            const orderEmployee = await Employee.findById(childOrders[0].employeeId).lean() as any
            if (!orderEmployee || !(orderEmployee as any).locationId) {
              results.failed.push({ orderId, error: 'Order employee not found or has no location' })
              continue
            }
            
            // Verify user is a Site Admin (Location Admin) for the order's employee's location
            const Location = require('../models/Location').default
            const employeeLocation = await Location.findById((orderEmployee as any).locationId).lean() as any
            
            if (!employeeLocation || !(employeeLocation as any).adminId) {
              results.failed.push({ orderId, error: 'Location not found or has no admin' })
              continue
            }
            
            // Check if approving user is the location admin (robust ObjectId comparison)
            let locationAdminId: any = (employeeLocation as any).adminId
            let approvingEmployeeId: any = employee._id
            
            if (!(locationAdminId instanceof mongoose.Types.ObjectId)) {
              if (mongoose.Types.ObjectId.isValid(locationAdminId)) {
                locationAdminId = new mongoose.Types.ObjectId(locationAdminId)
              }
            }
            if (!(approvingEmployeeId instanceof mongoose.Types.ObjectId)) {
              if (mongoose.Types.ObjectId.isValid(approvingEmployeeId)) {
                approvingEmployeeId = new mongoose.Types.ObjectId(approvingEmployeeId)
              }
            }
            
            if (locationAdminId.toString() !== approvingEmployeeId.toString()) {
              // Fallback: try numeric ID comparison
              const locationAdminEmployee = await Employee.findById(locationAdminId).lean() as any
              if (locationAdminEmployee && ((locationAdminEmployee as any).id || (locationAdminEmployee as any).employeeId)) {
                const locationAdminEmployeeId = (locationAdminEmployee as any).id || (locationAdminEmployee as any).employeeId
                const approvingEmployeeIdNum = employee.id || 
    employee.employeeId
                if (locationAdminEmployeeId && approvingEmployeeIdNum && locationAdminEmployeeId.toString() === approvingEmployeeIdNum.toString()) {
                  // Authorization passed via numeric ID
                } else {
                  results.failed.push({ orderId, error: 'User is not the Site Admin for this order\'s location' })
                  continue
                }
              } else {
                results.failed.push({ orderId, error: 'User is not the Site Admin for this order\'s location' })
                continue
              }
            }
            
            // Site admin can approve - update all child orders with PR data
            for (const childOrder of childOrders) {
              // Set PR number and date
              childOrder.pr_number = prData.
    prNumber.trim()
              childOrder.pr_date = prData.prDate
              childOrder.pr_status = 'SITE_ADMIN_APPROVED'
              childOrder.site_admin_approved_by = employee._id
              childOrder.site_admin_approved_at = new Date()
              
              if (company.require_company_admin_po_approval === true) {
                childOrder.pr_status = 'PENDING_COMPANY_ADMIN_APPROVAL'
              } else {
                childOrder.status = 'Awaiting fulfilment'
              }
              
              await childOrder.save()
            }
            
            results.success.push(orderId)
            continue
          } else if (isCompanyAdminApproval) {
            // Company Admin approval flow
            const canApprove = await canApproveOrders(adminEmail, company.id)
            if (!canApprove) {
              results.failed.push({ orderId, error: 'User does not have permission to approve orders as Company Admin' })
              continue
            }
            
            // Update all child orders with company admin approval
            for (const childOrder of childOrders) {
              childOrder.pr_status = 'COMPANY_ADMIN_APPROVED'
              childOrder.company_admin_approved_by = employee._id
              childOrder.company_admin_approved_at = new Date()
              childOrder.status = 'Awaiting fulfilment'
              await childOrder.save()
            }
            
            results.success.push(orderId)
            continue
          } else {
            // Legacy approval flow (no PR workflow)
          const canApprove = await canApproveOrders(adminEmail, company.id)
          if (!canApprove) {
            results.failed.push({ orderId, error: 'User does not have permission to approve orders' })
            continue
          }
          
          // Approve all child orders
          for (const childOrder of childOrders) {
            if (childOrder.status === 'Awaiting approval' || childOrder.status === 'Awaiting fulfilment') {
              childOrder.status = 'Awaiting fulfilment'
              await childOrder.save()
            }
          }
          
          results.success.push(orderId)
          continue
          }
        }
        
        // If still not found, mark as failed
        results.failed.push({ orderId, error: 'Order not found' })
        continue
      }
      
      // If this order has a parentOrderId, check if we've already processed it
      if (order.parentOrderId) {
        if (processedParentIds.has(order.parentOrderId)) {
          // Already processed this parent order, skip
          results.success.push(orderId)
          continue
        }
        processedParentIds.add(order.parentOrderId)
        
        // Approve all orders with this parentOrderId
        const childOrders = await Order.find({ parentOrderId: order.parentOrderId })
        if (childOrders.length === 0) {
          results.failed.push({ orderId, error: 'No child orders found' })
          continue
        }
        
        // Verify admin can approve orders for this company (check once per parent)
        // Use raw MongoDB for reliable ObjectId lookup
        const db = mongoose.connection.db
           if (!db) {
    throw new Error('Database connection not available')
  }
  let company = null
        
        if (db) {
          // Convert companyId to ObjectId if needed
          let companyIdObjectId: any = order.companyId
          if (companyIdObjectId && !(companyIdObjectId instanceof mongoose.Types.ObjectId)) {
            if (mongoose.Types.ObjectId.isValid(companyIdObjectId)) {
              companyIdObjectId = new mongoose.Types.ObjectId(companyIdObjectId)
            }
          }
          
          company = await Company.findById(companyIdObjectId)
          
          // Fallback: Use raw MongoDB if Mongoose lookup fails
          if (!company) {
            const companyIdStr = companyIdObjectId?.toString()
            const rawCompany = await db.collection('companies').findOne({ _id: companyIdObjectId })
            if (rawCompany) {
              if (rawCompany.id) {
                company = await Company.findOne({ id: rawCompany.id })
              }
              if (!company && rawCompany._id) {
                company = await Company.findById(rawCompany._id)
              }
            }
            
            // If still not found, try lookup by business ID
            if (!company && order.companyIdNum) {
              company = await Company.findOne({ id: String(order.companyIdNum) })
            }
          }
        } else {
          company = await Company.findById(order.companyId)
        }
        
        if (!company) {
          results.failed.push({ orderId, error: 'Company not found' })
          continue
        }
        
        // Check if this is a site admin approval (PR workflow)
        const firstChildOrderPRStatus = childOrders[0].pr_status
        const isSiteAdminApproval = firstChildOrderPRStatus === 'PENDING_SITE_ADMIN_APPROVAL'
        const isCompanyAdminApproval = firstChildOrderPRStatus === 'PENDING_COMPANY_ADMIN_APPROVAL'
        
        if (isSiteAdminApproval) {
          // Site Admin approval flow for split orders
          // Get the first order's employee (the one who placed the order)
          const orderEmployee = await Employee.findById(childOrders[0].employeeId).lean() as any
          if (!orderEmployee || !(orderEmployee as any).locationId) {
            results.failed.push({ orderId, error: 'Order employee not found or has no location' })
            continue
          }
          
          // Verify user is a Site Admin (Location Admin) for the order's employee's location
          const Location = require('../models/Location').default
          const employeeLocation = await Location.findById((orderEmployee as any).locationId).lean() as any
          
          if (!employeeLocation || !(employeeLocation as any).adminId) {
            results.failed.push({ orderId, error: 'Location not found or has no admin' })
            continue
          }
          
          // Check if approving user is the location admin (robust ObjectId comparison)
          let locationAdminId: any = (employeeLocation as any).adminId
          let approvingEmployeeId: any = employee._id
          
          if (!(locationAdminId instanceof mongoose.Types.ObjectId)) {
            if (mongoose.Types.ObjectId.isValid(locationAdminId)) {
              locationAdminId = new mongoose.Types.ObjectId(locationAdminId)
            }
          }
          if (!(approvingEmployeeId instanceof mongoose.Types.ObjectId)) {
            if (mongoose.Types.ObjectId.isValid(approvingEmployeeId)) {
              approvingEmployeeId = new mongoose.Types.ObjectId(approvingEmployeeId)
            }
          }
          
          if (locationAdminId.toString() !== approvingEmployeeId.toString()) {
            // Fallback: try numeric ID comparison
            const locationAdminEmployee = await Employee.findById(locationAdminId).lean() as any
            if (locationAdminEmployee && ((locationAdminEmployee as any).id || (locationAdminEmployee as any).employeeId)) {
              const locationAdminEmployeeId = (locationAdminEmployee as any).id || (locationAdminEmployee as any).employeeId
              const approvingEmployeeIdNum = employee.id || 
    employee.employeeId
              if (locationAdminEmployeeId && approvingEmployeeIdNum && locationAdminEmployeeId.toString() === approvingEmployeeIdNum.toString()) {
                // Authorization passed via numeric ID
              } else {
                results.failed.push({ orderId, error: 'User is not the Site Admin for this order\'s location' })
                continue
              }
            } else {
              results.failed.push({ orderId, error: 'User is not the Site Admin for this order\'s location' })
              continue
            }
          }
          
          // Site admin can approve - update all child orders
          for (const childOrder of childOrders) {
            childOrder.pr_status = 'SITE_ADMIN_APPROVED'
            childOrder.site_admin_approved_by = employee._id
            childOrder.site_admin_approved_at = new Date()
            
            if (company.require_company_admin_po_approval === true) {
              childOrder.pr_status = 'PENDING_COMPANY_ADMIN_APPROVAL'
            } else {
              childOrder.status = 'Awaiting fulfilment'
            }
            
            await childOrder.save()
          }
          
          results.success.push(orderId)
        } else if (isCompanyAdminApproval) {
          // Company Admin approval flow
          const canApprove = await canApproveOrders(adminEmail, company.id)
          if (!canApprove) {
            results.failed.push({ orderId, error: 'User does not have permission to approve orders as Company Admin' })
            continue
          }
          
          // Update all child orders with company admin approval
          for (const childOrder of childOrders) {
            childOrder.pr_status = 'COMPANY_ADMIN_APPROVED'
            childOrder.company_admin_approved_by = employee._id
            childOrder.company_admin_approved_at = new Date()
            childOrder.status = 'Awaiting fulfilment'
            await childOrder.save()
          }
          
          results.success.push(orderId)
        } else {
          // Legacy approval flow (no PR workflow)
        const canApprove = await canApproveOrders(adminEmail, company.id)
        if (!canApprove) {
          results.failed.push({ orderId, error: 'User does not have permission to approve orders' })
          continue
        }
        
        // Approve all child orders
        for (const childOrder of childOrders) {
          if (childOrder.status === 'Awaiting approval' || childOrder.status === 'Awaiting fulfilment') {
            childOrder.status = 'Awaiting fulfilment'
            await childOrder.save()
          }
        }
        
        results.success.push(orderId)
        }
      } else {
        // Standalone order
        // For PR workflow, check pr_status instead of status
        const orderIsSiteAdminApproval = order.pr_status === 'PENDING_SITE_ADMIN_APPROVAL'
        const orderIsCompanyAdminApproval = order.pr_status === 'PENDING_COMPANY_ADMIN_APPROVAL'
        
        // Only check status for legacy orders (no PR workflow)
        if (!orderIsSiteAdminApproval && !orderIsCompanyAdminApproval && order.status !== 'Awaiting approval') {
        results.failed.push({ orderId, error: `Order is not in 'Awaiting approval' status (current: ${order.status})` })
        continue
      }
      
      // Verify admin can approve orders for this company
      // Use raw MongoDB for reliable ObjectId lookup
      const db = mongoose.connection.db
         if (!db) {
    throw new Error('Database connection not available')
  }
  let company = null
      
      if (db) {
        // Convert companyId to ObjectId if needed
        let companyIdObjectId: any = order.companyId
        if (companyIdObjectId && !(companyIdObjectId instanceof mongoose.Types.ObjectId)) {
          if (mongoose.Types.ObjectId.isValid(companyIdObjectId)) {
            companyIdObjectId = new mongoose.Types.ObjectId(companyIdObjectId)
          }
        }
        
        company = await Company.findById(companyIdObjectId)
        
        // Fallback: Use raw MongoDB if Mongoose lookup fails
        if (!company) {
          const companyIdStr = companyIdObjectId?.toString()
          const rawCompany = await db.collection('companies').findOne({ _id: companyIdObjectId })
          if (rawCompany) {
            if (rawCompany.id) {
              company = await Company.findOne({ id: rawCompany.id })
            }
            if (!company && rawCompany._id) {
              company = await Company.findById(rawCompany._id)
            }
          }
          
          // If still not found, try lookup by business ID
          if (!company && order.companyIdNum) {
            company = await Company.findOne({ id: String(order.companyIdNum) })
          }
        }
      } else {
        company = await Company.findById(order.companyId)
      }
      
      if (!company) {
        results.failed.push({ orderId, error: 'Company not found' })
        continue
      }
      
        if (orderIsSiteAdminApproval) {
        // Site Admin approval - REQUIRED: Validate PR data is provided
        const prData = prDataMap?.get(orderId)
        if (!prData || !prData.prNumber || !prData.prNumber.trim() || !prData.prDate) {
          results.failed.push({ orderId, error: 'PR Number and PR Date are required for site admin approval' })
          continue
        }
        
        // Site Admin approval - check if user is location admin
        const { encrypt, decrypt } = require('../utils/encryption')
        const trimmedEmail = adminEmail.trim()
        let encryptedEmail: string
        
        try {
          encryptedEmail = encrypt(trimmedEmail)
        } catch (error) {
          encryptedEmail = ''
        }
        
        // Find approving employee
        let approvingEmployee = await Employee.findOne({ email: encryptedEmail }).lean() as any
        if (!approvingEmployee && encryptedEmail) {
          const allEmployees = await Employee.find({}).lean() as any
          for (const emp of allEmployees) {
            if (emp.email && typeof emp.email === 'string') {
              try {
                const decryptedEmail = decrypt(emp.email)
                if (decryptedEmail.toLowerCase() === trimmedEmail.toLowerCase()) {
                  approvingEmployee = emp
                  break
                }
              } catch (error) {
                continue
              }
            }
          }
        }
        
        if (!approvingEmployee) {
          results.failed.push({ orderId, error: 'Employee not found' })
          continue
        }
        
        // Get order's employee and their location
        const orderEmployee = await Employee.findById(order.employeeId).lean() as any
        if (!orderEmployee || !(orderEmployee as any).locationId) {
          results.failed.push({ orderId, error: 'Order employee not found or has no location' })
          continue
        }
        
        // Verify user is location admin
        const Location = require('../models/Location').default
        const employeeLocation = await Location.findById((orderEmployee as any).locationId).lean() as any
        
        if (!employeeLocation || !(employeeLocation as any).adminId) {
          results.failed.push({ orderId, error: 'Location not found or has no admin' })
          continue
        }
        
        // Check if approving user is the location admin (robust ObjectId comparison)
        let locationAdminId: any = (employeeLocation as any).adminId
        let approvingEmployeeId: any = approvingEmployee._id
        
        if (!(locationAdminId instanceof mongoose.Types.ObjectId)) {
          if (mongoose.Types.ObjectId.isValid(locationAdminId)) {
            locationAdminId = new mongoose.Types.ObjectId(locationAdminId)
          }
        }
        if (!(approvingEmployeeId instanceof mongoose.Types.ObjectId)) {
          if (mongoose.Types.ObjectId.isValid(approvingEmployeeId)) {
            approvingEmployeeId = new mongoose.Types.ObjectId(approvingEmployeeId)
          }
        }
        
        if (locationAdminId.toString() !== approvingEmployeeId.toString()) {
          // Fallback: try numeric ID comparison
          const locationAdminEmployee = await Employee.findById(locationAdminId).lean() as any
          if (locationAdminEmployee && ((locationAdminEmployee as any).id || (locationAdminEmployee as any).employeeId)) {
            const locationAdminEmployeeId = (locationAdminEmployee as any).id || (locationAdminEmployee as any).employeeId
            const approvingEmployeeIdNum = (approvingEmployee as any).id || (approvingEmployee as any).employeeId
            if (locationAdminEmployeeId && approvingEmployeeIdNum && locationAdminEmployeeId.toString() === approvingEmployeeIdNum.toString()) {
              // Authorization passed via numeric ID
            } else {
              results.failed.push({ orderId, error: 'User is not the Site Admin for this order\'s location' })
              continue
            }
          } else {
            results.failed.push({ orderId, error: 'User is not the Site Admin for this order\'s location' })
            continue
          }
        }
        
        // Site admin can approve - update PR status with PR data
        order.pr_number = prData.
    prNumber.trim()
        order.pr_date = prData.prDate
        order.pr_status = 'SITE_ADMIN_APPROVED'
        order.site_admin_approved_by = approvingEmployee._id
        order.site_admin_approved_at = new Date()
        
        // Check if company admin approval is required
        if (company.require_company_admin_po_approval === true) {
          order.pr_status = 'PENDING_COMPANY_ADMIN_APPROVAL'
        } else {
          order.status = 'Awaiting fulfilment'
        }
        
        await order.save()
        results.success.push(orderId)
      } else if (orderIsCompanyAdminApproval) {
        // Company Admin approval flow
      const canApprove = await canApproveOrders(adminEmail, company.id)
      if (!canApprove) {
          results.failed.push({ orderId, error: 'User does not have permission to approve orders as Company Admin' })
        continue
      }
      
      // Update order status
        order.pr_status = 'COMPANY_ADMIN_APPROVED'
        order.company_admin_approved_by = employee._id
        order.company_admin_approved_at = new Date()
      order.status = 'Awaiting fulfilment'
        
      await order.save()
        results.success.push(orderId)
      } else {
        // Legacy approval flow (no PR workflow) - check canApproveOrders
        const canApprove = await canApproveOrders(adminEmail, company.id)
        if (!canApprove) {
          results.failed.push({ orderId, error: 'User does not have permission to approve orders' })
          continue
        }
        
        // Update order status
        order.status = 'Awaiting fulfilment'
        await order.save()
      results.success.push(orderId)
      }
      }
    } catch (error: any) {
      results.failed.push({ orderId, error: error.message || 'Unknown error' })
    }
  }
  
  return results
}

export async function updateOrderStatus(orderId: string, status: 'Awaiting approval' | 'Awaiting fulfilment' | 'Dispatched' | 'Delivered', requestingVendorId?: string): Promise<any> {
  console.log(`\n[updateOrderStatus] 🚀 ========== STARTING ORDER STATUS UPDATE ==========`)
  console.log(`[updateOrderStatus] 📋 Parameters: orderId=${orderId}, status=${status}, requestingVendorId=${requestingVendorId || 'N/A'}`)
  console.log(`[updateOrderStatus] ⏰ Timestamp: ${new Date().toISOString()}`)
  
  await connectDB()
  console.log(`[updateOrderStatus] ✅ Database connected`)
  
  // First, get order without populate to see raw data
  const orderRaw = await Order.findOne({ id: orderId }).lean() as any
  if (!orderRaw) {
    console.error(`[updateOrderStatus] ❌ Order not found: ${orderId}`)
    throw new Error(`Order not found: ${orderId}`)
  }
  
  console.log(`[updateOrderStatus] 🔍 Raw order data:`, {
    orderId: (orderRaw as any).id,
    vendorIdRaw: (orderRaw as any).vendorId,
    vendorIdType: typeof (orderRaw as any).vendorId,
    vendorName: (orderRaw as any).vendorName,
    status: orderRaw.status
  })
  
  // CRITICAL FIX: vendorId is now a 6-digit numeric string, NOT an ObjectId
  // Get order without populate since vendorId is a string field
  const order = await Order.findOne({ id: orderId })
    .populate('items.uniformId', 'id')
  
  if (!order) {
    console.error(`[updateOrderStatus] ❌ Order not found: ${orderId}`)
    throw new Error(`Order not found: ${orderId}`)
  }
  
  // Extract vendorId - should be a 6-digit numeric string
  let vendorIdValue: string | null = null
  
  // vendorId is stored as a 6-digit numeric string in the order
  if ((orderRaw as any).vendorId) {
    if (typeof (orderRaw as any).vendorId === 'string') {
      vendorIdValue = (orderRaw as any).vendorId.trim()
      // Validate it's a 6-digit numeric string
      if (!/^\d{6}$/.test(vendorIdValue)) {
        console.warn(`[updateOrderStatus] ⚠️ Order has invalid vendorId format: ${vendorIdValue} (expected 6-digit numeric string)`)
        // Try to find vendor by this ID anyway (might be legacy data)
        const vendor = await Vendor.findOne({ id: vendorIdValue })
        if (vendor) {
          console.log(`[updateOrderStatus] ✅ Found vendor with ID: ${vendorIdValue}`)
        } else {
          console.error(`[updateOrderStatus] ❌ Vendor not found for vendorId: ${vendorIdValue}`)
        }
      } else {
        console.log(`[updateOrderStatus] ✅ Valid vendorId found: ${vendorIdValue}`)
      }
    } else if ((orderRaw as any).vendorId instanceof mongoose.Types.ObjectId) {
      // Legacy: Handle ObjectId vendorId - convert to numeric ID
      console.log(`[updateOrderStatus] ⚠️ Legacy ObjectId vendorId detected, converting to numeric ID...`)
      const legacyVendor = await Vendor.findById((orderRaw as any).vendorId)
      if (legacyVendor && legacyVendor.id) {
        vendorIdValue = String(legacyVendor.id).trim()
        // Update order to use numeric ID
        await Order.updateOne({ id: orderId }, { vendorId: vendorIdValue })
        console.log(`[updateOrderStatus] ✅ Migrated order to use numeric vendorId: ${vendorIdValue}`)
      } else {
        console.error(`[updateOrderStatus] ❌ Could not find vendor for legacy ObjectId: ${(orderRaw as any).vendorId}`)
      }
    } else {
      console.warn(`[updateOrderStatus] ⚠️ Unexpected vendorId type: ${typeof (orderRaw as any).vendorId}`)
    }
  }
  
  // Fallback: Try to find vendor by name if vendorId is missing
  if (!vendorIdValue && (orderRaw as any).vendorName) {
    console.log(`[updateOrderStatus] ⚠️ Order has vendorName but no vendorId, attempting to find vendor by name: ${(orderRaw as any).vendorName}`)
    const vendorByName = await Vendor.findOne({ name: (orderRaw as any).vendorName })
    if (vendorByName && vendorByName.id) {
      vendorIdValue = String(vendorByName.id).trim()
      // Update the order with the vendorId for future use
      await Order.updateOne({ id: orderId }, { vendorId: vendorIdValue })
      console.log(`[updateOrderStatus] ✅ Found and updated vendorId for order: ${vendorIdValue}`)
    } else {
      console.error(`[updateOrderStatus] ❌ Could not find vendor by name: ${(orderRaw as any).vendorName}`)
    }
  }
  
  console.log(`[updateOrderStatus] ✅ Order found:`, {
    orderId: order.id,
    currentStatus: order.status,
    vendorId: vendorIdValue || 'N/A',
    vendorName: (orderRaw as any).vendorName || 'N/A',
    itemsCount: order.items?.length || 0
  })
  
  // CRITICAL SECURITY: Validate vendor authorization if requestingVendorId is provided
  // This ensures vendors can ONLY update orders that belong to them
  if (requestingVendorId) {
    console.log(`[updateOrderStatus] 🔒 Validating vendor authorization...`)
    console.log(`[updateOrderStatus]   Requesting vendor ID: ${requestingVendorId}`)
    console.log(`[updateOrderStatus]   Order vendor ID: ${vendorIdValue || 'N/A'}`)
    
    // Validate requestingVendorId is a 6-digit numeric string
    const requestingVendorIdClean = String(requestingVendorId).trim()
    if (!/^\d{6}$/.test(requestingVendorIdClean)) {
      console.error(`[updateOrderStatus] ❌ SECURITY VIOLATION: Invalid requestingVendorId format: ${requestingVendorId}`)
      throw new Error(`Vendor authorization failed: Invalid vendor ID format`)
    }
    
    // Compare numeric vendor IDs directly
    if (vendorIdValue && vendorIdValue !== requestingVendorIdClean) {
      console.error(`[updateOrderStatus] ❌❌❌ CRITICAL SECURITY VIOLATION: VENDOR AUTHORIZATION FAILED ❌❌❌`)
      console.error(`[updateOrderStatus]   Requesting vendor ID: ${requestingVendorIdClean}`)
      console.error(`[updateOrderStatus]   Order belongs to vendor ID: ${vendorIdValue}`)
      console.error(`[updateOrderStatus]   Order ID: ${orderId}`)
      console.error(`[updateOrderStatus]   Attempted action: Update status to ${status}`)
      throw new Error(`Authorization failed: You do not have permission to update this order. This order belongs to a different vendor.`)
    }
    
    if (!vendorIdValue) {
      console.error(`[updateOrderStatus] ❌ SECURITY VIOLATION: Order has no vendorId assigned`)
      throw new Error(`Vendor authorization failed: Order does not have a vendor assigned`)
    }
    
    console.log(`[updateOrderStatus] ✅ Vendor authorization validated: Vendor ${requestingVendorIdClean} owns this order`)
  } else {
    console.log(`[updateOrderStatus] ⚠️ No requestingVendorId provided - skipping vendor authorization check`)
    console.log(`[updateOrderStatus] ⚠️ This should only happen for admin/system updates, not vendor updates`)
  }
  
  // CRITICAL VALIDATION: Prevent "Dispatched" status without valid transition
  // This ensures status integrity - "Dispatched" should ONLY be set when vendor explicitly dispatches
  // and order is in "Awaiting fulfilment" status
  if (status === 'Dispatched') {
    console.log(`[updateOrderStatus] 🔒 Validating Dispatched status transition...`)
    
    // Check if this is a valid transition
    const validTransitionsToDispatched = ['Awaiting fulfilment']
    if (!validTransitionsToDispatched.includes(order.status)) {
      console.error(`[updateOrderStatus] ❌ INVALID STATUS TRANSITION: Cannot transition from "${order.status}" to "Dispatched"`)
      console.error(`[updateOrderStatus] ❌ Valid transitions to "Dispatched": ${validTransitionsToDispatched.join(', ')}`)
      console.error(`[updateOrderStatus] ❌ Order ID: ${orderId}, Current Status: ${order.status}`)
      throw new Error(`Invalid status transition: Cannot mark order as "Dispatched" from "${order.status}" status. Order must be in "Awaiting fulfilment" status first.`)
    }
    
    // Additional validation: Ensure vendor is authorized (already checked above, but log for audit)
    if (!requestingVendorId) {
      console.warn(`[updateOrderStatus] ⚠️ WARNING: Setting status to "Dispatched" without requestingVendorId`)
      console.warn(`[updateOrderStatus] ⚠️ This should only happen for admin/system updates, not vendor updates`)
    }
    
    console.log(`[updateOrderStatus] ✅ Dispatched status transition validated: ${order.status} -> Dispatched`)
  }
  
  const previousStatus = order.status
  order.status = status
  
  // OPTION 1 ENHANCEMENT: Automatically set all required shipment/delivery fields
  // This ensures GRN eligibility works correctly when vendors mark orders as Dispatched/Delivered
  
  if (status === 'Dispatched') {
    console.log(`[updateOrderStatus] 📦 Setting shipment fields for Dispatched status...`)
    
    // Set dispatch status
    order.dispatchStatus = 'SHIPPED'
    
    // Set dispatched date if not already set
    if (!order.dispatchedDate) {
      order.dispatchedDate = new Date()
    }
    
    // Update all items: set dispatchedQuantity = quantity if not already set
    const items = order.items || []
    const updatedItems = items.map((item: any) => {
      const dispatchedQty = item.dispatchedQuantity || item.quantity || 0
      const deliveredQty = item.deliveredQuantity || 0
      
      // Determine item shipment status
      let itemShipmentStatus: 'PENDING' | 'DISPATCHED' | 'DELIVERED' = 'PENDING'
      if (deliveredQty >= item.quantity && item.quantity > 0) {
        itemShipmentStatus = 'DELIVERED'
      } else if (dispatchedQty > 0) {
        itemShipmentStatus = 'DISPATCHED'
      }
      
      return {
        ...item.toObject(),
        dispatchedQuantity: dispatchedQty,
        deliveredQuantity: deliveredQty,
        itemShipmentStatus
      }
    })
    
    order.items = updatedItems as any
    console.log(`[updateOrderStatus] ✅ Set dispatchStatus=SHIPPED, dispatchedQuantity for ${items.length} item(s)`)
  }
  
  if (status === 'Delivered') {
    console.log(`[updateOrderStatus] 📦 Setting delivery fields for Delivered status...`)
    
    // Set delivery status
    order.deliveryStatus = 'DELIVERED'
    
    // Set delivered date if not already set
    if (!order.deliveredDate) {
      order.deliveredDate = new Date()
    }
    
    // Ensure dispatch status is set (should be SHIPPED before delivery)
    if (!order.dispatchStatus || order.dispatchStatus === 'AWAITING_FULFILMENT') {
      order.dispatchStatus = 'SHIPPED'
      if (!order.dispatchedDate) {
        order.dispatchedDate = order.deliveredDate // Use delivered date as fallback
      }
    }
    
    // Update all items: set deliveredQuantity = quantity if not already set
    const items = order.items || []
    const updatedItems = items.map((item: any) => {
      const orderedQty = item.quantity || 0
      const dispatchedQty = item.dispatchedQuantity || orderedQty // Default to ordered quantity if not set
      const deliveredQty = item.deliveredQuantity || orderedQty // Default to ordered quantity if not set
      
      // Ensure deliveredQuantity doesn't exceed ordered quantity
      const finalDeliveredQty = Math.min(deliveredQty, orderedQty)
      
      // Determine item shipment status
      let itemShipmentStatus: 'PENDING' | 'DISPATCHED' | 'DELIVERED' = 'DELIVERED'
      if (finalDeliveredQty < orderedQty) {
        itemShipmentStatus = 'DISPATCHED' // Partial delivery
      }
      
      return {
        ...item.toObject(),
        dispatchedQuantity: dispatchedQty,
        deliveredQuantity: finalDeliveredQty,
        itemShipmentStatus
      }
    })
    
    order.items = updatedItems as any
    console.log(`[updateOrderStatus] ✅ Set deliveryStatus=DELIVERED, deliveredQuantity for ${items.length} item(s)`)
    
    // Trigger PO status update after marking as delivered
    try {
      await updatePOStatusFromPRDelivery(orderId)
      console.log(`[updateOrderStatus] ✅ Triggered PO status update for delivered PR`)
    } catch (error: any) {
      console.warn(`[updateOrderStatus] ⚠️ Could not update PO status: ${error.message}`)
      // Don't fail the order update if PO update fails
    }
  }
  
  await order.save()
  console.log(`[updateOrderStatus] ✅ Order status updated: ${previousStatus} -> ${status}`)
  
  // If this is a replacement order being shipped or delivered, handle return request and inventory updates
  // Business Rules:
  // 1. When shipped (Dispatched): DECREMENT inventory for NEW size (replacement item being shipped out) - handled by normal flow below
  // 2. When delivered (Delivered): INCREMENT inventory for ORIGINAL size (returned item being received back) - handled here
  // NOTE: 
  //   - Replacement size (M): DECREMENTED when shipped (stock is consumed)
  //   - Returned size (XXL): INCREMENTED when delivered (item is returned/restocked)
  const isReplacementOrder = (order as any).orderType === 'REPLACEMENT'
  const hasReturnRequestId = (order as any).returnRequestId
  
  if ((status === 'Dispatched' || status === 'Delivered') && isReplacementOrder && hasReturnRequestId) {
    try {
      const returnRequestId = (order as any).returnRequestId
      console.log(`[updateOrderStatus] 🔄 Replacement order ${status.toLowerCase()}, processing return request: ${returnRequestId}`)
      
      const returnRequest = await ReturnRequest.findOne({ returnRequestId })
        .populate('uniformId', 'id name')
        .lean() as any
      
      if (!returnRequest) {
        console.warn(`[updateOrderStatus] ⚠️ Return request not found:`, returnRequestId)
        // For replacement orders, missing return request is critical
        throw new Error(`Return request ${returnRequestId} not found for replacement order ${orderId}`)
      }
      
      if (returnRequest.status === 'APPROVED') {
        // Only update return request status to COMPLETED when delivered
        if (status === 'Delivered') {
          await ReturnRequest.updateOne(
            { returnRequestId },
            { status: 'COMPLETED' }
          )
          console.log(`[updateOrderStatus] ✅ Return request completed: ${returnRequestId}`)
        }
        
        // Increment inventory for the returned item (original size) when delivered
        // Business rule: Inventory for returned item increases ONLY when replacement is delivered/confirmed
        if (status === 'Delivered' && returnRequest.uniformId && returnRequest.originalSize && returnRequest.requestedQty) {
          try {
            console.log(`[updateOrderStatus] 📦 Incrementing inventory for returned item (ORIGINAL size):`, {
              productId: (returnRequest.uniformId as any)?._id || returnRequest.uniformId,
              originalSize: returnRequest.originalSize,
              quantity: returnRequest.requestedQty,
              note: 'This is the size being returned (e.g., XXL)'
            })
            
            // Get the vendor from the replacement order
            // vendorId is now a 6-digit numeric string
            const replacementOrderVendorId = vendorIdValue || (orderRaw as any).vendorId
            if (!replacementOrderVendorId) {
              console.warn(`[updateOrderStatus] ⚠️ Replacement order has no vendorId, cannot increment inventory for returned item`)
            } else {
              // Validate vendorId is a 6-digit numeric string
              const vendorIdClean = String(replacementOrderVendorId).trim()
              if (!/^\d{6}$/.test(vendorIdClean)) {
                console.error(`[updateOrderStatus] ❌ Invalid vendorId format for inventory update: ${vendorIdClean}`)
                throw new Error(`Invalid vendor ID format: ${vendorIdClean}`)
              }
              
              // Get vendor ObjectId for inventory update (VendorInventory uses ObjectId)
              const vendor = await Vendor.findOne({ id: vendorIdClean })
              if (!vendor) {
                console.warn(`[updateOrderStatus] Vendor not found: ${vendorIdClean}`);
                return null // Return null instead of throwing - let API route handle 404
              }
              const returnVendorObjectId = vendor._id
              
              // Get product ObjectId
              const productObjectId = (returnRequest.uniformId as any)?._id || returnRequest.uniformId
              if (!productObjectId) {
                throw new Error('Product ID not found in return request')
              }
              
              const product = await Uniform.findById(productObjectId)
              if (!product) {
                console.warn(`[updateOrderStatus] Product not found: ${productObjectId}`);
                return null // Return null instead of throwing - let API route handle 404
              }
              
              // Update inventory (without transaction for standalone MongoDB)
              try {
                // Find or create inventory record
                let inventory = await VendorInventory.findOne({
                  vendorId: returnVendorObjectId,
                  productId: 
    product._id,
                })
                
                if (!inventory) {
                  console.warn(`[updateOrderStatus] ⚠️ No inventory record found for vendor ${returnVendorObjectId} and product ${product.id}, creating one`)
                  const inventoryId = `VEND-INV-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`
                  inventory = await VendorInventory.create({
                    id: inventoryId,
                    vendorId: returnVendorObjectId,
                    productId: 
    product._id,
                    sizeInventory: new Map(),
                    totalStock: 0,
                    lowInventoryThreshold: new Map(),
                  })
                }
                
                // Get current size inventory
                const sizeInventory = inventory.sizeInventory instanceof Map
                  ? new Map(inventory.sizeInventory)
                  : new Map(Object.entries(inventory.sizeInventory || {}))
                
                // Increment inventory for the returned size
                const originalSize = returnRequest.originalSize
                const returnedQty = returnRequest.requestedQty
                const currentStock = sizeInventory.get(originalSize) || 0
                const newStock = currentStock + returnedQty
                
                console.log(`[updateOrderStatus] 📊 Return inventory calculation:`, {
                  originalSize,
                  currentStock,
                  returnedQty,
                  newStock,
                  calculation: `${currentStock} + ${returnedQty} = ${newStock}`
                })
                
                sizeInventory.set(originalSize, newStock)
                
                // Calculate new total stock
                let totalStock = 0
                for (const qty of Array.from(sizeInventory.values())) {
                  totalStock += qty
                }
                
                // Update inventory
                inventory.sizeInventory = sizeInventory
                inventory.totalStock = totalStock
                inventory.markModified('sizeInventory')
                
                await inventory.save()
                
                console.log(`[updateOrderStatus] ✅ Successfully incremented inventory for returned item: product ${product.id}, size ${originalSize}, ${currentStock} -> ${newStock} (incremented ${returnedQty})`)
              } catch (error: any) {
                console.error(`[updateOrderStatus] ❌ Error incrementing inventory for returned item:`, error)
                throw error
              }
            }
          } catch (error: any) {
            console.error(`[updateOrderStatus] ❌ Failed to increment inventory for returned item: ${error.message}`)
            console.error(`[updateOrderStatus] ❌ Error stack:`, error.stack)
            // For replacement orders, inventory update is critical - rethrow the error
            throw error
          }
        }
      } else {
        console.warn(`[updateOrderStatus] ⚠️ Return request not in APPROVED status:`, {
          returnRequestId,
          status: returnRequest.status,
          orderStatus: status
        })
        // For replacement orders, this is unexpected - log but don't throw (status might be COMPLETED already)
      }
    } catch (error: any) {
      console.error(`[updateOrderStatus] ❌ Failed to process return request for replacement order: ${error.message}`)
      console.error(`[updateOrderStatus] ❌ Error stack:`, error.stack)
      // For replacement orders, this is critical - rethrow the error to prevent silent failures
      throw error
    }
  }
  
  // If status is being changed to "Dispatched" or "Delivered", decrement inventory
  // IMPORTANT: We need to check if inventory was already decremented by looking at order history
  // For now, we'll decrement when:
  // 1. Order goes from "Awaiting fulfilment" -> "Dispatched" (normal flow)
  // 2. Order goes from "Awaiting fulfilment" -> "Delivered" (direct delivery, skipping dispatch)
  // 3. Order goes from "Dispatched" -> "Delivered" (only if inventory wasn't decremented during Dispatched)
  // 
  // NOTE: We check previousStatus to avoid double-decrementing, but if the order was marked as "Dispatched"
  // without inventory being updated (due to missing vendorId or other error), we should still update when marking as "Delivered"
  const shouldUpdateInventory = (status === 'Dispatched' || status === 'Delivered') && 
                                 previousStatus !== 'Dispatched' && 
                                 previousStatus !== 'Delivered'
  
  // SPECIAL CASE: If going from "Dispatched" to "Delivered" and vendorId exists but wasn't processed before,
  // we should still update inventory (in case the previous Dispatched update failed)
  // CRITICAL: For replacement orders, we should NOT decrement again on "Delivered" - replacement size was already decremented on "Dispatched"
  // Only the returned size should be incremented on "Delivered" (handled separately above)
  const isDispatchedToDelivered = status === 'Delivered' && previousStatus === 'Dispatched'
  const isReplacementOrderForDeliveredCheck = (order as any).orderType === 'REPLACEMENT'
  const shouldUpdateInventoryForDelivered = isDispatchedToDelivered && vendorIdValue !== null && !isReplacementOrderForDeliveredCheck
  
  const isReplacementOrderForLogging = (order as any).orderType === 'REPLACEMENT'
  console.log(`[updateOrderStatus] 🔍 Inventory update check:`, {
    shouldUpdate: shouldUpdateInventory,
    shouldUpdateForDelivered: shouldUpdateInventoryForDelivered,
    status,
    previousStatus,
    isDispatchedToDelivered,
    hasVendorId: vendorIdValue !== null,
    orderType: isReplacementOrderForLogging ? 'REPLACEMENT' : 'NORMAL',
    returnRequestId: (order as any).returnRequestId || 'N/A',
    condition1: status === 'Dispatched' || status === 'Delivered',
    condition2: previousStatus !== 'Dispatched',
    condition3: previousStatus !== 'Delivered',
    skipDeliveredUpdateForReplacement: isReplacementOrderForDeliveredCheck && isDispatchedToDelivered
  })
  
  // Update inventory if either condition is true
  // NOTE: This applies to BOTH normal orders AND replacement orders
  // For replacement orders: DECREMENT inventory for the NEW size (replacement item being shipped out)
  // For normal orders: DECREMENT inventory for ordered items - stock is consumed
  // NOTE: Returned size (original) is incremented separately when replacement order is Delivered
  if (shouldUpdateInventory || shouldUpdateInventoryForDelivered) {
    const isReplacementOrder = (order as any).orderType === 'REPLACEMENT'
    console.log(`\n[updateOrderStatus] 📦 ========== INVENTORY UPDATE REQUIRED ==========`)
    console.log(`[updateOrderStatus] 📦 Order ${orderId}: ${previousStatus} -> ${status}, will decrement inventory`)
    console.log(`[updateOrderStatus] 📦 Order type: ${isReplacementOrder ? 'REPLACEMENT' : 'NORMAL'}`)
    console.log(`[updateOrderStatus] 📦 Update reason: ${shouldUpdateInventory ? 'Normal flow' : 'Dispatched->Delivered (recovery)'}`)
    
    if (!vendorIdValue) {
      const isReplacementOrder = (order as any).orderType === 'REPLACEMENT'
      console.error(`[updateOrderStatus] ❌ Order ${orderId} has no vendorId, cannot update inventory`)
      console.error(`[updateOrderStatus] ❌ Order details:`, {
        vendorId: order.vendorId,
        vendorName: (order as any).vendorName,
        vendorIdValue: vendorIdValue,
        orderType: isReplacementOrder ? 'REPLACEMENT' : 'NORMAL',
        returnRequestId: (order as any).returnRequestId || 'N/A'
      })
      // For replacement orders, this is critical - throw error instead of silently failing
      if (isReplacementOrder) {
        throw new Error(`Replacement order ${orderId} has no vendorId - inventory update cannot proceed. This will cause inventory discrepancies.`)
      }
    } else {
      try {
        console.log(`[updateOrderStatus] 🔍 Processing vendor for inventory update`)
        console.log(`[updateOrderStatus] 🔍 Using vendorId: ${vendorIdValue}`)
        
        // CRITICAL FIX: vendorId is now a 6-digit numeric string, not an ObjectId
        // Look up vendor by numeric ID to get ObjectId for inventory operations
        let vendor = await Vendor.findOne({ id: vendorIdValue })
        if (!vendor && (order as any).vendorName) {
          console.log(`[updateOrderStatus] ⚠️ Vendor not found by id, trying by name: ${(order as any).vendorName}`)
          vendor = await Vendor.findOne({ name: (order as any).vendorName })
        }
        
        if (!vendor) {
          console.error(`[updateOrderStatus] ❌ Vendor not found for order ${orderId}`)
          console.error(`[updateOrderStatus] ❌ Tried: id=${vendorIdValue}, name=${(order as any).vendorName || 'N/A'}`)
          throw new Error(`Vendor not found for vendorId: ${vendorIdValue}`)
        }
        
        // Get vendor ObjectId for inventory operations (VendorInventory uses ObjectId)
        const vendorObjectIdToUse = vendor._id
        
        console.log(`[updateOrderStatus] ✅ Vendor found:`, {
          vendorId: 
    vendor.id,
          vendorName: 
    vendor.name,
          vendorObjectId: vendorObjectIdToUse.toString(),
          lookupMethod: 'by numeric id'
        })
        
        const isReplacementOrder = (order as any).orderType === 'REPLACEMENT'
        console.log(`[updateOrderStatus] 📦 Processing ${order.items.length} order items`)
        if (isReplacementOrder) {
          console.log(`[updateOrderStatus] 🔄 REPLACEMENT ORDER: Will DECREMENT inventory for NEW size (replacement item being shipped out)`)
          console.log(`[updateOrderStatus] 🔄 REPLACEMENT ORDER: Note - Returned size (original, e.g., XXL) will be INCREMENTED when order is Delivered`)
        } else {
          console.log(`[updateOrderStatus] 🔄 NORMAL ORDER: Will decrement inventory for ordered items`)
        }
        
        // Process each item in the order
        let itemIndex = 0
        for (const item of order.items) {
            itemIndex++
            console.log(`\n[updateOrderStatus] 📦 ========== PROCESSING ITEM ${itemIndex}/${order.items.length} ==========`)
            console.log(`[updateOrderStatus] 📦 Item details:`, {
              uniformId: item.uniformId,
              uniformName: item.uniformName || 'N/A',
              size: item.size,
              quantity: item.quantity,
              price: item.price
            })
            // Get product ObjectId - handle both populated and unpopulated cases
            let productObjectId: mongoose.Types.ObjectId
            if (item.uniformId instanceof mongoose.Types.ObjectId) {
              productObjectId = item.uniformId
              console.log(`[updateOrderStatus] 🔍 Product ID is ObjectId: ${productObjectId.toString()}`)
            } else {
              // Populated product document
              productObjectId = (item.uniformId as any)._id || item.uniformId
              console.log(`[updateOrderStatus] 🔍 Product ID from populated doc: ${productObjectId?.toString() || 'N/A'}`)
            }
            
            const size = item.size
            const quantity = item.quantity
            
            if (!size || !quantity) {
              console.error(`[updateOrderStatus] ❌ Order ${orderId} item ${itemIndex} missing size or quantity:`, {
                size,
                quantity,
                item
              })
              continue
            }
            
            console.log(`[updateOrderStatus] 🔍 Looking up product:`, {
              productObjectId: productObjectId.toString(),
              size,
              quantity
            })
            
            // Get product to verify it exists
            const product = await Uniform.findById(productObjectId)
            
            if (!product) {
              console.error(`[updateOrderStatus] ❌ Product not found for order ${orderId}, item ${itemIndex}:`, {
                productObjectId: productObjectId.toString(),
                item
              })
              continue
            }
          
            console.log(`[updateOrderStatus] ✅ Product found:`, {
              productId: 
    product.id,
              productName: 
    product.name,
              productObjectId: 
    product._id.toString()
            })
          
          // Update inventory (without transaction for standalone MongoDB)
          console.log(`[updateOrderStatus] 🔄 Starting inventory update (standalone MongoDB - no transactions)`)
          
          try {
            // Find or create inventory record
            console.log(`[updateOrderStatus] 🔍 Looking up VendorInventory:`, {
              vendorId: 
    vendor._id.toString(),
              vendorIdString: 
    vendor.id,
              productId: 
    product._id.toString(),
              productIdString: 
    product.id
            })
            
            let inventory = await VendorInventory.findOne({
              vendorId: 
    vendor._id,
              productId: 
    product._id,
            })
            
            if (!inventory) {
              console.warn(`[updateOrderStatus] ⚠️ No inventory record found for vendor ${vendor.id} and product ${product.id}, creating one with 0 stock`)
              // Create inventory record with 0 stock if it doesn't exist
              const inventoryId = `VEND-INV-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`
              inventory = await VendorInventory.create({
                id: inventoryId,
                vendorId: 
    vendor._id,
                productId: 
    product._id,
                sizeInventory: new Map(),
                totalStock: 0,
                lowInventoryThreshold: new Map(),
              })
            }
              
              console.log(`[updateOrderStatus] ✅ Inventory record found/created:`, {
                inventoryId: inventory.id,
                currentSizeInventory: inventory.sizeInventory instanceof Map 
                  ? Object.fromEntries(inventory.sizeInventory)
                  : inventory.sizeInventory,
                currentTotalStock: inventory.totalStock
              })
            
            // Get current size inventory
            const sizeInventory = inventory.sizeInventory instanceof Map
              ? new Map(inventory.sizeInventory)
              : new Map(Object.entries(inventory.sizeInventory || {}))
            
              console.log(`[updateOrderStatus] 🔍 Current sizeInventory Map:`, Object.fromEntries(sizeInventory))
              
              // CRITICAL FIX: For replacement orders, DECREMENT inventory for replacement size (being shipped out)
              // For normal orders, also DECREMENT inventory (stock is consumed)
              // NOTE: Returned size (original) is incremented separately when order is Delivered
            const currentStock = sizeInventory.get(size) || 0
              let newStock: number
              let operation: string
              
              // Both replacement and normal orders DECREMENT inventory when shipped
              // Replacement order: Decrement replacement size (M) because we're shipping it out
              // Normal order: Decrement ordered size because stock is consumed
            if (currentStock < quantity) {
                console.warn(`[updateOrderStatus] ⚠️ Insufficient inventory for order ${orderId}: product ${product.id}, size ${size}. Current: ${currentStock}, Requested: ${quantity}`)
                // Still allow the order to be shipped, but inventory goes to 0 (not negative)
              }
              newStock = Math.max(0, currentStock - quantity) // Don't go below 0
              operation = 'decrement'
              
              if (isReplacementOrder) {
                console.log(`[updateOrderStatus] 📊 REPLACEMENT ORDER - Stock calculation:`, {
                  size,
                  currentStock,
                  quantity,
                  newStock,
                  calculation: `${currentStock} - ${quantity} = ${newStock}`,
                  note: 'Replacement order: DECREMENTING inventory for replacement size (being shipped out). Returned size will be incremented when delivered.'
                })
              } else {
                console.log(`[updateOrderStatus] 📊 NORMAL ORDER - Stock calculation:`, {
                  size,
                  currentStock,
                  quantity,
                  newStock,
                  calculation: `${currentStock} - ${quantity} = ${newStock}`,
                  note: 'Normal order: decrementing inventory'
                })
              }
              
              console.log(`[updateOrderStatus] 📊 Stock calculation result:`, {
                orderType: isReplacementOrder ? 'REPLACEMENT' : 'NORMAL',
                operation,
                currentStock,
                quantity,
                newStock,
                calculation: `${currentStock} - ${quantity} = ${newStock}`,
                note: isReplacementOrder 
                  ? 'Replacement order: decrementing replacement size (being shipped out)'
                  : 'Normal order: decrementing inventory'
              })
            
            sizeInventory.set(size, newStock)
              console.log(`[updateOrderStatus] ✅ Updated sizeInventory Map:`, Object.fromEntries(sizeInventory))
            
            // Calculate new total stock
            let totalStock = 0
            for (const qty of Array.from(sizeInventory.values())) {
              totalStock += qty
            }
            
              // Update inventory atomically
              console.log(`[updateOrderStatus] 🔄 Updating inventory object...`)
              console.log(`[updateOrderStatus] 🔄 Before assignment:`, {
                inventorySizeInventoryType: typeof inventory.sizeInventory,
                inventorySizeInventoryIsMap: inventory.sizeInventory instanceof Map,
                newSizeInventoryType: typeof sizeInventory,
                newSizeInventoryIsMap: sizeInventory instanceof Map
              })
              
            inventory.sizeInventory = sizeInventory
            inventory.totalStock = totalStock
              
              console.log(`[updateOrderStatus] 🔄 After assignment:`, {
                inventorySizeInventoryType: typeof inventory.sizeInventory,
                inventorySizeInventoryIsMap: inventory.sizeInventory instanceof Map,
                inventorySizeInventoryValue: inventory.sizeInventory instanceof Map
                  ? Object.fromEntries(inventory.sizeInventory)
                  : inventory.sizeInventory
              })
              
              // CRITICAL: Mark Map fields as modified to ensure Mongoose saves them
              // Mongoose doesn't always detect changes to Map objects, so we must explicitly mark them
              console.log(`[updateOrderStatus] 🔄 Marking sizeInventory as modified...`)
              inventory.markModified('sizeInventory')
              console.log(`[updateOrderStatus] ✅ markModified('sizeInventory') called`)
              console.log(`[updateOrderStatus] 🔄 Modified paths after markModified:`, inventory.modifiedPaths())
              
              console.log(`[Inventory Update] 🔍 Before save - inventory record:`, {
                inventoryId: inventory.id,
                vendorId: 
    vendor.id,
                productId: 
    product.id,
                size: size,
                sizeInventory: Object.fromEntries(sizeInventory),
                totalStock: totalStock,
                currentStock: currentStock,
                newStock: newStock,
                quantity: quantity
              })
              
              console.log(`[updateOrderStatus] 💾 ========== SAVING INVENTORY ==========`)
              console.log(`[updateOrderStatus] 💾 Attempting to save inventory with session...`)
              console.log(`[updateOrderStatus] 💾 Pre-save state:`, {
                inventoryId: inventory.id,
                inventoryIsNew: inventory.isNew,
                inventoryIsModified: inventory.isModified(),
                modifiedPaths: inventory.modifiedPaths(),
                sizeInventoryBeforeSave: inventory.sizeInventory instanceof Map
                  ? Object.fromEntries(inventory.sizeInventory)
                  : inventory.sizeInventory,
                totalStockBeforeSave: inventory.totalStock,
                markModifiedCalled: true // We called it above
              })
              
              const saveResult = await inventory.save()
              
              console.log(`[updateOrderStatus] ✅ Inventory save() completed:`, {
                inventoryId: saveResult.id,
                savedSizeInventory: saveResult.sizeInventory instanceof Map
                  ? Object.fromEntries(saveResult.sizeInventory)
                  : saveResult.sizeInventory,
                savedTotalStock: saveResult.totalStock,
                savedSizeStock: saveResult.sizeInventory instanceof Map
                  ? saveResult.sizeInventory.get(size)
                  : (saveResult.sizeInventory as any)?.[size],
                expectedSizeStock: newStock,
                saveMatch: (saveResult.sizeInventory instanceof Map
                  ? saveResult.sizeInventory.get(size)
                  : (saveResult.sizeInventory as any)?.[size]) === newStock
              })
              
              console.log(`[updateOrderStatus] ✅ Inventory update saved successfully (standalone MongoDB)`)
              
              const operationText = isReplacementOrder ? 'incremented' : 'decremented'
              console.log(`[updateOrderStatus] ✅ Successfully updated VendorInventory for order ${orderId}: product ${product.id}, size ${size}, ${currentStock} -> ${newStock} (${operationText} ${quantity})`)
              console.log(`[updateOrderStatus] ✅ Order type: ${isReplacementOrder ? 'REPLACEMENT' : 'NORMAL'}`)
              
              // CRITICAL VERIFICATION: Query database directly to confirm update persisted
              // IMPORTANT: Query OUTSIDE the transaction session to see committed data
              console.log(`[updateOrderStatus] 🔍 ========== POST-SAVE VERIFICATION ==========`)
              console.log(`[updateOrderStatus] 🔍 Waiting 200ms for database write to complete...`)
              await new Promise(resolve => setTimeout(resolve, 200))
              
              // Query using raw MongoDB to bypass any Mongoose caching
              // Query WITHOUT session to see committed data
              const db = mongoose.connection.db
                 if (!db) {
    throw new Error('Database connection not available')
  }
  const vendorInventoriesCollection = db.collection('vendorinventories')
              
              console.log(`[updateOrderStatus] 🔍 Querying raw MongoDB (outside transaction)...`)
              const rawInventoryDoc = await vendorInventoriesCollection.findOne({
                vendorId: 
    vendor._id,
                productId: 
    product._id,
              })
              
              console.log(`[updateOrderStatus] 🔍 Raw MongoDB query result:`, {
                found: !!rawInventoryDoc,
                inventoryId: rawInventoryDoc?.id,
                sizeInventory: rawInventoryDoc?.sizeInventory,
                totalStock: rawInventoryDoc?.totalStock,
                sizeStock: rawInventoryDoc?.sizeInventory?.[size],
                expectedStock: newStock
              })
              
              // Also verify using Mongoose (without session to see committed data)
              console.log(`[updateOrderStatus] 🔍 Querying Mongoose (outside transaction)...`)
              const verifyInventory = await VendorInventory.findOne({
                vendorId: 
    vendor._id,
                productId: 
    product._id,
              }).lean() as any
              
              if (verifyInventory) {
                const verifySizeStock = verifyInventory.sizeInventory instanceof Map
                  ? verifyInventory.sizeInventory.get(size)
                  : (verifyInventory.sizeInventory as any)?.[size]
                const verifyTotalStock = verifyInventory.totalStock
                
                console.log(`[updateOrderStatus] ✅ Mongoose verification result:`, {
                  inventoryId: verifyInventory.id,
                  size,
                  expectedStock: newStock,
                  actualStock: verifySizeStock,
                  match: verifySizeStock === newStock,
                  expectedTotal: totalStock,
                  actualTotal: verifyTotalStock,
                  totalMatch: verifyTotalStock === totalStock,
                  sizeInventoryType: typeof verifyInventory.sizeInventory,
                  sizeInventoryIsMap: verifyInventory.sizeInventory instanceof Map,
                  sizeInventoryKeys: verifyInventory.sizeInventory instanceof Map 
                    ? Array.from(verifyInventory.sizeInventory.keys())
                    : Object.keys(verifyInventory.sizeInventory || {})
                })
                
                // Compare raw MongoDB vs Mongoose
                const rawSizeStock = rawInventoryDoc?.sizeInventory?.[size]
                console.log(`[updateOrderStatus] 🔍 Raw vs Mongoose comparison:`, {
                  rawSizeStock,
                  mongooseSizeStock: verifySizeStock,
                  match: rawSizeStock === verifySizeStock
                })
                
                if (verifySizeStock !== newStock) {
                  console.error(`[updateOrderStatus] ❌❌❌ VERIFICATION FAILED: Expected stock ${newStock} but got ${verifySizeStock}`)
                  console.error(`[updateOrderStatus] ❌❌❌ This indicates the inventory update did NOT persist!`)
                  console.error(`[updateOrderStatus] ❌❌❌ Debug info:`, {
                    beforeSave: currentStock,
                    quantity: quantity,
                    calculatedNewStock: newStock,
                    afterSave: verifySizeStock,
                    rawMongoDB: rawSizeStock
                  })
                } else {
                  console.log(`[updateOrderStatus] ✅✅✅ VERIFICATION PASSED: Stock correctly saved and persisted`)
                  const operationText = 'decremented'
                  const calculationText = `${currentStock} - ${quantity} = ${newStock}`
                  const note = isReplacementOrder 
                    ? ' (Replacement order: replacement size decremented, returned size will be incremented on delivery)'
                    : ' (Normal order: inventory decremented)'
                  console.log(`[updateOrderStatus] ✅✅✅ Inventory ${operationText}: ${calculationText}${note}`)
                }
              } else {
                console.error(`[updateOrderStatus] ❌ Verification failed: Could not find inventory record after save`)
                console.error(`[updateOrderStatus] ❌ Query used:`, {
                  vendorId: 
    vendor._id.toString(),
                  productId: 
    product._id.toString()
                })
              }
              
              console.log(`[updateOrderStatus] 📦 ========== ITEM ${itemIndex} PROCESSING COMPLETE ==========\n`)
            } catch (error: any) {
              console.error(`[updateOrderStatus] ❌ Error updating inventory for item ${itemIndex}:`, error)
              console.error(`[updateOrderStatus] ❌ Error details:`, {
                message: error?.message,
                stack: error?.stack,
                name: error?.name
              })
              throw error
            }
          }
          
          console.log(`[updateOrderStatus] 📦 ========== ALL ITEMS PROCESSED ==========`)
          
          // FINAL VERIFICATION: Commented out - vendor and product are out of scope here
          // Each item is already verified individually in the loop above
          // If final verification is needed, it should use order.vendorId and iterate through order.items
          /*
          console.log(`[updateOrderStatus] 🔍 ========== FINAL INVENTORY VERIFICATION ==========`)
          const finalInventoryCheck = await VendorInventory.find({
            vendorId: 
    vendor._id,
            productId: 
    product._id,
          }).lean() as any
          
          console.log(`[updateOrderStatus] 🔍 Final inventory check found ${finalInventoryCheck.length} record(s):`)
          finalInventoryCheck.forEach((inv: any, idx: number) => {
            console.log(`[updateOrderStatus] 🔍 Inventory record ${idx + 1}:`, {
              id: inv.id,
              sizeInventory: inv.sizeInventory,
              totalStock: inv.totalStock,
              sizeInventoryType: typeof inv.sizeInventory,
              sizeInventoryKeys: inv.sizeInventory instanceof Map
                ? Array.from(inv.sizeInventory.keys())
                : Object.keys(inv.sizeInventory || {})
            })
          })
          */
          console.log(`[updateOrderStatus] 📦 ========== ALL ITEMS PROCESSED ==========\n`)
        } catch (error: any) {
          console.error(`[updateOrderStatus] ❌❌❌ CRITICAL ERROR updating inventory for order ${orderId}:`, error)
          console.error(`[updateOrderStatus] ❌ Error details:`, {
            message: error?.message,
            stack: error?.stack,
            name: error?.name,
            code: error?.code
          })
          // Don't throw - we still want to update the order status even if inventory update fails
        }
      }
    } else {
    // Log when inventory update is skipped
    if (status === 'Dispatched' || status === 'Delivered') {
      console.log(`[updateOrderStatus] ⏭️ Skipping inventory update for order ${orderId}: ${previousStatus} -> ${status} (already processed or invalid transition)`)
    }
  }
  
  // Populate and return
  console.log(`[updateOrderStatus] 🔄 Populating order for response...`)
  const populatedOrder = await Order.findById(order._id)
    .populate('employeeId', 'id firstName lastName email')
    .populate('companyId', 'id name')
    .populate('items.uniformId', 'id name')
    .lean() as any
  
  console.log(`[updateOrderStatus] 🚀 ========== ORDER STATUS UPDATE COMPLETE ==========\n`)
  
  return toPlainObject(populatedOrder)
}

export async function getPendingApprovals(companyId: string): Promise<any[]> {
  await connectDB()
  
  const company = await Company.findOne({ id: companyId }).select('_id id name enable_pr_po_workflow require_company_admin_po_approval').lean() as any
  if (!company) {
    return []
  }
  
  // Build query filter based on workflow configuration
  const queryFilter: any = {
    companyId: company._id,
    status: 'Awaiting approval',
  }
  
  // If PR/PO workflow is enabled, only show orders pending COMPANY ADMIN approval
  // (Site Admin approvals are handled separately)
  if (company.enable_pr_po_workflow === true) {
    queryFilter.pr_status = 'PENDING_COMPANY_ADMIN_APPROVAL'
    console.log(`[getPendingApprovals] PR/PO workflow enabled. Filtering for PENDING_COMPANY_ADMIN_APPROVAL orders only.`)
  } else {
    // Legacy workflow: show all orders with status 'Awaiting approval'
    // Exclude orders that are pending site admin approval (if any exist)
    queryFilter.$or = [
      { pr_status: { $exists: false } }, // Legacy orders without PR status
      { pr_status: null }, // Legacy orders with null PR status
      { pr_status: { $ne: 'PENDING_SITE_ADMIN_APPROVAL' } }, // Exclude site admin pending
    ]
    console.log(`[getPendingApprovals] Legacy workflow. Showing all orders except PENDING_SITE_ADMIN_APPROVAL.`)
  }
  
  // OPTIMIZATION: Fetch all pending orders (parent + child) in single query using $or
  // This eliminates the need for two separate queries
  const pendingOrders = await Order.find(queryFilter)
    .select('id employeeId employeeIdNum employeeName items total status orderDate dispatchLocation companyId deliveryAddress parentOrderId vendorId vendorName isPersonalPayment personalPaymentAmount createdAt pr_number pr_date pr_status site_admin_approved_by site_admin_approved_at')
    .populate('employeeId', 'id employeeId firstName lastName email')
    .populate('companyId', 'id name')
    .populate('items.uniformId', 'id name')
    .sort({ orderDate: -1 })
    .lean() as any
  
  // Fetch vendor names for all unique vendorIds
  const vendorIds = [...new Set(pendingOrders.map((o: any) => o.vendorId).filter(Boolean))]
  const vendors = await Vendor.find({ id: { $in: vendorIds } }).select('id name').lean() as any
  
  // Add vendorName to orders
  pendingOrders.forEach((o: any) => {
    if (!o.vendorName && o.vendorId && vendorMap.has(o.vendorId)) {
      o.vendorName = vendorMap.get(o.vendorId)
    }
  })
  
  // OPTIMIZATION: Also fetch child orders in same query using aggregation or separate optimized query
  const parentOrderIds = new Set<string>()
  const standaloneOrders: any[] = []
  const plainOrders = pendingOrders.map((o: any) => toPlainObject(o))

  for (const order of plainOrders) {
    if (order.parentOrderId) {
      parentOrderIds.add(order.parentOrderId)
    } else {
      standaloneOrders.push(order)
    }
  }

  // OPTIMIZATION: Fetch child orders with field projection to reduce payload
  const orderMap = new Map<string, any[]>()
  if (parentOrderIds.size > 0) {
    const allChildOrders = await Order.find({
      companyId: 
    company._id,
      parentOrderId: { $in: Array.from(parentOrderIds) }
    })
      .select('id employeeId employeeIdNum employeeName items total status orderDate dispatchLocation companyId deliveryAddress parentOrderId vendorId vendorName isPersonalPayment personalPaymentAmount createdAt pr_number pr_date pr_status site_admin_approved_by site_admin_approved_at')
      .populate('employeeId', 'id employeeId firstName lastName email')
      .populate('companyId', 'id name')
      .populate('items.uniformId', 'id name')
      .populate('vendorId', 'id name')
      .lean() as any
    
    const allChildOrdersPlain = allChildOrders.map((o: any) => toPlainObject(o))
    
    for (const order of allChildOrdersPlain) {
      if (order.parentOrderId) {
      if (!orderMap.has(order.parentOrderId)) {
        orderMap.set(order.parentOrderId, [])
      }
      orderMap.get(order.parentOrderId)!.push(order)
      }
    }
  }

  // Create grouped orders (one per parentOrderId) and add standalone orders
  const groupedOrders: any[] = []
  
  for (const [parentOrderId, splitOrders] of orderMap.entries()) {
    // Sort split orders by vendor name for consistency
    splitOrders.sort((a, b) => (a.vendorName || '').localeCompare(b.vendorName || ''))
    
    // Create a grouped order object
    const totalAmount = splitOrders.reduce((sum: any, o: any) => sum + (o.total || 0), 0)
    const totalItems = splitOrders.reduce((sum: any, o: any) => sum + (o.items?.length || 0), 0)
    const allItems = splitOrders.flatMap(o => o.items || [])
    
    groupedOrders.push({
      ...splitOrders[0], // Use first order as base
      id: parentOrderId, // Use parent order ID as the main ID
      isSplitOrder: true,
      splitOrders: splitOrders,
      splitOrderIds: splitOrders.map(o => o.id), // Store all order IDs for bulk approval
      total: totalAmount,
      items: allItems,
      vendorCount: splitOrders.length,
      vendors: splitOrders.map(o => o.vendorName).filter(Boolean)
    })
  }

  // Combine grouped and standalone orders, sorted by date
  const allOrders = [...groupedOrders, ...standaloneOrders]
  allOrders.sort((a, b) => {
    const dateA = new Date(a.orderDate || 0).getTime()
    const dateB = new Date(b.orderDate || 0).getTime()
    return dateB - dateA // Most recent first
  })

  return allOrders
}

/**
 * Get pending PRs for Site Admin (Location Admin)
 * Tab 1: Pending Approval - Shows PRs with pr_status = PENDING_SITE_ADMIN_APPROVAL
 * PR visibility driven ONLY by PR.status, PR.createdDate, PR.locationId
 * NO filtering based on PO/GRN existence
 * @param adminEmail Location Admin email
 * @param fromDate Optional date filter - PRs created on or after this date
 * @param toDate Optional date filter - PRs created on or before this date
 */
export async function getPendingApprovalsForSiteAdmin(
  adminEmail: string,
  fromDate?: Date,
  toDate?: Date
): Promise<any[]> {
  await connectDB()
  
  // Get location for this site admin
  const location = await getLocationByAdminEmail(adminEmail)
  if (!location) {
    console.log(`[getPendingApprovalsForSiteAdmin] No location found for admin: ${adminEmail}`)
    return []
  }
  
  // Get location ObjectId - handle both _id (ObjectId) and id (string) cases
  let locationId: any = null
  if (location._id) {
    locationId = location._id instanceof mongoose.Types.ObjectId ? 
    location._id : new mongoose.Types.ObjectId(location._id)
  } else if (location.id) {
    // If we only have the string id, find the location by id to get the _id
    const Location = require('../models/Location').default
    const locationDoc = await Location.findOne({ id: 
    location.id }).select('_id').lean() as any
    if (locationDoc) {
      locationId = locationDoc._id
    }
  }
  
  if (!locationId) {
    console.log(`[getPendingApprovalsForSiteAdmin] Could not determine location ObjectId for admin: ${adminEmail}`)
    return []
  }
  
  console.log(`[getPendingApprovalsForSiteAdmin] Found location: ${location.id} (${location.name}) for admin: ${adminEmail}, locationId: ${locationId}`)
  
  // Find all employees assigned to this location
  const employees = await Employee.find({ locationId: locationId })
    .select('_id id employeeId')
    .lean() as any
  
    console.log(`[getPendingApprovalsForSiteAdmin] No employees found for location: ${location.id}`)
    return []
  }
  
  const employeeIds = employees.map((e: any) => e._id)
  console.log(`[getPendingApprovalsForSiteAdmin] Found ${employeeIds.length} employee(s) for location: ${location.id}`)
  
  // Build query filter - PR visibility driven ONLY by pr_status and createdAt (date filter)
  // NO filtering based on PO/GRN existence
  const queryFilter: any = {
    employeeId: { $in: employeeIds },
    pr_status: 'PENDING_SITE_ADMIN_APPROVAL', // Tab 1: Only pending site admin approval
  }
  
  // Apply date filter on PR.createdAt if provided
  if (fromDate || toDate) {
    queryFilter.createdAt = {}
    if (fromDate) {
      queryFilter.createdAt.$gte = fromDate
    }
    if (toDate) {
      // Include entire day for toDate
      const endOfDay = new Date(toDate)
      endOfDay.setHours(23, 59, 59, 999)
      queryFilter.createdAt.$lte = endOfDay
    }
  }
  
  // Find orders pending site admin approval for employees in this location
  // NO status filter on order.status - only pr_status matters
  const pendingOrders = await Order.find(queryFilter)
    .select('id employeeId employeeIdNum employeeName items total status orderDate dispatchLocation companyId deliveryAddress parentOrderId vendorId vendorName isPersonalPayment personalPaymentAmount pr_number pr_date pr_status createdAt')
    .populate('employeeId', 'id employeeId firstName lastName email locationId')
    .populate('companyId', 'id name')
    .populate('items.uniformId', 'id name')
    .sort({ orderDate: -1 })
    .lean() as any
  
  // Fetch vendor names for all unique vendorIds
  const vendorIds = [...new Set(pendingOrders.map((o: any) => o.vendorId).filter(Boolean))]
  const vendors = await Vendor.find({ id: { $in: vendorIds } }).select('id name').lean() as any
  
  // Add vendorName to orders
  pendingOrders.forEach((o: any) => {
    if (!o.vendorName && o.vendorId && vendorMap.has(o.vendorId)) {
      o.vendorName = vendorMap.get(o.vendorId)
    }
  })
  
  console.log(`[getPendingApprovalsForSiteAdmin] Found ${pendingOrders.length} order(s) pending site admin approval`)
  
  // Group orders by parentOrderId (similar to getPendingApprovals)
  const parentOrderIds = new Set<string>()
  const standaloneOrders: any[] = []
  const plainOrders = pendingOrders.map((o: any) => toPlainObject(o))

  for (const order of plainOrders) {
    if (order.parentOrderId) {
      parentOrderIds.add(order.parentOrderId)
    } else {
      standaloneOrders.push(order)
    }
  }

  // Fetch child orders
  const orderMap = new Map<string, any[]>()
  if (parentOrderIds.size > 0) {
    const allChildOrders = await Order.find({
      employeeId: { $in: employeeIds },
      parentOrderId: { $in: Array.from(parentOrderIds) },
      pr_status: 'PENDING_SITE_ADMIN_APPROVAL',
    })
      .select('id employeeId employeeIdNum employeeName items total status orderDate dispatchLocation companyId deliveryAddress parentOrderId vendorId vendorName isPersonalPayment personalPaymentAmount pr_number pr_date pr_status createdAt')
      .populate('employeeId', 'id employeeId firstName lastName email locationId')
      .populate('companyId', 'id name')
      .populate('items.uniformId', 'id name')
      .populate('vendorId', 'id name')
      .lean() as any
    
    
    for (const order of allChildOrdersPlain) {
      if (order.parentOrderId) {
        if (!orderMap.has(order.parentOrderId)) {
          orderMap.set(order.parentOrderId, [])
        }
        orderMap.get(order.parentOrderId)!.push(order)
      }
    }
  }

  // Create grouped orders (one per parentOrderId) and add standalone orders
  const groupedOrders: any[] = []
  
  for (const [parentOrderId, splitOrders] of orderMap.entries()) {
    // Sort split orders by vendor name for consistency
    splitOrders.sort((a, b) => (a.vendorName || '').localeCompare(b.vendorName || ''))
    
    // Calculate totals
    const totalItems = splitOrders.reduce((sum: any, o: any) => sum + (o.items?.length || 0), 0)
    const totalAmount = splitOrders.reduce((sum: any, o: any) => sum + (o.total || 0), 0)
    
    groupedOrders.push({
      id: parentOrderId, // Use parentOrderId as the main ID for grouped orders
      parentOrderId: parentOrderId,
      employeeId: splitOrders[0]?.employeeId,
      employeeIdNum: splitOrders[0]?.employeeIdNum,
      employeeName: splitOrders[0]?.employeeName,
      items: splitOrders.flatMap((o: any) => o.items || []),
      total: totalAmount,
      status: 'Awaiting approval',
      orderDate: splitOrders[0]?.orderDate,
      dispatchLocation: splitOrders[0]?.dispatchLocation,
      companyId: splitOrders[0]?.companyId,
      deliveryAddress: splitOrders[0]?.deliveryAddress,
      pr_number: splitOrders[0]?.pr_number,
      pr_date: splitOrders[0]?.pr_date,
      pr_status: splitOrders[0]?.pr_status,
      isSplitOrder: true,
      splitOrders: splitOrders.map((o: any) => ({
        orderId: o.id,
        vendorName: o.vendorName,
        total: o.total,
        itemCount: o.items?.length || 0
      })),
      vendorId: null, // Multiple vendors for split orders
      vendorName: null, // Multiple vendors for split orders
      isPersonalPayment: splitOrders[0]?.isPersonalPayment || false,
      personalPaymentAmount: splitOrders[0]?.personalPaymentAmount || 0,
      createdAt: splitOrders[0]?.createdAt,
    })
  }
  
  // Add standalone orders
  groupedOrders.push(...standaloneOrders)
  
  // Sort by order date (newest first)
  groupedOrders.sort((a, b) => {
    const dateA = a.orderDate ? new Date(a.orderDate).getTime() : 0
    const dateB = b.orderDate ? new Date(b.orderDate).getTime() : 0
    return dateB - dateA
  })
  
  console.log(`[getPendingApprovalsForSiteAdmin] Returning ${groupedOrders.length} order(s) (${groupedOrders.filter(o => o.isSplitOrder).length} grouped, ${groupedOrders.filter(o => !o.isSplitOrder).length} standalone)`)
  
  return groupedOrders
}

/**
 * Get all PRs raised by Location Admin (historical view - downstream statuses)
 * Tab 3: My PRs - Shows PRs with downstream statuses after approvals
 * PR visibility driven ONLY by PR.status, PR.createdDate, PR.locationId
 * NO filtering based on PO/GRN existence
 * @param adminEmail Location Admin email
 * @param fromDate Optional date filter - PRs created on or after this date
 * @param toDate Optional date filter - PRs created on or before this date
 * @returns Array of all PRs/orders with downstream statuses
 */
export async function getAllPRsForSiteAdmin(
  adminEmail: string,
  fromDate?: Date,
  toDate?: Date
): Promise<any[]> {
  await connectDB()
  
  console.log(`[getAllPRsForSiteAdmin] 🔍 Starting query for admin email: ${adminEmail}`)
  console.log(`[getAllPRsForSiteAdmin] 📅 Date filters: fromDate=${fromDate ? fromDate.toISOString() : 'none'}, toDate=${toDate ? toDate.toISOString() : 'none'}`)
  
  // Get location for this site admin
  const location = await getLocationByAdminEmail(adminEmail)
  if (!location) {
    console.log(`[getAllPRsForSiteAdmin] ❌ No location found for admin: ${adminEmail}`)
    console.log(`[getAllPRsForSiteAdmin] ⚠️  This means getLocationByAdminEmail returned null - check if employee exists and is set as location admin`)
    return []
  }
  
  console.log(`[getAllPRsForSiteAdmin] ✅ Found location: ${location.id} (${location.name})`)
  console.log(`[getAllPRsForSiteAdmin] 📍 Location details: _id=${location._id}, id=${location.id}, adminId=${(location as any).adminId}`)
  
  // Get location ObjectId - handle both _id (ObjectId) and id (string) cases
  let locationId: any = null
  if (location._id) {
    locationId = location._id instanceof mongoose.Types.ObjectId ? 
    location._id : new mongoose.Types.ObjectId(location._id)
    console.log(`[getAllPRsForSiteAdmin] ✅ Using 
    location._id: ${locationId}`)
  } else if (location.id) {
    // If we only have the string id, find the location by id to get the _id
    const Location = require('../models/Location').default
    const locationDoc = await Location.findOne({ id: 
    location.id }).select('_id').lean() as any
      locationId = locationDoc._id
      console.log(`[getAllPRsForSiteAdmin] ✅ Found location ObjectId by id lookup: ${locationId}`)
    } else {
      console.log(`[getAllPRsForSiteAdmin] ❌ Could not find location document by id: ${location.id}`)
    }
  }
  
  if (!locationId) {
    console.log(`[getAllPRsForSiteAdmin] ❌ Could not determine location ObjectId for admin: ${adminEmail}`)
    return []
  }
  
  console.log(`[getAllPRsForSiteAdmin] 📍 Using locationId: ${locationId} (type: ${locationId.constructor.name})`)
  
  // Find all employees assigned to this location
  const employees = await Employee.find({ locationId: locationId })
    .select('_id id employeeId firstName lastName')
    .lean() as any
  
  if (employees.length > 0) {
    employees.forEach((emp: any, idx: number) => {
      console.log(`[getAllPRsForSiteAdmin]   ${idx + 1}. ${emp.firstName} ${emp.lastName} (ID: ${emp.id}, EmployeeID: ${emp.employeeId}, ObjectId: ${emp._id})`)
    })
  } else {
    console.log(`[getAllPRsForSiteAdmin] ⚠️  No employees found for location: ${location.id}`)
    console.log(`[getAllPRsForSiteAdmin] ⚠️  This is likely the root cause - employees must have locationId set to this location's ObjectId`)
    console.log(`[getAllPRsForSiteAdmin] ⚠️  Checking if locationId format matches...`)
    
    // Try alternative locationId formats
    const locationIdStr = locationId.toString()
    const employeesByString = await Employee.find({ locationId: locationIdStr }).select('_id id employeeId').lean() as any
    
    return []
  }
  
  const employeeIds = employees.map((e: any) => e._id)
  console.log(`[getAllPRsForSiteAdmin] 👥 Employee ObjectIds: ${employeeIds.map((id: any) => id.toString()).join(', ')}`)
  
  // Build query filter - Tab 3: Show ALL downstream PRs (after approvals)
  // Include: COMPANY_ADMIN_APPROVED, PO_CREATED, and any other downstream statuses
  // Exclude: PENDING_SITE_ADMIN_APPROVAL (Tab 1), PENDING_COMPANY_ADMIN_APPROVAL (Tab 2)
  // PR visibility driven ONLY by pr_status and createdAt (date filter)
  // NO filtering based on PO/GRN existence
  // CRITICAL: Include orders where pr_status is null/undefined for backward compatibility
  const queryFilter: any = {
    employeeId: { $in: employeeIds },
    $or: [
      {
        pr_status: { 
          $in: [
            'COMPANY_ADMIN_APPROVED',  // Approved by company admin
            'PO_CREATED',              // PO created
            'REJECTED_BY_SITE_ADMIN',  // Rejected PRs
            'REJECTED_BY_COMPANY_ADMIN', // Rejected PRs
            'DRAFT',                    // Draft PRs
            'SUBMITTED',                // Submitted PRs
            'SITE_ADMIN_APPROVED'       // Site admin approved (but not yet sent to company admin - edge case)
          ]
        }
      },
      {
        pr_status: { $exists: false }  // Backward compatibility: include orders without pr_status
      },
      {
        pr_status: null  // Backward compatibility: include orders with null pr_status
      }
    ]
  }
  
  console.log(`[getAllPRsForSiteAdmin] 🔍 Query filter (before date filter):`, JSON.stringify(queryFilter, null, 2))
  
  // Apply date filter on PR.createdAt if provided
  if (fromDate || toDate) {
    queryFilter.createdAt = {}
    if (fromDate) {
      queryFilter.createdAt.$gte = fromDate
    }
    if (toDate) {
      // Include entire day for toDate
      const endOfDay = new Date(toDate)
      endOfDay.setHours(23, 59, 59, 999)
      queryFilter.createdAt.$lte = endOfDay
    }
    console.log(`[getAllPRsForSiteAdmin] 📅 Applied date filter:`, queryFilter.createdAt)
  }
  
  console.log(`[getAllPRsForSiteAdmin] 🔍 Final query filter:`, JSON.stringify(queryFilter, null, 2))
  
  // Find ALL orders from employees at this location with downstream statuses
  // NO status filter on order.status - only pr_status matters
  // NO filtering based on PO/GRN existence - PR-only records MUST appear
  const allOrders = await Order.find(queryFilter)
    .select('id employeeId employeeIdNum employeeName items total status orderDate dispatchLocation companyId deliveryAddress parentOrderId vendorId vendorName isPersonalPayment personalPaymentAmount pr_number pr_date pr_status site_admin_approved_by site_admin_approved_at company_admin_approved_by company_admin_approved_at createdAt')
    .populate('employeeId', 'id employeeId firstName lastName email locationId')
    .populate('companyId', 'id name')
    .populate('items.uniformId', 'id name')
    .sort({ createdAt: -1, orderDate: -1 })
    .lean() as any
  
  if (allOrders.length > 0) {
    console.log(`[getAllPRsForSiteAdmin] 📋 Sample orders (first 3):`)
    allOrders.slice(0, 3).forEach((order: any, idx: number) => {
      console.log(`  ${idx + 1}. Order ID: ${order.id}, PR Status: ${order.pr_status || 'N/A'}, PR Number: ${order.pr_number || 'N/A'}`)
    })
  } else {
    console.log(`[getAllPRsForSiteAdmin] ⚠️  No orders found matching query filter`)
    console.log(`[getAllPRsForSiteAdmin] 🔍 Checking if any orders exist for these employees (without pr_status filter)...`)
    
    // Check if orders exist without pr_status filter
    const allOrdersNoStatusFilter = await Order.find({ employeeId: { $in: employeeIds } })
      .select('id pr_status pr_number')
      .limit(10)
      .lean() as any
    
    if (allOrdersNoStatusFilter.length > 0) {
      const statusCounts: Record<string, number> = {}
      allOrdersNoStatusFilter.forEach((o: any) => {
        const status = o.pr_status || 'NULL'
        statusCounts[status] = (statusCounts[status] || 0) + 1
      })
      console.log(`[getAllPRsForSiteAdmin] 📊 PR Status breakdown:`)
      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`)
      })
      console.log(`[getAllPRsForSiteAdmin] ⚠️  These statuses are NOT in the "My PRs" filter list!`)
    }
  }
  
  // CRITICAL FIX: vendorId is now a 6-digit numeric string, not an ObjectId reference
  // Fetch vendor names for all unique vendorIds
  const vendorIds = [...new Set(allOrders.map((o: any) => o.vendorId).filter(Boolean))]
  const vendors = await Vendor.find({ id: { $in: vendorIds } }).select('id name').lean() as any
  
  // Add vendorName to orders
  allOrders.forEach((o: any) => {
    if (!o.vendorName && o.vendorId && vendorMap.has(o.vendorId)) {
      o.vendorName = vendorMap.get(o.vendorId)
    }
  })
  
  console.log(`[getAllPRsForSiteAdmin] Found ${allOrders.length} order(s) for location: ${location.id}`)
  
  // Group orders by parentOrderId (similar to other functions)
  const parentOrderIds = new Set<string>()
  const standaloneOrders: any[] = []
  const plainOrders = allOrders.map((o: any) => toPlainObject(o))

  console.log(`[getAllPRsForSiteAdmin] 📊 Processing ${plainOrders.length} order(s) for grouping...`)
  
  for (const order of plainOrders) {
    if (order.parentOrderId) {
      parentOrderIds.add(order.parentOrderId)
      console.log(`[getAllPRsForSiteAdmin]   Order ${order.id} has parentOrderId: ${order.parentOrderId}`)
    } else {
      standaloneOrders.push(order)
      console.log(`[getAllPRsForSiteAdmin]   Order ${order.id} is standalone (no parentOrderId)`)
    }
  }
  
  console.log(`[getAllPRsForSiteAdmin] 📊 Grouping summary: ${parentOrderIds.size} parent order ID(s), ${standaloneOrders.length} standalone order(s)`)

  // Fetch child orders with same status and date filter
  const orderMap = new Map<string, any[]>()
  if (parentOrderIds.size > 0) {
    // Build child orders query filter - same status filter as parent orders
    // CRITICAL: Include backward compatibility for null/undefined pr_status
    const childQueryFilter: any = {
      employeeId: { $in: employeeIds },
      parentOrderId: { $in: Array.from(parentOrderIds) },
      $or: [
        {
          pr_status: { 
            $in: [
              'COMPANY_ADMIN_APPROVED',
              'PO_CREATED',
              'REJECTED_BY_SITE_ADMIN',
              'REJECTED_BY_COMPANY_ADMIN',
              'DRAFT',
              'SUBMITTED',
              'SITE_ADMIN_APPROVED'
            ]
          }
        },
        {
          pr_status: { $exists: false }  // Backward compatibility: include orders without pr_status
        },
        {
          pr_status: null  // Backward compatibility: include orders with null pr_status
        }
      ]
    }
    
    // Apply same date filter to child orders
    if (fromDate || toDate) {
      childQueryFilter.createdAt = {}
      if (fromDate) {
        childQueryFilter.createdAt.$gte = fromDate
      }
      if (toDate) {
        const endOfDay = new Date(toDate)
        endOfDay.setHours(23, 59, 59, 999)
        childQueryFilter.createdAt.$lte = endOfDay
      }
    }
    
    const allChildOrders = await Order.find(childQueryFilter)
      .select('id employeeId employeeIdNum employeeName items total status orderDate dispatchLocation companyId deliveryAddress parentOrderId vendorId vendorName isPersonalPayment personalPaymentAmount pr_number pr_date pr_status site_admin_approved_by site_admin_approved_at company_admin_approved_by company_admin_approved_at createdAt')
      .populate('employeeId', 'id employeeId firstName lastName email locationId')
      .populate('companyId', 'id name')
      .populate('items.uniformId', 'id name')
      .lean() as any
    
    
    // Add vendor names to child orders
    allChildOrdersPlain.forEach((o: any) => {
      if (!o.vendorName && o.vendorId && vendorMap.has(o.vendorId)) {
        o.vendorName = vendorMap.get(o.vendorId)
      }
    })
    
    for (const childOrder of allChildOrdersPlain) {
      const parentId = childOrder.parentOrderId
      if (!orderMap.has(parentId)) {
        orderMap.set(parentId, [])
      }
      orderMap.get(parentId)!.push(childOrder)
    }
  }

  // Group parent orders with their children
  const groupedOrders: any[] = []
  
  // CRITICAL FIX: Handle case where parent orders might not be in query results
  // If parentOrderId exists but parent order is not in plainOrders, fetch it separately
  const missingParentIds: string[] = []
  for (const parentId of parentOrderIds) {
    const parentOrder = plainOrders.find((o: any) => o.id === parentId)
    if (!parentOrder) {
      missingParentIds.push(parentId)
    }
  }
  
  // Fetch missing parent orders if any
  let missingParents: any[] = []
  if (missingParentIds.length > 0) {
    console.log(`[getAllPRsForSiteAdmin] ⚠️  Found ${missingParentIds.length} parent order(s) not in query results, fetching separately...`)
    const missingParentOrders = await Order.find({
      id: { $in: missingParentIds }
    })
      .select('id employeeId employeeIdNum employeeName items total status orderDate dispatchLocation companyId deliveryAddress parentOrderId vendorId vendorName isPersonalPayment personalPaymentAmount pr_number pr_date pr_status site_admin_approved_by site_admin_approved_at company_admin_approved_by company_admin_approved_at createdAt')
      .populate('employeeId', 'id employeeId firstName lastName email locationId')
      .populate('companyId', 'id name')
      .populate('items.uniformId', 'id name')
      .lean() as any
    
    
    // Add vendor names to missing parents
    missingParents.forEach((o: any) => {
      if (!o.vendorName && o.vendorId && vendorMap.has(o.vendorId)) {
        o.vendorName = vendorMap.get(o.vendorId)
      }
    })
    
    console.log(`[getAllPRsForSiteAdmin] ✅ Fetched ${missingParents.length} missing parent order(s)`)
  }
  
  // Combine plainOrders with missing parents for parent lookup
  const allParentOrders = [...plainOrders, ...missingParents]
  
  // Add standalone orders (no parent, no children)
  console.log(`[getAllPRsForSiteAdmin] 📊 Adding ${standaloneOrders.length} standalone order(s)...`)
  for (const order of standaloneOrders) {
    if (!parentOrderIds.has(order.id)) {
      groupedOrders.push({
        ...order,
        childOrders: [],
        isParent: false,
        totalChildAmount: 0,
        totalChildItems: 0
      })
      console.log(`[getAllPRsForSiteAdmin]   ✅ Added standalone order: ${order.id}`)
    } else {
      console.log(`[getAllPRsForSiteAdmin]   ⚠️  Skipping standalone order ${order.id} - it's also a parentOrderId`)
    }
  }
  
  // Add parent orders with their children
  console.log(`[getAllPRsForSiteAdmin] 📊 Processing ${parentOrderIds.size} parent order ID(s)...`)
  for (const parentId of parentOrderIds) {
    const parentOrder = allParentOrders.find((o: any) => o.id === parentId)
    if (parentOrder) {
      const childOrders = orderMap.get(parentId) || []
      const totalChildAmount = childOrders.reduce((sum: any, child: any) => sum + (child.total || 0), 0)
      const totalChildItems = childOrders.reduce((sum: any, child: any) => sum + (child.items?.length || 0), 0)
      
      console.log(`[getAllPRsForSiteAdmin]   ✅ Found parent order ${parentId} with ${childOrders.length} child order(s)`)
      
      groupedOrders.push({
        ...parentOrder,
        childOrders: childOrders,
        isParent: true,
        totalChildAmount,
        totalChildItems,
        totalAmount: (parentOrder.total || 0) + totalChildAmount,
        totalItems: (parentOrder.items?.length || 0) + totalChildItems
      })
    } else {
      // If parent order still not found, create a grouped order from child orders only
      const childOrders = orderMap.get(parentId) || []
      if (childOrders.length > 0) {
        console.log(`[getAllPRsForSiteAdmin] ⚠️  Parent order ${parentId} not found, creating grouped order from ${childOrders.length} child order(s)`)
        const firstChild = childOrders[0]
        const totalChildAmount = childOrders.reduce((sum: any, child: any) => sum + (child.total || 0), 0)
        const totalChildItems = childOrders.reduce((sum: any, child: any) => sum + (child.items?.length || 0), 0)
        
        groupedOrders.push({
          id: parentId,
          parentOrderId: parentId,
          employeeId: firstChild.employeeId,
          employeeIdNum: firstChild.employeeIdNum,
          employeeName: firstChild.employeeName,
          items: childOrders.flatMap((o: any) => o.items || []),
          total: totalChildAmount,
          status: firstChild.status,
          orderDate: firstChild.orderDate,
          dispatchLocation: firstChild.dispatchLocation,
          companyId: firstChild.companyId,
          deliveryAddress: firstChild.deliveryAddress,
          pr_number: firstChild.pr_number,
          pr_date: firstChild.pr_date,
          pr_status: firstChild.pr_status,
          childOrders: childOrders,
          isParent: true,
          isSplitOrder: true,
          splitOrders: childOrders.map((o: any) => ({
            orderId: o.id,
            vendorName: o.vendorName,
            total: o.total,
            itemCount: o.items?.length || 0
          })),
          totalChildAmount,
          totalChildItems,
          totalAmount: totalChildAmount,
          totalItems: totalChildItems,
          vendorId: null,
          vendorName: null,
          isPersonalPayment: firstChild.isPersonalPayment || false,
          personalPaymentAmount: firstChild.personalPaymentAmount || 0,
          createdAt: firstChild.createdAt,
        })
      }
    }
  }
  
  // Sort by creation date (most recent first)
  groupedOrders.sort((a, b) => {
    const dateA = new Date(a.createdAt || a.orderDate || 0).getTime()
    const dateB = new Date(b.createdAt || b.orderDate || 0).getTime()
    return dateB - dateA
  })
  
  console.log(`[getAllPRsForSiteAdmin] Returning ${groupedOrders.length} grouped order(s)`)
  
  return groupedOrders
}

export async function getApprovedPRsForSiteAdmin(
  adminEmail: string,
  fromDate?: Date,
  toDate?: Date
): Promise<any[]> {
  await connectDB()
  
  // Get location for this site admin
  const location = await getLocationByAdminEmail(adminEmail)
  if (!location) {
    console.log(`[getApprovedPRsForSiteAdmin] No location found for admin: ${adminEmail}`)
    return []
  }
  
  // Get location ObjectId - handle both _id (ObjectId) and id (string) cases
  let locationId: any = null
  if (location._id) {
    locationId = location._id instanceof mongoose.Types.ObjectId ? 
    location._id : new mongoose.Types.ObjectId(location._id)
  } else if (location.id) {
    // If we only have the string id, find the location by id to get the _id
    const Location = require('../models/Location').default
    const locationDoc = await Location.findOne({ id: 
    location.id }).select('_id').lean() as any
    if (locationDoc) {
      locationId = locationDoc._id
    }
  }
  
  if (!locationId) {
    console.log(`[getApprovedPRsForSiteAdmin] Could not determine location ObjectId for admin: ${adminEmail}`)
    return []
  }
  
  console.log(`[getApprovedPRsForSiteAdmin] Found location: ${location.id} (${location.name}) for admin: ${adminEmail}, locationId: ${locationId}`)
  
  // Find all employees assigned to this location
  const employees = await Employee.find({ locationId: locationId })
    .select('_id id employeeId')
    .lean() as any
  
  if (employees.length === 0) {
    console.log(`[getApprovedPRsForSiteAdmin] No employees found for location: ${location.id}`)
    return []
  }
  
  const employeeIds = employees.map((e: any) => e._id)
  console.log(`[getApprovedPRsForSiteAdmin] Found ${employeeIds.length} employee(s) for location: ${location.id}`)
  
  // Build query filter - Tab 2: Only PENDING_COMPANY_ADMIN_APPROVAL
  // PR visibility driven ONLY by pr_status and createdAt (date filter)
  // NO filtering based on PO/GRN existence
  const queryFilter: any = {
    employeeId: { $in: employeeIds },
    pr_status: 'PENDING_COMPANY_ADMIN_APPROVAL', // Tab 2: Only pending company admin approval
  }
  
  // Apply date filter on PR.createdAt if provided
  if (fromDate || toDate) {
    queryFilter.createdAt = {}
    if (fromDate) {
      queryFilter.createdAt.$gte = fromDate
    }
    if (toDate) {
      // Include entire day for toDate
      const endOfDay = new Date(toDate)
      endOfDay.setHours(23, 59, 59, 999)
      queryFilter.createdAt.$lte = endOfDay
    }
  }
  
  // Find orders approved by site admin and pending company admin approval
  // NO status filter on order.status - only pr_status matters
  const approvedOrders = await Order.find(queryFilter)
    .select('id employeeId employeeIdNum employeeName items total status orderDate dispatchLocation companyId deliveryAddress parentOrderId vendorId vendorName isPersonalPayment personalPaymentAmount pr_number pr_date pr_status site_admin_approved_by site_admin_approved_at createdAt')
    .populate('employeeId', 'id employeeId firstName lastName email locationId')
    .populate('companyId', 'id name')
    .populate('items.uniformId', 'id name')
    .sort({ site_admin_approved_at: -1, orderDate: -1 })
    .lean() as any
  
  // Fetch vendor names for all unique vendorIds
  const vendorIds = [...new Set(approvedOrders.map((o: any) => o.vendorId).filter(Boolean))]
  const vendors = await Vendor.find({ id: { $in: vendorIds } }).select('id name').lean() as any
  
  // Add vendorName to orders
  approvedOrders.forEach((o: any) => {
    if (!o.vendorName && o.vendorId && vendorMap.has(o.vendorId)) {
      o.vendorName = vendorMap.get(o.vendorId)
    }
  })
  
  console.log(`[getApprovedPRsForSiteAdmin] Found ${approvedOrders.length} order(s) approved by site admin`)
  
  // Group orders by parentOrderId (similar to getPendingApprovalsForSiteAdmin)
  const parentOrderIds = new Set<string>()
  const standaloneOrders: any[] = []
  const plainOrders = approvedOrders.map((o: any) => toPlainObject(o))

  for (const order of plainOrders) {
    if (order.parentOrderId) {
      parentOrderIds.add(order.parentOrderId)
    } else {
      standaloneOrders.push(order)
    }
  }

  // Fetch child orders
  const orderMap = new Map<string, any[]>()
  if (parentOrderIds.size > 0) {
    // Build child orders query filter - same status and date filter as parent orders
    const childQueryFilter: any = {
      employeeId: { $in: employeeIds },
      parentOrderId: { $in: Array.from(parentOrderIds) },
      pr_status: 'PENDING_COMPANY_ADMIN_APPROVAL',
    }
    
    // Apply same date filter to child orders
    if (fromDate || toDate) {
      childQueryFilter.createdAt = {}
      if (fromDate) {
        childQueryFilter.createdAt.$gte = fromDate
      }
      if (toDate) {
        const endOfDay = new Date(toDate)
        endOfDay.setHours(23, 59, 59, 999)
        childQueryFilter.createdAt.$lte = endOfDay
      }
    }
    
    const allChildOrders = await Order.find(childQueryFilter)
      .select('id employeeId employeeIdNum employeeName items total status orderDate dispatchLocation companyId deliveryAddress parentOrderId vendorId vendorName isPersonalPayment personalPaymentAmount pr_number pr_date pr_status site_admin_approved_by site_admin_approved_at createdAt')
      .populate('employeeId', 'id employeeId firstName lastName email locationId')
      .populate('companyId', 'id name')
      .populate('items.uniformId', 'id name')
      .populate('vendorId', 'id name')
      .lean() as any
    
    
    for (const order of allChildOrdersPlain) {
      if (order.parentOrderId) {
        if (!orderMap.has(order.parentOrderId)) {
          orderMap.set(order.parentOrderId, [])
        }
        orderMap.get(order.parentOrderId)!.push(order)
      }
    }
  }

  // Create grouped orders (one per parentOrderId) and add standalone orders
  const groupedOrders: any[] = []
  
  for (const [parentOrderId, splitOrders] of orderMap.entries()) {
    // Sort split orders by vendor name for consistency
    splitOrders.sort((a, b) => (a.vendorName || '').localeCompare(b.vendorName || ''))
    
    // Calculate totals
    const totalItems = splitOrders.reduce((sum: any, o: any) => sum + (o.items?.length || 0), 0)
    const totalAmount = splitOrders.reduce((sum: any, o: any) => sum + (o.total || 0), 0)
    
    groupedOrders.push({
      id: parentOrderId, // Use parentOrderId as the main ID for grouped orders
      parentOrderId: parentOrderId,
      employeeId: splitOrders[0]?.employeeId,
      employeeIdNum: splitOrders[0]?.employeeIdNum,
      employeeName: splitOrders[0]?.employeeName,
      items: splitOrders.flatMap((o: any) => o.items || []),
      total: totalAmount,
      status: splitOrders[0]?.status,
      orderDate: splitOrders[0]?.orderDate,
      dispatchLocation: splitOrders[0]?.dispatchLocation,
      companyId: splitOrders[0]?.companyId,
      deliveryAddress: splitOrders[0]?.deliveryAddress,
      pr_number: splitOrders[0]?.pr_number,
      pr_date: splitOrders[0]?.pr_date,
      pr_status: splitOrders[0]?.pr_status,
      site_admin_approved_at: splitOrders[0]?.site_admin_approved_at,
      isSplitOrder: true,
      splitOrders: splitOrders.map((o: any) => ({
        orderId: o.id,
        vendorName: o.vendorName,
        total: o.total,
        itemCount: o.items?.length || 0
      })),
      vendorId: null, // Multiple vendors for split orders
      vendorName: null, // Multiple vendors for split orders
      isPersonalPayment: splitOrders[0]?.isPersonalPayment || false,
      personalPaymentAmount: splitOrders[0]?.personalPaymentAmount || 0,
      createdAt: splitOrders[0]?.createdAt,
    })
  }
  
  // Add standalone orders
  groupedOrders.push(...standaloneOrders)
  
  // Sort by approval date (newest first)
  groupedOrders.sort((a, b) => {
    const dateA = a.site_admin_approved_at ? new Date(a.site_admin_approved_at).getTime() : (a.orderDate ? new Date(a.orderDate).getTime() : 0)
    const dateB = b.site_admin_approved_at ? new Date(b.site_admin_approved_at).getTime() : (b.orderDate ? new Date(b.orderDate).getTime() : 0)
    return dateB - dateA
  })
  
  console.log(`[getApprovedPRsForSiteAdmin] Returning ${groupedOrders.length} order(s) (${groupedOrders.filter(o => o.isSplitOrder).length} grouped, ${groupedOrders.filter(o => !o.isSplitOrder).length} standalone)`)
  
  return groupedOrders
}

/**
 * Create Purchase Order(s) from approved PRs and trigger vendor fulfilment
 * Creates one PO per vendor automatically
 * @param orderIds Array of order IDs (PRs) to include in PO(s)
 * @param poNumber Client-generated PO number
 * @param poDate PO creation date
 * @param companyId Company ID
 * @param createdByUserId Employee ID of the user creating the PO
 * @returns Created PO(s) with fulfilment status
 */
export async function createPurchaseOrderFromPRs(
  orderIds: string[],
  poNumber: string,
  poDate: Date,
  companyId: string,
  createdByUserId: string
): Promise<{ success: boolean, purchaseOrders: any[], message: string }> {
  await connectDB()
  
  console.log(`[createPurchaseOrderFromPRs] ========================================`)
  console.log(`[createPurchaseOrderFromPRs] 🚀 CREATING PO FROM PRs`)
  console.log(`[createPurchaseOrderFromPRs] PO Number: ${poNumber}`)
  console.log(`[createPurchaseOrderFromPRs] PO Date: ${poDate.toISOString()}`)
  console.log(`[createPurchaseOrderFromPRs] Order IDs: ${orderIds.join(', ')}`)
  console.log(`[createPurchaseOrderFromPRs] Company ID: ${companyId}`)
  console.log(`[createPurchaseOrderFromPRs] Created By: ${createdByUserId}`)
  
  // Validate inputs
  if (!orderIds || orderIds.length === 0) {
    throw new Error('At least one order ID is required')
  }
  if (!poNumber || !poNumber.trim()) {
    throw new Error('PO Number is required')
  }
  if (!poDate) {
    throw new Error('PO Date is required')
  }
  
  // Find company
  const company = await Company.findOne({ id: companyId })
  if (!company) {
    throw new Error(`Company not found: ${companyId}`)
  }
  
  // Find creating user (employee)
  const creatingEmployee = await Employee.findOne({ id: createdByUserId })
  if (!creatingEmployee) {
    throw new Error(`Employee not found: ${createdByUserId}`)
  }
  
  // Fetch all orders (PRs) - handle both parent order IDs and child order IDs
  const allOrderIds = new Set<string>()
  const ordersToProcess: any[] = []
  
  for (const orderId of orderIds) {
    // CRITICAL FIX: Fetch order and immediately convert to plain object to ensure vendorId is accessible
    // Use lean() to get plain JavaScript object with all fields guaranteed to be present
    let order = await Order.findOne({ id: orderId }).lean() as any
    
    // If not found, check if it's a parent order ID
    if (!order) {
      const childOrders = await Order.find({ parentOrderId: orderId }).lean() as any
      if (childOrders.length > 0) {
        // It's a parent order - add all child orders
        for (const childOrder of childOrders) {
          if (!allOrderIds.has(childOrder.id)) {
            allOrderIds.add(childOrder.id)
            ordersToProcess.push(childOrder)
          }
        }
        continue
      } else {
        throw new Error(`Order not found: ${orderId}`)
      }
    }
    
    // Check if this order has a parentOrderId (it's a child order)
    if (order.parentOrderId) {
      // Fetch all sibling orders
      const siblingOrders = await Order.find({ parentOrderId: order.parentOrderId }).lean() as any
      for (const siblingOrder of siblingOrders) {
        if (!allOrderIds.has(siblingOrder.id)) {
          allOrderIds.add(siblingOrder.id)
          ordersToProcess.push(siblingOrder)
        }
      }
    } else {
      // Standalone order
      if (!allOrderIds.has(order.id)) {
        allOrderIds.add(order.id)
        ordersToProcess.push(order)
      }
    }
  }
  
  console.log(`[createPurchaseOrderFromPRs] Found ${ordersToProcess.length} order(s) to process`)
  
  // CRITICAL: Pre-validate all orders have valid vendorId BEFORE processing
  // This fails fast and provides clear error messages
  const ordersWithInvalidVendorId: Array<{ orderId: string, vendorId: any, reason: string }> = []
  
  for (const order of ordersToProcess) {
    console.log(`[createPurchaseOrderFromPRs] 📋 Pre-validating order ${order.id}:`)
    console.log(`[createPurchaseOrderFromPRs]   - _id: ${order._id?.toString()}`)
    console.log(`[createPurchaseOrderFromPRs]   - vendorId: ${order.vendorId} (type: ${typeof order.vendorId})`)
    console.log(`[createPurchaseOrderFromPRs]   - vendorName: ${order.vendorName}`)
    console.log(`[createPurchaseOrderFromPRs]   - Has vendorId property: ${'vendorId' in order}`)
    
    // Validate vendorId exists and is in correct format
    if (!order.vendorId || order.vendorId === null || order.vendorId === undefined) {
      ordersWithInvalidVendorId.push({
        orderId: order.id,
        vendorId: order.vendorId,
        reason: 'vendorId is null or undefined'
      })
      continue
    }
    
    // Check if vendorId is in correct format (6-digit numeric string)
    const vendorIdStr = typeof order.vendorId === 'string' 
      ? order.vendorId.trim() 
      : String(order.vendorId).trim()
    
    if (!/^\d{6}$/.test(vendorIdStr)) {
      ordersWithInvalidVendorId.push({
        orderId: order.id,
        vendorId: order.vendorId,
        reason: `vendorId is not a 6-digit numeric string. Received: "${vendorIdStr}" (type: ${typeof order.vendorId})`
      })
    }
  }
  
  // Fail fast if any orders have invalid vendorId
  if (ordersWithInvalidVendorId.length > 0) {
    console.error(`[createPurchaseOrderFromPRs] ❌ PRE-VALIDATION FAILED: ${ordersWithInvalidVendorId.length} order(s) have invalid vendorId`)
    for (const invalid of ordersWithInvalidVendorId) {
      console.error(`[createPurchaseOrderFromPRs]   - Order ${invalid.orderId}: ${invalid.reason}`)
    }
    throw new Error(
      `Cannot create PO: ${ordersWithInvalidVendorId.length} order(s) have invalid vendorId. ` +
      `Orders: ${ordersWithInvalidVendorId.map(o => o.orderId).join(', ')}. ` +
      `Please ensure all orders have a valid 6-digit numeric vendorId before creating PO.`
    )
  }
  
  // Validate all orders are approved PRs or already have PO created
  // BUSINESS RULE: PO creation is allowed when pr_status is:
  // - PENDING_COMPANY_ADMIN_APPROVAL (awaiting Company Admin approval)
  // - SITE_ADMIN_APPROVED (Site Admin approved, no Company Admin approval needed)
  // - PO_CREATED (PR already has PO created - allows re-creating or updating PO)
  for (const order of ordersToProcess) {
    const validStatuses = ['PENDING_COMPANY_ADMIN_APPROVAL', 'SITE_ADMIN_APPROVED', 'PO_CREATED']
    if (!validStatuses.includes(order.pr_status)) {
      throw new Error(`Order ${order.id} is not in a valid status for PO creation. Current status: ${order.pr_status}. Valid statuses: ${validStatuses.join(', ')}`)
    }
    if (String(order.companyId) !== String(company.id)) {
      throw new Error(`Order ${order.id} does not belong to company ${companyId}`)
    }
  }
  
  console.log(`[createPurchaseOrderFromPRs] ✅ Pre-validation passed: All ${ordersToProcess.length} order(s) have valid vendorId`)
  
  // Group orders by vendor - first resolve vendors to get their numeric IDs
  const ordersByVendor = new Map<string, any[]>()
  const vendorIdMap = new Map<string, any>() // Map: vendor numeric ID -> vendor document
  
  for (const order of ordersToProcess) {
    console.log(`[createPurchaseOrderFromPRs] 🔍 Processing order: ${order.id}`)
    
    // CRITICAL FIX: Orders are fetched with .lean() so they're plain JavaScript objects
    // vendorId should be directly accessible as order.vendorId
    let vendorIdValue: string | null = null
    
    // Direct property access - orders are plain objects from .lean()
    if (order.vendorId !== undefined && order.vendorId !== null) {
      const rawVendorId = order.vendorId
      console.log(`[createPurchaseOrderFromPRs]   Found vendorId in order: ${rawVendorId} (type: ${typeof rawVendorId})`)
      
      // Handle different formats (defensive programming)
      if (typeof rawVendorId === 'string') {
        vendorIdValue = rawVendorId.trim()
      } else if (typeof rawVendorId === 'object' && rawVendorId !== null) {
        // Legacy: handle populated object (shouldn't happen with .lean(), but defensive)
        if ((rawVendorId as any).id && /^\d{6}$/.test(String((rawVendorId as any).id))) {
          vendorIdValue = String((rawVendorId as any).id).trim()
        } else {
          vendorIdValue = String((rawVendorId as any)._id || rawVendorId).trim()
        }
      } else {
        vendorIdValue = String(rawVendorId).trim()
      }
      
      console.log(`[createPurchaseOrderFromPRs]   Processed vendorId: ${vendorIdValue}`)
    } else {
      console.error(`[createPurchaseOrderFromPRs] ❌ Order ${order.id} has null/undefined vendorId`)
      console.error(`[createPurchaseOrderFromPRs]   Order keys:`, Object.keys(order))
      console.error(`[createPurchaseOrderFromPRs]   Order vendorId property exists: ${'vendorId' in order}`)
    }
    
    // Validate vendorId format - must be exactly 6 digits
    if (!vendorIdValue || vendorIdValue === 'null' || vendorIdValue === 'undefined' || !/^\d{6}$/.test(vendorIdValue)) {
      console.error(`[createPurchaseOrderFromPRs] ❌ Order ${order.id} missing or invalid vendorId`)
      console.error(`[createPurchaseOrderFromPRs]   Order data:`, {
        id: order.id,
        _id: order._id?.toString(),
        vendorId: order.vendorId,
        vendorIdValue: vendorIdValue,
        vendorIdType: typeof order.vendorId,
        vendorName: order.vendorName,
        parentOrderId: order.parentOrderId,
        orderKeys: Object.keys(order)
      })
      
      // Try one more time with direct database query - check what's actually stored
      try {
        console.log(`[createPurchaseOrderFromPRs] 🔍 Attempting direct database query for order ${order.id}...`)
        const directOrder = await Order.findOne({ id: order.id }).lean() as any
        
        if (!directOrder) {
          console.error(`[createPurchaseOrderFromPRs] ❌ Order ${order.id} not found in database!`)
        } else {
          console.log(`[createPurchaseOrderFromPRs] 📊 Direct order query result:`)
          console.log(`[createPurchaseOrderFromPRs]   - vendorId: ${(directOrder as any).vendorId}`)
          console.log(`[createPurchaseOrderFromPRs]   - vendorId type: ${typeof (directOrder as any).vendorId}`)
          console.log(`[createPurchaseOrderFromPRs]   - vendorName: ${directOrder.vendorName}`)
          console.log(`[createPurchaseOrderFromPRs]   - All order fields:`, Object.keys(directOrder))
          
          if ((directOrder as any).vendorId) {
            let directVendorId = typeof (directOrder as any).vendorId === 'string' 
              ? (directOrder as any).vendorId.trim() 
              : String((directOrder as any).vendorId).trim()
            
            console.log(`[createPurchaseOrderFromPRs]   - Processed vendorId: ${directVendorId}`)
            console.log(`[createPurchaseOrderFromPRs]   - Is 6-digit format: ${/^\d{6}$/.test(directVendorId)}`)
            console.log(`[createPurchaseOrderFromPRs]   - Is valid ObjectId: ${mongoose.Types.ObjectId.isValid(directVendorId)}`)
            
            // If it's an ObjectId (legacy format), try to look up the vendor and get its numeric ID
            if (!/^\d{6}$/.test(directVendorId) && mongoose.Types.ObjectId.isValid(directVendorId)) {
              console.log(`[createPurchaseOrderFromPRs] ⚠️ Order ${order.id} has legacy ObjectId vendorId: ${directVendorId}, looking up vendor...`)
              try {
                const legacyVendor = await Vendor.findById(new mongoose.Types.ObjectId(directVendorId))
                if (legacyVendor && legacyVendor.id) {
                  directVendorId = String(legacyVendor.id).trim()
                  console.log(`[createPurchaseOrderFromPRs] ✅ Converted legacy ObjectId to numeric ID: ${directVendorId}`)
                  
                  // Update the order in database to use numeric ID
                  await Order.updateOne({ id: order.id }, { vendorId: directVendorId })
                  console.log(`[createPurchaseOrderFromPRs] ✅ Updated order ${order.id} to use numeric vendorId`)
                } else {
                  console.error(`[createPurchaseOrderFromPRs] ❌ Legacy vendor not found for ObjectId: ${directVendorId}`)
                }
              } catch (legacyError) {
                console.error(`[createPurchaseOrderFromPRs] Error looking up legacy vendor:`, legacyError)
              }
            }
            
            if (/^\d{6}$/.test(directVendorId)) {
              console.log(`[createPurchaseOrderFromPRs] ✅ Found valid vendorId via direct query: ${directVendorId}`)
              vendorIdValue = directVendorId
            } else {
              console.error(`[createPurchaseOrderFromPRs] ❌ Direct query vendorId is not in 6-digit format: ${directVendorId}`)
            }
          } else {
            console.error(`[createPurchaseOrderFromPRs] ❌ Direct order query shows vendorId is null/undefined`)
            
            // Last resort: try to get vendor from order items
            console.log(`[createPurchaseOrderFromPRs] 🔍 Attempting to get vendor from order items...`)
            if (directOrder.items && directOrder.items.length > 0) {
              const firstItem = directOrder.items[0]
              if (firstItem && firstItem.productId) {
                try {
                  const Uniform = (await import('@/lib/models/Uniform')).default
                  const ProductVendor = (await import('@/lib/models/Relationship')).ProductVendor
                  
                  const product = await Uniform.findOne({ id: firstItem.productId }).lean() as any
                  if (product && product._id) {
                    const productVendorLink = await ProductVendor.findOne({ 
                      productId: product._id 
                    }).populate('vendorId', 'id name').lean()
                    
                    if (productVendorLink && productVendorLink.vendorId) {
                      const vendorObj = productVendorLink.vendorId as any
                      const extractedVendorId = vendorObj.id || String(vendorObj._id)
                      if (/^\d{6}$/.test(String(extractedVendorId))) {
                        console.log(`[createPurchaseOrderFromPRs] ✅ Found vendorId from ProductVendor: ${extractedVendorId}`)
                        vendorIdValue = String(extractedVendorId).trim()
                        
                        // Update the order with the found vendorId
                        await Order.updateOne({ id: order.id }, { 
                          vendorId: vendorIdValue,
                          vendorName: vendorObj.name || order.vendorName
                        })
                        console.log(`[createPurchaseOrderFromPRs] ✅ Updated order ${order.id} with vendorId from ProductVendor`)
                      }
                    }
                  }
                } catch (itemError) {
                  console.error(`[createPurchaseOrderFromPRs] Error getting vendor from items:`, itemError)
                }
              }
            }
          }
        }
      } catch (directError) {
        console.error(`[createPurchaseOrderFromPRs] Direct query also failed:`, directError)
        console.error(`[createPurchaseOrderFromPRs] Error stack:`, directError.stack)
      }
      
      // Final check after direct query and all fallbacks
      if (!vendorIdValue || !/^\d{6}$/.test(vendorIdValue)) {
        // CRITICAL: Log the actual database state for debugging
        const dbOrder = await Order.findOne({ id: order.id }).lean() as any
        console.error(`[createPurchaseOrderFromPRs] ❌ FINAL VALIDATION FAILED for order ${order.id}`)
        console.error(`[createPurchaseOrderFromPRs]   Database vendorId: ${dbOrder?.vendorId}`)
        console.error(`[createPurchaseOrderFromPRs]   Database vendorId type: ${typeof dbOrder?.vendorId}`)
        console.error(`[createPurchaseOrderFromPRs]   Extracted vendorIdValue: ${vendorIdValue}`)
        throw new Error(`Order ${order.id} does not have a valid vendor assigned. Vendor ID must be a 6-digit numeric string. Received: ${vendorIdValue || 'null/undefined'}`)
      }
    }
    
    // Look up vendor by numeric ID (6-digit string)
    const vendor = await Vendor.findOne({ id: vendorIdValue })
    
    if (!vendor) {
      console.error(`[createPurchaseOrderFromPRs] ⚠️ Could not find vendor with ID: ${vendorIdValue}`)
      console.error(`[createPurchaseOrderFromPRs]   Order ID: ${order.id}`)
      
      // List available vendors for debugging
      const sampleVendors = await Vendor.find({}, 'id name _id').limit(5).lean() as any
      console.log('Available vendors:', sampleVendors.map((v: any) => `id=${v.id}, _id=${v._id?.toString()}, name=${v.name}`))
      
      throw new Error(`Vendor not found for order ${order.id}. Vendor ID: ${vendorIdValue}`)
    }
    
    // Use vendor's numeric ID as the key for grouping
    const vendorKey = vendor.id // Numeric vendor ID (e.g., "100001")
    
    if (!vendorIdMap.has(vendorKey)) {
      vendorIdMap.set(vendorKey, vendor)
    }
    
    if (!ordersByVendor.has(vendorKey)) {
      ordersByVendor.set(vendorKey, [])
    }
    ordersByVendor.get(vendorKey)!.push(order)
  }
  
  console.log(`[createPurchaseOrderFromPRs] Orders grouped into ${ordersByVendor.size} vendor(s)`)
  
  // Create one PO per vendor
  const createdPOs: any[] = []
  
  for (const [vendorNumericId, vendorOrders] of ordersByVendor.entries()) {
    // Get vendor document from map
    const vendor = vendorIdMap.get(vendorNumericId)
    
    if (!vendor) {
      console.warn(`[updateVendor] Vendor not found: ${vendorId}`);
    return null // Return null instead of throwing - let API route handle 404
    }
    
    console.log(`[createPurchaseOrderFromPRs] Creating PO for vendor: ${vendor.name} (${vendor.id})`)
    console.log(`[createPurchaseOrderFromPRs]   Orders: ${vendorOrders.length}`)
    
    // Generate PO ID
    const poId = `PO-${company.id}-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`
    
    // Create PO - use vendor numeric ID (6-digit string) instead of ObjectId
    const purchaseOrder = await PurchaseOrder.create({
      id: poId,
      companyId: 
    company._id,
      vendorId: 
    vendor.id, // Use vendor numeric ID (6-digit string, e.g., "100001")
      client_po_number: poNumber.trim(),
      po_date: poDate,
      po_status: 'SENT_TO_VENDOR', // Immediately send to vendor for fulfilment
      created_by_user_id: creatingEmployee._id
    })
    
    console.log(`[createPurchaseOrderFromPRs] ✅ Created PO: ${poId} for vendor ${vendor.name}`)
    
    // Create POOrder mappings for all orders in this vendor group
    for (const orderDoc of vendorOrders) {
      // Get order _id - handle both Mongoose document and plain object
      let orderObjectId: mongoose.Types.ObjectId
      let orderIdString: string
      
      if (orderDoc._id) {
        orderObjectId = orderDoc._id instanceof mongoose.Types.ObjectId 
          ? orderDoc._id 
          : new mongoose.Types.ObjectId(orderDoc._id)
        orderIdString = orderDoc.id
      } else if (orderDoc.id) {
        // Fetch order to get _id
        const orderForId = await Order.findOne({ id: orderDoc.id })
        if (!orderForId) {
          throw new Error(`Order not found: ${orderDoc.id}`)
        }
        orderObjectId = orderForId._id
        orderIdString = orderDoc.id
      } else {
        throw new Error(`Order document missing both _id and id: ${JSON.stringify(orderDoc)}`)
      }
      
      // Create POOrder mapping
      await POOrder.create({
        purchase_order_id: purchaseOrder._id,
        order_id: orderObjectId
      })
      
      // Update order status - use updateOne since we're working with lean objects
      const updateResult = await Order.updateOne(
        { _id: orderObjectId },
        { 
          $set: {
            status: 'Awaiting fulfilment',
            pr_status: 'PO_CREATED'
          }
        }
      )
      
      if (updateResult.matchedCount === 0) {
        throw new Error(`Order not found for update: ${orderIdString}`)
      }
      
      console.log(`[createPurchaseOrderFromPRs]   ✅ Linked order ${orderIdString} to PO ${poId}`)
      console.log(`[createPurchaseOrderFromPRs]   ✅ Updated order ${orderIdString} status to 'Awaiting fulfilment'`)
    }
    
    // Fetch vendor details separately since vendorId is now numeric ID, not ObjectId reference
    const vendorDetails = await Vendor.findOne({ id: 
    vendor.id })
      .select('id name')
      .lean() as any
    
    const populatedPO = await PurchaseOrder.findById(purchaseOrder._id)
      .populate('companyId', 'id name')
      .populate('created_by_user_id', 'id employeeId firstName lastName email')
      .lean() as any
    
    const poWithVendor = {
      ...populatedPO,
      vendorId: 
    vendor.id, // Numeric vendor ID
      vendor: vendorDetails ? {
        id: vendorDetails.id,
        name: vendorDetails.name
      } : null
    }
    
    createdPOs.push(toPlainObject(poWithVendor))
  }
  
  console.log(`[createPurchaseOrderFromPRs] ========================================`)
  console.log(`[createPurchaseOrderFromPRs] ✅ PO CREATION COMPLETE`)
  console.log(`[createPurchaseOrderFromPRs] Created ${createdPOs.length} PO(s)`)
  console.log(`[createPurchaseOrderFromPRs] Linked ${ordersToProcess.length} order(s)`)
  console.log(`[createPurchaseOrderFromPRs] ========================================`)
  
  return {
    success: true,
    purchaseOrders: createdPOs,
    message: `Successfully created ${createdPOs.length} Purchase Order(s) and triggered vendor fulfilment for ${ordersToProcess.length} order(s)`
  }
}

export async function getPendingApprovalCount(companyId: string): Promise<number> {
  await connectDB()
  
  const company = await Company.findOne({ id: companyId })
  if (!company) {
    return 0
  }
  
  const count = await Order.countDocuments({
    companyId: company._id,
    status: 'Awaiting approval',
  })
  
  return count
}

/**
 * Derive PO shipping status from PR data (source of truth)
 * PO shipping status is DERIVED dynamically, not persisted
 * @param poId Purchase Order ID
 * @returns Derived shipping status: AWAITING_SHIPMENT | PARTIALLY_SHIPPED | FULLY_SHIPPED | FULLY_DELIVERED
 */
export async function derivePOShippingStatus(poId: string): Promise<'AWAITING_SHIPMENT' | 'PARTIALLY_SHIPPED' | 'FULLY_SHIPPED' | 'FULLY_DELIVERED'> {
  await connectDB()
  
  // Get PO
  const po = await PurchaseOrder.findOne({ id: poId })
  if (!po) {
    throw new Error(`Purchase Order not found: ${poId}`)
  }
  
  // Get all PRs (Orders) linked to this PO via POOrder mappings
  const poOrderMappings = await POOrder.find({ purchase_order_id: po._id }).lean() as any
  if (poOrderMappings.length === 0) {
    return 'AWAITING_SHIPMENT' // No PRs linked yet
  }
  
  // Get order string IDs from mappings
  const orderIds = poOrderMappings.map(m => String(m.order_id)).filter(Boolean)
  const prs = await Order.find({ id: { $in: orderIds } })
    .select('id status dispatchStatus deliveryStatus items')
    .lean() as any
  
    return 'AWAITING_SHIPMENT'
  }
  
  // Analyze all PR items
  let totalItems = 0
  let itemsShipped = 0
  let itemsDelivered = 0
  
  console.log(`[derivePOShippingStatus] Analyzing ${prs.length} PR(s) for PO ${poId}`)
  
  for (const pr of prs) {
    const items = pr.items || []
    const prDeliveryStatus = pr.deliveryStatus || 'NOT_DELIVERED'
    const prStatus = (pr as any).status || ''
    
    console.log(`[derivePOShippingStatus] PR ${pr.id}: deliveryStatus=${prDeliveryStatus}, status=${prStatus}, items=${items.length}`)
    
    // If PR is marked as DELIVERED at order level, consider all items delivered
    // This handles cases where updateOrderStatus was used instead of updatePRDeliveryStatus
    const isOrderMarkedDelivered = prDeliveryStatus === 'DELIVERED' || prStatus === 'Delivered'
    
    for (const item of items) {
      const orderedQty = item.quantity || 0
      const dispatchedQty = item.dispatchedQuantity || 0
      const deliveredQty = item.deliveredQuantity || 0
      
      totalItems++
      
      if (dispatchedQty > 0) {
        itemsShipped++
      }
      
      // Check if item is delivered: either via item-level quantity OR order-level status
      if (isOrderMarkedDelivered) {
        // If order is marked as delivered, assume all items are delivered
        itemsDelivered++
        console.log(`[derivePOShippingStatus] PR ${pr.id} item marked as delivered (order-level status)`)
      } else if (deliveredQty >= orderedQty && orderedQty > 0) {
        // Otherwise, check item-level deliveredQuantity
        itemsDelivered++
        console.log(`[derivePOShippingStatus] PR ${pr.id} item marked as delivered (item-level: ${deliveredQty}/${orderedQty})`)
      } else {
        console.log(`[derivePOShippingStatus] PR ${pr.id} item NOT delivered (ordered: ${orderedQty}, delivered: ${deliveredQty}, orderStatus: ${prStatus}, deliveryStatus: ${prDeliveryStatus})`)
      }
    }
  }
  
  console.log(`[derivePOShippingStatus] Summary: totalItems=${totalItems}, itemsShipped=${itemsShipped}, itemsDelivered=${itemsDelivered}`)
  
  // Derivation logic
  if (itemsDelivered === totalItems && totalItems > 0) {
    console.log(`[derivePOShippingStatus] ✅ PO ${poId} is FULLY_DELIVERED`)
    return 'FULLY_DELIVERED'
  }
  
  if (itemsShipped === totalItems && totalItems > 0) {
    return 'FULLY_SHIPPED'
  }
  
  if (itemsShipped > 0 && itemsShipped < totalItems) {
    return 'PARTIALLY_SHIPPED'
  }
  
  return 'AWAITING_SHIPMENT'
}

/**
 * Update PR shipment status (vendor marks items as SHIPPED)
 * MANDATORY VALIDATION: shipperName, dispatchedDate, modeOfTransport, and at least one item dispatchedQuantity > 0
 * @param prId PR (Order) ID
 * @param shipmentData Shipment details
 * @param vendorId Vendor ID (for authorization)
 * @returns Updated PR
 */
export async function updatePRShipmentStatus(
  prId: string,
  shipmentData: {
    shipperName: string
    carrierName?: string
    modeOfTransport: 'ROAD' | 'AIR' | 'RAIL' | 'COURIER' | 'OTHER'
    trackingNumber?: string
    dispatchedDate: Date
    expectedDeliveryDate?: Date
    shipmentReferenceNumber?: string
    itemDispatchedQuantities: Array<{ itemIndex: number, dispatchedQuantity: number }> // Item-level dispatched quantities
    // Package data (optional)
    shipmentPackageId?: string
    lengthCm?: number
    breadthCm?: number
    heightCm?: number
    volumetricWeight?: number
    // Shipping cost (optional)
    shippingCost?: number
  },
  vendorId: string
): Promise<any> {
  await connectDB()
  
  // Get PR (Order)
  const pr = await Order.findOne({ id: prId })
  if (!pr) {
    throw new Error(`PR (Order) not found: ${prId}`)
  }
  
  // Validate vendor authorization
  if (pr.vendorId !== vendorId) {
    throw new Error(`Vendor ${vendorId} is not authorized to update PR ${prId}`)
  }
  
  // Validate PR is in correct status
  if (pr.pr_status !== 'PO_CREATED') {
    throw new Error(`PR ${prId} is not in PO_CREATED status (current: ${pr.pr_status})`)
  }
  
  // MANDATORY VALIDATION: Check required fields
  if (!shipmentData.shipperName || !shipmentData.shipperName.trim()) {
    throw new Error('shipperName is required when marking items as SHIPPED')
  }
  
  if (!shipmentData.dispatchedDate) {
    throw new Error('dispatchedDate is required when marking items as SHIPPED')
  }
  
  if (!shipmentData.modeOfTransport) {
    throw new Error('modeOfTransport is required when marking items as SHIPPED')
  }
  
  // Validate at least one item has dispatchedQuantity > 0
  const hasDispatchedItems = shipmentData.itemDispatchedQuantities.some(
    item => item.dispatchedQuantity > 0
  )
  
  if (!hasDispatchedItems) {
    throw new Error('At least one item must have dispatchedQuantity > 0')
  }
  
  // Validate item indices and quantities
  const items = pr.items || []
  for (const itemDispatch of shipmentData.itemDispatchedQuantities) {
    if (itemDispatch.itemIndex < 0 || itemDispatch.itemIndex >= items.length) {
      throw new Error(`Invalid itemIndex: ${itemDispatch.itemIndex} (PR has ${items.length} items)`)
    }
    
    const item = items[itemDispatch.itemIndex]
    if (itemDispatch.dispatchedQuantity > item.quantity) {
      throw new Error(`dispatchedQuantity (${itemDispatch.dispatchedQuantity}) cannot exceed ordered quantity (${item.quantity}) for item ${itemDispatch.itemIndex}`)
    }
    
    if (itemDispatch.dispatchedQuantity < 0) {
      throw new Error(`dispatchedQuantity cannot be negative for item ${itemDispatch.itemIndex}`)
    }
  }
  
  // Generate numeric shipmentId for Order (must be 6-10 digits per Order schema validation)
  // Note: shipmentReferenceNumber can be alphanumeric (references Shipment.shipmentId)
  // But Order.shipmentId must be numeric
  let shipmentId: string
  if (shipmentData.shipmentReferenceNumber) {
    // If shipmentReferenceNumber is provided, check if it's already numeric
    const refNumber = shipmentData.shipmentReferenceNumber.trim()
    if (/^\d{6,10}$/.test(refNumber)) {
      // It's already a valid numeric ID, use it
      shipmentId = refNumber
      console.log(`[updatePRShipmentStatus] ✅ Using numeric shipmentReferenceNumber as shipmentId: ${shipmentId} for PR: ${prId}`)
    } else {
      // It's alphanumeric (e.g., SHIP_XXXXX from Shipment model), generate new numeric ID
      shipmentId = String(Date.now()).slice(-10).padStart(6, '0')
      console.log(`[updatePRShipmentStatus] ⚠️ shipmentReferenceNumber is alphanumeric (${refNumber}), generated new numeric shipmentId: ${shipmentId} for PR: ${prId}`)
      console.log(`[updatePRShipmentStatus]    shipmentReferenceNumber will be stored separately: ${refNumber}`)
    }
  } else {
    // No shipmentReferenceNumber provided, generate new numeric ID
    shipmentId = String(Date.now()).slice(-10).padStart(6, '0')
    console.log(`[updatePRShipmentStatus] ⚠️ No shipmentReferenceNumber provided, generated new numeric shipmentId: ${shipmentId} for PR: ${prId}`)
  }
  
  // Update PR with shipment data
  const updatedItems = items.map((item, index) => {
    const itemDispatch = shipmentData.itemDispatchedQuantities.find(
      id => id.itemIndex === index
    )
    
    const dispatchedQty = itemDispatch?.dispatchedQuantity || 0
    const deliveredQty = item.deliveredQuantity || 0
    
    // Determine item shipment status
    let itemShipmentStatus: 'PENDING' | 'DISPATCHED' | 'DELIVERED' = 'PENDING'
    if (deliveredQty >= item.quantity && item.quantity > 0) {
      itemShipmentStatus = 'DELIVERED'
    } else if (dispatchedQty > 0) {
      itemShipmentStatus = 'DISPATCHED'
    }
    
    return {
      ...item.toObject(),
      dispatchedQuantity: dispatchedQty,
      deliveredQuantity: deliveredQty,
      itemShipmentStatus
    }
  })
  
  // Determine overall delivery status
  const allDelivered = updatedItems.every(
    item => (item.deliveredQuantity || 0) >= item.quantity && item.quantity > 0
  )
  const someDelivered = updatedItems.some(
    item => (item.deliveredQuantity || 0) > 0
  )
  
  let deliveryStatus: 'NOT_DELIVERED' | 'PARTIALLY_DELIVERED' | 'DELIVERED' = 'NOT_DELIVERED'
  if (allDelivered) {
    deliveryStatus = 'DELIVERED'
  } else if (someDelivered) {
    deliveryStatus = 'PARTIALLY_DELIVERED'
  }
  
  // Update PR
  pr.shipmentId = shipmentId
  pr.shipmentReferenceNumber = shipmentData.shipmentReferenceNumber
  pr.shipperName = shipmentData.shipperName.trim()
  pr.carrierName = shipmentData.carrierName?.trim()
  pr.modeOfTransport = shipmentData.modeOfTransport
  pr.trackingNumber = shipmentData.trackingNumber?.trim()
  pr.dispatchStatus = 'SHIPPED'
  pr.dispatchedDate = shipmentData.dispatchedDate
  pr.expectedDeliveryDate = shipmentData.expectedDeliveryDate
  pr.deliveryStatus = deliveryStatus
  pr.items = updatedItems as any
  
  // AUTO-UPDATE: Update Order status to Dispatched when items are shipped
  pr.status = 'Dispatched'
  
  await pr.save()
  
  // Create Shipment document for MANUAL shipments (for consistency with API shipments)
  // Note: API shipments already have Shipment documents created in createApiShipment
  // This only creates documents for MANUAL shipments
  try {
    const Shipment = await import('../models/Shipment').then(m => m.default)
    const existingShipment = await Shipment.findOne({ shipmentId }).lean() as any
    
    if (!existingShipment) {
      // Only create Shipment document if it doesn't exist (for MANUAL shipments)
      // API shipments already have their Shipment documents created in createApiShipment
      await Shipment.create({
        shipmentId,
        prNumber: pr.pr_number || pr.id,
        poNumber: undefined, // TODO: Get from PO mapping if available
        vendorId: vendorId,
        shipmentMode: 'MANUAL',
        // Provider fields are null for MANUAL shipments
        providerId: undefined,
        companyShippingProviderId: undefined,
        providerShipmentReference: shipmentData.shipmentReferenceNumber,
        trackingNumber: shipmentData.trackingNumber?.trim(),
        trackingUrl: undefined, // Manual shipments don't have tracking URLs
        warehouseRefId: shipmentData.warehouseRefId || undefined,
        warehousePincode: undefined,
        // Package data
        shipmentPackageId: shipmentData.shipmentPackageId,
        lengthCm: shipmentData.lengthCm,
        breadthCm: shipmentData.breadthCm,
        heightCm: shipmentData.heightCm,
        volumetricWeight: shipmentData.volumetricWeight,
        shippingCost: shipmentData.shippingCost,
        shipmentStatus: 'CREATED', // Default status for manual shipments
        lastProviderSyncAt: undefined, // Not applicable for manual shipments
        rawProviderResponse: undefined,
      })
      console.log(`[updatePRShipmentStatus] ✅ Created Shipment document for MANUAL shipment: ${shipmentId}`)
    } else {
      console.log(`[updatePRShipmentStatus] ℹ️ Shipment document already exists (likely API shipment): ${shipmentId}, mode: ${existingShipment.shipmentMode}`)
    }
  } catch (shipmentError: any) {
    // Log error but don't fail the entire operation
    console.error(`[updatePRShipmentStatus] ⚠️ Failed to create Shipment document:`, shipmentError.message)
    // Continue with order update even if shipment document creation fails
  }
  
  // AUTO-UPDATE: Update PO status based on PR shipment status
  await updatePOStatusFromPRDelivery(prId)
  
  // Return updated PR
  const updatedPR = await Order.findById(pr._id)
    .populate('employeeId', 'id firstName lastName email')
    .populate('companyId', 'id name')
    .populate('items.uniformId', 'id name')
    .lean() as any
  
  let vendorName = null
  if (updatedPR && updatedPR.vendorId) {
    const vendor = await Vendor.findOne({ id: updatedPR.vendorId }).select('id name').lean() as any
    if (vendor) {
      vendorName = (vendor as any).name
    }
  }
  }
  
  const result = toPlainObject(updatedPR)
  if (vendorName) {
    (result as any).vendorName = vendorName
  }
  
  return result
}

/**
 * Update PO status automatically based on PR delivery status
 * This function is called whenever a PR's delivery status changes
 * @param prId PR (Order) ID
 */
async function updatePOStatusFromPRDelivery(prId: string): Promise<void> {
  await connectDB()
  
  // Get PR
  const pr = await Order.findOne({ id: prId }).lean() as any
  if (!pr) {
    console.warn(`[updatePOStatusFromPRDelivery] PR not found: ${prId}`)
    return
  }
  
  // Find all POs linked to this PR via POOrder mappings
  const poOrderMappings = await POOrder.find({ order_id: pr._id }).lean() as any
  if (poOrderMappings.length === 0) {
    // PR is not linked to any PO yet, nothing to update
    return
  }
  
  // Get all POs linked to this PR - use string IDs
  const poIds = poOrderMappings.map(m => String(m.purchase_order_id)).filter(Boolean)
  const pos = await PurchaseOrder.find({ id: { $in: poIds } }).lean() as any
  
  // Update each PO's status based on all its PRs
  for (const po of pos) {
    await updateSinglePOStatus(po._id)
  }
}

/**
 * Update a single PO's status based on all its linked PRs
 * @param poObjectId PO ObjectId
 */
async function updateSinglePOStatus(poObjectId: mongoose.Types.ObjectId): Promise<void> {
  await connectDB()
  
  // Get all PRs linked to this PO
  const poOrderMappings = await POOrder.find({ purchase_order_id: poObjectId }).lean() as any
  if (poOrderMappings.length === 0) {
    return
  }
  
  // Get order string IDs from mappings
  const orderIds = poOrderMappings.map(m => String(m.order_id)).filter(Boolean)
  const prs = await Order.find({ id: { $in: orderIds } })
    .select('id dispatchStatus deliveryStatus items pr_status')
    .lean() as any
  
    return
  }
  
  // Analyze all PRs to determine PO status
  let allPRsDelivered = true
  let allPRsShipped = true
  let anyPRShipped = false
  let anyPRDelivered = false
  
  for (const pr of prs) {
    // Check item-level delivery status
    const items = pr.items || []
    let prFullyDelivered = true
    let prFullyShipped = true
    let prAnyShipped = false
    let prAnyDelivered = false
    
    for (const item of items) {
      const orderedQty = item.quantity || 0
      const dispatchedQty = item.dispatchedQuantity || 0
      const deliveredQty = item.deliveredQuantity || 0
      
      if (orderedQty > 0) {
        if (dispatchedQty > 0) {
          prAnyShipped = true
        }
        if (deliveredQty > 0) {
          prAnyDelivered = true
        }
        if (dispatchedQty < orderedQty) {
          prFullyShipped = false
        }
        if (deliveredQty < orderedQty) {
          prFullyDelivered = false
        }
      }
    }
    
    if (!prFullyDelivered) {
      allPRsDelivered = false
    }
    if (!prFullyShipped) {
      allPRsShipped = false
    }
    if (prAnyShipped) {
      anyPRShipped = true
    }
    if (prAnyDelivered) {
      anyPRDelivered = true
    }
  }
  
  // Determine new PO status
  let newPOStatus: 'CREATED' | 'SENT_TO_VENDOR' | 'ACKNOWLEDGED' | 'IN_FULFILMENT' | 'COMPLETED' | 'CANCELLED'
  const currentPO = await PurchaseOrder.findById(poObjectId)
  
  if (!currentPO) {
    return
  }
  
  // If all PRs are fully delivered, PO is COMPLETED
  if (allPRsDelivered && prs.length > 0) {
    newPOStatus = 'COMPLETED'
  }
  // If all PRs are shipped (but not all delivered), PO is IN_FULFILMENT
  else if (allPRsShipped && !allPRsDelivered) {
    newPOStatus = 'IN_FULFILMENT'
  }
  // If any PR is shipped, PO is IN_FULFILMENT
  else if (anyPRShipped) {
    newPOStatus = 'IN_FULFILMENT'
  }
  // If PO was already SENT_TO_VENDOR or later, keep it (don't downgrade)
  else if (['SENT_TO_VENDOR', 'ACKNOWLEDGED', 'IN_FULFILMENT', 'COMPLETED'].includes(currentPO.po_status)) {
    newPOStatus = currentPO.po_status
  }
  // Otherwise, keep current status or default to SENT_TO_VENDOR
  else {
    newPOStatus = currentPO.po_status || 'SENT_TO_VENDOR'
  }
  
  // Update PO status if it changed
  if (currentPO.po_status !== newPOStatus) {
    await PurchaseOrder.updateOne(
      { _id: poObjectId },
      { $set: { po_status: newPOStatus } }
    )
    console.log(`[updateSinglePOStatus] Updated PO ${currentPO.id} status from ${currentPO.po_status} to ${newPOStatus}`)
  }
}

/**
 * Update PR delivery status (mark items as DELIVERED)
 * @param prId PR (Order) ID
 * @param deliveryData Delivery details
 * @param vendorId Vendor ID (for authorization)
 * @returns Updated PR
 */
export async function updatePRDeliveryStatus(
  prId: string,
  deliveryData: {
    deliveredDate: Date
    receivedBy?: string
    deliveryRemarks?: string
    itemDeliveredQuantities: Array<{ itemIndex: number, deliveredQuantity: number }> // Item-level delivered quantities
  },
  vendorId: string
): Promise<any> {
  await connectDB()
  
  // Get PR (Order)
  const pr = await Order.findOne({ id: prId })
  if (!pr) {
    throw new Error(`PR (Order) not found: ${prId}`)
  }
  
  // Validate vendor authorization
  if (pr.vendorId !== vendorId) {
    throw new Error(`Vendor ${vendorId} is not authorized to update PR ${prId}`)
  }
  
  // Validate PR is in SHIPPED status
  if (pr.dispatchStatus !== 'SHIPPED') {
    throw new Error(`PR ${prId} must be in SHIPPED status before marking as DELIVERED (current: ${pr.dispatchStatus || 'AWAITING_FULFILMENT'})`)
  }
  
  // Validate item indices and quantities
  const items = pr.items || []
  for (const itemDelivery of deliveryData.itemDeliveredQuantities) {
    if (itemDelivery.itemIndex < 0 || itemDelivery.itemIndex >= items.length) {
      throw new Error(`Invalid itemIndex: ${itemDelivery.itemIndex} (PR has ${items.length} items)`)
    }
    
    const item = items[itemDelivery.itemIndex]
    const dispatchedQty = item.dispatchedQuantity || 0
    
    if (itemDelivery.deliveredQuantity > dispatchedQty) {
      throw new Error(`deliveredQuantity (${itemDelivery.deliveredQuantity}) cannot exceed dispatched quantity (${dispatchedQty}) for item ${itemDelivery.itemIndex}`)
    }
    
    if (itemDelivery.deliveredQuantity < 0) {
      throw new Error(`deliveredQuantity cannot be negative for item ${itemDelivery.itemIndex}`)
    }
  }
  
  // Update PR with delivery data
  const updatedItems = items.map((item, index) => {
    const itemDelivery = deliveryData.itemDeliveredQuantities.find(
      id => id.itemIndex === index
    )
    
    const deliveredQty = itemDelivery?.deliveredQuantity || (item.deliveredQuantity || 0)
    const dispatchedQty = item.dispatchedQuantity || 0
    
    // Determine item shipment status
    let itemShipmentStatus: 'PENDING' | 'DISPATCHED' | 'DELIVERED' = 'PENDING'
    if (deliveredQty >= item.quantity && item.quantity > 0) {
      itemShipmentStatus = 'DELIVERED'
    } else if (dispatchedQty > 0) {
      itemShipmentStatus = 'DISPATCHED'
    }
    
    return {
      ...item.toObject(),
      deliveredQuantity: deliveredQty,
      itemShipmentStatus
    }
  })
  
  // Determine overall delivery status
  const allDelivered = updatedItems.every(
    item => (item.deliveredQuantity || 0) >= item.quantity && item.quantity > 0
  )
  const someDelivered = updatedItems.some(
    item => (item.deliveredQuantity || 0) > 0
  )
  
  let deliveryStatus: 'NOT_DELIVERED' | 'PARTIALLY_DELIVERED' | 'DELIVERED' = 'NOT_DELIVERED'
  if (allDelivered) {
    deliveryStatus = 'DELIVERED'
  } else if (someDelivered) {
    deliveryStatus = 'PARTIALLY_DELIVERED'
  }
  
  // Update PR
  pr.deliveredDate = deliveryData.deliveredDate
  pr.receivedBy = deliveryData.receivedBy?.trim()
  pr.deliveryRemarks = deliveryData.deliveryRemarks?.trim()
  pr.deliveryStatus = deliveryStatus
  pr.items = updatedItems as any
  
  // AUTO-UPDATE: Update Order status based on delivery status
  if (deliveryStatus === 'DELIVERED') {
    pr.status = 'Delivered'
  } else if (deliveryStatus === 'PARTIALLY_DELIVERED') {
    pr.status = 'Dispatched' // Keep as Dispatched if partially delivered
  }
  // If NOT_DELIVERED, keep current status (should be Dispatched)
  
  await pr.save()
  
  // AUTO-UPDATE: Update PO status based on PR delivery status
  await updatePOStatusFromPRDelivery(prId)
  
  // Return updated PR
  const updatedPR = await Order.findById(pr._id)
    .populate('employeeId', 'id firstName lastName email')
    .populate('companyId', 'id name')
    .populate('items.uniformId', 'id name')
    .lean() as any
  
  let vendorName = null
  if (updatedPR && updatedPR.vendorId) {
    const vendor = await Vendor.findOne({ id: updatedPR.vendorId }).select('id name').lean() as any
    if (vendor) {
      vendorName = (vendor as any).name
    }
  }
  }
  
  const result = toPlainObject(updatedPR)
  if (vendorName) {
    (result as any).vendorName = vendorName
  }
  
  return result
}

/**
 * Update existing PR and PO statuses based on underlying order delivery status
 * This function retroactively updates PR and PO statuses based on current delivery data
 * Can be used as a migration or maintenance function
 * @param companyId Optional company ID to limit update scope (if not provided, updates all)
 * @returns Summary of updates performed
 */
export async function updatePRAndPOStatusesFromDelivery(companyId?: string): Promise<{
  prsUpdated: number
  posUpdated: number
  errors: string[]
}> {
  await connectDB()
  
  const result = {
    prsUpdated: 0,
    posUpdated: 0,
    errors: [] as string[]
  }
  
  try {
    // Build query for PRs (Orders with PO_CREATED status)
    const prQuery: any = {
      pr_status: 'PO_CREATED'
    }
    
    if (companyId) {
      const company = await Company.findOne({ id: companyId })
      if (!company) {
        throw new Error(`Company not found: ${companyId}`)
      }
      prQuery.companyId = company._id
    }
    
    // Get all PRs that have PO created
    const prs = await Order.find(prQuery)
      .select('id companyId vendorId items dispatchStatus deliveryStatus status pr_status')
      .lean() as any
    
    
    // Update each PR's status based on delivery data
    for (const pr of prs) {
      try {
        const items = pr.items || []
        
        // Determine PR status based on item-level delivery
        let allItemsDelivered = true
        let allItemsShipped = true
        let anyItemShipped = false
        let anyItemDelivered = false
        
        for (const item of items) {
          const orderedQty = item.quantity || 0
          const dispatchedQty = item.dispatchedQuantity || 0
          const deliveredQty = item.deliveredQuantity || 0
          
          if (orderedQty > 0) {
            if (dispatchedQty > 0) {
              anyItemShipped = true
            }
            if (deliveredQty > 0) {
              anyItemDelivered = true
            }
            if (dispatchedQty < orderedQty) {
              allItemsShipped = false
            }
            if (deliveredQty < orderedQty) {
              allItemsDelivered = false
            }
          }
        }
        
        // Determine new PR status
        let newPRStatus: 'Awaiting approval' | 'Awaiting fulfilment' | 'Dispatched' | 'Delivered'
        let newDispatchStatus: 'AWAITING_FULFILMENT' | 'SHIPPED' = pr.dispatchStatus || 'AWAITING_FULFILMENT'
        let newDeliveryStatus: 'NOT_DELIVERED' | 'PARTIALLY_DELIVERED' | 'DELIVERED' = pr.deliveryStatus || 'NOT_DELIVERED'
        
        if (allItemsDelivered && items.length > 0) {
          newPRStatus = 'Delivered'
          newDeliveryStatus = 'DELIVERED'
          if (anyItemShipped) {
            newDispatchStatus = 'SHIPPED'
          }
        } else if (allItemsShipped && !allItemsDelivered) {
          newPRStatus = 'Dispatched'
          newDispatchStatus = 'SHIPPED'
          if (anyItemDelivered) {
            newDeliveryStatus = 'PARTIALLY_DELIVERED'
          }
        } else if (anyItemShipped) {
          newPRStatus = 'Dispatched'
          newDispatchStatus = 'SHIPPED'
          if (anyItemDelivered) {
            newDeliveryStatus = 'PARTIALLY_DELIVERED'
          }
        } else {
          // No items shipped yet
          newPRStatus = 'Awaiting fulfilment'
          newDispatchStatus = 'AWAITING_FULFILMENT'
          newDeliveryStatus = 'NOT_DELIVERED'
        }
        
        // Update PR if status changed
        const prDoc = await Order.findOne({ id: pr.id })
        if (prDoc) {
          let prUpdated = false
          
          if (prDoc.status !== newPRStatus) {
            prDoc.status = newPRStatus
            prUpdated = true
          }
          
          if (prDoc.dispatchStatus !== newDispatchStatus) {
            prDoc.dispatchStatus = newDispatchStatus
            prUpdated = true
          }
          
          if (prDoc.deliveryStatus !== newDeliveryStatus) {
            prDoc.deliveryStatus = newDeliveryStatus
            prUpdated = true
          }
          
          if (prUpdated) {
            await prDoc.save()
            result.prsUpdated++
            console.log(`[updatePRAndPOStatusesFromDelivery] Updated PR ${pr.id}: status=${newPRStatus}, dispatchStatus=${newDispatchStatus}, deliveryStatus=${newDeliveryStatus}`)
          }
        }
      } catch (error: any) {
        const errorMsg = `Error updating PR ${pr.id}: ${error.message}`
        console.error(`[updatePRAndPOStatusesFromDelivery] ${errorMsg}`)
        result.errors.push(errorMsg)
      }
    }
    
    // Now update all PO statuses based on their linked PRs
    const poQuery: any = {}
    if (companyId) {
      const company = await Company.findOne({ id: companyId })
      if (company) {
        poQuery.companyId = company._id
      }
    }
    
    const pos = await PurchaseOrder.find(poQuery).lean() as any
    console.log(`[updatePRAndPOStatusesFromDelivery] Found ${pos.length} POs to process`)
    
    for (const po of pos) {
      try {
        await updateSinglePOStatus(po._id)
        result.posUpdated++
      } catch (error: any) {
        const errorMsg = `Error updating PO ${po.id}: ${error.message}`
        console.error(`[updatePRAndPOStatusesFromDelivery] ${errorMsg}`)
        result.errors.push(errorMsg)
      }
    }
    
    console.log(`[updatePRAndPOStatusesFromDelivery] ✅ Update complete: ${result.prsUpdated} PRs updated, ${result.posUpdated} POs updated, ${result.errors.length} errors`)
    
    return result
  } catch (error: any) {
    const errorMsg = `Fatal error in updatePRAndPOStatusesFromDelivery: ${error.message}`
    console.error(`[updatePRAndPOStatusesFromDelivery] ${errorMsg}`)
    result.errors.push(errorMsg)
    return result
  }
}

/**
 * Get approved orders for Company Admin (orders approved by Company Admin)
 * @param companyId Company ID
 * @returns Array of approved orders with PR details
 */
export async function getApprovedOrdersForCompanyAdmin(companyId: string): Promise<any[]> {
  await connectDB()
  
  const company = await Company.findOne({ id: companyId }).select('_id id name enable_pr_po_workflow').lean() as any
    return []
  }
  
  // Find orders approved by Company Admin
  // Status: COMPANY_ADMIN_APPROVED (legacy) or orders that have been approved but not yet PO created
  const queryFilter: any = {
    companyId: 
    company._id,
    $and: [
      {
        $or: [
          { pr_status: 'COMPANY_ADMIN_APPROVED' },
          { company_admin_approved_by: { $exists: true, $ne: null } }
        ]
      },
      { pr_status: { $ne: 'PO_CREATED' } } // Exclude orders that already have PO created
    ]
  }
  
  const approvedOrders = await Order.find(queryFilter)
    .select('id employeeId employeeIdNum employeeName items total status orderDate dispatchLocation companyId deliveryAddress parentOrderId vendorId vendorName isPersonalPayment personalPaymentAmount createdAt pr_number pr_date pr_status company_admin_approved_by company_admin_approved_at')
    .populate('employeeId', 'id employeeId firstName lastName email')
    .populate('companyId', 'id name')
    .populate('items.uniformId', 'id name')
    .populate('company_admin_approved_by', 'id employeeId firstName lastName email')
    .sort({ company_admin_approved_at: -1, orderDate: -1 })
    .lean() as any
  
  // Fetch vendor names for all unique vendorIds
  const vendorIds = [...new Set(approvedOrders.map((o: any) => o.vendorId).filter(Boolean))]
  const vendors = await Vendor.find({ id: { $in: vendorIds } }).select('id name').lean() as any
  
  // Add vendorName to orders
  approvedOrders.forEach((o: any) => {
    if (!o.vendorName && o.vendorId && vendorMap.has(o.vendorId)) {
      o.vendorName = vendorMap.get(o.vendorId)
    }
  })
  
  // Group orders similar to getPendingApprovals
  const parentOrderIds = new Set<string>()
  const standaloneOrders: any[] = []
  const plainOrders = approvedOrders.map((o: any) => toPlainObject(o))
  
  for (const order of plainOrders) {
    if (order.parentOrderId) {
      parentOrderIds.add(order.parentOrderId)
    } else {
      standaloneOrders.push(order)
    }
  }
  
  const orderMap = new Map<string, any[]>()
  if (parentOrderIds.size > 0) {
    const allChildOrders = await Order.find({
      companyId: 
    company._id,
      parentOrderId: { $in: Array.from(parentOrderIds) }
    })
      .select('id employeeId employeeIdNum employeeName items total status orderDate dispatchLocation companyId deliveryAddress parentOrderId vendorId vendorName isPersonalPayment personalPaymentAmount createdAt pr_number pr_date pr_status company_admin_approved_by company_admin_approved_at')
      .populate('employeeId', 'id employeeId firstName lastName email')
      .populate('companyId', 'id name')
      .populate('items.uniformId', 'id name')
      .populate('company_admin_approved_by', 'id employeeId firstName lastName email')
      .lean() as any
    
    // Fetch vendor names for child orders
    const childVendorIds = [...new Set(allChildOrders.map((o: any) => o.vendorId).filter(Boolean))]
    if (childVendorIds.length > 0) {
      const childVendors = await Vendor.find({ id: { $in: childVendorIds } }).select('id name').lean() as any
      allChildOrders.forEach((o: any) => {
        if (!o.vendorName && o.vendorId && childVendorMap.has(o.vendorId)) {
          o.vendorName = childVendorMap.get(o.vendorId)
        }
      })
    }
    
    const allChildOrdersPlain = allChildOrders.map((o: any) => toPlainObject(o))
    
    for (const order of allChildOrdersPlain) {
      if (order.parentOrderId) {
        if (!orderMap.has(order.parentOrderId)) {
          orderMap.set(order.parentOrderId, [])
        }
        orderMap.get(order.parentOrderId)!.push(order)
      }
    }
  }
  
  const groupedOrders: any[] = []
  
  for (const [parentOrderId, splitOrders] of orderMap.entries()) {
    splitOrders.sort((a, b) => (a.vendorName || '').localeCompare(b.vendorName || ''))
    
    const totalAmount = splitOrders.reduce((sum: any, o: any) => sum + (o.total || 0), 0)
    const totalItems = splitOrders.reduce((sum: any, o: any) => sum + (o.items?.length || 0), 0)
    const allItems = splitOrders.flatMap(o => o.items || [])
    
    groupedOrders.push({
      ...splitOrders[0],
      id: parentOrderId,
      isSplitOrder: true,
      splitOrders: splitOrders,
      splitOrderIds: splitOrders.map(o => o.id),
      total: totalAmount,
      items: allItems,
      vendorCount: splitOrders.length,
      vendors: splitOrders.map(o => o.vendorName).filter(Boolean)
    })
  }
  
  const allOrders = [...groupedOrders, ...standaloneOrders]
  allOrders.sort((a, b) => {
    const dateA = new Date(a.company_admin_approved_at || a.orderDate || 0).getTime()
    const dateB = new Date(b.company_admin_approved_at || b.orderDate || 0).getTime()
    return dateB - dateA
  })
  
  return allOrders
}

/**
 * Get orders with PO created for Company Admin
 * @param companyId Company ID
 * @returns Array of orders with PO details
 */
export async function getPOCreatedOrdersForCompanyAdmin(companyId: string): Promise<any[]> {
  await connectDB()
  
  const company = await Company.findOne({ id: companyId }).select('_id id name').lean() as any
    return []
  }
  
  // Find orders with PO created status
  const queryFilter: any = {
    companyId: company._id,
    pr_status: 'PO_CREATED'
  }
  
  const poCreatedOrders = await Order.find(queryFilter)
    .select('id employeeId employeeIdNum employeeName items total status orderDate dispatchLocation companyId deliveryAddress parentOrderId vendorId vendorName isPersonalPayment personalPaymentAmount createdAt pr_number pr_date pr_status')
    .populate('employeeId', 'id employeeId firstName lastName email')
    .populate('companyId', 'id name')
    .populate('items.uniformId', 'id name')
    .sort({ orderDate: -1 })
    .lean() as any
  
  // Fetch vendor names for all unique vendorIds
  const vendorIds = [...new Set(poCreatedOrders.map((o: any) => o.vendorId).filter(Boolean))]
  const vendors = await Vendor.find({ id: { $in: vendorIds } }).select('id name').lean() as any
  
  // Add vendorName to orders
  poCreatedOrders.forEach((o: any) => {
    if (!o.vendorName && o.vendorId && vendorMap.has(o.vendorId)) {
      o.vendorName = vendorMap.get(o.vendorId)
    }
  })
  
  // Get PO details for these orders via POOrder mapping
  const orderIds = poCreatedOrders.map((o: any) => o._id)
  const poOrderMappings = await POOrder.find({ order_id: { $in: orderIds } })
    .populate('purchase_order_id')
    .lean() as any
  
  const poMap = new Map<string, any[]>()
  for (const mapping of poOrderMappings) {
    const orderId = mapping.order_id?.toString()
    if (orderId) {
      if (!poMap.has(orderId)) {
        poMap.set(orderId, [])
      }
      poMap.get(orderId)!.push(mapping.purchase_order_id)
    }
  }
  
  // Group orders similar to other functions
  const parentOrderIds = new Set<string>()
  const standaloneOrders: any[] = []
  const plainOrders = poCreatedOrders.map((o: any) => toPlainObject(o))
  
  for (const order of plainOrders) {
    if (order.parentOrderId) {
      parentOrderIds.add(order.parentOrderId)
    } else {
      standaloneOrders.push(order)
    }
  }
  
  const orderMap = new Map<string, any[]>()
  if (parentOrderIds.size > 0) {
    const allChildOrders = await Order.find({
      companyId: 
    company._id,
      parentOrderId: { $in: Array.from(parentOrderIds) },
      pr_status: 'PO_CREATED'
    })
      .select('id employeeId employeeIdNum employeeName items total status orderDate dispatchLocation companyId deliveryAddress parentOrderId vendorId vendorName isPersonalPayment personalPaymentAmount createdAt pr_number pr_date pr_status')
      .populate('employeeId', 'id employeeId firstName lastName email')
      .populate('companyId', 'id name')
      .populate('items.uniformId', 'id name')
      .populate('vendorId', 'id name')
      .lean() as any
    
    const allChildOrdersPlain = allChildOrders.map((o: any) => toPlainObject(o))
    
    for (const order of allChildOrdersPlain) {
      if (order.parentOrderId) {
        if (!orderMap.has(order.parentOrderId)) {
          orderMap.set(order.parentOrderId, [])
        }
        orderMap.get(order.parentOrderId)!.push(order)
      }
    }
  }

  const groupedOrders: any[] = []
  
  for (const [parentOrderId, splitOrders] of orderMap.entries()) {
    splitOrders.sort((a, b) => (a.vendorName || '').localeCompare(b.vendorName || ''))
    
    const totalAmount = splitOrders.reduce((sum: any, o: any) => sum + (o.total || 0), 0)
    const totalItems = splitOrders.reduce((sum: any, o: any) => sum + (o.items?.length || 0), 0)
    const allItems = splitOrders.flatMap(o => o.items || [])
    
    // Get POs for all child orders
    const childOrderIds = splitOrders.map((o: any) => o._id?.toString()).filter(Boolean)
    const childPOs = childOrderIds.flatMap(id => poMap.get(id) || [])
    
    groupedOrders.push({
      ...splitOrders[0],
      id: parentOrderId,
      isSplitOrder: true,
      splitOrders: splitOrders,
      splitOrderIds: splitOrders.map(o => o.id),
      total: totalAmount,
      items: allItems,
      vendorCount: splitOrders.length,
      vendors: splitOrders.map(o => o.vendorName).filter(Boolean),
      purchaseOrders: childPOs
    })
  }
  
  // Add PO details to standalone orders
  const allOrders = [...groupedOrders, ...standaloneOrders.map(order => {
    const orderId = order._id?.toString()
    const pos = orderId ? poMap.get(orderId) || [] : []
    return { ...order, purchaseOrders: pos }
  })]
  
  allOrders.sort((a, b) => {
    const dateA = new Date(a.orderDate || 0).getTime()
    const dateB = new Date(b.orderDate || 0).getTime()
    return dateB - dateA
  })
  
  return allOrders
}

/**
 * Get pending return request count for a company
 */
export async function getPendingReturnRequestCount(companyId: string): Promise<number> {
  await connectDB()
  
  const company = await Company.findOne({ id: companyId }).select('_id id').lean() as any
  if (!company) {
    // Try with _id if companyId looks like ObjectId
    if (companyId && companyId.length === 24 && /^[0-9a-fA-F]{24}$/.test(companyId)) {
      const companyById = await Company.findById(companyId).select('_id id').lean() as any
      if (companyById) {
        return await ReturnRequest.countDocuments({
          companyId: (companyById as any)._id,
          status: 'REQUESTED',
        })
      }
    }
    return 0
  }
  
  const count = await ReturnRequest.countDocuments({
    companyId: company._id,
    status: 'REQUESTED',
  })
  
  return count
}

/**
 * Get new (unread) feedback count for a company
 * Only counts feedback that hasn't been viewed yet (viewedAt is null or doesn't exist)
 */
export async function getNewFeedbackCount(companyId: string): Promise<number> {
  await connectDB()
  
  const company = await Company.findOne({ id: companyId }).select('_id id').lean() as any
    // Try with _id if companyId looks like ObjectId
    if (companyId && companyId.length === 24 && /^[0-9a-fA-F]{24}$/.test(companyId)) {
      const companyById = await Company.findById(companyId).select('_id id').lean() as any
      return await ProductFeedback.countDocuments({
        companyId: (companyById as any)._id,
        $or: [
          { viewedAt: { $exists: false } },
          { viewedAt: null }
        ]
      })
    }
    return 0
  }
  
  const count = await ProductFeedback.countDocuments({
    companyId: 
    company._id,
    $or: [
      { viewedAt: { $exists: false } },
      { viewedAt: null }
    ]
  })
  
  return count
}

/**
 * Mark feedback as viewed by a company admin
 * Updates all feedback for a company to mark them as viewed
 */
export async function markFeedbackAsViewed(companyId: string, adminEmail: string): Promise<void> {
  await connectDB()
  
  const company = await Company.findOne({ id: companyId }).select('_id id').lean() as any
  if (!company) {
    // Try with _id if companyId looks like ObjectId
    if (companyId && companyId.length === 24 && /^[0-9a-fA-F]{24}$/.test(companyId)) {
      const companyById = await Company.findById(companyId).select('_id id').lean() as any
      if (!companyById) {
        throw new Error(`Company not found: ${companyId}`)
      }
      
      // Mark all unread feedback for this company as viewed
      await ProductFeedback.updateMany(
        {
          companyId: (companyById as any)._id,
          $or: [
            { viewedAt: { $exists: false } },
            { viewedAt: null }
          ]
        },
        {
          $set: { viewedAt: new Date() },
          $addToSet: { viewedBy: adminEmail }
        }
      )
      return
    }
    throw new Error(`Company not found: ${companyId}`)
  }
  
  // Mark all unread feedback for this company as viewed
  await ProductFeedback.updateMany(
    {
      companyId: company._id,
      $or: [
        { viewedAt: { $exists: false } },
        { viewedAt: null }
      ]
    },
    {
      $set: { viewedAt: new Date() },
      $addToSet: { viewedBy: adminEmail }
    }
  )
}

/**
 * Get pending order approval count for a location (for Location Admin)
 */
export async function getPendingApprovalCountByLocation(locationId: string): Promise<number> {
  await connectDB()
  
  const location = await Location.findOne({ id: locationId }).select('_id id companyId').lean() as any
    return 0
  }
  
  // Get all employees in this location
  const employees = await Employee.find({ locationId: location._id }).select('_id').lean() as any
  
  if (employeeIds.length === 0) {
    return 0
  }
  
  const count = await Order.countDocuments({
    employeeId: { $in: employeeIds },
    status: 'Awaiting approval',
  })
  
  return count
}

/**
 * Get pending order count for a vendor (orders awaiting fulfilment/dispatch)
 */
export async function getPendingOrderCountByVendor(vendorId: string): Promise<number> {
  await connectDB()
  
  const vendor = await Vendor.findOne({ id: vendorId }).select('_id id').lean() as any
    return 0
  }
  
  // Count orders that are awaiting fulfilment or dispatched (vendor needs to act on)
  const count = await Order.countDocuments({
    vendorId: vendor._id,
    status: { $in: ['Awaiting fulfilment', 'Dispatched'] },
  })
  
  return count
}

/**
 * Get pending replacement order count for a vendor
 */
export async function getPendingReplacementOrderCountByVendor(vendorId: string): Promise<number> {
  await connectDB()
  
  const vendor = await Vendor.findOne({ id: vendorId }).select('_id id').lean() as any
    return 0
  }
  
  // Count replacement orders that are awaiting fulfilment or dispatched
  const count = await Order.countDocuments({
    vendorId: vendor._id,
    orderType: 'REPLACEMENT',
    status: { $in: ['Awaiting fulfilment', 'Dispatched'] },
  })
  
  return count
}

/**
 * Get new (unread) invoice count for a company admin
 * Counts invoices with status 'RAISED' (awaiting approval)
 */
export async function getNewInvoiceCount(companyId: string): Promise<number> {
  await connectDB()
  
  const company = await Company.findOne({ id: companyId }).select('_id id').lean() as any
  if (!company) {
    // Try with _id if companyId looks like ObjectId
    if (companyId && companyId.length === 24 && /^[0-9a-fA-F]{24}$/.test(companyId)) {
      const companyById = await Company.findById(companyId).select('_id id').lean() as any
      if (companyById) {
        return await Invoice.countDocuments({
          companyId: (companyById as any)._id,
          invoiceStatus: 'RAISED'
        })
      }
    }
    return 0
  }
  
  const count = await Invoice.countDocuments({
    companyId: company._id,
    invoiceStatus: 'RAISED'
  })
  
  return count
}

/**
 * Get new GRN count for a vendor
 * Counts GRN that are newly available (status 'CREATED' or 'ACKNOWLEDGED')
 */
export async function getNewGRNCount(vendorId: string): Promise<number> {
  await connectDB()
  
  // GRN uses vendorId as string (6-digit numeric), not ObjectId
  // Count GRN that are newly available (CREATED or ACKNOWLEDGED status)
  const count = await GRN.countDocuments({
    vendorId: vendorId,
    status: { $in: ['CREATED', 'ACKNOWLEDGED'] }
  })
  
  return count
}

/**
 * Get approved GRN count for a vendor
 * Counts GRN that have been approved by company admin (grnStatus = 'APPROVED')
 */
export async function getApprovedGRNCount(vendorId: string): Promise<number> {
  await connectDB()
  
  // GRN uses vendorId as string (6-digit numeric), not ObjectId
  // Count GRN that have been approved by company admin
  const count = await GRN.countDocuments({
    vendorId: vendorId,
    grnStatus: 'APPROVED'
  })
  
  return count
}

/**
 * Get approved invoice count for a vendor
 * Counts invoices that have been approved by company admin (invoiceStatus = 'APPROVED')
 */
export async function getApprovedInvoiceCount(vendorId: string): Promise<number> {
  await connectDB()
  
  // Invoice uses vendorId as string (6-digit numeric), not ObjectId
  // Count invoices that have been approved by company admin
  const count = await Invoice.countDocuments({
    vendorId: vendorId,
    invoiceStatus: 'APPROVED'
  })
  
  return count
}

// ========== RELATIONSHIP FUNCTIONS ==========

export async function getProductCompanies(): Promise<any[]> {
  await connectDB()
  
  // Use raw MongoDB collection for reliable ObjectId comparison
  const db = mongoose.connection.db
    if (!db) {
    throw new Error('Database connection not available')
  }
   if (!db) {
    throw new Error('Database connection not available')
  } return []
  
  const rawRelationships = await db.collection('productcompanies').find({}).toArray()
  
  // Get all products and companies for mapping
  const allProducts = await db.collection('uniforms').find({}).toArray()
  const allCompanies = await db.collection('companies').find({}).toArray()
  
  // Create maps for quick lookup
  const productMap = new Map()
  const companyMap = new Map()
  
  allProducts.forEach((p: any) => {
    productMap.set(p._id.toString(), p.id)
  })
  
  allCompanies.forEach((c: any) => {
    companyMap.set(c._id.toString(), c.id)
  })
  
  // Map relationships to use string IDs
  return rawRelationships.map((rel: any) => {
    const productIdStr = rel.productId?.toString()
    const companyIdStr = rel.companyId?.toString()
    
    return {
      productId: productMap.get(productIdStr) || productIdStr,
      companyId: companyMap.get(companyIdStr) || companyIdStr,
    }
  }).filter((rel: any) => rel.productId && rel.companyId)
}

export async function getProductVendors(): Promise<any[]> {
  await connectDB()
  
  // Use raw MongoDB collection for reliable ObjectId comparison
  const db = mongoose.connection.db
    if (!db) {
    throw new Error('Database connection not available')
  }
   if (!db) {
    throw new Error('Database connection not available')
  } return []
  
  const rawRelationships = await db.collection('productvendors').find({}).toArray()
  
  // Get all products and vendors for mapping
  const allProducts = await db.collection('uniforms').find({}).toArray()
  const allVendors = await db.collection('vendors').find({}).toArray()
  
  // Create maps for quick lookup
  const productMap = new Map()
  const vendorMap = new Map()
  
  allProducts.forEach((p: any) => {
    productMap.set(p._id.toString(), p.id)
  })
  
  allVendors.forEach((v: any) => {
    vendorMap.set(v._id.toString(), v.id)
  })
  
  // Map relationships to use string IDs (companyId removed from ProductVendor)
  return rawRelationships.map((rel: any) => {
    const productIdStr = rel.productId?.toString()
    const vendorIdStr = rel.vendorId?.toString()
    
    return {
      productId: productMap.get(productIdStr) || productIdStr,
      vendorId: vendorMap.get(vendorIdStr) || vendorIdStr,
    }
  }).filter((rel: any) => rel.productId && rel.vendorId)
}

export async function getVendorCompanies(): Promise<any[]> {
  // Vendor-company relationships are no longer used
  // Products are linked to companies directly, and vendors supply products
  // No explicit vendor-company relationship is needed
  return []
}

// ========== CREATE/UPDATE FUNCTIONS ==========

export async function createProductCompany(productId: string, companyId: string): Promise<void> {
  await connectDB()
  
  console.log('createProductCompany - Looking for productId:', productId, 'companyId:', companyId)
  
  const product = await Uniform.findOne({ id: productId })
  const company = await Company.findOne({ id: companyId })
  
  console.log('createProductCompany - Product found:', product ? 
    product.id : 'NOT FOUND')
  console.log('createProductCompany - Company found:', company ? 
    company.id : 'NOT FOUND')
  
  if (!product) {
    // List available product IDs for debugging
    const allProducts = await Uniform.find({}, 'id name').limit(5).lean() as any
    throw new Error(`Product not found: ${productId}`)
  }
  
  if (!company) {
    // List available company IDs for debugging
    const allCompanies = await Company.find({}, 'id name').limit(5).lean() as any
    throw new Error(`Company not found: ${companyId}`)
  }

  await ProductCompany.findOneAndUpdate(
    { productId: 
    product._id, companyId: 
    company._id },
    { productId: 
    product._id, companyId: 
    company._id },
    { upsert: true }
  )
  
  console.log('createProductCompany - Successfully created relationship')
}

export async function createProductCompanyBatch(productIds: string[], companyId: string): Promise<{ success: string[], failed: Array<{ productId: string, error: string }> }> {
  await connectDB()
  
  const company = await Company.findOne({ id: companyId })
  if (!company) {
    throw new Error(`Company not found: ${companyId}`)
  }

  const success: string[] = []
  const failed: Array<{ productId: string, error: string }> = []

  for (const productId of productIds) {
    try {
      const product = await Uniform.findOne({ id: productId })
      if (!product) {
        failed.push({ productId, error: `Product not found: ${productId}` })
        continue
      }

      await ProductCompany.findOneAndUpdate(
        { productId: product._id, companyId: 
    company._id },
        { productId: 
    product._id, companyId: 
    company._id },
        { upsert: true }
      )

      success.push(productId)
      console.log(`createProductCompanyBatch - Successfully linked product ${productId} to company ${companyId}`)
    } catch (error: any) {
      failed.push({ productId, error: error.message || 'Unknown error' })
    }
  }

  return { success, failed }
}

export async function deleteProductCompany(productId: string, companyId: string): Promise<void> {
  await connectDB()
  
  const product = await Uniform.findOne({ id: productId })
  const company = await Company.findOne({ id: companyId })
  
  if (!product) {
    console.warn(`[updateProduct] Product not found: ${productId}`);
    return null // Return null instead of throwing - let API route handle 404
  }
  if (!company) {
    throw new Error(`Company not found: ${companyId}`)
  }

  // Use raw MongoDB collection for reliable ObjectId comparison
  const db = mongoose.connection.db
    if (!db) {
    throw new Error('Database connection not available')
  }
   if (!db) {
    throw new Error('Database connection not available')
  }

  const productIdStr = product._id.toString()
  const companyIdStr = company.id

  const result = await db.collection('productcompanies').deleteOne({
    productId: 
    product._id,
    companyId: 
    company._id
  })
  
  if (result.deletedCount === 0) {
    // Try with string comparison as fallback
    const allLinks = await db.collection('productcompanies').find({}).toArray()
    const matchingLink = allLinks.find((link: any) => {
      const linkProductIdStr = link.productId?.toString()
      const linkCompanyIdStr = link.companyId?.toString()
      return linkProductIdStr === productIdStr && linkCompanyIdStr === companyIdStr
    })
    
    if (matchingLink) {
      await db.collection('productcompanies').deleteOne({ _id: matchingLink._id })
      console.log(`Successfully deleted relationship between product ${productId} and company ${companyId}`)
    } else {
      throw new Error(`No relationship found to delete between product ${productId} and company ${companyId}`)
    }
  } else {
    console.log(`Successfully deleted relationship between product ${productId} and company ${companyId}`)
  }
}

export async function createProductVendor(productId: string, vendorId: string): Promise<void> {
  await connectDB()
  
  console.log('[createProductVendor] Looking for productId:', productId, 'vendorId:', vendorId)
  
  // Try to find product by id field first, then fallback to _id if productId looks like ObjectId
  let product = await Uniform.findOne({ id: productId })
  if (!product && mongoose.Types.ObjectId.isValid(productId)) {
    // Fallback: try finding by _id if productId is a valid ObjectId
    product = await Uniform.findById(productId)
    if (product) {
      console.log('[createProductVendor] Found product by _id, using product.id:', product.id)
    }
  }
  
  const vendor = await Vendor.findOne({ id: vendorId })
  
  console.log('[createProductVendor] Product found:', product ? 
    product.id : 'NOT FOUND')
  console.log('[createProductVendor] Vendor found:', vendor ? 
    vendor.id : 'NOT FOUND')
  
  if (!product) {
    // List available product IDs for debugging
    const allProducts = await Uniform.find({}, 'id name').limit(5).lean() as any
    throw new Error(`Product not found: ${productId}`)
  }
  
  if (!vendor) {
    // List available vendor IDs for debugging
    const allVendors = await Vendor.find({}, 'id name').limit(5).lean() as any
    throw new Error(`Vendor not found: ${vendorId}`)
  }

  // Validate: Product can only be linked to ONE vendor
  const db = mongoose.connection.db
    if (!db) {
    throw new Error('Database connection not available')
  }
   if (!db) {
    throw new Error('Database connection not available')
  }

  const existingLinks = await db.collection('productvendors').find({ productId: 
    product._id }).toArray()
  if (existingLinks.length > 0) {
    const existingVendorIdStr = existingLinks[0].vendorId?.toString()
    const newVendorIdStr = vendor._id.toString()
    
    if (existingVendorIdStr !== newVendorIdStr) {
      const existingVendor = await Vendor.findById(existingLinks[0].vendorId)
      throw new Error(`Product "${product.name || productId}" is already linked to vendor "${existingVendor?.name || existingVendorIdStr}". A product can only be linked to one vendor.`)
    }
  }

  // Create ProductVendor relationship (without transaction for standalone MongoDB)
  try {
    await ProductVendor.findOneAndUpdate(
      { productId: 
    product._id, vendorId: 
    vendor._id },
      { productId: 
    product._id, vendorId: 
    vendor._id },
      { upsert: true }
    )
    
    console.log('[createProductVendor] ✅ Successfully created ProductVendor relationship')
    
    // Auto-create VendorInventory record with all sizes initialized
    // Note: Without transactions, if inventory creation fails, the ProductVendor link will still exist
    // This is acceptable as inventory can be created separately if needed
    try {
      await ensureVendorInventoryExists(vendor._id, product._id)
      console.log('[createProductVendor] ✅ VendorInventory initialized')
    } catch (inventoryError: any) {
      // Log but don't fail the entire operation if inventory creation fails
      console.warn('[createProductVendor] ⚠️ ProductVendor link created, but inventory initialization failed:', inventoryError.message)
      console.warn('[createProductVendor] ⚠️ Inventory can be created separately if needed')
    }
    
    console.log('[createProductVendor] ✅ Product-Vendor link created successfully')
  } catch (error: any) {
    console.error('[createProductVendor] ❌ Error creating ProductVendor relationship:', {
      vendorId: 
    vendor.id,
      productId: 
    product.id,
      error: error.message,
    })
    throw error
  }
}

export async function createProductVendorBatch(productIds: string[], vendorId: string): Promise<{ success: string[], failed: Array<{ productId: string, error: string }> }> {
  await connectDB()
  
  const vendor = await Vendor.findOne({ id: vendorId })
  if (!vendor) {
    console.warn(`[updateVendor] Vendor not found: ${vendorId}`);
    return null // Return null instead of throwing - let API route handle 404
  }

  const db = mongoose.connection.db
    if (!db) {
    throw new Error('Database connection not available')
  }
   if (!db) {
    throw new Error('Database connection not available')
  }

  const success: string[] = []
  const failed: Array<{ productId: string, error: string }> = []

  for (const productId of productIds) {
    try {
      // Try to find product by id field first, then fallback to _id if productId looks like ObjectId
      let product = await Uniform.findOne({ id: productId })
      if (!product && mongoose.Types.ObjectId.isValid(productId)) {
        // Fallback: try finding by _id if productId is a valid ObjectId
        product = await Uniform.findById(productId)
        if (product) {
          console.log(`[createProductVendorBatch] Found product ${productId} by _id, using product.id: ${product.id}`)
        }
      }
      
      if (!product) {
        failed.push({ productId, error: `Product not found: ${productId}` })
        continue
      }

      // Validate: Product can only be linked to ONE vendor
      const existingLinks = await db.collection('productvendors').find({ productId: 
    product._id }).toArray()
      if (existingLinks.length > 0) {
        const existingVendorIdStr = existingLinks[0].vendorId?.toString()
        const newVendorIdStr = vendor._id.toString()
        
        if (existingVendorIdStr !== newVendorIdStr) {
          const existingVendor = await Vendor.findById(existingLinks[0].vendorId)
          failed.push({ 
            productId, 
            error: `Already linked to vendor "${existingVendor?.name || existingVendorIdStr}". A product can only be linked to one vendor.` 
          })
          continue
        }
      }

      // Create ProductVendor relationship (without transaction for standalone MongoDB)
      try {
        // Create ProductVendor relationship
        await ProductVendor.findOneAndUpdate(
          { productId: 
    product._id, vendorId: 
    vendor._id },
          { productId: 
    product._id, vendorId: 
    vendor._id },
          { upsert: true }
        )

        // Auto-create VendorInventory record with all sizes initialized
        // Note: Without transactions, if inventory creation fails, the ProductVendor link will still exist
        // This is acceptable as inventory can be created separately if needed
        try {
          await ensureVendorInventoryExists(vendor._id, product._id)
          console.log(`[createProductVendorBatch] ✅ Inventory initialized for product ${productId}`)
        } catch (inventoryError: any) {
          // Log but don't fail the entire operation if inventory creation fails
          console.warn(`[createProductVendorBatch] ⚠️ ProductVendor link created for ${productId}, but inventory initialization failed:`, inventoryError.message)
        }
        
        success.push(productId)
        console.log(`[createProductVendorBatch] ✅ Successfully linked product ${productId} to vendor ${vendorId}`)
      } catch (error: any) {
        console.error(`[createProductVendorBatch] ❌ Error linking product ${productId}:`, error.message)
        failed.push({ productId, error: error.message || 'Unknown error' })
      }
    } catch (error: any) {
      failed.push({ productId, error: error.message || 'Unknown error' })
    }
  }

  return { success, failed }
}

export async function deleteProductVendor(productId: string, vendorId: string): Promise<void> {
  await connectDB()
  
  const product = await Uniform.findOne({ id: productId })
  const vendor = await Vendor.findOne({ id: vendorId })
  
  if (!product) {
    console.warn(`[updateProduct] Product not found: ${productId}`);
    return null // Return null instead of throwing - let API route handle 404
  }
  if (!vendor) {
    console.warn(`[updateVendor] Vendor not found: ${vendorId}`);
    return null // Return null instead of throwing - let API route handle 404
  }

  // Use raw MongoDB collection for reliable ObjectId comparison
  const db = mongoose.connection.db
    if (!db) {
    throw new Error('Database connection not available')
  }
   if (!db) {
    throw new Error('Database connection not available')
  }

  const productIdStr = product._id.toString()
  const vendorIdStr = vendor._id.toString()

  const result = await db.collection('productvendors').deleteOne({
    productId: 
    product._id,
    vendorId: 
    vendor._id
  })
  
  if (result.deletedCount === 0) {
    // Try with string comparison as fallback
    const allLinks = await db.collection('productvendors').find({}).toArray()
    const matchingLink = allLinks.find((link: any) => {
      const linkProductIdStr = link.productId?.toString()
      const linkVendorIdStr = link.vendorId?.toString()
      return linkProductIdStr === productIdStr && linkVendorIdStr === vendorIdStr
    })
    
    if (matchingLink) {
      await db.collection('productvendors').deleteOne({ _id: matchingLink._id })
      console.log(`Successfully deleted relationship between product ${productId} and vendor ${vendorId}`)
  } else {
      throw new Error(`No relationship found to delete between product ${productId} and vendor ${vendorId}`)
    }
  } else {
    console.log(`Successfully deleted relationship between product ${productId} and vendor ${vendorId}`)
  }
}

export async function createVendorCompany(vendorId: string, companyId: string): Promise<void> {
  // Vendor-company relationships are now automatically derived from ProductCompany + ProductVendor
  // This function is kept for backward compatibility but does nothing
  // To create a vendor-company relationship, create ProductCompany and ProductVendor links instead
  console.log(`createVendorCompany: Vendor-company relationships are now derived from ProductCompany + ProductVendor relationships.`)
  console.log(`  To link vendor ${vendorId} to company ${companyId}, ensure there's at least one product that:`)
  console.log(`  1. Is linked to company ${companyId} (via ProductCompany)`)
  console.log(`  2. Is supplied by vendor ${vendorId} (via ProductVendor)`)
}

export async function deleteVendorCompany(vendorId: string, companyId: string): Promise<void> {
  // Vendor-company relationships are now automatically derived from ProductCompany + ProductVendor
  // This function is kept for backward compatibility but does nothing
  // To remove a vendor-company relationship, delete the ProductCompany or ProductVendor links that create it
  console.log(`deleteVendorCompany: Vendor-company relationships are now derived from ProductCompany + ProductVendor relationships.`)
  console.log(`  To unlink vendor ${vendorId} from company ${companyId}, delete ProductCompany or ProductVendor links that connect them.`)
}

// ========== VENDOR INVENTORY FUNCTIONS ==========

/**
 * Get low stock items for a vendor (items where stock <= threshold)
 */
export async function getLowStockItems(vendorId: string): Promise<any[]> {
  await connectDB()
  
  console.log(`[getLowStockItems] ========================================`)
  console.log(`[getLowStockItems] 🚀 FETCHING LOW STOCK ITEMS FOR VENDOR: ${vendorId}`)
  
  const vendor = await Vendor.findOne({ id: vendorId })
  if (!vendor) {
    console.log(`[getLowStockItems] ❌ Vendor not found: ${vendorId}`)
    return []
  }

  // CRITICAL FIX: Filter by ProductVendor relationships
  // A vendor should ONLY see low stock items for products assigned to them
  const db = mongoose.connection.db
    if (!db) {
    throw new Error('Database connection not available')
  }
   if (!db) {
    console.error('[getLowStockItems] Database connection not available')
    return []
  }
  
  const vendorObjectId = vendor._id instanceof mongoose.Types.ObjectId 
    ? 
    vendor._id 
    : new mongoose.Types.ObjectId(
    vendor._id.toString())
  
  // Get ProductVendor relationships for this vendor
  console.log(`[getLowStockItems] 🔍 Querying ProductVendor relationships...`)
  const productVendorLinks = await db.collection('productvendors').find({
    vendorId: vendorObjectId
  }).toArray()
  
  console.log(`[getLowStockItems] ✅ Found ${productVendorLinks.length} ProductVendor relationship(s)`)
  
  if (productVendorLinks.length === 0) {
    console.log(`[getLowStockItems] ⚠️ No ProductVendor relationships - vendor has no assigned products`)
    return []
  }
  
  // Extract assigned product IDs
  const assignedProductIds = productVendorLinks
    .map((link: any) => {
      if (!link.productId) return null
      if (link.productId instanceof mongoose.Types.ObjectId) {
        return link.productId
      }
      if (mongoose.Types.ObjectId.isValid(link.productId)) {
        return new mongoose.Types.ObjectId(link.productId)
      }
      return null
    })
    .filter((id: any) => id !== null) as mongoose.Types.ObjectId[]
  
  console.log(`[getLowStockItems] ✅ Extracted ${assignedProductIds.length} assigned product ID(s)`)
  
  // CRITICAL: Only query inventory for assigned products
  const inventoryRecords = await VendorInventory.find({ 
    vendorId: 
    vendor._id,
    productId: { $in: assignedProductIds } // CRITICAL: Only inventory for assigned products
  })
    .populate('productId', 'id name category gender sizes price sku')
    .populate('vendorId', 'id name')
    .lean() as any
  

  const lowStockItems: any[] = []

  for (const inv of inventoryRecords) {
    const sizeInventory = inv.sizeInventory instanceof Map
      ? Object.fromEntries(inv.sizeInventory)
      : inv.sizeInventory || {}
    
    const lowInventoryThreshold = inv.lowInventoryThreshold instanceof Map
      ? Object.fromEntries(inv.lowInventoryThreshold)
      : inv.lowInventoryThreshold || {}

    // Check each size for low stock
    const lowStockSizes: { [size: string]: { stock: number, threshold: number } } = {}
    for (const [size, stock] of Object.entries(sizeInventory)) {
      const threshold = lowInventoryThreshold[size] || 0
      if (threshold > 0 && stock <= threshold) {
        lowStockSizes[size] = { stock, threshold }
      }
    }

    if (Object.keys(lowStockSizes).length > 0) {
      lowStockItems.push({
        id: inv.id,
        vendorId: inv.vendorId?.id || inv.vendorId?.toString(),
        vendorName: inv.vendorId?.name,
        productId: inv.productId?.id || inv.productId?.toString(),
        productName: inv.productId?.name,
        productCategory: inv.productId?.category,
        productGender: inv.productId?.gender,
        productSku: inv.productId?.sku,
        sizeInventory,
        lowInventoryThreshold,
        lowStockSizes,
        totalStock: inv.totalStock || 0,
      })
    }
  }

  return lowStockItems
}

/**
 * Get vendor inventory summary (total products, total stock, low stock count)
 */
export async function getVendorInventorySummary(vendorId: string): Promise<{
  totalProducts: number
  totalStock: number
  lowStockCount: number
}> {
  await connectDB()
  
  const vendor = await Vendor.findOne({ id: vendorId })
  if (!vendor) {
    return { totalProducts: 0, totalStock: 0, lowStockCount: 0 }
  }

  const inventoryRecords = await VendorInventory.find({ vendorId: vendor._id }).lean() as any
  
  let totalStock = 0
  let lowStockCount = 0

  for (const inv of inventoryRecords) {
    const sizeInventory = inv.sizeInventory instanceof Map
      ? Object.fromEntries(inv.sizeInventory)
      : inv.sizeInventory || {}
    
    const lowInventoryThreshold = inv.lowInventoryThreshold instanceof Map
      ? Object.fromEntries(inv.lowInventoryThreshold)
      : inv.lowInventoryThreshold || {}

    totalStock += inv.totalStock || 0

    // Check if any size is low stock
    let isLowStock = false
    for (const [size, stock] of Object.entries(sizeInventory)) {
      const threshold = lowInventoryThreshold[size] || 0
      if (threshold > 0 && stock <= threshold) {
        isLowStock = true
        break
      }
    }
    if (isLowStock) {
      lowStockCount++
    }
  }

  return {
    totalProducts: inventoryRecords.length,
    totalStock,
    lowStockCount,
  }
}

export async function getVendorInventory(vendorId: string, productId?: string): Promise<any[]> {
  await connectDB()
  
  console.log(`[getVendorInventory] ========================================`)
  console.log(`[getVendorInventory] 🚀 FETCHING INVENTORY FOR VENDOR: ${vendorId}`)
  
  const vendor = await Vendor.findOne({ id: vendorId })
  if (!vendor) {
    console.log(`[getVendorInventory] ❌ Vendor not found for id: ${vendorId}`)
    return []
  }

  // CRITICAL FIX: Ensure vendor._id is converted to ObjectId for query
  // MongoDB requires exact type matching - inventory stores ObjectId, so query must use ObjectId
  const vendorObjectId = vendor._id instanceof mongoose.Types.ObjectId 
    ? 
    vendor._id 
    : new mongoose.Types.ObjectId(
    vendor._id.toString())
  
  console.log(`[getVendorInventory] ✅ Vendor found: ${vendor.name} (id: ${vendor.id}, _id: ${vendorObjectId.toString()})`)

  // CRITICAL FIX: Filter inventory by ProductVendor relationships
  // A vendor should ONLY see inventory for products assigned to them via ProductVendor relationships
  // This is the SINGLE SOURCE OF TRUTH for vendor-product access control
  const db = mongoose.connection.db
    if (!db) {
    throw new Error('Database connection not available')
  }
   if (!db) {
    console.error('[getVendorInventory] Database connection not available')
    return []
  }
  
  // STEP 1: Get ProductVendor relationships for this vendor
  console.log(`[getVendorInventory] 🔍 Step 1: Querying ProductVendor relationships...`)
  const productVendorLinks = await db.collection('productvendors').find({
    vendorId: vendorObjectId
  }).toArray()
  
  console.log(`[getVendorInventory] ✅ Found ${productVendorLinks.length} ProductVendor relationship(s)`)
  
  if (productVendorLinks.length === 0) {
    console.log(`[getVendorInventory] ⚠️ No ProductVendor relationships found - vendor has no assigned products`)
    console.log(`[getVendorInventory] ⚠️ Returning empty inventory (vendor must have products assigned by Super Admin)`)
    return []
  }
  
  // Extract product IDs from ProductVendor relationships
  const assignedProductIds = productVendorLinks
    .map((link: any) => {
      if (!link.productId) return null
      if (link.productId instanceof mongoose.Types.ObjectId) {
        return link.productId
      }
      if (mongoose.Types.ObjectId.isValid(link.productId)) {
        return new mongoose.Types.ObjectId(link.productId)
      }
      return null
    })
    .filter((id: any) => id !== null) as mongoose.Types.ObjectId[]
  
  console.log(`[getVendorInventory] ✅ Extracted ${assignedProductIds.length} assigned product ID(s)`)
  
  if (assignedProductIds.length === 0) {
    console.log(`[getVendorInventory] ⚠️ No valid product IDs extracted from ProductVendor relationships`)
    return []
  }
  
  // STEP 2: Build query - filter by vendorId AND productId in assigned products
  // CRITICAL: If specific productId requested, verify it's assigned to vendor
  if (productId) {
    const product = await Uniform.findOne({ id: productId })
    if (product) {
      const productObjectId = product._id instanceof mongoose.Types.ObjectId
        ? product._id
        : new mongoose.Types.ObjectId(product._id.toString())
      
      // CRITICAL: Verify product is assigned to vendor via ProductVendor relationship
      const isAssigned = assignedProductIds.some(id => id.toString() === productObjectId.toString())
      if (!isAssigned) {
        console.log(`[getVendorInventory] ⚠️ Product ${productId} is not assigned to vendor ${vendorId} via ProductVendor relationship`)
        console.log(`[getVendorInventory] ⚠️ Returning empty result (access control enforcement)`)
        return []
      }
      
      console.log(`[getVendorInventory] ✅ Product ${productId} is assigned to vendor - proceeding with query`)
    } else {
      console.log(`[getVendorInventory] ❌ Product not found for id: ${productId}`)
      return []
    }
  }
  
  // Build query with ProductVendor filter
  const query: any = { 
    vendorId: vendorObjectId,
    productId: { $in: assignedProductIds } // CRITICAL: Only inventory for assigned products
  }
  
  // If specific productId requested and verified, use exact match
  if (productId) {
    const product = await Uniform.findOne({ id: productId })
    if (product) {
      const productObjectId = product._id instanceof mongoose.Types.ObjectId
        ? product._id
        : new mongoose.Types.ObjectId(product._id.toString())
      query.productId = productObjectId // Use exact match for specific product
      console.log(`[getVendorInventory] 🔍 Filtering by specific product: ${product.name} (id: ${product.id}, _id: ${productObjectId.toString()})`)
    }
  }

  // CRITICAL FIX: Get raw inventory records FIRST to preserve ObjectIds
  // This ensures we always have the productId ObjectId even if populate fails
  // Note: db is already declared earlier in the function, so we reuse it here
  if (!db) {
    console.error('[getVendorInventory] Database connection not available')
    return []
  }
  
  // CRITICAL FIX: Ensure raw MongoDB query uses ObjectId (not string)
  // MongoDB requires exact type matching - must use ObjectId instances
  // CRITICAL: Filter by assigned product IDs from ProductVendor relationships
  const rawQuery: any = {
    vendorId: vendorObjectId instanceof mongoose.Types.ObjectId
      ? vendorObjectId
      : new mongoose.Types.ObjectId(vendorObjectId.toString()),
    productId: query.productId instanceof mongoose.Types.ObjectId
      ? query.productId
      : (query.productId && typeof query.productId === 'object' && '$in' in query.productId
          ? query.productId // Already has $in operator from assignedProductIds
          : { $in: assignedProductIds }) // Use assigned products filter
  }
  
  console.log(`[getVendorInventory] 🔍 Raw MongoDB query:`, {
    vendorId: rawQuery.vendorId.toString(),
    vendorIdType: rawQuery.vendorId.constructor.name,
    productId: rawQuery.productId ? rawQuery.productId.toString() : 'none'
  })
  
  const rawInventoryRecords = await db.collection('vendorinventories').find(rawQuery).toArray()
  console.log(`[getVendorInventory] ✅ Found ${rawInventoryRecords.length} raw inventory records`)
  
  // Create a map of inventory ID -> raw productId ObjectId for fallback
  const rawProductIdMap = new Map<string, any>()
  rawInventoryRecords.forEach((raw: any) => {
    if (raw.productId && raw.id) {
      rawProductIdMap.set(raw.id, raw.productId)
    }
  })
  
  // Now get populated records for product data
  // CRITICAL FIX: Use ObjectId query for Mongoose model (same as raw query)
  // CRITICAL: Filter by assigned product IDs from ProductVendor relationships
  const mongooseQuery: any = {
    vendorId: vendorObjectId,
    productId: query.productId // Use the same query.productId (already filtered by assigned products)
  }
  
  console.log(`[getVendorInventory] 🔍 Mongoose query:`, {
    vendorId: mongooseQuery.vendorId.toString(),
    vendorIdType: mongooseQuery.vendorId.constructor.name,
    productId: mongooseQuery.productId ? mongooseQuery.productId.toString() : 'none'
  })
  
  const inventoryRecords = await VendorInventory.find(mongooseQuery)
    .populate('productId', 'id name category gender sizes price sku')
    .populate('vendorId', 'id name')
    .lean() as any

  console.log(`[getVendorInventory] ✅ Found ${rawInventoryRecords.length} raw inventory records from DB`)

  // CRITICAL FIX: If Mongoose query returned 0 but raw query found records, use raw records
  // This handles cases where Mongoose query fails but data exists in DB
  if (inventoryRecords.length === 0 && rawInventoryRecords.length > 0) {
    console.warn(`[getVendorInventory] ⚠️ Mongoose query returned 0 records but raw query found ${rawInventoryRecords.length} records`)
    console.warn(`[getVendorInventory] ⚠️ This indicates a query mismatch. Using raw records as fallback.`)
    
    // Build inventory records from raw data
    // We'll process rawInventoryRecords directly instead of inventoryRecords
    const rawBasedRecords: any[] = rawInventoryRecords.map((raw: any) => ({
      _id: raw._id,
      id: raw.id,
      vendorId: raw.vendorId,
      productId: raw.productId,
      sizeInventory: raw.sizeInventory,
      lowInventoryThreshold: raw.lowInventoryThreshold,
      totalStock: raw.totalStock,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    }))
    
    // Replace inventoryRecords with raw-based records for processing
    // Clear and repopulate the array
    while (inventoryRecords.length > 0) {
      inventoryRecords.pop()
    }
    rawBasedRecords.forEach(record => inventoryRecords.push(record as any))
    console.log(`[getVendorInventory] ✅ Replaced inventoryRecords with ${inventoryRecords.length} raw-based records`)
  }

  // 🔍 LOG: Check populate results and raw data
  console.log(`[getVendorInventory] Processing ${inventoryRecords.length} inventory records`)
  
  // DIAGNOSTIC: Check raw productId values in database AND after lean()
  // Note: db is already declared earlier in the function, so we reuse it here
  if (inventoryRecords.length > 0) {
    if (db) {
      const rawInventory = await db.collection('vendorinventories').find(rawQuery).toArray()
      console.log(`[getVendorInventory] 🔍 DIAGNOSTIC: Raw inventory records from DB:`)
      rawInventory.slice(0, 3).forEach((raw: any, idx: number) => {
        console.log(`[getVendorInventory]   Raw[${idx}]:`, {
          id: raw.id,
          productId: raw.productId,
          productIdType: typeof raw.productId,
          productIdIsNull: raw.productId === null,
          productIdIsUndefined: raw.productId === undefined,
          productIdIsEmpty: raw.productId === '',
          productIdString: raw.productId?.toString ? raw.productId.toString() : String(raw.productId)
        })
      })
      
      // Also check what we got after lean() - this is CRITICAL for debugging
      console.log(`[getVendorInventory] 🔍 DIAGNOSTIC: Inventory records after lean():`)
      inventoryRecords.slice(0, 3).forEach((inv: any, idx: number) => {
        const pid = inv.productId
        console.log(`[getVendorInventory]   Lean[${idx}]:`, {
          id: inv.id,
          productId: pid,
          productIdType: typeof pid,
          productIdIsNull: pid === null,
          productIdIsUndefined: pid === undefined,
          productIdIsEmpty: pid === '',
          productIdConstructor: pid?.constructor?.name,
          productIdKeys: pid && typeof pid === 'object' ? Object.keys(pid) : null,
          productIdHasId: pid?.id !== undefined,
          productIdHas_id: pid?._id !== undefined,
          productIdIdValue: pid?.id,
          productId_idValue: pid?._id?.toString ? pid._id.toString() : pid?._id,
          productIdString: pid?.toString ? pid.toString() : (pid ? String(pid) : 'N/A'),
          productIdJSON: pid ? JSON.stringify(pid, (key, value) => {
            if (value && typeof value === 'object' && value.constructor && value.constructor.name === 'ObjectId') {
              return value.toString()
            }
            return value
          }) : 'null'
        })
      })
    }
  }
  
  // CRITICAL FIX: Handle populate failures by querying products directly
  // Collect ObjectIds that failed to populate
  const failedPopulates: mongoose.Types.ObjectId[] = []
  const productIdMap = new Map<string, any>() // Map ObjectId string -> product data
  let orphanedObjectIdStrings = new Set<string>() // Track ObjectIds of products that don't exist
  
  for (const inv of inventoryRecords) {
    // After .lean(), ObjectIds become plain objects, not Mongoose ObjectId instances
    // Check if productId is a populated object (has .id field) or a plain ObjectId object
    if (inv.productId && typeof inv.productId === 'object') {
      if (inv.productId.id) {
        // Populate succeeded - productId is an object with .id field
        productIdMap.set(inv.productId._id?.toString() || '', inv.productId)
        console.log(`[getVendorInventory] ✅ Populate succeeded for inventory ${inv.id}, productId: ${inv.productId.id}`)
      } else {
        // Populate failed - productId is a plain ObjectId object (after .lean())
        // Extract ObjectId string for lookup - try multiple methods
        let objectIdStr = ''
        if (inv.productId._id) {
          objectIdStr = inv.productId._id.toString ? inv.productId._id.toString() : String(inv.productId._id)
        } else if (inv.productId.toString) {
          objectIdStr = inv.productId.toString()
        } else {
          objectIdStr = String(inv.productId)
        }
        
        if (objectIdStr && mongoose.Types.ObjectId.isValid(objectIdStr)) {
          failedPopulates.push(new mongoose.Types.ObjectId(objectIdStr))
          console.log(`[getVendorInventory] 🔍 Populate failed for inventory ${inv.id}, will query by ObjectId: ${objectIdStr}`)
        } else {
          console.warn(`[getVendorInventory] ⚠️ Invalid ObjectId format for inventory ${inv.id}: ${objectIdStr}, productId:`, inv.productId)
        }
      }
    } else if (inv.productId instanceof mongoose.Types.ObjectId) {
      // Still a Mongoose ObjectId (shouldn't happen after .lean(), but handle it)
      failedPopulates.push(inv.productId)
      console.log(`[getVendorInventory] 🔍 Populate failed for inventory ${inv.id}, will query by ObjectId: ${inv.productId.toString()}`)
    } else if (inv.productId === null || inv.productId === undefined) {
      // Populate failed - productId is null, but check if we have raw productId
      const rawProductId = rawProductIdMap.get(inv.id)
      if (rawProductId) {
        // We have raw productId - use it to query
        const objectIdStr = rawProductId.toString ? rawProductId.toString() : String(rawProductId)
        if (objectIdStr && mongoose.Types.ObjectId.isValid(objectIdStr)) {
          failedPopulates.push(new mongoose.Types.ObjectId(objectIdStr))
          console.log(`[getVendorInventory] 🔍 Populate failed (null) for inventory ${inv.id}, using raw productId ObjectId: ${objectIdStr}`)
        } else {
          console.warn(`[getVendorInventory] ⚠️ Invalid raw productId ObjectId for inventory ${inv.id}: ${objectIdStr}`)
        }
      } else {
        // Truly null/undefined - data integrity issue (will be filtered out)
        console.error(`[getVendorInventory] ❌ Inventory ${inv.id} has null/undefined productId after populate and no raw productId - will be filtered out`)
      }
    } else {
      // Unexpected type
      console.warn(`[getVendorInventory] ⚠️ Unexpected productId type for inventory ${inv.id}:`, typeof inv.productId, inv.productId)
    }
  }
  
  // Query products that failed to populate
  if (failedPopulates.length > 0) {
    console.warn(`[getVendorInventory] ⚠️ ${failedPopulates.length} products failed to populate. Querying directly...`)
    
    const products = await Uniform.find({
      _id: { $in: failedPopulates }
    })
      .select('id name category gender sizes price sku')
      .lean() as any
    
    
    // Add to map
    products.forEach((p: any) => {
      productIdMap.set(p._id.toString(), {
        id: p.id,
        name: p.name,
        category: p.category,
        gender: p.gender,
        sizes: p.sizes || [],
        price: p.price,
        sku: p.sku,
        _id: p._id
      })
    })
    
    // Track orphaned inventory records (products that don't exist)
    if (products.length < failedPopulates.length) {
      const foundIds = new Set(products.map((p: any) => p._id.toString()))
      const orphanedObjectIds = failedPopulates.filter(oid => !foundIds.has(oid.toString()))
      console.error(`[getVendorInventory] ❌ ${orphanedObjectIds.length} orphaned inventory records (products don't exist): ${orphanedObjectIds.map(oid => oid.toString()).join(', ')}`)
      
      // Store orphaned ObjectIds to filter out their inventory records later
      orphanedObjectIdStrings = new Set(orphanedObjectIds.map(oid => oid.toString()))
    }
  }

  // CRITICAL: Filter using raw inventory records to check for actual null/empty productIds
  // After .lean(), if populate fails, productId might be null even though raw DB has ObjectId
  // So we check the raw records to determine validity
  let validInventoryRecords = inventoryRecords.filter((inv: any) => {
    // Check raw record first (most reliable)
    const rawProductId = rawProductIdMap.get(inv.id)
    if (!rawProductId || rawProductId === null || rawProductId === undefined) {
      console.warn(`[getVendorInventory] ⚠️ Skipping inventory record ${inv.id} - raw productId is null/undefined (data integrity issue)`)
      return false
    }
    
    // Also check populated record (might be null if populate failed, but that's okay - we have raw)
    if (inv.productId === null || inv.productId === undefined) {
      // This is okay if we have raw productId - populate just failed
      console.log(`[getVendorInventory] ℹ️ Inventory ${inv.id} has null productId after populate, but raw productId exists: ${rawProductId.toString()}`)
      return true // Keep it - we'll use raw productId
    }
    
    // Check if it's an empty string (shouldn't happen, but be safe)
    if (typeof inv.productId === 'string' && inv.productId.trim() === '') {
      // Check if raw has valid productId
      if (rawProductId) {
        return true // Keep it - we'll use raw productId
      }
      console.warn(`[getVendorInventory] ⚠️ Skipping inventory record ${inv.id} - productId is empty string (data integrity issue)`)
      return false
    }
    
    // Everything else is valid - keep them
    return true
  })
  
  // Filter out orphaned inventory records (products that don't exist)
  if (orphanedObjectIdStrings.size > 0) {
    const beforeCount = validInventoryRecords.length
    validInventoryRecords = validInventoryRecords.filter((inv: any) => {
      const rawProductId = rawProductIdMap.get(inv.id)
      if (rawProductId) {
        const objectIdStr = rawProductId.toString ? rawProductId.toString() : String(rawProductId)
        if (orphanedObjectIdStrings.has(objectIdStr)) {
          console.warn(`[getVendorInventory] ⚠️ Filtering out inventory ${inv.id} - product ${objectIdStr} does not exist`)
          return false
        }
      }
      return true
    })
    console.log(`[getVendorInventory] Filtered out ${beforeCount - validInventoryRecords.length} orphaned inventory records`)
  }
  
  // CRITICAL FIX: Final validation - ensure all inventory records are for assigned products
  // This is a double-check to prevent any inventory from unassigned products from leaking through
  const assignedProductIdStrings = new Set(assignedProductIds.map(id => id.toString()))
  const beforeFinalCount = validInventoryRecords.length
  validInventoryRecords = validInventoryRecords.filter((inv: any) => {
    const rawProductId = rawProductIdMap.get(inv.id)
    if (rawProductId) {
      const productIdStr = rawProductId.toString ? rawProductId.toString() : String(rawProductId)
      const isAssigned = assignedProductIdStrings.has(productIdStr)
      if (!isAssigned) {
        console.error(`[getVendorInventory] ❌ SECURITY: Filtering out inventory ${inv.id} - product ${productIdStr} is NOT assigned to vendor via ProductVendor relationship`)
        return false
      }
    }
    return true
  })
  
  if (beforeFinalCount > validInventoryRecords.length) {
    console.error(`[getVendorInventory] ❌ SECURITY VIOLATION: Removed ${beforeFinalCount - validInventoryRecords.length} inventory records for unassigned products`)
  }
  
  console.log(`[getVendorInventory] ✅ Final inventory count: ${validInventoryRecords.length} (filtered from ${inventoryRecords.length} total records)`)
  console.log(`[getVendorInventory] ✅ All inventory records validated against ProductVendor relationships`)
  console.log(`[getVendorInventory] ========================================`)
  
  return validInventoryRecords.map((inv: any) => {
    const sizeInventory = inv.sizeInventory instanceof Map
      ? Object.fromEntries(inv.sizeInventory)
      : inv.sizeInventory || {}
    
    const lowInventoryThreshold = inv.lowInventoryThreshold instanceof Map
      ? Object.fromEntries(inv.lowInventoryThreshold)
      : inv.lowInventoryThreshold || {}
    
    // Get product data (from populate or direct query)
    let productData: any = null
    
    // CRITICAL: After .lean(), ObjectIds are plain objects, not Mongoose ObjectId instances
    // Check if productId is a populated object (has .id field) or a plain ObjectId object/string
    if (inv.productId && typeof inv.productId === 'object' && inv.productId.id) {
      // Populate succeeded - productId is an object with .id field
      productData = inv.productId
      console.log(`[getVendorInventory] ✅ Populate succeeded for inventory ${inv.id}, productId: ${productData.id}`)
    } else if (inv.productId) {
      // Populate failed or productId is still an ObjectId (plain object after .lean())
      // Extract ObjectId string for lookup
      let productObjectIdStr: string = ''
      
      if (inv.productId instanceof mongoose.Types.ObjectId) {
        // Still a Mongoose ObjectId (shouldn't happen after .lean(), but handle it)
        productObjectIdStr = inv.productId.toString()
      } else if (typeof inv.productId === 'object' && inv.productId._id) {
        // Plain object with _id field
        productObjectIdStr = inv.productId._id.toString ? inv.productId._id.toString() : String(inv.productId._id)
      } else if (typeof inv.productId === 'object' && inv.productId.toString) {
        // Plain object with toString method
        productObjectIdStr = inv.productId.toString()
      } else if (typeof inv.productId === 'string') {
        // Already a string (ObjectId string)
        productObjectIdStr = inv.productId
      } else {
        // Try to convert to string
        productObjectIdStr = String(inv.productId)
      }
      
      console.log(`[getVendorInventory] 🔍 Looking up product for inventory ${inv.id}, productObjectId: ${productObjectIdStr}`)
      productData = productIdMap.get(productObjectIdStr) || null
      
      // Note: We can't do async queries inside map, so if product is not in map,
      // we'll use the ObjectId string as fallback in finalProductId extraction below
      if (!productData && productObjectIdStr) {
        console.warn(`[getVendorInventory] ⚠️ Product not found in map for ObjectId: ${productObjectIdStr}. Will use ObjectId as fallback.`)
      }
    } else {
      // inv.productId is null/undefined - use raw productId from rawProductIdMap
      const rawProductId = rawProductIdMap.get(inv.id)
      if (rawProductId) {
        const objectIdStr = rawProductId.toString ? rawProductId.toString() : String(rawProductId)
        console.log(`[getVendorInventory] 🔍 Looking up product for inventory ${inv.id} using raw productId: ${objectIdStr}`)
        
        // 🔍 DIAGNOSTIC: Log the lookup attempt
        console.log(`[getVendorInventory] 🔍 DIAGNOSTIC: Lookup details:`)
        console.log(`[getVendorInventory]   - Lookup key: "${objectIdStr}" (type: ${typeof objectIdStr}, length: ${objectIdStr.length})`)
        console.log(`[getVendorInventory]   - productIdMap.size: ${productIdMap.size}`)
        console.log(`[getVendorInventory]   - productIdMap.has("${objectIdStr}"): ${productIdMap.has(objectIdStr)}`)
        
        // Try exact match first
        productData = productIdMap.get(objectIdStr) || null
        
        // 🔍 DIAGNOSTIC: If not found, try variations
        if (!productData) {
          console.log(`[getVendorInventory] 🔍 DIAGNOSTIC: Exact match failed, trying variations...`)
          // Try with ObjectId wrapper
          if (mongoose.Types.ObjectId.isValid(objectIdStr)) {
            const oid = new mongoose.Types.ObjectId(objectIdStr)
            const oidStr = oid.toString()
            console.log(`[getVendorInventory]   - Trying ObjectId.toString(): "${oidStr}"`)
            productData = productIdMap.get(oidStr) || null
          }
          
          // Try all keys in map to see if there's a match
          if (!productData) {
            console.log(`[getVendorInventory] 🔍 DIAGNOSTIC: Checking all map keys for similarity:`)
            productIdMap.forEach((value: any, key: any) => {
              const match = key === objectIdStr || key.toLowerCase() === objectIdStr.toLowerCase()
              console.log(`[getVendorInventory]   - map["${key}"] === "${objectIdStr}": ${match}`)
            })
          }
        }
        
        if (!productData && objectIdStr) {
          console.warn(`[getVendorInventory] ⚠️ Product not found in map for raw ObjectId: ${objectIdStr}. Will use ObjectId as fallback.`)
        } else if (productData) {
          console.log(`[getVendorInventory] ✅ Found product in map: ${productData.id} - ${productData.name}`)
        }
      }
    }
    
    // CRITICAL: Always return product string ID, not ObjectId
    // Priority: 1) productData.id (string ID), 2) productData._id (ObjectId as string), 3) inv.productId (raw ObjectId as fallback)
    let finalProductId = ''
    
    if (productData?.id) {
      finalProductId = String(productData.id)
      console.log(`[getVendorInventory] ✅ Using productData.id: ${finalProductId}`)
    } else if (productData?._id) {
      // If we have productData but no string id, use ObjectId as fallback
      finalProductId = productData._id.toString ? productData._id.toString() : String(productData._id)
      console.log(`[getVendorInventory] ⚠️ Using productData._id as fallback: ${finalProductId}`)
    } else {
      // Last resort: use the raw productId from raw inventory records (preserved ObjectId)
      const rawProductId = rawProductIdMap.get(inv.id)
      if (rawProductId) {
        // Extract ObjectId string from raw record
        const objectIdStr = rawProductId.toString ? rawProductId.toString() : String(rawProductId)
        if (objectIdStr && mongoose.Types.ObjectId.isValid(objectIdStr)) {
          finalProductId = objectIdStr
          console.warn(`[getVendorInventory] ⚠️ Using raw productId ObjectId from raw record for inventory ${inv.id}: ${finalProductId}`)
        }
      }
      
      // If still empty, try inv.productId (might be null after populate failure)
      if (!finalProductId && inv.productId) {
        if (inv.productId instanceof mongoose.Types.ObjectId) {
          finalProductId = inv.productId.toString()
        } else if (typeof inv.productId === 'object' && inv.productId._id) {
          finalProductId = inv.productId._id.toString ? inv.productId._id.toString() : String(inv.productId._id)
        } else if (typeof inv.productId === 'object' && inv.productId.toString) {
          finalProductId = inv.productId.toString()
        } else if (typeof inv.productId === 'string') {
          finalProductId = inv.productId
        } else {
          finalProductId = String(inv.productId)
        }
        if (finalProductId) {
          console.warn(`[getVendorInventory] ⚠️ Using inv.productId as fallback for inventory ${inv.id}: ${finalProductId}`)
        }
      }
    }
    
    // FINAL SAFEGUARD: If we still don't have a productId, try to extract it from the raw inv.productId
    // This handles edge cases where all previous methods failed
    if (!finalProductId || finalProductId === '') {
      console.error(`[getVendorInventory] ❌ CRITICAL: Cannot extract product ID for inventory ${inv.id}`)
      console.error(`[getVendorInventory]   - inv.productId:`, inv.productId)
      console.error(`[getVendorInventory]   - inv.productId type:`, typeof inv.productId)
      console.error(`[getVendorInventory]   - inv.productId constructor:`, inv.productId?.constructor?.name)
      console.error(`[getVendorInventory]   - productData:`, productData)
      console.error(`[getVendorInventory]   - productData?.id:`, productData?.id)
      console.error(`[getVendorInventory]   - productData?._id:`, productData?._id)
      
      // Last-ditch effort: try to extract from raw inv.productId
      if (inv.productId) {
        if (typeof inv.productId === 'string' && inv.productId.length > 0) {
          finalProductId = inv.productId
          console.warn(`[getVendorInventory] ⚠️ Using raw string productId as last resort: ${finalProductId}`)
        } else if (typeof inv.productId === 'object') {
          // Try to get _id from the object
          const rawId = (inv.productId as any)?._id || (inv.productId as any)?.id || inv.productId
          if (rawId) {
            finalProductId = rawId.toString ? rawId.toString() : String(rawId)
            if (finalProductId && finalProductId !== '') {
              console.warn(`[getVendorInventory] ⚠️ Using raw object productId as last resort: ${finalProductId}`)
            }
          }
        }
      }
      
      // If still empty, this is a data integrity issue
      if (!finalProductId || finalProductId === '') {
        console.error(`[getVendorInventory] ❌❌❌ FATAL: Inventory record ${inv.id} has no valid productId. This is a data integrity issue.`)
      }
    }
    
    return {
      id: inv.id,
      vendorId: inv.vendorId?.id || (inv.vendorId as any)?.toString(),
      vendorName: (inv.vendorId as any)?.name,
      productId: finalProductId, // ALWAYS use string id, never ObjectId
      productName: productData?.name || undefined,
      productCategory: productData?.category || undefined,
      productGender: productData?.gender || undefined,
      productSizes: productData?.sizes || [],
      productPrice: productData?.price || undefined,
      productSku: productData?.sku || undefined,
      sizeInventory,
      lowInventoryThreshold,
      totalStock: inv.totalStock || 0,
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
    }
  })
}

/**
 * Get vendor-wise inventory for a company (read-only view for Company Admin)
 * Returns all inventory records for products linked to the company, grouped by vendor
 * @param companyId - Company ID (string or number)
 * @returns Array of inventory records with product and vendor details
 */
export async function getVendorWiseInventoryForCompany(companyId: string | number): Promise<any[]> {
  await connectDB()
  
  // Get company ObjectId
  const company = await Company.findOne({ id: String(companyId) })
  if (!company) {
    console.warn(`[getVendorWiseInventoryForCompany] Company not found: ${companyId}`)
    return []
  }
  
  // Get all products linked to this company via ProductCompany
  const db = mongoose.connection.db
    if (!db) {
    throw new Error('Database connection not available')
  }
   if (!db) {
    console.error('[getVendorWiseInventoryForCompany] Database connection not available')
    return []
  }
  
  const productCompanyLinks = await db.collection('productcompanies').find({
    companyId: 
    company._id
  }).toArray()
  
  if (productCompanyLinks.length === 0) {
    console.log(`[getVendorWiseInventoryForCompany] No products linked to company ${companyId}`)
    return []
  }
  
  const productObjectIds = productCompanyLinks
    .map((link: any) => link.productId)
    .filter((id: any) => id)
  
  if (productObjectIds.length === 0) {
    return []
  }
  
  console.log(`[getVendorWiseInventoryForCompany] 🔍 Finding inventory for ${productObjectIds.length} products`)
  
  // First, get raw inventory records to inspect vendorId structure
  const rawInventoryRecords = await db.collection('vendorinventories').find({
    productId: { $in: productObjectIds }
  }).toArray()
  
  console.log(`[getVendorWiseInventoryForCompany] 📊 Raw inventory records from DB: ${rawInventoryRecords.length}`)
  if (rawInventoryRecords.length > 0) {
    const sampleRaw = rawInventoryRecords[0]
    console.log(`[getVendorWiseInventoryForCompany] 📋 Sample raw inventory record:`, {
      id: sampleRaw.id,
      vendorId: sampleRaw.vendorId,
      vendorIdType: sampleRaw.vendorId?.constructor?.name,
      vendorIdString: sampleRaw.vendorId?.toString(),
      productId: sampleRaw.productId,
      productIdType: sampleRaw.productId?.constructor?.name
    })
  }
  
  // Get all vendor inventories for these products
  const inventoryRecords = await VendorInventory.find({
    productId: { $in: productObjectIds }
  })
    .populate('productId', 'id name sku category gender')
    .populate('vendorId', 'id name')
    .lean() as any
  
  
  // Log sample of populated records
  if (inventoryRecords.length > 0) {
    const samplePopulated = inventoryRecords[0]
    console.log(`[getVendorWiseInventoryForCompany] 📋 Sample populated inventory record:`, {
      id: samplePopulated.id,
      vendorId: samplePopulated.vendorId,
      vendorIdType: typeof samplePopulated.vendorId,
      vendorIdIsObject: typeof samplePopulated.vendorId === 'object',
      vendorIdKeys: samplePopulated.vendorId && typeof samplePopulated.vendorId === 'object' ? Object.keys(samplePopulated.vendorId) : 'N/A',
      productId: samplePopulated.productId,
      productIdType: typeof samplePopulated.productId
    })
  }
  
  // Get all vendors for manual lookup (fallback if populate fails)
  const allVendors = await Vendor.find({}).lean() as any
  console.log(`[getVendorWiseInventoryForCompany] 📦 Loaded ${allVendors.length} vendors from database`)
  
  const vendorMap = new Map()
  allVendors.forEach((v: any) => {
    if (v._id) {
      const vendorIdStr = v._id.toString()
      vendorMap.set(vendorIdStr, { id: v.id, name: v.name })
      console.log(`[getVendorWiseInventoryForCompany] 📝 Mapped vendor: ${vendorIdStr} -> ${v.name} (id: ${v.id})`)
    }
  })
  
  console.log(`[getVendorWiseInventoryForCompany] 🗺️  Vendor map size: ${vendorMap.size}`)
  
  // Build a map of inventory ID -> vendorId from raw records for reliable lookup
  const inventoryVendorMap = new Map<string, any>()
  rawInventoryRecords.forEach((raw: any) => {
    if (raw.id && raw.vendorId) {
      let vendorIdStr: string | null = null
      if (typeof raw.vendorId === 'string') {
        vendorIdStr = raw.vendorId
      } else if (raw.vendorId.toString) {
        vendorIdStr = raw.vendorId.toString()
      } else if (raw.vendorId._id) {
        vendorIdStr = raw.vendorId._id.toString()
      }
      
      if (vendorIdStr) {
        inventoryVendorMap.set(raw.id, vendorIdStr)
        console.log(`[getVendorWiseInventoryForCompany] 📝 Mapped inventory ${raw.id} -> vendorId ${vendorIdStr}`)
      }
    }
  })
  
  console.log(`[getVendorWiseInventoryForCompany] 🗺️  Inventory-Vendor map size: ${inventoryVendorMap.size}`)
  
  // Format the data for display
  const formattedInventory = inventoryRecords.map((inv: any, index: number) => {
    console.log(`\n[getVendorWiseInventoryForCompany] 🔄 Processing inventory record ${index + 1}/${inventoryRecords.length}`)
    console.log(`[getVendorWiseInventoryForCompany]   Inventory ID: ${inv.id || 'N/A'}`)
    console.log(`[getVendorWiseInventoryForCompany]   Raw vendorId type: ${typeof inv.vendorId}`)
    console.log(`[getVendorWiseInventoryForCompany]   Raw vendorId value:`, inv.vendorId)
    console.log(`[getVendorWiseInventoryForCompany]   Raw vendorId constructor: ${inv.vendorId?.constructor?.name}`)
    
    // Also get the raw record for comparison
    const rawRecord = rawInventoryRecords.find((r: any) => r.id === inv.id)
    if (rawRecord) {
      console.log(`[getVendorWiseInventoryForCompany]   📦 Raw DB vendorId:`, rawRecord.vendorId)
      console.log(`[getVendorWiseInventoryForCompany]   📦 Raw DB vendorId type: ${rawRecord.vendorId?.constructor?.name}`)
      console.log(`[getVendorWiseInventoryForCompany]   📦 Raw DB vendorId string: ${rawRecord.vendorId?.toString()}`)
    }
    
    const product = inv.productId
    let vendor = inv.vendorId
    
    console.log(`[getVendorWiseInventoryForCompany]   Initial vendor from populate:`, vendor)
    console.log(`[getVendorWiseInventoryForCompany]   Has 
    vendor.name? ${!!(vendor && 
    vendor.name)}`)
    
    // Fallback: if populate didn't work, try manual lookup
    if (!vendor || !vendor.name) {
      console.log(`[getVendorWiseInventoryForCompany]   ⚠️  Populate failed, trying manual lookup...`)
      
      // Try multiple ways to extract vendorId
      let vendorIdStr: string | null = null
      
      if (inv.vendorId) {
        if (typeof inv.vendorId === 'string') {
          vendorIdStr = inv.vendorId
          console.log(`[getVendorWiseInventoryForCompany]   📌 vendorId is string: ${vendorIdStr}`)
        } else if (inv.vendorId._id) {
          vendorIdStr = inv.vendorId._id.toString()
          console.log(`[getVendorWiseInventoryForCompany]   📌 vendorId._id found: ${vendorIdStr}`)
        } else if (inv.vendorId.toString) {
          vendorIdStr = inv.vendorId.toString()
          console.log(`[getVendorWiseInventoryForCompany]   📌 vendorId.toString(): ${vendorIdStr}`)
        } else if (typeof inv.vendorId === 'object' && inv.vendorId.constructor?.name === 'ObjectId') {
          vendorIdStr = inv.vendorId.toString()
          console.log(`[getVendorWiseInventoryForCompany]   📌 vendorId is ObjectId: ${vendorIdStr}`)
        }
      }
      
      // Also check raw vendorId field from inventory record
      if (!vendorIdStr && inv.vendorId) {
        const rawVendorId = inv.vendorId
        if (rawVendorId && typeof rawVendorId === 'object' && rawVendorId._id) {
          vendorIdStr = rawVendorId._id.toString()
          console.log(`[getVendorWiseInventoryForCompany]   📌 Found vendorId from raw field: ${vendorIdStr}`)
        }
      }
      
      if (vendorIdStr) {
        console.log(`[getVendorWiseInventoryForCompany]   🔍 Looking up vendorId: ${vendorIdStr}`)
        console.log(`[getVendorWiseInventoryForCompany]   🗺️  Vendor map has key? ${vendorMap.has(vendorIdStr)}`)
        
        if (vendorMap.has(vendorIdStr)) {
          vendor = vendorMap.get(vendorIdStr)
          console.log(`[getVendorWiseInventoryForCompany]   ✅ Found vendor in map:`, vendor)
        } else {
          console.log(`[getVendorWiseInventoryForCompany]   ❌ Vendor not found in map for ID: ${vendorIdStr}`)
          console.log(`[getVendorWiseInventoryForCompany]   📋 Available vendor IDs in map:`, Array.from(vendorMap.keys()).slice(0, 5))
        }
      } else {
        console.log(`[getVendorWiseInventoryForCompany]   ❌ Could not extract vendorId string`)
      }
      
      // Try to extract from populated object structure
      if ((!vendor || !vendor.name) && inv.vendorId && typeof inv.vendorId === 'object') {
        console.log(`[getVendorWiseInventoryForCompany]   🔄 Trying to extract from populated object...`)
        console.log(`[getVendorWiseInventoryForCompany]   📦 Populated object keys:`, Object.keys(inv.vendorId))
        vendor = {
          id: inv.vendorId.id || inv.vendorId._id?.toString() || 'N/A',
          name: inv.vendorId.name || 'Unknown Vendor'
        }
        console.log(`[getVendorWiseInventoryForCompany]   📝 Extracted vendor:`, vendor)
      }
    }
    
    // Final fallback: use inventory-vendor map built from raw records
    if (!vendor || !vendor.name || vendor.name === 'Unknown Vendor') {
      console.log(`[getVendorWiseInventoryForCompany]   🔄 Final fallback: using inventory-vendor map...`)
      
      const mappedVendorId = inventoryVendorMap.get(inv.id)
      if (mappedVendorId) {
        console.log(`[getVendorWiseInventoryForCompany]   📝 Found vendorId from map: ${mappedVendorId}`)
        if (vendorMap.has(mappedVendorId)) {
          vendor = vendorMap.get(mappedVendorId)
          console.log(`[getVendorWiseInventoryForCompany]   ✅ Final lookup successful:`, vendor)
        } else {
          console.log(`[getVendorWiseInventoryForCompany]   ❌ VendorId ${mappedVendorId} not in vendor map`)
          console.log(`[getVendorWiseInventoryForCompany]   📋 Available vendor IDs:`, Array.from(vendorMap.keys()).slice(0, 10))
        }
      } else {
        console.log(`[getVendorWiseInventoryForCompany]   ❌ Inventory ${inv.id} not in inventory-vendor map`)
      }
    }
    
    // Log final vendor result
    console.log(`[getVendorWiseInventoryForCompany]   ✅ Final vendor for record:`, vendor)
    console.log(`[getVendorWiseInventoryForCompany]   📝 Vendor name: ${vendor?.name || 'MISSING'}`)
    
    // Ensure we always have a vendor object
    if (!vendor || !vendor.name) {
      console.log(`[getVendorWiseInventoryForCompany]   ⚠️  WARNING: No vendor found, using fallback`)
      vendor = { id: 'N/A', name: 'Unknown Vendor' }
    }
    
    // Convert sizeInventory Map to object
    const sizeInventoryObj = inv.sizeInventory instanceof Map
      ? Object.fromEntries(inv.sizeInventory)
      : (inv.sizeInventory || {})
    
    // Convert lowInventoryThreshold Map to object
    const thresholdObj = inv.lowInventoryThreshold instanceof Map
      ? Object.fromEntries(inv.lowInventoryThreshold)
      : (inv.lowInventoryThreshold || {})
    
    // Calculate overall threshold (minimum threshold across all sizes, or 0 if none set)
    const thresholdValues = Object.values(thresholdObj).filter((v: any) => typeof v === 'number' && v > 0)
    const overallThreshold = thresholdValues.length > 0 ? Math.min(...thresholdValues as number[]) : 0
    
    // Determine stock status
    const totalStock = inv.totalStock || 0
    let stockStatus = 'in_stock'
    if (totalStock === 0) {
      stockStatus = 'out_of_stock'
    } else if (overallThreshold > 0 && totalStock <= overallThreshold) {
      stockStatus = 'low_stock'
    }
    
    return {
      sku: product?.sku || 'N/A',
      productName: product?.name || 'Unknown Product',
      productId: product?.id || 'N/A',
      vendorName: vendor?.name || 'Unknown Vendor',
      vendorId: vendor?.id || 'N/A',
      availableStock: totalStock,
      threshold: overallThreshold,
      sizeInventory: sizeInventoryObj,
      lowInventoryThreshold: thresholdObj,
      stockStatus,
      lastUpdated: inv.updatedAt || inv.createdAt || null,
      category: product?.category || 'N/A',
      gender: product?.gender || 'N/A',
    }
  })
  
  // Summary log
  const vendorNameCounts = new Map<string, number>()
  formattedInventory.forEach((item: any) => {
    const vendorName = item.vendorName || 'Unknown Vendor'
    vendorNameCounts.set(vendorName, (vendorNameCounts.get(vendorName) || 0) + 1)
  })
  
  console.log(`\n[getVendorWiseInventoryForCompany] 📊 SUMMARY:`)
  console.log(`[getVendorWiseInventoryForCompany]   Total inventory records: ${formattedInventory.length}`)
  console.log(`[getVendorWiseInventoryForCompany]   Vendor distribution:`)
  vendorNameCounts.forEach((count: any, vendorName: any) => {
    console.log(`[getVendorWiseInventoryForCompany]     - ${vendorName}: ${count} record(s)`)
  })
  console.log(`[getVendorWiseInventoryForCompany] ✅ Returning ${formattedInventory.length} formatted inventory records\n`)
  
  return formattedInventory
}

/**
 * Initialize vendor inventory for a product-vendor combination
 * Creates inventory record with all product sizes initialized to 0 stock and 0 threshold
 * Idempotent: Safe to call multiple times, won't create duplicates
 * This is called automatically when products are linked to vendors
 * @param vendorId - Vendor ObjectId
 * @param productId - Product ObjectId
 * @param session - Optional MongoDB session for transactional operations
 */
async function ensureVendorInventoryExists(
  vendorId: mongoose.Types.ObjectId, 
  productId: mongoose.Types.ObjectId,
  session?: mongoose.ClientSession
): Promise<void> {
  try {
    // CRITICAL: Verify product exists before creating inventory
    const product = await Uniform.findById(productId)
    if (!product) {
      console.error(`[ensureVendorInventoryExists] ❌ Product not found: ObjectId ${productId}`)
      throw new Error(`Product not found: ${productId.toString()}`)
    }

    // Check if inventory already exists (idempotency check)
    const findQuery = VendorInventory.findOne({
      vendorId: vendorId,
      productId: productId,
    })
    const existingInventory = session ? await findQuery.session(session) : await findQuery

    if (existingInventory) {
      // Inventory already exists, no need to create (idempotent)
      console.log(`[ensureVendorInventoryExists] ✅ Inventory already exists for vendor ${vendorId.toString()} / product ${
    product.id || productId.toString()}`)
      return
    }

    // Get product sizes - initialize inventory for each size
    const productSizes = product.sizes || []
    if (!Array.isArray(productSizes) || productSizes.length === 0) {
      console.warn(`[ensureVendorInventoryExists] ⚠️  Product ${
    product.id || productId.toString()} has no sizes defined. Creating inventory with empty size map.`)
    }

    // Initialize sizeInventory Map with all product sizes set to 0
    const sizeInventoryMap = new Map<string, number>()
    for (const size of productSizes) {
      if (size && typeof size === 'string' && size.trim()) {
        sizeInventoryMap.set(size.trim(), 0)
      }
    }

    // Initialize lowInventoryThreshold Map with all product sizes set to 0
    const thresholdMap = new Map<string, number>()
    for (const size of productSizes) {
      if (size && typeof size === 'string' && size.trim()) {
        thresholdMap.set(size.trim(), 0)
      }
    }

    // Generate unique inventory ID
    let inventoryId = `VEND-INV-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`
    let isUnique = false
    let attempts = 0
    while (!isUnique && attempts < 10) {
      const checkQuery = VendorInventory.findOne({ id: inventoryId })
      const existing = session ? await checkQuery.session(session) : await checkQuery
      if (!existing) {
        isUnique = true
      } else {
        inventoryId = `VEND-INV-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`
        attempts++
      }
    }

    // Create inventory record with all sizes initialized to 0
    const inventoryDoc = new VendorInventory({
      id: inventoryId,
      vendorId: vendorId,
      productId: productId,
      sizeInventory: sizeInventoryMap,
      totalStock: 0, // Will be recalculated by pre-save hook (sum of all sizes = 0)
      lowInventoryThreshold: thresholdMap,
    })

    // Mark Map fields as modified to ensure Mongoose saves them
    inventoryDoc.markModified('sizeInventory')
    inventoryDoc.markModified('lowInventoryThreshold')

    // Save with session if provided (for transactional operations)
    if (session) {
      await inventoryDoc.save({ session })
    } else {
      await inventoryDoc.save()
    }

    console.log(`[ensureVendorInventoryExists] ✅ Created VendorInventory for vendor ${vendorId.toString()} / product ${
    product.id || productId.toString()}`)
    console.log(`[ensureVendorInventoryExists] 📊 Initialized ${sizeInventoryMap.size} sizes: ${Array.from(sizeInventoryMap.keys()).join(', ')}`)
  } catch (error: any) {
    // If error is due to duplicate (race condition), that's okay (idempotent)
    if (error.code === 11000 || error.message?.includes('duplicate')) {
      console.log(`[ensureVendorInventoryExists] ⚠️  VendorInventory already exists for vendor ${vendorId.toString()} / product ${productId.toString()} (race condition)`)
      return
    }
    // Re-throw other errors (including product not found)
    console.error(`[ensureVendorInventoryExists] ❌ Error creating VendorInventory:`, {
      vendorId: vendorId.toString(),
      productId: productId.toString(),
      error: error.message,
      code: error.code,
    })
    throw error
  }
}

export async function updateVendorInventory(
  vendorId: string,
  productId: string,
  sizeInventory: { [size: string]: number },
  lowInventoryThreshold?: { [size: string]: number }
): Promise<any> {
  await connectDB()
  
  const vendor = await Vendor.findOne({ id: vendorId })
  const product = await Uniform.findOne({ id: productId })
  
  if (!vendor || !product) {
    throw new Error('Vendor or Product not found')
  }

  // Get existing inventory to preserve threshold if not provided
  const existingInventory = await VendorInventory.findOne({
    vendorId: 
    vendor._id,
    productId: 
    product._id,
  })

  // Generate unique inventory ID if creating new
  let inventoryId = existingInventory?.id || `VEND-INV-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`
  if (!existingInventory) {
  let isUnique = false
  while (!isUnique) {
    const existing = await VendorInventory.findOne({ id: inventoryId })
    if (!existing) {
      isUnique = true
    } else {
      inventoryId = `VEND-INV-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`
      }
    }
  }

  // Convert sizeInventory object to Map for Mongoose schema
  // Mongoose Map type requires actual Map instances for proper serialization
  const sizeInventoryMap = new Map<string, number>()
  for (const [size, quantity] of Object.entries(sizeInventory)) {
    sizeInventoryMap.set(size, typeof quantity === 'number' ? quantity : 0)
  }

  // Handle lowInventoryThreshold - merge with existing if provided
  let thresholdMap: Map<string, number>
  if (lowInventoryThreshold !== undefined) {
    thresholdMap = new Map<string, number>()
    for (const [size, threshold] of Object.entries(lowInventoryThreshold)) {
      thresholdMap.set(size, typeof threshold === 'number' ? threshold : 0)
    }
  } else if (existingInventory?.lowInventoryThreshold) {
    // Preserve existing thresholds if not provided
    thresholdMap = existingInventory.lowInventoryThreshold instanceof Map
      ? new Map(existingInventory.lowInventoryThreshold)
      : new Map(Object.entries(existingInventory.lowInventoryThreshold || {}))
  } else {
    thresholdMap = new Map<string, number>()
  }

  // Calculate total stock
  let totalStock = 0
  for (const quantity of Object.values(sizeInventory)) {
    totalStock += typeof quantity === 'number' ? quantity : 0
  }

  console.log('[updateVendorInventory] 🔍 DIAGNOSTIC: Update payload:', {
    vendorId: 
    vendor.id,
    productId: 
    product.id,
    sizeInventory: Object.fromEntries(sizeInventoryMap),
    totalStock,
    lowInventoryThreshold: Object.fromEntries(thresholdMap),
    inventoryId
  })

  // CRITICAL FIX: Use document.save() instead of findOneAndUpdate
  // findOneAndUpdate with .lean() bypasses Mongoose pre-save hooks and Map serialization
  // document.save() ensures:
  // 1. Pre-save hook runs (recalculates totalStock from sizeInventory)
  // 2. Map serialization works correctly
  // 3. Data persists properly to database
  
  let inventoryDoc = await VendorInventory.findOne({
    vendorId: 
    vendor._id,
    productId: 
    product._id,
  })

  if (!inventoryDoc) {
    // Create new inventory document if it doesn't exist
    inventoryDoc = new VendorInventory({
      id: inventoryId,
      vendorId: 
    vendor._id,
      productId: 
    product._id,
      sizeInventory: new Map(),
      lowInventoryThreshold: new Map(),
      totalStock: 0,
    })
    console.log('[updateVendorInventory] 🔍 DIAGNOSTIC: Created new inventory document.')
  } else {
    console.log('[updateVendorInventory] 🔍 DIAGNOSTIC: Found existing inventory document.')
  }

  // Update properties - use Map instances (schema expects Map type)
  inventoryDoc.sizeInventory = sizeInventoryMap
  inventoryDoc.lowInventoryThreshold = thresholdMap
  // Note: totalStock will be recalculated by pre-save hook, but we set it explicitly too
  inventoryDoc.totalStock = totalStock

  // CRITICAL: Mark Map fields as modified to ensure Mongoose saves them
  // Mongoose doesn't always detect changes to Map objects, so we must explicitly mark them
  inventoryDoc.markModified('sizeInventory')
  inventoryDoc.markModified('lowInventoryThreshold')

  console.log('[updateVendorInventory] 🔍 DIAGNOSTIC: Before save - inventoryDoc:', {
    id: inventoryDoc.id,
    vendorId: inventoryDoc.vendorId.toString(),
    productId: inventoryDoc.productId.toString(),
    sizeInventory: Object.fromEntries(inventoryDoc.sizeInventory),
    lowInventoryThreshold: Object.fromEntries(inventoryDoc.lowInventoryThreshold),
    totalStock: inventoryDoc.totalStock, // Will be recalculated by pre-save hook
  })

  // Save the document - this triggers pre-save hooks and proper Map serialization
  let savedInventory
  try {
    savedInventory = await inventoryDoc.save()
    console.log('[updateVendorInventory] ✅ Document.save() completed successfully')
  } catch (saveError: any) {
    console.error('[updateVendorInventory] ❌ CRITICAL: Document.save() failed:', saveError)
    console.error('[updateVendorInventory] ❌ Save error details:', {
      message: saveError.message,
      stack: saveError.stack,
      name: saveError.name,
      code: saveError.code,
    })
    throw new Error(`Failed to save inventory: ${saveError.message}`)
  }
  
  console.log('[updateVendorInventory] ✅ Inventory document saved successfully.')
  console.log('[updateVendorInventory] 🔍 DIAGNOSTIC: After save - savedInventory:', {
    id: savedInventory.id,
    totalStock: savedInventory.totalStock,
    sizeInventorySize: savedInventory.sizeInventory.size,
    lowInventoryThresholdSize: savedInventory.lowInventoryThreshold.size,
  })

  // Populate and return the saved document
  const inventory = await VendorInventory.findById(savedInventory._id)
    .populate('productId', 'id name category gender sizes price sku')
    .populate('vendorId', 'id name')
    .lean() as any

    console.error('[updateVendorInventory] ❌ CRITICAL: Failed to retrieve populated inventory after save.')
    throw new Error('Failed to update inventory')
  }

  // Verify the update persisted correctly
  const inventoryAny = inventory as any
  console.log('[updateVendorInventory] ✅ Update result (after save and populate):', {
    inventoryId: inventoryAny.id,
    persistedSizeInventory: inventoryAny.sizeInventory,
    persistedTotalStock: inventoryAny.totalStock,
    persistedThreshold: inventoryAny.lowInventoryThreshold,
    sizeInventoryType: typeof inventoryAny.sizeInventory,
    sizeInventoryIsMap: inventoryAny.sizeInventory instanceof Map,
    sizeInventoryConstructor: inventoryAny.sizeInventory?.constructor?.name
  })
  
  // CRITICAL: Verify data was actually persisted by querying database directly
  const db = mongoose.connection.db
     if (!db) {
    throw new Error('Database connection not available')
  }
  if (db) {
    const rawInventory = await db.collection('vendorinventories').findOne({
      vendorId: 
    vendor._id,
      productId: 
    product._id,
    })
    if (rawInventory) {
      console.log('[updateVendorInventory] ✅ DATABASE VERIFICATION: Raw DB record:', {
        id: rawInventory.id,
        sizeInventory: rawInventory.sizeInventory,
        totalStock: rawInventory.totalStock,
        lowInventoryThreshold: rawInventory.lowInventoryThreshold,
        updatedAt: rawInventory.updatedAt,
      })
      
      // Verify the values match what we tried to save
      const expectedTotal = Object.values(sizeInventory).reduce((sum: any, qty: any) => sum + (typeof qty === 'number' ? qty : 0), 0)
      if (rawInventory.totalStock !== expectedTotal) {
        console.error(`[updateVendorInventory] ❌ DATABASE VERIFICATION FAILED: totalStock mismatch! Expected: ${expectedTotal}, Got: ${rawInventory.totalStock}`)
        throw new Error(`Inventory totalStock mismatch: expected ${expectedTotal}, got ${rawInventory.totalStock}`)
      }
      
      // Verify sizeInventory matches
      const rawSizeInv = rawInventory.sizeInventory || {}
      const sizeInventoryKeys = Object.keys(sizeInventory)
      for (const size of sizeInventoryKeys) {
        const expectedQty = sizeInventory[size]
        const actualQty = rawSizeInv[size]
        if (actualQty !== expectedQty) {
          console.error(`[updateVendorInventory] ❌ DATABASE VERIFICATION FAILED: sizeInventory mismatch for size ${size}! Expected: ${expectedQty}, Got: ${actualQty}`)
          throw new Error(`Inventory sizeInventory mismatch for size ${size}: expected ${expectedQty}, got ${actualQty}`)
        }
      }
      
      console.log('[updateVendorInventory] ✅ DATABASE VERIFICATION PASSED: All values match expected values')
    } else {
      console.error('[updateVendorInventory] ❌ DATABASE VERIFICATION FAILED: Record not found in DB after save!')
      throw new Error('Inventory update did not persist to database')
    }
  }

  // Convert retrieved Maps to plain objects for response
  // After .lean(), Maps are returned as plain objects
  const responseSizeInventory = inventoryAny.sizeInventory instanceof Map
    ? Object.fromEntries(inventoryAny.sizeInventory)
    : inventoryAny.sizeInventory || {}
  
  const responseThreshold = inventoryAny.lowInventoryThreshold instanceof Map
    ? Object.fromEntries(inventoryAny.lowInventoryThreshold)
    : inventoryAny.lowInventoryThreshold || {}

  return {
    id: inventoryAny.id,
    vendorId: inventoryAny.vendorId?.id || inventoryAny.vendorId?.toString(),
    vendorName: inventoryAny.vendorId?.name,
    productId: inventoryAny.productId?.id || inventoryAny.productId?.toString(),
    productName: inventoryAny.productId?.name,
    productCategory: inventoryAny.productId?.category,
    productGender: inventoryAny.productId?.gender,
    productSizes: inventoryAny.productId?.sizes || [],
    productPrice: inventoryAny.productId?.price,
    productSku: inventoryAny.productId?.sku,
    sizeInventory: responseSizeInventory,
    lowInventoryThreshold: responseThreshold,
    totalStock: inventoryAny.totalStock || 0,
    createdAt: inventoryAny.createdAt,
    updatedAt: inventoryAny.updatedAt,
  }
}

// ========== DESIGNATION PRODUCT ELIGIBILITY FUNCTIONS ==========

export async function getDesignationEligibilitiesByCompany(companyId: string): Promise<any[]> {
  await connectDB()
  
  const company = await Company.findOne({ id: companyId })
  if (!company) {
    console.warn(`Company not found: ${companyId}`)
    return []
  }

  // First try with status filter
  let eligibilities = await DesignationProductEligibility.find({ 
    companyId: 
    company._id,
    status: 'active'
  })
    .populate('companyId', 'id name')
    .sort({ designation: 1 })
    .lean() as any

  if (eligibilities.length === 0) {
    const inactiveCount = await DesignationProductEligibility.countDocuments({ 
      companyId: 
    company._id,
      status: 'inactive'
    })
    if (inactiveCount > 0) {
      console.warn(`Found ${inactiveCount} inactive designation eligibilities for company ${companyId}. Only active records are returned.`)
    }
    
    // Also check if there are any records with this companyId but no status filter
    const allCount = await DesignationProductEligibility.countDocuments({ 
      companyId: 
    company._id
    })
    if (allCount > 0 && allCount !== inactiveCount) {
      console.warn(`Found ${allCount} total designation eligibilities for company ${companyId}, but none are active.`)
    }
  }

  // Import decrypt function and crypto for alternative decryption
  const { decrypt } = require('../utils/encryption')
  const crypto = require('crypto')
  
  // Helper function to get encryption key
  const getKey = () => {
    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'
    const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
    if (key.length !== 32) {
      return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
    }
    return key
  }
  
  // Decrypt designations manually since .lean() bypasses Mongoose hooks
  const decryptedEligibilities = eligibilities.map((e: any) => {
    // Log raw data from DB before processing
    console.log('🔍 Raw eligibility from DB:', {
      id: e.id,
      hasItemEligibility: !!e.itemEligibility,
      itemEligibilityKeys: e.itemEligibility ? Object.keys(e.itemEligibility) : 'none',
      itemEligibilityRaw: e.itemEligibility ? JSON.stringify(e.itemEligibility, null, 2) : 'none',
      allowedProductCategories: e.allowedProductCategories,
    })
    
    // Convert to plain object first
    const plainObj = toPlainObject(e)
    
    // Ensure allowedProductCategories includes all categories from itemEligibility
    // This fixes existing data where categories might be missing
    if (plainObj.itemEligibility && typeof plainObj.itemEligibility === 'object') {
      const categoriesFromItemEligibility = Object.keys(plainObj.itemEligibility).filter(key => 
        key !== '_id' && plainObj.itemEligibility[key] && typeof plainObj.itemEligibility[key] === 'object'
      )
      const existingCategories = new Set(plainObj.allowedProductCategories || [])
      
      // Add missing categories from itemEligibility
      categoriesFromItemEligibility.forEach(cat => {
        // Handle aliases: pant -> trouser, jacket -> blazer
        if (cat === 'pant') {
          existingCategories.add('trouser')
          existingCategories.add('pant')
        } else if (cat === 'jacket') {
          existingCategories.add('blazer')
          existingCategories.add('jacket')
        } else {
          existingCategories.add(cat)
        }
      })
      
      // Update if categories were added
      if (existingCategories.size > (plainObj.allowedProductCategories?.length || 0)) {
        plainObj.allowedProductCategories = Array.from(existingCategories)
        console.log(`✅ Fixed missing categories for ${plainObj.id}:`, {
          original: e.allowedProductCategories,
          fixed: plainObj.allowedProductCategories,
          fromItemEligibility: categoriesFromItemEligibility,
        })
      }
    }
    
    // Log after toPlainObject
    console.log('🔍 After toPlainObject:', {
      id: plainObj.id,
      hasItemEligibility: !!plainObj.itemEligibility,
      itemEligibilityKeys: plainObj.itemEligibility ? Object.keys(plainObj.itemEligibility) : 'none',
      itemEligibilityPlain: plainObj.itemEligibility ? JSON.stringify(plainObj.itemEligibility, null, 2) : 'none',
    })
    
    // DesignationProductEligibility.designation is now stored as PLAINTEXT (encryption removed)
    // No decryption needed - designation is already in plaintext format
    
    return plainObj
  })

  console.log(`📊 Returning ${decryptedEligibilities.length} eligibilities`)
  return decryptedEligibilities
}

export async function getDesignationEligibilityById(eligibilityId: string): Promise<any | null> {
  await connectDB()
  
  const eligibility = await DesignationProductEligibility.findOne({ id: eligibilityId })
    .populate('companyId', 'id name')
    .lean() as any


  // Convert to plain object first
  const plainObj = toPlainObject(eligibility)
  
  // DesignationProductEligibility.designation is now stored as PLAINTEXT (encryption removed)
  // No decryption needed

  return plainObj
}

export async function getDesignationEligibilityByDesignation(
  companyId: string, 
  designation: string, 
  gender?: 'male' | 'female'
): Promise<any | null> {
  await connectDB()
  
  const company = await Company.findOne({ id: companyId })
  if (!company) return null

  // DesignationProductEligibility.designation is now PLAINTEXT (encryption removed)
  // Employee.designation is ENCRYPTED (employee PII)
  // Strategy: Decrypt employee.designation, then match with plaintext eligibility.designation
  
  const { decrypt } = require('../utils/encryption')
  
  // Decrypt the input designation (from employee) for matching
  // The input designation comes from Employee.designation which is encrypted
  let decryptedDesignation: string = designation.trim()
  if (decryptedDesignation && typeof decryptedDesignation === 'string' && decryptedDesignation.includes(':')) {
    try {
      decryptedDesignation = decrypt(decryptedDesignation)
  } catch (error) {
      console.warn('Failed to decrypt employee designation for eligibility lookup:', error)
      // If decryption fails, try using as-is (might already be plaintext)
    }
  }
  
  // Normalize designation to lowercase for case-insensitive matching
  const normalizedDesignation = decryptedDesignation.trim().toLowerCase()

  // Build query filter - prioritize gender-specific rules, then 'unisex' rules
  const queryFilter: any = {
    companyId: 
    company._id,
    status: 'active'
  }

  // Query with plaintext designation (DesignationProductEligibility.designation is now plaintext)
  // Try exact match first, then case-insensitive match
  let eligibility = await DesignationProductEligibility.findOne({ 
    ...queryFilter,
    designation: { $regex: new RegExp(`^${normalizedDesignation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
  })
    .populate('companyId', 'id name')
    .lean() as any

  if (!eligibility) {
    const allEligibilities = await DesignationProductEligibility.find(queryFilter)
      .populate('companyId', 'id name')
      .lean() as any

    // Priority: gender-specific first, then 'unisex'
    const matchingEligibilities: any[] = []
    for (const elig of allEligibilities) {
      const eligDesignation = (elig.designation as string) || ''
      // Match designation (case-insensitive) - no decryption needed (already plaintext)
      const normalizedEligDesignation = eligDesignation.trim().toLowerCase()
      if (normalizedEligDesignation && normalizedEligDesignation === normalizedDesignation) {
        const eligGender = elig.gender || 'unisex'
        matchingEligibilities.push({ ...elig, gender: eligGender })
      }
    }

    // Prioritize gender-specific rules over 'unisex'
    if (gender) {
      const genderSpecific = matchingEligibilities.find(e => e.gender === gender)
      if (genderSpecific) {
        eligibility = genderSpecific
      } else {
        // Fall back to 'unisex' if no gender-specific rule found
        eligibility = matchingEligibilities.find(e => e.gender === 'unisex' || !e.gender)
      }
    } else {
      // If no gender specified, prefer 'unisex', otherwise take first match
      eligibility = matchingEligibilities.find(e => e.gender === 'unisex' || !e.gender) || matchingEligibilities[0]
    }
  } else {
    // Check if gender matches (if gender is specified)
    if (gender && eligibility.gender && eligibility.gender !== 'unisex' && eligibility.gender !== gender) {
      // Gender doesn't match, try to find 'unisex' or matching gender rule
      const allEligibilities = await DesignationProductEligibility.find({
        companyId: 
    company._id,
        status: 'active'
      })
        .populate('companyId', 'id name')
        .lean() as any
      
        const eligDesignation = (elig.designation as string) || ''
        // No decryption needed - eligibility.designation is now plaintext
        const normalizedEligDesignation = eligDesignation.trim().toLowerCase()
        if (normalizedEligDesignation && normalizedEligDesignation === normalizedDesignation) {
          const eligGender = elig.gender || 'unisex'
          if (eligGender === gender || eligGender === 'unisex') {
            eligibility = elig
            break
          }
        }
      }
    }


  return eligibility || null
}

export async function createDesignationEligibility(
  companyId: string,
  designation: string,
  allowedProductCategories: string[],
  itemEligibility?: {
    // Legacy categories (for backward compatibility)
    shirt?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    trouser?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    pant?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    shoe?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    blazer?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    jacket?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    // Dynamic categories (any category name can be used)
    [categoryName: string]: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' } | undefined
  },
  gender?: 'male' | 'female' | 'unisex'
): Promise<any> {
  await connectDB()
  
  const company = await Company.findOne({ id: companyId })
  if (!company) {
    throw new Error(`Company not found: ${companyId}`)
  }

  // Ensure system categories exist
  await ensureSystemCategories(companyId)
  
  // Get all categories for this company to validate and map category names
  const categories = await getCategoriesByCompany(companyId)
  const categoryMap = new Map<string, string>() // Maps normalized name to actual category name
  categories.forEach(cat => {
    categoryMap.set(cat.name.toLowerCase(), cat.name)
    categoryMap.set(normalizeCategoryName(cat.name), cat.name)
  })

  // Generate unique ID by finding the highest existing ID number
  let eligibilityId: string
  let attempts = 0
  const maxAttempts = 10
  
  while (attempts < maxAttempts) {
    // Find the highest existing ID
    const existingEligibilities = await DesignationProductEligibility.find({}, 'id')
      .sort({ id: -1 })
      .limit(1)
      .lean() as any
    
    if (existingEligibilities.length > 0 && existingEligibilities[0].id) {
      const lastId = existingEligibilities[0].id as string
      const match = lastId.match(/^DESIG-ELIG-(\d+)$/)
      if (match) {
        nextIdNumber = parseInt(match[1], 10) + 1
      }
    }
    
    eligibilityId = `DESIG-ELIG-${String(nextIdNumber).padStart(6, '0')}`
    
    // Check if this ID already exists (race condition protection)
    const existing = await DesignationProductEligibility.findOne({ id: eligibilityId })
    if (!existing) {
      break // ID is available
    }
    
    // ID exists, try next number
    nextIdNumber++
    eligibilityId = `DESIG-ELIG-${String(nextIdNumber).padStart(6, '0')}`
    attempts++
  }
  
  if (attempts >= maxAttempts) {
    throw new Error('Failed to generate unique eligibility ID after multiple attempts')
  }

  // Structure itemEligibility to match schema exactly
  // Map category names to actual category names from DB (for dynamic categories)
  let structuredItemEligibility: any = undefined
  if (itemEligibility) {
    structuredItemEligibility = {}
    for (const [key, value] of Object.entries(itemEligibility)) {
      if (value && typeof value === 'object' && 'quantity' in value && 'renewalFrequency' in value) {
        // Preserve actual values - don't default to 0 if value is provided
        const qty = typeof value.quantity === 'number' ? value.quantity : (value.quantity ? Number(value.quantity) : 0)
        const freq = typeof value.renewalFrequency === 'number' ? value.renewalFrequency : (value.renewalFrequency ? Number(value.renewalFrequency) : 0)
        const unit = value.renewalUnit || 'months'
        
        // Map category key to actual category name from DB (for dynamic categories)
        // Try to find matching category in DB
        const normalizedKey = normalizeCategoryName(key)
        let categoryKey = key // Default to original key
        
        // Check if this key matches a category in DB
        if (categoryMap.has(key.toLowerCase())) {
          categoryKey = categoryMap.get(key.toLowerCase())!.toLowerCase()
        } else if (categoryMap.has(normalizedKey)) {
          categoryKey = categoryMap.get(normalizedKey)!.toLowerCase()
        } else {
          // For legacy categories or new categories not yet in DB, use normalized key
          categoryKey = normalizedKey
        }
        
        structuredItemEligibility[categoryKey] = {
          quantity: qty,
          renewalFrequency: freq,
          renewalUnit: unit,
        }
        console.log(`  ✅ Structured ${key} -> ${categoryKey}: quantity=${qty}, frequency=${freq}, unit=${unit}`)
      }
    }
  }

  // Normalize category names function (same as in UI)
  const normalizeCategory = (cat: string): string => {
    if (!cat) return ''
    const lower = cat.toLowerCase().trim()
    if (lower.includes('shirt')) return 'shirt'
    if (lower.includes('trouser') || lower.includes('pant')) return 'trouser'
    if (lower.includes('shoe')) return 'shoe'
    if (lower.includes('blazer') || lower.includes('jacket')) return 'blazer'
    if (lower.includes('accessory')) return 'accessory'
    return lower
  }

  // Ensure allowedProductCategories includes all categories from itemEligibility
  // This ensures consistency - if itemEligibility has entries, they should be in allowedProductCategories
  const categoriesFromItemEligibility = structuredItemEligibility ? Object.keys(structuredItemEligibility) : []
  const normalizedAllowedCategories = new Set<string>()
  
  // Normalize and add categories from allowedProductCategories
  ;(allowedProductCategories || []).forEach(cat => {
    const normalized = normalizeCategory(cat)
    // Try to find actual category name from DB
    if (categoryMap.has(cat.toLowerCase())) {
      normalizedAllowedCategories.add(categoryMap.get(cat.toLowerCase())!.toLowerCase())
    } else if (categoryMap.has(normalized)) {
      normalizedAllowedCategories.add(categoryMap.get(normalized)!.toLowerCase())
    } else {
      normalizedAllowedCategories.add(normalized)
    }
  })
  
  // Add normalized categories from itemEligibility that might be missing
  categoriesFromItemEligibility.forEach(cat => {
    // Category key is already normalized/mapped, just add it
    normalizedAllowedCategories.add(cat)
  })
  
  const finalAllowedCategories = Array.from(normalizedAllowedCategories)

  console.log('🔍 Creating new eligibility with itemEligibility:', {
    eligibilityId,
    designation,
    originalAllowedCategories: allowedProductCategories,
    categoriesFromItemEligibility,
    finalAllowedCategories,
    originalItemEligibility: itemEligibility ? JSON.stringify(itemEligibility, null, 2) : 'none',
    structuredItemEligibility: structuredItemEligibility ? JSON.stringify(structuredItemEligibility, null, 2) : 'none',
    gender: gender || 'unisex',
  })

  const eligibility = new DesignationProductEligibility({
    id: eligibilityId,
    companyId: 
    company._id,
    companyName: 
    company.name,
    designation: designation,
    gender: gender || 'unisex', // Use 'unisex' instead of 'all' to match model enum
    allowedProductCategories: finalAllowedCategories,
    itemEligibility: structuredItemEligibility,
    status: 'active',
  })
  
  console.log('🔍 Eligibility object created:', {
    itemEligibility: eligibility.itemEligibility ? JSON.stringify(eligibility.itemEligibility, null, 2) : 'none',
    itemEligibilityType: typeof eligibility.itemEligibility,
  })

  try {
    // Log before save
    console.log('🔍 Document state BEFORE save (create):', {
      itemEligibility: eligibility.itemEligibility ? JSON.stringify(eligibility.itemEligibility, null, 2) : 'none',
      isNew: eligibility.isNew,
    })
    
    await eligibility.save()
    console.log('✅ Eligibility document created successfully')
    
    // Log after save
    console.log('🔍 Document state AFTER save (create):', {
      itemEligibility: eligibility.itemEligibility ? JSON.stringify(eligibility.itemEligibility, null, 2) : 'none',
    })
    
    // Verify by fetching from DB
    const verifyCreated = await DesignationProductEligibility.findOne({ id: eligibilityId }).lean() as any
    if (verifyCreated) {
      console.log('✅ Verification - Created document from DB:', {
        id: (verifyCreated as any).id,
        itemEligibility: verifyCreated.itemEligibility ? JSON.stringify(verifyCreated.itemEligibility, null, 2) : 'none',
      })
    }
  } catch (saveError: any) {
    console.error('❌ Error saving eligibility:', saveError)
    // If still a duplicate key error, try one more time with a higher ID
    if (saveError.code === 11000 && saveError.keyPattern?.id) {
      const existingEligibilities = await DesignationProductEligibility.find({}, 'id')
        .sort({ id: -1 })
        .limit(1)
        .lean() as any
      
      if (existingEligibilities.length > 0 && existingEligibilities[0].id) {
        const lastId = existingEligibilities[0].id as string
        const match = lastId.match(/^DESIG-ELIG-(\d+)$/)
        if (match) {
          nextIdNumber = parseInt(match[1], 10) + 1
        }
      }
      
      eligibilityId = `DESIG-ELIG-${String(nextIdNumber).padStart(6, '0')}`
      eligibility.id = eligibilityId
      await eligibility.save()
      console.log('✅ Eligibility document created successfully after retry')
    } else {
      throw saveError
    }
  }
  
  // Fetch the created eligibility with proper decryption
  const createdEligibility = await getDesignationEligibilityById(eligibilityId)
  if (createdEligibility) {
    return createdEligibility
  }
  
  // Fallback: manually decrypt if fetch fails
  const plainObj = toPlainObject(eligibility)
  const { decrypt } = require('../utils/encryption')
  if (plainObj.designation && typeof plainObj.designation === 'string' && plainObj.designation.includes(':')) {
    try {
      plainObj.designation = decrypt(plainObj.designation)
    } catch (error: any) {
      console.error('Failed to decrypt designation after create:', error.message)
    }
  }
  return plainObj
}

export async function updateDesignationEligibility(
  eligibilityId: string,
  designation?: string,
  allowedProductCategories?: string[],
  itemEligibility?: {
    // Legacy categories (for backward compatibility)
    shirt?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    trouser?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    pant?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    shoe?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    blazer?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    jacket?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    // Dynamic categories (any category name can be used)
    [categoryName: string]: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' } | undefined
  },
  gender?: 'male' | 'female' | 'unisex',
  status?: 'active' | 'inactive',
  refreshEligibility?: boolean
): Promise<any> {
  await connectDB()
  
  // Get existing eligibility to find companyId
  const existingEligibility = await DesignationProductEligibility.findOne({ id: eligibilityId })
  if (!existingEligibility) {
    throw new Error(`Eligibility not found: ${eligibilityId}`)
  }
  
  const company = await Company.findById(existingEligibility.companyId)
  if (!company) {
    throw new Error(`Company not found for eligibility: ${eligibilityId}`)
  }
  
  // Ensure system categories exist
  await ensureSystemCategories(company.id)
  
  // Get all categories for this company to validate and map category names
  const categories = await getCategoriesByCompany(company.id)
  const categoryMap = new Map<string, string>() // Maps normalized name to actual category name
  categories.forEach(cat => {
    categoryMap.set(cat.name.toLowerCase(), cat.name)
    categoryMap.set(normalizeCategoryName(cat.name), cat.name)
  })
  
  // Try using findOne + save approach to ensure pre-save hooks run and changes are detected
  const eligibility = await DesignationProductEligibility.findOne({ id: eligibilityId })
  if (!eligibility) {
    throw new Error(`Designation eligibility not found: ${eligibilityId}`)
  }

  // Structure itemEligibility first if provided (map category names to actual DB category names)
  let structuredItemEligibility: any = undefined
  if (itemEligibility !== undefined) {
    structuredItemEligibility = {}
    for (const [key, value] of Object.entries(itemEligibility)) {
      if (value && typeof value === 'object' && 'quantity' in value && 'renewalFrequency' in value) {
        // Preserve actual values - don't default to 0 if value is provided
        const qty = typeof value.quantity === 'number' ? value.quantity : (value.quantity ? Number(value.quantity) : 0)
        const freq = typeof value.renewalFrequency === 'number' ? value.renewalFrequency : (value.renewalFrequency ? Number(value.renewalFrequency) : 0)
        const unit = value.renewalUnit || 'months'
        
        // Map category key to actual category name from DB (for dynamic categories)
        const normalizedKey = normalizeCategoryName(key)
        let categoryKey = key // Default to original key
        
        // Check if this key matches a category in DB
        if (categoryMap.has(key.toLowerCase())) {
          categoryKey = categoryMap.get(key.toLowerCase())!.toLowerCase()
        } else if (categoryMap.has(normalizedKey)) {
          categoryKey = categoryMap.get(normalizedKey)!.toLowerCase()
        } else {
          // For legacy categories or new categories not yet in DB, use normalized key
          categoryKey = normalizedKey
        }
        
        structuredItemEligibility[categoryKey] = {
          quantity: qty,
          renewalFrequency: freq,
          renewalUnit: unit,
        }
        console.log(`  ✅ Structured ${key} -> ${categoryKey}: quantity=${qty}, frequency=${freq}, unit=${unit}`)
      }
    }
  }

  // Ensure allowedProductCategories includes all categories from itemEligibility
  // This ensures consistency - if itemEligibility has entries, they should be in allowedProductCategories
  let finalAllowedCategories = allowedProductCategories
  if (allowedProductCategories !== undefined || structuredItemEligibility !== undefined) {
    const categoriesFromItemEligibility = structuredItemEligibility ? Object.keys(structuredItemEligibility) : []
    // Normalize category names function (same as in create)
    const normalizeCategory = (cat: string): string => {
      if (!cat) return ''
      const lower = cat.toLowerCase().trim()
      if (lower.includes('shirt')) return 'shirt'
      if (lower.includes('trouser') || lower.includes('pant')) return 'trouser'
      if (lower.includes('shoe')) return 'shoe'
      if (lower.includes('blazer') || lower.includes('jacket')) return 'blazer'
      if (lower.includes('accessory')) return 'accessory'
      return lower
    }

    const normalizedAllowedCategories = new Set<string>()
    
    // Normalize and add categories from allowedProductCategories or existing eligibility
    const categoriesToNormalize = allowedProductCategories || eligibility.allowedProductCategories || []
    categoriesToNormalize.forEach(cat => {
      const normalized = normalizeCategory(cat)
      // Try to find actual category name from DB
      if (categoryMap.has(cat.toLowerCase())) {
        normalizedAllowedCategories.add(categoryMap.get(cat.toLowerCase())!.toLowerCase())
      } else if (categoryMap.has(normalized)) {
        normalizedAllowedCategories.add(categoryMap.get(normalized)!.toLowerCase())
      } else {
        normalizedAllowedCategories.add(normalized)
      }
    })
    
    // Add normalized categories from itemEligibility that might be missing
    categoriesFromItemEligibility.forEach(cat => {
      // Category key is already normalized/mapped, just add it
      normalizedAllowedCategories.add(cat)
    })
    
    finalAllowedCategories = Array.from(normalizedAllowedCategories)
  }

  // Update fields
  if (designation !== undefined) {
    eligibility.designation = designation // Stored as plaintext (encryption removed from DesignationProductEligibility)
  }
  if (finalAllowedCategories !== undefined) {
    eligibility.allowedProductCategories = finalAllowedCategories
    console.log('🔍 Updated allowedProductCategories:', finalAllowedCategories)
  }
  if (structuredItemEligibility !== undefined) {
    // MERGE with existing itemEligibility instead of replacing
    // This preserves categories that exist in DB but aren't in the current form
    const existingItemEligibility = eligibility.itemEligibility || {}
    const mergedItemEligibility = {
      ...existingItemEligibility, // Preserve existing categories
      ...structuredItemEligibility, // Override with new/updated categories
    }
    
    // Log what we're about to save
    console.log('🔍 Merging itemEligibility on eligibility document:', {
      before: eligibility.itemEligibility ? JSON.stringify(eligibility.itemEligibility, null, 2) : 'none',
      newValue: JSON.stringify(structuredItemEligibility, null, 2),
      merged: JSON.stringify(mergedItemEligibility, null, 2),
      existingKeys: Object.keys(existingItemEligibility),
      newKeys: Object.keys(structuredItemEligibility),
      mergedKeys: Object.keys(mergedItemEligibility),
    })
    
    // Use set() method to explicitly set the merged nested object
    eligibility.set('itemEligibility', mergedItemEligibility)
    // Mark as modified to ensure Mongoose saves it
    eligibility.markModified('itemEligibility')
    
    // Verify it was set
    console.log('🔍 After setting itemEligibility:', {
      eligibilityItemEligibility: eligibility.itemEligibility ? JSON.stringify(eligibility.itemEligibility, null, 2) : 'none',
      isModified: eligibility.isModified('itemEligibility'),
      type: typeof eligibility.itemEligibility,
      directAccess: eligibility.get('itemEligibility') ? JSON.stringify(eligibility.get('itemEligibility'), null, 2) : 'none',
    })
  }
  if (gender !== undefined) {
    eligibility.gender = gender
  }
  if (status !== undefined) {
    eligibility.status = status
  }

  // Save the document (designation is stored as plaintext - encryption removed)
  try {
    // Log the document state before save
    console.log('🔍 Document state BEFORE save:', {
      itemEligibility: eligibility.itemEligibility ? JSON.stringify(eligibility.itemEligibility, null, 2) : 'none',
      itemEligibilityType: typeof eligibility.itemEligibility,
      itemEligibilityKeys: eligibility.itemEligibility ? Object.keys(eligibility.itemEligibility) : [],
      isModified: eligibility.isModified('itemEligibility'),
      isNew: eligibility.isNew,
      documentId: eligibility._id,
    })
    
    await eligibility.save()
    console.log('✅ Eligibility document saved successfully using save() method')
    
    // Log the document state after save
    console.log('🔍 Document state AFTER save:', {
      itemEligibility: eligibility.itemEligibility ? JSON.stringify(eligibility.itemEligibility, null, 2) : 'none',
    })
  } catch (saveError: any) {
    console.error('❌ Error saving eligibility:', saveError)
    console.error('❌ Save error details:', {
      message: saveError.message,
      code: saveError.code,
      errors: saveError.errors,
      stack: saveError.stack,
    })
    throw new Error(`Failed to save eligibility: ${saveError.message}`)
  }

  const updated = eligibility
  
  // Verify the update was successful by fetching the document directly (without lean to get Mongoose document)
  const verifyUpdatedDoc = await DesignationProductEligibility.findOne({ id: eligibilityId })
  if (verifyUpdatedDoc) {
    console.log('✅ Verification - Updated document from DB (Mongoose doc):', {
      id: verifyUpdatedDoc.id,
      hasItemEligibility: !!verifyUpdatedDoc.itemEligibility,
      itemEligibilityKeys: verifyUpdatedDoc.itemEligibility ? Object.keys(verifyUpdatedDoc.itemEligibility) : 'none',
      itemEligibilityFull: verifyUpdatedDoc.itemEligibility ? JSON.stringify(verifyUpdatedDoc.itemEligibility, null, 2) : 'none',
    })
    
    // Log specific values to verify they were saved
    if (verifyUpdatedDoc.itemEligibility) {
      for (const [key, value] of Object.entries(verifyUpdatedDoc.itemEligibility)) {
        console.log(`  📊 ${key}:`, JSON.stringify(value, null, 2))
      }
    }
  }
  
  // Also verify with lean() to see what's actually in the database
  const verifyUpdated = await DesignationProductEligibility.findOne({ id: eligibilityId }).lean() as any
  if (verifyUpdated) {
    console.log('✅ Verification - Updated document from DB (lean):', {
      id: (verifyUpdated as any).id,
      hasItemEligibility: !!verifyUpdated.itemEligibility,
      itemEligibilityKeys: verifyUpdated.itemEligibility ? Object.keys(verifyUpdated.itemEligibility) : 'none',
      itemEligibilityFull: verifyUpdated.itemEligibility ? JSON.stringify(verifyUpdated.itemEligibility, null, 2) : 'none',
      allowedCategories: verifyUpdated.allowedProductCategories,
      gender: verifyUpdated.gender,
    })
    
    // Log specific values to verify they were saved
    if (verifyUpdated.itemEligibility) {
      for (const [key, value] of Object.entries(verifyUpdated.itemEligibility)) {
        console.log(`  📊 ${key} (lean):`, JSON.stringify(value, null, 2))
      }
    }
  }

  // Fetch the updated eligibility with proper decryption
  // Use getDesignationEligibilityById to ensure proper decryption
  const updatedEligibility = await getDesignationEligibilityById(eligibilityId)
  if (!updatedEligibility) {
    // Fallback: manually decrypt if fetch fails
    const plainObj = toPlainObject(updated || verifyUpdated)
    const { decrypt } = require('../utils/encryption')
    if (plainObj && plainObj.designation && typeof plainObj.designation === 'string' && plainObj.designation.includes(':')) {
      try {
        plainObj.designation = decrypt(plainObj.designation)
      } catch (error: any) {
        console.error('Failed to decrypt designation after update:', error.message)
      }
    }
    return plainObj
  }
  
  console.log('✅ Returning updated eligibility with decrypted designation')
  
  // If refreshEligibility is true, update all employees with this designation
  if (refreshEligibility && updatedEligibility) {
    try {
      // Get company ID - handle both string ID and ObjectId
      let companyIdForRefresh: string | undefined
      if (updatedEligibility.companyId) {
        // If it's already a string ID, use it
        if (typeof updatedEligibility.companyId === 'string') {
          companyIdForRefresh = updatedEligibility.companyId
        } else if (typeof updatedEligibility.companyId === 'object' && updatedEligibility.companyId.id) {
          companyIdForRefresh = updatedEligibility.companyId.id
        }
      }
      
      // If still not found, get from eligibility document
      if (!companyIdForRefresh && eligibility && eligibility.companyId) {
        if (typeof eligibility.companyId === 'object') {
          const company = await Company.findById(eligibility.companyId)
          if (company) {
            companyIdForRefresh = company.id
          }
        } else {
          companyIdForRefresh = eligibility.companyId.toString()
        }
      }
      
      if (companyIdForRefresh) {
        // Check if company allows eligibility consumption reset
        const company = await Company.findOne({ id: companyIdForRefresh })
        const allowReset = company?.allowEligibilityConsumptionReset === true
        
        // Refresh employee eligibility
        await refreshEmployeeEligibilityForDesignation(
          companyIdForRefresh,
          updatedEligibility.designation || designation || '',
          updatedEligibility.gender || gender || 'unisex',
          updatedEligibility.itemEligibility || itemEligibility
        )
        console.log('✅ Successfully refreshed employee entitlements for designation')
        
        // If company allows reset, reset consumed eligibility for affected employees
        if (allowReset) {
          await resetConsumedEligibilityForDesignation(
            companyIdForRefresh,
            updatedEligibility.designation || designation || '',
            updatedEligibility.gender || gender || 'unisex',
            updatedEligibility.itemEligibility || itemEligibility
          )
          console.log('✅ Successfully reset consumed eligibility for designation')
        }
      } else {
        console.warn('⚠️ Could not determine company ID for refresh, skipping employee entitlement update')
      }
    } catch (error: any) {
      console.error('⚠️ Error refreshing employee entitlements:', error)
      // Don't fail the update if refresh fails, just log it
    }
  }
  
  return updatedEligibility
}

/**
 * Reset consumed eligibility for employees with a specific designation
 * This sets eligibilityResetDates for affected categories, effectively resetting consumed eligibility to 0
 */
async function resetConsumedEligibilityForDesignation(
  companyId: string,
  designation: string,
  gender: 'male' | 'female' | 'unisex',
  itemEligibility?: {
    // Legacy categories (for backward compatibility)
    shirt?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    trouser?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    pant?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    shoe?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    blazer?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    jacket?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    // Dynamic categories (any category name can be used)
    [categoryName: string]: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' } | undefined
  }
): Promise<void> {
  await connectDB()
  
  if (!itemEligibility) {
    console.warn('No itemEligibility provided, skipping consumed eligibility reset')
    return
  }
  
  // Find company
  let company = await Company.findOne({ id: companyId })
  if (!company && mongoose.Types.ObjectId.isValid(companyId)) {
    company = await Company.findById(companyId)
  }
  if (!company) {
    throw new Error(`Company not found: ${companyId}`)
  }

  // Ensure system categories exist
  await ensureSystemCategories(companyId)
  
  // Get all categories for this company
  const categories = await getCategoriesByCompany(companyId)
  
  // DesignationProductEligibility.designation is now plaintext, but Employee.designation is encrypted
  // Strategy: Decrypt employee designations, then match with plaintext eligibility designations
  const { decrypt } = require('../utils/encryption')
  
  // Find all employees with this company
  const allEmployees = await Employee.find({ companyId: 
    company._id })
    .lean() as any
  
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
    if (empDesignation && empDesignation.trim().toLowerCase() === designation.trim().toLowerCase()) {
      // Check gender filter
      if (gender === 'unisex' || !gender || emp.gender === gender) {
        matchingEmployees.push(emp)
      }
    }
  }
  
  if (matchingEmployees.length === 0) {
    console.log(`No employees found with designation "${designation}" and gender "${gender || 'all'}" for reset`)
    return
  }
  
  // Determine which categories need reset based on itemEligibility (dynamic)
  const resetCategories: string[] = []
  
  // Process all categories from itemEligibility (including dynamic ones)
  for (const [categoryKey, itemElig] of Object.entries(itemEligibility)) {
    if (itemElig) {
      const normalizedKey = normalizeCategoryName(categoryKey)
      
      // Try to find matching category in DB
      const category = categories.find(cat => 
        cat.name.toLowerCase() === categoryKey.toLowerCase() ||
        cat.name.toLowerCase() === normalizedKey ||
        normalizeCategoryName(cat.name) === normalizedKey
      )
      
      if (category) {
        resetCategories.push(category.name.toLowerCase())
      } else {
        // For legacy categories or categories not yet in DB, use normalized key
        resetCategories.push(normalizedKey)
      }
    }
  }
  
  // Also add legacy categories for backward compatibility
  if (itemEligibility.shirt && !resetCategories.includes('shirt')) resetCategories.push('shirt')
  if ((itemEligibility.trouser || itemEligibility.pant) && !resetCategories.includes('pant') && !resetCategories.includes('trouser')) {
    resetCategories.push('pant')
  }
  if (itemEligibility.shoe && !resetCategories.includes('shoe')) resetCategories.push('shoe')
  if ((itemEligibility.blazer || itemEligibility.jacket) && !resetCategories.includes('jacket') && !resetCategories.includes('blazer')) {
    resetCategories.push('jacket')
  }
  
  if (resetCategories.length === 0) {
    console.log('No categories to reset')
    return
  }
  
  // Current timestamp for reset dates
  const resetDate = new Date()
  
  // Update each matching employee's eligibilityResetDates
  for (const emp of matchingEmployees) {
    try {
      const employee = await Employee.findById(emp._id)
      if (!employee) continue
      
      // Initialize eligibilityResetDates if it doesn't exist
      if (!employee.eligibilityResetDates) {
        employee.eligibilityResetDates = {}
      }
      
      // Set reset date for each affected category
      for (const category of resetCategories) {
        (employee.eligibilityResetDates as any)[category] = resetDate
      }
      
      await 
    employee.save()
      console.log(`✅ Reset consumed eligibility for employee ${
    employee.employeeId || 
    employee.id} (categories: ${resetCategories.join(', ')})`)
    } catch (error: any) {
      console.error(`⚠️ Error resetting consumed eligibility for employee ${emp.employeeId || emp.id}:`, error.message)
      // Continue with other employees even if one fails
    }
  }
  
  console.log(`✅ Successfully reset consumed eligibility for ${matchingEmployees.length} employees with designation "${designation}"`)
}

/**
 * Refresh employee entitlements based on updated designation eligibility
 */
async function refreshEmployeeEligibilityForDesignation(
  companyId: string,
  designation: string,
  gender: 'male' | 'female' | 'unisex',
  itemEligibility?: {
    // Legacy categories (for backward compatibility)
    shirt?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    trouser?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    pant?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    shoe?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    blazer?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    jacket?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    // Dynamic categories (any category name can be used)
    [categoryName: string]: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' } | undefined
  }
): Promise<void> {
  await connectDB()
  
  if (!itemEligibility) {
    console.warn('No itemEligibility provided, skipping employee entitlement refresh')
    return
  }
  
  // Find company
  let company = await Company.findOne({ id: companyId })
  if (!company && mongoose.Types.ObjectId.isValid(companyId)) {
    company = await Company.findById(companyId)
  }
  if (!company) {
    throw new Error(`Company not found: ${companyId}`)
  }

  // Ensure system categories exist
  await ensureSystemCategories(companyId)
  
  // Get all categories for this company
  const categories = await getCategoriesByCompany(companyId)
  
  // DesignationProductEligibility.designation is now plaintext, but Employee.designation is encrypted
  // Strategy: Decrypt employee designations, then match with plaintext eligibility designations
  const { encrypt, decrypt } = require('../utils/encryption')
  
  // Find all employees with this company
  const allEmployees = await Employee.find({ companyId: 
    company._id })
    .lean() as any
  
  // Filter employees by designation (case-insensitive, handling encryption)
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
    if (empDesignation && empDesignation.trim().toLowerCase() === designation.trim().toLowerCase()) {
      // Check gender filter
      if (gender === 'unisex' || !gender || emp.gender === gender) {
        matchingEmployees.push(emp)
      }
    }
  }
  
  if (matchingEmployees.length === 0) {
    console.log(`No employees found with designation "${designation}" and gender "${gender || 'all'}"`)
    return
  }
  
  // Calculate eligibility and cycle duration from itemEligibility
  // IMPORTANT: Start with a clean slate - reset all values to 0 first, then apply new values
  // This ensures that categories removed from designation eligibility are properly cleared
  // Note: Employee records still use legacy format (shirt, pant, shoe, jacket)
  const eligibility = {
    shirt: 0,
    pant: 0,
    shoe: 0,
    jacket: 0,
  }
  
  // Convert renewal frequency to months for cycle duration
  const convertToMonths = (itemElig: any): number => {
    if (!itemElig) return 6 // Default
    if (itemElig.renewalUnit === 'years') {
      return itemElig.renewalFrequency * 12
    }
    return itemElig.renewalFrequency || 6
  }
  
  // Initialize with default cycle durations
  const cycleDuration = {
    shirt: 6, // Default
    pant: 6,  // Default
    shoe: 6,  // Default
    jacket: 12, // Default
  }
  
  // Process all categories from itemEligibility (including dynamic ones)
  // Map dynamic categories to legacy format for employee records
  for (const [categoryKey, itemElig] of Object.entries(itemEligibility)) {
    if (itemElig) {
      const normalizedKey = normalizeCategoryName(categoryKey)
      
      // Map to legacy categories for employee records
      if (categoryKey === 'shirt' || normalizedKey === 'shirt') {
        eligibility.shirt = itemElig.quantity || 0
        cycleDuration.shirt = convertToMonths(itemElig)
      } else if (categoryKey === 'pant' || categoryKey === 'trouser' || normalizedKey === 'pant' || normalizedKey === 'trouser') {
        eligibility.pant = itemElig.quantity || 0
        cycleDuration.pant = convertToMonths(itemElig)
      } else if (categoryKey === 'shoe' || normalizedKey === 'shoe') {
        eligibility.shoe = itemElig.quantity || 0
        cycleDuration.shoe = convertToMonths(itemElig)
      } else if (categoryKey === 'jacket' || categoryKey === 'blazer' || normalizedKey === 'jacket' || normalizedKey === 'blazer') {
        eligibility.jacket = itemElig.quantity || 0
        cycleDuration.jacket = convertToMonths(itemElig)
      }
      // Note: Custom categories beyond legacy ones are stored in designation eligibility
      // but employee records only support legacy format for now
    }
  }
  
  console.log(`🔄 Refreshing entitlements for ${matchingEmployees.length} employees:`, {
    designation,
    gender: gender || 'all',
    eligibility,
    cycleDuration,
    note: 'All eligibility values reset to 0 first, then new values applied'
  })
  
  // Update all matching employees
  // IMPORTANT: Use a transaction-like approach - reset first, then apply new values
  let updatedCount = 0
  for (const emp of matchingEmployees) {
    try {
      const employee = await Employee.findById(emp._id)
      if (employee) {
        // STEP 1: Reset all eligibility fields to 0 (clear existing values)
        employee.eligibility = {
          shirt: 0,
          pant: 0,
          shoe: 0,
          jacket: 0,
        }
        
        // STEP 2: Reset cycle durations to defaults
    employee.cycleDuration = {
          shirt: 6,
          pant: 6,
          shoe: 6,
          jacket: 12,
        }
        
        // STEP 3: Apply new eligibility values (from current designation configuration)
    employee.eligibility = eligibility
    employee.cycleDuration = cycleDuration
        
        await 
    employee.save()
        updatedCount++
        
        console.log(`✅ Updated employee ${emp.id || emp.employeeId}:`, {
          eligibility: 
    employee.eligibility,
          cycleDuration: 
    employee.cycleDuration,
        })
      }
    } catch (error: any) {
      console.error(`Error updating employee ${emp.id}:`, error)
    }
  }
  
  console.log(`✅ Successfully updated entitlements for ${updatedCount} out of ${matchingEmployees.length} employees`)
}

export async function deleteDesignationEligibility(eligibilityId: string): Promise<void> {
  await connectDB()
  
  await DesignationProductEligibility.deleteOne({ id: eligibilityId })
}

/**
 * CORE LOGIC REWRITE — CATALOGUE VISIBILITY BASED ON SUBCATEGORY ELIGIBILITY
 * 
 * This function returns products visible to an employee based STRICTLY on:
 * 1. DesignationSubcategoryEligibility (subcategory-level, company-scoped)
 * 2. ProductSubcategoryMapping (product-to-subcategory mapping, company-scoped)
 * 
 * NO category-level fallbacks.
 * NO implicit "show all products" behavior.
 * 
 * Business Rule: NO eligibility = NO products (enforced strictly)
 */
export async function getProductsForDesignation(
  companyId: string, 
  designation: string, 
  gender?: 'male' | 'female'
): Promise<any[]> {
  await connectDB()
  
  console.log(`[getProductsForDesignation] ========================================`)
  console.log(`[getProductsForDesignation] Input: companyId=${companyId}, designation="${designation}", gender="${gender || 'all'}"`)
  
  // ============================================================
  // STEP 1: VALIDATE INPUTS (STRICT ENFORCEMENT)
  // ============================================================
  if (!designation || designation.trim().length === 0) {
    console.log(`[getProductsForDesignation] ⚠️ STRICT ENFORCEMENT - No designation provided, returning empty array`)
    return []
  }
  
  if (!companyId) {
    console.log(`[getProductsForDesignation] ⚠️ STRICT ENFORCEMENT - No companyId provided, returning empty array`)
    return []
  }
  
  // Get company ObjectId
  let company = await Company.findOne({ id: companyId })
  if (!company && mongoose.Types.ObjectId.isValid(companyId)) {
    company = await Company.findById(companyId)
  }
  if (!company) {
    console.log(`[getProductsForDesignation] ⚠️ Company not found for companyId=${companyId}, returning empty array`)
    return []
  }
  
  console.log(`[getProductsForDesignation] ✅ Company found: ${company.name} (ID: ${company.id})`)
  
  // ============================================================
  // STEP 2: CHECK FOR SUBCATEGORY-BASED ELIGIBILITY (SINGLE SOURCE OF TRUTH)
  // ============================================================
  const normalizedDesignation = designation.trim()
  const genderFilter = gender === 'unisex' || !gender ? { $in: ['male', 'female', 'unisex'] } : gender
  
  console.log(`[getProductsForDesignation] Checking DesignationSubcategoryEligibility for:`)
  console.log(`  - companyId: ${company._id}`)
  console.log(`  - designationId: "${normalizedDesignation}"`)
  console.log(`  - gender: ${JSON.stringify(genderFilter)}`)
  console.log(`  - status: 'active'`)
  
  const subcategoryEligibilities = await DesignationSubcategoryEligibility.find({
    companyId: 
    company._id,
    designationId: normalizedDesignation,
    gender: genderFilter,
    status: 'active'
  }).lean() as any
  
  console.log(`[getProductsForDesignation] Found ${subcategoryEligibilities.length} active eligibility rules`)
  
  // ============================================================
  // STEP 3: STRICT ENFORCEMENT — NO ELIGIBILITY = NO PRODUCTS
  // ============================================================
  if (subcategoryEligibilities.length === 0) {
    console.log(`[getProductsForDesignation] ⚠️ STRICT ENFORCEMENT - No eligibility rules found`)
    console.log(`[getProductsForDesignation] Returning EMPTY array (no products visible)`)
    console.log(`[getProductsForDesignation] ========================================`)
    return []
  }
  
  // ============================================================
  // STEP 4: GET ELIGIBLE SUBCATEGORY IDs
  // ============================================================
  const subcategoryIds = subcategoryEligibilities
    .map(e => e.subCategoryId)
    .filter(Boolean)
    .map((s: any) => {
      if (mongoose.Types.ObjectId.isValid(s)) {
        return new mongoose.Types.ObjectId(s)
      }
      return s
    })
  
  if (subcategoryIds.length === 0) {
    console.log(`[getProductsForDesignation] ⚠️ No valid subcategory IDs found in eligibility rules, returning empty array`)
    return []
  }
  
  console.log(`[getProductsForDesignation] Eligible subcategory IDs: ${subcategoryIds.length}`)
  
  // ============================================================
  // STEP 5: VERIFY SUBCATEGORIES EXIST AND BELONG TO COMPANY
  // ============================================================
  const subcategories = await Subcategory.find({
    _id: { $in: subcategoryIds },
    companyId: 
    company._id,
    status: 'active'
  }).lean() as any
  
  if (subcategories.length === 0) {
    console.log(`[getProductsForDesignation] ⚠️ No active subcategories found for company, returning empty array`)
    return []
  }
  
  // Filter to only valid subcategory IDs (those that exist and are active)
  const validSubcategoryIds = subcategories.map((s: any) => s._id)
  console.log(`[getProductsForDesignation] Valid subcategories: ${validSubcategoryIds.length}`)
  
  // ============================================================
  // STEP 6: GET PRODUCT-SUBCATEGORY MAPPINGS (COMPANY-SCOPED)
  // ============================================================
  const productMappings = await ProductSubcategoryMapping.find({
    subCategoryId: { $in: validSubcategoryIds },
    companyId: 
    company._id
  })
    .populate('productId', 'id name category categoryId gender price image sku')
    .lean() as any
  
  
  if (productMappings.length === 0) {
    console.log(`[getProductsForDesignation] ⚠️ No products mapped to eligible subcategories, returning empty array`)
    return []
  }
  
  // ============================================================
  // STEP 7: EXTRACT PRODUCT IDs FROM MAPPINGS
  // ============================================================
  const eligibleProductIds = new Set<string>()
  const productMappingDetails: Array<{ productId: string; subcategoryId: string; subcategoryName: string }> = []
  
  productMappings.forEach((mapping: any) => {
    const productId = mapping.productId?._id?.toString() || mapping.productId?.toString()
    const subcategoryId = mapping.subCategoryId?._id?.toString() || mapping.subCategoryId?.toString()
    const subcategoryName = mapping.subCategoryId?.name || 'Unknown'
    
    if (productId) {
      eligibleProductIds.add(productId)
      // Also add as ObjectId string for matching
      if (mongoose.Types.ObjectId.isValid(productId)) {
        eligibleProductIds.add(new mongoose.Types.ObjectId(productId).toString())
      }
      productMappingDetails.push({ productId, subcategoryId, subcategoryName })
    }
  })
  
  console.log(`[getProductsForDesignation] Unique eligible product IDs: ${eligibleProductIds.size}`)
  
  // ============================================================
  // STEP 8: FETCH PRODUCTS BY ID (EFFICIENT QUERY)
  // ============================================================
  const productObjectIds = Array.from(eligibleProductIds)
    .filter(id => mongoose.Types.ObjectId.isValid(id))
    .map(id => new mongoose.Types.ObjectId(id))
  
  if (productObjectIds.length === 0) {
    console.log(`[getProductsForDesignation] ⚠️ No valid product ObjectIds, returning empty array`)
    return []
  }
  
  // Fetch products using Mongoose for proper population and decryption
  const products = await Uniform.find({
    _id: { $in: productObjectIds }
  })
    .populate('vendorId', 'id name')
    .lean() as any
  
  
  // ============================================================
  // STEP 9: APPLY GENDER FILTER (IF SPECIFIED)
  // ============================================================
  let filteredProducts = products
  
  if (gender) {
    filteredProducts = products.filter((product: any) => {
      const productGender = product.gender || 'unisex'
      return productGender === gender || productGender === 'unisex'
    })
    console.log(`[getProductsForDesignation] After gender filter (${gender}): ${filteredProducts.length} products`)
  }
  
  // ============================================================
  // STEP 10: ENHANCE PRODUCTS WITH MAPPING INFORMATION
  // ============================================================
  // Create a map of productId -> subcategory info for reference
  const productSubcategoryMap = new Map<string, string[]>()
  productMappingDetails.forEach(({ productId, subcategoryName }) => {
    if (!productSubcategoryMap.has(productId)) {
      productSubcategoryMap.set(productId, [])
    }
    productSubcategoryMap.get(productId)!.push(subcategoryName)
  })
  
  // Add subcategory information to products (optional, for debugging/reference)
  const enhancedProducts = filteredProducts.map((product: any) => {
    const productId = product._id?.toString()
    const subcategories = productSubcategoryMap.get(productId) || []
    return {
      ...product,
      _eligibleSubcategories: subcategories // For debugging/reference only
    }
  })
  
  console.log(`[getProductsForDesignation] ✅ Returning ${enhancedProducts.length} products`)
  console.log(`[getProductsForDesignation] Products:`, enhancedProducts.map((p: any) => ({
    id: p.id,
    name: p.name,
    subcategories: p._eligibleSubcategories
  })))
  console.log(`[getProductsForDesignation] ========================================`)
  
  return enhancedProducts
}

// ========== PRODUCT FEEDBACK FUNCTIONS ==========

/**
 * Create product feedback
 * @param feedbackData Feedback data
 * @returns Created feedback
 */
export async function createProductFeedback(feedbackData: {
  orderId: string
  productId: string
  employeeId: string
  companyId: string
  vendorId?: string
  rating: number
  comment?: string
}): Promise<any> {
  await connectDB()
  
  // Get employee
  const employee = await Employee.findOne({
    $or: [
      { employeeId: feedbackData.employeeId },
      { id: feedbackData.employeeId }
    ]
  }).lean() as any
  
  if (!employee) {
    throw new Error(`Employee not found: ${feedbackData.employeeId}`)
  }
  
  // Get company
  const company = await Company.findOne({
    $or: [
      { id: feedbackData.companyId },
      { _id: mongoose.Types.ObjectId.isValid(feedbackData.companyId) ? new mongoose.Types.ObjectId(feedbackData.companyId) : null }
    ]
  }).lean()
  
    throw new Error(`Company not found: ${feedbackData.companyId}`)
  }
  
  // Get order to verify it belongs to employee and is delivered
  // Handle both parent order IDs and split order IDs
  let order = await Order.findOne({ id: feedbackData.orderId }).lean() as any
  let isParentOrder = false
  
  // If found order has a parentOrderId, it's a child order (split order)
  // If found order doesn't have parentOrderId but has split orders, it's a parent
  if (order && !order.parentOrderId) {
    // Check if this is a parent order with split children
    const splitOrders = await Order.find({ parentOrderId: feedbackData.orderId }).lean() as any
    if (splitOrders.length > 0) {
      // This is a parent order, find the specific split order that contains the product
      isParentOrder = true
      for (const splitOrder of splitOrders) {
        const hasProduct = splitOrder.items?.some((item: any) => {
          const itemProductId = item.productId || (item.uniformId?.toString()) || (item.uniformId?.id)
          return itemProductId === feedbackData.productId
        })
        if (hasProduct) {
          order = splitOrder
          console.log(`[createProductFeedback] Found split child order for product:`, {
            parentOrderId: feedbackData.orderId,
            childOrderId: splitOrder.id,
            childOrderStatus: splitOrder.status,
            productId: feedbackData.productId
          })
          break
        }
      }
    }
  }
  
  // If not found, check if it's a parent order ID and find the specific split order
  if (!order && feedbackData.orderId.startsWith('ORD-')) {
    // Check if this looks like a split order ID (has format: ORD-timestamp-vendorId)
    // If it contains a dash after the timestamp, it might be a split order
    const parts = feedbackData.orderId.split('-')
    if (parts.length >= 3) {
      // This is likely a split order ID, try exact match again with trimmed ID
      const trimmedId = feedbackData.orderId.trim()
      order = await Order.findOne({ id: trimmedId }).lean() as any
    }
    
    // If still not found, try to find split orders with this as parentOrderId
    if (!order) {
      const splitOrders = await Order.find({ parentOrderId: feedbackData.orderId }).lean() as any
      
      if (splitOrders.length > 0) {
        // Find the specific split order that contains the product
        for (const splitOrder of splitOrders) {
          const hasProduct = splitOrder.items?.some((item: any) => {
            const itemProductId = item.productId || (item.uniformId?.toString()) || (item.uniformId?.id)
            return itemProductId === feedbackData.productId
          })
          if (hasProduct) {
            order = splitOrder
            console.log(`[createProductFeedback] Found split child order (fallback):`, {
              parentOrderId: feedbackData.orderId,
              childOrderId: splitOrder.id,
              childOrderStatus: splitOrder.status,
              productId: feedbackData.productId
            })
            break
          }
        }
      }
    }
  }
  
  if (!order) {
    console.error(`[createProductFeedback] Order not found:`, {
      orderId: feedbackData.orderId,
      productId: feedbackData.productId,
      employeeId: feedbackData.employeeId,
      employeeIdStr: 
    employee._id?.toString()
    })
    throw new Error(`Order not found: ${feedbackData.orderId}. Please ensure the order is delivered and belongs to you.`)
  }
  
  console.log(`[createProductFeedback] Order found:`, {
    orderId: order.id,
    status: order.status,
    statusType: typeof order.status,
    parentOrderId: order.parentOrderId,
    isSplitOrder: !!order.parentOrderId,
    itemCount: order.items?.length
  })
  
  // Verify order belongs to employee
  const employeeIdStr = (employee._id || employee.id).toString()
  const orderEmployeeIdStr = order.employeeId?.toString()
  
  // Handle both ObjectId and string comparisons
  const employeeObjectId = employee._id || (mongoose.Types.ObjectId.isValid(employee.id) ? new mongoose.Types.ObjectId(employee.id) : null)
  const orderEmployeeObjectId = order.employeeId || (order.employeeId && mongoose.Types.ObjectId.isValid(order.employeeId) ? new mongoose.Types.ObjectId(order.employeeId) : null)
  
  const employeeMatches = 
    employeeIdStr === orderEmployeeIdStr ||
    (employeeObjectId && orderEmployeeObjectId && employeeObjectId.equals(orderEmployeeObjectId)) ||
    (order.employeeIdNum && (order.employeeIdNum === employee.employeeId || order.employeeIdNum === employee.id))
  
  if (!employeeMatches) {
    console.error(`[createProductFeedback] Order employee mismatch:`, {
      orderId: order.id,
      orderEmployeeId: orderEmployeeIdStr,
      orderEmployeeIdNum: order.employeeIdNum,
      employeeId: employeeIdStr,
      employeeIdNum: 
    employee.employeeId || 
    employee.id
    })
    throw new Error('Order does not belong to employee')
  }
  
  // Verify order is delivered
  // Normalize status: trim whitespace and handle case variations
  const normalizedStatus = order.status?.toString().trim()
  const isDelivered = normalizedStatus === 'Delivered' || normalizedStatus?.toLowerCase() === 'delivered'
  
  console.log(`[createProductFeedback] Order status check:`, {
    orderId: order.id,
    rawStatus: order.status,
    normalizedStatus: normalizedStatus,
    isDelivered: isDelivered,
    statusType: typeof order.status
  })
  
  if (!isDelivered) {
    console.error(`[createProductFeedback] Order status validation failed:`, {
      orderId: order.id,
      status: order.status,
      normalizedStatus: normalizedStatus,
      expected: 'Delivered',
      allOrderFields: Object.keys(order)
    })
    throw new Error(`Feedback can only be submitted for delivered orders. Current order status: "${order.status || 'Unknown'}"`)
  }
  
  // Verify product is in order
  const orderItem = order.items?.find((item: any) => {
    const itemProductId = item.productId || (item.uniformId?.toString()) || (item.uniformId?.id) || (typeof item.uniformId === 'object' && item.uniformId?.id)
    return itemProductId === feedbackData.productId
  })
  
  if (!orderItem) {
    console.error(`[createProductFeedback] Product not found in order:`, {
      orderId: order.id,
      productId: feedbackData.productId,
      orderItems: order.items?.map((item: any) => ({
        productId: item.productId,
        uniformId: item.uniformId?.toString(),
        uniformName: item.uniformName
      }))
    })
    throw new Error(`Product not found in order. Please ensure you're submitting feedback for a product in this order.`)
  }
  
  // Get uniform/product
  const uniform = await Uniform.findOne({
    $or: [
      { id: feedbackData.productId },
      { _id: mongoose.Types.ObjectId.isValid(feedbackData.productId) ? new mongoose.Types.ObjectId(feedbackData.productId) : null }
    ]
  }).lean()
  
  const actualOrderId = order.id
  
  // Check if feedback already exists for this order+product+employee combination
  // This ensures one feedback per product per order per employee
  const existingFeedback = await ProductFeedback.findOne({
    orderId: actualOrderId,
    productId: feedbackData.productId,
    employeeId: 
    employee._id
  }).lean() as any
  
  if (existingFeedback) {
    throw new Error('Feedback already submitted for this product')
  }
  
  // Get vendorId - try from order first, then from ProductVendor relationship
  let vendorId: mongoose.Types.ObjectId | undefined = undefined
  
  if (order.vendorId) {
    // VendorId exists in order
    vendorId = typeof order.vendorId === 'object' 
      ? order.vendorId 
      : new mongoose.Types.ObjectId(order.vendorId)
    console.log(`[createProductFeedback] Using vendorId from order: ${vendorId}`)
  } else if (uniform?._id) {
    // Try to get vendorId from ProductVendor relationship
    const db = mongoose.connection.db
       if (!db) {
    throw new Error('Database connection not available')
  }
  if (db) {
      const productVendorLink = await db.collection('productvendors').findOne({ 
        productId: uniform._id 
      })
      
      if (productVendorLink && productVendorLink.vendorId) {
        vendorId = typeof productVendorLink.vendorId === 'object'
          ? productVendorLink.vendorId
          : new mongoose.Types.ObjectId(productVendorLink.vendorId)
        console.log(`[createProductFeedback] Using vendorId from ProductVendor relationship: ${vendorId}`)
      } else {
        console.warn(`[createProductFeedback] No vendorId found in order or ProductVendor relationship for product: ${feedbackData.productId}`)
      }
    }
  }
  
  // Create feedback
  const feedback = new ProductFeedback({
    orderId: actualOrderId,
    productId: feedbackData.productId,
    uniformId: uniform?._id,
    employeeId: 
    employee._id,
    employeeIdNum: 
    employee.employeeId || 
    employee.id,
    companyId: 
    company._id,
    companyIdNum: typeof 
    company.id === 'string' ? parseInt(company.id) : 
    company.id,
    vendorId: vendorId,
    rating: feedbackData.rating,
    comment: feedbackData.comment || undefined,
  })
  
  await feedback.save()
  return toPlainObject(feedback)
}

/**
 * Get feedback with role-based access control
 * @param userEmail User email
 * @param filters Optional filters (orderId, productId, employeeId, companyId, vendorId)
 * @returns Array of feedback
 */
export async function getProductFeedback(
  userEmail: string,
  filters?: {
    orderId?: string
    productId?: string
    employeeId?: string
    companyId?: string
    vendorId?: string
  }
): Promise<any[]> {
  try {
    await connectDB()
  } catch (error: any) {
    console.error('[getProductFeedback] Database connection error:', error.message)
    throw new Error(`Database connection failed: ${error.message}`)
  }
  
  // Find user by email
  const { encrypt, decrypt } = require('../utils/encryption')
  const trimmedEmail = userEmail.trim()
  let encryptedEmail: string
  
  try {
    encryptedEmail = encrypt(trimmedEmail)
  } catch (error) {
    encryptedEmail = ''
  }
  
  // FIRST: Check if user is a Company Admin (most privileged role)
  // This must be checked BEFORE employee lookup to handle edge cases
  console.log(`[getProductFeedback] Checking Company Admin status first for: ${trimmedEmail}`)
  const db = mongoose.connection.db
     if (!db) {
    throw new Error('Database connection not available')
  }
  let companyId: string | null = null
  let isCompanyAdminUser = false
  let employee: any = null
  
  // Get all companies and check if user is admin of any
  const allCompanies = await Company.find({}).lean() as any
  for (const company of allCompanies) {
    const adminCheck = await isCompanyAdmin(trimmedEmail, company.id)
    if (adminCheck) {
      companyId = company.id
      isCompanyAdminUser = true
      console.log(`[getProductFeedback] ✅ Found Company Admin - email: ${trimmedEmail}, companyId: ${companyId}, companyName: ${company.name}`)
      
      // Get employee record from CompanyAdmin
      const adminRecords = await db.collection('companyadmins').find({ 
        companyId: 
    company._id 
      }).toArray()
      
      // Find the admin record that matches this email
      for (const adminRecord of adminRecords) {
        if (adminRecord.employeeId) {
          const emp = await Employee.findById(adminRecord.employeeId).lean() as any
          if (emp) {
            // Verify this employee's email matches
            let empEmailMatches = false
            if (emp.email === encryptedEmail) {
              empEmailMatches = true
            } else if (emp.email) {
              try {
                const decryptedEmpEmail = decrypt(emp.email)
                if (decryptedEmpEmail.toLowerCase() === trimmedEmail.toLowerCase()) {
                  empEmailMatches = true
                }
              } catch (error) {
                // Continue checking
              }
            }
            
            if (empEmailMatches) {
              employee = emp
              console.log(`[getProductFeedback] Found employee record for Company Admin - employeeId: ${employee._id}`)
              break
            }
          }
        }
      }
      break
    }
  }
  
  // If not Company Admin, check if user is a vendor
  if (!isCompanyAdminUser) {
    // Try case-insensitive email search for vendor
    let vendor = await Vendor.findOne({ 
      email: { $regex: new RegExp(`^${trimmedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    }).lean()
    
    if (!vendor) {
      const allVendors = await Vendor.find({}).lean() as any
      for (const v of allVendors) {
        if (v.email && v.email.trim().toLowerCase() === trimmedEmail.toLowerCase()) {
          vendor = v
          break
        }
      }
    }
    
    if (vendor) {
      // Vendor can see feedback for their products
      const query: any = {}
      if (filters?.vendorId) {
        query.vendorId = mongoose.Types.ObjectId.isValid(filters.vendorId) ? new mongoose.Types.ObjectId(filters.vendorId) : null
      } else {
        query.vendorId = vendor._id
      }
      if (filters?.productId) {
        query.productId = filters.productId
      }
      
      const feedback = await ProductFeedback.find(query)
        .populate('employeeId', 'id employeeId firstName lastName')
        .populate('companyId', 'id name')
        .populate('uniformId', 'id name')
        .populate('vendorId', 'id name')
        .sort({ createdAt: -1 })
        .lean() as any
      
      return feedback.map((f: any) => toPlainObject(f))
    }
  }
  
  // If not Company Admin and not Vendor, try to find as employee
  if (!employee && !isCompanyAdminUser) {
    // Try finding with encrypted email first
    employee = await Employee.findOne({ email: encryptedEmail }).lean() as any
    
    // If not found, try decryption matching
    if (!employee && encryptedEmail) {
      const allEmployees = await Employee.find({}).lean() as any
      for (const emp of allEmployees) {
        if (emp.email && typeof emp.email === 'string') {
          try {
            const decryptedEmail = decrypt(emp.email)
            if (decryptedEmail.toLowerCase() === trimmedEmail.toLowerCase()) {
              employee = emp
              break
            }
          } catch (error) {
            continue
          }
        }
      }
    }
    
    if (!employee) {
      throw new Error('User not found')
    }
    
    // Employee found - get companyId and check if Company Admin
    const employeeIdStr = (employee._id || employee.id).toString()
    companyId = employee.companyId ? (typeof 
    employee.companyId === 'object' ? 
    employee.companyId.id : 
    employee.companyId) : null
    
    // If companyId is an ObjectId string, try to find the company by _id and get its id
    if (companyId && typeof companyId === 'string' && mongoose.Types.ObjectId.isValid(companyId) && companyId.length === 24) {
      const companyForIdConversion = await Company.findById(companyId).select('id').lean() as any
      if (companyForIdConversion) {
        companyId = (companyForIdConversion as any).id
        console.log(`[getProductFeedback] Converted ObjectId companyId to string ID: ${companyId}`)
      }
    }
    
    // Check if Company Admin
    if (companyId) {
      isCompanyAdminUser = await isCompanyAdmin(trimmedEmail, companyId)
      console.log(`[getProductFeedback] Company Admin check - email: ${trimmedEmail}, companyId: ${companyId}, isAdmin: ${isCompanyAdminUser}`)
    } else {
      console.warn(`[getProductFeedback] No companyId found for employee: ${employeeIdStr}`)
    }
  }
  
  // Check if Location Admin
  const location = await getLocationByAdminEmail(trimmedEmail)
  const isLocationAdminUser = !!location
  let locationEmployees: any[] = [] // Store for debugging later
  
  // Build query based on role
  const query: any = {}
  
  if (isCompanyAdminUser && companyId) {
    // Company Admin can see all feedback for their company
    console.log(`[getProductFeedback] Processing Company Admin request - companyId: ${companyId}, email: ${trimmedEmail}`)
    
    const companyForAdmin = await Company.findOne({ id: companyId }).lean() as any
    if (companyForAdmin) {
      query.companyId = (companyForAdmin as any)._id
      console.log(`[getProductFeedback] Company Admin query - companyId: ${companyId}, 
    company._id: ${(companyForAdmin as any)._id}, 
    company.name: ${(companyForAdmin as any).name}`)
    } else {
      console.error(`[getProductFeedback] Company not found for Company Admin - companyId: ${companyId}`)
      // Try alternative lookup methods
      const companyByObjectId = mongoose.Types.ObjectId.isValid(companyId) 
        ? await Company.findById(companyId).lean() as any
        : null
      if (companyByObjectId) {
        query.companyId = companyByObjectId._id
        console.log(`[getProductFeedback] Found company by ObjectId lookup - companyId: ${companyByObjectId.id}, name: ${companyByObjectId.name}`)
      } else {
        // Last resort: Find company by checking CompanyAdmin records
        console.log(`[getProductFeedback] Trying to find company via CompanyAdmin records...`)
        const db = mongoose.connection.db
           if (!db) {
    throw new Error('Database connection not available')
  }
  const employeeIdStr = employee._id.toString()
        const adminRecords = await db.collection('companyadmins').find({ 
          employeeId: 
    employee._id 
        }).toArray()
        
        if (adminRecords.length > 0) {
          const adminRecord = adminRecords[0]
          const companyFromAdmin = await Company.findById(adminRecord.companyId).lean() as any
          if (companyFromAdmin) {
            query.companyId = (companyFromAdmin as any)._id
            companyId = (companyFromAdmin as any).id
            console.log(`[getProductFeedback] Found company via CompanyAdmin record - companyId: ${companyId}, name: ${(companyFromAdmin as any).name}`)
          } else {
            console.error(`[getProductFeedback] Company not found by any method - returning empty array`)
            return []
          }
        } else {
          console.error(`[getProductFeedback] No CompanyAdmin records found for employee - returning empty array`)
          return []
        }
      }
    }
    if (filters?.orderId) {
      query.orderId = filters.orderId
    }
    if (filters?.productId) {
      query.productId = filters.productId
    }
    if (filters?.employeeId) {
      const filterEmployee = await Employee.findOne({
        $or: [
          { employeeId: filters.employeeId },
          { id: filters.employeeId }
        ]
      }).lean() as any
      if (filterEmployee) {
        query.employeeId = filterEmployee._id
      }
    }
    
    // IMPORTANT: Also match by companyIdNum as fallback
    // Some feedback records may have companyId as ObjectId but companyIdNum matches
    // Get companyForAdmin from the variable scope (might be set in the if/else above)
    let companyForQuery = companyForAdmin
    if (!companyForQuery && query.companyId) {
      // Try to find company by the _id we're querying
      companyForQuery = await Company.findById(query.companyId).lean() as any
    }
    
    if (companyForQuery && companyForQuery.id && query.companyId) {
      const companyIdNum = typeof companyForQuery.id === 'string' 
        ? parseInt(companyForQuery.id) 
        : companyForQuery.id
      
      // Use $or to match either by companyId ObjectId OR companyIdNum
      const companyIdObjectId = query.companyId
      query.$or = [
        { companyId: companyIdObjectId },
        { companyIdNum: companyIdNum }
      ]
      // Remove the direct companyId since we're using $or
      delete query.companyId
      console.log(`[getProductFeedback] Using $or query to match by companyId ObjectId OR companyIdNum:`, {
        companyIdObjectId: companyIdObjectId.toString(),
        companyIdNum: companyIdNum
      })
    }
  } else if (isLocationAdminUser && location) {
    // Location Admin can see feedback only if setting is enabled
    console.log(`[getProductFeedback] 🔍 Location Admin detected - location:`, {
      locationId: 
    location.id,
      locationName: 
    location.name,
      locationCompanyId: 
    (location as any).companyId,
      locationCompanyIdType: typeof 
    (location as any).companyId,
      locationCompanyIdId: 
    (location as any).companyId?.id,
      locationCompanyId_id: 
    (location as any).companyId?._id?.toString()
    })
    
    // Get company ID from location - handle both populated and non-populated cases
    let locationCompanyIdStr: string | null = null
    if ((location as any).companyId) {
      if (typeof (location as any).companyId === 'object' && (location as any).companyId !== null) {
        // Populated company object
        locationCompanyIdStr = (location as any).companyId.id || null
      } else if (typeof (location as any).companyId === 'string') {
        // Check if it's a company ID string (6-digit) or ObjectId string (24 hex)
        if (/^\d{6}$/.test((location as any).companyId)) {
          locationCompanyIdStr = (location as any).companyId
        } else if (mongoose.Types.ObjectId.isValid((location as any).companyId)) {
          // It's an ObjectId - need to find company
          const companyByObjectId = await Company.findById((location as any).companyId).select('id').lean() as any
        }
      }
    }
    
    if (!locationCompanyIdStr) {
      console.error(`[getProductFeedback] ❌ Could not determine company ID from location`)
      return []
    }
    
    console.log(`[getProductFeedback] 🔍 Location company ID: ${locationCompanyIdStr}`)
    
    // Get company and check setting
    const companyForLocationAdmin = await Company.findOne({ id: locationCompanyIdStr }).lean() as any
    if (!companyForLocationAdmin) {
      console.error(`[getProductFeedback] ❌ Company not found for Location Admin - companyId: ${locationCompanyIdStr}`)
      return []
    }
    
    console.log(`[getProductFeedback] 🔍 Company found: ${(companyForLocationAdmin as any).name} (${(companyForLocationAdmin as any).id})`)
    console.log(`[getProductFeedback] 🔍 allowLocationAdminViewFeedback setting:`, companyForLocationAdmin.allowLocationAdminViewFeedback)
    
    if (!companyForLocationAdmin.allowLocationAdminViewFeedback) {
      // Setting is OFF - return empty array
      console.log(`[getProductFeedback] ❌ Location Admin access denied - setting is OFF`)
      return []
    }
    
    // Setting is ON - Location Admin can see feedback ONLY for employees in their location
    console.log(`[getProductFeedback] ✅ Location Admin access granted - filtering by location: ${location.id} (${location.name})`)
    
    // Get location ObjectId - location from getLocationByAdminEmail should have _id
    let locationObjectId = null
    if (location._id) {
      locationObjectId = typeof 
    location._id === 'string' ? new mongoose.Types.ObjectId(location._id) : 
    location._id
    } else if (location.id) {
      // If _id is not present, find location by id to get _id
      const locationDoc = await Location.findOne({ id: 
    location.id }).select('_id').lean() as any
        locationObjectId = locationDoc._id
      }
    }
    
    if (!locationObjectId) {
      console.error(`[getProductFeedback] ❌ Location has no _id or id - cannot filter employees. Location:`, location)
      return []
    }
    
    console.log(`[getProductFeedback] 🔍 Location ObjectId: ${locationObjectId.toString()}`)
    
    // Find all employees in this location using location ObjectId
    locationEmployees = await Employee.find({ locationId: locationObjectId })
      .select('_id employeeId id firstName lastName')
      .lean() as any
    
    
    if (locationEmployees.length === 0) {
      // No employees in this location - return empty array
      console.log(`[getProductFeedback] ⚠️ No employees found in location - returning empty array`)
      return []
    }
    
    // Log employee details for debugging
    const { decrypt } = require('../utils/encryption')
    console.log(`[getProductFeedback] 🔍 Employees in location:`)
    locationEmployees.slice(0, 5).forEach((emp: any) => {
      let firstName = emp.firstName
      let lastName = emp.lastName
      try {
        firstName = decrypt(firstName)
        lastName = decrypt(lastName)
      } catch (e) {
        // Not encrypted
      }
      console.log(`  - ${firstName} ${lastName} (${emp.employeeId || emp.id}) - locationId: ${emp.locationId?.toString() || 'none'}`)
    })
    
    // Get employee ObjectIds
    // Get employee string IDs
    const employeeIds = locationEmployees.map((e: any) => e.id || e.employeeId).filter((id: any) => id)
    
    // Filter feedback to only include feedback from employees in this location
    // IMPORTANT: Use $in for employeeId to match multiple employees
    query.employeeId = { $in: employeeIds }
    // Also filter by company to ensure we only get feedback for this company
    query.companyId = (companyForLocationAdmin as any).id
    
    // Remove any $or that might have been set earlier (for Company Admin)
    if (query.$or) {
      delete query.$or
    }
    
    if (filters?.orderId) {
      query.orderId = filters.orderId
    }
    if (filters?.productId) {
      query.productId = filters.productId
    }
    
    // IMPORTANT: Also match by companyIdNum as fallback (similar to Company Admin)
    // Some feedback records may have companyId as ObjectId but companyIdNum matches
    const companyIdNum = typeof (companyForLocationAdmin as any).id === 'string' 
      ? parseInt((companyForLocationAdmin as any).id) 
      : (companyForLocationAdmin as any).id
    
    // Use $or to match either by companyId ObjectId OR companyIdNum
    // But keep employeeId filter separate (not in $or)
    const companyIdObjectId = companyForLocationAdmin._id
    query.$or = [
      { companyId: companyIdObjectId },
      { companyIdNum: companyIdNum }
    ]
    // Remove the direct companyId since we're using $or
    delete query.companyId
    
    console.log(`[getProductFeedback] ✅ Location Admin query built with $or:`, {
      location: location.id,
      locationName: location.name,
      employeeCount: employeeIds.length,
      companyId: (companyForLocationAdmin as any).id,
      companyIdNum: companyIdNum,
      companyName: (companyForLocationAdmin as any).name,
      employeeIds: employeeIds.slice(0, 3),
      queryStructure: {
        employeeId: '$in with ' + employeeObjectIds.length + ' employees',
        $or: 'companyId ObjectId OR companyIdNum'
      }
    })
  } else {
    // Regular employee can only see their own feedback
    query.employeeId = employee._id
    if (filters?.orderId) {
      query.orderId = filters.orderId
    }
    if (filters?.productId) {
      query.productId = filters.productId
    }
  }
  
  // Convert ObjectId in query to ensure proper matching
  if (query.companyId && typeof query.companyId === 'object') {
    // Already an ObjectId, keep it
  } else if (query.companyId && typeof query.companyId === 'string' && mongoose.Types.ObjectId.isValid(query.companyId)) {
    query.companyId = new mongoose.Types.ObjectId(query.companyId)
  }
  
  // Ensure query is not empty
  const hasQueryParams = Object.keys(query).length > 0
  if (!hasQueryParams) {
    console.warn(`[getProductFeedback] Empty query - returning empty array`)
    return []
  }
  
  try {
    console.log(`[getProductFeedback] Query:`, {
      companyId: query.companyId?.toString(),
      employeeId: query.employeeId?.toString(),
      orderId: query.orderId,
      productId: query.productId,
      vendorId: query.vendorId?.toString()
    })
  } catch (logError) {
    console.log(`[getProductFeedback] Query built (logging failed)`)
  }
  
  let feedback: any[] = []
  try {
    console.log(`[getProductFeedback] Executing query with:`, {
      companyId: query.companyId?.toString(),
      employeeId: query.employeeId?.toString(),
      orderId: query.orderId,
      productId: query.productId,
      vendorId: query.vendorId?.toString(),
      isCompanyAdmin: isCompanyAdminUser,
      isLocationAdmin: isLocationAdminUser
    })
    
    // Fetch feedback with population
    // Note: populate('vendorId') will return null if vendorId is null in DB, not an empty object
    // Log the full query including $or
    const queryForLog = {
      ...query,
      companyId: query.companyId?.toString(),
      employeeId: query.employeeId?.toString(),
      $or: query.$or ? query.$or.map((or: any) => ({
        companyId: or.companyId?.toString(),
        companyIdNum: or.companyIdNum
      })) : undefined
    }
    console.log(`[getProductFeedback] 🔍 Executing query:`, JSON.stringify(queryForLog, null, 2))
    
    // For Location Admin: Log detailed query structure
    if (isLocationAdminUser) {
      console.log(`[getProductFeedback] 🔍 Location Admin query details:`, {
        hasEmployeeIdFilter: !!query.employeeId,
        employeeIdType: typeof query.employeeId,
        employeeIdIsIn: query.employeeId && typeof query.employeeId === 'object' && '$in' in query.employeeId,
        employeeIdInCount: query.employeeId && typeof query.employeeId === 'object' && '$in' in query.employeeId 
          ? (query.employeeId.$in?.length || 0) 
          : 0,
        hasOr: !!query.$or,
        orConditions: query.$or ? query.$or.map((or: any) => ({
          companyId: or.companyId?.toString(),
          companyIdNum: or.companyIdNum
        })) : null,
        fullQueryKeys: Object.keys(query)
      })
    }
    
    // BEFORE query: Check if the specific feedback exists and what its companyId is
    const specificFeedbackCheck = await ProductFeedback.findOne({ 
      orderId: 'ORD-1765652961649-4ZMRWCRMB-100001' 
    })
      .populate('companyId', 'id name')
      .lean() as any
    
    if (specificFeedbackCheck) {
      console.log(`[getProductFeedback] 🔍 SPECIFIC FEEDBACK CHECK - Found feedback ORD-1765652961649-4ZMRWCRMB-100001:`, {
        _id: specificFeedbackCheck._id?.toString(),
        orderId: specificFeedbackCheck.orderId,
        companyId: specificFeedbackCheck.companyId?._id?.toString() || specificFeedbackCheck.companyId?.toString(),
        companyIdNum: specificFeedbackCheck.companyIdNum,
        companyName: specificFeedbackCheck.companyId?.name,
        companyIdFromQuery: query.companyId?.toString(),
        queryHasOr: !!query.$or,
        orConditions: query.$or ? query.$or.map((or: any) => ({
          companyId: or.companyId?.toString(),
          companyIdNum: or.companyIdNum
        })) : null
      })
      
      // Test if this feedback would match the query
      const testQuery = { ...query }
      const wouldMatch = await ProductFeedback.findOne({
        _id: specificFeedbackCheck._id,
        ...testQuery
      }).lean() as any
      
      console.log(`[getProductFeedback] 🔍 Would this feedback match the query?`, {
        wouldMatch: !!wouldMatch,
        testQuery: JSON.stringify({
          ...testQuery,
          companyId: testQuery.companyId?.toString(),
          employeeId: testQuery.employeeId?.toString(),
          $or: testQuery.$or ? testQuery.$or.map((or: any) => ({
            companyId: or.companyId?.toString(),
            companyIdNum: or.companyIdNum
          })) : undefined
        }, null, 2)
      })
    } else {
      console.warn(`[getProductFeedback] 🔍 SPECIFIC FEEDBACK CHECK - Feedback ORD-1765652961649-4ZMRWCRMB-100001 NOT FOUND in database`)
    }
    
    feedback = await ProductFeedback.find(query)
      .populate('employeeId', 'id employeeId firstName lastName')
      .populate('companyId', 'id name')
      .populate('uniformId', 'id name')
      .populate({
        path: 'vendorId',
        select: 'id name',
        model: 'Vendor'
      })
      .sort({ createdAt: -1 })
      .lean() as any
    
    
    // Location Admin specific debugging
    if (isLocationAdminUser && location) {
      console.log(`[getProductFeedback] 🔍 Location Admin query results:`, {
        locationId: location.id,
        locationName: location.name,
        feedbackCount: feedback.length,
        feedbackOrderIds: feedback.map((f: any) => f.orderId).slice(0, 5),
        feedbackEmployees: feedback.slice(0, 3).map((f: any) => ({
          orderId: f.orderId,
          employeeId: f.employeeId?.employeeId || f.employeeId?.id || f.employeeId,
          employeeName: f.employeeId?.firstName && f.employeeId?.lastName 
            ? `${f.employeeId.firstName} ${f.employeeId.lastName}` 
            : 'N/A'
        }))
      })
      
      // Verify all feedback belongs to location employees
      if (feedback.length > 0) {
        const feedbackEmployeeIds = feedback
          .map((f: any) => f.employeeId?._id?.toString() || f.employeeId?.toString())
          .filter((id: any) => id)
        
        const locationEmployeeIds = locationEmployees.map((e: any) => e._id.toString())
        const allInLocation = feedbackEmployeeIds.every((id: string) => locationEmployeeIds.includes(id))
        
        console.log(`[getProductFeedback] 🔍 Location Admin feedback validation:`, {
          feedbackEmployeeIds: feedbackEmployeeIds.slice(0, 3),
          locationEmployeeIds: locationEmployeeIds.slice(0, 3),
          allInLocation: allInLocation,
          feedbackCount: feedback.length,
          locationEmployeeCount: locationEmployees.length
        })
        
        if (!allInLocation && feedback.length > 0) {
          console.warn(`[getProductFeedback] ⚠️ WARNING: Some feedback employees are not in location!`)
        }
      }
    }
    
    // Check if the specific feedback is in the results
    const specificOrderId = 'ORD-1765652961649-4ZMRWCRMB-100001'
    const foundInResults = feedback.find((f: any) => f.orderId === specificOrderId)
    console.log(`[getProductFeedback] 🔍 Is ORD-1765652961649-4ZMRWCRMB-100001 in results?`, {
      found: !!foundInResults,
      totalResults: feedback.length,
      orderIds: feedback.map((f: any) => f.orderId)
    })
    
    // Debug: Check if the missing feedback would match the query
    if (isCompanyAdminUser && !foundInResults) {
      const missingFeedbackOrderId = 'ORD-1765652961649-4ZMRWCRMB-100001'
      const missingFeedbackCheck = await ProductFeedback.findOne({ 
        orderId: missingFeedbackOrderId 
      })
        .populate('companyId', 'id name')
        .lean() as any
      
      if (missingFeedbackCheck) {
        const queryCompanyId = query.companyId?.toString() || (query.$or && query.$or[0]?.companyId?.toString())
        const queryCompanyIdNum = query.$or && query.$or[1]?.companyIdNum
        
        console.log(`[getProductFeedback] 🔍 DEBUG: Missing feedback analysis for ${missingFeedbackOrderId}:`, {
          feedbackCompanyId: missingFeedbackCheck.companyId?._id?.toString() || missingFeedbackCheck.companyId?.toString(),
          feedbackCompanyIdNum: missingFeedbackCheck.companyIdNum,
          feedbackCompanyName: missingFeedbackCheck.companyId?.name,
          queryCompanyId: queryCompanyId,
          queryCompanyIdNum: queryCompanyIdNum,
          queryHasOr: !!query.$or,
          matchesById: missingFeedbackCheck.companyId?._id?.toString() === queryCompanyId || missingFeedbackCheck.companyId?.toString() === queryCompanyId,
          matchesByNum: missingFeedbackCheck.companyIdNum === queryCompanyIdNum,
          queryStructure: JSON.stringify({
            ...query,
            companyId: query.companyId?.toString(),
            $or: query.$or ? query.$or.map((or: any) => ({
              companyId: or.companyId?.toString(),
              companyIdNum: or.companyIdNum
            })) : undefined
          }, null, 2)
        })
        
        // Test direct query match with $or
        if (query.$or) {
          const directMatchTest = await ProductFeedback.findOne({
            orderId: missingFeedbackOrderId,
            $or: query.$or
          }).lean() as any
          console.log(`[getProductFeedback] 🔍 Direct $or query test:`, {
            matches: !!directMatchTest,
            orConditions: query.$or.map((or: any) => ({
              companyId: or.companyId?.toString(),
              companyIdNum: or.companyIdNum
            }))
          })
        }
        
        // Test if it matches by companyId ObjectId
        if (query.companyId) {
          const directMatchById = await ProductFeedback.findOne({
            orderId: missingFeedbackOrderId,
            companyId: query.companyId
          }).lean() as any
          console.log(`[getProductFeedback] 🔍 Direct companyId ObjectId test:`, {
            matches: !!directMatchById,
            queryCompanyId: query.companyId.toString()
          })
        }
        
        // Also check by companyIdNum
        if (missingFeedbackCheck.companyIdNum) {
          const companyForNumCheck = await Company.findOne({ id: companyId }).lean() as any
          if (companyForNumCheck) {
            const companyIdNumMatch = typeof (companyForNumCheck as any).id === 'string' 
              ? parseInt((companyForNumCheck as any).id) === missingFeedbackCheck.companyIdNum
              : (companyForNumCheck as any).id === missingFeedbackCheck.companyIdNum
            console.log(`[getProductFeedback] 🔍 DEBUG: companyIdNum check:`, {
              feedbackCompanyIdNum: missingFeedbackCheck.companyIdNum,
              companyIdNum: (companyForNumCheck as any).id,
              matches: companyIdNumMatch
            })
          }
        }
      } else {
        console.warn(`[getProductFeedback] 🔍 DEBUG: Missing feedback ${missingFeedbackOrderId} not found in database`)
      }
    }
    if (feedback.length > 0) {
      const vendorStats = {
        hasVendorId: feedback.filter(f => f.vendorId && f.vendorId.name).length,
        nullVendorId: feedback.filter(f => f.vendorId === null || f.vendorId === undefined).length,
        emptyVendorId: feedback.filter(f => f.vendorId && !f.vendorId.name).length
      }
      console.log(`[getProductFeedback] VendorId population stats:`, vendorStats)
    }
    
    console.log(`[getProductFeedback] Found ${feedback.length} feedback records`)
    
    // Debug: Log sample feedback structure
    if (feedback.length > 0) {
      const sample = feedback[0]
      console.log(`[getProductFeedback] Sample feedback structure:`, {
        hasVendorId: !!sample.vendorId,
        vendorIdType: typeof sample.vendorId,
        vendorIdValue: sample.vendorId,
        hasUniformId: !!sample.uniformId,
        uniformIdType: typeof sample.uniformId,
        uniformIdValue: sample.uniformId,
        hasEmployeeId: !!sample.employeeId,
        employeeIdType: typeof sample.employeeId,
        employeeIdValue: sample.employeeId,
        employeeIdIsObject: typeof sample.employeeId === 'object' && sample.employeeId !== null,
        employeeFirstName: sample.employeeId?.firstName,
        employeeLastName: sample.employeeId?.lastName,
        employeeIdKeys: sample.employeeId && typeof sample.employeeId === 'object' ? Object.keys(sample.employeeId) : []
      })
      
      // Check all feedback records for employee data
      const employeeStats = {
        hasEmployeeId: feedback.filter(f => f.employeeId).length,
        hasFirstName: feedback.filter(f => f.employeeId?.firstName).length,
        hasLastName: feedback.filter(f => f.employeeId?.lastName).length,
        hasFullName: feedback.filter(f => f.employeeId?.firstName && f.employeeId?.lastName).length,
        nullEmployeeId: feedback.filter(f => !f.employeeId || f.employeeId === null).length
      }
      console.log(`[getProductFeedback] Employee data stats:`, employeeStats)
    }
    
    // Post-process: Fill in missing vendorIds from ProductVendor relationships
    // CRITICAL: This ensures Company Admin always sees vendor information
    // OPTIMIZED: Batch process to avoid blocking
    const db = mongoose.connection.db
       if (!db) {
    throw new Error('Database connection not available')
  }
  if (db && feedback.length > 0) {
      console.log(`[getProductFeedback] Post-processing ${feedback.length} feedback records for vendorId population`)
      
      // Batch process: Only process feedback missing vendorId, limit to prevent blocking
      const feedbackNeedingVendor = feedback.filter(fb => {
        const hasValidVendorId = fb.vendorId && 
          typeof fb.vendorId === 'object' && 
          fb.vendorId !== null &&
          !Array.isArray(fb.vendorId) &&
          fb.vendorId.name && 
          typeof fb.vendorId.name === 'string' &&
          fb.vendorId.name.trim() !== '' &&
          fb.vendorId.name !== 'null' &&
          fb.vendorId.name !== 'undefined'
        return !hasValidVendorId
      })
      
      console.log(`[getProductFeedback] ${feedbackNeedingVendor.length} feedback records need vendorId population`)
      
      // Process in parallel batches to avoid blocking
      // PRIORITY 1: Try to get vendorId from Order (most reliable)
      // PRIORITY 2: Fall back to ProductVendor relationship
      if (feedbackNeedingVendor.length > 0) {
        // STEP 1: Try to get vendorId from orders (batch lookup)
        console.log(`[getProductFeedback] 🔍 DEBUG: Sample feedback orderIds:`, 
          feedbackNeedingVendor.slice(0, 3).map(fb => ({
            feedbackId: fb._id?.toString(),
            orderId: fb.orderId,
            orderIdType: typeof fb.orderId,
            orderIdLength: fb.orderId?.length
          })))
        
        const orderIds = feedbackNeedingVendor
          .map(fb => fb.orderId)
          .filter((id): id is string => !!id && typeof id === 'string')
        
        if (orderIds.length > 0) {
          console.log(`[getProductFeedback] 🔍 DEBUG: Looking up vendorId from ${orderIds.length} orders`)
          console.log(`[getProductFeedback] 🔍 DEBUG: Order IDs to search:`, orderIds.slice(0, 3), orderIds.length > 3 ? `... (${orderIds.length - 3} more)` : '')
          
          // Try multiple query strategies
          let orders: any[] = []
          
          // Strategy 1: Direct id match
          orders = await Order.find({ id: { $in: orderIds } })
            .select('id vendorId')
            .lean() as any
          
          // Strategy 2: If no matches, try exact string match (case sensitive)
          if (orders.length === 0) {
            console.log(`[getProductFeedback] 🔍 DEBUG: Strategy 1 failed, trying individual queries...`)
            for (const orderId of orderIds.slice(0, 2)) { // Test first 2
              const testOrder = await Order.findOne({ id: orderId }).select('id vendorId').lean() as any
              if (testOrder) {
                console.log(`[getProductFeedback] 🔍 DEBUG: Found order with direct findOne:`, {
                  searchedId: orderId,
                  foundId: (testOrder as any).id,
                  hasVendorId: !!(testOrder as any).vendorId,
                  vendorIdType: typeof (testOrder as any).vendorId,
                  vendorIdValue: (testOrder as any).vendorId
                })
              } else {
                console.log(`[getProductFeedback] 🔍 DEBUG: Order NOT found with id:`, orderId)
                // Try to find any order with similar pattern
                const similarOrders = await Order.find({ id: { $regex: orderId.substring(0, 20) } })
                  .select('id vendorId')
                  .limit(3)
                  .lean() as any
                console.log('Similar orders:', similarOrders.map((o: any) => ({ id: o.id, hasVendorId: !!o.vendorId })))
              }
            }
          }
          
          // Strategy 3: Try using the raw MongoDB collection
          if (orders.length === 0) {
            console.log(`[getProductFeedback] 🔍 DEBUG: Trying raw MongoDB collection query...`)
            const db = mongoose.connection.db
               if (!db) {
    throw new Error('Database connection not available')
  }
  if (db) {
              const rawOrders = await db.collection('orders').find({ id: { $in: orderIds } })
                .project({ id: 1, vendorId: 1 })
                .toArray()
              console.log(`[getProductFeedback] 🔍 DEBUG: Raw collection query found ${rawOrders.length} orders`)
              if (rawOrders.length > 0) {
                console.log(`[getProductFeedback] 🔍 DEBUG: Sample raw order:`, {
                  id: rawOrders[0].id,
                  vendorId: rawOrders[0].vendorId,
                  vendorIdType: typeof rawOrders[0].vendorId,
                  _id: rawOrders[0]._id
                })
                orders = rawOrders
              }
            }
          }
          
          console.log(`[getProductFeedback] 🔍 DEBUG: Total orders found: ${orders.length}`)
          if (orders.length > 0) {
            console.log(`[getProductFeedback] 🔍 DEBUG: Sample order structure:`, {
              id: orders[0].id,
              vendorId: orders[0].vendorId,
              vendorIdType: typeof orders[0].vendorId,
              vendorIdIsObject: typeof orders[0].vendorId === 'object',
              vendorIdIsObjectId: orders[0].vendorId instanceof mongoose.Types.ObjectId
            })
          }
          
          const orderVendorMap = new Map<string, any>()
          const vendorIdsFromOrders = new Set<string>()
          
          for (const order of orders) {
            if (order.vendorId) {
              let vendorIdStr: string
              if (typeof order.vendorId === 'object') {
                if (order.vendorId._id) {
                  vendorIdStr = order.vendorId._id.toString()
                } else if (order.vendorId.toString) {
                  vendorIdStr = order.vendorId.toString()
                } else {
                  console.warn(`[getProductFeedback] 🔍 DEBUG: Order ${order.id} has vendorId object but can't extract string:`, order.vendorId)
                  continue
                }
              } else {
                vendorIdStr = order.vendorId.toString()
              }
              
              orderVendorMap.set(order.id, vendorIdStr)
              vendorIdsFromOrders.add(vendorIdStr)
              console.log(`[getProductFeedback] 🔍 DEBUG: Mapped order ${order.id} -> vendorId ${vendorIdStr}`)
            } else {
              console.warn(`[getProductFeedback] 🔍 DEBUG: Order ${order.id} has no vendorId`)
            }
          }
          
          console.log(`[getProductFeedback] 🔍 DEBUG: Order-vendor mapping: ${orderVendorMap.size} mappings, ${vendorIdsFromOrders.size} unique vendors`)
          
          // Get all vendors in database for fallback (do this once, outside the loop)
          const allVendors = await Vendor.find({}).select('_id id name').lean() as any
          if (allVendors.length > 0) {
            console.log(`[getProductFeedback] 🔍 DEBUG: Sample of existing vendors:`, 
              allVendors.slice(0, 5).map((v: any) => ({ _id: v._id.toString(), id: v.id, name: v.name })))
          } else {
            console.warn(`[getProductFeedback] 🔍 DEBUG: ⚠️ NO VENDORS EXIST IN DATABASE!`)
          }
          
          // Batch lookup vendors from orders
          if (vendorIdsFromOrders.size > 0) {
            const vendorIdArray = Array.from(vendorIdsFromOrders)
            console.log(`[getProductFeedback] 🔍 DEBUG: Vendor IDs to lookup:`, vendorIdArray)
            
            const vendorObjectIds = vendorIdArray
              .filter(id => {
                const isValid = mongoose.Types.ObjectId.isValid(id)
                if (!isValid) {
                  console.warn(`[getProductFeedback] 🔍 DEBUG: Invalid ObjectId: ${id}`)
                }
                return isValid
              })
              .map(id => new mongoose.Types.ObjectId(id))
            
            console.log(`[getProductFeedback] 🔍 DEBUG: Looking up ${vendorObjectIds.length} vendors (${vendorIdsFromOrders.size} unique vendor IDs)`)
            console.log(`[getProductFeedback] 🔍 DEBUG: Vendor ObjectIds:`, vendorObjectIds.map(id => id.toString()))
            
            // Strategy 1: Try Mongoose query
            let vendorsFromOrders = await Vendor.find({ _id: { $in: vendorObjectIds } })
              .select('id name')
              .lean() as any
            
            
            // Strategy 2: If no results, try individual findById queries (more reliable)
            if (vendorsFromOrders.length === 0 && vendorObjectIds.length > 0) {
              console.log(`[getProductFeedback] 🔍 DEBUG: Strategy 1 failed, trying individual findById queries...`)
              const individualVendors: any[] = []
              
              for (const vendorObjectId of vendorObjectIds) {
                try {
                  // Try findById first
                  let vendor = await Vendor.findById(vendorObjectId).select('id name').lean()
                  
                  if (vendor) {
                    individualVendors.push(vendor)
                    console.log(`[getProductFeedback] 🔍 DEBUG: ✅ Found vendor ${vendorObjectId} with findById: ${vendor.name || 'no name'}`)
                  } else {
                    // Try finding by _id as string
                    const vendorIdStr = vendorObjectId.toString()
                    vendor = await Vendor.findOne({ _id: vendorIdStr }).select('id name').lean()
                    
                    if (vendor) {
                      individualVendors.push(vendor)
                      console.log(`[getProductFeedback] 🔍 DEBUG: ✅ Found vendor ${vendorIdStr} with findOne(_id as string): ${vendor.name || 'no name'}`)
                    } else {
                      // Try finding by id field (not _id)
                      vendor = await Vendor.findOne({ id: vendorIdStr }).select('id name').lean()
                      
                      if (vendor) {
                        individualVendors.push(vendor)
                        console.log(`[getProductFeedback] 🔍 DEBUG: ✅ Found vendor ${vendorIdStr} with findOne(id field): ${vendor.name || 'no name'}`)
                      } else {
                        console.warn(`[getProductFeedback] 🔍 DEBUG: ❌ Vendor ${vendorObjectId} not found with any Mongoose query`)
                      }
                    }
                  }
                } catch (error: any) {
                  console.error(`[getProductFeedback] 🔍 DEBUG: Error finding vendor ${vendorObjectId}:`, error.message)
                }
              }
              
              if (individualVendors.length > 0) {
                vendorsFromOrders = individualVendors
                console.log(`[getProductFeedback] 🔍 DEBUG: Strategy 2 (individual findById) found ${vendorsFromOrders.length} vendors`)
              }
            }
            
            // Strategy 3: If still no results, try raw MongoDB collection
            if (vendorsFromOrders.length === 0) {
              console.log(`[getProductFeedback] 🔍 DEBUG: Strategy 2 failed, trying raw MongoDB collection...`)
              const db = mongoose.connection.db
                 if (!db) {
    throw new Error('Database connection not available')
  }
  if (db) {
                // First, check what collections exist
                const collections = await db.listCollections().toArray()
                const vendorCollectionNames = collections
                  .map(c => c.name)
                  .filter(name => name.toLowerCase().includes('vendor'))
                console.log(`[getProductFeedback] 🔍 DEBUG: Collections with 'vendor' in name:`, vendorCollectionNames)
                
                // Try the standard 'vendors' collection
                let rawVendors = await db.collection('vendors').find({ 
                  _id: { $in: vendorObjectIds } 
                })
                  .project({ id: 1, name: 1, _id: 1 })
                  .toArray()
                
                console.log(`[getProductFeedback] 🔍 DEBUG: Raw 'vendors' collection query found ${rawVendors.length} vendors`)
                
                // If no results, try individual lookups with detailed debugging
                if (rawVendors.length === 0) {
                  console.log(`[getProductFeedback] 🔍 DEBUG: Trying individual raw collection lookups with detailed debugging...`)
                  const individualRawVendors: any[] = []
                  
                  for (const vendorObjectId of vendorObjectIds) {
                    try {
                      // Try exact _id match
                      let rawVendor = await db.collection('vendors').findOne({ _id: vendorObjectId })
                      
                      if (rawVendor) {
                        individualRawVendors.push(rawVendor)
                        console.log(`[getProductFeedback] 🔍 DEBUG: ✅ Found vendor in raw collection with _id ObjectId:`, {
                          _id: 
    rawVendor._id,
                          _idType: typeof 
    rawVendor._id,
                          id: 
    rawVendor.id,
                          name: 
    rawVendor.name
                        })
                      } else {
                        // Try as string
                        const vendorIdStr = vendorObjectId.toString()
                        rawVendor = await db.collection('vendors').findOne({ _id: vendorIdStr })
                        
                        if (rawVendor) {
                          individualRawVendors.push(rawVendor)
                          console.log(`[getProductFeedback] 🔍 DEBUG: ✅ Found vendor with _id as string:`, {
                            _id: 
    rawVendor._id,
                            _idType: typeof 
    rawVendor._id,
                            id: 
    rawVendor.id,
                            name: 
    rawVendor.name
                          })
                        } else {
                          // Try finding by id field
                          rawVendor = await db.collection('vendors').findOne({ id: vendorIdStr })
                          
                          if (rawVendor) {
                            individualRawVendors.push(rawVendor)
                            console.log(`[getProductFeedback] 🔍 DEBUG: ✅ Found vendor with id field:`, {
                              _id: 
    rawVendor._id,
                              id: 
    rawVendor.id,
                              name: 
    rawVendor.name
                            })
                          } else {
                            // Debug: Check what _id values actually exist in the collection
                            const sampleVendors = await db.collection('vendors').find({}).limit(5).toArray()
                            console.log(`[getProductFeedback] 🔍 DEBUG: Sample vendor _id types in collection:`, 
                              sampleVendors.map((v: any) => ({
                                _id: v._id,
                                _idType: typeof v._id,
                                _idIsObjectId: v._id instanceof mongoose.Types.ObjectId,
                                id: v.id,
                                name: v.name
                              })))
                            
                            console.warn(`[getProductFeedback] 🔍 DEBUG: ❌ Vendor ${vendorObjectId} (${vendorIdStr}) not found with any query method`)
                          }
                        }
                      }
                    } catch (error: any) {
                      console.error(`[getProductFeedback] 🔍 DEBUG: Error in raw lookup ${vendorObjectId}:`, error.message, error.stack)
                    }
                  }
                  
                  if (individualRawVendors.length > 0) {
                    vendorsFromOrders = individualRawVendors
                    console.log(`[getProductFeedback] 🔍 DEBUG: Strategy 3 (individual raw) found ${vendorsFromOrders.length} vendors`)
                  }
                } else {
                  vendorsFromOrders = rawVendors
                  console.log(`[getProductFeedback] 🔍 DEBUG: Strategy 3 (raw $in) found ${vendorsFromOrders.length} vendors`)
                }
              }
            }
            
            console.log(`[getProductFeedback] 🔍 DEBUG: Found ${vendorsFromOrders.length} vendors`)
            
            const vendorMap = new Map<string, any>()
            for (const vendor of vendorsFromOrders) {
              if (vendor) {
                const vendorIdStr = vendor._id.toString()
                if (vendor.name) {
                  vendorMap.set(vendorIdStr, {
                    _id: vendor._id,
                    id: 
    vendor.id,
                    name: 
    vendor.name
                  })
                  console.log(`[getProductFeedback] 🔍 DEBUG: Mapped vendor ${vendorIdStr} -> ${vendor.name}`)
                } else {
                  console.warn(`[getProductFeedback] 🔍 DEBUG: Vendor ${vendorIdStr} found but has no name`)
                }
              }
            }
            
            // Apply vendorId from orders to feedback
            // FALLBACK: If vendor lookup fails, still use the vendorId ObjectId from order
            let ordersMatched = 0
            for (const fb of feedbackNeedingVendor) {
              if (fb.orderId) {
                const hasMapping = orderVendorMap.has(fb.orderId)
                console.log(`[getProductFeedback] 🔍 DEBUG: Feedback ${fb._id} orderId ${fb.orderId} has mapping: ${hasMapping}`)
                
                if (hasMapping) {
                  const vendorIdStr = orderVendorMap.get(fb.orderId)!
                  const vendor = vendorMap.get(vendorIdStr)
                  
                  console.log(`[getProductFeedback] 🔍 DEBUG: Feedback ${fb._id} vendorIdStr ${vendorIdStr} -> vendor:`, !!vendor, vendor ? 
    vendor.name : 'NOT FOUND')
                  
                  if (vendor) {
                    // Full vendor object with name
                    fb.vendorId = vendor
                    ordersMatched++
                    console.log(`[getProductFeedback] 🔍 DEBUG: ✅ Applied vendor ${vendor.name} to feedback ${fb._id}`)
                    // Update database asynchronously
                    ProductFeedback.updateOne(
                      { _id: fb._id },
                      { $set: { vendorId: 
    vendor._id } }
                    ).catch(err => console.error(`[getProductFeedback] Error updating feedback ${fb._id} from order:`, err))
                  } else {
                    // FALLBACK: Vendor not found in lookup, but we have vendorId from order
                    // The vendor might not exist, but we should still try ProductVendor as fallback
                    console.warn(`[getProductFeedback] 🔍 DEBUG: ⚠️ Vendor ${vendorIdStr} not found in batch lookup`)
                    
                    // FALLBACK: Try to find vendor through ProductVendor relationship
                    // This is more reliable since ProductVendor should have valid vendorIds
                    let foundViaProductVendor = false
                    if (fb.uniformId) {
                      try {
                        const db = mongoose.connection.db
                           if (!db) {
    throw new Error('Database connection not available')
  }
  if (db) {
                          // Extract uniformId ObjectId
                          let uniformObjectId: mongoose.Types.ObjectId | null = null
                          
                          if (fb.uniformId._id) {
                            uniformObjectId = typeof fb.uniformId._id === 'object' && fb.uniformId._id instanceof mongoose.Types.ObjectId
                              ? fb.uniformId._id
                              : new mongoose.Types.ObjectId(fb.uniformId._id.toString())
                          } else if (fb.uniformId instanceof mongoose.Types.ObjectId) {
                            uniformObjectId = fb.uniformId
                          } else if (typeof fb.uniformId === 'string' && mongoose.Types.ObjectId.isValid(fb.uniformId)) {
                            uniformObjectId = new mongoose.Types.ObjectId(fb.uniformId)
                          } else if (typeof fb.uniformId === 'object' && fb.uniformId._id) {
                            uniformObjectId = new mongoose.Types.ObjectId(fb.uniformId._id.toString())
                          }
                          
                          if (uniformObjectId) {
                            console.log(`[getProductFeedback] 🔍 DEBUG: Trying ProductVendor lookup for uniform ${uniformObjectId}`)
                            const productVendorLink = await db.collection('productvendors').findOne({ 
                              productId: uniformObjectId 
                            })
                            
                            if (productVendorLink && productVendorLink.vendorId) {
                              const productVendorIdStr = productVendorLink.vendorId.toString()
                              console.log(`[getProductFeedback] 🔍 DEBUG: Found ProductVendor link with vendorId: ${productVendorIdStr}`)
                              
                              // Try to find this vendor
                              const productVendor = await Vendor.findById(productVendorIdStr).select('id name').lean() as any
                              if (productVendor) {
                                fb.vendorId = {
                                  _id: (productVendor as any)._id,
                                  id: (productVendor as any).id,
                                  name: (productVendor as any).name
                                }
                                ordersMatched++
                                foundViaProductVendor = true
                                console.log(`[getProductFeedback] 🔍 DEBUG: ✅ Found vendor via ProductVendor: ${(productVendor as any).name}`)
                                // Update database
                                ProductFeedback.updateOne(
                                  { _id: fb._id },
                                  { $set: { vendorId: (productVendor as any)._id } }
                                ).catch(err => console.error(`[getProductFeedback] Error updating feedback ${fb._id} from ProductVendor:`, err))
                              } else {
                                console.warn(`[getProductFeedback] 🔍 DEBUG: ProductVendor vendorId ${productVendorIdStr} also doesn't exist`)
                              }
                            } else {
                              console.warn(`[getProductFeedback] 🔍 DEBUG: No ProductVendor link found for uniform ${uniformObjectId}`)
                            }
                          } else {
                            console.warn(`[getProductFeedback] 🔍 DEBUG: Could not extract uniformId ObjectId from:`, fb.uniformId)
                          }
                        }
                      } catch (productVendorError: any) {
                        console.error(`[getProductFeedback] 🔍 DEBUG: Error in ProductVendor fallback:`, productVendorError.message)
                      }
                    }
                    
                    // Only set placeholder if ProductVendor also failed
                    if (!foundViaProductVendor) {
                      // Do NOT use fallback vendor - show "Unknown" if vendor cannot be found
                      // This allows proper troubleshooting to identify the correct vendor
                      if (mongoose.Types.ObjectId.isValid(vendorIdStr)) {
                        const vendorObjectId = new mongoose.Types.ObjectId(vendorIdStr)
                        // Set "Unknown" vendor so it's clear the vendor needs to be identified
                        fb.vendorId = {
                          _id: vendorObjectId,
                          id: 'unknown',
                          name: 'Unknown'
                        }
                        // Do NOT update database - keep the original vendorId ObjectId for troubleshooting
                        console.warn(`[getProductFeedback] 🔍 DEBUG: ⚠️ Vendor ${vendorIdStr} not found - showing "Unknown" for feedback ${fb._id}`)
                        console.warn(`[getProductFeedback] 🔍 DEBUG: OrderId: ${fb.orderId}, ProductId: ${fb.productId}, UniformId: ${fb.uniformId?.name || fb.uniformId?._id}`)
                      } else {
                        // Invalid vendorId - set to null/unknown
                        fb.vendorId = {
                          _id: null,
                          id: 'unknown',
                          name: 'Unknown'
                        }
                        console.warn(`[getProductFeedback] 🔍 DEBUG: ⚠️ Invalid vendorId format: ${vendorIdStr} - showing "Unknown"`)
                      }
                    }
                  }
                } else {
                  console.warn(`[getProductFeedback] 🔍 DEBUG: ⚠️ No order mapping found for orderId ${fb.orderId} (feedback ${fb._id})`)
                }
              } else {
                console.warn(`[getProductFeedback] 🔍 DEBUG: ⚠️ Feedback ${fb._id} has no orderId`)
              }
            }
            console.log(`[getProductFeedback] ✅ Populated vendorId from orders for ${ordersMatched} feedback records`)
          } else {
            console.warn(`[getProductFeedback] 🔍 DEBUG: ⚠️ No vendorIds extracted from ${orders.length} orders`)
          }
        }
        
        // STEP 2: For feedback still missing vendorId, try ProductVendor relationship
        const stillNeedingVendor = feedbackNeedingVendor.filter(fb => {
          const hasValidVendorId = fb.vendorId && 
            typeof fb.vendorId === 'object' && 
            fb.vendorId !== null &&
            !Array.isArray(fb.vendorId) &&
            fb.vendorId.name && 
            typeof fb.vendorId.name === 'string' &&
            fb.vendorId.name.trim() !== '' &&
            fb.vendorId.name !== 'null' &&
            fb.vendorId.name !== 'undefined'
          return !hasValidVendorId
        })
        
        if (stillNeedingVendor.length > 0) {
          console.log(`[getProductFeedback] ${stillNeedingVendor.length} feedback records still need vendorId, trying ProductVendor lookup`)
          
          // Get all uniformIds that need vendor lookup
          const uniformIdsToLookup = new Map<string, any>()
          
          for (const fb of stillNeedingVendor) {
            let uniformObjectId = null
            if (fb.uniformId) {
              if (typeof fb.uniformId === 'object' && fb.uniformId._id) {
                uniformObjectId = fb.uniformId._id.toString()
              } else if (fb.uniformId instanceof mongoose.Types.ObjectId) {
                uniformObjectId = fb.uniformId.toString()
              } else if (typeof fb.uniformId === 'string' && mongoose.Types.ObjectId.isValid(fb.uniformId)) {
                uniformObjectId = fb.uniformId
              }
            }
            if (uniformObjectId) {
              if (!uniformIdsToLookup.has(uniformObjectId)) {
                uniformIdsToLookup.set(uniformObjectId, [])
              }
              uniformIdsToLookup.get(uniformObjectId)!.push(fb)
            }
          }
          
          // Batch lookup all ProductVendor relationships at once
          if (uniformIdsToLookup.size > 0) {
            const uniformObjectIds = Array.from(uniformIdsToLookup.keys()).map(id => new mongoose.Types.ObjectId(id))
            const productVendorLinks = await db.collection('productvendors')
              .find({ productId: { $in: uniformObjectIds } })
              .toArray()
            
            // Batch lookup all vendors at once
            const uniqueVendorIds = [...new Set(productVendorLinks
              .filter(link => link.vendorId)
              .map(link => link.vendorId.toString()))]
              .map(id => new mongoose.Types.ObjectId(id))
            
            const vendors = await Vendor.find({ _id: { $in: uniqueVendorIds } })
              .select('id name')
              .lean() as any
            
            for (const vendor of vendors) {
              if (vendor && vendor.name) {
                vendorIdMap.set(
    vendor._id.toString(), {
                  _id: 
    vendor._id,
                  id: 
    vendor.id,
                  name: 
    vendor.name
                })
              }
            }
            
            // Apply vendorId to all feedback records from ProductVendor
            let productVendorMatched = 0
            for (const [uniformIdStr, feedbackList] of uniformIdsToLookup.entries()) {
              const uniformObjectId = new mongoose.Types.ObjectId(uniformIdStr)
              const link = productVendorLinks.find(l => l.productId.toString() === uniformObjectId.toString())
              
              if (link && link.vendorId) {
                const vendorIdStr = link.vendorId.toString()
                const vendor = vendorIdMap.get(vendorIdStr)
                
                if (vendor) {
                  for (const fb of feedbackList) {
                    // Only update if still missing vendorId
                    const stillMissing = !fb.vendorId || 
                      !fb.vendorId.name || 
                      fb.vendorId.name.trim() === ''
                    if (stillMissing) {
                      fb.vendorId = vendor
                      productVendorMatched++
                      // Update database asynchronously
                      ProductFeedback.updateOne(
                        { _id: fb._id },
                        { $set: { vendorId: 
    vendor._id } }
                      ).catch(err => console.error(`[getProductFeedback] Error updating feedback ${fb._id} from ProductVendor:`, err))
                    }
                  }
                }
              }
            }
            console.log(`[getProductFeedback] ✅ Populated vendorId from ProductVendor for ${productVendorMatched} feedback records`)
          }
        }
      }
    }
    
    // Decrypt employee fields (firstName, lastName are encrypted)
    const { decrypt } = require('../utils/encryption')
    for (const fb of feedback) {
      if (fb.employeeId) {
        const sensitiveFields = ['firstName', 'lastName']
        for (const field of sensitiveFields) {
          if (fb.employeeId[field] && typeof fb.employeeId[field] === 'string' && fb.employeeId[field].includes(':')) {
            try {
              fb.employeeId[field] = decrypt(fb.employeeId[field])
              console.log(`[getProductFeedback] Decrypted employee ${field} for feedback ${fb._id}`)
            } catch (error) {
              console.warn(`[getProductFeedback] Failed to decrypt employee ${field} for feedback ${fb._id}:`, error)
            }
          }
        }
      }
    }
    
    // Final verification: Ensure all feedback has vendorId populated (especially for Company Admin)
    if (isCompanyAdminUser && feedback.length > 0) {
      const feedbackWithoutVendor = feedback.filter(fb => !fb.vendorId || !fb.vendorId.name)
      if (feedbackWithoutVendor.length > 0) {
        console.warn(`[getProductFeedback] ⚠️ WARNING: ${feedbackWithoutVendor.length} feedback records still missing vendorId for Company Admin`)
        for (const fb of feedbackWithoutVendor) {
          console.warn(`[getProductFeedback] Missing vendorId for feedback:`, {
            feedbackId: fb._id,
            orderId: fb.orderId,
            productId: fb.productId,
            uniformId: fb.uniformId?.name || fb.uniformId?._id
          })
        }
      } else {
        console.log(`[getProductFeedback] ✅ All ${feedback.length} feedback records have vendorId populated for Company Admin`)
      }
    }
    
    // Additional debug: Check populated fields
    if (feedback.length > 0) {
      const sampleFeedback = feedback[0]
      console.log(`[getProductFeedback] Final sample feedback:`, {
        feedbackId: sampleFeedback._id?.toString(),
        orderId: sampleFeedback.orderId,
        productId: sampleFeedback.productId,
        vendorId: sampleFeedback.vendorId ? {
          name: sampleFeedback.vendorId.name,
          id: sampleFeedback.vendorId.id,
          _id: sampleFeedback.vendorId._id?.toString(),
          isValid: !!(sampleFeedback.vendorId.name && sampleFeedback.vendorId.name.trim() !== '')
        } : null,
        employeeId: sampleFeedback.employeeId ? {
          firstName: sampleFeedback.employeeId.firstName,
          lastName: sampleFeedback.employeeId.lastName,
          id: sampleFeedback.employeeId.id
        } : null,
        uniformId: sampleFeedback.uniformId ? {
          name: sampleFeedback.uniformId.name,
          id: sampleFeedback.uniformId.id,
          _id: sampleFeedback.uniformId._id?.toString()
        } : null
      })
    }
  } catch (queryError: any) {
    console.error(`[getProductFeedback] Error executing query:`, queryError.message)
    console.error(`[getProductFeedback] Error stack:`, queryError.stack)
    console.error(`[getProductFeedback] Query that failed:`, JSON.stringify({
      companyId: query.companyId?.toString(),
      employeeId: query.employeeId?.toString(),
      orderId: query.orderId,
      productId: query.productId,
      vendorId: query.vendorId?.toString()
    }, null, 2))
    throw new Error(`Failed to fetch product feedback: ${queryError.message}`)
  }
  
  // If no feedback found and we're querying by companyId, try a more flexible query
  if (feedback.length === 0 && query.companyId) {
    console.log(`[getProductFeedback] No feedback found with strict query, trying alternative query...`)
    // Get company once for all fallback queries
    const companyForFallback = await Company.findOne({ _id: query.companyId }).lean() as any
    
    if (companyForFallback && (companyForFallback as any).id) {
      // Try querying with companyIdNum as well (fallback)
      const companyIdNum = typeof (companyForFallback as any).id === 'string' ? parseInt((companyForFallback as any).id) : (companyForFallback as any).id
      const altQuery: any = {}
      if (query.employeeId) altQuery.employeeId = query.employeeId
      if (query.orderId) altQuery.orderId = query.orderId
      if (query.productId) altQuery.productId = query.productId
      if (query.vendorId) altQuery.vendorId = query.vendorId
      altQuery.companyIdNum = companyIdNum
      
      const altFeedback = await ProductFeedback.find(altQuery)
        .populate('employeeId', 'id employeeId firstName lastName')
        .populate('companyId', 'id name')
        .populate('uniformId', 'id name')
        .populate('vendorId', 'id name')
        .sort({ createdAt: -1 })
        .lean() as any
      
      // Post-process: Fill in missing vendorIds
      // PRIORITY 1: Try to get vendorId from Order (most reliable)
      // PRIORITY 2: Fall back to ProductVendor relationship
      const dbForAlt = mongoose.connection.db
      if (altFeedback.length > 0 && dbForAlt) {
        // STEP 1: Try to get vendorId from orders (batch lookup)
        const altFeedbackNeedingVendor = altFeedback.filter(fb => {
          const hasVendorId = fb.vendorId && 
            typeof fb.vendorId === 'object' && 
            fb.vendorId !== null &&
            !Array.isArray(fb.vendorId) &&
            fb.vendorId.name && 
            typeof fb.vendorId.name === 'string' &&
            fb.vendorId.name.trim() !== '' &&
            fb.vendorId.name !== 'null' &&
            fb.vendorId.name !== 'undefined'
          return !hasVendorId
        })
        
        if (altFeedbackNeedingVendor.length > 0) {
          const altOrderIds = altFeedbackNeedingVendor
            .map(fb => fb.orderId)
            .filter((id): id is string => !!id && typeof id === 'string')
          
          if (altOrderIds.length > 0) {
            console.log(`[getProductFeedback] [Alt Query] Looking up vendorId from ${altOrderIds.length} orders`)
            const altOrders = await Order.find({ id: { $in: altOrderIds } })
              .select('id vendorId')
              .lean() as any
            
            const altVendorIdsFromOrders = new Set<string>()
            
            for (const order of altOrders) {
              if (order.vendorId) {
                const vendorIdStr = typeof order.vendorId === 'object' && order.vendorId._id 
                  ? order.vendorId._id.toString() 
                  : order.vendorId.toString()
                altOrderVendorMap.set(order.id, vendorIdStr)
                altVendorIdsFromOrders.add(vendorIdStr)
              }
            }
            
            // Batch lookup vendors from orders
            if (altVendorIdsFromOrders.size > 0) {
              const altVendorObjectIds = Array.from(altVendorIdsFromOrders).map(id => new mongoose.Types.ObjectId(id))
              const altVendorsFromOrders = await Vendor.find({ _id: { $in: altVendorObjectIds } })
                .select('id name')
                .lean() as any
              
              for (const vendor of altVendorsFromOrders) {
                if (vendor && vendor.name) {
                  altVendorMap.set(
    vendor._id.toString(), {
                    _id: 
    vendor._id,
                    id: 
    vendor.id,
                    name: 
    vendor.name
                  })
                }
              }
              
              // Apply vendorId from orders to feedback
              let altOrdersMatched = 0
              for (const fb of altFeedbackNeedingVendor) {
                if (fb.orderId && altOrderVendorMap.has(fb.orderId)) {
                  const vendorIdStr = altOrderVendorMap.get(fb.orderId)!
                  const vendor = altVendorMap.get(vendorIdStr)
                  
                  if (vendor) {
                    fb.vendorId = vendor
                    altOrdersMatched++
                    // Update database asynchronously
                    ProductFeedback.updateOne(
                      { _id: fb._id },
                      { $set: { vendorId: 
    vendor._id } }
                    ).catch(err => console.error(`[getProductFeedback] [Alt Query] Error updating feedback ${fb._id} from order:`, err))
                  }
                }
              }
              console.log(`[getProductFeedback] [Alt Query] ✅ Populated vendorId from orders for ${altOrdersMatched} feedback records`)
            }
          }
          
          // STEP 2: For feedback still missing vendorId, try ProductVendor relationship
          const altStillNeedingVendor = altFeedbackNeedingVendor.filter(fb => {
            const hasValidVendorId = fb.vendorId && 
              typeof fb.vendorId === 'object' && 
              fb.vendorId !== null &&
              !Array.isArray(fb.vendorId) &&
              fb.vendorId.name && 
              typeof fb.vendorId.name === 'string' &&
              fb.vendorId.name.trim() !== '' &&
              fb.vendorId.name !== 'null' &&
              fb.vendorId.name !== 'undefined'
            return !hasValidVendorId
          })
          
          if (altStillNeedingVendor.length > 0) {
            console.log(`[getProductFeedback] [Alt Query] ${altStillNeedingVendor.length} feedback records still need vendorId, trying ProductVendor lookup`)
            
            for (const fb of altStillNeedingVendor) {
              // Get uniformId ObjectId - when using .lean(), populated fields are plain objects
              let uniformObjectId = null
              
              if (fb.uniformId) {
                if (typeof fb.uniformId === 'object' && fb.uniformId._id) {
                  uniformObjectId = fb.uniformId._id
                } else if (fb.uniformId instanceof mongoose.Types.ObjectId) {
                  uniformObjectId = fb.uniformId
                } else if (typeof fb.uniformId === 'string') {
                  uniformObjectId = new mongoose.Types.ObjectId(fb.uniformId)
                }
              }
              
              if (!uniformObjectId && fb.uniformId) {
                const rawFeedback = await ProductFeedback.findById(fb._id).select('uniformId').lean() as any
                  uniformObjectId = (rawFeedback as any).uniformId
                }
              }
              
              if (uniformObjectId) {
                const productVendorLink = await dbForAlt.collection('productvendors').findOne({ 
                  productId: uniformObjectId 
                })
                
                if (productVendorLink && productVendorLink.vendorId) {
                  const vendor = await Vendor.findById(productVendorLink.vendorId)
                    .select('id name')
                    .lean() as any
                  
                    await ProductFeedback.updateOne(
                      { _id: fb._id },
                      { $set: { vendorId: vendor._id } }
                    )
                    
                    fb.vendorId = {
                      _id: 
    vendor._id,
                      id: 
    vendor.id,
                      name: 
    vendor.name
                    }
                    console.log(`[getProductFeedback] [Alt Query] ✅ Populated vendorId for alt feedback ${fb._id}: ${vendor.name}`)
                  }
                }
              }
            }
          }
        }
      }
      
      // Decrypt employee fields for alternative query results
      if (altFeedback.length > 0) {
        const { decrypt: decryptAlt } = require('../utils/encryption')
        for (const fb of altFeedback) {
          if (fb.employeeId) {
            const sensitiveFields = ['firstName', 'lastName']
            for (const field of sensitiveFields) {
              if (fb.employeeId[field] && typeof fb.employeeId[field] === 'string' && fb.employeeId[field].includes(':')) {
                try {
                  fb.employeeId[field] = decryptAlt(fb.employeeId[field])
                } catch (error) {
                  console.warn(`[getProductFeedback] Failed to decrypt employee ${field} for alt feedback ${fb._id}:`, error)
                }
              }
            }
          }
        }
      }
      
      if (altFeedback.length > 0) {
        return altFeedback.map((f: any) => toPlainObject(f))
      }
      
      // Last resort: try to find all feedback and filter by company manually
      console.log(`[getProductFeedback] Trying manual company matching...`)
      const allFeedback = await ProductFeedback.find({
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.orderId ? { orderId: query.orderId } : {}),
        ...(query.productId ? { productId: query.productId } : {}),
        ...(query.vendorId ? { vendorId: query.vendorId } : {})
      })
        .populate('companyId', 'id name')
        .lean() as any
      
        const fbCompanyId = fb.companyId?._id?.toString() || fb.companyId?.toString()
        const targetCompanyId = companyForFallback._id.toString()
        return fbCompanyId === targetCompanyId
      )
      
      // Populate other fields
      const populatedFeedback = await ProductFeedback.find({
        _id: { $in: filteredFeedback.map((f: any) => f._id) }
      })
        .populate('employeeId', 'id employeeId firstName lastName')
        .populate('companyId', 'id name')
        .populate('uniformId', 'id name')
        .populate('vendorId', 'id name')
        .sort({ createdAt: -1 })
        .lean() as any
      
      
      // Apply vendorId population to manually matched feedback as well
      // PRIORITY 1: Try to get vendorId from Order (most reliable)
      // PRIORITY 2: Fall back to ProductVendor relationship
      if (db && populatedFeedback.length > 0) {
        const manualFeedbackNeedingVendor = populatedFeedback.filter(fb => {
          const hasValidVendorId = fb.vendorId && 
            typeof fb.vendorId === 'object' && 
            fb.vendorId !== null &&
            !Array.isArray(fb.vendorId) &&
            fb.vendorId.name && 
            typeof fb.vendorId.name === 'string' &&
            fb.vendorId.name.trim() !== '' &&
            fb.vendorId.name !== 'null' &&
            fb.vendorId.name !== 'undefined'
          return !hasValidVendorId
        })
        
        if (manualFeedbackNeedingVendor.length > 0) {
          // STEP 1: Try to get vendorId from orders (batch lookup)
          const manualOrderIds = manualFeedbackNeedingVendor
            .map(fb => fb.orderId)
            .filter((id): id is string => !!id && typeof id === 'string')
          
          if (manualOrderIds.length > 0) {
            console.log(`[getProductFeedback] [Manual Match] Looking up vendorId from ${manualOrderIds.length} orders`)
            const manualOrders = await Order.find({ id: { $in: manualOrderIds } })
              .select('id vendorId')
              .lean() as any
            
            const manualVendorIdsFromOrders = new Set<string>()
            
            for (const order of manualOrders) {
              if (order.vendorId) {
                const vendorIdStr = typeof order.vendorId === 'object' && order.vendorId._id 
                  ? order.vendorId._id.toString() 
                  : order.vendorId.toString()
                manualOrderVendorMap.set(order.id, vendorIdStr)
                manualVendorIdsFromOrders.add(vendorIdStr)
              }
            }
            
            // Batch lookup vendors from orders
            if (manualVendorIdsFromOrders.size > 0) {
              const manualVendorObjectIds = Array.from(manualVendorIdsFromOrders).map(id => new mongoose.Types.ObjectId(id))
              const manualVendorsFromOrders = await Vendor.find({ _id: { $in: manualVendorObjectIds } })
                .select('id name')
                .lean() as any
              
              for (const vendor of manualVendorsFromOrders) {
                if (vendor && vendor.name) {
                  manualVendorMap.set(
    vendor._id.toString(), {
                    _id: 
    vendor._id,
                    id: 
    vendor.id,
                    name: 
    vendor.name
                  })
                }
              }
              
              // Apply vendorId from orders to feedback
              let manualOrdersMatched = 0
              for (const fb of manualFeedbackNeedingVendor) {
                if (fb.orderId && manualOrderVendorMap.has(fb.orderId)) {
                  const vendorIdStr = manualOrderVendorMap.get(fb.orderId)!
                  const vendor = manualVendorMap.get(vendorIdStr)
                  
                  if (vendor) {
                    fb.vendorId = vendor
                    manualOrdersMatched++
                  }
                }
              }
              console.log(`[getProductFeedback] [Manual Match] ✅ Populated vendorId from orders for ${manualOrdersMatched} feedback records`)
            }
          }
          
          // STEP 2: For feedback still missing vendorId, try ProductVendor relationship
          const manualStillNeedingVendor = manualFeedbackNeedingVendor.filter(fb => {
            const hasValidVendorId = fb.vendorId && 
              typeof fb.vendorId === 'object' && 
              fb.vendorId !== null &&
              !Array.isArray(fb.vendorId) &&
              fb.vendorId.name && 
              typeof fb.vendorId.name === 'string' &&
              fb.vendorId.name.trim() !== '' &&
              fb.vendorId.name !== 'null' &&
              fb.vendorId.name !== 'undefined'
            return !hasValidVendorId
          })
          
          if (manualStillNeedingVendor.length > 0 && db) {
            console.log(`[getProductFeedback] [Manual Match] ${manualStillNeedingVendor.length} feedback records still need vendorId, trying ProductVendor lookup`)
            for (const fb of manualStillNeedingVendor) {
              if (fb.uniformId?._id) {
                const productVendorLink = await db.collection('productvendors').findOne({ 
                  productId: fb.uniformId._id 
                })
                
                if (productVendorLink && productVendorLink.vendorId) {
                  const vendor = await Vendor.findById(productVendorLink.vendorId).select('id name').lean() as any
                    fb.vendorId = {
                      _id: 
    vendor._id,
                      id: 
    vendor.id,
                      name: 
    vendor.name
                    }
                  }
                }
              }
            }
          }
        }
      }
      
      // Apply same vendorId population and transformation to alternative query results
      const transformedAltFeedback = populatedFeedback.map((f: any) => {
        // Preserve employee data before toPlainObject converts it
        const employeeData = f.employeeId && typeof f.employeeId === 'object' && f.employeeId !== null
          ? {
              _id: f.employeeId._id?.toString() || f.employeeId._id,
              id: f.employeeId.id,
              employeeId: f.employeeId.employeeId,
              firstName: f.employeeId.firstName,
              lastName: f.employeeId.lastName
            }
          : null
        
        const plain = toPlainObject(f)
        
        // Restore employee data if it was populated
        if (employeeData) {
          plain.employeeId = employeeData
        }
        
        // Ensure vendorId structure is correct
        if (plain.vendorId && typeof plain.vendorId === 'object' && !plain.vendorId.name) {
          console.warn(`[getProductFeedback] ⚠️ vendorId object missing name in alt query transform:`, plain.vendorId)
        }
        return plain
      })
      
      console.log(`[getProductFeedback] Returning ${transformedAltFeedback.length} feedback records from alternative query`)
      if (transformedAltFeedback.length > 0 && isCompanyAdminUser) {
        const vendorsInAltResponse = new Set(transformedAltFeedback
          .filter(f => f.vendorId && f.vendorId.name && f.vendorId.name.trim() !== '')
          .map(f => f.vendorId.name))
        console.log(`[getProductFeedback] ✅ Alternative query includes ${vendorsInAltResponse.size} unique vendors:`, Array.from(vendorsInAltResponse))
      }
      
      return transformedAltFeedback
    }
  }
  
  // Final transformation: Ensure vendorId and employeeId are properly formatted in response
  const transformedFeedback = feedback.map((f: any, index: number) => {
    // Preserve employee data before toPlainObject converts it
    let employeeData = null
    
    if (f.employeeId && typeof f.employeeId === 'object' && f.employeeId !== null && !Array.isArray(f.employeeId)) {
      // Employee is populated - extract the data
      employeeData = {
        _id: f.employeeId._id?.toString() || f.employeeId._id,
        id: f.employeeId.id,
        employeeId: f.employeeId.employeeId,
        firstName: f.employeeId.firstName,
        lastName: f.employeeId.lastName
      }
      
      // Debug first few records
      if (index < 3) {
        console.log(`[getProductFeedback] 🔍 Employee data BEFORE toPlainObject for feedback ${f.orderId}:`, {
          employeeIdType: typeof f.employeeId,
          employeeIdIsObject: typeof f.employeeId === 'object',
          employeeIdKeys: Object.keys(f.employeeId),
          firstName: f.employeeId.firstName,
          lastName: f.employeeId.lastName,
          extractedData: employeeData
        })
      }
    } else if (f.employeeId) {
      // EmployeeId exists but is not an object (might be ObjectId string)
      if (index < 3) {
        console.warn(`[getProductFeedback] ⚠️ EmployeeId is not populated for feedback ${f.orderId}:`, {
          employeeIdType: typeof f.employeeId,
          employeeIdValue: f.employeeId,
          employeeIdString: f.employeeId?.toString()
        })
      }
    } else {
      // No employeeId at all
      if (index < 3) {
        console.warn(`[getProductFeedback] ⚠️ No employeeId for feedback ${f.orderId || f._id}`)
      }
    }
    
    const plain = toPlainObject(f)
    
    // Restore employee data if it was populated
    if (employeeData) {
      plain.employeeId = employeeData
      if (index < 3) {
        console.log(`[getProductFeedback] ✅ Preserved employee data for feedback ${plain.orderId}:`, {
          firstName: employeeData.firstName,
          lastName: employeeData.lastName,
          employeeId: employeeData.employeeId
        })
      }
    }
    
    // Ensure vendorId structure is correct for frontend
    if (plain.vendorId && typeof plain.vendorId === 'object') {
      // Ensure name is present and not empty
      if (!plain.vendorId.name || plain.vendorId.name.trim() === '') {
        console.warn(`[getProductFeedback] ⚠️ vendorId object missing valid name in final transform for feedback ${plain._id}`)
      }
    }
    
    return plain
  })
  
  // Batch lookup employees that weren't populated
  const feedbackNeedingEmployee = transformedFeedback.filter(f => 
    !f.employeeId || 
    typeof f.employeeId === 'string' || 
    (typeof f.employeeId === 'object' && (!f.employeeId.firstName || !f.employeeId.lastName))
  )
  
  if (feedbackNeedingEmployee.length > 0) {
    console.log(`[getProductFeedback] 🔍 ${feedbackNeedingEmployee.length} feedback records need employee data, attempting batch lookup...`)
    
    const employeeIdsToLookup: mongoose.Types.ObjectId[] = []
    const feedbackEmployeeMap = new Map<string, any[]>() // Map employeeId to feedback records
    
    feedbackNeedingEmployee.forEach(f => {
      let employeeIdToLookup: mongoose.Types.ObjectId | null = null
      
      if (typeof f.employeeId === 'string' && mongoose.Types.ObjectId.isValid(f.employeeId)) {
        employeeIdToLookup = new mongoose.Types.ObjectId(f.employeeId)
      } else if (f.employeeId?._id && mongoose.Types.ObjectId.isValid(f.employeeId._id)) {
        employeeIdToLookup = new mongoose.Types.ObjectId(f.employeeId._id)
      } else if (f._id && mongoose.Types.ObjectId.isValid(f._id)) {
        // Try to get employeeId from the original feedback document
        const originalFeedback = feedback.find((orig: any) => orig._id?.toString() === f._id?.toString())
        if (originalFeedback?.employeeId) {
          const origEmployeeId = originalFeedback.employeeId
          if (typeof origEmployeeId === 'object' && origEmployeeId._id) {
            employeeIdToLookup = new mongoose.Types.ObjectId(origEmployeeId._id)
          } else if (mongoose.Types.ObjectId.isValid(origEmployeeId)) {
            employeeIdToLookup = new mongoose.Types.ObjectId(origEmployeeId)
          }
        }
      }
      
      if (employeeIdToLookup) {
        const key = employeeIdToLookup.toString()
        if (!employeeIdsToLookup.find(id => id.toString() === key)) {
          employeeIdsToLookup.push(employeeIdToLookup)
        }
        if (!feedbackEmployeeMap.has(key)) {
          feedbackEmployeeMap.set(key, [])
        }
        feedbackEmployeeMap.get(key)!.push(f)
      }
    })
    
    if (employeeIdsToLookup.length > 0) {
      console.log(`[getProductFeedback] 🔍 Looking up ${employeeIdsToLookup.length} unique employees...`)
      const employees = await Employee.find({ _id: { $in: employeeIdsToLookup } })
        .select('id employeeId firstName lastName')
        .lean() as any
      
      
      // Create a map for quick lookup
      const employeeMap = new Map()
      employees.forEach((emp: any) => {
        const empData = {
          _id: emp._id.toString(),
          id: emp.id,
          employeeId: emp.employeeId,
          firstName: emp.firstName,
          lastName: emp.lastName
        }
        employeeMap.set(emp._id.toString(), empData)
      })
      
      // Update feedback records with employee data
      let updatedCount = 0
      feedbackEmployeeMap.forEach((feedbackRecords: any, employeeIdStr: number) => {
        if (employeeMap.has(employeeIdStr)) {
          const empData = employeeMap.get(employeeIdStr)
          feedbackRecords.forEach(f => {
            f.employeeId = empData
            updatedCount++
            console.log(`[getProductFeedback] ✅ Manually populated employee for feedback ${f.orderId}: ${empData.firstName} ${empData.lastName}`)
          })
        } else {
          console.warn(`[getProductFeedback] ⚠️ Employee ${employeeIdStr} not found in database`)
        }
      })
      
      console.log(`[getProductFeedback] ✅ Updated ${updatedCount} feedback records with employee data`)
    }
  }
  
  console.log(`[getProductFeedback] Returning ${transformedFeedback.length} feedback records`)
  
  // Debug: Log ALL feedback records with their vendor assignments
  console.log(`[getProductFeedback] 📊 COMPLETE FEEDBACK LIST (${transformedFeedback.length} records):`)
  transformedFeedback.forEach((fb: any, index: number) => {
    console.log(`[getProductFeedback]   [${index + 1}] OrderId: ${fb.orderId}, ProductId: ${fb.productId}, Uniform: ${fb.uniformId?.name || 'N/A'}, Vendor: ${fb.vendorId?.name || 'Unknown'}, VendorId: ${fb.vendorId?._id || 'null'}`)
  })
  
  if (transformedFeedback.length > 0 && isCompanyAdminUser) {
    const vendorsInResponse = new Set(transformedFeedback
      .filter(f => f.vendorId && f.vendorId.name && f.vendorId.name.trim() !== '')
      .map(f => f.vendorId.name))
    console.log(`[getProductFeedback] ✅ Company Admin response includes ${vendorsInResponse.size} unique vendors:`, Array.from(vendorsInResponse))
    
    // Group by vendor for debugging
    const vendorGroups = transformedFeedback.reduce((acc: any, fb: any) => {
      const vendorName = fb.vendorId?.name || 'Unknown'
      if (!acc[vendorName]) {
        acc[vendorName] = []
      }
      acc[vendorName].push({
        orderId: fb.orderId,
        productId: fb.productId,
        uniformName: fb.uniformId?.name
      })
      return acc
    }, {})
    
    console.log(`[getProductFeedback] 📊 Feedback grouped by vendor:`, 
      Object.entries(vendorGroups).map(([vendor, items]: [string, any]) => ({
        vendor,
        count: items.length,
        items: items
      }))
    )
    
    // Final check: Log any feedback still missing vendor
    const missingVendor = transformedFeedback.filter(f => !f.vendorId || !f.vendorId.name || f.vendorId.name.trim() === '')
    if (missingVendor.length > 0) {
      console.error(`[getProductFeedback] ❌ CRITICAL: ${missingVendor.length} feedback records still missing vendorId for Company Admin:`, 
        missingVendor.map(f => ({ id: f._id, orderId: f.orderId, productId: f.productId })))
    }
  }
  
  return transformedFeedback
}

// ============================================================================
// RETURN & REPLACEMENT REQUEST FUNCTIONS
// ============================================================================

/**
 * Generate unique return request ID (6-digit, starting from 600001)
 */
async function generateReturnRequestId(): Promise<string> {
  await connectDB()
  
  // Find the highest existing return request ID
  const lastRequest = await ReturnRequest.findOne()
    .sort({ returnRequestId: -1 })
    .select('returnRequestId')
    .lean() as any
  
  if (!lastRequest || !lastRequest.returnRequestId) {
    return '600001'
  }
  
  const lastId = parseInt(lastRequest.returnRequestId)
  const nextId = lastId + 1
  
  // Ensure we stay within 6-digit range (600001-699999)
  if (nextId >= 700000) {
    throw new Error('Return request ID limit reached (699999). Please contact system administrator.')
  }
  
  return nextId.toString().padStart(6, '0')
}

/**
 * Validate if a product in a delivered order is eligible for return
 * 
 * Rules:
 * 1. Order status must be DELIVERED
 * 2. Product must not already have an active/completed replacement
 * 3. Return request must be within return window (default: 14 days)
 * 4. Quantity requested ≤ quantity delivered
 */
export async function validateReturnEligibility(
  orderId: string,
  itemIndex: number,
  requestedQty: number,
  returnWindowDays: number = 14
): Promise<{
  eligible: boolean
  errors: string[]
  orderItem?: any
  deliveredDate?: Date
}> {
  await connectDB()
  
  const errors: string[] = []
  
  // Find the order - try multiple formats for robustness
  let order = await Order.findOne({ id: orderId }).lean() as any
  let isSplitOrder = false
  let actualChildOrder: any = null
  
  if (!order) {
    // Try with _id if orderId looks like ObjectId
    if (orderId && orderId.length === 24 && /^[0-9a-fA-F]{24}$/.test(orderId)) {
      order = await Order.findById(orderId).lean() as any
    }
    // Try with parentOrderId (for split orders)
    if (!order) {
      // This might be a parent order ID - find all child orders
      const childOrders = await Order.find({ parentOrderId: orderId })
        .populate('items.uniformId', 'id name')
        .lean() as any
      
      if (childOrders.length > 0) {
        isSplitOrder = true
        console.log(`[validateReturnEligibility] Found split order with ${childOrders.length} child orders`)
        
        // Reconstruct the grouped order items (same logic as getOrdersByEmployee)
        let currentItemIndex = 0
        for (const childOrder of childOrders) {
          const childItems = childOrder.items || []
          // Check if the requested itemIndex falls within this child order's items
          if (itemIndex >= currentItemIndex && itemIndex < currentItemIndex + childItems.length) {
            // Found the child order containing this item
            actualChildOrder = childOrder
            const localItemIndex = itemIndex - currentItemIndex
            order = {
              ...childOrder,
              items: childItems,
            }
            console.log(`[validateReturnEligibility] Item at index ${itemIndex} is in child order ${childOrder.id} at local index ${localItemIndex}`)
            break
          }
          currentItemIndex += childItems.length
        }
        
        // If we didn't find the item, create a grouped order for error checking
        if (!order) {
          const allItems = childOrders.flatMap(o => o.items || [])
          order = {
            ...childOrders[0],
            id: orderId,
            items: allItems,
            isSplitOrder: true,
          }
        }
      } else {
        // Try finding by parentOrderId as a direct lookup (single child order)
        order = await Order.findOne({ parentOrderId: orderId }).lean() as any
      }
    }
  }
  
  if (!order) {
    return {
      eligible: false,
      errors: ['Order not found'],
    }
  }
  
  // For split orders, check the status of the specific child order containing the item
  const orderToCheck = actualChildOrder || order
  const statusToCheck = orderToCheck.status
  
  // Check order status
  if (statusToCheck !== 'Delivered') {
    errors.push(`Order status must be "Delivered". Current status: "${statusToCheck}"`)
    if (isSplitOrder && actualChildOrder) {
      errors.push(`Note: This is a split order. The item you're returning is in order ${actualChildOrder.id} which has status "${statusToCheck}"`)
    }
  }
  
  // For split orders, we need to find the correct item in the correct child order
  let orderItem: any = null
  if (isSplitOrder && actualChildOrder) {
    // Recalculate the local item index within the child order
    let currentItemIndex = 0
    const childOrders = await Order.find({ parentOrderId: orderId })
      .populate('items.uniformId', 'id name')
      .lean() as any
    
    for (const childOrder of childOrders) {
      const childItems = childOrder.items || []
      if (itemIndex >= currentItemIndex && itemIndex < currentItemIndex + childItems.length) {
        const localItemIndex = itemIndex - currentItemIndex
        orderItem = childItems[localItemIndex]
        break
      }
      currentItemIndex += childItems.length
    }
  } else {
    // Regular order - use itemIndex directly
    orderItem = order.items?.[itemIndex]
  }
  
  // Check item index
  if (!orderItem) {
    errors.push('Invalid item index')
    return { eligible: false, errors }
  }
  
  // Check if there's already an active/completed return request for this product in this order
  const existingReturn = await ReturnRequest.findOne({
    originalOrderId: orderId,
    originalOrderItemIndex: itemIndex,
    status: { $in: ['REQUESTED', 'APPROVED', 'COMPLETED'] },
  }).lean() as any
  
  if (existingReturn) {
    errors.push('A return request already exists for this product in this order')
  }
  
  // Check quantity
  if (requestedQty <= 0) {
    errors.push('Requested quantity must be greater than 0')
  } else if (requestedQty > orderItem.quantity) {
    errors.push(`Requested quantity (${requestedQty}) cannot exceed delivered quantity (${orderItem.quantity})`)
  }
  
  // Check return window (if order has updatedAt, use that; otherwise use orderDate)
  // For split orders, use the actual child order's date
  const orderForDate = actualChildOrder || order
  const deliveredDate = orderForDate.updatedAt || orderForDate.orderDate || new Date()
  const daysSinceDelivery = Math.floor((Date.now() - new Date(deliveredDate).getTime()) / (1000 * 60 * 60 * 24))
  
  if (daysSinceDelivery > returnWindowDays) {
    errors.push(`Return request must be submitted within ${returnWindowDays} days of delivery. ${daysSinceDelivery} days have passed.`)
  }
  
  return {
    eligible: errors.length === 0,
    errors,
    orderItem: toPlainObject(orderItem),
    deliveredDate: deliveredDate ? new Date(deliveredDate) : undefined,
  }
}

/**
 * Create a return request
 */
export async function createReturnRequest(requestData: {
  originalOrderId: string
  originalOrderItemIndex: number
  requestedQty: number
  requestedSize: string
  reason?: string
  comments?: string
  requestedBy: string // Employee email/ID
  returnWindowDays?: number
}): Promise<any> {
  await connectDB()
  
  // Validate eligibility
  const validation = await validateReturnEligibility(
    requestData.originalOrderId,
    requestData.originalOrderItemIndex,
    requestData.requestedQty,
    requestData.returnWindowDays || 14
  )
  
  if (!validation.eligible) {
    throw new Error(`Return request not eligible: ${validation.errors.join(', ')}`)
  }
  
  // Get order and item details - try multiple formats for robustness
  // Handle split orders correctly (same logic as validateReturnEligibility)
  let order = await Order.findOne({ id: requestData.originalOrderId })
    .populate('employeeId', 'id employeeId firstName lastName email')
    .populate('companyId', 'id name')
    .populate('items.uniformId', 'id name')
    .lean() as any
  
  let actualChildOrder: any = null
  
  if (!order) {
    // Try with _id if originalOrderId looks like ObjectId
    if (requestData.originalOrderId && requestData.originalOrderId.length === 24 && /^[0-9a-fA-F]{24}$/.test(requestData.originalOrderId)) {
      order = await Order.findById(requestData.originalOrderId)
        .populate('employeeId', 'id employeeId firstName lastName email')
        .populate('companyId', 'id name')
        .populate('items.uniformId', 'id name')
        .lean() as any
    // Try with parentOrderId (for split orders)
    if (!order) {
      // This might be a parent order ID - find all child orders
      const childOrders = await Order.find({ parentOrderId: requestData.originalOrderId })
        .populate('employeeId', 'id employeeId firstName lastName email')
        .populate('companyId', 'id name')
        .populate('items.uniformId', 'id name')
        .lean() as any
      
      if (childOrders.length > 0) {
        isSplitOrder = true
        console.log(`[createReturnRequest] Found split order with ${childOrders.length} child orders`)
        
        // Reconstruct the grouped order items (same logic as validateReturnEligibility)
        let currentItemIndex = 0
        for (const childOrder of childOrders) {
          const childItems = childOrder.items || []
          // Check if the requested itemIndex falls within this child order's items
          if (requestData.originalOrderItemIndex >= currentItemIndex && requestData.originalOrderItemIndex < currentItemIndex + childItems.length) {
            // Found the child order containing this item
            actualChildOrder = childOrder
            const localItemIndex = requestData.originalOrderItemIndex - currentItemIndex
            order = {
              ...childOrder,
              items: childItems,
            }
            console.log(`[createReturnRequest] Item at index ${requestData.originalOrderItemIndex} is in child order ${childOrder.id} at local index ${localItemIndex}`)
            break
          }
          currentItemIndex += childItems.length
        }
        
        // If we didn't find the item, create a grouped order for error checking
        if (!order) {
          const allItems = childOrders.flatMap(o => o.items || [])
          order = {
            ...childOrders[0],
            id: requestData.originalOrderId,
            items: allItems,
            isSplitOrder: true,
          }
        }
      } else {
        // Try finding by parentOrderId as a direct lookup (single child order)
        order = await Order.findOne({ parentOrderId: requestData.originalOrderId })
          .populate('employeeId', 'id employeeId firstName lastName email')
          .populate('companyId', 'id name')
          .populate('items.uniformId', 'id name')
          .lean() as any
    }
  }
  
  if (!order) {
    throw new Error('Order not found')
  }
  
  // For split orders, we need to find the correct item in the correct child order
  let orderItem: any = null
  if (isSplitOrder && actualChildOrder) {
    // Recalculate the local item index within the child order
    let currentItemIndex = 0
    const childOrders = await Order.find({ parentOrderId: requestData.originalOrderId })
      .populate('items.uniformId', 'id name')
      .lean() as any
    
    for (const childOrder of childOrders) {
      const childItems = childOrder.items || []
      if (requestData.originalOrderItemIndex >= currentItemIndex && requestData.originalOrderItemIndex < currentItemIndex + childItems.length) {
        const localItemIndex = requestData.originalOrderItemIndex - currentItemIndex
        orderItem = childItems[localItemIndex]
        break
      }
      currentItemIndex += childItems.length
    }
  } else {
    // Regular order - use itemIndex directly
    orderItem = order.items?.[requestData.originalOrderItemIndex]
  }
  
  // Validate that orderItem exists
  if (!orderItem) {
    throw new Error(`Order item not found at index ${requestData.originalOrderItemIndex}. Order has ${order.items?.length || 0} items.`)
  }
  
  // Validate that orderItem has uniformId
  if (!orderItem.uniformId) {
    throw new Error(`Order item at index ${requestData.originalOrderItemIndex} is missing uniformId. Item data: ${JSON.stringify(orderItem)}`)
  }
  
  // Get employee - prefer using the employee from the order (already populated)
  // This is more reliable than looking up by email again
  let employee: any = null
  
  // First, try to use the employee from the order (most reliable)
  if (order.employeeId) {
    if (typeof order.employeeId === 'object' && order.employeeId._id) {
      // It's a populated object, use it directly
      employee = order.employeeId
      // Ensure it's a plain object
      if (employee.toObject) {
        employee = employee.toObject()
      }
      employee = toPlainObject(employee)
    } else if (typeof order.employeeId === 'object' && order.employeeId.id) {
      // It's a populated object with id field
      employee = order.employeeId
      employee = toPlainObject(employee)
    } else {
      // It's an ObjectId, fetch the employee
      employee = await Employee.findById(order.employeeId)
        .populate('companyId', 'id name')
        .populate('locationId', 'id name address city state pincode')
        .lean() as any
        employee = toPlainObject(employee)
      }
    }
  }
  
  // If order employee lookup failed, try by email (handles encrypted emails)
  if (!employee) {
    console.log(`[createReturnRequest] Order employee not found, trying email lookup: ${requestData.requestedBy}`)
    employee = await getEmployeeByEmail(requestData.requestedBy)
  }
  
  // If still not found by email, try by employeeId or id
  if (!employee) {
    console.log(`[createReturnRequest] Email lookup failed, trying ID lookup: ${requestData.requestedBy}`)
    const employeeDoc = await Employee.findOne({
      $or: [
        { employeeId: requestData.requestedBy },
        { id: requestData.requestedBy },
      ],
    })
      .populate('companyId', 'id name')
      .populate('locationId', 'id name address city state pincode')
      .lean() as any
    
      employee = toPlainObject(employeeDoc)
    }
  }
  
  // Final fallback: if requestedBy looks like an ObjectId, try that
  if (!employee && requestData.requestedBy && requestData.requestedBy.length === 24 && /^[0-9a-fA-F]{24}$/.test(requestData.requestedBy)) {
    console.log(`[createReturnRequest] Trying ObjectId lookup: ${requestData.requestedBy}`)
    const employeeDoc = await Employee.findById(requestData.requestedBy)
      .populate('companyId', 'id name')
      .populate('locationId', 'id name address city state pincode')
      .lean() as any
    
      employee = toPlainObject(employeeDoc)
    }
  }
  
  if (!employee) {
    console.error(`[createReturnRequest] Employee lookup failed for: ${requestData.requestedBy}`)
    console.error(`[createReturnRequest] Order employeeId:`, order.employeeId)
    throw new Error(`Employee not found: ${requestData.requestedBy}`)
  }
  
  // Validate that the requestedBy email matches the order's employee (security check)
  // Get the employee's email for comparison (decrypt if needed)
  let employeeEmail = employee.email
  if (employeeEmail) {
    try {
      const { decrypt } = require('../utils/encryption')
      employeeEmail = decrypt(employeeEmail)
    } catch (error) {
      // Email might already be decrypted or decryption failed, use as-is
      console.log(`[createReturnRequest] Email decryption not needed or failed, using as-is`)
    }
  }
  
  // Compare requestedBy with employee email (case-insensitive)
  if (requestData.requestedBy && employeeEmail && 
      requestData.requestedBy.toLowerCase().trim() !== employeeEmail.toLowerCase().trim() &&
      requestData.requestedBy !== 
    employee.id &&
      requestData.requestedBy !== 
    employee.employeeId) {
    console.warn(`[createReturnRequest] Email mismatch: requestedBy=${requestData.requestedBy}, employeeEmail=${employeeEmail}`)
    // Don't throw error, just log warning - the order's employee is the authoritative source
  }
  
  // Get uniform - use string ID
  const uniform = await Uniform.findOne({ id: String(orderItem.uniformId) }).lean() as any
  if (!uniform) {
    throw new Error('Uniform product not found')
  }
  
  // Generate return request ID
  const returnRequestId = await generateReturnRequestId()
  
  // Get company ID as string - extract from populated object or use directly
  let companyIdStr: string
  if (typeof order.companyId === 'object' && order.companyId !== null) {
    // Populated object - use id field
    companyIdStr = order.companyId.id || String(order.companyId)
  } else if (typeof order.companyId === 'string') {
    // Already a string ID
    companyIdStr = order.companyId
  } else {
    // Try to get company by any means
    const company = await Company.findOne({ 
      $or: [
        { id: String(order.companyId) },
        { _id: order.companyId }
      ]
    }).select('id').lean() as any
    if (company) {
      companyIdStr = company.id
    } else {
      throw new Error('Company not found for return request')
    }
  }
  
  // Get employee ID as string
  const employeeIdStr = employee?.id || employee?.employeeId
  if (!employeeIdStr) {
    throw new Error('Employee ID not found in employee object')
  }
  
  const employeeIdNum = employee.employeeId || 
    employee.id || ''
  
  // Create return request with string IDs
  const returnRequest = await ReturnRequest.create({
    returnRequestId,
    originalOrderId: requestData.originalOrderId,
    originalOrderItemIndex: requestData.originalOrderItemIndex,
    productId: orderItem.productId,
    uniformId: String(orderItem.uniformId),
    uniformName: orderItem.uniformName,
    employeeId: String(employeeIdStr),
    employeeIdNum,
    companyId: companyIdStr,
    requestedQty: requestData.requestedQty,
    originalSize: orderItem.size,
    requestedSize: requestData.requestedSize,
    reason: requestData.reason,
    comments: requestData.comments,
    status: 'REQUESTED',
    requestedBy: requestData.requestedBy,
    returnWindowDays: requestData.returnWindowDays || 14,
  })
  
  return toPlainObject(returnRequest)
}

/**
 * Get return requests for an employee
 */
export async function getReturnRequestsByEmployee(employeeId: string): Promise<any[]> {
  await connectDB()
  
  // Find employee
  const employee = await Employee.findOne({
    $or: [
      { employeeId: employeeId },
      { id: employeeId },
    ],
  }).select('_id employeeId id').lean()
  
  if (!employee) {
    return []
  }
  
  const employeeIdNum = employee.employeeId || employee.id
  
  // Find return requests
  const returnRequests = await ReturnRequest.find({
    $or: [
      { employeeId: employee._id },
      { employeeIdNum: employeeIdNum },
    ],
  })
    .populate('employeeId', 'id firstName lastName email')
    .populate('companyId', 'id name')
    .populate('uniformId', 'id name')
    .sort({ createdAt: -1 })
    .lean() as any
  
  return returnRequests.map((rr: any) => toPlainObject(rr))
}

/**
 * Get return requests for a company (for admin approval)
 */
export async function getReturnRequestsByCompany(companyId: string, status?: string): Promise<any[]> {
  await connectDB()
  
  // Find company - try multiple formats for robustness
  let company = await Company.findOne({ id: companyId }).select('_id id').lean()
  
  // Try with _id if companyId looks like ObjectId
  if (!company && companyId && companyId.length === 24 && /^[0-9a-fA-F]{24}$/.test(companyId)) {
    company = await Company.findById(companyId).select('_id id').lean() as any
  }
  // Try as numeric ID (if companyId is a number string)
  if (!company && !isNaN(Number(companyId))) {
    company = await Company.findOne({ id: Number(companyId) }).select('_id id').lean() as any
  }
  
  if (!company) {
    console.error(`[getReturnRequestsByCompany] Company not found for companyId: ${companyId}`)
    return []
  }
  
  const query: any = {
    companyId: company._id,
  }
  
  if (status) {
    query.status = status
  }
  
  // Find return requests
  const returnRequests = await ReturnRequest.find(query)
    .populate('employeeId', 'id firstName lastName email')
    .populate('companyId', 'id name')
    .populate('uniformId', 'id name')
    .sort({ createdAt: -1 })
    .lean() as any
  
  const enrichedReturnRequests = await Promise.all(
    returnRequests.map(async (rr) => {
      const plainRR = toPlainObject(rr)
      
      // Fetch the original order to get vendor information
      // Use the same robust logic as validateReturnEligibility and createReturnRequest
      let vendorName = null
      try {
        const itemIndex = rr.originalOrderItemIndex || 0
        
        // First, try to find order by id
        let originalOrder = await Order.findOne({ id: rr.originalOrderId })
          .populate('vendorId', 'id name')
          .lean() as any
        
        
        // Check if this might be a parent order (has child orders) - same logic as validateReturnEligibility
        if (!originalOrder || !originalOrder.parentOrderId) {
          // Try finding child orders with parentOrderId (this might be a parent order ID)
          const childOrders = await Order.find({ parentOrderId: rr.originalOrderId })
            .populate('vendorId', 'id name')
            .sort({ vendorName: 1 }) // Sort by vendor name for consistency (same as validateReturnEligibility)
            .lean() as any
          
          if (childOrders.length > 0) {
            // This is a parent order with child orders - find which child contains the item
            let currentIndex = 0
            for (const childOrder of childOrders) {
              const childItems = childOrder.items || []
              if (itemIndex >= currentIndex && itemIndex < currentIndex + childItems.length) {
                // This child order contains the item - use its vendor
                if (childOrder.vendorName) {
                  vendorName = childOrder.vendorName
                } else if (childOrder.vendorId && typeof childOrder.vendorId === 'object' && childOrder.vendorId.name) {
                  vendorName = childOrder.vendorId.name
                } else if (childOrder.vendorId) {
                  // vendorId is a string ID, fetch vendor name
                  const vendor = await Vendor.findOne({ id: String(childOrder.vendorId) }).select('name').lean() as any
                  if (vendor) {
                    vendorName = vendor.name
                  }
                }
                console.log(`[getReturnRequestsByCompany] Found vendor ${vendorName} from child order ${childOrder.id} for item index ${itemIndex}`)
                break
              }
              currentIndex += childItems.length
            }
          } else if (originalOrder) {
            // Single order (not split) - use its vendor
            if (originalOrder.vendorName) {
              vendorName = originalOrder.vendorName
            } else if (originalOrder.vendorId && typeof originalOrder.vendorId === 'object' && originalOrder.vendorId.name) {
              vendorName = originalOrder.vendorId.name
            } else if (originalOrder.vendorId) {
              // vendorId is an ObjectId, fetch vendor name
              const vendor = await Vendor.findById(originalOrder.vendorId).select('name').lean() as any
              if (vendor) {
                vendorName = vendor.name
              }
            }
            console.log(`[getReturnRequestsByCompany] Found vendor ${vendorName} from single order ${originalOrder.id}`)
          }
        } else {
          // This is a child order - check if it contains the item
          if (originalOrder.items && originalOrder.items.length > itemIndex) {
            // This child order contains the item
            if (originalOrder.vendorName) {
              vendorName = originalOrder.vendorName
            } else if (originalOrder.vendorId && typeof originalOrder.vendorId === 'object' && originalOrder.vendorId.name) {
              vendorName = originalOrder.vendorId.name
            } else if (originalOrder.vendorId) {
              // vendorId is an ObjectId, fetch vendor name
              const vendor = await Vendor.findById(originalOrder.vendorId).select('name').lean() as any
              if (vendor) {
                vendorName = vendor.name
              }
            }
            console.log(`[getReturnRequestsByCompany] Found vendor ${vendorName} from child order ${originalOrder.id} for item index ${itemIndex}`)
          }
        }
      } catch (error) {
        console.error(`[getReturnRequestsByCompany] Error fetching vendor for return request ${rr.returnRequestId}:`, error)
      }
      
      return {
        ...plainRR,
        vendorName: vendorName || 'N/A'
      }
    })
  )
  
  return enrichedReturnRequests
}

/**
 * Get a single return request by ID
 */
export async function getReturnRequestById(returnRequestId: string): Promise<any> {
  await connectDB()
  
  const returnRequest = await ReturnRequest.findOne({ returnRequestId })
    .populate('employeeId', 'id firstName lastName email')
    .populate('companyId', 'id name')
    .populate('uniformId', 'id name')
    .lean() as any
  
    return null
  }
  
  return toPlainObject(returnRequest)
}

/**
 * Approve a return request and create replacement order
 */
export async function approveReturnRequest(
  returnRequestId: string,
  approvedBy: string
): Promise<any> {
  await connectDB()
  
  // Get return request
  const returnRequest = await ReturnRequest.findOne({ returnRequestId })
    .populate('employeeId', 'id employeeId firstName lastName email')
    .populate('companyId', 'id name')
    .populate('uniformId', 'id name')
    .lean() as any
  
    throw new Error('Return request not found')
  }
  
  if (returnRequest.status !== 'REQUESTED') {
    throw new Error(`Return request cannot be approved. Current status: ${returnRequest.status}`)
  }
  
  // Get original order - try multiple formats for robustness
  // CRITICAL: First query without populate to see raw vendorId, then populate for full details
  let originalOrderRaw = await Order.findOne({ id: returnRequest.originalOrderId }).lean() as any
  
  if (!originalOrderRaw) {
    // Try with _id if originalOrderId looks like ObjectId
    if (returnRequest.originalOrderId && returnRequest.originalOrderId.length === 24 && /^[0-9a-fA-F]{24}$/.test(returnRequest.originalOrderId)) {
      originalOrderRaw = await Order.findById(returnRequest.originalOrderId).lean() as any
    }
    // Try with parentOrderId (for split orders - the stored ID might be a parent order ID)
    if (!originalOrderRaw) {
      originalOrderRaw = await Order.findOne({ parentOrderId: returnRequest.originalOrderId }).lean() as any
    }
  }
  
  if (!originalOrderRaw) {
    throw new Error(`Original order not found: ${returnRequest.originalOrderId}`)
  }
  
  // DEBUG: Log raw order to see actual vendorId in database
  console.log(`[approveReturnRequest] 🔍 DEBUG: Raw order from database:`, {
    orderId: originalOrderRaw.id,
    vendorId: originalOrderRaw.vendorId,
    vendorIdType: typeof originalOrderRaw.vendorId,
    vendorIdIsObjectId: originalOrderRaw.vendorId instanceof mongoose.Types.ObjectId,
    vendorName: originalOrderRaw.vendorName,
    parentOrderId: originalOrderRaw.parentOrderId,
    hasItems: !!originalOrderRaw.items,
    itemCount: originalOrderRaw.items?.length
  })
  
  // Now populate for full details
  let originalOrder = await Order.findOne({ id: originalOrderRaw.id })
    .populate('employeeId', 'id employeeId firstName lastName email')
    .populate('companyId', 'id name')
    .populate('vendorId', 'id name')
    .lean() as any
  
  // Fallback to raw order if populate fails
  if (!originalOrder) {
    originalOrder = originalOrderRaw
  }
  
  if (!originalOrder) {
    throw new Error(`Original order not found: ${returnRequest.originalOrderId}`)
  }
  
  // DEBUG: Log order details to understand the structure
  console.log(`[approveReturnRequest] 🔍 DEBUG: Original order found:`, {
    orderId: originalOrder.id,
    orderIdType: typeof originalOrder.id,
    hasParentOrderId: !!originalOrder.parentOrderId,
    parentOrderId: originalOrder.parentOrderId,
    vendorId: originalOrder.vendorId,
    vendorIdType: typeof originalOrder.vendorId,
    vendorIdIsObject: typeof originalOrder.vendorId === 'object',
    vendorIdIsObjectId: originalOrder.vendorId instanceof mongoose.Types.ObjectId,
    vendorName: originalOrder.vendorName,
    vendorIdKeys: originalOrder.vendorId && typeof originalOrder.vendorId === 'object' ? Object.keys(originalOrder.vendorId) : 'N/A',
    itemCount: originalOrder.items?.length,
    originalOrderItemIndex: returnRequest.originalOrderItemIndex
  })
  
  // Get uniform to get price and product ID
  const uniform = await Uniform.findById(returnRequest.uniformId).lean() as any
  if (!uniform) {
    throw new Error('Uniform product not found')
  }
  
  // Get product ID (string) - createOrder expects the product ID, not ObjectId
  const productId = uniform.id || uniform._id?.toString()
  if (!productId) {
    throw new Error('Product ID not found for uniform')
  }
  
  // Get employee
  const employee = typeof originalOrder.employeeId === 'object' && originalOrder.employeeId?._id
    ? originalOrder.employeeId
    : await Employee.findById(originalOrder.employeeId)
  
  if (!employee) {
    throw new Error('Employee not found')
  }
  
  const employeeId = employee.employeeId || employee.id
  
  // CRITICAL: For replacement orders, we must use the SAME vendor as the original order
  // Find the vendor from the original order (handle split orders)
  // NOTE: vendorId in orders is stored as a string (6-digit numeric), not ObjectId
  let originalVendorId: string | null = null
  let originalVendorName: string | null = null
  
  // Helper function to extract vendorId from various formats
  // CRITICAL: vendorId in orders is a string (6-digit numeric), not ObjectId
  const extractVendorId = async (order: any, orderLabel: string = 'order'): Promise<{ vendorId: string | null; vendorName: string | null }> => {
    let vendorId: string | null = null
    let vendorName: string | null = null
    
    console.log(`[approveReturnRequest] 🔍 DEBUG: Extracting vendorId from ${orderLabel}:`, {
      hasVendorId: !!order.vendorId,
      vendorIdType: typeof order.vendorId,
      vendorIdIsObjectId: order.vendorId instanceof mongoose.Types.ObjectId,
      vendorIdIsObject: typeof order.vendorId === 'object' && order.vendorId !== null,
      vendorIdValue: order.vendorId,
      vendorName: order.vendorName
    })
    
    // CRITICAL: vendorId in orders is stored as a string (6-digit numeric), not ObjectId
    if (order.vendorId) {
      if (typeof order.vendorId === 'string') {
        // String vendorId (6-digit numeric) - use directly
        vendorId = order.vendorId
        vendorName = order.vendorName || null
        console.log(`[approveReturnRequest] ✅ Extracted vendorId as string: ${vendorId}`)
      } else if (typeof order.vendorId === 'object' && order.vendorId !== null) {
        // Populated vendor object - extract the 'id' field (string), not _id
        if (order.vendorId.id) {
          vendorId = order.vendorId.id.toString()
          vendorName = order.vendorId.name || order.vendorName || null
          console.log(`[approveReturnRequest] ✅ Extracted vendorId from populated object id field: ${vendorId}, name: ${vendorName}`)
        } else if (order.vendorId._id) {
          // Fallback: if only _id exists, query vendor by _id to get the 'id' field
          try {
            const vendorByObjectId = await Vendor.findById(order.vendorId._id).lean() as any
            if (vendorByObjectId && (vendorByObjectId as any).id) {
              vendorId = (vendorByObjectId as any).id.toString()
              vendorName = order.vendorId.name || order.vendorName || null
              console.log(`[approveReturnRequest] ✅ Queried vendor by _id to get string id: ${vendorId}`)
            }
          } catch (e) {
            console.warn(`[approveReturnRequest] ⚠️ Error querying vendor by _id:`, e)
          }
        }
      } else if (order.vendorId instanceof mongoose.Types.ObjectId) {
        // Legacy: ObjectId format - query vendor to get the string 'id'
        try {
          const vendorByObjectId = await Vendor.findById(order.vendorId).lean() as any
          if (vendorByObjectId && (vendorByObjectId as any).id) {
            vendorId = (vendorByObjectId as any).id.toString()
            vendorName = order.vendorName || null
            console.log(`[approveReturnRequest] ✅ Queried vendor by ObjectId to get string id: ${vendorId}`)
          }
        } catch (e) {
          console.warn(`[approveReturnRequest] ⚠️ Error querying vendor by ObjectId:`, e)
        }
      }
    } else {
      console.warn(`[approveReturnRequest] ⚠️ Order ${orderLabel} does not have vendorId field`)
    }
    
    return { vendorId, vendorName }
  }
  
  // Check if this is a split order (has child orders)
  // First, check if the order itself has a parentOrderId (it's a child)
  // Or if it has child orders (it's a parent)
  const hasParentOrderId = !!originalOrder.parentOrderId
    const childOrders = await Order.find({ 
    parentOrderId: originalOrder.id 
    }).lean() as any
  
  const isParentOrder = childOrders.length > 0
  const isChildOrder = hasParentOrderId
  
  console.log(`[approveReturnRequest] 🔍 DEBUG: Order structure:`, {
    isParentOrder,
    isChildOrder,
    hasParentOrderId,
    childOrdersCount: childOrders.length,
    orderId: originalOrder.id
  })
  
  // For split orders, find the specific child order that contains the returned item
  if (isParentOrder) {
    // This is a parent order - find the child order containing the item
    // CRITICAL: Populate vendorId on child orders too
    const childOrdersWithVendor = await Order.find({ 
      parentOrderId: originalOrder.id
    })
    .populate('vendorId', 'id name')
    .lean() as any
    
    
    // Find which child order contains the item at originalOrderItemIndex
    let currentItemIndex = 0
    for (const childOrder of childOrdersWithVendor) {
      const childItems = childOrder.items || []
      const itemIndexRange = {
        start: currentItemIndex,
        end: currentItemIndex + childItems.length - 1,
        requested: returnRequest.originalOrderItemIndex
      }
      console.log(`[approveReturnRequest] 🔍 DEBUG: Checking child order ${childOrder.id}, item range:`, itemIndexRange)
      
      if (returnRequest.originalOrderItemIndex >= currentItemIndex && 
          returnRequest.originalOrderItemIndex < currentItemIndex + childItems.length) {
        // Found the child order containing this item
        const vendorInfo = await extractVendorId(childOrder, `child order ${childOrder.id}`)
        originalVendorId = vendorInfo.vendorId
        originalVendorName = vendorInfo.vendorName
        console.log(`[approveReturnRequest] ✅ Found vendor from child order: ${originalVendorName || 'N/A'} (${originalVendorId})`)
        break
      }
      currentItemIndex += childItems.length
    }
    
    if (!originalVendorId) {
      console.error(`[approveReturnRequest] ❌ Could not find child order containing item at index ${returnRequest.originalOrderItemIndex}`)
      console.error(`[approveReturnRequest] ❌ Total child orders: ${childOrdersWithVendor.length}`)
      for (let i = 0; i < childOrdersWithVendor.length; i++) {
        const co = childOrdersWithVendor[i]
        console.error(`[approveReturnRequest] ❌ Child order ${i}: id=${co.id}, items=${co.items?.length || 0}, vendorId=${co.vendorId}`)
      }
    }
  } else {
    // Regular order (not a parent, might be a child or standalone) - use vendor directly
    const vendorInfo = await extractVendorId(originalOrder, 'original order')
    originalVendorId = vendorInfo.vendorId
    originalVendorName = vendorInfo.vendorName
    
    // FALLBACK: If populated order doesn't have vendorId, try raw order
    if (!originalVendorId && originalOrderRaw.vendorId) {
      console.log(`[approveReturnRequest] ⚠️ Populated order missing vendorId, using raw order vendorId`)
      if (typeof originalOrderRaw.vendorId === 'string') {
        // String vendorId (6-digit numeric) - use directly
        originalVendorId = originalOrderRaw.vendorId
        originalVendorName = originalOrderRaw.vendorName || null
        console.log(`[approveReturnRequest] ✅ Extracted vendorId from raw order: ${originalVendorId}`)
      } else if (originalOrderRaw.vendorId instanceof mongoose.Types.ObjectId) {
        // Legacy ObjectId format - query vendor to get string 'id'
        try {
          const vendorByObjectId = await Vendor.findById(originalOrderRaw.vendorId).lean() as any
          if (vendorByObjectId && (vendorByObjectId as any).id) {
            originalVendorId = (vendorByObjectId as any).id.toString()
            originalVendorName = originalOrderRaw.vendorName || (vendorByObjectId as any).name || null
            console.log(`[approveReturnRequest] ✅ Queried vendor by ObjectId to get string id: ${originalVendorId}`)
          }
        } catch (e) {
          console.warn(`[approveReturnRequest] ⚠️ Error querying vendor by ObjectId from raw order:`, e)
        }
      }
    }
    
    console.log(`[approveReturnRequest] Using vendor from original order: ${originalVendorName || 'N/A'} (${originalVendorId})`)
  }
  
  // CRITICAL: Validate that vendorId exists and is valid
  if (!originalVendorId) {
    const errorDetails = {
      returnRequestId,
      originalOrderId: returnRequest.originalOrderId,
      orderVendorId: originalOrder.vendorId,
      orderVendorIdType: typeof originalOrder.vendorId,
      rawOrderVendorId: originalOrderRaw.vendorId,
      rawOrderVendorIdType: typeof originalOrderRaw.vendorId,
      isSplitOrder: !!(originalOrder.parentOrderId || (originalOrder as any).isSplitOrder),
      productId: returnRequest.productId,
      uniformId: returnRequest.uniformId
    }
    console.error(`[approveReturnRequest] ❌ CRITICAL: Original order does not have a valid vendorId:`, errorDetails)
    throw new Error(`Original order does not have a vendor assigned. Order ID: ${returnRequest.originalOrderId}. Cannot create replacement order.`)
  }
  
  // CRITICAL: Validate that vendorId is a string (6-digit numeric)
  if (typeof originalVendorId !== 'string') {
    console.error(`[approveReturnRequest] ❌ CRITICAL: vendorId is not a string:`, {
      vendorId: originalVendorId,
      type: typeof originalVendorId,
      constructor: originalVendorId?.constructor?.name
    })
    throw new Error(`Invalid vendorId format: ${originalVendorId}. Expected string (6-digit numeric). Order ID: ${returnRequest.originalOrderId}. Cannot create replacement order.`)
  }
  
  // CRITICAL: Validate that vendor exists in database
  // Query vendor by 'id' field (string), not _id (ObjectId)
  console.log(`[approveReturnRequest] 🔍 DEBUG: Querying vendor with string id:`, {
    vendorId: originalVendorId,
    vendorIdType: typeof originalVendorId
  })
  
  // Query vendor by 'id' field (string)
  let vendorExists = await Vendor.findOne({ id: originalVendorId }).lean() as any
  
  // If not found, try legacy ObjectId lookup (for backward compatibility)
  if (!vendorExists) {
    console.warn(`[approveReturnRequest] ⚠️ Vendor not found by string id, trying legacy ObjectId lookup...`)
    // Check if vendorId could be an ObjectId string
    if (mongoose.Types.ObjectId.isValid(originalVendorId)) {
      try {
        const vendorByObjectId = await Vendor.findById(originalVendorId).lean() as any
        if (vendorByObjectId) {
          // Found by ObjectId, but we need the string 'id' field
          originalVendorId = (vendorByObjectId as any).id || originalVendorId
          vendorExists = vendorByObjectId
          console.log(`[approveReturnRequest] ✅ Found vendor by ObjectId, using string id: ${originalVendorId}`)
        }
      } catch (e) {
        console.warn(`[approveReturnRequest] ⚠️ Error querying vendor by ObjectId:`, e)
      }
    }
  }
  
  if (!vendorExists) {
    const errorDetails = {
      returnRequestId,
      originalOrderId: returnRequest.originalOrderId,
      vendorId: originalVendorId,
      vendorIdType: typeof originalVendorId,
      rawOrderVendorId: originalOrderRaw.vendorId?.toString(),
      populatedOrderVendorId: originalOrder.vendorId?.toString()
    }
    console.error(`[approveReturnRequest] ❌ CRITICAL: Vendor not found in database:`, errorDetails)
    throw new Error(`Vendor not found: ${originalVendorId}. The vendor may have been deleted or the vendorId in the order is invalid. Order ID: ${returnRequest.originalOrderId}. Cannot create replacement order.`)
  }
  
  console.log(`[approveReturnRequest] ✅ Vendor found:`, {
    _id: vendorExists._id?.toString(),
    id: (vendorExists as any).id,
    name: (vendorExists as any).name
  })
  
  // Update vendorName from vendor document if not already set
  if (!originalVendorName && (vendorExists as any).name) {
    originalVendorName = (vendorExists as any).name
    console.log(`[approveReturnRequest] ✅ Updated vendorName from vendor document: ${originalVendorName}`)
  }
  
  console.log(`[approveReturnRequest] ✅ Vendor validated: ${originalVendorName || 'N/A'} (${originalVendorId})`)
  
  // Create replacement order using existing createOrder function
  // Replacement order uses same SKU, new size, requested quantity
  const replacementOrder = await createOrder({
    employeeId: employeeId,
    items: [
      {
        uniformId: productId, // Use product ID (string), not ObjectId
        uniformName: returnRequest.uniformName,
        size: returnRequest.requestedSize,
        quantity: returnRequest.requestedQty,
        price: uniform.price || 0, // Use current price from uniform
      },
    ],
    deliveryAddress: originalOrder.deliveryAddress,
    estimatedDeliveryTime: originalOrder.estimatedDeliveryTime,
    dispatchLocation: originalOrder.dispatchLocation,
  })
  
  // Get the replacement order ID (could be parentOrderId if split)
  const replacementOrderId = replacementOrder.parentOrderId || replacementOrder.id
  
  // Update replacement orders to mark them as REPLACEMENT type, use original vendor, and auto-approve
  // If it's a split order, update all child orders
  const ordersToUpdate = replacementOrder.parentOrderId
    ? await Order.find({ parentOrderId: replacementOrder.parentOrderId })
    : [await Order.findOne({ id: replacementOrderId })]
  
  for (const order of ordersToUpdate) {
    if (order) {
      order.orderType = 'REPLACEMENT'
      order.returnRequestId = returnRequestId
      // CRITICAL: Use the same vendor as the original order
      order.vendorId = originalVendorId
      if (originalVendorName) {
        order.vendorName = originalVendorName
      }
      // Auto-approve replacement orders since return request is already approved by company admin
      if (order.status === 'Awaiting approval' || order.status === 'Awaiting fulfilment') {
        order.status = 'Awaiting fulfilment'
      }
      await order.save()
      console.log(`[approveReturnRequest] Updated replacement order ${order.id} with vendor ${originalVendorName} (${originalVendorId})`)
    }
  }
  
  // Update return request
  await ReturnRequest.updateOne(
    { returnRequestId },
    {
      status: 'APPROVED',
      replacementOrderId,
      approvedBy,
      approvedAt: new Date(),
    }
  )
  
  // Get updated return request
  const updatedRequest = await getReturnRequestById(returnRequestId)
  
  return {
    returnRequest: updatedRequest,
    replacementOrder,
  }
}

/**
 * Reject a return request
 */
export async function rejectReturnRequest(
  returnRequestId: string,
  rejectedBy: string,
  rejectionReason?: string
): Promise<any> {
  await connectDB()
  
  // Get return request
  const returnRequest = await ReturnRequest.findOne({ returnRequestId }).lean() as any
  
  if (!returnRequest) {
    throw new Error('Return request not found')
  }
  
  if (returnRequest.status !== 'REQUESTED') {
    throw new Error(`Return request cannot be rejected. Current status: ${returnRequest.status}`)
  }
  
  // Update return request
  await ReturnRequest.updateOne(
    { returnRequestId },
    {
      status: 'REJECTED',
      approvedBy: rejectedBy,
      approvedAt: new Date(),
      comments: rejectionReason
        ? `${returnRequest.comments || ''}\n\nRejection reason: ${rejectionReason}`.trim()
        : returnRequest.comments,
    }
  )
  
  // Get updated return request
  const updatedRequest = await getReturnRequestById(returnRequestId)
  
  return updatedRequest
}

/**
 * Mark return request as completed when replacement is delivered
 * This should be called when replacement order status changes to "Delivered"
 */
export async function completeReturnRequest(returnRequestId: string): Promise<any> {
  await connectDB()
  
  // Get return request
  const returnRequest = await ReturnRequest.findOne({ returnRequestId }).lean() as any
  
  if (!returnRequest) {
    throw new Error('Return request not found')
  }
  
  if (returnRequest.status !== 'APPROVED') {
    throw new Error(`Return request cannot be completed. Current status: ${returnRequest.status}`)
  }
  
  // Update return request
  await ReturnRequest.updateOne(
    { returnRequestId },
    {
      status: 'COMPLETED',
    }
  )
  
  // Get updated return request
  const updatedRequest = await getReturnRequestById(returnRequestId)
  
  return updatedRequest
}

// ============================================================================
// PRODUCT SIZE CHART FUNCTIONS
// ============================================================================

/**
 * Get size chart for a product
 */
export async function getProductSizeChart(productId: string): Promise<any | null> {
  await connectDB()
  
  const sizeChart = await ProductSizeChart.findOne({ productId }).lean() as any
  
  if (!sizeChart) {
    return null
  }
  
  return toPlainObject(sizeChart)
}

/**
 * Get size charts for multiple products (bulk fetch)
 */
export async function getProductSizeCharts(productIds: string[]): Promise<Record<string, any>> {
  await connectDB()
  
  const sizeCharts = await ProductSizeChart.find({ productId: { $in: productIds } }).lean() as any
  
  const result: Record<string, any> = {}
  sizeCharts.forEach((chart: any) => {
    result[chart.productId] = toPlainObject(chart)
  })
  
  return result
}

/**
 * Create or update size chart for a product
 */
export async function upsertProductSizeChart(
  productId: string,
  imageUrl: string,
  imageType: 'jpg' | 'jpeg' | 'png' | 'webp',
  fileName: string,
  fileSize: number
): Promise<any> {
  await connectDB()
  
  // Validate product exists
  const product = await Uniform.findOne({ id: productId }).lean() as any
  if (!product) {
    throw new Error(`Product with ID ${productId} not found`)
  }
  
  // Check if size chart already exists
  const existing = await ProductSizeChart.findOne({ productId })
  
  if (existing) {
    // Update existing
    existing.imageUrl = imageUrl
    existing.imageType = imageType
    existing.fileName = fileName
    existing.fileSize = fileSize
    await existing.save()
    return toPlainObject(existing)
  } else {
    // Create new
    const sizeChart = new ProductSizeChart({
      productId,
      imageUrl,
      imageType,
      fileName,
      fileSize,
    })
    await sizeChart.save()
    return toPlainObject(sizeChart)
  }
}

/**
 * Delete size chart for a product
 */
export async function deleteProductSizeChart(productId: string): Promise<boolean> {
  await connectDB()
  
  const result = await ProductSizeChart.deleteOne({ productId })
  return result.deletedCount > 0
}

// ============================================================================
// VENDOR-LED GRN WORKFLOW FUNCTIONS (INCREMENTAL EXTENSION)
// ============================================================================

/**
 * Get POs eligible for GRN creation by vendor
 * Returns POs where:
 * - PO.shippingStatus = FULLY_DELIVERED (derived from PRs)
 * - No GRN exists for the PO
 * - PO vendorId matches the requesting vendor
 * @param vendorId Vendor ID (6-digit numeric)
 * @returns Array of eligible POs with delivery details
 */
export async function getPOsEligibleForGRN(vendorId: string): Promise<any[]> {
  await connectDB()
  
  // Get vendor
  const vendor = await Vendor.findOne({ id: vendorId }).select('_id id name').lean() as any
    console.warn(`[updateVendor] Vendor not found: ${vendorId}`);
    return null // Return null instead of throwing - let API route handle 404
  }
  
  // Get all POs for this vendor
  const pos = await PurchaseOrder.find({ vendorId: vendorId })
    .populate('companyId', 'id name')
    .sort({ po_date: -1 })
    .lean() as any
  
  if (pos.length === 0) {
    return []
  }
  
  // Get all existing GRNs to filter out POs that already have GRN
  const existingGRNs = await GRN.find({ vendorId: vendorId })
    .select('poNumber')
    .lean() as any
  
  
  // For each PO, check if it's fully delivered and doesn't have GRN
  const eligiblePOs: any[] = []
  
  console.log(`[getPOsEligibleForGRN] Processing ${pos.length} PO(s) for vendor ${vendorId}`)
  
  for (const po of pos) {
    // Skip if GRN already exists
    if (poNumbersWithGRN.has(po.client_po_number)) {
      console.log(`[getPOsEligibleForGRN] PO ${po.client_po_number} already has GRN, skipping`)
      continue
    }
    
    console.log(`[getPOsEligibleForGRN] Checking PO ${po.client_po_number} (PO ID: ${po.id})`)
    
    // Derive shipping status from PRs
    try {
      const shippingStatus = await derivePOShippingStatus(po.id)
      console.log(`[getPOsEligibleForGRN] PO ${po.client_po_number} shipping status: ${shippingStatus}`)
      
      if (shippingStatus === 'FULLY_DELIVERED') {
        console.log(`[getPOsEligibleForGRN] ✅ PO ${po.client_po_number} is FULLY_DELIVERED, adding to eligible list`)
        // Get PRs linked to this PO to get delivery details
        const poOrderMappings = await POOrder.find({ purchase_order_id: po._id }).lean() as any
        if (poOrderMappings.length === 0) {
          continue
        }
        
        const orderIds = poOrderMappings.map(m => m.order_id)
        const prs = await Order.find({ _id: { $in: orderIds } })
          .select('id pr_number deliveredDate items')
          .lean() as any
        
        let totalItems = 0
        let latestDeliveryDate: Date | null = null
        
        for (const pr of prs) {
          const items = pr.items || []
          totalItems += items.length
          
          if (pr.deliveredDate) {
            const deliveryDate = new Date(pr.deliveredDate)
            if (!latestDeliveryDate || deliveryDate > latestDeliveryDate) {
              latestDeliveryDate = deliveryDate
            }
          }
        }
        
        eligiblePOs.push({
          poId: po.id,
          poNumber: po.client_po_number,
          poDate: po.po_date,
          vendorId: po.vendorId,
          vendorName: 
    vendor.name,
          companyId: (po.companyId as any)?.id || po.companyId,
          companyName: (po.companyId as any)?.name || '',
          deliveryDate: latestDeliveryDate,
          itemCount: totalItems,
          shippingStatus: shippingStatus
        })
      } else {
        console.log(`[getPOsEligibleForGRN] ⚠️ PO ${po.client_po_number} is not FULLY_DELIVERED (status: ${shippingStatus}), skipping`)
      }
    } catch (error: any) {
      console.error(`[getPOsEligibleForGRN] ❌ Error deriving shipping status for PO ${po.id} (${po.client_po_number}):`, error.message)
      console.error(`[getPOsEligibleForGRN] Error stack:`, error.stack)
      continue
    }
  }
  
  console.log(`[getPOsEligibleForGRN] ✅ Found ${eligiblePOs.length} eligible PO(s) for GRN creation`)
  
  return eligiblePOs.sort((a, b) => {
    const dateA = new Date(a.deliveryDate || 0).getTime()
    const dateB = new Date(b.deliveryDate || 0).getTime()
    return dateB - dateA
  })
}

/**
 * Create GRN by vendor (vendor-led workflow)
 * @param poNumber PO number
 * @param grnNumber GRN number (vendor provided)
 * @param grnDate GRN date
 * @param vendorId Vendor ID
 * @param remarks Optional remarks
 * @returns Created GRN
 */
export async function createGRNByVendor(
  poNumber: string,
  grnNumber: string,
  grnDate: Date,
  vendorId: string,
  remarks?: string
): Promise<any> {
  await connectDB()
  
  // Get vendor
  const vendor = await Vendor.findOne({ id: vendorId }).select('_id id name').lean() as any
    console.warn(`[updateVendor] Vendor not found: ${vendorId}`);
    return null // Return null instead of throwing - let API route handle 404
  }
  
  // Get PO
  const Company = (await import('../models/Company')).default
  const pos = await PurchaseOrder.find({ vendorId: vendorId, client_po_number: poNumber })
    .populate('companyId', 'id name')
    .lean() as any
  
  if (pos.length === 0) {
    throw new Error(`PO not found: ${poNumber} for vendor ${vendorId}`)
  }
  
  const po = pos[0]
  const company = po.companyId as any
  
  // Check if GRN already exists
  const existingGRN = await GRN.findOne({ poNumber: poNumber })
  if (existingGRN) {
    throw new Error(`GRN already exists for PO ${poNumber}. Only one GRN per PO is allowed.`)
  }
  
  // Validate PO is fully delivered
  const shippingStatus = await derivePOShippingStatus(po.id)
  if (shippingStatus !== 'FULLY_DELIVERED') {
    throw new Error(`PO ${poNumber} is not fully delivered (current status: ${shippingStatus}). All items must be fully delivered before creating GRN.`)
  }
  
  // Get all PRs (Orders) linked to this PO
  const poOrderMappings = await POOrder.find({ purchase_order_id: po._id }).lean() as any
  if (poOrderMappings.length === 0) {
    throw new Error(`No PRs found for PO ${poNumber}`)
  }
  
  // Get order string IDs from mappings
  const orderIds = poOrderMappings.map(m => String(m.order_id)).filter(Boolean)
  const prs = await Order.find({ id: { $in: orderIds } })
    .select('id pr_number items deliveryStatus')
    .lean() as any
  
  if (prs.length === 0) {
    throw new Error(`No PRs found for PO ${poNumber}`)
  }
  
  // Validate all PRs are fully delivered
  for (const pr of prs) {
    if (pr.deliveryStatus !== 'DELIVERED') {
      throw new Error(`PR ${pr.pr_number || pr.id} is not fully delivered (current status: ${pr.deliveryStatus || 'NOT_DELIVERED'}). All PRs must be fully delivered before creating GRN.`)
    }
    
    const items = pr.items || []
    for (const item of items) {
      const orderedQty = item.quantity || 0
      const deliveredQty = item.deliveredQuantity || 0
      
      if (deliveredQty < orderedQty) {
        throw new Error(`PR ${pr.pr_number || pr.id} item has delivered quantity (${deliveredQty}) less than ordered quantity (${orderedQty}). All items must be fully delivered before creating GRN.`)
      }
    }
  }
  
  // Collect all items from all PRs for GRN
  const grnItems: Array<{
    productCode: string
    size: string
    orderedQuantity: number
    deliveredQuantity: number
    rejectedQuantity: number
    condition: 'ACCEPTED' | 'PARTIAL' | 'REJECTED'
    remarks?: string
  }> = []
  
  const prNumbers: string[] = []
  
  for (const pr of prs) {
    if (pr.pr_number) {
      prNumbers.push(pr.pr_number)
    }
    
    const items = pr.items || []
    for (const item of items) {
      const orderedQty = item.quantity || 0
      const deliveredQty = item.deliveredQuantity || 0
      
      grnItems.push({
        productCode: item.productId || '',
        size: item.size || '',
        orderedQuantity: orderedQty,
        deliveredQuantity: deliveredQty,
        rejectedQuantity: 0, // Default: no rejections
        condition: 'ACCEPTED', // Default: all accepted
        remarks: undefined
      })
    }
  }
  
  // Generate GRN ID (6-10 digit numeric)
  const grnId = String(Date.now()).slice(-10).padStart(6, '0')
  
  // Create GRN with vendor-led workflow flags
  const grn = await GRN.create({
    id: grnId,
    grnId: grnId,
    grnNumber: grnNumber.trim(),
    companyId: 
    company.id,
    vendorId: vendorId,
    poNumber: poNumber,
    prNumbers: prNumbers,
    items: grnItems,
    status: 'CREATED',
    createdBy: vendorId, // Vendor ID as creator
    grnRaisedByVendor: true,
    grnAcknowledgedByCompany: false,
    grnStatus: 'RAISED', // Simple approval workflow: start as RAISED
    remarks: remarks?.trim()
  })
  
  console.log(`[createGRNByVendor] ✅ Created GRN: ${grnId} for PO: ${poNumber} by vendor: ${vendorId}`)
  
  // Return created GRN
  const createdGRN = await GRN.findById(grn._id).lean() as any
  
  const result = toPlainObject(createdGRN)
  if (vendor) {
    (result as any).vendorName = vendor.name
  }
  if (company) {
    (result as any).companyName = company.name
  }
  
  return result
}

/**
 * Get GRNs raised by vendor
 * @param vendorId Vendor ID
 * @returns Array of GRNs
 */
export async function getGRNsByVendor(vendorId: string): Promise<any[]> {
  await connectDB()
  
  // CRITICAL: Use .lean() to get all fields (no .select() to ensure all fields are returned)
  // This ensures grnStatus, approvedBy, approvedAt, and all other fields are included
  const grns = await GRN.find({ vendorId: vendorId, grnRaisedByVendor: true })
    .sort({ createdAt: -1 })
    .lean() as any
  
  
  // Get company names
  const companyIds = [...new Set(grns.map((g: any) => g.companyId).filter(Boolean))]
  const companies = await Company.find({ id: { $in: companyIds } })
    .select('id name')
    .lean() as any
  
  
  // Get PO dates for all GRNs
  const poNumbers = [...new Set(grns.map((g: any) => g.poNumber).filter(Boolean))]
  const pos = await PurchaseOrder.find({ client_po_number: { $in: poNumbers } })
    .select('client_po_number po_date')
    .lean() as any
  
  
  return grns.map((grn: any) => {
    const plain = toPlainObject(grn)
    
    // CRITICAL: Explicitly ensure grnStatus and related fields are preserved
    if (grn.grnStatus !== undefined) {
      (plain as any).grnStatus = grn.grnStatus
    }
    if (grn.approvedBy !== undefined) {
      (plain as any).approvedBy = grn.approvedBy
    }
    if (grn.approvedAt !== undefined) {
      (plain as any).approvedAt = grn.approvedAt
    }
    if (grn.grnAcknowledgedByCompany !== undefined) {
      (plain as any).grnAcknowledgedByCompany = grn.grnAcknowledgedByCompany
    }
    if (grn.invoiceId !== undefined) {
      (plain as any).invoiceId = grn.invoiceId
    }
    
    if (plain.companyId && companyMap.has(plain.companyId)) {
      (plain as any).companyName = companyMap.get(plain.companyId)
    }
    if (plain.poNumber && poDateMap.has(plain.poNumber)) {
      (plain as any).poDate = poDateMap.get(plain.poNumber)
    }
    
    // Debug log for approved GRNs
    if (grn.grnStatus === 'APPROVED' || grn.status === 'ACKNOWLEDGED' || grn.grnAcknowledgedByCompany === true) {
      console.log(`[getGRNsByVendor] ✅ Approved GRN found: ${grn.id || grn.grnNumber}`, {
        grnStatus: grn.grnStatus,
        status: grn.status,
        grnAcknowledgedByCompany: grn.grnAcknowledgedByCompany,
        approvedBy: grn.approvedBy,
        invoiceId: grn.invoiceId
      })
    }
    
    return plain
  })
}

/**
 * Get all GRNs raised by vendors (for Company Admin)
 * Returns all GRNs where grnRaisedByVendor = true
 * @param companyId Company ID (optional filter)
 * @returns Array of GRNs raised by vendors
 */
export async function getGRNsRaisedByVendors(companyId?: string): Promise<any[]> {
  await connectDB()
  
  const query: any = {
    grnRaisedByVendor: true
  }
  
  if (companyId) {
    query.companyId = companyId
  }
  
  const grns = await GRN.find(query)
    .sort({ createdAt: -1 })
    .lean() as any
  
  const vendorIds = [...new Set(grns.map((g: any) => g.vendorId).filter(Boolean))]
  const companyIds = [...new Set(grns.map((g: any) => g.companyId).filter(Boolean))]
  
  const vendors = await Vendor.find({ id: { $in: vendorIds } })
    .select('id name')
    .lean() as any
  
  const companyMap = new Map(companies.map((c: any) => [c.id, c.name]))
  
  // Get PO dates for all GRNs
  const poNumbers = [...new Set(grns.map((g: any) => g.poNumber).filter(Boolean))]
  const pos = await PurchaseOrder.find({ client_po_number: { $in: poNumbers } })
    .select('client_po_number po_date')
    .lean() as any
  
  
  return grns.map((grn: any) => {
    const plain = toPlainObject(grn)
    if (plain.vendorId && vendorMap.has(plain.vendorId)) {
      (plain as any).vendorName = vendorMap.get(plain.vendorId)
    }
    if (plain.companyId && companyMap.has(plain.companyId)) {
      (plain as any).companyName = companyMap.get(plain.companyId)
    }
    if (plain.poNumber && poDateMap.has(plain.poNumber)) {
      (plain as any).poDate = poDateMap.get(plain.poNumber)
    }
    return plain
  })
}

/**
 * Get GRNs pending acknowledgment by Company Admin
 * Returns GRNs where:
 * - grnStatus = RAISED (or undefined/null, for backward compatibility)
 * - grnRaisedByVendor = true
 * @param companyId Company ID (optional filter)
 * @returns Array of GRNs pending acknowledgment
 */
export async function getGRNsPendingAcknowledgment(companyId?: string): Promise<any[]> {
  await connectDB()
  
  const query: any = {
    grnRaisedByVendor: true,
    $or: [
      { grnStatus: 'RAISED' },
      { grnStatus: { $exists: false } }, // Backward compatibility: treat missing grnStatus as RAISED
      { grnStatus: null }
    ]
  }
  
  if (companyId) {
    query.companyId = companyId
  }
  
  const grns = await GRN.find(query)
    .sort({ createdAt: -1 })
    .lean() as any
  
  const vendorIds = [...new Set(grns.map((g: any) => g.vendorId).filter(Boolean))]
  const companyIds = [...new Set(grns.map((g: any) => g.companyId).filter(Boolean))]
  
  const vendors = await Vendor.find({ id: { $in: vendorIds } })
    .select('id name')
    .lean() as any
  
  const companyMap = new Map(companies.map((c: any) => [c.id, c.name]))
  
  return grns.map((grn: any) => {
    const plain = toPlainObject(grn)
    if (plain.vendorId && vendorMap.has(plain.vendorId)) {
      (plain as any).vendorName = vendorMap.get(plain.vendorId)
    }
    if (plain.companyId && companyMap.has(plain.companyId)) {
      (plain as any).companyName = companyMap.get(plain.companyId)
    }
    return plain
  })
}

/**
 * Acknowledge GRN by Company Admin
 * @param grnId GRN ID
 * @param acknowledgedBy Company Admin ID/name
 * @returns Updated GRN
 */
export async function acknowledgeGRN(
  grnId: string,
  acknowledgedBy: string
): Promise<any> {
  await connectDB()
  
  const grn = await GRN.findOne({ id: grnId })
  if (!grn) {
    throw new Error(`GRN not found: ${grnId}`)
  }
  
  // Validate GRN is in CREATED status and raised by vendor
  if (grn.status !== 'CREATED') {
    throw new Error(`GRN ${grnId} is not in CREATED status (current: ${grn.status})`)
  }
  
  if (!grn.grnRaisedByVendor) {
    throw new Error(`GRN ${grnId} was not raised by vendor and cannot be acknowledged`)
  }
  
  // Update GRN
  grn.status = 'ACKNOWLEDGED'
  grn.grnAcknowledgedByCompany = true
  grn.grnAcknowledgedDate = new Date()
  grn.grnAcknowledgedBy = acknowledgedBy.trim()
  
  await grn.save()
  
  console.log(`[acknowledgeGRN] ✅ Acknowledged GRN: ${grnId} by: ${acknowledgedBy}`)
  
  // Return updated GRN
  const updatedGRN = await GRN.findById(grn._id).lean() as any
  
  // Add vendor and company names
  let vendorName = null
  let companyName = null
  if (updatedGRN && (updatedGRN as any).vendorId) {
    const vendor = await Vendor.findOne({ id: (updatedGRN as any).vendorId }).select('id name').lean() as any
    if (vendor) {
      vendorName = (vendor as any).name
    }
  }
  if (updatedGRN && (updatedGRN as any).companyId) {
    const company = await Company.findOne({ id: (updatedGRN as any).companyId }).select('id name').lean() as any
    if (company) {
      companyName = (company as any).name
    }
  }
  
  const result = toPlainObject(updatedGRN)
  if (vendorName) {
    (result as any).vendorName = vendorName
  }
  if (companyName) {
    (result as any).companyName = companyName
  }
  
  return result
}

/**
 * Approve GRN by Company Admin (Simple Approval Workflow)
 * Updates grnStatus from RAISED to APPROVED
 * @param grnId GRN ID
 * @param approvedBy Company Admin identifier
 * @returns Updated GRN
 */
export async function approveGRN(
  grnId: string,
  approvedBy: string
): Promise<any> {
  await connectDB()
  
  const grn = await GRN.findOne({ id: grnId })
  if (!grn) {
    throw new Error(`GRN not found: ${grnId}`)
  }
  
  // Validate GRN is in RAISED status
  if (grn.grnStatus && grn.grnStatus !== 'RAISED') {
    throw new Error(`GRN ${grnId} is not in RAISED status (current: ${grn.grnStatus})`)
  }
  
  // Update GRN
  grn.grnStatus = 'APPROVED'
  grn.approvedBy = approvedBy.trim()
  grn.approvedAt = new Date()
  
  await grn.save()
  
  console.log(`[approveGRN] ✅ Approved GRN: ${grnId} by: ${approvedBy}`)
  
  // Return updated GRN
  const updatedGRN = await GRN.findById(grn._id).lean() as any
  
  // Add vendor and company names
  let vendorName = null
  let companyName = null
  if (updatedGRN && (updatedGRN as any).vendorId) {
    const vendor = await Vendor.findOne({ id: (updatedGRN as any).vendorId }).select('id name').lean() as any
    if (vendor) {
      vendorName = (vendor as any).name
    }
  }
  if (updatedGRN && (updatedGRN as any).companyId) {
    const company = await Company.findOne({ id: (updatedGRN as any).companyId }).select('id name').lean() as any
    if (company) {
      companyName = (company as any).name
    }
  }
  
  const result = toPlainObject(updatedGRN)
  if (vendorName) {
    (result as any).vendorName = vendorName
  }
  if (companyName) {
    (result as any).companyName = companyName
  }
  
  return result
}

/**
 * Create Invoice by vendor
 * Invoice can be created ONLY if GRN status is APPROVED
 * @param grnId GRN ID
 * @param invoiceNumber System-generated invoice number (internal to UDS)
 * @param invoiceDate System-generated invoice date (internal to UDS)
 * @param vendorInvoiceNumber Vendor-provided invoice number (required)
 * @param vendorInvoiceDate Vendor-provided invoice date (required)
 * @param invoiceAmount Invoice amount (calculated from items + optional tax)
 * @param vendorId Vendor ID (for authorization)
 * @param remarks Optional invoice remarks
 * @param taxAmount Optional tax or additional charges
 * @returns Created Invoice with pre-populated data
 */
export async function createInvoiceByVendor(
  grnId: string,
  invoiceNumber: string,
  invoiceDate: Date,
  vendorInvoiceNumber: string,
  vendorInvoiceDate: Date,
  invoiceAmount: number,
  vendorId: string,
  remarks?: string,
  taxAmount?: number
): Promise<any> {
  await connectDB()
  
  // Get GRN with full details
  const grn = await GRN.findOne({ id: grnId }).lean() as any
  if (!grn) {
    throw new Error(`GRN not found: ${grnId}`)
  }
  
  // Validate vendor authorization
  if ((grn as any).vendorId !== vendorId) {
    throw new Error(`Vendor ${vendorId} is not authorized to create invoice for GRN ${grnId}`)
  }
  
  // Validate GRN is approved (supports both new and old approval workflows)
  const isApproved = grn.grnStatus === 'APPROVED' || 
                     grn.grnAcknowledgedByCompany === true || 
                     grn.status === 'ACKNOWLEDGED'
  
  if (!isApproved) {
    throw new Error(`GRN ${grnId} must be APPROVED before creating invoice (current status: ${grn.grnStatus || grn.status || 'RAISED'})`)
  }
  
  // Retrofit: If GRN was approved via old workflow but doesn't have grnStatus set, update it
  if (grn.grnStatus !== 'APPROVED' && (grn.grnAcknowledgedByCompany === true || grn.status === 'ACKNOWLEDGED')) {
    grn.grnStatus = 'APPROVED'
    if (!grn.approvedBy && grn.grnAcknowledgedBy) {
      grn.approvedBy = grn.grnAcknowledgedBy
    }
    if (!grn.approvedAt && grn.grnAcknowledgedDate) {
      grn.approvedAt = grn.grnAcknowledgedDate
    }
    await grn.save()
    console.log(`[createInvoiceByVendor] ✅ Retrofit: Updated GRN ${grnId} to have grnStatus = APPROVED`)
  }
  
  // Check if invoice already exists for this GRN
  const existingInvoice = await Invoice.findOne({ grnId: grnId })
  if (existingInvoice) {
    throw new Error(`Invoice already exists for GRN ${grnId}. Only one invoice per GRN is allowed.`)
  }
  
  // Get product details for invoice items
  const ProductVendor = (await import('../models/Relationship')).ProductVendor
  
  const productCodes = [...new Set(grn.items.map((item: any) => item.productCode).filter(Boolean))]
  
  // Get products from Uniform model (using product codes which are stored in 'id' field)
  const products = await Uniform.find({ id: { $in: productCodes } })
    .select('id name _id')
    .lean() as any
  
  
  // Extract product ObjectIds for ProductVendor query
  // ProductVendor.productId is an ObjectId, not a string product code
  const productObjectIds = products.map((p: any) => p._id).filter(Boolean)
  
  // Convert vendorId (6-digit string) to ObjectId for query (ProductVendor uses ObjectId for vendorId)
  // Also fetch vendor name for later use in response
  // Note: Vendor is already imported at the top of the file
  const vendorForQuery = await Vendor.findOne({ id: vendorId }).select('_id id name').lean() as any
    throw new Error(`Vendor not found: ${vendorId}`)
  }
  const vendorObjectId = (vendorForQuery as any)._id
  
  // Get vendor prices for products using ObjectIds
  const productVendors = await ProductVendor.find({
    vendorId: vendorObjectId,
    productId: { $in: productObjectIds }
  }).lean() as any
  
  // Create a map: product ObjectId -> price
  const priceMapByObjectId = new Map(productVendors.map((pv: any) => {
    const productIdStr = pv.productId?.toString() || ''
    return [productIdStr, pv.price || 0]
  }))
  
  // Create a map: product code (id) -> price (for easy lookup by product code)
  const priceMap = new Map<string, number>()
  products.forEach((p: any) => {
    const productObjectIdStr = p._id?.toString() || ''
    const price = priceMapByObjectId.get(productObjectIdStr) || 0
    priceMap.set(p.id, price)
  })
  
  // Build invoice items from GRN items
  const invoiceItems: Array<{
    productCode: string
    productName?: string
    size?: string
    quantity: number
    unitPrice: number
    lineTotal: number
  }> = []
  
  let calculatedTotal = 0
  
  for (const grnItem of grn.items) {
    const product = productMap.get(grnItem.productCode)
    const unitPrice = priceMap.get(grnItem.productCode) || 0
    const quantity = grnItem.deliveredQuantity || grnItem.orderedQuantity || 0
    const lineTotal = unitPrice * quantity
    
    invoiceItems.push({
      productCode: grnItem.productCode,
      productName: product?.name,
      size: grnItem.size,
      quantity: quantity,
      unitPrice: unitPrice,
      lineTotal: lineTotal
    })
    
    calculatedTotal += lineTotal
  }
  
  // Add tax if provided
  if (taxAmount && taxAmount > 0) {
    calculatedTotal += taxAmount
  }
  
  // Use provided invoiceAmount or calculated total
  const finalAmount = invoiceAmount > 0 ? invoiceAmount : calculatedTotal
  
  // Generate Invoice ID (6-10 digit numeric)
  const invoiceId = String(Date.now()).slice(-10).padStart(6, '0')
  
  // Create Invoice with all required fields
  const invoice = await Invoice.create({
    id: invoiceId,
    invoiceId: invoiceId,
    invoiceNumber: invoiceNumber.trim(), // System-generated (internal)
    invoiceDate: invoiceDate, // System-generated (internal)
    vendorInvoiceNumber: vendorInvoiceNumber.trim(), // Vendor-provided (required)
    vendorInvoiceDate: vendorInvoiceDate, // Vendor-provided (required)
    vendorId: vendorId,
    companyId: grn.companyId,
    grnId: grnId,
    grnNumber: grn.grnNumber,
    grnApprovedDate: grn.approvedAt || null,
    poNumber: grn.poNumber,
    prNumbers: grn.prNumbers || [],
    invoiceItems: invoiceItems,
    invoiceAmount: finalAmount,
    invoiceStatus: 'RAISED',
    raisedBy: vendorId,
    remarks: remarks?.trim(),
    taxAmount: taxAmount || 0
  })
  
  // Update GRN to link invoice (but don't change GRN status - keep it APPROVED)
  await GRN.updateOne({ id: grnId }, { invoiceId: invoiceId })
  
  console.log(`[createInvoiceByVendor] ✅ Created Invoice: ${invoiceId} for GRN: ${grnId}`)
  
  // Return created invoice with vendor and company names
  const createdInvoice = await Invoice.findById(invoice._id).lean() as any
  
  // Reuse vendor data already fetched above (vendorForQuery)
  const company = await Company.findOne({ id: grn.companyId }).select('id name').lean()
  
  if (vendorForQuery) {
    (result as any).vendorName = vendorForQuery.name
  }
  if (company) {
    (result as any).companyName = company.name
  }
  
  return result
}

/**
 * Get Invoices by vendor
 * @param vendorId Vendor ID
 * @returns Array of invoices
 */
export async function getInvoicesByVendor(vendorId: string): Promise<any[]> {
  await connectDB()
  
  const invoices = await Invoice.find({ vendorId: vendorId })
    .sort({ invoiceDate: -1, createdAt: -1 })
    .lean() as any
  
  const companyIds = [...new Set(invoices.map((i: any) => i.companyId).filter(Boolean))]
  const companies = await Company.find({ id: { $in: companyIds } })
    .select('id name')
    .lean() as any
  
  
  return invoices.map((invoice: any) => {
    const plain = toPlainObject(invoice)
    if (plain.companyId && companyMap.has(plain.companyId)) {
      (plain as any).companyName = companyMap.get(plain.companyId)
    }
    return plain
  })
}

/**
 * Get Invoices for Company Admin
 * @param companyId Company ID (optional filter)
 * @returns Array of invoices
 */
export async function getInvoicesForCompany(companyId?: string): Promise<any[]> {
  await connectDB()
  
  const query: any = {}
  if (companyId) {
    query.companyId = companyId
  }
  
  const invoices = await Invoice.find(query)
    .sort({ invoiceDate: -1, createdAt: -1 })
    .lean() as any
  
  const vendorIds = [...new Set(invoices.map((i: any) => i.vendorId).filter(Boolean))]
  const vendors = await Vendor.find({ id: { $in: vendorIds } })
    .select('id name')
    .lean() as any
  
  
  return invoices.map((invoice: any) => {
    const plain = toPlainObject(invoice)
    if (plain.vendorId && vendorMap.has(plain.vendorId)) {
      (plain as any).vendorName = vendorMap.get(plain.vendorId)
    }
    return plain
  })
}

/**
 * Approve Invoice by Company Admin
 * @param invoiceId Invoice ID
 * @param approvedBy Company Admin identifier
 * @returns Updated Invoice
 */
export async function approveInvoice(
  invoiceId: string,
  approvedBy: string
): Promise<any> {
  await connectDB()
  
  const invoice = await Invoice.findOne({ id: invoiceId })
  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`)
  }
  
  // Validate invoice is in RAISED status
  if (invoice.invoiceStatus !== 'RAISED') {
    throw new Error(`Invoice ${invoiceId} is not in RAISED status (current: ${invoice.invoiceStatus})`)
  }
  
  // Update invoice
  invoice.invoiceStatus = 'APPROVED'
  invoice.approvedBy = approvedBy.trim()
  invoice.approvedAt = new Date()
  
  await invoice.save()
  
  console.log(`[approveInvoice] ✅ Approved Invoice: ${invoiceId} by: ${approvedBy}`)
  
  // Return updated invoice with vendor and company names
  const updatedInvoice = await Invoice.findById(invoice._id).lean() as any
  const result = toPlainObject(updatedInvoice)
  
  const vendor = await Vendor.findOne({ id: invoice.vendorId }).select('id name').lean() as any
  
  if (vendor) {
    (result as any).vendorName = vendor.name
  }
  if (company) {
    (result as any).companyName = company.name
  }
  
  return result
}


// ============================================================================
// SHIPPING / LOGISTICS PROVIDER CONFIGURATION FUNCTIONS
// ============================================================================

/**
 * Generate alphanumeric ID for shipping entities (≤15 chars)
 */
function generateShippingId(prefix: string): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  const id = `${prefix}_${timestamp}${random}`.substring(0, 15)
  return id
}

