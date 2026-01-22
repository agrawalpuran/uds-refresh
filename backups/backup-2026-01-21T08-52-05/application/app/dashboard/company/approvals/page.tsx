'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/DashboardLayout'
import { CheckCircle, XCircle, Clock, Package, User, Calendar, ShoppingBag, FileText, X } from 'lucide-react'
import { 
  getCompanyByAdminEmail, 
  isCompanyAdmin, 
  getPendingApprovals, 
  getPendingSiteAdminApprovalCount,
  approveOrder,
  bulkApproveOrders,
  canApproveOrders,
  getCompanyById,
  createPurchaseOrder,
  getApprovedOrdersForCompanyAdmin,
  getPOCreatedOrdersForCompanyAdmin,
  getRejectedOrdersForCompanyAdmin
} from '@/lib/data-mongodb'
// Data masking removed for Company Admin - they should see all employee information unmasked

type TabType = 'pending' | 'approved' | 'poCreated' | 'rejected'

export default function CompanyApprovalsPage() {
  const [companyId, setCompanyId] = useState<string>('')
  const [pendingOrders, setPendingOrders] = useState<any[]>([])
  const [approvedOrders, setApprovedOrders] = useState<any[]>([])
  const [poCreatedOrders, setPOCreatedOrders] = useState<any[]>([])
  const [rejectedOrders, setRejectedOrders] = useState<any[]>([])
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [canApprove, setCanApprove] = useState(false)
  const [pendingSiteAdminCount, setPendingSiteAdminCount] = useState<{ count: number; message: string }>({ count: 0, message: '' })
  const [bulkApproving, setBulkApproving] = useState(false)
  const [companyPrimaryColor, setCompanyPrimaryColor] = useState<string>('#f76b1c')
  const [companySecondaryColor, setCompanySecondaryColor] = useState<string>('#f76b1c')
  const [enablePRPOWorkflow, setEnablePRPOWorkflow] = useState<boolean>(false)
  const [showPOModal, setShowPOModal] = useState(false)
  const [poNumber, setPoNumber] = useState<string>('')
  const [poDate, setPoDate] = useState<string>('')
  const [creatingPO, setCreatingPO] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [activeTab, setActiveTab] = useState<TabType>('pending')
  const router = useRouter()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        try {
          setLoading(true)
          
          // Use auth-storage utility for better email handling
          const { getUserEmail, getCompanyId } = await import('@/lib/utils/auth-storage')
          // CRITICAL SECURITY FIX: Use only tab-specific auth storage
          const userEmail = getUserEmail('company')
          
          if (!userEmail) {
            setAccessDenied(true)
            setLoading(false)
            return
          }

          // First, try to get companyId from localStorage (set during login)
          let targetCompanyId = getCompanyId() || localStorage.getItem('companyId')
          
          // If companyId not in localStorage, try to get it from admin email
          let company = null
          if (!targetCompanyId) {
            try {
              company = await getCompanyByAdminEmail(userEmail)
              if (company && company.id) {
                targetCompanyId = company.id
                localStorage.setItem('companyId', targetCompanyId)
              }
            } catch (error: any) {
              // Suppress expected errors (404, 401, 403)
              const isExpectedError = error?.message?.includes('404') || 
                                     error?.message?.includes('401') || 
                                     error?.message?.includes('403') ||
                                     error?.message?.includes('Unauthorized') ||
                                     error?.message?.includes('Forbidden') ||
                                     error?.message?.includes('not found')
              if (!isExpectedError) {
                console.error('Error getting company by admin email:', error)
              }
              // Continue to check if companyId exists in localStorage
            }
          } else {
            // If we have companyId from localStorage, verify the user is an admin
            // and fetch company details
            const adminStatus = await isCompanyAdmin(userEmail, targetCompanyId)
            if (!adminStatus) {
              // If not admin, try to get company from email as fallback
              try {
                company = await getCompanyByAdminEmail(userEmail)
                if (company && company.id) {
                  targetCompanyId = company.id
                  localStorage.setItem('companyId', targetCompanyId)
                } else {
                  setAccessDenied(true)
                  setLoading(false)
                  router.push('/login/company')
                  return
                }
              } catch (error: any) {
                // Suppress expected errors (404, 401, 403)
                const isExpectedError = error?.message?.includes('404') || 
                                       error?.message?.includes('401') || 
                                       error?.message?.includes('403') ||
                                       error?.message?.includes('Unauthorized') ||
                                       error?.message?.includes('Forbidden') ||
                                       error?.message?.includes('not found')
                if (!isExpectedError) {
                  console.error('Error getting company by admin email:', error)
                }
                setAccessDenied(true)
                setLoading(false)
                router.push('/login/company')
                return
              }
            } else {
              // User is admin, fetch company details
              company = await getCompanyById(targetCompanyId)
            }
          }

          // Final check - if we still don't have a company, deny access
          if (!targetCompanyId || !company) {
            // Suppress console error - this is handled gracefully with redirect
            // console.error('No company found for user:', userEmail)
            setAccessDenied(true)
            setLoading(false)
            router.push('/login/company')
            return
          }

          // Verify admin status one more time
          const adminStatus = await isCompanyAdmin(userEmail, targetCompanyId)
          if (!adminStatus) {
            setAccessDenied(true)
            setLoading(false)
            router.push('/login/company')
            return
          }

          // Check if admin can approve orders
          const approvalPermission = await canApproveOrders(userEmail, targetCompanyId)
          setCanApprove(approvalPermission)

          setCompanyId(targetCompanyId)
          
          // Fetch company details including workflow settings
          const companyDetails = await getCompanyById(targetCompanyId)
          if (companyDetails) {
            setCompanyPrimaryColor(companyDetails.primaryColor || '#f76b1c')
            setCompanySecondaryColor(companyDetails.secondaryColor || companyDetails.primaryColor || '#f76b1c')
            setEnablePRPOWorkflow(companyDetails.enable_pr_po_workflow === true)
          }
          
          // Get current user's employee ID for PO creation
          const { getEmployeeByEmail } = await import('@/lib/data-mongodb')
          try {
            const employee = await getEmployeeByEmail(userEmail)
            if (employee && employee.id) {
              setCurrentUserId(employee.id)
            }
          } catch (error) {
            console.warn('Could not get employee ID:', error)
          }
          
          // Load all tab data in parallel
          const [pending, approved, poCreated, rejected, siteAdminPendingCount] = await Promise.all([
            getPendingApprovals(targetCompanyId),
            getApprovedOrdersForCompanyAdmin(targetCompanyId),
            getPOCreatedOrdersForCompanyAdmin(targetCompanyId),
            getRejectedOrdersForCompanyAdmin(targetCompanyId),
            getPendingSiteAdminApprovalCount(targetCompanyId)
          ])
          
          setPendingOrders(pending)
          setApprovedOrders(approved)
          setPOCreatedOrders(poCreated)
          setRejectedOrders(rejected)
          setPendingSiteAdminCount(siteAdminPendingCount)
        } catch (error: any) {
          // Suppress expected errors (404, 401, 403)
          const isExpectedError = error?.message?.includes('404') || 
                                 error?.message?.includes('401') || 
                                 error?.message?.includes('403') ||
                                 error?.message?.includes('Unauthorized') ||
                                 error?.message?.includes('Forbidden') ||
                                 error?.message?.includes('not found')
          if (!isExpectedError) {
            console.error('Error loading approvals:', error)
            setAccessDenied(true)
          }
        } finally {
          setLoading(false)
        }
      }

      loadData()
    }
  }, [router])

  const handleApprove = async (orderId: string) => {
    if (!confirm('Are you sure you want to approve this order?')) {
      return
    }

    try {
      // CRITICAL SECURITY FIX: Use tab-specific auth storage
      const { getUserEmail } = await import('@/lib/utils/auth-storage')
      const userEmail = getUserEmail('company')
      if (!userEmail) {
        alert('Error: User email not found')
        return
      }

      // If it's a split order, approve all split orders
      const order = pendingOrders.find(o => o.id === orderId)
      const orderIdsToApprove = order?.isSplitOrder && order?.splitOrderIds 
        ? order.splitOrderIds 
        : [orderId]

      if (orderIdsToApprove.length > 1) {
        // Bulk approve split orders
        const result = await bulkApproveOrders(orderIdsToApprove, userEmail)
        if (result.failed.length > 0) {
          alert(`Some orders failed to approve:\n${result.failed.map(f => `${f.orderId}: ${f.error}`).join('\n')}`)
        } else {
          alert(`Order approved successfully! (${result.success.length} sub-orders)`)
        }
      } else {
        // Single order approval
        await approveOrder(orderId, userEmail)
        alert('Order approved successfully!')
      }
      
      // Reload pending orders
      const orders = await getPendingApprovals(companyId)
      setPendingOrders(orders)
      setSelectedOrders(new Set())
    } catch (error: any) {
      alert(`Error approving order: ${error.message}`)
    }
  }

  const handleToggleSelect = (orderId: string) => {
    const newSelected = new Set(selectedOrders)
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId)
    } else {
      newSelected.add(orderId)
    }
    setSelectedOrders(newSelected)
  }

  const handleSelectAll = () => {
    const currentOrders = activeTab === 'pending' ? pendingOrders : []
    if (selectedOrders.size === currentOrders.length) {
      setSelectedOrders(new Set())
    } else {
      setSelectedOrders(new Set(currentOrders.map(o => o.id)))
    }
  }

  const handleBulkApprove = async () => {
    if (selectedOrders.size === 0) {
      alert('Please select at least one order to approve')
      return
    }

    // If PR/PO workflow is enabled, show PO creation modal instead of direct approval
    if (enablePRPOWorkflow) {
      // Set today's date as default (can be changed by admin)
      setPoDate(new Date().toISOString().split('T')[0])
      setShowPOModal(true)
      return
    }

    // Legacy workflow: direct approval
    if (!confirm(`Are you sure you want to approve ${selectedOrders.size} order(s)?`)) {
      return
    }

    try {
      setBulkApproving(true)
      // CRITICAL SECURITY FIX: Use tab-specific auth storage
      const { getUserEmail } = await import('@/lib/utils/auth-storage')
      const userEmail = getUserEmail('company')
      if (!userEmail) {
        alert('Error: User email not found')
        return
      }

      // Collect all order IDs to approve (including split orders)
      const orderIdsToApprove: string[] = []
      for (const orderId of Array.from(selectedOrders)) {
        const order = pendingOrders.find(o => o.id === orderId)
        if (order?.isSplitOrder && order?.splitOrderIds) {
          orderIdsToApprove.push(...order.splitOrderIds)
        } else {
          orderIdsToApprove.push(orderId)
        }
      }

      const result = await bulkApproveOrders(orderIdsToApprove, userEmail)
      
      if (result.failed.length > 0) {
        alert(`Approved ${result.success.length} order(s). Some failed:\n${result.failed.map(f => `${f.orderId}: ${f.error}`).join('\n')}`)
      } else {
        alert(`Successfully approved ${result.success.length} order(s)!`)
      }
      
      // Reload all tab data
      await reloadData()
      setSelectedOrders(new Set())
    } catch (error: any) {
      alert(`Error bulk approving orders: ${error.message}`)
    } finally {
      setBulkApproving(false)
    }
  }

  const reloadData = async () => {
    if (!companyId) return
    try {
      const [pending, approved, poCreated, siteAdminPendingCount] = await Promise.all([
        getPendingApprovals(companyId),
        getApprovedOrdersForCompanyAdmin(companyId),
        getPOCreatedOrdersForCompanyAdmin(companyId),
        getPendingSiteAdminApprovalCount(companyId)
      ])
      
      setPendingOrders(pending)
      setApprovedOrders(approved)
      setPOCreatedOrders(poCreated)
      setPendingSiteAdminCount(siteAdminPendingCount)
    } catch (error) {
      console.error('Error reloading data:', error)
    }
  }

  const handleCreatePO = async () => {
    if (!poNumber || !poNumber.trim()) {
      alert('Please enter a PO Number')
      return
    }
    if (!poDate) {
      alert('Please enter a PO Date')
      return
    }
    if (!currentUserId) {
      alert('Error: User ID not found')
      return
    }

    try {
      setCreatingPO(true)

      // Collect all order IDs (including split orders)
      const orderIdsToProcess: string[] = []
      for (const orderId of Array.from(selectedOrders)) {
        const order = pendingOrders.find(o => o.id === orderId)
        if (order?.isSplitOrder && order?.splitOrderIds) {
          // For split orders, use parent order ID (the system will handle child orders)
          orderIdsToProcess.push(orderId) // Use parent order ID
        } else {
          orderIdsToProcess.push(orderId)
        }
      }

      const poDateObj = new Date(poDate)
      const result = await createPurchaseOrder(
        orderIdsToProcess,
        poNumber.trim(),
        poDateObj,
        companyId,
        currentUserId
      )

      if (result.success) {
        alert(result.message)
        // Reload all tab data
        await reloadData()
        setSelectedOrders(new Set())
        setShowPOModal(false)
        setPoNumber('')
        setPoDate('')
      } else {
        alert(`Error creating PO: ${result.message || 'Unknown error'}`)
      }
    } catch (error: any) {
      console.error('Error creating PO:', error)
      alert(`Error creating PO: ${error.message || 'Unknown error'}`)
    } finally {
      setCreatingPO(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Awaiting approval':
        return { bg: 'bg-yellow-100', text: 'text-yellow-800' }
      case 'Awaiting fulfilment':
        return { bg: `${companyPrimaryColor || '#f76b1c'}20`, text: companyPrimaryColor || '#f76b1c' }
      case 'Dispatched':
        return { bg: `${companySecondaryColor || '#f76b1c'}20`, text: companySecondaryColor || '#f76b1c' }
      case 'Delivered':
        return { bg: 'bg-green-100', text: 'text-green-800' }
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-800' }
    }
  }

  if (loading) {
    return (
      <DashboardLayout actorType="company">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-gray-600">Loading approvals...</p>
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
            <p className="text-gray-600 mt-2">You are not authorized to view this page.</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  const currentOrders = activeTab === 'pending' ? pendingOrders 
    : activeTab === 'approved' ? approvedOrders
    : activeTab === 'poCreated' ? poCreatedOrders
    : rejectedOrders

  return (
    <DashboardLayout actorType="company">
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">PR Approvals</h1>
              <p className="text-gray-600">
                {activeTab === 'pending' && `${pendingOrders.length} order${pendingOrders.length !== 1 ? 's' : ''} awaiting approval`}
                {activeTab === 'approved' && `${approvedOrders.length} approved order${approvedOrders.length !== 1 ? 's' : ''}`}
                {activeTab === 'poCreated' && `${poCreatedOrders.length} order${poCreatedOrders.length !== 1 ? 's' : ''} with PO created`}
                {activeTab === 'rejected' && `${rejectedOrders.length} rejected order${rejectedOrders.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            {canApprove && activeTab === 'pending' && pendingOrders.length > 0 && (
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleSelectAll}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  {selectedOrders.size === pendingOrders.length ? 'Deselect All' : 'Select All'}
                </button>
                {enablePRPOWorkflow ? (
                  <button
                    onClick={handleBulkApprove}
                    disabled={selectedOrders.size === 0 || creatingPO}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center space-x-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    <FileText className="h-5 w-5" />
                    <span>{creatingPO ? 'Creating PO...' : `Create PO (${selectedOrders.size})`}</span>
                  </button>
                ) : (
                  <button
                    onClick={handleBulkApprove}
                    disabled={selectedOrders.size === 0 || bulkApproving}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center space-x-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    <CheckCircle className="h-5 w-5" />
                    <span>{bulkApproving ? 'Approving...' : `Approve Selected (${selectedOrders.size})`}</span>
                  </button>
                )}
              </div>
            )}
          </div>
          {!canApprove && activeTab === 'pending' && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                ⚠️ You do not have permission to approve orders. Contact your super admin to grant this privilege.
              </p>
            </div>
          )}

          {/* Tabs */}
          <div className="flex space-x-4 border-b border-gray-200 mt-4">
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
                setActiveTab('poCreated')
                setSelectedOrders(new Set())
              }}
              className={`px-4 py-2 font-medium text-sm ${
                activeTab === 'poCreated'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              PO Created ({poCreatedOrders.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('rejected')
                setSelectedOrders(new Set())
              }}
              className={`px-4 py-2 font-medium text-sm ${
                activeTab === 'rejected'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Rejected ({rejectedOrders.length})
            </button>
          </div>
        </div>

        {currentOrders.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">
              {activeTab === 'pending' && 'No pending approvals'}
              {activeTab === 'approved' && 'No approved orders'}
              {activeTab === 'poCreated' && 'No orders with PO created'}
              {activeTab === 'rejected' && 'No rejected orders'}
            </p>
            <p className="text-gray-500 text-sm mt-2">
              {activeTab === 'pending' && 'All orders have been processed.'}
              {activeTab === 'approved' && 'No orders have been approved yet.'}
              {activeTab === 'poCreated' && 'No purchase orders have been created yet.'}
              {activeTab === 'rejected' && 'No orders have been rejected.'}
            </p>
            {/* Show pending site admin approval message if applicable */}
            {activeTab === 'pending' && pendingSiteAdminCount.count > 0 && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center justify-center space-x-2">
                  <Clock className="h-5 w-5 text-yellow-600" />
                  <p className="text-yellow-800 font-medium">
                    {pendingSiteAdminCount.message}
                  </p>
                </div>
                <p className="text-yellow-600 text-sm mt-2">
                  These orders need to be reviewed and approved by Location/Site Admins before they appear here.
                </p>
              </div>
            )}
          </div>
        ) : activeTab === 'pending' ? (
          <div className="space-y-6">
            {/* Group orders by PR Number */}
            {(() => {
              // Group orders by PR Number
              const ordersByPR = new Map<string, any[]>()
              const ordersWithoutPR: any[] = []
              
              pendingOrders.forEach((order) => {
                // For split orders, use the PR number from the first child order
                // For standalone orders, use the order's PR number
                const prNumber = order.isSplitOrder && order.splitOrders?.[0]?.pr_number
                  ? order.splitOrders[0].pr_number
                  : order.pr_number
                
                if (prNumber) {
                  if (!ordersByPR.has(prNumber)) {
                    ordersByPR.set(prNumber, [])
                  }
                  ordersByPR.get(prNumber)!.push(order)
                } else {
                  ordersWithoutPR.push(order)
                }
              })
              
              // Get PR date from first order in each group
              const getPRDate = (orders: any[]): Date | null => {
                const firstOrder = orders[0]
                if (firstOrder.isSplitOrder && firstOrder.splitOrders?.[0]?.pr_date) {
                  return new Date(firstOrder.splitOrders[0].pr_date)
                }
                return firstOrder.pr_date ? new Date(firstOrder.pr_date) : null
              }
              
              return (
                <>
                  {/* Orders grouped by PR Number */}
                  {Array.from(ordersByPR.entries()).map(([prNumber, orders]) => {
                    const prDate = getPRDate(orders)
                    const totalAmount = orders.reduce((sum, o) => sum + (o.total || 0), 0)
                    const allOrderIds = orders.flatMap(o => 
                      o.isSplitOrder && o.splitOrderIds ? o.splitOrderIds : [o.id]
                    )
                    const isAllSelected = allOrderIds.every(id => selectedOrders.has(id))
                    const isSomeSelected = allOrderIds.some(id => selectedOrders.has(id))
                    
                    return (
                      <div key={prNumber} className="bg-white rounded-lg shadow border-2 border-blue-200">
                        {/* PR Header */}
                        <div className="bg-blue-50 border-b border-blue-200 px-6 py-4 rounded-t-lg">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                              <div className="flex items-center space-x-2">
                                <FileText className="h-5 w-5 text-blue-600" />
                                <h2 className="text-lg font-bold text-blue-900">PR Number: {prNumber}</h2>
                              </div>
                              {prDate && (
                                <div className="flex items-center space-x-1 text-sm text-blue-700">
                                  <Calendar className="h-4 w-4" />
                                  <span>PR Date: {prDate.toLocaleDateString()}</span>
                                </div>
                              )}
                              <div className="text-sm text-blue-700">
                                {orders.length} order{orders.length !== 1 ? 's' : ''}
                              </div>
                            </div>
                            {canApprove && (
                              <div className="flex items-center space-x-3">
                                <input
                                  type="checkbox"
                                  checked={isAllSelected}
                                  ref={(input) => {
                                    if (input) input.indeterminate = isSomeSelected && !isAllSelected
                                  }}
                                  onChange={() => {
                                    const newSelected = new Set(selectedOrders)
                                    if (isAllSelected) {
                                      allOrderIds.forEach(id => newSelected.delete(id))
                                    } else {
                                      allOrderIds.forEach(id => newSelected.add(id))
                                    }
                                    setSelectedOrders(newSelected)
                                  }}
                                  className="h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                />
                                <span className="text-sm text-blue-700 font-medium">
                                  Select All ({orders.length})
                                </span>
                                <div className="text-right">
                                  <p className="text-sm text-blue-600">Total PR Amount</p>
                                  <p className="text-xl font-bold text-blue-900">₹{totalAmount.toFixed(2)}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Orders under this PR */}
                        <div className="p-6 space-y-4">
                          {orders.map((order) => (
                            <div key={order.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                              <div className="flex items-start justify-between mb-4">
                                <div className="flex items-start space-x-3 flex-1">
                                  {canApprove && (
                                    <input
                                      type="checkbox"
                                      checked={selectedOrders.has(order.id)}
                                      onChange={() => handleToggleSelect(order.id)}
                                      className="mt-1 h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                    />
                                  )}
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-3 mb-2">
                                      <h3 className="text-lg font-semibold text-gray-900">Order #{order.id}</h3>
                                      <span 
                                        className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(order.status).bg.includes('bg-') ? getStatusColor(order.status).bg : ''} ${getStatusColor(order.status).text.includes('text-') ? getStatusColor(order.status).text : ''}`}
                                        style={{ 
                                          backgroundColor: !getStatusColor(order.status).bg.includes('bg-') 
                                            ? getStatusColor(order.status).bg 
                                            : undefined,
                                          color: !getStatusColor(order.status).text.includes('text-')
                                            ? getStatusColor(order.status).text
                                            : undefined
                                        }}
                                      >
                                        {order.status}
                                      </span>
                                      {order.isSplitOrder && (
                                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 flex items-center space-x-1">
                                          <ShoppingBag className="h-3 w-3" />
                                          <span>{order.vendorCount} Vendor{order.vendorCount !== 1 ? 's' : ''}</span>
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                                      <div className="flex items-center space-x-1">
                                        <User className="h-4 w-4" />
                                        <span>{order.employeeName || 'N/A'}</span>
                                      </div>
                                      <div className="flex items-center space-x-1">
                                        <Calendar className="h-4 w-4" />
                                        <span>{new Date(order.orderDate).toLocaleDateString()}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                {canApprove && (
                                  <>
                                    {enablePRPOWorkflow ? (
                                      <button
                                        onClick={() => {
                                          setSelectedOrders(new Set([order.id]))
                                          // Set today's date as default (can be changed by admin)
                                          setPoDate(new Date().toISOString().split('T')[0])
                                          setShowPOModal(true)
                                        }}
                                        className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center space-x-2 ml-3"
                                      >
                                        <FileText className="h-5 w-5" />
                                        <span>Create PO</span>
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleApprove(order.id)}
                                        className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center space-x-2 ml-3"
                                      >
                                        <CheckCircle className="h-5 w-5" />
                                        <span>Approve</span>
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>

                              <div className="border-t pt-4 mt-4">
                                <h4 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                                  <Package className="h-5 w-5" />
                                  <span>Order Items</span>
                                </h4>
                                {order.isSplitOrder && order.splitOrders ? (
                                  // For split orders, show items grouped by vendor
                                  <div className="space-y-4">
                                    {order.splitOrders.map((splitOrder: any, vendorIndex: number) => (
                                      <div key={vendorIndex} className="space-y-2">
                                        {splitOrder.items?.map((item: any, itemIndex: number) => (
                                          <div key={itemIndex} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                                            <div className="flex-1">
                                              <div className="flex items-center space-x-2 mb-1">
                                                <p className="font-medium text-gray-900">{item.uniformName}</p>
                                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                                  {splitOrder.vendorName || 'Unknown Vendor'}
                                                </span>
                                              </div>
                                              <p className="text-sm text-gray-600">
                                                Size: {item.size} × Quantity: {item.quantity}
                                              </p>
                                            </div>
                                            <p className="font-semibold text-gray-900">
                                              ₹{(item.price * item.quantity).toFixed(2)}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  // For standalone orders, show items with vendor name
                                  <div className="space-y-2">
                                    {order.items?.map((item: any, index: number) => (
                                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                                        <div className="flex-1">
                                          <div className="flex items-center space-x-2 mb-1">
                                            <p className="font-medium text-gray-900">{item.uniformName}</p>
                                            {order.vendorName && (
                                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                                {order.vendorName}
                                              </span>
                                            )}
                                          </div>
                                          <p className="text-sm text-gray-600">
                                            Size: {item.size} × Quantity: {item.quantity}
                                          </p>
                                        </div>
                                        <p className="font-semibold text-gray-900">
                                          ₹{(item.price * item.quantity).toFixed(2)}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="mt-4 pt-4 border-t flex justify-between items-center">
                                  <div>
                                    <p className="text-sm text-gray-600">Delivery Address:</p>
                                    <p className="text-gray-900 font-medium">{order.deliveryAddress || 'N/A'}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm text-gray-600">Total Amount</p>
                                    <p className="text-2xl font-bold text-gray-900">₹{order.total.toFixed(2)}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  
                  {/* Orders without PR Number */}
                  {ordersWithoutPR.length > 0 && (
                    <div className="bg-white rounded-lg shadow border-2 border-yellow-200">
                      <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-4 rounded-t-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <FileText className="h-5 w-5 text-yellow-600" />
                            <h2 className="text-lg font-bold text-yellow-900">Unassigned PR</h2>
                            <span className="text-sm text-yellow-700">
                              ({ordersWithoutPR.length} order{ordersWithoutPR.length !== 1 ? 's' : ''})
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="p-6 space-y-4">
                        {ordersWithoutPR.map((order) => (
                          <div key={order.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex items-start space-x-3 flex-1">
                                {canApprove && (
                                  <input
                                    type="checkbox"
                                    checked={selectedOrders.has(order.id)}
                                    onChange={() => handleToggleSelect(order.id)}
                                    className="mt-1 h-5 w-5 text-yellow-600 rounded border-gray-300 focus:ring-yellow-500"
                                  />
                                )}
                                <div className="flex-1">
                                  <div className="flex items-center space-x-3 mb-2">
                                    <h3 className="text-lg font-semibold text-gray-900">Order #{order.id}</h3>
                                    <span 
                                      className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(order.status).bg.includes('bg-') ? getStatusColor(order.status).bg : ''} ${getStatusColor(order.status).text.includes('text-') ? getStatusColor(order.status).text : ''}`}
                                      style={{ 
                                        backgroundColor: !getStatusColor(order.status).bg.includes('bg-') 
                                          ? getStatusColor(order.status).bg 
                                          : undefined,
                                        color: !getStatusColor(order.status).text.includes('text-')
                                          ? getStatusColor(order.status).text
                                          : undefined
                                      }}
                                    >
                                      {order.status}
                                    </span>
                                    {order.isSplitOrder && (
                                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 flex items-center space-x-1">
                                        <ShoppingBag className="h-3 w-3" />
                                        <span>{order.vendorCount} Vendor{order.vendorCount !== 1 ? 's' : ''}</span>
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                                    <div className="flex items-center space-x-1">
                                      <User className="h-4 w-4" />
                                      <span>{order.employeeName || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                      <Calendar className="h-4 w-4" />
                                      <span>{new Date(order.orderDate).toLocaleDateString()}</span>
                                    </div>
                                  </div>
                                  {/* PR and Delivery Status Badges */}
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {order.unified_pr_status && (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        order.unified_pr_status === 'PENDING_COMPANY_ADMIN_APPROVAL' || order.unified_pr_status === 'SITE_ADMIN_APPROVED'
                                          ? 'bg-yellow-100 text-yellow-800'
                                          : order.unified_pr_status === 'COMPANY_ADMIN_APPROVED' || order.unified_pr_status === 'LINKED_TO_PO'
                                          ? 'bg-blue-100 text-blue-800'
                                          : order.unified_pr_status === 'IN_SHIPMENT' || order.unified_pr_status === 'PARTIALLY_DELIVERED'
                                          ? 'bg-purple-100 text-purple-800'
                                          : order.unified_pr_status === 'FULLY_DELIVERED'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-gray-100 text-gray-800'
                                      }`}>
                                        PR: {order.unified_pr_status.replace(/_/g, ' ')}
                                      </span>
                                    )}
                                    {order.unified_status && (
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        order.unified_status === 'DELIVERED'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : order.unified_status === 'DISPATCHED'
                                          ? 'bg-purple-100 text-purple-800'
                                          : order.unified_status === 'IN_FULFILMENT'
                                          ? 'bg-indigo-100 text-indigo-800'
                                          : order.unified_status === 'APPROVED'
                                          ? 'bg-blue-100 text-blue-800'
                                          : order.unified_status === 'PENDING_APPROVAL'
                                          ? 'bg-yellow-100 text-yellow-800'
                                          : order.unified_status === 'CANCELLED'
                                          ? 'bg-red-100 text-red-800'
                                          : 'bg-gray-100 text-gray-800'
                                      }`}>
                                        Delivery: {order.unified_status.replace(/_/g, ' ')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {canApprove && (
                                <>
                                  {enablePRPOWorkflow ? (
                                    <button
                                      onClick={() => {
                                        setSelectedOrders(new Set([order.id]))
                                        // Set today's date as default (can be changed by admin)
                                        setPoDate(new Date().toISOString().split('T')[0])
                                        setShowPOModal(true)
                                      }}
                                      className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center space-x-2 ml-3"
                                    >
                                      <FileText className="h-5 w-5" />
                                      <span>Create PO</span>
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleApprove(order.id)}
                                      className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center space-x-2 ml-3"
                                    >
                                      <CheckCircle className="h-5 w-5" />
                                      <span>Approve</span>
                                    </button>
                                  )}
                                </>
                              )}
                            </div>

                            <div className="border-t pt-4 mt-4">
                              <h4 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                                <Package className="h-5 w-5" />
                                <span>Order Items</span>
                              </h4>
                              {order.isSplitOrder && order.splitOrders ? (
                                <div className="space-y-4">
                                  {order.splitOrders.map((splitOrder: any, vendorIndex: number) => (
                                    <div key={vendorIndex} className="space-y-2">
                                      {splitOrder.items?.map((item: any, itemIndex: number) => (
                                        <div key={itemIndex} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                                          <div className="flex-1">
                                            <div className="flex items-center space-x-2 mb-1">
                                              <p className="font-medium text-gray-900">{item.uniformName}</p>
                                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                                {splitOrder.vendorName || 'Unknown Vendor'}
                                              </span>
                                            </div>
                                            <p className="text-sm text-gray-600">
                                              Size: {item.size} × Quantity: {item.quantity}
                                            </p>
                                          </div>
                                          <p className="font-semibold text-gray-900">
                                            ₹{(item.price * item.quantity).toFixed(2)}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {order.items?.map((item: any, index: number) => (
                                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                                      <div className="flex-1">
                                        <div className="flex items-center space-x-2 mb-1">
                                          <p className="font-medium text-gray-900">{item.uniformName}</p>
                                          {order.vendorName && (
                                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                              {order.vendorName}
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-sm text-gray-600">
                                          Size: {item.size} × Quantity: {item.quantity}
                                        </p>
                                      </div>
                                      <p className="font-semibold text-gray-900">
                                        ₹{(item.price * item.quantity).toFixed(2)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="mt-4 pt-4 border-t flex justify-between items-center">
                                <div>
                                  <p className="text-sm text-gray-600">Delivery Address:</p>
                                  <p className="text-gray-900 font-medium">{order.deliveryAddress || 'N/A'}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm text-gray-600">Total Amount</p>
                                  <p className="text-2xl font-bold text-gray-900">₹{order.total.toFixed(2)}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        ) : activeTab === 'approved' ? (
          <div className="space-y-4">
            {approvedOrders.map((order) => (
              <div key={order.id} className="bg-white rounded-lg shadow p-6 border border-gray-200">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">Order #{order.id}</h3>
                      {order.pr_number && (
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                          <FileText className="inline h-3 w-3 mr-1" />
                          PR: {order.pr_number}
                        </span>
                      )}
                      {order.isSplitOrder && (
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 flex items-center space-x-1">
                          <ShoppingBag className="h-3 w-3" />
                          <span>{order.vendorCount} Vendor{order.vendorCount !== 1 ? 's' : ''}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <div className="flex items-center space-x-1">
                        <User className="h-4 w-4" />
                        <span>{order.employeeName || 'N/A'}</span>
                      </div>
                      {order.pr_date && (
                        <div className="flex items-center space-x-1">
                          <Calendar className="h-4 w-4" />
                          <span>PR Date: {new Date(order.pr_date).toLocaleDateString()}</span>
                        </div>
                      )}
                      {order.company_admin_approved_at && (
                        <div className="flex items-center space-x-1">
                          <Clock className="h-4 w-4" />
                          <span>Approved: {new Date(order.company_admin_approved_at).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Total Amount</p>
                    <p className="text-2xl font-bold text-gray-900">₹{order.total?.toFixed(2) || '0.00'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : activeTab === 'poCreated' ? (
          <div className="space-y-4">
            {poCreatedOrders.map((order) => (
              <div key={order.id} className="bg-white rounded-lg shadow p-6 border border-gray-200">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">Order #{order.id}</h3>
                      {order.pr_number && (
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                          <FileText className="inline h-3 w-3 mr-1" />
                          PR: {order.pr_number}
                        </span>
                      )}
                      {order.isSplitOrder && (
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 flex items-center space-x-1">
                          <ShoppingBag className="h-3 w-3" />
                          <span>{order.vendorCount} Vendor{order.vendorCount !== 1 ? 's' : ''}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-600 mb-2">
                      <div className="flex items-center space-x-1">
                        <User className="h-4 w-4" />
                        <span>{order.employeeName || 'N/A'}</span>
                      </div>
                      {order.pr_date && (
                        <div className="flex items-center space-x-1">
                          <Calendar className="h-4 w-4" />
                          <span>PR Date: {new Date(order.pr_date).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                    {/* PR and Delivery Status Badges */}
                    <div className="flex flex-wrap gap-2 mb-2">
                      {order.unified_pr_status && (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          order.unified_pr_status === 'LINKED_TO_PO'
                            ? 'bg-blue-100 text-blue-800'
                            : order.unified_pr_status === 'IN_SHIPMENT' || order.unified_pr_status === 'PARTIALLY_DELIVERED'
                            ? 'bg-purple-100 text-purple-800'
                            : order.unified_pr_status === 'FULLY_DELIVERED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          PR: {order.unified_pr_status.replace(/_/g, ' ')}
                        </span>
                      )}
                      {order.unified_status && (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          order.unified_status === 'DELIVERED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : order.unified_status === 'DISPATCHED'
                            ? 'bg-purple-100 text-purple-800'
                            : order.unified_status === 'IN_FULFILMENT'
                            ? 'bg-indigo-100 text-indigo-800'
                            : order.unified_status === 'APPROVED'
                            ? 'bg-blue-100 text-blue-800'
                            : order.unified_status === 'CANCELLED'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          Delivery: {order.unified_status.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    {order.purchaseOrders && order.purchaseOrders.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm font-medium text-gray-700 mb-1">PO Number(s):</p>
                        <div className="flex flex-wrap gap-2">
                          {order.purchaseOrders.map((po: any, idx: number) => (
                            <span key={idx} className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                              {po?.client_po_number || po?.id || 'N/A'}
                            </span>
                          ))}
                        </div>
                        {order.vendors && order.vendors.length > 0 && (
                          <p className="text-sm text-gray-600 mt-2">
                            Vendor(s): {order.vendors.join(', ')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Total Amount</p>
                    <p className="text-2xl font-bold text-gray-900">₹{order.total?.toFixed(2) || '0.00'}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {rejectedOrders.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <XCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 text-lg">No rejected orders</p>
              </div>
            ) : (
              rejectedOrders.map((order) => (
                <div key={order.id} className="bg-white rounded-lg shadow p-6 border border-red-200">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">Order #{order.id}</h3>
                      <p className="text-sm text-gray-600 mt-1">Rejection reason and timestamp will be displayed here</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* PO Creation Modal */}
      {showPOModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Create Purchase Order</h2>
              <button
                onClick={() => {
                  setShowPOModal(false)
                  setPoNumber('')
                  setPoDate(new Date().toISOString().split('T')[0]) // Reset to today's date
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="poNumber" className="block text-sm font-medium text-gray-700 mb-1">
                  PO Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="poNumber"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter PO number"
                  required
                />
              </div>

              <div>
                <label htmlFor="poDate" className="block text-sm font-medium text-gray-700 mb-1">
                  PO Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  id="poDate"
                  value={poDate || new Date().toISOString().split('T')[0]}
                  onChange={(e) => setPoDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> This will create Purchase Order(s) for {selectedOrders.size} selected PR{selectedOrders.size !== 1 ? 's' : ''} and automatically trigger vendor fulfilment.
                  {selectedOrders.size > 1 && ' One PO will be created per vendor.'}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowPOModal(false)
                  setPoNumber('')
                  setPoDate('')
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={creatingPO}
              >
                Cancel
              </button>
              <button
                onClick={handleCreatePO}
                disabled={creatingPO || !poNumber.trim() || !poDate}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {creatingPO ? 'Creating...' : 'Create PO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}





