'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Star, MessageSquare, Search, Filter } from 'lucide-react'
import { getProductFeedback, getVendorById } from '@/lib/data-mongodb'
import { maskEmployeeName } from '@/lib/utils/data-masking'

export default function VendorFeedbackPage() {
  const [feedback, setFeedback] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [vendorPrimaryColor, setVendorPrimaryColor] = useState<string>('#2563eb')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterRating, setFilterRating] = useState<string>('all')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        try {
          setLoading(true)
          const vendorId = localStorage.getItem('vendorId')
          if (vendorId) {
            const vendor = await getVendorById(vendorId)
            if (vendor) {
              setVendorPrimaryColor(vendor.primaryColor || '#2563eb')
            }
          }

          // Load feedback (vendor can see feedback for their products)
          // Backend automatically filters by vendorId based on logged-in vendor
          const feedbackData = await getProductFeedback()
          setFeedback(feedbackData)
        } catch (error: any) {
          console.error('Error loading feedback:', error)
        } finally {
          setLoading(false)
        }
      }

      loadData()
    }
  }, [])

  const filteredFeedback = feedback.filter((fb) => {
    const matchesSearch = 
      fb.orderId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fb.productId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fb.uniformId?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fb.comment?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesRating = filterRating === 'all' || fb.rating === parseInt(filterRating)
    
    return matchesSearch && matchesRating
  })

  if (loading) {
    return (
      <DashboardLayout actorType="vendor">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-gray-600">Loading feedback...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="vendor">
      <div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Product Feedback</h1>
          <p className="text-gray-600 mt-2">View feedback submitted by employees for your products</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search feedback..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                style={{ 
                  '--tw-ring-color': vendorPrimaryColor || '#2563eb',
                  '--tw-border-color': vendorPrimaryColor || '#2563eb'
                } as React.CSSProperties & { '--tw-ring-color'?: string; '--tw-border-color'?: string }}
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <select
                value={filterRating}
                onChange={(e) => setFilterRating(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                style={{ 
                  '--tw-ring-color': vendorPrimaryColor || '#2563eb',
                  '--tw-border-color': vendorPrimaryColor || '#2563eb'
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
          </div>
        </div>

        {/* Feedback List */}
        {filteredFeedback.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <MessageSquare className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">No Feedback Found</h2>
            <p className="text-gray-600">
              {searchTerm || filterRating !== 'all' 
                ? 'No feedback matches your search criteria.'
                : 'No feedback has been submitted for your products yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredFeedback.map((fb: any, index: number) => (
              <div key={fb._id || `${fb.orderId}-${fb.productId}-${fb.employeeId?._id || fb.employeeId || index}`} className="bg-white rounded-xl shadow-lg p-4 border-l-4 border-green-500 border border-gray-200 hover:shadow-xl transition-shadow flex flex-col">
                <div className="flex-1">
                  {/* Header with PO/PR Numbers */}
                  <div className="mb-3">
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      {fb.poNumber ? (
                        <h3 className="text-sm font-bold text-gray-900 truncate">PO: {fb.poNumber}</h3>
                      ) : (
                        <h3 className="text-sm font-bold text-gray-900 truncate">{fb.uniformId?.name || fb.productId}</h3>
                      )}
                    </div>
                    {fb.prNumber && (
                      <p className="text-xs text-gray-600 truncate mb-1">PR: {fb.prNumber}</p>
                    )}
                    <p className="text-xs text-gray-600 truncate">Employee: {maskEmployeeName(
                      fb.employeeId?.firstName && fb.employeeId?.lastName
                        ? `${fb.employeeId.firstName} ${fb.employeeId.lastName}`
                        : 'N/A'
                    )}</p>
                  </div>
                  
                  {/* Product Name */}
                  <div className="border-t pt-3 mb-3">
                    <h4 className="text-xs font-semibold text-gray-900 mb-1.5">Product:</h4>
                    <p className="text-xs text-gray-700 line-clamp-2">{fb.uniformId?.name || fb.productId}</p>
                  </div>
                  
                  {/* Rating */}
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
                  
                  {/* Comment */}
                  {fb.comment && (
                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                      <div className="flex items-start space-x-2">
                        <MessageSquare className="h-3 w-3 text-gray-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-gray-700 line-clamp-3">{fb.comment}</p>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Footer with Date */}
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
        )}
      </div>
    </DashboardLayout>
  )
}

