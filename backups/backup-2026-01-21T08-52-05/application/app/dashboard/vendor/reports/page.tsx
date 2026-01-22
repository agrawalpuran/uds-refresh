'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { BarChart3, Download, Package, DollarSign, TrendingUp, Building2, Calendar, PieChart } from 'lucide-react'
import { useState, useEffect } from 'react'
import { getVendorReports, getVendorSalesPatterns, getVendorOrderStatusBreakdown, getVendorBusinessVolumeByCompany } from '@/lib/data-mongodb'

export default function VendorReportsPage() {
  const [vendorId, setVendorId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly')
  
  // Report data
  const [summary, setSummary] = useState<{
    totalRevenue: number
    totalOrders: number
    avgOrderValue: number
    totalCompanies: number
  } | null>(null)
  const [salesPatterns, setSalesPatterns] = useState<Array<{ period: string; revenue: number; orderCount: number; avgOrderValue: number }>>([])
  const [orderStatusBreakdown, setOrderStatusBreakdown] = useState<Array<{ status: string; count: number; revenue: number; percentage: number }>>([])
  const [businessVolumeByCompany, setBusinessVolumeByCompany] = useState<Array<{ companyId: string; companyName: string; orderCount: number; revenue: number; avgOrderValue: number; percentage: number }>>([])

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const storedVendorId = typeof window !== 'undefined' ? localStorage.getItem('vendorId') : null
        if (!storedVendorId) {
          console.error('Vendor ID not found')
          setLoading(false)
          return
        }
        
        setVendorId(storedVendorId)
        
        // Load full reports
        const reports = await getVendorReports(storedVendorId)
        setSummary(reports.summary)
        setOrderStatusBreakdown(reports.orderStatusBreakdown)
        setBusinessVolumeByCompany(reports.businessVolumeByCompany)
        
        // Load sales patterns for selected period
        const patterns = await getVendorSalesPatterns(storedVendorId, selectedPeriod)
        setSalesPatterns(patterns)
      } catch (error) {
        console.error('Error loading reports data:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [])

  useEffect(() => {
    const loadSalesPatterns = async () => {
      if (!vendorId) return
      try {
        const patterns = await getVendorSalesPatterns(vendorId, selectedPeriod)
        setSalesPatterns(patterns)
      } catch (error) {
        console.error('Error loading sales patterns:', error)
      }
    }
    
    loadSalesPatterns()
  }, [selectedPeriod, vendorId])

  if (loading) {
    return (
      <DashboardLayout actorType="vendor">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading reports...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!summary) {
    return (
      <DashboardLayout actorType="vendor">
        <div className="text-center py-12">
          <p className="text-gray-600">No report data available</p>
        </div>
      </DashboardLayout>
    )
  }

  const stats = [
    { name: 'Total Revenue', value: `₹${summary.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: DollarSign, color: 'green' },
    { name: 'Total Orders', value: summary.totalOrders.toLocaleString(), icon: Package, color: 'blue' },
    { name: 'Avg Order Value', value: `₹${summary.avgOrderValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: TrendingUp, color: 'purple' },
    { name: 'Active Companies', value: summary.totalCompanies.toString(), icon: Building2, color: 'orange' },
  ]

  // Get max revenue for chart scaling
  const maxRevenue = salesPatterns.length > 0 ? Math.max(...salesPatterns.map(p => p.revenue)) : 0
  const maxOrderCount = salesPatterns.length > 0 ? Math.max(...salesPatterns.map(p => p.orderCount)) : 0

  // Status colors for pie chart (hex colors)
  const statusColors: Record<string, string> = {
    'Awaiting approval': '#eab308', // yellow-500
    'Awaiting fulfilment': '#f97316', // orange-500
    'Dispatched': '#3b82f6', // blue-500
    'Delivered': '#22c55e', // green-500
  }
  
  // Status colors for badges
  const statusBadgeColors: Record<string, string> = {
    'Awaiting approval': 'bg-yellow-500',
    'Awaiting fulfilment': 'bg-orange-500',
    'Dispatched': 'bg-blue-500',
    'Delivered': 'bg-green-500',
  }

  return (
    <DashboardLayout actorType="vendor">
      <div>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Vendor Reports</h1>
          <button 
            onClick={() => {
              // Export functionality can be added here
              alert('Export functionality coming soon')
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Download className="h-5 w-5" />
            <span>Export Report</span>
          </button>
        </div>

        {/* Summary Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat) => {
            const Icon = stat.icon
            const getColorClasses = (color: string | undefined) => {
              const colors: Record<string, { bg: string; text: string }> = {
                green: { bg: 'bg-green-100', text: 'text-green-600' },
                blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
                purple: { bg: 'bg-purple-100', text: 'text-purple-600' },
                orange: { bg: 'bg-orange-100', text: 'text-orange-600' },
              }
              return colors[color || 'blue'] || colors.blue
            }
            const colorClasses = getColorClasses(stat.color) || { bg: 'bg-blue-100', text: 'text-blue-600' }
            return (
              <div key={stat.name} className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm mb-1">{stat.name}</p>
                    <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                  <div className={`${colorClasses.bg} p-3 rounded-lg`}>
                    <Icon className={`h-6 w-6 ${colorClasses.text}`} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Sales Patterns Chart */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 flex items-center space-x-2">
              <TrendingUp className="h-5 w-5" />
              <span>Sales Patterns</span>
            </h2>
            <div className="flex space-x-2">
              <button
                onClick={() => setSelectedPeriod('daily')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedPeriod === 'daily'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Daily
              </button>
              <button
                onClick={() => setSelectedPeriod('weekly')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedPeriod === 'weekly'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Weekly
              </button>
              <button
                onClick={() => setSelectedPeriod('monthly')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedPeriod === 'monthly'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Monthly
              </button>
            </div>
          </div>
          
          {salesPatterns.length > 0 ? (
            <div className="space-y-4">
              {/* Revenue Chart */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Revenue Trend</h3>
                <div className="h-64 flex items-end space-x-2">
                  {salesPatterns.map((pattern, index) => {
                    const height = maxRevenue > 0 ? (pattern.revenue / maxRevenue) * 100 : 0
                    return (
                      <div key={index} className="flex-1 flex flex-col items-center">
                        <div className="w-full bg-gray-100 rounded-t-lg relative" style={{ height: '240px' }}>
                          <div
                            className="w-full bg-blue-600 rounded-t-lg transition-all duration-300 hover:bg-blue-700"
                            style={{ height: `${height}%` }}
                            title={`${pattern.period}: ₹${pattern.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-600 mt-2 text-center transform -rotate-45 origin-top-left whitespace-nowrap" style={{ writingMode: 'vertical-rl' }}>
                          {selectedPeriod === 'daily' 
                            ? new Date(pattern.period).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                            : selectedPeriod === 'weekly'
                            ? `Week ${pattern.period}`
                            : pattern.period
                          }
                        </p>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Total Revenue</p>
                    <p className="font-semibold text-gray-900">₹{salesPatterns.reduce((sum, p) => sum + p.revenue, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Total Orders</p>
                    <p className="font-semibold text-gray-900">{salesPatterns.reduce((sum, p) => sum + p.orderCount, 0)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Avg Order Value</p>
                    <p className="font-semibold text-gray-900">₹{salesPatterns.length > 0 ? (salesPatterns.reduce((sum, p) => sum + p.revenue, 0) / salesPatterns.reduce((sum, p) => sum + p.orderCount, 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">No sales data available for the selected period</p>
              </div>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Order Status Breakdown */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
              <PieChart className="h-5 w-5" />
              <span>Order Status Breakdown</span>
            </h2>
            {orderStatusBreakdown.length > 0 ? (
              <div className="space-y-4">
                {/* Pie Chart Visualization */}
                <div className="flex items-center justify-center h-48">
                  <div className="relative w-48 h-48">
                    <svg viewBox="0 0 100 100" className="transform -rotate-90">
                      {(() => {
                        let currentAngle = 0
                        return orderStatusBreakdown.map((item, index) => {
                          const angle = (item.percentage / 100) * 360
                          const largeArc = angle > 180 ? 1 : 0
                          const x1 = 50 + 50 * Math.cos((currentAngle * Math.PI) / 180)
                          const y1 = 50 + 50 * Math.sin((currentAngle * Math.PI) / 180)
                          const x2 = 50 + 50 * Math.cos(((currentAngle + angle) * Math.PI) / 180)
                          const y2 = 50 + 50 * Math.sin(((currentAngle + angle) * Math.PI) / 180)
                          const color = statusColors[item.status] || '#6b7280'
                          currentAngle += angle
                          return (
                            <path
                              key={index}
                              d={`M 50 50 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`}
                              fill={color}
                              className="hover:opacity-80 transition-opacity"
                              title={`${item.status}: ${item.count} orders (${item.percentage.toFixed(1)}%)`}
                            />
                          )
                        })
                      })()}
                    </svg>
                  </div>
                </div>
                {/* Status List */}
                <div className="space-y-2">
                  {orderStatusBreakdown.map((item, index) => {
                    const badgeColor = statusBadgeColors[item.status] || 'bg-gray-500'
                    return (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className={`w-4 h-4 rounded-full ${badgeColor}`}></div>
                          <span className="font-medium text-gray-900">{item.status}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">{item.count} orders</p>
                          <p className="text-sm text-gray-600">₹{item.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          <p className="text-xs text-gray-500">{item.percentage.toFixed(1)}%</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <PieChart className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">No order status data available</p>
                </div>
              </div>
            )}
          </div>

          {/* Business Volume by Company */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
              <Building2 className="h-5 w-5" />
              <span>Business Volume by Company</span>
            </h2>
            {businessVolumeByCompany.length > 0 ? (
              <div className="space-y-4">
                {/* Bar Chart */}
                <div className="h-48 flex items-end space-x-2 mb-4">
                  {businessVolumeByCompany.slice(0, 5).map((company, index) => {
                    const maxVolume = businessVolumeByCompany[0]?.revenue || 1
                    const height = (company.revenue / maxVolume) * 100
                    return (
                      <div key={index} className="flex-1 flex flex-col items-center">
                        <div className="w-full bg-gray-100 rounded-t-lg relative" style={{ height: '180px' }}>
                          <div
                            className="w-full bg-green-600 rounded-t-lg transition-all duration-300 hover:bg-green-700"
                            style={{ height: `${height}%` }}
                            title={`${company.companyName}: ₹${company.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-600 mt-2 text-center truncate w-full" title={company.companyName}>
                          {company.companyName.length > 10 ? company.companyName.substring(0, 10) + '...' : company.companyName}
                        </p>
                      </div>
                    )
                  })}
                </div>
                {/* Company List */}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {businessVolumeByCompany.map((company, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{company.companyName}</p>
                        <p className="text-sm text-gray-600">{company.orderCount} orders</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">₹{company.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p className="text-xs text-gray-500">{company.percentage.toFixed(1)}% of total</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">No company data available</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
