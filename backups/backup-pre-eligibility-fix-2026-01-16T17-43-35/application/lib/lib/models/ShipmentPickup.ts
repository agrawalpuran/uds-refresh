import mongoose, { Schema, Document } from 'mongoose'

/**
 * ShipmentPickup Model
 * 
 * Tracks pickup scheduling and rescheduling for API-backed shipments.
 * This is an ADD-ON feature that does NOT modify existing Shipment logic.
 * 
 * Rules:
 * - One shipment can have multiple pickup attempts (for rescheduling)
 * - Latest record represents current pickup state
 * - Pickup status does NOT affect shipment/order status
 * - Only for AUTOMATIC shipments with AWB
 */

export interface IShipmentPickup extends Document {
  shipmentPickupId: string // System-generated alphanumeric ID (≤15 chars, primary key)
  shipmentId: string // References Shipment.shipmentId (indexed)
  providerCode: string // Provider code (e.g., "SHIPROCKET", "SHIPROCKET_ICICI")
  awbNumber: string // AWB number from courier (indexed)
  pickupReferenceId?: string // Aggregator pickup ID (from provider response)
  pickupStatus: 'SCHEDULED' | 'RESCHEDULED' | 'PICKED_UP' | 'FAILED' // Pickup status
  pickupDate: Date // Scheduled pickup date
  pickupTimeSlot?: string // Pickup time slot (optional, e.g., "10:00-13:00")
  warehouseId: string // Warehouse Ref ID (references VendorWarehouse.warehouseRefId)
  contactName: string // Contact person name
  contactPhone: string // Contact phone (normalized 10 digits)
  rawProviderResponse?: any // Raw JSON response from provider API
  createdAt?: Date
  updatedAt?: Date
}

const ShipmentPickupSchema = new Schema<IShipmentPickup>(
  {
    shipmentPickupId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Z0-9_]{1,15}$/.test(v)
        },
        message: 'Shipment Pickup ID must be alphanumeric (uppercase) with underscores, max 15 characters'
      }
    },
    shipmentId: {
      type: String,
      required: true,
      index: true,
      trim: true,
      maxlength: 15,
    },
    providerCode: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      index: true,
    },
    awbNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      index: true,
    },
    pickupReferenceId: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
      index: true,
    },
    pickupStatus: {
      type: String,
      enum: ['SCHEDULED', 'RESCHEDULED', 'PICKED_UP', 'FAILED'],
      required: true,
      default: 'SCHEDULED',
      index: true,
    },
    pickupDate: {
      type: Date,
      required: true,
      index: true,
    },
    pickupTimeSlot: {
      type: String,
      required: false,
      trim: true,
      maxlength: 50,
    },
    warehouseId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      index: true,
    },
    contactName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    contactPhone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
      validate: {
        validator: function(v: string) {
          return /^\d{10}$/.test(v)
        },
        message: 'Contact phone must be exactly 10 digits'
      }
    },
    rawProviderResponse: {
      type: Schema.Types.Mixed,
      required: false,
    },
  },
  { timestamps: true }
)

// Indexes for efficient queries
ShipmentPickupSchema.index({ shipmentId: 1, createdAt: -1 }) // Get latest pickup for shipment
ShipmentPickupSchema.index({ awbNumber: 1, pickupStatus: 1 })
ShipmentPickupSchema.index({ pickupStatus: 1, pickupDate: 1 })

// Prevent model re-compilation
if (mongoose.models.ShipmentPickup) {
  delete mongoose.models.ShipmentPickup
}

const ShipmentPickup = mongoose.model<IShipmentPickup>('ShipmentPickup', ShipmentPickupSchema)

export default ShipmentPickup

