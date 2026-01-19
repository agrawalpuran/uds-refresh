'use client'

import { useState, useEffect } from 'react'
import { Package, Plus, Edit, Trash2, CheckCircle, XCircle, Loader2, Search } from 'lucide-react'

interface Vendor {
  id: string
  name: string
  email: string
}

interface Company {
  id: string
  name: string
}

interface Provider {
  providerId: string
  providerRefId: number
  providerCode: string
  providerName: string
  isActive: boolean
}

interface Routing {
  routingId: string
  vendorId: string
  companyId: string
  shipmentServiceProviderRefId: number
  primaryCourierCode: string
  secondaryCourierCode?: string
  isActive: boolean
  provider?: Provider
}

interface VendorRoutingTabProps {
  onLoadingChange?: (loading: boolean) => void
}

export default function VendorRoutingTab({ onLoadingChange }: VendorRoutingTabProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [routings, setRoutings] = useState<Routing[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProviderCouriers, setSelectedProviderCouriers] = useState<Array<{courierCode: string, courierName: string}>>([])
  const [courierNameMap, setCourierNameMap] = useState<Map<string, string>>(new Map())
  const [showModal, setShowModal] = useState(false)
  const [editingRouting, setEditingRouting] = useState<Routing | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const [routingForm, setRoutingForm] = useState({
    routingId: '', // Store routingId in form state as backup
    vendorId: '',
    companyId: '',
    shipmentServiceProviderRefId: 0,
    primaryCourierCode: '',
    secondaryCourierCode: '',
    isActive: true,
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      onLoadingChange?.(true)

      // Load vendors
      const vendorsRes = await fetch('/api/vendors')
      if (vendorsRes.ok) {
        const vendorsData = await vendorsRes.json()
        setVendors(Array.isArray(vendorsData) ? vendorsData : [vendorsData])
      }

      // Load companies
      const companiesRes = await fetch('/api/companies')
      if (companiesRes.ok) {
        const companiesData = await companiesRes.json()
        const companiesList = Array.isArray(companiesData) ? companiesData : [companiesData]
        setCompanies(companiesList)
        console.log(`[VendorRoutingTab] Loaded ${companiesList.length} companies`)
      } else {
        console.error('[VendorRoutingTab] Failed to load companies:', companiesRes.status)
      }

      // Load providers (only active ones with providerRefId)
      const providersRes = await fetch('/api/superadmin/shipping-providers?includeInactive=false')
      if (providersRes.ok) {
        const providersData = await providersRes.json()
        const activeProviders = providersData.filter((p: any) => p.isActive && p.providerRefId)
        setProviders(activeProviders)
      }

      // Load routings
      await loadRoutings()
    } catch (error: any) {
      console.error('Error loading data:', error)
      alert(`Error: ${error.message}`)
    } finally {
      setLoading(false)
      onLoadingChange?.(false)
    }
  }

  const loadRoutings = async () => {
    try {
      const res = await fetch('/api/superadmin/vendor-shipping-routing')
      if (res.ok) {
        const data = await res.json()
        setRoutings(data.routings || [])
        
        // Load courier names for all unique providers
        const providerRefIds = (data.routings || []).map((r: Routing) => r.shipmentServiceProviderRefId).filter((id: number | undefined): id is number => typeof id === 'number' && id > 0)
        const uniqueProviderRefIds = Array.from(new Set(providerRefIds)) as number[]
        await loadCourierNamesForProviders(uniqueProviderRefIds, providers)
      }
    } catch (error: any) {
      console.error('Error loading routings:', error)
    }
  }

  const loadCourierNamesForProviders = async (providerRefIds: number[], providersList: Provider[]) => {
    const courierUpdates = new Map<string, string>()
    
    for (const providerRefId of providerRefIds) {
      try {
        const provider = providersList.find(p => p.providerRefId === providerRefId)
        if (!provider) continue

        const actualProviderId = provider.providerId || provider.providerCode
        if (!actualProviderId) continue

        const res = await fetch('/api/superadmin/provider-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: actualProviderId,
            testType: 'COURIERS',
            testParams: {},
          }),
        })

        if (res.ok) {
          const data = await res.json()
          if (data.success && data.result?.couriers) {
            data.result.couriers.forEach((c: any) => {
              const code = (c.courierCode || c.courierName || '').toUpperCase()
              const name = c.courierName || c.courierCode || 'Unknown'
              if (code) {
                courierUpdates.set(code, name)
              }
            })
          }
        }
      } catch (error) {
        console.error(`Error loading couriers for provider ${providerRefId}:`, error)
      }
    }
    
    // Update state with functional update to avoid stale closure
    if (courierUpdates.size > 0) {
      setCourierNameMap((prevMap) => {
        const newMap = new Map(prevMap)
        courierUpdates.forEach((name, code) => {
          newMap.set(code, name)
        })
        return newMap
      })
    }
  }

  const loadProviderCouriers = async (providerRefId: number) => {
    try {
      // Get provider details to find couriers
      const provider = providers.find(p => p.providerRefId === providerRefId)
      if (!provider) return

      // Use providerId from the provider object (should be loaded with providers)
      const actualProviderId = provider.providerId || provider.providerCode
      if (!actualProviderId) {
        console.warn('Provider missing providerId, cannot load couriers')
        return
      }

      // Call provider test API to get supported couriers
      const res = await fetch('/api/superadmin/provider-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: actualProviderId,
          testType: 'COURIERS',
          testParams: {},
        }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.success && data.result?.couriers) {
          const courierObjects = data.result.couriers.map((c: any) => ({
            courierCode: c.courierCode || c.courierName,
            courierName: c.courierName || c.courierCode || 'Unknown'
          }))
          setSelectedProviderCouriers(courierObjects)
          
          // Update courier name map for table display
          setCourierNameMap((prevMap) => {
            const newMap = new Map(prevMap)
            courierObjects.forEach((c: {courierCode: string, courierName: string}) => {
              newMap.set(c.courierCode.toUpperCase(), c.courierName)
            })
            return newMap
          })
        } else {
          setSelectedProviderCouriers([])
        }
      } else {
        setSelectedProviderCouriers([])
      }
    } catch (error) {
      console.error('Error loading couriers:', error)
      setSelectedProviderCouriers([])
    }
  }

  const handleOpenModal = (routing?: Routing) => {
    if (routing) {
      if (!routing.routingId) {
        console.error('[handleOpenModal] Routing missing routingId:', routing)
        alert('Error: Routing ID is missing. Please refresh the page and try again.')
        return
      }
      console.log('[handleOpenModal] Opening edit modal for routing:', routing.routingId)
      setEditingRouting(routing)
      setRoutingForm({
        routingId: routing.routingId, // Store routingId in form state
        vendorId: routing.vendorId,
        companyId: routing.companyId,
        shipmentServiceProviderRefId: routing.shipmentServiceProviderRefId,
        primaryCourierCode: routing.primaryCourierCode,
        secondaryCourierCode: routing.secondaryCourierCode || '',
        isActive: routing.isActive,
      })
      loadProviderCouriers(routing.shipmentServiceProviderRefId)
    } else {
      setEditingRouting(null)
      // Set default companyId if companies are available
      const defaultCompanyId = companies.length > 0 ? companies[0].id : ''
      setRoutingForm({
        routingId: '', // Clear routingId for new routing
        vendorId: '',
        companyId: defaultCompanyId,
        shipmentServiceProviderRefId: 0,
        primaryCourierCode: '',
        secondaryCourierCode: '',
        isActive: true,
      })
      setSelectedProviderCouriers([])
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingRouting(null)
    setRoutingForm({
      routingId: '',
      vendorId: '',
      companyId: '',
      shipmentServiceProviderRefId: 0,
      primaryCourierCode: '',
      secondaryCourierCode: '',
      isActive: true,
    })
    setSelectedProviderCouriers([])
  }

  const handleProviderChange = (providerRefId: number) => {
    setRoutingForm({
      ...routingForm,
      shipmentServiceProviderRefId: providerRefId,
      primaryCourierCode: '',
      secondaryCourierCode: '',
    })
    if (providerRefId) {
      loadProviderCouriers(providerRefId)
    } else {
      setSelectedProviderCouriers([])
    }
  }

  const handleSave = async () => {
    if (!routingForm.vendorId) {
      alert('Please select a vendor')
      return
    }
    if (companies.length === 0) {
      alert('Companies are not loaded. Please refresh the page and try again.')
      return
    }
    if (!routingForm.companyId) {
      alert('Please select a company from the dropdown')
      return
    }
    if (!routingForm.shipmentServiceProviderRefId || routingForm.shipmentServiceProviderRefId === 0) {
      alert('Please select a shipping aggregator')
      return
    }
    if (!routingForm.primaryCourierCode) {
      alert('Please select a primary courier')
      return
    }

    try {
      setSaving(true)

      if (editingRouting || routingForm.routingId) {
        // Update - validate routingId exists
        // Try to get routingId from editingRouting first, then from form state as fallback
        const routingIdFromState = editingRouting?.routingId || routingForm.routingId
        
        console.log('[handleSave] Editing routing state:', {
          editingRouting,
          routingIdFromState,
          formRoutingId: routingForm.routingId,
          hasEditingRouting: !!editingRouting,
          hasRoutingId: !!routingIdFromState,
        })
        
        if (!routingIdFromState) {
          console.error('[handleSave] Routing ID missing from both editingRouting and form state:', {
            editingRouting,
            formRoutingId: routingForm.routingId,
          })
          alert('Error: Routing ID is missing. Please close the modal, refresh the page, and try again.')
          setSaving(false)
          return
        }
        
        // Ensure routingId is a valid string
        const routingId = String(routingIdFromState).trim()
        if (!routingId || routingId === 'undefined' || routingId === 'null' || routingId === '') {
          console.error('[handleSave] Invalid routingId value:', routingId)
          alert('Error: Invalid Routing ID. Please close the modal, refresh the page, and try again.')
          setSaving(false)
          return
        }
        
        const updateUrl = `/api/superadmin/vendor-shipping-routing/${routingId}`
        console.log('[handleSave] Updating routing:', {
          url: updateUrl,
          routingId,
          primaryCourierCode: routingForm.primaryCourierCode,
          secondaryCourierCode: routingForm.secondaryCourierCode || undefined,
          isActive: routingForm.isActive,
        })
        
        const res = await fetch(updateUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            primaryCourierCode: routingForm.primaryCourierCode,
            secondaryCourierCode: routingForm.secondaryCourierCode || undefined,
            isActive: routingForm.isActive,
          }),
        })

        if (!res.ok) {
          const error = await res.json()
          console.error('[handleSave] API error response:', error)
          throw new Error(error.error || 'Failed to update routing')
        }
      } else {
        // Create
        const requestBody = {
          vendorId: routingForm.vendorId,
          companyId: routingForm.companyId,
          shipmentServiceProviderRefId: routingForm.shipmentServiceProviderRefId,
          primaryCourierCode: routingForm.primaryCourierCode,
          secondaryCourierCode: routingForm.secondaryCourierCode || undefined,
          isActive: routingForm.isActive,
        }
        
        console.log('Creating vendor shipping routing with data:', requestBody)
        
        const res = await fetch('/api/superadmin/vendor-shipping-routing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })

        if (!res.ok) {
          const error = await res.json()
          console.error('Error response:', error)
          throw new Error(error.error || 'Failed to create routing')
        }
      }

      await loadRoutings()
      alert(editingRouting ? 'Routing updated successfully!' : 'Routing created successfully!')
      handleCloseModal()
    } catch (error: any) {
      console.error('Error saving routing:', error)
      alert(`Error: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (routingId: string) => {
    if (!confirm('Are you sure you want to delete this routing?')) return

    try {
      const res = await fetch(`/api/superadmin/vendor-shipping-routing/${routingId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete routing')
      }

      await loadRoutings()
    } catch (error: any) {
      console.error('Error deleting routing:', error)
      alert(`Error: ${error.message}`)
    }
  }

  const filteredRoutings = routings.filter((r) => {
    if (!searchTerm) return true
    const vendor = vendors.find((v) => v.id === r.vendorId)
    const searchLower = searchTerm.toLowerCase()
    return (
      vendor?.name.toLowerCase().includes(searchLower) ||
      vendor?.id.includes(searchTerm) ||
      r.primaryCourierCode.toLowerCase().includes(searchLower) ||
      r.provider?.providerName.toLowerCase().includes(searchLower)
    )
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Vendor Shipping Mapping</h2>
          <p className="text-sm text-gray-600 mt-1">
            Configure shipping aggregator and courier preferences for vendors
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Add Mapping</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by vendor name, ID, or courier..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Routings List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {filteredRoutings.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No vendor shipping routings found</p>
            <p className="text-sm text-gray-500 mt-2">Click "Add Mapping" to create one</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vendor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Provider
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Primary Courier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Secondary Courier
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
                {filteredRoutings.map((routing) => {
                  const vendor = vendors.find((v) => v.id === routing.vendorId)
                  return (
                    <tr key={routing.routingId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{vendor?.name || routing.vendorId}</div>
                        <div className="text-sm text-gray-500">ID: {routing.vendorId}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{routing.provider?.providerName || 'N/A'}</div>
                        <div className="text-sm text-gray-500">{routing.provider?.providerCode}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 font-medium">
                          {courierNameMap.get(routing.primaryCourierCode.toUpperCase()) || routing.primaryCourierCode}
                        </div>
                        <div className="text-xs text-gray-500">{routing.primaryCourierCode}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {routing.secondaryCourierCode ? (
                          <>
                            <div className="text-sm text-gray-500">
                              {courierNameMap.get(routing.secondaryCourierCode.toUpperCase()) || routing.secondaryCourierCode}
                            </div>
                            <div className="text-xs text-gray-400">{routing.secondaryCourierCode}</div>
                          </>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {routing.isActive ? (
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
                          onClick={() => handleOpenModal(routing)}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(routing.routingId)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {editingRouting ? 'Edit Vendor Shipping Routing' : 'Add Vendor Shipping Routing'}
              </h3>

              <div className="space-y-4">
                {/* Vendor */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vendor <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={routingForm.vendorId}
                    onChange={(e) => {
                      const vendorId = e.target.value
                      // Try to get companyId from existing routings for this vendor
                      const existingRouting = routings.find((r) => r.vendorId === vendorId && r.isActive)
                      let companyId = existingRouting?.companyId || routingForm.companyId
                      
                      // If no existing routing and no current companyId, use first company as default
                      if (!companyId && companies.length > 0) {
                        companyId = companies[0].id
                      }
                      
                      setRoutingForm({
                        ...routingForm,
                        vendorId: vendorId,
                        companyId: companyId,
                      })
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    required
                    disabled={!!editingRouting}
                  >
                    <option value="">Select Vendor</option>
                    {vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name} ({vendor.id})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Company */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={routingForm.companyId}
                    onChange={(e) => {
                      setRoutingForm({
                        ...routingForm,
                        companyId: e.target.value,
                      })
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    required
                    disabled={!!editingRouting}
                  >
                    <option value="">Select Company</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name} ({company.id})
                      </option>
                    ))}
                  </select>
                  {companies.length === 0 && (
                    <p className="mt-1 text-sm text-yellow-600">
                      No companies found. Please ensure companies are loaded.
                    </p>
                  )}
                </div>

                {/* Provider */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Shipping Aggregator <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={routingForm.shipmentServiceProviderRefId}
                    onChange={(e) => handleProviderChange(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    required
                    disabled={!!editingRouting}
                  >
                    <option value="0">Select Provider</option>
                    {providers.map((provider) => (
                      <option key={provider.providerRefId} value={provider.providerRefId}>
                        {provider.providerName} ({provider.providerCode})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Primary Courier */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Primary Courier <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={routingForm.primaryCourierCode}
                    onChange={(e) => setRoutingForm({ ...routingForm, primaryCourierCode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Select Primary Courier</option>
                    {selectedProviderCouriers.map((courier) => (
                      <option key={courier.courierCode} value={courier.courierCode}>
                        {courier.courierName}
                      </option>
                    ))}
                  </select>
                  {selectedProviderCouriers.length === 0 && routingForm.shipmentServiceProviderRefId > 0 && (
                    <p className="mt-1 text-sm text-gray-500">
                      Load couriers from provider test page first, or enter courier code manually
                    </p>
                  )}
                </div>

                {/* Secondary Courier */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Secondary Courier (Optional)
                  </label>
                  <select
                    value={routingForm.secondaryCourierCode}
                    onChange={(e) => setRoutingForm({ ...routingForm, secondaryCourierCode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">None</option>
                    {selectedProviderCouriers
                      .filter((c) => c.courierCode !== routingForm.primaryCourierCode)
                      .map((courier) => (
                        <option key={courier.courierCode} value={courier.courierCode}>
                          {courier.courierName}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Active Toggle */}
                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={routingForm.isActive}
                      onChange={(e) => setRoutingForm({ ...routingForm, isActive: e.target.checked })}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Active</span>
                  </label>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !routingForm.vendorId || !routingForm.shipmentServiceProviderRefId || !routingForm.primaryCourierCode}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : editingRouting ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

