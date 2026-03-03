/**
 * VendorMTMCapability Model
 * 
 * Records which vendors can fulfill Made-to-Measure orders for which
 * garment categories. A vendor without a capability record for a category
 * is assumed to be standard-only for that category.
 * 
 * Follows the same mapping-table pattern as ProductVendor in Relationship.ts.
 * 
 * Example:
 *   Vendor "Tailors Co." (VEND-001):
 *     { garment_category: 'shirt', is_active: true }  → Can do MTM shirts
 *     { garment_category: 'pant', is_active: true }   → Can do MTM pants
 *     (no 'shoe' record)                               → Standard shoes only
 */

import mongoose, { Schema, Document } from 'mongoose'

export interface IVendorMTMCapability extends Document {
  vendorId: string // String ID reference to Vendor (alphanumeric)
  garment_category: string // Garment category this capability applies to (e.g., 'shirt', 'pant')
  is_active: boolean // Whether the vendor currently accepts MTM orders for this category
  max_daily_capacity?: number // Optional: max MTM orders per day for this category
  avg_production_days?: number // Optional: average production time in days
  quality_rating?: number // Optional: quality rating (1-5 scale)
  notes?: string // Optional: internal notes about capability
  created_by?: string // User who created this record
  updated_by?: string // User who last updated this record
  createdAt?: Date
  updatedAt?: Date
}

const VendorMTMCapabilitySchema = new Schema<IVendorMTMCapability>(
  {
    vendorId: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Vendor ID must be alphanumeric (1-50 characters)'
      }
    },
    garment_category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    is_active: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    max_daily_capacity: {
      type: Number,
      required: false,
      min: 1,
    },
    avg_production_days: {
      type: Number,
      required: false,
      min: 1,
      max: 365,
    },
    quality_rating: {
      type: Number,
      required: false,
      min: 1,
      max: 5,
    },
    notes: {
      type: String,
      required: false,
      trim: true,
      maxlength: 1000,
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

// One capability record per vendor per garment category (unique constraint)
VendorMTMCapabilitySchema.index(
  { vendorId: 1, garment_category: 1 },
  { unique: true }
)

// Efficient queries: all active MTM vendors for a category
VendorMTMCapabilitySchema.index({ garment_category: 1, is_active: 1 })

// All capabilities for a vendor
VendorMTMCapabilitySchema.index({ vendorId: 1, is_active: 1 })

const VendorMTMCapability = mongoose.models.VendorMTMCapability ||
  mongoose.model<IVendorMTMCapability>('VendorMTMCapability', VendorMTMCapabilitySchema)

export default VendorMTMCapability
