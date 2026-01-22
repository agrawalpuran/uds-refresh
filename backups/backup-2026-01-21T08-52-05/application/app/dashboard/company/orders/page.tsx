'use client'

import { useState, useEffect, useMemo } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Search, Package, FileText, ChevronDown, Calendar, MapPin, User, CreditCard, Truck, CheckCircle, Clock, AlertCircle, X, Filter, RefreshCw, XCircle, FileCheck, Send, Building2 } from 'lucide-react'
import { getOrdersByCompany, getCompanyById, getLocationByAdminEmail, getOrdersByLocation } from '@/lib/data-mongodb'

// PR Status tabs configuration
const PR_STATUS_TABS = [
  { id: 'all', label: 'All Orders', icon: Package },
  { id: 'pending_site_admin', label: 'Pending Site Admin', icon: Clock, statuses: ['PENDING_SITE_ADMIN_APPROVAL'] },
  { id: 'site_admin_approved', label: 'Site Admin Approved', icon: CheckCircle, statuses: ['SITE_ADMIN_APPROVED'] },
  { id: 'pending_company_admin', label: 'Pending Company Admin', icon: Building2, statuses: ['PENDING_COMPANY_ADMIN_APPROVAL'] },
  { id: 'company_admin_approved', label: 'Company Admin Approved', icon: FileCheck, statuses: ['COMPANY_ADMIN_APPROVED'] },
  { id: 'po_created', label: 'PO Created', icon: FileText, statuses: ['LINKED_TO_PO', 'PO_CREATED'] },
  { id: 'in_shipment', label: 'In Shipment', icon: Truck, statuses: ['IN_SHIPMENT', 'PARTIALLY_DELIVERED'] },
  { id: 'delivered', label: 'Delivered', icon: CheckCircle, statuses: ['FULLY_DELIVERED'] },
  { id: 'rejected', label: 'Rejected', icon: XCircle, statuses: ['REJECTED', 'REJECTED_BY_SITE_ADMIN', 'REJECTED_BY_COMPANY_ADMIN'] },
]

// Status badge component with modern styling
const StatusBadge = ({ status, prStatus }: { status: string; prStatus?: string }) => {
  const displayStatus = prStatus || status
  
  const statusConfig: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
    // PR Statuses
    'PENDING_SITE_ADMIN_APPROVAL': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: <Clock className="h-3.5 w-3.5" /> },
    'SITE_ADMIN_APPROVED': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: <CheckCircle className="h-3.5 w-3.5" /> },
    'PENDING_COMPANY_ADMIN_APPROVAL': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', icon: <Building2 className="h-3.5 w-3.5" /> },
    'COMPANY_ADMIN_APPROVED': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', icon: <FileCheck className="h-3.5 w-3.5" /> },
    'LINKED_TO_PO': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: <FileText className="h-3.5 w-3.5" /> },
    'PO_CREATED': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: <FileText className="h-3.5 w-3.5" /> },
    'IN_SHIPMENT': { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', icon: <Truck className="h-3.5 w-3.5" /> },
    'PARTIALLY_DELIVERED': { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', icon: <Truck className="h-3.5 w-3.5" /> },
    'FULLY_DELIVERED': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: <CheckCircle className="h-3.5 w-3.5" /> },
    'REJECTED': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: <XCircle className="h-3.5 w-3.5" /> },
    'REJECTED_BY_SITE_ADMIN': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: <XCircle className="h-3.5 w-3.5" /> },
    'REJECTED_BY_COMPANY_ADMIN': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: <XCircle className="h-3.5 w-3.5" /> },
    // Legacy statuses
    'delivered': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: <CheckCircle className="h-3.5 w-3.5" /> },
    'Delivered': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: <CheckCircle className="h-3.5 w-3.5" /> },
    'dispatched': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: <Truck className="h-3.5 w-3.5" /> },
    'Dispatched': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: <Truck className="h-3.5 w-3.5" /> },
    'confirmed': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', icon: <CheckCircle className="h-3.5 w-3.5" /> },
    'processing': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: <Clock className="h-3.5 w-3.5" /> },
    'pending': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: <Clock className="h-3.5 w-3.5" /> },
    'Awaiting approval': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: <Clock className="h-3.5 w-3.5" /> },
    'Awaiting fulfilment': { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', icon: <Package className="h-3.5 w-3.5" /> },
    'cancelled': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: <X className="h-3.5 w-3.5" /> },
  }

  const config = statusConfig[displayStatus] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', icon: <AlertCircle className="h-3.5 w-3.5" /> }
  const displayLabel = displayStatus.replace(/_/g, ' ')

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}>
      {config.icon}
      <span className="capitalize">{displayLabel}</span>
    </span>
  )
}

export default function CompanyOrdersPage() {
  const [companyId, setCompanyId] = useState<string>('')
  const [companyOrders, setCompanyOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [companyPrimaryColor, setCompanyPrimaryColor] = useState<string>('#f76b1c')
  const [companySecondaryColor, setCompanySecondaryColor] = useState<string>('#f76b1c')
  const [isLocationAdmin, setIsLocationAdmin] = useState<boolean>(false)
  const [locationInfo, setLocationInfo] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [locationFilter, setLocationFilter] = useState('all')
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  
  // Get company ID from localStorage (set during login)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        try {
          setLoading(true)
          const storedCompanyId = localStorage.getItem('companyId')
          const { getUserEmail } = await import('@/lib/utils/auth-storage')
          const userEmail = getUserEmail('company')
          
          // Check if user is Location Admin
          let locationAdminLocation = null
          if (userEmail) {
            locationAdminLocation = await getLocationByAdminEmail(userEmail)
            const isLocationAdminUser = !!locationAdminLocation
            setIsLocationAdmin(isLocationAdminUser)
            setLocationInfo(locationAdminLocation)
            
            if (isLocationAdminUser && locationAdminLocation) {
              const locationId = locationAdminLocation.id || locationAdminLocation._id?.toString()
              if (locationId) {
                const locationOrders = await getOrdersByLocation(locationId)
                setCompanyOrders(locationOrders)
                
                const targetCompanyId = locationAdminLocation.companyId?.id || locationAdminLocation.companyId || storedCompanyId
                if (targetCompanyId) {
                  setCompanyId(targetCompanyId)
                  const companyDetails = await getCompanyById(targetCompanyId)
                  if (companyDetails) {
                    setCompanyPrimaryColor(companyDetails.primaryColor || '#f76b1c')
                    setCompanySecondaryColor(companyDetails.secondaryColor || companyDetails.primaryColor || '#f76b1c')
                  }
                }
                return
              }
            }
          }
          
          if (storedCompanyId) {
            setCompanyId(storedCompanyId)
            const filtered = await getOrdersByCompany(storedCompanyId)
            if (filtered.length > 0) {
              console.log('[OrderHistory] Sample order:', {
                id: filtered[0].id,
                employeeName: filtered[0].employeeName,
                unified_pr_status: filtered[0].unified_pr_status,
                prNumber: filtered[0].prNumber,
                poNumbers: filtered[0].poNumbers,
              })
            }
            setCompanyOrders(filtered)
            
            const companyDetails = await getCompanyById(storedCompanyId)
            if (companyDetails) {
              setCompanyPrimaryColor(companyDetails.primaryColor || '#f76b1c')
              setCompanySecondaryColor(companyDetails.secondaryColor || companyDetails.primaryColor || '#f76b1c')
            }
          }
        } catch (error) {
          console.error('Error loading orders:', error)
        } finally {
          setLoading(false)
        }
      }
      
      loadData()
    }
  }, [])

  // Get unique locations for filter
  const uniqueLocations = useMemo(() => {
    const locations = new Set<string>()
    companyOrders.forEach(order => {
      if (order.dispatchLocation) {
        locations.add(order.dispatchLocation)
      }
    })
    return Array.from(locations)
  }, [companyOrders])

  // Get tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: companyOrders.length }
    PR_STATUS_TABS.forEach(tab => {
      if (tab.statuses) {
        counts[tab.id] = companyOrders.filter(order => 
          tab.statuses!.includes(order.unified_pr_status) || 
          tab.statuses!.includes(order.pr_status)
        ).length
      }
    })
    return counts
  }, [companyOrders])

  // Filter orders based on search, tab, and location
  const filteredOrders = useMemo(() => {
    return companyOrders.filter(order => {
      // Search filter
      const searchLower = searchQuery.toLowerCase()
      const matchesSearch = !searchQuery || 
        order.id?.toLowerCase().includes(searchLower) ||
        order.employeeName?.toLowerCase().includes(searchLower) ||
        order.prNumber?.toLowerCase().includes(searchLower) ||
        order.pr_number?.toLowerCase().includes(searchLower) ||
        order.poNumbers?.some((po: string) => po?.toLowerCase().includes(searchLower))

      // Tab filter (PR Status)
      const currentTab = PR_STATUS_TABS.find(t => t.id === activeTab)
      const matchesTab = activeTab === 'all' || (
        currentTab?.statuses && (
          currentTab.statuses.includes(order.unified_pr_status) ||
          currentTab.statuses.includes(order.pr_status)
        )
      )

      // Location filter
      const matchesLocation = locationFilter === 'all' ||
        order.dispatchLocation === locationFilter

      return matchesSearch && matchesTab && matchesLocation
    })
  }, [companyOrders, searchQuery, activeTab, locationFilter])

  // Format date nicely
  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A'
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return dateString
    }
  }

  // Helper to check if name appears to be encrypted (base64 with special chars)
  const isEncryptedValue = (value: string | undefined): boolean => {
    if (!value) return false
    // Check for typical encrypted patterns: contains / or + in middle, or looks like base64
    const hasEncryptedPattern = /^[A-Za-z0-9+/=]{10,}$/.test(value) || value.includes('/') || value.includes('+')
    // Names typically have spaces and letters only
    const looksLikeName = /^[A-Za-z\s.'-]+$/.test(value) && value.includes(' ')
    return hasEncryptedPattern && !looksLikeName
  }

  // Format employee name - show N/A if encrypted
  const formatEmployeeName = (name: string | undefined): string => {
    if (!name) return 'N/A'
    if (isEncryptedValue(name)) return 'N/A'
    return name
  }

  return (
    <DashboardLayout actorType="company">
      <div className="min-h-screen">
        {/* Header Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Order Management</h1>
              <p className="mt-1 text-sm text-gray-500">
                {isLocationAdmin 
                  ? `Viewing orders for ${locationInfo?.name || 'your location'}`
                  : `Manage and track all purchase requisitions`
                }
              </p>
            </div>
            <button 
              onClick={() => {
                window.location.href = '/dashboard/company/batch-upload'
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-white font-medium rounded-xl shadow-lg shadow-orange-500/25 transition-all hover:shadow-xl hover:shadow-orange-500/30 hover:-translate-y-0.5"
              style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
            >
              <Package className="h-4 w-4" />
              Place Bulk Order
            </button>
          </div>
        </div>

        {/* PR Status Tabs */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
          <div className="overflow-x-auto">
            <div className="flex min-w-max border-b border-gray-100">
              {PR_STATUS_TABS.map((tab) => {
                const Icon = tab.icon
                const count = tabCounts[tab.id] || 0
                const isActive = activeTab === tab.id
                
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-5 py-4 text-sm font-medium transition-all relative whitespace-nowrap ${
                      isActive 
                        ? 'text-gray-900' 
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? '' : 'opacity-70'}`} style={isActive ? { color: companyPrimaryColor } : {}} />
                    <span>{tab.label}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      isActive 
                        ? 'text-white' 
                        : 'bg-gray-100 text-gray-600'
                    }`} style={isActive ? { backgroundColor: companyPrimaryColor } : {}}>
                      {count}
                    </span>
                    {isActive && (
                      <div 
                        className="absolute bottom-0 left-0 right-0 h-0.5" 
                        style={{ backgroundColor: companyPrimaryColor }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Filters Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by Order ID, Employee, PR, or PO..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-0 rounded-xl text-sm placeholder-gray-400 focus:bg-white focus:ring-2 transition-all outline-none"
                style={{ '--tw-ring-color': `${companyPrimaryColor}40` } as React.CSSProperties}
              />
            </div>

            {/* Location Filter */}
            <div className="relative">
              <MapPin className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <select 
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border-0 rounded-xl text-sm text-gray-700 focus:bg-white focus:ring-2 transition-all outline-none appearance-none cursor-pointer"
                style={{ '--tw-ring-color': `${companyPrimaryColor}40` } as React.CSSProperties}
              >
                <option value="all">All Locations</option>
                {uniqueLocations.map((location) => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-3 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: companyPrimaryColor, borderWidth: '3px' }} />
                <p className="text-sm text-gray-500">Loading orders...</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-50 to-gray-50/50">
                    <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">PO Number</th>
                    <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">PR Number</th>
                    <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Order ID</th>
                    <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                    <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Items</th>
                    <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Payment</th>
                    <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</th>
                    <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">PR Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                            <Package className="h-8 w-8 text-gray-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">No orders found</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {activeTab !== 'all' 
                                ? `No orders with "${PR_STATUS_TABS.find(t => t.id === activeTab)?.label}" status`
                                : 'Try adjusting your filters or search query'
                              }
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => (
                      <tr 
                        key={order.id} 
                        className="hover:bg-gray-50/50 transition-colors group"
                      >
                        {/* PO Number */}
                        <td className="py-4 px-5">
                          {order.poNumbers && order.poNumbers.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {order.poNumbers.slice(0, 2).map((po: string, idx: number) => (
                                <span key={idx} className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                                  <FileText className="h-3 w-3" />
                                  {po}
                                </span>
                              ))}
                              {order.poNumbers.length > 2 && (
                                <span className="text-xs text-gray-400">+{order.poNumbers.length - 2} more</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Not assigned</span>
                          )}
                        </td>

                        {/* PR Number */}
                        <td className="py-4 px-5">
                          {order.prNumber || order.pr_number ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                              <FileText className="h-3 w-3" />
                              {order.prNumber || order.pr_number}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 italic">N/A</span>
                          )}
                        </td>

                        {/* Order ID */}
                        <td className="py-4 px-5">
                          <div className="max-w-[120px]">
                            <p className="text-xs font-mono text-gray-700 truncate" title={order.id}>
                              {order.id}
                            </p>
                          </div>
                        </td>

                        {/* Employee */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center flex-shrink-0">
                              <User className="h-4 w-4 text-gray-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm text-gray-900 font-medium truncate max-w-[120px]">
                                {formatEmployeeName(order.employeeName)}
                              </p>
                              {order.employeeIdNum && (
                                <p className="text-xs text-gray-400">{order.employeeIdNum}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Items */}
                        <td className="py-4 px-5">
                          <div className="max-w-[180px]">
                            {order.items?.slice(0, 2).map((item: any, idx: number) => (
                              <div key={idx} className="text-xs text-gray-600 truncate leading-relaxed">
                                <span className="font-medium text-gray-800">{item.uniformName}</span>
                                <span className="text-gray-400"> • {item.size} × {item.quantity}</span>
                              </div>
                            ))}
                            {order.items?.length > 2 && (
                              <span className="text-xs text-gray-400">+{order.items.length - 2} more items</span>
                            )}
                          </div>
                        </td>

                        {/* Total */}
                        <td className="py-4 px-5">
                          <span className="text-sm font-semibold text-gray-900">
                            ₹{order.total?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
                          </span>
                        </td>

                        {/* Payment Type */}
                        <td className="py-4 px-5">
                          {order.isPersonalPayment ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              <CreditCard className="h-3 w-3" />
                              Personal
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle className="h-3 w-3" />
                              Company
                            </span>
                          )}
                        </td>

                        {/* Location */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-1.5 text-sm text-gray-600">
                            <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                            <span className="truncate max-w-[100px]">{order.dispatchLocation || 'N/A'}</span>
                          </div>
                        </td>

                        {/* Date */}
                        <td className="py-4 px-5">
                          <div className="text-xs text-gray-600">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-gray-400" />
                              {formatDate(order.orderDate)}
                            </div>
                          </div>
                        </td>

                        {/* PR Status */}
                        <td className="py-4 px-5">
                          <StatusBadge 
                            status={order.status} 
                            prStatus={order.unified_pr_status || order.pr_status} 
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Stats */}
        {!loading && filteredOrders.length > 0 && (
          <div className="mt-6 flex items-center justify-between text-sm text-gray-500">
            <p>
              Showing <span className="font-medium text-gray-900">{filteredOrders.length}</span> of{' '}
              <span className="font-medium text-gray-900">{companyOrders.length}</span> orders
            </p>
            <p>
              Total Value: <span className="font-semibold text-gray-900">
                ₹{filteredOrders.reduce((sum, order) => sum + (order.total || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </p>
          </div>
        )}

        {/* Order Detail Modal */}
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedOrder(null)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Order Details</h3>
                <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Order Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Order ID</p>
                    <p className="text-sm font-mono text-gray-900">{selectedOrder.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">PR Number</p>
                    <p className="text-sm font-medium text-gray-900">{selectedOrder.prNumber || selectedOrder.pr_number || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">PO Number(s)</p>
                    <p className="text-sm font-medium text-gray-900">
                      {selectedOrder.poNumbers?.length > 0 ? selectedOrder.poNumbers.join(', ') : 'Not assigned'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Status</p>
                    <StatusBadge status={selectedOrder.status} prStatus={selectedOrder.unified_pr_status || selectedOrder.pr_status} />
                  </div>
                </div>

                {/* Employee Info */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Employee Information</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-gray-200">
                      <User className="h-5 w-5 text-gray-500" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{formatEmployeeName(selectedOrder.employeeName)}</p>
                      <p className="text-sm text-gray-500">ID: {selectedOrder.employeeIdNum || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Order Items</p>
                  <div className="space-y-2">
                    {selectedOrder.items?.map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">{item.uniformName}</p>
                          <p className="text-sm text-gray-500">Size: {item.size} • Qty: {item.quantity}</p>
                        </div>
                        <p className="font-semibold text-gray-900">₹{(item.price * item.quantity).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Total */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <span className="text-lg font-medium text-gray-700">Total Amount</span>
                  <span className="text-xl font-bold text-gray-900">
                    ₹{selectedOrder.total?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Additional Info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Dispatch Location</p>
                    <p className="font-medium text-gray-900">{selectedOrder.dispatchLocation || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Order Date</p>
                    <p className="font-medium text-gray-900">{formatDate(selectedOrder.orderDate)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Payment Type</p>
                    <p className="font-medium text-gray-900">{selectedOrder.isPersonalPayment ? 'Personal Payment' : 'Company Paid'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Vendor</p>
                    <p className="font-medium text-gray-900">{selectedOrder.vendorName || 'N/A'}</p>
                  </div>
                </div>

                {/* Approval Info */}
                {(selectedOrder.site_admin_approved_at || selectedOrder.company_admin_approved_at) && (
                  <div className="bg-emerald-50 rounded-xl p-4">
                    <p className="text-xs text-emerald-600 uppercase tracking-wide mb-2">Approval History</p>
                    {selectedOrder.site_admin_approved_at && (
                      <p className="text-sm text-emerald-700">
                        Site Admin Approved: {formatDate(selectedOrder.site_admin_approved_at)}
                      </p>
                    )}
                    {selectedOrder.company_admin_approved_at && (
                      <p className="text-sm text-emerald-700">
                        Company Admin Approved: {formatDate(selectedOrder.company_admin_approved_at)}
                      </p>
                    )}
                  </div>
                )}

                {/* Rejection Info */}
                {selectedOrder.rejection_reason && (
                  <div className="bg-red-50 rounded-xl p-4">
                    <p className="text-xs text-red-600 uppercase tracking-wide mb-2">Rejection Reason</p>
                    <p className="text-sm text-red-700">{selectedOrder.rejection_reason}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
