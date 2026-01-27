import mongoose, { Schema, Document } from 'mongoose'

/**
 * CompanyNotificationConfig Model
 * 
 * Stores company-specific notification settings.
 * Allows each company to:
 * - Enable/disable specific notification events
 * - Override default email templates with custom ones
 * - Set notification preferences (e.g., batch notifications, quiet hours)
 * 
 * If no config exists for a company, system defaults apply.
 */

// Event configuration for a company
export interface IEventConfig {
  eventCode: string           // Reference to NotificationEvent.eventCode
  isEnabled: boolean          // Whether this event is enabled for this company
  customSubject?: string      // Custom subject template (overrides default)
  customBody?: string         // Custom body template (overrides default)
  recipients?: string[]       // Additional CC recipients (emails)
}

export interface ICompanyNotificationConfig extends Document {
  id: string                  // Unique config ID (format: CNC-{companyId})
  companyId: string           // Reference to Company.id
  
  // Master switch
  notificationsEnabled: boolean   // Master switch to enable/disable all notifications
  
  // Event-specific configurations
  eventConfigs: IEventConfig[]
  
  // Global overrides
  ccEmails?: string[]         // Always CC these emails on all notifications
  bccEmails?: string[]        // Always BCC these emails
  
  // Company branding
  brandName?: string          // Override "UDS" with company name in emails
  brandColor?: string         // Primary color for email templates (hex)
  logoUrl?: string            // Company logo URL for email header
  
  // Preferences
  quietHoursEnabled?: boolean     // Enable quiet hours (no emails during specific times)
  quietHoursStart?: string        // Start time (HH:mm format, e.g., "22:00")
  quietHoursEnd?: string          // End time (HH:mm format, e.g., "08:00")
  quietHoursTimezone?: string     // Timezone for quiet hours (e.g., "Asia/Kolkata")
  
  // Audit
  createdBy?: string          // Who created this config
  updatedBy?: string          // Who last updated
  createdAt?: Date
  updatedAt?: Date
}

const EventConfigSchema = new Schema({
  eventCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  isEnabled: {
    type: Boolean,
    default: true,
  },
  customSubject: {
    type: String,
    trim: true,
    maxlength: 200,
  },
  customBody: {
    type: String,
    trim: true,
    maxlength: 50000, // Allow large HTML templates
  },
  recipients: [{
    type: String,
    trim: true,
    lowercase: true,
  }],
}, { _id: false })

const CompanyNotificationConfigSchema = new Schema<ICompanyNotificationConfig>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    companyId: {
      type: String,
      required: true,
      unique: true, // One config per company
      index: true,
    },
    notificationsEnabled: {
      type: Boolean,
      default: true,
      required: true,
    },
    eventConfigs: {
      type: [EventConfigSchema],
      default: [],
    },
    ccEmails: [{
      type: String,
      trim: true,
      lowercase: true,
    }],
    bccEmails: [{
      type: String,
      trim: true,
      lowercase: true,
    }],
    brandName: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    brandColor: {
      type: String,
      trim: true,
      match: /^#[0-9A-Fa-f]{6}$/,
    },
    logoUrl: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    quietHoursEnabled: {
      type: Boolean,
      default: false,
    },
    quietHoursStart: {
      type: String,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },
    quietHoursEnd: {
      type: String,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },
    quietHoursTimezone: {
      type: String,
      default: 'Asia/Kolkata',
    },
    createdBy: String,
    updatedBy: String,
  },
  {
    timestamps: true,
  }
)

// Indexes
// Note: companyId already has unique: true and index: true in field definition
CompanyNotificationConfigSchema.index({ 'eventConfigs.eventCode': 1 })

// Delete existing model if it exists
if (mongoose.models.CompanyNotificationConfig) {
  delete mongoose.models.CompanyNotificationConfig
}

const CompanyNotificationConfig = mongoose.model<ICompanyNotificationConfig>(
  'CompanyNotificationConfig',
  CompanyNotificationConfigSchema
)

export default CompanyNotificationConfig
