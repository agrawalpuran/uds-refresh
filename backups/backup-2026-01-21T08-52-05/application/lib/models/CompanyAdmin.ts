import mongoose, { Schema, Document } from 'mongoose'

export interface ICompanyAdmin extends Document {
  companyId: string // String ID reference to Company (alphanumeric)
  employeeId: string // String ID reference to Employee (alphanumeric)
  canApproveOrders: boolean
  createdAt?: Date
  updatedAt?: Date
}

const CompanyAdminSchema = new Schema<ICompanyAdmin>(
  {
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
    canApproveOrders: {
      type: Boolean,
      default: false,
      required: true,
    },
  },
  {
    timestamps: true,
  }
)

// Ensure one employee can only be admin of a company once
CompanyAdminSchema.index({ companyId: 1, employeeId: 1 }, { unique: true })
// Note: companyId and employeeId already have index: true in schema definitions
// CompanyAdminSchema.index({ companyId: 1 }) // REMOVED: Duplicate of companyId: { index: true }
// CompanyAdminSchema.index({ employeeId: 1 }) // REMOVED: Duplicate of employeeId: { index: true }

const CompanyAdmin = mongoose.models.CompanyAdmin || mongoose.model<ICompanyAdmin>('CompanyAdmin', CompanyAdminSchema)

export default CompanyAdmin





