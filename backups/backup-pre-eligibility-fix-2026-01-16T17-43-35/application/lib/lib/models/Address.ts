import mongoose, { Schema, Document } from 'mongoose'

/**
 * Address Model
 * 
 * Standardized address structure for UDS application.
 * Used across: Vendors, Employees, Orders, Locations, Sites, Warehouses
 * 
 * Structure:
 * - address_line_1 (L1): House / Building / Street (REQUIRED)
 * - address_line_2 (L2): Area / Locality (OPTIONAL)
 * - address_line_3 (L3): Landmark / Additional info (OPTIONAL)
 * - city: City name (REQUIRED)
 * - state: State name (REQUIRED)
 * - pincode: Postal code (REQUIRED, 6 digits for India)
 * - country: Country name (DEFAULT: 'India')
 * 
 * This model ensures consistency across all address usage in UDS.
 */
export interface IAddress extends Document {
  address_line_1: string // L1: House / Building / Street (REQUIRED)
  address_line_2?: string // L2: Area / Locality (OPTIONAL)
  address_line_3?: string // L3: Landmark / Optional (OPTIONAL)
  city: string // City name (REQUIRED)
  state: string // State name (REQUIRED)
  pincode: string // Postal code (REQUIRED, 6 digits for India)
  country: string // Country name (DEFAULT: 'India')
  createdAt?: Date
  updatedAt?: Date
}

const AddressSchema = new Schema<IAddress>(
  {
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
          // Indian pincode: 6 digits
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
  },
  {
    timestamps: true,
  }
)

// Indexes for efficient queries
AddressSchema.index({ pincode: 1 })
AddressSchema.index({ city: 1, state: 1 })
AddressSchema.index({ state: 1 })

const Address = mongoose.models.Address || mongoose.model<IAddress>('Address', AddressSchema)

export default Address

