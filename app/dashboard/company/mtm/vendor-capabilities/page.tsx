'use client'

import { useState, useEffect, useRef } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Loader2, Truck, Save, Plus, X, Edit2 } from 'lucide-react'

interface VendorCapability {
  vendorId: string
  garment_category: string
  is_active: boolean
  max_daily_capacity?: number
  avg_production_days?: number
}

export default function VendorMTMCapabilitiesPage() {
  const [companyId, setCompanyId] = useState('')
  const [vendors, setVendors] = useState<any[]>([])
  const [capabilities, setCapabilities] = useState<Record<string, VendorCapability[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Inline add form
  const [addingForVendor, setAddingForVendor] = useState<string | null>(null)
  const [addCategory, setAddCategory] = useState('')
  const [addCapacity, setAddCapacity] = useState('')
  const [addDays, setAddDays] = useState('7')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const { getCompanyId } = await import('@/lib/utils/auth-storage')
      const cid = getCompanyId()
      if (!cid) return
      setCompanyId(cid)

      // Load company vendors
      const { getVendorsByCompany } = await import('@/lib/data-mongodb')
      const vendorList = await getVendorsByCompany(cid)
      setVendors(Array.isArray(vendorList) ? vendorList : [])

      // Batch-fetch capabilities for all vendors in a single request
      const vendorIdList = (Array.isArray(vendorList) ? vendorList : []).map((v: any) => v.id || v.vendorId).filter(Boolean)
      let capMap: Record<string, VendorCapability[]> = {}
      if (vendorIdList.length > 0) {
        try {
          const res = await fetch(`/api/mtm/vendor-capabilities?vendorIds=${vendorIdList.join(',')}`)
          if (res.ok) {
            const data = await res.json()
            for (const vid of vendorIdList) {
              capMap[vid] = Array.isArray(data[vid]) ? data[vid] : []
            }
          }
        } catch {
          for (const vid of vendorIdList) capMap[vid] = []
        }
      }
      setCapabilities(capMap)
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddCapability = async (vendorId: string) => {
    if (!addCategory) {
      alert('Please select a garment category.')
      return
    }

    try {
      setSaving(true)
      const res = await fetch('/api/mtm/vendor-capabilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId,
          garment_category: addCategory,
          is_active: true,
          max_daily_capacity: addCapacity ? parseInt(addCapacity) : undefined,
          avg_production_days: parseInt(addDays) || 7,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Save failed')
      }

      setAddingForVendor(null)
      setAddCategory('')
      setAddCapacity('')
      setAddDays('7')
      await loadData()
    } catch (error: any) {
      alert(error.message || 'Error saving capability')
    } finally {
      setSaving(false)
    }
  }

  const toggleCapability = async (vendorId: string, category: string, isActive: boolean) => {
    try {
      setSaving(true)
      const existing = capabilities[vendorId]?.find(c => c.garment_category === category)
      await fetch('/api/mtm/vendor-capabilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId,
          garment_category: category,
          is_active: isActive,
          max_daily_capacity: existing?.max_daily_capacity,
          avg_production_days: existing?.avg_production_days || 7,
        }),
      })
      await loadData()
    } catch (error) {
      console.error('Error toggling capability:', error)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout actorType="company">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="company">
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Vendor MTM Capabilities</h1>
          <p className="text-sm text-gray-500 mt-1">Manage which vendors can fulfil custom-fit orders by garment category</p>
        </div>

        {vendors.length === 0 ? (
          <div className="text-center py-12">
            <Truck className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No vendors linked to your company</p>
          </div>
        ) : (
          <div className="space-y-4">
            {vendors.map((vendor) => {
              const vendorId = vendor.id || vendor.vendorId
              const vendorCaps = capabilities[vendorId] || []

              return (
                <div key={vendorId} className="bg-white rounded-lg border border-gray-200">
                  {/* Vendor Header */}
                  <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Truck className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{vendor.name || vendor.vendorName || vendorId}</p>
                        <p className="text-xs text-gray-500">{vendor.email || ''}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setAddingForVendor(addingForVendor === vendorId ? null : vendorId)
                        setAddCategory('')
                        setAddCapacity('')
                        setAddDays('7')
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-semibold"
                    >
                      <Plus className="h-3 w-3" />
                      Add Capability
                    </button>
                  </div>

                  {/* Add Capability Form */}
                  {addingForVendor === vendorId && (
                    <div className="p-4 bg-blue-50 border-b border-blue-200">
                      <div className="flex items-end gap-3 flex-wrap">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Category *</label>
                          <select
                            value={addCategory}
                            onChange={(e) => setAddCategory(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          >
                            <option value="">Select</option>
                            <option value="shirt">Shirt</option>
                            <option value="pant">Pant</option>
                            <option value="jacket">Jacket</option>
                            <option value="shoe">Shoe</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Daily Capacity</label>
                          <input
                            type="number"
                            value={addCapacity}
                            onChange={(e) => setAddCapacity(e.target.value)}
                            placeholder="Optional"
                            className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Avg. Days</label>
                          <input
                            type="number"
                            value={addDays}
                            onChange={(e) => setAddDays(e.target.value)}
                            className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <button
                          onClick={() => handleAddCapability(vendorId)}
                          disabled={saving}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-semibold flex items-center gap-1"
                        >
                          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          Save
                        </button>
                        <button
                          onClick={() => setAddingForVendor(null)}
                          className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Capabilities List */}
                  {vendorCaps.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {vendorCaps.map((cap, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 px-4 hover:bg-gray-50">
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${
                              cap.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {cap.garment_category}
                            </span>
                            <span className="text-xs text-gray-500">
                              {cap.max_daily_capacity ? `Capacity: ${cap.max_daily_capacity}/day` : ''}
                              {cap.max_daily_capacity && cap.avg_production_days ? ' · ' : ''}
                              {cap.avg_production_days ? `~${cap.avg_production_days} days` : ''}
                            </span>
                          </div>
                          <button
                            onClick={() => toggleCapability(vendorId, cap.garment_category, !cap.is_active)}
                            disabled={saving}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              cap.is_active ? 'bg-green-500' : 'bg-gray-300'
                            } ${saving ? 'opacity-50' : ''}`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              cap.is_active ? 'translate-x-4' : 'translate-x-0.5'
                            }`} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center">
                      <p className="text-xs text-gray-400 italic">No MTM capabilities configured</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
