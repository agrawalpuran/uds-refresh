'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/DashboardLayout'
import { CheckCircle, XCircle, Clock, Package, User, Calendar, ShoppingBag, MapPin, X, FileText } from 'lucide-react'
import { 
  getPendingApprovalsForSiteAdmin,
  getApprovedPRsForSiteAdmin,
  getAllPRsForSiteAdmin,
  approveOrder,
  bulkApproveOrders,
  getLocationByAdminEmail
} from '@/lib/data-mongodb'

type TabType = 'pending' | 'approved' | 'all-prs'

export default function SiteAdminApprovalsPage() {
  const [pendingOrders, setPendingOrders] = useState<any[]>([])
  const [approvedOrders, setApprovedOrders] = useState<any[]>([])
  const [allPRs, setAllPRs] = useState<any[]>([])
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [bulkApproving, setBulkApproving] = useState(false)
  const [location, setLocation] = useState<any>(null)
  const [showPRModal, setShowPRModal] = useState(false)
  const [showBulkPRModal, setShowBulkPRModal] = useState(false)
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null)
  const [prNumber, setPrNumber] = useState<string>('')
  const [prDate, setPrDate] = useState<string>('')
  // For bulk approval: single PR Number and Date applied to all orders
  const [bulkPRNumber, setBulkPRNumber] = useState<string>('')
  const [bulkPRDate, setBulkPRDate] = useState<string>('')
  const [bulkPRData, setBulkPRData] = useState<Map<string, { prNumber: string, prDate: string }>>(new Map())
  const [activeTab, setActiveTab] = useState<TabType>('pending')
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  const router = useRouter()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        try {
          setLoading(true)
          
          // Use auth-storage utility for better email handling
          const { getUserEmail } = await import('@/lib/utils/auth-storage')
          const userEmail = getUserEmail('consumer')
          
          if (!userEmail) {
            setAccessDenied(true)
            setLoading(false)
            return
          }

          // Check if user is a site admin (location admin)
          const locationData = await getLocationByAdminEmail(userEmail)
          if (!locationData) {
            setAccessDenied(true)
            setLoading(false)
            return
          }

          setLocation(locationData)
          
          // Prepare date filters
          const fromDateObj = fromDate ? new Date(fromDate) : undefined
          const toDateObj = toDate ? new Date(toDate) : undefined
          
          // Load pending, approved, and all PRs with date filters
          const [pending, approved, all] = await Promise.all([
            getPendingApprovalsForSiteAdmin(userEmail, fromDateObj, toDateObj),
            getApprovedPRsForSiteAdmin(userEmail, fromDateObj, toDateObj),
            getAllPRsForSiteAdmin(userEmail, fromDateObj, toDateObj)
          ])
          
          setPendingOrders(pending)
          setApprovedOrders(approved)
          setAllPRs(all)
        } catch (error: any) {
          console.error('Error loading site admin approvals:', error)
          setAccessDenied(true)
        } finally {
          setLoading(false)
        }
      }

      loadData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, fromDate, toDate])

  const reloadData = async () => {
    try {
      const { getUserEmail } = await import('@/lib/utils/auth-storage')
      const userEmail = getUserEmail('consumer')
      if (!userEmail) return

      // Prepare date filters
      const fromDateObj = fromDate ? new Date(fromDate) : undefined
      const toDateObj = toDate ? new Date(toDate) : undefined

      const [pending, approved, all] = await Promise.all([
        getPendingApprovalsForSiteAdmin(userEmail, fromDateObj, toDateObj),
        getApprovedPRsForSiteAdmin(userEmail, fromDateObj, toDateObj),
        getAllPRsForSiteAdmin(userEmail, fromDateObj, toDateObj)
      ])
      
      setPendingOrders(pending)
      setApprovedOrders(approved)
      setAllPRs(all)
    } catch (error) {
      console.error('Error reloading data:', error)
    }
  }
  
  const handleApplyDateFilter = () => {
    reloadData()
  }
  
  const handleClearDateFilter = () => {
    setFromDate('')
    setToDate('')
    // Reload will happen via useEffect when dates change
  }

  const handleApprove = async (orderId: string) => {
    // Show PR number and date input modal
    setCurrentOrderId(orderId)
    setPrNumber('') // Empty by default
    // Set today's date as default (can be changed by admin)
    setPrDate(new Date().toISOString().split('T')[0])
    setShowPRModal(true)
  }

  const handleConfirmApprove = async () => {
    if (!currentOrderId) return

    // Validate PR number and date
    if (!prNumber || !prNumber.trim()) {
      alert('Please enter a PR number')
      return
    }
    if (!prDate) {
      alert('Please enter a PR date')
      return
    }

    try {
      const { getUserEmail } = await import('@/lib/utils/auth-storage')
      const userEmail = getUserEmail('consumer')
      if (!userEmail) {
        alert('Error: User email not found')
        return
      }

      // If it's a split order, approve all split orders
      const order = pendingOrders.find(o => o.id === currentOrderId)
      const orderIdsToApprove = order?.isSplitOrder && order?.splitOrderIds 
        ? order.splitOrderIds 
        : [currentOrderId]

      if (orderIdsToApprove.length > 1) {
        // Bulk approve split orders - use same PR number/date for all
        const prDateObj = new Date(prDate)
        for (const oId of orderIdsToApprove) {
          await approveOrder(oId, userEmail, prNumber.trim(), prDateObj)
        }
        alert(`PR approved successfully! (${orderIdsToApprove.length} sub-orders)`)
      } else {
        // Single order approval
        const prDateObj = new Date(prDate)
        await approveOrder(currentOrderId, userEmail, prNumber.trim(), prDateObj)
        alert('PR approved successfully!')
      }
      
      // Close modal and reload data
      setShowPRModal(false)
      setCurrentOrderId(null)
      setPrNumber('')
      setPrDate('')
      
      await reloadData()
      setSelectedOrders(new Set())
    } catch (error: any) {
      console.error('Error approving order:', error)
      alert(`Error approving PR: ${error.message || 'Unknown error'}`)
    }
  }

  const handleBulkApprove = async () => {
    if (selectedOrders.size === 0) {
      alert('Please select at least one PR to approve')
      return
    }

    // Reset bulk PR data and show modal
    setBulkPRNumber('')
    // Set today's date as default (can be changed by admin)
    setBulkPRDate(new Date().toISOString().split('T')[0])
    setShowBulkPRModal(true)
  }

  const handleConfirmBulkApprove = async () => {
    // Validate common PR data (applied to all orders)
    if (!bulkPRNumber || !bulkPRNumber.trim() || !bulkPRDate) {
      alert('Please enter PR Number and PR Date. These will be applied to all selected orders.')
      return
    }

    try {
      setBulkApproving(true)
      const { getUserEmail } = await import('@/lib/utils/auth-storage')
      const userEmail = getUserEmail('consumer')
      if (!userEmail) {
        alert('Error: User email not found')
        return
      }

      // Use the SAME PR Number and PR Date for ALL selected orders
      const commonPRNumber = bulkPRNumber.trim()
      const commonPRDate = new Date(bulkPRDate)

      // Collect all order IDs (including split orders) with the SAME PR data
      // CRITICAL: Include both parent and child order IDs in PR data map
      // Backend may process by parent ID or child ID, so we need both
      const orderIdsToApprove: string[] = []
      const prDataArray: Array<{ orderId: string, prNumber: string, prDate: Date }> = []
      
      for (const orderId of selectedOrders) {
        const order = pendingOrders.find(o => o.id === orderId)
        
        if (order?.isSplitOrder && order?.splitOrderIds) {
          // For split orders:
          // 1. Add parent order ID to PR data map (backend may process by parent ID)
          prDataArray.push({
            orderId: orderId, // Parent order ID
            prNumber: commonPRNumber,
            prDate: commonPRDate
          })
          
          // 2. Add all child order IDs with the SAME PR data (backend may process by child ID)
          for (const childOrderId of order.splitOrderIds) {
            orderIdsToApprove.push(childOrderId)
            prDataArray.push({
              orderId: childOrderId, // Child order ID
              prNumber: commonPRNumber,
              prDate: commonPRDate
            })
          }
        } else {
          // Standalone order - add order ID with PR data
          orderIdsToApprove.push(orderId)
          prDataArray.push({
            orderId: orderId,
            prNumber: commonPRNumber,
            prDate: commonPRDate
          })
        }
      }

      const result = await bulkApproveOrders(orderIdsToApprove, userEmail, prDataArray)
      
      if (result.failed.length > 0) {
        alert(`Some PRs failed to approve:\n${result.failed.map(f => `${f.orderId}: ${f.error}`).join('\n')}`)
      } else {
        alert(`Successfully approved ${result.success.length} PR(s) with PR Number: ${commonPRNumber}!`)
      }
      
      // Reload data
      await reloadData()
      setSelectedOrders(new Set())
      setShowBulkPRModal(false)
      setBulkPRNumber('')
      setBulkPRDate('')
    } catch (error: any) {
      console.error('Error bulk approving orders:', error)
      alert(`Error approving PRs: ${error.message || 'Unknown error'}`)
    } finally {
      setBulkApproving(false)
    }
  }

  const handleSelectAll = () => {
    const ordersToSelect = activeTab === 'pending' ? pendingOrders : approvedOrders
    if (selectedOrders.size === ordersToSelect.length) {
      setSelectedOrders(new Set())
    } else {
      setSelectedOrders(new Set(ordersToSelect.map(o => o.id)))
    }
  }

  const toggleOrderSelection = (orderId: string) => {
    const newSelected = new Set(selectedOrders)
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId)
    } else {
      newSelected.add(orderId)
    }
    setSelectedOrders(newSelected)
  }

  const updateBulkPRData = (orderId: string, field: 'prNumber' | 'prDate', value: string) => {
    const newMap = new Map(bulkPRData)
    const existing = newMap.get(orderId) || { prNumber: '', prDate: '' }
    existing[field] = value
    newMap.set(orderId, existing)
    setBulkPRData(newMap)
  }

  if (loading) {
    return (
      <DashboardLayout actorType="consumer">
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-gray-600">Loading approvals...</p>
        </div>
      </DashboardLayout>
    )
  }

  if (accessDenied || !location) {
    return (
      <DashboardLayout actorType="consumer">
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">
              Access Denied: You are not authorized to view this page. Only Site Admins (Location Admins) can access this page.
            </p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const currentOrders = activeTab === 'pending' 
    ? pendingOrders 
    : activeTab === 'approved' 
    ? approvedOrders 
    : allPRs

  return (
    <DashboardLayout actorType="consumer">
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">PR Approvals</h1>
              {location && (
                <p className="text-sm text-gray-500 mt-1">
                  <MapPin className="inline h-4 w-4 mr-1" />
                  Location: {location.name} (ID: {location.id})
                </p>
              )}
            </div>
            {activeTab === 'pending' && currentOrders.length > 0 && (
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleSelectAll}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  {selectedOrders.size === currentOrders.length ? 'Deselect All' : 'Select All'}
                </button>
                <button
                  onClick={handleBulkApprove}
                  disabled={selectedOrders.size === 0 || bulkApproving}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center space-x-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="h-5 w-5" />
                  <span>{bulkApproving ? 'Approving...' : `Approve Selected (${selectedOrders.size})`}</span>
                </button>
              </div>
            )}
          </div>

          {/* Date Filters */}
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <label htmlFor="fromDate" className="block text-sm font-medium text-gray-700 mb-1">
                  From Date (Optional)
                </label>
                <input
                  type="date"
                  id="fromDate"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="toDate" className="block text-sm font-medium text-gray-700 mb-1">
                  To Date (Optional)
                </label>
                <input
                  type="date"
                  id="toDate"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-end space-x-2 pt-6">
                <button
                  onClick={handleApplyDateFilter}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                >
                  Apply Filter
                </button>
                {(fromDate || toDate) && (
                  <button
                    onClick={handleClearDateFilter}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm font-medium"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            {(fromDate || toDate) && (
              <p className="mt-2 text-xs text-gray-500">
                Showing PRs created between {fromDate || 'beginning'} and {toDate || 'today'}
              </p>
            )}
          </div>

          {/* Tabs */}
          <div className="flex space-x-4 border-b border-gray-200">
            <button
              onClick={() => {
                setActiveTab('pending')
                setSelectedOrders(new Set())
              }}
              className={`px-4 py-2 font-medium text-sm ${
                activeTab === 'pending'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Pending Approval ({pendingOrders.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('approved')
                setSelectedOrders(new Set())
              }}
              className={`px-4 py-2 font-medium text-sm ${
                activeTab === 'approved'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Approved ({approvedOrders.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('all-prs')
                setSelectedOrders(new Set())
              }}
              className={`px-4 py-2 font-medium text-sm ${
                activeTab === 'all-prs'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              My PRs ({allPRs.length})
            </button>
          </div>
        </div>

        {currentOrders.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {activeTab === 'pending' ? 'All Clear!' : activeTab === 'approved' ? 'No Approved PRs' : 'No PRs Found'}
            </h2>
            <p className="text-gray-600">
              {activeTab === 'pending'
                ? 'There are no Purchase Requisitions pending your approval.'
                : activeTab === 'approved'
                ? 'No PRs have been approved yet.'
                : 'No Purchase Requisitions have been raised yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {currentOrders.map((order) => (
              <div
                key={order.id}
                className={`bg-white rounded-lg shadow-sm border-2 ${
                  selectedOrders.has(order.id) ? 'border-blue-500' : 'border-gray-200'
                } p-6 hover:shadow-md transition-shadow`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-4">
                      {activeTab === 'pending' && (
                        <input
                          type="checkbox"
                          checked={selectedOrders.has(order.id)}
                          onChange={() => toggleOrderSelection(order.id)}
                          className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      )}
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          Order #{order.id}
                        </h3>
                        {/* Show PR details in Approved and All PRs tabs */}
                        {(activeTab === 'approved' || activeTab === 'all-prs') && order.pr_number && (
                          <p className="text-sm text-gray-600 mt-1">
                            <FileText className="inline h-4 w-4 mr-1" />
                            PR Number: <span className="font-medium">{order.pr_number}</span>
                          </p>
                        )}
                        {(activeTab === 'approved' || activeTab === 'all-prs') && order.pr_date && (
                          <p className="text-sm text-gray-500 mt-1">
                            <Calendar className="inline h-4 w-4 mr-1" />
                            PR Date: {new Date(order.pr_date).toLocaleDateString()}
                          </p>
                        )}
                        {(activeTab === 'approved' || activeTab === 'all-prs') && order.site_admin_approved_at && (
                          <p className="text-sm text-gray-500 mt-1">
                            <Clock className="inline h-4 w-4 mr-1" />
                            Approved: {new Date(order.site_admin_approved_at).toLocaleString()}
                          </p>
                        )}
                        {/* Show PR status badge in All PRs tab */}
                        {activeTab === 'all-prs' && order.unified_pr_status && (
                          <div className="mt-2">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              order.unified_pr_status === 'SITE_ADMIN_APPROVED' || order.unified_pr_status === 'PENDING_COMPANY_ADMIN_APPROVAL'
                                ? 'bg-green-100 text-green-800'
                                : order.unified_pr_status === 'COMPANY_ADMIN_APPROVED' || order.unified_pr_status === 'LINKED_TO_PO'
                                ? 'bg-blue-100 text-blue-800'
                                : order.unified_pr_status === 'DRAFT'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {order.unified_pr_status.replace(/_/g, ' ')}
                            </span>
                          </div>
                        )}
                        {activeTab === 'approved' && order.unified_pr_status && (
                          <p className="text-xs text-gray-500 mt-1">
                            Status: {order.unified_pr_status.replace(/_/g, ' ')}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="flex items-center space-x-2">
                        <User className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="text-sm text-gray-600">Employee</p>
                          <p className="font-semibold text-gray-900">
                            {order.employeeName || 'N/A'} ({order.employeeIdNum || 'N/A'})
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Package className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="text-sm text-gray-600">Total Items</p>
                          <p className="font-semibold text-gray-900">{order.items?.length || 0} item(s)</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <ShoppingBag className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="text-sm text-gray-600">Total Amount</p>
                          <p className="font-semibold text-gray-900">₹{order.total?.toFixed(2) || '0.00'}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Clock className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="text-sm text-gray-600">Order Date</p>
                          <p className="font-semibold text-gray-900">
                            {order.orderDate ? new Date(order.orderDate).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {order.isSplitOrder && order.splitOrders && (
                      <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                        <p className="text-sm font-medium text-blue-900 mb-2">
                          Split Order: {order.splitOrders.length} vendor(s)
                        </p>
                        <div className="space-y-1">
                          {order.splitOrders.map((split: any, idx: number) => (
                            <p key={idx} className="text-xs text-blue-700">
                              • {split.vendorName}: {split.itemCount} item(s), ₹{split.total?.toFixed(2)}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Items:</h4>
                      <div className="space-y-2">
                        {order.items?.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div>
                              <p className="font-medium text-gray-900">{item.uniformName || item.uniformId?.name || 'N/A'}</p>
                              <p className="text-sm text-gray-600">Size: {item.size}, Qty: {item.quantity}</p>
                            </div>
                            <p className="font-semibold text-gray-900">₹{(item.price * item.quantity).toFixed(2)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {activeTab === 'pending' && (
                    <div className="ml-4">
                      <button
                        onClick={() => handleApprove(order.id)}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center space-x-2"
                      >
                        <CheckCircle className="h-5 w-5" />
                        <span>Approve PR</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Single PR Number and Date Input Modal */}
      {showPRModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Enter PR Details</h2>
              <button
                onClick={() => {
                  setShowPRModal(false)
                  setCurrentOrderId(null)
                  setPrNumber('')
                  setPrDate(new Date().toISOString().split('T')[0]) // Reset to today's date
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="prNumber" className="block text-sm font-medium text-gray-700 mb-1">
                  PR Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="prNumber"
                  value={prNumber}
                  onChange={(e) => setPrNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter PR number"
                  required
                />
              </div>

              <div>
                <label htmlFor="prDate" className="block text-sm font-medium text-gray-700 mb-1">
                  PR Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  id="prDate"
                  value={prDate || new Date().toISOString().split('T')[0]}
                  onChange={(e) => setPrDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowPRModal(false)
                  setCurrentOrderId(null)
                  setPrNumber('')
                  setPrDate('')
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmApprove}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Approve PR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk PR Number and Date Input Modal */}
      {showBulkPRModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Enter PR Details for Selected Orders</h2>
              <button
                onClick={() => {
                  setShowBulkPRModal(false)
                  setBulkPRNumber('')
                  setBulkPRDate(new Date().toISOString().split('T')[0]) // Reset to today's date
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Single PR Input Section - Applied to All Orders */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="mb-3">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  <FileText className="inline h-4 w-4 mr-1" />
                  Common PR Details
                </p>
                <p className="text-xs text-blue-700">
                  These PR details will be applied to all {selectedOrders.size} selected order{selectedOrders.size !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    PR Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={bulkPRNumber}
                    onChange={(e) => setBulkPRNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter PR number"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    PR Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={bulkPRDate || new Date().toISOString().split('T')[0]}
                    onChange={(e) => setBulkPRDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Read-Only Order List */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Selected Orders ({selectedOrders.size})
              </h3>
              <div className="space-y-2 max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-4">
                {Array.from(selectedOrders).map((orderId) => {
                  const order = pendingOrders.find(o => o.id === orderId)
                  
                  if (!order) return null

                  return (
                    <div key={orderId} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 text-sm">Order #{order.id}</h4>
                          <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-600">
                            <span className="flex items-center">
                              <User className="h-3 w-3 mr-1" />
                              {order.employeeName}
                            </span>
                            <span className="flex items-center">
                              <Package className="h-3 w-3 mr-1" />
                              {order.items?.length || 0} item(s)
                            </span>
                            <span className="flex items-center">
                              <ShoppingBag className="h-3 w-3 mr-1" />
                              ₹{order.total?.toFixed(2) || '0.00'}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {order.unified_pr_status || 'Pending'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowBulkPRModal(false)
                  setBulkPRNumber('')
                  setBulkPRDate('')
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={bulkApproving}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBulkApprove}
                disabled={bulkApproving || !bulkPRNumber.trim() || !bulkPRDate}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {bulkApproving ? 'Approving...' : `Approve ${selectedOrders.size} PR(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
