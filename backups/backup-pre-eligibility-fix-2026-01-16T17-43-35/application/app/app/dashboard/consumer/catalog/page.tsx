'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Search, ShoppingCart, Plus, Minus, AlertCircle, Package, RefreshCw, Ruler } from 'lucide-react'
import { getProductsForDesignation, getEmployeeByEmail, getConsumedEligibility, getCompanyById, isCompanyAdmin, getLocationByAdminEmail, getBranchByAdminEmail, Uniform } from '@/lib/data-mongodb'
import { getCurrentCycleDates, getNextCycleStartDate, formatCycleDate, getDaysRemainingInCycle } from '@/lib/utils/eligibility-cycles'
import { getUniformImage } from '@/lib/utils/image-mapping'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
// Removed maskEmail import - employees should see their own information unmasked
import SizeChartModal from '@/components/SizeChartModal'

export default function ConsumerCatalogPage() {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [currentEmployee, setCurrentEmployee] = useState<any>(null)
  const [uniforms, setUniforms] = useState<Uniform[]>([])
  const [loading, setLoading] = useState(true)
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
  const [eligibilityResponse, setEligibilityResponse] = useState<any>(null) // Store full eligibility response for cycle durations
  const [hasEligibilityConfigured, setHasEligibilityConfigured] = useState<boolean>(false)
  const [companyAdmins, setCompanyAdmins] = useState<any[]>([])
  const [company, setCompany] = useState<any>(null)
  const [sizeCharts, setSizeCharts] = useState<Record<string, any>>({})
  const [sizeChartModal, setSizeChartModal] = useState<{ isOpen: boolean; imageUrl: string; productName: string }>({
    isOpen: false,
    imageUrl: '',
    productName: '',
  })
  
  // Get current employee and load products - SINGLE useEffect to avoid race conditions
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const loadData = async () => {
      try {
        setLoading(true)
        // CRITICAL SECURITY FIX: Use tab-specific auth storage instead of shared localStorage
        const { getUserEmail, getAuthData } = await import('@/lib/utils/auth-storage')
        const userEmail = getUserEmail('consumer')
        console.log('Consumer Catalog - Loading... User Email:', userEmail)
        
        if (!userEmail) {
          console.error('Consumer Catalog - No userEmail in sessionStorage for consumer role')
          setLoading(false)
          return
        }
        
        // OPTIMIZED ROLE DETECTION: Use sessionStorage to check role first
        // This avoids unnecessary API calls - role is already determined at login time
        const currentActorType = sessionStorage.getItem('currentActorType')
        const vendorAuthData = getAuthData('vendor')
        
        // If user logged in as vendor, redirect to vendor portal immediately (no API call needed)
        if (currentActorType === 'vendor' || vendorAuthData?.vendorId) {
          console.log('Consumer Catalog - User is logged in as vendor, redirecting to vendor portal')
          router.push('/dashboard/vendor')
          setLoading(false)
          return
        }
        
        // Only call getEmployeeByEmail for consumer/employee users
        const employee = await getEmployeeByEmail(userEmail)
        
        console.log('Consumer Catalog - Employee found:', employee ? `${employee.firstName} ${employee.lastName}` : 'none')
        
        if (!employee) {
          console.error('Consumer Catalog - No employee found for email:', userEmail)
          alert(`No employee account found for email: ${userEmail}. Please check your login credentials or contact support.`)
          router.push('/login/consumer')
          setLoading(false)
          return
        }
        
        // Set employee first
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
        
        // Ensure companyId is a string ID (no ObjectId handling - backend returns string IDs only)
        let companyId: string | undefined
        if (employee.companyId !== null && employee.companyId !== undefined) {
          if (typeof employee.companyId === 'object' && employee.companyId !== null) {
            // Populated object - use .id field (string ID like '100001')
            companyId = String(employee.companyId.id || '')
          } else if (typeof employee.companyId === 'number') {
            // companyId is a number - convert to string
            companyId = String(employee.companyId)
            console.log('Consumer Catalog - companyId is number, converted to string:', companyId)
          } else if (typeof employee.companyId === 'string') {
            // Already a string ID
            companyId = employee.companyId
          }
        }
        
        // Get employee ID for consumed eligibility
        // Use employeeId field instead of id field
        const employeeId = employee.employeeId || employee.id
        
        console.log('Consumer Catalog - Employee companyId raw:', employee.companyId)
        console.log('Consumer Catalog - Employee companyId type:', typeof employee.companyId)
        console.log('Consumer Catalog - Employee companyId isObject:', typeof employee.companyId === 'object')
        console.log('Consumer Catalog - Company ID extracted:', companyId, 'Company Name:', employee.companyName)
        console.log('Consumer Catalog - Employee designation:', employee.designation)
        console.log('Consumer Catalog - Full employee object keys:', Object.keys(employee))
        
        // If companyId is still not found, employee is not properly linked to a company
        // This should not happen - all employees must have a companyId
        if (!companyId) {
          console.error('Consumer Catalog - Employee has no companyId. Employee must be linked to a company using companyId.')
          console.error('Consumer Catalog - Employee object:', JSON.stringify(employee, null, 2))
          setLoading(false)
          return
        }
        
        // Get products filtered by company AND designation using subcategory-based eligibility
        // Employee designation should already be decrypted by Mongoose hooks
        const employeeDesignation = employee.designation || ''
        const employeeGender = employee.gender as 'male' | 'female' | undefined
        console.log('Consumer Catalog - Using designation for filtering:', employeeDesignation, 'gender:', employeeGender)
        
        // CRITICAL FIX: Use getProductsForDesignation which properly implements subcategory-based eligibility
        // This function follows the correct path: Designation → DesignationSubcategoryEligibility → Subcategory → ProductSubcategoryMapping → Products
        // Load products (filtered by designation and gender), consumed eligibility, total eligibility, company settings, and company admins in parallel
        const [products, consumed, companyData, eligibilityResponse, adminsResponse] = await Promise.all([
          getProductsForDesignation(companyId, employeeDesignation, employeeGender),
          getConsumedEligibility(employeeId),
          getCompanyById(companyId),
          fetch(`/api/employees/${employeeId}/eligibility`).then(res => res.ok ? res.json() : null).catch(() => null),
          fetch(`/api/companies?getAdmins=true&companyId=${companyId}`).then(res => res.ok ? res.json() : []).catch(() => [])
        ])
        
        // Set company admins for contact information
        if (Array.isArray(adminsResponse)) {
          setCompanyAdmins(adminsResponse)
        }
        
        console.log('Consumer Catalog - Products loaded via getProductsForDesignation:', products.length, 'products (designation:', employeeDesignation, ', gender:', employeeGender || 'unisex', ')')
        console.log('Consumer Catalog - Consumed eligibility:', consumed)
        console.log('Consumer Catalog - Total eligibility from designation:', eligibilityResponse)
        console.log('Consumer Catalog - Company settings:', companyData ? { showPrices: companyData.showPrices, allowPersonalPayments: companyData.allowPersonalPayments } : 'not loaded')
        if (products.length > 0) {
          console.log('Consumer Catalog - Product names:', products.map(p => p.name).join(', '))
          console.log('Consumer Catalog - Product IDs:', products.map(p => p.id).join(', '))
        } else {
          console.warn('Consumer Catalog - ⚠️ NO PRODUCTS FOUND')
          console.warn('Consumer Catalog - Debug info:')
          console.warn('  - Company ID:', companyId)
          console.warn('  - Designation:', employeeDesignation)
          console.warn('  - Gender:', employeeGender || 'unisex')
          console.warn('  - Employee ID:', employeeId)
          console.warn('Consumer Catalog - This may indicate:')
          console.warn('  1. No DesignationSubcategoryEligibility exists for this designation/gender')
          console.warn('  2. No ProductSubcategoryMapping exists for eligible subcategories')
          console.warn('  3. Products are not linked to the eligible subcategories')
        }
        
        // Always set uniforms, even if empty
        setUniforms(products)
        setConsumedEligibility(consumed)
        setCompany(companyData)
        
        // Store full eligibility response for cycle durations access
        setEligibilityResponse(eligibilityResponse)
        
        // Set total eligibility from designation rules (fallback to employee-level if API fails)
        // CRITICAL: Check if eligibility actually exists (not just 0/0)
        // CRITICAL FIX: Support dynamic categories (belt, accessory, etc.) not just legacy 4
        let hasEligibilityConfigured = false
        if (eligibilityResponse) {
          // Extract legacy fields for backward compatibility
          const totalShirt = eligibilityResponse.shirt || 0
          const totalPant = eligibilityResponse.pant || 0
          const totalShoe = eligibilityResponse.shoe || 0
          const totalJacket = eligibilityResponse.jacket || 0
          
          // Extract dynamic eligibility object (includes all categories)
          const dynamicElig = eligibilityResponse.eligibility || {}
          
          // CRITICAL DEBUG: Log raw eligibility data to trace belt/accessory issue
          console.log('[BELT DEBUG] Raw eligibilityResponse:', JSON.stringify(eligibilityResponse, null, 2))
          console.log('[BELT DEBUG] Dynamic eligibility object:', JSON.stringify(dynamicElig, null, 2))
          console.log('[BELT DEBUG] All eligibility keys:', Object.keys(dynamicElig))
          console.log('[BELT DEBUG] Accessory eligibility:', dynamicElig['accessory'], dynamicElig['accessories'], dynamicElig['belt'])
          
          // CRITICAL FIX: Set dynamicEligibility FIRST, then merge into totalEligibility
          // This ensures both state variables are in sync
          setDynamicEligibility(dynamicElig)
          
          // Check if any category has non-zero eligibility (including dynamic categories)
          const hasLegacyEligibility = totalShirt > 0 || totalPant > 0 || totalShoe > 0 || totalJacket > 0
          const hasDynamicEligibility = Object.values(dynamicElig).some((val: any) => val > 0)
          hasEligibilityConfigured = hasLegacyEligibility || hasDynamicEligibility
          
          // CRITICAL FIX: Merge dynamic eligibility into totalEligibility
          // This ensures totalEligibility always includes all dynamic categories
          const mergedEligibility: Record<string, number> = {
            shirt: totalShirt,
            pant: totalPant,
            shoe: totalShoe,
            jacket: totalJacket,
            ...dynamicElig // Merge dynamic categories (accessories, belt, blazer, etc.)
          }
          
          // CRITICAL DEBUG: Log merged eligibility
          console.log('[BELT DEBUG] Merged totalEligibility:', JSON.stringify(mergedEligibility, null, 2))
          console.log('[BELT DEBUG] Merged totalEligibility keys:', Object.keys(mergedEligibility))
          console.log('[BELT DEBUG] Merged totalEligibility["accessories"]:', mergedEligibility['accessories'])
          console.log('[BELT DEBUG] Merged totalEligibility["accessory"]:', mergedEligibility['accessory'])
          console.log('[BELT DEBUG] Merged totalEligibility["belt"]:', mergedEligibility['belt'])
          
          setTotalEligibility(mergedEligibility)
        } else {
          // Fallback to employee-level eligibility if API call fails
          const totalShirt = employee.eligibility?.shirt || 0
          const totalPant = employee.eligibility?.pant || 0
          const totalShoe = employee.eligibility?.shoe || 0
          const totalJacket = employee.eligibility?.jacket || 0
          
          hasEligibilityConfigured = totalShirt > 0 || totalPant > 0 || totalShoe > 0 || totalJacket > 0
          
          setTotalEligibility({
            shirt: totalShirt,
            pant: totalPant,
            shoe: totalShoe,
            jacket: totalJacket,
          })
          setDynamicEligibility({})
        }
        
        // Also store dynamic consumed eligibility
        if (consumed && consumed.consumed) {
          setDynamicConsumedEligibility(consumed.consumed || {})
        }
        
        // Store eligibility status for UI rendering
        setHasEligibilityConfigured(hasEligibilityConfigured)
        
        // Fetch size charts for all products
        if (products.length > 0) {
          const productIds = products.map(p => p.id)
          try {
            const response = await fetch(`/api/products/size-charts?productIds=${productIds.join(',')}`)
            if (response.ok) {
              const charts = await response.json()
              setSizeCharts(charts)
            }
          } catch (error) {
            console.error('Error fetching size charts:', error)
          }
        }
        
        if (products.length === 0) {
          console.warn('Consumer Catalog - ⚠️ No products found for company:', employee.companyId)
          console.log('Checking localStorage...')
          const pc = localStorage.getItem('productCompanies')
          const vc = localStorage.getItem('vendorCompanies')
          const pv = localStorage.getItem('productVendors')
          console.log('localStorage productCompanies:', pc ? JSON.parse(pc).length + ' items' : 'null')
          console.log('localStorage vendorCompanies:', vc ? JSON.parse(vc).length + ' items' : 'null')
          console.log('localStorage productVendors:', pv ? JSON.parse(pv).length + ' items' : 'null')
        }
      } catch (error) {
        console.error('Consumer Catalog - Error loading data:', error)
      } finally {
        setLoading(false)
      }
    }
    
    // Load immediately
    loadData()
    
    // Also reload when window gains focus (in case data was updated in another tab)
    const handleFocus = () => {
      console.log('Consumer Catalog - Window focused, reloading...')
      loadData()
    }
    window.addEventListener('focus', handleFocus)
    
    // CRITICAL SECURITY: Storage event listener as safety net
    // Detects if localStorage is modified from another tab (shouldn't happen after our fix, but safety net)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'userEmail' && e.newValue) {
        // If userEmail changes in localStorage from another tab, verify our sessionStorage is still correct
        const { getUserEmail } = require('@/lib/utils/auth-storage')
        const currentUserEmail = getUserEmail('consumer')
        if (currentUserEmail && e.newValue !== currentUserEmail) {
          console.warn('Consumer Catalog - ⚠️ Detected auth change in another tab, but sessionStorage is protected')
          // SessionStorage is tab-specific, so we're safe, but log for debugging
        }
      }
    }
    window.addEventListener('storage', handleStorageChange)
    
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [])
  
  // Refresh products when employee changes
  useEffect(() => {
    if (!currentEmployee) return
    
    const reloadProducts = async () => {
      // Handle companyId extraction - support object, number, and string
      let companyId: string | undefined
      if (currentEmployee.companyId !== null && currentEmployee.companyId !== undefined) {
        if (typeof currentEmployee.companyId === 'object' && currentEmployee.companyId !== null) {
          companyId = currentEmployee.companyId.id ? String(currentEmployee.companyId.id) : undefined
        } else if (typeof currentEmployee.companyId === 'number') {
          companyId = String(currentEmployee.companyId)
        } else if (typeof currentEmployee.companyId === 'string') {
          companyId = currentEmployee.companyId
        }
      }
      if (companyId) {
        console.log('Consumer Catalog - Employee changed, reloading products for:', companyId)
        // CRITICAL FIX: Use getProductsForDesignation for proper subcategory-based eligibility
        const products = await getProductsForDesignation(companyId, currentEmployee?.designation || '', currentEmployee?.gender as 'male' | 'female')
        console.log('Consumer Catalog - Reloaded products:', products.length, 'products')
        setUniforms(products)
      }
    }
    
    reloadProducts()
  }, [currentEmployee?.id, currentEmployee?.companyId])
  
  // REMOVED: Gender filter dropdown - employee gender is auto-derived from profile
  // Gender filtering is handled by backend API (getProductsForDesignation)
  // Frontend should NOT allow manual gender selection
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [cart, setCart] = useState<Record<string, { size: string; quantity: number }>>({})
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({})
  const [hoveredItemType, setHoveredItemType] = useState<string | null>(null) // Support all categories, not just legacy 4

  // Auto-select sizes based on profile
  useEffect(() => {
    if (!currentEmployee || uniforms.length === 0) return
    
    const autoSizes: Record<string, string> = {}
    uniforms.forEach(uniform => {
      if (uniform.category === 'shirt') {
        autoSizes[uniform.id] = currentEmployee.shirtSize || 'M'
      } else if (uniform.category === 'pant') {
        autoSizes[uniform.id] = currentEmployee.pantSize || '32'
      } else if (uniform.category === 'shoe') {
        autoSizes[uniform.id] = currentEmployee.shoeSize || '9'
      } else {
        // For jacket, use shirt size as default
        autoSizes[uniform.id] = currentEmployee.shirtSize || 'M'
      }
    })
    setSelectedSizes(autoSizes)
  }, [uniforms, currentEmployee])

  const filteredUniforms = uniforms.filter(uniform => {
    const matchesSearch = uniform.name.toLowerCase().includes(searchTerm.toLowerCase())
    
    // Gender filtering: Use employee's gender from profile (not user-selected filter)
    // Backend already filters by employee gender + unisex, but we double-check here for UI consistency
    // Show products that match employee's gender OR are unisex
    let matchesGender = true
    if (currentEmployee?.gender) {
      const employeeGender = currentEmployee.gender.toLowerCase()
      const productGender = uniform.gender?.toLowerCase() || 'unisex'
      // Show if product matches employee gender OR is unisex
      matchesGender = productGender === employeeGender || productGender === 'unisex'
    }
    // If no employee gender, show all (shouldn't happen, but handle gracefully)
    
    const matchesCategory = filterCategory === 'all' || uniform.category === filterCategory
    return matchesSearch && matchesGender && matchesCategory
  })

  // CRITICAL FIX: Use useCallback to ensure function uses latest state values
  // But actually, since this is called during render, it will always use latest state
  // The real issue is ensuring we check both dynamicEligibility AND the merged totalEligibility correctly
  const getEligibilityForCategory = (category: string): number => {
    if (!currentEmployee) return 0
    
    // CRITICAL FIX: Robust category name matching for belt/accessory
    // Normalize category name for lookup
    const normalizedCategory = category.toLowerCase().trim()
    
    // CRITICAL DEBUG: Log the lookup attempt
    if (normalizedCategory === 'belt' || normalizedCategory === 'accessory' || normalizedCategory === 'accessories') {
      console.log(`[BELT DEBUG] getEligibilityForCategory called with category: "${category}" (normalized: "${normalizedCategory}")`)
      console.log(`[BELT DEBUG] dynamicEligibility keys:`, Object.keys(dynamicEligibility))
      console.log(`[BELT DEBUG] dynamicEligibility values:`, JSON.stringify(dynamicEligibility, null, 2))
      console.log(`[BELT DEBUG] totalEligibility keys:`, Object.keys(totalEligibility))
      console.log(`[BELT DEBUG] totalEligibility values:`, JSON.stringify(totalEligibility, null, 2))
    }
    
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
    
    // CRITICAL DEBUG: Log variations being tried
    if (normalizedCategory === 'belt' || normalizedCategory === 'accessory' || normalizedCategory === 'accessories') {
      console.log(`[BELT DEBUG] Category variations to try:`, Array.from(categoryVariations))
    }
    
    // Try each category variation until we find a match
    let totalEligibilityValue = 0
    let matchedKey = ''
    
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
      
      // CRITICAL DEBUG: Log each attempt
      if (normalizedCategory === 'belt' || normalizedCategory === 'accessory' || normalizedCategory === 'accessories') {
        console.log(`[BELT DEBUG] Trying "${catVar}": found=${found} (dynamicEligibility[${catVar}]=${dynamicEligibility[catVar]}, totalEligibility[${catVar}]=${totalEligibility[catVar]})`)
      }
      
      // Use the first non-zero value found (prioritize exact matches)
      if (found > 0) {
        totalEligibilityValue = found
        matchedKey = catVar
        // If it's an exact match, use it immediately
        if (catVar === normalizedCategory) {
          break
        }
      }
    }
    
    // CRITICAL DEBUG: Log final result
    if (normalizedCategory === 'belt' || normalizedCategory === 'accessory' || normalizedCategory === 'accessories') {
      console.log(`[BELT DEBUG] Final result: totalEligibilityValue=${totalEligibilityValue}, matchedKey="${matchedKey}"`)
    }
    
    // Subtract consumed eligibility from previous orders
    // Use the same matching logic for consumed eligibility
    const allConsumedKeys = Object.keys({ ...dynamicConsumedEligibility, ...consumedEligibility })
    let consumed = 0
    
    for (const catVar of Array.from(categoryVariations)) {
      const found = dynamicConsumedEligibility[catVar]
        || consumedEligibility[catVar]
        || (() => {
          switch (catVar) {
            case 'shirt': return consumedEligibility.shirt
            case 'pant': return consumedEligibility.pant
            case 'shoe': return consumedEligibility.shoe
            case 'jacket': return consumedEligibility.jacket
            default: return 0
          }
        })()
      
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
            consumed = found
            break
          }
        }
      }
    }
    
    // Return remaining eligibility (total - consumed)
    return Math.max(0, totalEligibilityValue - consumed)
  }

  const getTotalQuantityForCategory = (category: string): number => {
    return Object.entries(cart).reduce((total, [uniformId, cartItem]) => {
      const uniform = uniforms.find(u => u.id === uniformId)
      if (uniform?.category === category) {
        return total + cartItem.quantity
      }
      return total
    }, 0)
  }

  const updateQuantity = (uniformId: string, size: string, delta: number) => {
    const uniform = uniforms.find(u => u.id === uniformId)
    if (!uniform) return

    const currentQuantity = cart[uniformId]?.quantity || 0
    const newQuantity = currentQuantity + delta
    const eligibility = getEligibilityForCategory(uniform.category)
    
    // Calculate total quantity for this category AFTER the change
    const totalForCategory = getTotalQuantityForCategory(uniform.category)
    const otherItemsQuantity = totalForCategory - currentQuantity
    const totalAfterChange = newQuantity + otherItemsQuantity

    // Prevent negative quantities
    if (newQuantity < 0) return
    
    // Check eligibility limit - allow exceeding if personal payments are enabled
    if (totalAfterChange > eligibility) {
      console.log('Catalog - Eligibility exceeded:', {
        category: uniform.category,
        totalAfterChange,
        eligibility,
        allowPersonalPayments: company?.allowPersonalPayments,
        company: company ? 'loaded' : 'not loaded'
      })
      
      if (!company?.allowPersonalPayments) {
        const remaining = Math.max(0, eligibility - otherItemsQuantity)
        alert(`You can only order up to ${eligibility} ${uniform.category}(s) total. You have already selected ${otherItemsQuantity} other ${uniform.category}(s). Maximum allowed for this item: ${remaining}.\n\nPersonal payment orders are not enabled for your company.`)
        return
      }
      // Personal payments are enabled - allow adding beyond eligibility
      // The personal payment amount will be calculated on the review page
      console.log('Catalog - Allowing addition beyond eligibility (personal payment enabled)')
    }

    if (newQuantity === 0) {
      const newCart = { ...cart }
      delete newCart[uniformId]
      setCart(newCart)
    } else {
      setCart(prev => ({
        ...prev,
        [uniformId]: { size, quantity: newQuantity }
      }))
    }
  }

  const handleSizeChange = (uniformId: string, size: string) => {
    setSelectedSizes(prev => ({ ...prev, [uniformId]: size }))
    // If item is already in cart, update the size
    if (cart[uniformId]) {
      setCart(prev => ({
        ...prev,
        [uniformId]: { ...prev[uniformId], size }
      }))
    }
  }

  const handleCheckout = () => {
    if (Object.keys(cart).length === 0) {
      alert('Your cart is empty')
      return
    }
    
    // Calculate category totals
    const categoryTotals: Record<string, number> = {}
    Object.entries(cart).forEach(([uniformId, item]) => {
      const uniform = uniforms.find(u => u.id === uniformId)
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
    
    // Navigate to order confirmation
    const orderData = {
      items: Object.entries(cart).map(([uniformId, item]) => {
        const uniform = uniforms.find(u => u.id === uniformId)
        return {
          uniformId,
          uniformName: uniform?.name || '',
          size: item.size,
          quantity: item.quantity,
          price: uniform?.price || 0
        }
      })
    }
    // Store in sessionStorage for review page
    try {
      sessionStorage.setItem('pendingOrder', JSON.stringify(orderData))
      console.log('Checkout: Order data saved to sessionStorage', orderData)
      // Navigate to review page first
      router.push('/dashboard/consumer/orders/review')
    } catch (error) {
      console.error('Error saving order data:', error)
      alert('Error processing checkout. Please try again.')
    }
  }

  const getCartTotalItems = () => {
    return Object.values(cart).reduce((sum, item) => sum + item.quantity, 0)
  }

  return (
    <DashboardLayout actorType="consumer">
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold text-gray-800">Uniform Catalog</h1>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={async () => {
                if (currentEmployee) {
                  const companyId = typeof currentEmployee.companyId === 'object' && currentEmployee.companyId?.id 
                    ? currentEmployee.companyId.id 
                    : currentEmployee.companyId
                  console.log('Manual refresh triggered - Company ID:', companyId)
                  // CRITICAL MIGRATION: Use subcategory-based product fetching
                  const products = await getProductsForDesignation(companyId, currentEmployee?.designation || '', currentEmployee?.gender as 'male' | 'female')
                  console.log('Manual refresh - Products loaded:', products.length, products.map(p => p.name))
                  setUniforms(products)
                  if (products.length > 0) {
                    alert(`✅ Refreshed! Found ${products.length} product(s): ${products.map(p => p.name).join(', ')}`)
                  } else {
                    alert(`⚠️ No products found. Check console for details.`)
                  }
                } else {
                  alert('Employee not found. Please log in again.')
                }
              }}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors flex items-center space-x-2"
              title="Refresh products"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </button>
            <button
              onClick={async () => {
                if (confirm('This will clear all relationship data from localStorage. Are you sure?')) {
                  localStorage.removeItem('productCompanies')
                  localStorage.removeItem('vendorCompanies')
                  localStorage.removeItem('productVendors')
                  if (currentEmployee) {
                    const companyId = typeof currentEmployee.companyId === 'object' && currentEmployee.companyId?.id 
                      ? currentEmployee.companyId.id 
                      : currentEmployee.companyId
                    // CRITICAL MIGRATION: Use subcategory-based product fetching
                  const products = await getProductsForDesignation(companyId, currentEmployee?.designation || '', currentEmployee?.gender as 'male' | 'female')
                    setUniforms(products)
                    alert(`Cleared localStorage. Found ${products.length} products (using MongoDB now).`)
                  }
                }
              }}
              className="bg-red-100 text-red-700 px-4 py-2 rounded-lg font-medium hover:bg-red-200 transition-colors flex items-center space-x-2"
              title="Clear localStorage and reset to mock data"
            >
              <span>Clear Data</span>
            </button>
            {getCartTotalItems() > 0 && (
              <button
                onClick={handleCheckout}
                style={{ backgroundColor: company?.primaryColor || '#f76b1c' }}
                className="text-white px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center space-x-2 shadow-md"
              >
                <ShoppingCart className="h-5 w-5" />
                <span>Checkout ({getCartTotalItems()} items)</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search uniforms..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            {/* REMOVED: Gender dropdown - employee gender is auto-derived from profile */}
            {/* Gender filtering is handled automatically by backend based on employee.gender */}
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
            >
              <option value="all">All Categories</option>
              <option value="shirt">Shirts</option>
              <option value="pant">Pants</option>
              <option value="shoe">Shoes</option>
              <option value="jacket">Jackets</option>
            </select>
          </div>
        </div>

        {/* Eligibility Info */}
        {currentEmployee && (() => {
          // If no eligibility is configured, show message instead of 0/0 cards
          if (!hasEligibilityConfigured) {
            const adminEmails = companyAdmins
              .filter(admin => admin.employee?.email)
              .map(admin => admin.employee.email)
              .filter(Boolean)
            
            return (
              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-6 mb-6 border border-yellow-200 shadow-modern">
                <div className="flex items-start space-x-3">
                  <div className="p-2 rounded-lg bg-white/60 backdrop-blur-sm">
                    <AlertCircle 
                      className="h-5 w-5 text-yellow-600" 
                    />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-yellow-900 text-lg mb-2">Product Eligibility Not Configured</h3>
                    <p className="text-yellow-800 mb-3">
                      Product eligibility has not been configured for your designation ({currentEmployee.designation}).
                      Please contact your company administrator to set up product eligibility rules.
                    </p>
                    {adminEmails.length > 0 ? (
                      <div className="mt-3">
                        <p className="text-sm font-semibold text-yellow-900 mb-1">Contact Information:</p>
                        <div className="text-sm text-yellow-800">
                          {adminEmails.map((email, idx) => (
                            <span key={idx}>
                              {idx > 0 && ', '}
                              <a 
                                href={`mailto:${email}`}
                                className="text-blue-600 hover:text-blue-800 underline"
                              >
                                {email}
                              </a>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-yellow-700 italic">
                        No company administrator contact information available.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          }
          
          // Get employee's date of joining (default to Oct 1, 2025 if not set)
          const dateOfJoining = currentEmployee.dateOfJoining 
            ? new Date(currentEmployee.dateOfJoining) 
            : new Date('2025-10-01T00:00:00.000Z')
          
          // UI FIX 2: Merge cycle durations from employee and eligibility response
          // This ensures all categories (including belt/accessory) have cycle duration info
          const baseCycleDurations = currentEmployee.cycleDuration || {
            shirt: 6,
            pant: 6,
            shoe: 6,
            jacket: 12
          }
          // Merge with cycle durations from eligibility response (for dynamic categories)
          const cycleDurations = {
            ...baseCycleDurations,
            ...(eligibilityResponse?.cycleDurations || {})
          }
          
          // Get cycle info for each item type
          const getCycleInfo = (itemType: 'shirt' | 'pant' | 'shoe' | 'jacket') => {
            const cycleDates = getCurrentCycleDates(itemType, dateOfJoining, cycleDurations[itemType])
            const nextCycleStart = getNextCycleStartDate(itemType, dateOfJoining, cycleDurations[itemType])
            const daysRemaining = getDaysRemainingInCycle(itemType, dateOfJoining, cycleDurations[itemType])
            return { cycleDates, nextCycleStart, daysRemaining }
          }
          
          const shirtCycle = getCycleInfo('shirt')
          const pantCycle = getCycleInfo('pant')
          const shoeCycle = getCycleInfo('shoe')
          const jacketCycle = getCycleInfo('jacket')
          
          return (
            <div className="glass rounded-2xl shadow-modern-lg border border-slate-200/50 p-6 mb-6 bg-gradient-to-br from-blue-50/50 to-indigo-50/30">
              <div className="flex items-center space-x-2 mb-4">
                <div 
                  className="p-2 rounded-xl"
                  style={{ backgroundColor: company?.primaryColor ? `${company.primaryColor}20` : 'rgba(247, 107, 28, 0.2)' }}
                >
                  <AlertCircle 
                    className="h-5 w-5" 
                    style={{ color: company?.primaryColor || '#f76b1c' }}
                  />
                </div>
                <h3 className="font-bold text-slate-900 text-lg">Your Eligibility, Order new by selecting from below Catalog items</h3>
              </div>
              {/* CRITICAL FIX: Dynamically render ALL categories, not just legacy 4 */}
              {/* Get all categories with eligibility > 0 */}
              {(() => {
                // Combine legacy and dynamic eligibility
                const allEligibility = { ...totalEligibility, ...dynamicEligibility }
                const allConsumed = { ...consumedEligibility, ...dynamicConsumedEligibility }
                
                // Get all categories that have eligibility > 0
                const eligibleCategories = Object.keys(allEligibility).filter(cat => {
                  const total = allEligibility[cat] || 0
                  return total > 0
                })
                
                // Sort: legacy categories first (shirt, pant, shoe, jacket), then others alphabetically
                const legacyOrder = ['shirt', 'pant', 'shoe', 'jacket']
                eligibleCategories.sort((a, b) => {
                  const aIndex = legacyOrder.indexOf(a)
                  const bIndex = legacyOrder.indexOf(b)
                  if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
                  if (aIndex !== -1) return -1
                  if (bIndex !== -1) return 1
                  return a.localeCompare(b)
                })
                
                // Capitalize category name for display
                const capitalizeCategory = (cat: string) => {
                  if (cat === 'pant') return 'Pants'
                  return cat.charAt(0).toUpperCase() + cat.slice(1) + (cat.endsWith('s') ? '' : 's')
                }
                
                return (
                  // UI FIX 1: Single row layout with compact cards - use flexbox for better control
                  <div className="flex flex-wrap gap-2 sm:gap-3 text-xs">
                    {eligibleCategories.map((category) => {
                      const total = allEligibility[category] || 0
                      const consumed = allConsumed[category] || 0
                      const remaining = Math.max(0, total - consumed)
                      const categoryDisplayName = capitalizeCategory(category)
                      
                      // UI FIX 2: Show hover info for ALL categories consistently
                      // Try to get cycle info for legacy categories, but also try for non-legacy if cycle duration exists
                      const isLegacyCategory = legacyOrder.includes(category)
                      let cycleInfo = null
                      
                      // Get cycle duration - try from merged cycleDurations first, then from eligibility response
                      const categoryCycleDuration = cycleDurations[category] 
                        || (eligibilityResponse?.cycleDurations?.[category]) 
                        || null
                      
                      // Try to generate cycle info if we have a cycle duration
                      if (categoryCycleDuration) {
                        if (isLegacyCategory) {
                          // Legacy categories use the cycle utility functions
                          try {
                            cycleInfo = getCycleInfo(category as 'shirt' | 'pant' | 'shoe' | 'jacket')
                          } catch (e) {
                            // Cycle info not available for this category
                          }
                        } else {
                          // For non-legacy categories, try to generate cycle info using the cycle duration
                          // This ensures consistent hover display across all categories
                          try {
                            const cycleDates = getCurrentCycleDates(category, dateOfJoining, categoryCycleDuration)
                            const nextCycleStart = getNextCycleStartDate(category, dateOfJoining, categoryCycleDuration)
                            const daysRemaining = getDaysRemainingInCycle(category, dateOfJoining, categoryCycleDuration)
                            cycleInfo = { cycleDates, nextCycleStart, daysRemaining }
                          } catch (e) {
                            // If cycle functions don't support this category, cycleInfo remains null
                          }
                        }
                      }
                      
                      return (
                        <div 
                          key={category}
                          className="relative flex-shrink-0"
                          onMouseEnter={() => setHoveredItemType(category)}
                          onMouseLeave={() => setHoveredItemType(null)}
                        >
                          {/* UI FIX 1: Compact card design - reduced padding and font sizes */}
                          <div className="bg-white/80 backdrop-blur-sm rounded-lg p-2.5 border border-slate-200/50 cursor-pointer hover-lift transition-smooth shadow-modern min-w-[100px]">
                            <div className="font-semibold text-slate-900 mb-1 text-xs">{categoryDisplayName}</div>
                            <div className="text-slate-700">
                              <span className="font-bold text-slate-900 text-base">
                                {remaining} / {total}
                              </span>
                              {consumed > 0 && (
                                <span className="text-[10px] text-slate-500 ml-0.5">({consumed})</span>
                              )}
                            </div>
                          </div>
                          {/* UI FIX 2: Show hover tooltip for ALL categories */}
                          {hoveredItemType === category && (
                            <div className="absolute z-[9999] left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-gray-900 text-white rounded-lg shadow-2xl p-4 pointer-events-none tooltip-overlay">
                              <div className="text-sm font-semibold mb-2 pb-2 border-b border-gray-700">
                                {categoryDisplayName} Information
                              </div>
                              <div className="text-xs space-y-1">
                                {/* UI FIX 2: Consistent hover display for ALL categories - same structure and fields */}
                                {cycleInfo ? (
                                  // Categories with full cycle info (legacy or computed)
                                  <>
                                    <div>Cycle Duration: <span className="font-semibold">{categoryCycleDuration || cycleDurations[category]} months</span></div>
                                    <div>Total Eligibility: <span className="font-semibold">{total}</span></div>
                                    <div>Remaining: <span className="font-semibold">{remaining}</span></div>
                                    {consumed > 0 && (
                                      <div>Used: <span className="font-semibold">{consumed}</span></div>
                                    )}
                                    {cycleInfo.cycleDates && (
                                      <>
                                        <div className="mt-2 pt-2 border-t border-gray-700">
                                          <div>Expires: <span className="font-semibold">{formatCycleDate(cycleInfo.cycleDates.end)}</span></div>
                                          <div>Next Cycle: <span className="font-semibold">{formatCycleDate(cycleInfo.nextCycleStart)}</span></div>
                                          {cycleInfo.daysRemaining !== undefined && (
                                            <div className="mt-2">
                                              {cycleInfo.daysRemaining > 0 ? (
                                                <span className="text-green-400 font-semibold">{cycleInfo.daysRemaining} days remaining</span>
                                              ) : (
                                                <span 
                                                  className="font-semibold"
                                                  style={{ color: company?.primaryColor || '#f76b1c' }}
                                                >
                                                  Cycle expired - Reset pending
                                                </span>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </>
                                ) : (
                                  // Categories without cycle info - show consistent eligibility info
                                  <>
                                    {categoryCycleDuration && (
                                      <div>Cycle Duration: <span className="font-semibold">{categoryCycleDuration} months</span></div>
                                    )}
                                    <div>Total Eligibility: <span className="font-semibold">{total}</span></div>
                                    <div>Remaining: <span className="font-semibold">{remaining}</span></div>
                                    {consumed > 0 && (
                                      <div>Used: <span className="font-semibold">{consumed}</span></div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )
        })()}

        {/* Empty State */}
        {filteredUniforms.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Products Available</h3>
            <p className="text-gray-600 mb-4">
              {uniforms.length === 0 
                ? 'No products are available for your designation. No eligibility has been configured for your designation. Please contact your administrator to set up product eligibility rules.'
                : `No products match your current filters (${filterCategory}). Try adjusting your search or category filter.`}
            </p>
            {uniforms.length === 0 && currentEmployee && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-left max-w-md mx-auto">
                <p className="text-sm font-semibold text-yellow-900 mb-2">Debug Information</p>
                <div className="text-xs text-yellow-800 space-y-1">
                  <p>Company ID: <strong>{currentEmployee.companyId}</strong></p>
                  <p>Company Name: <strong>{currentEmployee.companyName}</strong></p>
                  <p>Employee Email: <strong>{currentEmployee.email}</strong></p>
                  <p>Total Products Loaded: <strong>{uniforms.length}</strong></p>
                  <p className="mt-2">Check browser console (F12) for detailed logs.</p>
                  <button
                    onClick={async () => {
                      console.log('Catalog Debug Check:')
                      console.log('localStorage productCompanies:', localStorage.getItem('productCompanies'))
                      console.log('localStorage productVendors:', localStorage.getItem('productVendors'))
                      console.log('localStorage vendorCompanies:', localStorage.getItem('vendorCompanies'))
                      console.log('Current Employee:', currentEmployee)
                      const companyId = typeof currentEmployee.companyId === 'object' && currentEmployee.companyId?.id 
                        ? currentEmployee.companyId.id 
                        : currentEmployee.companyId
                      // CRITICAL MIGRATION: Use subcategory-based product fetching
                  const products = await getProductsForDesignation(companyId, currentEmployee?.designation || '', currentEmployee?.gender as 'male' | 'female')
                      console.log('Products after manual call:', products)
                      setUniforms(products)
                      if (products.length > 0) {
                        alert(`✅ Found ${products.length} product(s): ${products.map(p => p.name).join(', ')}`)
                      } else {
                        alert(`⚠️ No products found. Check console for details.`)
                      }
                    }}
                    className="mt-2 text-xs bg-yellow-200 text-yellow-900 px-3 py-1 rounded hover:bg-yellow-300"
                  >
                    Run Debug Check
                  </button>
                </div>
              </div>
            )}
            {uniforms.length > 0 && filteredUniforms.length === 0 && (
              <div 
                className="mt-4 p-4 rounded-lg text-left max-w-md mx-auto border"
                style={{ 
                  backgroundColor: company?.primaryColor ? `${company.primaryColor}10` : 'rgba(247, 107, 28, 0.1)',
                  borderColor: company?.primaryColor ? `${company.primaryColor}40` : 'rgba(247, 107, 28, 0.4)'
                }}
              >
                <p 
                  className="text-sm font-semibold mb-2"
                  style={{ color: company?.primaryColor || '#f76b1c' }}
                >
                  Products Available But Filtered
                </p>
                <div className="text-xs text-[#dc5514] space-y-1">
                  <p>Total Products: <strong>{uniforms.length}</strong></p>
                  <p>Employee Gender: <strong>{currentEmployee?.gender || 'Not set'}</strong> (auto-filtered by system)</p>
                  <p>Current Category Filter: <strong>{filterCategory}</strong></p>
                  <p className="mt-2">Try changing your filters to see products.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Catalog Grid */}
        {filteredUniforms.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {filteredUniforms.map((uniform) => {
            const selectedSize = selectedSizes[uniform.id] || uniform.sizes[0]
            const cartItem = cart[uniform.id]
            const currentQuantity = cartItem?.quantity || 0
            const eligibility = getEligibilityForCategory(uniform.category)
            
            // CRITICAL DEBUG: Log eligibility lookup for belt/accessory products
            if (uniform.category === 'accessory' || uniform.category === 'belt' || uniform.name?.toLowerCase().includes('belt')) {
              console.log(`[BELT DEBUG] Product: "${uniform.name}", category: "${uniform.category}", eligibility returned: ${eligibility}`)
            }
            
            const totalForCategory = getTotalQuantityForCategory(uniform.category)
            const otherItemsQuantity = totalForCategory - currentQuantity
            const maxAllowed = Math.max(0, eligibility - otherItemsQuantity)
            // Allow adding more if personal payments are enabled, otherwise restrict to eligibility
            const canAddMore = company?.allowPersonalPayments 
              ? true // No limit when personal payments are enabled
              : (currentQuantity < maxAllowed && totalForCategory < eligibility)

            return (
              <div key={uniform.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                <div className="relative h-64 bg-white overflow-hidden">
                  <Image
                    src={getUniformImage(uniform.image, uniform.category, uniform.gender, uniform.name)}
                    alt={uniform.name}
                    fill
                    className="object-contain object-center transition-transform duration-300 hover:scale-[1.75]"
                    priority={false}
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
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
                <div className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 text-lg">{uniform.name}</h3>
                  </div>
                  
                  {/* View Size Chart Link */}
                  {sizeCharts[uniform.id] && (
                    <button
                      onClick={() => {
                        setSizeChartModal({
                          isOpen: true,
                          imageUrl: sizeCharts[uniform.id].imageUrl,
                          productName: uniform.name,
                        })
                      }}
                      className="mb-3 text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 transition-colors"
                    >
                      <Ruler className="h-4 w-4" />
                      <span>View Size Chart</span>
                    </button>
                  )}
                  
                  {/* Display attributes only if they have values */}
                  {((uniform as any).attribute1_value || (uniform as any).attribute2_value || (uniform as any).attribute3_value) && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {(uniform as any).attribute1_value && (
                        <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                          {(uniform as any).attribute1_name || 'Attr1'}: {(uniform as any).attribute1_value}
                        </span>
                      )}
                      {(uniform as any).attribute2_value && (
                        <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded">
                          {(uniform as any).attribute2_name || 'Attr2'}: {(uniform as any).attribute2_value}
                        </span>
                      )}
                      {(uniform as any).attribute3_value && (
                        <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded">
                          {(uniform as any).attribute3_name || 'Attr3'}: {(uniform as any).attribute3_value}
                        </span>
                      )}
                    </div>
                  )}
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Size:</label>
                    <select
                      value={selectedSize}
                      onChange={(e) => handleSizeChange(uniform.id, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                    >
                      {uniform.sizes.map((size) => (
                        <option key={size} value={size}>
                          {size} {size === selectedSizes[uniform.id] ? '(Your Size)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Quantity:</label>
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => updateQuantity(uniform.id, selectedSize, -1)}
                        disabled={currentQuantity === 0}
                        className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="flex-1 text-center font-semibold text-gray-900 py-1.5 px-3 border border-gray-200 rounded-lg bg-gray-50">
                        {currentQuantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(uniform.id, selectedSize, 1)}
                        disabled={!canAddMore}
                        className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    {!canAddMore && currentQuantity > 0 && !company?.allowPersonalPayments && (
                      <p className="text-xs text-red-600 mt-1">
                        Maximum {maxAllowed} allowed for {uniform.category}
                      </p>
                    )}
                    {currentQuantity === 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        {company?.allowPersonalPayments 
                          ? `You can order ${eligibility} ${uniform.category}(s) under eligibility. Additional items can be purchased with personal payment.`
                          : `You can order up to ${eligibility} ${uniform.category}(s)`
                        }
                      </p>
                    )}
                    {company?.allowPersonalPayments && totalForCategory >= eligibility && currentQuantity > 0 && (
                      <p className="text-xs text-yellow-600 mt-1">
                        ⚠️ Items beyond eligibility will require personal payment
                      </p>
                    )}
                  </div>

                  {currentQuantity > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-sm text-gray-600">
                        <span className="font-medium text-gray-900">{currentQuantity}</span> × {selectedSize} in cart
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          </div>
        )}
      </div>
      
      {/* Size Chart Modal */}
      <SizeChartModal
        isOpen={sizeChartModal.isOpen}
        onClose={() => setSizeChartModal({ isOpen: false, imageUrl: '', productName: '' })}
        imageUrl={sizeChartModal.imageUrl}
        productName={sizeChartModal.productName}
      />
    </DashboardLayout>
  )
}
