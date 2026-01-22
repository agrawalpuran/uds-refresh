import mongoose, { Schema, Document } from 'mongoose'

export interface IGRNItem {
  productCode: string // Numeric product code
  size: string
  orderedQuantity: number // Quantity ordered (snapshot from PR)
  deliveredQuantity: number // Quantity delivered (snapshot from PR)
  rejectedQuantity: number // Quantity rejected (default: 0)
  condition: 'ACCEPTED' | 'PARTIAL' | 'REJECTED' // Item condition
  remarks?: string // Item-level remarks
}

export interface IGRN extends Document {
  id: string // System-generated numeric ID (6-10 digits)
  grnId?: string // Alias for id (auto-set by pre-save hook)
  grnNumber: string // Company-specific reference number (non-unique)
  companyId: string // Numeric company ID (not ObjectId)
  vendorId: string // 6-digit numeric vendor ID
  poNumber: string // PO number this GRN is for
  prNumbers: string[] // Array of PR numbers (derived from PO)
  items: IGRNItem[] // GRN items (snapshot from PRs at creation)
  /** @deprecated Use unified_grn_status instead. Cleanup Phase: 5, Flag: FEATURE_FLAG_REMOVE_OLD_FIELDS */
  status: 'CREATED' | 'ACKNOWLEDGED' | 'INVOICED' | 'RECEIVED' | 'CLOSED' // GRN status (extended)
  createdBy: string // Numeric user ID (not ObjectId)
  // Vendor-led workflow fields (incremental, all optional for backward compatibility)
  grnRaisedByVendor?: boolean // Whether GRN was raised by vendor (default: false)
  grnAcknowledgedByCompany?: boolean // Whether GRN was acknowledged by company admin (default: false)
  grnAcknowledgedDate?: Date // Date of acknowledgment
  grnAcknowledgedBy?: string // Company admin ID/name who acknowledged
  invoiceId?: string // Linked invoice ID (nullable)
  remarks?: string // GRN-level remarks (optional)
  // Simple GRN Approval Workflow (incremental, additive)
  /** @deprecated Use unified_grn_status instead. Cleanup Phase: 5, Flag: FEATURE_FLAG_REMOVE_OLD_FIELDS */
  grnStatus?: 'RAISED' | 'APPROVED' // Simple approval status (default: RAISED)
  approvedBy?: string // Company admin identifier who approved (optional)
  approvedAt?: Date // Timestamp of approval (optional)
  // ============================================================================
  // UNIFIED STATUS FIELDS (Workflow Unification - Dual-Write)
  // ============================================================================
  unified_grn_status?: string // Unified GRN status (DRAFT, RAISED, PENDING_APPROVAL, APPROVED, INVOICED, CLOSED)
  unified_grn_status_updated_at?: Date // Timestamp of last unified status update
  unified_grn_status_updated_by?: string // User who last updated unified status
  createdAt?: Date
  updatedAt?: Date
}

const GRNItemSchema = new Schema<IGRNItem>({
  productCode: {
    type: String,
    required: true,
    trim: true,
  },
  size: {
    type: String,
    required: true,
  },
  orderedQuantity: {
    type: Number,
    required: true,
    min: 0,
  },
  deliveredQuantity: {
    type: Number,
    required: true,
    min: 0,
  },
  rejectedQuantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  condition: {
    type: String,
    enum: ['ACCEPTED', 'PARTIAL', 'REJECTED'],
    required: true,
  },
  remarks: {
    type: String,
    required: false,
    trim: true,
    maxlength: 1000,
  },
})

const GRNSchema = new Schema<IGRN>(
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
        message: 'GRN ID must be a 6-10 digit numeric string'
      }
    },
    grnId: {
      type: String,
      required: false,
      // Alias for id - will be set to same value as id by pre-save hook
    },
    grnNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      // NOT unique - GRN numbers can repeat (business requirement)
      index: true, // Non-unique index for querying
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
    poNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      // Index defined below via schema.index()
    },
    prNumbers: {
      type: [String],
      required: true,
      default: [],
    },
    items: {
      type: [GRNItemSchema],
      required: true,
    },
    status: {
      type: String,
      enum: ['CREATED', 'ACKNOWLEDGED', 'INVOICED', 'RECEIVED', 'CLOSED'],
      default: 'CREATED',
      required: true,
      // Index defined below via schema.index() (compound indexes include status)
    },
    createdBy: {
      type: String,
      required: true,
      // Numeric user ID (not ObjectId)
      validate: {
        validator: function(v: string) {
          return /^\d+$/.test(v)
        },
        message: 'Created by must be a numeric user ID'
      }
    },
    // Vendor-led workflow fields (incremental, all optional for backward compatibility)
    grnRaisedByVendor: {
      type: Boolean,
      default: false,
      index: true,
    },
    grnAcknowledgedByCompany: {
      type: Boolean,
      default: false,
      index: true,
    },
    grnAcknowledgedDate: {
      type: Date,
      required: false,
    },
    grnAcknowledgedBy: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
    },
    invoiceId: {
      type: String,
      required: false,
      index: true,
      // Numeric invoice ID (6-10 digits)
      validate: {
        validator: function(v: string) {
          return !v || /^\d{6,10}$/.test(v)
        },
        message: 'Invoice ID must be a 6-10 digit numeric string'
      }
    },
    remarks: {
      type: String,
      required: false,
      trim: true,
      maxlength: 2000,
    },
    // Simple GRN Approval Workflow (incremental, additive)
    grnStatus: {
      type: String,
      enum: ['RAISED', 'APPROVED'],
      default: 'RAISED',
      required: false,
      index: true,
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
  },
  {
    timestamps: true,
  }
)

// Compound indexes
GRNSchema.index({ companyId: 1, grnNumber: 1 }) // Non-unique index for querying GRN numbers by company
GRNSchema.index({ companyId: 1, status: 1 }) // Compound index for GRN status queries by company
GRNSchema.index({ vendorId: 1, status: 1 }) // Compound index for GRN status queries by vendor
GRNSchema.index({ poNumber: 1 }, { unique: true }) // UNIQUE: Exactly one GRN per PO
GRNSchema.index({ createdAt: -1 }) // Index for date-based queries
GRNSchema.index({ vendorId: 1, grnRaisedByVendor: 1 }) // Index for vendor-raised GRNs
GRNSchema.index({ status: 1, grnRaisedByVendor: 1 }) // Index for acknowledgment queries

// Pre-save hook to set grnId = id (alias for consistency)
GRNSchema.pre('save', function(next) {
  if (this.id) {
    this.grnId = this.id
  }
  next()
})

const GRN = mongoose.models.GRN || mongoose.model<IGRN>('GRN', GRNSchema)

export default GRN

