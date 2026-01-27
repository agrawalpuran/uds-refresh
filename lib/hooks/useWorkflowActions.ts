/**
 * Workflow Actions Hook
 * 
 * Custom hook for managing workflow actions (approve/reject) in the UI.
 * Fetches UI rules and provides action handlers.
 * 
 * @module lib/hooks/useWorkflowActions
 */

'use client'

import { useState, useEffect, useCallback } from 'react'

// =============================================================================
// TYPES
// =============================================================================

export interface ActionPermission {
  allowed: boolean
  reason?: string
  requiresConfirmation?: boolean
  confirmationMessage?: string
}

export interface AllowedActions {
  canApprove: ActionPermission
  canReject: ActionPermission
  canResubmit: ActionPermission
  canCancel: ActionPermission
  canView: ActionPermission
  canEdit: ActionPermission
}

export interface ReasonCodeOption {
  code: string
  label: string
  description?: string
  requiresRemarks?: boolean
  category?: string
}

export interface RejectionConfig {
  isAllowed: boolean
  isReasonMandatory: boolean
  isRemarksMandatory: boolean
  maxRemarksLength: number
  allowedReasonCodes: ReasonCodeOption[]
}

export interface WorkflowProgress {
  totalStages: number
  currentStageOrder: number
  completedStages: number
  percentComplete: number
  stages: Array<{
    stageKey: string
    stageName: string
    order: number
    status: 'COMPLETED' | 'CURRENT' | 'PENDING' | 'SKIPPED'
    allowedRoles: string[]
    isTerminal: boolean
  }>
}

export interface UIRulesData {
  entityId: string
  entityType: string
  entityStatus: string
  workflowState: 'IN_WORKFLOW' | 'COMPLETED' | 'REJECTED' | 'NOT_IN_WORKFLOW' | 'NO_WORKFLOW_CONFIG'
  currentStage: string | null
  currentStageName: string | null
  allowedActions: AllowedActions
  rejectionConfig: RejectionConfig
  workflowProgress: WorkflowProgress | null
  informationalMessage: string | null
  statusMessage: string | null
  nextActionHint: string | null
  userRoleInfo: {
    currentRole: string
    isAllowedAtCurrentStage: boolean
    allowedRolesAtCurrentStage: string[]
  }
}

export interface ApproveResult {
  success: boolean
  message: string
  data?: {
    entityId: string
    newStatus: string
    newStage: string
    isTerminal: boolean
  }
  error?: string
}

export interface RejectResult {
  success: boolean
  message: string
  data?: {
    entityId: string
    newStatus: string
    rejectionId: string
  }
  error?: string
}

export interface UseWorkflowActionsOptions {
  entityType: 'ORDER' | 'GRN' | 'INVOICE'
  entityId: string
  companyId: string
  userRole: string
  userId?: string
  onApproveSuccess?: (result: ApproveResult) => void
  onRejectSuccess?: (result: RejectResult) => void
  onError?: (error: string) => void
}

export interface UseWorkflowActionsReturn {
  // State
  loading: boolean
  error: string | null
  uiRules: UIRulesData | null
  
  // Computed
  canApprove: boolean
  canReject: boolean
  approveDisabledReason: string | null
  rejectDisabledReason: string | null
  rejectionReasonCodes: ReasonCodeOption[]
  workflowProgress: WorkflowProgress | null
  statusMessage: string | null
  
  // Actions
  refreshRules: () => Promise<void>
  approve: (remarks?: string) => Promise<ApproveResult>
  reject: (reasonCode: string, remarks?: string) => Promise<RejectResult>
  
  // Action state
  approving: boolean
  rejecting: boolean
}

// =============================================================================
// DEFAULT REJECTION REASONS (Fallback if API doesn't return them)
// =============================================================================

const DEFAULT_REJECTION_REASONS: ReasonCodeOption[] = [
  { code: 'ELIGIBILITY_EXHAUSTED', label: 'Eligibility Exhausted', description: 'Employee has no remaining eligibility' },
  { code: 'EMPLOYEE_NOT_ELIGIBLE', label: 'Employee Not Eligible', description: 'Employee is not eligible for this order' },
  { code: 'INVALID_QUANTITY', label: 'Invalid Quantity', description: 'Quantity exceeds allowed limit' },
  { code: 'BUDGET_EXCEEDED', label: 'Budget Exceeded', description: 'Order exceeds budget limit' },
  { code: 'INCORRECT_DATA', label: 'Incorrect Data', description: 'Data provided is incorrect', requiresRemarks: true },
  { code: 'POLICY_VIOLATION', label: 'Policy Violation', description: 'Violates company policy', requiresRemarks: true },
  { code: 'OTHER', label: 'Other', description: 'Other reason', requiresRemarks: true },
]

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

export function useWorkflowActions(options: UseWorkflowActionsOptions): UseWorkflowActionsReturn {
  const { 
    entityType, 
    entityId, 
    companyId, 
    userRole, 
    userId,
    onApproveSuccess, 
    onRejectSuccess, 
    onError 
  } = options

  // State
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uiRules, setUIRules] = useState<UIRulesData | null>(null)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  // Fetch UI rules
  const fetchUIRules = useCallback(async () => {
    if (!entityId || !entityType || !companyId) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const response = await fetch(
        `/api/workflow/ui-rules?entityType=${entityType}&entityId=${entityId}`,
        {
          headers: {
            'x-company-id': companyId,
            'x-user-role': userRole,
            'x-user-id': userId || '',
          },
        }
      )

      const data = await response.json()

      if (data.success) {
        setUIRules(data.data)
      } else {
        // If API fails, create a default response that disables actions
        setUIRules({
          entityId,
          entityType,
          entityStatus: 'UNKNOWN',
          workflowState: 'NOT_IN_WORKFLOW',
          currentStage: null,
          currentStageName: null,
          allowedActions: {
            canApprove: { allowed: false, reason: data.error?.message || 'Unable to load workflow rules' },
            canReject: { allowed: false, reason: data.error?.message || 'Unable to load workflow rules' },
            canResubmit: { allowed: false },
            canCancel: { allowed: false },
            canView: { allowed: true },
            canEdit: { allowed: false },
          },
          rejectionConfig: {
            isAllowed: false,
            isReasonMandatory: true,
            isRemarksMandatory: false,
            maxRemarksLength: 2000,
            allowedReasonCodes: DEFAULT_REJECTION_REASONS,
          },
          workflowProgress: null,
          informationalMessage: null,
          statusMessage: data.error?.message || null,
          nextActionHint: null,
          userRoleInfo: {
            currentRole: userRole,
            isAllowedAtCurrentStage: false,
            allowedRolesAtCurrentStage: [],
          },
        })
      }
    } catch (err: any) {
      console.error('[useWorkflowActions] Error fetching UI rules:', err)
      setError(err.message || 'Failed to load workflow rules')
      
      // Set default state on error
      setUIRules({
        entityId,
        entityType,
        entityStatus: 'UNKNOWN',
        workflowState: 'NOT_IN_WORKFLOW',
        currentStage: null,
        currentStageName: null,
        allowedActions: {
          canApprove: { allowed: false, reason: 'Unable to connect to server' },
          canReject: { allowed: false, reason: 'Unable to connect to server' },
          canResubmit: { allowed: false },
          canCancel: { allowed: false },
          canView: { allowed: true },
          canEdit: { allowed: false },
        },
        rejectionConfig: {
          isAllowed: false,
          isReasonMandatory: true,
          isRemarksMandatory: false,
          maxRemarksLength: 2000,
          allowedReasonCodes: DEFAULT_REJECTION_REASONS,
        },
        workflowProgress: null,
        informationalMessage: null,
        statusMessage: 'Unable to connect to server',
        nextActionHint: null,
        userRoleInfo: {
          currentRole: userRole,
          isAllowedAtCurrentStage: false,
          allowedRolesAtCurrentStage: [],
        },
      })
    } finally {
      setLoading(false)
    }
  }, [entityId, entityType, companyId, userRole, userId])

  // Initial fetch
  useEffect(() => {
    fetchUIRules()
  }, [fetchUIRules])

  // Approve action
  const approve = useCallback(async (remarks?: string): Promise<ApproveResult> => {
    try {
      setApproving(true)
      setError(null)

      const response = await fetch('/api/workflow/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-company-id': companyId,
          'x-user-role': userRole,
          'x-user-id': userId || '',
        },
        body: JSON.stringify({
          entityType,
          entityId,
          remarks,
        }),
      })

      const data = await response.json()

      if (data.success) {
        const result: ApproveResult = {
          success: true,
          message: data.message || 'Approved successfully',
          data: data.data,
        }
        onApproveSuccess?.(result)
        // Refresh rules after approval
        await fetchUIRules()
        return result
      } else {
        const errorMsg = data.error?.message || 'Approval failed'
        setError(errorMsg)
        onError?.(errorMsg)
        return {
          success: false,
          message: errorMsg,
          error: data.error?.code,
        }
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Approval failed'
      setError(errorMsg)
      onError?.(errorMsg)
      return {
        success: false,
        message: errorMsg,
        error: 'NETWORK_ERROR',
      }
    } finally {
      setApproving(false)
    }
  }, [entityType, entityId, companyId, userRole, userId, onApproveSuccess, onError, fetchUIRules])

  // Reject action
  const reject = useCallback(async (reasonCode: string, remarks?: string): Promise<RejectResult> => {
    try {
      setRejecting(true)
      setError(null)

      const response = await fetch('/api/workflow/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-company-id': companyId,
          'x-user-role': userRole,
          'x-user-id': userId || '',
        },
        body: JSON.stringify({
          entityType,
          entityId,
          reasonCode,
          remarks,
        }),
      })

      const data = await response.json()

      if (data.success) {
        const result: RejectResult = {
          success: true,
          message: data.message || 'Rejected successfully',
          data: data.data,
        }
        onRejectSuccess?.(result)
        // Refresh rules after rejection
        await fetchUIRules()
        return result
      } else {
        const errorMsg = data.error?.message || 'Rejection failed'
        setError(errorMsg)
        onError?.(errorMsg)
        return {
          success: false,
          message: errorMsg,
          error: data.error?.code,
        }
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Rejection failed'
      setError(errorMsg)
      onError?.(errorMsg)
      return {
        success: false,
        message: errorMsg,
        error: 'NETWORK_ERROR',
      }
    } finally {
      setRejecting(false)
    }
  }, [entityType, entityId, companyId, userRole, userId, onRejectSuccess, onError, fetchUIRules])

  // Computed values
  const canApprove = uiRules?.allowedActions.canApprove.allowed ?? false
  const canReject = uiRules?.allowedActions.canReject.allowed ?? false
  const approveDisabledReason = canApprove ? null : (uiRules?.allowedActions.canApprove.reason ?? null)
  const rejectDisabledReason = canReject ? null : (uiRules?.allowedActions.canReject.reason ?? null)
  const rejectionReasonCodes = uiRules?.rejectionConfig.allowedReasonCodes ?? DEFAULT_REJECTION_REASONS
  const workflowProgress = uiRules?.workflowProgress ?? null
  const statusMessage = uiRules?.statusMessage ?? null

  return {
    // State
    loading,
    error,
    uiRules,
    
    // Computed
    canApprove,
    canReject,
    approveDisabledReason,
    rejectDisabledReason,
    rejectionReasonCodes,
    workflowProgress,
    statusMessage,
    
    // Actions
    refreshRules: fetchUIRules,
    approve,
    reject,
    
    // Action state
    approving,
    rejecting,
  }
}
