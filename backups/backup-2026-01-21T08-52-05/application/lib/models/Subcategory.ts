/**
 * Subcategory Model - COMPANY-SPECIFIC (Company Admin Managed)
 * 
 * Subcategories belong to a specific company and have a parent category.
 * Company Admins create/manage subcategories for their company only.
 * 
 * Example:
 *   Category: "Shirt" (global)
 *   Company A Subcategories: "Managers Full Shirt", "Managers Half Shirt"
 *   Company B Subcategories: "Executive Shirt", "Staff Shirt"
 */

import mongoose, { Schema, Document } from 'mongoose'

export interface ISubcategory extends Document {
  id: string // Unique alphanumeric ID (e.g., "SUBCAT-000001")
  name: string // Subcategory name (e.g., "Managers Full Shirt", "Managers Half Shirt")
  parentCategoryId: string // String ID reference to Category (alphanumeric) - REQUIRED
  companyId: string // String ID reference to Company (alphanumeric) - REQUIRED
  status: 'active' | 'inactive'
  createdAt?: Date
  updatedAt?: Date
}

const SubcategorySchema = new Schema<ISubcategory>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric (1-50 characters)
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Subcategory ID must be alphanumeric (1-50 characters)'
      }
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    parentCategoryId: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric (1-50 characters)
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Parent Category ID must be alphanumeric (1-50 characters)'
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
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
  },
  {
    timestamps: true,
  }
)

// Indexes for efficient queries
SubcategorySchema.index({ companyId: 1, status: 1 })
SubcategorySchema.index({ parentCategoryId: 1, companyId: 1, status: 1 })
// Unique constraint: same name cannot exist for same parent category and company
SubcategorySchema.index({ parentCategoryId: 1, companyId: 1, name: 1 }, { unique: true })

// Validation: Ensure parent category exists and is active
SubcategorySchema.pre('save', async function(next) {
  if (this.isModified('parentCategoryId') || this.isNew) {
    const Category = mongoose.model('Category')
    const parentCategory = await Category.findOne({ id: this.parentCategoryId })
    if (!parentCategory) {
      return next(new Error(`Parent category with ID ${this.parentCategoryId} not found`))
    }
    if (parentCategory.status !== 'active') {
      return next(new Error(`Parent category "${parentCategory.name}" is not active`))
    }
  }
  
  // Ensure name is unique within company and parent category (case-insensitive)
  if (this.isModified('name') || this.isNew) {
    const Subcategory = mongoose.model('Subcategory')
    const existing = await Subcategory.findOne({
      parentCategoryId: this.parentCategoryId,
      companyId: this.companyId,
      name: { $regex: new RegExp(`^${this.name}$`, 'i') },
      _id: { $ne: this._id }
    })
    if (existing) {
      return next(new Error(`Subcategory with name "${this.name}" already exists for this category and company`))
    }
  }
  
  next()
})

const Subcategory = mongoose.models.Subcategory || 
  mongoose.model<ISubcategory>('Subcategory', SubcategorySchema)

export default Subcategory

