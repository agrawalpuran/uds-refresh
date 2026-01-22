import mongoose, { Schema, Document } from 'mongoose'

/**
 * Shipment Model
 * 
 * Runtime shipment entity for tracking both MANUAL and API-backed shipments.
 * Extends PR shipment data with provider-specific tracking information.
 * 
 * Rules:
 * - All fields nullable for backward compatibility
 * - shipmentMode determines if shipment is MANUAL or API-backed
 * - API shipments sync status from provider
 * - Manual shipments updated by vendor directly
 */
export interface IShipment extends Document {
  shipmentId: string // System-generated alphanumeric ID (≤15 chars, primary key)
  prNumber: string // PR Number (references Order.pr_number)
  poNumber?: string // PO Number (optional, for reference)
  vendorId: string // Vendor ID (6-digit numeric string)
  
  // Shipment Mode
  shipmentMode: 'MANUAL' | 'API' // Shipment mode
  
  // Provider References (nullable for MANUAL shipments)
  providerId?: string // Provider ID (references ShipmentServiceProvider.providerId)
  companyShippingProviderId?: string // Company-provider mapping ID
  
  // Provider Shipment Data (nullable for MANUAL shipments)
  providerShipmentReference?: string // Provider's shipment reference/ID
  trackingNumber?: string // Tracking number (may come from provider or manual entry)
  trackingUrl?: string // Tracking URL (may come from provider or manual entry)
  
  // Warehouse Information (for automatic shipments)
  warehouseRefId?: string // Warehouse Ref ID (references VendorWarehouse.warehouseRefId)
  warehousePincode?: string // Warehouse pincode (cached for serviceability checks)
  
  // Package Information
  shipmentPackageId?: string // Package ID (references ShipmentPackage.packageId)
  lengthCm?: number // Package length in cm
  breadthCm?: number // Package breadth in cm
  heightCm?: number // Package height in cm
  volumetricWeight?: number // Calculated volumetric weight in kg
  
  // Shipping Cost
  shippingCost?: number // Shipping cost in INR (from estimation or provider)
  
  // Shipment Status
  shipmentStatus: 'CREATED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' // Shipment status
  
  // Sync Metadata
  lastProviderSyncAt?: Date // Last time status was synced from provider
  rawProviderResponse?: any // Raw JSON response from provider (for debugging)
  
  // Courier-Specific Data (for API shipments with courier integration)
  courierAwbNumber?: string // Courier AWB / Consignment Number (e.g., DTDC AWB)
  courierProviderCode?: string // Courier provider code (e.g., "DTDC", "BLUEDART")
  courierStatus?: string // Courier shipment status (e.g., "CREATED", "IN_TRANSIT", "DELIVERED")
  courierTrackingUrl?: string // Courier-specific tracking URL (optional)
  courierResponseRaw?: any // Raw JSON response from courier API (for audit/debug)
  
  // Manual Shipment Data (for MANUAL mode shipments)
  modeOfTransport?: 'COURIER' | 'DIRECT' | 'HAND_DELIVERY' // Mode of transport for manual shipments
  dispatchedDate?: Date // Date items were dispatched (for manual shipments)
  shipmentNumber?: string // Manual AWB / Docket Number (stored in providerShipmentReference for manual shipments)
  
  // ============================================================================
  // UNIFIED STATUS FIELDS (Workflow Unification - Dual-Write)
  // ============================================================================
  unified_shipment_status?: string // Unified shipment status (CREATED, MANIFESTED, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, FAILED, RETURNED, LOST)
  unified_shipment_status_updated_at?: Date // Timestamp of last unified status update
  unified_shipment_status_updated_by?: string // User who last updated unified status
  deliveredDate?: Date // Date items were delivered (for completed shipments)
  failure_reason?: string // Reason for failure (if status is FAILED/RETURNED/LOST)
  // Audit
  createdAt?: Date
  updatedAt?: Date
}

const ShipmentSchema = new Schema<IShipment>(
  {
    shipmentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Z0-9_]{1,15}$/.test(v)
        },
        message: 'Shipment ID must be alphanumeric (uppercase) with underscores, max 15 characters'
      }
    },
    prNumber: {
      type: String,
      required: true,
      index: true,
      trim: true,
      maxlength: 100,
    },
    poNumber: {
      type: String,
      required: false,
      index: true,
      trim: true,
      maxlength: 100,
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
    shipmentMode: {
      type: String,
      enum: ['MANUAL', 'API'],
      required: true,
      default: 'MANUAL',
      index: true,
    },
    providerId: {
      type: String,
      required: false,
      index: true,
      validate: {
        validator: function(v: string) {
          if (!v) return true
          return /^[A-Z0-9_]{1,15}$/.test(v)
        },
        message: 'Provider ID must be alphanumeric (uppercase) with underscores, max 15 characters'
      }
    },
    companyShippingProviderId: {
      type: String,
      required: false,
      index: true,
      validate: {
        validator: function(v: string) {
          if (!v) return true
          return /^[A-Z0-9_]{1,15}$/.test(v)
        },
        message: 'Company Shipping Provider ID must be alphanumeric (uppercase) with underscores, max 15 characters'
      }
    },
    providerShipmentReference: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
      index: true,
    },
    trackingNumber: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
      index: true,
    },
    trackingUrl: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
    },
    warehouseRefId: {
      type: String,
      required: false,
      index: true,
      validate: {
        validator: function(v: string) {
          if (!v) return true
          return /^[A-Z0-9_]{1,15}$/.test(v)
        },
        message: 'Warehouse Ref ID must be alphanumeric (uppercase) with underscores, max 15 characters'
      }
    },
    warehousePincode: {
      type: String,
      required: false,
      trim: true,
      validate: {
        validator: function(v: string) {
          if (!v) return true
          return /^\d{6}$/.test(v)
        },
        message: 'Warehouse pincode must be exactly 6 digits'
      },
      index: true,
    },
    shipmentPackageId: {
      type: String,
      required: false,
      index: true,
      validate: {
        validator: function(v: string) {
          if (!v) return true
          return /^[A-Z0-9_]{1,15}$/.test(v)
        },
        message: 'Shipment Package ID must be alphanumeric (uppercase) with underscores, max 15 characters'
      }
    },
    lengthCm: {
      type: Number,
      required: false,
      min: 0.1,
    },
    breadthCm: {
      type: Number,
      required: false,
      min: 0.1,
    },
    heightCm: {
      type: Number,
      required: false,
      min: 0.1,
    },
    volumetricWeight: {
      type: Number,
      required: false,
      min: 0,
    },
    shippingCost: {
      type: Number,
      required: false,
      min: 0,
    },
    shipmentStatus: {
      type: String,
      enum: ['CREATED', 'IN_TRANSIT', 'DELIVERED', 'FAILED'],
      required: true,
      default: 'CREATED',
      index: true,
    },
    lastProviderSyncAt: {
      type: Date,
      required: false,
      index: true,
    },
    rawProviderResponse: {
      type: Schema.Types.Mixed,
      required: false,
    },
    courierAwbNumber: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
      index: true,
    },
    courierProviderCode: {
      type: String,
      required: false,
      trim: true,
      maxlength: 50,
      index: true,
    },
    courierStatus: {
      type: String,
      required: false,
      trim: true,
      maxlength: 50,
    },
    courierTrackingUrl: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
    },
    courierResponseRaw: {
      type: Schema.Types.Mixed,
      required: false,
    },
    // Manual Shipment Data (for MANUAL mode shipments)
    modeOfTransport: {
      type: String,
      enum: ['COURIER', 'DIRECT', 'HAND_DELIVERY'],
      required: false,
      index: true,
    },
    dispatchedDate: {
      type: Date,
      required: false,
      index: true,
    },
    shipmentNumber: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
      index: true,
      // This is the manual AWB/docket number - stored in providerShipmentReference for manual shipments
      // Stored explicitly for clarity and future compatibility
    },
  },
  {
    timestamps: true,
  }
)

// Indexes for efficient queries
ShipmentSchema.index({ prNumber: 1, vendorId: 1 })
ShipmentSchema.index({ shipmentStatus: 1, shipmentMode: 1 })
ShipmentSchema.index({ providerId: 1, shipmentStatus: 1 })
// Note: lastProviderSyncAt and courierAwbNumber already have index: true in field definitions
// Note: shipmentStatus already has index: true in field definition
ShipmentSchema.index({ courierProviderCode: 1, courierStatus: 1 }) // For courier status queries

const Shipment = mongoose.models.Shipment || mongoose.model<IShipment>('Shipment', ShipmentSchema)

export default Shipment

