import mongoose, { Schema, Document } from 'mongoose'

/**
 * Location Model
 * 
 * Represents a delivery/operational location under a Company.
 * Each Location belongs to exactly ONE Company.
 * Each Location must have exactly ONE assigned Location Admin (employee).
 * 
 * Relationships:
 * - Location belongs to Company (companyId)
 * - Location has Location Admin (adminId - employee reference)
 * - Employees reference Location (via location_id in Employee model)
 */
export interface ILocation extends Document {
  id: string // Alphanumeric ID (e.g., "LOC-000001")
  name: string // Location name (e.g., "Mumbai Office", "Delhi Warehouse")
  companyId: string // String ID reference to Company (alphanumeric)
  adminId?: string // String ID reference to Employee (alphanumeric) - REQUIRED for proper location management
  // Structured address fields
  address_line_1: string // L1: House / Building / Street (REQUIRED)
  address_line_2?: string // L2: Area / Locality (OPTIONAL)
  address_line_3?: string // L3: Landmark / Additional info (OPTIONAL)
  city: string // City name (REQUIRED)
  state: string // State name (REQUIRED)
  pincode: string // Postal code (REQUIRED, 6 digits for India)
  country: string // Country name (DEFAULT: 'India')
  phone?: string // Optional contact phone
  email?: string // Optional contact email
  status: 'active' | 'inactive' // Location status
  createdAt?: Date
  updatedAt?: Date
}

const LocationSchema = new Schema<ILocation>(
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
      trim: true,
    },
    companyId: {
      type: String,
      required: true,
    },
    adminId: {
      type: String,
      required: false,

      // Optional: can be set later via updateLocation
      // Required for proper location management, but optional for initial creation
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
      trim: true,
    },
    email: {
      type: String,
      trim: true,
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

// Indexes for efficient queries
LocationSchema.index({ companyId: 1, status: 1 })
LocationSchema.index({ adminId: 1 })
LocationSchema.index({ companyId: 1, name: 1 }, { unique: true }) // Unique location name per company

const Location = mongoose.models.Location || mongoose.model<ILocation>('Location', LocationSchema)

export default Location

