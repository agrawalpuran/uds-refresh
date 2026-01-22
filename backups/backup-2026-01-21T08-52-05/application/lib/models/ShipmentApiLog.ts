import mongoose, { Schema, Document } from 'mongoose'

/**
 * ShipmentApiLog Model
 * 
 * Audit trail for all API calls to logistics providers.
 * Used for debugging, support, and compliance.
 */
export interface IShipmentApiLog extends Document {
  logId: string // System-generated alphanumeric ID (≤15 chars, primary key)
  shipmentId?: string // Shipment ID (references Shipment.shipmentId)
  providerId: string // Provider ID (references ShipmentServiceProvider.providerId)
  operationType: 'CREATE' | 'TRACK' | 'SERVICEABILITY' | 'CANCEL' | 'HEALTH_CHECK' // Operation type
  requestPayload?: any // Request payload (JSON)
  responsePayload?: any // Response payload (JSON)
  httpStatus?: number // HTTP status code
  errorDetails?: string // Error message/details
  success: boolean // Whether operation succeeded
  timestamp: Date // Operation timestamp
}

const ShipmentApiLogSchema = new Schema<IShipmentApiLog>(
  {
    logId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Z0-9_]{1,15}$/.test(v)
        },
        message: 'Log ID must be alphanumeric (uppercase) with underscores, max 15 characters'
      }
    },
    shipmentId: {
      type: String,
      required: false,
      index: true,
    },
    providerId: {
      type: String,
      required: true,
      index: true,
    },
    operationType: {
      type: String,
      enum: ['CREATE', 'TRACK', 'SERVICEABILITY', 'CANCEL', 'HEALTH_CHECK'],
      required: true,
      index: true,
    },
    requestPayload: {
      type: Schema.Types.Mixed,
      required: false,
    },
    responsePayload: {
      type: Schema.Types.Mixed,
      required: false,
    },
    httpStatus: {
      type: Number,
      required: false,
      index: true,
    },
    errorDetails: {
      type: String,
      required: false,
      maxlength: 2000,
    },
    success: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false, // We use custom timestamp field
  }
)

// Indexes for efficient queries
ShipmentApiLogSchema.index({ shipmentId: 1, timestamp: -1 })
ShipmentApiLogSchema.index({ providerId: 1, operationType: 1, timestamp: -1 })
ShipmentApiLogSchema.index({ success: 1, timestamp: -1 })
ShipmentApiLogSchema.index({ timestamp: -1 }) // For time-based queries

const ShipmentApiLog = mongoose.models.ShipmentApiLog || mongoose.model<IShipmentApiLog>('ShipmentApiLog', ShipmentApiLogSchema)

export default ShipmentApiLog

