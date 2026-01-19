import mongoose, { Schema, Document } from 'mongoose'

/**
 * Return Request Model
 * 
 * Represents a return/replacement request for a delivered order item.
 * Returns are ONLY allowed as replacements (no refunds).
 * 
 * Business Rules:
 * - Only allowed for DELIVERED orders
 * - Replacement must be for SAME SKU/productId
 * - Size can change
 * - Quantity cannot exceed delivered quantity
 * - Original order remains unchanged
 */

export interface IReturnRequest extends Document {
  returnRequestId: string // Unique alphanumeric ID (e.g., "RET-000001")
  originalOrderId: string // Reference to original order ID
  originalOrderItemIndex: number // Index of item in original order.items array
  productId: string // SKU/productId (must match original)
  uniformId: string // String ID reference to Uniform (alphanumeric)
  uniformName: string // Product name
  employeeId: string // String ID reference to Employee (alphanumeric)
  employeeIdNum: string // Employee ID for correlation
  companyId: string // String ID reference to Company (alphanumeric)
  requestedQty: number // Quantity to replace (≤ delivered quantity)
  originalSize: string // Size from original order
  requestedSize: string // New size (can be same or different)
  reason?: string // Return reason (optional)
  comments?: string // Additional comments
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED'
  replacementOrderId?: string // ID of replacement order (once created)
  requestedBy: string // Employee email/ID who requested
  approvedBy?: string // Admin email/ID who approved/rejected
  approvedAt?: Date // Approval/rejection timestamp
  returnWindowDays: number // Configurable return window (default: 14 days)
  createdAt?: Date
  updatedAt?: Date
}

const ReturnRequestSchema = new Schema<IReturnRequest>(
  {
    returnRequestId: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function(v: string) {
          // Must be alphanumeric (1-50 characters)
          return /^[A-Za-z0-9_-]{1,50}$/.test(v)
        },
        message: 'Return Request ID must be alphanumeric (1-50 characters)'
      }
    },
    originalOrderId: {
      type: String,
      required: true,
      index: true,
    },
    originalOrderItemIndex: {
      type: Number,
      required: true,
      // Index of the item in the original order.items array
    },
    productId: {
      type: String,
      required: true,
      // Index created via compound index below - don't use index: true here
    },
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
    uniformName: {
      type: String,
      required: true,
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
    },
    requestedQty: {
      type: Number,
      required: true,
      min: 1,
    },
    originalSize: {
      type: String,
      required: true,
    },
    requestedSize: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    comments: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED'],
      default: 'REQUESTED',
      index: true,
    },
    replacementOrderId: {
      type: String,
      // Index created via schema.index() below - don't use index: true here
    },
    requestedBy: {
      type: String,
      required: true,
    },
    approvedBy: {
      type: String,
    },
    approvedAt: {
      type: Date,
    },
    returnWindowDays: {
      type: Number,
      default: 14, // Default 14-day return window
      min: 1,
    },
  },
  {
    timestamps: true,
  }
)

// Indexes for efficient queries
ReturnRequestSchema.index({ employeeId: 1, status: 1 })
ReturnRequestSchema.index({ companyId: 1, status: 1 })
ReturnRequestSchema.index({ originalOrderId: 1, productId: 1 }) // Prevent duplicate returns for same product
// Note: returnRequestId already has unique: true which creates an index - don't duplicate
// ReturnRequestSchema.index({ returnRequestId: 1 }) // REMOVED: Duplicate of unique: true
ReturnRequestSchema.index({ replacementOrderId: 1 })

const ReturnRequest = mongoose.models.ReturnRequest || mongoose.model<IReturnRequest>('ReturnRequest', ReturnRequestSchema)

export default ReturnRequest

