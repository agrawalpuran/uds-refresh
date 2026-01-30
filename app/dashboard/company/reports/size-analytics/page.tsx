'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart3,
  Filter,
  Info,
  RefreshCw,
  Ruler,
  Package,
  ChevronDown,
  Check
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

// ============================================================================
// TYPES
// ============================================================================
interface FilterOptions {
  garmentTypes: Array<{ value: string; label: string }>
  designs: Array<{ designId: string; designName: string; garmentType: string; sizeOrder: string[] }>
  vendors: Array<{ vendorId: string; vendorName: string }>
  orderCycleYears: number[]
  locations: Array<{ locationId: string; locationName: string }>
}

interface SizeDistributionByGarment {
  garmentType: string
  designId: string
  designName: string
  sizeOrder: string[]
  distribution: Array<{ size: string; count: number; percent: number }>
  totalDemand: number
}

interface VendorWiseSizeDistribution {
  garmentType: string
  designId: string
  designName: string
  sizeOrder: string[]
  byVendor: Array<{
    vendorId: string
    vendorName: string
    distribution: Array<{ size: string; count: number; percent: number }>
    totalDemand: number
  }>
}

interface TopSizePerDesign {
  designId: string
  designName: string
  garmentType: string
  topSizes: Array<{ size: string; count: number; percent: number; rank: number }>
  totalDemand: number
}

interface AnalyticsResult {
  sizeDistributionByGarment: SizeDistributionByGarment[]
  vendorWiseSizeDistribution: VendorWiseSizeDistribution[]
  topSizesPerDesign: TopSizePerDesign[]
  filtersApplied: Record<string, unknown>
}

const GARMENT_LABELS: Record<string, string> = {
  shirt: 'Shirt',
  pant: 'Pant',
  shoe: 'Shoe',
  jacket: 'Jacket',
  accessory: 'Accessory'
}

// High-contrast palette so donut segments are distinct (orange + contrasting hues)
const CHART_COLORS = ['#ea580c', '#2563eb', '#059669', '#7c3aed', '#db2777', '#ca8a04', '#0891b2', '#dc2626', '#16a34a']

// ============================================================================
// COMPONENT
// ============================================================================
export default function SizeAnalyticsPage() {
  const [companyId, setCompanyId] = useState<string>('')
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)
  const [result, setResult] = useState<AnalyticsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const [filterOpen, setFilterOpen] = useState(true)

  // Filters
  const [garmentTypes, setGarmentTypes] = useState<string[]>([])
  const [designIds, setDesignIds] = useState<string[]>([])
  const [vendorIds, setVendorIds] = useState<string[]>([])
  const [orderCycleYear, setOrderCycleYear] = useState<number | ''>('')
  const [locationId, setLocationId] = useState<string>('')
  const [topN, setTopN] = useState(5)

  const loadCompanyAndOptions = useCallback(async () => {
    if (typeof window === 'undefined') return
    const { getCompanyId } = await import('@/lib/utils/auth-storage')
    const cid = getCompanyId()
    if (!cid) {
      setLoading(false)
      return
    }
    setCompanyId(cid)
    try {
      const res = await fetch(`/api/analytics/size-distribution?companyId=${encodeURIComponent(cid)}&filters=1`)
      if (res.ok) {
        const data = await res.json()
        setFilterOptions(data)
        if (data.orderCycleYears?.length > 0 && !orderCycleYear) {
          setOrderCycleYear(data.orderCycleYears[0])
        }
      }
    } catch (e) {
      console.error('Failed to load filter options', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCompanyAndOptions()
  }, [loadCompanyAndOptions])

  const loadAnalytics = useCallback(async () => {
    if (!companyId) return
    setLoadingAnalytics(true)
    try {
      const params = new URLSearchParams()
      params.set('companyId', companyId)
      if (garmentTypes.length) params.set('garmentTypes', garmentTypes.join(','))
      if (designIds.length) params.set('designIds', designIds.join(','))
      if (vendorIds.length) params.set('vendorIds', vendorIds.join(','))
      if (orderCycleYear) params.set('orderCycleYear', String(orderCycleYear))
      if (locationId) params.set('locationId', locationId)
      params.set('topN', String(topN))
      const res = await fetch(`/api/analytics/size-distribution?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setResult(data)
      } else {
        setResult(null)
      }
    } catch (e) {
      console.error('Failed to load analytics', e)
      setResult(null)
    } finally {
      setLoadingAnalytics(false)
    }
  }, [companyId, garmentTypes, designIds, vendorIds, orderCycleYear, locationId, topN])

  useEffect(() => {
    if (companyId && filterOptions) loadAnalytics()
  }, [companyId, loadAnalytics, filterOptions])

  const toggleGarment = (v: string) => {
    setGarmentTypes(prev => (prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]))
  }
  const toggleDesign = (v: string) => {
    setDesignIds(prev => (prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]))
  }
  const toggleVendor = (v: string) => {
    setVendorIds(prev => (prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (!companyId) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-6 text-center">
        <p className="text-amber-800">Company context not found. Please log in as Company Admin.</p>
      </div>
    )
  }

  const hasData = result && (
    result.sizeDistributionByGarment.length > 0 ||
    result.topSizesPerDesign.length > 0
  )

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/60 via-white to-amber-50/40">
      <div className="space-y-6">
        {/* Hero header */}
        <div className="relative overflow-hidden rounded-2xl border border-orange-100 bg-gradient-to-r from-orange-50/90 via-amber-50/60 to-orange-50/90 px-6 py-6 shadow-sm">
          <div className="absolute right-0 top-0 h-32 w-48 bg-orange-100/20 rounded-bl-full" />
          <div className="absolute bottom-0 left-0 h-24 w-32 bg-amber-100/15 rounded-tr-full" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100/80 border border-orange-100">
                <Ruler className="h-7 w-7 text-orange-600/90" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">
                  Size Demand Analytics
                </h1>
                <p className="text-sm text-gray-600 mt-0.5">
                  Design-driven size distribution · STANDARD sizes only, MTM excluded
                </p>
              </div>
            </div>
            <button
              onClick={() => loadAnalytics()}
              disabled={loadingAnalytics}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-gray-700 border border-orange-200/80 hover:bg-orange-50/80 disabled:opacity-50 font-medium shadow-sm"
            >
              <RefreshCw className={`h-4 w-4 ${loadingAnalytics ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        {filterOptions && (
          <div className="rounded-2xl border border-orange-100 bg-white shadow-md overflow-hidden">
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className="w-full flex items-center justify-between px-6 py-4 text-left bg-gradient-to-r from-orange-50/80 to-amber-50/50 hover:from-orange-50 hover:to-amber-50 transition-colors"
            >
            <span className="font-semibold text-gray-900 flex items-center gap-2">
              <Filter className="h-5 w-5 text-orange-600" />
              Filters
            </span>
            <ChevronDown className={`h-5 w-5 text-gray-500 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
          </button>
            {filterOpen && (
              <div className="px-6 pb-6 pt-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 border-t border-gray-100">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Garment Type</label>
                  <div className="flex flex-wrap gap-2">
                    {filterOptions.garmentTypes.map(g => (
                      <button
                        key={g.value}
                        onClick={() => toggleGarment(g.value)}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${garmentTypes.includes(g.value) ? 'bg-orange-500 text-white border-orange-500 shadow-sm' : 'bg-white text-gray-700 border-gray-300 hover:border-orange-300 hover:bg-orange-50/50'}`}
                      >
                        {garmentTypes.includes(g.value) && <Check className="inline h-3 w-3 mr-1" />}
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Product (optional)</label>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                    {filterOptions.designs.map(d => (
                      <button
                        key={d.designId}
                        type="button"
                        onClick={() => toggleDesign(d.designId)}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${designIds.includes(d.designId) ? 'bg-orange-500 text-white border-orange-500 shadow-sm' : 'bg-white text-gray-700 border-gray-300 hover:border-orange-300 hover:bg-orange-50/50'}`}
                      >
                        {designIds.includes(d.designId) && <Check className="inline h-3 w-3 mr-1" />}
                        {d.designName} ({GARMENT_LABELS[d.garmentType] || d.garmentType})
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Vendor</label>
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                    {filterOptions.vendors.map(v => (
                      <button
                        key={v.vendorId}
                        onClick={() => toggleVendor(v.vendorId)}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${vendorIds.includes(v.vendorId) ? 'bg-orange-500 text-white border-orange-500 shadow-sm' : 'bg-white text-gray-700 border-gray-300 hover:border-orange-300 hover:bg-orange-50/50'}`}
                      >
                        {vendorIds.includes(v.vendorId) && <Check className="inline h-3 w-3 mr-1" />}
                        {v.vendorName}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Order Cycle / Year</label>
                  <select
                    value={orderCycleYear}
                    onChange={e => setOrderCycleYear(e.target.value ? parseInt(e.target.value, 10) : '')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                  >
                    <option value="">All years</option>
                    {filterOptions.orderCycleYears.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Location (optional)</label>
                  <select
                    value={locationId}
                    onChange={e => setLocationId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                  >
                    <option value="">All locations</option>
                    {filterOptions.locations.map(l => (
                      <option key={l.locationId} value={l.locationId}>{l.locationName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Top N sizes per design</label>
                  <select
                    value={topN}
                    onChange={e => setTopN(parseInt(e.target.value, 10))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                  >
                    {[3, 5, 10].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {loadingAnalytics && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 text-gray-400 animate-spin" />
          </div>
        )}

        {!loadingAnalytics && !hasData && result && (
          <div className="rounded-2xl border border-orange-100 bg-white p-12 text-center shadow-md">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50">
              <Package className="h-8 w-8 text-orange-500" />
            </div>
            <h2 className="text-lg font-semibold text-gray-700 mb-2">No size data for selected filters</h2>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              There is no delivered STANDARD-size order data for the selected company, cycle, and filters. Try a different year or relax filters.
            </p>
          </div>
        )}

        {!loadingAnalytics && hasData && result && (
          <>
            {/* Widget 1: Top Sizes matrix — at the top */}
            <div className="rounded-2xl border border-orange-100 bg-white shadow-md overflow-hidden">
              <div className="border-b border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50/50 px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-orange-600" />
                  Top Sizes per Design
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Most ordered sizes per garment/design. Counts are all delivered order lines (STANDARD only), each order line counted independently.
                </p>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {result.topSizesPerDesign.map((design) => (
                    <div key={design.designId} className="group relative rounded-xl border border-orange-100 bg-gradient-to-b from-white to-orange-50/30 p-4 shadow-sm hover:shadow-md hover:border-orange-200 transition-all overflow-hidden">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-orange-500 to-amber-500 opacity-80" />
                      <h3 className="font-medium text-gray-900 mb-1.5 pl-1">
                        {design.designName}
                      </h3>
                      <p className="text-xs text-orange-600/80 mb-3 pl-1">
                        {GARMENT_LABELS[design.garmentType] || design.garmentType}
                        {` · ${design.totalDemand} order lines`}
                      </p>
                      <ul className="space-y-2">
                        {design.topSizes.slice(0, topN).map((s) => (
                          <li key={s.size} className="flex justify-between items-center text-sm">
                            <span className="text-gray-700">#{s.rank} {s.size}</span>
                            <span className="text-gray-600 tabular-nums">{s.count} ({s.percent.toFixed(0)}%)</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Widget 2: Size distribution — donuts (compact grid) */}
            <div className="rounded-2xl border border-orange-100 bg-white shadow-md overflow-hidden">
              <div className="border-b border-orange-100 bg-gradient-to-r from-orange-50/80 to-amber-50/80 px-6 py-4 flex items-start gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100">
                  <BarChart3 className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Standard Size Demand (Design-based, MTM excluded)
                  </h2>
                  <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                    <Info className="h-4 w-4 text-orange-500 shrink-0" />
                    Size mix per product for your filters. Counts are <strong>all delivered order lines (STANDARD only)</strong>, each order line counted independently.
                  </p>
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {result.sizeDistributionByGarment.map((design) => {
                    const donutData = design.distribution.map((d, i) => ({
                      name: d.size,
                      value: d.percent,
                      count: d.count,
                      fill: CHART_COLORS[i % CHART_COLORS.length]
                    }))
                    return (
                      <div key={design.designId} className="flex flex-col items-center rounded-xl border border-orange-100 bg-gradient-to-b from-white to-orange-50/20 p-4 shadow-sm hover:shadow-md hover:border-orange-200 transition-all">
                        <h3 className="text-sm font-medium text-gray-900 mb-1 text-center">
                          {design.designName}
                        </h3>
                        <p className="text-xs text-orange-600/80 mb-3">
                          {GARMENT_LABELS[design.garmentType] || design.garmentType}
                          {` · ${design.totalDemand} order lines`}
                        </p>
                        <ResponsiveContainer width="100%" height={180}>
                          <PieChart>
                            <Pie
                              data={donutData}
                              cx="50%"
                              cy="50%"
                              innerRadius={44}
                              outerRadius={64}
                              paddingAngle={2}
                              dataKey="value"
                              nameKey="name"
                              label={({ name, value, cx, cy, midAngle, outerRadius }) => {
                                const RADIAN = Math.PI / 180
                                const labelRadius = outerRadius + 20
                                const x = cx + labelRadius * Math.cos(-midAngle * RADIAN)
                                const y = cy + labelRadius * Math.sin(-midAngle * RADIAN)
                                const textAnchor = x >= cx ? 'start' : 'end'
                                return (
                                  <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="central" fill="#1f2937" fontSize={10} fontWeight="600">
                                    {name} {Number(value).toFixed(0)}%
                                  </text>
                                )
                              }}
                              labelLine={{ stroke: '#9ca3af', strokeWidth: 1 }}
                            >
                              {donutData.map((entry, i) => (
                                <Cell key={`cell-${i}`} fill={entry.fill} stroke="white" strokeWidth={1.5} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value: number, name: string, props: any) => [
                                `${value.toFixed(1)}% (${props.payload.count} orders)`,
                                name
                              ]}
                              contentStyle={{ borderRadius: '10px', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                          {donutData.map((d) => (
                            <span key={d.name} className="inline-flex items-center gap-1 text-[10px] text-gray-600">
                              <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: d.fill }} />
                              {d.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
