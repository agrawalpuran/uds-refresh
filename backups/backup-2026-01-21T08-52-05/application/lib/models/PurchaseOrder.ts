import mongoose, { Schema, Document } from 'mongoose'

export interface IPurchaseOrder extends Document {
  id: string // Unique identifier (alphanumeric)
  companyId: string // String ID reference to Company (alphanumeric)
  vendorId: string // Vendor alphanumeric ID
  client_po_number: string // Client/customer generated PO number (NOT unique - can repeat)
  po_date: Date // Date PO was created
  /** @deprecated Use unified_po_status instead. Cleanup Phase: 5, Flag: FEATURE_FLAG_REMOVE_OLD_FIELDS */
  po_status: 'CREATED' | 'SENT_TO_VENDOR' | 'ACKNOWLEDGED' | 'IN_FULFILMENT' | 'COMPLETED' | 'CANCELLED' // PO status
  created_by_user_id: string // String ID reference to Employee (alphanumeric)
  // ============================================================================
  // UNIFIED STATUS FIELDS (Workflow Unification - Dual-Write)
  // ============================================================================
  unified_po_status?: string // Unified PO status (CREATED, SENT_TO_VENDOR, ACKNOWLEDGED, IN_FULFILMENT, PARTIALLY_SHIPPED, FULLY_SHIPPED, PARTIALLY_DELIVERED, FULLY_DELIVERED, CLOSED, CANCELLED)
  unified_po_status_updated_at?: Date // Timestamp of last unified status update
  unified_po_status_updated_by?: string // User who last updated unified status
  createdAt?: Date
  updatedAt?: Date
}

const PurchaseOrderSchema = new Schema<IPurchaseOrder>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
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
    vendorId: {
      type: String,
      required: true,
      index: true,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric (1-50 characters)
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Vendor ID must be alphanumeric (1-50 characters)'
      }
    },
    client_po_number: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      // NOT unique - PO numbers can repeat (business requirement)
      index: true, // Non-unique index for querying, but NOT unique constraint
    },
    po_date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    po_status: {
      type: String,
      enum: ['CREATED', 'SENT_TO_VENDOR', 'ACKNOWLEDGED', 'IN_FULFILMENT', 'COMPLETED', 'CANCELLED'],
      default: 'CREATED',
      required: true,
      index: true,
    },
    created_by_user_id: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric (1-50 characters)
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'User ID must be alphanumeric (1-50 characters)'
      }
    },
  },
  {
    timestamps: true,
  }
)

// Compound indexes
// NOTE: Removed unique constraint on (companyId, client_po_number) - PO numbers can repeat per business requirement
PurchaseOrderSchema.index({ companyId: 1, client_po_number: 1 }) // Non-unique index for querying PO numbers by company
PurchaseOrderSchema.index({ companyId: 1, po_status: 1 }) // Compound index for PO status queries by company
PurchaseOrderSchema.index({ vendorId: 1, po_status: 1 }) // Compound index for PO status queries by vendor
PurchaseOrderSchema.index({ po_date: -1 }) // Index for date-based queries

const PurchaseOrder = mongoose.models.PurchaseOrder || mongoose.model<IPurchaseOrder>('PurchaseOrder', PurchaseOrderSchema)

export default PurchaseOrder

