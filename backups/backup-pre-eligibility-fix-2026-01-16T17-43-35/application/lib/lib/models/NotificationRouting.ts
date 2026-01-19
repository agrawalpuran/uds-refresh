import mongoose, { Schema, Document } from 'mongoose'

/**
 * NotificationRouting Model
 * 
 * Controls notification rules per company, per event.
 * Defines who receives emails for which events at the company level.
 * 
 * This allows fine-grained control over notification routing:
 * - Enable/disable notifications per company
 * - Configure recipient types per event
 * - Support custom email addresses
 */
export interface INotificationRouting extends Document {
  routingId: string // Alphanumeric ID (e.g., "ROUTE-000001")
  eventId: string // Foreign key → NotificationEvent.eventId
  companyId: string // String ID reference to Company (alphanumeric)
  sendToEmployee: boolean // Send to employee who raised the order/PR
  sendToVendor: boolean // Send to vendor assigned to the order
  sendToLocationAdmin: boolean // Send to location admin
  sendToCompanyAdmin: boolean // Send to company admin
  sendToCustomEmail?: string // Custom email address (nullable)
  isEnabled: boolean // Master switch to enable/disable this routing rule
  createdAt?: Date
  updatedAt?: Date
}

const NotificationRoutingSchema = new Schema<INotificationRouting>(
  {
    routingId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric (1-50 characters)
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Routing ID must be alphanumeric (1-50 characters)'
      }
    },
    eventId: {
      type: String,
      required: true,
      index: true,
      ref: 'NotificationEvent',
    },
    companyId: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric (1-50 characters)
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Company ID must be alphanumeric (1-50 characters)'
      }
    },
    sendToEmployee: {
      type: Boolean,
      default: false,
      required: true,
    },
    sendToVendor: {
      type: Boolean,
      default: false,
      required: true,
    },
    sendToLocationAdmin: {
      type: Boolean,
      default: false,
      required: true,
    },
    sendToCompanyAdmin: {
      type: Boolean,
      default: false,
      required: true,
    },
    sendToCustomEmail: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
      maxlength: 255,
      validate: {
        validator: function(v: string | undefined) {
          if (!v) return true // Optional field
          // Basic email validation
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
        },
        message: 'Custom email must be a valid email address'
      }
    },
    isEnabled: {
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
NotificationRoutingSchema.index({ eventId: 1, companyId: 1 }, { unique: true }) // One routing rule per event per company
NotificationRoutingSchema.index({ companyId: 1, isEnabled: 1 })
NotificationRoutingSchema.index({ eventId: 1, isEnabled: 1 })

// Delete existing model if it exists to force recompilation with new schema
if (mongoose.models.NotificationRouting) {
  delete mongoose.models.NotificationRouting
}

const NotificationRouting = mongoose.model<INotificationRouting>('NotificationRouting', NotificationRoutingSchema)

export default NotificationRouting

