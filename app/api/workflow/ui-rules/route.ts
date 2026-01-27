/**
 * Workflow UI Rules API
 * 
 * GET /api/workflow/ui-rules?entityType=ORDER&entityId=ORD-123
 * 
 * Returns comprehensive UI rules for the frontend including:
 * - What actions the current user can perform
 * - Rejection configuration (reason codes, etc.)
 * - Workflow progress information
 * - Informational messages
 * 
 * This API ensures the frontend is completely workflow-agnostic.
 * All business logic is evaluated on the backend.
 */

import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import { WorkflowEntityType } from '@/lib/models/WorkflowConfiguration'
import {
  evaluateUIRules,
  UIRulesUserContext,
  UIRulesResponse,
} from '@/lib/workflow/ui-rules-service'
import {
  validateGetActionsRequest,
  successResponse,
  errorResponse,
  logWorkflowApiAction,
  API_ERROR_CODES,
  WorkflowApiAuditLog,
} from '@/lib/workflow/api-types'

// =============================================================================
// AUTH HELPER
// =============================================================================

/**
 * Extract user context from request headers/cookies
 */
function getUserContext(request: NextRequest): UIRulesUserContext | null {
  try {
    const companyId = request.headers.get('x-company-id') || 
                      request.cookies.get('companyId')?.value
    const userId = request.headers.get('x-user-id') || 
                   request.cookies.get('userId')?.value
    const userRole = request.headers.get('x-user-role') || 
                     request.cookies.get('userRole')?.value
    const userName = request.headers.get('x-user-name') || undefined
    
    if (!companyId || !userId || !userRole) {
      return null
    }
    
    return { companyId, userId, userRole, userName }
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
// GET /api/workflow/ui-rules
// =============================================================================

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  let auditLog: Partial<WorkflowApiAuditLog> = {
    action: 'GET_ACTIONS', // Reuse action type for audit
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
    
    // Step 2: Parse and validate query parameters
    const { searchParams } = new URL(request.url)
    const query = {
      entityType: searchParams.get('entityType'),
      entityId: searchParams.get('entityId'),
    }
    
    const validation = validateGetActionsRequest(query)
    
    if (!validation.valid) {
      const response = errorResponse(
        API_ERROR_CODES.VALIDATION_ERROR,
        'Request validation failed',
        { errors: validation.errors }
      )
      
      auditLog = {
        ...auditLog,
        entityType: query.entityType || undefined,
        entityId: query.entityId || undefined,
        success: false,
        errorCode: API_ERROR_CODES.VALIDATION_ERROR,
        errorMessage: validation.errors.join(', '),
        durationMs: Date.now() - startTime,
      }
      logWorkflowApiAction(auditLog as WorkflowApiAuditLog)
      
      return NextResponse.json(response, { status: 400 })
    }
    
    const { entityType, entityId } = validation.data!
    
    auditLog.entityType = entityType
    auditLog.entityId = entityId
    
    // Step 3: Connect to database
    await connectDB()
    
    // Step 4: Evaluate UI rules
    const uiRules: UIRulesResponse = await evaluateUIRules(
      entityType as WorkflowEntityType,
      entityId,
      userContext
    )
    
    // Step 5: Handle entity not found
    if (uiRules.entityStatus === 'NOT_FOUND') {
      const response = errorResponse(
        API_ERROR_CODES.ENTITY_NOT_FOUND,
        `${entityType} with ID ${entityId} not found`
      )
      
      auditLog = {
        ...auditLog,
        success: false,
        errorCode: API_ERROR_CODES.ENTITY_NOT_FOUND,
        errorMessage: 'Entity not found',
        durationMs: Date.now() - startTime,
      }
      logWorkflowApiAction(auditLog as WorkflowApiAuditLog)
      
      return NextResponse.json(response, { status: 404 })
    }
    
    // Step 6: Return success response
    const response = successResponse(uiRules)
    
    auditLog = {
      ...auditLog,
      success: true,
      responseData: {
        workflowState: uiRules.workflowState,
        currentStage: uiRules.currentStage,
        canApprove: uiRules.allowedActions.canApprove.allowed,
        canReject: uiRules.allowedActions.canReject.allowed,
      },
      durationMs: Date.now() - startTime,
    }
    logWorkflowApiAction(auditLog as WorkflowApiAuditLog)
    
    // Add cache control - UI rules can be cached briefly
    return NextResponse.json(response, { 
      status: 200,
      headers: {
        'Cache-Control': 'private, max-age=10', // Cache for 10 seconds
      },
    })
    
  } catch (error: any) {
    console.error('[WORKFLOW-API] UI Rules error:', error)
    
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-company-id, x-user-id, x-user-role, x-user-name',
    },
  })
}
