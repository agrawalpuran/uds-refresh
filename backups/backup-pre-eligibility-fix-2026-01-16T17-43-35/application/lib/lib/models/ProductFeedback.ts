import mongoose, { Schema, Document } from 'mongoose'

export interface IProductFeedback extends Document {
  orderId: string // Order ID reference
  productId: string // Product/Uniform ID
  uniformId?: string // String ID reference to Uniform (alphanumeric)
  employeeId: string // String ID reference to Employee (alphanumeric)
  employeeIdNum: string // String employee ID for correlation
  companyId: string // String ID reference to Company (alphanumeric)
  companyIdNum: number // Numeric company ID for backward compatibility
  vendorId?: string // String ID reference to Vendor (alphanumeric)
  rating: number // Rating from 1 to 5
  comment?: string // Optional feedback comment
  viewedBy?: string[] // Array of admin emails who have viewed this feedback
  viewedAt?: Date // Timestamp when feedback was first viewed by any admin
  createdAt?: Date
  updatedAt?: Date
}

const ProductFeedbackSchema = new Schema<IProductFeedback>(
  {
    orderId: {
      type: String,
      required: true,
      index: true,
    },
    productId: {
      type: String,
      required: true,
      // Index created via compound index below - don't use index: true here
    },
    uniformId: {
      type: String,
      required: false,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric if provided
          return !v || /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Uniform ID must be alphanumeric (1-50 characters)'
      }
    },
    employeeId: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric (1-50 characters)
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Employee ID must be alphanumeric (1-50 characters)'
      }
    },
    employeeIdNum: {
      type: String,
      required: true,
      index: true,
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
    companyIdNum: {
      type: Number,
      required: true,
      index: true,
    },
    vendorId: {
      type: String,
      required: false,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric if provided
          return !v || /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Vendor ID must be alphanumeric (1-50 characters)'
      }
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be an integer between 1 and 5',
      },
    },
    comment: {
      type: String,
      maxlength: 2000,
    },
    viewedBy: {
      type: [String],
      default: [],
      index: true,
    },
    viewedAt: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
  }
)

// Compound indexes for efficient queries
ProductFeedbackSchema.index({ employeeId: 1, companyId: 1 })
// Unique constraint: one feedback per product per order per employee
ProductFeedbackSchema.index({ orderId: 1, productId: 1, employeeId: 1 }, { unique: true })
ProductFeedbackSchema.index({ productId: 1, vendorId: 1 })
ProductFeedbackSchema.index({ companyId: 1, createdAt: -1 })

const ProductFeedback = mongoose.models.ProductFeedback || mongoose.model<IProductFeedback>('ProductFeedback', ProductFeedbackSchema)

export default ProductFeedback

