/**
 * Shipping Configuration Data Access Layer
 * Functions for managing shipping/logistics provider configuration
 */

import connectDB from './mongodb'
import mongoose from 'mongoose'
import SystemShippingConfig from '../models/SystemShippingConfig'
import ShipmentServiceProvider from '../models/ShipmentServiceProvider'
import CompanyShippingProvider from '../models/CompanyShippingProvider'
import { encrypt, decrypt } from '../utils/encryption'
// Helper function to convert Mongoose document to plain object
function toPlainObject(doc: any): any {
  if (!doc) return doc
  if (typeof doc.toObject === 'function') {
    return doc.toObject()
  }
  if (doc._id) {
    const obj = { ...doc }
    delete obj._id
    delete obj.__v
    return obj
  }
  return doc
}

/**
 * Encrypt credentials in authConfig
 * SECURITY: All credential fields must be encrypted before storage
 */
function encryptAuthConfig(authConfig: any): any {
  if (!authConfig || !authConfig.credentials) {
    return authConfig
  }

  const encrypted = { ...authConfig }
  const creds = { ...authConfig.credentials }

  // Encrypt credential fields
  if (creds.apiKey) {
    creds.apiKey = encrypt(creds.apiKey)
  }
  if (creds.token) {
    creds.token = encrypt(creds.token)
  }
  if (creds.username) {
    creds.username = encrypt(creds.username)
  }
  if (creds.password) {
    creds.password = encrypt(creds.password)
  }
  if (creds.oauth) {
    const oauth = { ...creds.oauth }
    if (oauth.clientId) {
      oauth.clientId = encrypt(oauth.clientId)
    }
    if (oauth.clientSecret) {
      oauth.clientSecret = encrypt(oauth.clientSecret)
    }
    // tokenUrl and scope are not encrypted (public values)
    creds.oauth = oauth
  }

  encrypted.credentials = creds
  return encrypted
}

/**
 * Check if a string still looks like encrypted format (iv:data) after decrypt attempt.
 * Used to avoid passing invalid credentials to providers when decryption fails.
 */
function looksEncrypted(value: string): boolean {
  if (!value || typeof value !== 'string') return false
  const parts = value.split(':')
  if (parts.length !== 2) return false
  // Base64 IV is typically 24 chars; encrypted payload is longer
  return parts[0].length >= 16 && parts[1].length >= 16
}

/**
 * Safely decrypt a single credential field; on failure return undefined so caller can detect missing creds.
 */
function safeDecryptCredential(encrypted: string): string | undefined {
  if (!encrypted || typeof encrypted !== 'string') return undefined
  try {
    const result = decrypt(encrypted)
    if (!result) return undefined
    // If decryption failed, decrypt() returns original; avoid passing encrypted value as credential
    if (looksEncrypted(result)) {
      console.warn('[decryptAuthConfig] Credential still looks encrypted after decrypt - possible wrong key or format')
      return undefined
    }
    return result
  } catch (e) {
    console.warn('[decryptAuthConfig] Decryption error for credential field:', e instanceof Error ? e.message : e)
    return undefined
  }
}

/**
 * Decrypt credentials in authConfig
 * SECURITY: Only for internal use - never expose in APIs or UI
 * Uses per-field safe decryption so one bad/mis-encrypted field does not break the whole config.
 */
export function decryptAuthConfig(authConfig: any): any {
  if (!authConfig || !authConfig.credentials) {
    return authConfig
  }

  const decrypted = { ...authConfig }
  const creds = { ...authConfig.credentials }

  // Decrypt credential fields (per-field safe so one failure doesn't break others).
  // When decryption fails, clear the field so providers get missing creds and throw a clear error.
  if (creds.apiKey) {
    const v = safeDecryptCredential(creds.apiKey)
    creds.apiKey = v !== undefined ? v : undefined
  }
  if (creds.token) {
    const v = safeDecryptCredential(creds.token)
    creds.token = v !== undefined ? v : undefined
  }
  if (creds.username) {
    const v = safeDecryptCredential(creds.username)
    creds.username = v !== undefined ? v : undefined
  }
  if (creds.password) {
    const v = safeDecryptCredential(creds.password)
    creds.password = v !== undefined ? v : undefined
  }
  if (creds.oauth) {
    const oauth = { ...creds.oauth }
    if (oauth.clientId) {
      const v = safeDecryptCredential(oauth.clientId)
      oauth.clientId = v !== undefined ? v : undefined
    }
    if (oauth.clientSecret) {
      const v = safeDecryptCredential(oauth.clientSecret)
      oauth.clientSecret = v !== undefined ? v : undefined
    }
    creds.oauth = oauth
  }

  decrypted.credentials = creds
  return decrypted
}

/**
 * Remove authConfig from provider object (for API responses)
 * SECURITY: Never return credentials in API responses
 */
function sanitizeProviderForAPI(provider: any): any {
  if (!provider) return provider
  const sanitized = { ...provider }
  // Add flag to indicate authConfig exists (without exposing credentials)
  sanitized.hasAuthConfig = !!provider.authConfig
  delete sanitized.authConfig
  return sanitized
}

/**
 * Generate alphanumeric ID for shipping entities (≤15 chars)
 */
export function generateShippingId(prefix: string): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  const id = `${prefix}_${timestamp}${random}`.substring(0, 15)
  return id
}

/**
 * Generate numeric provider reference ID (6-10 digits)
 * Starts from 100000 and increments
 */
export async function generateProviderRefId(): Promise<number> {
  await connectDB()
  
  // Find the highest existing providerRefId
  const maxProvider = await ShipmentServiceProvider.findOne({ providerRefId: { $exists: true } })
    .sort({ providerRefId: -1 })
    .select('providerRefId')
    .lean()
  
  if (maxProvider && maxProvider.providerRefId) {
    // Increment from highest
    return maxProvider.providerRefId + 1
  }
  
  // Start from 100000 if no existing providers
  return 100000
}

/**
 * Get or create System Shipping Configuration (singleton)
 * @returns SystemShippingConfig
 */
export async function getSystemShippingConfig(): Promise<any> {
  await connectDB()
  
  let config = await SystemShippingConfig.findOne({ id: 'SYS_SHIP_CFG' }).lean()
  
  if (!config) {
    // Create default configuration
    const newConfig = await SystemShippingConfig.create({
      id: 'SYS_SHIP_CFG',
      shippingIntegrationEnabled: false,
      allowMultipleProvidersPerCompany: true,
    })
    config = newConfig.toObject()
  }
  
  return toPlainObject(config)
}

/**
 * Update System Shipping Configuration
 * @param updates Configuration updates
 * @param updatedBy Super Admin identifier
 * @returns Updated configuration
 */
export async function updateSystemShippingConfig(
  updates: {
    shippingIntegrationEnabled?: boolean
    allowMultipleProvidersPerCompany?: boolean
  },
  updatedBy?: string
): Promise<any> {
  await connectDB()
  
  const config = await SystemShippingConfig.findOne({ id: 'SYS_SHIP_CFG' })
  
  if (!config) {
    // Create if doesn't exist
    const newConfig = await SystemShippingConfig.create({
      id: 'SYS_SHIP_CFG',
      shippingIntegrationEnabled: updates.shippingIntegrationEnabled ?? false,
      allowMultipleProvidersPerCompany: updates.allowMultipleProvidersPerCompany ?? true,
    })
    return toPlainObject(newConfig.toObject())
  }
  
  if (updates.shippingIntegrationEnabled !== undefined) {
    config.shippingIntegrationEnabled = updates.shippingIntegrationEnabled
  }
  if (updates.allowMultipleProvidersPerCompany !== undefined) {
    config.allowMultipleProvidersPerCompany = updates.allowMultipleProvidersPerCompany
  }
  
  await config.save()
  
  console.log(`[updateSystemShippingConfig] ✅ Updated shipping configuration`)
  
  return toPlainObject(config.toObject())
}

/**
 * Get all Shipment Service Providers
 * @param includeInactive Whether to include inactive providers
 * @returns Array of providers
 */
export async function getAllShipmentServiceProviders(includeInactive: boolean = false): Promise<any[]> {
  await connectDB()
  
  const query: any = {}
  if (!includeInactive) {
    query.isActive = true
  }
  
  const providers = await ShipmentServiceProvider.find(query)
    .sort({ providerName: 1, createdAt: -1 })
    .lean()
  
  // SECURITY: Never return authConfig in list responses
  return providers.map((p: any) => sanitizeProviderForAPI(toPlainObject(p)))
}

/**
 * Get Shipment Service Provider by ID
 * @param providerId Provider ID
 * @returns Provider or null
 */
export async function getShipmentServiceProviderById(providerId: string, includeAuth: boolean = false): Promise<any | null> {
  await connectDB()
  
  const provider = await ShipmentServiceProvider.findOne({ providerId }).lean()
  
  if (!provider) {
    return null
  }
  
  const plain = toPlainObject(provider)
  // SECURITY: Never return authConfig in API responses unless explicitly requested for internal use
  return includeAuth ? plain : sanitizeProviderForAPI(plain)
}

/**
 * Get Shipment Service Provider by Ref ID
 * @param providerRefId Provider Ref ID (numeric)
 * @returns Provider or null
 */
export async function getShipmentServiceProviderByRefId(providerRefId: number, includeAuth: boolean = false): Promise<any | null> {
  await connectDB()
  
  const provider = await ShipmentServiceProvider.findOne({ providerRefId }).lean()
  
  if (!provider) {
    return null
  }
  
  const plain = toPlainObject(provider)
  // SECURITY: Never return authConfig in API responses unless explicitly requested for internal use
  return includeAuth ? plain : sanitizeProviderForAPI(plain)
}

/**
 * Get provider with decrypted authConfig (INTERNAL USE ONLY)
 * SECURITY: This function should only be used internally by adapters, never exposed via API
 */
export async function getProviderWithAuth(providerRefId: number): Promise<any | null> {
  await connectDB()
  
  const provider = await ShipmentServiceProvider.findOne({ providerRefId }).lean()
  
  if (!provider) {
    return null
  }
  
  const plain = toPlainObject(provider)
  if (plain.authConfig) {
    plain.authConfig = decryptAuthConfig(plain.authConfig)
  }
  return plain
}

/**
 * Create Shipment Service Provider
 * @param providerData Provider data
 * @param createdBy Super Admin identifier
 * @returns Created provider
 */
export async function createShipmentServiceProvider(
  providerData: {
    providerCode: string
    providerName: string
    providerType: 'API_AGGREGATOR' | 'DIRECT_COURIER' | 'FREIGHT'
    isActive?: boolean
    supportsShipmentCreate?: boolean
    supportsTracking?: boolean
    supportsServiceabilityCheck?: boolean
    supportsCancellation?: boolean
    supportsWebhooks?: boolean
    apiBaseUrl?: string
    apiVersion?: string
    authType?: 'API_KEY' | 'TOKEN' | 'OAUTH'
    documentationUrl?: string
    authConfig?: any // Optional authentication configuration
  },
  createdBy?: string
): Promise<any> {
  await connectDB()
  
  // Check if provider code already exists
  const existing = await ShipmentServiceProvider.findOne({ providerCode: providerData.providerCode.toUpperCase() })
  if (existing) {
    throw new Error(`Provider with code "${providerData.providerCode}" already exists`)
  }
  
  // Generate provider ID and providerRefId
  const providerId = generateShippingId('PROV')
  const providerRefId = await generateProviderRefId()
  
  // Encrypt authConfig credentials if provided
  let encryptedAuthConfig = undefined
  if (providerData.authConfig) {
    encryptedAuthConfig = encryptAuthConfig(providerData.authConfig)
  }
  
  const provider = await ShipmentServiceProvider.create({
    providerId,
    providerRefId,
    providerCode: providerData.providerCode.toUpperCase().trim(),
    providerName: providerData.providerName.trim(),
    providerType: providerData.providerType,
    isActive: providerData.isActive ?? true,
    supportsShipmentCreate: providerData.supportsShipmentCreate ?? false,
    supportsTracking: providerData.supportsTracking ?? false,
    supportsServiceabilityCheck: providerData.supportsServiceabilityCheck ?? false,
    supportsCancellation: providerData.supportsCancellation ?? false,
    supportsWebhooks: providerData.supportsWebhooks ?? false,
    apiBaseUrl: providerData.apiBaseUrl?.trim(),
    apiVersion: providerData.apiVersion?.trim(),
    authType: providerData.authType,
    documentationUrl: providerData.documentationUrl?.trim(),
    authConfig: encryptedAuthConfig,
    createdBy: createdBy?.trim(),
  })
  
  console.log(`[createShipmentServiceProvider] ✅ Created provider: ${providerId} (${provider.providerCode})`)
  
  // SECURITY: Never return authConfig in response
  return sanitizeProviderForAPI(toPlainObject(provider.toObject()))
}

/**
 * Update Shipment Service Provider
 * @param providerId Provider ID
 * @param updates Provider updates
 * @param updatedBy Super Admin identifier
 * @returns Updated provider
 */
export async function updateShipmentServiceProvider(
  providerId: string,
  updates: {
    providerName?: string
    providerType?: 'API_AGGREGATOR' | 'DIRECT_COURIER' | 'FREIGHT'
    isActive?: boolean
    supportsShipmentCreate?: boolean
    supportsTracking?: boolean
    supportsServiceabilityCheck?: boolean
    supportsCancellation?: boolean
    supportsWebhooks?: boolean
    apiBaseUrl?: string
    apiVersion?: string
    authType?: 'API_KEY' | 'TOKEN' | 'OAUTH'
    documentationUrl?: string
    authConfig?: any // Optional authentication configuration
    supportedCouriers?: Array<{
      courierCode: string
      courierName: string
      serviceTypes?: string[]
      isActive: boolean
      source: 'API_SYNC' | 'MANUAL'
      lastSyncedAt?: Date
    }>
    lastHealthCheckAt?: Date
    lastHealthStatus?: 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN'
    lastHealthMessage?: string
  },
  updatedBy?: string
): Promise<any> {
  await connectDB()
  
  const provider = await ShipmentServiceProvider.findOne({ providerId })
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`)
  }
  
  // Update fields
  if (updates.providerName !== undefined) {
    provider.providerName = updates.providerName.trim()
  }
  if (updates.providerType !== undefined) {
    provider.providerType = updates.providerType
  }
  if (updates.isActive !== undefined) {
    provider.isActive = updates.isActive
  }
  if (updates.supportsShipmentCreate !== undefined) {
    provider.supportsShipmentCreate = updates.supportsShipmentCreate
  }
  if (updates.supportsTracking !== undefined) {
    provider.supportsTracking = updates.supportsTracking
  }
  if (updates.supportsServiceabilityCheck !== undefined) {
    provider.supportsServiceabilityCheck = updates.supportsServiceabilityCheck
  }
  if (updates.supportsCancellation !== undefined) {
    provider.supportsCancellation = updates.supportsCancellation
  }
  if (updates.supportsWebhooks !== undefined) {
    provider.supportsWebhooks = updates.supportsWebhooks
  }
  if (updates.apiBaseUrl !== undefined) {
    provider.apiBaseUrl = updates.apiBaseUrl?.trim()
  }
  if (updates.apiVersion !== undefined) {
    provider.apiVersion = updates.apiVersion?.trim()
  }
  if (updates.authType !== undefined) {
    provider.authType = updates.authType
  }
  if (updates.documentationUrl !== undefined) {
    provider.documentationUrl = updates.documentationUrl?.trim()
  }
  // Handle authConfig - encrypt credentials before storage
  if (updates.authConfig !== undefined) {
    if (updates.authConfig === null) {
      // Allow clearing authConfig
      provider.authConfig = undefined
    } else {
      // Encrypt credentials before storing
      provider.authConfig = encryptAuthConfig(updates.authConfig)
    }
  }
  // Handle supportedCouriers update
  if (updates.supportedCouriers !== undefined) {
    provider.supportedCouriers = updates.supportedCouriers
  }
  // Handle health check status updates
  if (updates.lastHealthCheckAt !== undefined) {
    provider.lastHealthCheckAt = updates.lastHealthCheckAt
  }
  if (updates.lastHealthStatus !== undefined) {
    provider.lastHealthStatus = updates.lastHealthStatus
  }
  if (updates.lastHealthMessage !== undefined) {
    provider.lastHealthMessage = updates.lastHealthMessage.trim()
  }
  if (updatedBy) {
    provider.updatedBy = updatedBy.trim()
  }
  
  await provider.save()
  
  console.log(`[updateShipmentServiceProvider] ✅ Updated provider: ${providerId}`)
  
  // SECURITY: Never return authConfig in response
  return sanitizeProviderForAPI(toPlainObject(provider.toObject()))
}

/**
 * Delete Shipment Service Provider
 * @param providerId Provider ID
 */
export async function deleteShipmentServiceProvider(providerId: string): Promise<void> {
  await connectDB()
  
  // Check if provider is used by any company
  const companyUsage = await CompanyShippingProvider.countDocuments({ providerId })
  if (companyUsage > 0) {
    throw new Error(`Cannot delete provider: ${companyUsage} company(ies) are using this provider. Please disable it instead.`)
  }
  
  const result = await ShipmentServiceProvider.deleteOne({ providerId })
  if (result.deletedCount === 0) {
    throw new Error(`Provider not found: ${providerId}`)
  }
  
  console.log(`[deleteShipmentServiceProvider] ✅ Deleted provider: ${providerId}`)
}

/**
 * Get Company Shipping Providers
 * @param companyId Company ID (optional filter)
 * @returns Array of company-provider mappings
 */
export async function getCompanyShippingProviders(companyId?: string): Promise<any[]> {
  await connectDB()
  
  const query: any = {}
  if (companyId) {
    query.companyId = companyId
  }
  
  const mappings = await CompanyShippingProvider.find(query)
    .sort({ companyId: 1, isDefault: -1, createdAt: -1 })
    .lean()
  
  // Enrich with provider details
  const providerIds = [...new Set(mappings.map((m: any) => m.providerId).filter(Boolean))]
  const providers = await ShipmentServiceProvider.find({ providerId: { $in: providerIds } })
    .select('providerId providerCode providerName providerType isActive')
    .lean()
  
  const providerMap = new Map(providers.map((p: any) => [p.providerId, p]))
  
  return mappings.map((m: any) => {
    const plain = toPlainObject(m)
    const provider = providerMap.get(m.providerId)
    if (provider) {
      (plain as any).provider = {
        providerId: provider.providerId,
        providerCode: provider.providerCode,
        providerName: provider.providerName,
        providerType: provider.providerType,
        isActive: provider.isActive,
      }
    }
    return plain
  })
}

