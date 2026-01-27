/**
 * UI Rules Service
 * 
 * Backend-driven UI rules engine that tells the frontend what actions
 * are available for the current user at the current workflow stage.
 * 
 * This service:
 * - Evaluates permissions dynamically from workflow configuration
 * - Does NOT hardcode roles or stage names
 * - Provides rich UI metadata for frontend rendering
 * - Handles all edge cases gracefully
 * 
 * WHY BACKEND-DRIVEN UI RULES?
 * 
 * 1. Single Source of Truth
 *    - Business rules live in ONE place (backend)
 *    - No risk of frontend/backend logic divergence
 * 
 * 2. Security
 *    - Frontend can't be trusted to enforce permissions
 *    - Backend validates ALL actions regardless of UI
 * 
 * 3. Flexibility
 *    - Change workflow rules without deploying frontend
 *    - A/B test different workflows instantly
 * 
 * 4. Consistency
 *    - Same rules apply to web, mobile, API clients
 *    - No duplication of permission logic
 * 
 * @module lib/workflow/ui-rules-service
 */

import connectDB from '../db/mongodb'
import WorkflowConfiguration, {
  IWorkflowConfiguration,
  IWorkflowStage,
  IStageRejectionConfig,
  getEffectiveRejectionConfig,
  RESUBMISSION_STRATEGIES,
} from '../models/WorkflowConfiguration'
import { getEntityRepository, WorkflowEntity } from './entity-repository'
// Import consts from separate file (Turbopack can't handle type exports)
import { WORKFLOW_ENTITY_TYPES } from './workflow-types'

// Define type locally to work around Turbopack limitations
type WorkflowEntityType = 'ORDER' | 'GRN' | 'INVOICE' | 'PURCHASE_ORDER' | 'RETURN_REQUEST'

// Re-export for consumers
export { WORKFLOW_ENTITY_TYPES }
export type { WorkflowEntityType }

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

/**
 * User context for rule evaluation
 */
export interface UIRulesUserContext {
  companyId: string
  userId: string
  userRole: string
  userName?: string
}

/**
 * Individual action permission
 */
export interface ActionPermission {
  allowed: boolean
  reason?: string              // Why action is allowed/disallowed
  requiresConfirmation?: boolean
  confirmationMessage?: string
}

/**
 * All available actions
 */
export interface AllowedActions {
  canApprove: ActionPermission
  canReject: ActionPermission
  canResubmit: ActionPermission
  canCancel: ActionPermission
  canView: ActionPermission
  canEdit: ActionPermission
}

/**
 * Rejection configuration for UI
 */
export interface RejectionConfig {
  isAllowed: boolean
  isReasonMandatory: boolean
  isRemarksMandatory: boolean
  maxRemarksLength: number
  allowedReasonCodes: ReasonCodeOption[]
  allowedActions: RejectionActionOption[]
}

/**
 * Reason code option for UI dropdown
 */
export interface ReasonCodeOption {
  code: string
  label: string
  description?: string
  requiresRemarks?: boolean
  category?: string
}

/**
 * Rejection action option
 */
export interface RejectionActionOption {
  action: string
  label: string
  description?: string
}

/**
 * Workflow progress info
 */
export interface WorkflowProgress {
  totalStages: number
  currentStageOrder: number
  completedStages: number
  percentComplete: number
  stages: StageInfo[]
}

/**
 * Stage information
 */
export interface StageInfo {
  stageKey: string
  stageName: string
  order: number
  status: 'COMPLETED' | 'CURRENT' | 'PENDING' | 'SKIPPED'
  allowedRoles: string[]
  isTerminal: boolean
}

/**
 * Complete UI Rules response
 */
export interface UIRulesResponse {
  // Entity info
  entityId: string
  entityType: string
  entityStatus: string
  
  // Workflow state
  workflowState: 'IN_WORKFLOW' | 'COMPLETED' | 'REJECTED' | 'NOT_IN_WORKFLOW' | 'NO_WORKFLOW_CONFIG'
  currentStage: string | null
  currentStageName: string | null
  
  // Permissions
  allowedActions: AllowedActions
  
  // Rejection config (if rejection is allowed)
  rejectionConfig: RejectionConfig
  
  // Workflow progress
  workflowProgress: WorkflowProgress | null
  
  // Informational messages for UI
  informationalMessage: string | null
  statusMessage: string | null
  nextActionHint: string | null
  
  // Role info
  userRoleInfo: {
    currentRole: string
    isAllowedAtCurrentStage: boolean
    allowedRolesAtCurrentStage: string[]
  }
  
  // Metadata
  evaluatedAt: string
  workflowConfigId: string | null
  workflowConfigVersion: number | null
}

// =============================================================================
// REJECTION REASON CODES (Configuration)
// =============================================================================

/**
 * Default rejection reason codes by entity type
 * In production, these could come from a separate collection or config service
 */
export function getDefaultReasonCodes(entityType: WorkflowEntityType): ReasonCodeOption[] {
  const commonReasons: ReasonCodeOption[] = [
    { code: 'INCOMPLETE_INFORMATION', label: 'Incomplete Information', description: 'Required information is missing', requiresRemarks: true },
    { code: 'INVALID_DATA', label: 'Invalid Data', description: 'Data provided is incorrect or invalid', requiresRemarks: true },
    { code: 'DUPLICATE_REQUEST', label: 'Duplicate Request', description: 'This request already exists' },
    { code: 'POLICY_VIOLATION', label: 'Policy Violation', description: 'Violates company policy', requiresRemarks: true },
    { code: 'UNAUTHORIZED_REQUEST', label: 'Unauthorized Request', description: 'Requester not authorized' },
    { code: 'OTHER', label: 'Other', description: 'Other reason', requiresRemarks: true, category: 'GENERAL' },
  ]
  
  const entitySpecificReasons: Record<WorkflowEntityType, ReasonCodeOption[]> = {
    [WORKFLOW_ENTITY_TYPES.ORDER]: [
      { code: 'ELIGIBILITY_EXHAUSTED', label: 'Eligibility Exhausted', description: 'Employee has no remaining eligibility', category: 'ELIGIBILITY' },
      { code: 'EMPLOYEE_NOT_ELIGIBLE', label: 'Employee Not Eligible', description: 'Employee is not eligible for this order', category: 'ELIGIBILITY' },
      { code: 'INVALID_QUANTITY', label: 'Invalid Quantity', description: 'Quantity exceeds allowed limit', category: 'QUANTITY' },
      { code: 'PRODUCT_UNAVAILABLE', label: 'Product Unavailable', description: 'One or more products are not available', category: 'INVENTORY' },
      { code: 'BUDGET_EXCEEDED', label: 'Budget Exceeded', description: 'Order exceeds budget limit', category: 'BUDGET' },
      { code: 'DELIVERY_ADDRESS_INVALID', label: 'Invalid Delivery Address', description: 'Delivery address is invalid or incomplete', requiresRemarks: true },
      { code: 'SIZE_MISMATCH', label: 'Size Information Incorrect', description: 'Size information is missing or incorrect', requiresRemarks: true },
    ],
    [WORKFLOW_ENTITY_TYPES.GRN]: [
      { code: 'QUANTITY_MISMATCH', label: 'Quantity Mismatch', description: 'Delivered quantity does not match PO', requiresRemarks: true },
      { code: 'QUALITY_ISSUE', label: 'Quality Issue', description: 'Items do not meet quality standards', requiresRemarks: true },
      { code: 'DAMAGED_GOODS', label: 'Damaged Goods', description: 'Items received are damaged', requiresRemarks: true },
      { code: 'WRONG_ITEMS', label: 'Wrong Items', description: 'Items delivered do not match order', requiresRemarks: true },
      { code: 'MISSING_DOCUMENTATION', label: 'Missing Documentation', description: 'Required documents not provided' },
    ],
    [WORKFLOW_ENTITY_TYPES.INVOICE]: [
      { code: 'PRICING_DISCREPANCY', label: 'Pricing Discrepancy', description: 'Invoice prices do not match PO', requiresRemarks: true },
      { code: 'TAX_CALCULATION_ERROR', label: 'Tax Calculation Error', description: 'Tax amount is incorrect', requiresRemarks: true },
      { code: 'PO_MISMATCH', label: 'PO Mismatch', description: 'Invoice does not match PO', requiresRemarks: true },
      { code: 'GRN_NOT_APPROVED', label: 'GRN Not Approved', description: 'GRN must be approved first' },
      { code: 'AMOUNT_EXCEEDS_LIMIT', label: 'Amount Exceeds Limit', description: 'Invoice amount exceeds approval limit', requiresRemarks: true },
    ],
    [WORKFLOW_ENTITY_TYPES.PURCHASE_ORDER]: [
      { code: 'VENDOR_ISSUE', label: 'Vendor Issue', description: 'Issue with selected vendor', requiresRemarks: true },
      { code: 'PRICING_ISSUE', label: 'Pricing Issue', description: 'PO pricing needs review', requiresRemarks: true },
    ],
    [WORKFLOW_ENTITY_TYPES.RETURN_REQUEST]: [
      { code: 'ITEM_NOT_ELIGIBLE', label: 'Item Not Eligible', description: 'Item is not eligible for return' },
      { code: 'RETURN_WINDOW_EXPIRED', label: 'Return Window Expired', description: 'Return window has passed' },
      { code: 'ITEM_CONDITION', label: 'Item Condition', description: 'Item condition does not meet return policy', requiresRemarks: true },
    ],
  }
  
  return [
    ...entitySpecificReasons[entityType] || [],
    ...commonReasons,
  ]
}

/**
 * Default rejection actions
 */
export function getDefaultRejectionActions(): RejectionActionOption[] {
  return [
    { action: 'REJECT', label: 'Reject', description: 'Permanently reject the request' },
    { action: 'SEND_BACK', label: 'Send Back for Correction', description: 'Return to submitter for corrections' },
    { action: 'HOLD', label: 'Put on Hold', description: 'Temporarily hold for review' },
  ]
}

// =============================================================================
// UI RULES ENGINE
// =============================================================================

/**
 * Main UI Rules evaluation function
 */
export async function evaluateUIRules(
  entityType: WorkflowEntityType,
  entityId: string,
  userContext: UIRulesUserContext
): Promise<UIRulesResponse> {
  await connectDB()
  
  const evaluatedAt = new Date().toISOString()
  
  // Step 1: Load entity
  const repository = getEntityRepository(entityType)
  const entity = await repository.findById(entityId)
  
  if (!entity) {
    return buildNotFoundResponse(entityType, entityId, userContext, evaluatedAt)
  }
  
  // Verify entity belongs to company
  if (entity.companyId !== userContext.companyId) {
    return buildNotFoundResponse(entityType, entityId, userContext, evaluatedAt)
  }
  
  // Step 2: Load workflow configuration
  const config = await WorkflowConfiguration.findOne({
    companyId: userContext.companyId,
    entityType,
    isActive: true,
  }).lean() as IWorkflowConfiguration | null
  
  if (!config) {
    return buildNoWorkflowConfigResponse(entity, userContext, evaluatedAt)
  }
  
  // Step 3: Determine workflow state
  const workflowState = determineWorkflowState(entity)
  
  // Step 4: Resolve current stage
  const currentStage = resolveCurrentStage(entity, config)
  
  // Step 5: Evaluate all permissions
  const allowedActions = evaluateAllActions(entity, config, currentStage, userContext)
  
  // Step 6: Build rejection config
  const rejectionConfig = buildRejectionConfig(
    entityType,
    allowedActions.canReject.allowed,
    config,
    currentStage
  )
  
  // Step 7: Build workflow progress
  const workflowProgress = buildWorkflowProgress(entity, config, currentStage)
  
  // Step 8: Generate informational messages
  const messages = generateMessages(entity, config, currentStage, userContext, workflowState)
  
  // Step 9: Build role info
  const userRoleInfo = {
    currentRole: userContext.userRole,
    isAllowedAtCurrentStage: currentStage?.allowedRoles.includes(userContext.userRole) || false,
    allowedRolesAtCurrentStage: currentStage?.allowedRoles || [],
  }
  
  return {
    entityId,
    entityType,
    entityStatus: entity.status,
    workflowState,
    currentStage: currentStage?.stageKey || null,
    currentStageName: currentStage?.stageName || null,
    allowedActions,
    rejectionConfig,
    workflowProgress,
    informationalMessage: messages.informational,
    statusMessage: messages.status,
    nextActionHint: messages.nextActionHint,
    userRoleInfo,
    evaluatedAt,
    workflowConfigId: config.id,
    workflowConfigVersion: config.version,
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Determine overall workflow state
 */
function determineWorkflowState(
  entity: WorkflowEntity
): 'IN_WORKFLOW' | 'COMPLETED' | 'REJECTED' | 'NOT_IN_WORKFLOW' | 'NO_WORKFLOW_CONFIG' {
  const status = entity.status?.toUpperCase() || ''
  
  if (status.includes('REJECTED') || status === 'CANCELLED') {
    return 'REJECTED'
  }
  
  if (status === 'APPROVED' || status === 'COMPLETED' || status === 'CLOSED' || status === 'DELIVERED') {
    return 'COMPLETED'
  }
  
  if (status.includes('PENDING') || status.includes('AWAITING')) {
    return 'IN_WORKFLOW'
  }
  
  if (!entity.currentStage && !status.includes('PENDING')) {
    return 'NOT_IN_WORKFLOW'
  }
  
  return 'IN_WORKFLOW'
}

/**
 * Resolve current workflow stage
 */
function resolveCurrentStage(
  entity: WorkflowEntity,
  config: IWorkflowConfiguration
): IWorkflowStage | null {
  // If entity has explicit current stage
  if (entity.currentStage) {
    return config.stages.find(s => s.stageKey === entity.currentStage) || null
  }
  
  // Try to derive from status
  const status = entity.status?.toUpperCase() || ''
  
  // If status indicates a specific pending stage
  for (const stage of config.stages) {
    if (status.includes(stage.stageKey)) {
      return stage
    }
  }
  
  // If entity is pending but no stage identified, use first stage
  if (status.includes('PENDING') || status.includes('AWAITING')) {
    const sortedStages = [...config.stages].sort((a, b) => a.order - b.order)
    return sortedStages[0]
  }
  
  return null
}

/**
 * Evaluate all action permissions
 */
function evaluateAllActions(
  entity: WorkflowEntity,
  config: IWorkflowConfiguration,
  currentStage: IWorkflowStage | null,
  userContext: UIRulesUserContext
): AllowedActions {
  const workflowState = determineWorkflowState(entity)
  
  // Base permissions
  const canView: ActionPermission = {
    allowed: true,
    reason: 'User can view this entity',
  }
  
  // If workflow is completed or rejected, most actions are disabled
  if (workflowState === 'COMPLETED') {
    return {
      canApprove: { allowed: false, reason: 'Entity is already fully approved' },
      canReject: { allowed: false, reason: 'Entity is already fully approved' },
      canResubmit: { allowed: false, reason: 'Entity is already fully approved' },
      canCancel: { allowed: false, reason: 'Entity is already fully approved' },
      canView,
      canEdit: { allowed: false, reason: 'Entity is already fully approved' },
    }
  }
  
  if (workflowState === 'REJECTED') {
    // For rejected entities, get rejection config from workflow config
    // This determines resubmission behavior
    const rejectionConfig = currentStage 
      ? getEffectiveRejectionConfig(config, currentStage.stageKey)
      : null
    
    return {
      canApprove: { allowed: false, reason: 'Entity has been rejected' },
      canReject: { allowed: false, reason: 'Entity has been rejected' },
      canResubmit: evaluateResubmitPermission(entity, userContext, rejectionConfig),
      canCancel: { allowed: false, reason: 'Entity has been rejected' },
      canView,
      canEdit: evaluateEditPermission(entity, userContext, rejectionConfig),
    }
  }
  
  if (!currentStage) {
    return {
      canApprove: { allowed: false, reason: 'Entity is not in an approval workflow' },
      canReject: { allowed: false, reason: 'Entity is not in an approval workflow' },
      canResubmit: { allowed: false, reason: 'Entity is not in an approval workflow' },
      canCancel: evaluateCancelPermission(entity, userContext),
      canView,
      canEdit: evaluateEditPermission(entity, userContext),
    }
  }
  
  // Check role permission at current stage
  const isRoleAllowed = currentStage.allowedRoles.includes(userContext.userRole)
  
  // Evaluate approve permission
  const canApprove = evaluateApprovePermission(
    entity, config, currentStage, userContext, isRoleAllowed
  )
  
  // Evaluate reject permission
  const canReject = evaluateRejectPermission(
    entity, config, currentStage, userContext, isRoleAllowed
  )
  
  return {
    canApprove,
    canReject,
    canResubmit: { allowed: false, reason: 'Entity is pending approval' },
    canCancel: evaluateCancelPermission(entity, userContext),
    canView,
    canEdit: { allowed: false, reason: 'Entity is pending approval' },
  }
}

/**
 * Evaluate approve permission
 */
function evaluateApprovePermission(
  entity: WorkflowEntity,
  config: IWorkflowConfiguration,
  currentStage: IWorkflowStage,
  userContext: UIRulesUserContext,
  isRoleAllowed: boolean
): ActionPermission {
  if (!currentStage.canApprove) {
    return {
      allowed: false,
      reason: `Stage "${currentStage.stageName}" does not allow approval`,
    }
  }
  
  if (!isRoleAllowed) {
    return {
      allowed: false,
      reason: `Your role (${userContext.userRole}) is not authorized to approve at this stage. Allowed roles: ${currentStage.allowedRoles.join(', ')}`,
    }
  }
  
  // Determine if this is final approval
  const sortedStages = [...config.stages].sort((a, b) => a.order - b.order)
  const currentIndex = sortedStages.findIndex(s => s.stageKey === currentStage.stageKey)
  const isLastStage = currentIndex === sortedStages.length - 1 || currentStage.isTerminal
  
  return {
    allowed: true,
    reason: isLastStage 
      ? 'You can give final approval for this entity'
      : 'You can approve and move to next stage',
    requiresConfirmation: isLastStage,
    confirmationMessage: isLastStage 
      ? 'This is the final approval. The entity will be marked as approved. Continue?'
      : undefined,
  }
}

/**
 * Evaluate reject permission
 */
function evaluateRejectPermission(
  entity: WorkflowEntity,
  config: IWorkflowConfiguration,
  currentStage: IWorkflowStage,
  userContext: UIRulesUserContext,
  isRoleAllowed: boolean
): ActionPermission {
  if (!currentStage.canReject) {
    return {
      allowed: false,
      reason: `Stage "${currentStage.stageName}" does not allow rejection`,
    }
  }
  
  if (!isRoleAllowed) {
    return {
      allowed: false,
      reason: `Your role (${userContext.userRole}) is not authorized to reject at this stage. Allowed roles: ${currentStage.allowedRoles.join(', ')}`,
    }
  }
  
  return {
    allowed: true,
    reason: 'You can reject this entity with a reason',
    requiresConfirmation: true,
    confirmationMessage: 'Are you sure you want to reject this entity? This action will notify the submitter.',
  }
}

/**
 * Evaluate resubmit permission based on rejection configuration
 * Honors: allowResubmission, resubmissionAllowedRoles, resubmissionStrategy
 */
function evaluateResubmitPermission(
  entity: WorkflowEntity,
  userContext: UIRulesUserContext,
  rejectionConfig?: IStageRejectionConfig | null
): ActionPermission {
  // Check if resubmission is allowed by configuration
  if (rejectionConfig && !rejectionConfig.allowResubmission) {
    return {
      allowed: false,
      reason: 'Resubmission is not allowed for this rejection',
    }
  }
  
  // Check resubmission strategy
  const strategy = rejectionConfig?.resubmissionStrategy || RESUBMISSION_STRATEGIES.NEW_ENTITY
  
  const raw = entity._raw
  const createdBy = raw.employeeId || raw.createdBy
  
  // Check if user's role is allowed to resubmit
  const allowedRoles = rejectionConfig?.resubmissionAllowedRoles || ['REQUESTOR']
  const isRoleAllowed = allowedRoles.includes(userContext.userRole) || 
                        (allowedRoles.includes('REQUESTOR') && createdBy === userContext.userId)
  
  // Company Admin can always resubmit (unless explicitly excluded)
  const isCompanyAdmin = userContext.userRole === 'COMPANY_ADMIN'
  
  if (isRoleAllowed || isCompanyAdmin) {
    const strategyMessage = strategy === RESUBMISSION_STRATEGIES.SAME_ENTITY
      ? 'You can resubmit this entity for approval'
      : 'You must create a new request to resubmit'
    
    return {
      allowed: true,
      reason: strategyMessage,
      requiresConfirmation: strategy === RESUBMISSION_STRATEGIES.NEW_ENTITY,
      confirmationMessage: strategy === RESUBMISSION_STRATEGIES.NEW_ENTITY
        ? 'This will create a new request. The rejected request will remain in history. Continue?'
        : undefined,
    }
  }
  
  return {
    allowed: false,
    reason: `Only ${allowedRoles.join(' or ')} can resubmit rejected entities`,
  }
}

/**
 * Evaluate cancel permission
 */
function evaluateCancelPermission(
  entity: WorkflowEntity,
  userContext: UIRulesUserContext
): ActionPermission {
  const raw = entity._raw
  const createdBy = raw.employeeId || raw.createdBy
  
  // Owner or admin can cancel
  if (createdBy === userContext.userId || 
      userContext.userRole === 'COMPANY_ADMIN' ||
      userContext.userRole === 'SUPER_ADMIN') {
    return {
      allowed: true,
      reason: 'You can cancel this entity',
      requiresConfirmation: true,
      confirmationMessage: 'Are you sure you want to cancel? This action cannot be undone.',
    }
  }
  
  return {
    allowed: false,
    reason: 'Only the owner or admin can cancel',
  }
}

/**
 * Evaluate edit permission based on rejection configuration
 * Edit is tied to resubmission - if SAME_ENTITY strategy, editing is allowed
 */
function evaluateEditPermission(
  entity: WorkflowEntity,
  userContext: UIRulesUserContext,
  rejectionConfig?: IStageRejectionConfig | null
): ActionPermission {
  const workflowState = determineWorkflowState(entity)
  
  if (workflowState === 'REJECTED') {
    // Check resubmission strategy - edit only allowed for SAME_ENTITY
    const strategy = rejectionConfig?.resubmissionStrategy || RESUBMISSION_STRATEGIES.NEW_ENTITY
    
    if (strategy === RESUBMISSION_STRATEGIES.NEW_ENTITY) {
      return {
        allowed: false,
        reason: 'This rejection requires creating a new request. The original cannot be edited.',
      }
    }
    
    // For SAME_ENTITY, check if user can resubmit (same rules)
    const raw = entity._raw
    const createdBy = raw.employeeId || raw.createdBy
    const allowedRoles = rejectionConfig?.resubmissionAllowedRoles || ['REQUESTOR']
    
    const isRoleAllowed = allowedRoles.includes(userContext.userRole) || 
                          (allowedRoles.includes('REQUESTOR') && createdBy === userContext.userId)
    const isCompanyAdmin = userContext.userRole === 'COMPANY_ADMIN'
    
    if (isRoleAllowed || isCompanyAdmin) {
      return {
        allowed: true,
        reason: 'You can edit this rejected entity before resubmitting',
      }
    }
    
    return {
      allowed: false,
      reason: `Only ${allowedRoles.join(' or ')} can edit rejected entities`,
    }
  }
  
  return {
    allowed: false,
    reason: 'Entity cannot be edited in current state',
  }
}

/**
 * Build rejection configuration from workflow stage configuration
 * All settings are driven by configuration - no hardcoded values
 */
function buildRejectionConfig(
  entityType: WorkflowEntityType,
  isRejectionAllowed: boolean,
  config: IWorkflowConfiguration,
  currentStage: IWorkflowStage | null
): RejectionConfig {
  // Get effective rejection config from stage or defaults
  const stageRejectionConfig: IStageRejectionConfig | null = currentStage && config
    ? getEffectiveRejectionConfig(config, currentStage.stageKey)
    : null
  
  // Get all available reason codes for this entity type
  let allowedReasonCodes = getDefaultReasonCodes(entityType)
  
  // Filter reason codes if stage config restricts them
  if (stageRejectionConfig?.allowedReasonCodes && stageRejectionConfig.allowedReasonCodes.length > 0) {
    const allowedCodes = new Set(stageRejectionConfig.allowedReasonCodes)
    allowedReasonCodes = allowedReasonCodes.filter(rc => allowedCodes.has(rc.code))
  }
  
  return {
    isAllowed: isRejectionAllowed,
    // Reason code is ALWAYS mandatory (system-level requirement)
    isReasonMandatory: true,
    // Remarks mandatory comes from stage config (configurable per stage)
    isRemarksMandatory: stageRejectionConfig?.isRemarksMandatory ?? false,
    maxRemarksLength: stageRejectionConfig?.maxRemarksLength ?? 2000,
    allowedReasonCodes,
    allowedActions: getDefaultRejectionActions(),
  }
}

/**
 * Build workflow progress information
 */
function buildWorkflowProgress(
  entity: WorkflowEntity,
  config: IWorkflowConfiguration,
  currentStage: IWorkflowStage | null
): WorkflowProgress {
  const sortedStages = [...config.stages].sort((a, b) => a.order - b.order)
  const totalStages = sortedStages.length
  const currentStageOrder = currentStage 
    ? sortedStages.findIndex(s => s.stageKey === currentStage.stageKey) + 1
    : 0
  const completedStages = currentStageOrder > 0 ? currentStageOrder - 1 : 0
  
  const workflowState = determineWorkflowState(entity)
  
  const stages: StageInfo[] = sortedStages.map((stage, index) => {
    let status: 'COMPLETED' | 'CURRENT' | 'PENDING' | 'SKIPPED'
    
    if (workflowState === 'COMPLETED') {
      status = 'COMPLETED'
    } else if (workflowState === 'REJECTED') {
      status = index < currentStageOrder - 1 ? 'COMPLETED' : 
               index === currentStageOrder - 1 ? 'CURRENT' : 'PENDING'
    } else {
      status = index < currentStageOrder - 1 ? 'COMPLETED' :
               index === currentStageOrder - 1 ? 'CURRENT' : 'PENDING'
    }
    
    return {
      stageKey: stage.stageKey,
      stageName: stage.stageName,
      order: stage.order,
      status,
      allowedRoles: stage.allowedRoles,
      isTerminal: stage.isTerminal,
    }
  })
  
  const percentComplete = workflowState === 'COMPLETED' 
    ? 100 
    : totalStages > 0 
      ? Math.round((completedStages / totalStages) * 100)
      : 0
  
  return {
    totalStages,
    currentStageOrder,
    completedStages,
    percentComplete,
    stages,
  }
}

/**
 * Generate informational messages for UI
 */
function generateMessages(
  entity: WorkflowEntity,
  config: IWorkflowConfiguration,
  currentStage: IWorkflowStage | null,
  userContext: UIRulesUserContext,
  workflowState: string
): {
  informational: string | null
  status: string | null
  nextActionHint: string | null
} {
  // Status message
  let status: string | null = null
  switch (workflowState) {
    case 'COMPLETED':
      status = 'This entity has been fully approved'
      break
    case 'REJECTED':
      status = 'This entity has been rejected'
      break
    case 'IN_WORKFLOW':
      status = currentStage 
        ? `Pending ${currentStage.stageName}`
        : 'In approval workflow'
      break
    case 'NOT_IN_WORKFLOW':
      status = 'Not yet submitted for approval'
      break
  }
  
  // Informational message
  let informational: string | null = null
  if (workflowState === 'IN_WORKFLOW' && currentStage) {
    if (currentStage.allowedRoles.includes(userContext.userRole)) {
      informational = `You can approve or reject this entity as ${userContext.userRole}`
    } else {
      informational = `Waiting for ${currentStage.allowedRoles.join(' or ')} to take action`
    }
  }
  
  // Next action hint
  let nextActionHint: string | null = null
  if (workflowState === 'REJECTED') {
    nextActionHint = 'Edit the entity and resubmit for approval'
  } else if (workflowState === 'IN_WORKFLOW' && currentStage) {
    const isRoleAllowed = currentStage.allowedRoles.includes(userContext.userRole)
    if (isRoleAllowed) {
      const sortedStages = [...config.stages].sort((a, b) => a.order - b.order)
      const currentIndex = sortedStages.findIndex(s => s.stageKey === currentStage.stageKey)
      const nextStage = currentIndex < sortedStages.length - 1 
        ? sortedStages[currentIndex + 1] 
        : null
      
      if (nextStage) {
        nextActionHint = `Approve to move to ${nextStage.stageName}, or reject with a reason`
      } else {
        nextActionHint = 'Approve to complete the workflow, or reject with a reason'
      }
    }
  }
  
  return { informational, status, nextActionHint }
}

/**
 * Build response when entity is not found
 */
function buildNotFoundResponse(
  entityType: string,
  entityId: string,
  userContext: UIRulesUserContext,
  evaluatedAt: string
): UIRulesResponse {
  const noPermissions: AllowedActions = {
    canApprove: { allowed: false, reason: 'Entity not found' },
    canReject: { allowed: false, reason: 'Entity not found' },
    canResubmit: { allowed: false, reason: 'Entity not found' },
    canCancel: { allowed: false, reason: 'Entity not found' },
    canView: { allowed: false, reason: 'Entity not found' },
    canEdit: { allowed: false, reason: 'Entity not found' },
  }
  
  return {
    entityId,
    entityType,
    entityStatus: 'NOT_FOUND',
    workflowState: 'NOT_IN_WORKFLOW',
    currentStage: null,
    currentStageName: null,
    allowedActions: noPermissions,
    rejectionConfig: {
      isAllowed: false,
      isReasonMandatory: true,
      isRemarksMandatory: false,
      maxRemarksLength: 2000,
      allowedReasonCodes: [],
      allowedActions: [],
    },
    workflowProgress: null,
    informationalMessage: 'Entity not found',
    statusMessage: 'Entity not found or access denied',
    nextActionHint: null,
    userRoleInfo: {
      currentRole: userContext.userRole,
      isAllowedAtCurrentStage: false,
      allowedRolesAtCurrentStage: [],
    },
    evaluatedAt,
    workflowConfigId: null,
    workflowConfigVersion: null,
  }
}

/**
 * Build response when no workflow config exists
 */
function buildNoWorkflowConfigResponse(
  entity: WorkflowEntity,
  userContext: UIRulesUserContext,
  evaluatedAt: string
): UIRulesResponse {
  return {
    entityId: entity.id,
    entityType: entity.entityType,
    entityStatus: entity.status,
    workflowState: 'NO_WORKFLOW_CONFIG',
    currentStage: null,
    currentStageName: null,
    allowedActions: {
      canApprove: { allowed: false, reason: 'No workflow configured for this entity type' },
      canReject: { allowed: false, reason: 'No workflow configured for this entity type' },
      canResubmit: { allowed: false, reason: 'No workflow configured for this entity type' },
      canCancel: { allowed: true, reason: 'You can cancel this entity' },
      canView: { allowed: true, reason: 'You can view this entity' },
      canEdit: { allowed: true, reason: 'You can edit this entity' },
    },
    rejectionConfig: {
      isAllowed: false,
      isReasonMandatory: true,
      isRemarksMandatory: false,
      maxRemarksLength: 2000,
      allowedReasonCodes: [],
      allowedActions: [],
    },
    workflowProgress: null,
    informationalMessage: 'No approval workflow is configured for this entity type',
    statusMessage: 'No workflow configured',
    nextActionHint: 'Contact administrator to configure workflow',
    userRoleInfo: {
      currentRole: userContext.userRole,
      isAllowedAtCurrentStage: false,
      allowedRolesAtCurrentStage: [],
    },
    evaluatedAt,
    workflowConfigId: null,
    workflowConfigVersion: null,
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  evaluateUIRules,
  getDefaultReasonCodes,
  getDefaultRejectionActions,
}
