'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { CheckCircle, MapPin, Clock, Package, AlertCircle } from 'lucide-react'
import { getProductsForDesignation, getEmployeeByEmail, getCompanyById, createOrder, getVendorByEmail, isCompanyAdmin, getLocationByAdminEmail, getBranchByAdminEmail } from '@/lib/data-mongodb'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function OrderConfirmationPage() {
  const router = useRouter()
  const [orderData, setOrderData] = useState<any>(null)
  const [currentEmployee, setCurrentEmployee] = useState<any>(null)
  const [companyProducts, setCompanyProducts] = useState<any[]>([])
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [orderSaved, setOrderSaved] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)
  const [savedOrderId, setSavedOrderId] = useState<string | null>(null)
  const [savedOrder, setSavedOrder] = useState<any>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false) // Track if user is company admin or location admin
  
  // Get current employee from localStorage
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
            console.error('Order Confirm - Email belongs to vendor, redirecting...')
            window.location.href = '/dashboard/vendor'
            return
          }
          
          const employee = await getEmployeeByEmail(userEmail)
          if (employee) {
            setCurrentEmployee(employee)
            // Get only products linked to this company
            // Ensure companyId is a string (handle populated objects)
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
            
            const [products, companyData] = await Promise.all([
              // CRITICAL MIGRATION: Use subcategory-based product fetching
              (async () => {
                const { getProductsForDesignation } = await import('@/lib/data-mongodb')
                return getProductsForDesignation(companyId, employee?.designation || '', employee?.gender as 'male' | 'female')
              })(),
              getCompanyById(companyId)
            ])
            setCompanyProducts(products)
            setCompany(companyData)
          }
        } catch (error) {
          console.error('Error loading employee data:', error)
        } finally {
          setLoading(false)
        }
      }
      
      loadData()
    }
  }, [])

  useEffect(() => {
    // Check for pending order with a small delay to ensure sessionStorage is available
    const checkPendingOrder = () => {
      try {
        const pendingOrder = sessionStorage.getItem('pendingOrder')
        console.log('Order confirmation: Checking for pending order', pendingOrder ? 'Found' : 'Not found')
        if (pendingOrder) {
          const parsed = JSON.parse(pendingOrder)
          console.log('Order confirmation: Parsed order data', parsed)
          setOrderData(parsed)
          // Don't clear immediately - wait until component is fully loaded
          // sessionStorage.removeItem('pendingOrder')
        } else {
          // Only redirect if we're sure there's no pending order
          // Give it a moment in case sessionStorage hasn't synced yet
          setTimeout(() => {
            const checkAgain = sessionStorage.getItem('pendingOrder')
            if (!checkAgain) {
              console.log('Order confirmation: No pending order found, redirecting to catalog')
              router.push('/dashboard/consumer/catalog')
            }
          }, 100)
        }
      } catch (error) {
        console.error('Error reading pending order:', error)
        router.push('/dashboard/consumer/catalog')
      }
    }
    
    // Check immediately and also after a small delay
    checkPendingOrder()
    const timeout = setTimeout(checkPendingOrder, 50)
    
    return () => clearTimeout(timeout)
  }, [router])
  
  // Save order to database when order data and employee are loaded
  useEffect(() => {
    const saveOrder = async () => {
      // Don't retry if there was an error, if already saved, or if currently saving
      if (!orderData || !currentEmployee || !companyProducts || orderSaved || savingOrder || saveError) {
        return
      }

      try {
        setSavingOrder(true)
        console.log('Saving order to database...', { orderData, currentEmployee })

        // Calculate estimated delivery time
        const getEstimatedDeliveryTime = () => {
          if (!currentEmployee?.dispatchPreference) {
            return '5-7 business days'
          }
          if (currentEmployee.dispatchPreference === 'direct') {
            return '3-5 business days'
          } else if (currentEmployee.dispatchPreference === 'central') {
            return '5-7 business days'
          } else {
            return '7-10 business days'
          }
        }

        // Prepare order items with prices
        const orderItems = orderData.items.map((item: any) => {
          const uniform = companyProducts.find((u: any) => u.id === item.uniformId)
          return {
            uniformId: item.uniformId,
            uniformName: item.uniformName,
            size: item.size,
            quantity: item.quantity,
            price: uniform?.price || 0,
          }
        })

        // Get employee ID (handle both string and object)
        // Use employeeId field instead of id field
        const employeeId = currentEmployee.employeeId || currentEmployee.id

        // Create order in database
        const savedOrder = await createOrder({
          employeeId: employeeId,
          items: orderItems,
          deliveryAddress: currentEmployee.address || 'Address not available',
          estimatedDeliveryTime: getEstimatedDeliveryTime(),
          dispatchLocation: currentEmployee.dispatchPreference || 'standard',
          isPersonalPayment: orderData.isPersonalPayment || false,
          personalPaymentAmount: orderData.personalPaymentAmount ? parseFloat(orderData.personalPaymentAmount) : 0,
        })

        console.log('Order saved successfully:', savedOrder)
        setOrderSaved(true)
        setSavedOrder(savedOrder) // Store the full order object
        // Store the order ID for display (use parentOrderId if it's a split order)
        if (savedOrder?.parentOrderId) {
          setSavedOrderId(savedOrder.parentOrderId)
        } else if (savedOrder?.id) {
          setSavedOrderId(savedOrder.id)
        }

        // Clear the pending order from sessionStorage after successful save
        sessionStorage.removeItem('pendingOrder')
        console.log('Order confirmation: Cleared pending order from sessionStorage')
      } catch (error: any) {
        console.error('Error saving order to database:', error)
        const errorMessage = error?.message || error?.toString() || 'Unknown error occurred'
        
        // CRITICAL: Log validation errors if they exist
        if (error?.validationErrors && Array.isArray(error.validationErrors)) {
          console.error('Validation Errors:', error.validationErrors)
          const validationMessages = error.validationErrors.map((v: any) => 
            `${v.field}: ${v.message} (value: ${JSON.stringify(v.value)})`
          ).join('; ')
          console.error('Validation Error Summary:', validationMessages)
        }
        
        console.error('Full error details:', {
          message: errorMessage,
          stack: error?.stack,
          error: error,
          errorType: error?.constructor?.name,
          details: error?.details,
          validationErrors: error?.validationErrors,
          type: error?.type
        })
        
        // Provide more helpful error message based on the actual error
        let userFriendlyMessage = errorMessage
        
        // Check for pincode validation errors
        if (errorMessage.includes('pincode') || errorMessage.includes('Pincode')) {
          if (errorMessage.includes('missing')) {
            userFriendlyMessage = `Unable to process order: Your address is missing a pincode.\n\nPlease contact your administrator to update your address with a valid 6-digit pincode (e.g., "110001").`
          } else if (errorMessage.includes('Invalid') || errorMessage.includes('invalid')) {
            userFriendlyMessage = `Unable to process order: Your address has an invalid pincode format.\n\nPincode must be exactly 6 digits (e.g., "110001"). Please contact your administrator to update your address.`
          } else {
            userFriendlyMessage = `Unable to process order: Address validation failed.\n\n${errorMessage}\n\nPlease contact your administrator to update your address information.`
          }
        } else if (errorMessage.includes('No vendor found') || errorMessage.includes('vendor') && errorMessage.includes('not found')) {
          userFriendlyMessage = `Unable to process order: One or more products are not linked to a vendor.\n\nPlease ensure:\n1. Products are linked to your company\n2. Products are linked to vendors\n\nContact your administrator to set up product-vendor relationships.`
        } else if (errorMessage.includes('Company not found') || errorMessage.includes('companyId')) {
          userFriendlyMessage = `Unable to process order: Company information is missing or invalid.\n\nPlease contact support.`
        } else if (errorMessage.includes('Employee not found') || errorMessage.includes('employeeId')) {
          userFriendlyMessage = `Unable to process order: Employee information is missing or invalid.\n\nPlease log out and log back in.`
        } else if (errorMessage.includes('Product') && errorMessage.includes('not found')) {
          userFriendlyMessage = `Unable to process order: One or more products could not be found.\n\nPlease refresh the page and try again.`
        } else if (errorMessage.includes('API Error')) {
          // Extract the actual error from API Error messages
          const apiErrorMatch = errorMessage.match(/API Error: \d+ (.+)/)
          if (apiErrorMatch) {
            userFriendlyMessage = `Unable to process order: ${apiErrorMatch[1]}\n\nPlease contact support if this issue persists.`
          } else {
            // Try to extract error from "Internal Server Error" or similar
            userFriendlyMessage = `Unable to process order: ${errorMessage}\n\nPlease check the browser console for more details and contact support if this issue persists.`
          }
        } else if (errorMessage.includes('Internal Server Error') || errorMessage.includes('500')) {
          userFriendlyMessage = `Unable to process order: A server error occurred.\n\nPlease check:\n1. Products are linked to your company\n2. Products are linked to vendors\n\nCheck the browser console (F12) for detailed error information.`
        }
        
        // Set error state to prevent infinite retry loop
        setSaveError(userFriendlyMessage)
        alert(`Error saving order: ${userFriendlyMessage}`)
        
        // Clear the pending order from sessionStorage on error to prevent retry
        sessionStorage.removeItem('pendingOrder')
        console.log('Order confirmation: Cleared pending order from sessionStorage due to error')
      } finally {
        setSavingOrder(false)
      }
    }

    saveOrder()
  }, [orderData, currentEmployee, companyProducts, orderSaved, savingOrder, saveError])

  if (loading) {
    return (
      <DashboardLayout actorType="consumer">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 mb-4">Loading order details...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  // Show error state if save failed
  if (saveError) {
    return (
      <DashboardLayout actorType="consumer">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center max-w-md">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <AlertCircle className="h-10 w-10 text-red-600" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-4">Order Failed</h1>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 whitespace-pre-line">{saveError}</p>
            </div>
            <div className="flex space-x-4 justify-center">
              <Link
                href="/dashboard/consumer/catalog"
                className="bg-gray-200 text-gray-800 px-6 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Back to Catalog
              </Link>
              <button
                onClick={() => {
                  setSaveError(null)
                  setOrderData(null)
                  router.push('/dashboard/consumer/catalog')
                }}
                style={{ backgroundColor: company?.primaryColor || '#f76b1c' }}
                className="text-white px-6 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!orderData) {
    return (
      <DashboardLayout actorType="consumer">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-gray-600 mb-4">No order data found. Redirecting...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!currentEmployee) {
    return (
      <DashboardLayout actorType="consumer">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-red-600 mb-4">Employee data not found. Please log in again.</p>
            <Link
              href="/login/consumer"
              style={{ backgroundColor: company?.primaryColor || '#f76b1c' }}
              className="text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity inline-block"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const getEstimatedDeliveryTime = () => {
    // Calculate delivery time based on dispatch preference
    if (!currentEmployee?.dispatchPreference) {
      return '5-7 business days'
    }
    if (currentEmployee.dispatchPreference === 'direct') {
      return '3-5 business days'
    } else if (currentEmployee.dispatchPreference === 'central') {
      return '5-7 business days'
    } else {
      return '7-10 business days'
    }
  }

  const orderItems = orderData.items.map((item: any) => {
    // Only find products that are linked to the company
    const uniform = companyProducts.find(u => u.id === item.uniformId)
    return {
      ...item,
      uniform
    }
  }).filter((item: any) => item.uniform !== undefined) // Filter out any items that don't match company products

  return (
    <DashboardLayout actorType="consumer">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-6">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <h1 className="text-3xl font-semibold text-gray-900 mb-2">Order Confirmed!</h1>
            <p className="text-gray-600">Your order has been successfully placed</p>
            {savedOrderId && (
              <div className="mt-4">
                <p className="text-sm text-gray-500">Order Number</p>
                <p className="text-2xl font-bold" style={{ color: company?.primaryColor || '#f76b1c' }}>{savedOrder?.parentOrderId || savedOrderId}</p>
                {/* CRITICAL SECURITY: Only show split order info to admins */}
                {isAdmin && savedOrder?.isSplitOrder && savedOrder?.splitOrders && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500">Split into {savedOrder.splitOrders.length} vendor order(s)</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Personal Payment Notice */}
          {orderData?.isPersonalPayment && orderData?.personalPaymentAmount && parseFloat(orderData.personalPaymentAmount) > 0 && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-semibold text-yellow-800">Personal Payment Order</h3>
                  <p className="mt-1 text-sm text-yellow-700">
                    This order includes items beyond your eligibility. A personal payment of <span className="font-bold">₹{parseFloat(orderData.personalPaymentAmount).toFixed(2)}</span> will be required.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Awaiting Admin Approval Notice */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-yellow-600 mr-2 flex-shrink-0" />
              <p className="text-yellow-800 font-medium">
                Your order is awaiting admin approval. You will be notified once it's approved.
              </p>
            </div>
          </div>

          {/* CRITICAL SECURITY: Only show split order information to admins */}
          {isAdmin && savedOrder?.isSplitOrder && savedOrder?.splitOrders && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <Package className="h-5 w-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-blue-900 font-semibold mb-2">Your order has been split by vendor</p>
                  <p className="text-sm text-blue-800 mb-3">
                    Your order contains items from {savedOrder.splitOrders.length} different vendor{savedOrder.splitOrders.length > 1 ? 's' : ''}. 
                    Each vendor will process their portion separately.
                  </p>
                  <div className="space-y-2">
                    {savedOrder.splitOrders.map((split: any, idx: number) => (
                      <div key={idx} className="bg-white rounded p-2 text-sm">
                        <span className="font-medium text-blue-900">{split.vendorName}:</span>
                        <span className="text-blue-700 ml-2">
                          {split.itemCount} item(s)
                          {company?.showPrices && ` - ₹${split.total.toFixed(2)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Order Items */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <Package className="h-5 w-5 mr-2" style={{ color: company?.primaryColor || '#f76b1c' }} />
              Order Items
            </h2>
            <div className="space-y-3">
              {orderItems.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div>
                    <p className="font-medium text-gray-900">{item.uniformName}</p>
                    <p className="text-sm text-gray-600">Size: {item.size} × Quantity: {item.quantity}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Delivery Information */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div 
              className="rounded-lg p-6 border"
              style={{ 
                backgroundColor: company?.primaryColor ? `${company.primaryColor}10` : 'rgba(247, 107, 28, 0.1)',
                borderColor: company?.primaryColor ? `${company.primaryColor}40` : 'rgba(247, 107, 28, 0.4)'
              }}
            >
              <div className="flex items-center mb-3">
                <MapPin className="h-5 w-5 mr-2" style={{ color: company?.primaryColor || '#f76b1c' }} />
                <h3 className="font-semibold" style={{ color: company?.primaryColor || '#f76b1c' }}>Delivery Address</h3>
              </div>
              <p className="leading-relaxed" style={{ color: company?.primaryColor || '#f76b1c' }}>{currentEmployee?.address || 'Address not available'}</p>
            </div>

            <div 
              className="rounded-lg p-6 border"
              style={{ 
                backgroundColor: company?.primaryColor ? `${company.primaryColor}10` : 'rgba(247, 107, 28, 0.1)',
                borderColor: company?.primaryColor ? `${company.primaryColor}40` : 'rgba(247, 107, 28, 0.4)'
              }}
            >
              <div className="flex items-center mb-3">
                <Clock className="h-5 w-5 mr-2" style={{ color: company?.primaryColor || '#f76b1c' }} />
                <h3 className="font-semibold" style={{ color: company?.primaryColor || '#f76b1c' }}>Estimated Delivery Time</h3>
              </div>
              <p className="text-2xl font-bold mb-2" style={{ color: company?.primaryColor || '#f76b1c' }}>{getEstimatedDeliveryTime()}</p>
              <p className="text-sm mb-2" style={{ color: company?.primaryColor ? `${company.primaryColor}CC` : '#f76b1c' }}>
                <span className="font-semibold">5-7 business days post admin's approval</span>
              </p>
              <p className="text-sm" style={{ color: company?.primaryColor ? `${company.primaryColor}CC` : '#f76b1c' }}>Dispatch Preference: <span className="font-semibold capitalize">{currentEmployee?.dispatchPreference || 'standard'}</span></p>
            </div>
          </div>

          {/* Additional Info */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
            <h3 className="font-semibold text-gray-900 mb-3">What's Next?</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start">
                <span className="text-[#f76b1c] mr-2">•</span>
                <span>You will receive an email confirmation shortly</span>
              </li>
              <li className="flex items-start">
                <span className="text-[#f76b1c] mr-2">•</span>
                <span>Your order is awaiting admin approval. Once approved, it will be processed and shipped</span>
              </li>
              <li className="flex items-start">
                <span className="text-[#f76b1c] mr-2">•</span>
                <span>You can track your order status from the "My Orders" page</span>
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4">
            <Link
              href="/dashboard/consumer/orders"
              style={{ backgroundColor: company?.primaryColor || '#f76b1c' }}
              className="flex-1 text-white py-3 rounded-lg font-medium hover:opacity-90 transition-opacity text-center shadow-md"
            >
              View My Orders
            </Link>
            <Link
              href="/dashboard/consumer/catalog"
              className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-medium hover:bg-gray-300 transition-colors text-center"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}





