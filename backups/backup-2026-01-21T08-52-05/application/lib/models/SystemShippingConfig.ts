import mongoose, { Schema, Document } from 'mongoose'

/**
 * SystemShippingConfig Model
 * 
 * Global configuration for shipping/logistics integration (Super Admin controlled)
 * Acts as the MASTER SWITCH for logistics integrations across the entire system.
 * 
 * Rules:
 * - Only ONE configuration record exists (singleton pattern)
 * - When shippingIntegrationEnabled = false, all companies use MANUAL shipment only
 * - When shippingIntegrationEnabled = true, logistics providers become available
 */
export interface ISystemShippingConfig extends Document {
  id: string // System-generated alphanumeric ID (≤15 chars)
  shippingIntegrationEnabled: boolean // Master switch: enable/disable shipping integration globally
  allowMultipleProvidersPerCompany: boolean // Allow companies to use multiple logistics providers
  createdAt?: Date
  updatedAt?: Date
}

const SystemShippingConfigSchema = new Schema<ISystemShippingConfig>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      default: 'SYS_SHIP_CFG', // Singleton: always use same ID
      validate: {
        validator: function(v: string) {
          return /^[A-Z0-9_]{1,15}$/.test(v)
        },
        message: 'ID must be alphanumeric (uppercase) with underscores, max 15 characters'
      }
    },
    shippingIntegrationEnabled: {
      type: Boolean,
      required: true,
      default: false, // Default: manual shipment only
      index: true,
    },
    allowMultipleProvidersPerCompany: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    timestamps: true,
  }
)

// Ensure only one configuration exists (singleton)
SystemShippingConfigSchema.index({ id: 1 }, { unique: true })

// Pre-save hook to ensure singleton
SystemShippingConfigSchema.pre('save', async function(next) {
  // If this is a new document and another config exists, prevent creation
  if (this.isNew) {
    const existing = await mongoose.models.SystemShippingConfig?.findOne({ id: 'SYS_SHIP_CFG' })
    if (existing && existing._id.toString() !== this._id.toString()) {
      return next(new Error('SystemShippingConfig already exists. Only one configuration is allowed.'))
    }
  }
  next()
})

const SystemShippingConfig = mongoose.models.SystemShippingConfig || mongoose.model<ISystemShippingConfig>('SystemShippingConfig', SystemShippingConfigSchema)

export default SystemShippingConfig

