import mongoose, { Schema, Document } from 'mongoose'

export interface ICompany extends Document {
  id: string
  name: string
  logo: string
  website: string
  primaryColor: string
  secondaryColor?: string
  showPrices: boolean
  allowPersonalPayments: boolean
  allowPersonalAddressDelivery: boolean // Company-level config: allow employees to use personal address for delivery
  enableEmployeeOrder: boolean // Company-level config: control whether employees can log in and place orders
  allowLocationAdminViewFeedback: boolean // Company-level config: control whether Location Admins can view product feedback
  allowEligibilityConsumptionReset: boolean // Company-level config: allow reset of consumed eligibility when refreshing designation eligibility
  // PR → PO Workflow Configuration
  enable_pr_po_workflow?: boolean // Enables PR → Approval → PO flow
  // NEW: Renamed flags for clarity
  enable_site_admin_pr_approval?: boolean // Enables Site Admin approval for PR (Order level)
  require_company_admin_po_approval?: boolean // Enables Company Admin approval at PO creation stage
  allow_multi_pr_po?: boolean // Allows grouping multiple PRs into one PO
  // DEPRECATED: Old flag names (kept for backward compatibility, will be removed in future)
  enable_site_admin_approval?: boolean // @deprecated Use enable_site_admin_pr_approval instead
  require_company_admin_approval?: boolean // @deprecated Use require_company_admin_po_approval instead
  // Shipping Configuration
  shipmentRequestMode?: 'MANUAL' | 'AUTOMATIC' // Shipment request mode (company-level, default: MANUAL)
  adminId?: string // String ID reference to Employee (alphanumeric)
  // Structured address fields
  address_line_1?: string // L1: House / Building / Street (OPTIONAL)
  address_line_2?: string // L2: Area / Locality (OPTIONAL)
  address_line_3?: string // L3: Landmark / Additional info (OPTIONAL)
  city?: string // City name (OPTIONAL)
  state?: string // State name (OPTIONAL)
  pincode?: string // Postal code (OPTIONAL, 6 digits for India)
  country?: string // Country name (DEFAULT: 'India')
  createdAt?: Date
  updatedAt?: Date
}

const CompanySchema = new Schema<ICompany>(
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
      default: '#f76b1c', // Default orange color
    },
    showPrices: {
      type: Boolean,
      default: false,
      required: true,
    },
    allowPersonalPayments: {
      type: Boolean,
      default: false,
      required: true,
    },
    allowPersonalAddressDelivery: {
      type: Boolean,
      default: false, // Default: false for backward compatibility (only official location delivery)
      required: true,
    },
    enableEmployeeOrder: {
      type: Boolean,
      default: false, // Default: false - employees cannot log in/place orders unless enabled
      required: true,
    },
    allowLocationAdminViewFeedback: {
      type: Boolean,
      default: false, // Default: false - Location Admins cannot view feedback unless enabled
      required: true,
    },
    allowEligibilityConsumptionReset: {
      type: Boolean,
      default: false, // Default: false - consumed eligibility reset is disabled by default
      required: true,
    },
    // PR → PO Workflow Configuration
    enable_pr_po_workflow: {
      type: Boolean,
      default: false, // Default: false - workflow disabled by default for backward compatibility
      required: false,
    },
    // NEW: Renamed flags for clarity
    enable_site_admin_pr_approval: {
      type: Boolean,
      default: true, // Default: true - Site Admin PR approval enabled when workflow is active
      required: false,
    },
    require_company_admin_po_approval: {
      type: Boolean,
      default: true, // Default: true - Company Admin PO approval required when workflow is active
      required: false,
    },
    allow_multi_pr_po: {
      type: Boolean,
      default: true, // Default: true - allows grouping multiple PRs into one PO
      required: false,
    },
    // Shipping Configuration
    shipmentRequestMode: {
      type: String,
      enum: ['MANUAL', 'AUTOMATIC'],
      default: 'MANUAL', // Default: MANUAL for backward compatibility
      required: false,
      index: true,
    },
    // DEPRECATED: Old flag names (kept for backward compatibility)
    enable_site_admin_approval: {
      type: Boolean,
      default: true, // Default: true - kept for backward compatibility
      required: false,
    },
    require_company_admin_approval: {
      type: Boolean,
      default: true, // Default: true - kept for backward compatibility
      required: false,
    },
    adminId: {
      type: String,
      required: false,
      
    },
    address_line_1: {
      type: String,
      required: false,
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
      required: false,
      trim: true,
      maxlength: 100,
    },
    state: {
      type: String,
      required: false,
      trim: true,
      maxlength: 100,
    },
    pincode: {
      type: String,
      required: false,
      trim: true,
      validate: {
        validator: function(v: string) {
          return !v || /^\d{6}$/.test(v)
        },
        message: 'Pincode must be exactly 6 digits (e.g., "110001")'
      },
    },
    country: {
      type: String,
      required: false,
      default: 'India',
      trim: true,
      maxlength: 50,
    },
  },
  {
    timestamps: true,
  }
)

// Pre-save hook: Migrate old flag values to new flag names for backward compatibility
CompanySchema.pre('save', function(next) {
  // If new flags are not set but old flags are, migrate the values
  if (this.isNew || this.isModified('enable_site_admin_approval') || this.isModified('require_company_admin_approval')) {
    // Migrate enable_site_admin_approval → enable_site_admin_pr_approval
    if (this.enable_site_admin_approval !== undefined && this.enable_site_admin_pr_approval === undefined) {
      this.enable_site_admin_pr_approval = this.enable_site_admin_approval
    }
    // Migrate require_company_admin_approval → require_company_admin_po_approval
    if (this.require_company_admin_approval !== undefined && this.require_company_admin_po_approval === undefined) {
      this.require_company_admin_po_approval = this.require_company_admin_approval
    }
  }
  // If new flags are set, sync them to old flags for backward compatibility (temporary)
  if (this.isNew || this.isModified('enable_site_admin_pr_approval')) {
    if (this.enable_site_admin_pr_approval !== undefined) {
      this.enable_site_admin_approval = this.enable_site_admin_pr_approval
    }
  }
  if (this.isNew || this.isModified('require_company_admin_po_approval')) {
    if (this.require_company_admin_po_approval !== undefined) {
      this.require_company_admin_approval = this.require_company_admin_po_approval
    }
  }
  next()
})

// Note: id field already has index: true in schema definition, so no need for explicit index here
// CompanySchema.index({ id: 1 }) // REMOVED: Duplicate of id: { index: true }

const Company = mongoose.models.Company || mongoose.model<ICompany>('Company', CompanySchema)

export default Company

