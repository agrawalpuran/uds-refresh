import mongoose, { Schema, Document } from 'mongoose'

// Product-Company relationship (many-to-many)
export interface IProductCompany extends Document {
  productId: string // String ID reference to Uniform/Product (alphanumeric)
  companyId: string // String ID reference to Company (alphanumeric)
  createdAt?: Date
  updatedAt?: Date
}

const ProductCompanySchema = new Schema<IProductCompany>(
  {
    // Note: productId and companyId don't need index: true because they're the first fields in compound indexes below
    // MongoDB can use compound indexes for queries on just productId or companyId
    productId: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Product ID must be alphanumeric (1-50 characters)'
      }
    },
    companyId: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Company ID must be alphanumeric (1-50 characters)'
      }
    },
  },
  {
    timestamps: true,
    strictPopulate: false, // Allow populating optional fields
  }
)

// Compound index to ensure uniqueness
ProductCompanySchema.index({ productId: 1, companyId: 1 }, { unique: true })

// Product-Vendor relationship (many-to-many)
// This stores which vendor supplies which product
// Company access is validated via ProductCompany relationships
export interface IProductVendor extends Document {
  productId: string // String ID reference to Uniform/Product (alphanumeric)
  vendorId: string // String ID reference to Vendor (alphanumeric)
  createdAt?: Date
  updatedAt?: Date
}

const ProductVendorSchema = new Schema<IProductVendor>(
  {
    // Note: productId and vendorId don't need index: true because they're the first fields in compound indexes below
    // MongoDB can use compound indexes for queries on just productId or vendorId
    productId: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Product ID must be alphanumeric (1-50 characters)'
      }
    },
    vendorId: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Vendor ID must be alphanumeric (1-50 characters)'
      }
    },
  },
  {
    timestamps: true,
    strictPopulate: false, // Allow populating optional fields
  }
)

// Compound index to ensure uniqueness: product + vendor combination must be unique
ProductVendorSchema.index({ productId: 1, vendorId: 1 }, { unique: true })

// Vendor-Company relationship (many-to-many)
export interface IVendorCompany extends Document {
  vendorId: string // String ID reference to Vendor (alphanumeric)
  companyId: string // String ID reference to Company (alphanumeric)
  createdAt?: Date
  updatedAt?: Date
}

const VendorCompanySchema = new Schema<IVendorCompany>(
  {
    // Note: vendorId and companyId don't need index: true because they're the first fields in compound indexes below
    // MongoDB can use compound indexes for queries on just vendorId or companyId
    vendorId: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Vendor ID must be alphanumeric (1-50 characters)'
      }
    },
    companyId: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Company ID must be alphanumeric (1-50 characters)'
      }
    },
  },
  {
    timestamps: true,
    strictPopulate: false, // Allow populating optional fields
  }
)

VendorCompanySchema.index({ vendorId: 1, companyId: 1 }, { unique: true })

export const ProductCompany = mongoose.models.ProductCompany || mongoose.model<IProductCompany>('ProductCompany', ProductCompanySchema)
export const ProductVendor = mongoose.models.ProductVendor || mongoose.model<IProductVendor>('ProductVendor', ProductVendorSchema)
// VendorCompany model is kept for backward compatibility but relationships are now derived from ProductCompany + ProductVendor
// The model is not exported to prevent explicit creation/deletion of vendor-company relationships
const VendorCompany = mongoose.models.VendorCompany || mongoose.model<IVendorCompany>('VendorCompany', VendorCompanySchema)





