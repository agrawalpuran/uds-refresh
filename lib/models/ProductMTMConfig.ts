/**
 * ProductMTMConfig Model
 * 
 * Maps products to MTM availability and links to the appropriate measurement
 * specification. If a product has a row here with status 'active', it supports
 * Made-to-Measure ordering. If no row exists, the product is standard-only.
 * 
 * This is a separate mapping table (not embedded in Uniform) following the
 * same pattern as ProductSubcategoryMapping.
 * 
 * Example:
 *   Product "Premium Shirt" (PROD-001) for Company A:
 *     mtm_specification_id: "MTMSPEC-SHIRT-001"
 *     mtm_price_premium: 500 (extra cost for MTM)
 *     estimated_production_days: 14
 */

import mongoose, { Schema, Document } from 'mongoose'

export interface IProductMTMConfig extends Document {
  productId: string // String ID reference to Uniform/Product (alphanumeric)
  companyId: string // String ID reference to Company (alphanumeric)
  mtm_specification_id: string // String ID reference to MTMSpecification (alphanumeric)
  mtm_price_premium?: number // Additional cost for MTM over standard price (optional)
  estimated_production_days?: number // Estimated production time for MTM orders
  status: 'active' | 'inactive' // Whether MTM is currently available for this product
  created_by?: string // User who enabled MTM for this product
  updated_by?: string // User who last updated this config
  createdAt?: Date
  updatedAt?: Date
}

const ProductMTMConfigSchema = new Schema<IProductMTMConfig>(
  {
    productId: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Product ID must be alphanumeric (1-50 characters)'
      }
    },
    companyId: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Company ID must be alphanumeric (1-50 characters)'
      }
    },
    mtm_specification_id: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'MTM Specification ID must be alphanumeric (1-50 characters)'
      }
    },
    mtm_price_premium: {
      type: Number,
      required: false,
      default: 0,
      min: 0,
    },
    estimated_production_days: {
      type: Number,
      required: false,
      min: 1,
      max: 365,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      required: true,
      index: true,
    },
    created_by: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
    },
    updated_by: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
    },
  },
  {
    timestamps: true,
  }
)

// One MTM config per product per company (unique constraint)
ProductMTMConfigSchema.index(
  { productId: 1, companyId: 1 },
  { unique: true }
)

// Efficient queries: all MTM products for a company
ProductMTMConfigSchema.index({ companyId: 1, status: 1 })

// Lookup by specification (find all products using a spec)
ProductMTMConfigSchema.index({ mtm_specification_id: 1 })

const ProductMTMConfig = mongoose.models.ProductMTMConfig ||
  mongoose.model<IProductMTMConfig>('ProductMTMConfig', ProductMTMConfigSchema)

export default ProductMTMConfig
