/**
 * Workflow API Types & Error Handling
 * 
 * Defines standardized request/response types and error handling
 * for the workflow API layer.
 * 
 * @module lib/workflow/api-types
 */

import { WorkflowEntityType, WORKFLOW_ENTITY_TYPES } from '../models/WorkflowConfiguration'
import { WORKFLOW_ERROR_CODES, WorkflowErrorCode } from './workflow-execution-engine'

// =============================================================================
// API ERROR CODES (HTTP-Level)
// =============================================================================

/**
 * HTTP-level API error codes
 * Maps to specific HTTP status codes and messages
 */
export const API_ERROR_CODES = {
  // Authentication/Authorization errors (401, 403)
  UNAUTHORIZED: 'API_E001',
  FORBIDDEN: 'API_E002',
  INVALID_TOKEN: 'API_E003',
  
  // Validation errors (400)
  VALIDATION_ERROR: 'API_E010',
  MISSING_REQUIRED_FIELD: 'API_E011',
  INVALID_ENTITY_TYPE: 'API_E012',
  INVALID_ENTITY_ID: 'API_E013',
  INVALID_REASON_CODE: 'API_E014',
  
  // Resource errors (404)
  ENTITY_NOT_FOUND: 'API_E020',
  WORKFLOW_NOT_FOUND: 'API_E021',
  
  // Business logic errors (422)
  ACTION_NOT_ALLOWED: 'API_E030',
  INVALID_STAGE: 'API_E031',
  ROLE_NOT_PERMITTED: 'API_E032',
  ALREADY_PROCESSED: 'API_E033',
  
  // Server errors (500)
  INTERNAL_ERROR: 'API_E500',
  DATABASE_ERROR: 'API_E501',
} as const

export type ApiErrorCode = typeof API_ERROR_CODES[keyof typeof API_ERROR_CODES]

// =============================================================================
// ERROR CODE TO HTTP STATUS MAPPING
// =============================================================================

/**
 * Map API error codes to HTTP status codes
 */
export function getHttpStatus(errorCode: ApiErrorCode | WorkflowErrorCode): number {
  // API error codes
  const apiStatusMap: Record<string, number> = {
    [API_ERROR_CODES.UNAUTHORIZED]: 401,
    [API_ERROR_CODES.FORBIDDEN]: 403,
    [API_ERROR_CODES.INVALID_TOKEN]: 401,
    [API_ERROR_CODES.VALIDATION_ERROR]: 400,
    [API_ERROR_CODES.MISSING_REQUIRED_FIELD]: 400,
    [API_ERROR_CODES.INVALID_ENTITY_TYPE]: 400,
    [API_ERROR_CODES.INVALID_ENTITY_ID]: 400,
    [API_ERROR_CODES.INVALID_REASON_CODE]: 400,
    [API_ERROR_CODES.ENTITY_NOT_FOUND]: 404,
    [API_ERROR_CODES.WORKFLOW_NOT_FOUND]: 404,
    [API_ERROR_CODES.ACTION_NOT_ALLOWED]: 422,
    [API_ERROR_CODES.INVALID_STAGE]: 422,
    [API_ERROR_CODES.ROLE_NOT_PERMITTED]: 403,
    [API_ERROR_CODES.ALREADY_PROCESSED]: 422,
    [API_ERROR_CODES.INTERNAL_ERROR]: 500,
    [API_ERROR_CODES.DATABASE_ERROR]: 500,
  }
  
  // Workflow engine error codes
  const workflowStatusMap: Record<string, number> = {
    [WORKFLOW_ERROR_CODES.ENTITY_NOT_FOUND]: 404,
    [WORKFLOW_ERROR_CODES.ENTITY_UPDATE_FAILED]: 500,
    [WORKFLOW_ERROR_CODES.WORKFLOW_NOT_FOUND]: 404,
    [WORKFLOW_ERROR_CODES.WORKFLOW_INACTIVE]: 422,
    [WORKFLOW_ERROR_CODES.WORKFLOW_INVALID]: 500,
    [WORKFLOW_ERROR_CODES.STAGE_NOT_FOUND]: 422,
    [WORKFLOW_ERROR_CODES.STAGE_MISMATCH]: 422,
    [WORKFLOW_ERROR_CODES.NO_CURRENT_STAGE]: 422,
    [WORKFLOW_ERROR_CODES.ROLE_NOT_ALLOWED]: 403,
    [WORKFLOW_ERROR_CODES.APPROVE_NOT_ALLOWED]: 403,
    [WORKFLOW_ERROR_CODES.REJECT_NOT_ALLOWED]: 403,
    [WORKFLOW_ERROR_CODES.ALREADY_APPROVED]: 422,
    [WORKFLOW_ERROR_CODES.ALREADY_REJECTED]: 422,
    [WORKFLOW_ERROR_CODES.INVALID_STATE]: 422,
    [WORKFLOW_ERROR_CODES.AUDIT_FAILED]: 500,
    [WORKFLOW_ERROR_CODES.UNKNOWN_ERROR]: 500,
  }
  
  return apiStatusMap[errorCode] || workflowStatusMap[errorCode] || 500
}

// =============================================================================
// REQUEST TYPES
// =============================================================================

/**
 * Approve entity request payload
 */
export interface ApproveRequest {
  entityType: string   // ORDER | GRN | INVOICE
  entityId: string     // Entity's unique ID
  remarks?: string     // Optional approval remarks
}

/**
 * Reject entity request payload
 */
export interface RejectRequest {
  entityType: string   // ORDER | GRN | INVOICE
  entityId: string     // Entity's unique ID
  reasonCode: string   // REQUIRED: Rejection reason code
  reasonLabel?: string // Optional: Human-readable reason
  remarks?: string     // Optional: Detailed remarks
  action?: string      // Optional: REJECT | SEND_BACK | CANCEL | HOLD
}

/**
 * Get actions request (query params)
 */
export interface GetActionsRequest {
  entityType: string
  entityId: string
}

/**
 * User context from authentication
 * This comes from auth middleware, NOT from request body
 */
export interface UserContext {
  companyId: string
  userId: string
  userRole: string
  userName?: string
}

// =============================================================================
// RESPONSE TYPES
// =============================================================================

/**
 * Standard API success response
 */
export interface ApiSuccessResponse<T = any> {
  success: true
  data: T
  timestamp: string
}

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: Record<string, any>
  }
  timestamp: string
}

/**
 * Combined API response type
 */
export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse

/**
 * Approve response data
 */
export interface ApproveResponseData {
  entityId: string
  entityType: string
  action: 'APPROVED'
  previousStage: string
  newStage: string | null
  previousStatus: string
  newStatus: string
  isFullyApproved: boolean
  auditId: string
  approvedAt: string
}

/**
 * Reject response data
 */
export interface RejectResponseData {
  entityId: string
  entityType: string
  action: 'REJECTED'
  stage: string
  previousStatus: string
  newStatus: string
  reasonCode: string
  rejectionId: string
  rejectedAt: string
}

/**
 * Get actions response data
 */
export interface GetActionsResponseData {
  entityId: string
  entityType: string
  currentStage: string | null
  currentStageName: string | null
  currentStatus: string
  actions: {
    canApprove: boolean
    canReject: boolean
    approveDisabledReason?: string
    rejectDisabledReason?: string
  }
  workflowInfo: {
    workflowName: string
    totalStages: number
    currentStageOrder: number
    isTerminal: boolean
    nextStageName: string | null
    allowedRoles: string[]
  }
}

// =============================================================================
// RESPONSE BUILDERS
// =============================================================================

/**
 * Build success response
 */
export function successResponse<T>(data: T): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Build error response
 */
export function errorResponse(
  code: ApiErrorCode | WorkflowErrorCode | string,
  message: string,
  details?: Record<string, any>
): ApiErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
    timestamp: new Date().toISOString(),
  }
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Supported entity types for workflow
 */
export const SUPPORTED_ENTITY_TYPES = [
  WORKFLOW_ENTITY_TYPES.ORDER,
  WORKFLOW_ENTITY_TYPES.GRN,
  WORKFLOW_ENTITY_TYPES.INVOICE,
  WORKFLOW_ENTITY_TYPES.PURCHASE_ORDER,
  WORKFLOW_ENTITY_TYPES.RETURN_REQUEST,
] as const

/**
 * Validate entity type
 */
export function isValidEntityType(entityType: string): entityType is WorkflowEntityType {
  return SUPPORTED_ENTITY_TYPES.includes(entityType as WorkflowEntityType)
}

/**
 * Validate entity ID format
 */
export function isValidEntityId(entityId: string): boolean {
  if (!entityId || typeof entityId !== 'string') return false
  // Allow alphanumeric IDs with hyphens and underscores (1-50 chars)
  return /^[A-Za-z0-9_-]{1,50}$/.test(entityId)
}

/**
 * Validate approve request
 */
export function validateApproveRequest(body: any): {
  valid: boolean
  errors: string[]
  data?: ApproveRequest
} {
  const errors: string[] = []
  
  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body is required'] }
  }
  
  const { entityType, entityId, remarks } = body
  
  // Required fields
  if (!entityType) {
    errors.push('entityType is required')
  } else if (!isValidEntityType(entityType)) {
    errors.push(`Invalid entityType: ${entityType}. Supported: ${SUPPORTED_ENTITY_TYPES.join(', ')}`)
  }
  
  if (!entityId) {
    errors.push('entityId is required')
  } else if (!isValidEntityId(entityId)) {
    errors.push('Invalid entityId format')
  }
  
  // Optional field validation
  if (remarks !== undefined && typeof remarks !== 'string') {
    errors.push('remarks must be a string')
  }
  
  if (errors.length > 0) {
    return { valid: false, errors }
  }
  
  return {
    valid: true,
    errors: [],
    data: {
      entityType,
      entityId,
      remarks,
    },
  }
}

/**
 * Validate reject request
 */
export function validateRejectRequest(body: any): {
  valid: boolean
  errors: string[]
  data?: RejectRequest
} {
  const errors: string[] = []
  
  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body is required'] }
  }
  
  const { entityType, entityId, reasonCode, reasonLabel, remarks, action } = body
  
  // Required fields
  if (!entityType) {
    errors.push('entityType is required')
  } else if (!isValidEntityType(entityType)) {
    errors.push(`Invalid entityType: ${entityType}. Supported: ${SUPPORTED_ENTITY_TYPES.join(', ')}`)
  }
  
  if (!entityId) {
    errors.push('entityId is required')
  } else if (!isValidEntityId(entityId)) {
    errors.push('Invalid entityId format')
  }
  
  if (!reasonCode) {
    errors.push('reasonCode is required for rejection')
  } else if (typeof reasonCode !== 'string' || reasonCode.length > 50) {
    errors.push('Invalid reasonCode format')
  }
  
  // Optional field validation
  if (reasonLabel !== undefined && typeof reasonLabel !== 'string') {
    errors.push('reasonLabel must be a string')
  }
  
  if (remarks !== undefined && typeof remarks !== 'string') {
    errors.push('remarks must be a string')
  }
  
  if (action !== undefined) {
    const validActions = ['REJECT', 'SEND_BACK', 'CANCEL', 'HOLD']
    if (!validActions.includes(action)) {
      errors.push(`Invalid action: ${action}. Supported: ${validActions.join(', ')}`)
    }
  }
  
  if (errors.length > 0) {
    return { valid: false, errors }
  }
  
  return {
    valid: true,
    errors: [],
    data: {
      entityType,
      entityId,
      reasonCode,
      reasonLabel,
      remarks,
      action,
    },
  }
}

/**
 * Validate get actions request
 */
export function validateGetActionsRequest(query: any): {
  valid: boolean
  errors: string[]
  data?: GetActionsRequest
} {
  const errors: string[] = []
  
  const { entityType, entityId } = query || {}
  
  if (!entityType) {
    errors.push('entityType query param is required')
  } else if (!isValidEntityType(entityType)) {
    errors.push(`Invalid entityType: ${entityType}`)
  }
  
  if (!entityId) {
    errors.push('entityId query param is required')
  } else if (!isValidEntityId(entityId)) {
    errors.push('Invalid entityId format')
  }
  
  if (errors.length > 0) {
    return { valid: false, errors }
  }
  
  return {
    valid: true,
    errors: [],
    data: { entityType, entityId },
  }
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

/**
 * Workflow API audit log structure
 */
export interface WorkflowApiAuditLog {
  timestamp: string
  action: 'APPROVE' | 'REJECT' | 'GET_ACTIONS'
  entityType: string
  entityId: string
  companyId: string
  userId: string
  userRole: string
  success: boolean
  errorCode?: string
  errorMessage?: string
  requestPayload?: Record<string, any>
  responseData?: Record<string, any>
  durationMs: number
  clientIp?: string
  userAgent?: string
}

/**
 * Log workflow API action for audit
 */
export function logWorkflowApiAction(log: WorkflowApiAuditLog): void {
  // Log to console (in production, send to centralized logging)
  const logLevel = log.success ? 'info' : 'warn'
  const prefix = `[WORKFLOW-API] [${log.action}]`
  
  console[logLevel](prefix, {
    ...log,
    // Redact sensitive data if needed
    requestPayload: log.requestPayload ? { ...log.requestPayload } : undefined,
  })
  
  // TODO: In production, send to centralized logging service
  // Example: await AuditLogger.log('workflow_api', log)
}

// =============================================================================
// EXPORTS
// =============================================================================

export { WORKFLOW_ENTITY_TYPES }
