import mongoose, { Schema, Document } from 'mongoose'

export interface IGoodsReceiptNote extends Document {
  id: string
  vendor_indent_id: string // String ID reference to VendorIndent (alphanumeric)
  vendor_id: string // String ID reference to Vendor (alphanumeric)
  grn_number: string
  grn_date: Date
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  remarks?: string
  createdAt?: Date
  updatedAt?: Date
}

const GoodsReceiptNoteSchema = new Schema<IGoodsReceiptNote>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    vendor_indent_id: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric (1-50 characters)
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Vendor Indent ID must be alphanumeric (1-50 characters)'
      }
    },
    vendor_id: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric (1-50 characters)
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Vendor ID must be alphanumeric (1-50 characters)'
      }
    },
    grn_number: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      unique: true,
      index: true,
    },
    grn_date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'],
      default: 'DRAFT',
      required: true,
      index: true,
    },
    remarks: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
)

// Indexes for efficient queries
GoodsReceiptNoteSchema.index({ vendor_indent_id: 1 })
GoodsReceiptNoteSchema.index({ vendor_id: 1, status: 1 })

const GoodsReceiptNote =
  mongoose.models.GoodsReceiptNote ||
  mongoose.model<IGoodsReceiptNote>('GoodsReceiptNote', GoodsReceiptNoteSchema)

export default GoodsReceiptNote

