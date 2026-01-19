import mongoose, { Schema, Document } from 'mongoose'
import { generateShippingId } from '../db/shipping-config-access'

/**
 * ShipmentPickupConfig Model
 * 
 * Stores pickup configuration for aggregator shipments.
 * Links vendor warehouses to pickup contact details.
 * Used in automatic shipment flow to provide pickup information to aggregators.
 */
export interface IShipmentPickupConfig extends Document {
  pickupConfigId: string // System-generated alphanumeric ID (≤15 chars, primary key)
  shipmentServiceProviderRefId: string // Reference to ShipmentServiceProvider
  vendorId: string // Vendor ID (references vendors.id)
  warehouseId: string // Warehouse Ref ID (references vendorwarehouses.warehouseRefId)
  pickupContactName: string // Contact person name
  pickupPhone: string // Contact phone number (10 digits, normalized)
  pickupAddressLine1: string // Address line 1 (required)
  pickupAddressLine2?: string // Address line 2 (optional)
  pickupCity: string // City name (required)
  pickupState: string // State name (required)
  pickupPincode: string // Postal code (required, 6 digits for India)
  pickupCountry: string // Country name (default: 'India')
  isActive: boolean // Whether this pickup config is active
  createdAt?: Date
  updatedAt?: Date
  createdBy?: string // Super Admin or Vendor identifier
  updatedBy?: string // Super Admin or Vendor identifier
}

const ShipmentPickupConfigSchema = new Schema<IShipmentPickupConfig>(
  {
    pickupConfigId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Z0-9_]{1,15}$/.test(v)
        },
        message: 'Pickup Config ID must be alphanumeric (uppercase) with underscores, max 15 characters'
      }
    },
    shipmentServiceProviderRefId: {
      type: String,
      required: true,
      index: true,
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
    warehouseId: {
      type: String,
      required: true,
      index: true,
    },
    pickupContactName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    pickupPhone: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function(v: string) {
          // Must be exactly 10 digits after normalization
          const digitsOnly = v.replace(/\D/g, '')
          return digitsOnly.length === 10 && /^\d{10}$/.test(digitsOnly)
        },
        message: 'Pickup phone must be exactly 10 digits'
      }
    },
    pickupAddressLine1: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    pickupAddressLine2: {
      type: String,
      required: false,
      trim: true,
      maxlength: 255,
    },
    pickupCity: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    pickupState: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    pickupPincode: {
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
    pickupCountry: {
      type: String,
      required: true,
      default: 'India',
      trim: true,
      maxlength: 50,
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
ShipmentPickupConfigSchema.index({ vendorId: 1, isActive: 1 })
ShipmentPickupConfigSchema.index({ vendorId: 1, warehouseId: 1 })
ShipmentPickupConfigSchema.index({ shipmentServiceProviderRefId: 1, isActive: 1 })

// Delete existing model if it exists to force recompilation with new schema
if (mongoose.models.ShipmentPickupConfig) {
  delete mongoose.models.ShipmentPickupConfig
}

// Create model with latest schema
const ShipmentPickupConfig = mongoose.model<IShipmentPickupConfig>('ShipmentPickupConfig', ShipmentPickupConfigSchema)

export default ShipmentPickupConfig

