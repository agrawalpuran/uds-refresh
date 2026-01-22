import mongoose, { Schema, Document } from 'mongoose'

export interface IVendor extends Document {
  id: string
  name: string
  email: string
  phone: string
  logo: string
  website: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  theme: 'light' | 'dark' | 'custom'
  // Structured address fields (optional at interface level for backward compatibility)
  address_line_1?: string // L1: House / Building / Street
  address_line_2?: string // L2: Area / Locality (OPTIONAL)
  address_line_3?: string // L3: Landmark / Additional info (OPTIONAL)
  city?: string // City name
  state?: string // State name
  pincode?: string // Postal code (6 digits for India)
  country?: string // Country name (DEFAULT: 'India')
  // Compliance & Banking Details (optional at interface level for backward compatibility)
  registration_number?: string // Business registration number (OPTIONAL)
  gst_number?: string // GST Number (validated if provided)
  bank_name?: string // Bank name (OPTIONAL)
  branch_address?: string // Bank branch address (OPTIONAL)
  ifsc_code?: string // IFSC Code (OPTIONAL, standard format)
  account_number?: string // Bank account number (OPTIONAL)
  createdAt?: Date
  updatedAt?: Date
}

const VendorSchema = new Schema<IVendor>(
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
        message: 'Vendor ID must be alphanumeric (1-50 characters)'
      }
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    phone: {
      type: String,
      required: true,
    },
    logo: {
      type: String,
      required: true,
    },
    website: {
      type: String,
      required: true,
    },
    primaryColor: {
      type: String,
      required: true,
    },
    secondaryColor: {
      type: String,
      required: true,
    },
    accentColor: {
      type: String,
      required: true,
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'custom'],
      default: 'light',
    },
    address_line_1: {
      type: String,
      required: false, // Made optional at schema level - validation is done in API layer for new vendors
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
      required: false, // Made optional at schema level - validation is done in API layer for new vendors
      trim: true,
      maxlength: 100,
    },
    state: {
      type: String,
      required: false, // Made optional at schema level - validation is done in API layer for new vendors
      trim: true,
      maxlength: 100,
    },
    pincode: {
      type: String,
      required: false, // Made optional at schema level - validation is done in API layer for new vendors
      trim: true,
      validate: {
        validator: function(v: string) {
          // Allow empty values for backward compatibility
          if (!v || v.trim() === '') return true
          return /^\d{6}$/.test(v)
        },
        message: 'Pincode must be exactly 6 digits (e.g., "110001")'
      },
    },
    country: {
      type: String,
      required: false, // Made optional at schema level - validation is done in API layer for new vendors
      default: 'India',
      trim: true,
      maxlength: 50,
    },
    // Compliance & Banking Details
    registration_number: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
    },
    gst_number: {
      type: String,
      required: false, // Made optional at schema level - validation is done in API layer for new vendors
      trim: true,
      validate: {
        validator: function(v: string) {
          // Allow empty values (validation for new vendors done in API layer)
          if (!v || v.trim() === '') return true
          // GST Number format: 15 alphanumeric characters
          // Format: 2 digit state code + 10 character PAN + 1 entity code + 1 check digit + Z
          return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v)
        },
        message: 'GST Number must be a valid 15-character alphanumeric format (e.g., "22AAAAA0000A1Z5")'
      },
    },
    bank_name: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
    },
    branch_address: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
    },
    ifsc_code: {
      type: String,
      required: false,
      trim: true,
      validate: {
        validator: function(v: string) {
          // IFSC format: 4 letters (bank code) + 0 + 6 alphanumeric (branch code)
          if (!v || v.trim() === '') return true // Optional field - allow empty
          return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v)
        },
        message: 'IFSC Code must be a valid 11-character format (e.g., "SBIN0001234")'
      },
    },
    account_number: {
      type: String,
      required: false,
      trim: true,
      maxlength: 30,
    },
  },
  {
    timestamps: true,
  }
)

// Note: id field already has index: true in schema definition, so no need for explicit index here
// VendorSchema.index({ id: 1 }) // REMOVED: Duplicate of id: { index: true }
// Note: email has unique: true which automatically creates a unique index, so explicit index is duplicate
// VendorSchema.index({ email: 1 }) // REMOVED: Duplicate of email: { unique: true }

const Vendor = mongoose.models.Vendor || mongoose.model<IVendor>('Vendor', VendorSchema)

export default Vendor






