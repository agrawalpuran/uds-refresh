import mongoose, { Schema, Document } from 'mongoose'
import { encrypt, decrypt } from '../utils/encryption'

/**
 * NotificationSenderProfile Model
 * 
 * Stores "From" email profile and provider configuration per company.
 * Supports multiple email sender profiles per company for different use cases.
 * 
 * Provider configuration is encrypted for security (API keys, passwords, etc.).
 */
export interface INotificationSenderProfile extends Document {
  senderId: string // Alphanumeric ID (e.g., "SNDR-000001")
  companyId: string // String ID reference to Company (alphanumeric)
  senderName: string // Display name for "From" field (e.g., "UDS Support")
  senderEmail: string // "From" email address
  replyToEmail?: string // Reply-To email address (nullable, defaults to senderEmail)
  useDefaultProvider: boolean // Use system default email provider
  providerType?: 'SMTP' | 'SENDGRID' | 'SES' | 'MAILGUN' | 'CUSTOM' // Email provider type
  providerConfig?: any // Encrypted JSON configuration (API keys, credentials, etc.)
  isActive: boolean // Whether this sender profile is active
  createdAt?: Date
  updatedAt?: Date
}

const NotificationSenderProfileSchema = new Schema<INotificationSenderProfile>(
  {
    senderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric (1-50 characters)
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Sender ID must be alphanumeric (1-50 characters)'
      }
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
    senderName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    senderEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 255,
      validate: {
        validator: function(v: string) {
          // Basic email validation
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
        },
        message: 'Sender email must be a valid email address'
      }
    },
    replyToEmail: {
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
        message: 'Reply-To email must be a valid email address'
      }
    },
    useDefaultProvider: {
      type: Boolean,
      default: true,
      required: true,
    },
    providerType: {
      type: String,
      enum: ['SMTP', 'SENDGRID', 'SES', 'MAILGUN', 'CUSTOM'],
      required: false,
      index: true,
    },
    providerConfig: {
      type: Schema.Types.Mixed,
      required: false,
      // This will be encrypted before saving
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

// Pre-save hook: Encrypt providerConfig if it exists
NotificationSenderProfileSchema.pre('save', async function(next) {
  if (this.providerConfig && typeof this.providerConfig === 'object') {
    try {
      // Convert to JSON string and encrypt
      const configString = JSON.stringify(this.providerConfig)
      this.providerConfig = encrypt(configString)
    } catch (error) {
      return next(error as Error)
    }
  }
  next()
})

// Post-save/post-find hook: Decrypt providerConfig when retrieving
NotificationSenderProfileSchema.post(['findOne', 'find', 'findOneAndUpdate'], function(docs: any) {
  if (!docs) return
  
  const decryptDocs = (doc: any) => {
    if (doc && doc.providerConfig && typeof doc.providerConfig === 'string') {
      try {
        const decrypted = decrypt(doc.providerConfig)
        doc.providerConfig = JSON.parse(decrypted)
      } catch (error) {
        console.warn('Failed to decrypt providerConfig:', error)
        doc.providerConfig = null
      }
    }
  }
  
  if (Array.isArray(docs)) {
    docs.forEach(decryptDocs)
  } else {
    decryptDocs(docs)
  }
})

// Compound indexes
NotificationSenderProfileSchema.index({ companyId: 1, isActive: 1 })
NotificationSenderProfileSchema.index({ companyId: 1, senderEmail: 1 })

// Delete existing model if it exists to force recompilation with new schema
if (mongoose.models.NotificationSenderProfile) {
  delete mongoose.models.NotificationSenderProfile
}

const NotificationSenderProfile = mongoose.model<INotificationSenderProfile>('NotificationSenderProfile', NotificationSenderProfileSchema)

export default NotificationSenderProfile

