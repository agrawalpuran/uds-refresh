'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { Search, CheckCircle, XCircle, Package, Truck, RefreshCw, Warehouse, Building2, TrendingUp, TrendingDown, Minus, AlertTriangle, Lightbulb, Clock, Timer, Activity } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { getOrdersByVendor, updateOrderStatus, getCompaniesByVendor } from '@/lib/data-mongodb'
import { maskEmployeeName, maskAddress } from '@/lib/utils/data-masking'

// ============================================================================
// INTELLIGENCE LAYER: CONFIGURATION & THRESHOLDS
// ============================================================================
const REPLACEMENT_INTELLIGENCE_CONFIG = {
  // Processing thresholds
  PENDING_HEALTHY: 3, // Healthy if pending < this
  PENDING_WATCHLIST: 5, // Watchlist if >= this
  PENDING_RISK: 10, // High risk if >= this
  
  // Resolution time thresholds (days from request to dispatch)
  FULFILLMENT_FAST_DAYS: 2,
  FULFILLMENT_NORMAL_DAYS: 5,
  
  // Spike detection
  SPIKE_THRESHOLD_PERCENT: 50,
  
  // Minimum sample size
  MIN_SAMPLE_SIZE: 3,
  
  // Time periods
  CURRENT_WEEK_DAYS: 7,
  PREVIOUS_WEEK_DAYS: 14,
}

// ============================================================================
// INTELLIGENCE LAYER: TYPES
// ============================================================================
interface CompanyReplacementMetrics {
  companyName: string
  totalReplacements: number
  pendingFulfillment: number
  dispatched: number
  delivered: number
  avgFulfillmentDays: number | null
  healthTag: 'Healthy' | 'Watchlist' | 'High Risk'
}

interface ReplacementIntelligence {
  // Core metrics
  totalReplacements: number
  awaitingFulfillment: number
  dispatched: number
  delivered: number
  
  // Trend
  replacementsThisWeek: number
  replacementsLastWeek: number
  weekOverWeekChange: number
  trend: 'increasing' | 'decreasing' | 'stable'
  hasSpikeDetected: boolean
  
  // Fulfillment time
  avgFulfillmentDays: number | null
  fulfillmentSpeed: 'fast' | 'normal' | 'slow'
  
  // Company comparison (Vendor specific)
  companyMetrics: CompanyReplacementMetrics[]
  highestVolumeCompany: CompanyReplacementMetrics | null
  needsAttentionCompany: CompanyReplacementMetrics | null
  
  // Insights
  insights: Array<{
    type: 'warning' | 'info' | 'success'
    message: string
    priority: number
  }>
  
  // Health tag
  healthTag: 'Healthy' | 'Watchlist' | 'High Risk'
}

// ============================================================================
// INTELLIGENCE LAYER: COMPUTATION FUNCTIONS
// ============================================================================
function computeReplacementIntelligence(orders: any[]): ReplacementIntelligence {
  const now = new Date()
  const oneWeekAgo = new Date(now.getTime() - (REPLACEMENT_INTELLIGENCE_CONFIG.CURRENT_WEEK_DAYS * 24 * 60 * 60 * 1000))
  const twoWeeksAgo = new Date(now.getTime() - (REPLACEMENT_INTELLIGENCE_CONFIG.PREVIOUS_WEEK_DAYS * 24 * 60 * 60 * 1000))
  
  // Status breakdown
  const awaitingFulfillment = orders.filter(o => 
    o.status === 'Awaiting fulfilment' || o.status === 'Awaiting approval'
  ).length
  const dispatched = orders.filter(o => o.status === 'Dispatched').length
  const delivered = orders.filter(o => o.status === 'Delivered').length
  
  // Week-over-week analysis
  const replacementsThisWeek = orders.filter(o => {
    const date = o.orderDate ? new Date(o.orderDate) : null
    return date && date >= oneWeekAgo
  }).length
  
  const replacementsLastWeek = orders.filter(o => {
    const date = o.orderDate ? new Date(o.orderDate) : null
    return date && date >= twoWeeksAgo && date < oneWeekAgo
  }).length
  
  const weekOverWeekChange = replacementsLastWeek > 0
    ? ((replacementsThisWeek - replacementsLastWeek) / replacementsLastWeek) * 100
    : (replacementsThisWeek > 0 ? 100 : 0)
  
  const trend: 'increasing' | 'decreasing' | 'stable' = 
    weekOverWeekChange > 20 ? 'increasing' :
    weekOverWeekChange < -20 ? 'decreasing' : 'stable'
  
  const hasSpikeDetected = weekOverWeekChange >= REPLACEMENT_INTELLIGENCE_CONFIG.SPIKE_THRESHOLD_PERCENT &&
    replacementsThisWeek >= REPLACEMENT_INTELLIGENCE_CONFIG.MIN_SAMPLE_SIZE
  
  // Fulfillment time calculation
  const fulfilledOrders = orders.filter(o => 
    (o.status === 'Dispatched' || o.status === 'Delivered') &&
    o.orderDate && o.dispatchedDate
  )
  
  let avgFulfillmentDays: number | null = null
  if (fulfilledOrders.length > 0) {
    const totalDays = fulfilledOrders.reduce((sum, o) => {
      const created = new Date(o.orderDate)
      const dispatched = new Date(o.dispatchedDate)
      const days = (dispatched.getTime() - created.getTime()) / (24 * 60 * 60 * 1000)
      return sum + Math.max(0, days)
    }, 0)
    avgFulfillmentDays = totalDays / fulfilledOrders.length
  }
  
  const fulfillmentSpeed: 'fast' | 'normal' | 'slow' = 
    avgFulfillmentDays === null ? 'normal' :
    avgFulfillmentDays <= REPLACEMENT_INTELLIGENCE_CONFIG.FULFILLMENT_FAST_DAYS ? 'fast' :
    avgFulfillmentDays <= REPLACEMENT_INTELLIGENCE_CONFIG.FULFILLMENT_NORMAL_DAYS ? 'normal' : 'slow'
  
  // Company metrics (Vendor-specific view)
  const companyMap = new Map<string, { name: string; orders: any[] }>()
  
  orders.forEach(o => {
    const companyId = o.companyId?.id || o.companyId || 'unknown'
    const companyName = o.companyId?.name || o.companyName || 'Unknown Company'
    
    if (!companyMap.has(companyId)) {
      companyMap.set(companyId, { name: companyName, orders: [] })
    }
    companyMap.get(companyId)!.orders.push(o)
  })
  
  const companyMetrics: CompanyReplacementMetrics[] = Array.from(companyMap.entries())
    .map(([_, data]) => {
      const pending = data.orders.filter(o => 
        o.status === 'Awaiting fulfilment' || o.status === 'Awaiting approval'
      ).length
      const companyDispatched = data.orders.filter(o => o.status === 'Dispatched').length
      const companyDelivered = data.orders.filter(o => o.status === 'Delivered').length
      
      // Calculate company fulfillment time
      const companyFulfilled = data.orders.filter(o => 
        (o.status === 'Dispatched' || o.status === 'Delivered') && o.orderDate && o.dispatchedDate
      )
      let companyAvgDays: number | null = null
      if (companyFulfilled.length > 0) {
        const totalDays = companyFulfilled.reduce((sum, o) => {
          const created = new Date(o.orderDate)
          const dispatchedDate = new Date(o.dispatchedDate)
          return sum + Math.max(0, (dispatchedDate.getTime() - created.getTime()) / (24 * 60 * 60 * 1000))
        }, 0)
        companyAvgDays = totalDays / companyFulfilled.length
      }
      
      // Determine company health
      let companyHealth: 'Healthy' | 'Watchlist' | 'High Risk' = 'Healthy'
      if (pending >= REPLACEMENT_INTELLIGENCE_CONFIG.PENDING_RISK) {
        companyHealth = 'High Risk'
      } else if (pending >= REPLACEMENT_INTELLIGENCE_CONFIG.PENDING_WATCHLIST || 
                 (companyAvgDays && companyAvgDays > REPLACEMENT_INTELLIGENCE_CONFIG.FULFILLMENT_NORMAL_DAYS)) {
        companyHealth = 'Watchlist'
      }
      
      return {
        companyName: data.name,
        totalReplacements: data.orders.length,
        pendingFulfillment: pending,
        dispatched: companyDispatched,
        delivered: companyDelivered,
        avgFulfillmentDays: companyAvgDays,
        healthTag: companyHealth
      }
    })
    .sort((a, b) => b.totalReplacements - a.totalReplacements)
  
  const highestVolumeCompany = companyMetrics.length > 0 ? companyMetrics[0] : null
  const needsAttentionCompany = companyMetrics.find(c => c.healthTag === 'High Risk') ||
    companyMetrics.find(c => c.healthTag === 'Watchlist') || null
  
  // Generate insights
  const insights: Array<{ type: 'warning' | 'info' | 'success'; message: string; priority: number }> = []
  
  // Spike detection
  if (hasSpikeDetected) {
    insights.push({
      type: 'warning',
      message: `Replacement volume spiked ${weekOverWeekChange.toFixed(0)}% – check for quality issues`,
      priority: 1
    })
  }
  
  // Pending backlog
  if (awaitingFulfillment >= REPLACEMENT_INTELLIGENCE_CONFIG.PENDING_RISK) {
    insights.push({
      type: 'warning',
      message: `${awaitingFulfillment} replacements awaiting fulfillment – backlog critical`,
      priority: 1
    })
  } else if (awaitingFulfillment >= REPLACEMENT_INTELLIGENCE_CONFIG.PENDING_WATCHLIST) {
    insights.push({
      type: 'warning',
      message: `${awaitingFulfillment} replacements pending – monitor fulfillment capacity`,
      priority: 2
    })
  }
  
  // Fulfillment speed
  if (fulfillmentSpeed === 'slow' && fulfilledOrders.length >= 3) {
    insights.push({
      type: 'warning',
      message: `Avg fulfillment time (${avgFulfillmentDays?.toFixed(1)} days) exceeds target`,
      priority: 2
    })
  } else if (fulfillmentSpeed === 'fast' && fulfilledOrders.length >= 5) {
    insights.push({
      type: 'success',
      message: `Fast fulfillment: ${avgFulfillmentDays?.toFixed(1)} days average turnaround`,
      priority: 3
    })
  }
  
  // Company-specific insight
  if (needsAttentionCompany && needsAttentionCompany.healthTag === 'High Risk') {
    insights.push({
      type: 'warning',
      message: `${needsAttentionCompany.companyName} has ${needsAttentionCompany.pendingFulfillment} pending – prioritize`,
      priority: 1
    })
  }
  
  // Stability insight
  if (trend === 'stable' && orders.length >= 5 && awaitingFulfillment < 3) {
    insights.push({
      type: 'success',
      message: 'Replacement volume is stable and fulfillment is on track',
      priority: 3
    })
  }
  
  insights.sort((a, b) => a.priority - b.priority)
  
  // Determine overall health tag
  let healthTag: 'Healthy' | 'Watchlist' | 'High Risk' = 'Healthy'
  if (hasSpikeDetected || awaitingFulfillment >= REPLACEMENT_INTELLIGENCE_CONFIG.PENDING_RISK || fulfillmentSpeed === 'slow') {
    healthTag = 'High Risk'
  } else if (awaitingFulfillment >= REPLACEMENT_INTELLIGENCE_CONFIG.PENDING_WATCHLIST || trend === 'increasing') {
    healthTag = 'Watchlist'
  }
  
  return {
    totalReplacements: orders.length,
    awaitingFulfillment,
    dispatched,
    delivered,
    replacementsThisWeek,
    replacementsLastWeek,
    weekOverWeekChange,
    trend,
    hasSpikeDetected,
    avgFulfillmentDays,
    fulfillmentSpeed,
    companyMetrics,
    highestVolumeCompany,
    needsAttentionCompany,
    insights: insights.slice(0, 3),
    healthTag
  }
}

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

export default function VendorReplacementOrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [allOrders, setAllOrders] = useState<any[]>([]) // Store all orders before company filtering
  const [searchTerm, setSearchTerm] = useState('')
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
    action: 'delivered' | null
  }>({ show: false, orderId: null, action: null })
  const [shipmentForm, setShipmentForm] = useState<{
    show: boolean
    orderId: string | null
    carrierName: string
    selectedCourierType: 'PRIMARY' | 'SECONDARY' | null
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
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [companyShipmentMode, setCompanyShipmentMode] = useState<'MANUAL' | 'AUTOMATIC'>('MANUAL')
  const [vendorRouting, setVendorRouting] = useState<any>(null)
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
  const [manualShipmentForm, setManualShipmentForm] = useState<{
    show: boolean
    orderId: string | null
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
    orderId: null,
    employeeName: '',
    employeeEmail: '',
    deliveryAddress: null,
    hasValidAddress: false,
    modeOfTransport: 'COURIER',
    courierServiceProvider: '',
    dispatchedDate: new Date().toISOString().split('T')[0],
    shipmentNumber: '',
    warehouse: null,
  })
  const [submittingManualShipment, setSubmittingManualShipment] = useState(false)

  const handleSubmitManualShipment = async () => {
    if (!manualShipmentForm.hasValidAddress || !manualShipmentForm.deliveryAddress) {
      alert('Cannot create shipment: Delivery address is missing or invalid. Please contact support.')
      return
    }
    
    if (!manualShipmentForm.dispatchedDate || 
        (manualShipmentForm.modeOfTransport === 'COURIER' && !manualShipmentForm.courierServiceProvider)) {
      alert('Please fill all required fields')
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

      const selectedWarehouse = warehouses.find(w => 
        w.warehouseName === manualShipmentForm.warehouse?.warehouseName
      )

      const response = await fetch('/api/prs/manual-shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: storedVendorId,
          poNumber: null, // Replacement orders don't have PO numbers
          warehouseRefId: selectedWarehouse?.warehouseRefId || null,
          prs: [{
            prId: manualShipmentForm.orderId,
            prNumber: manualShipmentForm.orderId, // Use orderId as PR number for replacement orders
            modeOfTransport: manualShipmentForm.modeOfTransport,
            courierServiceProvider: manualShipmentForm.courierServiceProvider || undefined,
            dispatchedDate: manualShipmentForm.dispatchedDate,
            shipmentNumber: manualShipmentForm.shipmentNumber || undefined,
          }],
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create manual shipment')
      }

      const result = await response.json()
      alert(`Successfully created shipment!`)
      
      setManualShipmentForm({
        show: false,
        orderId: null,
        employeeName: '',
        employeeEmail: '',
        deliveryAddress: null,
        hasValidAddress: false,
        modeOfTransport: 'COURIER',
        courierServiceProvider: '',
        dispatchedDate: new Date().toISOString().split('T')[0],
        shipmentNumber: '',
        warehouse: null,
      })
      await loadOrders()
    } catch (error: any) {
      console.error('Error creating manual shipment:', error)
      alert(`Failed to create manual shipment: ${error?.message || 'Unknown error'}`)
    } finally {
      setSubmittingManualShipment(false)
    }
  }

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
      const { getVendorId, getAuthData } = typeof window !== 'undefined' 
        ? await import('@/lib/utils/auth-storage') 
        : { getVendorId: () => null, getAuthData: () => null }
      
      let storedVendorId = getVendorId() || getAuthData('vendor')?.vendorId || null
      
      // SECURITY FIX: No localStorage fallback
      
      console.log('[ReplacementOrders] VendorId resolved:', storedVendorId)
      
      if (storedVendorId) {
        const vendorOrders = await getOrdersByVendor(storedVendorId)
        const replacementOrders = vendorOrders.filter((order: any) => order.orderType === 'REPLACEMENT')
        console.log('Loaded replacement orders:', replacementOrders.length)
        setAllOrders(replacementOrders) // Store all replacement orders
        setOrders(replacementOrders)
        
        // Load companies for filter
        try {
          setCompaniesLoading(true)
          const vendorCompanies = await getCompaniesByVendor(storedVendorId)
          console.log('[ReplacementOrders] Loaded companies for vendor:', vendorCompanies.length)
          setCompanies(vendorCompanies)
        } catch (companyError) {
          console.error('[ReplacementOrders] Error loading companies:', companyError)
        } finally {
          setCompaniesLoading(false)
        }
      } else {
        console.warn('No vendor ID found')
        setOrders([])
        setAllOrders([])
        setCompaniesLoading(false)
      }
    } catch (error) {
      console.error('Error loading replacement orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadWarehouses = async () => {
    try {
      setLoadingWarehouses(true)
      const { getVendorId, getAuthData } = typeof window !== 'undefined'
        ? await import('@/lib/utils/auth-storage')
        : { getVendorId: () => null, getAuthData: () => null }

      let storedVendorId = getVendorId() || getAuthData('vendor')?.vendorId || null
      // SECURITY FIX: No localStorage fallback

      if (storedVendorId) {
        const response = await fetch(`/api/vendor/warehouses?vendorId=${storedVendorId}`)
        if (response.ok) {
          const data = await response.json()
          const activeWarehouses = (data.warehouses || []).filter((w: Warehouse) => w.isActive)
          activeWarehouses.sort((a: Warehouse, b: Warehouse) => {
            if (a.isPrimary && !b.isPrimary) return -1
            if (!a.isPrimary && b.isPrimary) return 1
            return a.warehouseName.localeCompare(b.warehouseName)
          })
          setWarehouses(activeWarehouses)

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
      
      if (response.ok) {
        const data = await response.json()
        
        if (data.success && data.couriers) {
          const couriers = data.couriers.map((c: any): { courierCode: string, courierName: string } => ({
            courierCode: String(c.courierCode || c.courierName || ''),
            courierName: String(c.courierName || c.courierCode || 'Unknown'),
          }))
          
          setProviderCouriers(couriers)
          return couriers
        }
      }
      return []
    } catch (error) {
      console.error('[loadProviderCouriers] ❌ Exception loading provider couriers:', error)
      return []
    } finally {
      setLoadingCouriers(false)
    }
  }

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
          weight: 1.0,
          codAmount: 0,
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
      console.log(`[ReplacementOrders] Filtered to ${filtered.length} orders for company ${filterCompany}`)
      setOrders(filtered)
    }
  }, [filterCompany, allOrders])

  // Auto-select courier when couriers are loaded and routing is available
  useEffect(() => {
    const hasRouting = !!vendorRouting
    if (shipmentForm.show && hasRouting && !shipmentForm.carrierName) {
      const availableCouriers = companyShipmentMode === 'AUTOMATIC' ? providerCouriers : manualCouriers
      if (availableCouriers.length > 0) {
        const providerCourierCode = vendorRouting.primaryCourierCode
        let matchingCourier = availableCouriers.find(c => {
          return c.courierCode.toUpperCase() === providerCourierCode.toUpperCase() ||
            c.courierCode === providerCourierCode.toString() ||
            c.courierCode === providerCourierCode
        })

        if (!matchingCourier && /^\d+$/.test(providerCourierCode) && companyShipmentMode === 'AUTOMATIC' && providerCouriers.length > 0) {
          const providerCourier = providerCouriers.find(c => 
            c.courierCode === providerCourierCode || 
            c.courierCode === providerCourierCode.toString()
          )
          if (providerCourier) {
            const providerNameUpper = providerCourier.courierName.toUpperCase()
            matchingCourier = availableCouriers.find(c => {
              const courierNameUpper = c.courierName.toUpperCase()
              return courierNameUpper === providerNameUpper ||
                courierNameUpper.includes(providerNameUpper) ||
                providerNameUpper.includes(courierNameUpper)
            })
          }
        }

        if (matchingCourier) {
          setShipmentForm(prev => ({ ...prev, carrierName: matchingCourier!.courierCode }))
        }
      }
    }
  }, [manualCouriers, providerCouriers, vendorRouting, shipmentForm.show, shipmentForm.carrierName, companyShipmentMode])

  const handleMarkAsShipped = async (orderId: string) => {
    let order = orders.find(o => o.id === orderId)

    if (order && (!order.shipping_address_line_1 || !order.shipping_pincode)) {
      try {
        let locationId = null

        if (order.employeeId && typeof order.employeeId === 'object' && order.employeeId.locationId) {
          locationId = typeof order.employeeId.locationId === 'object' ? order.employeeId.locationId.id : order.employeeId.locationId
        } else {
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
          const locationRes = await fetch(`/api/locations?locationId=${locationId}`)
          if (locationRes.ok) {
            const locationData = await locationRes.json()
            const location = locationData.location || locationData

            if (location) {
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

    const primaryWarehouse = warehouses.find(w => w.isPrimary)
    const defaultWarehouse = primaryWarehouse || warehouses[0]

    const { getVendorId, getAuthData } = typeof window !== 'undefined'
      ? await import('@/lib/utils/auth-storage')
      : { getVendorId: () => null, getAuthData: () => null }

    // SECURITY FIX: No localStorage fallback
    const storedVendorId = getVendorId?.() || null

    if (!storedVendorId) {
      alert('Vendor ID not found. Please log in again.')
      return
    }

    const companyId = order?.companyId 
      ? (typeof order.companyId === 'object' ? order.companyId.id : order.companyId)
      : null
    
    const destinationPincode = order?.shipping_pincode || null

    if (!companyId) {
      alert('Company ID not found for this order. Please contact support.')
      return
    }

    setShippingContextLoading(true)
    setShippingContextError(null)
    setShippingContext(null)
    
    try {
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
        setShippingContextError(errorMessage)
        setShippingContextLoading(false)
        alert(`Failed to load shipping configuration: ${errorMessage}\n\nPlease try again or contact support.`)
        return
      }
      
      const context = await contextRes.json()
      setShippingContext(context)
      setCompanyShipmentMode(context.shippingMode)
      setVendorRouting(context.vendorRouting)
      setShippingContextError(null)
      
      if (context.shippingMode === 'MANUAL') {
        const clickedOrder = orders.find(o => o.id === orderId)
        if (!clickedOrder) {
          alert('Order not found')
          setShippingContextLoading(false)
          return
        }
        
        await loadManualCouriers()
        
        const employeeId = clickedOrder.employeeId 
          ? (typeof clickedOrder.employeeId === 'object' ? clickedOrder.employeeId.id : clickedOrder.employeeId)
          : clickedOrder.employeeIdNum || null
        
        let employeeAddress = null
        let employeeEmail = 'N/A'
        
        if (employeeId) {
          try {
            const employeeRes = await fetch(`/api/employees?employeeId=${employeeId}`)
            if (employeeRes.ok) {
              const employeeData = await employeeRes.json()
              const employee = Array.isArray(employeeData) ? employeeData[0] : employeeData
              
              if (employee) {
                employeeEmail = employee.email || 'N/A'
                
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
        
        const hasValidAddress = !!(employeeAddress && employeeAddress.line1 && employeeAddress.line1 !== 'N/A')
        
        setManualShipmentForm({
          show: true,
          orderId: clickedOrder.id,
          employeeName: clickedOrder.employeeName || 'N/A',
          employeeEmail,
          deliveryAddress: employeeAddress,
          hasValidAddress,
          modeOfTransport: 'COURIER',
          courierServiceProvider: '',
          dispatchedDate: new Date().toISOString().split('T')[0],
          shipmentNumber: '',
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
        return
      }
      
      if (context.shippingMode === 'AUTOMATIC' && context.hasRouting && context.vendorRouting?.providerCode) {
        await loadProviderCouriers(context.vendorRouting.providerCode)

        if (context.sourcePincode && context.destinationPincode && context.primaryCourier?.code) {
          const primaryResult = await checkServiceability(
            context.sourcePincode,
            context.destinationPincode,
            context.primaryCourier.code,
            context.vendorRouting.providerCode
          )
          setServiceabilityStatus(prev => ({ ...prev, primary: primaryResult }))

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

      let autoSelectedCourier = ''
      if (context.shippingMode === 'AUTOMATIC' && context.hasRouting && context.primaryCourier) {
        const availableCouriers = context.shippingMode === 'AUTOMATIC' ? providerCouriers : manualCouriers
        if (availableCouriers.length === 0 && context.shippingMode === 'AUTOMATIC') {
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

      setShipmentForm({
        show: true,
        orderId,
        carrierName: autoSelectedCourier,
        selectedCourierType: null,
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
      alert(`Failed to load shipping configuration: ${errorMessage}\n\nPlease try again or contact support.`)
      return
    }
  }

  const handleSubmitShipment = async () => {
    if (!shipmentForm.orderId) return

    try {
      setSubmittingShipment(true)
      const { getVendorId, getAuthData } = typeof window !== 'undefined'
        ? await import('@/lib/utils/auth-storage')
        : { getVendorId: () => null, getAuthData: () => null }

      let storedVendorId = getVendorId() || getAuthData('vendor')?.vendorId || null
      // SECURITY FIX: No localStorage fallback

      if (!storedVendorId) {
        throw new Error('Vendor ID not found. Please log in again.')
      }

      const order = orders.find(o => o.id === shipmentForm.orderId)
      if (!order) {
        throw new Error('Order not found')
      }

      const selectedEstimation = shipmentForm.selectedCourierType === 'PRIMARY' 
        ? shippingEstimation.primary 
        : shipmentForm.selectedCourierType === 'SECONDARY'
        ? shippingEstimation.secondary
        : null
      
      const selectedCourierCode = selectedEstimation?.courier || shipmentForm.carrierName.trim()
      const shippingCost = selectedEstimation?.estimatedCost

      const shipmentData = {
        shipperName: 'Vendor',
        carrierName: selectedCourierCode || undefined,
        selectedCourierType: shipmentForm.selectedCourierType || undefined,
        trackingNumber: shipmentForm.trackingNumber.trim() || undefined,
        modeOfTransport: shipmentForm.modeOfTransport === 'DIRECT' ? 'OTHER' : 'COURIER',
        dispatchedDate: new Date(shipmentForm.dispatchedDate).toISOString(),
        expectedDeliveryDate: shipmentForm.expectedDeliveryDate
          ? new Date(shipmentForm.expectedDeliveryDate).toISOString()
          : undefined,
        itemDispatchedQuantities: order.items.map((item: any, index: number) => ({
          itemIndex: index,
          dispatchedQuantity: item.quantity || 0,
        })),
        warehouseRefId: shipmentForm.selectedWarehouseRefId || undefined,
        shippingCost: shippingCost,
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

  const handleMarkAsDelivered = (orderId: string) => {
    setConfirmDialog({ show: true, orderId, action: 'delivered' })
  }

  const handleConfirm = async () => {
    if (!confirmDialog.orderId || !confirmDialog.action) return

    try {
      const newStatus = 'Delivered'
      console.log(`[Frontend] 🚀 Marking replacement order as ${newStatus}:`, {
        orderId: confirmDialog.orderId,
        action: confirmDialog.action,
        newStatus,
        timestamp: new Date().toISOString()
      })
      
      // SECURITY FIX: Use sessionStorage only
      const { getVendorId: getVendorIdAuth } = await import('@/lib/utils/auth-storage')
      const storedVendorId = getVendorIdAuth()
      if (!storedVendorId) {
        throw new Error('Vendor ID not found. Please log in again.')
      }
      
      const result = await updateOrderStatus(confirmDialog.orderId, newStatus, storedVendorId)
      console.log(`[Frontend] ✅ Replacement order status updated successfully:`, {
        orderId: confirmDialog.orderId,
        result: result?.id || result?.status || 'N/A'
      })
      
      await loadOrders()
      
      setConfirmDialog({ show: false, orderId: null, action: null })
    } catch (error: any) {
      console.error(`[Frontend] ❌ Error updating replacement order status:`, error)
      alert(`Failed to update order status: ${error?.message || 'Unknown error'}`)
    }
  }

  const handleCancel = () => {
    setConfirmDialog({ show: false, orderId: null, action: null })
  }

  const filteredOrders = orders.filter(order =>
    order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.employeeName?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // ============================================================================
  // INTELLIGENCE LAYER: Compute metrics
  // ============================================================================
  const intelligence = useMemo(() => {
    return computeReplacementIntelligence(allOrders)
  }, [allOrders])

  return (
    <DashboardLayout actorType="vendor">
      <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Replacement Orders</h1>
            <p className="text-gray-600 mt-2">View and fulfill replacement orders for returned items</p>
          </div>
        </div>

        {/* Intelligence Panel */}
        {allOrders.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            {/* Metrics Row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              {/* Total Replacements */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500">Total Replacements</span>
                  <div className={`flex items-center gap-0.5 text-xs font-medium ${
                    intelligence.weekOverWeekChange > 20 ? 'text-red-600' :
                    intelligence.weekOverWeekChange < -20 ? 'text-green-600' : 'text-gray-500'
                  }`}>
                    {intelligence.weekOverWeekChange > 20 ? <TrendingUp className="h-3 w-3" /> :
                     intelligence.weekOverWeekChange < -20 ? <TrendingDown className="h-3 w-3" /> :
                     <Minus className="h-3 w-3" />}
                    <span>{Math.abs(intelligence.weekOverWeekChange).toFixed(0)}%</span>
                  </div>
                </div>
                <span className="text-2xl font-bold text-gray-900">{intelligence.totalReplacements}</span>
                <p className="text-xs text-gray-500 mt-1">this week: {intelligence.replacementsThisWeek}</p>
              </div>

              {/* Awaiting Fulfillment */}
              <div className={`rounded-lg p-4 ${
                intelligence.awaitingFulfillment >= 5 ? 'bg-red-50' : 
                intelligence.awaitingFulfillment >= 3 ? 'bg-yellow-50' : 'bg-gray-50'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-medium ${
                    intelligence.awaitingFulfillment >= 5 ? 'text-red-600' :
                    intelligence.awaitingFulfillment >= 3 ? 'text-yellow-600' : 'text-gray-500'
                  }`}>Pending</span>
                  <Clock className={`h-3 w-3 ${
                    intelligence.awaitingFulfillment >= 5 ? 'text-red-500' :
                    intelligence.awaitingFulfillment >= 3 ? 'text-yellow-500' : 'text-gray-400'
                  }`} />
                </div>
                <span className={`text-2xl font-bold ${
                  intelligence.awaitingFulfillment >= 5 ? 'text-red-700' :
                  intelligence.awaitingFulfillment >= 3 ? 'text-yellow-700' : 'text-gray-900'
                }`}>{intelligence.awaitingFulfillment}</span>
                <p className="text-xs text-gray-500 mt-1">awaiting fulfillment</p>
              </div>

              {/* Fulfillment Time */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500">Avg Fulfillment</span>
                  <Timer className="h-3 w-3 text-gray-400" />
                </div>
                <span className={`text-xl font-bold ${
                  intelligence.fulfillmentSpeed === 'fast' ? 'text-green-600' :
                  intelligence.fulfillmentSpeed === 'slow' ? 'text-red-600' : 'text-gray-900'
                }`}>
                  {intelligence.avgFulfillmentDays !== null 
                    ? `${intelligence.avgFulfillmentDays.toFixed(1)}d`
                    : 'N/A'}
                </span>
                <p className={`text-xs mt-1 ${
                  intelligence.fulfillmentSpeed === 'fast' ? 'text-green-600' :
                  intelligence.fulfillmentSpeed === 'slow' ? 'text-red-600' : 'text-gray-500'
                }`}>
                  {intelligence.fulfillmentSpeed === 'fast' ? '✓ Fast' :
                   intelligence.fulfillmentSpeed === 'slow' ? '⚠ Slow' : 'Normal'}
                </p>
              </div>

              {/* Dispatched */}
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-blue-600">In Transit</span>
                  <Truck className="h-3 w-3 text-blue-500" />
                </div>
                <span className="text-2xl font-bold text-blue-700">{intelligence.dispatched}</span>
                <p className="text-xs text-gray-500 mt-1">dispatched</p>
              </div>

              {/* Health Status */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500">Operations Health</span>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-semibold ${
                  intelligence.healthTag === 'Healthy' ? 'bg-green-100 text-green-700' :
                  intelligence.healthTag === 'Watchlist' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                }`}>
                  {intelligence.healthTag}
                </span>
                {intelligence.hasSpikeDetected && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Spike detected
                  </p>
                )}
              </div>
            </div>

            {/* Company Comparison (if multiple companies) */}
            {intelligence.companyMetrics.length > 1 && (
              <div className="border-t border-gray-100 pt-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-semibold text-gray-700">Replacements by Company</span>
                  </div>
                  <span className="text-xs text-gray-500">{intelligence.companyMetrics.length} companies</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 px-2 font-semibold text-gray-600">Company</th>
                        <th className="text-center py-2 px-2 font-semibold text-gray-600">Total</th>
                        <th className="text-center py-2 px-2 font-semibold text-gray-600">Pending</th>
                        <th className="text-center py-2 px-2 font-semibold text-gray-600">Avg Fulfillment</th>
                        <th className="text-center py-2 px-2 font-semibold text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {intelligence.companyMetrics.slice(0, 5).map((company, idx) => (
                        <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2 px-2 font-medium text-gray-900 truncate max-w-[150px]">{company.companyName}</td>
                          <td className="py-2 px-2 text-center text-gray-700">{company.totalReplacements}</td>
                          <td className={`py-2 px-2 text-center font-semibold ${
                            company.pendingFulfillment >= 5 ? 'text-red-600' :
                            company.pendingFulfillment >= 3 ? 'text-yellow-600' : 'text-gray-600'
                          }`}>{company.pendingFulfillment}</td>
                          <td className="py-2 px-2 text-center text-gray-600">
                            {company.avgFulfillmentDays !== null 
                              ? `${company.avgFulfillmentDays.toFixed(1)}d`
                              : '-'}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              company.healthTag === 'Healthy' ? 'bg-green-100 text-green-700' :
                              company.healthTag === 'Watchlist' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {company.healthTag}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Insights */}
            {intelligence.insights.length > 0 && (
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-semibold text-gray-700">Insights</span>
                </div>
                <div className="space-y-2">
                  {intelligence.insights.map((insight, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-2 p-2 rounded-lg text-xs ${
                        insight.type === 'warning' ? 'bg-red-50 text-red-700' :
                        insight.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      {insight.type === 'warning' && <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />}
                      {insight.type === 'success' && <CheckCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />}
                      {insight.type === 'info' && <Lightbulb className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />}
                      <span>{insight.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search and Filter */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search replacement orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {/* Company Filter */}
            <div className="relative md:w-1/4 w-full">
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
          </div>
        </div>

        {/* Orders */}
        {loading ? (
          <p className="text-gray-600 text-center py-8">Loading replacement orders...</p>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <RefreshCw className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">No Replacement Orders</h2>
            <p className="text-gray-600">
              {searchTerm 
                ? 'No replacement orders match your search criteria.'
                : 'You have no replacement orders at this time.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map((order) => (
              <div key={order.id} className="bg-white rounded-xl shadow-lg p-4 border-l-4 border-green-500 border border-gray-200 hover:shadow-xl transition-shadow flex flex-col">
              <div className="flex items-start justify-between mb-3 gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                    <h3 className="text-sm font-bold text-gray-900 truncate">#{order.id}</h3>
                    <span className="text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                      Replacement Order
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 truncate">Employee: {maskEmployeeName(order.employeeName || 'N/A')}</p>
                  <p className="text-xs text-gray-600 truncate">Date: {new Date(order.orderDate).toLocaleDateString()}</p>
                  {order.returnRequestId && (
                    <p className="text-[10px] text-gray-500 mt-0.5 truncate">Return: #{order.returnRequestId}</p>
                  )}
                </div>
                <span className={`px-2 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 ${
                  order.status === 'Delivered' ? 'bg-green-100 text-green-700' :
                  order.status === 'Dispatched' ? 'bg-blue-100 text-blue-700' :
                  order.status === 'Awaiting fulfilment' ? 'bg-purple-100 text-purple-700' :
                  order.status === 'Awaiting approval' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {order.status}
                </span>
              </div>

              <div className="border-t pt-3 mb-3">
                <h4 className="text-xs font-semibold text-gray-900 mb-1.5">Replacement Items:</h4>
                <div className="space-y-1.5">
                  {order.items.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-xs bg-green-50 p-2 rounded">
                      <span className="text-gray-700 flex-1 min-w-0 truncate pr-2">
                        {item.uniformName} (Size: {item.size}) x {item.quantity}
                      </span>
                      <span className="text-gray-900 font-medium whitespace-nowrap shrink-0">₹{(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t flex justify-between items-center gap-2">
                  <span className="text-xs text-gray-600 truncate">Dispatch: {order.dispatchLocation}</span>
                  <span className="text-sm font-bold text-gray-900 whitespace-nowrap shrink-0">Total: ₹{order.total.toFixed(2)}</span>
                </div>
                {order.deliveryAddress && (
                  <div className="mt-1.5">
                    <p className="text-[10px] text-gray-600">Delivery Address:</p>
                    <p className="text-xs font-medium text-gray-900 line-clamp-2">{maskAddress(order.deliveryAddress)}</p>
                  </div>
                )}
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
                <button className="flex-1 bg-gray-200 text-gray-700 px-2 py-1.5 rounded text-xs font-medium hover:bg-gray-300 transition-colors truncate">
                  View Details
                </button>
              </div>
            </div>
            ))}
          </div>
        )}

        {/* Shipping Context Loading Overlay */}
        {shippingContextLoading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
              <div className="flex items-center justify-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-gray-700 font-medium">Loading shipping configuration...</p>
              </div>
              {shippingContextError && (
                <p className="text-red-600 text-sm mt-4 text-center">{shippingContextError}</p>
              )}
            </div>
          </div>
        )}

        {/* Automatic Shipment Form Modal */}
        {shipmentForm.show && !shippingContextLoading && shippingContext && shippingContext.shippingMode === 'AUTOMATIC' && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Create Shipment – Automatic</h2>

              {/* Destination Address */}
              {selectedOrder && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Delivery Address</label>
                  <div className="text-xs text-gray-900 space-y-0.5">
                    {selectedOrder.shipping_address_line_1 && <div>{selectedOrder.shipping_address_line_1}</div>}
                    {selectedOrder.shipping_address_line_2 && <div>{selectedOrder.shipping_address_line_2}</div>}
                    {selectedOrder.shipping_address_line_3 && <div>{selectedOrder.shipping_address_line_3}</div>}
                    <div>
                      {selectedOrder.shipping_city && `${selectedOrder.shipping_city}, `}
                      {selectedOrder.shipping_state && `${selectedOrder.shipping_state} - `}
                      {selectedOrder.shipping_pincode}
                    </div>
                    {selectedOrder.shipping_country && <div>{selectedOrder.shipping_country}</div>}
                  </div>
                </div>
              )}

              {/* Warehouse Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Dispatch From (Warehouse) *</label>
                {loadingWarehouses ? (
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 text-sm">
                    Loading warehouses...
                  </div>
                ) : warehouses.length === 0 ? (
                  <div className="w-full px-3 py-2 border border-yellow-300 rounded-lg bg-yellow-50 text-yellow-700 text-sm">
                    No warehouses configured. Please contact admin.
                  </div>
                ) : (
                  <select
                    value={shipmentForm.selectedWarehouseRefId}
                    onChange={(e) => setShipmentForm(prev => ({ ...prev, selectedWarehouseRefId: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select warehouse...</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.warehouseRefId} value={warehouse.warehouseRefId}>
                        {warehouse.warehouseName} {warehouse.isPrimary ? '(Primary)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Package Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Package Type</label>
                {loadingPackages ? (
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 text-sm">
                    Loading packages...
                  </div>
                ) : (
                  <>
                    <select
                      value={shipmentForm.selectedPackageId}
                      onChange={(e) => setShipmentForm(prev => ({ ...prev, selectedPackageId: e.target.value, useCustomDimensions: false }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-2"
                    >
                      <option value="">Select package...</option>
                      {packages.map((pkg) => (
                        <option key={pkg.packageId} value={pkg.packageId}>
                          {pkg.packageName} ({pkg.lengthCm}×{pkg.breadthCm}×{pkg.heightCm} cm)
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="checkbox"
                        id="useCustomDimensions"
                        checked={shipmentForm.useCustomDimensions}
                        onChange={(e) => setShipmentForm(prev => ({ ...prev, useCustomDimensions: e.target.checked, selectedPackageId: '' }))}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="useCustomDimensions" className="text-sm text-gray-700">
                        Use custom dimensions
                      </label>
                    </div>
                  </>
                )}
              </div>

              {/* Custom Dimensions */}
              {shipmentForm.useCustomDimensions && (
                <div className="mb-4 grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Length (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={shipmentForm.customLengthCm}
                      onChange={(e) => setShipmentForm(prev => ({ ...prev, customLengthCm: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
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
                    />
                  </div>
                </div>
              )}

              {/* Courier Selection for AUTOMATIC mode */}
              {shippingContext.hasRouting && (serviceabilityStatus.primary || serviceabilityStatus.secondary) && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Courier *</label>
                  <div className="flex gap-2">
                    {serviceabilityStatus.primary?.serviceable && (
                      <button
                        type="button"
                        onClick={() => setShipmentForm(prev => ({
                          ...prev,
                          selectedCourierType: 'PRIMARY',
                          carrierName: shippingContext.primaryCourier?.code || '',
                        }))}
                        className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          shipmentForm.selectedCourierType === 'PRIMARY'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        Primary
                        {serviceabilityStatus.primary?.cost && (
                          <div className="text-xs mt-0.5">₹{serviceabilityStatus.primary.cost.toFixed(2)}</div>
                        )}
                      </button>
                    )}
                    {serviceabilityStatus.secondary?.serviceable && (
                      <button
                        type="button"
                        onClick={() => setShipmentForm(prev => ({
                          ...prev,
                          selectedCourierType: 'SECONDARY',
                          carrierName: shippingContext.secondaryCourier?.code || '',
                        }))}
                        className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          shipmentForm.selectedCourierType === 'SECONDARY'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        Secondary
                        {serviceabilityStatus.secondary?.cost && (
                          <div className="text-xs mt-0.5">₹{serviceabilityStatus.secondary.cost.toFixed(2)}</div>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Dispatch Date */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Dispatched Date *</label>
                <input
                  type="date"
                  value={shipmentForm.dispatchedDate}
                  readOnly
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => {
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
                  disabled={submittingShipment}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitShipment}
                  disabled={
                    submittingShipment ||
                    warehouses.length === 0 ||
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
            </div>
          </div>
        )}

        {/* Manual Shipment Form Modal */}
        {manualShipmentForm.show && !shippingContextLoading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Create Shipment – Manual</h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 border border-orange-200 rounded-full text-xs font-medium text-orange-700">
                  <div className="w-1.5 h-1.5 bg-orange-600 rounded-full"></div>
                  Manual
                </span>
              </div>

              {/* Dispatch From Section */}
              {manualShipmentForm.warehouse && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <label className="block text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                    <Warehouse className="h-3.5 w-3.5" />
                    Dispatch From
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

              {/* Order Details */}
              <div className="mb-4 border border-gray-200 rounded-lg p-4 bg-white">
                <div className="mb-3 pb-3 border-b border-gray-200">
                  <h4 className="font-semibold text-gray-900">Replacement Order: {manualShipmentForm.orderId}</h4>
                  <p className="text-sm text-gray-600 mt-1">Employee: {manualShipmentForm.employeeName}</p>
                  <p className="text-sm text-gray-600">Email: {manualShipmentForm.employeeEmail}</p>
                </div>
                <div className="mt-2 text-sm text-gray-700">
                  <p className="font-medium mb-1">Delivery Address:</p>
                  {!manualShipmentForm.hasValidAddress || !manualShipmentForm.deliveryAddress ? (
                    <div className="text-red-600 bg-red-50 border border-red-200 rounded p-2">
                      <p className="font-semibold">⚠️ Delivery address not available</p>
                      <p className="text-xs mt-1">Employee address is missing or incomplete. Cannot create shipment.</p>
                    </div>
                  ) : (
                    <div className="text-gray-600 space-y-0.5">
                      <div>{manualShipmentForm.deliveryAddress.line1}</div>
                      {manualShipmentForm.deliveryAddress.line2 && <div>{manualShipmentForm.deliveryAddress.line2}</div>}
                      {manualShipmentForm.deliveryAddress.line3 && <div>{manualShipmentForm.deliveryAddress.line3}</div>}
                      <div>{manualShipmentForm.deliveryAddress.city}, {manualShipmentForm.deliveryAddress.state} - {manualShipmentForm.deliveryAddress.pincode}</div>
                      <div>{manualShipmentForm.deliveryAddress.country}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Shipment Details */}
              {manualShipmentForm.hasValidAddress && manualShipmentForm.deliveryAddress ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mode of Transport *</label>
                      <select
                        value={manualShipmentForm.modeOfTransport}
                        onChange={(e) => {
                          setManualShipmentForm(prev => ({
                            ...prev,
                            modeOfTransport: e.target.value as 'COURIER' | 'DIRECT' | 'HAND_DELIVERY',
                            courierServiceProvider: e.target.value !== 'COURIER' ? '' : prev.courierServiceProvider
                          }))
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="COURIER">Courier</option>
                        <option value="DIRECT">Direct</option>
                        <option value="HAND_DELIVERY">Hand Delivery</option>
                      </select>
                    </div>

                    {manualShipmentForm.modeOfTransport === 'COURIER' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Courier Service Provider *</label>
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
                            value={manualShipmentForm.courierServiceProvider}
                            onChange={(e) => setManualShipmentForm(prev => ({ ...prev, courierServiceProvider: e.target.value }))}
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

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Dispatched Date *</label>
                      <input
                        type="date"
                        value={manualShipmentForm.dispatchedDate}
                        onChange={(e) => setManualShipmentForm(prev => ({ ...prev, dispatchedDate: e.target.value }))}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Shipment Number</label>
                      <input
                        type="text"
                        value={manualShipmentForm.shipmentNumber}
                        onChange={(e) => setManualShipmentForm(prev => ({ ...prev, shipmentNumber: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !submittingManualShipment && manualShipmentForm.hasValidAddress) {
                            e.preventDefault()
                            handleSubmitManualShipment()
                          }
                        }}
                        placeholder="AWB / Docket Number"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">AWB / Docket Number</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700 font-semibold">⚠️ Shipment cannot be created</p>
                  <p className="text-xs text-red-600 mt-1">Employee delivery address is missing or incomplete.</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-3 pt-4 border-t mt-6">
                <button
                  onClick={() => {
                    setManualShipmentForm({
                      show: false,
                      orderId: null,
                      employeeName: '',
                      employeeEmail: '',
                      deliveryAddress: null,
                      hasValidAddress: false,
                      modeOfTransport: 'COURIER',
                      courierServiceProvider: '',
                      dispatchedDate: new Date().toISOString().split('T')[0],
                      shipmentNumber: '',
                      warehouse: null,
                    })
                  }}
                  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                  disabled={submittingManualShipment}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitManualShipment}
                  disabled={submittingManualShipment || !manualShipmentForm.hasValidAddress}
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
                Are you sure you want to mark this replacement order as delivered?
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
