'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { RefreshCw, CheckCircle, XCircle, Clock, Package } from 'lucide-react'
import { getCompanyById, getLocationByAdminEmail } from '@/lib/data-mongodb'

export default function CompanyReturnsPage() {
  const [companyId, setCompanyId] = useState<string>('')
  const [returnRequests, setReturnRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [companyPrimaryColor, setCompanyPrimaryColor] = useState<string>('#f76b1c')
  const [filterStatus, setFilterStatus] = useState<string>('REQUESTED')
  const [processingReturn, setProcessingReturn] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({})
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        try {
          setLoading(true)
          const storedCompanyId = localStorage.getItem('companyId')
          // CRITICAL SECURITY FIX: Use only tab-specific auth storage
          const { getUserEmail } = await import('@/lib/utils/auth-storage')
          const userEmail = getUserEmail('company')
          
          // Check if user is Location Admin
          let locationAdminLocation = null
          if (userEmail) {
            locationAdminLocation = await getLocationByAdminEmail(userEmail)
            if (locationAdminLocation) {
              // Location Admins should not access this page
              window.location.href = '/dashboard/company/orders'
              return
            }
          }
          
          if (storedCompanyId) {
            setCompanyId(storedCompanyId)
            const companyDetails = await getCompanyById(storedCompanyId)
            if (companyDetails) {
              setCompanyPrimaryColor(companyDetails.primaryColor || '#f76b1c')
            }
            
            // Load return requests
            await loadReturnRequests(storedCompanyId)
          }
        } catch (error) {
          console.error('Error loading return requests:', error)
        } finally {
          setLoading(false)
        }
      }
      
      loadData()
    }
  }, [])

  const loadReturnRequests = async (companyId: string) => {
    try {
      const url = `/api/returns/company?companyId=${encodeURIComponent(companyId)}${filterStatus ? `&status=${encodeURIComponent(filterStatus)}` : ''}`
      const response = await fetch(url)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Failed to load return requests:', errorData.error || `HTTP ${response.status}`)
        setReturnRequests([])
        return
      }
      
      const requests = await response.json()
      setReturnRequests(Array.isArray(requests) ? requests : [])
    } catch (error: any) {
      console.error('Error loading return requests:', error)
      setReturnRequests([])
    }
  }

  useEffect(() => {
    if (companyId) {
      loadReturnRequests(companyId)
    }
  }, [filterStatus, companyId])

  const handleApprove = async (returnRequestId: string) => {
    if (!confirm('Are you sure you want to approve this return request? A replacement order will be created.')) {
      return
    }

    setProcessingReturn(returnRequestId)
    try {
      // CRITICAL SECURITY FIX: Use only tab-specific auth storage
      const { getUserEmail } = await import('@/lib/utils/auth-storage')
      const userEmail = getUserEmail('company')
      const response = await fetch(`/api/returns/${returnRequestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          approvedBy: userEmail,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to approve return request')
      }

      const result = await response.json()
      alert(`Return request approved! Replacement order created: ${result.replacementOrder?.parentOrderId || result.replacementOrder?.id || 'N/A'}`)
      
      // Reload return requests
      await loadReturnRequests(companyId)
    } catch (error: any) {
      console.error('Error approving return request:', error)
      alert(`Error: ${error.message || 'Failed to approve return request'}`)
    } finally {
      setProcessingReturn(null)
    }
  }

  const handleReject = async (returnRequestId: string) => {
    const reason = rejectionReason[returnRequestId]?.trim()
    if (!reason) {
      alert('Please provide a rejection reason')
      return
    }

    if (!confirm('Are you sure you want to reject this return request?')) {
      return
    }

    setProcessingReturn(returnRequestId)
    try {
      // CRITICAL SECURITY FIX: Use only tab-specific auth storage
      const { getUserEmail } = await import('@/lib/utils/auth-storage')
      const userEmail = getUserEmail('company')
      const response = await fetch(`/api/returns/${returnRequestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          rejectedBy: userEmail,
          rejectionReason: reason,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to reject return request')
      }

      alert('Return request rejected successfully')
      
      // Close modal and clear reason
      setShowRejectModal(null)
      setRejectionReason(prev => {
        const newState = { ...prev }
        delete newState[returnRequestId]
        return newState
      })
      
      // Reload return requests
      await loadReturnRequests(companyId)
    } catch (error: any) {
      console.error('Error rejecting return request:', error)
      alert(`Error: ${error.message || 'Failed to reject return request'}`)
    } finally {
      setProcessingReturn(null)
    }
  }

  const formatDate = (date: any) => {
    if (!date) return 'N/A'
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date
      if (isNaN(dateObj.getTime())) return 'N/A'
      return dateObj.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (error) {
      return 'N/A'
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'REQUESTED':
        return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">Pending Approval</span>
      case 'APPROVED':
        return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">Approved</span>
      case 'REJECTED':
        return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">Rejected</span>
      case 'COMPLETED':
        return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">Completed</span>
      default:
        return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">{status}</span>
    }
  }

  if (loading) {
    return (
      <DashboardLayout actorType="company">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Clock className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading return requests...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="company">
      <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Return & Replacement Requests</h1>
            <p className="text-gray-600 mt-1">Review and approve/reject employee return requests</p>
          </div>
        </div>

        {/* Status Filter */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-700">Filter by Status:</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              style={{ 
                '--tw-ring-color': companyPrimaryColor || '#f76b1c',
              } as React.CSSProperties & { '--tw-ring-color'?: string }}
            >
              <option value="">All Status</option>
              <option value="REQUESTED">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
        </div>

        {/* Return Requests List */}
        <div className="space-y-4">
          {returnRequests.length === 0 ? (
            <div className="bg-white rounded-xl shadow-lg p-12 text-center">
              <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">No Return Requests</h2>
              <p className="text-gray-600">
                {filterStatus 
                  ? `No return requests with status "${filterStatus}"`
                  : 'No return requests found for your company'}
              </p>
            </div>
          ) : (
            returnRequests.map((request) => (
              <div key={request.returnRequestId} className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-bold text-gray-900">
                        Return Request #{request.returnRequestId}
                      </h3>
                      {getStatusBadge(request.status)}
                    </div>
                    <p className="text-sm text-gray-600">
                      Requested by: <span className="font-semibold">{request.employeeId?.firstName} {request.employeeId?.lastName}</span>
                      {request.employeeId?.email && (
                        <span className="ml-2 text-gray-500">({request.employeeId.email})</span>
                      )}
                    </p>
                    <p className="text-sm text-gray-600">
                      Original Order: <span className="font-semibold">#{request.originalOrderId}</span>
                    </p>
                    {request.vendorName && (
                      <p className="text-sm text-gray-600">
                        Vendor: <span className="font-semibold">{request.vendorName}</span>
                      </p>
                    )}
                    {request.replacementOrderId && (
                      <p className="text-sm text-blue-600 mt-1">
                        Replacement Order: <span className="font-semibold">#{request.replacementOrderId}</span>
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Requested on</p>
                    <p className="text-sm font-semibold text-gray-900">{formatDate(request.createdAt)}</p>
                    {request.approvedAt && (
                      <>
                        <p className="text-sm text-gray-500 mt-2">
                          {request.status === 'APPROVED' ? 'Approved' : 'Rejected'} on
                        </p>
                        <p className="text-sm font-semibold text-gray-900">{formatDate(request.approvedAt)}</p>
                        {request.approvedBy && (
                          <p className="text-xs text-gray-500 mt-1">by {request.approvedBy}</p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="border-t pt-4 mb-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">Product</p>
                      <p className="text-gray-900 font-semibold">{request.uniformName}</p>
                      <p className="text-sm text-gray-600">SKU: {request.productId}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">Size Change</p>
                      <p className="text-gray-900">
                        <span className="font-semibold">{request.originalSize}</span>
                        {' → '}
                        <span className="font-semibold text-blue-600">{request.requestedSize}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">Quantity</p>
                      <p className="text-gray-900 font-semibold">{request.requestedQty} item(s)</p>
                    </div>
                    {request.reason && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">Reason</p>
                        <p className="text-gray-900">{request.reason}</p>
                      </div>
                    )}
                  </div>
                  
                  {request.comments && (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-gray-700 mb-1">Comments</p>
                      <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">{request.comments}</p>
                    </div>
                  )}
                </div>

                {/* Action Buttons - Only show for REQUESTED status */}
                {request.status === 'REQUESTED' && (
                  <div className="border-t pt-4 flex space-x-3">
                    <button
                      onClick={() => handleApprove(request.returnRequestId)}
                      disabled={processingReturn === request.returnRequestId}
                      className="flex items-center space-x-2 bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      <CheckCircle className="h-5 w-5" />
                      <span>{processingReturn === request.returnRequestId ? 'Processing...' : 'Approve & Create Replacement'}</span>
                    </button>
                    <button
                      onClick={() => setShowRejectModal(request.returnRequestId)}
                      disabled={processingReturn === request.returnRequestId}
                      className="flex items-center space-x-2 bg-red-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      <XCircle className="h-5 w-5" />
                      <span>Reject</span>
                    </button>
                  </div>
                )}

                {/* Rejection Reason Modal */}
                {showRejectModal === request.returnRequestId && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                      <div className="p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Reject Return Request</h3>
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Rejection Reason <span className="text-red-500">*</span>
                          </label>
                          <textarea
                            value={rejectionReason[request.returnRequestId] || ''}
                            onChange={(e) => setRejectionReason(prev => ({
                              ...prev,
                              [request.returnRequestId]: e.target.value
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                            rows={4}
                            placeholder="Please provide a reason for rejecting this return request..."
                            maxLength={500}
                          />
                        </div>
                        <div className="flex space-x-3">
                          <button
                            onClick={() => {
                              setShowRejectModal(null)
                              setRejectionReason(prev => {
                                const newState = { ...prev }
                                delete newState[request.returnRequestId]
                                return newState
                              })
                            }}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleReject(request.returnRequestId)}
                            disabled={!rejectionReason[request.returnRequestId]?.trim() || processingReturn === request.returnRequestId}
                            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                          >
                            {processingReturn === request.returnRequestId ? 'Processing...' : 'Confirm Rejection'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}

