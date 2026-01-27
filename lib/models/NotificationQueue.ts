/**
 * NotificationQueue Model
 * 
 * Stores notifications that are queued for later delivery.
 * Used when:
 * - Company is in quiet hours
 * - Rate limiting is needed
 * - Retry after temporary failures
 */

import mongoose, { Schema, Document } from 'mongoose'

export interface INotificationQueue extends Document {
  queueId: string                    // Unique queue entry ID
  companyId: string                  // Company this notification belongs to
  eventCode: string                  // Notification event code
  recipientEmail: string             // Target recipient email
  recipientType: 'EMPLOYEE' | 'VENDOR' | 'COMPANY_ADMIN' | 'LOCATION_ADMIN' | 'SYSTEM'
  subject: string                    // Email subject (already rendered)
  body: string                       // Email body (already rendered)
  context: Record<string, any>       // Original context for logging/debugging
  
  // Queue management
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED'
  reason: string                     // Why it was queued (e.g., "quiet_hours", "rate_limit")
  scheduledFor: Date                 // When to attempt delivery
  
  // Retry tracking
  attempts: number                   // Number of delivery attempts
  maxAttempts: number               // Maximum attempts before marking as failed
  lastAttemptAt?: Date              // When last attempt was made
  lastError?: string                // Error from last attempt
  
  // Metadata
  correlationId: string             // For tracing
  createdAt: Date
  updatedAt: Date
  processedAt?: Date                // When it was successfully processed
}

const NotificationQueueSchema = new Schema<INotificationQueue>(
  {
    queueId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    companyId: {
      type: String,
      required: true,
      index: true,
    },
    eventCode: {
      type: String,
      required: true,
      index: true,
    },
    recipientEmail: {
      type: String,
      required: true,
    },
    recipientType: {
      type: String,
      enum: ['EMPLOYEE', 'VENDOR', 'COMPANY_ADMIN', 'LOCATION_ADMIN', 'SYSTEM'],
      required: true,
    },
    subject: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    context: {
      type: Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    reason: {
      type: String,
      required: true,
    },
    scheduledFor: {
      type: Date,
      required: true,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    lastAttemptAt: {
      type: Date,
    },
    lastError: {
      type: String,
    },
    correlationId: {
      type: String,
      required: true,
      index: true,
    },
    processedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
)

// Compound index for efficient queue processing
NotificationQueueSchema.index({ status: 1, scheduledFor: 1 })
NotificationQueueSchema.index({ companyId: 1, status: 1 })

// Avoid OverwriteModelError in development with hot reloading
const NotificationQueue = mongoose.models.NotificationQueue || 
  mongoose.model<INotificationQueue>('NotificationQueue', NotificationQueueSchema)

export default NotificationQueue

