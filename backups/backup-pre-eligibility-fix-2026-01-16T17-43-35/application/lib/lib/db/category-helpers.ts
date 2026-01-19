/**
 * Category Helper Functions
 * 
 * These functions provide dynamic category operations, replacing hard-coded category logic.
 * They work with the ProductCategory model to support fully dynamic categories.
 */

import mongoose from 'mongoose'
import ProductCategory from '../models/ProductCategory'
import connectDB from './mongodb'

/**
 * Get all active categories for a company
 */
export async function getCategoriesByCompany(companyId: string): Promise<any[]> {
  await connectDB()
  
  // String ID lookup only (ObjectId fallback removed - all IDs are now strings)
  const company = await mongoose.connection.db.collection('companies').findOne({ id: companyId })
  
  if (!company) {
    return []
  }
  
  // Find categories by company string ID
  const categories = await ProductCategory.find({
    companyId: company.id,
    status: 'active'
  })
    .sort({ name: 1 })
    .lean()
  
  return categories.map(cat => ({
    id: cat.id,
    _id: cat._id.toString(),
    name: cat.name,
    companyId: cat.companyId.toString(),
    renewalUnit: cat.renewalUnit,
    isSystemCategory: cat.isSystemCategory || false,
    status: cat.status
  }))
}

/**
 * Get category by ID or name (for backward compatibility)
 */
export async function getCategoryByIdOrName(
  companyId: string,
  categoryIdOrName: string
): Promise<any | null> {
  await connectDB()
  
  // String ID lookup only (ObjectId fallback removed - all IDs are now strings)
  const company = await mongoose.connection.db.collection('companies').findOne({ id: companyId })
  
  if (!company) {
    return null
  }
  
  // Try by string ID first (preferred)
  let category = await ProductCategory.findOne({
    companyId: company.id,
    id: categoryIdOrName
  }).lean()
  
  // Try by name (case-insensitive)
  if (!category) {
    category = await ProductCategory.findOne({
      companyId: company.id,
      name: { $regex: new RegExp(`^${categoryIdOrName}$`, 'i') },
      status: 'active'
    }).lean()
  }
  
  // For backward compatibility: try to match legacy category names
  if (!category) {
    const legacyMap: Record<string, string> = {
      'shirt': 'Shirt',
      'pant': 'Pant',
      'trouser': 'Pant',
      'shoe': 'Shoe',
      'jacket': 'Jacket',
      'blazer': 'Jacket',
      'accessory': 'Accessory'
    }
    
    const normalizedName = categoryIdOrName.toLowerCase().trim()
    const mappedName = legacyMap[normalizedName] || categoryIdOrName
    
    category = await ProductCategory.findOne({
      companyId: company.id,
      name: { $regex: new RegExp(`^${mappedName}$`, 'i') },
      status: 'active'
    }).lean()
  }
  
  return category ? {
    id: category.id,
    _id: category._id.toString(),
    name: category.name,
    companyId: category.companyId.toString(),
    renewalUnit: category.renewalUnit,
    isSystemCategory: category.isSystemCategory || false
  } : null
}

/**
 * Normalize category name for matching (backward compatibility)
 * Maps legacy category names to standard names
 */
export function normalizeCategoryName(categoryName: string): string {
  if (!categoryName) return ''
  
  const lower = categoryName.toLowerCase().trim()
  
  // Legacy mapping for backward compatibility
  const legacyMap: Record<string, string> = {
    'shirt': 'shirt',
    'shirts': 'shirt',
    'pant': 'pant',
    'pants': 'pant',
    'trouser': 'pant',
    'trousers': 'pant',
    'shoe': 'shoe',
    'shoes': 'shoe',
    'jacket': 'jacket',
    'jackets': 'jacket',
    'blazer': 'jacket',
    'blazers': 'jacket',
    'accessory': 'accessory',
    'accessories': 'accessory'
  }
  
  return legacyMap[lower] || lower
}

/**
 * Get category ID from product (handles both old and new formats)
 */
export async function getProductCategoryId(
  product: any,
  companyId: string
): Promise<string | null> {
  // If product has categoryId (new format), use it
  if (product.categoryId) {
    return product.categoryId.toString()
  }
  
  // If product has category (old format), look up the category
  if (product.category) {
    const category = await getCategoryByIdOrName(companyId, product.category)
    return category ? category._id : null
  }
  
  return null
}

/**
 * Get category name from product (handles both old and new formats)
 */
export async function getProductCategoryName(
  product: any,
  companyId: string
): Promise<string> {
  // If product has categoryId (new format), look up the category name
  if (product.categoryId) {
    const category = await getCategoryByIdOrName(companyId, product.categoryId.toString())
    if (category) {
      return category.name
    }
  }
  
  // If product has category (old format), use it or look it up
  if (product.category) {
    const category = await getCategoryByIdOrName(companyId, product.category)
    if (category) {
      return category.name
    }
    // Fallback to original category name
    return product.category
  }
  
  return 'Unknown'
}

/**
 * Create default system categories for a company (if they don't exist)
 */
export async function ensureSystemCategories(companyId: string): Promise<void> {
  await connectDB()
  
  // String ID lookup only (ObjectId fallback removed - all IDs are now strings)
  const company = await mongoose.connection.db.collection('companies').findOne({ id: companyId })
  
  if (!company) {
    throw new Error(`Company not found: ${companyId}`)
  }
  
  const systemCategories = [
    { name: 'Shirt', renewalUnit: 'months' as const },
    { name: 'Pant', renewalUnit: 'months' as const },
    { name: 'Shoe', renewalUnit: 'months' as const },
    { name: 'Jacket', renewalUnit: 'months' as const },
    { name: 'Accessory', renewalUnit: 'months' as const }
  ]
  
  // Get existing categories by company string ID
  const existingCategories = await ProductCategory.find({
    companyId: company.id
  }).lean()
  
  const existingNames = new Set(existingCategories.map(c => c.name.toLowerCase()))
  
  // Create missing categories
  let categoryIdCounter = 500001
  for (const sysCat of systemCategories) {
    if (!existingNames.has(sysCat.name.toLowerCase())) {
      // Find next available ID
      while (await ProductCategory.findOne({ id: categoryIdCounter.toString() })) {
        categoryIdCounter++
      }
      
      await ProductCategory.create({
        id: categoryIdCounter.toString(),
        name: sysCat.name,
        companyId: company.id,  // Use string ID, not ObjectId
        renewalUnit: sysCat.renewalUnit,
        isSystemCategory: true,
        status: 'active'
      })
      
      categoryIdCounter++
    }
  }
}

