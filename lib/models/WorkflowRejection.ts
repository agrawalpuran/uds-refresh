import mongoose, { Schema, Document } from 'mongoose'
import { WORKFLOW_ENTITY_TYPES, WorkflowEntityType } from './WorkflowConfiguration'

// =============================================================================
// WORKFLOW REJECTION MODEL (Entity-Agnostic)
// =============================================================================
// Central rejection collection that works for ALL workflow-enabled entities.
// Entity documents (Order, GRN, Invoice) remain lean - they only store status
// and currentStage. All rejection metadata is stored here.
// =============================================================================

/**
 * Predefined rejection reason codes (extensible - can be company-configurable)
 */
export const REJECTION_REASON_CODES = {
  // General reasons
  INCOMPLETE_INFORMATION: 'INCOMPLETE_INFORMATION',
  INVALID_DATA: 'INVALID_DATA',
  DUPLICATE_REQUEST: 'DUPLICATE_REQUEST',
  POLICY_VIOLATION: 'POLICY_VIOLATION',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  UNAUTHORIZED_REQUEST: 'UNAUTHORIZED_REQUEST',
  
  // Order-specific reasons
  ELIGIBILITY_EXHAUSTED: 'ELIGIBILITY_EXHAUSTED',
  INVALID_QUANTITY: 'INVALID_QUANTITY',
  PRODUCT_UNAVAILABLE: 'PRODUCT_UNAVAILABLE',
  DELIVERY_ADDRESS_INVALID: 'DELIVERY_ADDRESS_INVALID',
  EMPLOYEE_NOT_ELIGIBLE: 'EMPLOYEE_NOT_ELIGIBLE',
  
  // GRN-specific reasons
  QUANTITY_MISMATCH: 'QUANTITY_MISMATCH',
  QUALITY_ISSUE: 'QUALITY_ISSUE',
  DAMAGED_GOODS: 'DAMAGED_GOODS',
  WRONG_ITEMS: 'WRONG_ITEMS',
  MISSING_DOCUMENTATION: 'MISSING_DOCUMENTATION',
  
  // Invoice-specific reasons
  PRICING_DISCREPANCY: 'PRICING_DISCREPANCY',
  TAX_CALCULATION_ERROR: 'TAX_CALCULATION_ERROR',
  PO_MISMATCH: 'PO_MISMATCH',
  GRN_NOT_APPROVED: 'GRN_NOT_APPROVED',
  
  // Generic
  OTHER: 'OTHER',
} as const

export type RejectionReasonCode = typeof REJECTION_REASON_CODES[keyof typeof REJECTION_REASON_CODES] | string

/**
 * Rejection action types
 */
export const REJECTION_ACTIONS = {
  REJECT: 'REJECT', // Standard rejection
  SEND_BACK: 'SEND_BACK', // Send back to previous stage for corrections
  CANCEL: 'CANCEL', // Permanent cancellation
  HOLD: 'HOLD', // Temporary hold (can be resumed)
} as const

export type RejectionAction = typeof REJECTION_ACTIONS[keyof typeof REJECTION_ACTIONS]

/**
 * Main workflow rejection interface
 */
export interface IWorkflowRejection extends Document {
  id: string // Unique rejection ID
  
  // Entity reference (polymorphic)
  companyId: string // Company ID (numeric string)
  entityType: WorkflowEntityType // Entity type (ORDER, GRN, INVOICE, etc.)
  entityId: string // Reference to the entity's ID field
  
  // Workflow context
  workflowConfigId?: string // Reference to WorkflowConfiguration.id
  workflowStage: string // Stage key where rejection occurred
  workflowVersion?: number // Workflow version at time of rejection
  
  // Rejection details
  action: RejectionAction // Type of rejection action
  reasonCode: string // Rejection reason code
  reasonLabel?: string // Human-readable reason label
  remarks?: string // Free-text remarks/comments
  
  // Who rejected
  rejectedBy: string // User ID who rejected
  rejectedByRole: string // Role of the rejector (LOCATION_ADMIN, COMPANY_ADMIN, etc.)
  rejectedByName?: string // Name of rejector (denormalized for display)
  
  // State snapshot
  previousStatus: string // Entity status before rejection
  previousStage?: string // Previous workflow stage (if multi-stage)
  newStatus: string // Status after rejection (usually REJECTED)
  
  // Entity snapshot (for audit - store key info at time of rejection)
  entitySnapshot?: {
    // Common fields
    createdAt?: Date
    createdBy?: string
    totalAmount?: number
    // Order-specific
    employeeId?: string
    employeeName?: string
    pr_number?: string
    // GRN-specific
    grnNumber?: string
    poNumber?: string
    vendorId?: string
    // Invoice-specific
    invoiceNumber?: string
    invoiceAmount?: number
    // Extensible for future entities
    [key: string]: any
  }
  
  // Resolution tracking
  isResolved?: boolean // Whether this rejection was addressed
  resolvedAt?: Date // When it was resolved
  resolvedBy?: string // Who resolved it
  resolutionAction?: 'RESUBMITTED' | 'CORRECTED' | 'CANCELLED' | 'OVERRIDDEN'
  resolutionRemarks?: string
  
  // Metadata for extensibility
  metadata?: {
    clientIp?: string
    userAgent?: string
    source?: 'WEB' | 'API' | 'MOBILE' | 'SYSTEM'
    correlationId?: string
    [key: string]: any
  }
  
  // Timestamps
  rejectedAt: Date
  createdAt?: Date
  updatedAt?: Date
}

/**
 * Entity snapshot schema (flexible sub-document)
 */
const EntitySnapshotSchema = new Schema({}, { 
  strict: false, // Allow any fields
  _id: false 
})

/**
 * Metadata schema (flexible sub-document)
 */
const MetadataSchema = new Schema({}, { 
  strict: false, // Allow any fields
  _id: false 
})

/**
 * Main Workflow Rejection Schema
 */
const WorkflowRejectionSchema = new Schema<IWorkflowRejection>(
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
        message: 'Rejection ID must be alphanumeric (1-50 characters)'
      }
    },
    
    // Entity reference
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
    entityId: {
      type: String,
      required: true,
      index: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Entity ID must be alphanumeric (1-50 characters)'
      }
    },
    
    // Workflow context
    workflowConfigId: {
      type: String,
      required: false,
      index: true,
    },
    workflowStage: {
      type: String,
      required: true,
      index: true,
      trim: true,
      maxlength: 50,
    },
    workflowVersion: {
      type: Number,
      required: false,
      min: 1,
    },
    
    // Rejection details
    action: {
      type: String,
      required: true,
      enum: Object.values(REJECTION_ACTIONS),
      default: REJECTION_ACTIONS.REJECT,
      index: true,
    },
    reasonCode: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      index: true,
    },
    reasonLabel: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
    },
    remarks: {
      type: String,
      required: false,
      trim: true,
      maxlength: 2000,
    },
    
    // Who rejected
    rejectedBy: {
      type: String,
      required: true,
      index: true,
    },
    rejectedByRole: {
      type: String,
      required: true,
      index: true,
      trim: true,
      maxlength: 50,
    },
    rejectedByName: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
    },
    
    // State snapshot
    previousStatus: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    previousStage: {
      type: String,
      required: false,
      trim: true,
      maxlength: 50,
    },
    newStatus: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      default: 'REJECTED',
    },
    
    // Entity snapshot
    entitySnapshot: {
      type: EntitySnapshotSchema,
      required: false,
    },
    
    // Resolution tracking
    isResolved: {
      type: Boolean,
      required: false,
      default: false,
      index: true,
    },
    resolvedAt: {
      type: Date,
      required: false,
    },
    resolvedBy: {
      type: String,
      required: false,
    },
    resolutionAction: {
      type: String,
      required: false,
      enum: ['RESUBMITTED', 'CORRECTED', 'CANCELLED', 'OVERRIDDEN'],
    },
    resolutionRemarks: {
      type: String,
      required: false,
      trim: true,
      maxlength: 2000,
    },
    
    // Metadata
    metadata: {
      type: MetadataSchema,
      required: false,
    },
    
    // Timestamps
    rejectedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
)

// =============================================================================
// INDEXES
// =============================================================================

// Compound index for entity rejection history (most common query)
WorkflowRejectionSchema.index({ entityType: 1, entityId: 1, rejectedAt: -1 })

// Compound index for company-wide rejection queries
WorkflowRejectionSchema.index({ companyId: 1, entityType: 1, rejectedAt: -1 })

// Compound index for rejection reports by date range
WorkflowRejectionSchema.index({ companyId: 1, rejectedAt: -1 })

// Index for finding unresolved rejections
WorkflowRejectionSchema.index({ companyId: 1, isResolved: 1, rejectedAt: -1 })

// Index for rejection analysis by reason
WorkflowRejectionSchema.index({ companyId: 1, reasonCode: 1, rejectedAt: -1 })

// Index for rejection analysis by stage
WorkflowRejectionSchema.index({ companyId: 1, workflowStage: 1, rejectedAt: -1 })

// Index for rejector activity
WorkflowRejectionSchema.index({ rejectedBy: 1, rejectedAt: -1 })

// =============================================================================
// STATIC METHODS
// =============================================================================

/**
 * Get rejection history for a specific entity
 */
WorkflowRejectionSchema.statics.getEntityRejectionHistory = async function(
  entityType: WorkflowEntityType,
  entityId: string,
  options: { limit?: number; includeResolved?: boolean } = {}
): Promise<IWorkflowRejection[]> {
  const query: any = { entityType, entityId }
  
  if (!options.includeResolved) {
    query.isResolved = { $ne: true }
  }
  
  return this.find(query)
    .sort({ rejectedAt: -1 })
    .limit(options.limit || 50)
    .lean()
}

/**
 * Get the latest rejection for an entity
 */
WorkflowRejectionSchema.statics.getLatestRejection = async function(
  entityType: WorkflowEntityType,
  entityId: string
): Promise<IWorkflowRejection | null> {
  return this.findOne({ entityType, entityId })
    .sort({ rejectedAt: -1 })
    .lean()
}

/**
 * Get rejection counts by reason for a company
 */
WorkflowRejectionSchema.statics.getRejectionCountsByReason = async function(
  companyId: string,
  entityType?: WorkflowEntityType,
  dateFrom?: Date,
  dateTo?: Date
): Promise<Array<{ reasonCode: string; count: number }>> {
  const match: any = { companyId }
  
  if (entityType) {
    match.entityType = entityType
  }
  
  if (dateFrom || dateTo) {
    match.rejectedAt = {}
    if (dateFrom) match.rejectedAt.$gte = dateFrom
    if (dateTo) match.rejectedAt.$lte = dateTo
  }
  
  return this.aggregate([
    { $match: match },
    { $group: { _id: '$reasonCode', count: { $sum: 1 } } },
    { $project: { reasonCode: '$_id', count: 1, _id: 0 } },
    { $sort: { count: -1 } }
  ])
}

/**
 * Get rejection counts by stage for a company
 */
WorkflowRejectionSchema.statics.getRejectionCountsByStage = async function(
  companyId: string,
  entityType?: WorkflowEntityType,
  dateFrom?: Date,
  dateTo?: Date
): Promise<Array<{ workflowStage: string; count: number }>> {
  const match: any = { companyId }
  
  if (entityType) {
    match.entityType = entityType
  }
  
  if (dateFrom || dateTo) {
    match.rejectedAt = {}
    if (dateFrom) match.rejectedAt.$gte = dateFrom
    if (dateTo) match.rejectedAt.$lte = dateTo
  }
  
  return this.aggregate([
    { $match: match },
    { $group: { _id: '$workflowStage', count: { $sum: 1 } } },
    { $project: { workflowStage: '$_id', count: 1, _id: 0 } },
    { $sort: { count: -1 } }
  ])
}

/**
 * Mark a rejection as resolved
 */
WorkflowRejectionSchema.statics.resolveRejection = async function(
  rejectionId: string,
  resolvedBy: string,
  resolutionAction: 'RESUBMITTED' | 'CORRECTED' | 'CANCELLED' | 'OVERRIDDEN',
  resolutionRemarks?: string
): Promise<IWorkflowRejection | null> {
  return this.findOneAndUpdate(
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
  ).lean()
}

/**
 * Generate unique rejection ID
 */
WorkflowRejectionSchema.statics.generateRejectionId = function(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `REJ-${timestamp}-${random}`.toUpperCase()
}

const WorkflowRejection = mongoose.models.WorkflowRejection || 
  mongoose.model<IWorkflowRejection>('WorkflowRejection', WorkflowRejectionSchema)

export default WorkflowRejection
