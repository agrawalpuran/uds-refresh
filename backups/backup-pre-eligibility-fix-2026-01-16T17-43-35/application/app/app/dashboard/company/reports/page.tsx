'use client'

import { useState, useEffect, useMemo } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { BarChart3, Download, Calendar, DollarSign, Users, Package, IndianRupee } from 'lucide-react'
import { getOrdersByCompany, getEmployeesByCompany, getCompanyById } from '@/lib/data-mongodb'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts'
// Data masking removed for Company Admin - they should see all employee information unmasked
import Link from 'next/link'

export default function ReportsPage() {
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'quarterly'>('monthly')
  const [companyId, setCompanyId] = useState<string>('')
  const [companyOrders, setCompanyOrders] = useState<any[]>([])
  const [companyEmployees, setCompanyEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showTooltip, setShowTooltip] = useState<string | null>(null)
  const [companyPrimaryColor, setCompanyPrimaryColor] = useState<string>('#f76b1c')
  const [companySecondaryColor, setCompanySecondaryColor] = useState<string>('#f76b1c')
  
  // Get company ID from localStorage (set during login) - company admin is linked to only one company
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        try {
          setLoading(true)
          const storedCompanyId = localStorage.getItem('companyId')
          if (storedCompanyId) {
            setCompanyId(storedCompanyId)
            // Filter orders and employees by company
            const orders = await getOrdersByCompany(storedCompanyId)
            const employees = await getEmployeesByCompany(storedCompanyId)
            setCompanyOrders(orders)
            setCompanyEmployees(employees)
            
            // Fetch company details for colors
            const companyDetails = await getCompanyById(storedCompanyId)
            if (companyDetails) {
              setCompanyPrimaryColor(companyDetails.primaryColor || '#f76b1c')
              setCompanySecondaryColor(companyDetails.secondaryColor || companyDetails.primaryColor || '#f76b1c')
            }
          }
        } catch (error) {
          console.error('Error loading reports data:', error)
        } finally {
          setLoading(false)
        }
      }
      
      loadData()
    }
  }, [])

  // Calculate total spent - handle cases where total might be missing or calculate from items
  const totalSpent = companyOrders.reduce((sum, order) => {
    // If order.total exists and is a valid number, use it
    if (order.total !== undefined && order.total !== null && typeof order.total === 'number' && !isNaN(order.total)) {
      return sum + order.total
    }
    // Otherwise, calculate from items
    if (order.items && Array.isArray(order.items) && order.items.length > 0) {
      const calculatedTotal = order.items.reduce((itemSum: number, item: any) => {
        const price = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0
        const quantity = typeof item.quantity === 'number' ? item.quantity : parseInt(item.quantity) || 0
        const itemTotal = price * quantity
        return itemSum + itemTotal
      }, 0)
      return sum + calculatedTotal
    }
    return sum
  }, 0)
  const totalOrders = companyOrders.length
  const activeEmployees = companyEmployees.filter(e => e.status === 'active').length
  const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0

  const stats = [
    { name: 'Total Spent', value: `₹${totalSpent.toFixed(2)}`, icon: IndianRupee, color: 'green' },
    { name: 'Total Orders', value: totalOrders, icon: Package, color: 'blue' },
    { name: 'Active Employees', value: activeEmployees, icon: Users, color: 'purple' },
    { name: 'Avg Order Value', value: `₹${avgOrderValue.toFixed(2)}`, icon: BarChart3, color: 'orange' },
  ]

  // Process orders for day-wise visualization
  const dayWiseOrderData = useMemo(() => {
    if (companyOrders.length === 0) return []

    // Set start date to November 1st of current year
    const currentYear = new Date().getFullYear()
    const startDate = new Date(currentYear, 10, 1) // Month is 0-indexed, so 10 = November
    startDate.setHours(0, 0, 0, 0) // Set to start of day

    // Group orders by date
    const ordersByDate: Record<string, {
      date: string
      'Awaiting approval': number
      'Awaiting fulfilment': number
      'Dispatched': number
      'Delivered': number
      total: number
    }> = {}

    companyOrders.forEach((order) => {
      // Parse order date
      let orderDate: Date
      if (order.orderDate instanceof Date) {
        orderDate = order.orderDate
      } else if (typeof order.orderDate === 'string') {
        orderDate = new Date(order.orderDate)
      } else {
        orderDate = new Date()
      }

      // Filter orders from November 1st onwards
      if (orderDate < startDate) {
        return // Skip orders before November 1st
      }

      // Format date as YYYY-MM-DD for sorting
      const dateKey = orderDate.toISOString().split('T')[0]
      // Format date for display (more compact)
      const formattedDate = orderDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric'
      })

      if (!ordersByDate[dateKey]) {
        ordersByDate[dateKey] = {
          date: formattedDate,
          'Awaiting approval': 0,
          'Awaiting fulfilment': 0,
          'Dispatched': 0,
          'Delivered': 0,
          total: 0
        }
      }

      // Count by status
      const status = order.status || 'Awaiting approval'
      if (status in ordersByDate[dateKey]) {
        ordersByDate[dateKey][status as keyof typeof ordersByDate[string]]++
      }
      ordersByDate[dateKey].total++
    })

    // Convert to array and sort by date key
    return Object.entries(ordersByDate)
      .sort(([dateKeyA], [dateKeyB]) => dateKeyA.localeCompare(dateKeyB))
      .map(([, data]) => data)
  }, [companyOrders])

  // Calculate status totals for summary
  const statusTotals = useMemo(() => {
    const totals = {
      'Awaiting approval': 0,
      'Awaiting fulfilment': 0,
      'Dispatched': 0,
      'Delivered': 0
    }

    companyOrders.forEach((order) => {
      const status = order.status || 'Awaiting approval'
      if (status in totals) {
        totals[status as keyof typeof totals]++
      }
    })

    return totals
  }, [companyOrders])

  return (
    <DashboardLayout actorType="company">
      <div>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
          <div className="flex items-center space-x-3">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
              style={{ 
                '--tw-ring-color': companyPrimaryColor || '#f76b1c',
                '--tw-border-color': companyPrimaryColor || '#f76b1c'
              } as React.CSSProperties & { '--tw-ring-color'?: string; '--tw-border-color'?: string }}
              onFocus={(e) => {
                e.target.style.borderColor = companyPrimaryColor || '#f76b1c'
                e.target.style.boxShadow = `0 0 0 2px ${companyPrimaryColor || '#f76b1c'}40`
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#d1d5db'
                e.target.style.boxShadow = 'none'
              }}
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
            <button 
              className="text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center space-x-2"
              style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
              onMouseEnter={(e) => {
                const color = companyPrimaryColor || '#f76b1c'
                const r = parseInt(color.slice(1, 3), 16)
                const g = parseInt(color.slice(3, 5), 16)
                const b = parseInt(color.slice(5, 7), 16)
                const darker = `#${Math.max(0, r - 25).toString(16).padStart(2, '0')}${Math.max(0, g - 25).toString(16).padStart(2, '0')}${Math.max(0, b - 25).toString(16).padStart(2, '0')}`
                e.currentTarget.style.backgroundColor = darker
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = companyPrimaryColor || '#f76b1c'
              }}
            >
              <Download className="h-5 w-5" />
              <span>Export Report</span>
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat) => {
            const Icon = stat.icon
            const getColorClasses = (color: string | undefined) => {
              const primaryColor = companyPrimaryColor || '#f76b1c'
              const secondaryColor = companySecondaryColor || primaryColor
              const colors: Record<string, { bg: string; text: string }> = {
                orange: { bg: `${primaryColor}20`, text: primaryColor },
                blue: { bg: `${secondaryColor}20`, text: secondaryColor },
                green: { bg: 'bg-green-100', text: 'text-green-600' },
                purple: { bg: `${primaryColor}20`, text: primaryColor },
              }
              return colors[color || 'orange'] || { bg: `${primaryColor}20`, text: primaryColor }
            }
            const colorClasses = getColorClasses(stat.color) || { bg: `${companyPrimaryColor || '#f76b1c'}20`, text: companyPrimaryColor || '#f76b1c' }
            return (
              <div key={stat.name} className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm mb-1">{stat.name}</p>
                    <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                  <div 
                    className="p-3 rounded-lg"
                    style={{ backgroundColor: colorClasses.bg }}
                  >
                    <Icon 
                      className="h-6 w-6" 
                      style={{ color: colorClasses.text }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Charts Section */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Day-wise Order Status (Since Nov 1)</h2>
            {dayWiseOrderData.length === 0 ? (
            <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">No order data available</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dayWiseOrderData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    interval={0}
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Awaiting approval" stackId="a" fill="#fbbf24" />
                  <Bar dataKey="Awaiting fulfilment" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="Dispatched" stackId="a" fill="#a855f7" />
                  <Bar dataKey="Delivered" stackId="a" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Order Status Trend (Since Nov 1)</h2>
            {dayWiseOrderData.length === 0 ? (
            <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
              <div className="text-center">
                  <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">No order data available</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dayWiseOrderData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    interval={0}
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Awaiting approval" stroke="#fbbf24" strokeWidth={2} />
                  <Line type="monotone" dataKey="Awaiting fulfilment" stroke="#3b82f6" strokeWidth={2} />
                  <Line type="monotone" dataKey="Dispatched" stroke="#a855f7" strokeWidth={2} />
                  <Line type="monotone" dataKey="Delivered" stroke="#10b981" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Status Summary Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          {[
            { 
              status: 'Awaiting approval', 
              label: 'Awaiting Approval', 
              borderColor: 'border-yellow-500', 
              icon: Calendar, 
              iconBg: 'bg-yellow-100', 
              iconColor: 'text-yellow-600',
              linkHref: '/dashboard/company/approvals'
            },
            { 
              status: 'Awaiting fulfilment', 
              label: 'Awaiting Fulfilment', 
              borderColor: 'border-blue-500', 
              icon: Package, 
              iconBg: 'bg-orange-100', 
              iconColor: 'text-[#f76b1c]',
              linkHref: '/dashboard/company/orders'
            },
            { 
              status: 'Dispatched', 
              label: 'Dispatched', 
              borderColor: 'border-purple-500', 
              icon: BarChart3, 
              iconBg: 'bg-orange-100', 
              iconColor: 'text-[#f76b1c]',
              linkHref: '/dashboard/company/orders'
            },
            { 
              status: 'Delivered', 
              label: 'Delivered', 
              borderColor: 'border-green-500', 
              icon: Package, 
              iconBg: 'bg-orange-100', 
              iconColor: 'text-[#f76b1c]',
              linkHref: '/dashboard/company/orders'
            }
          ].map((statusCard) => {
            const Icon = statusCard.icon
            const count = statusTotals[statusCard.status as keyof typeof statusTotals] || 0
            const isClickable = count > 0
            
            // Get orders for this status
            const getOrdersByStatus = () => {
              return companyOrders
                .filter(order => order.status === statusCard.status)
                .slice(0, 10)
                .map(order => ({
                  id: order.id,
                  employeeName: order.employeeName || 'Unknown',
                  total: order.items && Array.isArray(order.items) && order.items.length > 0
                    ? order.items.reduce((sum: number, item: any) => {
                        const price = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0
                        const quantity = typeof item.quantity === 'number' ? item.quantity : parseInt(item.quantity) || 0
                        return sum + (price * quantity)
                      }, 0)
                    : (order.total || 0),
                  itemsCount: order.items?.length || 0,
                  date: order.orderDate ? new Date(order.orderDate).toLocaleDateString() : 'N/A'
                }))
            }
            
            const ordersList = getOrdersByStatus()
            
            const StatCard = (
              <div 
                className={`glass rounded-2xl shadow-modern-lg p-6 border-l-4 ${statusCard.borderColor} relative ${isClickable ? 'cursor-pointer hover-lift' : ''} transition-smooth`}
                onMouseEnter={() => isClickable && setShowTooltip(statusCard.status)}
                onMouseLeave={() => setShowTooltip(null)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-600 text-sm mb-1 font-medium">{statusCard.label}</p>
                    <p className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">{count}</p>
                  </div>
                  <div className={`${statusCard.iconBg} p-3 rounded-xl shadow-modern`}>
                    <Icon className={`h-6 w-6 ${statusCard.iconColor}`} />
                  </div>
                </div>
                
                {/* Tooltip */}
                {isClickable && showTooltip === statusCard.status && ordersList.length > 0 && (
                  <div className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-2 w-80 bg-gray-900 text-white rounded-lg shadow-2xl p-4 pointer-events-none">
                    <div className="text-sm font-semibold mb-3 pb-2 border-b border-gray-700">
                      {statusCard.label} Orders ({count} total)
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {ordersList.map((order: any, idx: number) => (
                        <div key={idx} className="text-xs">
                          <div className="font-semibold text-white mb-1">Order #{order.id}</div>
                          <div className="text-gray-300">Employee: {order.employeeName || 'N/A'}</div>
                          <div className="text-gray-300">Amount: ₹{order.total.toFixed(2)}</div>
                          <div className="text-gray-300">Items: {order.itemsCount}</div>
                          <div className="text-gray-400">Date: {order.date}</div>
                          {idx < ordersList.length - 1 && (
                            <div className="border-t border-gray-700 mt-2 pt-2"></div>
                          )}
                        </div>
                      ))}
                      {count > 10 && (
                        <div className="text-xs text-gray-400 mt-2">...and {count - 10} more</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
            
            if (isClickable) {
              return (
                <div key={statusCard.status} className="relative">
                  <Link href={statusCard.linkHref} className="block">
                    {StatCard}
                  </Link>
                </div>
              )
            }
            
            return (
              <div key={statusCard.status}>
                {StatCard}
              </div>
            )
          })}
        </div>

        {/* Order Details Table */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Order Details ({period})</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Order ID</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Employee</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Items</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Amount</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Date</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {companyOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No orders found for your company
                    </td>
                  </tr>
                ) : (
                  companyOrders.map((order) => (
                  <tr key={order.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-900 font-medium">{order.id}</td>
                    <td className="py-3 px-4 text-gray-600">{order.employeeName || 'N/A'}</td>
                    <td className="py-3 px-4 text-gray-600">{order.items.length} items</td>
                    <td className="py-3 px-4 text-gray-900 font-semibold">₹{order.total.toFixed(2)}</td>
                    <td className="py-3 px-4 text-gray-600">{order.orderDate}</td>
                    <td className="py-3 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        order.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                        order.status === 'delivered' ? 'bg-blue-100 text-blue-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                  </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

