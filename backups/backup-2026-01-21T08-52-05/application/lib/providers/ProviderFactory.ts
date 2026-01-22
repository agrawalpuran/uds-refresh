/**
 * ProviderFactory
 * 
 * Factory for creating and initializing logistics provider instances.
 * Handles provider-specific initialization and credential management.
 */

import { LogisticsProvider } from './LogisticsProvider'
import { ShipwayProvider } from './ShipwayProvider'
// Direct imports for provider and company provider models
import { decrypt } from '@/lib/utils/encryption'
import connectDB from '@/lib/db/mongodb'
import ShipmentServiceProvider from '@/lib/models/ShipmentServiceProvider'
import CompanyShippingProvider from '@/lib/models/CompanyShippingProvider'

/**
 * Create and initialize a logistics provider instance
 */
export async function createProvider(
  providerId: string,
  companyId?: string,
  companyShippingProviderId?: string
): Promise<LogisticsProvider | null> {
  await connectDB()

  // Get provider metadata
  const provider = await ShipmentServiceProvider.findOne({ providerId }).lean()
  if (!provider || !provider.isActive) {
    throw new Error(`Provider ${providerId} not found or inactive`)
  }

  // Initialize provider based on provider code
  let providerInstance: LogisticsProvider

  switch (provider.providerCode) {
    case 'SHIPWAY':
      providerInstance = new ShipwayProvider(providerId)
      break
    case 'SHIPROCKET':
    case 'SHIPROCKET_ICICI':
      const { ShiprocketProvider } = await import('./ShiprocketProvider')
      providerInstance = new ShiprocketProvider(providerId)
      break
    case 'MOCK':
      const { MockProvider } = await import('./MockProvider')
      providerInstance = new MockProvider(providerId)
      break
    default:
      throw new Error(`Unsupported provider: ${provider.providerCode}`)
  }

  // If company context provided, load and decrypt credentials
  let companyProvider: any = null
  let credentialsLoaded = false

  if (companyId && companyShippingProviderId) {
    // Full context provided - fetch CompanyShippingProvider with companyId
    companyProvider = await CompanyShippingProvider.findOne({
      companyShippingProviderId,
      companyId,
      providerId,
      isEnabled: true,
    }).lean()

    if (!companyProvider) {
      throw new Error(`Company shipping provider not found or disabled: ${companyShippingProviderId}`)
    }
    credentialsLoaded = true
  } else if (companyShippingProviderId) {
    // Only companyShippingProviderId provided - try to fetch without companyId
    console.log(`[ProviderFactory] companyId not provided, attempting to fetch CompanyShippingProvider by companyShippingProviderId: ${companyShippingProviderId}`)
    companyProvider = await CompanyShippingProvider.findOne({
      companyShippingProviderId,
      providerId,
      isEnabled: true,
    }).lean()

    if (companyProvider) {
      console.log(`[ProviderFactory] ✅ Found CompanyShippingProvider, companyId: ${companyProvider.companyId}`)
      credentialsLoaded = true
    } else {
      console.warn(`[ProviderFactory] ⚠️ CompanyShippingProvider not found by companyShippingProviderId: ${companyShippingProviderId}`)
    }
  }

  // If credentials loaded from CompanyShippingProvider, use them
  if (credentialsLoaded && companyProvider) {
    // Decrypt credentials
    const apiKey = companyProvider.apiKey ? decrypt(companyProvider.apiKey) : ''
    const apiSecret = companyProvider.apiSecret ? decrypt(companyProvider.apiSecret) : ''
    const accessToken = companyProvider.accessToken ? decrypt(companyProvider.accessToken) : undefined

    // Initialize provider with credentials
    if (providerInstance instanceof ShipwayProvider) {
      await providerInstance.initialize({
        apiKey: apiKey || accessToken || '',
        apiSecret: apiSecret || '',
        apiBaseUrl: provider.apiBaseUrl || '',
        apiVersion: provider.apiVersion,
      })
    } else if (providerInstance.constructor.name === 'ShiprocketProvider') {
      // Shiprocket uses email/password for authentication
      // Extract from providerConfig if stored there, or use apiKey/apiSecret as email/password
      let email = apiKey || accessToken || ''
      let password = apiSecret || ''
      
      // Try to extract from providerConfig if credentials are stored there
      if ((!email || !password) && companyProvider.providerConfig) {
        try {
          const { decrypt } = await import('@/lib/utils/encryption')
          const decryptedConfig = JSON.parse(decrypt(companyProvider.providerConfig))
          if (decryptedConfig.email) email = decryptedConfig.email
          if (decryptedConfig.password) password = decryptedConfig.password
        } catch (error) {
          console.warn('[ProviderFactory] Failed to parse providerConfig:', error)
        }
      }
      
      // Validate credentials are present
      if (!email || !password) {
        throw new Error(
          `Shiprocket provider requires email and password credentials. ` +
          `Email: ${email ? 'SET' : 'MISSING'}, Password: ${password ? 'SET' : 'MISSING'}. ` +
          `Please configure credentials in Company Shipping Provider settings.`
        )
      }
      
      console.log(`[ProviderFactory] Initializing Shiprocket with email: ${email.substring(0, Math.min(10, email.length))}...`)
      await (providerInstance as any).initialize({
        email,
        password,
        apiBaseUrl: provider.apiBaseUrl || 'https://apiv2.shiprocket.in',
      })
    } else if (providerInstance.constructor.name === 'MockProvider') {
      // Mock provider doesn't need credentials, but can accept config
      await (providerInstance as any).initialize({
        simulateDelay: true,
        simulateErrors: false,
      })
    }
  } else {
    // No credentials from CompanyShippingProvider - try to use stored authConfig as fallback
    // This is especially useful for Shiprocket which requires authentication
    if (providerInstance.constructor.name === 'ShiprocketProvider') {
      console.log(`[ProviderFactory] Attempting to authenticate ShiprocketProvider using stored authConfig...`)
      
      try {
        // Try to get provider with decrypted authConfig (if providerRefId exists)
        const { getProviderWithAuth } = await import('@/lib/db/shipping-config-access')
        let providerWithAuth: any = null
        
        if (provider.providerRefId) {
          try {
            providerWithAuth = await getProviderWithAuth(provider.providerRefId)
            console.log(`[ProviderFactory] Loaded provider with authConfig, authType: ${providerWithAuth?.authConfig?.authType}`)
          } catch (error) {
            console.warn(`[ProviderFactory] Could not load authConfig for provider ${providerId}:`, error)
          }
        }

        if (providerWithAuth?.authConfig) {
          const authConfig = providerWithAuth.authConfig
          const creds = authConfig.credentials
          
          let email = ''
          let password = ''
          
          // Map authConfig to credentials based on authType
          if (authConfig.authType === 'BASIC' && creds.username && creds.password) {
            // BASIC auth: username is email, password is password
            email = creds.username
            password = creds.password
            console.log(`[ProviderFactory] Using BASIC auth from authConfig: email=${email ? 'SET' : 'MISSING'}, password=${password ? 'SET' : 'MISSING'}`)
          } else if (authConfig.authType === 'API_KEY' && creds.apiKey) {
            // API_KEY: apiKey is email, password is apiSecret
            email = creds.apiKey
            password = creds.password || ''
            console.log(`[ProviderFactory] Using API_KEY auth from authConfig: email=${email ? 'SET' : 'MISSING'}, password=${password ? 'SET' : 'MISSING'}`)
          }
          
          // If we have credentials, try to authenticate
          if (email && password) {
            console.log(`[ProviderFactory] Attempting to authenticate ShiprocketProvider with stored credentials...`)
            await (providerInstance as any).initialize({
              email,
              password,
              apiBaseUrl: provider.apiBaseUrl || 'https://apiv2.shiprocket.in',
            })
            console.log(`[ProviderFactory] ✅ ShiprocketProvider authenticated successfully using stored authConfig`)
          } else {
            throw new Error('ShiprocketProvider requires email and password for initialization. No valid credentials found in authConfig.')
          }
        } else {
          throw new Error('ShiprocketProvider requires email and password for initialization. No CompanyShippingProvider or authConfig found.')
        }
      } catch (error: any) {
        console.error(`[ProviderFactory] ❌ Failed to authenticate ShiprocketProvider:`, error.message)
        throw new Error(`ShiprocketProvider authentication failed: ${error.message}. Please ensure credentials are configured in Company Shipping Provider settings or provider authConfig.`)
      }
    } else if (providerInstance instanceof ShipwayProvider) {
      // Provider instance without credentials (for serviceability checks, etc.)
      // Some providers may allow public endpoints
      await providerInstance.initialize({
        apiKey: '',
        apiSecret: '',
        apiBaseUrl: provider.apiBaseUrl || '',
        apiVersion: provider.apiVersion,
      })
    } else if (providerInstance.constructor.name === 'MockProvider') {
      // Mock provider for testing
      await (providerInstance as any).initialize({
        simulateDelay: true,
        simulateErrors: false,
      })
    }
  }

  return providerInstance
}

/**
 * Get provider instance for testing (with direct credentials or stored auth)
 * This is used by the Super Admin test UI and runtime operations
 */
export async function getProviderInstance(
  providerCode: string,
  credentials?: {
    apiKey?: string
    apiSecret?: string
    accessToken?: string
    email?: string
    password?: string
  }
): Promise<LogisticsProvider> {
  await connectDB()

  // Get provider metadata by code (with authConfig if available)
  const { getProviderWithAuth } = await import('@/lib/db/shipping-config-access')
  const provider = await ShipmentServiceProvider.findOne({ 
    providerCode: providerCode.toUpperCase() 
  }).lean()

  if (!provider || !provider.isActive) {
    throw new Error(`Provider ${providerCode} not found or inactive`)
  }

  // Try to get provider with decrypted authConfig (if providerRefId exists)
  let providerWithAuth: any = null
  if (provider.providerRefId) {
    try {
      providerWithAuth = await getProviderWithAuth(provider.providerRefId)
    } catch (error) {
      // If authConfig fetch fails, continue without it
      console.warn(`Could not load authConfig for provider ${providerCode}:`, error)
    }
  }

  // Use stored authConfig if available and no explicit credentials provided
  // Check if credentials object is empty or undefined
  const hasExplicitCredentials = credentials && Object.keys(credentials).length > 0 && 
    Object.values(credentials).some(v => v && v.toString().trim().length > 0)
  
  let finalCredentials = hasExplicitCredentials ? credentials : undefined
  
  if (!hasExplicitCredentials && providerWithAuth?.authConfig) {
    console.log(`[ProviderFactory] Using stored authConfig for ${providerCode}`)
    const authConfig = providerWithAuth.authConfig
    const creds = authConfig.credentials
    
    // Map authConfig to credentials based on authType
    if (authConfig.authType === 'API_KEY' && creds.apiKey) {
      finalCredentials = {
        apiKey: creds.apiKey,
        apiSecret: creds.password || '',
      }
    } else if (authConfig.authType === 'TOKEN' && creds.token) {
      finalCredentials = {
        accessToken: creds.token,
      }
    } else if (authConfig.authType === 'BASIC' && creds.username && creds.password) {
      // BASIC auth: username is email, password is password
      // For Shiprocket, username contains the email
      finalCredentials = {
        email: creds.username, // Email stored as username in BASIC auth
        password: creds.password,
      }
      console.log(`[ProviderFactory] Mapped BASIC auth: email=${creds.username ? 'SET' : 'MISSING'}, password=${creds.password ? 'SET' : 'MISSING'}`)
    } else if (authConfig.authType === 'OAUTH2' && creds.oauth) {
      // For OAuth2, we may need to get a token first
      // For now, use client credentials if available
      finalCredentials = {
        apiKey: creds.oauth.clientId,
        apiSecret: creds.oauth.clientSecret,
      }
    }
  } else if (!hasExplicitCredentials && !providerWithAuth?.authConfig) {
    console.warn(`[ProviderFactory] No credentials provided and no stored authConfig found for ${providerCode}`)
  }

  // Initialize provider based on provider code
  let providerInstance: LogisticsProvider

  switch (provider.providerCode) {
    case 'SHIPWAY':
      providerInstance = new ShipwayProvider(provider.providerId)
      await providerInstance.initialize({
        apiKey: finalCredentials?.apiKey || finalCredentials?.accessToken || '',
        apiSecret: finalCredentials?.apiSecret || '',
        apiBaseUrl: provider.apiBaseUrl || '',
        apiVersion: provider.apiVersion,
      })
      break
    case 'SHIPROCKET':
    case 'SHIPROCKET_ICICI':
      const { ShiprocketProvider } = await import('./ShiprocketProvider')
      providerInstance = new ShiprocketProvider(provider.providerId)
      
      const shiprocketEmail = finalCredentials?.email || finalCredentials?.apiKey || ''
      const shiprocketPassword = finalCredentials?.password || finalCredentials?.apiSecret || ''
      
      if (!shiprocketEmail || !shiprocketPassword) {
        throw new Error(`Shiprocket provider requires email and password. Email: ${shiprocketEmail ? 'SET' : 'MISSING'}, Password: ${shiprocketPassword ? 'SET' : 'MISSING'}`)
      }
      
      console.log(`[ProviderFactory] Initializing Shiprocket with email: ${shiprocketEmail.substring(0, 10)}...`)
      await (providerInstance as any).initialize({
        email: shiprocketEmail,
        password: shiprocketPassword,
        apiBaseUrl: provider.apiBaseUrl || 'https://apiv2.shiprocket.in',
      })
      break
    case 'MOCK':
      const { MockProvider } = await import('./MockProvider')
      providerInstance = new MockProvider(provider.providerId)
      await (providerInstance as any).initialize({
        simulateDelay: true,
        simulateErrors: false,
      })
      break
    default:
      throw new Error(`Unsupported provider: ${provider.providerCode}`)
  }

  return providerInstance
}

/**
 * Get enabled providers for a company
 */
export async function getEnabledProvidersForCompany(companyId: string): Promise<Array<{
  providerId: string
  providerCode: string
  providerName: string
  companyShippingProviderId: string
}>> {
  await connectDB()

  const companyProviders = await CompanyShippingProvider.find({
    companyId,
    isEnabled: true,
  })
    .populate('providerId', 'providerId providerCode providerName')
    .lean()

  // Get provider details
  const providerIds = companyProviders.map((cp: any) => {
    // Handle both populated and non-populated cases
    return typeof cp.providerId === 'object' ? cp.providerId.providerId : cp.providerId
  })
  
  const providers = await ShipmentServiceProvider.find({
    providerId: { $in: providerIds },
    isActive: true,
  })
    .select('providerId providerCode providerName')
    .lean()

  const providerMap = new Map(providers.map((p: any) => [p.providerId, p]))

  return companyProviders
    .map((cp: any) => {
      const pid = typeof cp.providerId === 'object' ? cp.providerId.providerId : cp.providerId
      return { cp, pid }
    })
    .filter(({ pid }) => providerMap.has(pid))
    .map(({ cp, pid }) => ({
      providerId: pid,
      providerCode: providerMap.get(pid)!.providerCode,
      providerName: providerMap.get(pid)!.providerName,
      companyShippingProviderId: cp.companyShippingProviderId,
    }))
}

