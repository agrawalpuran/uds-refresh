import mongoose, { Schema, Document } from 'mongoose'

export interface IInvoiceItem {
  productCode: string
  productName?: string
  size?: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface IInvoice extends Document {
  id: string // System-generated numeric ID (6-10 digits)
  invoiceId?: string // Alias for id (auto-set by pre-save hook)
  invoiceNumber: string // System-generated invoice number (internal to UDS)
  invoiceDate: Date // System-generated invoice date (internal to UDS)
  vendorInvoiceNumber: string // Vendor-provided invoice number (required, vendor-entered)
  vendorInvoiceDate: Date // Vendor-provided invoice date (required, vendor-entered)
  vendorId: string // 6-digit numeric vendor ID
  companyId: string // Numeric company ID (not ObjectId)
  grnId: string // GRN ID this invoice is for (unique: one invoice per GRN)
  grnNumber: string // GRN number (for reference)
  grnApprovedDate?: Date // GRN approval date
  poNumber: string // PO number (for reference)
  prNumbers: string[] // Array of PR numbers associated with the PO
  invoiceItems: IInvoiceItem[] // Invoice line items (derived from GRN/PR items)
  invoiceAmount: number // Total invoice amount
  invoiceStatus: 'RAISED' | 'APPROVED' // Invoice status
  raisedBy: string // Vendor ID who raised the invoice
  approvedBy?: string // Company admin identifier who approved (nullable)
  approvedAt?: Date // Timestamp of approval (nullable)
  remarks?: string // Invoice remarks (optional)
  taxAmount?: number // Tax or additional charges (optional)
  createdAt?: Date
  updatedAt?: Date
}

const InvoiceItemSchema = new Schema<IInvoiceItem>({
  productCode: {
    type: String,
    required: true,
    trim: true,
  },
  productName: {
    type: String,
    required: false,
    trim: true,
  },
  size: {
    type: String,
    required: false,
    trim: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  lineTotal: {
    type: Number,
    required: true,
    min: 0,
  },
})

const InvoiceSchema = new Schema<IInvoice>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      // System-generated numeric ID (6-10 digits)
      validate: {
        validator: function(v: string) {
          return /^\d{6,10}$/.test(v)
        },
        message: 'Invoice ID must be a 6-10 digit numeric string'
      }
    },
    invoiceId: {
      type: String,
      required: false,
      // Alias for id - will be set to same value as id by pre-save hook
    },
    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      // System-generated invoice number (internal to UDS)
      // NOT unique - invoice numbers can repeat (business requirement)
      index: true, // Non-unique index for querying
    },
    invoiceDate: {
      type: Date,
      required: true,
      // System-generated invoice date (internal to UDS)
    },
    vendorInvoiceNumber: {
      type: String,
      required: false, // Optional for backward compatibility, but validated in application logic
      trim: true,
      maxlength: 50,
      // Vendor-provided invoice number (required for new invoices, vendor-entered)
      // NOT unique - vendor invoice numbers can repeat
    },
    vendorInvoiceDate: {
      type: Date,
      required: false, // Optional for backward compatibility, but validated in application logic
      // Vendor-provided invoice date (required for new invoices, vendor-entered)
    },
    vendorId: {
      type: String,
      required: true,
      index: true,
      // Alphanumeric vendor ID
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
      index: true,
      // Numeric company ID (not ObjectId)
      validate: {
        validator: function(v: string) {
          return /^\d+$/.test(v)
        },
        message: 'Company ID must be a numeric string'
      }
    },
    grnId: {
      type: String,
      required: true,
      unique: true, // UNIQUE: Exactly one Invoice per GRN
      index: true,
      // Numeric GRN ID (6-10 digits)
      validate: {
        validator: function(v: string) {
          return /^\d{6,10}$/.test(v)
        },
        message: 'GRN ID must be a 6-10 digit numeric string'
      }
    },
    grnNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    grnApprovedDate: {
      type: Date,
      required: false,
    },
    poNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      index: true,
    },
    prNumbers: {
      type: [String],
      required: true,
      default: [],
    },
    invoiceItems: {
      type: [InvoiceItemSchema],
      required: true,
      default: [],
    },
    invoiceAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    invoiceStatus: {
      type: String,
      enum: ['RAISED', 'APPROVED'],
      default: 'RAISED',
      required: true,
      index: true,
    },
    raisedBy: {
      type: String,
      required: true,
      // Vendor ID who raised the invoice
    },
    approvedBy: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
    },
    approvedAt: {
      type: Date,
      required: false,
    },
    remarks: {
      type: String,
      required: false,
      trim: true,
      maxlength: 2000,
    },
    taxAmount: {
      type: Number,
      required: false,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
)

// Compound indexes
InvoiceSchema.index({ companyId: 1, invoiceNumber: 1 }) // Non-unique index for querying invoice numbers by company
InvoiceSchema.index({ companyId: 1, invoiceStatus: 1 }) // Compound index for invoice status queries by company
InvoiceSchema.index({ vendorId: 1, invoiceStatus: 1 }) // Compound index for invoice status queries by vendor
InvoiceSchema.index({ invoiceDate: -1 }) // Index for date-based queries
InvoiceSchema.index({ vendorId: 1, createdAt: -1 }) // Index for vendor invoice queries

// Pre-save hook to set invoiceId = id (alias for consistency)
InvoiceSchema.pre('save', function(next) {
  if (this.id) {
    this.invoiceId = this.id
  }
  next()
})

const Invoice = mongoose.models.Invoice || mongoose.model<IInvoice>('Invoice', InvoiceSchema)

export default Invoice

