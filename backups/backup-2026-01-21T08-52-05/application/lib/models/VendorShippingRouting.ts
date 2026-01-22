import mongoose, { Schema, Document } from 'mongoose'

/**
 * VendorShippingRouting Model
 * 
 * Maps vendors to shipping aggregators and courier preferences.
 * Allows Super Admin to configure vendor-specific shipping routing.
 * 
 * Rules:
 * - One active routing record per vendor + aggregator combination
 * - Primary courier is mandatory
 * - Secondary courier is optional (used as fallback)
 * - Configuration only - no shipment logic here
 */
export interface IVendorShippingRouting extends Document {
  routingId: string // System-generated alphanumeric ID (≤15 chars, primary key)
  vendorId: string // Vendor ID (references vendors.id)
  companyId: string // Company ID (references companies.id)
  shipmentServiceProviderRefId: number // References shipmentserviceproviders.providerRefId
  primaryCourierCode: string // Primary courier code (e.g., "DTDC", "BLUEDART")
  secondaryCourierCode?: string // Secondary courier code (optional, fallback)
  isActive: boolean // Whether this routing is active
  createdAt?: Date
  updatedAt?: Date
  createdBy?: string // Super Admin identifier
  updatedBy?: string // Super Admin identifier
}

const VendorShippingRoutingSchema = new Schema<IVendorShippingRouting>(
  {
    routingId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Z0-9_]{1,15}$/.test(v)
        },
        message: 'Routing ID must be alphanumeric (uppercase) with underscores, max 15 characters'
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
    companyId: {
      type: String,
      required: true,
      index: true,
    },
    shipmentServiceProviderRefId: {
      type: Number,
      required: true,
      index: true,
      validate: {
        validator: function(v: number) {
          return v >= 100000 && v <= 9999999999 // 6-10 digits
        },
        message: 'Provider Ref ID must be a number between 100000 and 9999999999'
      }
    },
    primaryCourierCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 50,
    },
    secondaryCourierCode: {
      type: String,
      required: false,
      trim: true,
      uppercase: true,
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
VendorShippingRoutingSchema.index({ vendorId: 1, shipmentServiceProviderRefId: 1, isActive: 1 })
VendorShippingRoutingSchema.index({ companyId: 1, isActive: 1 })
VendorShippingRoutingSchema.index({ shipmentServiceProviderRefId: 1, isActive: 1 })
// CRITICAL: Index for runtime shipment creation queries (vendorId + companyId + isActive)
VendorShippingRoutingSchema.index({ vendorId: 1, companyId: 1, isActive: 1 })
// Unique constraint: one active routing per vendor + provider combination
VendorShippingRoutingSchema.index(
  { vendorId: 1, shipmentServiceProviderRefId: 1 },
  { 
    unique: true,
    partialFilterExpression: { isActive: true }
  }
)

const VendorShippingRouting = mongoose.models.VendorShippingRouting || mongoose.model<IVendorShippingRouting>('VendorShippingRouting', VendorShippingRoutingSchema)

export default VendorShippingRouting

