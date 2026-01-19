'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Package, CheckCircle, Clock, Truck, Star, MessageSquare, RefreshCw, X } from 'lucide-react'
import { getEmployeeByEmail, getOrdersByEmployee, getCompanyById, getVendorByEmail, createProductFeedback, getProductFeedback, getProductById, isCompanyAdmin, getLocationByAdminEmail, getBranchByAdminEmail } from '@/lib/data-mongodb'
import Link from 'next/link'
// Removed maskAddress import - employees should see their own addresses in plain text

export default function ConsumerOrdersPage() {
  const [currentEmployee, setCurrentEmployee] = useState<any>(null)
  const [myOrders, setMyOrders] = useState<any[]>([])
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [feedbackData, setFeedbackData] = useState<Record<string, Record<string, { rating: number; comment: string }>>>({})
  const [submittingFeedback, setSubmittingFeedback] = useState<Record<string, boolean>>({})
  const [existingFeedback, setExistingFeedback] = useState<Record<string, Record<string, any>>>({})
  const [returnRequests, setReturnRequests] = useState<Record<string, any>>({}) // Key: orderId-itemIndex
  const [showReturnModal, setShowReturnModal] = useState(false)
  const [returnModalData, setReturnModalData] = useState<{ orderId: string; itemIndex: number; item: any; product: any } | null>(null)
  const [returnFormData, setReturnFormData] = useState({ requestedQty: 1, requestedSize: '', reason: '', comments: '' })
  const [submittingReturn, setSubmittingReturn] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false) // Track if user is company admin or location admin
  
  // Get current employee from localStorage (email stored during login)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        try {
          setLoading(true)
          // CRITICAL SECURITY FIX: Use tab-specific auth storage
          const { getUserEmail } = await import('@/lib/utils/auth-storage')
          const userEmail = getUserEmail('consumer')
          if (!userEmail) {
            setLoading(false)
            return
          }
          
          // ROLE DETECTION: Check if email belongs to vendor
          const vendor = await getVendorByEmail(userEmail)
          if (vendor) {
            console.error('Consumer Orders - Email belongs to vendor, redirecting...')
            window.location.href = '/dashboard/vendor'
            return
          }
          
          const employee = await getEmployeeByEmail(userEmail)
          if (employee) {
            setCurrentEmployee(employee)
            // Get company ID
            const companyId = typeof employee.companyId === 'object' && employee.companyId?.id 
              ? employee.companyId.id 
              : employee.companyId
            
            // CRITICAL SECURITY: Check if user is company admin or location admin
            // Only admins should see vendor information
            let userIsAdmin = false
            if (companyId) {
              const [isCompanyAdminUser, location, branch] = await Promise.all([
                isCompanyAdmin(userEmail, companyId),
                getLocationByAdminEmail(userEmail),
                getBranchByAdminEmail(userEmail)
              ])
              userIsAdmin = isCompanyAdminUser || !!location || !!branch
            }
            setIsAdmin(userIsAdmin)
            
            // Get orders, company settings, and existing feedback in parallel
            const [employeeOrders, companyData] = await Promise.all([
              getOrdersByEmployee(employee.employeeId || employee.id),
              companyId ? getCompanyById(companyId) : Promise.resolve(null)
            ])
            setMyOrders(employeeOrders)
            setCompany(companyData)
            
            // Load existing feedback for delivered orders
            const deliveredOrders = employeeOrders.filter((o: any) => o.status === 'Delivered')
            if (deliveredOrders.length > 0) {
              try {
                const allFeedback = await getProductFeedback()
                const feedbackMap: Record<string, Record<string, any>> = {}
                allFeedback.forEach((fb: any) => {
                  if (!feedbackMap[fb.orderId]) {
                    feedbackMap[fb.orderId] = {}
                  }
                  feedbackMap[fb.orderId][fb.productId] = fb
                })
                setExistingFeedback(feedbackMap)
              } catch (error) {
                console.error('Error loading feedback:', error)
              }
            }
            
            // Load return requests for employee
            try {
              const employeeId = employee.employeeId || employee.id
              const response = await fetch(`/api/returns/my?employeeId=${employeeId}`)
              if (response.ok) {
                const returns = await response.json()
                const returnMap: Record<string, any> = {}
                returns.forEach((rr: any) => {
                  const key = `${rr.originalOrderId}-${rr.originalOrderItemIndex}`
                  returnMap[key] = rr
                })
                setReturnRequests(returnMap)
              }
            } catch (error) {
              console.error('Error loading return requests:', error)
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Delivered':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'Partially Delivered':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'Dispatched':
        return <Truck className="h-5 w-5 text-purple-600" />
      case 'Partially Dispatched':
        return <Truck className="h-5 w-5 text-purple-500" />
      case 'Awaiting Delivery':
        return <Truck className="h-5 w-5 text-purple-400" />
      case 'Awaiting Dispatch':
        return <Package className="h-5 w-5" style={{ color: company?.primaryColor || '#f76b1c' }} />
      case 'Awaiting Delivery':
        return <Truck className="h-5 w-5 text-purple-400" />
      case 'Awaiting fulfilment':
        return <Package className="h-5 w-5" style={{ color: company?.primaryColor || '#f76b1c' }} />
      case 'Awaiting approval':
        return <Clock className="h-5 w-5 text-yellow-600" />
      default:
        return <Clock className="h-5 w-5 text-gray-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Delivered':
        return { className: 'bg-green-100 text-green-700' }
      case 'Partially Delivered':
        return { className: 'bg-green-50 text-green-600 border border-green-200' }
      case 'Dispatched':
        return { className: 'bg-purple-100 text-purple-700' }
      case 'Partially Dispatched':
        return { className: 'bg-purple-50 text-purple-600 border border-purple-200' }
      case 'Awaiting Delivery':
        return { className: 'bg-purple-50 text-purple-500' }
      case 'Awaiting Dispatch':
        return company?.primaryColor 
          ? { 
              style: { 
                backgroundColor: `${company.primaryColor}15`, 
                color: company.primaryColor 
              },
              className: ''
            }
          : { className: 'bg-orange-50 text-orange-600' }
      case 'Awaiting fulfilment':
        return company?.primaryColor 
          ? { 
              style: { 
                backgroundColor: `${company.primaryColor}20`, 
                color: company.primaryColor 
              },
              className: ''
            }
          : { className: 'bg-orange-100 text-[#f76b1c]' }
      case 'Awaiting approval':
        return { className: 'bg-yellow-100 text-yellow-700' }
      default:
        return { className: 'bg-gray-100 text-gray-700' }
    }
  }

  const formatDate = (date: any) => {
    if (!date) return 'N/A'
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date
      if (isNaN(dateObj.getTime())) return 'N/A'
      return dateObj.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (error) {
      console.error('Error formatting date:', error)
      return 'N/A'
    }
  }

  const handleFeedbackChange = (orderId: string, productId: string, field: 'rating' | 'comment', value: number | string) => {
    setFeedbackData(prev => ({
      ...prev,
      [orderId]: {
        ...prev[orderId],
        [productId]: {
          ...prev[orderId]?.[productId],
          [field]: value,
        }
      }
    }))
  }

  const handleRequestReplacement = async (orderId: string, itemIndex: number, item: any) => {
    try {
      // Get product details to show available sizes
      const productId = item.productId || item.uniformId
      const product = await getProductById(productId)
      
      if (!product) {
        alert('Product not found')
        return
      }
      
      // Set default size to original size
      setReturnFormData({
        requestedQty: 1,
        requestedSize: item.size || '',
        reason: '',
        comments: ''
      })
      
      setReturnModalData({ orderId, itemIndex, item, product })
      setShowReturnModal(true)
    } catch (error: any) {
      console.error('Error opening return modal:', error)
      alert(`Error: ${error.message || 'Failed to load product details'}`)
    }
  }

  const handleSubmitReturnRequest = async () => {
    if (!returnModalData || !currentEmployee) return
    
    if (!returnFormData.requestedSize) {
      alert('Please select a replacement size')
      return
    }
    
    if (returnFormData.requestedQty <= 0 || returnFormData.requestedQty > returnModalData.item.quantity) {
      alert(`Quantity must be between 1 and ${returnModalData.item.quantity}`)
      return
    }
    
    setSubmittingReturn(true)
    
    try {
      // CRITICAL SECURITY FIX: Use tab-specific auth storage
      const { getUserEmail } = await import('@/lib/utils/auth-storage')
      const userEmail = getUserEmail('consumer') || currentEmployee.email
      
      const response = await fetch('/api/returns/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalOrderId: returnModalData.orderId,
          originalOrderItemIndex: returnModalData.itemIndex,
          requestedQty: returnFormData.requestedQty,
          requestedSize: returnFormData.requestedSize,
          reason: returnFormData.reason || undefined,
          comments: returnFormData.comments || undefined,
          requestedBy: userEmail,
        }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create return request')
      }
      
      const returnRequest = await response.json()
      
      // Update return requests state
      const key = `${returnModalData.orderId}-${returnModalData.itemIndex}`
      setReturnRequests(prev => ({ ...prev, [key]: returnRequest }))
      
      // Close modal and reset form
      setShowReturnModal(false)
      setReturnModalData(null)
      setReturnFormData({ requestedQty: 1, requestedSize: '', reason: '', comments: '' })
      
      alert('Return request submitted successfully! It will be reviewed by your company admin.')
    } catch (error: any) {
      console.error('Error submitting return request:', error)
      alert(`Error: ${error.message || 'Failed to submit return request'}`)
    } finally {
      setSubmittingReturn(false)
    }
  }

  const getReturnRequestStatus = (orderId: string, itemIndex: number) => {
    const key = `${orderId}-${itemIndex}`
    return returnRequests[key]
  }

  const getReturnStatusBadge = (status: string) => {
    switch (status) {
      case 'REQUESTED':
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-yellow-100 text-yellow-800">Return Requested</span>
      case 'APPROVED':
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-blue-100 text-blue-800">Replacement Approved</span>
      case 'REJECTED':
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-800">Return Rejected</span>
      case 'COMPLETED':
        return <span className="px-2 py-1 text-xs font-semibold rounded bg-green-100 text-green-800">Replacement Completed</span>
      default:
        return null
    }
  }

  const handleSubmitFeedback = async (orderId: string, productId: string, item: any) => {
    if (!currentEmployee) return
    
    const feedback = feedbackData[orderId]?.[productId]
    if (!feedback || !feedback.rating) {
      alert('Please provide a rating (1-5 stars)')
      return
    }
    
    setSubmittingFeedback(prev => ({ ...prev, [`${orderId}-${productId}`]: true }))
    
    try {
      const companyId = typeof currentEmployee.companyId === 'object' && currentEmployee.companyId?.id 
        ? currentEmployee.companyId.id 
        : currentEmployee.companyId
      
      const savedFeedback = await createProductFeedback({
        orderId,
        productId: productId || item.productId,
        employeeId: currentEmployee.employeeId || currentEmployee.id,
        companyId: companyId || '',
        vendorId: item.vendorId,
        rating: feedback.rating,
        comment: feedback.comment || undefined,
      })
      
      // Get the actual order ID from saved feedback (might be different for split orders)
      const actualOrderId = savedFeedback?.orderId || orderId
      const actualProductId = productId || item.productId
      
      console.log('[handleSubmitFeedback] Feedback submitted:', {
        orderId,
        actualOrderId,
        productId: actualProductId,
        savedFeedback: savedFeedback?.orderId
      })
      
      // Immediately add the submitted feedback to existingFeedback so it shows up right away
      setExistingFeedback(prev => {
        const newMap = { ...prev }
        // Store in both order IDs to handle parent/child order scenarios
        if (!newMap[orderId]) {
          newMap[orderId] = {}
        }
        if (!newMap[actualOrderId]) {
          newMap[actualOrderId] = {}
        }
        const feedbackEntry = {
          rating: feedback.rating,
          comment: feedback.comment || '',
          ...savedFeedback
        }
        newMap[orderId][actualProductId] = feedbackEntry
        newMap[actualOrderId][actualProductId] = feedbackEntry
        
        console.log('[handleSubmitFeedback] Updated existingFeedback:', {
          orderId,
          actualOrderId,
          productId: actualProductId,
          hasEntry: !!newMap[orderId][actualProductId]
        })
        
        return newMap
      })
      
      // Clear the feedback form data for this product to prevent editing
      setFeedbackData(prev => {
        const newMap = { ...prev }
        if (newMap[orderId]) {
          const orderData = { ...newMap[orderId] }
          delete orderData[actualProductId]
          if (Object.keys(orderData).length === 0) {
            delete newMap[orderId]
          } else {
            newMap[orderId] = orderData
          }
        }
        // Also clear for actualOrderId if different
        if (actualOrderId !== orderId && newMap[actualOrderId]) {
          const orderData = { ...newMap[actualOrderId] }
          delete orderData[actualProductId]
          if (Object.keys(orderData).length === 0) {
            delete newMap[actualOrderId]
          } else {
            newMap[actualOrderId] = orderData
          }
        }
        return newMap
      })
      
      // Reload feedback to get the complete saved feedback from server (with timestamps, etc.)
      const allFeedback = await getProductFeedback()
      const feedbackMap: Record<string, Record<string, any>> = {}
      allFeedback.forEach((fb: any) => {
        if (!feedbackMap[fb.orderId]) {
          feedbackMap[fb.orderId] = {}
        }
        feedbackMap[fb.orderId][fb.productId] = fb
      })
      setExistingFeedback(feedbackMap)
      
      alert('Feedback submitted successfully!')
    } catch (error: any) {
      console.error('Error submitting feedback:', error)
      const errorMessage = error.message || error.toString() || 'Unknown error'
      
      // Check for duplicate key error (E11000) - means feedback already exists
      if (errorMessage.includes('E11000') || errorMessage.includes('duplicate key')) {
        console.log('[handleSubmitFeedback] Feedback already exists, reloading existing feedback...')
        
        // Reload feedback from server to get the existing feedback
        try {
          const allFeedback = await getProductFeedback()
          const feedbackMap: Record<string, Record<string, any>> = {}
          allFeedback.forEach((fb: any) => {
            if (!feedbackMap[fb.orderId]) {
              feedbackMap[fb.orderId] = {}
            }
            feedbackMap[fb.orderId][fb.productId] = fb
          })
          setExistingFeedback(feedbackMap)
          
          // Don't show error - just inform user
          alert('Feedback was already submitted for this product. Showing your previous feedback.')
        } catch (reloadError) {
          console.error('Error reloading feedback:', reloadError)
          alert('Feedback was already submitted for this product.')
        }
      } else {
        alert(`Error submitting feedback: ${errorMessage}`)
      }
    } finally {
      setSubmittingFeedback(prev => {
        const newState = { ...prev }
        delete newState[`${orderId}-${productId}`]
        return newState
      })
    }
  }

  return (
    <DashboardLayout actorType="consumer">
      <div>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Orders</h1>
          <Link
            href="/dashboard/consumer/catalog"
            className="bg-[#f76b1c] text-white px-4 py-2 rounded-lg font-medium hover:bg-[#dc5514] transition-colors shadow-md"
          >
            Place New Order
          </Link>
        </div>

        {myOrders.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">No Orders Yet</h2>
            <p className="text-gray-600 mb-6">Start browsing our catalog to place your first order.</p>
            <Link
              href="/dashboard/consumer/catalog"
              style={{ backgroundColor: company?.primaryColor || '#f76b1c' }}
              className="inline-block text-white px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity shadow-md"
            >
              Browse Catalog
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {myOrders.map((order) => {
              if (!order || !order.id) return null
              
              return (
                <div key={order.id} className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                  {/* Order Header */}
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        {getStatusIcon(order.status || 'Awaiting approval')}
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">
                            Order #{order.id}
                            {/* CRITICAL SECURITY: Only show split order info to admins */}
                            {isAdmin && order.isSplitOrder && (
                              <span className="ml-2 text-xs font-normal text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                Split Order ({order.vendorCount} vendor{order.vendorCount > 1 ? 's' : ''})
                              </span>
                            )}
                          </h3>
                          <p className="text-sm text-gray-600">
                            Placed on {formatDate(order.orderDate)}
                            {/* CRITICAL SECURITY: Only show vendor names to admins */}
                            {isAdmin && order.vendors && order.vendors.length > 0 && (
                              <span className="ml-2 text-xs text-gray-500">
                                • Vendors: {order.vendors.join(', ')}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <span 
                        className={`px-4 py-2 rounded-full text-sm font-semibold ${getStatusColor(order.status || 'Awaiting approval').className || ''}`}
                        style={getStatusColor(order.status || 'Awaiting approval').style}
                      >
                        {order.status || 'Awaiting approval'}
                      </span>
                    </div>
                    
                    {/* CRITICAL SECURITY: Only show split order details to admins */}
                    {isAdmin && order.isSplitOrder && order.splitOrders && order.splitOrders.length > 0 && (
                      <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-sm font-semibold text-blue-900 mb-2">Order Split by Vendor:</p>
                        <div className="space-y-1">
                          {order.splitOrders.map((split: any, idx: number) => (
                            <div key={idx} className="text-xs text-blue-800">
                              <span className="font-medium">{split.vendorName}:</span>
                              <span className="ml-2">
                                {split.itemCount} item(s)
                                {company?.showPrices && ` - ₹${split.total.toFixed(2)}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Order Items - Grid layout for all orders */}
                  <div className="p-6">
                    {order.items && Array.isArray(order.items) && order.items.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {order.items.map((item: any, idx: number) => {
                          const productId = item.productId || item.uniformId
                          // Check for existing feedback - try order.id first, then check split orders if available
                          let existing = existingFeedback[order.id]?.[productId]
                          // If not found and this is a split order, check child order IDs
                          if (!existing && order.splitOrders && Array.isArray(order.splitOrders)) {
                            for (const splitOrder of order.splitOrders) {
                              if (existingFeedback[splitOrder.id]?.[productId]) {
                                existing = existingFeedback[splitOrder.id]?.[productId]
                                break
                              }
                            }
                          }
                          
                          const isSubmitting = submittingFeedback[`${order.id}-${productId}`]
                          // If feedback exists, don't allow editing - use the feedback from existing
                          // Otherwise, use the current feedback data from state
                          const currentFeedback = existing ? { rating: existing.rating || 0, comment: existing.comment || '' } : (feedbackData[order.id]?.[productId] || { rating: 0, comment: '' })
                          
                          // Check for existing return request
                          const returnRequest = getReturnRequestStatus(order.id, idx)
                          const hasReturnRequest = !!returnRequest
                          
                          // CRITICAL FIX: For split orders, ALWAYS use per-item status (_itemStatus)
                          // For regular orders, use the order's status
                          // NEVER fall back to aggregated order.status for split orders as it may be incorrect
                          const itemStatus = order.isSplitOrder 
                            ? ((item as any)._itemStatus || 'Awaiting approval') // For split orders, require _itemStatus
                            : (order.status || 'Awaiting approval') // For standalone orders, use order.status
                          const canRequestReturn = itemStatus === 'Delivered' && !hasReturnRequest
                          
                          return (
                            <div key={idx} className="bg-white rounded-lg shadow-md p-4 border border-gray-200 hover:shadow-lg transition-shadow flex flex-col">
                              {/* Product Info */}
                              <div className="mb-3">
                                <h3 className="text-sm font-semibold text-gray-900 mb-1 line-clamp-2">
                                  {item.uniformName || 'Unknown Item'}
                                </h3>
                                <p className="text-xs text-gray-600 mb-2">
                                  Size: {item.size || 'N/A'} • Qty: {item.quantity || 0}
                                </p>
                                {hasReturnRequest && (
                                  <div className="mb-2">
                                    {getReturnStatusBadge(returnRequest.status)}
                                    {returnRequest.replacementOrderId && (
                                      <p className="text-xs text-gray-600 mt-1">
                                        Replacement: #{returnRequest.replacementOrderId}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                              
                              {/* Replacement Section - Only for Delivered orders */}
                              {/* For split orders, check item's specific status; for regular orders, check order status */}
                              {(itemStatus === 'Delivered') && (
                                <>
                                  {canRequestReturn && (
                                    <div className="mb-3 pb-3 border-b border-gray-200">
                                      <button
                                        onClick={() => handleRequestReplacement(order.id, idx, item)}
                                        className="w-full flex items-center justify-center space-x-1.5 bg-blue-600 text-white px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
                                      >
                                        <RefreshCw className="h-3 w-3" />
                                        <span>Request Replacement</span>
                                      </button>
                                    </div>
                                  )}
                                  
                                  {hasReturnRequest && !canRequestReturn && (
                                    <div className="mb-3 pb-3 border-b border-gray-200">
                                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
                                        <p className="text-xs text-gray-700">
                                          Return Status: <strong>{returnRequest.status}</strong>
                                        </p>
                                        {returnRequest.comments && (
                                          <p className="text-xs text-gray-600 mt-1 line-clamp-2">{returnRequest.comments}</p>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                              
                              {/* Feedback Section - Only for Delivered orders */}
                              {/* CRITICAL FIX: Use itemStatus for split orders, order.status for standalone orders */}
                              {(order.isSplitOrder ? itemStatus === 'Delivered' : order.status === 'Delivered') ? (
                                <div className="flex-1">
                                  {existing ? (
                                    <div className="feedback-submitted bg-green-100 border border-green-300 rounded-lg p-3 shadow-sm">
                                      <div className="flex items-center space-x-1 mb-2">
                                        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                        <span className="text-xs font-semibold text-green-800">Feedback Submitted</span>
                                      </div>
                                      <div className="flex items-center space-x-1 mb-2">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                          <Star
                                            key={star}
                                            className={`h-3.5 w-3.5 ${
                                              star <= existing.rating
                                                ? 'fill-yellow-400 text-yellow-400'
                                                : 'text-gray-300'
                                            }`}
                                          />
                                        ))}
                                        <span className="text-xs text-green-700 ml-1 font-medium">({existing.rating}/5)</span>
                                      </div>
                                      {existing.comment && (
                                        <p className="text-xs text-green-800 mb-2 leading-relaxed">{existing.comment}</p>
                                      )}
                                      {(existing.createdAt || existing.updatedAt) && (
                                        <p className="text-xs text-green-600 italic mt-1">
                                          Submitted: {formatDate(existing.createdAt || existing.updatedAt)}
                                        </p>
                                      )}
                                    </div>
                                  ) : isSubmitting ? (
                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                                      <div className="flex items-center space-x-1 mb-2">
                                        <Clock className="h-3 w-3 text-gray-500 animate-spin" />
                                        <span className="text-xs font-semibold text-gray-700">Submitting...</span>
                                      </div>
                                      <div className="flex items-center space-x-1">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                          <Star
                                            key={star}
                                            className={`h-3 w-3 ${
                                              star <= currentFeedback.rating
                                                ? 'fill-yellow-400 text-yellow-400'
                                                : 'text-gray-300'
                                            }`}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Rate this product:
                                      </label>
                                      <div className="flex items-center space-x-1 mb-2">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                          <button
                                            key={star}
                                            type="button"
                                            onClick={() => !existing && handleFeedbackChange(order.id, productId, 'rating', star)}
                                            disabled={!!existing}
                                            className={`focus:outline-none ${existing ? 'cursor-not-allowed' : ''}`}
                                          >
                                            <Star
                                              className={`h-4 w-4 transition-colors ${
                                                star <= currentFeedback.rating
                                                  ? 'fill-yellow-400 text-yellow-400'
                                                  : 'text-gray-300 hover:text-yellow-300'
                                              }`}
                                            />
                                          </button>
                                        ))}
                                      </div>
                                      <div className="mb-2">
                                        <textarea
                                          value={currentFeedback.comment || ''}
                                          onChange={(e) => !existing && handleFeedbackChange(order.id, productId, 'comment', e.target.value)}
                                          disabled={!!existing}
                                          readOnly={!!existing}
                                          className={`w-full px-2 py-1 text-xs border border-gray-300 rounded-lg outline-none resize-none ${
                                            existing 
                                              ? 'bg-gray-100 text-gray-700 cursor-not-allowed' 
                                              : 'focus:ring-1 focus:ring-[#f76b1c] focus:border-[#f76b1c]'
                                          }`}
                                          rows={2}
                                          placeholder="Comment (optional)..."
                                          maxLength={2000}
                                        />
                                      </div>
                                      <button
                                        onClick={() => handleSubmitFeedback(order.id, productId, item)}
                                        disabled={isSubmitting || !currentFeedback.rating || !!existing}
                                        className="w-full bg-[#f76b1c] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#dc5514] transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                                      >
                                        {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                // For non-delivered orders, show status info
                                // CRITICAL FIX: Use itemStatus for split orders, order.status for standalone orders
                                <div className="flex-1 flex items-center justify-center">
                                  <div className="text-center">
                                    <p className="text-xs text-gray-500 font-medium">{order.isSplitOrder ? itemStatus : (order.status || 'Processing')}</p>
                                    <p className="text-xs text-gray-400 mt-1">Feedback available after delivery</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No items found</p>
                    )}
                    
                    {/* Order Details Footer */}
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Order Date:</p>
                          <p className="font-semibold text-gray-900">{formatDate(order.orderDate)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Dispatch Location:</p>
                          <p className="font-semibold text-gray-900">{order.dispatchLocation || 'N/A'}</p>
                        </div>
                        {order.deliveryAddress && (
                          <div>
                            <p className="text-gray-600">Delivery Address:</p>
                            <p className="font-semibold text-gray-900">{order.deliveryAddress}</p>
                          </div>
                        )}
                        {order.estimatedDeliveryTime && (
                          <div>
                            <p className="text-gray-600">Estimated Delivery:</p>
                            <p className="font-semibold text-gray-900">{order.estimatedDeliveryTime}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      
      {/* Return Request Modal */}
      {showReturnModal && returnModalData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Request Replacement</h2>
              <button
                onClick={() => {
                  setShowReturnModal(false)
                  setReturnModalData(null)
                  setReturnFormData({ requestedQty: 1, requestedSize: '', reason: '', comments: '' })
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Product</p>
                <p className="font-semibold text-gray-900">{returnModalData.item.uniformName}</p>
                <p className="text-sm text-gray-600">Original Size: {returnModalData.item.size} • Quantity: {returnModalData.item.quantity}</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantity to Replace <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max={returnModalData.item.quantity}
                  value={returnFormData.requestedQty}
                  onChange={(e) => setReturnFormData(prev => ({ ...prev, requestedQty: parseInt(e.target.value) || 1 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Maximum: {returnModalData.item.quantity}</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Replacement Size <span className="text-red-500">*</span>
                </label>
                <select
                  value={returnFormData.requestedSize}
                  onChange={(e) => setReturnFormData(prev => ({ ...prev, requestedSize: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select size</option>
                  {returnModalData.product?.sizes?.map((size: string) => (
                    <option key={size} value={size}>
                      {size} {size === returnModalData.item.size ? '(Original)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason (optional)
                </label>
                <select
                  value={returnFormData.reason}
                  onChange={(e) => setReturnFormData(prev => ({ ...prev, reason: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select reason</option>
                  <option value="Wrong Size">Wrong Size</option>
                  <option value="Defective Item">Defective Item</option>
                  <option value="Damaged on Delivery">Damaged on Delivery</option>
                  <option value="Quality Issue">Quality Issue</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Additional Comments (optional)
                </label>
                <textarea
                  value={returnFormData.comments}
                  onChange={(e) => setReturnFormData(prev => ({ ...prev, comments: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Provide additional details about the return..."
                  maxLength={500}
                />
              </div>
              
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={() => {
                    setShowReturnModal(false)
                    setReturnModalData(null)
                    setReturnFormData({ requestedQty: 1, requestedSize: '', reason: '', comments: '' })
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                  disabled={submittingReturn}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitReturnRequest}
                  disabled={submittingReturn || !returnFormData.requestedSize || returnFormData.requestedQty <= 0}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {submittingReturn ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}




