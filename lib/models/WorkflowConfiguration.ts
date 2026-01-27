import mongoose, { Schema, Document } from 'mongoose'

// =============================================================================
// WORKFLOW CONFIGURATION MODEL
// =============================================================================
// Defines approval workflow stages per company and entity type.
// This enables flexible, configuration-driven workflows without hardcoding
// roles or stages in business logic.
// =============================================================================

/**
 * Entity types that support workflow-driven approvals
 */
export const WORKFLOW_ENTITY_TYPES = {
  ORDER: 'ORDER',
  GRN: 'GRN',
  INVOICE: 'INVOICE',
  PURCHASE_ORDER: 'PURCHASE_ORDER',
  RETURN_REQUEST: 'RETURN_REQUEST',
} as const

// Explicit type for Turbopack compatibility (instead of derived type)
export type WorkflowEntityType = 'ORDER' | 'GRN' | 'INVOICE' | 'PURCHASE_ORDER' | 'RETURN_REQUEST'

/**
 * Predefined stage keys (extensible - new stages can be added without code changes)
 */
export const WORKFLOW_STAGE_KEYS = {
  // Order/PR approval stages
  LOCATION_APPROVAL: 'LOCATION_APPROVAL',
  COMPANY_APPROVAL: 'COMPANY_APPROVAL',
  FINANCE_APPROVAL: 'FINANCE_APPROVAL',
  VENDOR_ACKNOWLEDGMENT: 'VENDOR_ACKNOWLEDGMENT',
  // GRN stages
  GRN_RAISED: 'GRN_RAISED',
  GRN_COMPANY_APPROVAL: 'GRN_COMPANY_APPROVAL',
  // Invoice stages
  INVOICE_RAISED: 'INVOICE_RAISED',
  INVOICE_COMPANY_APPROVAL: 'INVOICE_COMPANY_APPROVAL',
  INVOICE_FINANCE_APPROVAL: 'INVOICE_FINANCE_APPROVAL',
  // Generic stages (extensible)
  INITIAL_SUBMISSION: 'INITIAL_SUBMISSION',
  MANAGER_APPROVAL: 'MANAGER_APPROVAL',
  FINAL_APPROVAL: 'FINAL_APPROVAL',
} as const

export type WorkflowStageKey = typeof WORKFLOW_STAGE_KEYS[keyof typeof WORKFLOW_STAGE_KEYS] | string

/**
 * Predefined roles that can participate in workflows
 */
export const WORKFLOW_ROLES = {
  LOCATION_ADMIN: 'LOCATION_ADMIN',
  SITE_ADMIN: 'SITE_ADMIN', // Alias for LOCATION_ADMIN
  COMPANY_ADMIN: 'COMPANY_ADMIN',
  FINANCE_ADMIN: 'FINANCE_ADMIN',
  VENDOR: 'VENDOR',
  SUPER_ADMIN: 'SUPER_ADMIN',
  EMPLOYEE: 'EMPLOYEE',
} as const

export type WorkflowRole = typeof WORKFLOW_ROLES[keyof typeof WORKFLOW_ROLES] | string

/**
 * Resubmission strategy after rejection
 */
export const RESUBMISSION_STRATEGIES = {
  NEW_ENTITY: 'NEW_ENTITY',     // Must create new entity (workflow ID changes)
  SAME_ENTITY: 'SAME_ENTITY',   // Can resubmit same entity (workflow restarts)
} as const

export type ResubmissionStrategy = typeof RESUBMISSION_STRATEGIES[keyof typeof RESUBMISSION_STRATEGIES]

/**
 * Rejection behavior configuration for a workflow stage
 * All settings are configurable - no hardcoded behavior
 */
export interface IStageRejectionConfig {
  // Workflow termination behavior
  isTerminalOnReject: boolean         // If true, rejection terminates workflow immediately
  stopFurtherStagesOnReject: boolean  // If true, no subsequent stages are triggered
  
  // Validation requirements
  isReasonCodeMandatory: boolean      // Reason code always required (default: true)
  isRemarksMandatory: boolean         // Remarks required for rejection (configurable)
  maxRemarksLength?: number           // Max length for remarks (default: 2000)
  allowedReasonCodes?: string[]       // Restrict to specific reason codes (null = all)
  
  // Notification configuration (recipients resolved via notification mapping)
  notifyRolesOnReject: string[]       // Roles to notify on rejection
  notifyRequestor: boolean            // Notify the original requestor (default: true)
  excludeFromNotification?: string[]  // Roles to explicitly exclude from notification
  
  // Override and visibility
  allowOverrideRoles?: string[]       // Roles that can override this rejection (future)
  visibleToRolesAfterReject: string[] // Roles that can view rejected entity
  hiddenFromRolesAfterReject?: string[] // Roles hidden from rejected entity
  
  // Resubmission configuration
  resubmissionStrategy: ResubmissionStrategy // How resubmission is handled
  allowResubmission: boolean          // Whether resubmission is allowed at all
  resubmissionAllowedRoles?: string[] // Roles that can resubmit (default: REQUESTOR)
  
  // Status mapping (what status to set on rejection)
  rejectedStatus?: string             // Override default REJECTED status
  
  // Audit and compliance
  requireApprovalForOverride?: boolean // Require another approval to override rejection
}

/**
 * Workflow stage definition
 */
export interface IWorkflowStage {
  stageKey: string // Unique identifier for the stage (e.g., LOCATION_APPROVAL)
  stageName: string // Human-readable name (e.g., "Location Admin Approval")
  stageDescription?: string // Optional description
  allowedRoles: string[] // Roles that can act at this stage
  order: number // Execution order (1-based, lower = earlier)
  canApprove: boolean // Whether this stage can approve
  canReject: boolean // Whether this stage can reject
  isTerminal: boolean // Whether this is the final approval stage
  isOptional?: boolean // Whether this stage can be skipped based on config
  autoApproveCondition?: string // JSON condition for auto-approval (future use)
  timeoutHours?: number // Auto-escalation timeout (future use)
  escalateTo?: string // Stage to escalate to on timeout (future use)
  
  // NEW: Rejection-specific configuration
  rejectionConfig?: IStageRejectionConfig // Stage-specific rejection behavior
}

/**
 * Global default rejection configuration (applies when stage doesn't specify)
 */
export interface IGlobalRejectionConfig {
  // Default behavior for all stages unless overridden
  defaultIsTerminalOnReject: boolean
  defaultIsRemarksMandatory: boolean
  defaultResubmissionStrategy: ResubmissionStrategy
  defaultNotifyRolesOnReject: string[]
  defaultVisibleToRolesAfterReject: string[]
  defaultAllowResubmission: boolean
}

/**
 * Main workflow configuration interface
 */
export interface IWorkflowConfiguration extends Document {
  id: string // Unique configuration ID
  companyId: string // Company this config belongs to (numeric string)
  entityType: WorkflowEntityType // Entity type (ORDER, GRN, INVOICE, etc.)
  workflowName: string // Human-readable workflow name
  workflowDescription?: string // Optional description
  stages: IWorkflowStage[] // Ordered array of workflow stages
  version: number // Configuration version (for audit trail)
  isActive: boolean // Whether this workflow is currently active
  isDefault?: boolean // Whether this is the default workflow for the entity type
  // Status mappings (maps stage transitions to entity statuses)
  statusOnApproval?: Record<string, string> // stageKey -> status after approval
  statusOnRejection?: Record<string, string> // stageKey -> status after rejection
  statusOnSubmission?: string // Initial status when entity enters workflow
  // NEW: Global rejection configuration (defaults for all stages)
  globalRejectionConfig?: IGlobalRejectionConfig
  // Metadata
  createdBy?: string // User who created this config
  updatedBy?: string // User who last updated
  createdAt?: Date
  updatedAt?: Date
}

/**
 * Stage Rejection Config Schema (nested in WorkflowStage)
 */
const StageRejectionConfigSchema = new Schema<IStageRejectionConfig>({
  // Workflow termination behavior
  isTerminalOnReject: {
    type: Boolean,
    required: true,
    default: true, // Default: rejection terminates workflow
  },
  stopFurtherStagesOnReject: {
    type: Boolean,
    required: true,
    default: true, // Default: no further stages after rejection
  },
  
  // Validation requirements
  isReasonCodeMandatory: {
    type: Boolean,
    required: true,
    default: true, // Reason code always required by default
  },
  isRemarksMandatory: {
    type: Boolean,
    required: true,
    default: false, // Remarks optional by default
  },
  maxRemarksLength: {
    type: Number,
    required: false,
    default: 2000,
    min: 0,
    max: 10000,
  },
  allowedReasonCodes: {
    type: [String],
    required: false,
    default: undefined, // null = all reason codes allowed
  },
  
  // Notification configuration
  notifyRolesOnReject: {
    type: [String],
    required: true,
    default: ['REQUESTOR'], // Notify requestor by default
  },
  notifyRequestor: {
    type: Boolean,
    required: true,
    default: true,
  },
  excludeFromNotification: {
    type: [String],
    required: false,
    default: [],
  },
  
  // Override and visibility
  allowOverrideRoles: {
    type: [String],
    required: false,
    default: [], // No override by default
  },
  visibleToRolesAfterReject: {
    type: [String],
    required: true,
    default: ['REQUESTOR', 'COMPANY_ADMIN'], // Visible to requestor and company admin
  },
  hiddenFromRolesAfterReject: {
    type: [String],
    required: false,
    default: [],
  },
  
  // Resubmission configuration
  resubmissionStrategy: {
    type: String,
    required: true,
    enum: Object.values(RESUBMISSION_STRATEGIES),
    default: RESUBMISSION_STRATEGIES.NEW_ENTITY, // Default: new entity required
  },
  allowResubmission: {
    type: Boolean,
    required: true,
    default: true,
  },
  resubmissionAllowedRoles: {
    type: [String],
    required: false,
    default: ['REQUESTOR'],
  },
  
  // Status mapping
  rejectedStatus: {
    type: String,
    required: false,
    trim: true,
    maxlength: 50,
    default: 'REJECTED',
  },
  
  // Audit and compliance
  requireApprovalForOverride: {
    type: Boolean,
    required: false,
    default: true,
  },
}, { _id: false })

/**
 * Workflow Stage Schema
 */
const WorkflowStageSchema = new Schema<IWorkflowStage>({
  stageKey: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
  },
  stageName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  stageDescription: {
    type: String,
    required: false,
    trim: true,
    maxlength: 500,
  },
  allowedRoles: {
    type: [String],
    required: true,
    validate: {
      validator: function(v: string[]) {
        return v && v.length > 0
      },
      message: 'At least one allowed role is required'
    }
  },
  order: {
    type: Number,
    required: true,
    min: 1,
  },
  canApprove: {
    type: Boolean,
    required: true,
    default: true,
  },
  canReject: {
    type: Boolean,
    required: true,
    default: true,
  },
  isTerminal: {
    type: Boolean,
    required: true,
    default: false,
  },
  isOptional: {
    type: Boolean,
    required: false,
    default: false,
  },
  autoApproveCondition: {
    type: String,
    required: false,
    trim: true,
    maxlength: 1000,
  },
  timeoutHours: {
    type: Number,
    required: false,
    min: 0,
  },
  escalateTo: {
    type: String,
    required: false,
    trim: true,
    maxlength: 50,
  },
  // NEW: Rejection-specific configuration
  rejectionConfig: {
    type: StageRejectionConfigSchema,
    required: false,
    default: undefined, // Will use global defaults if not specified
  },
}, { _id: false }) // No separate _id for subdocument

/**
 * Main Workflow Configuration Schema
 */
const WorkflowConfigurationSchema = new Schema<IWorkflowConfiguration>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Workflow Configuration ID must be alphanumeric (1-50 characters)'
      }
    },
    companyId: {
      type: String,
      required: true,
      index: true,
      validate: {
        validator: function(v: string) {
          return /^\d+$/.test(v)
        },
        message: 'Company ID must be a numeric string'
      }
    },
    entityType: {
      type: String,
      required: true,
      enum: Object.values(WORKFLOW_ENTITY_TYPES),
      index: true,
    },
    workflowName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    workflowDescription: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
    },
    stages: {
      type: [WorkflowStageSchema],
      required: true,
      validate: {
        validator: function(v: IWorkflowStage[]) {
          // Must have at least one stage
          if (!v || v.length === 0) return false
          // Must have exactly one terminal stage
          const terminalStages = v.filter(s => s.isTerminal)
          if (terminalStages.length !== 1) return false
          // Stage orders must be unique
          const orders = v.map(s => s.order)
          if (new Set(orders).size !== orders.length) return false
          // Stage keys must be unique
          const keys = v.map(s => s.stageKey)
          if (new Set(keys).size !== keys.length) return false
          return true
        },
        message: 'Stages must have unique keys, unique orders, and exactly one terminal stage'
      }
    },
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    isDefault: {
      type: Boolean,
      required: false,
      default: false,
    },
    statusOnApproval: {
      type: Schema.Types.Mixed,
      required: false,
      default: {},
    },
    statusOnRejection: {
      type: Schema.Types.Mixed,
      required: false,
      default: {},
    },
    statusOnSubmission: {
      type: String,
      required: false,
      trim: true,
      maxlength: 50,
    },
    // Global rejection configuration (defaults for all stages)
    globalRejectionConfig: {
      type: {
        defaultIsTerminalOnReject: { type: Boolean, default: true },
        defaultIsRemarksMandatory: { type: Boolean, default: false },
        defaultResubmissionStrategy: { 
          type: String, 
          enum: Object.values(RESUBMISSION_STRATEGIES),
          default: RESUBMISSION_STRATEGIES.NEW_ENTITY 
        },
        defaultNotifyRolesOnReject: { type: [String], default: ['REQUESTOR'] },
        defaultVisibleToRolesAfterReject: { type: [String], default: ['REQUESTOR', 'COMPANY_ADMIN'] },
        defaultAllowResubmission: { type: Boolean, default: true },
      },
      required: false,
      _id: false,
    },
    createdBy: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
    },
    updatedBy: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
    },
  },
  {
    timestamps: true,
  }
)

// =============================================================================
// INDEXES
// =============================================================================

// Compound index for active workflow lookup (most common query)
WorkflowConfigurationSchema.index({ companyId: 1, entityType: 1, isActive: 1 })

// Compound unique index to ensure one active workflow per company/entity
WorkflowConfigurationSchema.index(
  { companyId: 1, entityType: 1, isActive: 1 },
  { 
    unique: true, 
    partialFilterExpression: { isActive: true },
    name: 'unique_active_workflow_per_company_entity'
  }
)

// Index for default workflow lookup
WorkflowConfigurationSchema.index({ entityType: 1, isDefault: 1 })

// =============================================================================
// PRE-SAVE HOOKS
// =============================================================================

// Auto-increment version on update
WorkflowConfigurationSchema.pre('save', function(next) {
  if (!this.isNew && this.isModified()) {
    this.version = (this.version || 1) + 1
  }
  next()
})

// =============================================================================
// STATIC METHODS
// =============================================================================

/**
 * Get active workflow configuration for a company and entity type
 */
WorkflowConfigurationSchema.statics.getActiveWorkflow = async function(
  companyId: string,
  entityType: WorkflowEntityType
): Promise<IWorkflowConfiguration | null> {
  return this.findOne({
    companyId,
    entityType,
    isActive: true
  }).lean()
}

/**
 * Get the next stage after approval at the current stage
 */
WorkflowConfigurationSchema.statics.getNextStage = function(
  config: IWorkflowConfiguration,
  currentStageKey: string
): IWorkflowStage | null {
  const sortedStages = [...config.stages].sort((a, b) => a.order - b.order)
  const currentIndex = sortedStages.findIndex(s => s.stageKey === currentStageKey)
  
  if (currentIndex === -1 || currentIndex === sortedStages.length - 1) {
    return null
  }
  
  return sortedStages[currentIndex + 1]
}

/**
 * Check if a role can act at a specific stage
 */
WorkflowConfigurationSchema.statics.canRoleActAtStage = function(
  config: IWorkflowConfiguration,
  stageKey: string,
  role: string
): boolean {
  const stage = config.stages.find(s => s.stageKey === stageKey)
  if (!stage) return false
  return stage.allowedRoles.includes(role)
}

/**
 * Get the first (initial) stage of the workflow
 */
WorkflowConfigurationSchema.statics.getInitialStage = function(
  config: IWorkflowConfiguration
): IWorkflowStage {
  const sortedStages = [...config.stages].sort((a, b) => a.order - b.order)
  return sortedStages[0]
}

/**
 * Get the terminal (final) stage of the workflow
 */
WorkflowConfigurationSchema.statics.getTerminalStage = function(
  config: IWorkflowConfiguration
): IWorkflowStage | undefined {
  return config.stages.find(s => s.isTerminal)
}

// =============================================================================
// REJECTION CONFIG HELPERS
// =============================================================================

/**
 * System-wide default rejection configuration
 * Used when neither stage nor workflow specifies configuration
 */
export const SYSTEM_DEFAULT_REJECTION_CONFIG: IStageRejectionConfig = {
  isTerminalOnReject: true,
  stopFurtherStagesOnReject: true,
  isReasonCodeMandatory: true,
  isRemarksMandatory: false,
  maxRemarksLength: 2000,
  allowedReasonCodes: undefined, // All codes allowed
  notifyRolesOnReject: ['REQUESTOR'],
  notifyRequestor: true,
  excludeFromNotification: [],
  allowOverrideRoles: [],
  visibleToRolesAfterReject: ['REQUESTOR', 'COMPANY_ADMIN'],
  hiddenFromRolesAfterReject: [],
  resubmissionStrategy: RESUBMISSION_STRATEGIES.NEW_ENTITY,
  allowResubmission: true,
  resubmissionAllowedRoles: ['REQUESTOR'],
  rejectedStatus: 'REJECTED',
  requireApprovalForOverride: true,
}

/**
 * Get effective rejection configuration for a stage
 * Merges: System defaults -> Global workflow config -> Stage-specific config
 * 
 * @param config - Workflow configuration
 * @param stageKey - Stage key to get config for
 * @returns Merged rejection configuration
 */
export function getEffectiveRejectionConfig(
  config: IWorkflowConfiguration,
  stageKey: string
): IStageRejectionConfig {
  const stage = config.stages.find(s => s.stageKey === stageKey)
  const stageConfig = stage?.rejectionConfig
  const globalConfig = config.globalRejectionConfig
  
  // Start with system defaults
  const effective: IStageRejectionConfig = { ...SYSTEM_DEFAULT_REJECTION_CONFIG }
  
  // Apply global workflow config if present
  if (globalConfig) {
    if (globalConfig.defaultIsTerminalOnReject !== undefined) {
      effective.isTerminalOnReject = globalConfig.defaultIsTerminalOnReject
    }
    if (globalConfig.defaultIsRemarksMandatory !== undefined) {
      effective.isRemarksMandatory = globalConfig.defaultIsRemarksMandatory
    }
    if (globalConfig.defaultResubmissionStrategy !== undefined) {
      effective.resubmissionStrategy = globalConfig.defaultResubmissionStrategy
    }
    if (globalConfig.defaultNotifyRolesOnReject !== undefined) {
      effective.notifyRolesOnReject = globalConfig.defaultNotifyRolesOnReject
    }
    if (globalConfig.defaultVisibleToRolesAfterReject !== undefined) {
      effective.visibleToRolesAfterReject = globalConfig.defaultVisibleToRolesAfterReject
    }
    if (globalConfig.defaultAllowResubmission !== undefined) {
      effective.allowResubmission = globalConfig.defaultAllowResubmission
    }
  }
  
  // Apply stage-specific config if present (overrides everything)
  if (stageConfig) {
    // Merge all defined properties from stage config
    for (const key of Object.keys(stageConfig) as Array<keyof IStageRejectionConfig>) {
      const value = stageConfig[key]
      if (value !== undefined && value !== null) {
        (effective as any)[key] = value
      }
    }
  }
  
  return effective
}

/**
 * Static method on schema to get effective rejection config
 */
WorkflowConfigurationSchema.statics.getEffectiveRejectionConfig = function(
  config: IWorkflowConfiguration,
  stageKey: string
): IStageRejectionConfig {
  return getEffectiveRejectionConfig(config, stageKey)
}

const WorkflowConfiguration = mongoose.models.WorkflowConfiguration || 
  mongoose.model<IWorkflowConfiguration>('WorkflowConfiguration', WorkflowConfigurationSchema)

export default WorkflowConfiguration
