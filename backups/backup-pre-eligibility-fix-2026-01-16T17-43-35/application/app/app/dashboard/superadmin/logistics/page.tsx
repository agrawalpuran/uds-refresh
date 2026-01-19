'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Truck, Settings, Package, Plus, Edit, Trash2, CheckCircle, XCircle, AlertCircle, TestTube } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import VendorRoutingTab from './vendor-routing-tab'

// Client-side API functions
async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }
  
  return response.json()
}

async function getSystemShippingConfig() {
  return fetchAPI<any>('/api/superadmin/shipping-config')
}

async function updateSystemShippingConfig(config: {
  shippingIntegrationEnabled?: boolean
  allowMultipleProvidersPerCompany?: boolean
  updatedBy?: string
}) {
  return fetchAPI<any>('/api/superadmin/shipping-config', {
    method: 'PUT',
    body: JSON.stringify(config),
  })
}

async function getAllShipmentServiceProviders(includeInactive: boolean = false) {
  const params = new URLSearchParams()
  if (includeInactive) {
    params.append('includeInactive', 'true')
  }
  return fetchAPI<any[]>(`/api/superadmin/shipping-providers?${params.toString()}`)
}

async function getShipmentServiceProviderById(providerId: string) {
  return fetchAPI<any>(`/api/superadmin/shipping-providers?providerId=${providerId}`)
}

async function createShipmentServiceProvider(providerData: any) {
  return fetchAPI<any>('/api/superadmin/shipping-providers', {
    method: 'POST',
    body: JSON.stringify(providerData),
  })
}

async function updateShipmentServiceProvider(providerId: string, updates: any) {
  return fetchAPI<any>('/api/superadmin/shipping-providers', {
    method: 'PUT',
    body: JSON.stringify({ providerId, ...updates }),
  })
}

async function deleteShipmentServiceProvider(providerId: string) {
  return fetchAPI<any>(`/api/superadmin/shipping-providers?providerId=${providerId}`, {
    method: 'DELETE',
  })
}

type TabType = 'settings' | 'providers' | 'vendor-routing' | 'manual-couriers' | 'packages'

export default function SuperAdminLogisticsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('settings')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Settings state
  const [config, setConfig] = useState<{
    shippingIntegrationEnabled: boolean
    allowMultipleProvidersPerCompany: boolean
  } | null>(null)
  
  // Company shipment mode state
  const [companies, setCompanies] = useState<any[]>([])
  const [updatingCompany, setUpdatingCompany] = useState<string | null>(null)
  
  // Providers state
  const [providers, setProviders] = useState<any[]>([])
  const [showProviderModal, setShowProviderModal] = useState(false)
  const [editingProvider, setEditingProvider] = useState<any | null>(null)
  const [includeInactive, setIncludeInactive] = useState(false)
  
  // Manual Couriers state
  const [manualCouriers, setManualCouriers] = useState<any[]>([])
  const [showManualCourierModal, setShowManualCourierModal] = useState(false)
  const [editingManualCourier, setEditingManualCourier] = useState<any | null>(null)
  const [includeInactiveCouriers, setIncludeInactiveCouriers] = useState(false)
  const [manualCourierForm, setManualCourierForm] = useState({
    courierCode: '',
    courierName: '',
    isActive: true,
    contactWebsite: '',
    supportPhone: '',
    remarks: '',
  })
  
  // Shipment Packages state
  const [packages, setPackages] = useState<any[]>([])
  const [showPackageModal, setShowPackageModal] = useState(false)
  const [editingPackage, setEditingPackage] = useState<any | null>(null)
  const [includeInactivePackages, setIncludeInactivePackages] = useState(false)
  const [packageForm, setPackageForm] = useState({
    packageName: '',
    lengthCm: '',
    breadthCm: '',
    heightCm: '',
    volumetricDivisor: '5000',
    isActive: true,
  })
  
  // Provider form state
  const [providerForm, setProviderForm] = useState({
    providerCode: '',
    providerName: '',
    providerType: 'API_AGGREGATOR' as 'API_AGGREGATOR' | 'DIRECT_COURIER' | 'FREIGHT',
    isActive: true,
    supportsShipmentCreate: false,
    supportsTracking: false,
    supportsServiceabilityCheck: false,
    supportsCancellation: false,
    supportsWebhooks: false,
    apiBaseUrl: '',
    apiVersion: '',
    authType: 'API_KEY' as 'API_KEY' | 'TOKEN' | 'OAUTH' | '',
    documentationUrl: '',
    authConfig: null as any, // Authentication configuration
  })
  
  const [showAuthConfig, setShowAuthConfig] = useState(false)
  const [authConfigForm, setAuthConfigForm] = useState({
    authType: 'API_KEY' as 'API_KEY' | 'TOKEN' | 'BASIC' | 'OAUTH2',
    credentials: {
      apiKey: '',
      token: '',
      username: '',
      password: '',
      oauth: {
        clientId: '',
        clientSecret: '',
        tokenUrl: '',
        scope: '',
      },
    },
    headersTemplate: '',
    tokenExpirySeconds: undefined as number | undefined,
    autoRefreshToken: false,
  })

  // Load configuration
  useEffect(() => {
    loadConfig()
    loadCompanies()
  }, [])

  // Load providers when tab changes or includeInactive changes
  useEffect(() => {
    if (activeTab === 'providers') {
      loadProviders()
    }
  }, [activeTab, includeInactive])

  // Load manual couriers when tab changes
  useEffect(() => {
    if (activeTab === 'manual-couriers') {
      loadManualCouriers()
    }
  }, [activeTab, includeInactiveCouriers])

  // Load packages when tab changes
  useEffect(() => {
    if (activeTab === 'packages') {
      loadPackages()
    }
  }, [activeTab, includeInactivePackages])

  const loadConfig = async () => {
    try {
      setLoading(true)
      const data = await getSystemShippingConfig()
      setConfig(data)
    } catch (error: any) {
      console.error('Error loading shipping config:', error)
      alert(`Error loading configuration: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const loadProviders = async () => {
    try {
      setLoading(true)
      const data = await getAllShipmentServiceProviders(includeInactive)
      setProviders(data)
    } catch (error: any) {
      console.error('Error loading providers:', error)
      alert(`Error loading providers: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const loadCompanies = async () => {
    try {
      const response = await fetch('/api/companies')
      if (response.ok) {
        const data = await response.json()
        setCompanies(Array.isArray(data) ? data : [data])
      }
    } catch (error: any) {
      console.error('Error loading companies:', error)
    }
  }

  const loadManualCouriers = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (!includeInactiveCouriers) {
        params.append('isActive', 'true')
      }
      const response = await fetch(`/api/superadmin/manual-courier-providers?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setManualCouriers(data.couriers || [])
      } else {
        throw new Error('Failed to load manual couriers')
      }
    } catch (error: any) {
      console.error('Error loading manual couriers:', error)
      alert(`Error loading manual couriers: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const loadPackages = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (!includeInactivePackages) {
        params.append('activeOnly', 'true')
      }
      const response = await fetch(`/api/shipping/packages?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setPackages(data.packages || [])
      } else {
        throw new Error('Failed to load packages')
      }
    } catch (error: any) {
      console.error('Error loading packages:', error)
      alert(`Error loading packages: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const updateCompanyShipmentMode = async (companyId: string, mode: 'MANUAL' | 'AUTOMATIC') => {
    try {
      setUpdatingCompany(companyId)
      const response = await fetch('/api/companies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          action: 'updateSettings',
          shipmentRequestMode: mode,
        }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update company shipment mode')
      }
      
      // Update local state
      setCompanies(companies.map(c => 
        c.id === companyId ? { ...c, shipmentRequestMode: mode } : c
      ))
      
      alert('Company shipment mode updated successfully!')
    } catch (error: any) {
      console.error('Error updating company shipment mode:', error)
      alert(`Error: ${error.message}`)
    } finally {
      setUpdatingCompany(null)
    }
  }

  const handleSaveConfig = async () => {
    if (!config) return
    
    try {
      setSaving(true)
      await updateSystemShippingConfig({
        shippingIntegrationEnabled: config.shippingIntegrationEnabled,
        allowMultipleProvidersPerCompany: config.allowMultipleProvidersPerCompany,
        updatedBy: 'Super Admin', // TODO: Get actual admin identifier
      })
      alert('Configuration saved successfully!')
    } catch (error: any) {
      console.error('Error saving config:', error)
      alert(`Error saving configuration: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleIntegration = () => {
    if (!config) return
    
    if (config.shippingIntegrationEnabled) {
      // Disabling - show warning
      if (!confirm('Disabling shipping integration will hide logistics provider options for all companies. Continue?')) {
        return
      }
    }
    
    setConfig({
      ...config,
      shippingIntegrationEnabled: !config.shippingIntegrationEnabled,
    })
  }

  const handleOpenProviderModal = (provider?: any) => {
    if (provider) {
      setEditingProvider(provider)
      setProviderForm({
        providerCode: provider.providerCode || '',
        providerName: provider.providerName || '',
        providerType: provider.providerType || 'API_AGGREGATOR',
        isActive: provider.isActive ?? true,
        supportsShipmentCreate: provider.supportsShipmentCreate ?? false,
        supportsTracking: provider.supportsTracking ?? false,
        supportsServiceabilityCheck: provider.supportsServiceabilityCheck ?? false,
        supportsCancellation: provider.supportsCancellation ?? false,
        supportsWebhooks: provider.supportsWebhooks ?? false,
        apiBaseUrl: provider.apiBaseUrl || '',
        apiVersion: provider.apiVersion || '',
        authType: provider.authType || 'API_KEY',
        documentationUrl: provider.documentationUrl || '',
        authConfig: null, // Never load authConfig in UI (security)
      })
      // Reset auth config form (credentials are never shown)
      setAuthConfigForm({
        authType: 'API_KEY',
        credentials: {
          apiKey: '',
          token: '',
          username: '',
          password: '',
          oauth: {
            clientId: '',
            clientSecret: '',
            tokenUrl: '',
            scope: '',
          },
        },
        headersTemplate: '',
        tokenExpirySeconds: undefined,
        autoRefreshToken: false,
      })
      setShowAuthConfig(false)
    } else {
      setEditingProvider(null)
      setProviderForm({
        providerCode: '',
        providerName: '',
        providerType: 'API_AGGREGATOR',
        isActive: true,
        supportsShipmentCreate: false,
        supportsTracking: false,
        supportsServiceabilityCheck: false,
        supportsCancellation: false,
        supportsWebhooks: false,
        apiBaseUrl: '',
        apiVersion: '',
        authType: 'API_KEY',
        documentationUrl: '',
        authConfig: null,
      })
    }
    setShowProviderModal(true)
  }

  const handleCloseProviderModal = () => {
    setShowProviderModal(false)
    setEditingProvider(null)
  }

  const handleSaveProvider = async () => {
    try {
      setSaving(true)
      
      // Build authConfig if credentials are provided
      let authConfig: any = null
      if (showAuthConfig && authConfigForm.authType) {
        const creds: any = {}
        
        if (authConfigForm.authType === 'API_KEY' && authConfigForm.credentials.apiKey) {
          creds.apiKey = authConfigForm.credentials.apiKey
        } else if (authConfigForm.authType === 'TOKEN' && authConfigForm.credentials.token) {
          creds.token = authConfigForm.credentials.token
        } else if (authConfigForm.authType === 'BASIC') {
          if (authConfigForm.credentials.username && authConfigForm.credentials.password) {
            creds.username = authConfigForm.credentials.username
            creds.password = authConfigForm.credentials.password
          }
        } else if (authConfigForm.authType === 'OAUTH2') {
          if (authConfigForm.credentials.oauth.clientId && authConfigForm.credentials.oauth.clientSecret) {
            creds.oauth = {
              clientId: authConfigForm.credentials.oauth.clientId,
              clientSecret: authConfigForm.credentials.oauth.clientSecret,
              tokenUrl: authConfigForm.credentials.oauth.tokenUrl,
              scope: authConfigForm.credentials.oauth.scope,
            }
          }
        }
        
        // Only create authConfig if we have credentials
        if (Object.keys(creds).length > 0) {
          authConfig = {
            authType: authConfigForm.authType,
            credentials: creds,
            tokenExpirySeconds: authConfigForm.tokenExpirySeconds,
            autoRefreshToken: authConfigForm.autoRefreshToken,
          }
          
          // Add headersTemplate if provided
          if (authConfigForm.headersTemplate) {
            try {
              authConfig.headersTemplate = JSON.parse(authConfigForm.headersTemplate)
            } catch {
              // Invalid JSON, skip
            }
          }
        }
      }
      
      if (editingProvider) {
        await updateShipmentServiceProvider(editingProvider.providerId, {
          ...providerForm,
          authConfig: authConfig, // Will be encrypted in data access layer
          updatedBy: 'Super Admin', // TODO: Get actual admin identifier
        })
        alert('Provider updated successfully!')
      } else {
        await createShipmentServiceProvider({
          ...providerForm,
          authConfig: authConfig, // Will be encrypted in data access layer
          createdBy: 'Super Admin', // TODO: Get actual admin identifier
        })
        alert('Provider created successfully!')
      }
      
      handleCloseProviderModal()
      loadProviders()
    } catch (error: any) {
      console.error('Error saving provider:', error)
      alert(`Error saving provider: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteProvider = async (providerId: string) => {
    if (!confirm('Are you sure you want to delete this provider? This action cannot be undone.')) {
      return
    }
    
    try {
      setSaving(true)
      await deleteShipmentServiceProvider(providerId)
      alert('Provider deleted successfully!')
      loadProviders()
    } catch (error: any) {
      console.error('Error deleting provider:', error)
      alert(`Error deleting provider: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleProviderActive = async (provider: any) => {
    try {
      setSaving(true)
      await updateShipmentServiceProvider(provider.providerId, {
        isActive: !provider.isActive,
        updatedBy: 'Super Admin', // TODO: Get actual admin identifier
      })
      loadProviders()
    } catch (error: any) {
      console.error('Error toggling provider status:', error)
      alert(`Error updating provider: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  // Manual Couriers handlers
  const handleOpenManualCourierModal = (courier?: any) => {
    if (courier) {
      setEditingManualCourier(courier)
      setManualCourierForm({
        courierCode: courier.courierCode || '',
        courierName: courier.courierName || '',
        isActive: courier.isActive ?? true,
        contactWebsite: courier.contactWebsite || '',
        supportPhone: courier.supportPhone || '',
        remarks: courier.remarks || '',
      })
    } else {
      setEditingManualCourier(null)
      setManualCourierForm({
        courierCode: '',
        courierName: '',
        isActive: true,
        contactWebsite: '',
        supportPhone: '',
        remarks: '',
      })
    }
    setShowManualCourierModal(true)
  }

  const handleCloseManualCourierModal = () => {
    setShowManualCourierModal(false)
    setEditingManualCourier(null)
    setManualCourierForm({
      courierCode: '',
      courierName: '',
      isActive: true,
      contactWebsite: '',
      supportPhone: '',
      remarks: '',
    })
  }

  const handleSaveManualCourier = async () => {
    if (!manualCourierForm.courierCode.trim() || !manualCourierForm.courierName.trim()) {
      alert('Courier code and name are required')
      return
    }

    try {
      setSaving(true)
      const url = editingManualCourier
        ? `/api/superadmin/manual-courier-providers/${editingManualCourier.courierRefId}`
        : '/api/superadmin/manual-courier-providers'
      
      const method = editingManualCourier ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualCourierForm),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save courier')
      }

      alert(editingManualCourier ? 'Courier updated successfully!' : 'Courier created successfully!')
      handleCloseManualCourierModal()
      loadManualCouriers()
    } catch (error: any) {
      console.error('Error saving manual courier:', error)
      alert(`Error saving courier: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteManualCourier = async (courierRefId: string) => {
    if (!confirm('Are you sure you want to disable this courier? It will no longer appear in manual shipment dropdowns.')) {
      return
    }
    
    try {
      setSaving(true)
      const response = await fetch(`/api/superadmin/manual-courier-providers/${courierRefId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete courier')
      }

      alert('Courier disabled successfully!')
      loadManualCouriers()
    } catch (error: any) {
      console.error('Error deleting manual courier:', error)
      alert(`Error deleting courier: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  // Package handlers
  const handleOpenPackageModal = (pkg?: any) => {
    if (pkg) {
      setEditingPackage(pkg)
      setPackageForm({
        packageName: pkg.packageName || '',
        lengthCm: String(pkg.lengthCm || ''),
        breadthCm: String(pkg.breadthCm || ''),
        heightCm: String(pkg.heightCm || ''),
        volumetricDivisor: String(pkg.volumetricDivisor || '5000'),
        isActive: pkg.isActive ?? true,
      })
    } else {
      setEditingPackage(null)
      setPackageForm({
        packageName: '',
        lengthCm: '',
        breadthCm: '',
        heightCm: '',
        volumetricDivisor: '5000',
        isActive: true,
      })
    }
    setShowPackageModal(true)
  }

  const handleClosePackageModal = () => {
    setShowPackageModal(false)
    setEditingPackage(null)
    setPackageForm({
      packageName: '',
      lengthCm: '',
      breadthCm: '',
      heightCm: '',
      volumetricDivisor: '5000',
      isActive: true,
    })
  }

  const handleSavePackage = async () => {
    try {
      setSaving(true)
      const packageData = {
        packageName: packageForm.packageName.trim(),
        lengthCm: parseFloat(packageForm.lengthCm),
        breadthCm: parseFloat(packageForm.breadthCm),
        heightCm: parseFloat(packageForm.heightCm),
        volumetricDivisor: parseFloat(packageForm.volumetricDivisor),
        isActive: packageForm.isActive,
      }

      if (editingPackage) {
        const response = await fetch(`/api/shipping/packages/${editingPackage.packageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(packageData),
        })
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to update package')
        }
        alert('Package updated successfully!')
      } else {
        const response = await fetch('/api/shipping/packages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(packageData),
        })
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to create package')
        }
        alert('Package created successfully!')
      }
      
      await loadPackages()
      handleClosePackageModal()
    } catch (error: any) {
      console.error('Error saving package:', error)
      alert(`Error: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePackage = async (packageId: string) => {
    if (!confirm('Are you sure you want to delete this package? This action cannot be undone.')) {
      return
    }

    try {
      setSaving(true)
      const response = await fetch(`/api/shipping/packages/${packageId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete package')
      }
      alert('Package deleted successfully!')
      await loadPackages()
    } catch (error: any) {
      console.error('Error deleting package:', error)
      alert(`Error: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleManualCourierActive = async (courier: any) => {
    try {
      setSaving(true)
      const response = await fetch(`/api/superadmin/manual-courier-providers/${courier.courierRefId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isActive: !courier.isActive,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update courier')
      }

      loadManualCouriers()
    } catch (error: any) {
      console.error('Error toggling courier status:', error)
      alert(`Error updating courier: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading && !config) {
    return (
      <DashboardLayout actorType="superadmin">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="superadmin">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Logistics & Shipping</h1>
          <p className="text-sm text-gray-600">Manage shipping integration and logistics providers</p>
        </div>

        {/* Tabs */}
        <div className="flex space-x-4 border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === 'settings'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Settings className="inline h-4 w-4 mr-2" />
            Integration Settings
          </button>
          <button
            onClick={() => setActiveTab('providers')}
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === 'providers'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Truck className="inline h-4 w-4 mr-2" />
            Service Providers
          </button>
          <button
            onClick={() => setActiveTab('vendor-routing')}
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === 'vendor-routing'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Package className="inline h-4 w-4 mr-2" />
            Vendor Shipping Mapping
          </button>
          <button
            onClick={() => setActiveTab('manual-couriers')}
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === 'manual-couriers'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Truck className="inline h-4 w-4 mr-2" />
            Manual Couriers
          </button>
          <button
            onClick={() => setActiveTab('packages')}
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === 'packages'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Package className="inline h-4 w-4 mr-2" />
            Shipment Packages
          </button>
        </div>

        {/* Settings Tab */}
        {activeTab === 'settings' && config && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Shipping Integration Settings</h2>
            
            <div className="space-y-6">
              {/* Enable Shipping Integration */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-900 mb-1">
                    Enable Shipping Integration
                  </label>
                  <p className="text-sm text-gray-600">
                    When enabled, logistics providers and API-based shipping become available to companies.
                    When disabled, all companies use manual shipment only.
                  </p>
                </div>
                <button
                  onClick={handleToggleIntegration}
                  className={`ml-4 relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    config.shippingIntegrationEnabled ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.shippingIntegrationEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Allow Multiple Providers */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-900 mb-1">
                    Allow Multiple Logistics Providers per Company
                  </label>
                  <p className="text-sm text-gray-600">
                    When enabled, companies can configure and use multiple logistics providers simultaneously.
                  </p>
                </div>
                <button
                  onClick={() => setConfig({ ...config, allowMultipleProvidersPerCompany: !config.allowMultipleProvidersPerCompany })}
                  className={`ml-4 relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    config.allowMultipleProvidersPerCompany ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.allowMultipleProvidersPerCompany ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Warning when disabling */}
              {!config.shippingIntegrationEnabled && (
                <div className="flex items-start space-x-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">Shipping Integration Disabled</p>
                    <p className="text-sm text-yellow-700 mt-1">
                      All companies will use manual shipment only. Logistics provider options are hidden.
                    </p>
                  </div>
                </div>
              )}

              {/* Save Button */}
              <div className="flex justify-end pt-4 border-t border-gray-200">
                <button
                  onClick={handleSaveConfig}
                  disabled={saving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      <span>Save Configuration</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Company Shipment Mode Configuration */}
        {activeTab === 'settings' && config && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Company Shipment Mode Configuration</h2>
            <p className="text-sm text-gray-600 mb-6">
              Configure shipment request mode for each company. MANUAL mode requires manual entry of shipment details.
              AUTOMATIC mode enables automatic shipment creation using logistics providers and vendor warehouses.
            </p>
            
            {companies.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p>No companies found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Company
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Current Mode
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {companies.map((company) => (
                      <tr key={company.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{company.name}</div>
                          <div className="text-sm text-gray-500">ID: {company.id}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            (company.shipmentRequestMode || 'MANUAL') === 'AUTOMATIC'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {company.shipmentRequestMode || 'MANUAL'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => updateCompanyShipmentMode(company.id, 'MANUAL')}
                              disabled={updatingCompany === company.id || (company.shipmentRequestMode || 'MANUAL') === 'MANUAL'}
                              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                (company.shipmentRequestMode || 'MANUAL') === 'MANUAL'
                                  ? 'bg-gray-200 text-gray-600 cursor-not-allowed'
                                  : 'bg-gray-600 text-white hover:bg-gray-700'
                              }`}
                            >
                              {updatingCompany === company.id && (company.shipmentRequestMode || 'MANUAL') !== 'MANUAL' ? 'Updating...' : 'Set MANUAL'}
                            </button>
                            <button
                              onClick={() => updateCompanyShipmentMode(company.id, 'AUTOMATIC')}
                              disabled={updatingCompany === company.id || (company.shipmentRequestMode || 'MANUAL') === 'AUTOMATIC' || !config.shippingIntegrationEnabled}
                              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                (company.shipmentRequestMode || 'MANUAL') === 'AUTOMATIC'
                                  ? 'bg-green-200 text-green-700 cursor-not-allowed'
                                  : !config.shippingIntegrationEnabled
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : 'bg-green-600 text-white hover:bg-green-700'
                              }`}
                            >
                              {updatingCompany === company.id && (company.shipmentRequestMode || 'MANUAL') !== 'AUTOMATIC' ? 'Updating...' : 'Set AUTOMATIC'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {!config.shippingIntegrationEnabled && (
              <div className="mt-4 flex items-start space-x-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">Shipping Integration Disabled</p>
                  <p className="text-sm text-yellow-700 mt-1">
                    AUTOMATIC mode requires shipping integration to be enabled. Enable it above to allow companies to use automatic shipment creation.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Providers Tab */}
        {activeTab === 'providers' && (
          <div className="space-y-4">
            {/* Header with Actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={includeInactive}
                    onChange={(e) => setIncludeInactive(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Show inactive providers</span>
                </label>
              </div>
              <button
                onClick={() => handleOpenProviderModal()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Add Provider</span>
              </button>
            </div>

            {/* Providers Table */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : providers.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <Truck className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Providers Found</h3>
                <p className="text-gray-600 mb-4">Get started by adding your first logistics service provider.</p>
                <button
                  onClick={() => handleOpenProviderModal()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center space-x-2 mx-auto"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Provider</span>
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Provider
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Capabilities
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {providers.map((provider) => (
                      <tr key={provider.providerId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{provider.providerName}</div>
                            <div className="text-sm text-gray-500">{provider.providerCode}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                            {provider.providerType.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {provider.supportsShipmentCreate && (
                              <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Create</span>
                            )}
                            {provider.supportsTracking && (
                              <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Track</span>
                            )}
                            {provider.supportsServiceabilityCheck && (
                              <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Service</span>
                            )}
                            {provider.supportsCancellation && (
                              <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Cancel</span>
                            )}
                            {provider.supportsWebhooks && (
                              <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Webhook</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col space-y-1">
                            {provider.isActive ? (
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 flex items-center space-x-1 w-fit">
                                <CheckCircle className="h-3 w-3" />
                                <span>Active</span>
                              </span>
                            ) : (
                              <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800 flex items-center space-x-1 w-fit">
                                <XCircle className="h-3 w-3" />
                                <span>Inactive</span>
                              </span>
                            )}
                            {provider.lastHealthStatus && (
                              <span className={`px-2 py-1 text-xs font-medium rounded-full w-fit ${
                                provider.lastHealthStatus === 'HEALTHY' 
                                  ? 'bg-blue-100 text-blue-800'
                                  : provider.lastHealthStatus === 'UNHEALTHY'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {provider.lastHealthStatus === 'HEALTHY' ? '✓ Healthy' : 
                                 provider.lastHealthStatus === 'UNHEALTHY' ? '✗ Unhealthy' : '? Unknown'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => router.push(`/dashboard/superadmin/logistics/test?providerId=${provider.providerId}`)}
                              className="text-purple-600 hover:text-purple-900 flex items-center space-x-1"
                              title="Test Provider"
                            >
                              <TestTube className="h-4 w-4" />
                              <span>Test</span>
                            </button>
                            <button
                              onClick={() => handleToggleProviderActive(provider)}
                              className="text-blue-600 hover:text-blue-900"
                              title={provider.isActive ? 'Deactivate' : 'Activate'}
                            >
                              {provider.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              onClick={() => handleOpenProviderModal(provider)}
                              className="text-indigo-600 hover:text-indigo-900"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteProvider(provider.providerId)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Provider Modal */}
        {showProviderModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingProvider ? 'Edit Provider' : 'Add Provider'}
                </h2>
                <button
                  onClick={handleCloseProviderModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Provider Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={providerForm.providerCode}
                      onChange={(e) => setProviderForm({ ...providerForm, providerCode: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="SHIPWAY"
                      disabled={!!editingProvider}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Provider Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={providerForm.providerName}
                      onChange={(e) => setProviderForm({ ...providerForm, providerName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Shipway Logistics"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Provider Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={providerForm.providerType}
                    onChange={(e) => setProviderForm({ ...providerForm, providerType: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="API_AGGREGATOR">API Aggregator</option>
                    <option value="DIRECT_COURIER">Direct Courier</option>
                    <option value="FREIGHT">Freight</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      API Base URL
                    </label>
                    <input
                      type="url"
                      value={providerForm.apiBaseUrl}
                      onChange={(e) => setProviderForm({ ...providerForm, apiBaseUrl: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="https://api.provider.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      API Version
                    </label>
                    <input
                      type="text"
                      value={providerForm.apiVersion}
                      onChange={(e) => setProviderForm({ ...providerForm, apiVersion: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="v1"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Auth Type
                  </label>
                  <select
                    value={providerForm.authType}
                    onChange={(e) => setProviderForm({ ...providerForm, authType: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="API_KEY">API Key</option>
                    <option value="TOKEN">Token</option>
                    <option value="OAUTH">OAuth</option>
                  </select>
                </div>

                {/* Authentication Configuration Section */}
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">🔐</span>
                      <h3 className="text-sm font-semibold text-gray-900">Authentication Configuration</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAuthConfig(!showAuthConfig)}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      {showAuthConfig ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  
                  {editingProvider && !editingProvider.hasAuthConfig && (
                    <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                      ⚠️ Authentication Not Saved - Enter credentials below and click "Test Connection" to validate before saving
                    </div>
                  )}
                  
                  {editingProvider && editingProvider.hasAuthConfig && (
                    <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                      ✅ Authentication Configured (credentials are encrypted and hidden)
                    </div>
                  )}

                  {showAuthConfig && (
                    <div className="space-y-4 mt-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Authentication Type <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={authConfigForm.authType}
                          onChange={(e) => setAuthConfigForm({ ...authConfigForm, authType: e.target.value as any })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="API_KEY">API Key</option>
                          <option value="TOKEN">Token</option>
                          <option value="BASIC">Basic Auth</option>
                          <option value="OAUTH2">OAuth2</option>
                        </select>
                      </div>

                      {/* API Key */}
                      {authConfigForm.authType === 'API_KEY' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            API Key <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="password"
                            value={authConfigForm.credentials.apiKey}
                            onChange={(e) => setAuthConfigForm({
                              ...authConfigForm,
                              credentials: { ...authConfigForm.credentials, apiKey: e.target.value }
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter API key"
                          />
                        </div>
                      )}

                      {/* Token */}
                      {authConfigForm.authType === 'TOKEN' && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Token Value <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="password"
                              value={authConfigForm.credentials.token}
                              onChange={(e) => setAuthConfigForm({
                                ...authConfigForm,
                                credentials: { ...authConfigForm.credentials, token: e.target.value }
                              })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="Enter token"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Token Expiry (seconds, optional)
                            </label>
                            <input
                              type="number"
                              value={authConfigForm.tokenExpirySeconds || ''}
                              onChange={(e) => setAuthConfigForm({
                                ...authConfigForm,
                                tokenExpirySeconds: e.target.value ? parseInt(e.target.value, 10) : undefined
                              })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="3600"
                            />
                          </div>
                        </>
                      )}

                      {/* Basic Auth */}
                      {authConfigForm.authType === 'BASIC' && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Username <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={authConfigForm.credentials.username}
                              onChange={(e) => setAuthConfigForm({
                                ...authConfigForm,
                                credentials: { ...authConfigForm.credentials, username: e.target.value }
                              })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="Enter username"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Password <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="password"
                              value={authConfigForm.credentials.password}
                              onChange={(e) => setAuthConfigForm({
                                ...authConfigForm,
                                credentials: { ...authConfigForm.credentials, password: e.target.value }
                              })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="Enter password"
                            />
                          </div>
                        </>
                      )}

                      {/* OAuth2 */}
                      {authConfigForm.authType === 'OAUTH2' && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Client ID <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={authConfigForm.credentials.oauth.clientId}
                              onChange={(e) => setAuthConfigForm({
                                ...authConfigForm,
                                credentials: {
                                  ...authConfigForm.credentials,
                                  oauth: { ...authConfigForm.credentials.oauth, clientId: e.target.value }
                                }
                              })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="Enter client ID"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Client Secret <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="password"
                              value={authConfigForm.credentials.oauth.clientSecret}
                              onChange={(e) => setAuthConfigForm({
                                ...authConfigForm,
                                credentials: {
                                  ...authConfigForm.credentials,
                                  oauth: { ...authConfigForm.credentials.oauth, clientSecret: e.target.value }
                                }
                              })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="Enter client secret"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Token URL <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="url"
                              value={authConfigForm.credentials.oauth.tokenUrl}
                              onChange={(e) => setAuthConfigForm({
                                ...authConfigForm,
                                credentials: {
                                  ...authConfigForm.credentials,
                                  oauth: { ...authConfigForm.credentials.oauth, tokenUrl: e.target.value }
                                }
                              })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="https://api.provider.com/oauth/token"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Scope (optional)
                            </label>
                            <input
                              type="text"
                              value={authConfigForm.credentials.oauth.scope}
                              onChange={(e) => setAuthConfigForm({
                                ...authConfigForm,
                                credentials: {
                                  ...authConfigForm.credentials,
                                  oauth: { ...authConfigForm.credentials.oauth, scope: e.target.value }
                                }
                              })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="read write"
                            />
                          </div>
                          <div>
                            <label className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={authConfigForm.autoRefreshToken}
                                onChange={(e) => setAuthConfigForm({ ...authConfigForm, autoRefreshToken: e.target.checked })}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-700">Auto-refresh token</span>
                            </label>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  
                  {editingProvider && showAuthConfig && (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!editingProvider?.providerId) {
                            alert('❌ Error: Provider ID is missing. Please close and reopen the provider modal.')
                            return
                          }
                          
                          // Validate that credentials are entered
                          if (!authConfigForm.authType) {
                            alert('❌ Please select an Authentication Type')
                            return
                          }
                          
                          let hasCredentials = false
                          if (authConfigForm.authType === 'API_KEY' && authConfigForm.credentials.apiKey) {
                            hasCredentials = true
                          } else if (authConfigForm.authType === 'TOKEN' && authConfigForm.credentials.token) {
                            hasCredentials = true
                          } else if (authConfigForm.authType === 'BASIC' && authConfigForm.credentials.username && authConfigForm.credentials.password) {
                            hasCredentials = true
                          } else if (authConfigForm.authType === 'OAUTH2' && authConfigForm.credentials.oauth.clientId && authConfigForm.credentials.oauth.clientSecret) {
                            hasCredentials = true
                          }
                          
                          if (!hasCredentials) {
                            alert('❌ Please enter authentication credentials')
                            return
                          }
                          
                          try {
                            // Build authConfig from form
                            const creds: any = {}
                            if (authConfigForm.authType === 'API_KEY') {
                              creds.apiKey = authConfigForm.credentials.apiKey
                              if (authConfigForm.credentials.password) {
                                creds.password = authConfigForm.credentials.password
                              }
                            } else if (authConfigForm.authType === 'TOKEN') {
                              creds.token = authConfigForm.credentials.token
                            } else if (authConfigForm.authType === 'BASIC') {
                              creds.username = authConfigForm.credentials.username
                              creds.password = authConfigForm.credentials.password
                            } else if (authConfigForm.authType === 'OAUTH2') {
                              creds.oauth = {
                                clientId: authConfigForm.credentials.oauth.clientId,
                                clientSecret: authConfigForm.credentials.oauth.clientSecret,
                                tokenUrl: authConfigForm.credentials.oauth.tokenUrl,
                                scope: authConfigForm.credentials.oauth.scope,
                              }
                            }
                            
                            const testAuthConfig = {
                              authType: authConfigForm.authType,
                              credentials: creds,
                              tokenExpirySeconds: authConfigForm.tokenExpirySeconds,
                              autoRefreshToken: authConfigForm.autoRefreshToken,
                            }
                            
                            const res = await fetch(`/api/superadmin/shipping-providers/${editingProvider.providerId}/test-connection`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({ authConfig: testAuthConfig }),
                            })
                            const result = await res.json()
                            if (result.success) {
                              alert(`✅ Connection successful! ${result.message || ''}`)
                              // Reload provider to get updated health status
                              if (editingProvider) {
                                const providerRes = await fetch(`/api/superadmin/shipping-providers?providerId=${editingProvider.providerId}`)
                                if (providerRes.ok) {
                                  const updatedProvider = await providerRes.json()
                                  setEditingProvider(updatedProvider)
                                }
                              }
                            } else {
                              alert(`❌ Connection failed: ${result.message || result.error || 'Unknown error'}`)
                            }
                          } catch (error: any) {
                            alert(`Error testing connection: ${error.message}`)
                          }
                        }}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                      >
                        Test Connection
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!editingProvider?.providerId) {
                            alert('❌ Error: Provider ID is missing.')
                            return
                          }
                          
                          // Validate that credentials are entered
                          if (!authConfigForm.authType) {
                            alert('❌ Please select an Authentication Type')
                            return
                          }
                          
                          let hasCredentials = false
                          let credentialsToPass: any = {}
                          
                          if (authConfigForm.authType === 'API_KEY' && authConfigForm.credentials.apiKey) {
                            hasCredentials = true
                            credentialsToPass = {
                              authType: 'API_KEY',
                              apiKey: authConfigForm.credentials.apiKey,
                              apiSecret: authConfigForm.credentials.password || '',
                            }
                          } else if (authConfigForm.authType === 'TOKEN' && authConfigForm.credentials.token) {
                            hasCredentials = true
                            credentialsToPass = {
                              authType: 'TOKEN',
                              token: authConfigForm.credentials.token,
                            }
                          } else if (authConfigForm.authType === 'BASIC' && authConfigForm.credentials.username && authConfigForm.credentials.password) {
                            hasCredentials = true
                            credentialsToPass = {
                              authType: 'BASIC',
                              email: authConfigForm.credentials.username, // For Shiprocket, username is email
                              password: authConfigForm.credentials.password,
                            }
                          } else if (authConfigForm.authType === 'OAUTH2' && authConfigForm.credentials.oauth.clientId && authConfigForm.credentials.oauth.clientSecret) {
                            hasCredentials = true
                            credentialsToPass = {
                              authType: 'OAUTH2',
                              clientId: authConfigForm.credentials.oauth.clientId,
                              clientSecret: authConfigForm.credentials.oauth.clientSecret,
                            }
                          }
                          
                          if (!hasCredentials) {
                            alert('❌ Please enter authentication credentials')
                            return
                          }
                          
                          // Store credentials in sessionStorage for the test page
                          sessionStorage.setItem('testCredentials', JSON.stringify({
                            providerId: editingProvider.providerId,
                            credentials: credentialsToPass,
                            timestamp: Date.now(),
                          }))
                          
                          // Navigate to test page
                          router.push(`/dashboard/superadmin/logistics/test?providerId=${editingProvider.providerId}&fromEdit=true`)
                        }}
                        className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm ml-2"
                      >
                        Open Test Page
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Documentation URL
                  </label>
                  <input
                    type="url"
                    value={providerForm.documentationUrl}
                    onChange={(e) => setProviderForm({ ...providerForm, documentationUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://docs.provider.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Capabilities</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'supportsShipmentCreate', label: 'Create Shipment' },
                      { key: 'supportsTracking', label: 'Tracking' },
                      { key: 'supportsServiceabilityCheck', label: 'Serviceability Check' },
                      { key: 'supportsCancellation', label: 'Cancellation' },
                      { key: 'supportsWebhooks', label: 'Webhooks' },
                    ].map((cap) => (
                      <label key={cap.key} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={providerForm[cap.key as keyof typeof providerForm] as boolean}
                          onChange={(e) => setProviderForm({ ...providerForm, [cap.key]: e.target.checked })}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{cap.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={providerForm.isActive}
                      onChange={(e) => setProviderForm({ ...providerForm, isActive: e.target.checked })}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Active</span>
                  </label>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={handleCloseProviderModal}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveProvider}
                  disabled={saving || !providerForm.providerCode || !providerForm.providerName}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : editingProvider ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Vendor Routing Tab */}
        {activeTab === 'vendor-routing' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <VendorRoutingTab />
          </div>
        )}

        {/* Manual Couriers Tab */}
        {activeTab === 'manual-couriers' && (
          <div className="space-y-4">
            {/* Header with Actions */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Manual Courier Service Providers</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Manage courier providers for manual shipments. These couriers appear in dropdowns when shipping method is MANUAL.
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={includeInactiveCouriers}
                    onChange={(e) => setIncludeInactiveCouriers(e.target.checked)}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Show Inactive</span>
                </label>
                <button
                  onClick={() => handleOpenManualCourierModal()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Courier</span>
                </button>
              </div>
            </div>

            {/* Couriers Table */}
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading couriers...</p>
              </div>
            ) : manualCouriers.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <Truck className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600">No courier providers found</p>
                <p className="text-sm text-gray-500 mt-2">
                  {includeInactiveCouriers ? 'No couriers exist. Add one to get started.' : 'No active couriers. Enable "Show Inactive" to see disabled couriers.'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Courier Code
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Courier Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contact
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {manualCouriers.map((courier) => (
                      <tr key={courier.courierRefId}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{courier.courierCode}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{courier.courierName}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            courier.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {courier.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">
                            {courier.supportPhone && <div>📞 {courier.supportPhone}</div>}
                            {courier.contactWebsite && <div>🌐 {courier.contactWebsite}</div>}
                            {!courier.supportPhone && !courier.contactWebsite && <span className="text-gray-400">—</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => handleToggleManualCourierActive(courier)}
                              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                courier.isActive
                                  ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                            >
                              {courier.isActive ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              onClick={() => handleOpenManualCourierModal(courier)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteManualCourier(courier.courierRefId)}
                              className="text-red-600 hover:text-red-900"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add/Edit Courier Modal */}
            {showManualCourierModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">
                    {editingManualCourier ? 'Edit Courier' : 'Add Courier'}
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Courier Code *
                      </label>
                      <input
                        type="text"
                        value={manualCourierForm.courierCode}
                        onChange={(e) => setManualCourierForm(prev => ({ ...prev, courierCode: e.target.value.toUpperCase() }))}
                        placeholder="e.g., DTDC, UPS"
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        disabled={!!editingManualCourier}
                      />
                      <p className="mt-1 text-xs text-gray-500">Unique code (alphanumeric, hyphens/underscores allowed)</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Courier Name *
                      </label>
                      <input
                        type="text"
                        value={manualCourierForm.courierName}
                        onChange={(e) => setManualCourierForm(prev => ({ ...prev, courierName: e.target.value }))}
                        placeholder="e.g., DTDC Express"
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Support Phone
                        </label>
                        <input
                          type="text"
                          value={manualCourierForm.supportPhone}
                          onChange={(e) => setManualCourierForm(prev => ({ ...prev, supportPhone: e.target.value }))}
                          placeholder="Optional"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Website
                        </label>
                        <input
                          type="url"
                          value={manualCourierForm.contactWebsite}
                          onChange={(e) => setManualCourierForm(prev => ({ ...prev, contactWebsite: e.target.value }))}
                          placeholder="Optional"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Remarks
                      </label>
                      <textarea
                        value={manualCourierForm.remarks}
                        onChange={(e) => setManualCourierForm(prev => ({ ...prev, remarks: e.target.value }))}
                        placeholder="Optional notes"
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={manualCourierForm.isActive}
                          onChange={(e) => setManualCourierForm(prev => ({ ...prev, isActive: e.target.checked }))}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Active</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex space-x-3 mt-6">
                    <button
                      onClick={handleCloseManualCourierModal}
                      className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveManualCourier}
                      disabled={saving}
                      className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {saving ? 'Saving...' : editingManualCourier ? 'Update' : 'Create'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Shipment Packages Tab */}
        {activeTab === 'packages' && (
          <div className="space-y-4">
            {/* Header with Actions */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Shipment Packages</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Manage reusable shipment package templates with dimensions and volumetric weight calculation.
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={includeInactivePackages}
                    onChange={(e) => setIncludeInactivePackages(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Include Inactive</span>
                </label>
                <button
                  onClick={() => handleOpenPackageModal()}
                  className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Package</span>
                </button>
              </div>
            </div>

            {/* Packages Table */}
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading packages...</div>
            ) : packages.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No packages found. Create your first package to get started.</div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Package Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dimensions (L×B×H cm)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Volumetric Weight (kg)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Divisor</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {packages.map((pkg) => (
                      <tr key={pkg.packageId} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{pkg.packageName}</div>
                          <div className="text-xs text-gray-500">{pkg.packageId}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {pkg.lengthCm} × {pkg.breadthCm} × {pkg.heightCm}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {pkg.volumetricWeightKg?.toFixed(2) || 'N/A'} kg
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {pkg.volumetricDivisor}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {pkg.isActive ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              <XCircle className="h-3 w-3 mr-1" />
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleOpenPackageModal(pkg)}
                            className="text-blue-600 hover:text-blue-900 mr-4"
                          >
                            <Edit className="h-4 w-4 inline" />
                          </button>
                          <button
                            onClick={() => handleDeletePackage(pkg.packageId)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="h-4 w-4 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Package Modal */}
            {showPackageModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">
                    {editingPackage ? 'Edit Package' : 'Create Package'}
                  </h2>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Package Name *</label>
                      <input
                        type="text"
                        value={packageForm.packageName}
                        onChange={(e) => setPackageForm({ ...packageForm, packageName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g., Small Box, Medium Carton"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Length (cm) *</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={packageForm.lengthCm}
                          onChange={(e) => setPackageForm({ ...packageForm, lengthCm: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Breadth (cm) *</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={packageForm.breadthCm}
                          onChange={(e) => setPackageForm({ ...packageForm, breadthCm: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Height (cm) *</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={packageForm.heightCm}
                          onChange={(e) => setPackageForm({ ...packageForm, heightCm: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Volumetric Divisor</label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={packageForm.volumetricDivisor}
                        onChange={(e) => setPackageForm({ ...packageForm, volumetricDivisor: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">Default: 5000 (for India). Formula: (L × B × H) / Divisor</p>
                    </div>

                    {/* Live Preview */}
                    {packageForm.lengthCm && packageForm.breadthCm && packageForm.heightCm && (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <h3 className="text-sm font-semibold text-blue-900 mb-2">Volumetric Weight Preview</h3>
                        <div className="text-sm text-blue-700">
                          <p>
                            Dimensions: {packageForm.lengthCm} × {packageForm.breadthCm} × {packageForm.heightCm} cm
                          </p>
                          <p className="mt-1">
                            Volumetric Weight: {(
                              (parseFloat(packageForm.lengthCm || '0') * 
                               parseFloat(packageForm.breadthCm || '0') * 
                               parseFloat(packageForm.heightCm || '0')) / 
                              parseFloat(packageForm.volumetricDivisor || '5000')
                            ).toFixed(2)} kg
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="packageActive"
                        checked={packageForm.isActive}
                        onChange={(e) => setPackageForm({ ...packageForm, isActive: e.target.checked })}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="packageActive" className="ml-2 text-sm text-gray-700">
                        Active (package will be available for selection)
                      </label>
                    </div>
                  </div>

                  <div className="flex space-x-3 mt-6">
                    <button
                      onClick={handleClosePackageModal}
                      className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSavePackage}
                      disabled={saving || !packageForm.packageName || !packageForm.lengthCm || !packageForm.breadthCm || !packageForm.heightCm}
                      className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {saving ? 'Saving...' : editingPackage ? 'Update' : 'Create'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

