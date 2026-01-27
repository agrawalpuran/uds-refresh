/**
 * Workflow Rejection Service
 * 
 * Provides business logic for the configuration-driven rejection framework.
 * This service is entity-agnostic and works with any workflow-enabled entity.
 * 
 * @module lib/services/workflow-rejection-service
 * @version 1.0.0
 */

import connectDB from '../db/mongodb'
import WorkflowConfiguration, { 
  IWorkflowConfiguration, 
  IWorkflowStage,
  WorkflowEntityType,
  WORKFLOW_ENTITY_TYPES,
  WORKFLOW_STAGE_KEYS,
  WORKFLOW_ROLES
} from '../models/WorkflowConfiguration'
import WorkflowRejection, { 
  IWorkflowRejection, 
  RejectionAction,
  REJECTION_ACTIONS,
  REJECTION_REASON_CODES 
} from '../models/WorkflowRejection'

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export interface RejectionInput {
  companyId: string
  entityType: WorkflowEntityType
  entityId: string
  workflowStage: string
  rejectedBy: string
  rejectedByRole: string
  rejectedByName?: string
  reasonCode: string
  reasonLabel?: string
  remarks?: string
  action?: RejectionAction
  previousStatus: string
  previousStage?: string
  entitySnapshot?: Record<string, any>
  metadata?: Record<string, any>
}

export interface ApprovalInput {
  companyId: string
  entityType: WorkflowEntityType
  entityId: string
  currentStage: string
  approvedBy: string
  approvedByRole: string
}

export interface WorkflowActionResult {
  success: boolean
  nextStage?: string | null
  newStatus?: string
  isTerminal?: boolean
  error?: string
  rejection?: IWorkflowRejection
}

export interface StageValidationResult {
  canAct: boolean
  canApprove: boolean
  canReject: boolean
  stage?: IWorkflowStage
  error?: string
}

// =============================================================================
// WORKFLOW CONFIGURATION SERVICE
// =============================================================================

/**
 * Get the active workflow configuration for a company and entity type
 */
export async function getActiveWorkflowConfig(
  companyId: string,
  entityType: WorkflowEntityType
): Promise<IWorkflowConfiguration | null> {
  await connectDB()
  
  const config = await WorkflowConfiguration.findOne({
    companyId,
    entityType,
    isActive: true
  }).lean() as IWorkflowConfiguration | null
  
  return config
}

/**
 * Get or create a default workflow configuration
 * Used when no custom workflow is configured for a company
 */
export async function getOrCreateDefaultWorkflow(
  companyId: string,
  entityType: WorkflowEntityType
): Promise<IWorkflowConfiguration> {
  await connectDB()
  
  // Try to find existing active config
  let config = await getActiveWorkflowConfig(companyId, entityType)
  if (config) return config
  
  // Try to find a default template
  const defaultConfig = await WorkflowConfiguration.findOne({
    entityType,
    isDefault: true
  }).lean() as IWorkflowConfiguration | null
  
  if (defaultConfig) {
    // Clone the default for this company
    const newConfig = new WorkflowConfiguration({
      ...defaultConfig,
      _id: undefined,
      id: `WFC-${companyId}-${entityType}-${Date.now()}`,
      companyId,
      isDefault: false,
      isActive: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    await newConfig.save()
    return newConfig.toObject() as IWorkflowConfiguration
  }
  
  // Create a basic default workflow
  const basicConfig = createBasicWorkflowConfig(companyId, entityType)
  const savedConfig = new WorkflowConfiguration(basicConfig)
  await savedConfig.save()
  return savedConfig.toObject() as IWorkflowConfiguration
}

/**
 * Create a basic workflow configuration for an entity type
 */
function createBasicWorkflowConfig(
  companyId: string,
  entityType: WorkflowEntityType
): Partial<IWorkflowConfiguration> {
  const baseConfig = {
    id: `WFC-${companyId}-${entityType}-${Date.now()}`,
    companyId,
    entityType,
    version: 1,
    isActive: true,
    isDefault: false,
  }
  
  switch (entityType) {
    case WORKFLOW_ENTITY_TYPES.ORDER:
      return {
        ...baseConfig,
        workflowName: 'Standard Order Approval',
        workflowDescription: 'Basic order approval workflow with company admin approval',
        stages: [
          {
            stageKey: WORKFLOW_STAGE_KEYS.COMPANY_APPROVAL,
            stageName: 'Company Admin Approval',
            allowedRoles: [WORKFLOW_ROLES.COMPANY_ADMIN],
            order: 1,
            canApprove: true,
            canReject: true,
            isTerminal: true,
          }
        ],
        statusOnSubmission: 'PENDING_APPROVAL',
        statusOnApproval: { [WORKFLOW_STAGE_KEYS.COMPANY_APPROVAL]: 'APPROVED' },
        statusOnRejection: { [WORKFLOW_STAGE_KEYS.COMPANY_APPROVAL]: 'REJECTED' },
      }
    
    case WORKFLOW_ENTITY_TYPES.GRN:
      return {
        ...baseConfig,
        workflowName: 'Standard GRN Approval',
        workflowDescription: 'Basic GRN approval workflow',
        stages: [
          {
            stageKey: WORKFLOW_STAGE_KEYS.GRN_COMPANY_APPROVAL,
            stageName: 'Company Admin GRN Approval',
            allowedRoles: [WORKFLOW_ROLES.COMPANY_ADMIN],
            order: 1,
            canApprove: true,
            canReject: true,
            isTerminal: true,
          }
        ],
        statusOnSubmission: 'RAISED',
        statusOnApproval: { [WORKFLOW_STAGE_KEYS.GRN_COMPANY_APPROVAL]: 'APPROVED' },
        statusOnRejection: { [WORKFLOW_STAGE_KEYS.GRN_COMPANY_APPROVAL]: 'REJECTED' },
      }
    
    case WORKFLOW_ENTITY_TYPES.INVOICE:
      return {
        ...baseConfig,
        workflowName: 'Standard Invoice Approval',
        workflowDescription: 'Basic invoice approval workflow',
        stages: [
          {
            stageKey: WORKFLOW_STAGE_KEYS.INVOICE_COMPANY_APPROVAL,
            stageName: 'Company Admin Invoice Approval',
            allowedRoles: [WORKFLOW_ROLES.COMPANY_ADMIN],
            order: 1,
            canApprove: true,
            canReject: true,
            isTerminal: true,
          }
        ],
        statusOnSubmission: 'RAISED',
        statusOnApproval: { [WORKFLOW_STAGE_KEYS.INVOICE_COMPANY_APPROVAL]: 'APPROVED' },
        statusOnRejection: { [WORKFLOW_STAGE_KEYS.INVOICE_COMPANY_APPROVAL]: 'REJECTED' },
      }
    
    default:
      return {
        ...baseConfig,
        workflowName: 'Basic Approval Workflow',
        stages: [
          {
            stageKey: WORKFLOW_STAGE_KEYS.FINAL_APPROVAL,
            stageName: 'Final Approval',
            allowedRoles: [WORKFLOW_ROLES.COMPANY_ADMIN],
            order: 1,
            canApprove: true,
            canReject: true,
            isTerminal: true,
          }
        ],
        statusOnSubmission: 'PENDING_APPROVAL',
        statusOnApproval: { [WORKFLOW_STAGE_KEYS.FINAL_APPROVAL]: 'APPROVED' },
        statusOnRejection: { [WORKFLOW_STAGE_KEYS.FINAL_APPROVAL]: 'REJECTED' },
      }
  }
}

// =============================================================================
// STAGE VALIDATION SERVICE
// =============================================================================

/**
 * Validate if a role can act at a specific stage
 */
export async function validateStageAction(
  companyId: string,
  entityType: WorkflowEntityType,
  stageKey: string,
  role: string
): Promise<StageValidationResult> {
  const config = await getActiveWorkflowConfig(companyId, entityType)
  
  if (!config) {
    return {
      canAct: false,
      canApprove: false,
      canReject: false,
      error: `No active workflow configuration found for ${entityType}`
    }
  }
  
  const stage = config.stages.find(s => s.stageKey === stageKey)
  
  if (!stage) {
    return {
      canAct: false,
      canApprove: false,
      canReject: false,
      error: `Stage ${stageKey} not found in workflow configuration`
    }
  }
  
  const canAct = stage.allowedRoles.includes(role)
  
  return {
    canAct,
    canApprove: canAct && stage.canApprove,
    canReject: canAct && stage.canReject,
    stage,
  }
}

/**
 * Get the next stage after the current stage
 */
export function getNextStage(
  config: IWorkflowConfiguration,
  currentStageKey: string
): IWorkflowStage | null {
  const sortedStages = [...config.stages].sort((a, b) => a.order - b.order)
  const currentIndex = sortedStages.findIndex(s => s.stageKey === currentStageKey)
  
  if (currentIndex === -1 || currentIndex === sortedStages.length - 1) {
    return null
  }
  
  // Skip optional stages if needed (future enhancement)
  return sortedStages[currentIndex + 1]
}

/**
 * Get the initial stage for a workflow
 */
export function getInitialStage(config: IWorkflowConfiguration): IWorkflowStage {
  const sortedStages = [...config.stages].sort((a, b) => a.order - b.order)
  return sortedStages[0]
}

// =============================================================================
// REJECTION SERVICE
// =============================================================================

/**
 * Create a rejection record
 */
export async function createRejection(
  input: RejectionInput
): Promise<WorkflowActionResult> {
  await connectDB()
  
  try {
    // Validate the rejection action is allowed at this stage
    const validation = await validateStageAction(
      input.companyId,
      input.entityType,
      input.workflowStage,
      input.rejectedByRole
    )
    
    if (!validation.canReject) {
      return {
        success: false,
        error: validation.error || `Role ${input.rejectedByRole} cannot reject at stage ${input.workflowStage}`
      }
    }
    
    // Get workflow config for status mapping
    const config = await getActiveWorkflowConfig(input.companyId, input.entityType)
    const newStatus = config?.statusOnRejection?.[input.workflowStage] || 'REJECTED'
    
    // Generate rejection ID
    const rejectionId = `REJ-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`.toUpperCase()
    
    // Create rejection record
    const rejection = new WorkflowRejection({
      id: rejectionId,
      companyId: input.companyId,
      entityType: input.entityType,
      entityId: input.entityId,
      workflowConfigId: config?.id,
      workflowStage: input.workflowStage,
      workflowVersion: config?.version,
      action: input.action || REJECTION_ACTIONS.REJECT,
      reasonCode: input.reasonCode,
      reasonLabel: input.reasonLabel,
      remarks: input.remarks,
      rejectedBy: input.rejectedBy,
      rejectedByRole: input.rejectedByRole,
      rejectedByName: input.rejectedByName,
      previousStatus: input.previousStatus,
      previousStage: input.previousStage,
      newStatus,
      entitySnapshot: input.entitySnapshot,
      metadata: input.metadata,
      rejectedAt: new Date(),
      isResolved: false,
    })
    
    await rejection.save()
    
    return {
      success: true,
      newStatus,
      rejection: rejection.toObject() as IWorkflowRejection,
    }
  } catch (error: any) {
    console.error('[WORKFLOW-REJECTION] Error creating rejection:', error.message)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Process an approval action
 */
export async function processApproval(
  input: ApprovalInput
): Promise<WorkflowActionResult> {
  await connectDB()
  
  try {
    // Validate the approval action is allowed at this stage
    const validation = await validateStageAction(
      input.companyId,
      input.entityType,
      input.currentStage,
      input.approvedByRole
    )
    
    if (!validation.canApprove) {
      return {
        success: false,
        error: validation.error || `Role ${input.approvedByRole} cannot approve at stage ${input.currentStage}`
      }
    }
    
    // Get workflow config
    const config = await getActiveWorkflowConfig(input.companyId, input.entityType)
    if (!config) {
      return {
        success: false,
        error: `No active workflow configuration found`
      }
    }
    
    const currentStage = validation.stage!
    const isTerminal = currentStage.isTerminal
    
    // Determine next stage and status
    let nextStage: IWorkflowStage | null = null
    let newStatus: string
    
    if (isTerminal) {
      // Final approval - use terminal status
      newStatus = config.statusOnApproval?.[input.currentStage] || 'APPROVED'
    } else {
      // Move to next stage
      nextStage = getNextStage(config, input.currentStage)
      newStatus = nextStage ? `PENDING_${nextStage.stageKey}` : 
                  (config.statusOnApproval?.[input.currentStage] || 'APPROVED')
    }
    
    return {
      success: true,
      nextStage: nextStage?.stageKey || null,
      newStatus,
      isTerminal,
    }
  } catch (error: any) {
    console.error('[WORKFLOW-REJECTION] Error processing approval:', error.message)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Get rejection history for an entity
 */
export async function getEntityRejectionHistory(
  entityType: WorkflowEntityType,
  entityId: string,
  options: { limit?: number; includeResolved?: boolean } = {}
): Promise<IWorkflowRejection[]> {
  await connectDB()
  
  const query: any = { entityType, entityId }
  
  if (!options.includeResolved) {
    query.isResolved = { $ne: true }
  }
  
  return WorkflowRejection.find(query)
    .sort({ rejectedAt: -1 })
    .limit(options.limit || 50)
    .lean() as Promise<IWorkflowRejection[]>
}

/**
 * Get the latest rejection for an entity
 */
export async function getLatestRejection(
  entityType: WorkflowEntityType,
  entityId: string
): Promise<IWorkflowRejection | null> {
  await connectDB()
  
  return WorkflowRejection.findOne({ entityType, entityId })
    .sort({ rejectedAt: -1 })
    .lean() as Promise<IWorkflowRejection | null>
}

/**
 * Mark a rejection as resolved
 */
export async function resolveRejection(
  rejectionId: string,
  resolvedBy: string,
  resolutionAction: 'RESUBMITTED' | 'CORRECTED' | 'CANCELLED' | 'OVERRIDDEN',
  resolutionRemarks?: string
): Promise<IWorkflowRejection | null> {
  await connectDB()
  
  return WorkflowRejection.findOneAndUpdate(
    { id: rejectionId },
    {
      $set: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy,
        resolutionAction,
        resolutionRemarks,
      }
    },
    { new: true }
  ).lean() as Promise<IWorkflowRejection | null>
}

// =============================================================================
// ANALYTICS & REPORTING
// =============================================================================

/**
 * Get rejection statistics for a company
 */
export async function getRejectionStatistics(
  companyId: string,
  entityType?: WorkflowEntityType,
  dateFrom?: Date,
  dateTo?: Date
): Promise<{
  totalRejections: number
  unresolvedCount: number
  byReasonCode: Array<{ reasonCode: string; count: number }>
  byStage: Array<{ workflowStage: string; count: number }>
  byRole: Array<{ rejectedByRole: string; count: number }>
}> {
  await connectDB()
  
  const match: any = { companyId }
  
  if (entityType) {
    match.entityType = entityType
  }
  
  if (dateFrom || dateTo) {
    match.rejectedAt = {}
    if (dateFrom) match.rejectedAt.$gte = dateFrom
    if (dateTo) match.rejectedAt.$lte = dateTo
  }
  
  const [
    totalResult,
    unresolvedResult,
    byReasonCode,
    byStage,
    byRole
  ] = await Promise.all([
    WorkflowRejection.countDocuments(match),
    WorkflowRejection.countDocuments({ ...match, isResolved: { $ne: true } }),
    WorkflowRejection.aggregate([
      { $match: match },
      { $group: { _id: '$reasonCode', count: { $sum: 1 } } },
      { $project: { reasonCode: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } }
    ]),
    WorkflowRejection.aggregate([
      { $match: match },
      { $group: { _id: '$workflowStage', count: { $sum: 1 } } },
      { $project: { workflowStage: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } }
    ]),
    WorkflowRejection.aggregate([
      { $match: match },
      { $group: { _id: '$rejectedByRole', count: { $sum: 1 } } },
      { $project: { rejectedByRole: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } }
    ]),
  ])
  
  return {
    totalRejections: totalResult,
    unresolvedCount: unresolvedResult,
    byReasonCode,
    byStage,
    byRole,
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  WORKFLOW_ENTITY_TYPES,
  WORKFLOW_STAGE_KEYS,
  WORKFLOW_ROLES,
  REJECTION_ACTIONS,
  REJECTION_REASON_CODES,
}
