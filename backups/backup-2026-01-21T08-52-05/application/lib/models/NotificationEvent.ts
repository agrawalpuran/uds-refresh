import mongoose, { Schema, Document } from 'mongoose'

/**
 * NotificationEvent Model
 * 
 * Master list of all notification events/triggers in the UDS system.
 * Defines all possible events that can trigger email notifications.
 * 
 * This is a system-wide master list that should be populated with
 * all workflow events during system initialization.
 */
export interface INotificationEvent extends Document {
  eventId: string // Numeric ID (6-12 digits, e.g., "500001")
  eventCode: string // Unique event code (e.g., "PR_CREATED", "PO_GENERATED")
  eventDescription: string // Human-readable description
  defaultRecipientType: 'EMPLOYEE' | 'VENDOR' | 'LOCATION_ADMIN' | 'COMPANY_ADMIN' | 'SYSTEM' // Default recipient type
  isActive: boolean // Whether this event is active in the system
  createdAt?: Date
  updatedAt?: Date
}

const NotificationEventSchema = new Schema<INotificationEvent>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: function(v: string) {
          // Must be 6-12 digits
          return /^\d{6,12}$/.test(v)
        },
        message: 'Event ID must be a 6-12 digit numeric string (e.g., "500001")'
      }
    },
    eventCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      uppercase: true,
      maxlength: 50,
      validate: {
        validator: function(v: string) {
          // Alphanumeric with underscores
          return /^[A-Z0-9_]+$/.test(v)
        },
        message: 'Event code must be alphanumeric with underscores only (e.g., "PR_CREATED")'
      }
    },
    eventDescription: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    defaultRecipientType: {
      type: String,
      enum: ['EMPLOYEE', 'VENDOR', 'LOCATION_ADMIN', 'COMPANY_ADMIN', 'SYSTEM'],
      required: true,
      default: 'EMPLOYEE',
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
)

// Compound indexes
NotificationEventSchema.index({ eventCode: 1, isActive: 1 })
NotificationEventSchema.index({ defaultRecipientType: 1, isActive: 1 })

// Delete existing model if it exists to force recompilation with new schema
if (mongoose.models.NotificationEvent) {
  delete mongoose.models.NotificationEvent
}

const NotificationEvent = mongoose.model<INotificationEvent>('NotificationEvent', NotificationEventSchema)

export default NotificationEvent

