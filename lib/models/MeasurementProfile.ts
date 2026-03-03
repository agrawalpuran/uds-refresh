/**
 * MeasurementProfile Model
 * 
 * Stores an employee's body measurements as a reusable profile.
 * Measurements are captured once and reused across multiple MTM orders.
 * 
 * Each employee can have multiple profiles (e.g., updated over time)
 * but only ONE is marked as active at any time.
 * 
 * Measurement keys align with ISO 8559-1 anthropometric definitions
 * and match the keys defined in MTMSpecification.measurement_points.
 * 
 * Follows the per-entity configuration pattern used by VendorWarehouse.
 */

import mongoose, { Schema, Document } from 'mongoose'

// =============================================================================
// MEASUREMENT VALUE
// =============================================================================

export interface IMeasurementValue {
  value: number // The measured value
  unit: 'cm' | 'inches' // Unit of measurement
}

// =============================================================================
// MEASUREMENT PROFILE INTERFACE
// =============================================================================

export interface IMeasurementProfile extends Document {
  id: string // System-generated alphanumeric ID (e.g., 'MPROF-000001')
  employeeId: string // String ID reference to Employee (alphanumeric)
  companyId: string // String ID reference to Company (alphanumeric)
  measurements: Map<string, IMeasurementValue> // ISO-aligned key → value+unit map
  capture_method: 'MANUAL_TAPE' | 'PHOTO_AI' | 'PROFESSIONAL' | 'SELF_REPORTED'
  captured_by?: string // Employee ID or name of the person who took measurements
  captured_at: Date // When the measurements were taken
  is_active: boolean // Whether this is the current active profile for the employee
  notes?: string // Optional notes (e.g., 'Measured by vendor rep during camp')
  status: 'active' | 'inactive' // Profile status
  created_by?: string // User who created the profile
  updated_by?: string // User who last updated the profile
  createdAt?: Date
  updatedAt?: Date
}

// =============================================================================
// MEASUREMENT VALUE SCHEMA
// =============================================================================

const MeasurementValueSchema = new Schema<IMeasurementValue>(
  {
    value: {
      type: Number,
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      enum: ['cm', 'inches'],
      required: true,
      default: 'cm',
    },
  },
  { _id: false }
)

// =============================================================================
// MEASUREMENT PROFILE SCHEMA
// =============================================================================

const MeasurementProfileSchema = new Schema<IMeasurementProfile>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Profile ID must be alphanumeric (1-50 characters)'
      }
    },
    employeeId: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Employee ID must be alphanumeric (1-50 characters)'
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
    measurements: {
      type: Map,
      of: MeasurementValueSchema,
      required: true,
      validate: {
        validator: function(v: Map<string, IMeasurementValue>) {
          return v && v.size > 0
        },
        message: 'At least one measurement is required'
      }
    },
    capture_method: {
      type: String,
      enum: ['MANUAL_TAPE', 'PHOTO_AI', 'PROFESSIONAL', 'SELF_REPORTED'],
      required: true,
      default: 'MANUAL_TAPE',
    },
    captured_by: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
    },
    captured_at: {
      type: Date,
      required: true,
      default: Date.now,
    },
    is_active: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    notes: {
      type: String,
      required: false,
      trim: true,
      maxlength: 1000,
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

// Employee lookup: find profiles for an employee
MeasurementProfileSchema.index({ employeeId: 1, status: 1 })

// Active profile lookup: one active profile per employee
MeasurementProfileSchema.index({ employeeId: 1, is_active: 1 })

// Company-wide queries
MeasurementProfileSchema.index({ companyId: 1, status: 1 })

// Pre-save: ensure only one active profile per employee
MeasurementProfileSchema.pre('save', async function(next) {
  if (this.is_active && (this.isNew || this.isModified('is_active'))) {
    const MeasurementProfile = mongoose.model('MeasurementProfile')
    await MeasurementProfile.updateMany(
      {
        employeeId: this.employeeId,
        id: { $ne: this.id },
        is_active: true,
      },
      { is_active: false }
    )
  }
  next()
})

const MeasurementProfile = mongoose.models.MeasurementProfile ||
  mongoose.model<IMeasurementProfile>('MeasurementProfile', MeasurementProfileSchema)

export default MeasurementProfile
