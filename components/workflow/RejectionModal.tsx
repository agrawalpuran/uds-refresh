/**
 * Rejection Modal Component
 * 
 * Modal dialog for rejecting workflow entities with reason selection.
 * Displays entity-specific rejection reasons from the workflow configuration.
 * 
 * @module components/workflow/RejectionModal
 */

'use client'

import { useState, useEffect } from 'react'
import { X, AlertTriangle, MessageSquare, ChevronDown, Loader2 } from 'lucide-react'
import type { ReasonCodeOption } from '@/lib/hooks/useWorkflowActions'

// =============================================================================
// TYPES
// =============================================================================

export interface RejectionModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (reasonCode: string, remarks?: string) => Promise<void>
  entityType: string
  entityId?: string
  entityDisplayId?: string // e.g., PR number
  // Support both naming conventions
  reasonCodes?: ReasonCodeOption[]
  allowedReasonCodes?: ReasonCodeOption[]
  isLoading?: boolean
  isReasonMandatory?: boolean
  primaryColor?: string
}

// =============================================================================
// COMPONENT
// =============================================================================

export function RejectionModal({
  isOpen,
  onClose,
  onConfirm,
  entityType,
  entityId,
  entityDisplayId,
  reasonCodes,
  allowedReasonCodes,
  isLoading = false,
  isReasonMandatory = false,
  primaryColor = '#f76b1c',
}: RejectionModalProps) {
  // State
  const [selectedReason, setSelectedReason] = useState<string>('')
  const [remarks, setRemarks] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Use reasonCodes or allowedReasonCodes (support both naming conventions)
  const reasons = reasonCodes || allowedReasonCodes || []

  // Get selected reason details
  const selectedReasonOption = reasons.find(r => r.code === selectedReason)
  const requiresRemarks = selectedReasonOption?.requiresRemarks ?? false

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedReason('')
      setRemarks('')
      setError(null)
    }
  }, [isOpen])

  // Handle confirm
  const handleConfirm = async () => {
    // Validate
    if (!selectedReason) {
      setError('Please select a rejection reason')
      return
    }

    if (requiresRemarks && !remarks.trim()) {
      setError('Please provide remarks for this rejection reason')
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      await onConfirm(selectedReason, remarks.trim() || undefined)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Rejection failed')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !submitting) {
      onClose()
    }
  }

  // Don't render if not open
  if (!isOpen) return null

  // Format entity type for display
  const entityTypeDisplay = entityType.charAt(0) + entityType.slice(1).toLowerCase()

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Reject {entityTypeDisplay}</h3>
              <p className="text-sm text-red-100">
                {entityDisplayId || entityId || 'N/A'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            disabled={submitting}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Warning message */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm text-amber-800">
              <strong>Warning:</strong> This action will reject the {entityTypeDisplay.toLowerCase()} and notify the requestor. 
              Please select a reason and provide any additional remarks.
            </p>
          </div>

          {/* Reason selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rejection Reason <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                value={selectedReason}
                onChange={(e) => {
                  setSelectedReason(e.target.value)
                  setError(null)
                }}
                disabled={submitting || isLoading}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 
                         focus:bg-white focus:border-red-300 focus:ring-2 focus:ring-red-100 
                         transition-all outline-none appearance-none cursor-pointer
                         disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Select a reason...</option>
                {reasons.map((reason) => (
                  <option key={reason.code} value={reason.code}>
                    {reason.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
            {selectedReasonOption?.description && (
              <p className="mt-2 text-xs text-gray-500">
                {selectedReasonOption.description}
              </p>
            )}
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <span className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-gray-400" />
                Remarks {requiresRemarks && <span className="text-red-500">*</span>}
              </span>
            </label>
            <textarea
              value={remarks}
              onChange={(e) => {
                setRemarks(e.target.value)
                setError(null)
              }}
              placeholder="Provide additional details about the rejection..."
              disabled={submitting || isLoading}
              rows={4}
              maxLength={2000}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 
                       placeholder-gray-400 resize-none
                       focus:bg-white focus:border-red-300 focus:ring-2 focus:ring-red-100 
                       transition-all outline-none
                       disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div className="flex justify-between mt-1">
              <p className="text-xs text-gray-400">
                {requiresRemarks ? 'Remarks are required for this reason' : 'Optional'}
              </p>
              <p className="text-xs text-gray-400">
                {remarks.length}/2000
              </p>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 
                     rounded-xl hover:bg-gray-50 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting || isLoading || !selectedReason}
            className="px-5 py-2.5 text-sm font-medium text-white bg-red-500 
                     rounded-xl hover:bg-red-600 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed
                     flex items-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Rejecting...
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4" />
                Confirm Rejection
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default RejectionModal
