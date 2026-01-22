'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Star, MessageSquare, Search, Filter, ChevronDown, ChevronRight, Building2 } from 'lucide-react'
import { getProductFeedback, getCompanyById, getLocationByAdminEmail } from '@/lib/data-mongodb'

export default function ConsumerFeedbackPage() {
  console.log('[ConsumerFeedbackPage] Component mounted/rendered')
  
  const [feedback, setFeedback] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [companyPrimaryColor, setCompanyPrimaryColor] = useState<string>('#f76b1c')
  const [isLocationAdmin, setIsLocationAdmin] = useState<boolean>(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterRating, setFilterRating] = useState<string>('all')
  const [filterVendor, setFilterVendor] = useState<string>('all')
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set())

  useEffect(() => {
    console.log('[ConsumerFeedbackPage] useEffect triggered')
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        try {
          setLoading(true)
          // CRITICAL SECURITY FIX: Use tab-specific auth storage
          const { getUserEmail } = await import('@/lib/utils/auth-storage')
          const userEmail = getUserEmail('consumer')
          if (!userEmail) {
            console.error('[ConsumerFeedbackPage] No user email found')
            setAccessDenied(true)
            setLoading(false)
            return
          }

          // Check if user is Location Admin
          const location = await getLocationByAdminEmail(userEmail)
          const isLocationAdminUser = !!location
          setIsLocationAdmin(isLocationAdminUser)

          if (!isLocationAdminUser || !location) {
            // Not a Location Admin - deny access
            console.log('[ConsumerFeedbackPage] Access denied - user is not a Location Admin')
            setAccessDenied(true)
            setLoading(false)
            return
          }

          // Location Admin: Check if they have access
          console.log('[ConsumerFeedbackPage] Location Admin detected:', {
            locationId: location.id,
            locationName: location.name,
            locationCompanyId: location.companyId,
            locationCompanyIdType: typeof location.companyId
          })
          
          // Get company ID from location - handle both populated and non-populated cases
          let locationCompanyIdStr: string | null = null
          if (location.companyId) {
            if (typeof location.companyId === 'object' && location.companyId !== null) {
              // Populated company object
              locationCompanyIdStr = location.companyId.id || null
            } else if (typeof location.companyId === 'string') {
              // Check if it's a company ID string (6-digit) or ObjectId string (24 hex)
              if (/^[A-Za-z0-9_-]{1,50}$/.test(location.companyId)) {
                locationCompanyIdStr = location.companyId
              } else {
                // It's an ObjectId - need to find company by _id
                console.warn('[ConsumerFeedbackPage] Location has ObjectId companyId, need to lookup company')
                locationCompanyIdStr = null
              }
            }
          }
          
          console.log('[ConsumerFeedbackPage] Extracted company ID:', locationCompanyIdStr)
          
          if (locationCompanyIdStr) {
            try {
              const company = await getCompanyById(locationCompanyIdStr)
              console.log('[ConsumerFeedbackPage] Company lookup result:', {
                found: !!company,
                companyId: locationCompanyIdStr,
                allowLocationAdminViewFeedback: company?.allowLocationAdminViewFeedback
              })
              
              if (!company) {
                // Company not found - deny access
                console.warn('[ConsumerFeedbackPage] Company not found - access denied')
                setAccessDenied(true)
                setLoading(false)
                return
              } else if (!company.allowLocationAdminViewFeedback) {
                // Setting is OFF - access denied
                console.log('[ConsumerFeedbackPage] Location Admin access denied - setting is OFF')
                setAccessDenied(true)
                setLoading(false)
                return
              } else {
                // Setting is ON - allow access
                console.log('[ConsumerFeedbackPage] Location Admin access granted - setting is ON')
                setCompanyPrimaryColor(company.primaryColor || '#f76b1c')
              }
            } catch (error) {
              console.error('[ConsumerFeedbackPage] Error checking company setting:', error)
              setAccessDenied(true)
              setLoading(false)
              return
            }
          } else {
            // Company ID not found - deny access
            console.warn('[ConsumerFeedbackPage] Could not extract company ID from location - access denied')
            setAccessDenied(true)
            setLoading(false)
            return
          }

          // Load feedback
          console.log('[ConsumerFeedbackPage] About to call getProductFeedback API')
          try {
            const feedbackData = await getProductFeedback()
            console.log(`[ConsumerFeedbackPage] ✅ Loaded ${feedbackData.length} feedback records from API`)
            console.log(`[ConsumerFeedbackPage] Feedback vendor breakdown:`, 
              feedbackData.map((fb: any) => ({
                orderId: fb.orderId,
                productId: fb.productId,
                uniformName: fb.uniformId?.name,
                vendorName: fb.vendorId?.name || 'Unknown',
                vendorId: fb.vendorId?._id || fb.vendorId || 'null',
                hasVendorId: !!fb.vendorId,
                employeeName: fb.employeeId?.firstName && fb.employeeId?.lastName
                  ? `${fb.employeeId.firstName} ${fb.employeeId.lastName}`
                  : fb.employeeId?.firstName || fb.employeeId?.lastName || 'N/A',
                hasEmployeeData: !!fb.employeeId
              }))
            )
            setFeedback(feedbackData)
          } catch (feedbackError: any) {
            console.error('[ConsumerFeedbackPage] Error loading feedback:', feedbackError)
            setFeedback([])
          }
        } catch (error: any) {
          console.error('[ConsumerFeedbackPage] Error in loadData:', error)
          console.error('[ConsumerFeedbackPage] Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
          })
          if (error.message?.includes('not found') || error.message?.includes('access')) {
            setAccessDenied(true)
          }
        } finally {
          setLoading(false)
          console.log('[ConsumerFeedbackPage] loadData completed, loading set to false')
        }
      }

      loadData()
    }
  }, [])

  // Get unique vendors for filter dropdown
  const uniqueVendors = Array.from(
    new Set(
      feedback
        .map((fb) => fb.vendorId?.name || 'Unknown Vendor')
        .filter((name) => name !== 'Unknown Vendor' || feedback.some((fb) => !fb.vendorId?.name))
    )
  ).sort()

  const filteredFeedback = feedback.filter((fb) => {
    const matchesSearch = 
      fb.orderId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fb.productId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fb.uniformId?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fb.employeeId?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fb.employeeId?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fb.comment?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fb.vendorId?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesRating = filterRating === 'all' || fb.rating === parseInt(filterRating)
    const matchesVendor = filterVendor === 'all' || (fb.vendorId?.name || 'Unknown Vendor') === filterVendor
    
    return matchesSearch && matchesRating && matchesVendor
  })

  // Group feedback by vendor
  const groupedFeedback = filteredFeedback.reduce((acc, fb) => {
    const vendorName = fb.vendorId?.name || 'Unknown Vendor'
    if (!acc[vendorName]) {
      acc[vendorName] = []
    }
    acc[vendorName].push(fb)
    return acc
  }, {} as Record<string, typeof filteredFeedback>)
  
  // Debug: Log grouping results
  console.log(`[ConsumerFeedbackPage] Filtered feedback count: ${filteredFeedback.length}`)
  console.log(`[ConsumerFeedbackPage] Grouped feedback:`, 
    Object.entries(groupedFeedback).map(([vendor, feedbacks]) => ({
      vendor,
      count: feedbacks.length,
      orderIds: feedbacks.map((fb: any) => fb.orderId)
    }))
  )

  // Initialize expanded vendors (expand all by default) when feedback is first loaded
  useEffect(() => {
    const vendorKeys = Object.keys(groupedFeedback)
    if (vendorKeys.length > 0) {
      const currentVendors = Array.from(expandedVendors)
      const newVendors = vendorKeys.filter(v => !currentVendors.includes(v))
      if (expandedVendors.size === 0 || newVendors.length > 0) {
        setExpandedVendors(new Set(vendorKeys))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback.length, filterVendor])

  const toggleVendor = (vendorName: string) => {
    setExpandedVendors((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(vendorName)) {
        newSet.delete(vendorName)
      } else {
        newSet.add(vendorName)
      }
      return newSet
    })
  }

  if (loading) {
    return (
      <DashboardLayout actorType="consumer">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-gray-600">Loading feedback...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (accessDenied) {
    return (
      <DashboardLayout actorType="consumer">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-red-600 font-semibold">Access Denied</p>
            <p className="text-gray-600 mt-2">
              {isLocationAdmin 
                ? 'Location Admins do not have access to view feedback. Please contact Company Admin to enable this feature.'
                : 'You are not authorized to view this page. This page is only accessible to Location Admins.'}
            </p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="consumer">
      <div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Product Feedback</h1>
          <p className="text-gray-600 mt-2">View feedback submitted by employees for delivered products</p>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="text"
                placeholder="Search feedback..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                style={{ 
                  '--tw-ring-color': companyPrimaryColor || '#f76b1c',
                  '--tw-border-color': companyPrimaryColor || '#f76b1c'
                } as React.CSSProperties & { '--tw-ring-color'?: string; '--tw-border-color'?: string }}
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <select
                value={filterRating}
                onChange={(e) => setFilterRating(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                style={{ 
                  '--tw-ring-color': companyPrimaryColor || '#f76b1c',
                  '--tw-border-color': companyPrimaryColor || '#f76b1c'
                } as React.CSSProperties & { '--tw-ring-color'?: string; '--tw-border-color'?: string }}
              >
                <option value="all">All Ratings</option>
                <option value="5">5 Stars</option>
                <option value="4">4 Stars</option>
                <option value="3">3 Stars</option>
                <option value="2">2 Stars</option>
                <option value="1">1 Star</option>
              </select>
            </div>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <select
                value={filterVendor}
                onChange={(e) => setFilterVendor(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                style={{ 
                  '--tw-ring-color': companyPrimaryColor || '#f76b1c',
                  '--tw-border-color': companyPrimaryColor || '#f76b1c'
                } as React.CSSProperties & { '--tw-ring-color'?: string; '--tw-border-color'?: string }}
              >
                <option value="all">All Vendors</option>
                {uniqueVendors.map((vendor) => (
                  <option key={vendor} value={vendor}>
                    {vendor}
                  </option>
                ))}
                {feedback.some((fb) => !fb.vendorId?.name) && (
                  <option value="Unknown Vendor">Unknown Vendor</option>
                )}
              </select>
            </div>
          </div>
        </div>

        {/* Feedback List */}
        {filteredFeedback.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <MessageSquare className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">No Feedback Found</h2>
            <p className="text-gray-600">
              {searchTerm || filterRating !== 'all' || filterVendor !== 'all'
                ? 'No feedback matches your search criteria.'
                : 'No feedback has been submitted yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedFeedback)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([vendorName, vendorFeedback]) => {
                const isExpanded = expandedVendors.has(vendorName)
                return (
                  <div key={vendorName} className="bg-white rounded-xl shadow-lg overflow-hidden">
                    {/* Vendor Header - Collapsible */}
                    <button
                      onClick={() => toggleVendor(vendorName)}
                      className="w-full px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 transition-colors flex items-center justify-between border-b border-gray-200"
                    >
                      <div className="flex items-center space-x-3">
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5 text-gray-600" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-gray-600" />
                        )}
                        <Building2 className="h-5 w-5 text-gray-600" />
                        <h2 className="text-lg font-bold text-gray-900">{vendorName}</h2>
                        <span className="text-sm text-gray-500 bg-white px-2 py-1 rounded-full">
                          {vendorFeedback.length} feedback{vendorFeedback.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </button>

                    {/* Vendor Feedback Items - Card Grid */}
                    {isExpanded && (
                      <div className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                          {vendorFeedback.map((fb: any, index: number) => (
                            <div key={fb._id || `${fb.orderId}-${fb.productId}-${fb.employeeId?._id || fb.employeeId || index}`} className="bg-white rounded-lg shadow-md p-4 border border-gray-200 hover:shadow-lg transition-shadow flex flex-col">
                              <div className="flex-1">
                                <div className="mb-3">
                                  <p className="text-xs text-gray-500 mb-1">Order #{fb.orderId}</p>
                                  <h3 className="text-sm font-semibold text-gray-900 mb-2 line-clamp-2">
                                    {fb.uniformId?.name || fb.productId}
                                  </h3>
                                  <p className="text-xs text-gray-600 mb-3">
                                    Employee: {fb.employeeId?.firstName && fb.employeeId?.lastName
                                      ? `${fb.employeeId.firstName} ${fb.employeeId.lastName}`
                                      : fb.employeeId?.firstName || fb.employeeId?.lastName || 'N/A'}
                                  </p>
                                </div>
                                
                                <div className="flex items-center space-x-1 mb-3">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <Star
                                      key={star}
                                      className={`h-4 w-4 ${
                                        star <= fb.rating
                                          ? 'fill-yellow-400 text-yellow-400'
                                          : 'text-gray-300'
                                      }`}
                                    />
                                  ))}
                                  <span className="ml-1 text-xs font-semibold text-gray-700">
                                    {fb.rating}/5
                                  </span>
                                </div>
                                
                                {fb.comment && (
                                  <div className="bg-gray-50 rounded-lg p-3 mb-3">
                                    <div className="flex items-start space-x-2">
                                      <MessageSquare className="h-3 w-3 text-gray-500 mt-0.5 flex-shrink-0" />
                                      <p className="text-xs text-gray-700 line-clamp-3">{fb.comment}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              <div className="mt-auto pt-3 border-t border-gray-200">
                                <p className="text-xs text-gray-500">
                                  {fb.createdAt 
                                    ? new Date(fb.createdAt).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                      })
                                    : 'N/A'}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
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

