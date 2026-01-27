'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { Package, Plus, Edit, Trash2, Save, X, AlertCircle, CheckCircle } from 'lucide-react'
import { useState, useEffect } from 'react'

interface Warehouse {
  warehouseRefId?: string
  vendorId: string
  warehouseName: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  country: string
  pincode: string
  contactName?: string
  contactPhone?: string
  isPrimary: boolean
  isActive: boolean
}

export default function VendorWarehousesPage() {
  const [vendorId, setVendorId] = useState<string>('')
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        
        // SECURITY FIX: Use ONLY sessionStorage (tab-specific) - NO localStorage fallback
        const { getVendorId, getAuthData } = typeof window !== 'undefined' 
          ? await import('@/lib/utils/auth-storage') 
          : { getVendorId: () => null, getAuthData: () => null }
        
        // Use ONLY sessionStorage (tab-specific)
        const storedVendorId = getVendorId() || getAuthData('vendor')?.vendorId || null
        
        console.log('[VendorWarehousesPage] VendorId from sessionStorage:', storedVendorId)
        
        if (storedVendorId) {
          setVendorId(storedVendorId)
          // Load warehouses
          await loadWarehouses(storedVendorId)
        } else {
          console.error('[VendorWarehousesPage] No vendor ID found')
          alert('Vendor ID not found. Please log in again.')
        }
      } catch (error) {
        console.error('Error loading data:', error)
        alert('Error loading data. Please refresh the page.')
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [])

  const loadWarehouses = async (vendorId: string) => {
    try {
      const response = await fetch(`/api/vendor/warehouses?vendorId=${vendorId}`, {
        headers: {
          'x-vendor-id': vendorId,
        },
      })
      if (response.ok) {
        const data = await response.json()
        setWarehouses(Array.isArray(data.warehouses) ? data.warehouses : [])
      } else {
        const error = await response.json()
        console.error('Error loading warehouses:', error)
      }
    } catch (error) {
      console.error('Error loading warehouses:', error)
    }
  }

  const handleSaveWarehouse = async (warehouse: Warehouse) => {
    try {
      setSaving(true)
      
      if (warehouse.warehouseRefId) {
        // Update
        const response = await fetch(`/api/vendor/warehouses/${warehouse.warehouseRefId}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'x-vendor-id': warehouse.vendorId,
          },
          body: JSON.stringify(warehouse),
        })
        
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to update warehouse')
        }
        
        alert('Warehouse updated successfully!')
      } else {
        // Create - include vendorId in query param and body
        const { warehouseRefId: __, ...warehouseData } = warehouse
        const response = await fetch(`/api/vendor/warehouses?vendorId=${warehouse.vendorId}`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-vendor-id': warehouse.vendorId,
          },
          body: JSON.stringify(warehouseData),
        })
        
        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to create warehouse')
        }
        
        alert('Warehouse created successfully!')
      }
      
      setEditingWarehouse(null)
      if (vendorId) {
        await loadWarehouses(vendorId)
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteWarehouse = async (warehouseRefId: string) => {
    if (!confirm('Are you sure you want to delete this warehouse? This action cannot be undone.')) {
      return
    }
    
    try {
      if (!vendorId) {
        throw new Error('Vendor ID is missing')
      }
      
      const response = await fetch(`/api/vendor/warehouses/${warehouseRefId}`, {
        method: 'DELETE',
        headers: {
          'x-vendor-id': vendorId,
        },
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete warehouse')
      }
      
      alert('Warehouse deleted successfully!')
      await loadWarehouses(vendorId)
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    }
  }

  if (loading) {
    return (
      <DashboardLayout actorType="vendor">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading warehouses...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="vendor">
      <div className="p-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
                <Package className="h-6 w-6" />
                <span>Warehouse Management</span>
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Manage your warehouse locations for automatic shipment creation
              </p>
            </div>
            <button
              onClick={() => {
                if (!vendorId) {
                  alert('Vendor ID is missing. Please refresh the page.')
                  return
                }
                setEditingWarehouse({
                  vendorId,
                  warehouseName: '',
                  addressLine1: '',
                  addressLine2: '',
                  city: '',
                  state: '',
                  country: 'India',
                  pincode: '',
                  contactName: '',
                  contactPhone: '',
                  isPrimary: warehouses.length === 0,
                  isActive: true,
                })
              }}
              disabled={!vendorId}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center space-x-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              <Plus className="h-5 w-5" />
              <span>Add Warehouse</span>
            </button>
          </div>

          {warehouses.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Package className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Warehouses Configured</h3>
              <p className="text-gray-600 mb-4">Add at least one warehouse to enable automatic shipments</p>
              <button
                onClick={() => {
                  if (!vendorId) {
                    alert('Vendor ID is missing. Please refresh the page.')
                    return
                  }
                  setEditingWarehouse({
                    vendorId,
                    warehouseName: '',
                    addressLine1: '',
                    addressLine2: '',
                    city: '',
                    state: '',
                    country: 'India',
                    pincode: '',
                    contactName: '',
                    contactPhone: '',
                    isPrimary: true,
                    isActive: true,
                  })
                }}
                disabled={!vendorId}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Add Your First Warehouse
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {warehouses.map((warehouse) => (
                <div
                  key={warehouse.warehouseRefId}
                  className={`p-5 border rounded-lg ${
                    warehouse.isPrimary ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{warehouse.warehouseName}</h3>
                        {warehouse.isPrimary && (
                          <span className="px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded">
                            Primary
                          </span>
                        )}
                        {!warehouse.isActive && (
                          <span className="px-2 py-1 bg-gray-400 text-white text-xs font-medium rounded">
                            Inactive
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 text-sm text-gray-600">
                        <p>
                          {warehouse.addressLine1}
                          {warehouse.addressLine2 && `, ${warehouse.addressLine2}`}
                        </p>
                        <p>
                          {warehouse.city}, {warehouse.state} - {warehouse.pincode}
                        </p>
                        <p>{warehouse.country}</p>
                        {warehouse.contactName && (
                          <p className="mt-2">
                            <span className="font-medium">Contact:</span> {warehouse.contactName}
                            {warehouse.contactPhone && ` (${warehouse.contactPhone})`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      <button
                        onClick={() => setEditingWarehouse(warehouse)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit warehouse"
                      >
                        <Edit className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => warehouse.warehouseRefId && handleDeleteWarehouse(warehouse.warehouseRefId)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete warehouse"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {warehouses.length > 0 && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-900">Warehouse Requirements</p>
                  <ul className="text-sm text-blue-800 mt-1 list-disc list-inside space-y-1">
                    <li>At least one active warehouse is required for automatic shipments</li>
                    <li>Only one warehouse can be marked as Primary (used by default)</li>
                    <li>Warehouses cannot be deleted if they have associated shipments</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Warehouse Edit/Add Modal */}
        {editingWarehouse && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                {editingWarehouse.warehouseRefId ? 'Edit Warehouse' : 'Add Warehouse'}
              </h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  const formData = new FormData(e.target as HTMLFormElement)
                  
                  // Ensure vendorId is always set (from editingWarehouse or state)
                  const currentVendorId = editingWarehouse?.vendorId || vendorId
                  if (!currentVendorId) {
                    alert('Vendor ID is missing. Please refresh the page and try again.')
                    return
                  }
                  
                  const warehouseData: Warehouse = {
                    vendorId: currentVendorId,
                    warehouseName: formData.get('warehouseName') as string,
                    addressLine1: formData.get('addressLine1') as string,
                    addressLine2: formData.get('addressLine2') as string || undefined,
                    city: formData.get('city') as string,
                    state: formData.get('state') as string,
                    country: formData.get('country') as string || 'India',
                    pincode: formData.get('pincode') as string,
                    contactName: formData.get('contactName') as string || undefined,
                    contactPhone: formData.get('contactPhone') as string || undefined,
                    isPrimary: formData.get('isPrimary') === 'true',
                    isActive: formData.get('isActive') !== 'false',
                  }
                  if (editingWarehouse?.warehouseRefId) {
                    warehouseData.warehouseRefId = editingWarehouse.warehouseRefId
                  }
                  await handleSaveWarehouse(warehouseData)
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse Name *</label>
                  <input
                    type="text"
                    name="warehouseName"
                    defaultValue={editingWarehouse.warehouseName || ''}
                    required
                    maxLength={200}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1 *</label>
                  <input
                    type="text"
                    name="addressLine1"
                    defaultValue={editingWarehouse.addressLine1 || ''}
                    required
                    maxLength={255}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
                  <input
                    type="text"
                    name="addressLine2"
                    defaultValue={editingWarehouse.addressLine2 || ''}
                    maxLength={255}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                    <input
                      type="text"
                      name="city"
                      defaultValue={editingWarehouse.city || ''}
                      required
                      maxLength={100}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                    <input
                      type="text"
                      name="state"
                      defaultValue={editingWarehouse.state || ''}
                      required
                      maxLength={100}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pincode *</label>
                    <input
                      type="text"
                      name="pincode"
                      defaultValue={editingWarehouse.pincode || ''}
                      required
                      pattern="[0-9]{6}"
                      maxLength={6}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">6 digits (e.g., 110001)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                    <input
                      type="text"
                      name="country"
                      defaultValue={editingWarehouse.country || 'India'}
                      maxLength={50}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                    <input
                      type="text"
                      name="contactName"
                      defaultValue={editingWarehouse.contactName || ''}
                      maxLength={100}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
                    <input
                      type="tel"
                      name="contactPhone"
                      defaultValue={editingWarehouse.contactPhone || ''}
                      maxLength={20}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-6">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      name="isPrimary"
                      value="true"
                      defaultChecked={editingWarehouse.isPrimary}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Primary Warehouse</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      name="isActive"
                      value="true"
                      defaultChecked={editingWarehouse.isActive !== false}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Active</span>
                  </label>
                </div>
                <div className="flex space-x-4 pt-4">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-5 w-5" />
                        <span>Save Warehouse</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingWarehouse(null)}
                    className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors flex items-center justify-center space-x-2"
                  >
                    <X className="h-5 w-5" />
                    <span>Cancel</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

