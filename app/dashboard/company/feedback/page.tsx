'use client'

import { useState, useEffect, useMemo } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Star, MessageSquare, Search, Filter, ChevronDown, ChevronRight, Building2, TrendingUp, TrendingDown, Minus, AlertTriangle, Lightbulb, Activity, Award, Users } from 'lucide-react'
import { getProductFeedback, getCompanyById, getLocationByAdminEmail } from '@/lib/data-mongodb'

// ============================================================================
// INTELLIGENCE LAYER: CONFIGURATION & THRESHOLDS
// ============================================================================
const INTELLIGENCE_CONFIG = {
  // Rating thresholds
  RATING_DROP_ALERT_THRESHOLD: 10, // % drop triggers warning
  LOW_RATING_THRESHOLD: 3.0, // Below this is considered poor
  NEGATIVE_RATING_THRESHOLD: 30, // % of 1-2 star ratings triggers warning
  
  // Volatility detection (standard deviation)
  VOLATILITY_STABLE_THRESHOLD: 0.5,
  VOLATILITY_MODERATE_THRESHOLD: 1.0,
  
  // Time periods
  RECENT_PERIOD_DAYS: 7,
  COMPARISON_PERIOD_DAYS: 30,
}

// ============================================================================
// INTELLIGENCE LAYER: TYPES
// ============================================================================
interface VendorIntelligence {
  vendorName: string
  avgRating: number
  totalFeedback: number
  ratingTrend30Days: number
  negativeRatingPercentage: number
  healthTag: 'Healthy' | 'Watchlist' | 'At Risk'
}

interface CompanyFeedbackIntelligence {
  // Core metrics
  avgRating: number
  totalFeedback: number
  ratingDistribution: { [key: number]: number }
  
  // Trends
  avgRatingLast7Days: number
  avgRatingLast30Days: number
  ratingTrend7Days: number
  ratingTrend30Days: number
  volumeTrend: 'increasing' | 'decreasing' | 'stable'
  
  // Volatility
  volatility: 'stable' | 'moderate' | 'fluctuating'
  standardDeviation: number
  
  // Quality indicators
  negativeRatingPercentage: number
  hasQualityRisk: boolean
  
  // Vendor comparison (Company Admin specific)
  vendorComparison: VendorIntelligence[]
  bestVendor: VendorIntelligence | null
  worstVendor: VendorIntelligence | null
  
  // Insights
  insights: Array<{
    type: 'warning' | 'info' | 'success'
    message: string
    priority: number
  }>
  
  // Health tag
  healthTag: 'Healthy' | 'Watchlist' | 'At Risk'
}

// ============================================================================
// INTELLIGENCE LAYER: COMPUTATION FUNCTIONS
// ============================================================================
function computeCompanyFeedbackIntelligence(feedbackData: any[]): CompanyFeedbackIntelligence {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - (INTELLIGENCE_CONFIG.RECENT_PERIOD_DAYS * 24 * 60 * 60 * 1000))
  const thirtyDaysAgo = new Date(now.getTime() - (INTELLIGENCE_CONFIG.COMPARISON_PERIOD_DAYS * 24 * 60 * 60 * 1000))
  const previousThirtyDaysStart = new Date(thirtyDaysAgo.getTime() - (INTELLIGENCE_CONFIG.COMPARISON_PERIOD_DAYS * 24 * 60 * 60 * 1000))
  
  // Rating distribution
  const ratingDistribution: { [key: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  feedbackData.forEach(fb => {
    if (fb.rating >= 1 && fb.rating <= 5) {
      ratingDistribution[fb.rating]++
    }
  })
  
  // Average rating
  const avgRating = feedbackData.length > 0
    ? feedbackData.reduce((sum, fb) => sum + (fb.rating || 0), 0) / feedbackData.length
    : 0
  
  // Recent period ratings
  const last7DaysFeedback = feedbackData.filter(fb => {
    const date = fb.createdAt ? new Date(fb.createdAt) : null
    return date && date >= sevenDaysAgo
  })
  const last30DaysFeedback = feedbackData.filter(fb => {
    const date = fb.createdAt ? new Date(fb.createdAt) : null
    return date && date >= thirtyDaysAgo
  })
  const previous30DaysFeedback = feedbackData.filter(fb => {
    const date = fb.createdAt ? new Date(fb.createdAt) : null
    return date && date >= previousThirtyDaysStart && date < thirtyDaysAgo
  })
  
  const avgRatingLast7Days = last7DaysFeedback.length > 0
    ? last7DaysFeedback.reduce((sum, fb) => sum + (fb.rating || 0), 0) / last7DaysFeedback.length
    : avgRating
  
  const avgRatingLast30Days = last30DaysFeedback.length > 0
    ? last30DaysFeedback.reduce((sum, fb) => sum + (fb.rating || 0), 0) / last30DaysFeedback.length
    : avgRating
  
  const avgRatingPrevious30Days = previous30DaysFeedback.length > 0
    ? previous30DaysFeedback.reduce((sum, fb) => sum + (fb.rating || 0), 0) / previous30DaysFeedback.length
    : avgRatingLast30Days
  
  // Trend calculations
  const ratingTrend7Days = avgRatingLast30Days > 0
    ? ((avgRatingLast7Days - avgRatingLast30Days) / avgRatingLast30Days) * 100
    : 0
  const ratingTrend30Days = avgRatingPrevious30Days > 0
    ? ((avgRatingLast30Days - avgRatingPrevious30Days) / avgRatingPrevious30Days) * 100
    : 0
  
  // Volume trend
  const volumeTrend: 'increasing' | 'decreasing' | 'stable' = 
    last30DaysFeedback.length > previous30DaysFeedback.length * 1.1 ? 'increasing' :
    last30DaysFeedback.length < previous30DaysFeedback.length * 0.9 ? 'decreasing' : 'stable'
  
  // Volatility
  const ratings = feedbackData.map(fb => fb.rating || 0).filter(r => r > 0)
  const mean = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0
  const squaredDiffs = ratings.map(r => Math.pow(r - mean, 2))
  const standardDeviation = ratings.length > 1
    ? Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (ratings.length - 1))
    : 0
  
  const volatility: 'stable' | 'moderate' | 'fluctuating' = 
    standardDeviation <= INTELLIGENCE_CONFIG.VOLATILITY_STABLE_THRESHOLD ? 'stable' :
    standardDeviation <= INTELLIGENCE_CONFIG.VOLATILITY_MODERATE_THRESHOLD ? 'moderate' : 'fluctuating'
  
  // Negative rating percentage
  const negativeCount = ratingDistribution[1] + ratingDistribution[2]
  const negativeRatingPercentage = feedbackData.length > 0
    ? (negativeCount / feedbackData.length) * 100
    : 0
  
  const hasQualityRisk = negativeRatingPercentage >= INTELLIGENCE_CONFIG.NEGATIVE_RATING_THRESHOLD &&
    feedbackData.length >= 5
  
  // ============================================================================
  // VENDOR COMPARISON (Company Admin specific feature)
  // ============================================================================
  const vendorMap = new Map<string, { name: string; ratings: number[]; feedback: any[] }>()
  
  feedbackData.forEach(fb => {
    const vendorId = fb.vendorId?._id || fb.vendorId?.id || fb.vendorId || 'unknown'
    const vendorName = fb.vendorId?.name || 'Unknown Vendor'
    
    if (!vendorMap.has(vendorId)) {
      vendorMap.set(vendorId, { name: vendorName, ratings: [], feedback: [] })
    }
    
    const vendorData = vendorMap.get(vendorId)!
    if (fb.rating) {
      vendorData.ratings.push(fb.rating)
    }
    vendorData.feedback.push(fb)
  })
  
  const vendorComparison: VendorIntelligence[] = Array.from(vendorMap.entries())
    .filter(([_, data]) => data.ratings.length > 0)
    .map(([_, data]) => {
      const vendorAvg = data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length
      const vendorNegative = data.ratings.filter(r => r <= 2).length / data.ratings.length * 100
      
      // Calculate vendor trend
      const vendorLast30 = data.feedback.filter(fb => {
        const date = fb.createdAt ? new Date(fb.createdAt) : null
        return date && date >= thirtyDaysAgo
      })
      const vendorPrev30 = data.feedback.filter(fb => {
        const date = fb.createdAt ? new Date(fb.createdAt) : null
        return date && date >= previousThirtyDaysStart && date < thirtyDaysAgo
      })
      
      const last30Avg = vendorLast30.length > 0
        ? vendorLast30.reduce((sum, fb) => sum + (fb.rating || 0), 0) / vendorLast30.length
        : vendorAvg
      const prev30Avg = vendorPrev30.length > 0
        ? vendorPrev30.reduce((sum, fb) => sum + (fb.rating || 0), 0) / vendorPrev30.length
        : last30Avg
      
      const vendorTrend = prev30Avg > 0 ? ((last30Avg - prev30Avg) / prev30Avg) * 100 : 0
      
      // Determine vendor health
      let vendorHealth: 'Healthy' | 'Watchlist' | 'At Risk' = 'Healthy'
      if (vendorNegative >= 30 || vendorAvg < 2.5) {
        vendorHealth = 'At Risk'
      } else if (vendorNegative >= 20 || vendorAvg < 3.0 || vendorTrend < -15) {
        vendorHealth = 'Watchlist'
      }
      
      return {
        vendorName: data.name,
        avgRating: vendorAvg,
        totalFeedback: data.ratings.length,
        ratingTrend30Days: vendorTrend,
        negativeRatingPercentage: vendorNegative,
        healthTag: vendorHealth
      }
    })
    .sort((a, b) => b.avgRating - a.avgRating)
  
  const bestVendor = vendorComparison.length > 0 ? vendorComparison[0] : null
  const worstVendor = vendorComparison.length > 1 ? vendorComparison[vendorComparison.length - 1] : null
  
  // Generate insights
  const insights: Array<{ type: 'warning' | 'info' | 'success'; message: string; priority: number }> = []
  
  // Vendor-specific insights for Company Admin
  if (worstVendor && worstVendor.healthTag === 'At Risk') {
    insights.push({
      type: 'warning',
      message: `${worstVendor.vendorName} has ${worstVendor.negativeRatingPercentage.toFixed(0)}% negative ratings – review required`,
      priority: 1
    })
  }
  
  if (bestVendor && bestVendor.avgRating >= 4.5 && bestVendor.totalFeedback >= 5) {
    insights.push({
      type: 'success',
      message: `${bestVendor.vendorName} is top performer with ${bestVendor.avgRating.toFixed(1)} avg rating`,
      priority: 2
    })
  }
  
  // Rating drop warning
  if (ratingTrend30Days < -INTELLIGENCE_CONFIG.RATING_DROP_ALERT_THRESHOLD) {
    insights.push({
      type: 'warning',
      message: `Overall rating dropped ${Math.abs(ratingTrend30Days).toFixed(0)}% compared to previous month`,
      priority: 1
    })
  }
  
  // Quality risk warning
  if (hasQualityRisk) {
    insights.push({
      type: 'warning',
      message: `${negativeRatingPercentage.toFixed(0)}% of all feedback is negative – quality intervention needed`,
      priority: 1
    })
  }
  
  // Stability insight
  if (volatility === 'stable' && feedbackData.length >= 10) {
    insights.push({
      type: 'success',
      message: 'Product quality ratings are consistent across vendors',
      priority: 3
    })
  }
  
  insights.sort((a, b) => a.priority - b.priority)
  
  // Determine overall health tag
  let healthTag: 'Healthy' | 'Watchlist' | 'At Risk' = 'Healthy'
  if (hasQualityRisk || avgRating < 2.5) {
    healthTag = 'At Risk'
  } else if (volatility === 'fluctuating' || avgRating < INTELLIGENCE_CONFIG.LOW_RATING_THRESHOLD || 
             ratingTrend30Days < -INTELLIGENCE_CONFIG.RATING_DROP_ALERT_THRESHOLD) {
    healthTag = 'Watchlist'
  }
  
  return {
    avgRating,
    totalFeedback: feedbackData.length,
    ratingDistribution,
    avgRatingLast7Days,
    avgRatingLast30Days,
    ratingTrend7Days,
    ratingTrend30Days,
    volumeTrend,
    volatility,
    standardDeviation,
    negativeRatingPercentage,
    hasQualityRisk,
    vendorComparison,
    bestVendor,
    worstVendor,
    insights: insights.slice(0, 3),
    healthTag
  }
}

export default function CompanyFeedbackPage() {
  console.log('[CompanyFeedbackPage] Component mounted/rendered')
  
  const [feedback, setFeedback] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [companyPrimaryColor, setCompanyPrimaryColor] = useState<string>('#f76b1c')
  const [isLocationAdmin, setIsLocationAdmin] = useState<boolean>(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterRating, setFilterRating] = useState<string>('all')
  const [filterVendor, setFilterVendor] = useState<string>('all')
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set())

  useEffect(() => {
    console.log('[CompanyFeedbackPage] useEffect triggered')
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        try {
          setLoading(true)
          // CRITICAL SECURITY FIX: Use only tab-specific auth storage
          const { getUserEmail } = await import('@/lib/utils/auth-storage')
          const userEmail = getUserEmail('company')
          if (!userEmail) {
            setAccessDenied(true)
            setLoading(false)
            return
          }

          // SECURITY: Check if user is Location Admin - if so, redirect to consumer feedback page
          const location = await getLocationByAdminEmail(userEmail)
          const isLocationAdminUser = !!location
          setIsLocationAdmin(isLocationAdminUser)

          if (isLocationAdminUser && location) {
            // SECURITY: Location Admins should NOT access company admin pages
            // Redirect them to the consumer feedback page instead
            console.warn('[CompanyFeedbackPage] SECURITY: Location Admin attempting to access company admin page - redirecting to consumer feedback')
            if (typeof window !== 'undefined') {
              window.location.href = '/dashboard/consumer/feedback'
              return
            }
          }

          // Only Company Admins should reach this point - Location Admins have been redirected
          // SECURITY FIX: Use sessionStorage only
          const { getCompanyId: getCompanyIdAuth } = await import('@/lib/utils/auth-storage')
          const storedCompanyId = getCompanyIdAuth()
          if (storedCompanyId) {
            const company = await getCompanyById(storedCompanyId)
            if (company) {
              setCompanyPrimaryColor(company.primaryColor || '#f76b1c')
            }
          }
          
          console.log('[CompanyFeedbackPage] Company Admin - proceeding to load feedback')

          // Load feedback
          console.log('[CompanyFeedbackPage] About to call getProductFeedback API')
          try {
            const feedbackData = await getProductFeedback()
            console.log(`[CompanyFeedbackPage] ✅ Loaded ${feedbackData.length} feedback records from API`)
            console.log(`[CompanyFeedbackPage] Feedback vendor breakdown:`, 
              feedbackData.map((fb: any) => ({
                orderId: fb.orderId,
                productId: fb.productId,
                uniformName: fb.uniformId?.name,
                vendorName: fb.vendorId?.name || 'Unknown',
                vendorId: fb.vendorId?._id || fb.vendorId || 'null',
                hasVendorId: !!fb.vendorId,
                employeeName: fb.employeeId?.firstName && fb.employeeId?.lastName
                  ? `${fb.employeeId.firstName} ${fb.employeeId.lastName}`
                  : fb.employeeId?.firstName || fb.employeeId?.lastName || 'N/A',
                hasEmployeeData: !!fb.employeeId
              }))
            )
            setFeedback(feedbackData)
            
            // Mark all feedback as viewed when page loads
            if (storedCompanyId && feedbackData.length > 0) {
              try {
                const response = await fetch('/api/feedback/mark-viewed', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    companyId: storedCompanyId,
                    adminEmail: userEmail
                  })
                })
                if (response.ok) {
                  console.log('[CompanyFeedbackPage] ✅ Marked feedback as viewed')
                  // Trigger badge count refresh by dispatching custom event
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('refreshBadgeCounts'))
                  }
                }
              } catch (markError: any) {
                console.error('[CompanyFeedbackPage] Error marking feedback as viewed:', markError)
                // Don't block the page if marking fails
              }
            }
          } catch (feedbackError: any) {
            console.error('[CompanyFeedbackPage] Error loading feedback:', feedbackError)
            console.error('[CompanyFeedbackPage] Error details:', {
              message: feedbackError.message,
              stack: feedbackError.stack,
              name: feedbackError.name
            })
            // Don't set accessDenied for API errors - let user see the page
            setFeedback([])
          }
        } catch (error: any) {
          console.error('[CompanyFeedbackPage] Error in loadData:', error)
          console.error('[CompanyFeedbackPage] Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
          })
          if (error.message?.includes('not found') || error.message?.includes('access')) {
            setAccessDenied(true)
          }
        } finally {
          setLoading(false)
          console.log('[CompanyFeedbackPage] loadData completed, loading set to false')
        }
      }

      loadData()
    }
  }, [])

  // Get unique vendors for filter dropdown
  const uniqueVendors = Array.from(
    new Set(
      feedback
        .map((fb) => fb.vendorId?.name || 'Unknown Vendor')
        .filter((name) => name !== 'Unknown Vendor' || feedback.some((fb) => !fb.vendorId?.name))
    )
  ).sort()

  const filteredFeedback = feedback.filter((fb) => {
    const matchesSearch = 
      fb.orderId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fb.productId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fb.uniformId?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fb.employeeId?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fb.employeeId?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fb.comment?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fb.vendorId?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesRating = filterRating === 'all' || fb.rating === parseInt(filterRating)
    const matchesVendor = filterVendor === 'all' || (fb.vendorId?.name || 'Unknown Vendor') === filterVendor
    
    return matchesSearch && matchesRating && matchesVendor
  })

  // ============================================================================
  // INTELLIGENCE LAYER: Compute metrics for Company Admin
  // ============================================================================
  const intelligence = useMemo(() => {
    return computeCompanyFeedbackIntelligence(feedback)
  }, [feedback])

  // Group feedback by vendor
  const groupedFeedback = filteredFeedback.reduce((acc, fb) => {
    const vendorName = fb.vendorId?.name || 'Unknown Vendor'
    if (!acc[vendorName]) {
      acc[vendorName] = []
    }
    acc[vendorName].push(fb)
    return acc
  }, {} as Record<string, typeof filteredFeedback>)
  
  // Debug: Log grouping results
  console.log(`[CompanyFeedbackPage] Filtered feedback count: ${filteredFeedback.length}`)
  console.log(`[CompanyFeedbackPage] Grouped feedback:`, 
    Object.entries(groupedFeedback).map(([vendor, feedbacks]) => ({
      vendor,
      count: feedbacks.length,
      orderIds: feedbacks.map((fb: any) => fb.orderId)
    }))
  )

  // Initialize expanded vendors (expand all by default) when feedback is first loaded
  useEffect(() => {
    const vendorKeys = Object.keys(groupedFeedback)
    if (vendorKeys.length > 0) {
      // Only initialize if we don't have any expanded vendors yet
      // or if the vendor list has changed significantly
      const currentVendors = Array.from(expandedVendors)
      const newVendors = vendorKeys.filter(v => !currentVendors.includes(v))
      if (expandedVendors.size === 0 || newVendors.length > 0) {
        setExpandedVendors(new Set(vendorKeys))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback.length, filterVendor]) // Re-initialize when feedback loads or vendor filter changes

  const toggleVendor = (vendorName: string) => {
    setExpandedVendors((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(vendorName)) {
        newSet.delete(vendorName)
      } else {
        newSet.add(vendorName)
      }
      return newSet
    })
  }

  if (loading) {
    return (
      <DashboardLayout actorType="company">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-gray-600">Loading feedback...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (accessDenied) {
    return (
      <DashboardLayout actorType="company">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-red-600 font-semibold">Access Denied</p>
            <p className="text-gray-600 mt-2">
              {isLocationAdmin 
                ? 'Location Admins do not have access to view feedback. Please contact Company Admin to enable this feature.'
                : 'You are not authorized to view this page.'}
            </p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="company">
      <div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Product Feedback</h1>
          <p className="text-gray-600 mt-2">View feedback submitted by employees for delivered products</p>
        </div>

        {/* Intelligence Panel */}
        {feedback.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            {/* Metrics Row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              {/* Average Rating with Trend */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500">Avg Rating</span>
                  <div className={`flex items-center gap-0.5 text-xs font-medium ${
                    intelligence.ratingTrend30Days > 5 ? 'text-green-600' :
                    intelligence.ratingTrend30Days < -5 ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    {intelligence.ratingTrend30Days > 5 ? <TrendingUp className="h-3 w-3" /> :
                     intelligence.ratingTrend30Days < -5 ? <TrendingDown className="h-3 w-3" /> :
                     <Minus className="h-3 w-3" />}
                    <span>{Math.abs(intelligence.ratingTrend30Days).toFixed(0)}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-gray-900">{intelligence.avgRating.toFixed(1)}</span>
                  <div className="flex items-center">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-3 w-3 ${
                          star <= Math.round(intelligence.avgRating)
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">vs last 30 days</p>
              </div>

              {/* Feedback Volume */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500">Total Feedback</span>
                  <span className={`text-xs font-medium ${
                    intelligence.volumeTrend === 'increasing' ? 'text-green-600' :
                    intelligence.volumeTrend === 'decreasing' ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    {intelligence.volumeTrend === 'increasing' ? '↑ Growing' :
                     intelligence.volumeTrend === 'decreasing' ? '↓ Declining' : '→ Stable'}
                  </span>
                </div>
                <span className="text-2xl font-bold text-gray-900">{intelligence.totalFeedback}</span>
                <p className="text-xs text-gray-500 mt-1">reviews received</p>
              </div>

              {/* Rating Volatility */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500">Consistency</span>
                  <Activity className="h-3 w-3 text-gray-400" />
                </div>
                <span className={`text-lg font-bold ${
                  intelligence.volatility === 'stable' ? 'text-green-600' :
                  intelligence.volatility === 'moderate' ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {intelligence.volatility === 'stable' ? 'Stable' :
                   intelligence.volatility === 'moderate' ? 'Moderate' : 'Fluctuating'}
                </span>
                <p className="text-xs text-gray-500 mt-1">σ = {intelligence.standardDeviation.toFixed(2)}</p>
              </div>

              {/* Best Vendor (Company Admin specific) */}
              {intelligence.bestVendor && (
                <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-green-700">Top Vendor</span>
                    <Award className="h-3 w-3 text-green-600" />
                  </div>
                  <span className="text-sm font-bold text-green-800 line-clamp-1">{intelligence.bestVendor.vendorName}</span>
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span className="text-xs font-semibold text-green-700">{intelligence.bestVendor.avgRating.toFixed(1)}</span>
                    <span className="text-xs text-green-600">({intelligence.bestVendor.totalFeedback})</span>
                  </div>
                </div>
              )}

              {/* Worst Vendor (Company Admin specific) */}
              {intelligence.worstVendor && intelligence.worstVendor.vendorName !== intelligence.bestVendor?.vendorName && (
                <div className={`rounded-lg p-4 border ${
                  intelligence.worstVendor.healthTag === 'At Risk' 
                    ? 'bg-red-50 border-red-100' 
                    : intelligence.worstVendor.healthTag === 'Watchlist'
                    ? 'bg-yellow-50 border-yellow-100'
                    : 'bg-gray-50 border-gray-100'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${
                      intelligence.worstVendor.healthTag === 'At Risk' ? 'text-red-700' :
                      intelligence.worstVendor.healthTag === 'Watchlist' ? 'text-yellow-700' : 'text-gray-500'
                    }`}>Needs Attention</span>
                    {intelligence.worstVendor.healthTag === 'At Risk' && <AlertTriangle className="h-3 w-3 text-red-600" />}
                  </div>
                  <span className={`text-sm font-bold line-clamp-1 ${
                    intelligence.worstVendor.healthTag === 'At Risk' ? 'text-red-800' :
                    intelligence.worstVendor.healthTag === 'Watchlist' ? 'text-yellow-800' : 'text-gray-800'
                  }`}>{intelligence.worstVendor.vendorName}</span>
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span className={`text-xs font-semibold ${
                      intelligence.worstVendor.healthTag === 'At Risk' ? 'text-red-700' :
                      intelligence.worstVendor.healthTag === 'Watchlist' ? 'text-yellow-700' : 'text-gray-700'
                    }`}>{intelligence.worstVendor.avgRating.toFixed(1)}</span>
                    <span className="text-xs text-gray-500">({intelligence.worstVendor.negativeRatingPercentage.toFixed(0)}% neg)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Vendor Comparison Table (Company Admin specific) */}
            {intelligence.vendorComparison.length > 2 && (
              <div className="border-t border-gray-100 pt-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-semibold text-gray-700">Vendor Performance Comparison</span>
                  </div>
                  <span className="text-xs text-gray-500">{intelligence.vendorComparison.length} vendors</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 px-2 font-semibold text-gray-600">Vendor</th>
                        <th className="text-center py-2 px-2 font-semibold text-gray-600">Rating</th>
                        <th className="text-center py-2 px-2 font-semibold text-gray-600">Trend</th>
                        <th className="text-center py-2 px-2 font-semibold text-gray-600">Feedback</th>
                        <th className="text-center py-2 px-2 font-semibold text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {intelligence.vendorComparison.slice(0, 5).map((vendor, idx) => (
                        <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2 px-2 font-medium text-gray-900 truncate max-w-[150px]">{vendor.vendorName}</td>
                          <td className="py-2 px-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              <span className="font-semibold">{vendor.avgRating.toFixed(1)}</span>
                            </div>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className={`flex items-center justify-center gap-0.5 ${
                              vendor.ratingTrend30Days > 5 ? 'text-green-600' :
                              vendor.ratingTrend30Days < -5 ? 'text-red-600' : 'text-gray-500'
                            }`}>
                              {vendor.ratingTrend30Days > 5 ? <TrendingUp className="h-3 w-3" /> :
                               vendor.ratingTrend30Days < -5 ? <TrendingDown className="h-3 w-3" /> :
                               <Minus className="h-3 w-3" />}
                              {Math.abs(vendor.ratingTrend30Days).toFixed(0)}%
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center text-gray-600">{vendor.totalFeedback}</td>
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
                      {insight.type === 'success' && <TrendingUp className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />}
                      {insight.type === 'info' && <Lightbulb className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />}
                      <span>{insight.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search feedback..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                style={{ 
                  '--tw-ring-color': companyPrimaryColor || '#f76b1c',
                  '--tw-border-color': companyPrimaryColor || '#f76b1c'
                } as React.CSSProperties & { '--tw-ring-color'?: string; '--tw-border-color'?: string }}
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <select
                value={filterRating}
                onChange={(e) => setFilterRating(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                style={{ 
                  '--tw-ring-color': companyPrimaryColor || '#f76b1c',
                  '--tw-border-color': companyPrimaryColor || '#f76b1c'
                } as React.CSSProperties & { '--tw-ring-color'?: string; '--tw-border-color'?: string }}
              >
                <option value="all">All Ratings</option>
                <option value="5">5 Stars</option>
                <option value="4">4 Stars</option>
                <option value="3">3 Stars</option>
                <option value="2">2 Stars</option>
                <option value="1">1 Star</option>
              </select>
            </div>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <select
                value={filterVendor}
                onChange={(e) => setFilterVendor(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                style={{ 
                  '--tw-ring-color': companyPrimaryColor || '#f76b1c',
                  '--tw-border-color': companyPrimaryColor || '#f76b1c'
                } as React.CSSProperties & { '--tw-ring-color'?: string; '--tw-border-color'?: string }}
              >
                <option value="all">All Vendors</option>
                {uniqueVendors.map((vendor) => (
                  <option key={vendor} value={vendor}>
                    {vendor}
                  </option>
                ))}
                {feedback.some((fb) => !fb.vendorId?.name) && (
                  <option value="Unknown Vendor">Unknown Vendor</option>
                )}
              </select>
            </div>
          </div>
        </div>

        {/* Feedback List */}
        {filteredFeedback.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <MessageSquare className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">No Feedback Found</h2>
            <p className="text-gray-600">
              {searchTerm || filterRating !== 'all' || filterVendor !== 'all'
                ? 'No feedback matches your search criteria.'
                : 'No feedback has been submitted yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedFeedback)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([vendorName, vendorFeedback]) => {
                const isExpanded = expandedVendors.has(vendorName)
                return (
                  <div key={vendorName} className="bg-white rounded-xl shadow-lg overflow-hidden">
                    {/* Vendor Header - Collapsible */}
                    <button
                      onClick={() => toggleVendor(vendorName)}
                      className="w-full px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 transition-colors flex items-center justify-between border-b border-gray-200"
                    >
                      <div className="flex items-center space-x-3">
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5 text-gray-600" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-gray-600" />
                        )}
                        <Building2 className="h-5 w-5 text-gray-600" />
                        <h2 className="text-lg font-bold text-gray-900">{vendorName}</h2>
                        <span className="text-sm text-gray-500 bg-white px-2 py-1 rounded-full">
                          {vendorFeedback.length} feedback{vendorFeedback.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </button>

                    {/* Vendor Feedback Items */}
                    {isExpanded && (
                      <div className="p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                          {vendorFeedback.map((fb: any, index: number) => (
                            <div key={fb._id || `${fb.orderId}-${fb.productId}-${fb.employeeId?._id || fb.employeeId || index}`} className="bg-white rounded-lg shadow-md p-4 border border-gray-200 hover:shadow-lg transition-shadow flex flex-col">
                              <div className="flex-1">
                                <div className="mb-3">
                                  <p className="text-xs text-gray-500 mb-1">Order #{fb.orderId}</p>
                                  <h3 className="text-sm font-semibold text-gray-900 mb-2 line-clamp-2">
                                    {fb.uniformId?.name || fb.productId}
                                  </h3>
                                  <p className="text-xs text-gray-600 mb-3">
                                    Employee: {fb.employeeId?.firstName && fb.employeeId?.lastName
                                      ? `${fb.employeeId.firstName} ${fb.employeeId.lastName}`
                                      : fb.employeeId?.firstName || fb.employeeId?.lastName || 'N/A'}
                                  </p>
                                </div>
                                
                                <div className="flex items-center space-x-1 mb-3">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <Star
                                      key={star}
                                      className={`h-4 w-4 ${
                                        star <= fb.rating
                                          ? 'fill-yellow-400 text-yellow-400'
                                          : 'text-gray-300'
                                      }`}
                                    />
                                  ))}
                                  <span className="ml-1 text-xs font-semibold text-gray-700">
                                    {fb.rating}/5
                                  </span>
                                </div>
                                
                                {fb.comment && (
                                  <div className="bg-gray-50 rounded-lg p-3 mb-3">
                                    <div className="flex items-start space-x-2">
                                      <MessageSquare className="h-3 w-3 text-gray-500 mt-0.5 flex-shrink-0" />
                                      <p className="text-xs text-gray-700 line-clamp-3">{fb.comment}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                              
                              <div className="mt-auto pt-3 border-t border-gray-200">
                                <p className="text-xs text-gray-500">
                                  {fb.createdAt 
                                    ? new Date(fb.createdAt).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                      })
                                    : 'N/A'}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

