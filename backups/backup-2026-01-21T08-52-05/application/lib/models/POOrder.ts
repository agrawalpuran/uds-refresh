import mongoose, { Schema, Document } from 'mongoose'

export interface IPOOrder extends Document {
  purchase_order_id: string // String ID reference to PurchaseOrder
  order_id: string // String ID reference to Order
  createdAt?: Date
  updatedAt?: Date
}

const POOrderSchema = new Schema<IPOOrder>(
  {
    purchase_order_id: {
      type: String,
      required: true,
    },
    order_id: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
)

// Compound index for unique constraint: one order can only be in one PO
POOrderSchema.index({ purchase_order_id: 1, order_id: 1 }, { unique: true })
// Reverse index for querying all POs for a given order
POOrderSchema.index({ order_id: 1, purchase_order_id: 1 })

// Force delete cached model to ensure updated schema is used
if (mongoose.models.POOrder) {
  delete mongoose.models.POOrder
}

const POOrder = mongoose.model<IPOOrder>('POOrder', POOrderSchema)

export default POOrder

