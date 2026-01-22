import mongoose, { Schema, Document } from 'mongoose'
import { encrypt, decrypt } from '../utils/encryption'

export interface IEmployee extends Document {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  designation: string
  gender: 'male' | 'female'
  location: string
  email: string
  mobile: string
  shirtSize: string
  pantSize: string
  shoeSize: string
  // Structured address fields
  address_line_1: string // L1: House / Building / Street (REQUIRED)
  address_line_2?: string // L2: Area / Locality (OPTIONAL)
  address_line_3?: string // L3: Landmark / Additional info (OPTIONAL)
  city: string // City name (REQUIRED)
  state: string // State name (REQUIRED)
  pincode: string // Postal code (REQUIRED, 6 digits for India)
  country: string // Country name (DEFAULT: 'India')
  companyId: string // String ID reference to Company (alphanumeric)
  companyName?: string // Optional - derived from companyId, stored for display only
  locationId?: string // String ID reference to Location (alphanumeric) - REQUIRED for new employees
  eligibility: {
    shirt: number
    pant: number
    shoe: number
    jacket: number
  }
  cycleDuration: {
    shirt: number // Duration in months
    pant: number
    shoe: number
    jacket: number
  }
  eligibilityResetDates?: {
    shirt?: Date // Date when shirt eligibility was last reset
    pant?: Date
    shoe?: Date
    jacket?: Date
  }
  dispatchPreference: 'direct' | 'central' | 'regional'
  status: 'active' | 'inactive'
  period: string
  dateOfJoining: Date
  createdAt?: Date
  updatedAt?: Date
}

const EmployeeSchema = new Schema<IEmployee>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      // Note: unique: true automatically creates an index, so index: true is redundant
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric (1-50 characters)
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Employee ID must be alphanumeric (1-50 characters)'
      }
    },
    employeeId: {
      type: String,
      required: true,
      unique: true,
      // Note: unique: true automatically creates an index, so index: true is redundant
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric (1-50 characters)
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Employee ID must be alphanumeric (1-50 characters)'
      }
    },
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    designation: {
      type: String,
      required: true,
    },
    gender: {
      type: String,
      enum: ['male', 'female'],
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      // Note: unique: true automatically creates an index, so index: true is redundant
    },
    mobile: {
      type: String,
      required: true,
    },
    shirtSize: {
      type: String,
      required: true,
    },
    pantSize: {
      type: String,
      required: true,
    },
    shoeSize: {
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
    // Note: companyId doesn't need index: true because it's the first field in compound indexes below
    // MongoDB can use compound indexes for queries on just companyId
    companyId: {
      type: String,
      required: true,
    },
    companyName: {
      type: String,
      required: false, // Optional - derived from companyId lookup, stored for display only
    },
    // Note: locationId doesn't need index: true because it's the first field in compound indexes below
    // MongoDB can use compound indexes for queries on just locationId
    locationId: {
      type: String,
      required: false,
      
      // Note: Optional for backward compatibility, but should be required for new employees
      // Validation will be enforced at service layer
    },
    eligibility: {
      shirt: { type: Number, required: true, default: 0 },
      pant: { type: Number, required: true, default: 0 },
      shoe: { type: Number, required: true, default: 0 },
      jacket: { type: Number, required: true, default: 0 },
    },
    cycleDuration: {
      shirt: { type: Number, required: true, default: 6 }, // Default 6 months
      pant: { type: Number, required: true, default: 6 },
      shoe: { type: Number, required: true, default: 6 },
      jacket: { type: Number, required: true, default: 12 }, // Default 12 months (1 year)
    },
    eligibilityResetDates: {
      shirt: { type: Date, required: false },
      pant: { type: Date, required: false },
      shoe: { type: Date, required: false },
      jacket: { type: Date, required: false },
    },
    dispatchPreference: {
      type: String,
      enum: ['direct', 'central', 'regional'],
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    period: {
      type: String,
      required: true,
    },
    dateOfJoining: {
      type: Date,
      required: true,
      default: () => new Date('2025-10-01T00:00:00.000Z'),
    },
  },
  {
    timestamps: true,
    strictPopulate: false, // Allow populating fields that may not be strictly defined
  }
)

EmployeeSchema.index({ companyId: 1, status: 1 })
// Note: email, id, and employeeId already have index: true in schema definitions
// EmployeeSchema.index({ email: 1 }) // REMOVED: Duplicate of email: { index: true }
// EmployeeSchema.index({ id: 1 }) // REMOVED: Duplicate of id: { index: true }
// EmployeeSchema.index({ employeeId: 1 }) // REMOVED: Duplicate of employeeId: { index: true }
EmployeeSchema.index({ locationId: 1, status: 1 }) // For Location Admin queries
EmployeeSchema.index({ companyId: 1, locationId: 1 }) // For company-location employee queries

// Encrypt sensitive fields before saving
EmployeeSchema.pre('save', function (next) {
  // Encrypt sensitive PII fields
  const sensitiveFields: (keyof IEmployee)[] = ['email', 'mobile', 'firstName', 'lastName', 'designation']
  // Address fields are encrypted separately below
  
  for (const field of sensitiveFields) {
    if (this[field] && typeof this[field] === 'string') {
      // Only encrypt if not already encrypted (doesn't contain ':')
      let value = this[field] as string
      if (value && !value.includes(':')) {
        // CRITICAL FIX: Normalize email before encryption to ensure login matching works
        // Email must be trimmed and lowercased to match login normalization
        if (field === 'email') {
          value = value.trim().toLowerCase()
        }
        // Normalize other fields (trim whitespace) for consistency
        else {
          value = value.trim()
        }
        this[field] = encrypt(value) as any
      }
    }
  }
  
  // Encrypt address fields (address_line_1, address_line_2, address_line_3, city, state, pincode)
  const addressFields: (keyof IEmployee)[] = ['address_line_1', 'address_line_2', 'address_line_3', 'city', 'state', 'pincode']
  for (const field of addressFields) {
    if (this[field] && typeof this[field] === 'string') {
      let value = this[field] as string
      if (value && !value.includes(':')) {
        value = value.trim()
        this[field] = encrypt(value) as any
      }
    }
  }
  
  next()
})

// SECURITY: Decryption removed from backend - data is now decrypted only in frontend
// This ensures encrypted data remains encrypted in database and API responses
// Decryption happens client-side for authorized users (Location Admin, Company Admin, Employee themselves)

const Employee = mongoose.models.Employee || mongoose.model<IEmployee>('Employee', EmployeeSchema)

export default Employee

