import mongoose, { Schema, Document } from 'mongoose'

export interface IUser extends Document {
  email: string
  passwordHash?: string
  role: 'employee' | 'company_admin' | 'location_admin' | 'branch_admin' | 'vendor' | 'super_admin'
  companyId?: string
  vendorId?: string
  employeeId?: string
  isActive: boolean
  lastLoginAt?: Date
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: false,
    },
    role: {
      type: String,
      required: true,
      enum: ['employee', 'company_admin', 'location_admin', 'branch_admin', 'vendor', 'super_admin'],
      index: true,
    },
    companyId: {
      type: String,
      required: false,
      index: true,
    },
    vendorId: {
      type: String,
      required: false,
      index: true,
    },
    employeeId: {
      type: String,
      required: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
    lastLoginAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  }
)

const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema)

export default User
