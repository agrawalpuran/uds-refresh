'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Package, ShoppingCart, CheckCircle, Clock, Plus, Minus, ArrowRight } from 'lucide-react'
import { getProductsForDesignation, getEmployeeByEmail, getOrdersByEmployee, getConsumedEligibility, getCompanyById, isCompanyAdmin, getLocationByAdminEmail, getBranchByAdminEmail, Uniform } from '@/lib/data-mongodb'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
// Removed maskEmail import - employees should see their own information unmasked
import { getUniformImage } from '@/lib/utils/image-mapping'

export default function ConsumerDashboard() {
  const router = useRouter()
  
  // State for employee and products
  const [currentEmployee, setCurrentEmployee] = useState<any>(null)
  const [companyProducts, setCompanyProducts] = useState<Uniform[]>([])
  const [myOrders, setMyOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quickOrderCart, setQuickOrderCart] = useState<Record<string, { size: string; quantity: number }>>({})
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({})
  const [showTooltip, setShowTooltip] = useState<string | null>(null)
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
  const [company, setCompany] = useState<any>(null)
  const [userProfile, setUserProfile] = useState<{
    name: string
    company: { id: string; name: string }
    role: string
    location: { id: string; name: string; address?: string; city?: string; state?: string; pincode?: string } | null
  } | null>(null)
  
  // Get current employee from tab-specific storage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        try {
          setLoading(true)
          // Use tab-specific authentication storage
          const { getUserEmail, getAuthData } = await import('@/lib/utils/auth-storage')
          // CRITICAL SECURITY FIX: Use only tab-specific auth storage
          const userEmail = getUserEmail('consumer')
          console.log('Consumer Dashboard - User Email:', userEmail)
          
          if (!userEmail) {
            console.error('Consumer Dashboard - No userEmail found')
            setError('No email found. Please log in again.')
            setLoading(false)
            return
          }
          
          try {
            // OPTIMIZED ROLE DETECTION: Use sessionStorage to check role first
            // This avoids unnecessary API calls - role is already determined at login time
            const currentActorType = sessionStorage.getItem('currentActorType')
            const vendorAuthData = getAuthData('vendor')
            
            // If user logged in as vendor, redirect to vendor portal immediately (no API call needed)
            if (currentActorType === 'vendor' || vendorAuthData?.vendorId) {
              console.log('Consumer Dashboard - User is logged in as vendor, redirecting to vendor portal')
              router.push('/dashboard/vendor')
              setLoading(false)
              return
            }
            
            // Only call getEmployeeByEmail for consumer/employee users
            const employee = await getEmployeeByEmail(userEmail)
            
            console.log('Consumer Dashboard - Employee:', employee)
            
            if (!employee) {
              console.error('Consumer Dashboard - No employee found for email:', userEmail)
              setError(`No employee account found for email: ${userEmail}. Please check your login credentials or contact support.`)
              setLoading(false)
              return
            }
            
            setCurrentEmployee(employee)
            
            // ENFORCEMENT: Check if employee order is enabled (only for regular employees, not admins)
            const companyIdForCheck = typeof employee.companyId === 'object' && employee.companyId?.id
              ? employee.companyId.id
              : employee.companyId
            
            if (companyIdForCheck) {
              const isAdmin = await isCompanyAdmin(userEmail, companyIdForCheck)
              const location = await getLocationByAdminEmail(userEmail)
              const branch = await getBranchByAdminEmail(userEmail)
              
              // If not an admin, check if employee order is enabled
              if (!isAdmin && !location && !branch) {
                const companyData = await getCompanyById(companyIdForCheck)
                // Check if enableEmployeeOrder is explicitly false (undefined/null means not set, which should default to false)
                if (companyData && (companyData.enableEmployeeOrder === false || companyData.enableEmployeeOrder === undefined)) {
                  setError('Employee orders are currently disabled for your company. Please contact your administrator.')
                  setLoading(false)
                  router.push('/login/consumer')
                  return
                }
              }
            }
            
            // Ensure companyId is a string (handle populated objects, ObjectIds, numbers, and strings)
            // Use the same logic as the fetch script to handle ObjectId conversion
            let companyId: string | undefined
            if (employee.companyId !== null && employee.companyId !== undefined) {
              if (typeof employee.companyId === 'object' && employee.companyId !== null) {
                // Populated object - check for id field first (company string ID like 'COMP-INDIGO')
                if (employee.companyId.id) {
                  companyId = String(employee.companyId.id) // Convert to string
                } else if (employee.companyId._id) {
                  // Only _id present - need to look up the company
                  const _idStr = employee.companyId._id.toString()
                  console.log('Consumer Dashboard - companyId is object with _id, looking up company:', _idStr)
                  try {
                    const { getAllCompanies } = await import('@/lib/data-mongodb')
                    const companies = await getAllCompanies()
                    // Companies from API should have both _id and id fields
                    const matchingCompany = companies.find((c: any) => {
                      // Compare ObjectId strings
                      const companyObjectId = c._id?.toString() || (typeof c._id === 'string' ? c._id : null)
                      return companyObjectId === _idStr
                    })
                    if (matchingCompany) {
                      companyId = String(matchingCompany.id) // Convert to string
                      console.log('Consumer Dashboard - Found company by ObjectId _id:', companyId)
                    }
                  } catch (error) {
                    console.error('Consumer Dashboard - Error looking up company by _id:', error)
                  }
                }
              } else if (typeof employee.companyId === 'number') {
                // companyId is a number (like 3) - convert to string
                companyId = String(employee.companyId)
                console.log('Consumer Dashboard - companyId is number, converted to string:', companyId)
              } else if (typeof employee.companyId === 'string') {
                // Already a string - check if it's an ObjectId (24 hex chars) or company string ID
                if (/^[0-9a-fA-F]{24}$/.test(employee.companyId)) {
                  // It's an ObjectId string - need to look up the company
                  console.log('Consumer Dashboard - companyId is ObjectId string, looking up company:', employee.companyId)
                  try {
                    const { getAllCompanies } = await import('@/lib/data-mongodb')
                    const companies = await getAllCompanies()
                    // Find company by matching ObjectId
                    const matchingCompany = companies.find((c: any) => {
                      const companyObjectId = c._id?.toString() || (typeof c._id === 'string' ? c._id : null)
                      return companyObjectId === employee.companyId
                    })
                    if (matchingCompany) {
                      companyId = String(matchingCompany.id) // Convert to string
                      console.log('Consumer Dashboard - Found company by ObjectId string:', companyId)
                    } else {
                      console.warn('Consumer Dashboard - Company not found for ObjectId:', employee.companyId)
                    }
                  } catch (error) {
                    console.error('Consumer Dashboard - Error looking up company by ObjectId:', error)
                  }
                } else {
                  // It's already a company string ID (like 'COMP-INDIGO' or numeric string like '3')
                  companyId = employee.companyId
                }
              }
            }
            
            // If companyId is still not found, employee is not properly linked to a company
            // This should not happen - all employees must have a companyId
            if (!companyId) {
              console.error('Consumer Dashboard - Employee has no companyId. Employee must be linked to a company using companyId.')
            }
            
            console.log('Consumer Dashboard - Employee companyId raw:', employee.companyId)
            console.log('Consumer Dashboard - Employee companyId type:', typeof employee.companyId)
            console.log('Consumer Dashboard - Employee companyId isObject:', typeof employee.companyId === 'object')
            console.log('Consumer Dashboard - Employee companyId isNull:', employee.companyId === null)
            console.log('Consumer Dashboard - Employee companyId keys:', employee.companyId && typeof employee.companyId === 'object' ? Object.keys(employee.companyId) : 'N/A')
            console.log('Consumer Dashboard - Full employee object:', JSON.stringify(employee, null, 2))
            console.log('Consumer Dashboard - Company ID extracted:', companyId, 'Type:', typeof companyId)
            console.log('Consumer Dashboard - Company Name:', employee.companyName)
            
            if (!companyId) {
              console.error('Consumer Dashboard - No companyId found for employee:', employee.employeeId, 'Employee data:', {
                employeeId: employee.employeeId,
                companyId: employee.companyId,
                companyName: employee.companyName
              })
              setError('Employee is not associated with a company. Please contact your administrator.')
              setLoading(false)
              return
            }
            
            // Use employeeId field instead of id field
            const employeeId = employee.employeeId || employee.id
            
            // CRITICAL MIGRATION: Use subcategory-based product fetching
            // Load products (filtered by designation and gender using subcategory eligibility), orders, consumed eligibility, total eligibility, and company settings in parallel
            const { getProductsForDesignation } = await import('@/lib/data-mongodb')
            const [products, orders, consumed, companyData, eligibilityResponse] = await Promise.all([
              getProductsForDesignation(companyId, employee.designation || '', employee.gender as 'male' | 'female'),
              getOrdersByEmployee(employeeId),
              getConsumedEligibility(employeeId),
              getCompanyById(companyId),
              fetch(`/api/employees/${employeeId}/eligibility`).then(res => res.ok ? res.json() : null).catch(() => null)
            ])
            
            console.log('Consumer Dashboard - Products loaded:', products.length, products)
            console.log('Consumer Dashboard - Orders loaded:', orders.length, orders)
            console.log('Consumer Dashboard - Consumed eligibility:', consumed)
            console.log('Consumer Dashboard - Total eligibility from designation:', eligibilityResponse)
            console.log('Consumer Dashboard - Company settings:', companyData ? { showPrices: companyData.showPrices, allowPersonalPayments: companyData.allowPersonalPayments } : 'not loaded')
            
            setCompanyProducts(products)
            setMyOrders(orders)
            setConsumedEligibility(consumed)
            setCompany(companyData)
            
            // CRITICAL FIX: Store dynamic consumed eligibility (supports all categories)
            if (consumed && consumed.consumed) {
              setDynamicConsumedEligibility(consumed.consumed)
            } else {
              setDynamicConsumedEligibility({})
            }
            
            // Set total eligibility from designation rules (fallback to employee-level if API fails)
            // CRITICAL FIX: Support dynamic categories (belt, accessory, etc.) not just legacy 4
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
            
            // Fetch user profile information
            try {
              const profileResponse = await fetch(`/api/user/profile?email=${encodeURIComponent(userEmail)}`)
              if (profileResponse.ok) {
                const profileData = await profileResponse.json()
                setUserProfile(profileData)
              } else {
                console.warn('Failed to fetch user profile:', profileResponse.status)
              }
            } catch (profileError) {
              console.error('Error fetching user profile:', profileError)
            }
            
            if (products.length === 0) {
              console.warn('No products found for company:', companyId)
            }
          } catch (apiError: any) {
            console.error('Consumer Dashboard - API Error:', apiError)
            setError(apiError?.message || 'Failed to load employee data. Please try again.')
          }
        } catch (error: any) {
          console.error('Consumer Dashboard - Error loading data:', error)
          setError(error?.message || 'Failed to load data. Please try again.')
        } finally {
          setLoading(false)
        }
      }
      
      loadData()
    }
  }, [])
  
  const pendingOrders = myOrders.filter(o => o.status === 'Awaiting approval' || o.status === 'Awaiting fulfilment').length
  const totalOrders = myOrders.length
  
  // Auto-select sizes based on profile
  useEffect(() => {
    if (!currentEmployee || companyProducts.length === 0) return
    
    const autoSizes: Record<string, string> = {}
    companyProducts.forEach(uniform => {
      if (uniform.category === 'shirt') {
        autoSizes[uniform.id] = currentEmployee.shirtSize || 'M'
      } else if (uniform.category === 'pant') {
        autoSizes[uniform.id] = currentEmployee.pantSize || '32'
      } else if (uniform.category === 'shoe') {
        autoSizes[uniform.id] = currentEmployee.shoeSize || '9'
      } else {
        autoSizes[uniform.id] = currentEmployee.shirtSize || 'M'
      }
    })
    setSelectedSizes(autoSizes)
  }, [companyProducts, currentEmployee])
  
  // Show top 6 products for quick order
  const quickOrderProducts = companyProducts.slice(0, 6)
  
  const getEligibilityForCategory = (category: string): number => {
    if (!currentEmployee) return 0
    
    // CRITICAL FIX: Robust category name matching for belt/accessory and all dynamic categories
    // Normalize category name for lookup
    const normalizedCategory = category.toLowerCase().trim()
    
    // Get all eligibility keys (from both dynamic and legacy sources)
    const allEligibilityKeys = Object.keys({ ...dynamicEligibility, ...totalEligibility })
    
    // Build comprehensive category variations to try
    const categoryVariations = new Set<string>()
    categoryVariations.add(normalizedCategory) // Try exact match first
    
    // CRITICAL FIX: Belt products have category="accessory" in the product model
    // But eligibility might be stored under "accessory", "accessories", or "belt"
    // Try ALL variations
    if (normalizedCategory === 'belt') {
      categoryVariations.add('accessory')
      categoryVariations.add('accessories')
    }
    if (normalizedCategory === 'accessory' || normalizedCategory === 'accessories') {
      categoryVariations.add('belt')
      categoryVariations.add('accessory') // Ensure we try exact match
      categoryVariations.add('accessories') // Try plural too
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
      // CRITICAL FIX: Check totalEligibility FIRST since it includes merged dynamicEligibility
      // This ensures we get the correct value even if there's a timing issue with state updates
      let found = 0
      
      // Priority 1: Check totalEligibility FIRST (includes merged dynamicEligibility from setTotalEligibility)
      // This is the most reliable source since it's set with the merged data in the same useEffect
      if (totalEligibility[catVar] !== undefined && totalEligibility[catVar] !== null) {
        found = Number(totalEligibility[catVar]) // Ensure it's a number
      }
      // Priority 2: Check dynamicEligibility directly (fallback in case merge didn't work)
      else if (dynamicEligibility[catVar] !== undefined && dynamicEligibility[catVar] !== null) {
        found = Number(dynamicEligibility[catVar]) // Ensure it's a number
      }
      // Priority 3: Check legacy fields (for backward compatibility)
      else {
        switch (catVar) {
          case 'shirt': found = Number(totalEligibility.shirt || 0); break
          case 'pant': found = Number(totalEligibility.pant || 0); break
          case 'shoe': found = Number(totalEligibility.shoe || 0); break
          case 'jacket': found = Number(totalEligibility.jacket || 0); break
          default: found = 0
        }
      }
      
      // Use the first non-zero value found (prioritize exact matches)
      if (found > 0) {
        totalEligibilityValue = found
        // If it's an exact match, use it immediately
        if (catVar === normalizedCategory) {
          break
        }
      }
    }
    
    // Subtract consumed eligibility from previous orders
    // Use the same matching logic for consumed eligibility
    const allConsumedKeys = Object.keys({ ...dynamicConsumedEligibility, ...consumedEligibility })
    let consumed = 0
    
    for (const catVar of Array.from(categoryVariations)) {
      let found = 0
      
      // Priority 1: Check dynamicConsumedEligibility first
      if (dynamicConsumedEligibility[catVar] !== undefined && dynamicConsumedEligibility[catVar] !== null) {
        found = Number(dynamicConsumedEligibility[catVar])
      }
      // Priority 2: Check consumedEligibility
      else if (consumedEligibility[catVar] !== undefined && consumedEligibility[catVar] !== null) {
        found = Number(consumedEligibility[catVar])
      }
      // Priority 3: Check legacy fields
      else {
        switch (catVar) {
          case 'shirt': found = Number(consumedEligibility.shirt || 0); break
          case 'pant': found = Number(consumedEligibility.pant || 0); break
          case 'shoe': found = Number(consumedEligibility.shoe || 0); break
          case 'jacket': found = Number(consumedEligibility.jacket || 0); break
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
    
    // If still zero, try all consumed keys
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

  const getTotalQuantityForCategory = (category: string): number => {
    return Object.entries(quickOrderCart).reduce((total, [uniformId, cartItem]) => {
      const uniform = companyProducts.find(u => u.id === uniformId)
      if (uniform?.category === category) {
        return total + cartItem.quantity
      }
      return total
    }, 0)
  }
  
  const updateQuickOrderQuantity = (uniformId: string, delta: number) => {
    const uniform = companyProducts.find(u => u.id === uniformId)
    if (!uniform) return
    
    const currentQuantity = quickOrderCart[uniformId]?.quantity || 0
    const newQuantity = currentQuantity + delta
    const selectedSize = selectedSizes[uniformId] || uniform.sizes[0]
    
    // Eligibility check
    const eligibility = getEligibilityForCategory(uniform.category)
    const totalForCategory = getTotalQuantityForCategory(uniform.category)
    const otherItemsQuantity = totalForCategory - currentQuantity
    const totalAfterChange = newQuantity + otherItemsQuantity
    
    // Prevent negative quantities
    if (newQuantity < 0) return
    
    // Check eligibility limit - allow exceeding if personal payments are enabled
    if (totalAfterChange > eligibility) {
      if (!company?.allowPersonalPayments) {
        const remaining = Math.max(0, eligibility - otherItemsQuantity)
        alert(`You can only order up to ${eligibility} ${uniform.category}(s) total. You have already selected ${otherItemsQuantity} other ${uniform.category}(s). Maximum allowed for this item: ${remaining}.\n\nPersonal payment orders are not enabled for your company.`)
        return
      }
      // Personal payments are enabled - allow adding beyond eligibility
      // The personal payment amount will be calculated on the review page
    }
    
    if (newQuantity === 0) {
      const newCart = { ...quickOrderCart }
      delete newCart[uniformId]
      setQuickOrderCart(newCart)
    } else {
      setQuickOrderCart(prev => ({
        ...prev,
        [uniformId]: { size: selectedSize, quantity: newQuantity }
      }))
    }
  }
  
  const handleQuickOrderCheckout = () => {
    if (Object.keys(quickOrderCart).length === 0) {
      alert('Please add items to your cart first')
      return
    }
    
    // Calculate category totals
    const categoryTotals: Record<string, number> = {}
    Object.entries(quickOrderCart).forEach(([uniformId, item]) => {
      const uniform = companyProducts.find(u => u.id === uniformId)
      if (uniform) {
        categoryTotals[uniform.category] = (categoryTotals[uniform.category] || 0) + item.quantity
      }
    })
    
    // Check if any category exceeds eligibility
    const exceededCategories: Array<{ category: string; requested: number; eligible: number }> = []
    for (const [category, total] of Object.entries(categoryTotals)) {
      const eligibility = getEligibilityForCategory(category)
      if (total > eligibility) {
        exceededCategories.push({ category, requested: total, eligible: eligibility })
      }
    }
    
    // If eligibility is exceeded, check if personal payments are allowed
    if (exceededCategories.length > 0) {
      if (!company?.allowPersonalPayments) {
        const errorMsg = exceededCategories.map(
          e => `${e.category}: ${e.requested} requested, ${e.eligible} eligible`
        ).join('\n')
        alert(`Error: Your cart exceeds eligibility limits:\n${errorMsg}\n\nPersonal payment orders are not enabled for your company. Please adjust your order.`)
        return
      }
      // Personal payments are allowed - proceed to review page where personal payment will be calculated
    }
    
    // Store order data and navigate to catalog/checkout
    const orderData = {
      items: Object.entries(quickOrderCart).map(([uniformId, item]) => {
        const uniform = companyProducts.find(u => u.id === uniformId)
        return {
          uniformId,
          uniformName: uniform?.name || '',
          size: item.size,
          quantity: item.quantity,
          price: uniform?.price || 0
        }
      })
    }
    
    try {
      sessionStorage.setItem('pendingOrder', JSON.stringify(orderData))
      router.push('/dashboard/consumer/orders/review')
    } catch (error) {
      console.error('Error saving order data:', error)
      alert('Error processing checkout. Please try again.')
    }
  }
  
  const getCartTotalItems = () => {
    return Object.values(quickOrderCart).reduce((sum, item) => sum + item.quantity, 0)
  }

  if (loading) {
    return (
      <DashboardLayout actorType="consumer">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (error) {
    return (
      <DashboardLayout actorType="consumer">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={() => {
                setError(null)
                setLoading(true)
                const loadData = async () => {
                  try {
                    const { getUserEmail } = await import('@/lib/utils/auth-storage')
                    // CRITICAL SECURITY FIX: Use only tab-specific auth storage
                    const userEmail = getUserEmail('consumer')
                    if (userEmail) {
                      const employee = await getEmployeeByEmail(userEmail)
                      if (employee) {
                        setCurrentEmployee(employee)
                        const companyId = typeof employee.companyId === 'object' && employee.companyId?.id 
                          ? employee.companyId.id 
                          : employee.companyId
                        const products = await getProductsByCompany(companyId, employee.designation, employee.gender as 'male' | 'female')
                        setCompanyProducts(products)
                        const orders = await getOrdersByEmployee(employee.employeeId || employee.id)
                        setMyOrders(orders)
                      }
                    }
                  } catch (err) {
                    setError('Failed to load data')
                  } finally {
                    setLoading(false)
                  }
                }
                loadData()
              }}
              style={{
                backgroundColor: company?.primaryColor || '#f76b1c',
              }}
              className="text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
            >
              Retry
            </button>
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
            <p className="text-gray-600 mb-4">No employee data found. Please log in again.</p>
            <Link
              href="/login/consumer"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 inline-block"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="consumer">
      <div>
        {/* Welcome Section with User Details */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            {userProfile?.name ? `Welcome back, ${userProfile.name}!` : 'Welcome Back!'}
          </h1>
          
          {/* User Information Card */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 mb-8">
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Company</span>
                  <p className="text-sm font-medium text-gray-900 mt-1.5">{userProfile?.company?.name || company?.name || '-'}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Role</span>
                  <p className="text-sm font-medium text-gray-900 mt-1.5">
                    {userProfile?.role 
                      ? userProfile.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                      : '-'
                    }
                  </p>
                </div>
                {userProfile?.role === 'LOCATION_ADMIN' && userProfile?.location && (
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Location</span>
                    <p className="text-sm font-medium text-gray-900 mt-1.5">{userProfile.location.name || '-'}</p>
                    {userProfile.location.city && (
                      <p className="text-xs text-gray-500 mt-1">
                        {[
                          userProfile.location.city,
                          userProfile.location.state,
                          userProfile.location.pincode
                        ].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[
            { name: 'Total Orders', value: totalOrders, icon: ShoppingCart, color: 'orange', link: '/dashboard/consumer/orders' },
            { name: 'Pending Orders', value: pendingOrders, icon: Clock, color: 'orange', link: '/dashboard/consumer/orders' },
            { name: 'Available Items', value: companyProducts.length, icon: Package, color: 'orange', link: '/dashboard/consumer/catalog' },
          ].map((stat) => {
            const Icon = stat.icon
            // Get color classes based on company colors
            const getColorClasses = (color: string | undefined) => {
              const primaryColor = company?.primaryColor || '#f76b1c'
              const secondaryColor = company?.secondaryColor || company?.primaryColor || '#f76b1c'
              
              // Create dynamic color classes using inline styles for custom colors
              return {
                bg: `bg-[${primaryColor}]20`, // 20% opacity background
                text: `text-[${primaryColor}]`,
                bgFull: `bg-[${primaryColor}]`,
                hover: `hover:bg-[${secondaryColor}]`
              }
            }
            const colorClasses = getColorClasses(stat.color)
            const isClickable = stat.value > 0
            
            // Get recent orders
            const getRecentOrders = () => {
              return myOrders
                .slice(0, 10)
                .map(order => ({
                  id: order.id,
                  status: order.status || 'Unknown',
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
            
            // Get pending orders list
            const getPendingOrdersList = () => {
              return myOrders
                .filter(o => o.status === 'Awaiting approval' || o.status === 'Awaiting fulfilment')
                .slice(0, 10)
                .map(order => ({
                  id: order.id,
                  status: order.status || 'Unknown',
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
            
            // Get available products
            const getAvailableProducts = () => {
              return companyProducts
                .slice(0, 10)
                .map(product => ({
                  name: product.name || 'Unknown',
                  category: product.category || 'N/A',
                  price: product.price || 0
                }))
            }
            
            const StatCard = (
              <div 
                className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${isClickable ? 'cursor-pointer hover:shadow-xl transition-shadow' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm mb-1">{stat.name}</p>
                    <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                    {stat.name === 'Available Items' && companyProducts.length === 0 && currentEmployee && (
                      <button
                        onClick={async (e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          // Clear localStorage and refresh
                          localStorage.removeItem('productCompanies')
                          localStorage.removeItem('vendorCompanies')
                          localStorage.removeItem('productVendors')
                          const companyId = typeof currentEmployee.companyId === 'object' && currentEmployee.companyId?.id 
                            ? currentEmployee.companyId.id 
                            : currentEmployee.companyId
                          const products = await getProductsByCompany(companyId, employee.designation, employee.gender as 'male' | 'female')
                          setCompanyProducts(products)
                          alert(`Cleared localStorage. Found ${products.length} products.`)
                        }}
                        style={{ 
                          color: company?.primaryColor || '#f76b1c',
                        }}
                        className="mt-2 text-xs underline hover:opacity-80"
                      >
                        Reset & Refresh
                      </button>
                    )}
                  </div>
                  <div 
                    className="p-3 rounded-lg flex-shrink-0"
                    style={{ 
                      backgroundColor: company?.primaryColor ? `${company.primaryColor}15` : 'rgba(3, 45, 66, 0.15)'
                    }}
                  >
                    <Icon 
                      className="h-6 w-6" 
                      style={{ color: company?.primaryColor || '#032D42' }}
                    />
                  </div>
                </div>
              </div>
            )
            
            // Render tooltip
            const renderTooltip = () => {
              if (showTooltip !== stat.name) return null
              
              if (stat.name === 'Total Orders' && totalOrders > 0) {
                const orders = getRecentOrders()
                return (
                  <div className="absolute z-50 left-0 top-full mt-2 w-80 bg-gray-900 text-white rounded-lg shadow-2xl p-4 pointer-events-none">
                    <div className="text-sm font-semibold mb-3 pb-2 border-b border-gray-700">
                      Recent Orders ({totalOrders} total)
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {orders.map((order: any, idx: number) => (
                        <div key={idx} className="text-xs">
                          <div className="font-semibold text-white mb-1">Order #{order.id}</div>
                          <div className="text-gray-300">Status: {order.status}</div>
                          <div className="text-gray-300">Items: {order.itemsCount}</div>
                          <div className="text-gray-300">Amount: ₹{order.total.toFixed(2)}</div>
                          <div className="text-gray-400">Date: {order.date}</div>
                          {idx < orders.length - 1 && (
                            <div className="border-t border-gray-700 mt-2 pt-2"></div>
                          )}
                        </div>
                      ))}
                      {totalOrders > 10 && (
                        <div className="text-gray-400 text-xs mt-2 pt-2 border-t border-gray-700">
                          +{totalOrders - 10} more orders
                        </div>
                      )}
                    </div>
                  </div>
                )
              }
              
              if (stat.name === 'Pending Orders' && pendingOrders > 0) {
                const orders = getPendingOrdersList()
                return (
                  <div className="absolute z-50 left-0 top-full mt-2 w-80 bg-gray-900 text-white rounded-lg shadow-2xl p-4 pointer-events-none">
                    <div className="text-sm font-semibold mb-3 pb-2 border-b border-gray-700">
                      Pending Orders ({pendingOrders} total)
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {orders.map((order: any, idx: number) => (
                        <div key={idx} className="text-xs">
                          <div className="font-semibold text-white mb-1">Order #{order.id}</div>
                          <div className="text-gray-300">Status: {order.status}</div>
                          <div className="text-gray-300">Items: {order.itemsCount}</div>
                          <div className="text-gray-300">Amount: ₹{order.total.toFixed(2)}</div>
                          <div className="text-gray-400">Date: {order.date}</div>
                          {idx < orders.length - 1 && (
                            <div className="border-t border-gray-700 mt-2 pt-2"></div>
                          )}
                        </div>
                      ))}
                      {pendingOrders > 10 && (
                        <div className="text-gray-400 text-xs mt-2 pt-2 border-t border-gray-700">
                          +{pendingOrders - 10} more orders
                        </div>
                      )}
                    </div>
                  </div>
                )
              }
              
              if (stat.name === 'Available Items' && companyProducts.length > 0) {
                const products = getAvailableProducts()
                return (
                  <div className="absolute z-50 left-0 top-full mt-2 w-80 bg-gray-900 text-white rounded-lg shadow-2xl p-4 pointer-events-none">
                    <div className="text-sm font-semibold mb-3 pb-2 border-b border-gray-700">
                      Available Products ({companyProducts.length} total)
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {products.map((product: any, idx: number) => (
                        <div key={idx} className="text-xs">
                          <div className="font-semibold text-white mb-1">{product.name}</div>
                          <div className="text-gray-300">Category: {product.category}</div>
                          <div className="text-gray-300">Price: ₹{product.price.toFixed(2)}</div>
                          {idx < products.length - 1 && (
                            <div className="border-t border-gray-700 mt-2 pt-2"></div>
                          )}
                        </div>
                      ))}
                      {companyProducts.length > 10 && (
                        <div className="text-gray-400 text-xs mt-2 pt-2 border-t border-gray-700">
                          +{companyProducts.length - 10} more products
                        </div>
                      )}
                    </div>
                  </div>
                )
              }
              
              return null
            }
            
            if (isClickable) {
              return (
                <div 
                  key={stat.name} 
                  className="relative"
                  onMouseEnter={() => setShowTooltip(stat.name)}
                  onMouseLeave={() => setShowTooltip(null)}
                >
                  <Link href={stat.link} className="block">
                    {StatCard}
                  </Link>
                  {renderTooltip()}
                </div>
              )
            }
            
            return (
              <div key={stat.name}>
                {StatCard}
              </div>
            )
          })}
        </div>

        {/* Debug Info - Only show if no products */}
        {companyProducts.length === 0 && currentEmployee && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-yellow-900 mb-2">Debug Information</h3>
            <div className="text-sm text-yellow-800 space-y-1">
              <p>Company ID: <strong style={{ color: currentEmployee.companyId ? 'green' : 'red' }}>{(() => {
                const cid = typeof currentEmployee.companyId === 'object' && currentEmployee.companyId?.id 
                  ? currentEmployee.companyId.id 
                  : currentEmployee.companyId
                return cid || 'Not found'
              })()}</strong></p>
              <p>Company ID Type: <strong>{typeof currentEmployee.companyId}</strong></p>
              <p>Company ID Value: <strong>{JSON.stringify(currentEmployee.companyId)}</strong></p>
              <p>Company Name: <strong>{currentEmployee.companyName}</strong></p>
              <p>Employee Email: <strong>{currentEmployee.email}</strong></p>
              <p className="mt-2">Check browser console (F12) for detailed debug logs.</p>
              <button
                onClick={async () => {
                  console.log('Manual Debug Check:')
                  console.log('localStorage productCompanies:', localStorage.getItem('productCompanies'))
                  console.log('localStorage vendorCompanies:', localStorage.getItem('vendorCompanies'))
                  console.log('Current Employee:', currentEmployee)
                  const companyId = typeof currentEmployee.companyId === 'object' && currentEmployee.companyId?.id 
                    ? currentEmployee.companyId.id 
                    : currentEmployee.companyId
                  // CRITICAL MIGRATION: Use subcategory-based product fetching
                  const { getProductsForDesignation } = await import('@/lib/data-mongodb')
                  const products = await getProductsForDesignation(companyId, employee?.designation || '', employee?.gender as 'male' | 'female')
                  console.log('Products after manual call:', products)
                  setCompanyProducts(products)
                }}
                className="mt-2 text-xs bg-yellow-200 text-yellow-900 px-3 py-1 rounded hover:bg-yellow-300"
              >
                Run Debug Check
              </button>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 mb-8">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
          </div>
          <div className="p-6">
          <div className="grid md:grid-cols-3 gap-4">
            <Link 
              href="/dashboard/consumer/catalog" 
              style={{ backgroundColor: company?.primaryColor || '#032D42' }}
              className="btn-primary py-3 w-full justify-center"
            >
              <Package className="h-4 w-4 mr-2" />
              <span>Browse Catalog</span>
            </Link>
            <div className="flex space-x-3">
              <Link href="/dashboard/consumer/orders" className="btn-secondary flex-1 py-3 justify-center">
                <ShoppingCart className="h-4 w-4 mr-2" />
                <span>View My Orders</span>
              </Link>
              <Link 
                href="/dashboard/consumer/catalog" 
                style={{ backgroundColor: company?.primaryColor || '#032D42' }}
                className="btn-primary flex-1 py-3 justify-center"
              >
                <Plus className="h-4 w-4 mr-2" />
                <span>New Order</span>
              </Link>
            </div>
            {getCartTotalItems() > 0 && (
              <button
                onClick={handleQuickOrderCheckout}
                style={{ backgroundColor: company?.primaryColor || '#f76b1c' }}
                className="btn-primary w-full py-3 justify-center"
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                <span>Checkout ({getCartTotalItems()})</span>
              </button>
            )}
          </div>
          </div>
        </div>

        {/* Quick Order Section */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 mb-8">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Order New Uniforms</h2>
                <p className="text-sm text-gray-500 mt-1">Quickly add items to your cart and checkout</p>
              </div>
              <Link 
                href="/dashboard/consumer/catalog" 
                style={{ color: company?.primaryColor || '#032D42' }}
                className="text-sm font-medium text-gray-700 hover:text-gray-900 flex items-center space-x-1 transition-colors"
              >
                <span>View All</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
          <div className="p-6">
          {quickOrderProducts.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No products available for your company.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {quickOrderProducts.map((uniform) => {
                const cartItem = quickOrderCart[uniform.id]
                const currentQuantity = cartItem?.quantity || 0
                const selectedSize = selectedSizes[uniform.id] || uniform.sizes[0]
                const eligibility = getEligibilityForCategory(uniform.category)
                const totalForCategory = getTotalQuantityForCategory(uniform.category)
                const otherItemsQuantity = totalForCategory - currentQuantity
                const maxAllowed = Math.max(0, eligibility - otherItemsQuantity)
                // Allow adding more if personal payments are enabled, otherwise restrict to eligibility
                const canAddMore = company?.allowPersonalPayments 
                  ? true // No limit when personal payments are enabled
                  : (currentQuantity < maxAllowed && totalForCategory < eligibility)
                
                return (
                  <div key={uniform.id} className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
                    <div className="relative h-32 bg-white rounded-lg mb-3 overflow-hidden">
                      <Image
                        src={getUniformImage(uniform.image, uniform.category, uniform.gender, uniform.name)}
                        alt={uniform.name}
                        fill
                        className="object-contain object-center"
                        unoptimized={true}
                        onError={(e) => {
                          // Fallback to default image if the image fails to load
                          const target = e.target as HTMLImageElement
                          // Only set default if we haven't already tried it (avoid infinite loop)
                          if (target.src && !target.src.includes('default.jpg')) {
                            target.src = '/images/uniforms/default.jpg'
                          }
                        }}
                      />
                    </div>
                    <h3 className="font-semibold text-neutral-900 mb-2 text-sm">{uniform.name}</h3>
                    
                    {/* Display attributes only if they have values */}
                    {((uniform as any).attribute1_value || (uniform as any).attribute2_value || (uniform as any).attribute3_value) && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {(uniform as any).attribute1_value && (
                          <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
                            {(uniform as any).attribute1_name || 'Attr1'}: {(uniform as any).attribute1_value}
                          </span>
                        )}
                        {(uniform as any).attribute2_value && (
                          <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-700 rounded">
                            {(uniform as any).attribute2_name || 'Attr2'}: {(uniform as any).attribute2_value}
                          </span>
                        )}
                        {(uniform as any).attribute3_value && (
                          <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded">
                            {(uniform as any).attribute3_name || 'Attr3'}: {(uniform as any).attribute3_value}
                          </span>
                        )}
                      </div>
                    )}
                    
                    <div className="mb-3 flex items-center gap-2">
                      <label className="text-xs font-medium text-neutral-700">Size</label>
                      <select
                        value={selectedSize}
                        onChange={(e) => {
                          setSelectedSizes(prev => ({ ...prev, [uniform.id]: e.target.value }))
                          if (cartItem) {
                            setQuickOrderCart(prev => ({
                              ...prev,
                              [uniform.id]: { ...prev[uniform.id], size: e.target.value }
                            }))
                          }
                        }}
                        className="input-modern text-xs py-1.5 px-2"
                      >
                        {uniform.sizes.map((size) => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => updateQuickOrderQuantity(uniform.id, -1)}
                          disabled={currentQuantity === 0}
                          className="p-1.5 border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Minus className="h-3.5 w-3.5 text-neutral-600" />
                        </button>
                        <span className="text-sm font-semibold text-neutral-900 w-8 text-center">
                          {currentQuantity}
                        </span>
                        <button
                          onClick={() => updateQuickOrderQuantity(uniform.id, 1)}
                          disabled={!canAddMore}
                          className="p-1.5 border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5 text-neutral-600" />
                        </button>
                      </div>
                    </div>
                    {eligibility > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        {company?.allowPersonalPayments 
                          ? `You can order up to ${Math.max(0, eligibility - totalForCategory)} ${uniform.category}(s)`
                          : `You can order up to ${Math.max(0, eligibility - totalForCategory)} ${uniform.category}(s)`
                        }
                      </p>
                    )}
                    {company?.allowPersonalPayments && totalForCategory >= eligibility && currentQuantity > 0 && (
                      <p className="text-xs text-yellow-600 mt-1">
                        ⚠️ Items beyond eligibility will require personal payment
                      </p>
                    )}
                    {eligibility === 0 && (
                      <p className="text-xs text-red-600 mt-1">
                        No eligibility remaining for {uniform.category}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          
          {getCartTotalItems() > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Items: <span className="font-semibold text-gray-900">{getCartTotalItems()}</span></p>
                  <p className="text-sm text-gray-600">
                    Total: <span className="font-semibold text-gray-900">
                      ₹{Object.entries(quickOrderCart).reduce((sum, [uniformId, item]) => {
                        const uniform = companyProducts.find(u => u.id === uniformId)
                        return sum + (uniform?.price || 0) * item.quantity
                      }, 0).toFixed(2)}
                    </span>
                  </p>
                </div>
                <button
                  onClick={handleQuickOrderCheckout}
                  style={{ backgroundColor: company?.primaryColor || '#032D42' }}
                  className="btn-primary px-6 py-3"
                >
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  <span>Proceed to Checkout</span>
                </button>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Orders</h2>
          </div>
          <div className="p-6">
          {myOrders.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">You haven't placed any orders yet.</p>
              <Link 
                href="/dashboard/consumer/catalog" 
                style={{ backgroundColor: company?.primaryColor || '#032D42' }}
                className="btn-primary inline-flex px-6 py-2"
              >
                Browse Catalog
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {myOrders.map((order) => (
                <div key={order.id} className="border border-neutral-200 rounded-md p-4 hover:bg-neutral-50 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-neutral-900 text-sm">Order #{order.id}</h3>
                      <p className="text-xs text-neutral-500 mt-0.5">{order.orderDate}</p>
                    </div>
                    <span className={`badge ${
                      order.status === 'Delivered' ? 'badge-success' :
                      order.status === 'Dispatched' ? 'badge-info' :
                      order.status === 'Awaiting fulfilment' ? 'badge-info' :
                      order.status === 'Awaiting approval' ? 'badge-warning' :
                      'badge-neutral'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {order.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-neutral-600">{item.uniformName} (Size: {item.size}) x {item.quantity}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-neutral-200">
                    <span className="text-xs text-neutral-500">Dispatch to: {order.dispatchLocation}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}




