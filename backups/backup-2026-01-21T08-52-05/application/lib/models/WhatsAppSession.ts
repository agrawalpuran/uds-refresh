import mongoose, { Schema, Document } from 'mongoose'

export type WhatsAppState =
  | 'MAIN_MENU'
  | 'ORDER_SELECT_ITEM'
  | 'ORDER_SET_QTY'
  | 'ORDER_SET_SIZE'
  | 'ORDER_REVIEW'
  | 'ORDER_DELIVERY'
  | 'ORDER_CONFIRM'
  | 'VIEW_PAST_ORDERS'
  | 'CHECK_STATUS'
  | 'HELP'

export interface IWhatsAppSession extends Document {
  whatsappNumber: string // Phone number with country code (e.g., +919876543210)
  employeeId?: string // Employee ID once authenticated
  state: WhatsAppState
  cart: Array<{
    uniformId: string
    uniformName: string
    category: string
    size: string
    quantity: number
    price: number
  }>
  context: {
    // Temporary context for multi-step flows
    currentProductId?: string
    currentProductName?: string
    currentCategory?: string
    availableSizes?: string[]
    eligibleProducts?: any[]
    selectedOrderId?: string
    deliveryOption?: 'office' | 'home'
    personalAddress?: string
  }
  lastActivity: Date
  createdAt: Date
  updatedAt: Date
}

const WhatsAppSessionSchema = new Schema<IWhatsAppSession>(
  {
    whatsappNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    employeeId: {
      type: String,
      index: true,
    },
    state: {
      type: String,
      enum: [
        'MAIN_MENU',
        'ORDER_SELECT_ITEM',
        'ORDER_SET_QTY',
        'ORDER_SET_SIZE',
        'ORDER_REVIEW',
        'ORDER_DELIVERY',
        'ORDER_CONFIRM',
        'VIEW_PAST_ORDERS',
        'CHECK_STATUS',
        'HELP',
      ],
      default: 'MAIN_MENU',
    },
    cart: [
      {
        uniformId: String,
        uniformName: String,
        category: String,
        size: String,
        quantity: Number,
        price: Number,
      },
    ],
    context: {
      type: Schema.Types.Mixed,
      default: {},
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
)

// Update lastActivity on save
WhatsAppSessionSchema.pre('save', function (next) {
  this.lastActivity = new Date()
  next()
})

const WhatsAppSession =
  mongoose.models.WhatsAppSession ||
  mongoose.model<IWhatsAppSession>('WhatsAppSession', WhatsAppSessionSchema)

export default WhatsAppSession

