'use client'

import { useState, useEffect, Suspense } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { useRouter } from 'next/navigation'
import ClientSearchWrapper from './ClientSearchWrapper'
import {
  TestTube,
  CheckCircle,
  XCircle,
  Loader2,
  MapPin,
  DollarSign,
  Package,
  Activity,
  Truck,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react'

interface Provider {
  providerId: string
  providerRefId?: number
  providerCode: string
  providerName: string
  providerType: string
  isActive: boolean
  supportsShipmentCreate: boolean
  supportsTracking: boolean
  supportsServiceabilityCheck: boolean
  supportsCancellation: boolean
  supportsWebhooks: boolean
  apiBaseUrl: string
  supportedCouriers?: Array<{
    courierCode: string
    courierName: string
    serviceTypes?: string[]
    isActive: boolean
    source: 'API_SYNC' | 'MANUAL'
    lastSyncedAt?: string
  }>
}

interface TestResult {
  success: boolean
  testType: string
  result: any
  error?: string
}

function LogisticsTestScreen({ providerId }: { providerId: string | null }) {
  const router = useRouter()

  const [provider, setProvider] = useState<Provider | null>(null)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState<string | null>(null)

  // Test credentials (for providers that need them)
  const [testCredentials, setTestCredentials] = useState({
    email: '',
    password: '',
    apiKey: '',
    apiSecret: '',
  })

  // Test results
  const [healthResult, setHealthResult] = useState<TestResult | null>(null)
  const [serviceabilityResult, setServiceabilityResult] = useState<TestResult | null>(null)
  const [rateResult, setRateResult] = useState<TestResult | null>(null)
  const [trackingResult, setTrackingResult] = useState<TestResult | null>(null)
  const [couriersResult, setCouriersResult] = useState<TestResult | null>(null)

  // Test inputs
  const [serviceabilityInputs, setServiceabilityInputs] = useState({
    pincode: '',
    fromPincode: '', // Required - user must enter source pincode
    weight: 1.0,
    codAmount: 0,
    courierCode: '', // Selected courier code for filtering
  })

  const [rateInputs, setRateInputs] = useState({
    fromPincode: '400001',
    toPincode: '',
    weight: 1.0,
    codAmount: 0,
    length: '',
    width: '',
    height: '',
  })

  const [trackingInput, setTrackingInput] = useState({
    providerShipmentReference: '',
    courierCode: '', // Optional courier selection for better tracking
  })

  // Courier Management State
  const [couriers, setCouriers] = useState<Array<{
    courierCode: string
    courierName: string
    serviceTypes: string[]
    isActive: boolean
    source: 'API_SYNC' | 'MANUAL'
    lastSyncedAt?: string
    isNew?: boolean // Flag for newly fetched couriers
  }>>([])
  const [syncingCouriers, setSyncingCouriers] = useState(false)
  const [savingCouriers, setSavingCouriers] = useState(false)

  useEffect(() => {
    if (providerId) {
      loadProvider()
      
      // Check if credentials were passed from Edit Provider page
      const storedCredentials = sessionStorage.getItem('testCredentials')
      if (storedCredentials) {
        try {
          const credsData = JSON.parse(storedCredentials)
          // Only use if it's for this provider and recent (within 5 minutes)
          if (credsData.providerId === providerId && (Date.now() - credsData.timestamp) < 5 * 60 * 1000) {
            const creds = credsData.credentials
            
            // Map credentials based on authType
            if (creds.authType === 'BASIC') {
              setTestCredentials({
                email: creds.email || '',
                password: creds.password || '',
                apiKey: '',
                apiSecret: '',
              })
            } else if (creds.authType === 'API_KEY') {
              setTestCredentials({
                email: '',
                password: '',
                apiKey: creds.apiKey || '',
                apiSecret: creds.apiSecret || '',
              })
            } else if (creds.authType === 'TOKEN') {
              setTestCredentials({
                email: '',
                password: '',
                apiKey: creds.token || '',
                apiSecret: '',
              })
            } else if (creds.authType === 'OAUTH2') {
              setTestCredentials({
                email: '',
                password: '',
                apiKey: creds.clientId || '',
                apiSecret: creds.clientSecret || '',
              })
            }
            
            // Clear sessionStorage after reading
            sessionStorage.removeItem('testCredentials')
          }
        } catch (error) {
          console.error('Error parsing stored credentials:', error)
          sessionStorage.removeItem('testCredentials')
        }
      }
    }
  }, [providerId])

  const loadProvider = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/superadmin/shipping-providers?providerId=${providerId}`)
      if (!response.ok) throw new Error('Failed to load provider')
      const data = await response.json()
      setProvider(data)
      
      // Load existing couriers if available
      if (data.providerRefId && data.supportedCouriers) {
        setCouriers(data.supportedCouriers.map((c: any) => ({
          ...c,
          serviceTypes: c.serviceTypes || [],
        })))
      }
    } catch (error: any) {
      console.error('Error loading provider:', error)
      alert(`Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const fetchCouriers = async () => {
    if (!provider?.providerId) {
      alert('Provider ID is missing. Cannot fetch couriers.')
      return
    }

    try {
      setSyncingCouriers(true)
      const response = await fetch(`/api/superadmin/shipping-providers/${provider.providerId}/couriers/sync`)
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to fetch couriers')
      }

      // Merge with existing couriers
      const existingCourierCodes = new Set(couriers.map(c => c.courierCode.toUpperCase()))
      const fetchedCouriers = result.couriers.map((c: any) => {
        const isNew = !existingCourierCodes.has(c.courierCode.toUpperCase())
        return {
          ...c,
          serviceTypes: c.serviceTypes || [],
          isNew,
        }
      })

      // Merge: update existing, add new
      const mergedMap = new Map<string, any>()
      couriers.forEach(c => {
        mergedMap.set(c.courierCode.toUpperCase(), { ...c, isNew: false })
      })
      fetchedCouriers.forEach((c: any) => {
        const existing = mergedMap.get(c.courierCode.toUpperCase())
        if (existing) {
          // Update existing but preserve isActive if it was manually set
          mergedMap.set(c.courierCode.toUpperCase(), {
            ...c,
            isActive: existing.source === 'MANUAL' ? existing.isActive : c.isActive,
            source: existing.source === 'MANUAL' ? 'MANUAL' : 'API_SYNC',
          })
        } else {
          mergedMap.set(c.courierCode.toUpperCase(), c)
        }
      })

      setCouriers(Array.from(mergedMap.values()))
      alert(`✅ Fetched ${result.count} courier(s) from ${provider.providerName}`)
    } catch (error: any) {
      console.error('Error fetching couriers:', error)
      alert(`Error: ${error.message}`)
    } finally {
      setSyncingCouriers(false)
    }
  }

  const saveCouriers = async () => {
    if (!provider?.providerId) {
      alert('Provider ID is missing. Cannot save couriers.')
      return
    }

    try {
      setSavingCouriers(true)
      const response = await fetch(`/api/superadmin/shipping-providers/${provider.providerId}/couriers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couriers }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save couriers')
      }

      // Update local state to remove isNew flags
      setCouriers(couriers.map(c => ({ ...c, isNew: false })))
      
      // Reload provider to get updated data
      await loadProvider()
      
      alert(`✅ Saved ${result.count} courier(s) successfully`)
    } catch (error: any) {
      console.error('Error saving couriers:', error)
      alert(`Error: ${error.message}`)
    } finally {
      setSavingCouriers(false)
    }
  }

  const toggleCourierActive = (courierCode: string) => {
    setCouriers(couriers.map(c => 
      c.courierCode.toUpperCase() === courierCode.toUpperCase()
        ? { ...c, isActive: !c.isActive }
        : c
    ))
  }

  // Helper function to render cost summary
  const renderCostSummary = (availableCouriers: any[]) => {
    if (!availableCouriers || availableCouriers.length === 0) return null
    
    const couriersWithCost = availableCouriers.filter((c: any) => c.estimatedCost !== undefined && c.estimatedCost > 0)
    if (couriersWithCost.length === 0) return null
    
    const costs = couriersWithCost.map((c: any) => c.estimatedCost)
    const minCost = Math.min(...costs)
    const maxCost = Math.max(...costs)
    const avgCost = costs.reduce((a: number, b: number) => a + b, 0) / costs.length
    const currency = couriersWithCost[0]?.currency || 'INR'
    
    return (
      <div className="mt-2">
        <p className="font-medium text-gray-900">
          Shipping Cost Range: ₹{minCost.toFixed(2)} - ₹{maxCost.toFixed(2)} {currency}
          {couriersWithCost.length > 1 && (
            <span className="text-gray-600 text-sm ml-2">
              (Avg: ₹{avgCost.toFixed(2)})
            </span>
          )}
        </p>
      </div>
    )
  }

  const runTest = async (testType: string, testParams: any) => {
    if (!providerId) return

    try {
      setTesting(testType)
      const response = await fetch('/api/superadmin/provider-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId,
          testType,
          testParams: {
            ...testParams,
            // Include credentials if provided
            email: testCredentials.email || undefined,
            password: testCredentials.password || undefined,
            apiKey: testCredentials.apiKey || undefined,
            apiSecret: testCredentials.apiSecret || undefined,
          },
          executedBy: 'superadmin',
        }),
      })

      const result: TestResult = await response.json()

      // Store result based on test type
      switch (testType) {
        case 'HEALTH':
          setHealthResult(result)
          break
        case 'SERVICEABILITY':
          setServiceabilityResult(result)
          break
        case 'RATE':
          setRateResult(result)
          break
        case 'TRACKING':
          setTrackingResult(result)
          break
        case 'COURIERS':
          setCouriersResult(result)
          break
      }
    } catch (error: any) {
      console.error(`Error running ${testType} test:`, error)
      alert(`Error: ${error.message}`)
    } finally {
      setTesting(null)
    }
  }

  if (loading) {
    return (
      <DashboardLayout actorType="superadmin">
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </DashboardLayout>
    )
  }

  if (!provider) {
    return (
      <DashboardLayout actorType="superadmin">
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">Provider not found</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="superadmin">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="mb-4 flex items-center space-x-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Providers</span>
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center space-x-3">
                <TestTube className="h-8 w-8 text-purple-600" />
                <span>Provider Test & Diagnostics</span>
              </h1>
              <p className="mt-2 text-gray-600">
                Testing: <span className="font-semibold">{provider.providerName}</span> ({provider.providerCode})
              </p>
            </div>
          </div>
        </div>

        {/* SECTION 1: Provider Overview */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Provider Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Provider Name</label>
              <p className="text-sm text-gray-900 mt-1">{provider.providerName}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Provider Code</label>
              <p className="text-sm text-gray-900 mt-1">{provider.providerCode}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Provider Type</label>
              <p className="text-sm text-gray-900 mt-1">{provider.providerType.replace('_', ' ')}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Status</label>
              <p className="text-sm mt-1">
                {provider.isActive ? (
                  <span className="text-green-600 font-medium">Active</span>
                ) : (
                  <span className="text-gray-600 font-medium">Inactive</span>
                )}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <label className="text-sm font-medium text-gray-500">Supported Capabilities</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {provider.supportsShipmentCreate && (
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Shipment Creation</span>
              )}
              {provider.supportsTracking && (
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Tracking</span>
              )}
              {provider.supportsServiceabilityCheck && (
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Serviceability</span>
              )}
              {provider.supportsCancellation && (
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Cancellation</span>
              )}
              {provider.supportsWebhooks && (
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Webhooks</span>
              )}
            </div>
          </div>
        </div>

        {/* Test Credentials (if needed) */}
        {(provider.providerCode === 'SHIPROCKET' || provider.providerCode === 'SHIPROCKET_ICICI' || (provider as any).authType === 'TOKEN') && (
          <div className={`border rounded-lg p-4 mb-6 ${
            (testCredentials.email || testCredentials.apiKey) && (testCredentials.password || testCredentials.apiSecret)
              ? 'bg-green-50 border-green-200'
              : 'bg-yellow-50 border-yellow-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-sm font-semibold ${
                (testCredentials.email || testCredentials.apiKey) && (testCredentials.password || testCredentials.apiSecret)
                  ? 'text-green-900'
                  : 'text-yellow-900'
              }`}>
                Test Credentials
              </h3>
              {(testCredentials.email || testCredentials.apiKey) && (testCredentials.password || testCredentials.apiSecret) && (
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                  ✓ Credentials Loaded
                </span>
              )}
            </div>
            <p className={`text-sm mb-3 ${
              (testCredentials.email || testCredentials.apiKey) && (testCredentials.password || testCredentials.apiSecret)
                ? 'text-green-800'
                : 'text-yellow-800'
            }`}>
              {(testCredentials.email || testCredentials.apiKey) && (testCredentials.password || testCredentials.apiSecret)
                ? 'Credentials loaded from Edit Provider page. You can modify them below if needed.'
                : 'Some tests require authentication. Enter test credentials below or load them from the Edit Provider page.'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email / API Key</label>
                <input
                  type="text"
                  value={testCredentials.email || testCredentials.apiKey}
                  onChange={(e) =>
                    setTestCredentials({
                      ...testCredentials,
                      email: e.target.value,
                      apiKey: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="Enter email or API key"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password / API Secret</label>
                <input
                  type="password"
                  value={testCredentials.password || testCredentials.apiSecret}
                  onChange={(e) =>
                    setTestCredentials({
                      ...testCredentials,
                      password: e.target.value,
                      apiSecret: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="Enter password or API secret"
                />
              </div>
            </div>
          </div>
        )}

        {/* SECTION 6: API Health Check */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center space-x-2">
              <Activity className="h-5 w-5 text-blue-600" />
              <span>API Health Check</span>
            </h2>
            <button
              onClick={() => runTest('HEALTH', {})}
              disabled={testing === 'HEALTH'}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
            >
              {testing === 'HEALTH' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span>Run Health Check</span>
            </button>
          </div>
          {healthResult && (
            <div className={`mt-4 p-4 rounded-md ${healthResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="flex items-center space-x-2 mb-2">
                {healthResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <span className={`font-semibold ${healthResult.success ? 'text-green-800' : 'text-red-800'}`}>
                  {healthResult.success ? 'API is Reachable' : 'API Unreachable'}
                </span>
              </div>
              {healthResult.result && (
                <div className="text-sm text-gray-700 space-y-1">
                  {healthResult.result.message && <p>Message: {healthResult.result.message}</p>}
                  {healthResult.result.responseTime && <p>Response Time: {healthResult.result.responseTime}ms</p>}
                  {healthResult.error && <p className="text-red-600">Error: {healthResult.error}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* SECTION 2: Courier Management */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center space-x-2">
              <Truck className="h-5 w-5 text-purple-600" />
              <span>Courier Management</span>
            </h2>
            <div className="flex items-center space-x-2">
              <button
                onClick={fetchCouriers}
                disabled={syncingCouriers || !provider?.providerId}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {syncingCouriers ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span>Fetch Available Couriers</span>
              </button>
              {couriers.length > 0 && (
                <button
                  onClick={saveCouriers}
                  disabled={savingCouriers}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center space-x-2"
                >
                  {savingCouriers ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  <span>Save Changes</span>
                </button>
              )}
            </div>
          </div>

          {couriers.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Courier Code
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Courier Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Service Types
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Active
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Synced
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {couriers.map((courier, idx) => (
                    <tr key={idx} className={courier.isNew ? 'bg-yellow-50' : ''}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-900">{courier.courierCode}</span>
                          {courier.isNew && (
                            <span className="px-2 py-0.5 text-xs bg-yellow-200 text-yellow-800 rounded">New</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-900">{courier.courierName}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {courier.serviceTypes && courier.serviceTypes.length > 0 ? (
                            courier.serviceTypes.map((type, tIdx) => (
                              <span key={tIdx} className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                                {type}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-400">N/A</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleCourierActive(courier.courierCode)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            courier.isActive ? 'bg-green-600' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              courier.isActive ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded ${
                          courier.source === 'API_SYNC'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {courier.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {courier.lastSyncedAt
                          ? new Date(courier.lastSyncedAt).toLocaleString()
                          : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 text-sm text-gray-600">
                <p>Total: {couriers.length} courier(s) | Active: {couriers.filter(c => c.isActive).length} | Inactive: {couriers.filter(c => !c.isActive).length}</p>
              </div>
            </div>
          )}
          {couriers.length === 0 && (
            <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-md">
              <p className="text-sm text-gray-600">
                No couriers configured. Click "Fetch Available Couriers" to sync couriers from {provider?.providerName || 'the provider'}.
              </p>
            </div>
          )}
        </div>

        {/* SECTION 3: Serviceability Test */}
        {provider.supportsServiceabilityCheck && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center space-x-2">
                <MapPin className="h-5 w-5 text-green-600" />
                <span>Serviceability Test (Pincode)</span>
              </h2>
            </div>
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>Tip:</strong> Load couriers first to see available options. You can test serviceability for all couriers or filter by a specific courier.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Source Pincode <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={serviceabilityInputs.fromPincode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 6) // Only allow digits, max 6
                    setServiceabilityInputs({ ...serviceabilityInputs, fromPincode: value })
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="400001"
                  required
                  maxLength={6}
                />
                {serviceabilityInputs.fromPincode && serviceabilityInputs.fromPincode.length !== 6 && (
                  <p className="text-xs text-red-600 mt-1">Pincode must be 6 digits</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Destination Pincode *</label>
                <input
                  type="text"
                  value={serviceabilityInputs.pincode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 6) // Only allow digits, max 6
                    setServiceabilityInputs({ ...serviceabilityInputs, pincode: value })
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder="400070"
                  required
                  maxLength={6}
                />
                {serviceabilityInputs.pincode && serviceabilityInputs.pincode.length !== 6 && (
                  <p className="text-xs text-red-600 mt-1">Pincode must be 6 digits</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={serviceabilityInputs.weight}
                  onChange={(e) =>
                    setServiceabilityInputs({ ...serviceabilityInputs, weight: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">COD Amount</label>
                <input
                  type="number"
                  value={serviceabilityInputs.codAmount}
                  onChange={(e) =>
                    setServiceabilityInputs({ ...serviceabilityInputs, codAmount: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Filter by Courier (Optional)
                </label>
                <select
                  value={serviceabilityInputs.courierCode}
                  onChange={(e) =>
                    setServiceabilityInputs({ ...serviceabilityInputs, courierCode: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">All Couriers</option>
                  {couriers.filter(c => c.isActive).map((courier, idx) => (
                    <option key={idx} value={courier.courierCode}>
                      {courier.courierName} ({courier.courierCode})
                    </option>
                  ))}
                </select>
                {couriers.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">Fetch couriers first to see options</p>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                // Validate pincodes before running test
                const fromPincode = serviceabilityInputs.fromPincode?.trim() || ''
                const toPincode = serviceabilityInputs.pincode?.trim() || ''
                
                if (!fromPincode || fromPincode.length !== 6 || !/^\d{6}$/.test(fromPincode)) {
                  alert('Please enter a valid 6-digit source pincode')
                  return
                }
                if (!toPincode || toPincode.length !== 6 || !/^\d{6}$/.test(toPincode)) {
                  alert('Please enter a valid 6-digit destination pincode')
                  return
                }
                if (fromPincode === toPincode) {
                  alert('Source and destination pincodes must be different')
                  return
                }
                
                // Ensure we send clean, validated pincodes
                const cleanParams = {
                  ...serviceabilityInputs,
                  fromPincode: fromPincode,
                  pincode: toPincode,
                }
                
                // Validate courierCode if provided
                if (cleanParams.courierCode) {
                  // First, check if the courierCode exists in the couriers list (case-insensitive)
                  const selectedCourier = couriers.find(c => 
                    c.courierCode === cleanParams.courierCode || 
                    c.courierCode.toLowerCase() === cleanParams.courierCode.toLowerCase()
                  )
                  
                  if (selectedCourier) {
                    // Valid courier found - use the exact courierCode from the list (normalize case)
                    cleanParams.courierCode = selectedCourier.courierCode
                    console.log(`[Serviceability] Valid courier selected:`, {
                      courierCode: cleanParams.courierCode,
                      courierName: selectedCourier.courierName
                    })
                  } else {
                    // Courier not found in list - might be an index bug or a valid provider code not in local list
                    // Only treat as index if it's a very small number (single digit) AND couriers list has items
                    // This is a rare edge case - most numeric codes are valid courier IDs
                    if (/^\d{1}$/.test(cleanParams.courierCode) && couriers.length > 0) {
                      console.warn(`[Serviceability] Warning: courierCode "${cleanParams.courierCode}" not found. Checking if it's an array index...`)
                      const index = parseInt(cleanParams.courierCode, 10)
                      const courierByIndex = couriers[index]
                      
                      if (courierByIndex) {
                        console.log(`[Serviceability] Found courier by index ${index}, using actual courierCode: "${courierByIndex.courierCode}"`)
                        cleanParams.courierCode = courierByIndex.courierCode
                      } else {
                        // Not found by index - allow it to proceed (likely a valid numeric courier code)
                        console.log(`[Serviceability] courierCode "${cleanParams.courierCode}" not found in local list, allowing to proceed (may be valid provider code)`)
                      }
                    } else {
                      // Not a single-digit number - likely a valid courier code (numeric or alphanumeric)
                      // Allow it to proceed - the provider will handle validation
                      console.log(`[Serviceability] courierCode "${cleanParams.courierCode}" not in local list, allowing to proceed (may be valid provider code)`)
                    }
                  }
                  
                  // Log the final courierCode being sent for debugging
                  console.log(`[Serviceability] Final courierCode being sent: "${cleanParams.courierCode}"`)
                }
                
                console.log('Running serviceability check with:', {
                  fromPincode: cleanParams.fromPincode,
                  toPincode: cleanParams.pincode,
                  weight: cleanParams.weight,
                  codAmount: cleanParams.codAmount,
                  courierCode: cleanParams.courierCode || '(all couriers)'
                })
                runTest('SERVICEABILITY', cleanParams)
              }}
              disabled={
                testing === 'SERVICEABILITY' || 
                !serviceabilityInputs.pincode || 
                serviceabilityInputs.pincode.length !== 6 ||
                !serviceabilityInputs.fromPincode || 
                serviceabilityInputs.fromPincode.length !== 6
              }
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center space-x-2"
            >
              {testing === 'SERVICEABILITY' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4" />
              )}
              <span>
                {serviceabilityInputs.courierCode 
                  ? `Check Serviceability (${serviceabilityInputs.courierCode})`
                  : 'Check Serviceability'}
              </span>
            </button>
            {serviceabilityResult && (
              <div className={`mt-4 p-4 rounded-md ${serviceabilityResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className="flex items-center space-x-2 mb-3">
                  {serviceabilityResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <span className={`font-semibold ${serviceabilityResult.success ? 'text-green-800' : 'text-red-800'}`}>
                    {serviceabilityResult.result?.serviceable ? 'Serviceable' : 'Not Serviceable'}
                  </span>
                </div>
                {serviceabilityResult.result && (
                  <div className="text-sm text-gray-700 space-y-2">
                    <div className="font-medium text-gray-900 mb-2">
                      Route: {serviceabilityInputs.fromPincode} → {serviceabilityInputs.pincode}
                    </div>
                    {serviceabilityResult.result.message && (
                      <p className="font-medium">{serviceabilityResult.result.message}</p>
                    )}
                    {serviceabilityInputs.courierCode && !serviceabilityResult.result?.serviceable && (
                      <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                        <strong>Tip:</strong> If this courier appears in the unfiltered results, this may indicate a courier identifier mismatch. 
                        Try checking without a courier filter first to verify the courier is serviceable.
                      </div>
                    )}
                    {serviceabilityResult.result.estimatedDays && (
                      <p>Estimated Delivery: {serviceabilityResult.result.estimatedDays} days</p>
                    )}
                    {serviceabilityResult.result.availableCouriers && renderCostSummary(serviceabilityResult.result.availableCouriers)}
                    {serviceabilityResult.result.availableCouriers && serviceabilityResult.result.availableCouriers.length > 0 && (
                      <div className="mt-3">
                        <p className="font-semibold text-gray-900 mb-2">
                          Available Couriers ({serviceabilityResult.result.availableCouriers.length}):
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                          {serviceabilityResult.result.availableCouriers.map((courier: any, idx: number) => (
                            <div key={idx} className="border border-gray-200 rounded-md p-2 bg-white hover:shadow-md transition-shadow">
                              <div className="font-medium text-sm text-gray-900">{courier.courierName}</div>
                              <div className="text-xs text-gray-500 mt-1">
                                Code: {courier.courierCode}
                              </div>
                              {courier.estimatedCost !== undefined && courier.estimatedCost > 0 && (
                                <div className="text-sm font-semibold text-green-600 mt-1">
                                  ₹{courier.estimatedCost.toFixed(2)} {courier.currency || 'INR'}
                                </div>
                              )}
                              {courier.estimatedDays && (
                                <div className="text-xs text-blue-600 mt-1">
                                  Est. Delivery: {courier.estimatedDays} days
                                </div>
                              )}
                              {courier.serviceTypes && courier.serviceTypes.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {courier.serviceTypes.map((type: string, tIdx: number) => (
                                    <span key={tIdx} className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                                      {type}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {serviceabilityResult.error && (
                      <p className="text-red-600 mt-2">Error: {serviceabilityResult.error}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* SECTION 4: Rate / Cost Estimation */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-yellow-600" />
              <span>Rate / Cost Estimation</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source Pincode</label>
              <input
                type="text"
                value={rateInputs.fromPincode}
                onChange={(e) => setRateInputs({ ...rateInputs, fromPincode: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="400001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Destination Pincode</label>
              <input
                type="text"
                value={rateInputs.toPincode}
                onChange={(e) => setRateInputs({ ...rateInputs, toPincode: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="400070"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg)</label>
              <input
                type="number"
                step="0.1"
                value={rateInputs.weight}
                onChange={(e) => setRateInputs({ ...rateInputs, weight: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">COD Amount</label>
              <input
                type="number"
                value={rateInputs.codAmount}
                onChange={(e) => setRateInputs({ ...rateInputs, codAmount: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
          </div>
          <button
            onClick={() =>
              runTest('RATE', {
                ...rateInputs,
                dimensions: rateInputs.length && rateInputs.width && rateInputs.height
                  ? {
                      length: parseFloat(rateInputs.length),
                      width: parseFloat(rateInputs.width),
                      height: parseFloat(rateInputs.height),
                    }
                  : undefined,
              })
            }
            disabled={testing === 'RATE' || !rateInputs.fromPincode || !rateInputs.toPincode || !rateInputs.weight}
            className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 flex items-center space-x-2"
          >
            {testing === 'RATE' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <DollarSign className="h-4 w-4" />
            )}
            <span>Get Shipping Cost</span>
          </button>
          {rateResult && (
            <div className={`mt-4 p-4 rounded-md ${rateResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
              {rateResult.success && rateResult.result?.rates ? (
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-3">
                    Found {rateResult.result.rates.length} rate option(s)
                  </p>
                  <div className="space-y-2">
                    {rateResult.result.rates.slice(0, 10).map((rate: any, idx: number) => (
                      <div key={idx} className="border border-gray-200 rounded-md p-3 bg-white">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-sm text-gray-900">{rate.courierName}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              {rate.serviceType} • {rate.estimatedDeliveryDays} days
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-gray-900">
                              ₹{rate.estimatedCost.toFixed(2)}
                            </div>
                            <div className="text-xs text-gray-500">{rate.currency || 'INR'}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-red-800">
                  {rateResult.error || 'Rate estimation not supported by this provider'}
                </p>
              )}
            </div>
          )}
        </div>

        {/* SECTION 5: Shipment Status Validation */}
        {provider.supportsTracking && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center space-x-2">
                <Package className="h-5 w-5 text-indigo-600" />
                <span>Shipment Status Validation (Test Mode)</span>
              </h2>
            </div>
            <div className="mb-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Courier Name <span className="text-gray-500 text-xs">(Optional)</span>
                </label>
                <select
                  value={trackingInput.courierCode}
                  onChange={(e) =>
                    setTrackingInput({ ...trackingInput, courierCode: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">Select Courier (Optional)</option>
                  {couriers.filter(c => c.isActive).map((courier, idx) => (
                    <option key={idx} value={courier.courierCode}>
                      {courier.courierName} ({courier.courierCode})
                    </option>
                  ))}
                </select>
                {couriers.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">Fetch couriers first to see options</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Docket Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={trackingInput.providerShipmentReference}
                  onChange={(e) =>
                    setTrackingInput({ ...trackingInput, providerShipmentReference: e.target.value.trim() })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-2"
                  placeholder="Enter AWB, tracking number, or docket number"
                  required
                />
                <p className="text-xs text-gray-500">
                  Enter a docket number or tracking reference to check shipment status
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                if (!trackingInput.providerShipmentReference || !trackingInput.providerShipmentReference.trim()) {
                  alert('Please enter a docket number')
                  return
                }
                runTest('TRACKING', trackingInput)
              }}
              disabled={testing === 'TRACKING' || !trackingInput.providerShipmentReference || !trackingInput.providerShipmentReference.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center space-x-2"
            >
              {testing === 'TRACKING' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Package className="h-4 w-4" />
              )}
              <span>Check Shipment Status</span>
            </button>
            {trackingResult && (
              <div className={`mt-4 p-4 rounded-md ${trackingResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
                {trackingResult.success && trackingResult.result ? (
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      {trackingResult.result.status === 'DELIVERED' ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : trackingResult.result.status === 'IN_TRANSIT' ? (
                        <Package className="h-5 w-5 text-blue-600" />
                      ) : trackingResult.result.status === 'FAILED' ? (
                        <XCircle className="h-5 w-5 text-red-600" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-yellow-600" />
                      )}
                      <div>
                        <span className="text-sm font-semibold text-gray-700">Status: </span>
                        <span className={`text-sm font-medium ${
                          trackingResult.result.status === 'DELIVERED' ? 'text-green-800' :
                          trackingResult.result.status === 'IN_TRANSIT' ? 'text-blue-800' :
                          trackingResult.result.status === 'FAILED' ? 'text-red-800' :
                          'text-gray-800'
                        }`}>
                          {trackingResult.result.status}
                        </span>
                      </div>
                    </div>
                    {trackingInput.courierCode && (
                      <div>
                        <span className="text-sm font-semibold text-gray-700">Courier: </span>
                        <span className="text-sm text-gray-900">
                          {couriers.find(c => c.courierCode === trackingInput.courierCode)?.courierName || trackingInput.courierCode}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-sm font-semibold text-gray-700">Docket Number: </span>
                      <span className="text-sm text-gray-900">{trackingInput.providerShipmentReference}</span>
                    </div>
                    {trackingResult.result.trackingNumber && (
                      <div>
                        <span className="text-sm font-semibold text-gray-700">Tracking Number: </span>
                        <span className="text-sm text-gray-900">{trackingResult.result.trackingNumber}</span>
                      </div>
                    )}
                    {trackingResult.result.currentLocation && (
                      <div>
                        <span className="text-sm font-semibold text-gray-700">Current Location: </span>
                        <span className="text-sm text-gray-900">{trackingResult.result.currentLocation}</span>
                      </div>
                    )}
                    {trackingResult.result.estimatedDeliveryDate && (
                      <div>
                        <span className="text-sm font-semibold text-gray-700">Estimated Delivery: </span>
                        <span className="text-sm text-gray-900">
                          {new Date(trackingResult.result.estimatedDeliveryDate).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {trackingResult.result.deliveredDate && (
                      <div>
                        <span className="text-sm font-semibold text-gray-700">Delivered Date: </span>
                        <span className="text-sm text-gray-900">
                          {new Date(trackingResult.result.deliveredDate).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {trackingResult.result.trackingUrl && (
                      <div>
                        <a
                          href={trackingResult.result.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline flex items-center space-x-1"
                        >
                          <span>View Tracking Details</span>
                          <Package className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <XCircle className="h-5 w-5 text-red-600" />
                      <span className="text-sm font-semibold text-red-800">Status Check Failed</span>
                    </div>
                    <p className="text-sm text-red-700">
                      {trackingResult.error || 'Failed to fetch shipment status'}
                    </p>
                    {trackingResult.error && (
                      <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                        <strong>Tip:</strong> Verify that:
                        <ul className="list-disc list-inside mt-1 space-y-1">
                          <li>The docket number is correct and matches the provider format</li>
                          <li>The shipment exists in the provider system</li>
                          <li>The provider API is accessible and authenticated</li>
                          {trackingInput.courierCode && (
                            <li>The courier selection matches the shipment's courier</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

export default function Page() {
  return (
    <Suspense fallback={
      <DashboardLayout actorType="superadmin">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-gray-600">Loading...</div>
        </div>
      </DashboardLayout>
    }>
      <ClientSearchWrapper>
        {providerId => <LogisticsTestScreen providerId={providerId} />}
      </ClientSearchWrapper>
    </Suspense>
  )
}

