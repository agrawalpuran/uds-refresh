import mongoose, { Schema, Document } from 'mongoose'

export interface ICompanyAdmin extends Document {
  companyId: mongoose.Types.ObjectId
  employeeId: mongoose.Types.ObjectId
  canApproveOrders: boolean
  createdAt?: Date
  updatedAt?: Date
}

const CompanyAdminSchema = new Schema<ICompanyAdmin>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
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



