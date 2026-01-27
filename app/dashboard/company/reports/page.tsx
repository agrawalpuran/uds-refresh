'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { 
  BarChart3, Download, Calendar, DollarSign, Users, Package, IndianRupee, 
  TrendingUp, TrendingDown, Clock, Repeat, Building2, UserCheck, AlertTriangle,
  ChevronDown, ChevronUp, Filter, Search, Lightbulb, Zap, Target, ArrowRight,
  CheckCircle2, XCircle, Truck, Timer, Activity, Award, ShieldCheck, ArrowDown
} from 'lucide-react'
import { getOrdersByCompany, getEmployeesByCompany, getCompanyById, getVendorsByCompany, getBranchesByCompany } from '@/lib/data-mongodb'
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts'
import Link from 'next/link'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================
interface OrderData {
  id: string
  employeeId: string
  employeeName: string
  employeeIdNum?: string
  items: Array<{ price: number; quantity: number; uniformName?: string }>
  total: number
  status: string
  orderDate: Date | string
  dispatchLocation?: string
  companyId: string
  vendorId?: string
  vendorName?: string
  dispatchedDate?: Date | string
  deliveredDate?: Date | string
  createdAt?: Date | string
  site_admin_approved_at?: Date | string
  company_admin_approved_at?: Date | string
  locationId?: string
}

interface VendorData {
  id: string
  name: string
}

interface BranchData {
  id: string
  name: string
  city?: string
}

interface KPITile {
  title: string
  value: string | number
  trend: number
  trendLabel: string
  icon: React.ElementType
  color: string
  bgColor: string
}

interface InsightItem {
  type: 'warning' | 'info' | 'success'
  icon: React.ElementType
  title: string
  description: string
  priority: number // 1 = highest priority
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Calculate order total from items if total is missing
const calculateOrderTotal = (order: OrderData): number => {
  if (order.total !== undefined && order.total !== null && typeof order.total === 'number' && !isNaN(order.total)) {
    return order.total
  }
  if (order.items && Array.isArray(order.items) && order.items.length > 0) {
    return order.items.reduce((sum, item) => {
      const price = typeof item.price === 'number' ? item.price : parseFloat(String(item.price)) || 0
      const quantity = typeof item.quantity === 'number' ? item.quantity : parseInt(String(item.quantity)) || 0
      return sum + (price * quantity)
    }, 0)
  }
  return 0
}

// Parse date safely
const parseDate = (date: Date | string | undefined): Date | null => {
  if (!date) return null
  if (date instanceof Date) return date
  const parsed = new Date(date)
  return isNaN(parsed.getTime()) ? null : parsed
}

// Calculate days difference between two dates (returns fractional days for precision)
const daysBetween = (start: Date | null, end: Date | null): number | null => {
  if (!start || !end) return null
  const diff = end.getTime() - start.getTime()
  return diff / (1000 * 60 * 60 * 24) // Return fractional days for better precision
}

// ============================================================================
// ADAPTIVE TIME DISPLAY (Trust Fix)
// - If duration < 60 minutes: Show in minutes (e.g., "35 mins")
// - If duration < 24 hours: Show in hours with 1 decimal (e.g., "4.2 hours")
// - If duration >= 1 day: Show in days with 1 decimal (e.g., "1.3 days")
// - NEVER show "0.0 days" unless truly zero
// ============================================================================
const formatDuration = (days: number): string => {
  if (days === 0) return 'Instant'
  
  const totalMinutes = days * 24 * 60
  const totalHours = days * 24
  
  // Less than 60 minutes
  if (totalMinutes < 60) {
    const mins = Math.round(totalMinutes)
    return mins <= 1 ? '< 1 min' : `${mins} mins`
  }
  
  // Less than 24 hours (show as hours)
  if (totalHours < 24) {
    if (totalHours < 1) {
      return `${Math.round(totalMinutes)} mins`
    }
    return `${totalHours.toFixed(1)} hours`
  }
  
  // 1 day or more
  if (days < 1) {
    return '< 1 day'
  }
  
  return `${days.toFixed(1)} days`
}

// Compact duration format for smaller spaces
const formatDurationCompact = (days: number): string => {
  if (days === 0) return '0'
  
  const totalMinutes = days * 24 * 60
  const totalHours = days * 24
  
  if (totalMinutes < 60) {
    const mins = Math.round(totalMinutes)
    return mins <= 1 ? '<1m' : `${mins}m`
  }
  
  if (totalHours < 24) {
    if (totalHours < 1) {
      return `${Math.round(totalMinutes)}m`
    }
    return `${totalHours.toFixed(1)}h`
  }
  
  if (days < 1) {
    return '<1d'
  }
  
  return `${days.toFixed(1)}d`
}

// Format currency
const formatCurrency = (value: number): string => {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)}L`
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`
  return `₹${value.toFixed(0)}`
}

// Get trend arrow and color
const getTrendInfo = (trend: number) => ({
  icon: trend >= 0 ? TrendingUp : TrendingDown,
  color: trend >= 0 ? 'text-emerald-600' : 'text-red-500',
  bgColor: trend >= 0 ? 'bg-emerald-50' : 'bg-red-50'
})

// ============================================================================
// VENDOR DONUT CHART COLORS (Stable per vendorId)
// Enterprise-safe palette: blue, purple, teal, orange, slate, green
// ============================================================================
const VENDOR_COLORS = [
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#64748b', // Slate
  '#22c55e', // Green
  '#ec4899', // Pink
  '#6366f1', // Indigo
]

// Generate stable color index from vendorId (hash-based)
const getVendorColorIndex = (vendorId: string): number => {
  let hash = 0
  for (let i = 0; i < vendorId.length; i++) {
    const char = vendorId.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash) % VENDOR_COLORS.length
}

const WARNING_COLOR = '#f59e0b' // Amber for vendors with >40% share

// ============================================================================
// TRAPEZOID FUNNEL COMPONENT (Sales Funnel Style)
// ============================================================================
interface FunnelStageProps {
  stage: string
  value: number
  conversionToNext: number
  nextStage: string | null
  color: string
  widthPercent: number // Visual width (100% at top, decreasing)
  isLast: boolean
}

const FunnelStage = ({ stage, value, conversionToNext, nextStage, color, widthPercent, isLast }: FunnelStageProps) => {
  // Calculate trapezoid clip-path
  // Top edge is wider than bottom edge
  const topInset = (100 - widthPercent) / 2
  const bottomWidthPercent = isLast ? widthPercent : widthPercent - 15 // Each level is 15% narrower
  const bottomInset = (100 - bottomWidthPercent) / 2
  
  const clipPath = `polygon(${topInset}% 0%, ${100 - topInset}% 0%, ${100 - bottomInset}% 100%, ${bottomInset}% 100%)`
  
  return (
    <div className="flex flex-col items-center">
      {/* Trapezoid Stage */}
      <div 
        className="relative transition-all duration-500 hover:scale-[1.02]"
        style={{
          width: '100%',
          height: '52px',
          clipPath,
          backgroundColor: color,
        }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
          <span className="text-xs font-semibold tracking-wide">{stage}</span>
          <span className="text-sm font-bold">{value} orders</span>
        </div>
      </div>
      
      {/* Connector to next stage */}
      {!isLast && nextStage && (
        <div className="flex flex-col items-center py-1">
          <div className="flex items-center gap-1 text-[10px]">
            <ArrowDown className="h-3 w-3 text-gray-400" />
            <span className={`font-semibold ${conversionToNext >= 95 ? 'text-emerald-600' : conversionToNext >= 70 ? 'text-amber-600' : 'text-red-500'}`}>
              {conversionToNext.toFixed(0)}% progressed
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function ReportsPage() {
  // State Management
  const [period, setPeriod] = useState<'weekly' | 'monthly' | 'quarterly'>('monthly')
  const [spendChartPeriod, setSpendChartPeriod] = useState<'weekly' | 'monthly'>('monthly')
  const [branchMetricType, setBranchMetricType] = useState<'total' | 'perEmployee'>('total')
  const [companyId, setCompanyId] = useState<string>('')
  const [companyOrders, setCompanyOrders] = useState<OrderData[]>([])
  const [companyEmployees, setCompanyEmployees] = useState<any[]>([])
  const [companyVendors, setCompanyVendors] = useState<VendorData[]>([])
  const [companyBranches, setCompanyBranches] = useState<BranchData[]>([])
  const [loading, setLoading] = useState(true)
  const [companyPrimaryColor, setCompanyPrimaryColor] = useState<string>('#032D42')
  const [companySecondaryColor, setCompanySecondaryColor] = useState<string>('#032D42')
  
  // Table state
  const [tableExpanded, setTableExpanded] = useState(false)
  const [tableFilter, setTableFilter] = useState({
    vendor: '',
    branch: '',
    status: '',
    search: ''
  })

  // ============================================================================
  // DATA LOADING
  // ============================================================================
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        try {
          setLoading(true)
          // SECURITY FIX: Use sessionStorage only
          const { getCompanyId } = await import('@/lib/utils/auth-storage')
          const storedCompanyId = getCompanyId()
          if (storedCompanyId) {
            setCompanyId(storedCompanyId)
            
            // Parallel data fetching for performance
            const [orders, employees, companyDetails] = await Promise.all([
              getOrdersByCompany(storedCompanyId),
              getEmployeesByCompany(storedCompanyId),
              getCompanyById(storedCompanyId)
            ])
            
            setCompanyOrders(orders || [])
            setCompanyEmployees(employees || [])
            
            if (companyDetails) {
              setCompanyPrimaryColor(companyDetails.primaryColor || '#032D42')
              setCompanySecondaryColor(companyDetails.secondaryColor || companyDetails.primaryColor || '#032D42')
            }
            
            // Fetch vendors and branches (may not exist, so handle gracefully)
            try {
              const vendors = await getVendorsByCompany(storedCompanyId)
              setCompanyVendors(vendors || [])
            } catch {
              // Extract vendors from orders
              const vendorMap = new Map<string, VendorData>()
              orders?.forEach((order: OrderData) => {
                if (order.vendorId && order.vendorName) {
                  vendorMap.set(order.vendorId, { id: order.vendorId, name: order.vendorName })
                }
              })
              setCompanyVendors(Array.from(vendorMap.values()))
            }
            
            try {
              const branches = await getBranchesByCompany(storedCompanyId)
              setCompanyBranches(branches || [])
            } catch {
              // Extract locations from orders
              const locationSet = new Set<string>()
              orders?.forEach((order: OrderData) => {
                if (order.dispatchLocation) locationSet.add(order.dispatchLocation)
              })
              setCompanyBranches(Array.from(locationSet).map((loc, idx) => ({ id: String(idx), name: loc })))
            }
          }
        } catch (error) {
          console.error('Error loading reports data:', error)
        } finally {
          setLoading(false)
        }
      }
      
      loadData()
    }
  }, [])

  // ============================================================================
  // SECTION 1: EXECUTIVE SNAPSHOT KPIs
  // ============================================================================
  const executiveKPIs = useMemo(() => {
    if (companyOrders.length === 0) {
      return {
        totalSpend: { current: 0, previous: 0, trend: 0 },
        totalOrders: { current: 0, previous: 0, trend: 0 },
        avgOrderValue: { current: 0, previous: 0, trend: 0 },
        avgDeliveryTime: { current: 0, previous: 0, trend: 0 },
        repeatOrderPct: { current: 0, previous: 0, trend: 0 }
      }
    }

    const now = new Date()
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

    // Filter orders by period
    const currentOrders = companyOrders.filter(o => {
      const date = parseDate(o.orderDate)
      return date && date >= currentMonthStart
    })
    const previousOrders = companyOrders.filter(o => {
      const date = parseDate(o.orderDate)
      return date && date >= previousMonthStart && date <= previousMonthEnd
    })

    // Total Spend
    const currentSpend = currentOrders.reduce((sum, o) => sum + calculateOrderTotal(o), 0)
    const previousSpend = previousOrders.reduce((sum, o) => sum + calculateOrderTotal(o), 0)
    const spendTrend = previousSpend > 0 ? ((currentSpend - previousSpend) / previousSpend) * 100 : 0

    // Total Orders
    const currentOrderCount = currentOrders.length
    const previousOrderCount = previousOrders.length
    const orderTrend = previousOrderCount > 0 ? ((currentOrderCount - previousOrderCount) / previousOrderCount) * 100 : 0

    // Average Order Value
    const currentAOV = currentOrderCount > 0 ? currentSpend / currentOrderCount : 0
    const previousAOV = previousOrderCount > 0 ? previousSpend / previousOrderCount : 0
    const aovTrend = previousAOV > 0 ? ((currentAOV - previousAOV) / previousAOV) * 100 : 0

    // Average Delivery Time (created → delivered)
    const deliveredOrders = companyOrders.filter(o => o.status === 'Delivered' && o.deliveredDate && o.orderDate)
    const currentDeliveredOrders = deliveredOrders.filter(o => {
      const date = parseDate(o.orderDate)
      return date && date >= currentMonthStart
    })
    const previousDeliveredOrders = deliveredOrders.filter(o => {
      const date = parseDate(o.orderDate)
      return date && date >= previousMonthStart && date <= previousMonthEnd
    })

    const calcAvgDeliveryTime = (orders: OrderData[]) => {
      if (orders.length === 0) return 0
      const totalDays = orders.reduce((sum, o) => {
        const created = parseDate(o.orderDate)
        const delivered = parseDate(o.deliveredDate)
        const days = daysBetween(created, delivered)
        return sum + (days || 0)
      }, 0)
      return totalDays / orders.length
    }

    const currentAvgDelivery = calcAvgDeliveryTime(currentDeliveredOrders)
    const previousAvgDelivery = calcAvgDeliveryTime(previousDeliveredOrders)
    // For delivery time, negative trend is better (faster delivery)
    const deliveryTrend = previousAvgDelivery > 0 
      ? ((previousAvgDelivery - currentAvgDelivery) / previousAvgDelivery) * 100 
      : 0

    // Repeat Order Percentage
    const employeeOrderCounts = new Map<string, number>()
    companyOrders.forEach(o => {
      const count = employeeOrderCounts.get(o.employeeId) || 0
      employeeOrderCounts.set(o.employeeId, count + 1)
    })
    const repeatCustomers = Array.from(employeeOrderCounts.values()).filter(count => count > 1).length
    const totalCustomers = employeeOrderCounts.size
    const repeatPct = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0

    // Previous period repeat calculation
    const prevEmployeeOrderCounts = new Map<string, number>()
    previousOrders.forEach(o => {
      const count = prevEmployeeOrderCounts.get(o.employeeId) || 0
      prevEmployeeOrderCounts.set(o.employeeId, count + 1)
    })
    const prevRepeatCustomers = Array.from(prevEmployeeOrderCounts.values()).filter(count => count > 1).length
    const prevTotalCustomers = prevEmployeeOrderCounts.size
    const prevRepeatPct = prevTotalCustomers > 0 ? (prevRepeatCustomers / prevTotalCustomers) * 100 : 0
    const repeatTrend = prevRepeatPct > 0 ? ((repeatPct - prevRepeatPct) / prevRepeatPct) * 100 : 0

    return {
      totalSpend: { current: currentSpend, previous: previousSpend, trend: spendTrend },
      totalOrders: { current: currentOrderCount, previous: previousOrderCount, trend: orderTrend },
      avgOrderValue: { current: currentAOV, previous: previousAOV, trend: aovTrend },
      avgDeliveryTime: { current: currentAvgDelivery || calcAvgDeliveryTime(deliveredOrders), previous: previousAvgDelivery, trend: deliveryTrend },
      repeatOrderPct: { current: repeatPct, previous: prevRepeatPct, trend: repeatTrend }
    }
  }, [companyOrders])

  // ============================================================================
  // SECTION 2: SPEND & VENDOR INTELLIGENCE
  // ============================================================================
  
  // Spend Trend Chart Data WITH PREVIOUS PERIOD COMPARISON
  const spendTrendData = useMemo(() => {
    if (companyOrders.length === 0) return []

    const now = new Date()
    const data: { period: string; spend: number; previousSpend: number; orders: number; changePct: number }[] = []

    if (spendChartPeriod === 'monthly') {
      // Last 6 months with previous year comparison
      for (let i = 5; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
        
        // Previous year same month
        const prevMonthStart = new Date(now.getFullYear() - 1, now.getMonth() - i, 1)
        const prevMonthEnd = new Date(now.getFullYear() - 1, now.getMonth() - i + 1, 0)
        
        const monthOrders = companyOrders.filter(o => {
          const date = parseDate(o.orderDate)
          return date && date >= monthStart && date <= monthEnd
        })
        
        const prevMonthOrders = companyOrders.filter(o => {
          const date = parseDate(o.orderDate)
          return date && date >= prevMonthStart && date <= prevMonthEnd
        })
        
        const currentSpend = monthOrders.reduce((sum, o) => sum + calculateOrderTotal(o), 0)
        const previousSpend = prevMonthOrders.reduce((sum, o) => sum + calculateOrderTotal(o), 0)
        const changePct = previousSpend > 0 ? ((currentSpend - previousSpend) / previousSpend) * 100 : 0
        
        data.push({
          period: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          spend: currentSpend,
          previousSpend: previousSpend,
          orders: monthOrders.length,
          changePct
        })
      }
      } else {
      // Last 8 weeks with previous 8 weeks comparison
      for (let i = 7; i >= 0; i--) {
        const weekStart = new Date(now)
        weekStart.setDate(now.getDate() - (i * 7) - now.getDay())
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekStart.getDate() + 6)
        
        // Previous period (8 weeks ago)
        const prevWeekStart = new Date(weekStart)
        prevWeekStart.setDate(prevWeekStart.getDate() - 56) // 8 weeks back
        const prevWeekEnd = new Date(prevWeekStart)
        prevWeekEnd.setDate(prevWeekStart.getDate() + 6)
        
        const weekOrders = companyOrders.filter(o => {
          const date = parseDate(o.orderDate)
          return date && date >= weekStart && date <= weekEnd
        })
        
        const prevWeekOrders = companyOrders.filter(o => {
          const date = parseDate(o.orderDate)
          return date && date >= prevWeekStart && date <= prevWeekEnd
        })
        
        const currentSpend = weekOrders.reduce((sum, o) => sum + calculateOrderTotal(o), 0)
        const previousSpend = prevWeekOrders.reduce((sum, o) => sum + calculateOrderTotal(o), 0)
        const changePct = previousSpend > 0 ? ((currentSpend - previousSpend) / previousSpend) * 100 : 0
        
        data.push({
          period: `W${8 - i}`,
          spend: currentSpend,
          previousSpend: previousSpend,
          orders: weekOrders.length,
          changePct
        })
      }
    }

    return data
  }, [companyOrders, spendChartPeriod])

  // Vendor Spend Share Data for DONUT CHART (with stable colors)
  const vendorSpendDonutData = useMemo(() => {
    if (companyOrders.length === 0) return { data: [], totalSpend: 0 }

    const vendorSpend = new Map<string, { name: string; spend: number; orders: number }>()
    
    companyOrders.forEach(order => {
      const vendorId = order.vendorId || 'unknown'
      const vendorName = order.vendorName || 'Unknown Vendor'
      const existing = vendorSpend.get(vendorId) || { name: vendorName, spend: 0, orders: 0 }
      existing.spend += calculateOrderTotal(order)
      existing.orders += 1
      vendorSpend.set(vendorId, existing)
    })

    const totalSpend = Array.from(vendorSpend.values()).reduce((sum, v) => sum + v.spend, 0)
    
    const data = Array.from(vendorSpend.entries())
      .map(([id, d]) => ({ 
        id, 
        name: d.name, 
        value: d.spend, 
        orders: d.orders,
        percentage: totalSpend > 0 ? (d.spend / totalSpend) * 100 : 0,
        isHighShare: totalSpend > 0 && (d.spend / totalSpend) > 0.4, // >40% = warning
        color: VENDOR_COLORS[getVendorColorIndex(id)] // Stable color per vendorId
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6) // Top 6 vendors for donut

    return { data, totalSpend }
  }, [companyOrders])

  // Vendor Delivery Performance with TRUST SIGNALS
  const vendorDeliveryData = useMemo(() => {
    const deliveredOrders = companyOrders.filter(o => 
      o.status === 'Delivered' && o.deliveredDate && o.orderDate
    )
    
    if (deliveredOrders.length === 0) return { vendors: [], companyAvg: 0, totalDeliveries: 0, bestVendor: null, worstVendor: null }

    const vendorDelivery = new Map<string, { name: string; totalDays: number; count: number }>()
    let totalDeliveryDays = 0
    let totalDeliveryCount = 0

    deliveredOrders.forEach(order => {
      const vendorId = order.vendorId || 'unknown'
      const vendorName = order.vendorName || 'Unknown Vendor'
      const created = parseDate(order.orderDate)
      const delivered = parseDate(order.deliveredDate)
      const days = daysBetween(created, delivered)
      
      if (days !== null && days >= 0) {
        const existing = vendorDelivery.get(vendorId) || { name: vendorName, totalDays: 0, count: 0 }
        existing.totalDays += days
        existing.count += 1
        vendorDelivery.set(vendorId, existing)
        totalDeliveryDays += days
        totalDeliveryCount += 1
      }
    })

    const companyAvg = totalDeliveryCount > 0 ? totalDeliveryDays / totalDeliveryCount : 0

    const vendors = Array.from(vendorDelivery.entries())
      .map(([id, data]) => ({
        id,
        name: data.name,
        avgDays: data.count > 0 ? data.totalDays / data.count : 0,
        count: data.count,
        aboveAverage: companyAvg > 0 && (data.totalDays / data.count) > companyAvg
      }))
      .sort((a, b) => a.avgDays - b.avgDays)

    // Best and worst vendors (only those with meaningful data)
    const significantVendors = vendors.filter(v => v.count >= 2)
    const bestVendor = significantVendors.length > 0 ? significantVendors[0] : null
    const worstVendor = significantVendors.length > 1 ? significantVendors[significantVendors.length - 1] : null

    return { vendors, companyAvg, totalDeliveries: totalDeliveryCount, bestVendor, worstVendor }
  }, [companyOrders])

  // ============================================================================
  // ORDER VALUE SEGMENTATION (Donut Chart)
  // ============================================================================
  const orderValueSegmentation = useMemo(() => {
    if (companyOrders.length === 0) return { data: [], totalOrders: 0 }

    const buckets = {
      '₹0-1K': { min: 0, max: 1000, count: 0, color: '#10b981' },
      '₹1K-5K': { min: 1000, max: 5000, count: 0, color: '#6366f1' },
      '₹5K-10K': { min: 5000, max: 10000, count: 0, color: '#8b5cf6' },
      '₹10K+': { min: 10000, max: Infinity, count: 0, color: '#f59e0b' }
    }

    companyOrders.forEach(order => {
      const total = calculateOrderTotal(order)
      if (total < 1000) buckets['₹0-1K'].count++
      else if (total < 5000) buckets['₹1K-5K'].count++
      else if (total < 10000) buckets['₹5K-10K'].count++
      else buckets['₹10K+'].count++
    })

    const totalOrders = companyOrders.length
    const data = Object.entries(buckets).map(([name, bucket]) => ({
      name,
      value: bucket.count,
      percentage: totalOrders > 0 ? (bucket.count / totalOrders) * 100 : 0,
      color: bucket.color
    }))

    return { data, totalOrders }
  }, [companyOrders])

  // ============================================================================
  // TOP PRODUCTS BY CONSUMPTION
  // ============================================================================
  const topProductsConsumptionData = useMemo(() => {
    // Filter orders by selected period
    const now = new Date()
    let periodStart: Date
    let periodEnd: Date = now

    if (period === 'weekly') {
      periodStart = new Date(now)
      periodStart.setDate(now.getDate() - 7)
    } else if (period === 'monthly') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    } else {
      // quarterly
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3
      periodStart = new Date(now.getFullYear(), quarterMonth, 1)
    }

    // Filter orders within the period
    const periodOrders = companyOrders.filter(order => {
      const date = parseDate(order.orderDate)
      return date && date >= periodStart && date <= periodEnd
    })

    if (periodOrders.length === 0) {
      return { products: [], totalOrdersInPeriod: 0, totalQuantityInPeriod: 0 }
    }

    // Aggregate by product
    const productMap = new Map<string, {
      productId: string
      productName: string
      totalQuantity: number
      totalSpend: number
      orderCount: number
      ordersContaining: Set<string>
    }>()

    periodOrders.forEach(order => {
      if (!order.items || !Array.isArray(order.items)) return

      order.items.forEach(item => {
        // Use productId as key, fallback to uniformName if not available
        const productKey = item.productId || item.uniformName || 'Unknown Product'
        const productName = item.uniformName || item.productId || 'Unknown Product'
        
        const existing = productMap.get(productKey) || {
          productId: productKey,
          productName: productName,
          totalQuantity: 0,
          totalSpend: 0,
          orderCount: 0,
          ordersContaining: new Set<string>()
        }

        const quantity = typeof item.quantity === 'number' ? item.quantity : parseInt(String(item.quantity)) || 0
        const price = typeof item.price === 'number' ? item.price : parseFloat(String(item.price)) || 0

        existing.totalQuantity += quantity
        existing.totalSpend += price * quantity
        existing.ordersContaining.add(order.id)
        
        productMap.set(productKey, existing)
      })
    })

    // Convert to array and calculate order count
    const products = Array.from(productMap.values())
      .map(p => ({
        productId: p.productId,
        productName: p.productName,
        totalQuantity: p.totalQuantity,
        totalSpend: p.totalSpend,
        orderCount: p.ordersContaining.size,
        avgPricePerUnit: p.totalQuantity > 0 ? p.totalSpend / p.totalQuantity : 0
      }))
      // Sort by quantity (descending), then by spend (descending) for ties
      .sort((a, b) => {
        if (b.totalQuantity !== a.totalQuantity) {
          return b.totalQuantity - a.totalQuantity
        }
        return b.totalSpend - a.totalSpend
      })
      .slice(0, 5) // Top 5 products

    // Calculate totals for percentage calculations
    const totalQuantityInPeriod = products.reduce((sum, p) => sum + p.totalQuantity, 0)
    const maxQuantity = products.length > 0 ? products[0].totalQuantity : 0

    // Add percentage of max for bar width calculations
    const productsWithPercentage = products.map((p, index) => ({
      ...p,
      percentOfMax: maxQuantity > 0 ? (p.totalQuantity / maxQuantity) * 100 : 0,
      percentOfTotalOrders: periodOrders.length > 0 ? (p.orderCount / periodOrders.length) * 100 : 0,
      rank: index + 1
    }))

    const totalSpendInPeriod = products.reduce((sum, p) => sum + p.totalSpend, 0)

    return {
      products: productsWithPercentage,
      totalOrdersInPeriod: periodOrders.length,
      totalQuantityInPeriod,
      totalSpendInPeriod
    }
  }, [companyOrders, period])

  // ============================================================================
  // SECTION 3: OPERATIONAL HEALTH
  // ============================================================================

  // Order Funnel Data WITH CONVERSION PERCENTAGES
  const orderFunnelData = useMemo(() => {
    const statusCounts = {
      created: companyOrders.length,
      approved: companyOrders.filter(o => 
        ['Awaiting fulfilment', 'Dispatched', 'Delivered'].includes(o.status)
      ).length,
      dispatched: companyOrders.filter(o => 
        ['Dispatched', 'Delivered'].includes(o.status)
      ).length,
      delivered: companyOrders.filter(o => o.status === 'Delivered').length
    }

    // Calculate conversion rates between stages
    const approvalConversion = statusCounts.created > 0 
      ? (statusCounts.approved / statusCounts.created) * 100 : 100
    const dispatchConversion = statusCounts.approved > 0 
      ? (statusCounts.dispatched / statusCounts.approved) * 100 : 100
    const deliveryConversion = statusCounts.dispatched > 0 
      ? (statusCounts.delivered / statusCounts.dispatched) * 100 : 100

    // Check if all conversions are 100% (no leakage)
    const noLeakage = approvalConversion >= 99.9 && dispatchConversion >= 99.9 && deliveryConversion >= 99.9

    const funnelData = [
      { 
        stage: 'Created', 
        value: statusCounts.created, 
        fill: '#6366f1',
        conversionToNext: approvalConversion,
        nextStage: 'Approved',
        widthPercent: 100
      },
      { 
        stage: 'Approved', 
        value: statusCounts.approved, 
        fill: '#8b5cf6',
        conversionToNext: dispatchConversion,
        nextStage: 'Dispatched',
        widthPercent: 85
      },
      { 
        stage: 'Dispatched', 
        value: statusCounts.dispatched, 
        fill: '#a855f7',
        conversionToNext: deliveryConversion,
        nextStage: 'Delivered',
        widthPercent: 70
      },
      { 
        stage: 'Delivered', 
        value: statusCounts.delivered, 
        fill: '#10b981', // Success green
        conversionToNext: 100,
        nextStage: null,
        widthPercent: 55
      }
    ]

    return { stages: funnelData, noLeakage }
  }, [companyOrders])

  // Cycle Time Breakdown (with fractional days for precision)
  const cycleTimeData = useMemo(() => {
    const ordersWithTimes = companyOrders.filter(o => o.status === 'Delivered')

    if (ordersWithTimes.length === 0) {
      return {
        approvalTime: 0,
        fulfilmentTime: 0,
        totalCycleTime: 0,
        sampleSize: 0
      }
    }

    let totalApprovalTime = 0
    let totalFulfilmentTime = 0
    let totalCycleTime = 0
    let completeOrderCount = 0

    ordersWithTimes.forEach(order => {
      const created = parseDate(order.orderDate || order.createdAt)
      const approved = parseDate(order.site_admin_approved_at || order.company_admin_approved_at)
      const dispatched = parseDate(order.dispatchedDate)
      const delivered = parseDate(order.deliveredDate)

      // Only include orders that have ALL dates for consistent comparison
      if (created && approved && dispatched && delivered) {
        const approvalDays = daysBetween(created, approved)
        const fulfilmentDays = daysBetween(dispatched, delivered)
        const cycleDays = daysBetween(created, delivered)

        // Use absolute values to handle any date ordering issues in the data
        // This ensures we always get positive durations
        if (approvalDays !== null && fulfilmentDays !== null && cycleDays !== null) {
          totalApprovalTime += Math.abs(approvalDays)
          totalFulfilmentTime += Math.abs(fulfilmentDays)
          totalCycleTime += Math.abs(cycleDays)
          completeOrderCount++
        }
      }
    })

    const result = {
      approvalTime: completeOrderCount > 0 ? totalApprovalTime / completeOrderCount : 0,
      fulfilmentTime: completeOrderCount > 0 ? totalFulfilmentTime / completeOrderCount : 0,
      totalCycleTime: completeOrderCount > 0 ? totalCycleTime / completeOrderCount : 0,
      sampleSize: completeOrderCount
    }

    // Debug: Log cycle time calculations
    console.log('Cycle Time Debug:', {
      totalDeliveredOrders: ordersWithTimes.length,
      validOrdersUsed: completeOrderCount,
      avgApprovalDays: result.approvalTime,
      avgFulfilmentDays: result.fulfilmentTime,
      avgTotalCycleDays: result.totalCycleTime,
      // Sanity check: totalCycle should be >= approval + fulfilment (approximately)
      sanityCheck: result.totalCycleTime >= result.approvalTime ? '✓ OK' : '✗ Data issue detected'
    })

    return result
  }, [companyOrders])

  // ============================================================================
  // SECTION 4: PEOPLE & BRANCH INSIGHTS
  // ============================================================================

  // Branch Spend Comparison with CONDITIONAL RENDERING
  const branchSpendData = useMemo(() => {
    const branchSpend = new Map<string, { name: string; spend: number; orders: number; employees: Set<string> }>()
    
    companyOrders.forEach(order => {
      const location = order.dispatchLocation || order.locationId || 'Unknown'
      const existing = branchSpend.get(location) || { name: location, spend: 0, orders: 0, employees: new Set<string>() }
      existing.spend += calculateOrderTotal(order)
      existing.orders += 1
      existing.employees.add(order.employeeId)
      branchSpend.set(location, existing)
    })

    const totalCompanySpend = companyOrders.reduce((sum, o) => sum + calculateOrderTotal(o), 0)

    return Array.from(branchSpend.entries())
      .map(([id, data]) => ({
        id,
        name: data.name.length > 20 ? data.name.substring(0, 20) + '...' : data.name,
        fullName: data.name,
        spend: data.spend,
        orders: data.orders,
        employeeCount: data.employees.size,
        spendPerEmployee: data.employees.size > 0 ? data.spend / data.employees.size : 0,
        percentOfTotal: totalCompanySpend > 0 ? (data.spend / totalCompanySpend) * 100 : 0
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 8)
  }, [companyOrders])

  // Employee Consumption (Outliers)
  const employeeOutliers = useMemo(() => {
    // Aggregate by employee NAME to avoid duplicates when same employee has different IDs
    const employeeSpend = new Map<string, { name: string; spend: number; orders: number; ids: Set<string> }>()
    
    companyOrders.forEach(order => {
      const employeeName = (order.employeeName || 'Unknown').trim()
      const existing = employeeSpend.get(employeeName) || { name: employeeName, spend: 0, orders: 0, ids: new Set<string>() }
      existing.spend += calculateOrderTotal(order)
      existing.orders += 1
      if (order.employeeId) existing.ids.add(String(order.employeeId))
      if (order.employeeIdNum) existing.ids.add(String(order.employeeIdNum))
      employeeSpend.set(employeeName, existing)
    })

    const allEmployees = Array.from(employeeSpend.entries())
      .map(([name, data]) => ({ id: name, name: data.name, spend: data.spend, orders: data.orders }))
      .sort((a, b) => b.spend - a.spend)

    // Top 5 spenders (regardless of percentage)
    const topSpenders = allEmployees.slice(0, 5)

    // Find inactive employees
    // BUGFIX: Build a comprehensive Set of ALL employee identifiers from orders
    // Orders may store employeeId OR employeeIdNum, and these may match Employee.id OR Employee.employeeId
    const employeesWithOrders = new Set<string>()
    companyOrders.forEach(o => {
      if (o.employeeId) employeesWithOrders.add(String(o.employeeId))
      if (o.employeeIdNum) employeesWithOrders.add(String(o.employeeIdNum))
    })
    
    const activeEmployees = companyEmployees.filter(e => e.status === 'active')
    const inactiveSpenders = activeEmployees
      .filter(e => {
        // Check if ANY of the employee's identifiers appear in the orders Set
        const hasOrders = 
          (e.id && employeesWithOrders.has(String(e.id))) ||
          (e.employeeId && employeesWithOrders.has(String(e.employeeId)))
        return !hasOrders
      })
      .slice(0, 5)
      .map(e => ({
        id: e.id,
        name: e.name || `${e.firstName || ''} ${e.lastName || ''}`.trim() || 'Unknown',
        spend: 0,
        orders: 0
      }))

    return { topSpenders, inactiveSpenders }
  }, [companyOrders, companyEmployees])

  // ============================================================================
  // SECTION 5: SMART INSIGHTS (MAX 3, PRIORITIZED)
  // ============================================================================
  const smartInsights = useMemo((): InsightItem[] => {
    const insights: InsightItem[] = []

    // Priority 1: Vendor Dependency (>40% spend concentration)
    if (vendorSpendDonutData.data.length > 0) {
      const dominantVendor = vendorSpendDonutData.data.find(v => v.isHighShare)
      if (dominantVendor) {
        insights.push({
          type: 'warning',
          icon: Target,
          title: 'Vendor Concentration Risk',
          description: `${dominantVendor.name} accounts for ${dominantVendor.percentage.toFixed(0)}% of total spend. Consider diversifying suppliers.`,
          priority: 1
        })
      }
    }

    // Priority 2: Spend Concentration
    if (vendorSpendDonutData.data.length > 0 && !insights.some(i => i.title.includes('Concentration'))) {
      const topVendor = vendorSpendDonutData.data[0]
      if (topVendor && topVendor.percentage > 30 && topVendor.percentage <= 40) {
        insights.push({
          type: 'info',
          icon: Building2,
          title: `${topVendor.name} leads spend`,
          description: `${topVendor.percentage.toFixed(0)}% of orders (${formatCurrency(topVendor.value)}) from primary vendor.`,
          priority: 2
        })
      }
    }

    // Priority 3: Operational Efficiency - Funnel leakage
    const approvalRate = orderFunnelData.stages[0]?.value > 0 
      ? (orderFunnelData.stages[1]?.value / orderFunnelData.stages[0]?.value) * 100 : 100
    if (approvalRate < 80) {
      insights.push({
        type: 'warning',
        icon: XCircle,
        title: 'Approval Bottleneck',
        description: `${(100 - approvalRate).toFixed(0)}% of orders pending approval. Review workflow efficiency.`,
        priority: 3
      })
    }

    // Priority 4: Delivery Performance
    if (insights.length < 3 && vendorDeliveryData.worstVendor && vendorDeliveryData.companyAvg > 0) {
      const variance = ((vendorDeliveryData.worstVendor.avgDays - vendorDeliveryData.companyAvg) / vendorDeliveryData.companyAvg) * 100
      if (variance > 30) {
        insights.push({
          type: 'warning',
          icon: Clock,
          title: `${vendorDeliveryData.worstVendor.name} delivery lag`,
          description: `${formatDuration(vendorDeliveryData.worstVendor.avgDays)} avg vs company ${formatDuration(vendorDeliveryData.companyAvg)}.`,
          priority: 4
        })
      }
    }

    // Priority 5: Fast delivery
    if (insights.length < 3 && vendorDeliveryData.bestVendor && vendorDeliveryData.companyAvg > 0) {
      if (vendorDeliveryData.bestVendor.avgDays < vendorDeliveryData.companyAvg * 0.7) {
        insights.push({
          type: 'success',
          icon: Zap,
          title: `${vendorDeliveryData.bestVendor.name} excels`,
          description: `Fastest delivery at ${formatDuration(vendorDeliveryData.bestVendor.avgDays)} avg across ${vendorDeliveryData.bestVendor.count} orders.`,
          priority: 5
        })
      }
    }

    return insights.sort((a, b) => a.priority - b.priority).slice(0, 3)
  }, [vendorSpendDonutData, vendorDeliveryData, orderFunnelData])

  // ============================================================================
  // SECTION 6: FILTERED TABLE DATA
  // ============================================================================
  const filteredOrders = useMemo(() => {
    return companyOrders.filter(order => {
      if (tableFilter.vendor && order.vendorId !== tableFilter.vendor && order.vendorName !== tableFilter.vendor) return false
      if (tableFilter.branch && order.dispatchLocation !== tableFilter.branch && order.locationId !== tableFilter.branch) return false
      if (tableFilter.status && order.status !== tableFilter.status) return false
      if (tableFilter.search) {
        const search = tableFilter.search.toLowerCase()
        const matchesId = order.id.toLowerCase().includes(search)
        const matchesEmployee = order.employeeName?.toLowerCase().includes(search)
        return matchesId || matchesEmployee
      }
      return true
    })
  }, [companyOrders, tableFilter])

  // ============================================================================
  // CUSTOM TOOLTIP FOR SPEND TREND
  // ============================================================================
  const SpendTrendTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const currentSpend = payload.find((p: any) => p.dataKey === 'spend')?.value || 0
      const previousSpend = payload[0]?.payload?.previousSpend || 0
      const changePct = payload[0]?.payload?.changePct || 0
      
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium text-gray-900 mb-2">{label}</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-gray-500">Current:</span>
              <span className="text-sm font-semibold text-gray-900">{formatCurrency(currentSpend)}</span>
            </div>
            {previousSpend > 0 && (
              <>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-gray-500">Previous:</span>
                  <span className="text-sm text-gray-600">{formatCurrency(previousSpend)}</span>
                </div>
                <div className="flex items-center justify-between gap-4 pt-1 border-t border-gray-100">
                  <span className="text-xs text-gray-500">Change:</span>
                  <span className={`text-sm font-medium ${changePct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {changePct >= 0 ? '+' : ''}{changePct.toFixed(0)}%
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )
    }
    return null
  }

  // ============================================================================
  // RENDER
  // ============================================================================
  if (loading) {
  return (
    <DashboardLayout actorType="company">
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading analytics...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="company">
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
            <p className="text-gray-500 text-sm mt-1">Executive dashboard for business intelligence</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white focus:ring-2 focus:ring-offset-0 outline-none transition-all"
              style={{ '--tw-ring-color': `${companyPrimaryColor}40` } as React.CSSProperties}
            >
              <option value="weekly">This Week</option>
              <option value="monthly">This Month</option>
              <option value="quarterly">This Quarter</option>
            </select>
            <button 
              className="text-white px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 shadow-sm hover:shadow-md"
              style={{ backgroundColor: companyPrimaryColor }}
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* SECTION 1: EXECUTIVE SNAPSHOT */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            {
              title: 'Total Spend',
              value: formatCurrency(companyOrders.reduce((sum, o) => sum + calculateOrderTotal(o), 0)),
              trend: executiveKPIs.totalSpend.trend,
              trendLabel: 'vs last month',
              icon: IndianRupee,
              color: companyPrimaryColor,
              bgColor: `${companyPrimaryColor}15`
            },
            {
              title: 'Total Orders',
              value: companyOrders.length.toLocaleString(),
              trend: executiveKPIs.totalOrders.trend,
              trendLabel: 'vs last month',
              icon: Package,
              color: '#6366f1',
              bgColor: '#6366f115'
            },
            {
              title: 'Avg Order Value',
              value: formatCurrency(companyOrders.length > 0 ? companyOrders.reduce((sum, o) => sum + calculateOrderTotal(o), 0) / companyOrders.length : 0),
              trend: executiveKPIs.avgOrderValue.trend,
              trendLabel: 'vs last month',
              icon: BarChart3,
              color: '#8b5cf6',
              bgColor: '#8b5cf615'
            },
            {
              title: 'Avg Delivery Time',
              value: formatDuration(executiveKPIs.avgDeliveryTime.current),
              trend: executiveKPIs.avgDeliveryTime.trend,
              trendLabel: 'improvement',
              icon: Clock,
              color: '#10b981',
              bgColor: '#10b98115'
            },
            {
              title: 'Repeat Order %',
              value: `${executiveKPIs.repeatOrderPct.current.toFixed(0)}%`,
              trend: executiveKPIs.repeatOrderPct.trend,
              trendLabel: 'vs last month',
              icon: Repeat,
              color: '#f59e0b',
              bgColor: '#f59e0b15'
            }
          ].map((kpi, idx) => {
            const TrendIcon = getTrendInfo(kpi.trend).icon
            const trendColor = getTrendInfo(kpi.trend).color
            const trendBg = getTrendInfo(kpi.trend).bgColor
            const KPIIcon = kpi.icon

            return (
              <div key={idx} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div 
                    className="p-2.5 rounded-lg"
                    style={{ backgroundColor: kpi.bgColor }}
                  >
                    <KPIIcon className="h-5 w-5" style={{ color: kpi.color }} />
                  </div>
                  {kpi.trend !== 0 && (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${trendBg} ${trendColor}`}>
                      <TrendIcon className="h-3 w-3" />
                      <span>{Math.abs(kpi.trend).toFixed(0)}%</span>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{kpi.title}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{kpi.trendLabel}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* ============================================================ */}
        {/* WIDGETS GRID - ROW 1: Spend Trend + Side Widgets */}
        {/* ============================================================ */}
        <div className="grid grid-cols-12 gap-6">
          {/* Spend Trend Chart - Main */}
          <div className="col-span-12 lg:col-span-8 bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Spend Trend</h2>
                <p className="text-xs text-gray-500 mt-0.5">Solid: current • Dotted: previous period</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSpendChartPeriod('weekly')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    spendChartPeriod === 'weekly' ? 'text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                  }`}
                  style={spendChartPeriod === 'weekly' ? { backgroundColor: companyPrimaryColor } : {}}
                >
                  Weekly
                </button>
                <button
                  onClick={() => setSpendChartPeriod('monthly')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    spendChartPeriod === 'monthly' ? 'text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                  }`}
                  style={spendChartPeriod === 'monthly' ? { backgroundColor: companyPrimaryColor } : {}}
                >
                  Monthly
                </button>
              </div>
            </div>
            {spendTrendData.length === 0 ? (
              <div className="h-48 flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <BarChart3 className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No spend data available</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={spendTrendData}>
                  <defs>
                    <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={companyPrimaryColor} stopOpacity={0.2}/>
                      <stop offset="95%" stopColor={companyPrimaryColor} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="period" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value) => formatCurrency(value)} />
                  <Tooltip content={<SpendTrendTooltip />} />
                  <Line type="monotone" dataKey="previousSpend" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Previous" />
                  <Area type="monotone" dataKey="spend" stroke={companyPrimaryColor} strokeWidth={2} fill="url(#spendGradient)" name="Current" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Right side widgets */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
            {/* Vendor Spend Share */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Vendor Spend Share</h3>
              {vendorSpendDonutData.data.length === 0 ? (
                <div className="h-24 flex items-center justify-center bg-gray-50 rounded-lg">
                  <p className="text-gray-500 text-sm">No vendor data</p>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={vendorSpendDonutData.data} cx="50%" cy="50%" innerRadius={25} outerRadius={40} paddingAngle={3} dataKey="value">
                          {vendorSpendDonutData.data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number, name: string, props: any) => [`${formatCurrency(value)} (${props.payload.percentage.toFixed(0)}%)`, props.payload.name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-1">
                    {vendorSpendDonutData.data.slice(0, 4).map((vendor, idx) => (
                      <div key={`vendor-${String(vendor.id)}-${idx}`} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: vendor.color }} />
                          <span className="text-xs text-gray-600 truncate max-w-[80px]" title={vendor.name}>{vendor.name}</span>
                        </div>
                        <span className="text-xs font-medium text-gray-900">{vendor.percentage.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Delivery Performance */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Delivery Performance</h3>
              {vendorDeliveryData.totalDeliveries === 0 ? (
                <div className="h-20 flex items-center justify-center bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <ShieldCheck className="h-6 w-6 text-gray-300 mx-auto mb-1" />
                    <p className="text-gray-500 text-xs">No completed deliveries yet</p>
                  </div>
                </div>
              ) : vendorDeliveryData.companyAvg === 0 ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-800">Same-day delivery</span>
                  </div>
                  <p className="text-xs text-emerald-600">Based on {vendorDeliveryData.totalDeliveries} orders</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-2 bg-gray-50 rounded-lg">
                      <p className="text-base font-bold text-gray-900">{formatDurationCompact(vendorDeliveryData.companyAvg)}</p>
                      <p className="text-[10px] text-gray-500">Avg Time</p>
                    </div>
                    {vendorDeliveryData.bestVendor && (
                      <div className="text-center p-2 bg-emerald-50 rounded-lg">
                        <p className="text-base font-bold text-emerald-700">{formatDurationCompact(vendorDeliveryData.bestVendor.avgDays)}</p>
                        <p className="text-[10px] text-emerald-600">Best</p>
                      </div>
                    )}
                    {vendorDeliveryData.worstVendor && vendorDeliveryData.worstVendor.id !== vendorDeliveryData.bestVendor?.id && (
                      <div className="text-center p-2 bg-amber-50 rounded-lg">
                        <p className="text-base font-bold text-amber-700">{formatDurationCompact(vendorDeliveryData.worstVendor.avgDays)}</p>
                        <p className="text-[10px] text-amber-600">Slowest</p>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 text-center">Based on {vendorDeliveryData.totalDeliveries} deliveries</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* WIDGETS GRID - ROW 2: Three columns */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Order Funnel */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Funnel</h2>
            {orderFunnelData.stages[0]?.value === 0 ? (
              <div className="h-48 flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <Activity className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No orders to display</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="w-full max-w-[180px] space-y-0">
                  {orderFunnelData.stages.map((stage, idx) => (
                    <FunnelStage
                      key={stage.stage}
                      stage={stage.stage}
                      value={stage.value}
                      conversionToNext={stage.conversionToNext}
                      nextStage={stage.nextStage}
                      color={stage.fill}
                      widthPercent={stage.widthPercent}
                      isLast={idx === orderFunnelData.stages.length - 1}
                    />
                  ))}
                </div>
                {orderFunnelData.noLeakage && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-xs font-medium text-emerald-700">No leakage</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cycle Time */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Cycle Time</h2>
            {cycleTimeData.sampleSize === 0 ? (
              <div className="h-48 flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <Timer className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No delivered orders yet</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2.5 bg-indigo-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-indigo-600" />
                    <span className="text-xs text-indigo-700">Approval</span>
                  </div>
                  <span className="text-base font-bold text-indigo-700">{formatDuration(cycleTimeData.approvalTime)}</span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-violet-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-violet-600" />
                    <span className="text-xs text-violet-700">Fulfilment</span>
                  </div>
                  <span className="text-base font-bold text-violet-700">{formatDuration(cycleTimeData.fulfilmentTime)}</span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-emerald-50 rounded-lg border-2 border-emerald-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs font-medium text-emerald-700">Total</span>
                  </div>
                  <span className="text-lg font-bold text-emerald-700">{formatDuration(cycleTimeData.totalCycleTime)}</span>
                </div>
                <p className="text-[10px] text-gray-400 text-center">Based on {cycleTimeData.sampleSize} delivered orders</p>
              </div>
            )}
          </div>

          {/* Order Value Distribution */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Order Value Distribution</h2>
            <p className="text-xs text-gray-500 mb-4">Are we placing too many small orders?</p>
            {orderValueSegmentation.totalOrders === 0 ? (
              <div className="h-40 flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <Package className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No orders to analyze</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="w-32 h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={orderValueSegmentation.data} cx="50%" cy="50%" innerRadius={35} outerRadius={50} paddingAngle={3} dataKey="value">
                        {orderValueSegmentation.data.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="white" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number, name: string, props: any) => [`${value} orders (${props.payload.percentage.toFixed(0)}%)`, props.payload.name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
                  {orderValueSegmentation.data.map((bucket) => (
                    <div key={bucket.name} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: bucket.color }} />
                      <span className="text-[10px] text-gray-600">{bucket.name}</span>
                      <span className="text-[10px] font-medium text-gray-900">{bucket.percentage.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* WIDGETS GRID - ROW 3: Two columns */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Top Products */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold text-gray-900">Top Products by Consumption</h2>
            </div>
            <p className="text-xs text-gray-500 mb-4">Most frequently ordered items</p>
            {topProductsConsumptionData.products.length === 0 ? (
              <div className="h-40 flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <Package className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No product data available</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {topProductsConsumptionData.products.slice(0, 5).map((product, idx) => (
                  <div key={`product-${product.productId}-${idx}`} className={`${idx === 0 ? 'bg-gradient-to-r from-indigo-50 to-transparent border border-indigo-100 rounded-lg p-2' : 'py-1.5'}`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                        idx === 0 ? 'bg-indigo-600 text-white' : idx === 1 ? 'bg-purple-500 text-white' : idx === 2 ? 'bg-violet-400 text-white' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {product.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className={`text-xs truncate max-w-[140px] ${idx === 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>{product.productName}</h4>
                          <div className="flex items-center gap-3">
                            <span className={`text-xs ${idx === 0 ? 'font-bold text-green-600' : 'font-semibold text-green-700'}`}>{formatCurrency(product.totalSpend)}</span>
                            <span className={`text-xs ${idx === 0 ? 'font-bold text-indigo-700' : 'font-semibold text-gray-900'}`}>{product.totalQuantity} units</span>
                          </div>
                        </div>
                        <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                          <div className={`absolute top-0 left-0 h-full rounded-full ${idx === 0 ? 'bg-indigo-500' : idx === 1 ? 'bg-purple-400' : idx === 2 ? 'bg-violet-300' : 'bg-gray-300'}`} style={{ width: `${product.percentOfMax}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="pt-2 mt-2 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">{topProductsConsumptionData.totalOrdersInPeriod} orders</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-green-600 font-medium">{formatCurrency(topProductsConsumptionData.totalSpendInPeriod)}</span>
                    <span className="text-[10px] text-gray-400">{topProductsConsumptionData.totalQuantityInPeriod} units</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Branch Spend */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">{branchSpendData.length === 1 ? 'Location Summary' : 'Spend by Branch'}</h2>
              {branchSpendData.length > 1 && (
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                  <button onClick={() => setBranchMetricType('total')} className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${branchMetricType === 'total' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}>Total</button>
                  <button onClick={() => setBranchMetricType('perEmployee')} className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${branchMetricType === 'perEmployee' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}>Per Emp</button>
                </div>
              )}
            </div>
            {branchSpendData.length === 0 ? (
              <div className="h-40 flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No branch data</p>
                </div>
              </div>
            ) : branchSpendData.length === 1 ? (
              <div className="space-y-3">
                <div className="text-center p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl">
                  <Building2 className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                  <h3 className="text-sm font-semibold text-gray-900">{branchSpendData[0].fullName}</h3>
                  <p className="text-2xl font-bold mt-2" style={{ color: companyPrimaryColor }}>{formatCurrency(branchSpendData[0].spend)}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-2 bg-gray-50 rounded-lg">
                    <p className="text-base font-bold text-gray-900">{branchSpendData[0].orders}</p>
                    <p className="text-[10px] text-gray-500">Orders</p>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded-lg">
                    <p className="text-base font-bold text-gray-900">{branchSpendData[0].employeeCount}</p>
                    <p className="text-[10px] text-gray-500">Employees</p>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded-lg">
                    <p className="text-base font-bold text-gray-900">{formatCurrency(branchSpendData[0].spendPerEmployee)}</p>
                    <p className="text-[10px] text-gray-500">Per Emp</p>
                  </div>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={branchSpendData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => formatCurrency(value)} />
                  <YAxis type="category" dataKey="name" fontSize={10} tickLine={false} axisLine={false} width={70} />
                  <Tooltip formatter={(value: number) => [formatCurrency(value), branchMetricType === 'total' ? 'Total' : 'Per Emp']} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                  <Bar dataKey={branchMetricType === 'total' ? 'spend' : 'spendPerEmployee'} fill={companyPrimaryColor} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* WIDGETS GRID - ROW 4: Employee + Insights */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Employee Consumption */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Employee Consumption</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Award className="h-3 w-3 text-amber-500" />High Consumption (Top 5)
                </h3>
                {employeeOutliers.topSpenders.length === 0 ? (
                  <p className="text-xs text-gray-400">No data</p>
                ) : (
                  <div className="space-y-1.5">
                    {employeeOutliers.topSpenders.slice(0, 5).map((emp, idx) => (
                      <div key={`top-${String(emp.id)}-${idx}`} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${
                            idx === 0 ? 'bg-amber-400' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-amber-600' : 'bg-gray-300'
                          }`}>{idx + 1}</span>
                          <span className="text-[11px] text-gray-700 truncate max-w-[70px]" title={emp.name}>{emp.name}</span>
                        </div>
                        <span className="text-[11px] font-medium text-gray-900">{formatCurrency(emp.spend)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <UserCheck className="h-3 w-3 text-gray-400" />Inactive Users
                </h3>
                {employeeOutliers.inactiveSpenders.length === 0 ? (
                  <div className="flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3 w-3" />All employees active
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {employeeOutliers.inactiveSpenders.slice(0, 5).map((emp, idx) => (
                      <div key={`inactive-${String(emp.id)}-${idx}`} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                        <span className="text-[11px] text-gray-500 truncate max-w-[80px]" title={emp.name}>{emp.name}</span>
                        <span className="text-[10px] text-gray-400">0 orders</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Key Insights */}
          {smartInsights.length > 0 && (
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-amber-100 rounded-lg">
                  <Lightbulb className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Key Insights</h2>
                  <p className="text-[10px] text-gray-500">Top {smartInsights.length} findings</p>
                </div>
              </div>
              <div className="space-y-2">
                {smartInsights.map((insight, idx) => {
                  const InsightIcon = insight.icon
                  const bgColor = insight.type === 'warning' ? 'bg-amber-50 border-amber-200' : insight.type === 'success' ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'
                  const iconColor = insight.type === 'warning' ? 'text-amber-600' : insight.type === 'success' ? 'text-emerald-600' : 'text-blue-600'
                  return (
                    <div key={idx} className={`${bgColor} border rounded-lg p-2.5`}>
                      <div className="flex items-start gap-2">
                        <InsightIcon className={`h-4 w-4 ${iconColor} flex-shrink-0 mt-0.5`} />
                        <div>
                          <h4 className="text-xs font-medium text-gray-900">{insight.title}</h4>
                          <p className="text-[10px] text-gray-600 mt-0.5 line-clamp-2">{insight.description}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* ORDER DETAILS TABLE (COLLAPSIBLE) */}
        {/* ============================================================ */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <button
            onClick={() => setTableExpanded(!tableExpanded)}
            className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900">Order Details</h2>
              <span className="text-sm text-gray-500">({companyOrders.length} orders)</span>
            </div>
            <div className="flex items-center gap-2">
              {tableExpanded ? (
                <ChevronUp className="h-5 w-5 text-gray-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-400" />
              )}
            </div>
          </button>

          {tableExpanded && (
            <div className="border-t border-gray-100">
              <div className="p-4 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-3">
                <div className="relative">
                  <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search orders..."
                    value={tableFilter.search}
                    onChange={(e) => setTableFilter(prev => ({ ...prev, search: e.target.value }))}
                    className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-48 focus:ring-2 focus:ring-offset-0 outline-none"
                    style={{ '--tw-ring-color': `${companyPrimaryColor}40` } as React.CSSProperties}
                  />
                </div>
                <select
                  value={tableFilter.vendor}
                  onChange={(e) => setTableFilter(prev => ({ ...prev, vendor: e.target.value }))}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                >
                  <option value="">All Vendors</option>
                  {companyVendors.map((v, idx) => (
                    <option key={`vendor-option-${String(v.id)}-${idx}`} value={String(v.id)}>{v.name}</option>
                  ))}
                </select>
                <select
                  value={tableFilter.status}
                  onChange={(e) => setTableFilter(prev => ({ ...prev, status: e.target.value }))}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                >
                  <option value="">All Statuses</option>
                  <option value="Awaiting approval">Awaiting Approval</option>
                  <option value="Awaiting fulfilment">Awaiting Fulfilment</option>
                  <option value="Dispatched">Dispatched</option>
                  <option value="Delivered">Delivered</option>
                </select>
                {(tableFilter.search || tableFilter.vendor || tableFilter.status) && (
                  <button
                    onClick={() => setTableFilter({ vendor: '', branch: '', status: '', search: '' })}
                    className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
                  >
                    Clear filters
                  </button>
                )}
              </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Order ID</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Employee</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Vendor</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Items</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                    {filteredOrders.length === 0 ? (
                  <tr>
                        <td colSpan={7} className="py-12 text-center text-gray-500">
                          <Package className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                          <p>No orders found</p>
                    </td>
                  </tr>
                ) : (
                      filteredOrders.slice(0, 50).map((order, index) => {
                        const orderDate = parseDate(order.orderDate)
                        return (
                          <tr key={`order-${String(order.id)}-${index}`} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                            <td className="py-3 px-4 text-sm font-medium text-gray-900">{order.id}</td>
                            <td className="py-3 px-4 text-sm text-gray-600">{order.employeeName || 'N/A'}</td>
                            <td className="py-3 px-4 text-sm text-gray-600">{order.vendorName || 'N/A'}</td>
                            <td className="py-3 px-4 text-sm text-gray-600">{order.items?.length || 0} items</td>
                            <td className="py-3 px-4 text-sm font-medium text-gray-900">{formatCurrency(calculateOrderTotal(order))}</td>
                            <td className="py-3 px-4 text-sm text-gray-600">
                              {orderDate ? orderDate.toLocaleDateString() : 'N/A'}
                            </td>
                    <td className="py-3 px-4">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                order.status === 'Delivered' ? 'bg-emerald-100 text-emerald-700' :
                                order.status === 'Dispatched' ? 'bg-purple-100 text-purple-700' :
                                order.status === 'Awaiting fulfilment' ? 'bg-blue-100 text-blue-700' :
                                'bg-amber-100 text-amber-700'
                      }`}>
                        {order.status}
                      </span>
                    </td>
                  </tr>
                        )
                      })
                )}
              </tbody>
            </table>
          </div>
              {filteredOrders.length > 50 && (
                <div className="p-4 text-center text-sm text-gray-500 border-t border-gray-100">
                  Showing 50 of {filteredOrders.length} orders. Export for complete data.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
