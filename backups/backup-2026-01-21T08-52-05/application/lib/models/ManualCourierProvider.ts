import mongoose, { Schema, Document } from 'mongoose'
import { generateShippingId } from '../db/shipping-config-access'

export interface IManualCourierProvider extends Document {
  courierRefId: string // System-generated alphanumeric ID (≤15 chars, primary key)
  courierCode: string // Unique courier code (e.g., "DTDC", "UPS")
  courierName: string // Display name (e.g., "DTDC Express")
  isActive: boolean // Active status
  contactWebsite?: string // Optional website
  supportPhone?: string // Optional support phone
  remarks?: string // Optional remarks
  createdAt?: Date
  updatedAt?: Date
}

const ManualCourierProviderSchema = new Schema<IManualCourierProvider>(
  {
    courierRefId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Z0-9_]{1,15}$/.test(v)
        },
        message: 'Courier Ref ID must be alphanumeric (uppercase) with underscores, max 15 characters'
      }
    },
    courierCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      uppercase: true,
      maxlength: 50,
      validate: {
        validator: function(v: string) {
          return v.length > 0 && /^[A-Z0-9_-]+$/.test(v)
        },
        message: 'Courier code must be alphanumeric with hyphens/underscores'
      }
    },
    courierName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    contactWebsite: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
    },
    supportPhone: {
      type: String,
      required: false,
      trim: true,
      maxlength: 20,
    },
    remarks: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
)

// Pre-save hook to generate courierRefId if not provided
ManualCourierProviderSchema.pre('save', async function(next) {
  if (!this.courierRefId) {
    this.courierRefId = generateShippingId('MCP')
  }
  next()
})

// Delete existing model if it exists to force recompilation with new schema
if (mongoose.models.ManualCourierProvider) {
  delete mongoose.models.ManualCourierProvider
}

const ManualCourierProvider = mongoose.model<IManualCourierProvider>('ManualCourierProvider', ManualCourierProviderSchema)

export default ManualCourierProvider

