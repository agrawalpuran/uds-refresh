/**
 * Workflow Actions API
 * 
 * GET /api/workflow/actions?entityType=ORDER&entityId=ORD-123
 * 
 * Returns what actions are available for the current user on an entity.
 * This API reads workflow configuration and evaluates permissions
 * WITHOUT hardcoding any role logic.
 * 
 * This API:
 * - Does NOT contain workflow logic
 * - Uses workflow engine to check permissions
 * - Returns available actions with reasons
 * - Provides workflow context for UI display
 */

import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import { 
  canUserApprove,
  canUserReject,
  getWorkflowState,
  WorkflowEntityType,
} from '@/lib/workflow/workflow-execution-engine'
import {
  validateGetActionsRequest,
  successResponse,
  errorResponse,
  logWorkflowApiAction,
  API_ERROR_CODES,
  GetActionsResponseData,
  UserContext,
  WorkflowApiAuditLog,
} from '@/lib/workflow/api-types'

// =============================================================================
// AUTH HELPER (Extract user context from request)
// =============================================================================

/**
 * Extract user context from request headers/cookies
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
// GET /api/workflow/actions?entityType=&entityId=
// =============================================================================

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  let auditLog: Partial<WorkflowApiAuditLog> = {
    action: 'GET_ACTIONS',
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
    
    // Step 4: Get workflow state
    const workflowState = await getWorkflowState(
      userContext.companyId,
      entityType as WorkflowEntityType,
      entityId
    )
    
    // Handle entity not found
    if (!workflowState.entity) {
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
    
    // Handle no workflow config
    if (!workflowState.config) {
      const response = errorResponse(
        API_ERROR_CODES.WORKFLOW_NOT_FOUND,
        `No active workflow configuration found for ${entityType}`
      )
      
      auditLog = {
        ...auditLog,
        success: false,
        errorCode: API_ERROR_CODES.WORKFLOW_NOT_FOUND,
        errorMessage: 'No workflow config',
        durationMs: Date.now() - startTime,
      }
      logWorkflowApiAction(auditLog as WorkflowApiAuditLog)
      
      return NextResponse.json(response, { status: 404 })
    }
    
    // Step 5: Check permissions using workflow engine
    const [approveCheck, rejectCheck] = await Promise.all([
      canUserApprove(
        userContext.companyId,
        entityType as WorkflowEntityType,
        entityId,
        userContext.userRole
      ),
      canUserReject(
        userContext.companyId,
        entityType as WorkflowEntityType,
        entityId,
        userContext.userRole
      ),
    ])
    
    // Step 6: Build response
    const currentStage = workflowState.currentStage
    const config = workflowState.config
    
    // Calculate current stage order
    const sortedStages = [...config.stages].sort((a, b) => a.order - b.order)
    const currentStageIndex = currentStage 
      ? sortedStages.findIndex(s => s.stageKey === currentStage.stageKey)
      : -1
    
    const responseData: GetActionsResponseData = {
      entityId,
      entityType,
      currentStage: currentStage?.stageKey || null,
      currentStageName: currentStage?.stageName || null,
      currentStatus: workflowState.entity.status,
      actions: {
        canApprove: approveCheck.canApprove,
        canReject: rejectCheck.canReject,
        approveDisabledReason: approveCheck.canApprove ? undefined : approveCheck.reason,
        rejectDisabledReason: rejectCheck.canReject ? undefined : rejectCheck.reason,
      },
      workflowInfo: {
        workflowName: config.workflowName,
        totalStages: config.stages.length,
        currentStageOrder: currentStageIndex + 1, // 1-based
        isTerminal: workflowState.isTerminal,
        nextStageName: workflowState.nextStage?.stageName || null,
        allowedRoles: currentStage?.allowedRoles || [],
      },
    }
    
    const response = successResponse(responseData)
    
    auditLog = {
      ...auditLog,
      success: true,
      responseData: {
        canApprove: responseData.actions.canApprove,
        canReject: responseData.actions.canReject,
        currentStage: responseData.currentStage,
      },
      durationMs: Date.now() - startTime,
    }
    logWorkflowApiAction(auditLog as WorkflowApiAuditLog)
    
    return NextResponse.json(response, { status: 200 })
    
  } catch (error: any) {
    console.error('[WORKFLOW-API] Get actions error:', error)
    
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
