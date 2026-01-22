/**
 * Category Model - GLOBAL (Super Admin Managed)
 * 
 * Categories are global and not company-specific.
 * Super Admin creates/manages categories.
 * Company Admins create subcategories under these categories.
 */

import mongoose, { Schema, Document } from 'mongoose'

export interface ICategory extends Document {
  id: string // Unique 6-digit ID (e.g., "500001")
  name: string // Category name (e.g., "Shirt", "Pant", "Shoe", "Jacket", "Accessory")
  isSystemCategory: boolean // True for system categories (shirt, pant, shoe, jacket, accessory)
  status: 'active' | 'inactive'
  createdAt?: Date
  updatedAt?: Date
  // NO companyId - Categories are GLOBAL
}

const CategorySchema = new Schema<ICategory>(
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
        message: 'Category ID must be alphanumeric (1-50 characters)'
      }
    },
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true, // Global unique name (case-insensitive handled by application logic)
    },
    isSystemCategory: {
      type: Boolean,
      default: false,
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
CategorySchema.index({ status: 1 })
CategorySchema.index({ isSystemCategory: 1, status: 1 })

// Ensure name is unique (case-insensitive) - application-level validation
CategorySchema.pre('save', async function(next) {
  if (this.isModified('name')) {
    const Category = mongoose.model('Category')
    const existing = await Category.findOne({
      name: { $regex: new RegExp(`^${this.name}$`, 'i') },
      _id: { $ne: this._id }
    })
    if (existing) {
      return next(new Error(`Category with name "${this.name}" already exists`))
    }
  }
  next()
})

const Category = mongoose.models.Category || 
  mongoose.model<ICategory>('Category', CategorySchema)

export default Category

