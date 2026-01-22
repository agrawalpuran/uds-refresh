import mongoose, { Schema, Document } from 'mongoose'
import { generateShippingId } from '../db/shipping-config-access'

/**
 * VendorWarehouse Model
 * 
 * Stores vendor warehouse locations for shipment origin.
 * Used in automatic shipment flow to determine source pincode.
 * 
 * Rules:
 * - Each vendor must have at least ONE active warehouse
 * - Only ONE warehouse can be marked as Primary per vendor
 * - Primary warehouse is default for automatic shipments
 * - Warehouses cannot be deleted if referenced by shipments
 */
export interface IVendorWarehouse extends Document {
  warehouseRefId: string // System-generated alphanumeric ID (≤15 chars, primary key)
  vendorId: string // Vendor ID (references vendors.id)
  companyId?: string // Company ID (deprecated - kept for backward compatibility, not required)
  warehouseName: string // Warehouse name
  addressLine1: string // Address line 1 (required)
  addressLine2?: string // Address line 2 (optional)
  city: string // City name (required)
  state: string // State name (required)
  country: string // Country name (default: 'India')
  pincode: string // Postal code (required, 6 digits for India)
  contactName?: string // Contact person name
  contactPhone?: string // Contact phone number
  isPrimary: boolean // Whether this is the primary warehouse (default for automatic shipments)
  isActive: boolean // Whether this warehouse is active
  createdAt?: Date
  updatedAt?: Date
  createdBy?: string // Super Admin or Vendor identifier
  updatedBy?: string // Super Admin or Vendor identifier
}

const VendorWarehouseSchema = new Schema<IVendorWarehouse>(
  {
    warehouseRefId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Z0-9_]{1,15}$/.test(v)
        },
        message: 'Warehouse Ref ID must be alphanumeric (uppercase) with underscores, max 15 characters'
      }
    },
    vendorId: {
      type: String,
      required: true,
      index: true,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric (1-50 characters)
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Vendor ID must be alphanumeric (1-50 characters)'
      }
    },
    // companyId is deprecated but kept as optional for backward compatibility
    // Explicitly set as not required and can be omitted
    companyId: {
      type: String,
      required: false,
      default: null,
      index: false,
    },
    warehouseName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    addressLine1: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    addressLine2: {
      type: String,
      required: false,
      trim: true,
      maxlength: 255,
    },
    city: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    state: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    country: {
      type: String,
      required: true,
      default: 'India',
      trim: true,
      maxlength: 50,
    },
    pincode: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function(v: string) {
          return /^\d{6}$/.test(v)
        },
        message: 'Pincode must be exactly 6 digits (e.g., "110001")'
      },
      index: true,
    },
    contactName: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
    },
    contactPhone: {
      type: String,
      required: false,
      trim: true,
      maxlength: 20,
    },
    isPrimary: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    createdBy: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
    },
    updatedBy: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
    },
  },
  {
    timestamps: true,
  }
)

// Indexes for efficient queries
VendorWarehouseSchema.index({ vendorId: 1, isActive: 1 })
VendorWarehouseSchema.index({ vendorId: 1, isPrimary: 1 })

// Pre-save hook: Ensure only one primary warehouse per vendor
VendorWarehouseSchema.pre('save', async function(next) {
  // Remove companyId if it's undefined or empty (it's deprecated)
  if (this.companyId === undefined || this.companyId === '') {
    this.companyId = undefined
  }
  
  if (this.isPrimary && (this.isNew || this.isModified('isPrimary'))) {
    // Unset other primary warehouses for this vendor
    const VendorWarehouse = mongoose.model('VendorWarehouse')
    await VendorWarehouse.updateMany(
      { 
        vendorId: this.vendorId, 
        warehouseRefId: { $ne: this.warehouseRefId },
        isPrimary: true 
      },
      { isPrimary: false }
    )
  }
  next()
})

// Delete existing model if it exists to force recompilation with new schema
// This is necessary when schema changes to ensure the latest definition is used
if (mongoose.models.VendorWarehouse) {
  delete mongoose.models.VendorWarehouse
}

// Create model with latest schema
const VendorWarehouse = mongoose.model<IVendorWarehouse>('VendorWarehouse', VendorWarehouseSchema)

export default VendorWarehouse

