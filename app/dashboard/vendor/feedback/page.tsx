'use client'

import { useState, useEffect, useMemo } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Star, MessageSquare, Search, Filter, Building2, TrendingUp, TrendingDown, Minus, AlertTriangle, Lightbulb, Activity } from 'lucide-react'
import { getProductFeedback, getVendorById, getCompaniesByVendor } from '@/lib/data-mongodb'
import { maskEmployeeName } from '@/lib/utils/data-masking'

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
interface FeedbackIntelligence {
  // Core metrics
  avgRating: number
  totalFeedback: number
  ratingDistribution: { [key: number]: number }
  
  // Trends
  avgRatingLast7Days: number
  avgRatingLast30Days: number
  ratingTrend7Days: number // % change
  ratingTrend30Days: number // % change
  volumeTrend: 'increasing' | 'decreasing' | 'stable'
  
  // Volatility
  volatility: 'stable' | 'moderate' | 'fluctuating'
  standardDeviation: number
  
  // Quality indicators
  negativeRatingPercentage: number // 1-2 star %
  hasQualityRisk: boolean
  
  // Insights (auto-generated)
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
function computeFeedbackIntelligence(feedbackData: any[]): FeedbackIntelligence {
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
  
  // Volatility (standard deviation)
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
    feedbackData.length >= 5 // Only flag if sufficient sample
  
  // Generate insights
  const insights: Array<{ type: 'warning' | 'info' | 'success'; message: string; priority: number }> = []
  
  // Rating stability insight
  if (volatility === 'stable' && feedbackData.length >= 5) {
    insights.push({
      type: 'success',
      message: 'Ratings have remained stable over the review period',
      priority: 3
    })
  } else if (volatility === 'fluctuating') {
    insights.push({
      type: 'warning',
      message: 'Rating volatility detected – review recent feedback for patterns',
      priority: 1
    })
  }
  
  // Rating drop warning
  if (ratingTrend30Days < -INTELLIGENCE_CONFIG.RATING_DROP_ALERT_THRESHOLD) {
    insights.push({
      type: 'warning',
      message: `Avg rating dropped ${Math.abs(ratingTrend30Days).toFixed(0)}% compared to previous month`,
      priority: 1
    })
  } else if (ratingTrend30Days > INTELLIGENCE_CONFIG.RATING_DROP_ALERT_THRESHOLD) {
    insights.push({
      type: 'success',
      message: `Avg rating improved ${ratingTrend30Days.toFixed(0)}% compared to previous month`,
      priority: 2
    })
  }
  
  // Quality risk warning
  if (hasQualityRisk) {
    insights.push({
      type: 'warning',
      message: `High feedback volume with ${negativeRatingPercentage.toFixed(0)}% negative ratings indicates quality risk`,
      priority: 1
    })
  }
  
  // Volume insight
  if (volumeTrend === 'increasing' && last30DaysFeedback.length >= 5) {
    insights.push({
      type: 'info',
      message: 'Feedback volume is increasing – good customer engagement',
      priority: 3
    })
  }
  
  // Low rating warning
  if (avgRating < INTELLIGENCE_CONFIG.LOW_RATING_THRESHOLD && feedbackData.length >= 3) {
    insights.push({
      type: 'warning',
      message: `Overall rating (${avgRating.toFixed(1)}) is below acceptable threshold`,
      priority: 1
    })
  }
  
  // Sort by priority
  insights.sort((a, b) => a.priority - b.priority)
  
  // Determine health tag
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
    insights: insights.slice(0, 3), // Max 3 insights
    healthTag
  }
}

export default function VendorFeedbackPage() {
  const [feedback, setFeedback] = useState<any[]>([])
  const [allFeedback, setAllFeedback] = useState<any[]>([]) // Store all feedback before company filtering
  const [loading, setLoading] = useState(true)
  const [vendorPrimaryColor, setVendorPrimaryColor] = useState<string>('#2563eb')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterRating, setFilterRating] = useState<string>('all')
  // Company filter states
  const [companies, setCompanies] = useState<any[]>([])
  const [filterCompany, setFilterCompany] = useState<string>('all')
  const [companiesLoading, setCompaniesLoading] = useState(true)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        try {
          setLoading(true)
          // SECURITY FIX: Use sessionStorage only
          const { getVendorId } = await import('@/lib/utils/auth-storage')
          const vendorId = getVendorId()
          if (vendorId) {
            const vendor = await getVendorById(vendorId)
            if (vendor) {
              setVendorPrimaryColor(vendor.primaryColor || '#2563eb')
            }
            
            // Load companies for filter
            try {
              setCompaniesLoading(true)
              const vendorCompanies = await getCompaniesByVendor(vendorId)
              console.log('[Feedback] Loaded companies for vendor:', vendorCompanies.length)
              setCompanies(vendorCompanies)
            } catch (companyError) {
              console.error('[Feedback] Error loading companies:', companyError)
            } finally {
              setCompaniesLoading(false)
            }
          } else {
            setCompaniesLoading(false)
          }

          // Load feedback (vendor can see feedback for their products)
          // Backend automatically filters by vendorId based on logged-in vendor
          const feedbackData = await getProductFeedback()
          setAllFeedback(feedbackData) // Store all feedback
          setFeedback(feedbackData)
        } catch (error: any) {
          console.error('Error loading feedback:', error)
        } finally {
          setLoading(false)
        }
      }

      loadData()
    }
  }, [])

  // Effect to filter feedback when company filter changes
  useEffect(() => {
    if (allFeedback.length === 0) return
    
    if (filterCompany === 'all') {
      setFeedback(allFeedback)
    } else {
      const filtered = allFeedback.filter((fb: any) => {
        const fbCompanyId = fb.companyId?.id || fb.companyId
        return fbCompanyId === filterCompany
      })
      console.log(`[Feedback] Filtered to ${filtered.length} feedback items for company ${filterCompany}`)
      setFeedback(filtered)
    }
  }, [filterCompany, allFeedback])

  const filteredFeedback = feedback.filter((fb) => {
    const matchesSearch = 
      fb.orderId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fb.productId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fb.uniformId?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fb.comment?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesRating = filterRating === 'all' || fb.rating === parseInt(filterRating)
    
    return matchesSearch && matchesRating
  })

  // ============================================================================
  // INTELLIGENCE LAYER: Compute metrics for current filtered feedback
  // ============================================================================
  const intelligence = useMemo(() => {
    return computeFeedbackIntelligence(feedback)
  }, [feedback])

  if (loading) {
    return (
      <DashboardLayout actorType="vendor">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-gray-600">Loading feedback...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="vendor">
      <div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Product Feedback</h1>
          <p className="text-gray-600 mt-2">View feedback submitted by employees for your products</p>
        </div>

        {/* Intelligence Panel */}
        {feedback.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            {/* Metrics Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
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

              {/* Health Tag */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-500">Health Status</span>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-semibold ${
                  intelligence.healthTag === 'Healthy' ? 'bg-green-100 text-green-700' :
                  intelligence.healthTag === 'Watchlist' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                }`}>
                  {intelligence.healthTag}
                </span>
                {intelligence.negativeRatingPercentage > 20 && (
                  <p className="text-xs text-red-600 mt-1">{intelligence.negativeRatingPercentage.toFixed(0)}% negative</p>
                )}
              </div>
            </div>

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
                  '--tw-ring-color': vendorPrimaryColor || '#2563eb',
                  '--tw-border-color': vendorPrimaryColor || '#2563eb'
                } as React.CSSProperties & { '--tw-ring-color'?: string; '--tw-border-color'?: string }}
              />
            </div>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <select
                value={filterCompany}
                onChange={(e) => setFilterCompany(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none appearance-none bg-white"
                style={{ 
                  '--tw-ring-color': vendorPrimaryColor || '#2563eb',
                  '--tw-border-color': vendorPrimaryColor || '#2563eb'
                } as React.CSSProperties & { '--tw-ring-color'?: string; '--tw-border-color'?: string }}
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
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <select
                value={filterRating}
                onChange={(e) => setFilterRating(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none appearance-none bg-white"
                style={{ 
                  '--tw-ring-color': vendorPrimaryColor || '#2563eb',
                  '--tw-border-color': vendorPrimaryColor || '#2563eb'
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
          </div>
        </div>

        {/* Feedback List */}
        {filteredFeedback.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <MessageSquare className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">No Feedback Found</h2>
            <p className="text-gray-600">
              {searchTerm || filterRating !== 'all' 
                ? 'No feedback matches your search criteria.'
                : 'No feedback has been submitted for your products yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredFeedback.map((fb: any, index: number) => (
              <div key={fb._id || `${fb.orderId}-${fb.productId}-${fb.employeeId?._id || fb.employeeId || index}`} className="bg-white rounded-xl shadow-lg p-4 border-l-4 border-green-500 border border-gray-200 hover:shadow-xl transition-shadow flex flex-col">
                <div className="flex-1">
                  {/* Header with PO/PR Numbers */}
                  <div className="mb-3">
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      {fb.poNumber ? (
                        <h3 className="text-sm font-bold text-gray-900 truncate">PO: {fb.poNumber}</h3>
                      ) : (
                        <h3 className="text-sm font-bold text-gray-900 truncate">{fb.uniformId?.name || fb.productId}</h3>
                      )}
                    </div>
                    {fb.prNumber && (
                      <p className="text-xs text-gray-600 truncate mb-1">PR: {fb.prNumber}</p>
                    )}
                    <p className="text-xs text-gray-600 truncate">Employee: {maskEmployeeName(
                      fb.employeeId?.firstName && fb.employeeId?.lastName
                        ? `${fb.employeeId.firstName} ${fb.employeeId.lastName}`
                        : 'N/A'
                    )}</p>
                  </div>
                  
                  {/* Product Name */}
                  <div className="border-t pt-3 mb-3">
                    <h4 className="text-xs font-semibold text-gray-900 mb-1.5">Product:</h4>
                    <p className="text-xs text-gray-700 line-clamp-2">{fb.uniformId?.name || fb.productId}</p>
                  </div>
                  
                  {/* Rating */}
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
                  
                  {/* Comment */}
                  {fb.comment && (
                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                      <div className="flex items-start space-x-2">
                        <MessageSquare className="h-3 w-3 text-gray-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-gray-700 line-clamp-3">{fb.comment}</p>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Footer with Date */}
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
        )}
      </div>
    </DashboardLayout>
  )
}

