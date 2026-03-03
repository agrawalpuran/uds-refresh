/**
 * OrderMTMMeasurement Model
 * 
 * Stores the measurements used for a specific MTM order item.
 * This is a separate extension table (not embedded in Order) following
 * the same pattern as OrderSuborder.
 * 
 * Each record links to an order + item index, capturing the exact
 * measurements at the time of order placement. These are snapshot values —
 * if the employee updates their MeasurementProfile later, existing
 * order measurements are not affected.
 * 
 * This design avoids modifying the Order schema while providing full
 * measurement traceability per order item.
 */

import mongoose, { Schema, Document } from 'mongoose'

// =============================================================================
// MEASUREMENT SNAPSHOT VALUE
// =============================================================================

export interface IMeasurementSnapshotValue {
  key: string // ISO-aligned measurement key (e.g., 'chest_girth')
  label: string // Display name at time of order (e.g., 'Chest')
  value: number // The measured value
  unit: 'cm' | 'inches' // Unit of measurement
}

// =============================================================================
// ORDER MTM MEASUREMENT INTERFACE
// =============================================================================

export interface IOrderMTMMeasurement extends Document {
  id: string // System-generated alphanumeric ID (e.g., 'OMTM-000001')
  order_id: string // String ID reference to Order (alphanumeric)
  item_index: number // Index of the item in Order.items[] array (0-based)
  product_id: string // String ID reference to Uniform/Product (for cross-reference)
  measurement_profile_id?: string // String ID reference to MeasurementProfile used (for audit)
  mtm_specification_id: string // String ID reference to MTMSpecification used (for audit)
  measurements: IMeasurementSnapshotValue[] // Snapshot of measurements at order time
  mtm_instructions?: string // Special instructions from the employee (e.g., 'Slightly loose fit')
  mtm_price_premium?: number // MTM premium charged for this item
  createdAt?: Date
  updatedAt?: Date
}

// =============================================================================
// MEASUREMENT SNAPSHOT SCHEMA
// =============================================================================

const MeasurementSnapshotValueSchema = new Schema<IMeasurementSnapshotValue>(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
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
// ORDER MTM MEASUREMENT SCHEMA
// =============================================================================

const OrderMTMMeasurementSchema = new Schema<IOrderMTMMeasurement>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Order MTM Measurement ID must be alphanumeric (1-50 characters)'
      }
    },
    order_id: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Order ID must be alphanumeric (1-50 characters)'
      }
    },
    item_index: {
      type: Number,
      required: true,
      min: 0,
    },
    product_id: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Product ID must be alphanumeric (1-50 characters)'
      }
    },
    measurement_profile_id: {
      type: String,
      required: false,
      validate: {
        validator: function(v: string) {
          return !v || /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Measurement Profile ID must be alphanumeric (1-50 characters)'
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
    measurements: {
      type: [MeasurementSnapshotValueSchema],
      required: true,
      validate: {
        validator: function(v: IMeasurementSnapshotValue[]) {
          return v && v.length > 0
        },
        message: 'At least one measurement is required'
      }
    },
    mtm_instructions: {
      type: String,
      required: false,
      trim: true,
      maxlength: 1000,
    },
    mtm_price_premium: {
      type: Number,
      required: false,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
)

// One measurement record per order item (unique constraint)
OrderMTMMeasurementSchema.index(
  { order_id: 1, item_index: 1 },
  { unique: true }
)

// Lookup by order (all MTM items in an order)
OrderMTMMeasurementSchema.index({ order_id: 1 })

// Lookup by product (analytics: which products get MTM orders)
OrderMTMMeasurementSchema.index({ product_id: 1 })

// Lookup by measurement profile (audit: which orders used this profile)
OrderMTMMeasurementSchema.index({ measurement_profile_id: 1 }, { sparse: true })

const OrderMTMMeasurement = mongoose.models.OrderMTMMeasurement ||
  mongoose.model<IOrderMTMMeasurement>('OrderMTMMeasurement', OrderMTMMeasurementSchema)

export default OrderMTMMeasurement
