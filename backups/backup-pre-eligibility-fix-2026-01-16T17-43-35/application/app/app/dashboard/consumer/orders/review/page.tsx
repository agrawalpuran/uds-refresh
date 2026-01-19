'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { ShoppingCart, MapPin, Package, ArrowRight, CheckCircle, Clock } from 'lucide-react'
import { getProductsForDesignation, getEmployeeByEmail, getCompanyById, getConsumedEligibility, getVendorByEmail } from '@/lib/data-mongodb'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function OrderReviewPage() {
  const router = useRouter()
  const [orderData, setOrderData] = useState<any>(null)
  const [currentEmployee, setCurrentEmployee] = useState<any>(null)
  const [companyProducts, setCompanyProducts] = useState<any[]>([])
  const [company, setCompany] = useState<any>(null)
  // Dynamic eligibility: supports all categories (shirt, pant, shoe, jacket, belt, accessory, etc.)
  const [consumedEligibility, setConsumedEligibility] = useState<{
    shirt: number
    pant: number
    shoe: number
    jacket: number
    [key: string]: number // Allow dynamic categories
  }>({ shirt: 0, pant: 0, shoe: 0, jacket: 0 })
  const [totalEligibility, setTotalEligibility] = useState<Record<string, number>>({ 
    shirt: 0, 
    pant: 0, 
    shoe: 0, 
    jacket: 0 
  })
  const [dynamicEligibility, setDynamicEligibility] = useState<Record<string, number>>({}) // Full dynamic eligibility object
  const [dynamicConsumedEligibility, setDynamicConsumedEligibility] = useState<Record<string, number>>({}) // Full dynamic consumed eligibility
  const [loading, setLoading] = useState(true)
  
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
            console.error('Order Review - Email belongs to vendor, redirecting...')
            window.location.href = '/dashboard/vendor'
            return
          }
          
          const employee = await getEmployeeByEmail(userEmail)
          if (employee) {
            setCurrentEmployee(employee)
            // Ensure companyId is a string (handle populated objects)
            const companyId = typeof employee.companyId === 'object' && employee.companyId?.id 
              ? employee.companyId.id 
              : employee.companyId
            // Use employeeId field instead of id field
            const employeeId = employee.employeeId || employee.id
            
            const [products, companyData, consumed, eligibilityResponse] = await Promise.all([
              // CRITICAL MIGRATION: Use subcategory-based product fetching
              (async () => {
                const { getProductsForDesignation } = await import('@/lib/data-mongodb')
                return getProductsForDesignation(companyId, employee?.designation || '', employee?.gender as 'male' | 'female')
              })(),
              getCompanyById(companyId),
              getConsumedEligibility(employeeId),
              fetch(`/api/employees/${employeeId}/eligibility`).then(res => res.ok ? res.json() : null).catch(() => null)
            ])
            setCompanyProducts(products)
            setCompany(companyData)
            setConsumedEligibility(consumed)
            
            // CRITICAL FIX: Store dynamic consumed eligibility (supports all categories)
            if (consumed && consumed.consumed) {
              setDynamicConsumedEligibility(consumed.consumed)
            } else {
              setDynamicConsumedEligibility({})
            }
            
            // CRITICAL FIX: Set total eligibility from designation rules with dynamic categories
            if (eligibilityResponse) {
              // Extract legacy fields for backward compatibility
              const totalShirt = eligibilityResponse.shirt || 0
              const totalPant = eligibilityResponse.pant || 0
              const totalShoe = eligibilityResponse.shoe || 0
              const totalJacket = eligibilityResponse.jacket || 0
              
              // Extract dynamic eligibility object (includes all categories)
              const dynamicElig = eligibilityResponse.eligibility || {}
              setDynamicEligibility(dynamicElig)
              
              // Merge dynamic eligibility into totalEligibility
              const mergedEligibility: Record<string, number> = {
                shirt: totalShirt,
                pant: totalPant,
                shoe: totalShoe,
                jacket: totalJacket,
                ...dynamicElig // Merge dynamic categories (accessories, belt, blazer, etc.)
              }
              
              setTotalEligibility(mergedEligibility)
            } else {
              // Fallback to employee-level eligibility if API call fails
              setTotalEligibility({
                shirt: employee.eligibility?.shirt || 0,
                pant: employee.eligibility?.pant || 0,
                shoe: employee.eligibility?.shoe || 0,
                jacket: employee.eligibility?.jacket || 0,
              })
              setDynamicEligibility({})
            }
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
    // Check for pending order from sessionStorage
    const checkPendingOrder = () => {
      try {
        const pendingOrder = sessionStorage.getItem('pendingOrder')
        if (pendingOrder) {
          const parsed = JSON.parse(pendingOrder)
          setOrderData(parsed)
        } else {
          // If no pending order, redirect to catalog
          router.push('/dashboard/consumer/catalog')
        }
      } catch (error) {
        console.error('Error reading pending order:', error)
        router.push('/dashboard/consumer/catalog')
      }
    }
    
    checkPendingOrder()
  }, [router])

  const handlePlaceOrder = () => {
    if (!orderData || !currentEmployee) return
    
    // Calculate total
    const total = orderData.items.reduce((sum: number, item: any) => {
      const uniform = companyProducts.find(u => u.id === item.uniformId)
      return sum + (uniform?.price || item.price || 0) * item.quantity
    }, 0)
    
    // Calculate personal payment amount if eligibility is exceeded
    let personalPaymentAmount = 0
    let isPersonalPayment = false
    
    if (company?.allowPersonalPayments) {
      // Calculate category totals
      const categoryTotals: Record<string, number> = {}
      orderData.items.forEach((item: any) => {
        const uniform = companyProducts.find(u => u.id === item.uniformId)
        if (uniform) {
          categoryTotals[uniform.category] = (categoryTotals[uniform.category] || 0) + item.quantity
        }
      })
      
      // CRITICAL FIX: Use getEligibilityForCategory instead of old switch statement
      // Calculate personal payment for exceeded items
      for (const [category, total] of Object.entries(categoryTotals)) {
        const remainingEligibility = getEligibilityForCategory(category)
        const exceededQuantity = Math.max(0, total - remainingEligibility)
        
        if (exceededQuantity > 0) {
          isPersonalPayment = true
          // Calculate cost for exceeded items
          const exceededItems = orderData.items.filter((item: any) => {
            const uniform = companyProducts.find(u => u.id === item.uniformId)
            return uniform && (uniform.category === category || 
              (category === 'pant' && uniform.category === 'trouser') ||
              (category === 'trouser' && uniform.category === 'pant') ||
              (category === 'jacket' && uniform.category === 'blazer') ||
              (category === 'blazer' && uniform.category === 'jacket'))
          })
          
          // Calculate personal payment proportionally
          let itemsProcessed = 0
          for (const item of exceededItems) {
            const uniform = companyProducts.find(u => u.id === item.uniformId)
            if (uniform && itemsProcessed < exceededQuantity) {
              const itemPrice = uniform.price || item.price || 0
              const quantityToCharge = Math.min(item.quantity, exceededQuantity - itemsProcessed)
              personalPaymentAmount += itemPrice * quantityToCharge
              itemsProcessed += quantityToCharge
            }
          }
        }
      }
    }
    
    // Add total and personal payment info to order data
    const finalOrderData = {
      ...orderData,
      total: total.toFixed(2),
      isPersonalPayment,
      personalPaymentAmount: personalPaymentAmount.toFixed(2)
    }
    
    // Update sessionStorage with final order data
    sessionStorage.setItem('pendingOrder', JSON.stringify(finalOrderData))
    
    // Navigate to confirmation page
    window.location.href = '/dashboard/consumer/orders/confirm'
  }

  const handleCancel = () => {
    sessionStorage.removeItem('pendingOrder')
    router.push('/dashboard/consumer/catalog')
  }

  if (loading) {
    return (
      <DashboardLayout actorType="consumer">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 mb-4">Loading order review...</p>
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

  // Calculate order total
  const orderTotal = orderData.items.reduce((sum: number, item: any) => {
    const uniform = companyProducts.find(u => u.id === item.uniformId)
    return sum + (uniform?.price || item.price || 0) * item.quantity
  }, 0)
  
  // CRITICAL FIX: Use same eligibility logic as catalog/dashboard pages
  const getEligibilityForCategory = (category: string): number => {
    if (!currentEmployee) return 0
    
    // Robust category name matching for belt/accessory and all dynamic categories
    const normalizedCategory = category.toLowerCase().trim()
    
    // Get all eligibility keys (from both dynamic and legacy sources)
    const allEligibilityKeys = Object.keys({ ...dynamicEligibility, ...totalEligibility })
    
    // Build comprehensive category variations to try
    const categoryVariations = new Set<string>()
    categoryVariations.add(normalizedCategory) // Try exact match first
    
    // Belt products have category="accessory" in the product model
    // But eligibility might be stored under "accessory", "accessories", or "belt"
    if (normalizedCategory === 'belt') {
      categoryVariations.add('accessory')
      categoryVariations.add('accessories')
    }
    if (normalizedCategory === 'accessory' || normalizedCategory === 'accessories') {
      categoryVariations.add('belt')
      categoryVariations.add('accessory')
      categoryVariations.add('accessories')
    }
    
    // Add all case-insensitive matches from eligibility keys
    for (const key of allEligibilityKeys) {
      const keyLower = key.toLowerCase()
      if (keyLower === normalizedCategory || 
          keyLower.includes(normalizedCategory) || 
          normalizedCategory.includes(keyLower)) {
        categoryVariations.add(keyLower)
      }
    }
    
    // Try each category variation until we find a match
    let totalEligibilityValue = 0
    
    for (const catVar of Array.from(categoryVariations)) {
      // Check totalEligibility FIRST (includes merged dynamicEligibility)
      let found = 0
      
      if (totalEligibility[catVar] !== undefined && totalEligibility[catVar] !== null) {
        found = Number(totalEligibility[catVar])
      }
      else if (dynamicEligibility[catVar] !== undefined && dynamicEligibility[catVar] !== null) {
        found = Number(dynamicEligibility[catVar])
      }
      else {
        switch (catVar) {
          case 'shirt': found = Number(totalEligibility.shirt || 0); break
          case 'pant': case 'trouser': found = Number(totalEligibility.pant || 0); break
          case 'shoe': found = Number(totalEligibility.shoe || 0); break
          case 'jacket': case 'blazer': found = Number(totalEligibility.jacket || 0); break
          default: found = 0
        }
      }
      
      if (found > 0) {
        totalEligibilityValue = found
        if (catVar === normalizedCategory) {
          break
        }
      }
    }
    
    // Subtract consumed eligibility from previous orders
    const allConsumedKeys = Object.keys({ ...dynamicConsumedEligibility, ...consumedEligibility })
    let consumed = 0
    
    for (const catVar of Array.from(categoryVariations)) {
      let found = 0
      
      if (dynamicConsumedEligibility[catVar] !== undefined && dynamicConsumedEligibility[catVar] !== null) {
        found = Number(dynamicConsumedEligibility[catVar])
      }
      else if (consumedEligibility[catVar] !== undefined && consumedEligibility[catVar] !== null) {
        found = Number(consumedEligibility[catVar])
      }
      else {
        switch (catVar) {
          case 'shirt': found = Number(consumedEligibility.shirt || 0); break
          case 'pant': case 'trouser': found = Number(consumedEligibility.pant || 0); break
          case 'shoe': found = Number(consumedEligibility.shoe || 0); break
          case 'jacket': case 'blazer': found = Number(consumedEligibility.jacket || 0); break
          default: found = 0
        }
      }
      
      if (found > 0) {
        consumed = found
        if (catVar === normalizedCategory) {
          break
        }
      }
    }
    
    if (consumed === 0) {
      for (const key of allConsumedKeys) {
        const keyLower = key.toLowerCase()
        if (categoryVariations.has(keyLower)) {
          const found = dynamicConsumedEligibility[key] || consumedEligibility[key] || 0
          if (found > 0) {
            consumed = Number(found)
            break
          }
        }
      }
    }
    
    // Return remaining eligibility (total - consumed)
    return Math.max(0, totalEligibilityValue - consumed)
  }
  
  // Calculate personal payment amount if eligibility is exceeded
  const calculatePersonalPayment = () => {
    if (!company?.allowPersonalPayments || !currentEmployee) return { amount: 0, isPersonalPayment: false }
    
    const categoryTotals: Record<string, number> = {}
    orderData.items.forEach((item: any) => {
      const uniform = companyProducts.find(u => u.id === item.uniformId)
      if (uniform) {
        const category = uniform.category
        categoryTotals[category] = (categoryTotals[category] || 0) + item.quantity
      }
    })
    
    let personalPaymentAmount = 0
    let isPersonalPayment = false
    
    for (const [category, total] of Object.entries(categoryTotals)) {
      // CRITICAL FIX: Use getEligibilityForCategory instead of old switch statement
      const remainingEligibility = getEligibilityForCategory(category)
      const exceededQuantity = Math.max(0, total - remainingEligibility)
      
      if (exceededQuantity > 0) {
        isPersonalPayment = true
        // Calculate cost for exceeded items
        const exceededItems = orderData.items.filter((item: any) => {
          const uniform = companyProducts.find(u => u.id === item.uniformId)
          return uniform && (uniform.category === category || 
            (category === 'pant' && uniform.category === 'trouser') ||
            (category === 'trouser' && uniform.category === 'pant') ||
            (category === 'jacket' && uniform.category === 'blazer') ||
            (category === 'blazer' && uniform.category === 'jacket'))
        })
        
        // Calculate personal payment proportionally
        let itemsProcessed = 0
        for (const item of exceededItems) {
          const uniform = companyProducts.find(u => u.id === item.uniformId)
          if (uniform && itemsProcessed < exceededQuantity) {
            const itemPrice = uniform.price || item.price || 0
            const quantityToCharge = Math.min(item.quantity, exceededQuantity - itemsProcessed)
            personalPaymentAmount += itemPrice * quantityToCharge
            itemsProcessed += quantityToCharge
          }
        }
      }
    }
    
    return { amount: personalPaymentAmount, isPersonalPayment }
  }
  
  const personalPayment = calculatePersonalPayment()

  // Get order items with product details
  const orderItems = orderData.items.map((item: any) => {
    const uniform = companyProducts.find(u => u.id === item.uniformId)
    return {
      ...item,
      uniform,
      itemTotal: (uniform?.price || 0) * item.quantity
    }
  }).filter((item: any) => item.uniform !== undefined)

  // Calculate estimated delivery date
  const getEstimatedDeliveryDate = () => {
    if (!currentEmployee?.dispatchPreference) {
      return null
    }
    
    const today = new Date()
    let daysToAdd = 0
    
    if (currentEmployee.dispatchPreference === 'direct') {
      daysToAdd = 5 // 3-5 business days, use max
    } else if (currentEmployee.dispatchPreference === 'central') {
      daysToAdd = 7 // 5-7 business days, use max
    } else {
      daysToAdd = 10 // 7-10 business days, use max
    }
    
    // Add processing time (1-2 business days)
    daysToAdd += 2
    
    // Calculate delivery date (skip weekends)
    let deliveryDate = new Date(today)
    let businessDaysAdded = 0
    
    while (businessDaysAdded < daysToAdd) {
      deliveryDate.setDate(deliveryDate.getDate() + 1)
      // Skip weekends (Saturday = 6, Sunday = 0)
      if (deliveryDate.getDay() !== 0 && deliveryDate.getDay() !== 6) {
        businessDaysAdded++
      }
    }
    
    return deliveryDate
  }

  const estimatedDeliveryDate = getEstimatedDeliveryDate()
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  }

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

  return (
    <DashboardLayout actorType="consumer">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-6">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-gray-900 mb-2 flex items-center">
              <ShoppingCart className="h-8 w-8 mr-3" style={{ color: company?.primaryColor || '#f76b1c' }} />
              Review Your Order
            </h1>
            <p className="text-gray-600">Please review your order details before confirming</p>
          </div>

          {/* Order Items */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <Package className="h-5 w-5 mr-2" style={{ color: company?.primaryColor || '#f76b1c' }} />
              Order Items
            </h2>
            <div className="space-y-3">
              {orderItems.map((item: any, idx: number) => (
                <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.uniformName}</p>
                      <p className="text-sm text-gray-600">Size: {item.size} × Quantity: {item.quantity}</p>
                      {item.uniform && (
                        <p className="text-sm text-gray-500 mt-1">Category: <span className="capitalize">{item.uniform.category}</span></p>
                      )}
                      {company?.showPrices && item.uniform && (
                        <p className="text-sm text-gray-500 mt-1">Price: ₹{item.uniform.price.toFixed(2)} each</p>
                      )}
                    </div>
                    {company?.showPrices && (
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">₹{item.itemTotal.toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Estimated Delivery Information */}
          {estimatedDeliveryDate && (
            <div 
              className="mb-8 p-6 rounded-lg border"
              style={{ 
                backgroundColor: company?.primaryColor ? `${company.primaryColor}10` : 'rgba(247, 107, 28, 0.1)',
                borderColor: company?.primaryColor ? `${company.primaryColor}40` : 'rgba(247, 107, 28, 0.4)'
              }}
            >
              <div className="flex items-center mb-3">
                <Clock className="h-5 w-5 mr-2" style={{ color: company?.primaryColor || '#f76b1c' }} />
                <h3 className="font-semibold" style={{ color: company?.primaryColor || '#f76b1c' }}>Estimated Delivery</h3>
              </div>
              <p className="text-2xl font-bold mb-2" style={{ color: company?.primaryColor || '#f76b1c' }}>{formatDate(estimatedDeliveryDate)}</p>
              <p className="text-sm" style={{ color: company?.primaryColor ? `${company.primaryColor}CC` : '#f76b1c' }}>
                Estimated delivery time: {getEstimatedDeliveryTime()} (plus 1-2 business days for processing)
              </p>
              {currentEmployee?.dispatchPreference && (
                <p className="text-xs mt-2" style={{ color: company?.primaryColor || '#f76b1c' }}>
                  Based on your dispatch preference: <span className="font-semibold capitalize">{currentEmployee.dispatchPreference}</span>
                </p>
              )}
            </div>
          )}

          {/* Personal Payment Notice */}
          {personalPayment.isPersonalPayment && (
            <div className="mb-8 p-6 bg-yellow-50 border border-yellow-300 rounded-lg">
              <div className="flex items-start mb-3">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-semibold text-yellow-800">Personal Payment Required</h3>
                  <p className="mt-1 text-sm text-yellow-700">
                    Your order exceeds your eligibility limits. You will need to make a personal payment of <span className="font-bold">₹{personalPayment.amount.toFixed(2)}</span> for the items beyond your entitlement.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Order Summary - Only show if prices are enabled */}
          {company?.showPrices && (
            <div className="mb-8 p-6 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-700">Subtotal:</span>
                <span className="font-semibold text-gray-900">₹{orderTotal.toFixed(2)}</span>
              </div>
              {personalPayment.isPersonalPayment && (
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-700">Personal Payment (beyond eligibility):</span>
                  <span className="font-semibold text-yellow-700">₹{personalPayment.amount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-700">Shipping:</span>
                <span className="font-semibold text-gray-900">Free</span>
              </div>
              <div className="border-t border-blue-300 pt-2 mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-gray-900">Total:</span>
                  <span className="text-2xl font-bold" style={{ color: company?.primaryColor || '#f76b1c' }}>₹{orderTotal.toFixed(2)}</span>
                </div>
                {personalPayment.isPersonalPayment && (
                  <p className="text-xs text-gray-600 mt-2">
                    * ₹{personalPayment.amount.toFixed(2)} will be charged as personal payment
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Delivery Information */}
          <div className="mb-8 p-6 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-center mb-3">
              <MapPin className="h-5 w-5 text-gray-600 mr-2" />
              <h3 className="font-semibold text-gray-900">Delivery Address</h3>
            </div>
            <p className="text-gray-700 leading-relaxed">{currentEmployee?.address || 'Address not available'}</p>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4">
            <button
              onClick={handleCancel}
              className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-medium hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handlePlaceOrder}
              style={{ backgroundColor: company?.primaryColor || '#f76b1c' }}
              className="flex-1 text-white py-3 rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center justify-center space-x-2 shadow-md"
            >
              <CheckCircle className="h-5 w-5" />
              <span>Confirm & Place Order</span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

