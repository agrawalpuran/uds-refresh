'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Search, Package, FileText, ChevronDown, ChevronRight, Calendar, MapPin, User, CreditCard, Truck, CheckCircle, Clock, AlertCircle, X, Filter, RefreshCw, XCircle, FileCheck, Send, Building2, Layers, MoreHorizontal } from 'lucide-react'
import { getOrdersByCompany, getCompanyById, getLocationByAdminEmail, getOrdersByLocation } from '@/lib/data-mongodb'
import { WorkflowActionButtons } from '@/components/workflow'
import Link from 'next/link'

// =============================================================================
// TYPES
// =============================================================================

interface GroupedOrder {
  id: string
  parentOrderId: string | null
  isGroup: boolean
  childOrders: any[]
  // Combined/derived fields for parent row
  combinedTotal: number
  combinedItems: any[]
  combinedItemCount: number
  overallStatus: string
  overallPrStatus: string
  // Original order fields (for non-grouped orders or parent display)
  employeeName?: string
  employeeIdNum?: string
  dispatchLocation?: string
  orderDate?: string
  isPersonalPayment?: boolean
  prNumber?: string
  pr_number?: string
  poNumbers?: string[]
  vendorName?: string
  // Pending action info
  pendingActions: PendingAction[]
}

interface PendingAction {
  type: 'ORDER' | 'GRN' | 'INVOICE'
  entityId: string
  displayId: string
  label: string
  priority: number // Lower = higher priority
  grnData?: any // Full GRN object for GRN actions
  invoiceData?: any // Full Invoice object for Invoice actions
}

// GRN/Invoice data mapped to order
interface OrderRelatedDocs {
  pendingGRNs: any[]
  pendingInvoices: any[]
}

// =============================================================================
// HELPER: Derive overall status from child orders
// =============================================================================

function deriveOverallStatus(childOrders: any[]): { status: string; prStatus: string } {
  if (childOrders.length === 0) {
    return { status: 'Unknown', prStatus: 'Unknown' }
  }
  
  if (childOrders.length === 1) {
    return { 
      status: childOrders[0].status || 'Unknown',
      prStatus: childOrders[0].unified_pr_status || childOrders[0].pr_status || 'Unknown'
    }
  }
  
  // Status priority for PR workflow (lowest to highest progression)
  const prStatusPriority: Record<string, number> = {
    'REJECTED': 0,
    'REJECTED_BY_SITE_ADMIN': 1,
    'REJECTED_BY_COMPANY_ADMIN': 2,
    'PENDING_SITE_ADMIN_APPROVAL': 3,
    'SITE_ADMIN_APPROVED': 4,
    'PENDING_COMPANY_ADMIN_APPROVAL': 5,
    'COMPANY_ADMIN_APPROVED': 6,
    'LINKED_TO_PO': 7,
    'PO_CREATED': 8,
    'IN_SHIPMENT': 9,
    'PARTIALLY_DELIVERED': 10,
    'FULLY_DELIVERED': 11,
  }
  
  // Find the minimum progress status (bottleneck)
  let minPrStatus = 'Unknown'
  let minPriority = Infinity
  
  for (const order of childOrders) {
    const prStatus = order.unified_pr_status || order.pr_status || 'Unknown'
    const priority = prStatusPriority[prStatus] ?? Infinity
    if (priority < minPriority) {
      minPriority = priority
      minPrStatus = prStatus
    }
  }
  
  // For display status, use the most common or the "worst" status
  const statusCounts: Record<string, number> = {}
  for (const order of childOrders) {
    const status = order.status || 'Unknown'
    statusCounts[status] = (statusCounts[status] || 0) + 1
  }
  const mostCommonStatus = Object.entries(statusCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || 'Unknown'
  
  return { status: mostCommonStatus, prStatus: minPrStatus }
}

// =============================================================================
// HELPER: Determine pending actions for an order
// =============================================================================

function determinePendingActions(
  order: any, 
  childOrders: any[] = [],
  relatedDocs?: OrderRelatedDocs
): PendingAction[] {
  const actions: PendingAction[] = []
  const prStatus = order.unified_pr_status || order.pr_status || ''
  
  // Check order-level pending approvals (Priority 1 - highest)
  if (prStatus === 'PENDING_COMPANY_ADMIN_APPROVAL') {
    actions.push({
      type: 'ORDER',
      entityId: order.id,
      displayId: order.prNumber || order.pr_number || order.id,
      label: 'Approve Order',
      priority: 1,
    })
  }
  
  // Check for pending GRN approvals (Priority 2)
  if (relatedDocs?.pendingGRNs && relatedDocs.pendingGRNs.length > 0) {
    relatedDocs.pendingGRNs.forEach((grn, idx) => {
      actions.push({
        type: 'GRN',
        entityId: grn.id || grn.grnId,
        displayId: grn.grnNumber || grn.id,
        label: 'Approve GRN',
        priority: 2 + idx * 0.1, // Slightly stagger multiple GRNs
        grnData: grn,
      })
    })
  }
  
  // Check for pending Invoice approvals (Priority 3)
  if (relatedDocs?.pendingInvoices && relatedDocs.pendingInvoices.length > 0) {
    relatedDocs.pendingInvoices.forEach((invoice, idx) => {
      actions.push({
        type: 'INVOICE',
        entityId: invoice.id || invoice.invoiceId,
        displayId: invoice.invoiceNumber || invoice.vendorInvoiceNumber || invoice.id,
        label: 'Approve Invoice',
        priority: 3 + idx * 0.1, // Slightly stagger multiple invoices
        invoiceData: invoice,
      })
    })
  }
  
  return actions.sort((a, b) => a.priority - b.priority)
}

// =============================================================================
// HELPER: Group orders by parentOrderId
// =============================================================================

function groupOrdersByParent(
  orders: any[], 
  orderRelatedDocsMap?: Map<string, OrderRelatedDocs>
): GroupedOrder[] {
  const parentMap = new Map<string, any[]>()
  const standaloneOrders: any[] = []
  
  // First pass: categorize orders
  for (const order of orders) {
    const parentId = order.parentOrderId
    
    if (parentId) {
      if (!parentMap.has(parentId)) {
        parentMap.set(parentId, [])
      }
      parentMap.get(parentId)!.push(order)
    } else {
      // Check if this order IS a parent (its id might be a parentOrderId for others)
      const hasChildren = orders.some(o => o.parentOrderId === order.id)
      if (!hasChildren) {
        standaloneOrders.push(order)
      }
      // If it has children, the children will be grouped under this parent
    }
  }
  
  // Second pass: create grouped orders
  const groupedOrders: GroupedOrder[] = []
  
  // Process parent groups
  for (const [parentId, children] of parentMap.entries()) {
    // Find the primary child order (first one or the one with most info)
    const primaryChild = children.sort((a, b) => 
      (b.items?.length || 0) - (a.items?.length || 0)
    )[0]
    
    const { status, prStatus } = deriveOverallStatus(children)
    
    // Combine all items from child orders
    const combinedItems: any[] = []
    let combinedTotal = 0
    for (const child of children) {
      if (child.items) {
        combinedItems.push(...child.items)
      }
      combinedTotal += child.total || 0
    }
    
    // Collect all PO numbers
    const allPoNumbers = new Set<string>()
    for (const child of children) {
      if (child.poNumbers) {
        child.poNumbers.forEach((po: string) => allPoNumbers.add(po))
      }
    }
    
    // Aggregate related docs from all child orders
    const aggregatedRelatedDocs: OrderRelatedDocs = { pendingGRNs: [], pendingInvoices: [] }
    for (const child of children) {
      const childDocs = orderRelatedDocsMap?.get(child.id)
      if (childDocs) {
        aggregatedRelatedDocs.pendingGRNs.push(...childDocs.pendingGRNs)
        aggregatedRelatedDocs.pendingInvoices.push(...childDocs.pendingInvoices)
      }
    }
    // Also check parent ID itself
    const parentDocs = orderRelatedDocsMap?.get(parentId)
    if (parentDocs) {
      aggregatedRelatedDocs.pendingGRNs.push(...parentDocs.pendingGRNs)
      aggregatedRelatedDocs.pendingInvoices.push(...parentDocs.pendingInvoices)
    }
    
    groupedOrders.push({
      id: parentId,
      parentOrderId: parentId,
      isGroup: true,
      childOrders: children,
      combinedTotal,
      combinedItems,
      combinedItemCount: combinedItems.length,
      overallStatus: status,
      overallPrStatus: prStatus,
      employeeName: primaryChild.employeeName,
      employeeIdNum: primaryChild.employeeIdNum,
      dispatchLocation: primaryChild.dispatchLocation,
      orderDate: primaryChild.orderDate,
      isPersonalPayment: primaryChild.isPersonalPayment,
      prNumber: primaryChild.prNumber || primaryChild.pr_number,
      pr_number: primaryChild.pr_number,
      poNumbers: Array.from(allPoNumbers),
      vendorName: children.map(c => c.vendorName).filter(Boolean).join(', '),
      pendingActions: determinePendingActions(primaryChild, children, aggregatedRelatedDocs),
    })
  }
  
  // Add standalone orders
  for (const order of standaloneOrders) {
    const { status, prStatus } = deriveOverallStatus([order])
    const relatedDocs = orderRelatedDocsMap?.get(order.id)
    
    groupedOrders.push({
      id: order.id,
      parentOrderId: null,
      isGroup: false,
      childOrders: [],
      combinedTotal: order.total || 0,
      combinedItems: order.items || [],
      combinedItemCount: order.items?.length || 0,
      overallStatus: status,
      overallPrStatus: prStatus,
      employeeName: order.employeeName,
      employeeIdNum: order.employeeIdNum,
      dispatchLocation: order.dispatchLocation,
      orderDate: order.orderDate,
      isPersonalPayment: order.isPersonalPayment,
      prNumber: order.prNumber || order.pr_number,
      pr_number: order.pr_number,
      poNumbers: order.poNumbers || [],
      vendorName: order.vendorName,
      pendingActions: determinePendingActions(order, [], relatedDocs),
    })
  }
  
  // Sort by orderDate descending (most recent first)
  return groupedOrders.sort((a, b) => {
    const dateA = a.orderDate ? new Date(a.orderDate).getTime() : 0
    const dateB = b.orderDate ? new Date(b.orderDate).getTime() : 0
    return dateB - dateA
  })
}

// =============================================================================
// COMPONENT: Order Actions Cell
// =============================================================================

interface OrderActionsCellProps {
  groupedOrder: GroupedOrder
  companyId: string
  userRole: string
  userId: string
  primaryColor: string
  onActionComplete: (orderId: string, action: 'approve' | 'reject', success: boolean) => Promise<void>
}

function OrderActionsCell({
  groupedOrder,
  companyId,
  userRole,
  userId,
  primaryColor,
  onActionComplete,
}: OrderActionsCellProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [approving, setApproving] = useState<string | null>(null) // Track which action is in progress
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  
  // Determine the primary action based on order status
  const prStatus = groupedOrder.overallPrStatus
  const pendingActions = groupedOrder.pendingActions || []
  
  // Get the order ID(s) to approve
  const getOrderIdsForAction = (): string[] => {
    if (groupedOrder.isGroup && groupedOrder.childOrders.length > 0) {
      return groupedOrder.childOrders.map((child: any) => child.id)
    }
    return [groupedOrder.id]
  }
  
  // =====================================================
  // ORDER Approval Handler
  // =====================================================
  const handleOrderApprove = async () => {
    if (approving) return
    
    const orderIds = getOrderIdsForAction()
    const displayId = groupedOrder.prNumber || groupedOrder.pr_number || groupedOrder.id
    const primaryOrderId = orderIds[0]
    
    if (!confirm(`Are you sure you want to approve order ${displayId}?`)) {
      return
    }
    
    setApproving('ORDER')
    
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          orderId: primaryOrderId,
          adminEmail: userId,
        }),
      })
      
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || result.message || 'Failed to approve order')
      }
      
      await onActionComplete(primaryOrderId, 'approve', true)
    } catch (error: any) {
      console.error('Error approving order:', error)
      alert(`Error approving order: ${error.message || 'Unknown error'}`)
    } finally {
      setApproving(null)
    }
  }
  
  // =====================================================
  // Reject Handler (for ORDER only - GRN/Invoice reject can be added)
  // =====================================================
  const handleDirectReject = async (reasonCode: string, remarks?: string) => {
    const orderIds = getOrderIdsForAction()
    
    setRejecting(true)
    
    try {
      for (const orderId of orderIds) {
        const response = await fetch('/api/workflow/reject', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-company-id': companyId,
            'x-user-role': userRole,
            'x-user-id': userId,
          },
          body: JSON.stringify({
            entityType: 'ORDER',
            entityId: orderId,
            reasonCode,
            remarks,
          }),
        })
        
        const result = await response.json()
        
        if (!response.ok || !result.success) {
          throw new Error(result.error?.message || result.message || 'Failed to reject order')
        }
      }
      
      setShowRejectModal(false)
      await onActionComplete(orderIds[0], 'reject', true)
    } catch (error: any) {
      console.error('Error rejecting order:', error)
      alert(`Error rejecting order: ${error.message || 'Unknown error'}`)
    } finally {
      setRejecting(false)
    }
  }
  
  // =====================================================
  // Render Action Button for a PendingAction
  // =====================================================
  const renderActionButton = (action: PendingAction, isPrimary: boolean) => {
    const isLoading = approving === action.type || approving === `${action.type}-${action.entityId}`
    
    // ORDER: Direct approval buttons
    if (action.type === 'ORDER') {
      return (
        <button
          key={action.entityId}
          onClick={handleOrderApprove}
          disabled={!!approving || rejecting}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-all hover:shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${isPrimary ? '' : 'opacity-90'}`}
          style={{ backgroundColor: primaryColor }}
          title={`Approve Order ${action.displayId}`}
        >
          {isLoading ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle className="h-3.5 w-3.5" />
          )}
          <span>{isLoading ? 'Approving...' : 'Approve Order'}</span>
        </button>
      )
    }
    
    // GRN: Navigate to GRN page
    if (action.type === 'GRN') {
      return (
        <Link
          key={action.entityId}
          href="/dashboard/company/grns"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-all hover:shadow-md active:scale-95"
          style={{ backgroundColor: '#059669' }} // Green for GRN
          title={`View pending GRN ${action.displayId}`}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>Pending GRN Approval</span>
        </Link>
      )
    }
    
    // INVOICE: Navigate to Invoices page
    if (action.type === 'INVOICE') {
      return (
        <Link
          key={action.entityId}
          href="/dashboard/company/invoices"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-all hover:shadow-md active:scale-95"
          style={{ backgroundColor: '#7c3aed' }} // Purple for Invoice
          title={`View pending Invoice ${action.displayId}`}
        >
          <FileCheck className="h-3.5 w-3.5" />
          <span>Pending Invoice Approval</span>
        </Link>
      )
    }
    
    return null
  }
  
  // =====================================================
  // RENDER: If there are pending actions
  // =====================================================
  if (pendingActions.length > 0 && userRole === 'COMPANY_ADMIN') {
    const primaryAction = pendingActions[0]
    const secondaryActions = pendingActions.slice(1)
    const showOrderRejectButton = primaryAction.type === 'ORDER'
    
    return (
      <>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Primary Action Button */}
          {renderActionButton(primaryAction, true)}
          
          {/* Reject button for ORDER actions */}
          {showOrderRejectButton && (
            <button
              onClick={() => setShowRejectModal(true)}
              disabled={!!approving || rejecting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg transition-all hover:bg-red-600 hover:shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Reject this order"
            >
              <XCircle className="h-3.5 w-3.5" />
              <span>Reject</span>
            </button>
          )}
          
          {/* Secondary Actions Dropdown */}
          {secondaryActions.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                title={`${secondaryActions.length} more pending action(s)`}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
                <span className="text-xs">+{secondaryActions.length}</span>
              </button>
              
              {showDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
                  <div className="absolute right-0 mt-1 w-52 bg-white rounded-lg shadow-lg border border-gray-200 z-20 py-1">
                    {secondaryActions.map((action) => (
                      <Link
                        key={`${action.type}-${action.entityId}`}
                        href={action.type === 'GRN' ? '/dashboard/company/grns' : '/dashboard/company/invoices'}
                        onClick={() => setShowDropdown(false)}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors w-full"
                      >
                        {action.type === 'GRN' && <FileText className="h-3.5 w-3.5 text-emerald-600" />}
                        {action.type === 'INVOICE' && <FileCheck className="h-3.5 w-3.5 text-purple-600" />}
                        <span>Pending {action.type} Approval</span>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        
        {/* Reject Modal */}
        {showRejectModal && (
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowRejectModal(false)}
          >
            <div 
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                    <XCircle className="h-6 w-6 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Reject Order</h3>
                    <p className="text-sm text-gray-500">
                      {groupedOrder.prNumber || groupedOrder.pr_number || groupedOrder.id}
                    </p>
                  </div>
                </div>
                
                <form onSubmit={(e) => {
                  e.preventDefault()
                  const formData = new FormData(e.currentTarget)
                  const reason = formData.get('reason') as string
                  const remarks = formData.get('remarks') as string
                  handleDirectReject(reason, remarks)
                }}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reason for Rejection *
                    </label>
                    <select 
                      name="reason" 
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    >
                      <option value="">Select a reason...</option>
                      <option value="BUDGET_EXCEEDED">Budget Exceeded</option>
                      <option value="INVALID_ITEMS">Invalid Items</option>
                      <option value="DUPLICATE_ORDER">Duplicate Order</option>
                      <option value="POLICY_VIOLATION">Policy Violation</option>
                      <option value="INCORRECT_QUANTITIES">Incorrect Quantities</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Additional Remarks
                    </label>
                    <textarea 
                      name="remarks"
                      rows={3}
                      placeholder="Optional: Add more details about the rejection..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    />
                  </div>
                  
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowRejectModal(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={rejecting}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {rejecting ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Rejecting...
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4" />
                          Confirm Rejection
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }
  
  // =====================================================
  // RENDER: No pending actions - show navigation links
  // =====================================================
  const getSecondaryActions = () => {
    const actions: { label: string; href: string; icon: typeof CheckCircle }[] = []
    
    // If order has PO created, show link to GRN page
    if (['PO_CREATED', 'LINKED_TO_PO', 'IN_SHIPMENT', 'PARTIALLY_DELIVERED', 'FULLY_DELIVERED'].includes(prStatus)) {
      actions.push({
        label: 'View GRNs',
        href: '/dashboard/company/grns',
        icon: FileText,
      })
    }
    
    // If fully delivered, may have pending invoice
    if (['FULLY_DELIVERED'].includes(prStatus)) {
      actions.push({
        label: 'View Invoices',
        href: '/dashboard/company/invoices',
        icon: FileCheck,
      })
    }
    
    return actions
  }
  
  const navActions = getSecondaryActions()
  
  // Show status text with optional navigation actions
  if (navActions.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-gray-400">
        <Clock className="h-3.5 w-3.5" />
        <span className="text-xs truncate max-w-[120px]">
          {getStatusText(prStatus)}
        </span>
      </div>
    )
  }
  
  if (navActions.length === 1) {
    const action = navActions[0]
    return (
      <Link
        href={action.href}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
      >
        <action.icon className="h-3.5 w-3.5" />
        {action.label}
      </Link>
    )
  }
  
  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
        More
      </button>
      
      {showDropdown && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
          <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 z-20 py-1">
            {navActions.map((action, idx) => (
              <Link
                key={idx}
                href={action.href}
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={() => setShowDropdown(false)}
              >
                <action.icon className="h-3.5 w-3.5 text-gray-400" />
                {action.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Helper to get human-readable status text
function getStatusText(prStatus: string): string {
  const statusMap: Record<string, string> = {
    'PENDING_SITE_ADMIN_APPROVAL': 'Awaiting Site Admin',
    'SITE_ADMIN_APPROVED': 'Site Admin Approved',
    'PENDING_COMPANY_ADMIN_APPROVAL': 'Awaiting Approval',
    'COMPANY_ADMIN_APPROVED': 'Approved',
    'LINKED_TO_PO': 'PO Created',
    'PO_CREATED': 'PO Created',
    'IN_SHIPMENT': 'In Transit',
    'PARTIALLY_DELIVERED': 'Partially Delivered',
    'FULLY_DELIVERED': 'Delivered',
    'REJECTED': 'Rejected',
    'REJECTED_BY_SITE_ADMIN': 'Rejected',
    'REJECTED_BY_COMPANY_ADMIN': 'Rejected',
  }
  return statusMap[prStatus] || 'No action required'
}

// PR Status tabs configuration
const PR_STATUS_TABS = [
  { id: 'all', label: 'All Orders', icon: Package },
  { id: 'pending_site_admin', label: 'Pending Site Admin', icon: Clock, statuses: ['PENDING_SITE_ADMIN_APPROVAL'] },
  { id: 'site_admin_approved', label: 'Site Admin Approved', icon: CheckCircle, statuses: ['SITE_ADMIN_APPROVED'] },
  { id: 'pending_company_admin', label: 'Pending Company Admin', icon: Building2, statuses: ['PENDING_COMPANY_ADMIN_APPROVAL'] },
  { id: 'company_admin_approved', label: 'Company Admin Approved', icon: FileCheck, statuses: ['COMPANY_ADMIN_APPROVED'] },
  { id: 'po_created', label: 'PO Created', icon: FileText, statuses: ['LINKED_TO_PO', 'PO_CREATED'] },
  { id: 'in_shipment', label: 'In Shipment', icon: Truck, statuses: ['IN_SHIPMENT', 'PARTIALLY_DELIVERED'] },
  { id: 'delivered', label: 'Delivered', icon: CheckCircle, statuses: ['FULLY_DELIVERED'] },
  { id: 'rejected', label: 'Rejected', icon: XCircle, statuses: ['REJECTED', 'REJECTED_BY_SITE_ADMIN', 'REJECTED_BY_COMPANY_ADMIN'] },
]

// Status badge component with modern styling
const StatusBadge = ({ status, prStatus }: { status: string; prStatus?: string }) => {
  const displayStatus = prStatus || status
  
  const statusConfig: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode }> = {
    // PR Statuses
    'PENDING_SITE_ADMIN_APPROVAL': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: <Clock className="h-3.5 w-3.5" /> },
    'SITE_ADMIN_APPROVED': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: <CheckCircle className="h-3.5 w-3.5" /> },
    'PENDING_COMPANY_ADMIN_APPROVAL': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', icon: <Building2 className="h-3.5 w-3.5" /> },
    'COMPANY_ADMIN_APPROVED': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', icon: <FileCheck className="h-3.5 w-3.5" /> },
    'LINKED_TO_PO': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: <FileText className="h-3.5 w-3.5" /> },
    'PO_CREATED': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: <FileText className="h-3.5 w-3.5" /> },
    'IN_SHIPMENT': { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', icon: <Truck className="h-3.5 w-3.5" /> },
    'PARTIALLY_DELIVERED': { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', icon: <Truck className="h-3.5 w-3.5" /> },
    'FULLY_DELIVERED': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: <CheckCircle className="h-3.5 w-3.5" /> },
    'REJECTED': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: <XCircle className="h-3.5 w-3.5" /> },
    'REJECTED_BY_SITE_ADMIN': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: <XCircle className="h-3.5 w-3.5" /> },
    'REJECTED_BY_COMPANY_ADMIN': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: <XCircle className="h-3.5 w-3.5" /> },
    // Legacy statuses
    'delivered': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: <CheckCircle className="h-3.5 w-3.5" /> },
    'Delivered': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: <CheckCircle className="h-3.5 w-3.5" /> },
    'dispatched': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: <Truck className="h-3.5 w-3.5" /> },
    'Dispatched': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: <Truck className="h-3.5 w-3.5" /> },
    'confirmed': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', icon: <CheckCircle className="h-3.5 w-3.5" /> },
    'processing': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: <Clock className="h-3.5 w-3.5" /> },
    'pending': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: <Clock className="h-3.5 w-3.5" /> },
    'Awaiting approval': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: <Clock className="h-3.5 w-3.5" /> },
    'Awaiting fulfilment': { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', icon: <Package className="h-3.5 w-3.5" /> },
    'cancelled': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: <X className="h-3.5 w-3.5" /> },
  }

  const config = statusConfig[displayStatus] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', icon: <AlertCircle className="h-3.5 w-3.5" /> }
  const displayLabel = displayStatus.replace(/_/g, ' ')

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}>
      {config.icon}
      <span className="capitalize">{displayLabel}</span>
    </span>
  )
}

export default function CompanyOrdersPage() {
  const [companyId, setCompanyId] = useState<string>('')
  const [companyOrders, setCompanyOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [companyPrimaryColor, setCompanyPrimaryColor] = useState<string>('#f76b1c')
  const [companySecondaryColor, setCompanySecondaryColor] = useState<string>('#f76b1c')
  const [isLocationAdmin, setIsLocationAdmin] = useState<boolean>(false)
  const [locationInfo, setLocationInfo] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [locationFilter, setLocationFilter] = useState('all')
  const [selectedOrder, setSelectedOrder] = useState<any>(null)
  const [userRole, setUserRole] = useState<string>('COMPANY_ADMIN')
  const [userId, setUserId] = useState<string>('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [isPrPoWorkflowEnabled, setIsPrPoWorkflowEnabled] = useState<boolean>(false)
  
  // GRN and Invoice data for dynamic actions
  const [companyGRNs, setCompanyGRNs] = useState<any[]>([])
  const [companyInvoices, setCompanyInvoices] = useState<any[]>([])
  const [orderRelatedDocsMap, setOrderRelatedDocsMap] = useState<Map<string, OrderRelatedDocs>>(new Map())

  // Toggle expand/collapse for a group
  const toggleGroupExpand = useCallback((groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupId)) {
        next.delete(groupId)
      } else {
        next.add(groupId)
      }
      return next
    })
  }, [])
  
  // Get company ID from tab-specific storage (set during login)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        try {
          setLoading(true)
          // SECURITY FIX: Use only tab-specific auth storage, not localStorage
          const { getUserEmail, getCompanyId } = await import('@/lib/utils/auth-storage')
          const storedCompanyId = getCompanyId()
          const userEmail = getUserEmail('company')
          
          // Check if user is Location Admin
          let locationAdminLocation = null
          if (userEmail) {
            locationAdminLocation = await getLocationByAdminEmail(userEmail)
            const isLocationAdminUser = !!locationAdminLocation
            setIsLocationAdmin(isLocationAdminUser)
            setLocationInfo(locationAdminLocation)
            
            // Set user role based on admin type
            setUserRole(isLocationAdminUser ? 'LOCATION_ADMIN' : 'COMPANY_ADMIN')
            setUserId(userEmail) // Use email as user ID for now
            
            if (isLocationAdminUser && locationAdminLocation) {
              const locationId = locationAdminLocation.id || locationAdminLocation._id?.toString()
              if (locationId) {
                const locationOrders = await getOrdersByLocation(locationId)
                setCompanyOrders(locationOrders)
                
                const targetCompanyId = locationAdminLocation.companyId?.id || locationAdminLocation.companyId || storedCompanyId
                if (targetCompanyId) {
                  setCompanyId(targetCompanyId)
                  const companyDetails = await getCompanyById(targetCompanyId)
                  if (companyDetails) {
                    setCompanyPrimaryColor(companyDetails.primaryColor || '#f76b1c')
                    setCompanySecondaryColor(companyDetails.secondaryColor || companyDetails.primaryColor || '#f76b1c')
                    setIsPrPoWorkflowEnabled(!!companyDetails.enable_pr_po_workflow)
                  }
                }
                return
              }
            }
          }
          
          if (storedCompanyId) {
            setCompanyId(storedCompanyId)
            const filtered = await getOrdersByCompany(storedCompanyId)
            if (filtered.length > 0) {
              console.log('[OrderHistory] Sample order:', {
                id: filtered[0].id,
                employeeName: filtered[0].employeeName,
                unified_pr_status: filtered[0].unified_pr_status,
                prNumber: filtered[0].prNumber,
                poNumbers: filtered[0].poNumbers,
              })
            }
            setCompanyOrders(filtered)
            
            // Fetch GRNs with pending approval status
            try {
              const grnsResponse = await fetch(`/api/grns?companyId=${storedCompanyId}&raisedByVendors=true`)
              if (grnsResponse.ok) {
                const grns = await grnsResponse.json()
                // Filter for pending GRNs (RAISED status, not yet APPROVED)
                const pendingGRNs = grns.filter((grn: any) => 
                  (grn.grnStatus === 'RAISED' || grn.unified_grn_status === 'RAISED' || grn.unified_grn_status === 'PENDING_APPROVAL') &&
                  grn.grnStatus !== 'APPROVED' && grn.unified_grn_status !== 'APPROVED'
                )
                setCompanyGRNs(pendingGRNs)
                console.log(`[OrderHistory] Fetched ${pendingGRNs.length} pending GRNs`)
              }
            } catch (err) {
              console.error('Error fetching GRNs:', err)
            }
            
            // Fetch Invoices with pending approval status
            try {
              const invoicesResponse = await fetch(`/api/company/invoices?companyId=${storedCompanyId}`)
              if (invoicesResponse.ok) {
                const invoicesData = await invoicesResponse.json()
                const invoices = Array.isArray(invoicesData) ? invoicesData : (invoicesData.invoices || [])
                // Filter for pending Invoices (RAISED status, not yet APPROVED)
                const pendingInvoices = invoices.filter((inv: any) => 
                  (inv.invoiceStatus === 'RAISED' || inv.unified_invoice_status === 'RAISED' || inv.unified_invoice_status === 'PENDING_APPROVAL') &&
                  inv.invoiceStatus !== 'APPROVED' && inv.unified_invoice_status !== 'APPROVED'
                )
                setCompanyInvoices(pendingInvoices)
                console.log(`[OrderHistory] Fetched ${pendingInvoices.length} pending Invoices`)
              }
            } catch (err) {
              console.error('Error fetching Invoices:', err)
            }
            
            const companyDetails = await getCompanyById(storedCompanyId)
            if (companyDetails) {
              setCompanyPrimaryColor(companyDetails.primaryColor || '#f76b1c')
              setCompanySecondaryColor(companyDetails.secondaryColor || companyDetails.primaryColor || '#f76b1c')
              setIsPrPoWorkflowEnabled(!!companyDetails.enable_pr_po_workflow)
            }
          }
        } catch (error) {
          console.error('Error loading orders:', error)
        } finally {
          setLoading(false)
        }
      }
      
      loadData()
    }
  }, [])

  // Get unique locations for filter
  const uniqueLocations = useMemo(() => {
    const locations = new Set<string>()
    companyOrders.forEach(order => {
      if (order.dispatchLocation) {
        locations.add(order.dispatchLocation)
      }
    })
    return Array.from(locations)
  }, [companyOrders])

  // Build order-to-related-docs mapping when orders, GRNs, or Invoices change
  useEffect(() => {
    const docsMap = new Map<string, OrderRelatedDocs>()
    
    // Map GRNs to orders (via prNumbers, poNumber, or orderId)
    for (const grn of companyGRNs) {
      // GRNs can be linked via prNumbers (array), poNumber, or orderId
      const linkedOrderIds = new Set<string>()
      
      // Check prNumbers array
      if (grn.prNumbers && Array.isArray(grn.prNumbers)) {
        for (const prNumber of grn.prNumbers) {
          // Find orders with matching prNumber
          const matchingOrders = companyOrders.filter(o => 
            o.prNumber === prNumber || o.pr_number === prNumber
          )
          matchingOrders.forEach(o => linkedOrderIds.add(o.id))
        }
      }
      
      // Check direct orderId link
      if (grn.orderId) {
        linkedOrderIds.add(grn.orderId)
      }
      
      // Check poNumber and find orders with that PO
      if (grn.poNumber) {
        const matchingOrders = companyOrders.filter(o => 
          o.poNumbers?.includes(grn.poNumber)
        )
        matchingOrders.forEach(o => linkedOrderIds.add(o.id))
      }
      
      // Add GRN to each linked order's docs
      for (const orderId of linkedOrderIds) {
        if (!docsMap.has(orderId)) {
          docsMap.set(orderId, { pendingGRNs: [], pendingInvoices: [] })
        }
        docsMap.get(orderId)!.pendingGRNs.push(grn)
      }
    }
    
    // Map Invoices to orders (via prNumbers, grnId, poNumber, or orderId)
    for (const invoice of companyInvoices) {
      const linkedOrderIds = new Set<string>()
      
      // Check prNumbers array
      if (invoice.prNumbers && Array.isArray(invoice.prNumbers)) {
        for (const prNumber of invoice.prNumbers) {
          const matchingOrders = companyOrders.filter(o => 
            o.prNumber === prNumber || o.pr_number === prNumber
          )
          matchingOrders.forEach(o => linkedOrderIds.add(o.id))
        }
      }
      
      // Check direct orderId link
      if (invoice.orderId) {
        linkedOrderIds.add(invoice.orderId)
      }
      
      // Check poNumber
      if (invoice.poNumber) {
        const matchingOrders = companyOrders.filter(o => 
          o.poNumbers?.includes(invoice.poNumber)
        )
        matchingOrders.forEach(o => linkedOrderIds.add(o.id))
      }
      
      // Add invoice to each linked order's docs
      for (const orderId of linkedOrderIds) {
        if (!docsMap.has(orderId)) {
          docsMap.set(orderId, { pendingGRNs: [], pendingInvoices: [] })
        }
        docsMap.get(orderId)!.pendingInvoices.push(invoice)
      }
    }
    
    setOrderRelatedDocsMap(docsMap)
    console.log(`[OrderHistory] Built orderRelatedDocsMap with ${docsMap.size} orders having related docs`)
  }, [companyOrders, companyGRNs, companyInvoices])

  // Group orders by parentOrderId (before filtering, for accurate counts)
  const groupedOrders = useMemo(() => {
    const grouped = groupOrdersByParent(companyOrders, orderRelatedDocsMap)
    // Debug: Log first few grouped orders' statuses and pending actions
    if (grouped.length > 0) {
      console.log(`[groupedOrders] Total: ${grouped.length}, Sample:`, 
        grouped.slice(0, 3).map(g => ({ 
          id: g.id, 
          prStatus: g.overallPrStatus,
          pendingActions: g.pendingActions.map(a => a.type)
        })))
    }
    return grouped
  }, [companyOrders, orderRelatedDocsMap])

  // Get tab counts (based on grouped orders, using overall status)
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: groupedOrders.length }
    PR_STATUS_TABS.forEach(tab => {
      if (tab.statuses) {
        counts[tab.id] = groupedOrders.filter(order => 
          tab.statuses!.includes(order.overallPrStatus)
        ).length
      }
    })
    return counts
  }, [groupedOrders])

  // Filter grouped orders based on search, tab, and location
  const filteredGroupedOrders = useMemo(() => {
    return groupedOrders.filter(order => {
      // Search filter - search across parent and child orders
      const searchLower = searchQuery.toLowerCase()
      const matchesSearch = !searchQuery || 
        order.id?.toLowerCase().includes(searchLower) ||
        order.employeeName?.toLowerCase().includes(searchLower) ||
        order.prNumber?.toLowerCase().includes(searchLower) ||
        order.pr_number?.toLowerCase().includes(searchLower) ||
        order.poNumbers?.some((po: string) => po?.toLowerCase().includes(searchLower)) ||
        // Also search in child orders
        order.childOrders.some((child: any) => 
          child.id?.toLowerCase().includes(searchLower) ||
          child.vendorName?.toLowerCase().includes(searchLower)
        )

      // Tab filter (PR Status) - use overall status for grouped orders
      const currentTab = PR_STATUS_TABS.find(t => t.id === activeTab)
      const matchesTab = activeTab === 'all' || (
        currentTab?.statuses && currentTab.statuses.includes(order.overallPrStatus)
      )

      // Location filter
      const matchesLocation = locationFilter === 'all' ||
        order.dispatchLocation === locationFilter

      return matchesSearch && matchesTab && matchesLocation
    })
  }, [groupedOrders, searchQuery, activeTab, locationFilter])

  // Legacy filtered orders for backward compatibility (detail modal)
  const filteredOrders = useMemo(() => {
    return companyOrders.filter(order => {
      const searchLower = searchQuery.toLowerCase()
      const matchesSearch = !searchQuery || 
        order.id?.toLowerCase().includes(searchLower) ||
        order.employeeName?.toLowerCase().includes(searchLower)
      const currentTab = PR_STATUS_TABS.find(t => t.id === activeTab)
      const matchesTab = activeTab === 'all' || (
        currentTab?.statuses && (
          currentTab.statuses.includes(order.unified_pr_status) ||
          currentTab.statuses.includes(order.pr_status)
        )
      )
      const matchesLocation = locationFilter === 'all' ||
        order.dispatchLocation === locationFilter
      return matchesSearch && matchesTab && matchesLocation
    })
  }, [companyOrders, searchQuery, activeTab, locationFilter])

  // Refresh orders, GRNs, and Invoices after workflow action
  const refreshOrders = useCallback(async () => {
    try {
      setLoading(true)
      
      // Clear current data to ensure fresh render
      setCompanyOrders([])
      setCompanyGRNs([])
      setCompanyInvoices([])
      
      // Small delay to ensure backend has processed the change
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Fetch fresh order data
      let targetCompanyId = companyId
      
      if (isLocationAdmin && locationInfo) {
        const locationId = locationInfo.id || locationInfo._id?.toString()
        if (locationId) {
          const locationOrders = await getOrdersByLocation(locationId)
          setCompanyOrders(locationOrders)
          targetCompanyId = locationInfo.companyId?.id || locationInfo.companyId || companyId
        }
      } else if (companyId) {
        const filtered = await getOrdersByCompany(companyId)
        setCompanyOrders(filtered)
      }
      
      // Refresh GRNs
      if (targetCompanyId) {
        try {
          const grnsResponse = await fetch(`/api/grns?companyId=${targetCompanyId}&raisedByVendors=true&_t=${Date.now()}`)
          if (grnsResponse.ok) {
            const grns = await grnsResponse.json()
            const pendingGRNs = grns.filter((grn: any) => 
              (grn.grnStatus === 'RAISED' || grn.unified_grn_status === 'RAISED' || grn.unified_grn_status === 'PENDING_APPROVAL') &&
              grn.grnStatus !== 'APPROVED' && grn.unified_grn_status !== 'APPROVED'
            )
            setCompanyGRNs(pendingGRNs)
          }
        } catch (err) {
          console.error('Error refreshing GRNs:', err)
        }
        
        // Refresh Invoices
        try {
          const invoicesResponse = await fetch(`/api/company/invoices?companyId=${targetCompanyId}&_t=${Date.now()}`)
          if (invoicesResponse.ok) {
            const invoicesData = await invoicesResponse.json()
            const invoices = Array.isArray(invoicesData) ? invoicesData : (invoicesData.invoices || [])
            const pendingInvoices = invoices.filter((inv: any) => 
              (inv.invoiceStatus === 'RAISED' || inv.unified_invoice_status === 'RAISED' || inv.unified_invoice_status === 'PENDING_APPROVAL') &&
              inv.invoiceStatus !== 'APPROVED' && inv.unified_invoice_status !== 'APPROVED'
            )
            setCompanyInvoices(pendingInvoices)
          }
        } catch (err) {
          console.error('Error refreshing Invoices:', err)
        }
      }
    } catch (error) {
      console.error('Error refreshing orders:', error)
    } finally {
      setLoading(false)
    }
  }, [isLocationAdmin, locationInfo, companyId])

  // Handle workflow action completion
  const handleActionComplete = useCallback(async (orderId: string, action: 'approve' | 'reject', success: boolean) => {
    console.log(`[handleActionComplete] orderId=${orderId}, action=${action}, success=${success}`)
    if (success) {
      console.log(`[handleActionComplete] Refreshing data...`)
      // Refresh orders, GRNs, and Invoices to get updated status
      await refreshOrders()
      console.log(`[handleActionComplete] Refresh complete`)
      // Note: Success alerts are shown by the action handlers themselves
    }
  }, [refreshOrders])

  // Format date nicely
  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A'
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return dateString
    }
  }

  // Helper to check if name appears to be encrypted (base64 with special chars)
  const isEncryptedValue = (value: string | undefined): boolean => {
    if (!value) return false
    // Check for typical encrypted patterns: contains / or + in middle, or looks like base64
    const hasEncryptedPattern = /^[A-Za-z0-9+/=]{10,}$/.test(value) || value.includes('/') || value.includes('+')
    // Names typically have spaces and letters only
    const looksLikeName = /^[A-Za-z\s.'-]+$/.test(value) && value.includes(' ')
    return hasEncryptedPattern && !looksLikeName
  }

  // Format employee name - show N/A if encrypted
  const formatEmployeeName = (name: string | undefined): string => {
    if (!name) return 'N/A'
    if (isEncryptedValue(name)) return 'N/A'
    return name
  }

  return (
    <DashboardLayout actorType="company">
      <div className="min-h-screen">
        {/* Header Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Order Management</h1>
              <p className="mt-1 text-sm text-gray-500">
                {isLocationAdmin 
                  ? `Viewing orders for ${locationInfo?.name || 'your location'}`
                  : `Manage and track all purchase requisitions`
                }
              </p>
            </div>
            <button 
              onClick={() => {
                window.location.href = '/dashboard/company/batch-upload'
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-white font-medium rounded-xl shadow-lg shadow-orange-500/25 transition-all hover:shadow-xl hover:shadow-orange-500/30 hover:-translate-y-0.5"
              style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
            >
              <Package className="h-4 w-4" />
              Place Bulk Order
            </button>
          </div>
        </div>

        {/* PR Status Tabs */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
          <div className="overflow-x-auto">
            <div className="flex min-w-max border-b border-gray-100">
              {PR_STATUS_TABS.map((tab) => {
                const Icon = tab.icon
                const count = tabCounts[tab.id] || 0
                const isActive = activeTab === tab.id
                
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-5 py-4 text-sm font-medium transition-all relative whitespace-nowrap ${
                      isActive 
                        ? 'text-gray-900' 
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? '' : 'opacity-70'}`} style={isActive ? { color: companyPrimaryColor } : {}} />
                    <span>{tab.label}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      isActive 
                        ? 'text-white' 
                        : 'bg-gray-100 text-gray-600'
                    }`} style={isActive ? { backgroundColor: companyPrimaryColor } : {}}>
                      {count}
                    </span>
                    {isActive && (
                      <div 
                        className="absolute bottom-0 left-0 right-0 h-0.5" 
                        style={{ backgroundColor: companyPrimaryColor }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Filters Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by Order ID, Employee, PR, or PO..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-0 rounded-xl text-sm placeholder-gray-400 focus:bg-white focus:ring-2 transition-all outline-none"
                style={{ '--tw-ring-color': `${companyPrimaryColor}40` } as React.CSSProperties}
              />
            </div>

            {/* Location Filter */}
            <div className="relative">
              <MapPin className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <select 
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border-0 rounded-xl text-sm text-gray-700 focus:bg-white focus:ring-2 transition-all outline-none appearance-none cursor-pointer"
                style={{ '--tw-ring-color': `${companyPrimaryColor}40` } as React.CSSProperties}
              >
                <option value="all">All Locations</option>
                {uniqueLocations.map((location) => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-3 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: companyPrimaryColor, borderWidth: '3px' }} />
                <p className="text-sm text-gray-500">Loading orders...</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-50 to-gray-50/50">
                    {isPrPoWorkflowEnabled && (
                      <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">PO Number</th>
                    )}
                    {isPrPoWorkflowEnabled && (
                      <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">PR Number</th>
                    )}
                    <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Order ID</th>
                    <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                    <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Items</th>
                    <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Payment</th>
                    <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</th>
                    <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">PR Status</th>
                    <th className="text-left py-4 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredGroupedOrders.length === 0 ? (
                    <tr>
                      <td colSpan={isPrPoWorkflowEnabled ? 11 : 9} className="py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                            <Package className="h-8 w-8 text-gray-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">No orders found</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {activeTab !== 'all' 
                                ? `No orders with "${PR_STATUS_TABS.find(t => t.id === activeTab)?.label}" status`
                                : 'Try adjusting your filters or search query'
                              }
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredGroupedOrders.map((groupedOrder) => {
                      const isExpanded = expandedGroups.has(groupedOrder.id)
                      const hasChildren = groupedOrder.isGroup && groupedOrder.childOrders.length > 1
                      
                      return (
                        <React.Fragment key={groupedOrder.id}>
                          {/* Parent/Main Row */}
                          <tr 
                            className={`hover:bg-gray-50/50 transition-colors group ${hasChildren ? 'cursor-pointer' : ''}`}
                            onClick={hasChildren ? () => toggleGroupExpand(groupedOrder.id) : undefined}
                          >
                            {/* PO Number - only shown when PR/PO workflow is enabled */}
                            {isPrPoWorkflowEnabled && (
                              <td className="py-4 px-5">
                                <div className="flex items-center gap-2">
                                  {/* Expand/Collapse indicator for split orders */}
                                  {hasChildren && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        toggleGroupExpand(groupedOrder.id)
                                      }}
                                      className="p-0.5 rounded hover:bg-gray-200 transition-colors"
                                      title={isExpanded ? 'Collapse split orders' : 'Expand split orders'}
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="h-4 w-4 text-gray-500" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 text-gray-500" />
                                      )}
                                    </button>
                                  )}
                                  <div className="flex flex-col gap-1">
                                    {groupedOrder.poNumbers && groupedOrder.poNumbers.length > 0 ? (
                                      <>
                                        {groupedOrder.poNumbers.slice(0, 2).map((po: string, idx: number) => (
                                          <span key={idx} className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                                            <FileText className="h-3 w-3" />
                                            {po}
                                          </span>
                                        ))}
                                        {groupedOrder.poNumbers.length > 2 && (
                                          <span className="text-xs text-gray-400">+{groupedOrder.poNumbers.length - 2} more</span>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-xs text-gray-400 italic">Not assigned</span>
                                    )}
                                  </div>
                                </div>
                              </td>
                            )}

                            {/* PR Number - only shown when PR/PO workflow is enabled */}
                            {isPrPoWorkflowEnabled && (
                              <td className="py-4 px-5">
                                {groupedOrder.prNumber || groupedOrder.pr_number ? (
                                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                    <FileText className="h-3 w-3" />
                                    {groupedOrder.prNumber || groupedOrder.pr_number}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400 italic">N/A</span>
                                )}
                              </td>
                            )}

                            {/* Order ID with split indicator */}
                            <td className="py-4 px-5">
                              <div className="flex items-center gap-2">
                                {/* Expand/Collapse indicator for split orders - shown here when PR/PO workflow is disabled */}
                                {!isPrPoWorkflowEnabled && hasChildren && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleGroupExpand(groupedOrder.id)
                                    }}
                                    className="p-0.5 rounded hover:bg-gray-200 transition-colors"
                                    title={isExpanded ? 'Collapse split orders' : 'Expand split orders'}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="h-4 w-4 text-gray-500" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-gray-500" />
                                    )}
                                  </button>
                                )}
                                <div className="max-w-[140px]">
                                  <p className="text-xs font-mono text-gray-700 truncate" title={groupedOrder.id}>
                                    {groupedOrder.id.length > 20 ? groupedOrder.id.substring(0, 20) + '...' : groupedOrder.id}
                                  </p>
                                  {hasChildren && (
                                    <span className="inline-flex items-center gap-1 mt-1 text-xs text-indigo-600 font-medium">
                                      <Layers className="h-3 w-3" />
                                      Split into {groupedOrder.childOrders.length}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Employee */}
                            <td className="py-4 px-5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center flex-shrink-0">
                                  <User className="h-4 w-4 text-gray-500" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm text-gray-900 font-medium truncate max-w-[120px]">
                                    {formatEmployeeName(groupedOrder.employeeName)}
                                  </p>
                                  {groupedOrder.employeeIdNum && (
                                    <p className="text-xs text-gray-400">{groupedOrder.employeeIdNum}</p>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Items */}
                            <td className="py-4 px-5">
                              <div className="max-w-[180px]">
                                {groupedOrder.combinedItems?.slice(0, 2).map((item: any, idx: number) => (
                                  <div key={idx} className="text-xs text-gray-600 truncate leading-relaxed">
                                    <span className="font-medium text-gray-800">{item.uniformName}</span>
                                    <span className="text-gray-400"> • {item.size} × {item.quantity}</span>
                                  </div>
                                ))}
                                {groupedOrder.combinedItemCount > 2 && (
                                  <span className="text-xs text-gray-400">+{groupedOrder.combinedItemCount - 2} more items</span>
                                )}
                              </div>
                            </td>

                            {/* Total */}
                            <td className="py-4 px-5">
                              <span className="text-sm font-semibold text-gray-900">
                                ₹{groupedOrder.combinedTotal?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
                              </span>
                            </td>

                            {/* Payment Type */}
                            <td className="py-4 px-5">
                              {groupedOrder.isPersonalPayment ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                  <CreditCard className="h-3 w-3" />
                                  Personal
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle className="h-3 w-3" />
                                  Company
                                </span>
                              )}
                            </td>

                            {/* Location */}
                            <td className="py-4 px-5">
                              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                                <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                <span className="truncate max-w-[100px]">{groupedOrder.dispatchLocation || 'N/A'}</span>
                              </div>
                            </td>

                            {/* Date */}
                            <td className="py-4 px-5">
                              <div className="text-xs text-gray-600">
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                  {formatDate(groupedOrder.orderDate)}
                                </div>
                              </div>
                            </td>

                            {/* PR Status */}
                            <td className="py-4 px-5">
                              <StatusBadge 
                                status={groupedOrder.overallStatus} 
                                prStatus={groupedOrder.overallPrStatus} 
                              />
                            </td>

                            {/* Actions */}
                            <td className="py-4 px-5" onClick={(e) => e.stopPropagation()}>
                              <OrderActionsCell
                                groupedOrder={groupedOrder}
                                companyId={companyId}
                                userRole={userRole}
                                userId={userId}
                                primaryColor={companyPrimaryColor}
                                onActionComplete={handleActionComplete}
                              />
                            </td>
                          </tr>

                          {/* Child Rows (expanded split orders) */}
                          {hasChildren && isExpanded && groupedOrder.childOrders.map((childOrder: any, childIdx: number) => (
                            <tr 
                              key={`${groupedOrder.id}-child-${childIdx}`} 
                              className="bg-gray-50/70 hover:bg-gray-100/70 transition-colors border-l-4 border-l-indigo-200"
                            >
                              {/* PO Number - indented - only shown when PR/PO workflow is enabled */}
                              {isPrPoWorkflowEnabled && (
                                <td className="py-3 px-5 pl-10">
                                  {childOrder.poNumbers && childOrder.poNumbers.length > 0 ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-600 bg-purple-50/80 px-2 py-0.5 rounded border border-purple-100">
                                      <FileText className="h-3 w-3" />
                                      {childOrder.poNumbers[0]}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-400 italic">—</span>
                                  )}
                                </td>
                              )}

                              {/* PR Number - only shown when PR/PO workflow is enabled */}
                              {isPrPoWorkflowEnabled && (
                                <td className="py-3 px-5">
                                  <span className="text-xs text-gray-400">—</span>
                                </td>
                              )}

                              {/* Child Order ID */}
                              <td className="py-3 px-5">
                                <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                                  <p className="text-xs font-mono text-gray-600 truncate max-w-[100px]" title={childOrder.id}>
                                    {childOrder.id.length > 15 ? '...' + childOrder.id.slice(-15) : childOrder.id}
                                  </p>
                                </div>
                              </td>

                              {/* Vendor */}
                              <td className="py-3 px-5">
                                <span className="text-xs text-gray-600 font-medium">
                                  {childOrder.vendorName || 'N/A'}
                                </span>
                              </td>

                              {/* Items */}
                              <td className="py-3 px-5">
                                <div className="max-w-[180px]">
                                  {childOrder.items?.slice(0, 2).map((item: any, idx: number) => (
                                    <div key={idx} className="text-xs text-gray-500 truncate leading-relaxed">
                                      <span className="font-medium text-gray-700">{item.uniformName}</span>
                                      <span className="text-gray-400"> • {item.size} × {item.quantity}</span>
                                    </div>
                                  ))}
                                  {childOrder.items?.length > 2 && (
                                    <span className="text-xs text-gray-400">+{childOrder.items.length - 2} more</span>
                                  )}
                                </div>
                              </td>

                              {/* Total */}
                              <td className="py-3 px-5">
                                <span className="text-sm font-medium text-gray-700">
                                  ₹{childOrder.total?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
                                </span>
                              </td>

                              {/* Payment - empty for child */}
                              <td className="py-3 px-5">
                                <span className="text-xs text-gray-400">—</span>
                              </td>

                              {/* Location - empty for child */}
                              <td className="py-3 px-5">
                                <span className="text-xs text-gray-400">—</span>
                              </td>

                              {/* Date - empty for child */}
                              <td className="py-3 px-5">
                                <span className="text-xs text-gray-400">—</span>
                              </td>

                              {/* Status */}
                              <td className="py-3 px-5">
                                <StatusBadge 
                                  status={childOrder.status} 
                                  prStatus={childOrder.unified_pr_status || childOrder.pr_status} 
                                />
                              </td>

                              {/* Child Actions */}
                              <td className="py-3 px-5">
                                <WorkflowActionButtons
                                  entityType="ORDER"
                                  entityId={childOrder.id}
                                  entityDisplayId={childOrder.prNumber || childOrder.id}
                                  companyId={companyId}
                                  userRole={userRole}
                                  userId={userId}
                                  primaryColor={companyPrimaryColor}
                                  size="sm"
                                  layout="compact"
                                  onActionComplete={(action, success) => handleActionComplete(childOrder.id, action, success)}
                                />
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Stats */}
        {!loading && filteredGroupedOrders.length > 0 && (
          <div className="mt-6 flex items-center justify-between text-sm text-gray-500">
            <p>
              Showing <span className="font-medium text-gray-900">{filteredGroupedOrders.length}</span> logical order{filteredGroupedOrders.length !== 1 ? 's' : ''}{' '}
              <span className="text-gray-400">
                ({companyOrders.length} total system order{companyOrders.length !== 1 ? 's' : ''})
              </span>
            </p>
            <p>
              Total Value: <span className="font-semibold text-gray-900">
                ₹{filteredGroupedOrders.reduce((sum, order) => sum + (order.combinedTotal || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </p>
          </div>
        )}

        {/* Order Detail Modal */}
        {selectedOrder && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedOrder(null)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Order Details</h3>
                <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Order Info */}
                <div className={`grid ${isPrPoWorkflowEnabled ? 'grid-cols-2' : 'grid-cols-2'} gap-4`}>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Order ID</p>
                    <p className="text-sm font-mono text-gray-900">{selectedOrder.id}</p>
                  </div>
                  {isPrPoWorkflowEnabled && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">PR Number</p>
                      <p className="text-sm font-medium text-gray-900">{selectedOrder.prNumber || selectedOrder.pr_number || 'N/A'}</p>
                    </div>
                  )}
                  {isPrPoWorkflowEnabled && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">PO Number(s)</p>
                      <p className="text-sm font-medium text-gray-900">
                        {selectedOrder.poNumbers?.length > 0 ? selectedOrder.poNumbers.join(', ') : 'Not assigned'}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Status</p>
                    <StatusBadge status={selectedOrder.status} prStatus={selectedOrder.unified_pr_status || selectedOrder.pr_status} />
                  </div>
                </div>

                {/* Employee Info */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Employee Information</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-gray-200">
                      <User className="h-5 w-5 text-gray-500" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{formatEmployeeName(selectedOrder.employeeName)}</p>
                      <p className="text-sm text-gray-500">ID: {selectedOrder.employeeIdNum || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {/* Items */}
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Order Items</p>
                  <div className="space-y-2">
                    {selectedOrder.items?.map((item: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">{item.uniformName}</p>
                          <p className="text-sm text-gray-500">Size: {item.size} • Qty: {item.quantity}</p>
                        </div>
                        <p className="font-semibold text-gray-900">₹{(item.price * item.quantity).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Total */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <span className="text-lg font-medium text-gray-700">Total Amount</span>
                  <span className="text-xl font-bold text-gray-900">
                    ₹{selectedOrder.total?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Additional Info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Dispatch Location</p>
                    <p className="font-medium text-gray-900">{selectedOrder.dispatchLocation || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Order Date</p>
                    <p className="font-medium text-gray-900">{formatDate(selectedOrder.orderDate)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Payment Type</p>
                    <p className="font-medium text-gray-900">{selectedOrder.isPersonalPayment ? 'Personal Payment' : 'Company Paid'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Vendor</p>
                    <p className="font-medium text-gray-900">{selectedOrder.vendorName || 'N/A'}</p>
                  </div>
                </div>

                {/* Approval Info */}
                {(selectedOrder.site_admin_approved_at || selectedOrder.company_admin_approved_at) && (
                  <div className="bg-emerald-50 rounded-xl p-4">
                    <p className="text-xs text-emerald-600 uppercase tracking-wide mb-2">Approval History</p>
                    {selectedOrder.site_admin_approved_at && (
                      <p className="text-sm text-emerald-700">
                        Site Admin Approved: {formatDate(selectedOrder.site_admin_approved_at)}
                      </p>
                    )}
                    {selectedOrder.company_admin_approved_at && (
                      <p className="text-sm text-emerald-700">
                        Company Admin Approved: {formatDate(selectedOrder.company_admin_approved_at)}
                      </p>
                    )}
                  </div>
                )}

                {/* Rejection Info */}
                {selectedOrder.rejection_reason && (
                  <div className="bg-red-50 rounded-xl p-4">
                    <p className="text-xs text-red-600 uppercase tracking-wide mb-2">Rejection Reason</p>
                    <p className="text-sm text-red-700">{selectedOrder.rejection_reason}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
