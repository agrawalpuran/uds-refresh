/**
 * Workflow Notification Mapping Model
 * 
 * Maps workflow events to notification behavior.
 * Enables configuration-driven notifications without hardcoding
 * stages, roles, or entity logic.
 * 
 * Design Principles:
 * - Event-driven: Notifications triggered by workflow events
 * - Configuration-driven: No hardcoded recipients or templates
 * - Company-specific: Different companies can have different mappings
 * - Extensible: Easy to add new channels (WhatsApp, SMS, push)
 * 
 * @module lib/models/WorkflowNotificationMapping
 */

import mongoose, { Schema, Document } from 'mongoose'
import { WorkflowEntityType, WORKFLOW_ENTITY_TYPES } from './WorkflowConfiguration'
import { WorkflowEventType, WORKFLOW_EVENT_TYPES } from '../workflow/workflow-events'

// =============================================================================
// NOTIFICATION CHANNELS
// =============================================================================

/**
 * Supported notification channels
 */
export const NOTIFICATION_CHANNELS = {
  EMAIL: 'EMAIL',
  IN_APP: 'IN_APP',
  WHATSAPP: 'WHATSAPP', // Future
  SMS: 'SMS',           // Future
  PUSH: 'PUSH',         // Future (mobile push)
} as const

export type NotificationChannel = typeof NOTIFICATION_CHANNELS[keyof typeof NOTIFICATION_CHANNELS]

// =============================================================================
// RECIPIENT RESOLVERS
// =============================================================================

/**
 * Recipient resolver strategies
 * These are evaluated at runtime to determine notification recipients
 */
export const RECIPIENT_RESOLVERS = {
  // Entity-related recipients
  REQUESTOR: 'REQUESTOR',                 // Original entity creator/submitter
  ENTITY_OWNER: 'ENTITY_OWNER',           // Owner of the entity (may differ from creator)
  
  // Workflow-related recipients
  CURRENT_STAGE_ROLE: 'CURRENT_STAGE_ROLE', // Roles allowed at current stage
  PREVIOUS_STAGE_ROLE: 'PREVIOUS_STAGE_ROLE', // Roles that acted at previous stage
  NEXT_STAGE_ROLE: 'NEXT_STAGE_ROLE',     // Roles allowed at next stage
  ACTION_PERFORMER: 'ACTION_PERFORMER',   // User who performed the action
  
  // Admin recipients
  COMPANY_ADMIN: 'COMPANY_ADMIN',         // All company admins
  LOCATION_ADMIN: 'LOCATION_ADMIN',       // Location admins for entity's location
  FINANCE_ADMIN: 'FINANCE_ADMIN',         // Finance admins
  
  // External recipients
  VENDOR: 'VENDOR',                       // Vendor associated with entity
  
  // Custom/Static
  CUSTOM: 'CUSTOM',                       // Custom email addresses (specified in config)
} as const

export type RecipientResolver = typeof RECIPIENT_RESOLVERS[keyof typeof RECIPIENT_RESOLVERS]

// =============================================================================
// NOTIFICATION MAPPING INTERFACE
// =============================================================================

/**
 * Custom recipient configuration (when resolver is CUSTOM)
 */
export interface CustomRecipient {
  email: string
  name?: string
  role?: string
}

/**
 * Channel-specific configuration
 */
export interface ChannelConfig {
  channel: NotificationChannel
  templateKey: string           // Key to look up template
  priority?: 'HIGH' | 'NORMAL' | 'LOW'
  delayMinutes?: number         // Delay before sending (for batching)
}

/**
 * Main notification mapping interface
 */
export interface IWorkflowNotificationMapping extends Document {
  // Identity
  id: string                    // Unique mapping ID
  
  // Scope
  companyId: string             // Company ID (numeric string), '*' for global default
  entityType: WorkflowEntityType | '*' // Entity type or '*' for all
  
  // Event trigger
  eventType: WorkflowEventType  // Workflow event that triggers this notification
  stageKey?: string | null      // Specific stage (null = all stages)
  
  // Recipients
  recipientResolvers: RecipientResolver[] // How to resolve recipients
  customRecipients?: CustomRecipient[]    // Static recipients (when CUSTOM resolver used)
  excludeActionPerformer?: boolean        // Don't notify the person who performed action
  
  // Channels & Templates
  channels: ChannelConfig[]     // Channel configurations
  
  // Conditions
  conditions?: {
    minAmount?: number          // Only notify if entity amount >= this
    entityStatuses?: string[]   // Only notify if entity is in these statuses
    roles?: string[]            // Only notify if action performer has these roles
    customCondition?: string    // JSON expression for custom conditions (future)
  }
  
  // Flags
  isActive: boolean             // Whether this mapping is active
  priority: number              // Priority for conflict resolution (higher = more important)
  
  // Metadata
  description?: string          // Human-readable description
  createdBy?: string
  updatedBy?: string
  createdAt?: Date
  updatedAt?: Date
}

// =============================================================================
// SCHEMA DEFINITION
// =============================================================================

const CustomRecipientSchema = new Schema({
  email: { type: String, required: true, trim: true, lowercase: true },
  name: { type: String, required: false, trim: true },
  role: { type: String, required: false, trim: true },
}, { _id: false })

const ChannelConfigSchema = new Schema({
  channel: {
    type: String,
    required: true,
    enum: Object.values(NOTIFICATION_CHANNELS),
  },
  templateKey: { type: String, required: true, trim: true, maxlength: 100 },
  priority: {
    type: String,
    required: false,
    enum: ['HIGH', 'NORMAL', 'LOW'],
    default: 'NORMAL',
  },
  delayMinutes: { type: Number, required: false, min: 0, max: 1440 },
}, { _id: false })

const ConditionsSchema = new Schema({
  minAmount: { type: Number, required: false, min: 0 },
  entityStatuses: [{ type: String, trim: true }],
  roles: [{ type: String, trim: true }],
  customCondition: { type: String, required: false, trim: true, maxlength: 1000 },
}, { _id: false })

const WorkflowNotificationMappingSchema = new Schema<IWorkflowNotificationMapping>(
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
        message: 'Mapping ID must be alphanumeric (1-50 characters)'
      }
    },
    companyId: {
      type: String,
      required: true,
      index: true,
      // Can be '*' for global default or numeric string for specific company
    },
    entityType: {
      type: String,
      required: true,
      index: true,
      validate: {
        validator: function(v: string) {
          return v === '*' || Object.values(WORKFLOW_ENTITY_TYPES).includes(v as WorkflowEntityType)
        },
        message: 'Invalid entity type'
      }
    },
    eventType: {
      type: String,
      required: true,
      enum: Object.values(WORKFLOW_EVENT_TYPES),
      index: true,
    },
    stageKey: {
      type: String,
      required: false,
      trim: true,
      maxlength: 50,
      index: true,
    },
    recipientResolvers: {
      type: [String],
      required: true,
      enum: Object.values(RECIPIENT_RESOLVERS),
      validate: {
        validator: function(v: string[]) {
          return v && v.length > 0
        },
        message: 'At least one recipient resolver is required'
      }
    },
    customRecipients: {
      type: [CustomRecipientSchema],
      required: false,
      default: [],
    },
    excludeActionPerformer: {
      type: Boolean,
      required: false,
      default: false,
    },
    channels: {
      type: [ChannelConfigSchema],
      required: true,
      validate: {
        validator: function(v: any[]) {
          return v && v.length > 0
        },
        message: 'At least one channel configuration is required'
      }
    },
    conditions: {
      type: ConditionsSchema,
      required: false,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    priority: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100,
    },
    description: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
    },
    createdBy: { type: String, required: false, trim: true },
    updatedBy: { type: String, required: false, trim: true },
  },
  {
    timestamps: true,
  }
)

// =============================================================================
// INDEXES
// =============================================================================

// Primary lookup index
WorkflowNotificationMappingSchema.index({
  companyId: 1,
  entityType: 1,
  eventType: 1,
  isActive: 1,
})

// Stage-specific lookup
WorkflowNotificationMappingSchema.index({
  companyId: 1,
  entityType: 1,
  eventType: 1,
  stageKey: 1,
  isActive: 1,
})

// Global default lookup
WorkflowNotificationMappingSchema.index({
  entityType: 1,
  eventType: 1,
  isActive: 1,
}, {
  partialFilterExpression: { companyId: '*' }
})

// =============================================================================
// STATIC METHODS
// =============================================================================

/**
 * Find active mappings for a workflow event
 * Checks company-specific first, then falls back to global defaults
 */
WorkflowNotificationMappingSchema.statics.findMappingsForEvent = async function(
  companyId: string,
  entityType: WorkflowEntityType,
  eventType: WorkflowEventType,
  stageKey?: string | null
): Promise<IWorkflowNotificationMapping[]> {
  // Find company-specific mappings
  const companyMappings = await this.find({
    companyId,
    $or: [
      { entityType },
      { entityType: '*' },
    ],
    eventType,
    $or: [
      { stageKey: { $exists: false } },
      { stageKey: null },
      { stageKey },
    ],
    isActive: true,
  }).sort({ priority: -1 }).lean()
  
  // If company has specific mappings, use those
  if (companyMappings.length > 0) {
    return companyMappings
  }
  
  // Fall back to global defaults
  return this.find({
    companyId: '*',
    $or: [
      { entityType },
      { entityType: '*' },
    ],
    eventType,
    $or: [
      { stageKey: { $exists: false } },
      { stageKey: null },
      { stageKey },
    ],
    isActive: true,
  }).sort({ priority: -1 }).lean()
}

// =============================================================================
// MODEL
// =============================================================================

// Handle hot-reload in development
if (mongoose.models.WorkflowNotificationMapping) {
  delete mongoose.models.WorkflowNotificationMapping
}

const WorkflowNotificationMapping = mongoose.model<IWorkflowNotificationMapping>(
  'WorkflowNotificationMapping',
  WorkflowNotificationMappingSchema
)

export default WorkflowNotificationMapping
