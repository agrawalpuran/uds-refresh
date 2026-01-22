/**
 * ProductSubcategoryMapping Model - COMPANY-SPECIFIC
 * 
 * Maps products to subcategories with company-specific context.
 * The SAME product can be mapped to DIFFERENT subcategories for DIFFERENT companies.
 * 
 * Example:
 *   Product: "Premium Shirt" (global product)
 *   Company A: Maps to "Managers Full Shirt" subcategory
 *   Company B: Maps to "Executive Shirt" subcategory
 * 
 * This allows the same product to be categorized differently per company.
 */

import mongoose, { Schema, Document } from 'mongoose'
// Ensure Subcategory model is registered before using it in pre-save hook
import '@/lib/models/Subcategory'

export interface IProductSubcategoryMapping extends Document {
  productId: string // String ID reference to Product (alphanumeric) - REQUIRED
  subCategoryId: string // String ID reference to Subcategory (alphanumeric) - REQUIRED
  companyId: string // String ID reference to Company (alphanumeric) - REQUIRED
  companySpecificPrice?: number // Optional price override for this company
  createdAt?: Date
  updatedAt?: Date
}

const ProductSubcategoryMappingSchema = new Schema<IProductSubcategoryMapping>(
  {
    productId: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric (1-50 characters)
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Product ID must be alphanumeric (1-50 characters)'
      }
    },
    subCategoryId: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric (1-50 characters)
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Subcategory ID must be alphanumeric (1-50 characters)'
      }
    },
    companyId: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric (1-50 characters)
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Company ID must be alphanumeric (1-50 characters)'
      }
    },
    companySpecificPrice: {
      type: Number,
      required: false,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
)

// CRITICAL: Unique constraint ensures same product cannot be mapped to same subcategory twice for a company
// But same product CAN be mapped to different subcategories for different companies
ProductSubcategoryMappingSchema.index(
  { productId: 1, subCategoryId: 1, companyId: 1 },
  { unique: true }
)

// Additional indexes for efficient queries
ProductSubcategoryMappingSchema.index({ companyId: 1, subCategoryId: 1 })
ProductSubcategoryMappingSchema.index({ productId: 1, companyId: 1 })

// Validation: Ensure subcategory belongs to the same company
ProductSubcategoryMappingSchema.pre('save', async function(next) {
  try {
    if (this.isModified('subCategoryId') || this.isModified('companyId') || this.isNew) {
      // Use the imported Subcategory model to ensure consistency
      const Subcategory = mongoose.models.Subcategory || mongoose.model('Subcategory')
      const subcategory = await Subcategory.findOne({ id: String(this.subCategoryId) }).lean()
      
      if (!subcategory) {
        console.error('[ProductSubcategoryMapping pre-save] Subcategory not found:', {
          subCategoryId: this.subCategoryId,
          subCategoryIdType: typeof this.subCategoryId,
          subCategoryIdString: this.subCategoryId?.toString()
        })
        return next(new Error(`Subcategory with ID ${this.subCategoryId} not found`))
      }
      
      // CRITICAL SECURITY: Ensure subcategory belongs to the same company
      const subcategoryCompanyId = subcategory.companyId?.toString() || (subcategory.companyId as any)?._id?.toString()
      const mappingCompanyId = this.companyId?.toString() || (this.companyId as any)?._id?.toString()
      
      if (subcategoryCompanyId !== mappingCompanyId) {
        console.error('[ProductSubcategoryMapping pre-save] Company mismatch:', {
          subcategoryCompanyId,
          mappingCompanyId,
          subcategoryName: subcategory.name,
          subCategoryId: this.subCategoryId?.toString()
        })
        return next(new Error(`Subcategory "${subcategory.name}" does not belong to company ${mappingCompanyId}`))
      }
      
      if (subcategory.status !== 'active') {
        console.error('[ProductSubcategoryMapping pre-save] Subcategory not active:', {
          subcategoryName: subcategory.name,
          status: subcategory.status,
          subCategoryId: this.subCategoryId?.toString()
        })
        return next(new Error(`Subcategory "${subcategory.name}" is not active`))
      }
      
      console.log('[ProductSubcategoryMapping pre-save] ✅ Validation passed:', {
        subCategoryId: this.subCategoryId?.toString(),
        companyId: mappingCompanyId,
        subcategoryName: subcategory.name
      })
    }
    
    next()
  } catch (preSaveError: any) {
    console.error('[ProductSubcategoryMapping pre-save] ❌ Exception in pre-save hook:', {
      error: preSaveError.message,
      stack: preSaveError.stack,
      subCategoryId: this.subCategoryId?.toString(),
      companyId: this.companyId?.toString()
    })
    next(preSaveError)
  }
})

const ProductSubcategoryMapping = mongoose.models.ProductSubcategoryMapping || 
  mongoose.model<IProductSubcategoryMapping>('ProductSubcategoryMapping', ProductSubcategoryMappingSchema)

export default ProductSubcategoryMapping

