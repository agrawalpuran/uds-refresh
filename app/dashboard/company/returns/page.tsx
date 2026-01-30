'use client'

import { useState, useEffect, useMemo } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { RefreshCw, CheckCircle, XCircle, Clock, Package, TrendingUp, TrendingDown, Minus, AlertTriangle, Lightbulb, Activity, Building2, Timer, Users } from 'lucide-react'
import { getCompanyById, getLocationByAdminEmail } from '@/lib/data-mongodb'

// ============================================================================
// INTELLIGENCE LAYER: CONFIGURATION & THRESHOLDS
// ============================================================================
const RETURNS_INTELLIGENCE_CONFIG = {
  // Return rate thresholds (% of completed orders)
  RETURN_RATE_HEALTHY: 5, // Below this is healthy
  RETURN_RATE_WATCHLIST: 10, // Above this is watchlist
  RETURN_RATE_RISK: 15, // Above this is high risk
  
  // Resolution time thresholds (days)
  RESOLUTION_FAST_DAYS: 2,
  RESOLUTION_NORMAL_DAYS: 5,
  // Above NORMAL is considered SLOW
  
  // Spike detection
  SPIKE_THRESHOLD_PERCENT: 50, // 50% increase week-over-week triggers spike
  
  // Minimum sample size for insights
  MIN_SAMPLE_SIZE: 3,
  
  // Time periods
  CURRENT_WEEK_DAYS: 7,
  PREVIOUS_WEEK_DAYS: 14,
}

// ============================================================================
// INTELLIGENCE LAYER: TYPES
// ============================================================================
interface VendorReturnMetrics {
  vendorName: string
  totalReturns: number
  pendingReturns: number
  resolvedReturns: number
  avgResolutionDays: number | null
  healthTag: 'Healthy' | 'Watchlist' | 'High Risk'
}

interface ReturnsIntelligence {
  // Core metrics
  totalReturns: number
  pendingReturns: number
  approvedReturns: number
  rejectedReturns: number
  completedReturns: number
  
  // Return rate (relative to order volume - approximated from returns)
  returnRateIndicator: 'low' | 'moderate' | 'high'
  
  // Trend
  returnsThisWeek: number
  returnsLastWeek: number
  weekOverWeekChange: number
  trend: 'increasing' | 'decreasing' | 'stable'
  hasSpikeDetected: boolean
  
  // Resolution time
  avgResolutionDays: number | null
  resolutionSpeed: 'fast' | 'normal' | 'slow'
  
  // Pattern detection
  topReasons: Array<{ reason: string; count: number; percentage: number }>
  reasonSpike: { reason: string; increase: number } | null
  
  // Vendor comparison (Company Admin specific)
  vendorMetrics: VendorReturnMetrics[]
  bestVendor: VendorReturnMetrics | null
  worstVendor: VendorReturnMetrics | null
  
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
function computeReturnsIntelligence(returnRequests: any[]): ReturnsIntelligence {
  const now = new Date()
  const oneWeekAgo = new Date(now.getTime() - (RETURNS_INTELLIGENCE_CONFIG.CURRENT_WEEK_DAYS * 24 * 60 * 60 * 1000))
  const twoWeeksAgo = new Date(now.getTime() - (RETURNS_INTELLIGENCE_CONFIG.PREVIOUS_WEEK_DAYS * 24 * 60 * 60 * 1000))
  
  // Status breakdown
  const pendingReturns = returnRequests.filter(r => r.status === 'REQUESTED').length
  const approvedReturns = returnRequests.filter(r => r.status === 'APPROVED').length
  const rejectedReturns = returnRequests.filter(r => r.status === 'REJECTED').length
  const completedReturns = returnRequests.filter(r => r.status === 'COMPLETED').length
  
  // Week-over-week analysis
  const returnsThisWeek = returnRequests.filter(r => {
    const date = r.createdAt ? new Date(r.createdAt) : null
    return date && date >= oneWeekAgo
  }).length
  
  const returnsLastWeek = returnRequests.filter(r => {
    const date = r.createdAt ? new Date(r.createdAt) : null
    return date && date >= twoWeeksAgo && date < oneWeekAgo
  }).length
  
  const weekOverWeekChange = returnsLastWeek > 0
    ? ((returnsThisWeek - returnsLastWeek) / returnsLastWeek) * 100
    : (returnsThisWeek > 0 ? 100 : 0)
  
  const trend: 'increasing' | 'decreasing' | 'stable' = 
    weekOverWeekChange > 20 ? 'increasing' :
    weekOverWeekChange < -20 ? 'decreasing' : 'stable'
  
  const hasSpikeDetected = weekOverWeekChange >= RETURNS_INTELLIGENCE_CONFIG.SPIKE_THRESHOLD_PERCENT &&
    returnsThisWeek >= RETURNS_INTELLIGENCE_CONFIG.MIN_SAMPLE_SIZE
  
  // Resolution time calculation
  const resolvedReturns = returnRequests.filter(r => 
    (r.status === 'APPROVED' || r.status === 'COMPLETED' || r.status === 'REJECTED') &&
    r.createdAt && r.approvedAt
  )
  
  let avgResolutionDays: number | null = null
  if (resolvedReturns.length > 0) {
    const totalDays = resolvedReturns.reduce((sum, r) => {
      const created = new Date(r.createdAt)
      const resolved = new Date(r.approvedAt)
      const days = (resolved.getTime() - created.getTime()) / (24 * 60 * 60 * 1000)
      return sum + Math.max(0, days)
    }, 0)
    avgResolutionDays = totalDays / resolvedReturns.length
  }
  
  const resolutionSpeed: 'fast' | 'normal' | 'slow' = 
    avgResolutionDays === null ? 'normal' :
    avgResolutionDays <= RETURNS_INTELLIGENCE_CONFIG.RESOLUTION_FAST_DAYS ? 'fast' :
    avgResolutionDays <= RETURNS_INTELLIGENCE_CONFIG.RESOLUTION_NORMAL_DAYS ? 'normal' : 'slow'
  
  // Pattern detection - reason analysis
  const reasonCounts = new Map<string, number>()
  returnRequests.forEach(r => {
    const reason = r.reason || 'Size Issue' // Default reason
    reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1)
  })
  
  const topReasons = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: returnRequests.length > 0 ? (count / returnRequests.length) * 100 : 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
  
  // Reason spike detection (compare this week vs last week by reason)
  let reasonSpike: { reason: string; increase: number } | null = null
  const thisWeekReasons = new Map<string, number>()
  const lastWeekReasons = new Map<string, number>()
  
  returnRequests.forEach(r => {
    const date = r.createdAt ? new Date(r.createdAt) : null
    const reason = r.reason || 'Size Issue'
    
    if (date && date >= oneWeekAgo) {
      thisWeekReasons.set(reason, (thisWeekReasons.get(reason) || 0) + 1)
    } else if (date && date >= twoWeeksAgo && date < oneWeekAgo) {
      lastWeekReasons.set(reason, (lastWeekReasons.get(reason) || 0) + 1)
    }
  })
  
  thisWeekReasons.forEach((count, reason) => {
    const lastWeekCount = lastWeekReasons.get(reason) || 0
    if (lastWeekCount > 0) {
      const increase = ((count - lastWeekCount) / lastWeekCount) * 100
      if (increase >= 50 && count >= 2) {
        if (!reasonSpike || increase > reasonSpike.increase) {
          reasonSpike = { reason, increase }
        }
      }
    } else if (count >= 3) {
      // New reason appearing with significant volume
      reasonSpike = { reason, increase: 100 }
    }
  })
  
  // Vendor metrics (Company Admin specific)
  const vendorMap = new Map<string, { name: string; returns: any[] }>()
  
  returnRequests.forEach(r => {
    const vendorName = r.vendorName || 'Unknown Vendor'
    if (!vendorMap.has(vendorName)) {
      vendorMap.set(vendorName, { name: vendorName, returns: [] })
    }
    vendorMap.get(vendorName)!.returns.push(r)
  })
  
  const vendorMetrics: VendorReturnMetrics[] = Array.from(vendorMap.entries())
    .map(([_, data]) => {
      const pending = data.returns.filter(r => r.status === 'REQUESTED').length
      const resolved = data.returns.filter(r => ['APPROVED', 'COMPLETED', 'REJECTED'].includes(r.status)).length
      
      // Calculate vendor resolution time
      const vendorResolved = data.returns.filter(r => 
        ['APPROVED', 'COMPLETED', 'REJECTED'].includes(r.status) && r.createdAt && r.approvedAt
      )
      let vendorAvgDays: number | null = null
      if (vendorResolved.length > 0) {
        const totalDays = vendorResolved.reduce((sum, r) => {
          const created = new Date(r.createdAt)
          const resolvedDate = new Date(r.approvedAt)
          return sum + Math.max(0, (resolvedDate.getTime() - created.getTime()) / (24 * 60 * 60 * 1000))
        }, 0)
        vendorAvgDays = totalDays / vendorResolved.length
      }
      
      // Determine vendor health
      let vendorHealth: 'Healthy' | 'Watchlist' | 'High Risk' = 'Healthy'
      if (data.returns.length >= 5 && pending >= data.returns.length * 0.5) {
        vendorHealth = 'High Risk' // Too many pending
      } else if (vendorAvgDays && vendorAvgDays > RETURNS_INTELLIGENCE_CONFIG.RESOLUTION_NORMAL_DAYS) {
        vendorHealth = 'Watchlist'
      } else if (data.returns.length >= 3 && pending >= 2) {
        vendorHealth = 'Watchlist'
      }
      
      return {
        vendorName: data.name,
        totalReturns: data.returns.length,
        pendingReturns: pending,
        resolvedReturns: resolved,
        avgResolutionDays: vendorAvgDays,
        healthTag: vendorHealth
      }
    })
    .sort((a, b) => b.totalReturns - a.totalReturns)
  
  const bestVendor = vendorMetrics.length > 0 
    ? vendorMetrics.reduce((best, v) => {
        if (!best) return v
        // Best = lowest return count with at least some orders
        if (v.totalReturns < best.totalReturns && v.healthTag === 'Healthy') return v
        return best
      }, null as VendorReturnMetrics | null)
    : null
  
  const worstVendor = vendorMetrics.find(v => v.healthTag === 'High Risk') ||
    vendorMetrics.find(v => v.healthTag === 'Watchlist') ||
    (vendorMetrics.length > 1 ? vendorMetrics[0] : null)
  
  // Return rate indicator (approximation)
  const returnRateIndicator: 'low' | 'moderate' | 'high' = 
    pendingReturns >= 10 ? 'high' :
    pendingReturns >= 5 ? 'moderate' : 'low'
  
  // Generate insights
  const insights: Array<{ type: 'warning' | 'info' | 'success'; message: string; priority: number }> = []
  
  // Spike detection insight
  if (hasSpikeDetected) {
    insights.push({
      type: 'warning',
      message: `Return volume spiked ${weekOverWeekChange.toFixed(0)}% this week – investigate root cause`,
      priority: 1
    })
  }
  
  // Reason spike insight
  if (reasonSpike) {
    insights.push({
      type: 'warning',
      message: `Spike in "${reasonSpike.reason}" returns detected this week`,
      priority: 1
    })
  }
  
  // Resolution time insight
  if (resolutionSpeed === 'slow' && resolvedReturns.length >= 3) {
    insights.push({
      type: 'warning',
      message: `Avg resolution time (${avgResolutionDays?.toFixed(1)} days) exceeds target`,
      priority: 2
    })
  } else if (resolutionSpeed === 'fast' && resolvedReturns.length >= 5) {
    insights.push({
      type: 'success',
      message: `Fast resolution time: ${avgResolutionDays?.toFixed(1)} days average`,
      priority: 3
    })
  }
  
  // Pending backlog insight
  if (pendingReturns >= 5) {
    insights.push({
      type: 'warning',
      message: `${pendingReturns} returns awaiting approval – backlog building`,
      priority: 1
    })
  }
  
  // Volume stability insight
  if (trend === 'stable' && returnRequests.length >= 10) {
    insights.push({
      type: 'success',
      message: 'Return volume is within normal operating range',
      priority: 3
    })
  }
  
  // Vendor-specific insight
  if (worstVendor && worstVendor.healthTag === 'High Risk') {
    insights.push({
      type: 'warning',
      message: `${worstVendor.vendorName} has ${worstVendor.pendingReturns} pending returns – review required`,
      priority: 1
    })
  }
  
  insights.sort((a, b) => a.priority - b.priority)
  
  // Determine overall health tag
  let healthTag: 'Healthy' | 'Watchlist' | 'High Risk' = 'Healthy'
  if (hasSpikeDetected || pendingReturns >= 10 || resolutionSpeed === 'slow') {
    healthTag = 'High Risk'
  } else if (pendingReturns >= 5 || trend === 'increasing' || reasonSpike) {
    healthTag = 'Watchlist'
  }
  
  return {
    totalReturns: returnRequests.length,
    pendingReturns,
    approvedReturns,
    rejectedReturns,
    completedReturns,
    returnRateIndicator,
    returnsThisWeek,
    returnsLastWeek,
    weekOverWeekChange,
    trend,
    hasSpikeDetected,
    avgResolutionDays,
    resolutionSpeed,
    topReasons,
    reasonSpike,
    vendorMetrics,
    bestVendor,
    worstVendor,
    insights: insights.slice(0, 3),
    healthTag
  }
}

export default function CompanyReturnsPage() {
  const [companyId, setCompanyId] = useState<string>('')
  const [returnRequests, setReturnRequests] = useState<any[]>([])
  const [allReturnRequests, setAllReturnRequests] = useState<any[]>([]) // Store all for intelligence
  const [loading, setLoading] = useState(true)
  const [companyPrimaryColor, setCompanyPrimaryColor] = useState<string>('#f76b1c')
  const [filterStatus, setFilterStatus] = useState<string>('REQUESTED')
  const [processingReturn, setProcessingReturn] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({})
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        try {
          setLoading(true)
          // SECURITY FIX: Use ONLY sessionStorage (tab-specific) - NO localStorage
          const { getUserEmail, getCompanyId } = await import('@/lib/utils/auth-storage')
          const storedCompanyId = getCompanyId()
          const userEmail = getUserEmail('company')
          
          // Check if user is Location Admin
          let locationAdminLocation = null
          if (userEmail) {
            locationAdminLocation = await getLocationByAdminEmail(userEmail)
            if (locationAdminLocation) {
              // Location Admins should not access this page
              window.location.href = '/dashboard/company/orders'
              return
            }
          }
          
          if (storedCompanyId) {
            setCompanyId(storedCompanyId)
            const companyDetails = await getCompanyById(storedCompanyId)
            if (companyDetails) {
              setCompanyPrimaryColor(companyDetails.primaryColor || '#f76b1c')
            }
            
            // Load return requests
            await loadReturnRequests(storedCompanyId)
          }
        } catch (error) {
          console.error('Error loading return requests:', error)
        } finally {
          setLoading(false)
        }
      }
      
      loadData()
    }
  }, [])

  const loadReturnRequests = async (companyId: string, status?: string) => {
    try {
      const url = `/api/returns/company?companyId=${encodeURIComponent(companyId)}${status ? `&status=${encodeURIComponent(status)}` : ''}`
      const response = await fetch(url)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Failed to load return requests:', errorData.error || `HTTP ${response.status}`)
        setReturnRequests([])
        return
      }
      
      const requests = await response.json()
      setReturnRequests(Array.isArray(requests) ? requests : [])
    } catch (error: any) {
      console.error('Error loading return requests:', error)
      setReturnRequests([])
    }
  }

  // Load ALL return requests for intelligence (no status filter)
  const loadAllReturnRequests = async (companyId: string) => {
    try {
      const url = `/api/returns/company?companyId=${encodeURIComponent(companyId)}`
      const response = await fetch(url)
      
      if (!response.ok) {
        setAllReturnRequests([])
        return
      }
      
      const requests = await response.json()
      setAllReturnRequests(Array.isArray(requests) ? requests : [])
    } catch (error: any) {
      console.error('Error loading all return requests for intelligence:', error)
      setAllReturnRequests([])
    }
  }

  useEffect(() => {
    if (companyId) {
      loadReturnRequests(companyId, filterStatus)
    }
  }, [filterStatus, companyId])

  // Load all requests for intelligence on mount
  useEffect(() => {
    if (companyId) {
      loadAllReturnRequests(companyId)
    }
  }, [companyId])

  // ============================================================================
  // INTELLIGENCE LAYER: Compute metrics
  // ============================================================================
  const intelligence = useMemo(() => {
    return computeReturnsIntelligence(allReturnRequests)
  }, [allReturnRequests])

  const handleApprove = async (returnRequestId: string) => {
    if (!confirm('Are you sure you want to approve this return request? A replacement order will be created.')) {
      return
    }

    setProcessingReturn(returnRequestId)
    try {
      // CRITICAL SECURITY FIX: Use only tab-specific auth storage
      const { getUserEmail } = await import('@/lib/utils/auth-storage')
      const userEmail = getUserEmail('company')
      const response = await fetch(`/api/returns/${returnRequestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          approvedBy: userEmail,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to approve return request')
      }

      const result = await response.json()
      alert(`Return request approved! Replacement order created: ${result.replacementOrder?.parentOrderId || result.replacementOrder?.id || 'N/A'}`)
      
      // Reload return requests
      await loadReturnRequests(companyId)
    } catch (error: any) {
      console.error('Error approving return request:', error)
      alert(`Error: ${error.message || 'Failed to approve return request'}`)
    } finally {
      setProcessingReturn(null)
    }
  }

  const handleReject = async (returnRequestId: string) => {
    const reason = rejectionReason[returnRequestId]?.trim()
    if (!reason) {
      alert('Please provide a rejection reason')
      return
    }

    if (!confirm('Are you sure you want to reject this return request?')) {
      return
    }

    setProcessingReturn(returnRequestId)
    try {
      // CRITICAL SECURITY FIX: Use only tab-specific auth storage
      const { getUserEmail } = await import('@/lib/utils/auth-storage')
      const userEmail = getUserEmail('company')
      const response = await fetch(`/api/returns/${returnRequestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          rejectedBy: userEmail,
          rejectionReason: reason,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to reject return request')
      }

      alert('Return request rejected successfully')
      
      // Close modal and clear reason
      setShowRejectModal(null)
      setRejectionReason(prev => {
        const newState = { ...prev }
        delete newState[returnRequestId]
        return newState
      })
      
      // Reload return requests
      await loadReturnRequests(companyId)
    } catch (error: any) {
      console.error('Error rejecting return request:', error)
      alert(`Error: ${error.message || 'Failed to reject return request'}`)
    } finally {
      setProcessingReturn(null)
    }
  }

  const formatDate = (date: any) => {
    if (!date) return 'N/A'
    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date
      if (isNaN(dateObj.getTime())) return 'N/A'
      return dateObj.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (error) {
      return 'N/A'
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'REQUESTED':
        return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">Pending Approval</span>
      case 'APPROVED':
        return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">Approved</span>
      case 'REJECTED':
        return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">Rejected</span>
      case 'COMPLETED':
        return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">Completed</span>
      default:
        return <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">{status}</span>
    }
  }

  if (loading) {
    return (
      <DashboardLayout actorType="company">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Clock className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading return requests...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="company">
      <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Return & Replacement Requests</h1>
            <p className="text-gray-600 mt-1">Review and approve/reject employee return requests</p>
          </div>
        </div>

        {/* Intelligence Panel */}
        {allReturnRequests.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            {/* Metrics Row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              {/* Total Returns */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500">Total Returns</span>
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
                <span className="text-2xl font-bold text-gray-900">{intelligence.totalReturns}</span>
                <p className="text-xs text-gray-500 mt-1">this week: {intelligence.returnsThisWeek}</p>
              </div>

              {/* Pending Returns */}
              <div className={`rounded-lg p-4 ${
                intelligence.pendingReturns >= 5 ? 'bg-red-50' : 'bg-yellow-50'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-medium ${
                    intelligence.pendingReturns >= 5 ? 'text-red-600' : 'text-yellow-600'
                  }`}>Pending</span>
                  <Clock className={`h-3 w-3 ${
                    intelligence.pendingReturns >= 5 ? 'text-red-500' : 'text-yellow-500'
                  }`} />
                </div>
                <span className={`text-2xl font-bold ${
                  intelligence.pendingReturns >= 5 ? 'text-red-700' : 'text-yellow-700'
                }`}>{intelligence.pendingReturns}</span>
                <p className="text-xs text-gray-500 mt-1">awaiting approval</p>
              </div>

              {/* Resolution Time */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500">Avg Resolution</span>
                  <Timer className="h-3 w-3 text-gray-400" />
                </div>
                <span className={`text-xl font-bold ${
                  intelligence.resolutionSpeed === 'fast' ? 'text-green-600' :
                  intelligence.resolutionSpeed === 'slow' ? 'text-red-600' : 'text-gray-900'
                }`}>
                  {intelligence.avgResolutionDays !== null 
                    ? `${intelligence.avgResolutionDays.toFixed(1)}d`
                    : 'N/A'}
                </span>
                <p className={`text-xs mt-1 ${
                  intelligence.resolutionSpeed === 'fast' ? 'text-green-600' :
                  intelligence.resolutionSpeed === 'slow' ? 'text-red-600' : 'text-gray-500'
                }`}>
                  {intelligence.resolutionSpeed === 'fast' ? '✓ Fast' :
                   intelligence.resolutionSpeed === 'slow' ? '⚠ Slow' : 'Normal'}
                </p>
              </div>

              {/* Top Reason */}
              {intelligence.topReasons.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-500">Top Reason</span>
                    {intelligence.reasonSpike?.reason === intelligence.topReasons[0].reason && (
                      <span className="text-xs text-red-600 font-medium">↑ Spike</span>
                    )}
                  </div>
                  <span className="text-sm font-bold text-gray-900 line-clamp-1">
                    {intelligence.topReasons[0].reason}
                  </span>
                  <p className="text-xs text-gray-500 mt-1">
                    {intelligence.topReasons[0].percentage.toFixed(0)}% of returns
                  </p>
                </div>
              )}

              {/* Health Status */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500">Returns Health</span>
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

            {/* Vendor Comparison (if multiple vendors) */}
            {intelligence.vendorMetrics.length > 1 && (
              <div className="border-t border-gray-100 pt-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-semibold text-gray-700">Returns by Vendor</span>
                  </div>
                  <span className="text-xs text-gray-500">{intelligence.vendorMetrics.length} vendors</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 px-2 font-semibold text-gray-600">Vendor</th>
                        <th className="text-center py-2 px-2 font-semibold text-gray-600">Total</th>
                        <th className="text-center py-2 px-2 font-semibold text-gray-600">Pending</th>
                        <th className="text-center py-2 px-2 font-semibold text-gray-600">Avg Resolution</th>
                        <th className="text-center py-2 px-2 font-semibold text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {intelligence.vendorMetrics.slice(0, 5).map((vendor, idx) => (
                        <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2 px-2 font-medium text-gray-900 truncate max-w-[150px]">{vendor.vendorName}</td>
                          <td className="py-2 px-2 text-center text-gray-700">{vendor.totalReturns}</td>
                          <td className={`py-2 px-2 text-center font-semibold ${
                            vendor.pendingReturns >= 3 ? 'text-red-600' :
                            vendor.pendingReturns >= 1 ? 'text-yellow-600' : 'text-gray-600'
                          }`}>{vendor.pendingReturns}</td>
                          <td className="py-2 px-2 text-center text-gray-600">
                            {vendor.avgResolutionDays !== null 
                              ? `${vendor.avgResolutionDays.toFixed(1)}d`
                              : '-'}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              vendor.healthTag === 'Healthy' ? 'bg-green-100 text-green-700' :
                              vendor.healthTag === 'Watchlist' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {vendor.healthTag}
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

        {/* Status Filter */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-700">Filter by Status:</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              style={{ 
                '--tw-ring-color': companyPrimaryColor || '#f76b1c',
              } as React.CSSProperties & { '--tw-ring-color'?: string }}
            >
              <option value="">All Status</option>
              <option value="REQUESTED">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
        </div>

        {/* Return Requests Grid */}
        {returnRequests.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">No Return Requests</h2>
            <p className="text-gray-600">
              {filterStatus 
                ? `No return requests with status "${filterStatus}"`
                : 'No return requests found for your company'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {returnRequests.map((request) => (
              <div key={request.returnRequestId} className="bg-white rounded-xl shadow-lg p-5 flex flex-col h-full border border-gray-100 hover:shadow-xl transition-shadow">
                {/* Header */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-base font-bold text-gray-900 truncate">
                      Return #{request.returnRequestId}
                    </h3>
                    {getStatusBadge(request.status)}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-gray-600 truncate">
                      <span className="font-medium">By:</span> {request.employeeId?.firstName} {request.employeeId?.lastName}
                    </p>
                    <p className="text-xs text-gray-600 truncate">
                      <span className="font-medium">Order:</span>{' '}
                      <a href="#" className="text-orange-600 hover:underline">#{request.originalOrderId}</a>
                    </p>
                    {request.vendorName && (
                      <p className="text-xs text-gray-600 truncate">
                        <span className="font-medium">Vendor:</span> {request.vendorName}
                      </p>
                    )}
                    {request.replacementOrderId && (
                      <p className="text-xs text-blue-600 truncate">
                        <span className="font-medium">Replacement:</span>{' '}
                        <a href="#" className="hover:underline">#{request.replacementOrderId}</a>
                      </p>
                    )}
                  </div>
                </div>

                {/* Product Details */}
                <div className="border-t border-gray-100 pt-4 mb-4 flex-grow">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Product</p>
                      <p className="text-sm font-semibold text-gray-900 truncate">{request.uniformName}</p>
                      <p className="text-xs text-gray-500">SKU: {request.productId}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Size Change</p>
                      <p className="text-sm text-gray-900">
                        <span className="font-semibold">{request.originalSize}</span>
                        <span className="mx-1">→</span>
                        <span className="font-semibold text-blue-600">{request.requestedSize}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">Quantity</p>
                      <p className="text-sm font-semibold text-gray-900">{request.requestedQty} item(s)</p>
                    </div>
                    {request.reason && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Reason</p>
                        <p className="text-sm text-gray-900">{request.reason}</p>
                      </div>
                    )}
                  </div>
                  
                  {request.comments && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-gray-500 mb-1">Comments</p>
                      <p className="text-xs text-gray-700 bg-gray-50 p-2 rounded-lg line-clamp-2">{request.comments}</p>
                    </div>
                  )}
                </div>

                {/* Timestamps */}
                <div className="border-t border-gray-100 pt-3 mb-3">
                  <div className="flex justify-between items-center text-xs">
                    <div>
                      <p className="text-gray-500">Requested on</p>
                      <p className="font-semibold text-gray-900">{formatDate(request.createdAt)}</p>
                    </div>
                    {request.approvedAt && (
                      <div className="text-right">
                        <p className="text-gray-500">
                          {request.status === 'APPROVED' || request.status === 'COMPLETED' ? 'Approved' : 'Rejected'} on
                        </p>
                        <p className="font-semibold text-gray-900">{formatDate(request.approvedAt)}</p>
                        {request.approvedBy && (
                          <p className="text-gray-500">by {request.approvedBy}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons - Only show for REQUESTED status */}
                {request.status === 'REQUESTED' && (
                  <div className="border-t border-gray-100 pt-3 flex space-x-2 mt-auto">
                    <button
                      onClick={() => handleApprove(request.returnRequestId)}
                      disabled={processingReturn === request.returnRequestId}
                      className="flex-1 flex items-center justify-center space-x-1 bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span>{processingReturn === request.returnRequestId ? 'Processing...' : 'Approve'}</span>
                    </button>
                    <button
                      onClick={() => setShowRejectModal(request.returnRequestId)}
                      disabled={processingReturn === request.returnRequestId}
                      className="flex-1 flex items-center justify-center space-x-1 bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      <XCircle className="h-4 w-4" />
                      <span>Reject</span>
                    </button>
                  </div>
                )}

                {/* Rejection Reason Modal */}
                {showRejectModal === request.returnRequestId && (
                  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                      <div className="p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Reject Return Request</h3>
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Rejection Reason <span className="text-red-500">*</span>
                          </label>
                          <textarea
                            value={rejectionReason[request.returnRequestId] || ''}
                            onChange={(e) => setRejectionReason(prev => ({
                              ...prev,
                              [request.returnRequestId]: e.target.value
                            }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                            rows={4}
                            placeholder="Please provide a reason for rejecting this return request..."
                            maxLength={500}
                          />
                        </div>
                        <div className="flex space-x-3">
                          <button
                            onClick={() => {
                              setShowRejectModal(null)
                              setRejectionReason(prev => {
                                const newState = { ...prev }
                                delete newState[request.returnRequestId]
                                return newState
                              })
                            }}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleReject(request.returnRequestId)}
                            disabled={!rejectionReason[request.returnRequestId]?.trim() || processingReturn === request.returnRequestId}
                            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                          >
                            {processingReturn === request.returnRequestId ? 'Processing...' : 'Confirm Rejection'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

