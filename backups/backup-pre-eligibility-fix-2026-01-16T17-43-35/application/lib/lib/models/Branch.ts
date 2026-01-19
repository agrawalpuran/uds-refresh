import mongoose, { Schema, Document } from 'mongoose'
// Encryption removed: Branch data is NOT employee PII, should not be encrypted

export interface IBranch extends Document {
  id: string
  name: string
  // Structured address fields
  address_line_1: string // L1: House / Building / Street (REQUIRED)
  address_line_2?: string // L2: Area / Locality (OPTIONAL)
  address_line_3?: string // L3: Landmark / Additional info (OPTIONAL)
  city: string // City name (REQUIRED)
  state: string // State name (REQUIRED)
  pincode: string // Postal code (REQUIRED, 6 digits for India)
  country: string // Country name (DEFAULT: 'India')
  phone?: string
  email?: string
  companyId: string // String ID reference to Company (alphanumeric)
  adminId?: string // String ID reference to Employee (alphanumeric)
  status: 'active' | 'inactive'
  createdAt?: Date
  updatedAt?: Date
}

const BranchSchema = new Schema<IBranch>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      // Note: unique: true automatically creates an index, so index: true is redundant
    },
    name: {
      type: String,
      required: true,
    },
    address_line_1: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    address_line_2: {
      type: String,
      required: false,
      trim: true,
      maxlength: 255,
    },
    address_line_3: {
      type: String,
      required: false,
      trim: true,
      maxlength: 255,
    },
    city: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    state: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    pincode: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function(v: string) {
          return /^\d{6}$/.test(v)
        },
        message: 'Pincode must be exactly 6 digits (e.g., "110001")'
      },
    },
    country: {
      type: String,
      required: true,
      default: 'India',
      trim: true,
      maxlength: 50,
    },
    phone: {
      type: String,
    },
    email: {
      type: String,
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
    adminId: {
      type: String,
      required: false,
      
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
  },
  {
    timestamps: true,
  }
)

// Note: id, companyId, and adminId already have index: true in schema definitions
// BranchSchema.index({ id: 1 }) // REMOVED: Duplicate of id: { index: true }
// BranchSchema.index({ companyId: 1 }) // REMOVED: Duplicate of companyId: { index: true }
// BranchSchema.index({ adminId: 1 }) // REMOVED: Duplicate of adminId: { index: true }

// Encryption removed: Branch data is NOT employee PII
// Branch fields (address, phone, email) are stored and queried as plaintext

const Branch = mongoose.models.Branch || mongoose.model<IBranch>('Branch', BranchSchema)

export default Branch

