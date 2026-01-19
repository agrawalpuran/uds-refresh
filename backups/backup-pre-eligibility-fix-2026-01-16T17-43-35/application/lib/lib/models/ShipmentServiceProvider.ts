import mongoose, { Schema, Document } from 'mongoose'

/**
 * ShipmentServiceProvider Model
 * 
 * Master data for logistics/shipment service providers (Super Admin managed)
 * Defines provider metadata, capabilities, and API configuration.
 * 
 * Rules:
 * - Managed by Super Admin only
 * - Defines PROVIDER METADATA ONLY (no credentials)
 * - Credentials are stored in CompanyShippingProvider
 * - Providers can be activated/deactivated
 */
export interface IShipmentServiceProvider extends Document {
  providerId: string // System-generated alphanumeric ID (≤15 chars, legacy - kept for backward compatibility)
  providerRefId?: number // PRIMARY BUSINESS IDENTIFIER: Numeric reference ID (6-10 digits, UNIQUE, indexed)
  providerCode: string // Unique provider code (e.g., "SHIPWAY", "DELHIVERY")
  providerName: string // Display name (e.g., "Shipway Logistics")
  providerType: 'API_AGGREGATOR' | 'DIRECT_COURIER' | 'FREIGHT' // Provider type
  isActive: boolean // Whether provider is active and available for use
  
  // Capabilities
  supportsShipmentCreate: boolean // Can create shipments via API
  supportsTracking: boolean // Supports shipment tracking
  supportsServiceabilityCheck: boolean // Can check serviceability (pincode/area)
  supportsCancellation: boolean // Supports shipment cancellation
  supportsWebhooks: boolean // Supports webhook notifications
  
  // API Metadata
  apiBaseUrl?: string // Base URL for provider API
  apiVersion?: string // API version (e.g., "v1", "v2")
  authType?: 'API_KEY' | 'TOKEN' | 'OAUTH' // Authentication type (legacy - use authConfig.authType)
  documentationUrl?: string // Link to provider documentation
  
  // Authentication Configuration (OPTIONAL - for secure credential storage)
  authConfig?: {
    authType: 'API_KEY' | 'TOKEN' | 'BASIC' | 'OAUTH2'
    credentials: {
      apiKey?: string // ENCRYPTED
      token?: string // ENCRYPTED
      username?: string // ENCRYPTED
      password?: string // ENCRYPTED
      oauth?: {
        clientId?: string // ENCRYPTED
        clientSecret?: string // ENCRYPTED
        tokenUrl?: string // Not encrypted (public URL)
        scope?: string // Not encrypted
      }
    }
    headersTemplate?: Record<string, string> // Template for request headers
    tokenExpirySeconds?: number // Token expiry in seconds
    autoRefreshToken?: boolean // Whether to auto-refresh OAuth tokens
  }
  
  // Health Check Status (updated by health check service)
  lastHealthCheckAt?: Date
  lastHealthStatus?: 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN'
  lastHealthMessage?: string
  
  // Supported Couriers (CACHE / METADATA ONLY)
  // Source of truth remains the Aggregator API
  supportedCouriers?: Array<{
    courierCode: string // e.g., "DTDC"
    courierName: string // e.g., "DTDC Express"
    serviceTypes?: string[] // e.g., ["SURFACE", "AIR"]
    isActive: boolean // Controlled via UI - whether courier is enabled
    source: 'API_SYNC' | 'MANUAL' // How this courier was added
    lastSyncedAt?: Date // When this courier was last synced from API
  }>
  
  // Audit
  createdAt?: Date
  createdBy?: string // Super Admin identifier who created
  updatedAt?: Date
  updatedBy?: string // Super Admin identifier who last updated
}

const ShipmentServiceProviderSchema = new Schema<IShipmentServiceProvider>(
  {
    providerId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Z0-9_]{1,15}$/.test(v)
        },
        message: 'Provider ID must be alphanumeric (uppercase) with underscores, max 15 characters'
      }
    },
    providerRefId: {
      type: Number,
      required: false, // Optional for backward compatibility
      unique: true,
      sparse: true, // Allow null/undefined values
      index: true,
      validate: {
        validator: function(v: number) {
          if (v === null || v === undefined) return true // Optional
          return v >= 100000 && v <= 9999999999 // 6-10 digits
        },
        message: 'Provider Ref ID must be a number between 100000 and 9999999999 (6-10 digits)'
      }
    },
    providerCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 50,
      index: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Z0-9_]+$/.test(v)
        },
        message: 'Provider code must be alphanumeric (uppercase) with underscores'
      }
    },
    providerName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    providerType: {
      type: String,
      enum: ['API_AGGREGATOR', 'DIRECT_COURIER', 'FREIGHT'],
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    // Capabilities
    supportsShipmentCreate: {
      type: Boolean,
      required: true,
      default: false,
    },
    supportsTracking: {
      type: Boolean,
      required: true,
      default: false,
    },
    supportsServiceabilityCheck: {
      type: Boolean,
      required: true,
      default: false,
    },
    supportsCancellation: {
      type: Boolean,
      required: true,
      default: false,
    },
    supportsWebhooks: {
      type: Boolean,
      required: true,
      default: false,
    },
    // API Metadata
    apiBaseUrl: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
      validate: {
        validator: function(v: string) {
          if (!v) return true // Optional
          try {
            new URL(v)
            return true
          } catch {
            return false
          }
        },
        message: 'API Base URL must be a valid URL'
      }
    },
    apiVersion: {
      type: String,
      required: false,
      trim: true,
      maxlength: 20,
    },
    authType: {
      type: String,
      enum: ['API_KEY', 'TOKEN', 'OAUTH'],
      required: false,
    },
    documentationUrl: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
      validate: {
        validator: function(v: string) {
          if (!v) return true // Optional
          try {
            new URL(v)
            return true
          } catch {
            return false
          }
        },
        message: 'Documentation URL must be a valid URL'
      }
    },
    // Authentication Configuration (OPTIONAL)
    authConfig: {
      type: {
        authType: {
          type: String,
          enum: ['API_KEY', 'TOKEN', 'BASIC', 'OAUTH2'],
          required: false,
        },
        credentials: {
          type: {
            apiKey: String, // Will be encrypted before storage
            token: String, // Will be encrypted before storage
            username: String, // Will be encrypted before storage
            password: String, // Will be encrypted before storage
            oauth: {
              type: {
                clientId: String, // Will be encrypted before storage
                clientSecret: String, // Will be encrypted before storage
                tokenUrl: String, // Not encrypted (public URL)
                scope: String, // Not encrypted
              },
              required: false,
            },
          },
          required: false,
        },
        headersTemplate: {
          type: Schema.Types.Mixed, // JSON object
          required: false,
        },
        tokenExpirySeconds: {
          type: Number,
          required: false,
        },
        autoRefreshToken: {
          type: Boolean,
          required: false,
          default: false,
        },
      },
      required: false,
    },
    // Health Check Status
    lastHealthCheckAt: {
      type: Date,
      required: false,
    },
    lastHealthStatus: {
      type: String,
      enum: ['HEALTHY', 'UNHEALTHY', 'UNKNOWN'],
      required: false,
    },
    lastHealthMessage: {
      type: String,
      required: false,
      maxlength: 500,
    },
    // Supported Couriers (CACHE / METADATA ONLY)
    supportedCouriers: {
      type: [{
        courierCode: {
          type: String,
          required: true,
          trim: true,
          uppercase: true,
        },
        courierName: {
          type: String,
          required: true,
          trim: true,
        },
        serviceTypes: {
          type: [String],
          required: false,
          default: [],
        },
        isActive: {
          type: Boolean,
          required: true,
          default: true,
        },
        source: {
          type: String,
          enum: ['API_SYNC', 'MANUAL'],
          required: true,
          default: 'API_SYNC',
        },
        lastSyncedAt: {
          type: Date,
          required: false,
        },
      }],
      required: false,
      default: [],
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
ShipmentServiceProviderSchema.index({ providerCode: 1 }, { unique: true })
ShipmentServiceProviderSchema.index({ providerRefId: 1 }, { unique: true, sparse: true })
ShipmentServiceProviderSchema.index({ isActive: 1, providerType: 1 })
ShipmentServiceProviderSchema.index({ providerType: 1 })

const ShipmentServiceProvider = mongoose.models.ShipmentServiceProvider || mongoose.model<IShipmentServiceProvider>('ShipmentServiceProvider', ShipmentServiceProviderSchema)

export default ShipmentServiceProvider

