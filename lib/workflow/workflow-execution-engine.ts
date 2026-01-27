/**
 * Workflow Execution Engine
 * 
 * Generic, configuration-driven workflow engine for approvals and rejections.
 * Works identically for Order, GRN, Invoice, and any future entity types.
 * 
 * Key principles:
 * - Never hardcode roles or stage names
 * - All rules come from workflow configuration
 * - Entity-agnostic through repository abstraction
 * - Complete audit trail for all actions
 * 
 * @module lib/workflow/workflow-execution-engine
 */

import connectDB from '../db/mongodb'
import WorkflowConfiguration, { 
  IWorkflowConfiguration, 
  IWorkflowStage,
  IStageRejectionConfig,
  WorkflowEntityType,
  WORKFLOW_ENTITY_TYPES,
  getEffectiveRejectionConfig,
  SYSTEM_DEFAULT_REJECTION_CONFIG,
} from '../models/WorkflowConfiguration'
import WorkflowRejection, { 
  REJECTION_ACTIONS,
  RejectionAction,
} from '../models/WorkflowRejection'
import WorkflowApprovalAudit, { 
  APPROVAL_ACTIONS,
  ApprovalAction,
} from '../models/WorkflowApprovalAudit'
import { 
  getEntityRepository, 
  WorkflowEntity,
  EntityWorkflowUpdate,
} from './entity-repository'

// =============================================================================
// ERROR CODES
// =============================================================================

export const WORKFLOW_ERROR_CODES = {
  // Entity errors
  ENTITY_NOT_FOUND: 'WF_E001',
  ENTITY_UPDATE_FAILED: 'WF_E002',
  
  // Workflow configuration errors
  WORKFLOW_NOT_FOUND: 'WF_E010',
  WORKFLOW_INACTIVE: 'WF_E011',
  WORKFLOW_INVALID: 'WF_E012',
  
  // Stage errors
  STAGE_NOT_FOUND: 'WF_E020',
  STAGE_MISMATCH: 'WF_E021',
  NO_CURRENT_STAGE: 'WF_E022',
  
  // Permission errors
  ROLE_NOT_ALLOWED: 'WF_E030',
  APPROVE_NOT_ALLOWED: 'WF_E031',
  REJECT_NOT_ALLOWED: 'WF_E032',
  
  // State errors
  ALREADY_APPROVED: 'WF_E040',
  ALREADY_REJECTED: 'WF_E041',
  INVALID_STATE: 'WF_E042',
  
  // Audit errors
  AUDIT_FAILED: 'WF_E050',
  
  // Generic
  UNKNOWN_ERROR: 'WF_E999',
} as const

export type WorkflowErrorCode = typeof WORKFLOW_ERROR_CODES[keyof typeof WORKFLOW_ERROR_CODES]

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

/**
 * Input for approve action
 */
export interface ApproveEntityInput {
  companyId: string
  entityType: WorkflowEntityType
  entityId: string
  userId: string
  userRole: string
  userName?: string
  remarks?: string
  metadata?: {
    source?: 'WEB' | 'API' | 'MOBILE' | 'SYSTEM'
    clientIp?: string
    correlationId?: string
    [key: string]: any
  }
}

/**
 * Input for reject action
 */
export interface RejectEntityInput {
  companyId: string
  entityType: WorkflowEntityType
  entityId: string
  userId: string
  userRole: string
  userName?: string
  reasonCode: string
  reasonLabel?: string
  remarks?: string
  action?: RejectionAction
  metadata?: {
    source?: 'WEB' | 'API' | 'MOBILE' | 'SYSTEM'
    clientIp?: string
    correlationId?: string
    [key: string]: any
  }
}

/**
 * Common result type for workflow operations
 */
export interface WorkflowResult<T = any> {
  success: boolean
  errorCode?: WorkflowErrorCode
  errorMessage?: string
  data?: T
}

/**
 * Approve action result data
 */
export interface ApproveResultData {
  entityId: string
  previousStage: string
  previousStatus: string
  newStage: string | null
  newStatus: string
  isTerminal: boolean
  auditId: string
}

/**
 * Reject action result data
 */
export interface RejectResultData {
  entityId: string
  previousStage: string
  previousStatus: string
  newStatus: string
  rejectionId: string
  // NEW: Rejection behavior details (for caller/notification)
  isTerminal: boolean
  rejectionConfig: IStageRejectionConfig
  notifyRoles: string[]
  visibleToRoles: string[]
  resubmissionStrategy: string
  allowResubmission: boolean
}

/**
 * Stage validation result
 */
interface StageValidation {
  valid: boolean
  stage?: IWorkflowStage
  config?: IWorkflowConfiguration
  errorCode?: WorkflowErrorCode
  errorMessage?: string
}

// =============================================================================
// WORKFLOW ENGINE CLASS
// =============================================================================

class WorkflowExecutionEngine {
  
  // ---------------------------------------------------------------------------
  // CORE: APPROVE ENTITY
  // ---------------------------------------------------------------------------
  
  /**
   * Approve an entity at the current workflow stage
   * 
   * Flow:
   * 1. Validate entity exists
   * 2. Load workflow configuration
   * 3. Resolve current stage
   * 4. Validate user can approve at this stage
   * 5. Determine next stage or terminal state
   * 6. Update entity state
   * 7. Create audit record
   * 8. Return result (caller handles notification)
   */
  async approveEntity(
    input: ApproveEntityInput
  ): Promise<WorkflowResult<ApproveResultData>> {
    await connectDB()
    
    try {
      // Step 1: Get entity
      const repository = getEntityRepository(input.entityType)
      const entity = await repository.findById(input.entityId)
      
      if (!entity) {
        return this.error(
          WORKFLOW_ERROR_CODES.ENTITY_NOT_FOUND,
          `${input.entityType} with ID ${input.entityId} not found`
        )
      }
      
      // Validate entity belongs to the company
      if (entity.companyId !== input.companyId) {
        return this.error(
          WORKFLOW_ERROR_CODES.ENTITY_NOT_FOUND,
          `${input.entityType} does not belong to company ${input.companyId}`
        )
      }
      
      // Step 2-4: Validate stage and permissions
      const validation = await this.validateApprovalPermission(
        input.companyId,
        input.entityType,
        entity,
        input.userRole
      )
      
      if (!validation.valid) {
        return this.error(validation.errorCode!, validation.errorMessage!)
      }
      
      const config = validation.config!
      const currentStage = validation.stage!
      
      // Step 5: Determine next stage
      const nextStage = this.getNextStage(config, currentStage.stageKey)
      const isTerminal = currentStage.isTerminal || nextStage === null
      
      // Determine new status
      let newStatus: string
      if (isTerminal) {
        newStatus = config.statusOnApproval?.[currentStage.stageKey] || 'APPROVED'
      } else {
        newStatus = config.statusOnApproval?.[currentStage.stageKey] || 
                    `PENDING_${nextStage!.stageKey}`
      }
      
      // Build stage-specific approval fields
      const stageApprovalFields = this.buildApprovalFields(
        currentStage.stageKey,
        input.userId,
        input.userRole
      )
      
      // Step 6: Update entity
      const update: EntityWorkflowUpdate = {
        status: newStatus,
        currentStage: isTerminal ? null : nextStage!.stageKey,
        workflowConfigId: config.id,
        workflowConfigVersion: config.version,
        stageApprovalFields,
      }
      
      const updatedEntity = await repository.updateWorkflowState(input.entityId, update)
      
      if (!updatedEntity) {
        return this.error(
          WORKFLOW_ERROR_CODES.ENTITY_UPDATE_FAILED,
          `Failed to update ${input.entityType} ${input.entityId}`
        )
      }
      
      // Step 7: Create audit record
      const auditId = await this.createApprovalAudit({
        companyId: input.companyId,
        entityType: input.entityType,
        entityId: input.entityId,
        workflowConfigId: config.id,
        workflowVersion: config.version,
        fromStage: currentStage.stageKey,
        toStage: isTerminal ? null : nextStage!.stageKey,
        action: APPROVAL_ACTIONS.APPROVE,
        approvedBy: input.userId,
        approvedByRole: input.userRole,
        approvedByName: input.userName,
        previousStatus: entity.status,
        newStatus,
        entitySnapshot: repository.getEntitySnapshot(entity),
        metadata: {
          ...input.metadata,
          remarks: input.remarks,
        },
      })
      
      // Step 8: Return result
      return {
        success: true,
        data: {
          entityId: input.entityId,
          previousStage: currentStage.stageKey,
          previousStatus: entity.status,
          newStage: isTerminal ? null : nextStage!.stageKey,
          newStatus,
          isTerminal,
          auditId,
        },
      }
      
    } catch (error: any) {
      console.error('[WORKFLOW-ENGINE] Approve error:', error)
      return this.error(
        WORKFLOW_ERROR_CODES.UNKNOWN_ERROR,
        error.message || 'Unknown error during approval'
      )
    }
  }
  
  // ---------------------------------------------------------------------------
  // CORE: REJECT ENTITY
  // ---------------------------------------------------------------------------
  
  /**
   * Reject an entity at the current workflow stage
   * 
   * Flow:
   * 1. Validate entity exists
   * 2. Load workflow configuration
   * 3. Resolve current stage
   * 4. Validate user can reject at this stage
   * 5. Get rejection configuration (stage-specific or defaults)
   * 6. Validate input against rejection config (remarks mandatory, etc.)
   * 7. Update entity status based on rejection config
   * 8. Create rejection record
   * 9. Return result with full rejection context (for notifications)
   * 
   * CONFIGURATION-DRIVEN BEHAVIOR:
   * - All rejection behavior comes from IStageRejectionConfig
   * - No hardcoded roles, statuses, or stage names
   * - Caller uses returned config to drive notifications and visibility
   */
  async rejectEntity(
    input: RejectEntityInput
  ): Promise<WorkflowResult<RejectResultData>> {
    await connectDB()
    
    try {
      // Step 1: Get entity
      const repository = getEntityRepository(input.entityType)
      const entity = await repository.findById(input.entityId)
      
      if (!entity) {
        return this.error(
          WORKFLOW_ERROR_CODES.ENTITY_NOT_FOUND,
          `${input.entityType} with ID ${input.entityId} not found`
        )
      }
      
      // Validate entity belongs to the company
      if (entity.companyId !== input.companyId) {
        return this.error(
          WORKFLOW_ERROR_CODES.ENTITY_NOT_FOUND,
          `${input.entityType} does not belong to company ${input.companyId}`
        )
      }
      
      // Step 2-4: Validate stage and permissions
      const validation = await this.validateRejectionPermission(
        input.companyId,
        input.entityType,
        entity,
        input.userRole
      )
      
      if (!validation.valid) {
        return this.error(validation.errorCode!, validation.errorMessage!)
      }
      
      const config = validation.config // May be undefined for fallback mode
      const currentStage = validation.stage!
      
      // Step 5: Get rejection configuration (CONFIGURATION-DRIVEN)
      // Merge: System defaults -> Global workflow config -> Stage-specific config
      const rejectionConfig = config 
        ? getEffectiveRejectionConfig(config, currentStage.stageKey)
        : { ...SYSTEM_DEFAULT_REJECTION_CONFIG }
      
      // Step 6: Validate input against rejection config
      // Reason code is always mandatory (enforced at system level)
      if (!input.reasonCode || input.reasonCode.trim() === '') {
        return this.error(
          WORKFLOW_ERROR_CODES.INVALID_STATE,
          'Rejection reason code is required'
        )
      }
      
      // Check remarks if mandatory per configuration
      if (rejectionConfig.isRemarksMandatory && (!input.remarks || input.remarks.trim() === '')) {
        return this.error(
          WORKFLOW_ERROR_CODES.INVALID_STATE,
          `Rejection remarks are required at stage "${currentStage.stageName}"`
        )
      }
      
      // Validate remarks length if provided
      if (input.remarks && rejectionConfig.maxRemarksLength && 
          input.remarks.length > rejectionConfig.maxRemarksLength) {
        return this.error(
          WORKFLOW_ERROR_CODES.INVALID_STATE,
          `Rejection remarks exceed maximum length of ${rejectionConfig.maxRemarksLength} characters`
        )
      }
      
      // Validate reason code if restricted
      if (rejectionConfig.allowedReasonCodes && rejectionConfig.allowedReasonCodes.length > 0 &&
          !rejectionConfig.allowedReasonCodes.includes(input.reasonCode)) {
        return this.error(
          WORKFLOW_ERROR_CODES.INVALID_STATE,
          `Reason code "${input.reasonCode}" is not allowed at this stage. Allowed: ${rejectionConfig.allowedReasonCodes.join(', ')}`
        )
      }
      
      // Step 7: Determine rejection status (CONFIGURATION-DRIVEN)
      // Priority: Stage rejection config -> Workflow statusOnRejection -> Default
      let newStatus: string
      if (rejectionConfig.rejectedStatus) {
        newStatus = rejectionConfig.rejectedStatus
      } else if (config?.statusOnRejection?.[currentStage.stageKey]) {
        newStatus = config.statusOnRejection[currentStage.stageKey]
      } else {
        newStatus = 'REJECTED'
      }
      
      // Determine if this is a terminal rejection (workflow ends)
      const isTerminal = rejectionConfig.isTerminalOnReject
      
      // Update entity
      const update: EntityWorkflowUpdate = {
        status: newStatus,
        currentStage: isTerminal ? null : entity.currentStage, // Clear stage only if terminal
        workflowConfigId: config?.id,
        workflowConfigVersion: config?.version,
      }
      
      const updatedEntity = await repository.updateWorkflowState(input.entityId, update)
      
      if (!updatedEntity) {
        return this.error(
          WORKFLOW_ERROR_CODES.ENTITY_UPDATE_FAILED,
          `Failed to update ${input.entityType} ${input.entityId}`
        )
      }
      
      // Step 8: Create rejection record with full context
      const rejectionId = await this.createRejectionRecord({
        companyId: input.companyId,
        entityType: input.entityType,
        entityId: input.entityId,
        workflowConfigId: config?.id || 'NO_WORKFLOW',
        workflowVersion: config?.version || 0,
        workflowStage: currentStage.stageKey,
        action: input.action || REJECTION_ACTIONS.REJECT,
        reasonCode: input.reasonCode,
        reasonLabel: input.reasonLabel,
        remarks: input.remarks,
        rejectedBy: input.userId,
        rejectedByRole: input.userRole,
        rejectedByName: input.userName,
        previousStatus: entity.status,
        previousStage: currentStage.stageKey,
        newStatus,
        entitySnapshot: repository.getEntitySnapshot(entity),
        metadata: {
          ...input.metadata,
          // Include rejection config in metadata for audit trail
          rejectionConfig: {
            isTerminalOnReject: rejectionConfig.isTerminalOnReject,
            isRemarksMandatory: rejectionConfig.isRemarksMandatory,
            resubmissionStrategy: rejectionConfig.resubmissionStrategy,
          },
        },
      })
      
      // Step 9: Return result with full rejection context
      // Caller uses this to drive notifications and visibility
      return {
        success: true,
        data: {
          entityId: input.entityId,
          previousStage: currentStage.stageKey,
          previousStatus: entity.status,
          newStatus,
          rejectionId,
          // NEW: Full rejection context for callers
          isTerminal,
          rejectionConfig,
          notifyRoles: rejectionConfig.notifyRolesOnReject,
          visibleToRoles: rejectionConfig.visibleToRolesAfterReject,
          resubmissionStrategy: rejectionConfig.resubmissionStrategy,
          allowResubmission: rejectionConfig.allowResubmission,
        },
      }
      
    } catch (error: any) {
      console.error('[WORKFLOW-ENGINE] Reject error:', error)
      return this.error(
        WORKFLOW_ERROR_CODES.UNKNOWN_ERROR,
        error.message || 'Unknown error during rejection'
      )
    }
  }
  
  // ---------------------------------------------------------------------------
  // VALIDATION HELPERS
  // ---------------------------------------------------------------------------
  
  /**
   * Validate approval permission at current stage
   */
  private async validateApprovalPermission(
    companyId: string,
    entityType: WorkflowEntityType,
    entity: WorkflowEntity,
    userRole: string
  ): Promise<StageValidation> {
    // Load workflow configuration
    const config = await this.getActiveWorkflow(companyId, entityType)
    
    if (!config) {
      return {
        valid: false,
        errorCode: WORKFLOW_ERROR_CODES.WORKFLOW_NOT_FOUND,
        errorMessage: `No active workflow found for ${entityType} in company ${companyId}`,
      }
    }
    
    if (!config.isActive) {
      return {
        valid: false,
        errorCode: WORKFLOW_ERROR_CODES.WORKFLOW_INACTIVE,
        errorMessage: `Workflow for ${entityType} is currently inactive`,
      }
    }
    
    // Resolve current stage
    const currentStageKey = entity.currentStage
    
    if (!currentStageKey) {
      // Entity has no current stage - might be already processed or not yet in workflow
      // Try to determine initial stage from status
      const initialStage = this.getInitialStage(config)
      
      // Check if entity status suggests it's pending at initial stage
      if (entity.status?.includes('PENDING') || entity.status?.includes('AWAITING')) {
        return {
          valid: true,
          stage: initialStage,
          config,
        }
      }
      
      return {
        valid: false,
        errorCode: WORKFLOW_ERROR_CODES.NO_CURRENT_STAGE,
        errorMessage: `Entity has no current workflow stage. Status: ${entity.status}`,
      }
    }
    
    // Find stage in configuration
    const stage = config.stages.find(s => s.stageKey === currentStageKey)
    
    if (!stage) {
      return {
        valid: false,
        errorCode: WORKFLOW_ERROR_CODES.STAGE_NOT_FOUND,
        errorMessage: `Stage ${currentStageKey} not found in workflow configuration`,
      }
    }
    
    // Check if stage allows approval
    if (!stage.canApprove) {
      return {
        valid: false,
        errorCode: WORKFLOW_ERROR_CODES.APPROVE_NOT_ALLOWED,
        errorMessage: `Stage ${currentStageKey} does not allow approval action`,
      }
    }
    
    // Check if user role is allowed at this stage
    if (!stage.allowedRoles.includes(userRole)) {
      return {
        valid: false,
        errorCode: WORKFLOW_ERROR_CODES.ROLE_NOT_ALLOWED,
        errorMessage: `Role ${userRole} is not allowed to approve at stage ${currentStageKey}. Allowed roles: ${stage.allowedRoles.join(', ')}`,
      }
    }
    
    return {
      valid: true,
      stage,
      config,
    }
  }
  
  /**
   * Validate rejection permission at current stage
   * Note: If no workflow config exists, allows rejection for backward compatibility
   */
  private async validateRejectionPermission(
    companyId: string,
    entityType: WorkflowEntityType,
    entity: WorkflowEntity,
    userRole: string
  ): Promise<StageValidation> {
    // Same initial validation as approval
    const config = await this.getActiveWorkflow(companyId, entityType)
    
    // BACKWARD COMPATIBILITY: If no workflow config, allow rejection for admin roles
    if (!config) {
      console.log(`[WORKFLOW-ENGINE] No workflow config for ${entityType} in company ${companyId}, using fallback`)
      
      // Allow rejection for known admin roles without workflow config
      const allowedRoles = ['COMPANY_ADMIN', 'LOCATION_ADMIN', 'SITE_ADMIN', 'ADMIN', 'SUPER_ADMIN']
      if (allowedRoles.includes(userRole)) {
        // Create a synthetic stage for the rejection
        const syntheticStage: IWorkflowStage = {
          stageKey: 'DIRECT_REJECTION',
          stageName: 'Direct Rejection (No Workflow)',
          order: 1,
          allowedRoles: allowedRoles,
          canApprove: true,
          canReject: true,
          isTerminal: false,
        }
        
        return {
          valid: true,
          stage: syntheticStage,
          config: undefined, // No config, will use defaults
        }
      }
      
      return {
        valid: false,
        errorCode: WORKFLOW_ERROR_CODES.WORKFLOW_NOT_FOUND,
        errorMessage: `No active workflow found for ${entityType} in company ${companyId}`,
      }
    }
    
    if (!config.isActive) {
      return {
        valid: false,
        errorCode: WORKFLOW_ERROR_CODES.WORKFLOW_INACTIVE,
        errorMessage: `Workflow for ${entityType} is currently inactive`,
      }
    }
    
    // Resolve current stage
    const currentStageKey = entity.currentStage
    
    if (!currentStageKey) {
      const initialStage = this.getInitialStage(config)
      
      if (entity.status?.includes('PENDING') || entity.status?.includes('AWAITING') || entity.status?.includes('RAISED')) {
        return {
          valid: true,
          stage: initialStage,
          config,
        }
      }
      
      return {
        valid: false,
        errorCode: WORKFLOW_ERROR_CODES.NO_CURRENT_STAGE,
        errorMessage: `Entity has no current workflow stage. Status: ${entity.status}`,
      }
    }
    
    const stage = config.stages.find(s => s.stageKey === currentStageKey)
    
    if (!stage) {
      return {
        valid: false,
        errorCode: WORKFLOW_ERROR_CODES.STAGE_NOT_FOUND,
        errorMessage: `Stage ${currentStageKey} not found in workflow configuration`,
      }
    }
    
    // Check if stage allows rejection
    if (!stage.canReject) {
      return {
        valid: false,
        errorCode: WORKFLOW_ERROR_CODES.REJECT_NOT_ALLOWED,
        errorMessage: `Stage ${currentStageKey} does not allow rejection action`,
      }
    }
    
    // Check if user role is allowed at this stage
    if (!stage.allowedRoles.includes(userRole)) {
      return {
        valid: false,
        errorCode: WORKFLOW_ERROR_CODES.ROLE_NOT_ALLOWED,
        errorMessage: `Role ${userRole} is not allowed to reject at stage ${currentStageKey}. Allowed roles: ${stage.allowedRoles.join(', ')}`,
      }
    }
    
    return {
      valid: true,
      stage,
      config,
    }
  }
  
  // ---------------------------------------------------------------------------
  // STAGE RESOLUTION HELPERS
  // ---------------------------------------------------------------------------
  
  /**
   * Get active workflow configuration
   */
  private async getActiveWorkflow(
    companyId: string,
    entityType: WorkflowEntityType
  ): Promise<IWorkflowConfiguration | null> {
    return WorkflowConfiguration.findOne({
      companyId,
      entityType,
      isActive: true,
    }).lean() as Promise<IWorkflowConfiguration | null>
  }
  
  /**
   * Get initial stage of workflow
   */
  private getInitialStage(config: IWorkflowConfiguration): IWorkflowStage {
    const sortedStages = [...config.stages].sort((a, b) => a.order - b.order)
    return sortedStages[0]
  }
  
  /**
   * Get next stage after current stage
   */
  private getNextStage(
    config: IWorkflowConfiguration,
    currentStageKey: string
  ): IWorkflowStage | null {
    const sortedStages = [...config.stages].sort((a, b) => a.order - b.order)
    const currentIndex = sortedStages.findIndex(s => s.stageKey === currentStageKey)
    
    if (currentIndex === -1 || currentIndex === sortedStages.length - 1) {
      return null
    }
    
    const nextStage = sortedStages[currentIndex + 1]
    
    // Skip optional stages if they should be skipped
    // (Future enhancement: check skip conditions)
    if (nextStage.isOptional) {
      // For now, include optional stages
      // Future: check autoApproveCondition or skip logic
    }
    
    return nextStage
  }
  
  // ---------------------------------------------------------------------------
  // AUDIT HELPERS
  // ---------------------------------------------------------------------------
  
  /**
   * Create approval audit record
   */
  private async createApprovalAudit(data: {
    companyId: string
    entityType: WorkflowEntityType
    entityId: string
    workflowConfigId: string
    workflowVersion: number
    fromStage: string
    toStage: string | null
    action: ApprovalAction
    approvedBy: string
    approvedByRole: string
    approvedByName?: string
    previousStatus: string
    newStatus: string
    entitySnapshot?: Record<string, any>
    metadata?: Record<string, any>
  }): Promise<string> {
    const auditId = `APR-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`.toUpperCase()
    
    const audit = new WorkflowApprovalAudit({
      id: auditId,
      companyId: data.companyId,
      entityType: data.entityType,
      entityId: data.entityId,
      workflowConfigId: data.workflowConfigId,
      workflowVersion: data.workflowVersion,
      fromStage: data.fromStage,
      toStage: data.toStage,
      action: data.action,
      approvedBy: data.approvedBy,
      approvedByRole: data.approvedByRole,
      approvedByName: data.approvedByName,
      previousStatus: data.previousStatus,
      newStatus: data.newStatus,
      approvedAt: new Date(),
      entitySnapshot: data.entitySnapshot,
      metadata: data.metadata,
    })
    
    await audit.save()
    return auditId
  }
  
  /**
   * Create rejection record
   */
  private async createRejectionRecord(data: {
    companyId: string
    entityType: WorkflowEntityType
    entityId: string
    workflowConfigId: string
    workflowVersion: number
    workflowStage: string
    action: RejectionAction
    reasonCode: string
    reasonLabel?: string
    remarks?: string
    rejectedBy: string
    rejectedByRole: string
    rejectedByName?: string
    previousStatus: string
    previousStage: string
    newStatus: string
    entitySnapshot?: Record<string, any>
    metadata?: Record<string, any>
  }): Promise<string> {
    const rejectionId = `REJ-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`.toUpperCase()
    
    const rejection = new WorkflowRejection({
      id: rejectionId,
      companyId: data.companyId,
      entityType: data.entityType,
      entityId: data.entityId,
      workflowConfigId: data.workflowConfigId,
      workflowStage: data.workflowStage,
      workflowVersion: data.workflowVersion,
      action: data.action,
      reasonCode: data.reasonCode,
      reasonLabel: data.reasonLabel,
      remarks: data.remarks,
      rejectedBy: data.rejectedBy,
      rejectedByRole: data.rejectedByRole,
      rejectedByName: data.rejectedByName,
      previousStatus: data.previousStatus,
      previousStage: data.previousStage,
      newStatus: data.newStatus,
      rejectedAt: new Date(),
      entitySnapshot: data.entitySnapshot,
      metadata: data.metadata,
      isResolved: false,
    })
    
    await rejection.save()
    return rejectionId
  }
  
  /**
   * Build stage-specific approval fields for entity update
   */
  private buildApprovalFields(
    stageKey: string,
    userId: string,
    userRole: string
  ): Record<string, any> {
    const now = new Date()
    const fields: Record<string, any> = {}
    
    // Map stage keys to entity-specific approval fields
    // This handles backward compatibility with existing entity schemas
    
    if (stageKey === 'LOCATION_APPROVAL' || stageKey === 'SITE_ADMIN_APPROVAL') {
      fields.site_admin_approved_by = userId
      fields.site_admin_approved_at = now
    }
    
    if (stageKey === 'COMPANY_APPROVAL') {
      fields.company_admin_approved_by = userId
      fields.company_admin_approved_at = now
    }
    
    if (stageKey === 'GRN_COMPANY_APPROVAL') {
      fields.approvedBy = userId
      fields.approvedAt = now
      fields.grnAcknowledgedByCompany = true
      fields.grnAcknowledgedBy = userId
      fields.grnAcknowledgedDate = now
    }
    
    if (stageKey === 'INVOICE_COMPANY_APPROVAL' || stageKey === 'INVOICE_FINANCE_APPROVAL') {
      fields.approvedBy = userId
      fields.approvedAt = now
    }
    
    return fields
  }
  
  // ---------------------------------------------------------------------------
  // ERROR HELPER
  // ---------------------------------------------------------------------------
  
  private error<T>(
    errorCode: WorkflowErrorCode,
    errorMessage: string
  ): WorkflowResult<T> {
    return {
      success: false,
      errorCode,
      errorMessage,
    }
  }
  
  // ---------------------------------------------------------------------------
  // UTILITY METHODS
  // ---------------------------------------------------------------------------
  
  /**
   * Check if user can approve entity at current stage
   */
  async canUserApprove(
    companyId: string,
    entityType: WorkflowEntityType,
    entityId: string,
    userRole: string
  ): Promise<{ canApprove: boolean; reason?: string }> {
    const repository = getEntityRepository(entityType)
    const entity = await repository.findById(entityId)
    
    if (!entity) {
      return { canApprove: false, reason: 'Entity not found' }
    }
    
    const validation = await this.validateApprovalPermission(
      companyId,
      entityType,
      entity,
      userRole
    )
    
    return {
      canApprove: validation.valid,
      reason: validation.errorMessage,
    }
  }
  
  /**
   * Check if user can reject entity at current stage
   */
  async canUserReject(
    companyId: string,
    entityType: WorkflowEntityType,
    entityId: string,
    userRole: string
  ): Promise<{ canReject: boolean; reason?: string }> {
    const repository = getEntityRepository(entityType)
    const entity = await repository.findById(entityId)
    
    if (!entity) {
      return { canReject: false, reason: 'Entity not found' }
    }
    
    const validation = await this.validateRejectionPermission(
      companyId,
      entityType,
      entity,
      userRole
    )
    
    return {
      canReject: validation.valid,
      reason: validation.errorMessage,
    }
  }
  
  /**
   * Get current workflow state for an entity
   */
  async getWorkflowState(
    companyId: string,
    entityType: WorkflowEntityType,
    entityId: string
  ): Promise<{
    entity: WorkflowEntity | null
    config: IWorkflowConfiguration | null
    currentStage: IWorkflowStage | null
    nextStage: IWorkflowStage | null
    isTerminal: boolean
  }> {
    const repository = getEntityRepository(entityType)
    const entity = await repository.findById(entityId)
    
    if (!entity) {
      return {
        entity: null,
        config: null,
        currentStage: null,
        nextStage: null,
        isTerminal: false,
      }
    }
    
    const config = await this.getActiveWorkflow(companyId, entityType)
    
    if (!config) {
      return {
        entity,
        config: null,
        currentStage: null,
        nextStage: null,
        isTerminal: false,
      }
    }
    
    const currentStage = entity.currentStage
      ? config.stages.find(s => s.stageKey === entity.currentStage) || null
      : this.getInitialStage(config)
    
    const nextStage = currentStage
      ? this.getNextStage(config, currentStage.stageKey)
      : null
    
    const isTerminal = currentStage?.isTerminal || false
    
    return {
      entity,
      config,
      currentStage,
      nextStage,
      isTerminal,
    }
  }
  
  /**
   * Initialize entity into workflow (set initial stage)
   */
  async initializeWorkflow(
    companyId: string,
    entityType: WorkflowEntityType,
    entityId: string
  ): Promise<WorkflowResult<{ initialStage: string; initialStatus: string }>> {
    await connectDB()
    
    try {
      const config = await this.getActiveWorkflow(companyId, entityType)
      
      if (!config) {
        return this.error(
          WORKFLOW_ERROR_CODES.WORKFLOW_NOT_FOUND,
          `No active workflow found for ${entityType}`
        )
      }
      
      const initialStage = this.getInitialStage(config)
      const initialStatus = config.statusOnSubmission || `PENDING_${initialStage.stageKey}`
      
      const repository = getEntityRepository(entityType)
      
      const update: EntityWorkflowUpdate = {
        status: initialStatus,
        currentStage: initialStage.stageKey,
        workflowConfigId: config.id,
        workflowConfigVersion: config.version,
      }
      
      const updated = await repository.updateWorkflowState(entityId, update)
      
      if (!updated) {
        return this.error(
          WORKFLOW_ERROR_CODES.ENTITY_UPDATE_FAILED,
          `Failed to initialize workflow for ${entityId}`
        )
      }
      
      return {
        success: true,
        data: {
          initialStage: initialStage.stageKey,
          initialStatus,
        },
      }
    } catch (error: any) {
      return this.error(
        WORKFLOW_ERROR_CODES.UNKNOWN_ERROR,
        error.message
      )
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

const workflowEngine = new WorkflowExecutionEngine()

// =============================================================================
// EXPORTS
// =============================================================================

export {
  WorkflowExecutionEngine,
  workflowEngine,
}

// Convenience functions that use the singleton
export const approveEntity = (input: ApproveEntityInput) => workflowEngine.approveEntity(input)
export const rejectEntity = (input: RejectEntityInput) => workflowEngine.rejectEntity(input)
export const canUserApprove = (
  companyId: string,
  entityType: WorkflowEntityType,
  entityId: string,
  userRole: string
) => workflowEngine.canUserApprove(companyId, entityType, entityId, userRole)
export const canUserReject = (
  companyId: string,
  entityType: WorkflowEntityType,
  entityId: string,
  userRole: string
) => workflowEngine.canUserReject(companyId, entityType, entityId, userRole)
export const getWorkflowState = (
  companyId: string,
  entityType: WorkflowEntityType,
  entityId: string
) => workflowEngine.getWorkflowState(companyId, entityType, entityId)
export const initializeWorkflow = (
  companyId: string,
  entityType: WorkflowEntityType,
  entityId: string
) => workflowEngine.initializeWorkflow(companyId, entityType, entityId)
