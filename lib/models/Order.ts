import mongoose, { Schema, Document } from 'mongoose'

export interface IOrderItem {
  uniformId: string // String ID reference to Uniform (alphanumeric)
  productId: string // String product ID for correlation
  uniformName: string
  size: string
  quantity: number
  price: number
  // Shipment tracking fields (PR-level, backward compatible)
  dispatchedQuantity?: number // Quantity dispatched for this item (default: 0)
  deliveredQuantity?: number // Quantity delivered for this item (default: 0)
  itemShipmentStatus?: 'PENDING' | 'DISPATCHED' | 'DELIVERED' // Item-level shipment status
}

export interface IOrder extends Document {
  id: string
  employeeId: string // String ID reference to Employee (alphanumeric)
  employeeIdNum: string // String employee ID for correlation
  employeeName: string
  items: IOrderItem[]
  total: number
  /** @deprecated Use unified_status instead. Cleanup Phase: 5, Flag: FEATURE_FLAG_REMOVE_OLD_FIELDS */
  status: 'Awaiting approval' | 'Awaiting fulfilment' | 'Dispatched' | 'Delivered'
  orderDate: Date
  dispatchLocation: string
  companyId: string // String ID reference to Company (alphanumeric)
  companyIdNum: number // Numeric company ID for backward compatibility
  locationId?: string // String ID reference to Location (for location admin approval workflow)
  // Structured shipping address fields
  shipping_address_line_1: string // L1: House / Building / Street (REQUIRED)
  shipping_address_line_2?: string // L2: Area / Locality (OPTIONAL)
  shipping_address_line_3?: string // L3: Landmark / Additional info (OPTIONAL)
  shipping_city: string // City name (REQUIRED)
  shipping_state: string // State name (REQUIRED)
  shipping_pincode: string // Postal code (REQUIRED, 6 digits for India)
  shipping_country: string // Country name (DEFAULT: 'India')
  estimatedDeliveryTime: string
  parentOrderId?: string // ID of the parent order if this is a split order
  vendorId?: string // Vendor ID (alphanumeric string) if this order is for a specific vendor
  vendorName?: string // Vendor name for display
  isPersonalPayment?: boolean // Whether this is a personal payment order (beyond eligibility)
  personalPaymentAmount?: number // Amount paid personally (if isPersonalPayment is true)
  orderType?: 'NORMAL' | 'REPLACEMENT' // Order type: NORMAL (default) or REPLACEMENT (for returns)
  returnRequestId?: string // Reference to return request if this is a replacement order
  // ============================================================================
  // SOURCE TYPE FIELD (Post-Delivery Workflow Extension)
  // ============================================================================
  sourceType?: 'PR_PO' | 'MANUAL' // Order source: PR_PO (from PR→PO workflow) or MANUAL (direct order)
  // PR (Purchase Requisition) Extension Fields
  pr_number?: string // Client/customer generated PR number (unique per company)
  pr_date?: Date // Date PR was raised
  // NOTE: Legacy pr_status removed - use unified_pr_status instead
  site_admin_approved_by?: string // Site Admin who approved (String ID ref: Employee)
  site_admin_approved_at?: Date // Timestamp of Site Admin approval
  company_admin_approved_by?: string // Company Admin who approved (String ID ref: Employee)
  company_admin_approved_at?: Date // Timestamp of Company Admin approval
  // PR-Level Shipment Extension Fields (backward compatible, all nullable)
  shipmentId?: string // System-generated numeric shipment ID (nullable)
  shipmentReferenceNumber?: string // Shipment reference number (nullable)
  shipperName?: string // Shipper name (MANDATORY when marking SHIPPED)
  carrierName?: string // Carrier name (nullable)
  modeOfTransport?: 'ROAD' | 'AIR' | 'RAIL' | 'COURIER' | 'OTHER' // Mode of transport
  trackingNumber?: string // Tracking number (nullable)
  /** @deprecated Derived from unified_status. Cleanup Phase: 5, Flag: FEATURE_FLAG_REMOVE_OLD_FIELDS */
  dispatchStatus?: 'AWAITING_FULFILMENT' | 'SHIPPED' // Dispatch status (default: AWAITING_FULFILMENT)
  dispatchedDate?: Date // Date items were dispatched (nullable)
  expectedDeliveryDate?: Date // Expected delivery date (nullable)
  /** @deprecated Derived from unified_status. Cleanup Phase: 5, Flag: FEATURE_FLAG_REMOVE_OLD_FIELDS */
  deliveryStatus?: 'NOT_DELIVERED' | 'PARTIALLY_DELIVERED' | 'DELIVERED' // Delivery status (default: NOT_DELIVERED)
  deliveredDate?: Date // Date items were delivered (nullable)
  receivedBy?: string // Name of person who received delivery (nullable)
  deliveryRemarks?: string // Delivery remarks/notes (nullable)
  // Future logistics API integration fields (optional, non-breaking)
  logisticsProviderCode?: string // Logistics provider code (nullable)
  logisticsTrackingUrl?: string // Logistics tracking URL (nullable)
  logisticsPayloadRef?: string // Logistics payload reference (nullable)
  // Indent Extension Field
  indent_id?: string // String ID reference to IndentHeader (nullable for backward compatibility)
  // Test Order Fields
  isTestOrder?: boolean // Flag to mark test orders created by Super Admin
  createdBy?: string // Creator identifier (e.g., 'superadmin')
  locationAutoApproved?: boolean // Audit flag: whether Location Admin auto-approval was used
  // ============================================================================
  // UNIFIED STATUS FIELDS (Workflow Unification - Dual-Write)
  // ============================================================================
  unified_status?: string // Unified order status (CREATED, PENDING_APPROVAL, APPROVED, IN_FULFILMENT, DISPATCHED, DELIVERED, CANCELLED)
  unified_status_updated_at?: Date // Timestamp of last unified status update
  unified_status_updated_by?: string // User who last updated unified status
  unified_pr_status?: string // Unified PR status (DRAFT, PENDING_SITE_ADMIN_APPROVAL, SITE_ADMIN_APPROVED, etc.)
  unified_pr_status_updated_at?: Date // Timestamp of last unified PR status update
  unified_pr_status_updated_by?: string // User who last updated unified PR status
  rejection_reason?: string // Reason for rejection (if status is REJECTED)
  createdAt?: Date
  updatedAt?: Date
}

const OrderItemSchema = new Schema<IOrderItem>({
  uniformId: {
    type: String,
    required: true,
    validate: {
      validator: function(v: string) {
        // Must be alphanumeric (1-50 characters)
        return /^[A-Za-z0-9_-]{1,50}$/.test(v)
      },
      message: 'Uniform ID must be alphanumeric (1-50 characters)'
    }
  },
  productId: {
    type: String,
    required: true,
    // Note: productId is in a subdocument (OrderItemSchema), index not needed here
    // If needed, create compound index at OrderSchema level
  },
  uniformName: {
    type: String,
    required: true,
  },
  size: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  // Shipment tracking fields (backward compatible, all optional)
  dispatchedQuantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  deliveredQuantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  itemShipmentStatus: {
    type: String,
    enum: ['PENDING', 'DISPATCHED', 'DELIVERED'],
    default: 'PENDING',
  },
})

const OrderSchema = new Schema<IOrder>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      // Note: unique: true automatically creates an index, so index: true is redundant
    },
    // Note: employeeId doesn't need index: true because it's the first field in compound indexes below
    // MongoDB can use compound indexes for queries on just employeeId
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
    employeeName: {
      type: String,
      required: true,
    },
    items: {
      type: [OrderItemSchema],
      required: true,
    },
    total: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['Awaiting approval', 'Awaiting fulfilment', 'Dispatched', 'Delivered'],
      default: 'Awaiting approval',
      index: true,
    },
    orderDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    dispatchLocation: {
      type: String,
      required: true,
    },
    companyId: {
      type: String,
      required: true,
    },
    companyIdNum: {
      type: Number,
      required: true,
      index: true,
    },
    locationId: {
      type: String,
      required: false, // Optional for backward compatibility
      index: true, // Index for location admin approval queries
    },
    shipping_address_line_1: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    shipping_address_line_2: {
      type: String,
      required: false,
      trim: true,
      maxlength: 255,
    },
    shipping_address_line_3: {
      type: String,
      required: false,
      trim: true,
      maxlength: 255,
    },
    shipping_city: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    shipping_state: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    shipping_pincode: {
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
    shipping_country: {
      type: String,
      required: true,
      default: 'India',
      trim: true,
      maxlength: 50,
    },
    estimatedDeliveryTime: {
      type: String,
      required: true,
    },
    parentOrderId: {
      type: String,
      index: true,
    },
    vendorId: {
      type: String, // String to store alphanumeric vendor ID
      required: true, // vendorId is required for all orders
      index: true,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric (1-50 characters)
          return /^[A-Za-z0-9_-]{1,50}$/.test(v);
        },
        message: 'Vendor ID must be alphanumeric (1-50 characters)'
      }
    },
    vendorName: {
      type: String,
    },
    isPersonalPayment: {
      type: Boolean,
      default: false,
    },
    personalPaymentAmount: {
      type: Number,
      default: 0,
    },
    orderType: {
      type: String,
      enum: ['NORMAL', 'REPLACEMENT'],
      default: 'NORMAL',
      index: true,
    },
    returnRequestId: {
      type: String,
      index: true,
    },
    // ============================================================================
    // SOURCE TYPE FIELD (Post-Delivery Workflow Extension)
    // Determines whether order originated from PR→PO workflow or was created manually
    // This field is auto-populated during order creation based on company settings
    // ============================================================================
    sourceType: {
      type: String,
      enum: ['PR_PO', 'MANUAL'],
      required: false, // Optional for backward compatibility with existing orders
      index: true,
      // Default will be set in createOrder based on company.enable_pr_po_workflow
    },
    // PR (Purchase Requisition) Extension Fields
    pr_number: {
      type: String,
      required: false,
      trim: true,
      maxlength: 50,
      // Unique per company - handled via compound index below
    },
    pr_date: {
      type: Date,
      required: false,
    },
    // NOTE: Legacy pr_status field removed - use unified_pr_status instead
    site_admin_approved_by: {
      type: String,
      required: false,
      
    },
    site_admin_approved_at: {
      type: Date,
      required: false,
    },
    company_admin_approved_by: {
      type: String,
      required: false,
      
    },
    company_admin_approved_at: {
      type: Date,
      required: false,
    },
    // PR-Level Shipment Extension Fields (backward compatible, all nullable)
    shipmentId: {
      type: String,
      required: false,
      trim: true,
      maxlength: 50,
      // System-generated alphanumeric ID
      validate: {
        validator: function(v: string) {
          return !v || /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Shipment ID must be alphanumeric (1-50 characters)'
      }
    },
    shipmentReferenceNumber: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
    },
    shipperName: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
      // MANDATORY when dispatchStatus = SHIPPED (enforced in business logic, not schema)
    },
    carrierName: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
    },
    modeOfTransport: {
      type: String,
      enum: ['ROAD', 'AIR', 'RAIL', 'COURIER', 'OTHER'],
      required: false,
    },
    trackingNumber: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
    },
    dispatchStatus: {
      type: String,
      enum: ['AWAITING_FULFILMENT', 'SHIPPED'],
      default: 'AWAITING_FULFILMENT',
      required: false,
      index: true,
    },
    dispatchedDate: {
      type: Date,
      required: false,
    },
    expectedDeliveryDate: {
      type: Date,
      required: false,
    },
    deliveryStatus: {
      type: String,
      enum: ['NOT_DELIVERED', 'PARTIALLY_DELIVERED', 'DELIVERED'],
      default: 'NOT_DELIVERED',
      required: false,
      index: true,
    },
    deliveredDate: {
      type: Date,
      required: false,
    },
    receivedBy: {
      type: String,
      required: false,
      trim: true,
      maxlength: 200,
    },
    deliveryRemarks: {
      type: String,
      required: false,
      trim: true,
      maxlength: 1000,
    },
    // Future logistics API integration fields (optional, non-breaking)
    logisticsProviderCode: {
      type: String,
      required: false,
      trim: true,
      maxlength: 50,
    },
    logisticsTrackingUrl: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
    },
    logisticsPayloadRef: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
    },
    // Indent Extension Field
    indent_id: {
      type: String,
      required: false,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric if provided
          return !v || /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Indent ID must be alphanumeric (1-50 characters)'
      }
      // Index defined below via schema.index()
    },
    // Test Order Fields
    isTestOrder: {
      type: Boolean,
      required: false,
      default: false,
      index: true,
    },
    createdBy: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
    },
    locationAutoApproved: {
      type: Boolean,
      required: false,
      default: false,
    },
    // ============================================================================
    // UNIFIED STATUS FIELDS (Workflow Unification - Dual-Write)
    // These fields provide a unified status model across all workflow types.
    // They are updated alongside legacy fields for backward compatibility.
    // ============================================================================
    unified_status: {
      type: String,
      enum: ['CREATED', 'PENDING_APPROVAL', 'APPROVED', 'IN_FULFILMENT', 'DISPATCHED', 'DELIVERED', 'CANCELLED'],
      required: false,
      index: true,
    },
    unified_status_updated_at: {
      type: Date,
      required: false,
    },
    unified_status_updated_by: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
    },
    unified_pr_status: {
      type: String,
      enum: [
        'DRAFT',
        'PENDING_SITE_ADMIN_APPROVAL',
        'SITE_ADMIN_APPROVED',
        'PENDING_COMPANY_ADMIN_APPROVAL',
        'COMPANY_ADMIN_APPROVED',
        'REJECTED',
        'LINKED_TO_PO',
        'IN_SHIPMENT',
        'PARTIALLY_DELIVERED',
        'FULLY_DELIVERED',
        'CLOSED'
      ],
      required: false,
      index: true,
    },
    unified_pr_status_updated_at: {
      type: Date,
      required: false,
    },
    unified_pr_status_updated_by: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
    },
    rejection_reason: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
    strictPopulate: false, // Allow populating optional fields
  }
)

OrderSchema.index({ employeeId: 1, companyId: 1 })
OrderSchema.index({ employeeIdNum: 1, companyIdNum: 1 })
OrderSchema.index({ companyId: 1, status: 1 })
OrderSchema.index({ companyIdNum: 1, status: 1 })
OrderSchema.index({ orderDate: -1 })
// Note: id and vendorId already have index: true in schema definitions
// OrderSchema.index({ id: 1 }) // REMOVED: Duplicate of id: { index: true }
// OrderSchema.index({ vendorId: 1 }) // REMOVED: Duplicate of vendorId: { index: true }
OrderSchema.index({ parentOrderId: 1, vendorId: 1 }) // Compound index for split order queries
OrderSchema.index({ companyId: 1, pr_number: 1 }, { unique: true, sparse: true }) // Unique PR number per company (sparse: only index when pr_number exists)
// NOTE: Legacy pr_status indexes removed - using unified_pr_status indexes instead
OrderSchema.index({ indent_id: 1 }) // Index for indent-based order queries
OrderSchema.index({ dispatchStatus: 1, deliveryStatus: 1 }) // Compound index for shipment status queries
OrderSchema.index({ shipmentId: 1 }) // Index for shipment ID lookups
OrderSchema.index({ trackingNumber: 1 }) // Index for tracking number lookups
// Unified status indexes
OrderSchema.index({ unified_status: 1, companyId: 1 }) // Compound index for unified status queries by company
OrderSchema.index({ unified_pr_status: 1, companyId: 1 }) // Compound index for unified PR status queries by company

const Order = mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema)

export default Order

