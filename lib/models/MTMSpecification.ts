/**
 * MTMSpecification Model
 * 
 * Defines measurement templates per garment category for Made-to-Measure orders.
 * Each specification describes which body measurements are required, their valid ranges,
 * display order, and ISO 8559-1 alignment.
 * 
 * A specification is scoped to a company + garment category combination.
 * The same category may have different measurement requirements per company.
 * 
 * Example:
 *   Company A "shirt" specification: chest, shoulder, sleeve, neck, back_length
 *   Company B "shirt" specification: chest, shoulder, sleeve, neck (no back_length)
 */

import mongoose, { Schema, Document } from 'mongoose'

// =============================================================================
// MEASUREMENT POINT DEFINITION
// =============================================================================

export interface IMeasurementPoint {
  key: string // Machine key, ISO-aligned (e.g., 'chest_girth', 'waist_girth')
  label: string // Display name (e.g., 'Chest')
  description: string // How to take the measurement
  iso_reference?: string // ISO 8559-1 reference (e.g., 'ISO 8559-1 §5.2.1')
  unit: 'cm' | 'inches' // Measurement unit
  min_value: number // Minimum valid value (reject below)
  max_value: number // Maximum valid value (reject above)
  precision: number // Rounding precision (e.g., 0.5 for nearest half unit)
  diagram_key?: string // Reference to measurement diagram asset
  is_required: boolean // Whether this measurement is mandatory
  display_order: number // Order in the measurement form
}

// =============================================================================
// MTM SPECIFICATION INTERFACE
// =============================================================================

export interface IMTMSpecification extends Document {
  id: string // System-generated alphanumeric ID (e.g., 'MTMSPEC-000001')
  companyId: string // String ID reference to Company (alphanumeric)
  garment_category: string // Garment category (e.g., 'shirt', 'pant', 'jacket')
  specification_name: string // Human-readable name (e.g., 'Standard Shirt Measurements')
  measurement_points: IMeasurementPoint[] // Array of required measurement definitions
  status: 'active' | 'inactive' // Specification status
  version: number // Version number for audit trail
  created_by?: string // User who created the specification
  updated_by?: string // User who last updated the specification
  createdAt?: Date
  updatedAt?: Date
}

// =============================================================================
// MEASUREMENT POINT SCHEMA
// =============================================================================

const MeasurementPointSchema = new Schema<IMeasurementPoint>(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      validate: {
        validator: function(v: string) {
          return /^[a-z][a-z0-9_]{1,49}$/.test(v)
        },
        message: 'Measurement key must be lowercase alphanumeric with underscores (e.g., "chest_girth")'
      }
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    iso_reference: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
    },
    unit: {
      type: String,
      enum: ['cm', 'inches'],
      required: true,
      default: 'cm',
    },
    min_value: {
      type: Number,
      required: true,
      min: 0,
    },
    max_value: {
      type: Number,
      required: true,
      min: 0,
    },
    precision: {
      type: Number,
      required: true,
      default: 0.5,
      min: 0.1,
    },
    diagram_key: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
    },
    is_required: {
      type: Boolean,
      required: true,
      default: true,
    },
    display_order: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: false }
)

// =============================================================================
// MTM SPECIFICATION SCHEMA
// =============================================================================

const MTMSpecificationSchema = new Schema<IMTMSpecification>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Specification ID must be alphanumeric (1-50 characters)'
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
    garment_category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    specification_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    measurement_points: {
      type: [MeasurementPointSchema],
      required: true,
      validate: {
        validator: function(v: IMeasurementPoint[]) {
          return v && v.length > 0
        },
        message: 'At least one measurement point is required'
      }
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      required: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
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

// One active specification per company + garment category
MTMSpecificationSchema.index(
  { companyId: 1, garment_category: 1, status: 1 }
)

// Efficient lookup by company
MTMSpecificationSchema.index({ companyId: 1, status: 1 })

// Pre-save: validate min < max for all measurement points
MTMSpecificationSchema.pre('save', function(next) {
  if (this.measurement_points) {
    for (const point of this.measurement_points) {
      if (point.min_value >= point.max_value) {
        return next(new Error(
          `Measurement "${point.key}": min_value (${point.min_value}) must be less than max_value (${point.max_value})`
        ))
      }
    }

    // Validate unique keys within the specification
    const keys = this.measurement_points.map(p => p.key)
    const uniqueKeys = new Set(keys)
    if (keys.length !== uniqueKeys.size) {
      return next(new Error('Duplicate measurement point keys found in specification'))
    }
  }
  next()
})

const MTMSpecification = mongoose.models.MTMSpecification ||
  mongoose.model<IMTMSpecification>('MTMSpecification', MTMSpecificationSchema)

export default MTMSpecification
