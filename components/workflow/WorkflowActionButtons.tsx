/**
 * Workflow Action Buttons Component
 * 
 * Displays Approve/Reject buttons based on workflow permissions.
 * Integrates with the UI Rules API to determine what actions are allowed.
 * 
 * @module components/workflow/WorkflowActionButtons
 */

'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Loader2, AlertCircle, Info } from 'lucide-react'
import { useWorkflowActions } from '@/lib/hooks/useWorkflowActions'
import { RejectionModal } from './RejectionModal'

// =============================================================================
// TYPES
// =============================================================================

export interface WorkflowActionButtonsProps {
  entityType: 'ORDER' | 'GRN' | 'INVOICE'
  entityId: string
  entityDisplayId?: string // e.g., PR number for display
  companyId: string
  userRole: string
  userId?: string
  primaryColor?: string
  onActionComplete?: (action: 'approve' | 'reject', success: boolean) => void
  size?: 'sm' | 'md' | 'lg'
  showTooltips?: boolean
  layout?: 'horizontal' | 'vertical' | 'compact'
}

// =============================================================================
// COMPONENT
// =============================================================================

export function WorkflowActionButtons({
  entityType,
  entityId,
  entityDisplayId,
  companyId,
  userRole,
  userId,
  primaryColor = '#f76b1c',
  onActionComplete,
  size = 'sm',
  showTooltips = true,
  layout = 'horizontal',
}: WorkflowActionButtonsProps) {
  // State
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showConfirmApprove, setShowConfirmApprove] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Use workflow actions hook
  const {
    loading,
    error,
    canApprove,
    canReject,
    approveDisabledReason,
    rejectDisabledReason,
    rejectionReasonCodes,
    approve,
    reject,
    approving,
    rejecting,
    statusMessage,
    uiRules,
  } = useWorkflowActions({
    entityType,
    entityId,
    companyId,
    userRole,
    userId,
    onApproveSuccess: (result) => {
      setActionMessage({ type: 'success', text: result.message })
      onActionComplete?.('approve', true)
      setTimeout(() => setActionMessage(null), 3000)
    },
    onRejectSuccess: (result) => {
      setActionMessage({ type: 'success', text: result.message })
      onActionComplete?.('reject', true)
      setTimeout(() => setActionMessage(null), 3000)
    },
    onError: (errorMsg) => {
      setActionMessage({ type: 'error', text: errorMsg })
      setTimeout(() => setActionMessage(null), 5000)
    },
  })

  // Handle approve click
  const handleApproveClick = () => {
    const requiresConfirmation = uiRules?.allowedActions.canApprove.requiresConfirmation
    if (requiresConfirmation) {
      setShowConfirmApprove(true)
    } else {
      handleApproveConfirm()
    }
  }

  // Handle approve confirm
  const handleApproveConfirm = async () => {
    setShowConfirmApprove(false)
    await approve()
  }

  // Handle reject click
  const handleRejectClick = () => {
    setShowRejectModal(true)
  }

  // Handle reject confirm
  const handleRejectConfirm = async (reasonCode: string, remarks?: string) => {
    await reject(reasonCode, remarks)
    setShowRejectModal(false)
  }

  // Size classes
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-5 py-2.5 text-base gap-2',
  }

  const iconSizes = {
    sm: 'h-3.5 w-3.5',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  }

  // Layout classes
  const layoutClasses = {
    horizontal: 'flex-row',
    vertical: 'flex-col',
    compact: 'flex-row',
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400">
        <Loader2 className={`${iconSizes[size]} animate-spin`} />
        <span className="text-xs">Loading...</span>
      </div>
    )
  }

  // No actions available
  if (!canApprove && !canReject) {
    // Check if workflow is complete or rejected
    if (uiRules?.workflowState === 'COMPLETED' || uiRules?.workflowState === 'REJECTED') {
      return null // Don't show anything for completed/rejected items
    }
    
    // Show info about why no actions
    if (showTooltips && (approveDisabledReason || rejectDisabledReason)) {
      return (
        <div className="flex items-center gap-1.5 text-gray-400" title={approveDisabledReason || rejectDisabledReason || ''}>
          <Info className={iconSizes[size]} />
          <span className="text-xs truncate max-w-[150px]">
            {statusMessage || 'No actions available'}
          </span>
        </div>
      )
    }
    
    return null
  }

  return (
    <>
      <div className={`flex ${layoutClasses[layout]} items-center gap-2`}>
        {/* Approve Button */}
        {canApprove && (
          <button
            onClick={handleApproveClick}
            disabled={approving || rejecting}
            className={`inline-flex items-center ${sizeClasses[size]} font-medium text-white 
                       rounded-lg transition-all hover:shadow-md active:scale-95
                       disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none`}
            style={{ backgroundColor: primaryColor }}
            title={showTooltips ? 'Approve this item' : undefined}
          >
            {approving ? (
              <Loader2 className={`${iconSizes[size]} animate-spin`} />
            ) : (
              <CheckCircle className={iconSizes[size]} />
            )}
            {layout !== 'compact' && (
              <span>{approving ? 'Approving...' : 'Approve'}</span>
            )}
          </button>
        )}

        {/* Reject Button */}
        {canReject && (
          <button
            onClick={handleRejectClick}
            disabled={approving || rejecting}
            className={`inline-flex items-center ${sizeClasses[size]} font-medium text-white 
                       bg-red-500 rounded-lg transition-all hover:bg-red-600 hover:shadow-md active:scale-95
                       disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:bg-red-500`}
            title={showTooltips ? 'Reject this item' : undefined}
          >
            {rejecting ? (
              <Loader2 className={`${iconSizes[size]} animate-spin`} />
            ) : (
              <XCircle className={iconSizes[size]} />
            )}
            {layout !== 'compact' && (
              <span>{rejecting ? 'Rejecting...' : 'Reject'}</span>
            )}
          </button>
        )}

        {/* Action message */}
        {actionMessage && (
          <div 
            className={`flex items-center gap-1 text-xs ${
              actionMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {actionMessage.type === 'success' ? (
              <CheckCircle className="h-3 w-3" />
            ) : (
              <AlertCircle className="h-3 w-3" />
            )}
            <span>{actionMessage.text}</span>
          </div>
        )}
      </div>

      {/* Approve Confirmation Dialog */}
      {showConfirmApprove && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowConfirmApprove(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${primaryColor}20` }}
                >
                  <CheckCircle className="h-6 w-6" style={{ color: primaryColor }} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Confirm Approval</h3>
                  <p className="text-sm text-gray-500">
                    {entityDisplayId || entityId}
                  </p>
                </div>
              </div>
              
              <p className="text-sm text-gray-600 mb-6">
                {uiRules?.allowedActions.canApprove.confirmationMessage || 
                 'Are you sure you want to approve this item? This action will move it to the next stage.'}
              </p>
              
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowConfirmApprove(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 
                           rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApproveConfirm}
                  disabled={approving}
                  className="px-4 py-2 text-sm font-medium text-white 
                           rounded-lg transition-colors flex items-center gap-2
                           disabled:opacity-50"
                  style={{ backgroundColor: primaryColor }}
                >
                  {approving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Approving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Confirm Approval
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      <RejectionModal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        onConfirm={handleRejectConfirm}
        entityType={entityType}
        entityId={entityId}
        entityDisplayId={entityDisplayId}
        reasonCodes={rejectionReasonCodes}
        isLoading={rejecting}
        primaryColor={primaryColor}
      />
    </>
  )
}

export default WorkflowActionButtons
