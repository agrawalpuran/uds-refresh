import mongoose, { Schema, Document } from 'mongoose'

/**
 * SystemFeatureConfig Model
 * 
 * Global configuration for feature flags (Super Admin controlled)
 * Acts as the MASTER SWITCH for optional features across the entire system.
 * 
 * Rules:
 * - Only ONE configuration record exists (singleton pattern)
 * - Feature flags default to false (safe by default)
 * - Turning off a feature flag does NOT affect existing data
 */
export interface ISystemFeatureConfig extends Document {
  id: string // System-generated alphanumeric ID (≤15 chars)
  testOrdersEnabled: boolean // Master switch: enable/disable Test Order feature
  createdAt?: Date
  updatedAt?: Date
}

const SystemFeatureConfigSchema = new Schema<ISystemFeatureConfig>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      default: 'SYS_FEATURE_CFG', // Singleton: always use same ID
      validate: {
        validator: function(v: string) {
          return /^[A-Z0-9_]{1,15}$/.test(v)
        },
        message: 'ID must be alphanumeric (uppercase) with underscores, max 15 characters'
      }
    },
    testOrdersEnabled: {
      type: Boolean,
      required: true,
      default: true, // Default: enabled
      index: true,
    },
  },
  {
    timestamps: true,
  }
)

// Ensure only one configuration exists (singleton)
SystemFeatureConfigSchema.index({ id: 1 }, { unique: true })

// Pre-save hook to ensure singleton
SystemFeatureConfigSchema.pre('save', async function(next) {
  // If this is a new document and another config exists, prevent creation
  if (this.isNew) {
    const existing = await mongoose.models.SystemFeatureConfig?.findOne({ id: 'SYS_FEATURE_CFG' })
    if (existing && existing._id.toString() !== this._id.toString()) {
      return next(new Error('SystemFeatureConfig already exists. Only one configuration is allowed.'))
    }
  }
  next()
})

const SystemFeatureConfig = mongoose.models.SystemFeatureConfig || mongoose.model<ISystemFeatureConfig>('SystemFeatureConfig', SystemFeatureConfigSchema)

export default SystemFeatureConfig

