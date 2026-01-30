'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { 
  BarChart3, Download, Calendar, DollarSign, Users, Package, IndianRupee, 
  TrendingUp, TrendingDown, Clock, Repeat, Building2, UserCheck, AlertTriangle,
  ChevronDown, ChevronUp, Filter, Search, Lightbulb, Zap, Target, ArrowRight,
  CheckCircle2, XCircle, Truck, Timer, Activity, Award, ShieldCheck, ArrowDown,
  Heart, Calendar as CalendarIcon, RefreshCw, CalendarDays
} from 'lucide-react'

// Time range presets
type TimeRangePreset = '7d' | '30d' | 'quarter' | 'ytd' | '12m' | 'all'

interface TimeRange {
  startDate: Date | null
  endDate: Date | null
  label: string
}

// Calculate date range based on preset
function getDateRangeFromPreset(preset: TimeRangePreset): TimeRange {
  const now = new Date()
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  
  switch (preset) {
    case '7d': {
      const startDate = new Date(now)
      startDate.setDate(now.getDate() - 7)
      startDate.setHours(0, 0, 0, 0)
      return { startDate, endDate, label: 'Last 7 Days' }
    }
    case '30d': {
      const startDate = new Date(now)
      startDate.setDate(now.getDate() - 30)
      startDate.setHours(0, 0, 0, 0)
      return { startDate, endDate, label: 'Last 30 Days' }
    }
    case 'quarter': {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3
      const startDate = new Date(now.getFullYear(), quarterMonth, 1, 0, 0, 0)
      return { startDate, endDate, label: 'This Quarter' }
    }
    case 'ytd': {
      const startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0)
      return { startDate, endDate, label: 'Year to Date' }
    }
    case '12m': {
      const startDate = new Date(now)
      startDate.setFullYear(now.getFullYear() - 1)
      startDate.setHours(0, 0, 0, 0)
      return { startDate, endDate, label: 'Last 12 Months' }
    }
    case 'all':
    default:
      return { startDate: null, endDate: null, label: 'All Time' }
  }
}
import { 
  getVendorReportsForCompany, 
  getVendorSalesPatternsForCompany, 
  getCompaniesByVendor,
  getVendorAccountHealth
} from '@/lib/data-mongodb'
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================
interface CompanyOption {
  id: string
  name: string
  primaryColor?: string
}

interface OrderStatusItem {
  status: string
  count: number
  revenue: number
  percentage: number
}

interface TopProduct {
  productId: string
  productName: string
  quantitySold: number
  revenue: number
  orderCount: number
}

interface DeliveryPerformance {
  avgDeliveryTime: number
  bestDeliveryTime: number
  slowestDeliveryTime: number
  totalDeliveries: number
  onTimeDeliveries: number
  onTimePercentage: number
}

interface AccountHealth {
  repeatOrderRate: number
  avgOrderValueTrend: number
  orderFrequencyDays: number
  accountSince: string
  totalOrdersFromCompany: number
  recentOrderTrend: 'growing' | 'stable' | 'declining'
}

interface BusinessVolumeItem {
  companyId: string
  companyName: string
  orderCount: number
  revenue: number
  avgOrderValue: number
  percentage: number
}

interface SalesPattern {
  period: string
  revenue: number
  orderCount: number
  avgOrderValue: number
}

interface InsightItem {
  type: 'warning' | 'info' | 'success'
  icon: React.ElementType
  title: string
  description: string
  priority: number
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Adaptive time display
const formatDuration = (days: number): string => {
  if (days === 0) return 'Instant'
  
  const totalMinutes = days * 24 * 60
  const totalHours = days * 24
  
  if (totalMinutes < 60) {
    const mins = Math.round(totalMinutes)
    return mins <= 1 ? '< 1 min' : `${mins} mins`
  }
  
  if (totalHours < 24) {
    if (totalHours < 1) return `${Math.round(totalMinutes)} mins`
    return `${totalHours.toFixed(1)} hours`
  }
  
  if (days < 1) return '< 1 day'
  return `${days.toFixed(1)} days`
}

const formatDurationCompact = (days: number): string => {
  if (days === 0) return '0'
  
  const totalMinutes = days * 24 * 60
  const totalHours = days * 24
  
  if (totalMinutes < 60) {
    const mins = Math.round(totalMinutes)
    return mins <= 1 ? '<1m' : `${mins}m`
  }
  
  if (totalHours < 24) {
    if (totalHours < 1) return `${Math.round(totalMinutes)}m`
    return `${totalHours.toFixed(1)}h`
  }
  
  if (days < 1) return '<1d'
  return `${days.toFixed(1)}d`
}

// Format currency
const formatCurrency = (value: number): string => {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)}L`
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`
  return `₹${value.toFixed(0)}`
}

// Get trend info
const getTrendInfo = (trend: number) => ({
  icon: trend >= 0 ? TrendingUp : TrendingDown,
  color: trend >= 0 ? 'text-emerald-600' : 'text-red-500',
  bgColor: trend >= 0 ? 'bg-emerald-50' : 'bg-red-50'
})

// Vendor Colors Palette
const VENDOR_COLORS = [
  '#3b82f6', '#8b5cf6', '#14b8a6', '#f97316', '#64748b', '#22c55e', '#ec4899', '#6366f1'
]

// Funnel stage colors
const FUNNEL_COLORS = {
  'Awaiting approval': '#eab308',
  'Awaiting fulfilment': '#f97316', 
  'Dispatched': '#3b82f6',
  'Delivered': '#22c55e'
}

// ============================================================================
// FUNNEL COMPONENT
// ============================================================================
interface FunnelStageProps {
  stage: string
  value: number
  conversionToNext: number
  nextStage: string | null
  color: string
  widthPercent: number
  isLast: boolean
}

const FunnelStage = ({ stage, value, conversionToNext, nextStage, color, widthPercent, isLast }: FunnelStageProps) => {
  const topInset = (100 - widthPercent) / 2
  const bottomWidthPercent = isLast ? widthPercent : widthPercent - 15
  const bottomInset = (100 - bottomWidthPercent) / 2
  const clipPath = `polygon(${topInset}% 0%, ${100 - topInset}% 0%, ${100 - bottomInset}% 100%, ${bottomInset}% 100%)`
  
  return (
    <div className="flex flex-col items-center">
      <div 
        className="relative transition-all duration-500 hover:scale-[1.02]"
        style={{ width: '100%', height: '52px', clipPath, backgroundColor: color }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
          <span className="text-xs font-semibold tracking-wide">{stage}</span>
          <span className="text-sm font-bold">{value} orders</span>
        </div>
      </div>
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
export default function VendorReportsPage() {
  // State
  const [vendorId, setVendorId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [selectedCompany, setSelectedCompany] = useState<string>('all')
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [spendChartPeriod, setSpendChartPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly')
  const [timeRangePreset, setTimeRangePreset] = useState<TimeRangePreset>('30d')
  
  // Report data
  const [summary, setSummary] = useState<{
    totalRevenue: number
    totalOrders: number
    avgOrderValue: number
    totalCompanies: number
    accountSince?: string
    totalOrdersFromCompany?: number
  } | null>(null)
  const [salesPatterns, setSalesPatterns] = useState<SalesPattern[]>([])
  const [orderStatusBreakdown, setOrderStatusBreakdown] = useState<OrderStatusItem[]>([])
  const [businessVolumeByCompany, setBusinessVolumeByCompany] = useState<BusinessVolumeItem[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [deliveryPerformance, setDeliveryPerformance] = useState<DeliveryPerformance | null>(null)
  const [accountHealth, setAccountHealth] = useState<AccountHealth | null>(null)

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true)
        const { getVendorId } = await import('@/lib/utils/auth-storage')
        const storedVendorId = getVendorId()
        
        if (!storedVendorId) {
          console.error('Vendor ID not found')
          setLoading(false)
          return
        }
        
        setVendorId(storedVendorId)
        
        // Load companies for selector
        const vendorCompanies = await getCompaniesByVendor(storedVendorId)
        setCompanies(vendorCompanies)
        
        // Load initial reports (all companies) with monthly period and default time range
        await loadReports(storedVendorId, null, 'monthly', '30d')
      } catch (error) {
        console.error('Error loading initial data:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadInitialData()
  }, [])

  // Load reports when company selection or time range changes
  const loadReports = useCallback(async (
    vId: string, 
    companyId: string | null, 
    period: 'daily' | 'weekly' | 'monthly' = 'monthly',
    timePreset: TimeRangePreset = '30d'
  ) => {
    try {
      const { startDate, endDate } = getDateRangeFromPreset(timePreset)
      
      // Fetch full reports and sales patterns in parallel with date range
      const [reports, patterns] = await Promise.all([
        getVendorReportsForCompany(vId, companyId, startDate, endDate),
        getVendorSalesPatternsForCompany(vId, companyId, period, startDate, endDate)
      ])
      
      setSummary(reports.summary)
      setOrderStatusBreakdown(reports.orderStatusBreakdown || [])
      setBusinessVolumeByCompany(reports.businessVolumeByCompany || [])
      setTopProducts(reports.topProducts || [])
      setDeliveryPerformance(reports.deliveryPerformance || null)
      setAccountHealth(reports.accountHealth || null)
      setSalesPatterns(patterns || [])
    } catch (error) {
      console.error('Error loading reports:', error)
    }
  }, [])

  // Handle company change
  const handleCompanyChange = useCallback(async (companyId: string) => {
    setSelectedCompany(companyId)
    if (vendorId) {
      setLoading(true)
      await loadReports(vendorId, companyId === 'all' ? null : companyId, spendChartPeriod, timeRangePreset)
      setLoading(false)
    }
  }, [vendorId, loadReports, spendChartPeriod, timeRangePreset])

  // Handle time range change
  const handleTimeRangeChange = useCallback(async (preset: TimeRangePreset) => {
    setTimeRangePreset(preset)
    if (vendorId) {
      setLoading(true)
      await loadReports(vendorId, selectedCompany === 'all' ? null : selectedCompany, spendChartPeriod, preset)
      setLoading(false)
    }
  }, [vendorId, selectedCompany, spendChartPeriod, loadReports])

  // Handle period change for sales chart
  const handlePeriodChange = useCallback(async (period: 'daily' | 'weekly' | 'monthly') => {
    setSpendChartPeriod(period)
    if (vendorId) {
      const companyId = selectedCompany === 'all' ? null : selectedCompany
      const { startDate, endDate } = getDateRangeFromPreset(timeRangePreset)
      const patterns = await getVendorSalesPatternsForCompany(vendorId, companyId, period, startDate, endDate)
      setSalesPatterns(patterns)
    }
  }, [vendorId, selectedCompany, timeRangePreset])

  // Get selected company name
  const selectedCompanyName = useMemo(() => {
    if (selectedCompany === 'all') return 'All Companies'
    return companies.find(c => c.id === selectedCompany)?.name || 'Unknown'
  }, [selectedCompany, companies])

  // Calculate KPIs with trends (mocked trends for now)
  const kpiData = useMemo(() => {
    if (!summary) return null
    
    return {
      totalRevenue: summary.totalRevenue,
      totalOrders: summary.totalOrders,
      avgOrderValue: summary.avgOrderValue,
      activeCompanies: summary.totalCompanies
    }
  }, [summary])

  // Order funnel data
  const orderFunnelData = useMemo(() => {
    if (orderStatusBreakdown.length === 0) return { stages: [], noLeakage: true }
    
    const statusCounts = {
      created: 0,
      approved: 0,
      dispatched: 0,
      delivered: 0
    }
    
    orderStatusBreakdown.forEach(item => {
      if (item.status === 'Awaiting approval') {
        statusCounts.created += item.count
      } else if (item.status === 'Awaiting fulfilment') {
        statusCounts.created += item.count
        statusCounts.approved += item.count
      } else if (item.status === 'Dispatched') {
        statusCounts.created += item.count
        statusCounts.approved += item.count
        statusCounts.dispatched += item.count
      } else if (item.status === 'Delivered') {
        statusCounts.created += item.count
        statusCounts.approved += item.count
        statusCounts.dispatched += item.count
        statusCounts.delivered += item.count
      }
    })

    const approvalConversion = statusCounts.created > 0 
      ? (statusCounts.approved / statusCounts.created) * 100 : 100
    const dispatchConversion = statusCounts.approved > 0 
      ? (statusCounts.dispatched / statusCounts.approved) * 100 : 100
    const deliveryConversion = statusCounts.dispatched > 0 
      ? (statusCounts.delivered / statusCounts.dispatched) * 100 : 100

    const noLeakage = approvalConversion >= 99.9 && dispatchConversion >= 99.9 && deliveryConversion >= 99.9

    return {
      stages: [
        { stage: 'Ordered', value: statusCounts.created, fill: '#6366f1', conversionToNext: approvalConversion, nextStage: 'Approved', widthPercent: 100 },
        { stage: 'Approved', value: statusCounts.approved, fill: '#8b5cf6', conversionToNext: dispatchConversion, nextStage: 'Dispatched', widthPercent: 85 },
        { stage: 'Dispatched', value: statusCounts.dispatched, fill: '#a855f7', conversionToNext: deliveryConversion, nextStage: 'Delivered', widthPercent: 70 },
        { stage: 'Delivered', value: statusCounts.delivered, fill: '#10b981', conversionToNext: 100, nextStage: null, widthPercent: 55 }
      ],
      noLeakage
    }
  }, [orderStatusBreakdown])

  // Smart insights (context-aware)
  const smartInsights = useMemo((): InsightItem[] => {
    const insights: InsightItem[] = []
    
    // All Companies insights
    if (selectedCompany === 'all') {
      // Vendor dependency warning
      if (businessVolumeByCompany.length > 0) {
        const dominantCompany = businessVolumeByCompany.find(c => c.percentage > 40)
        if (dominantCompany) {
          insights.push({
            type: 'warning',
            icon: Target,
            title: 'Customer Concentration Risk',
            description: `${dominantCompany.companyName} contributes ${dominantCompany.percentage.toFixed(0)}% of total revenue. Consider diversifying customer base.`,
            priority: 1
          })
        }
        
        // Top customer insight
        if (businessVolumeByCompany.length > 0 && !insights.some(i => i.title.includes('Concentration'))) {
          const topCompany = businessVolumeByCompany[0]
          if (topCompany.percentage > 25) {
            insights.push({
              type: 'info',
              icon: Building2,
              title: `${topCompany.companyName} leads revenue`,
              description: `${topCompany.percentage.toFixed(0)}% of total business (${formatCurrency(topCompany.revenue)}) from top customer.`,
              priority: 2
            })
          }
        }
      }
      
      // Top product insight
      if (topProducts.length > 0) {
        const topProduct = topProducts[0]
        const totalRevenue = topProducts.reduce((sum, p) => sum + p.revenue, 0)
        const productShare = totalRevenue > 0 ? (topProduct.revenue / totalRevenue) * 100 : 0
        if (productShare > 40) {
          insights.push({
            type: 'info',
            icon: Package,
            title: `${topProduct.productName} drives volume`,
            description: `${productShare.toFixed(0)}% of total product revenue comes from this SKU.`,
            priority: 3
          })
        }
      }
    } else {
      // Single Company insights
      if (accountHealth) {
        // Order trend
        if (accountHealth.recentOrderTrend === 'growing') {
          insights.push({
            type: 'success',
            icon: TrendingUp,
            title: 'Account Growing',
            description: `Order volume increased ${accountHealth.avgOrderValueTrend > 0 ? accountHealth.avgOrderValueTrend.toFixed(0) + '% ' : ''}vs last month. Strong customer relationship.`,
            priority: 1
          })
        } else if (accountHealth.recentOrderTrend === 'declining') {
          insights.push({
            type: 'warning',
            icon: TrendingDown,
            title: 'Account Declining',
            description: `Order volume decreased vs last month. Review relationship health.`,
            priority: 1
          })
        }
        
        // Repeat order rate
        if (accountHealth.repeatOrderRate > 50) {
          insights.push({
            type: 'success',
            icon: Repeat,
            title: 'High Repeat Rate',
            description: `${accountHealth.repeatOrderRate.toFixed(0)}% of employees are repeat customers.`,
            priority: 2
          })
        }
      }
      
      // Delivery SLA
      if (deliveryPerformance && deliveryPerformance.totalDeliveries > 0) {
        if (deliveryPerformance.onTimePercentage >= 95) {
          insights.push({
            type: 'success',
            icon: Truck,
            title: 'SLA Excellence',
            description: `${deliveryPerformance.onTimePercentage.toFixed(0)}% on-time delivery rate for this customer.`,
            priority: 3
          })
        } else if (deliveryPerformance.onTimePercentage < 80) {
          insights.push({
            type: 'warning',
            icon: Clock,
            title: 'Delivery Concerns',
            description: `Only ${deliveryPerformance.onTimePercentage.toFixed(0)}% on-time delivery. Review fulfillment process.`,
            priority: 1
          })
        }
      }
    }
    
    return insights.sort((a, b) => a.priority - b.priority).slice(0, 3)
  }, [selectedCompany, businessVolumeByCompany, topProducts, accountHealth, deliveryPerformance])

  // Format period label for display
  const formatPeriodLabel = (period: string, periodType: 'daily' | 'weekly' | 'monthly'): string => {
    if (!period) return ''
    
    try {
      if (periodType === 'monthly') {
        // Format: "2026-01" → "Jan 26"
        const [year, month] = period.split('-')
        const date = new Date(parseInt(year), parseInt(month) - 1, 1)
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      } else if (periodType === 'weekly') {
        // Format: "2026-01-05" → "5 Jan"
        const date = new Date(period)
        return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
      } else {
        // Daily: "2026-01-15" → "15 Jan"
        const date = new Date(period)
        return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
      }
    } catch {
      return period
    }
  }

  // Prepare chart data with formatted labels
  const chartData = useMemo(() => {
    return salesPatterns.map(item => ({
      ...item,
      displayPeriod: formatPeriodLabel(item.period, spendChartPeriod)
    }))
  }, [salesPatterns, spendChartPeriod])

  // Custom tooltip for sales chart
  const SalesTrendTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium text-gray-900 mb-2">{data?.displayPeriod || label}</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-gray-500">Revenue:</span>
              <span className="text-sm font-semibold text-gray-900">{formatCurrency(data?.revenue || 0)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-gray-500">Orders:</span>
              <span className="text-sm text-gray-600">{data?.orderCount || 0}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-gray-500">Avg Value:</span>
              <span className="text-sm text-gray-600">{formatCurrency(data?.avgOrderValue || 0)}</span>
            </div>
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
      <DashboardLayout actorType="vendor">
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading analytics...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!summary) {
    return (
      <DashboardLayout actorType="vendor">
        <div className="text-center py-12">
          <BarChart3 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">No report data available</p>
          <p className="text-gray-500 text-sm mt-2">Start fulfilling orders to see your business analytics</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="vendor">
      <div className="space-y-6">
        {/* Page Header with Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Vendor Reports & Analytics</h1>
            <p className="text-gray-500 text-sm mt-1">Multi-customer business intelligence cockpit</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Time Range Selector */}
            <div className="relative">
              <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm">
                <CalendarDays className="h-4 w-4 text-gray-500" />
                <select
                  value={timeRangePreset}
                  onChange={(e) => handleTimeRangeChange(e.target.value as TimeRangePreset)}
                  className="appearance-none bg-transparent border-none text-sm font-medium text-gray-900 pr-6 focus:outline-none focus:ring-0 cursor-pointer"
                >
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="quarter">This Quarter</option>
                  <option value="ytd">Year to Date</option>
                  <option value="12m">Last 12 Months</option>
                  <option value="all">All Time</option>
                </select>
                <ChevronDown className="absolute right-3 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
            
            {/* Company Context Selector */}
            <div className="relative">
              <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg shadow-sm">
                <Building2 className="h-4 w-4 text-gray-500" />
                <select
                  value={selectedCompany}
                  onChange={(e) => handleCompanyChange(e.target.value)}
                  className="appearance-none bg-transparent border-none text-sm font-medium text-gray-900 pr-6 focus:outline-none focus:ring-0 cursor-pointer"
                >
                  <option value="all">All Companies ({companies.length})</option>
                  {companies.map(company => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
            
            <button 
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 shadow-sm hover:bg-blue-700 hover:shadow-md"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>

        {/* Context Banner */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              {selectedCompany === 'all' ? (
                <Users className="h-4 w-4 text-blue-600" />
              ) : (
                <Building2 className="h-4 w-4 text-blue-600" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {selectedCompany === 'all' 
                  ? `Portfolio Overview: ${companies.length} Active Companies` 
                  : `Account View: ${selectedCompanyName}`}
                <span className="text-blue-600 ml-2">• {getDateRangeFromPreset(timeRangePreset).label}</span>
              </p>
              <p className="text-xs text-gray-500">
                {selectedCompany === 'all' 
                  ? 'Aggregated metrics across all your customers'
                  : accountHealth?.accountSince 
                    ? `Account since ${new Date(accountHealth.accountSince).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`
                    : 'Single customer performance metrics'}
              </p>
            </div>
          </div>
          {selectedCompany !== 'all' && (
            <button
              onClick={() => handleCompanyChange('all')}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
            >
              <RefreshCw className="h-3 w-3" />
              View All Companies
            </button>
          )}
        </div>

        {/* ============================================================ */}
        {/* KPI CARDS (CONTEXT-AWARE) */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              title: 'Total Revenue',
              value: formatCurrency(kpiData?.totalRevenue || 0),
              icon: IndianRupee,
              color: '#10b981',
              bgColor: '#10b98115'
            },
            {
              title: 'Total Orders',
              value: (kpiData?.totalOrders || 0).toLocaleString(),
              icon: Package,
              color: '#6366f1',
              bgColor: '#6366f115'
            },
            {
              title: 'Avg Order Value',
              value: formatCurrency(kpiData?.avgOrderValue || 0),
              icon: BarChart3,
              color: '#8b5cf6',
              bgColor: '#8b5cf615'
            },
            {
              title: selectedCompany === 'all' ? 'Active Companies' : 'Account Since',
              value: selectedCompany === 'all' 
                ? (kpiData?.activeCompanies || 0).toString()
                : accountHealth?.accountSince 
                  ? new Date(accountHealth.accountSince).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
                  : 'N/A',
              icon: selectedCompany === 'all' ? Building2 : CalendarIcon,
              color: '#f59e0b',
              bgColor: '#f59e0b15'
            }
          ].map((kpi, idx) => {
            const KPIIcon = kpi.icon
            return (
              <div key={idx} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2.5 rounded-lg" style={{ backgroundColor: kpi.bgColor }}>
                    <KPIIcon className="h-5 w-5" style={{ color: kpi.color }} />
                  </div>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{kpi.title}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* ============================================================ */}
        {/* SALES TREND + SIDE WIDGETS */}
        {/* ============================================================ */}
        <div className="grid grid-cols-12 gap-6">
          {/* Sales Trend Chart */}
          <div className="col-span-12 lg:col-span-8 bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Sales Trend</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selectedCompany === 'all' ? 'Aggregated revenue trend' : `Revenue trend for ${selectedCompanyName}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(['daily', 'weekly', 'monthly'] as const).map(period => (
              <button
                    key={period}
                    onClick={() => handlePeriodChange(period)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      spendChartPeriod === period 
                    ? 'bg-blue-600 text-white'
                        : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                }`}
              >
                    {period.charAt(0).toUpperCase() + period.slice(1)}
              </button>
                ))}
              </div>
            </div>
            {chartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <BarChart3 className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No sales data available</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="displayPeriod" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(value) => formatCurrency(value)} />
                  <Tooltip content={<SalesTrendTooltip />} />
                  <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#revenueGradient)" name="Revenue" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          
          {/* Right side widgets */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
            {/* Delivery Performance */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Delivery Performance</h3>
              {!deliveryPerformance || deliveryPerformance.totalDeliveries === 0 ? (
                <div className="h-20 flex items-center justify-center bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <ShieldCheck className="h-6 w-6 text-gray-300 mx-auto mb-1" />
                    <p className="text-gray-500 text-xs">No completed deliveries yet</p>
                      </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-2 bg-gray-50 rounded-lg">
                      <p className="text-base font-bold text-gray-900">{formatDurationCompact(deliveryPerformance.avgDeliveryTime)}</p>
                      <p className="text-[10px] text-gray-500">Avg Time</p>
                    </div>
                    <div className="text-center p-2 bg-emerald-50 rounded-lg">
                      <p className="text-base font-bold text-emerald-700">{formatDurationCompact(deliveryPerformance.bestDeliveryTime)}</p>
                      <p className="text-[10px] text-emerald-600">Best</p>
                    </div>
                    <div className="text-center p-2 bg-amber-50 rounded-lg">
                      <p className="text-base font-bold text-amber-700">{formatDurationCompact(deliveryPerformance.slowestDeliveryTime)}</p>
                      <p className="text-[10px] text-amber-600">Slowest</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 text-center">Based on {deliveryPerformance.totalDeliveries} deliveries</p>
                </div>
              )}
            </div>

            {/* Revenue by Company - Only in All Companies view */}
            {selectedCompany === 'all' && businessVolumeByCompany.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Revenue Contribution</h3>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie 
                          data={businessVolumeByCompany.slice(0, 6)} 
                          cx="50%" 
                          cy="50%" 
                          innerRadius={25} 
                          outerRadius={40} 
                          paddingAngle={3} 
                          dataKey="revenue"
                        >
                          {businessVolumeByCompany.slice(0, 6).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={VENDOR_COLORS[index % VENDOR_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-1">
                    {businessVolumeByCompany.slice(0, 4).map((company, idx) => (
                      <div key={company.companyId} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2 h-2 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: VENDOR_COLORS[idx % VENDOR_COLORS.length] }} 
                          />
                          <span className="text-xs text-gray-600 truncate max-w-[80px]" title={company.companyName}>
                            {company.companyName}
                          </span>
                        </div>
                        <span className={`text-xs font-medium ${company.percentage > 40 ? 'text-amber-600' : 'text-gray-900'}`}>
                          {company.percentage.toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {businessVolumeByCompany.some(c => c.percentage > 40) && (
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-amber-600">
                    <AlertTriangle className="h-3 w-3" />
                    <span>High dependency on single customer</span>
              </div>
                )}
              </div>
            )}

            {/* Account Health - Only in Single Company view */}
            {selectedCompany !== 'all' && accountHealth && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Heart className="h-4 w-4 text-red-500" />
                  Account Health
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <span className="text-xs text-gray-600">Repeat Order Rate</span>
                    <span className="text-sm font-bold text-gray-900">{accountHealth.repeatOrderRate.toFixed(0)}%</span>
            </div>
                  <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <span className="text-xs text-gray-600">Order Frequency</span>
                    <span className="text-sm font-bold text-gray-900">
                      {accountHealth.orderFrequencyDays > 0 
                        ? `${Math.round(accountHealth.orderFrequencyDays)} days` 
                        : 'N/A'}
                    </span>
        </div>
                  <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <span className="text-xs text-gray-600">Order Trend</span>
                    <span className={`text-sm font-bold flex items-center gap-1 ${
                      accountHealth.recentOrderTrend === 'growing' ? 'text-emerald-600' :
                      accountHealth.recentOrderTrend === 'declining' ? 'text-red-500' :
                      'text-gray-600'
                    }`}>
                      {accountHealth.recentOrderTrend === 'growing' && <TrendingUp className="h-3 w-3" />}
                      {accountHealth.recentOrderTrend === 'declining' && <TrendingDown className="h-3 w-3" />}
                      {accountHealth.recentOrderTrend.charAt(0).toUpperCase() + accountHealth.recentOrderTrend.slice(1)}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 text-center">
                    {accountHealth.totalOrdersFromCompany} total orders from this account
                  </p>
                </div>
                        </div>
            )}
                        </div>
                      </div>

        {/* ============================================================ */}
        {/* ROW 2: Order Funnel + Top Products */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Order Status Funnel */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Order Funnel</h2>
              <p className="text-xs text-gray-500">Cumulative flow - how many orders passed through each stage</p>
            </div>
            {orderFunnelData.stages.length === 0 || orderFunnelData.stages[0]?.value === 0 ? (
              <div className="h-44 flex items-center justify-center bg-gray-50 rounded-lg">
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

          {/* Top Products Sold */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold text-gray-900">Top Products Sold</h2>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              {selectedCompany === 'all' 
                ? 'Best performers across all customers' 
                : `Top products sold to ${selectedCompanyName}`}
            </p>
            {topProducts.length === 0 ? (
              <div className="h-40 flex items-center justify-center bg-gray-50 rounded-lg">
                <div className="text-center">
                  <Package className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">No product data available</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {topProducts.slice(0, 5).map((product, idx) => {
                  const maxRevenue = topProducts[0]?.revenue || 1
                  const percentOfMax = (product.revenue / maxRevenue) * 100
                  
                    return (
                    <div key={product.productId} className={`${idx === 0 ? 'bg-gradient-to-r from-blue-50 to-transparent border border-blue-100 rounded-lg p-2' : 'py-1.5'}`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                          idx === 0 ? 'bg-blue-600 text-white' : 
                          idx === 1 ? 'bg-purple-500 text-white' : 
                          idx === 2 ? 'bg-violet-400 text-white' : 
                          'bg-gray-200 text-gray-600'
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className={`text-xs truncate max-w-[140px] ${idx === 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                              {product.productName}
                            </h4>
                            <div className="flex items-center gap-3">
                              <span className={`text-xs ${idx === 0 ? 'font-bold text-green-600' : 'font-semibold text-green-700'}`}>
                                {formatCurrency(product.revenue)}
                              </span>
                              <span className={`text-xs ${idx === 0 ? 'font-bold text-blue-700' : 'font-semibold text-gray-900'}`}>
                                {product.quantitySold} units
                              </span>
                            </div>
                          </div>
                          <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                            <div 
                              className={`absolute top-0 left-0 h-full rounded-full ${
                                idx === 0 ? 'bg-blue-500' : 
                                idx === 1 ? 'bg-purple-400' : 
                                idx === 2 ? 'bg-violet-300' : 
                                'bg-gray-300'
                              }`} 
                              style={{ width: `${percentOfMax}%` }} 
                            />
                          </div>
                        </div>
                      </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* ROW 3: Business Volume Table + Insights */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Business Volume by Company - Only in All Companies view */}
          {selectedCompany === 'all' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-gray-400" />
                Business Volume by Company
              </h2>
              {businessVolumeByCompany.length === 0 ? (
                <div className="h-40 flex items-center justify-center bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">No company data available</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {businessVolumeByCompany.map((company, idx) => (
                    <div 
                      key={company.companyId} 
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                      onClick={() => handleCompanyChange(company.companyId)}
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: VENDOR_COLORS[idx % VENDOR_COLORS.length] }} 
                        />
                      <div>
                          <p className="font-medium text-gray-900 text-sm">{company.companyName}</p>
                          <p className="text-xs text-gray-500">{company.orderCount} orders</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900 text-sm">{formatCurrency(company.revenue)}</p>
                        <p className={`text-xs ${company.percentage > 40 ? 'text-amber-600 font-medium' : 'text-gray-500'}`}>
                          {company.percentage.toFixed(1)}% of total
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Key Insights */}
          {smartInsights.length > 0 && (
            <div className={`bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm p-5 ${selectedCompany !== 'all' ? 'md:col-span-2' : ''}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-amber-100 rounded-lg">
                  <Lightbulb className="h-4 w-4 text-amber-600" />
              </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Key Insights</h2>
                  <p className="text-[10px] text-gray-500">
                    {selectedCompany === 'all' 
                      ? 'Portfolio-level findings' 
                      : `Account-specific insights for ${selectedCompanyName}`}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {smartInsights.map((insight, idx) => {
                  const InsightIcon = insight.icon
                  const bgColor = insight.type === 'warning' ? 'bg-amber-50 border-amber-200' : 
                                  insight.type === 'success' ? 'bg-emerald-50 border-emerald-200' : 
                                  'bg-blue-50 border-blue-200'
                  const iconColor = insight.type === 'warning' ? 'text-amber-600' : 
                                    insight.type === 'success' ? 'text-emerald-600' : 
                                    'text-blue-600'
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
        {/* Order Status Details - Filtered by Time Range */}
        {/* ============================================================ */}
        {orderStatusBreakdown.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Order Status Distribution</h2>
                <p className="text-xs text-gray-500">
                  Orders in {getDateRangeFromPreset(timeRangePreset).label.toLowerCase()} by current status
                </p>
              </div>
              <div className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                Total: {orderStatusBreakdown.reduce((sum, item) => sum + item.count, 0)} orders
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {orderStatusBreakdown.map((item, idx) => {
                const statusColor = FUNNEL_COLORS[item.status as keyof typeof FUNNEL_COLORS] || '#6b7280'
                return (
                  <div key={idx} className="p-4 bg-gray-50 rounded-lg text-center hover:bg-gray-100 transition-colors">
                    <div 
                      className="w-3 h-3 rounded-full mx-auto mb-2" 
                      style={{ backgroundColor: statusColor }}
                    />
                    <p className="text-2xl font-bold text-gray-900">{item.count}</p>
                    <p className="text-xs text-gray-600 mt-1">{item.status}</p>
                    <p className="text-xs text-gray-400">{formatCurrency(item.revenue)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
