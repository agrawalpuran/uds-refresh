import mongoose, { Schema, Document } from 'mongoose'

/**
 * NotificationQueue Model
 * 
 * Queued messages for async processing (future use).
 * Stores pending email notifications that need to be sent.
 * 
 * This model is designed for future implementation of async email processing.
 * No business logic is implemented yet - only the data structure.
 */
export interface INotificationQueue extends Document {
  queueId: string // Numeric ID (6-12 digits, e.g., "900001")
  eventId: string // Foreign key → NotificationEvent.eventId
  entityType: 'PR' | 'PO' | 'SHIPMENT' | 'ORDER' | 'EMPLOYEE' | 'VENDOR' | 'OTHER' // Type of entity that triggered the event
  entityId: string // ID of the entity (e.g., PR number, PO number, Order ID)
  recipientEmail: string // Email address of the recipient
  recipientType: 'EMPLOYEE' | 'VENDOR' | 'LOCATION_ADMIN' | 'COMPANY_ADMIN' | 'CUSTOM' // Type of recipient
  templateId: string // Foreign key → NotificationTemplate.templateId
  senderId: string // Foreign key → NotificationSenderProfile.senderId
  payloadData: any // JSON snapshot of values merged with template (for audit/debugging)
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'RETRY' | 'CANCELLED' // Queue status
  retryCount: number // Number of retry attempts
  lastAttemptAt?: Date // Timestamp of last processing attempt
  errorMessage?: string // Error message if status is FAILED
  scheduledAt?: Date // Scheduled send time (for future delayed notifications)
  createdAt?: Date
  updatedAt?: Date
}

const NotificationQueueSchema = new Schema<INotificationQueue>(
  {
    queueId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: function(v: string) {
          // Must be 6-12 digits
          return /^\d{6,12}$/.test(v)
        },
        message: 'Queue ID must be a 6-12 digit numeric string (e.g., "900001")'
      }
    },
    eventId: {
      type: String,
      required: true,
      index: true,
      ref: 'NotificationEvent',
    },
    entityType: {
      type: String,
      enum: ['PR', 'PO', 'SHIPMENT', 'ORDER', 'EMPLOYEE', 'VENDOR', 'OTHER'],
      required: true,
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      index: true,
      maxlength: 100,
    },
    recipientEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 255,
      index: true,
      validate: {
        validator: function(v: string) {
          // Basic email validation
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
        },
        message: 'Recipient email must be a valid email address'
      }
    },
    recipientType: {
      type: String,
      enum: ['EMPLOYEE', 'VENDOR', 'LOCATION_ADMIN', 'COMPANY_ADMIN', 'CUSTOM'],
      required: true,
      index: true,
    },
    templateId: {
      type: String,
      required: true,
      index: true,
      ref: 'NotificationTemplate',
    },
    senderId: {
      type: String,
      required: true,
      index: true,
      ref: 'NotificationSenderProfile',
    },
    payloadData: {
      type: Schema.Types.Mixed,
      required: true,
      // JSON snapshot of template variables and merged content
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'RETRY', 'CANCELLED'],
      required: true,
      default: 'PENDING',
      index: true,
    },
    retryCount: {
      type: Number,
      default: 0,
      required: true,
      min: 0,
    },
    lastAttemptAt: {
      type: Date,
      required: false,
      index: true,
    },
    errorMessage: {
      type: String,
      required: false,
      maxlength: 1000,
    },
    scheduledAt: {
      type: Date,
      required: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
)

// Compound indexes
NotificationQueueSchema.index({ status: 1, scheduledAt: 1 }) // For querying pending items
NotificationQueueSchema.index({ status: 1, retryCount: 1 }) // For retry logic
NotificationQueueSchema.index({ eventId: 1, entityType: 1, entityId: 1 }) // For deduplication
NotificationQueueSchema.index({ recipientEmail: 1, status: 1 }) // For recipient-based queries
NotificationQueueSchema.index({ createdAt: 1 }) // For cleanup of old records

// Delete existing model if it exists to force recompilation with new schema
if (mongoose.models.NotificationQueue) {
  delete mongoose.models.NotificationQueue
}

const NotificationQueue = mongoose.model<INotificationQueue>('NotificationQueue', NotificationQueueSchema)

export default NotificationQueue

