'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Plus, Save, Loader2, Package, Check, X, Search } from 'lucide-react'
import { getProductsByCompany, getCompanyById } from '@/lib/data-mongodb'

interface ProductMTMConfig {
  productId: string
  companyId: string
  is_mtm_enabled: boolean
  mtm_specification_id: string
  mtm_price_premium: number
  estimated_production_days: number
}

interface Specification {
  id: string
  specification_name: string
  garment_category: string
}

export default function ProductMTMConfigPage() {
  const [companyId, setCompanyId] = useState('')
  const [company, setCompany] = useState<any>(null)
  const [products, setProducts] = useState<any[]>([])
  const [configs, setConfigs] = useState<Record<string, ProductMTMConfig>>({})
  const [specs, setSpecs] = useState<Specification[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [editingFields, setEditingFields] = useState<Record<string, { premium?: string; days?: string }>>({})

  useEffect(() => {
    let cancelled = false
    const loadData = async () => {
      try {
        setLoading(true)
        const { getCompanyId } = await import('@/lib/utils/auth-storage')
        const cid = getCompanyId()
        if (!cid) return
        setCompanyId(cid)

        const [companyData, productList, specsRes, configsRes] = await Promise.all([
          getCompanyById(cid),
          getProductsByCompany(cid),
          fetch(`/api/mtm/specifications?companyId=${cid}`).then(r => r.ok ? r.json() : []),
          fetch(`/api/mtm/product-config?companyId=${cid}`).then(r => r.ok ? r.json() : []),
        ])

        if (cancelled) return
        setCompany(companyData)
        setProducts(Array.isArray(productList) ? productList : [])
        setSpecs(Array.isArray(specsRes) ? specsRes : specsRes.specifications || [])

        const configList = Array.isArray(configsRes) ? configsRes : configsRes.configs || []
        const configMap: Record<string, ProductMTMConfig> = {}
        configList.forEach((c: any) => {
          configMap[c.productId] = c
        })
        setConfigs(configMap)
      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadData()
    return () => { cancelled = true }
  }, [])

  const toggleMTM = async (productId: string, enable: boolean, specId?: string) => {
    try {
      setSaving(productId)
      const existing = configs[productId]

      // When enabling, auto-select a matching template by product category
      let resolvedSpecId = specId || existing?.mtm_specification_id || ''
      if (enable && !resolvedSpecId) {
        const product = products.find(p => p.id === productId)
        const categoryMatch = product?.category?.toLowerCase()
        const matchingSpec = specs.find(s =>
          s.garment_category?.toLowerCase() === categoryMatch
        )
        if (matchingSpec) {
          resolvedSpecId = matchingSpec.id
        } else if (specs.length > 0) {
          resolvedSpecId = specs[0].id
        } else {
          alert('No measurement templates available. Please create one in Measurement Templates first.')
          setSaving(null)
          return
        }
      }

      // When disabling, we still need a valid spec ID for the record
      if (!enable && !resolvedSpecId && existing?.mtm_specification_id) {
        resolvedSpecId = existing.mtm_specification_id
      }

      const payload = {
        productId,
        companyId,
        is_mtm_enabled: enable,
        mtm_specification_id: resolvedSpecId,
        mtm_price_premium: existing?.mtm_price_premium || 0,
        estimated_production_days: existing?.estimated_production_days || 7,
      }

      const res = await fetch('/api/mtm/product-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Save failed')
      }

      setConfigs(prev => ({
        ...prev,
        [productId]: { ...payload },
      }))
    } catch (error: any) {
      alert(error.message || 'Error saving config')
    } finally {
      setSaving(null)
    }
  }

  const updateConfig = async (productId: string, field: string, value: any) => {
    const existing = configs[productId]
    if (!existing) return

    try {
      setSaving(productId)
      const payload = {
        ...existing,
        [field]: value,
      }

      const res = await fetch('/api/mtm/product-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Save failed')
      }

      setConfigs(prev => ({
        ...prev,
        [productId]: payload,
      }))
    } catch (error: any) {
      alert(error.message || 'Error saving config')
    } finally {
      setSaving(null)
    }
  }

  const filteredProducts = products.filter(p =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
          <h1 className="text-2xl font-semibold text-gray-900">Product MTM Configuration</h1>
          <p className="text-sm text-gray-500 mt-1">Enable custom-fit ordering for individual products and assign measurement templates</p>
        </div>

        {specs.length === 0 && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>No measurement templates found.</strong> Please create at least one measurement template in the
              <a href="/dashboard/company/mtm/specifications" className="text-blue-600 hover:underline ml-1">MTM Templates</a> page first.
            </p>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search products by name or category..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
          />
        </div>

        {/* Products Table */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="overflow-x-auto rounded-lg">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">Product</th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">Category</th>
                  <th className="text-center p-3 text-xs font-semibold text-gray-600 uppercase">MTM Enabled</th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-600 uppercase">Template</th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-600 uppercase">Premium (₹)</th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-600 uppercase">Est. Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredProducts.map((product) => {
                  const config = configs[product.id]
                  const isEnabled = config?.is_mtm_enabled || false
                  const isSaving = saving === product.id

                  return (
                    <tr key={product.id} className={`hover:bg-gray-50 ${isEnabled ? 'bg-violet-50/30' : ''}`}>
                      <td className="p-3">
                        <p className="text-sm font-medium text-gray-900">{product.name}</p>
                        <p className="text-xs text-gray-500">{product.id}</p>
                      </td>
                      <td className="p-3 text-sm text-gray-600 capitalize">{product.category}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => toggleMTM(product.id, !isEnabled)}
                          disabled={isSaving}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            isEnabled ? 'bg-violet-600' : 'bg-gray-300'
                          } ${isSaving ? 'opacity-50' : ''}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            isEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`} />
                        </button>
                      </td>
                      <td className="p-3">
                        {isEnabled ? (
                          <select
                            value={config?.mtm_specification_id || ''}
                            onChange={(e) => updateConfig(product.id, 'mtm_specification_id', e.target.value)}
                            disabled={isSaving}
                            className="px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                          >
                            <option value="">Select template</option>
                            {specs.map(s => (
                              <option key={s.id} value={s.id}>{s.specification_name} ({s.garment_category})</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {isEnabled ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            value={editingFields[product.id]?.premium ?? String(config?.mtm_price_premium ?? 0)}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9.]/g, '')
                              setEditingFields(prev => ({ ...prev, [product.id]: { ...prev[product.id], premium: val } }))
                            }}
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value) || 0
                              setEditingFields(prev => { const next = { ...prev }; delete next[product.id]?.premium; return next })
                              updateConfig(product.id, 'mtm_price_premium', val)
                            }}
                            disabled={isSaving}
                            className="w-24 px-2 py-1.5 border border-gray-300 rounded text-xs text-right focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {isEnabled ? (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={editingFields[product.id]?.days ?? String(config?.estimated_production_days ?? 7)}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9]/g, '')
                              setEditingFields(prev => ({ ...prev, [product.id]: { ...prev[product.id], days: val } }))
                            }}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value) || 0
                              setEditingFields(prev => { const next = { ...prev }; delete next[product.id]?.days; return next })
                              updateConfig(product.id, 'estimated_production_days', val)
                            }}
                            disabled={isSaving}
                            className="w-20 px-2 py-1.5 border border-gray-300 rounded text-xs text-right focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filteredProducts.length === 0 && (
            <div className="text-center py-8">
              <Package className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No products found</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
