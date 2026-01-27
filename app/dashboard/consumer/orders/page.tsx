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
        return { className: 'bg-gradient-to-r from-green-100 to-blue-100 text-green-700 border border-green-200' }
      case 'Dispatched':
        return { className: 'bg-purple-100 text-purple-700' }
      case 'Partially Dispatched':
        return { className: 'bg-gradient-to-r from-blue-100 to-orange-100 text-blue-700 border border-blue-200' }
      case 'Awaiting Delivery':
        return { className: 'bg-blue-100 text-blue-600' }
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

  // Calculate progress for split orders
  const getOrderProgress = (order: any) => {
    if (!order.isSplitOrder || !order.items) return null
    
    const items = order.items
    const total = items.length
    const delivered = items.filter((i: any) => i._itemStatus === 'Delivered').length
    const dispatched = items.filter((i: any) => i._itemStatus === 'Dispatched').length
    const shipped = delivered + dispatched
    
    return { total, delivered, dispatched, shipped }
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

  const formatDateShort = (date: any) => {
    if (!date) return 'N/A'
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date
      if (isNaN(dateObj.getTime())) return 'N/A'
      return dateObj.toLocaleDateString('en-US', { 
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (error) {
      return 'N/A'
    }
  }

  const getDateKey = (date: any) => {
    if (!date) return 'Unknown Date'
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date
      if (isNaN(dateObj.getTime())) return 'Unknown Date'
      return dateObj.toLocaleDateString('en-US', { 
        weekday: 'long',
        year: 'numeric', 
        month: 'long', 
        day: 'numeric'
      })
    } catch (error) {
      return 'Unknown Date'
    }
  }

  // Group orders by date
  const groupedOrders = myOrders.reduce((groups: Record<string, any[]>, order) => {
    const dateKey = getDateKey(order.orderDate)
    if (!groups[dateKey]) {
      groups[dateKey] = []
    }
    groups[dateKey].push(order)
    return groups
  }, {})

  // Sort dates (most recent first)
  const sortedDateKeys = Object.keys(groupedOrders).sort((a, b) => {
    if (a === 'Unknown Date') return 1
    if (b === 'Unknown Date') return -1
    const dateA = new Date(groupedOrders[a][0]?.orderDate || 0)
    const dateB = new Date(groupedOrders[b][0]?.orderDate || 0)
    return dateB.getTime() - dateA.getTime()
  })

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
          <div className="space-y-8">
            {sortedDateKeys.map((dateKey) => (
              <div key={dateKey}>
                {/* Date Header */}
                <div className="flex items-center mb-4">
                  <div className="flex-shrink-0 bg-gradient-to-r from-[#f76b1c] to-[#ff9a44] text-white px-4 py-2 rounded-lg shadow-md">
                    <h2 className="text-sm font-bold">{dateKey}</h2>
                  </div>
                  <div className="flex-grow ml-4 h-px bg-gradient-to-r from-gray-300 to-transparent"></div>
                  <span className="ml-4 text-sm text-gray-500 font-medium">
                    {groupedOrders[dateKey].length} order{groupedOrders[dateKey].length > 1 ? 's' : ''}
                  </span>
                </div>
                
                {/* Orders Grid - 3 per row */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {groupedOrders[dateKey].map((order: any) => {
                    if (!order || !order.id) return null
                    
                    return (
                      <div key={order.id} className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow flex flex-col">
                        {/* Order Header - Compact */}
                        <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 border-b border-gray-200">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start space-x-2 min-w-0">
                              {getStatusIcon(order.status || 'Awaiting approval')}
                              <div className="min-w-0">
                                <h3 className="text-sm font-bold text-gray-900 truncate" title={`Order #${order.id}`}>
                                  Order #{order.id.length > 20 ? order.id.substring(order.id.length - 12) : order.id}
                                </h3>
                                <p className="text-xs text-gray-600">
                                  {formatDateShort(order.orderDate)}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <span 
                                className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${getStatusColor(order.status || 'Awaiting approval').className || ''}`}
                                style={getStatusColor(order.status || 'Awaiting approval').style}
                              >
                                {order.status || 'Awaiting approval'}
                              </span>
                              {/* Progress indicator for split orders */}
                              {order.isSplitOrder && (() => {
                                const progress = getOrderProgress(order)
                                if (!progress) return null
                                return (
                                  <span className="text-[10px] text-gray-500">
                                    {progress.shipped > 0 
                                      ? `${progress.shipped}/${progress.total} shipped`
                                      : `${progress.total} items`}
                                  </span>
                                )
                              })()}
                            </div>
                          </div>
                          
                          {/* CRITICAL SECURITY: Only show split order info to admins */}
                          {isAdmin && order.isSplitOrder && (
                            <div className="mt-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block">
                              Split ({order.vendorCount} vendor{order.vendorCount > 1 ? 's' : ''})
                            </div>
                          )}
                        </div>

                        {/* Order Items - Compact list */}
                        <div className="p-4 flex-1">
                          {order.items && Array.isArray(order.items) && order.items.length > 0 ? (
                            <div className="space-y-3">
                              {order.items.map((item: any, idx: number) => {
                                const productId = item.productId || item.uniformId
                                let existing = existingFeedback[order.id]?.[productId]
                                if (!existing && order.splitOrders && Array.isArray(order.splitOrders)) {
                                  for (const splitOrder of order.splitOrders) {
                                    if (existingFeedback[splitOrder.id]?.[productId]) {
                                      existing = existingFeedback[splitOrder.id]?.[productId]
                                      break
                                    }
                                  }
                                }
                                
                                const isSubmitting = submittingFeedback[`${order.id}-${productId}`]
                                const currentFeedback = existing ? { rating: existing.rating || 0, comment: existing.comment || '' } : (feedbackData[order.id]?.[productId] || { rating: 0, comment: '' })
                                const returnRequest = getReturnRequestStatus(order.id, idx)
                                const hasReturnRequest = !!returnRequest
                                const itemStatus = order.isSplitOrder 
                                  ? ((item as any)._itemStatus || 'Awaiting approval')
                                  : (order.status || 'Awaiting approval')
                                const canRequestReturn = itemStatus === 'Delivered' && !hasReturnRequest
                                
                                // Get item status color for badges
                                const getItemStatusBadge = (status: string) => {
                                  switch (status) {
                                    case 'Delivered':
                                      return { bg: 'bg-green-100', text: 'text-green-700', label: 'Delivered', icon: '✓' }
                                    case 'Dispatched':
                                      return { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Shipped', icon: '🚚' }
                                    case 'Awaiting fulfilment':
                                      return { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Processing', icon: '⏳' }
                                    case 'Awaiting approval':
                                      return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pending', icon: '⏳' }
                                    default:
                                      return { bg: 'bg-gray-100', text: 'text-gray-600', label: status || 'Unknown', icon: '' }
                                  }
                                }
                                
                                const itemStatusBadge = getItemStatusBadge(itemStatus)
                                
                                return (
                                  <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                    {/* Product Info */}
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                      <div className="min-w-0 flex-1">
                                        <h4 className="text-sm font-semibold text-gray-900 line-clamp-1">
                                          {item.uniformName || 'Unknown Item'}
                                        </h4>
                                        <p className="text-xs text-gray-600">
                                          Size: {item.size || 'N/A'} • Qty: {item.quantity || 0}
                                        </p>
                                      </div>
                                      {/* Item-level status badge - show for split orders or when different from order status */}
                                      {(order.isSplitOrder || hasReturnRequest) && (
                                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                          {order.isSplitOrder && (
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${itemStatusBadge.bg} ${itemStatusBadge.text}`}>
                                              {itemStatusBadge.icon} {itemStatusBadge.label}
                                            </span>
                                          )}
                                          {hasReturnRequest && getReturnStatusBadge(returnRequest.status)}
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Actions for Delivered items */}
                                    {itemStatus === 'Delivered' && (
                                      <div className="mt-2 space-y-2">
                                        {/* Replacement Button */}
                                        {canRequestReturn && (
                                          <button
                                            onClick={() => handleRequestReplacement(order.id, idx, item)}
                                            className="w-full flex items-center justify-center space-x-1 bg-blue-600 text-white px-2 py-1.5 rounded text-xs font-medium hover:bg-blue-700 transition-colors"
                                          >
                                            <RefreshCw className="h-3 w-3" />
                                            <span>Request Replacement</span>
                                          </button>
                                        )}
                                        
                                        {/* Feedback Section */}
                                        {existing ? (
                                          <div className="flex items-center space-x-1 bg-green-50 px-2 py-1 rounded">
                                            <CheckCircle className="h-3 w-3 text-green-600" />
                                            <div className="flex items-center space-x-0.5">
                                              {[1, 2, 3, 4, 5].map((star) => (
                                                <Star
                                                  key={star}
                                                  className={`h-3 w-3 ${star <= existing.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                                                />
                                              ))}
                                            </div>
                                            <span className="text-xs text-green-700">Reviewed</span>
                                          </div>
                                        ) : (
                                          <div className="space-y-1.5">
                                            <div className="flex items-center justify-between">
                                              <span className="text-xs text-gray-600">Rate:</span>
                                              <div className="flex items-center space-x-0.5">
                                                {[1, 2, 3, 4, 5].map((star) => (
                                                  <button
                                                    key={star}
                                                    type="button"
                                                    onClick={() => handleFeedbackChange(order.id, productId, 'rating', star)}
                                                    className="focus:outline-none"
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
                                            </div>
                                            <textarea
                                              value={currentFeedback.comment || ''}
                                              onChange={(e) => handleFeedbackChange(order.id, productId, 'comment', e.target.value)}
                                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded outline-none resize-none focus:ring-1 focus:ring-[#f76b1c] focus:border-[#f76b1c]"
                                              rows={1}
                                              placeholder="Comment (optional)..."
                                            />
                                            <button
                                              onClick={() => handleSubmitFeedback(order.id, productId, item)}
                                              disabled={isSubmitting || !currentFeedback.rating}
                                              className="w-full bg-gray-700 text-white px-2 py-1 rounded text-xs font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                                            >
                                              {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">No items found</p>
                          )}
                        </div>
                        
                        {/* Order Footer - Compact */}
                        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 mt-auto">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600">
                              <span className="font-medium">Dispatch:</span> {order.dispatchLocation || 'direct'}
                            </span>
                            <span className="text-gray-600">
                              {order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
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




