/**
 * Workflow Approve API
 * 
 * POST /api/workflow/approve
 * 
 * Generic approval endpoint that works for Order, GRN, Invoice,
 * and any future workflow-driven entities.
 * 
 * This API:
 * - Does NOT contain workflow logic
 * - Validates request shape
 * - Extracts user context from auth
 * - Delegates to workflow engine
 * - Returns standardized responses
 */

import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import { 
  approveEntity,
  WorkflowEntityType,
} from '@/lib/workflow/workflow-execution-engine'
import {
  validateApproveRequest,
  successResponse,
  errorResponse,
  getHttpStatus,
  logWorkflowApiAction,
  API_ERROR_CODES,
  ApproveResponseData,
  UserContext,
  WorkflowApiAuditLog,
} from '@/lib/workflow/api-types'
import {
  buildApprovalNotification,
  fireWorkflowNotification,
} from '@/lib/workflow/workflow-notification-events'

// =============================================================================
// AUTH HELPER (Extract user context from request)
// =============================================================================

/**
 * Extract user context from request headers/cookies
 * 
 * In production, this would:
 * - Verify JWT token
 * - Extract user claims
 * - Validate session
 * 
 * For now, we read from custom headers set by frontend auth
 */
function getUserContext(request: NextRequest): UserContext | null {
  try {
    // Try to get from headers (set by auth middleware or frontend)
    const companyId = request.headers.get('x-company-id')
    const userId = request.headers.get('x-user-id')
    const userRole = request.headers.get('x-user-role')
    const userName = request.headers.get('x-user-name')
    
    // Also try cookies as fallback
    const companyIdCookie = request.cookies.get('companyId')?.value
    const userIdCookie = request.cookies.get('userId')?.value
    const userRoleCookie = request.cookies.get('userRole')?.value
    
    const finalCompanyId = companyId || companyIdCookie
    const finalUserId = userId || userIdCookie
    const finalUserRole = userRole || userRoleCookie
    
    if (!finalCompanyId || !finalUserId || !finalUserRole) {
      return null
    }
    
    return {
      companyId: finalCompanyId,
      userId: finalUserId,
      userRole: finalUserRole,
      userName: userName || undefined,
    }
  } catch {
    return null
  }
}

/**
 * Get client IP from request
 */
function getClientIp(request: NextRequest): string | undefined {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
         request.headers.get('x-real-ip') ||
         undefined
}

// =============================================================================
// POST /api/workflow/approve
// =============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let auditLog: Partial<WorkflowApiAuditLog> = {
    action: 'APPROVE',
    timestamp: new Date().toISOString(),
    clientIp: getClientIp(request),
    userAgent: request.headers.get('user-agent') || undefined,
  }
  
  try {
    // Step 1: Authenticate user
    const userContext = getUserContext(request)
    
    if (!userContext) {
      const response = errorResponse(
        API_ERROR_CODES.UNAUTHORIZED,
        'Authentication required. Please log in.'
      )
      
      auditLog = {
        ...auditLog,
        success: false,
        errorCode: API_ERROR_CODES.UNAUTHORIZED,
        errorMessage: 'No user context',
        durationMs: Date.now() - startTime,
      }
      logWorkflowApiAction(auditLog as WorkflowApiAuditLog)
      
      return NextResponse.json(response, { status: 401 })
    }
    
    auditLog.companyId = userContext.companyId
    auditLog.userId = userContext.userId
    auditLog.userRole = userContext.userRole
    
    // Step 2: Parse and validate request body
    let body: any
    try {
      body = await request.json()
    } catch {
      const response = errorResponse(
        API_ERROR_CODES.VALIDATION_ERROR,
        'Invalid JSON in request body'
      )
      
      auditLog = {
        ...auditLog,
        success: false,
        errorCode: API_ERROR_CODES.VALIDATION_ERROR,
        errorMessage: 'Invalid JSON',
        durationMs: Date.now() - startTime,
      }
      logWorkflowApiAction(auditLog as WorkflowApiAuditLog)
      
      return NextResponse.json(response, { status: 400 })
    }
    
    const validation = validateApproveRequest(body)
    
    if (!validation.valid) {
      const response = errorResponse(
        API_ERROR_CODES.VALIDATION_ERROR,
        'Request validation failed',
        { errors: validation.errors }
      )
      
      auditLog = {
        ...auditLog,
        entityType: body?.entityType,
        entityId: body?.entityId,
        requestPayload: body,
        success: false,
        errorCode: API_ERROR_CODES.VALIDATION_ERROR,
        errorMessage: validation.errors.join(', '),
        durationMs: Date.now() - startTime,
      }
      logWorkflowApiAction(auditLog as WorkflowApiAuditLog)
      
      return NextResponse.json(response, { status: 400 })
    }
    
    const { entityType, entityId, remarks } = validation.data!
    
    auditLog.entityType = entityType
    auditLog.entityId = entityId
    auditLog.requestPayload = { entityType, entityId, remarks }
    
    // Step 3: Connect to database
    await connectDB()
    
    // Step 4: Call workflow engine
    const result = await approveEntity({
      companyId: userContext.companyId,
      entityType: entityType as WorkflowEntityType,
      entityId,
      userId: userContext.userId,
      userRole: userContext.userRole,
      userName: userContext.userName,
      remarks,
      metadata: {
        source: 'API',
        clientIp: getClientIp(request),
      },
    })
    
    // Step 5: Handle result
    if (!result.success) {
      const httpStatus = getHttpStatus(result.errorCode!)
      const response = errorResponse(
        result.errorCode!,
        result.errorMessage!
      )
      
      auditLog = {
        ...auditLog,
        success: false,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        durationMs: Date.now() - startTime,
      }
      logWorkflowApiAction(auditLog as WorkflowApiAuditLog)
      
      return NextResponse.json(response, { status: httpStatus })
    }
    
    // Step 6: Fire notification (async, don't wait)
    const notificationPayload = buildApprovalNotification(
      userContext.companyId,
      entityType as WorkflowEntityType,
      result.data!,
      {
        userId: userContext.userId,
        userRole: userContext.userRole,
        userName: userContext.userName,
      }
    )
    
    // Fire and forget - don't block API response
    fireWorkflowNotification(notificationPayload).catch(err => {
      console.error('[WORKFLOW-API] Notification failed:', err.message)
    })
    
    // Step 7: Build success response
    const responseData: ApproveResponseData = {
      entityId: result.data!.entityId,
      entityType,
      action: 'APPROVED',
      previousStage: result.data!.previousStage,
      newStage: result.data!.newStage,
      previousStatus: result.data!.previousStatus,
      newStatus: result.data!.newStatus,
      isFullyApproved: result.data!.isTerminal,
      auditId: result.data!.auditId,
      approvedAt: new Date().toISOString(),
    }
    
    const response = successResponse(responseData)
    
    auditLog = {
      ...auditLog,
      success: true,
      responseData: responseData,
      durationMs: Date.now() - startTime,
    }
    logWorkflowApiAction(auditLog as WorkflowApiAuditLog)
    
    return NextResponse.json(response, { status: 200 })
    
  } catch (error: any) {
    console.error('[WORKFLOW-API] Approve error:', error)
    
    const response = errorResponse(
      API_ERROR_CODES.INTERNAL_ERROR,
      'An unexpected error occurred'
    )
    
    auditLog = {
      ...auditLog,
      success: false,
      errorCode: API_ERROR_CODES.INTERNAL_ERROR,
      errorMessage: error.message,
      durationMs: Date.now() - startTime,
    }
    logWorkflowApiAction(auditLog as WorkflowApiAuditLog)
    
    return NextResponse.json(response, { status: 500 })
  }
}

// =============================================================================
// OPTIONS (CORS preflight)
// =============================================================================

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-company-id, x-user-id, x-user-role, x-user-name',
    },
  })
}
