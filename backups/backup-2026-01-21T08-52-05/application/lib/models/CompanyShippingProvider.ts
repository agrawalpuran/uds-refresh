import mongoose, { Schema, Document } from 'mongoose'

/**
 * CompanyShippingProvider Model
 * 
 * Maps companies to logistics providers with credentials and configuration.
 * Managed by Super Admin (provider selection) + Company Admin (credentials).
 * 
 * Rules:
 * - One company can have multiple providers (if allowMultipleProvidersPerCompany = true)
 * - One company can have one default provider
 * - Credentials are encrypted
 * - Provider must be active in ShipmentServiceProvider
 */
export interface ICompanyShippingProvider extends Document {
  companyShippingProviderId: string // System-generated alphanumeric ID (≤15 chars, primary key)
  companyId: string // Company ID (6-digit numeric string)
  providerId: string // Provider ID (references ShipmentServiceProvider.providerId)
  isEnabled: boolean // Whether this provider is enabled for the company
  isDefault: boolean // Whether this is the default provider for the company
  
  // Credentials & Configuration (encrypted)
  apiKey?: string // Encrypted API key
  apiSecret?: string // Encrypted API secret
  accessToken?: string // Encrypted access token
  refreshToken?: string // Encrypted refresh token
  providerConfig?: string // Encrypted JSON configuration
  
  // Audit
  createdAt?: Date
  createdBy?: string // Admin identifier who created
  updatedAt?: Date
  updatedBy?: string // Admin identifier who last updated
}

const CompanyShippingProviderSchema = new Schema<ICompanyShippingProvider>(
  {
    companyShippingProviderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Z0-9_]{1,15}$/.test(v)
        },
        message: 'Company Shipping Provider ID must be alphanumeric (uppercase) with underscores, max 15 characters'
      }
    },
    companyId: {
      type: String,
      required: true,
      index: true,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric (1-50 characters)
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Company ID must be alphanumeric (1-50 characters)'
      }
    },
    providerId: {
      type: String,
      required: true,
      index: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Z0-9_]{1,15}$/.test(v)
        },
        message: 'Provider ID must be alphanumeric (uppercase) with underscores, max 15 characters'
      }
    },
    isEnabled: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    isDefault: {
      type: Boolean,
      required: true,
      default: false,
      index: true,
    },
    // Credentials & Configuration (encrypted)
    apiKey: {
      type: String,
      required: false,
      // Encrypted - no validation on encrypted format
    },
    apiSecret: {
      type: String,
      required: false,
      // Encrypted - no validation on encrypted format
    },
    accessToken: {
      type: String,
      required: false,
      // Encrypted - no validation on encrypted format
    },
    refreshToken: {
      type: String,
      required: false,
      // Encrypted - no validation on encrypted format
    },
    providerConfig: {
      type: String,
      required: false,
      // Encrypted JSON - no validation on encrypted format
    },
    // Audit
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
CompanyShippingProviderSchema.index({ companyId: 1, providerId: 1 }, { unique: true }) // One provider per company (unique)
CompanyShippingProviderSchema.index({ companyId: 1, isEnabled: 1 })
CompanyShippingProviderSchema.index({ companyId: 1, isDefault: 1 })
CompanyShippingProviderSchema.index({ providerId: 1, isEnabled: 1 })

// Compound index for finding default provider per company
CompanyShippingProviderSchema.index({ companyId: 1, isDefault: 1, isEnabled: 1 })

const CompanyShippingProvider = mongoose.models.CompanyShippingProvider || mongoose.model<ICompanyShippingProvider>('CompanyShippingProvider', CompanyShippingProviderSchema)

export default CompanyShippingProvider

