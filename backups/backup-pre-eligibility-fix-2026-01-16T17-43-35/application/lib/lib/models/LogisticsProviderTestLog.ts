import mongoose, { Schema, Document } from 'mongoose'

export interface ILogisticsProviderTestLog extends Document {
  id: string // Alphanumeric, system-generated, e.g., 'TEST_ABC_XYZ'
  testLogId?: string // Alias for id (auto-set by pre-save hook)
  providerId: string // Reference to ShipmentServiceProvider.id
  testType: 'SERVICEABILITY' | 'RATE' | 'TRACKING' | 'HEALTH' | 'COURIERS'
  requestPayload: string // Stringified JSON
  responsePayload?: string // Stringified JSON (nullable)
  success: boolean
  errorMessage?: string
  executedBy?: string // User ID or system identifier
  executedAt?: Date
  createdAt?: Date
}

const LogisticsProviderTestLogSchema = new Schema<ILogisticsProviderTestLog>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 15,
      validate: {
        validator: function(v: string) {
          return /^[A-Z0-9_]{1,15}$/.test(v)
        },
        message: 'Test Log ID must be alphanumeric (uppercase, numbers, underscore) and max 15 chars.'
      }
    },
    testLogId: {
      type: String,
      required: false, // Will be set by pre-save hook
    },
    providerId: {
      type: String,
      required: true,
      index: true,
      ref: 'ShipmentServiceProvider',
    },
    testType: {
      type: String,
      enum: ['SERVICEABILITY', 'RATE', 'TRACKING', 'HEALTH', 'COURIERS'],
      required: true,
      index: true,
    },
    requestPayload: {
      type: String, // Store as stringified JSON
      required: true,
    },
    responsePayload: {
      type: String, // Store as stringified JSON
      required: false,
    },
    success: {
      type: Boolean,
      required: true,
      index: true,
    },
    errorMessage: {
      type: String,
      required: false,
      trim: true,
      maxlength: 1000,
    },
    executedBy: {
      type: String,
      required: false,
      trim: true,
      maxlength: 50,
    },
    executedAt: {
      type: Date,
      required: false,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Only track createdAt
  }
)

// Compound index for quick lookup
LogisticsProviderTestLogSchema.index({ providerId: 1, testType: 1, executedAt: -1 })

// Pre-save hook to set testLogId = id
LogisticsProviderTestLogSchema.pre('save', function(next) {
  if (this.id) {
    this.testLogId = this.id
  }
  if (!this.executedAt) {
    this.executedAt = new Date()
  }
  next()
})

const LogisticsProviderTestLog =
  mongoose.models.LogisticsProviderTestLog ||
  mongoose.model<ILogisticsProviderTestLog>('LogisticsProviderTestLog', LogisticsProviderTestLogSchema)

export default LogisticsProviderTestLog

