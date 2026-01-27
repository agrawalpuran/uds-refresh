import mongoose, { Schema, Document } from 'mongoose'

/**
 * NotificationLog Model
 * 
 * Permanent audit trail of all emails sent for compliance and support.
 * Records every email notification attempt (success or failure).
 * 
 * This is a write-only log table for audit purposes.
 * Records should never be deleted (only archived if needed).
 */
export interface INotificationLog extends Document {
  logId: string // Numeric ID (6-12 digits, e.g., "950001")
  queueId: string // Foreign key → NotificationQueue.queueId (nullable if direct send)
  eventId: string // Foreign key → NotificationEvent.eventId
  recipientEmail: string // Email address of the recipient
  recipientType: 'EMPLOYEE' | 'VENDOR' | 'LOCATION_ADMIN' | 'COMPANY_ADMIN' | 'CUSTOM' // Type of recipient
  subject: string // Final email subject (after template merge)
  status: 'SENT' | 'FAILED' | 'BOUNCED' | 'REJECTED' // Final delivery status
  providerResponse?: any // JSON response from email provider (for debugging)
  providerMessageId?: string // Provider's message ID (for tracking)
  errorMessage?: string // Error message if status is FAILED/BOUNCED/REJECTED
  sentAt?: Date // Timestamp when email was actually sent
  deliveredAt?: Date // Timestamp when email was delivered (if available from provider)
  openedAt?: Date // Timestamp when email was opened (if tracking enabled)
  clickedAt?: Date // Timestamp when link was clicked (if tracking enabled)
  createdAt?: Date
  updatedAt?: Date
}

const NotificationLogSchema = new Schema<INotificationLog>(
  {
    logId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: function(v: string) {
          // Must be 6-12 digits
          return /^\d{6,12}$/.test(v)
        },
        message: 'Log ID must be a 6-12 digit numeric string (e.g., "950001")'
      }
    },
    queueId: {
      type: String,
      required: false,
      index: true,
      ref: 'NotificationQueue',
    },
    eventId: {
      type: String,
      required: true,
      index: true,
      ref: 'NotificationEvent',
    },
    recipientEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 255,
      index: true,
    },
    recipientType: {
      type: String,
      enum: ['EMPLOYEE', 'VENDOR', 'LOCATION_ADMIN', 'COMPANY_ADMIN', 'CUSTOM'],
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ['SENT', 'FAILED', 'BOUNCED', 'REJECTED'],
      required: true,
      index: true,
    },
    providerResponse: {
      type: Schema.Types.Mixed,
      required: false,
      // JSON response from email provider
    },
    providerMessageId: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
      index: true,
    },
    errorMessage: {
      type: String,
      required: false,
      maxlength: 1000,
    },
    sentAt: {
      type: Date,
      required: false,
      index: true,
    },
    deliveredAt: {
      type: Date,
      required: false,
      index: true,
    },
    openedAt: {
      type: Date,
      required: false,
      index: true,
    },
    clickedAt: {
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
NotificationLogSchema.index({ eventId: 1, status: 1 }) // For event-based reporting
NotificationLogSchema.index({ recipientEmail: 1, status: 1 }) // For recipient-based queries
NotificationLogSchema.index({ status: 1, sentAt: 1 }) // For delivery reports
// Note: queueId already has index: true in field definition, so no separate index needed
NotificationLogSchema.index({ createdAt: 1 }) // For time-based queries and archiving

// Delete existing model if it exists to force recompilation with new schema
if (mongoose.models.NotificationLog) {
  delete mongoose.models.NotificationLog
}

const NotificationLog = mongoose.model<INotificationLog>('NotificationLog', NotificationLogSchema)

export default NotificationLog

