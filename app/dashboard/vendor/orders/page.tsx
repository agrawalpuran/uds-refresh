'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { Search, CheckCircle, XCircle, Package, Truck, Warehouse, MapPin, Building2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getAllOrders, getOrdersByVendor, updateOrderStatus, getCompaniesByVendor } from '@/lib/data-mongodb'
// Employee names are now pre-masked by the backend

interface Warehouse {
  warehouseRefId: string
  warehouseName: string
  addressLine1: string
  addressLine2?: string
  city: string
  state: string
  pincode: string
  isPrimary: boolean
  isActive: boolean
}

export default function VendorOrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<any[]>([])
  const [allOrders, setAllOrders] = useState<any[]>([]) // Store all orders before company filtering
  const [searchTerm, setSearchTerm] = useState('')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  const [appliedFromDate, setAppliedFromDate] = useState<string>('')
  const [appliedToDate, setAppliedToDate] = useState<string>('')
  const [loading, setLoading] = useState(true)
  // Company filter states
  const [companies, setCompanies] = useState<any[]>([])
  const [filterCompany, setFilterCompany] = useState<string>('all')
  const [companiesLoading, setCompaniesLoading] = useState(true)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loadingWarehouses, setLoadingWarehouses] = useState(false)
  const [manualCouriers, setManualCouriers] = useState<Array<{ courierCode: string, courierName: string }>>([])
  const [providerCouriers, setProviderCouriers] = useState<Array<{ courierCode: string, courierName: string }>>([])
  const [loadingCouriers, setLoadingCouriers] = useState(false)
  const [packages, setPackages] = useState<Array<{
    packageId: string
    packageName: string
    lengthCm: number
    breadthCm: number
    heightCm: number
    volumetricDivisor: number
    volumetricWeightKg: number
    isActive: boolean
  }>>([])
  const [loadingPackages, setLoadingPackages] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    show: boolean
    orderId: string | null
    action: 'shipped' | 'delivered' | null
  }>({ show: false, orderId: null, action: null })
  const [shipmentForm, setShipmentForm] = useState<{
    show: boolean
    orderId: string | null
    carrierName: string
    selectedCourierType: 'PRIMARY' | 'SECONDARY' | null // New field for primary/secondary selection
    trackingNumber: string
    modeOfTransport: 'DIRECT' | 'COURIER'
    dispatchedDate: string
    expectedDeliveryDate: string
    selectedWarehouseRefId: string
    selectedPackageId: string
    useCustomDimensions: boolean
    customLengthCm: string
    customBreadthCm: string
    customHeightCm: string
  }>({
    show: false,
    orderId: null,
    carrierName: '',
    selectedCourierType: null,
    trackingNumber: '',
    modeOfTransport: 'COURIER',
    dispatchedDate: new Date().toISOString().split('T')[0],
    expectedDeliveryDate: '',
    selectedWarehouseRefId: '',
    selectedPackageId: '',
    useCustomDimensions: false,
    customLengthCm: '',
    customBreadthCm: '',
    customHeightCm: '',
  })
  const [submittingShipment, setSubmittingShipment] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any>(null) // Store selected order details for address display
  const [companyShipmentMode, setCompanyShipmentMode] = useState<'MANUAL' | 'AUTOMATIC'>('MANUAL')
  const [vendorRouting, setVendorRouting] = useState<any>(null) // Store vendor shipping routing for auto-selection
  const [shippingContext, setShippingContext] = useState<{
    shippingMode: 'MANUAL' | 'AUTOMATIC'
    hasRouting: boolean
    primaryCourier: { code: string; name: string | null } | null
    secondaryCourier: { code: string; name: string | null } | null
    sourcePincode: string | null
    destinationPincode: string | null
    vendorRouting: any
    company?: { id: string; name: string; shipmentRequestMode: string }
  } | null>(null)
  const [shippingContextLoading, setShippingContextLoading] = useState(false)
  const [shippingContextError, setShippingContextError] = useState<string | null>(null)
  const [serviceabilityStatus, setServiceabilityStatus] = useState<{
    primary: { serviceable: boolean; message?: string; cost?: number } | null
    secondary: { serviceable: boolean; message?: string; cost?: number } | null
    loading: boolean
  }>({ primary: null, secondary: null, loading: false })
  // Manual Shipment Form State
  const [manualShipmentForm, setManualShipmentForm] = useState<{
    show: boolean
    poNumber: string | null
    prs: Array<{
      prId: string
      prNumber: string
      employeeName: string
      employeeEmail: string
      deliveryAddress: {
        line1: string
        line2?: string
        line3?: string
        city: string
        state: string
        pincode: string
        country: string
      } | null
      hasValidAddress: boolean
      modeOfTransport: 'COURIER' | 'DIRECT' | 'HAND_DELIVERY'
      courierServiceProvider: string
      dispatchedDate: string
      shipmentNumber: string
    }>
    warehouse: {
      warehouseName: string
      addressLine1: string
      addressLine2?: string
      city: string
      state: string
      pincode: string
      country: string
    } | null
  }>({
    show: false,
    poNumber: null,
    prs: [],
    warehouse: null,
  })
  const [submittingManualShipment, setSubmittingManualShipment] = useState(false)
  
  const [shippingEstimation, setShippingEstimation] = useState<{
    primary: { courier: string; courierName?: string; serviceable: boolean; estimatedDays?: string; estimatedCost?: number; message?: string } | null
    secondary: { courier: string; courierName?: string; serviceable: boolean; estimatedDays?: string; estimatedCost?: number; message?: string } | null
    loading: boolean
    visible: boolean
  }>({
    primary: null,
    secondary: null,
    loading: false,
    visible: false,
  })

  const loadOrders = async () => {
    try {
      setLoading(true)
      // SECURITY FIX: Use ONLY tab-specific auth storage - NO localStorage fallback
      const { getVendorId, getAuthData } = typeof window !== 'undefined' 
        ? await import('@/lib/utils/auth-storage') 
        : { getVendorId: () => null, getAuthData: () => null }
      
      // Use ONLY sessionStorage (tab-specific) - no localStorage fallback
      const storedVendorId = getVendorId() || getAuthData('vendor')?.vendorId || null
      
      console.log('[Orders] VendorId from sessionStorage:', storedVendorId)
      
      if (storedVendorId) {
        // Load only orders for this vendor
        const vendorOrders = await getOrdersByVendor(storedVendorId)
        console.log('Loaded vendor orders:', vendorOrders.length)
        console.log('Order statuses:', vendorOrders.map((o: any) => ({ id: o.id, status: o.status, vendorName: o.vendorName })))
        setAllOrders(vendorOrders) // Store all orders
        setOrders(vendorOrders)
        
        // Load companies for filter
        try {
          setCompaniesLoading(true)
          const vendorCompanies = await getCompaniesByVendor(storedVendorId)
          console.log('[Orders] Loaded companies for vendor:', vendorCompanies.length)
          setCompanies(vendorCompanies)
        } catch (companyError) {
          console.error('[Orders] Error loading companies:', companyError)
        } finally {
          setCompaniesLoading(false)
        }
      } else {
        // Fallback: get all orders if no vendor ID (shouldn't happen in production)
        console.warn('No vendor ID found, loading all orders')
        const fetchedOrders = await getAllOrders()
        setAllOrders(fetchedOrders)
        setOrders(fetchedOrders)
        setCompaniesLoading(false)
      }
    } catch (error) {
      console.error('Error loading orders:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOrders()
    loadWarehouses()
    loadManualCouriers()
    loadPackages()
  }, [])

  // Effect to filter orders when company filter changes
  useEffect(() => {
    if (allOrders.length === 0) return
    
    if (filterCompany === 'all') {
      setOrders(allOrders)
    } else {
      const filtered = allOrders.filter((order: any) => {
        const orderCompanyId = order.companyId?.id || order.companyId || order.companyIdNum?.toString()
        return orderCompanyId === filterCompany
      })
      console.log(`[Orders] Filtered to ${filtered.length} orders for company ${filterCompany}`)
      setOrders(filtered)
    }
  }, [filterCompany, allOrders])

  const loadPackages = async () => {
    try {
      setLoadingPackages(true)
      const response = await fetch('/api/shipping/packages?activeOnly=true')
      if (response.ok) {
        const data = await response.json()
        setPackages(data.packages || [])
      }
    } catch (error) {
      console.error('Error loading packages:', error)
    } finally {
      setLoadingPackages(false)
    }
  }

  // Auto-select courier when couriers are loaded and routing is available
  useEffect(() => {
    // CRITICAL: hasRouting is DB-driven (vendorRouting exists), NOT based on courier match
    const hasRouting = !!vendorRouting
    console.log('[useEffect] 🔄 Courier auto-select effect triggered:', {
      show: shipmentForm.show,
      hasRouting, // DB-driven: true if routing exists in DB, regardless of courier match
      routingId: vendorRouting?.routingId,
      routingActive: vendorRouting?.isActive,
      primaryCourierCode: vendorRouting?.primaryCourierCode,
      currentCarrierName: shipmentForm.carrierName,
      shipmentMode: companyShipmentMode, // From Company config, NOT influenced by routing or courier match
      providerCouriersCount: providerCouriers.length,
      manualCouriersCount: manualCouriers.length,
    })

    // CRITICAL: hasRouting is based on vendorRouting existence, NOT courier match
    if (shipmentForm.show && hasRouting && !shipmentForm.carrierName) {
      const availableCouriers = companyShipmentMode === 'AUTOMATIC' ? providerCouriers : manualCouriers
      console.log('[useEffect] 📋 Available couriers for matching:', {
        mode: companyShipmentMode,
        count: availableCouriers.length,
        couriers: availableCouriers.map(c => ({ code: c.courierCode, name: c.courierName })),
      })

      if (availableCouriers.length > 0) {
        const providerCourierCode = vendorRouting.primaryCourierCode
        console.log('[useEffect] 🔍 Attempting to match courier:', {
          providerCourierCode,
          providerCourierCodeType: typeof providerCourierCode,
          routingId: vendorRouting.routingId,
        })

        // Strategy 1: Exact code match
        let matchingCourier = availableCouriers.find(c => {
          const exactMatch = c.courierCode.toUpperCase() === providerCourierCode.toUpperCase() ||
            c.courierCode === providerCourierCode.toString() ||
            c.courierCode === providerCourierCode
          if (exactMatch) {
            console.log('[useEffect] ✅ Strategy 1 (Exact Match) found:', {
              routingCode: providerCourierCode,
              courierCode: c.courierCode,
              courierName: c.courierName,
            })
          }
          return exactMatch
        })

        // Strategy 2: If numeric ID (e.g., "6"), find in provider couriers and match by name
        if (!matchingCourier && /^\d+$/.test(providerCourierCode) && companyShipmentMode === 'AUTOMATIC' && providerCouriers.length > 0) {
          console.log('[useEffect] 🔎 Strategy 1 failed, trying Strategy 2 (Numeric ID → Name match)...')
          // Find the courier with this numeric ID in provider couriers
          const providerCourier = providerCouriers.find(c => 
            c.courierCode === providerCourierCode || 
            c.courierCode === providerCourierCode.toString()
          )
          if (providerCourier) {
            const providerNameUpper = providerCourier.courierName.toUpperCase()
            console.log('[useEffect] Found provider courier with ID:', {
              id: providerCourierCode,
              name: providerCourier.courierName,
            })
            // Now match by name to available couriers (could be manual or provider)
            matchingCourier = availableCouriers.find(c => {
              const courierNameUpper = c.courierName.toUpperCase()
              const courierCodeUpper = c.courierCode.toUpperCase()
              const match = courierNameUpper === providerNameUpper ||
                courierNameUpper.includes(providerNameUpper) ||
                providerNameUpper.includes(courierNameUpper) ||
                providerNameUpper.split(' ')[0] === courierCodeUpper ||
                providerNameUpper.split(' ')[0] === courierNameUpper.split(' ')[0]
              if (match) {
                console.log('[useEffect] ✅ Strategy 2 (Name Match) found:', {
                  routingCode: providerCourierCode,
                  providerName: providerCourier.courierName,
                  courierCode: c.courierCode,
                  courierName: c.courierName,
                })
              }
              return match
            })
          }
        }

        // Strategy 3: Name-based matching with search terms
        if (!matchingCourier) {
          console.log('[useEffect] 🔎 Strategy 2 failed, trying Strategy 3 (Name-based search terms)...')
          const searchTerms = providerCourierCode.toUpperCase().split(/[_\s-]+/)
          matchingCourier = availableCouriers.find(c => {
            const courierNameUpper = c.courierName.toUpperCase()
            const courierCodeUpper = c.courierCode.toUpperCase()
            return searchTerms.some((term: string) =>
              term.length > 1 && (
                courierNameUpper.includes(term) ||
                courierCodeUpper.includes(term) ||
                term.includes(courierCodeUpper) ||
                term.includes(courierNameUpper.split(' ')[0])
              )
            )
          })
        }

        if (matchingCourier) {
          console.log('[useEffect] ✅✅✅ MATCH FOUND - Updating shipment form with carrier:', matchingCourier.courierCode)
          setShipmentForm(prev => {
            console.log('[useEffect] 📝 Previous form state:', prev)
            const updated = { ...prev, carrierName: matchingCourier!.courierCode }
            console.log('[useEffect] 📝 Updated form state:', updated)
            return updated
          })
        } else {
          // CRITICAL: Even if match fails, hasRouting is still true (routing exists in DB)
          console.warn('[useEffect] ⚠️⚠️⚠️ COURIER MATCH FAILED BUT ROUTING EXISTS:', {
            providerCourierCode,
            providerCourierCodeType: typeof providerCourierCode,
            hasRouting: true, // Still true - routing exists in DB
            shipmentMode: companyShipmentMode, // Still from Company config
            availableCouriers: availableCouriers.map(c => ({
              code: c.courierCode,
              codeType: typeof c.courierCode,
              name: c.courierName,
            })),
            message: 'Routing exists in DB but courier not found. User may need to select manually.',
          })
        }
      } else {
        console.log('[useEffect] ⏳ Waiting for couriers to load...')
      }
    }
  }, [manualCouriers, providerCouriers, vendorRouting, shipmentForm.show, shipmentForm.carrierName, companyShipmentMode])

  const loadManualCouriers = async () => {
    try {
      setLoadingCouriers(true)
      const response = await fetch('/api/superadmin/manual-courier-providers?isActive=true')
      if (response.ok) {
        const data = await response.json()
        setManualCouriers((data.couriers || []).map((c: any) => ({
          courierCode: c.courierCode,
          courierName: c.courierName,
        })))
      }
    } catch (error) {
      console.error('Error loading manual couriers:', error)
    } finally {
      setLoadingCouriers(false)
    }
  }

  const loadProviderCouriers = async (providerCode: string): Promise<Array<{ courierCode: string, courierName: string }>> => {
    try {
      setLoadingCouriers(true)
      console.log('[loadProviderCouriers] 🚀 Starting to fetch couriers for provider:', providerCode)
      
      const response = await fetch(`/api/shipment/provider-couriers?providerCode=${encodeURIComponent(providerCode)}`)
      
      console.log('[loadProviderCouriers] 📡 API Response status:', response.status, response.ok)
      
      if (response.ok) {
        const data = await response.json()
        console.log('[loadProviderCouriers] 📦 API Response data:', {
          success: data.success,
          hasCouriers: !!data.couriers,
          couriersCount: data.couriers?.length || 0,
        })
        
        if (data.success && data.couriers) {
          const couriers = data.couriers.map((c: any): { courierCode: string, courierName: string } => {
            const courier = {
              courierCode: String(c.courierCode || c.courierName || ''),
              courierName: String(c.courierName || c.courierCode || 'Unknown'),
            }
            console.log('[loadProviderCouriers] 📋 Mapped courier:', {
              original: c,
              mapped: courier,
            })
            return courier
          })
          
          setProviderCouriers(couriers)
          console.log('[loadProviderCouriers] ✅✅✅ Successfully loaded and set provider couriers:', {
            count: couriers.length,
            couriers: couriers.map((c: { courierCode: string, courierName: string }) => ({
              code: c.courierCode,
              codeType: typeof c.courierCode,
              name: c.courierName,
            })),
          })
          return couriers
        } else {
          console.warn('[loadProviderCouriers] ⚠️ API response missing couriers:', data)
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        console.error('[loadProviderCouriers] ❌ API Error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData.error || errorData.message,
        })
      }
      return []
    } catch (error) {
      console.error('[loadProviderCouriers] ❌ Exception loading provider couriers:', error)
      return []
    } finally {
      setLoadingCouriers(false)
      console.log('[loadProviderCouriers] 🏁 Finished loading provider couriers')
    }
  }

  const loadWarehouses = async () => {
    try {
      setLoadingWarehouses(true)
      const { getVendorId, getAuthData } = typeof window !== 'undefined'
        ? await import('@/lib/utils/auth-storage')
        : { getVendorId: () => null, getAuthData: () => null }

      // SECURITY FIX: No localStorage fallback
      const storedVendorId = getVendorId() || getAuthData('vendor')?.vendorId || null

      if (storedVendorId) {
        const response = await fetch(`/api/vendor/warehouses?vendorId=${storedVendorId}`)
        if (response.ok) {
          const data = await response.json()
          const activeWarehouses = (data.warehouses || []).filter((w: Warehouse) => w.isActive)
          // Sort: Primary first, then by name
          activeWarehouses.sort((a: Warehouse, b: Warehouse) => {
            if (a.isPrimary && !b.isPrimary) return -1
            if (!a.isPrimary && b.isPrimary) return 1
            return a.warehouseName.localeCompare(b.warehouseName)
          })
          setWarehouses(activeWarehouses)

          // Auto-select primary warehouse or first warehouse
          if (activeWarehouses.length > 0) {
            const primaryWarehouse = activeWarehouses.find((w: Warehouse) => w.isPrimary)
            setShipmentForm(prev => ({
              ...prev,
              selectedWarehouseRefId: primaryWarehouse?.warehouseRefId || activeWarehouses[0].warehouseRefId
            }))
          }
        }
      }
    } catch (error) {
      console.error('Error loading warehouses:', error)
    } finally {
      setLoadingWarehouses(false)
    }
  }

  // Group orders by PO number for PO-centric display
  // Returns a unified list sorted by date (newest first), mixing PO groups and individual orders
  const groupOrdersByPO = (ordersList: any[]) => {
    const poGroups = new Map<string, {
      type: 'po'
      poNumber: string
      poDate: Date | null
      latestOrderDate: Date | null // Track latest order date for sorting
      prs: any[] // Orders (PRs) under this PO
    }>()
    
    // Also track orders without PO (for companies without PR-PO workflow)
    const ordersWithoutPO: any[] = []
    
    ordersList.forEach((order) => {
      if (order.poNumbers && order.poNumbers.length > 0) {
        // Order can belong to multiple POs, but we'll use the first one for grouping
        const primaryPONumber = order.poNumbers[0]
        const poDetail = order.poDetails?.find((d: any) => d.poNumber === primaryPONumber)
        
        if (!poGroups.has(primaryPONumber)) {
          poGroups.set(primaryPONumber, {
            type: 'po',
            poNumber: primaryPONumber,
            poDate: poDetail?.poDate ? new Date(poDetail.poDate) : null,
            latestOrderDate: order.orderDate ? new Date(order.orderDate) : null,
            prs: []
          })
        }
        
        // Update latestOrderDate if this order is newer
        const group = poGroups.get(primaryPONumber)!
        const orderDate = order.orderDate ? new Date(order.orderDate) : null
        if (orderDate && (!group.latestOrderDate || orderDate > group.latestOrderDate)) {
          group.latestOrderDate = orderDate
        }
        
        group.prs.push(order)
      } else {
        // Orders without PO - show as individual cards (for companies without PR-PO workflow)
        ordersWithoutPO.push(order)
      }
    })
    
    // Convert orders without PO to a unified format for sorting
    const ordersWithoutPOFormatted = ordersWithoutPO.map(order => ({
      type: 'order' as const,
      order,
      latestOrderDate: order.orderDate ? new Date(order.orderDate) : null
    }))
    
    // Merge PO groups and individual orders into a single list
    const allItems: Array<
      | { type: 'po'; poNumber: string; poDate: Date | null; latestOrderDate: Date | null; prs: any[] }
      | { type: 'order'; order: any; latestOrderDate: Date | null }
    > = [
      ...Array.from(poGroups.values()),
      ...ordersWithoutPOFormatted
    ]
    
    // Sort all items by latest order date (newest first)
    allItems.sort((a, b) => {
      const dateA = a.latestOrderDate?.getTime() || 0
      const dateB = b.latestOrderDate?.getTime() || 0
      return dateB - dateA // Descending (newest first)
    })
    
    return {
      // Keep separate arrays for backward compatibility, but now they're both empty
      // The unified list is what we'll use for rendering
      poGroups: [] as any[],
      ordersWithoutPO: [] as any[],
      // New unified list sorted by date
      unifiedItems: allItems
    }
  }

  const filteredOrders = orders.filter(order => {
    const searchLower = searchTerm.toLowerCase()
    const matchesSearch = (
      order.id?.toLowerCase().includes(searchLower) ||
      order.employeeName?.toLowerCase().includes(searchLower) ||
      order.prNumber?.toLowerCase().includes(searchLower) ||
      (order.poNumbers && order.poNumbers.some((po: string) => po.toLowerCase().includes(searchLower)))
    )
    
    // Filter by date range if dates are applied
    if (appliedFromDate || appliedToDate) {
      const orderDate = order.orderDate ? new Date(order.orderDate) : null
      if (!orderDate) return false
      
      if (appliedFromDate) {
        const fromDateObj = new Date(appliedFromDate)
        fromDateObj.setHours(0, 0, 0, 0)
        if (orderDate < fromDateObj) return false
      }
      
      if (appliedToDate) {
        const toDateObj = new Date(appliedToDate)
        toDateObj.setHours(23, 59, 59, 999)
        if (orderDate > toDateObj) return false
      }
    }
    
    return matchesSearch
  })

  // Group filtered orders by PO and merge into unified sorted list
  const { unifiedItems } = groupOrdersByPO(filteredOrders)

  // Check serviceability for AUTOMATIC mode
  const checkServiceability = async (sourcePincode: string, destinationPincode: string, courierCode: string, providerCode?: string) => {
    if (!sourcePincode || !destinationPincode || !courierCode) {
      return { serviceable: false, message: 'Missing pincode or courier information' }
    }

    if (!providerCode) {
      return { serviceable: false, message: 'Provider code is required' }
    }

    try {
      setServiceabilityStatus(prev => ({ ...prev, loading: true }))
      
      const response = await fetch('/api/shipment/serviceability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerCode: providerCode,
          fromPincode: sourcePincode,
          pincode: destinationPincode,
          weight: 1.0, // Default weight
          codAmount: 0, // Default COD
          courierCode: courierCode,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        return {
          serviceable: data.serviceable === true,
          message: data.message || (data.serviceable ? 'Serviceable' : 'Not serviceable'),
          cost: data.cost,
          estimatedDays: data.estimatedDays,
        }
      } else {
        const error = await response.json()
        return { serviceable: false, message: error.error || 'Serviceability check failed' }
      }
    } catch (error: any) {
      console.error('[checkServiceability] Error:', error)
      return { serviceable: false, message: error.message || 'Serviceability check failed' }
    } finally {
      setServiceabilityStatus(prev => ({ ...prev, loading: false }))
    }
  }

  const handleMarkAsShipped = async (orderId: string) => {
    // Find the order to get destination address details
    let order = orders.find(o => o.id === orderId)

    // If order doesn't have shipping_address fields, try to fetch from location
    if (order && (!order.shipping_address_line_1 || !order.shipping_pincode)) {
      try {
        // Try to get location from employee's locationId (already populated in order)
        let locationId = null

        // Check if employeeId is populated with locationId
        if (order.employeeId && typeof order.employeeId === 'object' && order.employeeId.locationId) {
          locationId = typeof order.employeeId.locationId === 'object' ? order.employeeId.locationId.id : order.employeeId.locationId
        } else {
          // Fetch employee to get locationId
          const employeeId = typeof order.employeeId === 'object' && order.employeeId?.id
            ? order.employeeId.id
            : order.employeeId

          if (employeeId) {
            const employeeRes = await fetch(`/api/employees?employeeId=${employeeId}`)
            if (employeeRes.ok) {
              const employeeData = await employeeRes.json()
              const employee = Array.isArray(employeeData) ? employeeData[0] : employeeData
              locationId = employee?.locationId || employee?.location_id
              if (locationId && typeof locationId === 'object') {
                locationId = locationId.id || locationId
              }
            }
          }
        }

        if (locationId) {
          // Fetch location data
          const locationRes = await fetch(`/api/locations?locationId=${locationId}`)
          if (locationRes.ok) {
            const locationData = await locationRes.json()
            const location = locationData.location || locationData

            if (location) {
              // Populate shipping address from location
              order = {
                ...order,
                shipping_address_line_1: location.address_line_1 || order.shipping_address_line_1,
                shipping_address_line_2: location.address_line_2 || order.shipping_address_line_2,
                shipping_address_line_3: location.address_line_3 || order.shipping_address_line_3,
                shipping_city: location.city || order.shipping_city,
                shipping_state: location.state || order.shipping_state,
                shipping_pincode: location.pincode || order.shipping_pincode,
                shipping_country: location.country || order.shipping_country || 'India',
                dispatchLocation: location.name || order.dispatchLocation,
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching location data:', error)
      }
    }

    setSelectedOrder(order || null)

    // Auto-select warehouse when opening shipment form
    const primaryWarehouse = warehouses.find(w => w.isPrimary)
    const defaultWarehouse = primaryWarehouse || warehouses[0]

    // Get vendor ID
    const { getVendorId, getAuthData } = typeof window !== 'undefined'
      ? await import('@/lib/utils/auth-storage')
      : { getVendorId: () => null, getAuthData: () => null }

    // SECURITY FIX: No localStorage fallback
    const storedVendorId = getVendorId?.() || null

    if (!storedVendorId) {
      alert('Vendor ID not found. Please log in again.')
      return
    }

    // Extract companyId and destinationPincode from order
    const companyId = order?.companyId 
      ? (typeof order.companyId === 'object' ? order.companyId.id : order.companyId)
      : null
    
    const destinationPincode = order?.shipping_pincode || null

    if (!companyId) {
      alert('Company ID not found for this order. Please contact support.')
      return
    }

    // Use shipping context API to resolve shipping mode and routing
    // CRITICAL: UI must wait for context before rendering
    // OPTIMIZED: Pass companyId directly instead of prId to avoid order lookup
    setShippingContextLoading(true)
    setShippingContextError(null)
    setShippingContext(null)
    
    try {
      // Build query params - destinationPincode is optional
      const params = new URLSearchParams({
        companyId: String(companyId),
        vendorId: storedVendorId,
      })
      if (destinationPincode) {
        params.append('destinationPincode', destinationPincode)
      }
      
      const contextRes = await fetch(`/api/shipment/shipping-context?${params.toString()}`)
      
      if (!contextRes.ok) {
        const errorData = await contextRes.json().catch(() => ({ error: `HTTP ${contextRes.status}` }))
        const errorMessage = errorData.error || `Failed to fetch shipping context: ${contextRes.status}`
        console.error('[handleMarkAsShipped] ❌ Shipping context API error:', {
          status: contextRes.status,
          statusText: contextRes.statusText,
          error: errorMessage,
          url: `/api/shipment/shipping-context?${params.toString()}`
        })
        
        setShippingContextError(errorMessage)
        setShippingContextLoading(false)
        
        // DO NOT proceed if context fetch fails - show error to user
        alert(`Failed to load shipping configuration: ${errorMessage}\n\nPlease try again or contact support.`)
        return
      }
      
      const context = await contextRes.json()
      console.info('[handleMarkAsShipped] ✅✅✅ Resolved Shipping Context:', context)
      
      // Set context state
      setShippingContext(context)
      setCompanyShipmentMode(context.shippingMode)
      setVendorRouting(context.vendorRouting)
      setShippingContextError(null)
      
      // CRITICAL: If MANUAL mode, show manual shipment modal instead of automatic form
      if (context.shippingMode === 'MANUAL') {
        // Find all PRs under the same PO as the clicked order
        const clickedOrder = orders.find(o => o.id === orderId)
        if (!clickedOrder) {
          alert('Order not found')
          setShippingContextLoading(false)
          return
        }
        
        // Get PO number from order
        const poNumber = clickedOrder.poNumbers?.[0] || null
        
        // Find all orders (PRs) under the same PO
        const prsUnderPO = poNumber 
          ? orders.filter(o => o.poNumbers?.includes(poNumber))
          : [clickedOrder] // If no PO, just use the clicked order
        
        // Get primary warehouse for Dispatch From
        const primaryWarehouse = warehouses.find(w => w.isPrimary) || warehouses[0]
        
        // Load manual couriers
        await loadManualCouriers()
        
        // Fetch employee addresses for each PR
        // CRITICAL: Use employee's personal address, NOT branch/location address
        const prsData = await Promise.all(prsUnderPO.map(async (pr) => {
          // Get employee ID from order
          const employeeId = pr.employeeId 
            ? (typeof pr.employeeId === 'object' ? pr.employeeId.id : pr.employeeId)
            : pr.employeeIdNum || null
          
          let employeeAddress = null
          let employeeEmail = 'N/A'
          let employeeName = pr.employeeName || 'N/A'
          
          // Fetch employee to get their personal address
          // Use forShipment=true to get decrypted data for shipment creation
          if (employeeId) {
            try {
              const employeeRes = await fetch(`/api/employees?employeeId=${employeeId}&forShipment=true`)
              if (employeeRes.ok) {
                const employeeData = await employeeRes.json()
                const employee = Array.isArray(employeeData) ? employeeData[0] : employeeData
                
                if (employee) {
                  // Employee data is now decrypted (name, email, address)
                  employeeEmail = employee.email || 'N/A'
                  
                  // Use decrypted employee name (firstName + lastName)
                  if (employee.firstName || employee.lastName) {
                    employeeName = [employee.firstName, employee.lastName].filter(Boolean).join(' ') || 'N/A'
                  }
                  
                  // Use employee's personal address fields (decrypted by API)
                  if (employee.address_line_1) {
                    employeeAddress = {
                      line1: employee.address_line_1 || '',
                      line2: employee.address_line_2 || '',
                      line3: employee.address_line_3 || '',
                      city: employee.city || '',
                      state: employee.state || '',
                      pincode: employee.pincode || '',
                      country: employee.country || 'India',
                    }
                  } else if (employee.address?.address_line_1) {
                    // Fallback to address object if available
                    employeeAddress = {
                      line1: employee.address.address_line_1 || '',
                      line2: employee.address.address_line_2 || '',
                      line3: employee.address.address_line_3 || '',
                      city: employee.address.city || '',
                      state: employee.address.state || '',
                      pincode: employee.address.pincode || '',
                      country: employee.address.country || 'India',
                    }
                  }
                }
              }
            } catch (error) {
              console.error(`Error fetching employee ${employeeId} address:`, error)
            }
          }
          
          // If employee address is not available, mark as invalid
          if (!employeeAddress || !employeeAddress.line1 || employeeAddress.line1 === 'N/A') {
            return {
              prId: pr.id,
              prNumber: pr.prNumber || `PR-${pr.id}`,
              employeeName,
              employeeEmail,
              deliveryAddress: null, // Mark as invalid
              hasValidAddress: false,
              modeOfTransport: 'COURIER' as const,
              courierServiceProvider: '',
              dispatchedDate: new Date().toISOString().split('T')[0],
              shipmentNumber: '',
            }
          }
          
          return {
            prId: pr.id,
            prNumber: pr.prNumber || `PR-${pr.id}`,
            employeeName,
            employeeEmail,
            deliveryAddress: employeeAddress,
            hasValidAddress: true,
            modeOfTransport: 'COURIER' as const,
            courierServiceProvider: '',
            dispatchedDate: new Date().toISOString().split('T')[0],
            shipmentNumber: '',
          }
        }))
        
        // Set manual shipment form
        setManualShipmentForm({
          show: true,
          poNumber,
          prs: prsData,
          warehouse: primaryWarehouse ? {
            warehouseName: primaryWarehouse.warehouseName,
            addressLine1: primaryWarehouse.addressLine1,
            addressLine2: primaryWarehouse.addressLine2,
            city: primaryWarehouse.city,
            state: primaryWarehouse.state,
            pincode: primaryWarehouse.pincode,
            country: primaryWarehouse.country || 'India',
          } : null,
        })
        
        setShippingContextLoading(false)
        return // Exit early - don't show automatic form
      }
      
      // For AUTOMATIC mode, load provider couriers and check serviceability
      if (context.shippingMode === 'AUTOMATIC' && context.hasRouting && context.vendorRouting?.providerCode) {
        // Load provider couriers
        await loadProviderCouriers(context.vendorRouting.providerCode)

        // Auto-check serviceability if pincodes are available
        if (context.sourcePincode && context.destinationPincode && context.primaryCourier?.code) {
          const primaryResult = await checkServiceability(
            context.sourcePincode,
            context.destinationPincode,
            context.primaryCourier.code,
            context.vendorRouting.providerCode
          )
          setServiceabilityStatus(prev => ({ ...prev, primary: primaryResult }))

          // Check secondary if primary is not serviceable
          if (!primaryResult.serviceable && context.secondaryCourier?.code) {
            const secondaryResult = await checkServiceability(
              context.sourcePincode,
              context.destinationPincode,
              context.secondaryCourier.code,
              context.vendorRouting.providerCode
            )
            setServiceabilityStatus(prev => ({ ...prev, secondary: secondaryResult }))
          }
        }
      }

      // Auto-select courier for AUTOMATIC mode
      let autoSelectedCourier = ''
      if (context.shippingMode === 'AUTOMATIC' && context.hasRouting && context.primaryCourier) {
        // Try to match primary courier code to available couriers
        const availableCouriers = context.shippingMode === 'AUTOMATIC' ? providerCouriers : manualCouriers
        if (availableCouriers.length === 0 && context.shippingMode === 'AUTOMATIC') {
          // Wait for provider couriers to load
          const loadedCouriers = await loadProviderCouriers(context.vendorRouting.providerCode)
          const matchingCourier = loadedCouriers.find(c => 
            c.courierCode === context.primaryCourier.code ||
            c.courierCode.toUpperCase() === context.primaryCourier.code.toUpperCase()
          )
          if (matchingCourier) {
            autoSelectedCourier = matchingCourier.courierCode
          }
        } else {
          const matchingCourier = availableCouriers.find(c => 
            c.courierCode === context.primaryCourier.code ||
            c.courierCode.toUpperCase() === context.primaryCourier.code.toUpperCase()
          )
          if (matchingCourier) {
            autoSelectedCourier = matchingCourier.courierCode
          }
        }
      }

      // Only show form after context is successfully loaded
      setShipmentForm({
        show: true,
        orderId,
        carrierName: autoSelectedCourier,
        selectedCourierType: null, // Will be set when user selects primary/secondary
        trackingNumber: '',
        modeOfTransport: 'COURIER',
        dispatchedDate: new Date().toISOString().split('T')[0],
        expectedDeliveryDate: '',
        selectedWarehouseRefId: defaultWarehouse?.warehouseRefId || context.warehouse?.warehouseRefId || '',
        selectedPackageId: '',
        useCustomDimensions: false,
        customLengthCm: '',
        customBreadthCm: '',
        customHeightCm: '',
      })
      
      setShippingContextLoading(false)
    } catch (error: any) {
      console.error('[handleMarkAsShipped] ❌ Exception fetching shipping context:', error)
      const errorMessage = error.message || 'Unknown error occurred while loading shipping configuration'
      setShippingContextError(errorMessage)
      setShippingContextLoading(false)
      
      // DO NOT proceed if context fetch fails - show error to user
      alert(`Failed to load shipping configuration: ${errorMessage}\n\nPlease try again or contact support.`)
      return
    }
  }

  const handleMarkAsDelivered = (orderId: string) => {
    setConfirmDialog({ show: true, orderId, action: 'delivered' })
  }

  const handleSubmitShipment = async () => {
    if (!shipmentForm.orderId) return

    try {
      setSubmittingShipment(true)
      const { getVendorId, getAuthData } = typeof window !== 'undefined'
        ? await import('@/lib/utils/auth-storage')
        : { getVendorId: () => null, getAuthData: () => null }

      // SECURITY FIX: No localStorage fallback
      const storedVendorId = getVendorId() || getAuthData('vendor')?.vendorId || null

      if (!storedVendorId) {
        throw new Error('Vendor ID not found. Please log in again.')
      }

      // Get order to build item quantities
      const order = orders.find(o => o.id === shipmentForm.orderId)
      if (!order) {
        throw new Error('Order not found')
      }

      // Determine selected courier and cost from estimation
      const selectedEstimation = shipmentForm.selectedCourierType === 'PRIMARY' 
        ? shippingEstimation.primary 
        : shipmentForm.selectedCourierType === 'SECONDARY'
        ? shippingEstimation.secondary
        : null
      
      const selectedCourierCode = selectedEstimation?.courier || shipmentForm.carrierName.trim()
      const shippingCost = selectedEstimation?.estimatedCost

      // Build shipment data
      // Note: shipperName is removed from UI but API may still expect it, so we provide a default
      const shipmentData = {
        shipperName: 'Vendor', // Default value since field is removed from UI
        carrierName: selectedCourierCode || undefined,
        selectedCourierType: shipmentForm.selectedCourierType || undefined, // PRIMARY or SECONDARY
        trackingNumber: shipmentForm.trackingNumber.trim() || undefined,
        modeOfTransport: shipmentForm.modeOfTransport === 'DIRECT' ? 'OTHER' : 'COURIER', // Map DIRECT to OTHER for API compatibility
        dispatchedDate: new Date(shipmentForm.dispatchedDate).toISOString(),
        expectedDeliveryDate: shipmentForm.expectedDeliveryDate
          ? new Date(shipmentForm.expectedDeliveryDate).toISOString()
          : undefined,
        // API expects: Array<{ itemIndex: number, dispatchedQuantity: number }>
        // Map each item with its index and full quantity as dispatched quantity
        itemDispatchedQuantities: order.items.map((item: any, index: number) => ({
          itemIndex: index,
          dispatchedQuantity: item.quantity || 0, // Dispatch full quantity for each item
        })),
        warehouseRefId: shipmentForm.selectedWarehouseRefId || undefined,
        shippingCost: shippingCost, // Pass shipping cost to API
        // Package data
        shipmentPackageId: shipmentForm.selectedPackageId || undefined,
        lengthCm: shipmentForm.useCustomDimensions && shipmentForm.customLengthCm ? parseFloat(shipmentForm.customLengthCm) : undefined,
        breadthCm: shipmentForm.useCustomDimensions && shipmentForm.customBreadthCm ? parseFloat(shipmentForm.customBreadthCm) : undefined,
        heightCm: shipmentForm.useCustomDimensions && shipmentForm.customHeightCm ? parseFloat(shipmentForm.customHeightCm) : undefined,
        volumetricWeight: shipmentForm.useCustomDimensions && shipmentForm.customLengthCm && shipmentForm.customBreadthCm && shipmentForm.customHeightCm
          ? (parseFloat(shipmentForm.customLengthCm) * parseFloat(shipmentForm.customBreadthCm) * parseFloat(shipmentForm.customHeightCm)) / 5000
          : undefined,
      }

      const response = await fetch('/api/prs/shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prId: shipmentForm.orderId,
          vendorId: storedVendorId,
          shipmentData,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create shipment')
      }

      const result = await response.json()
      
      // Populate UI with shipment details from API response
      if (result.trackingNumber || result.shipmentReferenceNumber) {
        setShipmentForm(prev => ({
          ...prev,
          trackingNumber: result.trackingNumber || result.shipmentReferenceNumber || prev.trackingNumber,
          expectedDeliveryDate: result.expectedDeliveryDate 
            ? new Date(result.expectedDeliveryDate).toISOString().split('T')[0]
            : prev.expectedDeliveryDate,
        }))
      }

      alert(`Shipment created successfully!${result.trackingNumber ? ` Tracking Number: ${result.trackingNumber}` : ''}${shippingCost ? ` Shipping Cost: ₹${shippingCost.toFixed(2)}` : ''}`)
      
      // Reset form with defaults after a short delay to show populated fields
      setTimeout(async () => {
        const primaryWarehouse = warehouses.find(w => w.isPrimary)
        const defaultWarehouse = primaryWarehouse || warehouses[0]
        setShipmentForm({
          show: false,
          orderId: null,
          carrierName: '',
          selectedCourierType: null,
          trackingNumber: '',
          modeOfTransport: 'COURIER',
          dispatchedDate: new Date().toISOString().split('T')[0],
          expectedDeliveryDate: '',
          selectedWarehouseRefId: defaultWarehouse?.warehouseRefId || '',
          selectedPackageId: '',
          useCustomDimensions: false,
          customLengthCm: '',
          customBreadthCm: '',
          customHeightCm: '',
        })
        await loadOrders()
      }, 2000)
    } catch (error: any) {
      console.error('Error creating shipment:', error)
      alert(`Failed to create shipment: ${error?.message || 'Unknown error'}`)
    } finally {
      setSubmittingShipment(false)
    }
  }

  const handleConfirm = async () => {
    if (!confirmDialog.orderId || !confirmDialog.action) return

    try {
      // SECURITY FIX: Get vendorId from sessionStorage ONLY (tab-specific)
      const { getVendorId: getVendorIdAuth } = await import('@/lib/utils/auth-storage')
      const storedVendorId = getVendorIdAuth()
      if (!storedVendorId) {
        throw new Error('Vendor ID not found. Please log in again.')
      }
      
      const newStatus = confirmDialog.action === 'delivered' ? 'Delivered' : 'Dispatched'
      console.log(`[Frontend] 🚀 Marking order as ${newStatus}:`, {
        orderId: confirmDialog.orderId,
        action: confirmDialog.action,
        newStatus,
        vendorId: storedVendorId,
        timestamp: new Date().toISOString()
      })
      
      const result = await updateOrderStatus(confirmDialog.orderId, newStatus, storedVendorId)
      console.log(`[Frontend] ✅ Order status updated successfully:`, {
        orderId: confirmDialog.orderId,
        result: result?.id || result?.status || 'N/A'
      })
      
      // Reload orders to get updated data
      console.log(`[Frontend] 🔄 Reloading orders...`)
      await loadOrders()
      console.log(`[Frontend] ✅ Orders reloaded`)
      
      setConfirmDialog({ show: false, orderId: null, action: null })
    } catch (error: any) {
      console.error(`[Frontend] ❌ Error updating order status:`, error)
      console.error(`[Frontend] ❌ Error details:`, {
        message: error?.message,
        stack: error?.stack,
        name: error?.name
      })
      alert(`Failed to update order status: ${error?.message || 'Unknown error'}`)
    }
  }

  const handleCancel = () => {
    setConfirmDialog({ show: false, orderId: null, action: null })
  }

  return (
    <DashboardLayout actorType="vendor">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Order Fulfillment</h1>

        {/* Search */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            {/* Search Input */}
            <div className="relative flex-1 md:w-1/4 w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {/* Company Filter */}
            <div className="relative md:w-1/5 w-full">
              <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <select
                value={filterCompany}
                onChange={(e) => setFilterCompany(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                disabled={companiesLoading}
              >
                {companiesLoading ? (
                  <option value="all">Loading...</option>
                ) : (
                  <>
                    <option value="all">All Companies</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
            
            {/* From Date */}
            <div className="flex items-center gap-2 md:w-auto">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {/* To Date */}
            <div className="flex items-center gap-2 md:w-auto">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {/* Apply Button */}
            <button
              onClick={() => {
                setAppliedFromDate(fromDate)
                setAppliedToDate(toDate)
              }}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors whitespace-nowrap"
            >
              Apply
            </button>
          </div>
        </div>

        {/* Orders - PO-Centric View - Unified sorted by date */}
        {loading ? (
          <p className="text-gray-600 text-center py-8">Loading orders...</p>
        ) : unifiedItems.length === 0 ? (
          <p className="text-gray-600 text-center py-8">No orders found</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Unified list - PO groups and individual orders sorted by date */}
            {unifiedItems.map((item, itemIndex) => {
              // Render PO group
              if (item.type === 'po') {
                const poGroup = item
              // Calculate aggregate status for the PO (use most restrictive status)
              const statuses = poGroup.prs.map((pr: any) => pr.status)
              const aggregateStatus = statuses.includes('Delivered') ? 'Delivered' :
                                     statuses.includes('Dispatched') ? 'Dispatched' :
                                     statuses.includes('Awaiting fulfilment') ? 'Awaiting fulfilment' :
                                     'Awaiting approval'
              
              // Calculate total for the PO
              const poTotal = poGroup.prs.reduce((sum: number, pr: any) => sum + (pr.total || 0), 0)
              
              // Get all unique order IDs for this PO (for action buttons)
              const orderIds = poGroup.prs.map((pr: any) => pr.id)
              
                return (
                  <div key={poGroup.poNumber} className="bg-white rounded-xl shadow-lg p-4 border border-gray-200 hover:shadow-xl transition-shadow flex flex-col">
                    {/* PO Header */}
                    <div className="flex items-start justify-between mb-3 gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 truncate mb-1">PO Number: {poGroup.poNumber}</h3>
                        {poGroup.poDate && (
                          <p className="text-xs text-gray-600 truncate">PO Date: {new Date(poGroup.poDate).toLocaleDateString()}</p>
                        )}
                      </div>
                      <span className={`px-2 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 ${
                        aggregateStatus === 'Delivered' ? 'bg-green-100 text-green-700' :
                        aggregateStatus === 'Dispatched' ? 'bg-blue-100 text-blue-700' :
                        aggregateStatus === 'Awaiting fulfilment' ? 'bg-purple-100 text-purple-700' :
                        aggregateStatus === 'Awaiting approval' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {aggregateStatus}
                      </span>
                    </div>

                    {/* PRs under this PO */}
                    <div className="border-t pt-3 mb-3 space-y-3">
                      {poGroup.prs.map((pr: any, prIdx: number) => (
                        <div key={pr.id} className={`${prIdx > 0 ? 'border-t pt-3' : ''}`}>
                          {/* PR Header */}
                          <div className="mb-2">
                            <h4 className="text-xs font-semibold text-blue-600 mb-1">
                              {pr.prNumber ? `PR: ${pr.prNumber}` : 'PR: N/A'}
                            </h4>
                            {pr.prDate && (
                              <p className="text-xs text-gray-500">PR Date: {new Date(pr.prDate).toLocaleDateString()}</p>
                            )}
                            <p className="text-xs text-gray-600 truncate">Employee: {pr.employeeName || 'N/A'}</p>
                          </div>

                          {/* Products under this PR */}
                          <div className="ml-2 space-y-1.5">
                            {pr.items.map((prItem: any, prItemIdx: number) => (
                              <div key={prItemIdx} className="flex justify-between items-center text-xs">
                                <span className="text-gray-600 flex-1 min-w-0 truncate pr-2">
                                  {prItem.uniformName} {prItem.size ? `(Size: ${prItem.size})` : ''} x {prItem.quantity}
                                </span>
                                <span className="text-gray-900 font-medium whitespace-nowrap shrink-0">₹{(prItem.price * prItem.quantity).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      
                      {/* PO Total */}
                      <div className="mt-3 pt-3 border-t flex justify-between items-center gap-2">
                        <span className="text-xs text-gray-600 truncate">Total PRs: {poGroup.prs.length}</span>
                        <span className="text-sm font-bold text-gray-900 whitespace-nowrap shrink-0">PO Total: ₹{poTotal.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Action Buttons - Use first order ID for actions (or aggregate if needed) */}
                    <div className="flex items-center gap-1.5 mt-auto pt-3">
                      {/* Show "Mark as Shipped" if any PR is awaiting */}
                      {(aggregateStatus === 'Awaiting approval' || aggregateStatus === 'Awaiting fulfilment') && (
                        <button 
                          onClick={() => handleMarkAsShipped(orderIds[0])}
                          className="flex-1 bg-green-600 text-white px-2 py-1.5 rounded text-xs font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-1"
                          title={`Mark all PRs in PO ${poGroup.poNumber} as shipped`}
                        >
                          <Truck className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">Mark as Shipped</span>
                        </button>
                      )}
                      {/* Show "Mark as Delivered" if any PR is dispatched */}
                      {aggregateStatus === 'Dispatched' && (
                        <button 
                          onClick={() => handleMarkAsDelivered(orderIds[0])}
                          className="flex-1 bg-blue-600 text-white px-2 py-1.5 rounded text-xs font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
                          title={`Mark all PRs in PO ${poGroup.poNumber} as delivered`}
                        >
                          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">Mark as Delivered</span>
                        </button>
                      )}
                      {/* Show "Delivered" badge for completed PO */}
                      {aggregateStatus === 'Delivered' && (
                        <div className="flex-1 bg-gray-100 text-gray-600 px-2 py-1.5 rounded text-xs font-medium flex items-center justify-center gap-1">
                          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">Delivered</span>
                        </div>
                      )}
                      <button 
                        onClick={() => router.push(`/dashboard/vendor/orders/${orderIds[0]}`)}
                        className="flex-1 bg-gray-200 text-gray-700 px-2 py-1.5 rounded text-xs font-medium hover:bg-gray-300 transition-colors truncate"
                        title={`View details for PO ${poGroup.poNumber}`}
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                )
              } else {
                // Render individual order (without PO)
                const order = item.order
                return (
                  <div key={order.id} className="bg-white rounded-xl shadow-lg p-4 border border-gray-200 hover:shadow-xl transition-shadow flex flex-col">
                    <div className="flex items-start justify-between mb-3 gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 truncate mb-1">
                          {order.prNumber ? `PR: ${order.prNumber}` : `Order: ${order.id}`}
                        </h3>
                        <p className="text-xs text-gray-600 truncate">Employee: {order.employeeName || 'N/A'}</p>
                        <p className="text-xs text-gray-600 truncate">Date: {new Date(order.orderDate).toLocaleDateString()}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 ${order.status === 'Delivered' ? 'bg-green-100 text-green-700' :
                        order.status === 'Dispatched' ? 'bg-blue-100 text-blue-700' :
                        order.status === 'Awaiting fulfilment' ? 'bg-purple-100 text-purple-700' :
                        order.status === 'Awaiting approval' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {order.status}
                      </span>
                    </div>

                    <div className="border-t pt-3 mb-3">
                      <h4 className="text-xs font-semibold text-gray-900 mb-1.5">Items:</h4>
                      <div className="space-y-1.5">
                        {order.items.map((orderItem: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-xs">
                            <span className="text-gray-600 flex-1 min-w-0 truncate pr-2">
                              {orderItem.uniformName} (Size: {orderItem.size}) x {orderItem.quantity}
                            </span>
                            <span className="text-gray-900 font-medium whitespace-nowrap shrink-0">₹{(orderItem.price * orderItem.quantity).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 pt-2 border-t flex justify-between items-center gap-2">
                        <span className="text-xs text-gray-600 truncate">Dispatch: {order.dispatchLocation}</span>
                        <span className="text-sm font-bold text-gray-900 whitespace-nowrap shrink-0">Total: ₹{order.total.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mt-auto pt-3">
                      {(order.status === 'Awaiting approval' || order.status === 'Awaiting fulfilment') && (
                        <button 
                          onClick={() => handleMarkAsShipped(order.id)}
                          className="flex-1 bg-green-600 text-white px-2 py-1.5 rounded text-xs font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-1"
                        >
                          <Truck className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">Mark as Shipped</span>
                        </button>
                      )}
                      {order.status === 'Dispatched' && (
                        <button 
                          onClick={() => handleMarkAsDelivered(order.id)}
                          className="flex-1 bg-blue-600 text-white px-2 py-1.5 rounded text-xs font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
                        >
                          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">Mark as Delivered</span>
                        </button>
                      )}
                      {order.status === 'Delivered' && (
                        <div className="flex-1 bg-gray-100 text-gray-600 px-2 py-1.5 rounded text-xs font-medium flex items-center justify-center gap-1">
                          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">Delivered</span>
                        </div>
                      )}
                      <button 
                        onClick={() => router.push(`/dashboard/vendor/orders/${order.id}`)}
                        className="flex-1 bg-gray-200 text-gray-700 px-2 py-1.5 rounded text-xs font-medium hover:bg-gray-300 transition-colors truncate"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                )
              }
            })}
          </div>
        )}

        {/* Shipment Form Modal */}
        {shipmentForm.show && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Create Shipment</h2>
                {shippingContext?.shippingMode === 'AUTOMATIC' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs font-medium text-blue-700">
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                    Automatic
                  </span>
                )}
              </div>

              {/* Loading State - Block UI until context loads */}
              {shippingContextLoading && (
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    <div>
                      <p className="text-sm font-medium text-blue-900">Loading shipping configuration...</p>
                      <p className="text-xs text-blue-700 mt-1">Please wait while we determine the shipping mode and routing.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Error State - Show error if context fails to load */}
              {shippingContextError && !shippingContextLoading && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <div className="text-red-600 text-xl">⚠️</div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-red-900">Failed to load shipping configuration</p>
                      <p className="text-xs text-red-700 mt-1">{shippingContextError}</p>
                      <p className="text-xs text-red-600 mt-2">Please close this dialog and try again, or contact support if the issue persists.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Only render shipment form if context is loaded (or error occurred) */}
              {!shippingContextLoading && (
                <>

              {/* Dispatch From & Deliver To - Compact 2-Column Layout */}
              <div className="mb-4 grid grid-cols-2 gap-4">
                {/* Dispatch From */}
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <label className="block text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                    <Warehouse className="h-3.5 w-3.5" />
                    Dispatch From
                  </label>
                  {loadingWarehouses ? (
                    <p className="text-xs text-gray-500">Loading...</p>
                  ) : warehouses.length === 0 ? (
                    <p className="text-xs text-yellow-600">No warehouse</p>
                  ) : (
                    <div>
                      {(() => {
                        const selectedWarehouse = warehouses.find(w => w.warehouseRefId === shipmentForm.selectedWarehouseRefId) || warehouses[0]
                        if (!selectedWarehouse) return null
                        
                        return warehouses.length === 1 ? (
                          <div className="text-xs text-gray-900 space-y-0.5">
                            <div className="font-medium">{selectedWarehouse.warehouseName}</div>
                            {selectedWarehouse.addressLine1 && (
                              <div className="text-gray-700">{selectedWarehouse.addressLine1}</div>
                            )}
                            {selectedWarehouse.addressLine2 && (
                              <div className="text-gray-700">{selectedWarehouse.addressLine2}</div>
                            )}
                            <div className="text-gray-600">
                              {selectedWarehouse.city}
                              {selectedWarehouse.state && `, ${selectedWarehouse.state}`}
                              {selectedWarehouse.pincode && ` - ${selectedWarehouse.pincode}`}
                            </div>
                            {selectedWarehouse.isPrimary && (
                              <span className="inline-block mt-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">Primary</span>
                            )}
                          </div>
                        ) : (
                          <>
                            <select
                              value={shipmentForm.selectedWarehouseRefId}
                              onChange={(e) => setShipmentForm(prev => ({ ...prev, selectedWarehouseRefId: e.target.value }))}
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 mb-2"
                            >
                              {warehouses.map((warehouse) => (
                                <option key={warehouse.warehouseRefId} value={warehouse.warehouseRefId}>
                                  {warehouse.warehouseName} - {warehouse.city} ({warehouse.pincode})
                                  {warehouse.isPrimary && ' [Primary]'}
                                </option>
                              ))}
                            </select>
                            {selectedWarehouse && (
                              <div className="text-xs text-gray-900 space-y-0.5">
                                {selectedWarehouse.addressLine1 && (
                                  <div className="text-gray-700">{selectedWarehouse.addressLine1}</div>
                                )}
                                {selectedWarehouse.addressLine2 && (
                                  <div className="text-gray-700">{selectedWarehouse.addressLine2}</div>
                                )}
                                <div className="text-gray-600">
                                  {selectedWarehouse.city}
                                  {selectedWarehouse.state && `, ${selectedWarehouse.state}`}
                                  {selectedWarehouse.pincode && ` - ${selectedWarehouse.pincode}`}
                                </div>
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  )}
                </div>

                {/* Deliver To */}
                {selectedOrder && (
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <label className="block text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5" />
                      Deliver To
                    </label>
                    <div className="text-xs text-gray-900 space-y-0.5">
                      {selectedOrder.shipping_address_line_1 && (
                        <div className="font-medium text-gray-700">{selectedOrder.shipping_address_line_1}</div>
                      )}
                      {selectedOrder.shipping_address_line_2 && (
                        <div className="text-gray-700">{selectedOrder.shipping_address_line_2}</div>
                      )}
                      {selectedOrder.shipping_address_line_3 && (
                        <div className="text-gray-700">{selectedOrder.shipping_address_line_3}</div>
                      )}
                      <div className="text-gray-600">
                        {selectedOrder.shipping_city}
                        {selectedOrder.shipping_state && `, ${selectedOrder.shipping_state}`}
                        {selectedOrder.shipping_pincode && ` - ${selectedOrder.shipping_pincode}`}
                      </div>
                      {selectedOrder.shipping_country && (
                        <div className="text-gray-600">{selectedOrder.shipping_country}</div>
                      )}
                      {!selectedOrder.shipping_pincode && (
                        <div className="text-yellow-600 mt-0.5">⚠️ Pincode not available</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Shipment Package Selection */}
              <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Shipment Package *
                </label>
                <div className="space-y-3">
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="usePackage"
                      name="packageOption"
                      checked={!shipmentForm.useCustomDimensions}
                      onChange={() => setShipmentForm(prev => ({ ...prev, useCustomDimensions: false, selectedPackageId: prev.selectedPackageId || (packages.length > 0 ? packages[0].packageId : '') }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="usePackage" className="ml-2 text-sm text-gray-700">Select Package</label>
                  </div>
                  {!shipmentForm.useCustomDimensions && (
                    <div>
                      {loadingPackages ? (
                        <div className="text-sm text-gray-500">Loading packages...</div>
                      ) : packages.length === 0 ? (
                        <div className="text-sm text-yellow-600">No packages available. Using custom dimensions.</div>
                      ) : (
                        <select
                          value={shipmentForm.selectedPackageId}
                          onChange={(e) => setShipmentForm(prev => ({ ...prev, selectedPackageId: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                        >
                          <option value="">Select a package...</option>
                          {packages.map((pkg) => (
                            <option key={pkg.packageId} value={pkg.packageId}>
                              {pkg.packageName} ({pkg.lengthCm}×{pkg.breadthCm}×{pkg.heightCm} cm) - {pkg.volumetricWeightKg.toFixed(2)} kg
                            </option>
                          ))}
                        </select>
                      )}
                      {shipmentForm.selectedPackageId && (() => {
                        const selectedPkg = packages.find(p => p.packageId === shipmentForm.selectedPackageId)
                        return selectedPkg ? (
                          <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="text-xs space-y-1">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Dimensions:</span>
                                <span className="font-medium text-gray-900">{selectedPkg.lengthCm} × {selectedPkg.breadthCm} × {selectedPkg.heightCm} cm</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Volumetric Weight:</span>
                                <span className="font-medium text-gray-900">{selectedPkg.volumetricWeightKg.toFixed(2)} kg</span>
                              </div>
                            </div>
                          </div>
                        ) : null
                      })()}
                    </div>
                  )}
                  
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="useCustom"
                      name="packageOption"
                      checked={shipmentForm.useCustomDimensions}
                      onChange={() => setShipmentForm(prev => ({ ...prev, useCustomDimensions: true, selectedPackageId: '' }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="useCustom" className="ml-2 text-sm text-gray-700">Custom Dimensions</label>
                  </div>
                  {shipmentForm.useCustomDimensions && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Length (cm)</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={shipmentForm.customLengthCm}
                            onChange={(e) => setShipmentForm(prev => ({ ...prev, customLengthCm: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            placeholder="0.0"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Breadth (cm)</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={shipmentForm.customBreadthCm}
                            onChange={(e) => setShipmentForm(prev => ({ ...prev, customBreadthCm: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            placeholder="0.0"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Height (cm)</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={shipmentForm.customHeightCm}
                            onChange={(e) => setShipmentForm(prev => ({ ...prev, customHeightCm: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            placeholder="0.0"
                          />
                        </div>
                      </div>
                      {shipmentForm.customLengthCm && shipmentForm.customBreadthCm && shipmentForm.customHeightCm && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="text-xs">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Volumetric Weight:</span>
                              <span className="font-medium text-gray-900">
                                {((parseFloat(shipmentForm.customLengthCm || '0') * 
                                   parseFloat(shipmentForm.customBreadthCm || '0') * 
                                   parseFloat(shipmentForm.customHeightCm || '0')) / 5000).toFixed(2)} kg
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* On-Demand Serviceability & Cost Estimation */}
              {(() => {
                const selectedWarehouse = warehouses.find(w => w.warehouseRefId === shipmentForm.selectedWarehouseRefId)
                const sourcePincode = selectedWarehouse?.pincode
                // Try multiple sources for destination pincode
                const destinationPincode = selectedOrder?.shipping_pincode || 
                                          selectedOrder?.shippingPincode || 
                                          selectedOrder?.pincode ||
                                          (selectedOrder?.dispatchLocation && selectedOrder.dispatchLocation.match(/\d{6}/)?.[0]) // Extract from location string if available
                const hasPackage = shipmentForm.selectedPackageId || (shipmentForm.useCustomDimensions && shipmentForm.customLengthCm && shipmentForm.customBreadthCm && shipmentForm.customHeightCm)
                const canEstimate = sourcePincode && destinationPincode && hasPackage

                return (
                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!canEstimate) return
                        
                        setShippingEstimation(prev => ({ ...prev, loading: true, visible: true }))
                        
                        try {
                          const selectedPkg = packages.find(p => p.packageId === shipmentForm.selectedPackageId)
                          const volumetricWeight = selectedPkg 
                            ? selectedPkg.volumetricWeightKg
                            : shipmentForm.useCustomDimensions && shipmentForm.customLengthCm && shipmentForm.customBreadthCm && shipmentForm.customHeightCm
                              ? (parseFloat(shipmentForm.customLengthCm) * parseFloat(shipmentForm.customBreadthCm) * parseFloat(shipmentForm.customHeightCm)) / 5000
                              : 0

                          // Ensure pincodes are strings and valid
                          const sourcePincodeStr = String(sourcePincode || '').trim()
                          const destinationPincodeStr = String(destinationPincode || '').trim()

                          console.log('[Estimation] Pincode extraction:', {
                            selectedWarehouse,
                            sourcePincode: sourcePincodeStr,
                            selectedOrder,
                            destinationPincode: destinationPincodeStr,
                            volumetricWeight,
                          })

                          if (!sourcePincodeStr || !destinationPincodeStr) {
                            throw new Error(`Missing pincodes: source=${sourcePincodeStr}, destination=${destinationPincodeStr}`)
                          }

                          const requestBody = {
                            sourcePincode: sourcePincodeStr,
                            destinationPincode: destinationPincodeStr,
                            shipmentPackageId: shipmentForm.selectedPackageId || undefined,
                            weightDetails: {
                              volumetricWeight,
                            },
                            companyId: shippingContext?.company?.id || selectedOrder?.companyId || '',
                            vendorId: (() => {
                              // SECURITY FIX: Use ONLY sessionStorage (tab-specific)
                              const vendorIdFromSession = typeof window !== 'undefined' ? sessionStorage.getItem('vendorId') : null
                              return vendorIdFromSession || ''
                            })(),
                          }

                          console.log('[Estimation] Request payload:', requestBody)

                          const response = await fetch('/api/shipping/estimate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(requestBody),
                          })

                          if (!response.ok) {
                            throw new Error('Failed to get shipping estimation')
                          }

                          const data = await response.json()
                          setShippingEstimation({
                            primary: data.primary || null,
                            secondary: data.secondary || null,
                            loading: false,
                            visible: true,
                          })
                          
                          // Auto-populate expected delivery date from estimation
                          if (data.primary?.serviceable && data.primary?.estimatedDays) {
                            const estimatedDays = parseInt(data.primary.estimatedDays.toString(), 10)
                            if (!isNaN(estimatedDays) && estimatedDays > 0) {
                              const deliveryDate = new Date()
                              deliveryDate.setDate(deliveryDate.getDate() + estimatedDays)
                              const formattedDate = deliveryDate.toISOString().split('T')[0]
                              setShipmentForm(prev => ({
                                ...prev,
                                expectedDeliveryDate: formattedDate,
                              }))
                            }
                          } else if (data.secondary?.serviceable && data.secondary?.estimatedDays) {
                            const estimatedDays = parseInt(data.secondary.estimatedDays.toString(), 10)
                            if (!isNaN(estimatedDays) && estimatedDays > 0) {
                              const deliveryDate = new Date()
                              deliveryDate.setDate(deliveryDate.getDate() + estimatedDays)
                              const formattedDate = deliveryDate.toISOString().split('T')[0]
                              setShipmentForm(prev => ({
                                ...prev,
                                expectedDeliveryDate: formattedDate,
                              }))
                            }
                          }
                        } catch (error: any) {
                          console.error('Error getting shipping estimation:', error)
                          alert(`Failed to get shipping estimation: ${error.message}`)
                          setShippingEstimation(prev => ({ ...prev, loading: false }))
                        }
                      }}
                      disabled={!canEstimate || shippingEstimation.loading}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {shippingEstimation.loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Checking...</span>
                        </>
                      ) : (
                        <span>Check Serviceability & Cost</span>
                      )}
                    </button>

                    {shippingEstimation.visible && !shippingEstimation.loading && (
                      <div className="mt-3 p-3 bg-white border border-gray-200 rounded-lg">
                        <h3 className="text-xs font-semibold text-gray-900 mb-2">Shipping Estimation</h3>
                        
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {shippingEstimation.primary && (
                            <div className={`p-2 rounded border ${shippingEstimation.primary.serviceable ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-gray-900">
                                  Primary: {shippingEstimation.primary.courierName || shippingEstimation.primary.courier}
                                </span>
                                <span className={`text-xs font-semibold ${shippingEstimation.primary.serviceable ? 'text-green-700' : 'text-red-700'}`}>
                                  {shippingEstimation.primary.serviceable ? '✔' : '✖'}
                                </span>
                              </div>
                              {shippingEstimation.primary.serviceable && (
                                <div className="space-y-0.5 text-xs text-gray-700">
                                  {shippingEstimation.primary.estimatedDays && (
                                    <div>Delivery: {shippingEstimation.primary.estimatedDays} days</div>
                                  )}
                                  {shippingEstimation.primary.estimatedCost && (
                                    <div className="font-semibold">Cost: ₹{shippingEstimation.primary.estimatedCost.toFixed(2)}</div>
                                  )}
                                </div>
                              )}
                              {shippingEstimation.primary.message && 
                               !shippingEstimation.primary.message.toLowerCase().includes('serviceable by') &&
                               !shippingEstimation.primary.message.toLowerCase().includes('matching') && (
                                <div className="text-xs text-gray-600 mt-1">{shippingEstimation.primary.message}</div>
                              )}
                            </div>
                          )}

                          {shippingEstimation.secondary && (
                            <div className={`p-2 rounded border ${shippingEstimation.secondary.serviceable ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-gray-900">
                                  Secondary: {shippingEstimation.secondary.courierName || shippingEstimation.secondary.courier}
                                </span>
                                <span className={`text-xs font-semibold ${shippingEstimation.secondary.serviceable ? 'text-green-700' : 'text-red-700'}`}>
                                  {shippingEstimation.secondary.serviceable ? '✔' : '✖'}
                                </span>
                              </div>
                              {shippingEstimation.secondary.serviceable && (
                                <div className="space-y-0.5 text-xs text-gray-700">
                                  {shippingEstimation.secondary.estimatedDays && (
                                    <div>Delivery: {shippingEstimation.secondary.estimatedDays} days</div>
                                  )}
                                  {shippingEstimation.secondary.estimatedCost && (
                                    <div className="font-semibold">Cost: ₹{shippingEstimation.secondary.estimatedCost.toFixed(2)}</div>
                                  )}
                                </div>
                              )}
                              {shippingEstimation.secondary.message && 
                               !shippingEstimation.secondary.message.toLowerCase().includes('serviceable by') &&
                               !shippingEstimation.secondary.message.toLowerCase().includes('matching') && (
                                <div className="text-xs text-gray-600 mt-1">{shippingEstimation.secondary.message}</div>
                              )}
                            </div>
                          )}

                          {!shippingEstimation.primary && !shippingEstimation.secondary && (
                            <div className="col-span-2 text-xs text-gray-500 text-center py-1">No estimation available</div>
                          )}
                        </div>

                        {/* Courier Selection */}
                        {(() => {
                          const primaryServiceable = shippingEstimation.primary?.serviceable
                          const secondaryServiceable = shippingEstimation.secondary?.serviceable
                          const availableCount = (primaryServiceable ? 1 : 0) + (secondaryServiceable ? 1 : 0)
                          
                          if (availableCount === 0) return null
                          
                          // Auto-select if only one is available
                          if (availableCount === 1) {
                            const autoSelect = primaryServiceable ? 'PRIMARY' : 'SECONDARY'
                            if (shipmentForm.selectedCourierType !== autoSelect) {
                              setTimeout(() => {
                                setShipmentForm(prev => ({
                                  ...prev,
                                  selectedCourierType: autoSelect,
                                  carrierName: autoSelect === 'PRIMARY' 
                                    ? shippingEstimation.primary?.courier || ''
                                    : shippingEstimation.secondary?.courier || '',
                                }))
                              }, 0)
                            }
                          }
                          
                          return (
                            <div className="mt-2">
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Select Courier *</label>
                              <div className="flex gap-2">
                                {primaryServiceable && (
                                  <button
                                    type="button"
                                    onClick={() => setShipmentForm(prev => ({
                                      ...prev,
                                      selectedCourierType: 'PRIMARY',
                                      carrierName: shippingEstimation.primary?.courier || '',
                                    }))}
                                    className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                                      shipmentForm.selectedCourierType === 'PRIMARY'
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                    }`}
                                  >
                                    Primary
                                    {shippingEstimation.primary?.estimatedCost && (
                                      <div className="text-xs mt-0.5">₹{shippingEstimation.primary.estimatedCost.toFixed(2)}</div>
                                    )}
                                  </button>
                                )}
                                {secondaryServiceable && (
                                  <button
                                    type="button"
                                    onClick={() => setShipmentForm(prev => ({
                                      ...prev,
                                      selectedCourierType: 'SECONDARY',
                                      carrierName: shippingEstimation.secondary?.courier || '',
                                    }))}
                                    className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                                      shipmentForm.selectedCourierType === 'SECONDARY'
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                    }`}
                                  >
                                    Secondary
                                    {shippingEstimation.secondary?.estimatedCost && (
                                      <div className="text-xs mt-0.5">₹{shippingEstimation.secondary.estimatedCost.toFixed(2)}</div>
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Shipment Details - MANUAL mode only */}
              {/* CRITICAL: Only render if context is loaded and mode is MANUAL */}
              {shippingContext && shippingContext.shippingMode === 'MANUAL' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mode of Transport *</label>
                      <select
                        value={shipmentForm.modeOfTransport}
                        onChange={(e) => {
                          const newMode = e.target.value as 'DIRECT' | 'COURIER'
                          setShipmentForm(prev => ({
                            ...prev,
                            modeOfTransport: newMode,
                            // Clear carrier name when switching to DIRECT
                            carrierName: newMode !== 'COURIER' ? '' : prev.carrierName
                          }))
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="COURIER">Courier</option>
                        <option value="DIRECT">Direct</option>
                      </select>
                    </div>

                    {shipmentForm.modeOfTransport === 'COURIER' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Courier Service Provider *
                        </label>
                        {loadingCouriers ? (
                          <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 text-sm">
                            Loading couriers...
                          </div>
                        ) : (() => {
                          if (manualCouriers.length === 0) {
                            return (
                              <div className="w-full px-3 py-2 border border-yellow-300 rounded-lg bg-yellow-50 text-yellow-700 text-sm">
                                No courier providers configured. Please contact admin.
                              </div>
                            )
                          }
                          return (
                            <select
                              value={shipmentForm.carrierName}
                              onChange={(e) => setShipmentForm(prev => ({ ...prev, carrierName: e.target.value }))}
                              required
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="">Select courier...</option>
                              {manualCouriers.map((courier) => (
                                <option key={courier.courierCode} value={courier.courierCode}>
                                  {courier.courierName}
                                </option>
                              ))}
                            </select>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Common fields (shown for both MANUAL and AUTOMATIC) */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tracking Number</label>
                  <input
                    type="text"
                    value={shipmentForm.trackingNumber}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
                    placeholder="Will be populated after shipment creation"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dispatched Date *</label>
                    <input
                      type="date"
                      value={shipmentForm.dispatchedDate}
                      readOnly
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Expected Delivery Date</label>
                    <input
                      type="date"
                      value={shipmentForm.expectedDeliveryDate}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
                      placeholder="Will be populated from estimation"
                    />
                  </div>
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => {
                    // Reset form with defaults
                    const primaryWarehouse = warehouses.find(w => w.isPrimary)
                    const defaultWarehouse = primaryWarehouse || warehouses[0]
                    setShipmentForm({
                      show: false,
                      orderId: null,
                      carrierName: '',
                      selectedCourierType: null,
                      trackingNumber: '',
                      modeOfTransport: 'COURIER',
                      dispatchedDate: new Date().toISOString().split('T')[0],
                      expectedDeliveryDate: '',
                      selectedWarehouseRefId: defaultWarehouse?.warehouseRefId || '',
                      selectedPackageId: '',
                      useCustomDimensions: false,
                      customLengthCm: '',
                      customBreadthCm: '',
                      customHeightCm: '',
                    })
                    setSelectedOrder(null)
                    setCompanyShipmentMode('MANUAL')
                    setVendorRouting(null)
                    setShippingContext(null)
                    setShippingContextLoading(false)
                    setShippingContextError(null)
                    setServiceabilityStatus({ primary: null, secondary: null, loading: false })
                  }}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                  disabled={submittingShipment || shippingContextLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitShipment}
                  disabled={
                    submittingShipment ||
                    shippingContextLoading ||
                    !!shippingContextError ||
                    warehouses.length === 0 ||
                    (shippingContext?.shippingMode === 'MANUAL' && shipmentForm.modeOfTransport === 'COURIER' && (!shipmentForm.carrierName || manualCouriers.length === 0)) ||
                    (shippingContext?.shippingMode === 'AUTOMATIC' && 
                      (!shipmentForm.selectedCourierType || 
                       (serviceabilityStatus.primary !== null && !serviceabilityStatus.primary.serviceable &&
                        (serviceabilityStatus.secondary === null || !serviceabilityStatus.secondary.serviceable))))
                  }
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {submittingShipment ? 'Creating...' : 'Create Shipment'}
                </button>
              </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Manual Shipment Modal */}
        {manualShipmentForm.show && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Create Shipment – Manual</h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 border border-orange-200 rounded-full text-xs font-medium text-orange-700">
                  <div className="w-1.5 h-1.5 bg-orange-600 rounded-full"></div>
                  Manual
                </span>
              </div>

              {/* From and To Address Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Dispatch From Section */}
                {manualShipmentForm.warehouse && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <label className="block text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1.5">
                      <Warehouse className="h-3.5 w-3.5" />
                      From Address (Warehouse)
                    </label>
                    <div className="text-xs text-gray-900 space-y-0.5">
                      <div className="font-medium">{manualShipmentForm.warehouse.warehouseName}</div>
                      <div className="text-gray-600">
                        {manualShipmentForm.warehouse.addressLine1}
                        {manualShipmentForm.warehouse.addressLine2 && `, ${manualShipmentForm.warehouse.addressLine2}`}
                      </div>
                      <div className="text-gray-600">
                        {manualShipmentForm.warehouse.city}, {manualShipmentForm.warehouse.state} - {manualShipmentForm.warehouse.pincode}
                      </div>
                      <div className="text-gray-600">{manualShipmentForm.warehouse.country}</div>
                    </div>
                  </div>
                )}

                {/* Ship To Section */}
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <label className="block text-xs font-semibold text-green-700 mb-2 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    To Address (Employee)
                  </label>
                  {manualShipmentForm.prs.length === 1 ? (
                    // Single PR - show delivery address directly
                    manualShipmentForm.prs[0].hasValidAddress && manualShipmentForm.prs[0].deliveryAddress ? (
                      <div className="text-xs text-gray-900 space-y-0.5">
                        <div className="font-medium">{manualShipmentForm.prs[0].employeeName}</div>
                        <div className="text-gray-600">
                          {manualShipmentForm.prs[0].deliveryAddress.line1}
                          {manualShipmentForm.prs[0].deliveryAddress.line2 && `, ${manualShipmentForm.prs[0].deliveryAddress.line2}`}
                        </div>
                        {manualShipmentForm.prs[0].deliveryAddress.line3 && (
                          <div className="text-gray-600">{manualShipmentForm.prs[0].deliveryAddress.line3}</div>
                        )}
                        <div className="text-gray-600">
                          {manualShipmentForm.prs[0].deliveryAddress.city}, {manualShipmentForm.prs[0].deliveryAddress.state} - {manualShipmentForm.prs[0].deliveryAddress.pincode}
                        </div>
                        <div className="text-gray-600">{manualShipmentForm.prs[0].deliveryAddress.country}</div>
                      </div>
                    ) : (
                      <div className="text-xs text-red-600">
                        <span className="font-medium">⚠️ Address not available</span>
                        <p className="mt-1">Employee address is missing or incomplete.</p>
                      </div>
                    )
                  ) : (
                    // Multiple PRs - show summary
                    <div className="text-xs text-gray-600">
                      <div className="font-medium text-gray-900">{manualShipmentForm.prs.length} different delivery addresses</div>
                      <p className="mt-1">See individual PR details below for specific addresses.</p>
                      {manualShipmentForm.prs.filter(pr => !pr.hasValidAddress).length > 0 && (
                        <p className="mt-1 text-red-600">
                          ⚠️ {manualShipmentForm.prs.filter(pr => !pr.hasValidAddress).length} PR(s) have missing addresses
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* PR-Wise Shipment Details */}
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">PR-Wise Shipment Details</h3>
                <div className="space-y-4">
                  {manualShipmentForm.prs.map((pr, index) => (
                    <div key={pr.prId} className="border border-gray-200 rounded-lg p-4 bg-white">
                      <div className="mb-3 pb-3 border-b border-gray-200">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">PR Number: {pr.prNumber}</h4>
                            <p className="text-sm text-gray-600 mt-1">Employee: {pr.employeeName}</p>
                            <p className="text-sm text-gray-600">Email: {pr.employeeEmail}</p>
                          </div>
                        </div>
                        <div className="mt-2 text-sm text-gray-700">
                          <p className="font-medium mb-1">Delivery Address:</p>
                          {!pr.hasValidAddress || !pr.deliveryAddress ? (
                            <div className="text-red-600 bg-red-50 border border-red-200 rounded p-2">
                              <p className="font-semibold">⚠️ Delivery address not available</p>
                              <p className="text-xs mt-1">Employee address is missing or incomplete. Cannot create shipment for this PR.</p>
                            </div>
                          ) : (
                            <div className="text-gray-600 space-y-0.5">
                              <div>{pr.deliveryAddress.line1}</div>
                              {pr.deliveryAddress.line2 && <div>{pr.deliveryAddress.line2}</div>}
                              {pr.deliveryAddress.line3 && <div>{pr.deliveryAddress.line3}</div>}
                              <div>{pr.deliveryAddress.city}, {pr.deliveryAddress.state} - {pr.deliveryAddress.pincode}</div>
                              <div>{pr.deliveryAddress.country}</div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Editable Inputs for Each PR */}
                      {!pr.hasValidAddress || !pr.deliveryAddress ? (
                        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm text-red-700 font-semibold">⚠️ Shipment cannot be created for this PR</p>
                          <p className="text-xs text-red-600 mt-1">Employee delivery address is missing or incomplete.</p>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Mode of Transport *
                              </label>
                              <select
                                value={pr.modeOfTransport}
                                onChange={(e) => {
                                  const updatedPRs = [...manualShipmentForm.prs]
                                  updatedPRs[index].modeOfTransport = e.target.value as 'COURIER' | 'DIRECT' | 'HAND_DELIVERY'
                                  // Clear courier if not COURIER
                                  if (e.target.value !== 'COURIER') {
                                    updatedPRs[index].courierServiceProvider = ''
                                  }
                                  setManualShipmentForm(prev => ({ ...prev, prs: updatedPRs }))
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="COURIER">Courier</option>
                                <option value="DIRECT">Direct</option>
                                <option value="HAND_DELIVERY">Hand Delivery</option>
                              </select>
                            </div>

                            {pr.modeOfTransport === 'COURIER' && (
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Courier Service Provider *
                                </label>
                                {loadingCouriers ? (
                                  <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 text-sm">
                                    Loading couriers...
                                  </div>
                                ) : manualCouriers.length === 0 ? (
                                  <div className="w-full px-3 py-2 border border-yellow-300 rounded-lg bg-yellow-50 text-yellow-700 text-sm">
                                    No courier providers configured. Please contact admin.
                                  </div>
                                ) : (
                                  <select
                                    value={pr.courierServiceProvider}
                                    onChange={(e) => {
                                      const updatedPRs = [...manualShipmentForm.prs]
                                      updatedPRs[index].courierServiceProvider = e.target.value
                                      setManualShipmentForm(prev => ({ ...prev, prs: updatedPRs }))
                                    }}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  >
                                    <option value="">Select courier...</option>
                                    {manualCouriers.map((courier) => (
                                      <option key={courier.courierCode} value={courier.courierCode}>
                                        {courier.courierName}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-4 mt-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Dispatched Date *
                              </label>
                              <input
                                type="date"
                                value={pr.dispatchedDate}
                                onChange={(e) => {
                                  const updatedPRs = [...manualShipmentForm.prs]
                                  updatedPRs[index].dispatchedDate = e.target.value
                                  setManualShipmentForm(prev => ({ ...prev, prs: updatedPRs }))
                                }}
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Shipment Number
                              </label>
                              <input
                                type="text"
                                value={pr.shipmentNumber}
                                onChange={(e) => {
                                  const updatedPRs = [...manualShipmentForm.prs]
                                  updatedPRs[index].shipmentNumber = e.target.value
                                  setManualShipmentForm(prev => ({ ...prev, prs: updatedPRs }))
                                }}
                                placeholder="AWB / Docket Number"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                              <p className="text-xs text-gray-500 mt-1">AWB / Docket Number</p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3 pt-4 border-t">
                <button
                  onClick={() => {
                    setManualShipmentForm({
                      show: false,
                      poNumber: null,
                      prs: [],
                      warehouse: null,
                    })
                  }}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                  disabled={submittingManualShipment}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    // Validate all PRs have valid addresses
                    const prsWithoutAddress = manualShipmentForm.prs.filter(pr => !pr.hasValidAddress || !pr.deliveryAddress)
                    if (prsWithoutAddress.length > 0) {
                      alert(`Cannot create shipment: ${prsWithoutAddress.length} PR(s) have missing or invalid delivery addresses. Please contact support.`)
                      return
                    }
                    
                    // Validate all PRs have required fields
                    const invalidPRs = manualShipmentForm.prs.filter(pr => 
                      !pr.dispatchedDate || 
                      (pr.modeOfTransport === 'COURIER' && !pr.courierServiceProvider)
                    )
                    
                    if (invalidPRs.length > 0) {
                      alert('Please fill all required fields for all PRs')
                      return
                    }

                    try {
                      setSubmittingManualShipment(true)
                      const { getVendorId } = typeof window !== 'undefined'
                        ? await import('@/lib/utils/auth-storage')
                        : { getVendorId: () => null }

                      // SECURITY FIX: No localStorage fallback
                      const storedVendorId = getVendorId?.() || null

                      if (!storedVendorId) {
                        throw new Error('Vendor ID not found. Please log in again.')
                      }

                      const response = await fetch('/api/prs/manual-shipment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          vendorId: storedVendorId,
                          poNumber: manualShipmentForm.poNumber,
                          warehouseRefId: manualShipmentForm.warehouse ? warehouses.find(w => 
                            w.warehouseName === manualShipmentForm.warehouse?.warehouseName
                          )?.warehouseRefId : null,
                          prs: manualShipmentForm.prs.map(pr => ({
                            prId: pr.prId,
                            prNumber: pr.prNumber,
                            modeOfTransport: pr.modeOfTransport,
                            courierServiceProvider: pr.courierServiceProvider || undefined,
                            dispatchedDate: pr.dispatchedDate,
                            shipmentNumber: pr.shipmentNumber || undefined,
                          })),
                        }),
                      })

                      if (!response.ok) {
                        const error = await response.json()
                        throw new Error(error.error || 'Failed to create manual shipment')
                      }

                      const result = await response.json()
                      alert(`Successfully created ${result.createdCount} shipment(s)!`)
                      
                      // Reset form and reload orders
                      setManualShipmentForm({
                        show: false,
                        poNumber: null,
                        prs: [],
                        warehouse: null,
                      })
                      await loadOrders()
                    } catch (error: any) {
                      console.error('Error creating manual shipment:', error)
                      alert(`Failed to create manual shipment: ${error?.message || 'Unknown error'}`)
                    } finally {
                      setSubmittingManualShipment(false)
                    }
                  }}
                  disabled={submittingManualShipment}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {submittingManualShipment ? 'Creating...' : 'Create Shipment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delivery Confirmation Dialog */}
        {confirmDialog.show && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Confirm Action</h2>
              <p className="text-gray-700 mb-6">
                Are you sure you want to mark this order as delivered?
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={handleCancel}
                  className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                >
                  No
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}








