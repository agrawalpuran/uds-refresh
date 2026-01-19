/**
 * DesignationSubcategoryEligibility Model - COMPANY-SPECIFIC
 * 
 * Defines eligibility at the subcategory level (not category level).
 * Each designation can have different eligibility for different subcategories.
 * 
 * Example:
 *   Designation: "General Manager"
 *   Company A:
 *     - "Managers Full Shirt" subcategory: 6 items, 6 months
 *     - "Managers Half Shirt" subcategory: 4 items, 6 months
 *   Company B:
 *     - "Executive Shirt" subcategory: 8 items, 12 months
 */

import mongoose, { Schema, Document } from 'mongoose'
import Subcategory from './Subcategory'

export interface IDesignationSubcategoryEligibility extends Document {
  id: string // Unique alphanumeric ID (e.g., "ELIG-000001")
  designationId: string // Designation name (e.g., "General Manager", "Office Admin")
  subCategoryId: string // String ID reference to Subcategory (alphanumeric) - REQUIRED
  companyId: string // String ID reference to Company (alphanumeric) - REQUIRED
  gender?: 'male' | 'female' | 'unisex' // Gender filter (optional)
  quantity: number // Number of items allowed per cycle
  renewalFrequency: number // Renewal frequency value
  renewalUnit: 'months' | 'years' // Renewal unit
  status: 'active' | 'inactive'
  createdAt?: Date
  updatedAt?: Date
}

const DesignationSubcategoryEligibilitySchema = new Schema<IDesignationSubcategoryEligibility>(
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
        message: 'Designation Subcategory Eligibility ID must be alphanumeric (1-50 characters)'
      }
    },
    designationId: {
      type: String,
      required: true,
      trim: true,
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
    gender: {
      type: String,
      enum: ['male', 'female', 'unisex'],
      default: 'unisex',
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    renewalFrequency: {
      type: Number,
      required: true,
      min: 1,
    },
    renewalUnit: {
      type: String,
      enum: ['months', 'years'],
      required: true,
      default: 'months',
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
DesignationSubcategoryEligibilitySchema.index({ companyId: 1, designationId: 1, status: 1 })
DesignationSubcategoryEligibilitySchema.index({ companyId: 1, subCategoryId: 1, status: 1 })
DesignationSubcategoryEligibilitySchema.index({ companyId: 1, designationId: 1, gender: 1, status: 1 })

// Unique constraint: Same designation cannot have duplicate eligibility for same subcategory, company, and gender
DesignationSubcategoryEligibilitySchema.index(
  { designationId: 1, subCategoryId: 1, companyId: 1, gender: 1 },
  { unique: true }
)

// Validation: Ensure subcategory belongs to the same company
// CRITICAL: Disable this hook temporarily to prevent ObjectId casting errors
// Validation is now handled in the API route instead
DesignationSubcategoryEligibilitySchema.pre('save', async function(next) {
  // Skip validation in pre-save hook - validation is done in API route
  // This prevents Mongoose from trying to cast string IDs to ObjectId
  next()
})

const DesignationSubcategoryEligibility = mongoose.models.DesignationSubcategoryEligibility || 
  mongoose.model<IDesignationSubcategoryEligibility>('DesignationSubcategoryEligibility', DesignationSubcategoryEligibilitySchema)

export default DesignationSubcategoryEligibility

