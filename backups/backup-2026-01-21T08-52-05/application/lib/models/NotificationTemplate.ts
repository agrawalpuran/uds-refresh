import mongoose, { Schema, Document } from 'mongoose'

/**
 * NotificationTemplate Model
 * 
 * Stores reusable email templates for each notification event.
 * Supports HTML and text templates with placeholder variables.
 * 
 * Templates can be customized per company, language, or event.
 * Placeholders like {{employeeName}}, {{prNumber}}, {{poNumber}} 
 * will be replaced during email generation.
 */
export interface INotificationTemplate extends Document {
  templateId: string // Numeric ID (6-12 digits, e.g., "600001")
  eventId: string // Foreign key → NotificationEvent.eventId
  templateName: string // Human-readable template name
  subjectTemplate: string // Email subject template with placeholders
  bodyTemplate: string // Email body template (HTML or text) with placeholders
  language: string // Language code (default: "en")
  isActive: boolean // Whether this template is active
  createdAt?: Date
  updatedAt?: Date
}

const NotificationTemplateSchema = new Schema<INotificationTemplate>(
  {
    templateId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: function(v: string) {
          // Must be 6-12 digits
          return /^\d{6,12}$/.test(v)
        },
        message: 'Template ID must be a 6-12 digit numeric string (e.g., "600001")'
      }
    },
    eventId: {
      type: String,
      required: true,
      index: true,
      ref: 'NotificationEvent',
    },
    templateName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    subjectTemplate: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    bodyTemplate: {
      type: String,
      required: true,
      // No maxlength - HTML templates can be large
    },
    language: {
      type: String,
      required: true,
      default: 'en',
      trim: true,
      maxlength: 10,
      index: true,
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
NotificationTemplateSchema.index({ eventId: 1, language: 1, isActive: 1 })
NotificationTemplateSchema.index({ eventId: 1, isActive: 1 })

// Delete existing model if it exists to force recompilation with new schema
if (mongoose.models.NotificationTemplate) {
  delete mongoose.models.NotificationTemplate
}

const NotificationTemplate = mongoose.model<INotificationTemplate>('NotificationTemplate', NotificationTemplateSchema)

export default NotificationTemplate

