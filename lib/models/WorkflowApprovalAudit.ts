import mongoose, { Schema, Document } from 'mongoose'
import { WORKFLOW_ENTITY_TYPES, WorkflowEntityType } from './WorkflowConfiguration'

// =============================================================================
// WORKFLOW APPROVAL AUDIT MODEL
// =============================================================================
// Tracks all approval actions across the workflow lifecycle.
// Provides complete audit trail for compliance and reporting.
// =============================================================================

/**
 * Approval action types
 */
export const APPROVAL_ACTIONS = {
  APPROVE: 'APPROVE',           // Standard approval
  AUTO_APPROVE: 'AUTO_APPROVE', // System auto-approval (e.g., no location admin)
  SKIP_STAGE: 'SKIP_STAGE',     // Stage was skipped (optional stage)
  ESCALATE: 'ESCALATE',         // Escalated to higher authority
} as const

export type ApprovalAction = typeof APPROVAL_ACTIONS[keyof typeof APPROVAL_ACTIONS]

/**
 * Workflow approval audit interface
 */
export interface IWorkflowApprovalAudit extends Document {
  id: string                    // Unique audit ID
  
  // Entity reference
  companyId: string
  entityType: WorkflowEntityType
  entityId: string
  
  // Workflow context
  workflowConfigId: string
  workflowVersion: number
  
  // Stage transition
  fromStage: string             // Stage before this action
  toStage: string | null        // Stage after this action (null if terminal)
  
  // Action details
  action: ApprovalAction
  
  // Who approved
  approvedBy: string            // User ID
  approvedByRole: string        // Role at time of approval
  approvedByName?: string       // Denormalized name
  
  // Status transition
  previousStatus: string
  newStatus: string
  
  // Timing
  approvedAt: Date
  processingTimeMs?: number     // Time since entity entered this stage
  
  // Entity snapshot at approval time
  entitySnapshot?: {
    totalAmount?: number
    itemCount?: number
    employeeId?: string
    employeeName?: string
    vendorId?: string
    [key: string]: any
  }
  
  // Metadata
  metadata?: {
    clientIp?: string
    userAgent?: string
    source?: 'WEB' | 'API' | 'MOBILE' | 'SYSTEM'
    correlationId?: string
    remarks?: string
    [key: string]: any
  }
  
  createdAt?: Date
  updatedAt?: Date
}

/**
 * Entity snapshot schema
 */
const EntitySnapshotSchema = new Schema({}, { 
  strict: false,
  _id: false 
})

/**
 * Metadata schema
 */
const MetadataSchema = new Schema({}, { 
  strict: false,
  _id: false 
})

/**
 * Main schema
 */
const WorkflowApprovalAuditSchema = new Schema<IWorkflowApprovalAudit>(
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
        message: 'Audit ID must be alphanumeric (1-50 characters)'
      }
    },
    
    // Entity reference
    companyId: {
      type: String,
      required: true,
      index: true,
    },
    entityType: {
      type: String,
      required: true,
      enum: Object.values(WORKFLOW_ENTITY_TYPES),
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      index: true,
    },
    
    // Workflow context
    workflowConfigId: {
      type: String,
      required: true,
      index: true,
    },
    workflowVersion: {
      type: Number,
      required: true,
      min: 1,
    },
    
    // Stage transition
    fromStage: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      index: true,
    },
    toStage: {
      type: String,
      required: false,
      trim: true,
      maxlength: 50,
    },
    
    // Action
    action: {
      type: String,
      required: true,
      enum: Object.values(APPROVAL_ACTIONS),
      default: APPROVAL_ACTIONS.APPROVE,
      index: true,
    },
    
    // Who approved
    approvedBy: {
      type: String,
      required: true,
      index: true,
    },
    approvedByRole: {
      type: String,
      required: true,
      index: true,
    },
    approvedByName: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
    },
    
    // Status transition
    previousStatus: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    newStatus: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    
    // Timing
    approvedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    processingTimeMs: {
      type: Number,
      required: false,
      min: 0,
    },
    
    // Snapshots
    entitySnapshot: {
      type: EntitySnapshotSchema,
      required: false,
    },
    metadata: {
      type: MetadataSchema,
      required: false,
    },
  },
  {
    timestamps: true,
  }
)

// =============================================================================
// INDEXES
// =============================================================================

// Entity approval history
WorkflowApprovalAuditSchema.index({ entityType: 1, entityId: 1, approvedAt: -1 })

// Company approval reports
WorkflowApprovalAuditSchema.index({ companyId: 1, entityType: 1, approvedAt: -1 })

// Stage analytics
WorkflowApprovalAuditSchema.index({ companyId: 1, fromStage: 1, approvedAt: -1 })

// Approver activity
WorkflowApprovalAuditSchema.index({ approvedBy: 1, approvedAt: -1 })

// Role-based analytics
WorkflowApprovalAuditSchema.index({ companyId: 1, approvedByRole: 1, approvedAt: -1 })

// =============================================================================
// STATIC METHODS
// =============================================================================

/**
 * Get approval history for an entity
 */
WorkflowApprovalAuditSchema.statics.getEntityApprovalHistory = async function(
  entityType: WorkflowEntityType,
  entityId: string,
  limit: number = 50
): Promise<IWorkflowApprovalAudit[]> {
  return this.find({ entityType, entityId })
    .sort({ approvedAt: -1 })
    .limit(limit)
    .lean()
}

/**
 * Generate unique audit ID
 */
WorkflowApprovalAuditSchema.statics.generateAuditId = function(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `APR-${timestamp}-${random}`.toUpperCase()
}

const WorkflowApprovalAudit = mongoose.models.WorkflowApprovalAudit || 
  mongoose.model<IWorkflowApprovalAudit>('WorkflowApprovalAudit', WorkflowApprovalAuditSchema)

export default WorkflowApprovalAudit
