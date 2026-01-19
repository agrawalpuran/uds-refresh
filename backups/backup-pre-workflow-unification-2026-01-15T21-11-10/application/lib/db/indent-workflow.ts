/**
 * Indent Workflow Data Access Functions
 * Handles complete indent → fulfillment → payment lifecycle
 */

import connectDB from './mongodb'
import mongoose from 'mongoose'
import IndentHeader from '../models/IndentHeader'
import VendorIndent from '../models/VendorIndent'
import OrderSuborder from '../models/OrderSuborder'
import GoodsReceiptNote from '../models/GoodsReceiptNote'
import VendorInvoice from '../models/VendorInvoice'
import Payment from '../models/Payment'
import Order from '../models/Order'
import Vendor from '../models/Vendor'
import Uniform from '../models/Uniform'
import { notifications } from '../utils/notifications'

// Helper function to convert Mongoose documents to plain objects
function toPlainObject(doc: any): any {
  if (!doc) return null
  if (Array.isArray(doc)) {
    return doc.map((d) => toPlainObject(d))
  }
  const obj = doc.toObject ? doc.toObject() : doc
  // Remove _id and __v, keep id if it exists
  const { _id, __v, ...rest } = obj
  return rest
}

/**
 * DERIVED MASTER ORDER STATUS (MANDATORY)
 * Master order status is ALWAYS derived from suborders, never manually set
 */
export async function deriveMasterOrderStatus(orderId: string | mongoose.Types.ObjectId): Promise<string> {
  await connectDB()
  
  const orderIdStr = typeof orderId === 'string' ? orderId : orderId.toString()
  
  // String ID lookup only (ObjectId fallback removed - all IDs are now strings)
  const order = await Order.findOne({ id: orderIdStr }).lean()
  
  // Find all suborders for this order by string ID
  const suborders = await OrderSuborder.find({ order_id: orderIdStr }).lean()
  
  if (!suborders || suborders.length === 0) {
    // No suborders exist - check if order has indent_id
    if (order && order.indent_id) {
      // Order is part of indent but no suborders created yet
      return 'Awaiting fulfilment'
    }
    // Legacy order without suborders
    return order?.status || 'Awaiting approval'
  }
  
  // Derive status from suborders
  const statuses = suborders.map(so => so.suborder_status || so.shipment_status || 'CREATED')
  
  // All suborders NOT_SHIPPED or CREATED
  if (statuses.every(s => s === 'NOT_SHIPPED' || s === 'CREATED')) {
    return 'Awaiting fulfilment'
  }
  
  // All suborders DELIVERED
  if (statuses.every(s => s === 'DELIVERED')) {
    return 'Delivered'
  }
  
  // Some shipped but not all delivered
  if (statuses.some(s => s === 'SHIPPED' || s === 'IN_TRANSIT' || s === 'DELIVERED')) {
    return 'Dispatched'
  }
  
  // Any failed or returned
  if (statuses.some(s => s === 'FAILED' || s === 'RETURNED')) {
    return 'Awaiting fulfilment' // Or could be a new status like 'Attention Required'
  }
  
  return 'Awaiting fulfilment'
}

/**
 * Update master order status (derived from suborders)
 */
export async function updateMasterOrderStatus(orderId: string | mongoose.Types.ObjectId): Promise<void> {
  await connectDB()
  
  const derivedStatus = await deriveMasterOrderStatus(orderId)
  const orderIdStr = typeof orderId === 'string' ? orderId : orderId.toString()
  
  // Update order by string ID (ObjectId conversion removed - all IDs are now strings)
  const result = await Order.updateOne(
    { id: orderIdStr },
    { $set: { status: derivedStatus } }
  )
  
  if (result.matchedCount === 0) {
    console.error(`[updateMasterOrderStatus] Order not found: ${orderIdStr}`)
  }
}

/**
 * Create Indent Header
 */
export async function createIndentHeader(data: {
  client_indent_number: string
  indent_date: Date
  companyId: string | mongoose.Types.ObjectId
  site_id?: string | mongoose.Types.ObjectId
  created_by_user_id: string | mongoose.Types.ObjectId
  created_by_role: 'COMPANY_ADMIN' | 'SITE_ADMIN' | 'EMPLOYEE'
}): Promise<any> {
  await connectDB()
  
  // Generate unique ID
  const indentId = `IND-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  // Use string IDs instead of ObjectId
  const indent = new IndentHeader({
    id: indentId,
    client_indent_number: data.client_indent_number,
    indent_date: data.indent_date,
    companyId: String(data.companyId),  // Use string ID, not ObjectId
    site_id: data.site_id ? String(data.site_id) : undefined,  // Use string ID, not ObjectId
    status: 'CREATED',
    created_by_user_id: String(data.created_by_user_id),  // Use string ID, not ObjectId
    created_by_role: data.created_by_role,
  })
  
  await indent.save()
  
  // Trigger notification
  await notifications.indentCreated(
    indentId,
    indent.companyId.toString(),
    indent.created_by_user_id.toString()
  )
  
  return toPlainObject(indent)
}

/**
 * Create Vendor Indent
 */
export async function createVendorIndent(data: {
  indent_id: string | mongoose.Types.ObjectId
  vendor_id: string | mongoose.Types.ObjectId
  total_items: number
  total_quantity: number
  total_amount: number
}): Promise<any> {
  await connectDB()
  
  const vendorIndentId = `VI-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  // Use string IDs instead of ObjectId
  const vendorIndent = new VendorIndent({
    id: vendorIndentId,
    indent_id: String(data.indent_id),  // Use string ID, not ObjectId
    vendor_id: String(data.vendor_id),  // Use string ID, not ObjectId
    status: 'CREATED',
    total_items: data.total_items,
    total_quantity: data.total_quantity,
    total_amount: data.total_amount,
  })
  
  await vendorIndent.save()
  return toPlainObject(vendorIndent)
}

/**
 * Create Order Suborder (one per vendor per order)
 */
export async function createOrderSuborder(data: {
  order_id: string | mongoose.Types.ObjectId
  vendor_id: string | mongoose.Types.ObjectId
  vendor_indent_id?: string | mongoose.Types.ObjectId
}): Promise<any> {
  await connectDB()
  
  // Resolve order_id to string ID
  const orderIdStr = String(data.order_id)
  
  // Check if suborder already exists for this order-vendor combination using string IDs
  const existing = await OrderSuborder.findOne({
    order_id: orderIdStr,
    vendor_id: String(data.vendor_id),
  }).lean()
  
  if (existing) {
    return toPlainObject(existing)
  }
  
  const suborderId = `SO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  // Use string IDs instead of ObjectId
  const suborder = new OrderSuborder({
    id: suborderId,
    order_id: orderIdStr,  // Use string ID, not ObjectId
    vendor_id: String(data.vendor_id),  // Use string ID, not ObjectId
    vendor_indent_id: data.vendor_indent_id ? String(data.vendor_indent_id) : undefined,  // Use string ID, not ObjectId
    suborder_status: 'CREATED',
    shipment_status: 'NOT_SHIPPED',
  })
  
  await suborder.save()
  
  // Update master order status
  await updateMasterOrderStatus(orderIdStr)
  
  return toPlainObject(suborder)
}

/**
 * Create suborders for an order based on its items and vendors
 * This is called when an order is created from an indent
 */
export async function createSubordersForOrder(orderId: string | mongoose.Types.ObjectId): Promise<any[]> {
  await connectDB()
  
  const orderIdStr = typeof orderId === 'string' ? orderId : orderId.toString()
  
  // String ID lookup only (ObjectId fallback removed - all IDs are now strings)
  const order = await Order.findOne({ id: orderIdStr }).lean()
  
  if (!order) {
    throw new Error(`Order not found: ${orderId}`)
  }
  
  // Get unique vendors from order items
  // Note: This assumes order items have vendor information
  // If not, we need to look up vendors from products
  const vendorIds = new Set<string>()
  
  // For each item, find the vendor
  for (const item of order.items || []) {
    // Find product to get vendor
    const product = await Uniform.findOne({ id: item.productId }).lean()
    if (product && product.vendorId) {
      vendorIds.add(product.vendorId.toString())
    } else if (order.vendorId) {
      // Fallback to order's vendorId
      vendorIds.add(order.vendorId.toString())
    }
  }
  
  // If no vendors found, use order's vendorId
  if (vendorIds.size === 0 && order.vendorId) {
    vendorIds.add(order.vendorId.toString())
  }
  
  // Create suborder for each vendor using string ID
  const suborders = []
  for (const vendorId of vendorIds) {
    const suborder = await createOrderSuborder({
      order_id: orderIdStr,  // Use string ID, not ObjectId
      vendor_id: vendorId,
    })
    suborders.push(suborder)
  }
  
  return suborders
}

/**
 * Update Suborder Shipping & Tracking
 */
export async function updateSuborderShipping(data: {
  suborder_id: string | mongoose.Types.ObjectId
  shipper_name?: string
  consignment_number?: string
  shipping_date?: Date
  shipment_status?: 'NOT_SHIPPED' | 'SHIPPED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'RETURNED'
}): Promise<any> {
  await connectDB()
  
  const suborderIdStr = typeof data.suborder_id === 'string' ? data.suborder_id : data.suborder_id.toString()
  
  const updateData: any = {
    last_status_updated_at: new Date(),
  }
  
  if (data.shipper_name !== undefined) updateData.shipper_name = data.shipper_name
  if (data.consignment_number !== undefined) updateData.consignment_number = data.consignment_number
  if (data.shipping_date !== undefined) updateData.shipping_date = data.shipping_date
  if (data.shipment_status !== undefined) {
    updateData.shipment_status = data.shipment_status
    // Sync suborder_status with shipment_status
    if (data.shipment_status === 'SHIPPED' || data.shipment_status === 'IN_TRANSIT') {
      updateData.suborder_status = 'SHIPPED'
    } else if (data.shipment_status === 'DELIVERED') {
      updateData.suborder_status = 'DELIVERED'
    } else if (data.shipment_status === 'FAILED' || data.shipment_status === 'RETURNED') {
      updateData.suborder_status = data.shipment_status
    }
  }
  
  // Update by string ID (ObjectId fallback removed - all IDs are now strings)
  const suborder = await OrderSuborder.findOneAndUpdate(
    { id: suborderIdStr },
    { $set: updateData },
    { new: true }
  ).lean()
  
  if (!suborder) {
    throw new Error(`Suborder not found: ${suborderIdStr}`)
  }
  
  // Update master order status
  await updateMasterOrderStatus(suborder.order_id)
  
  // Trigger notification if shipped
  if (updateData.shipment_status === 'SHIPPED' || updateData.shipment_status === 'IN_TRANSIT') {
    await notifications.suborderShipped(
      suborder.id || suborder._id.toString(),
      suborder.order_id.toString(),
      suborder.vendor_id.toString(),
      updateData.consignment_number
    )
  } else if (updateData.shipment_status === 'DELIVERED') {
    await notifications.suborderDelivered(
      suborder.id || suborder._id.toString(),
      suborder.order_id.toString(),
      suborder.vendor_id.toString()
    )
  }
  
  return toPlainObject(suborder)
}

/**
 * Create Goods Receipt Note
 */
export async function createGRN(data: {
  vendor_indent_id: string | mongoose.Types.ObjectId
  vendor_id: string | mongoose.Types.ObjectId
  grn_number: string
  grn_date: Date
  remarks?: string
}): Promise<any> {
  await connectDB()
  
  const grnId = `GRN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  // Use string IDs instead of ObjectId
  const grn = new GoodsReceiptNote({
    id: grnId,
    vendor_indent_id: String(data.vendor_indent_id),  // Use string ID, not ObjectId
    vendor_id: String(data.vendor_id),  // Use string ID, not ObjectId
    grn_number: data.grn_number,
    grn_date: data.grn_date,
    status: 'DRAFT',
    remarks: data.remarks,
  })
  
  await grn.save()
  return toPlainObject(grn)
}

/**
 * Submit GRN (updates vendor indent status)
 */
export async function submitGRN(grnId: string | mongoose.Types.ObjectId): Promise<any> {
  await connectDB()
  
  const grnIdStr = typeof grnId === 'string' ? grnId : grnId.toString()
  
  // String ID lookup only (ObjectId fallback removed - all IDs are now strings)
  const grn = await GoodsReceiptNote.findOneAndUpdate(
    { id: grnIdStr },
    { $set: { status: 'SUBMITTED' } },
    { new: true }
  ).lean()
  
  if (!grn) {
    throw new Error(`GRN not found: ${grnIdStr}`)
  }
  
  // Update vendor indent status by string ID
  await VendorIndent.updateOne(
    { id: grn.vendor_indent_id?.toString() || grn.vendor_indent_id },
    { $set: { status: 'GRN_SUBMITTED' } }
  )
  
  // Trigger notification
  await notifications.grnSubmitted(
    grnId.toString(),
    grn.vendor_indent_id.toString(),
    grn.vendor_id.toString()
  )
  
  return toPlainObject(grn)
}

/**
 * Create Vendor Invoice
 */
export async function createVendorInvoice(data: {
  vendor_indent_id: string | mongoose.Types.ObjectId
  vendor_id: string | mongoose.Types.ObjectId
  invoice_number: string
  invoice_date: Date
  invoice_amount: number
}): Promise<any> {
  await connectDB()
  
  const invoiceId = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  // Use string IDs instead of ObjectId
  const invoice = new VendorInvoice({
    id: invoiceId,
    vendor_indent_id: String(data.vendor_indent_id),  // Use string ID, not ObjectId
    vendor_id: String(data.vendor_id),  // Use string ID, not ObjectId
    invoice_number: data.invoice_number,
    invoice_date: data.invoice_date,
    invoice_amount: data.invoice_amount,
    status: 'DRAFT',
  })
  
  await invoice.save()
  return toPlainObject(invoice)
}

/**
 * Submit Invoice (updates vendor indent status)
 */
export async function submitInvoice(invoiceId: string | mongoose.Types.ObjectId): Promise<any> {
  await connectDB()
  
  const invoiceIdStr = typeof invoiceId === 'string' ? invoiceId : invoiceId.toString()
  
  // String ID lookup only (ObjectId fallback removed - all IDs are now strings)
  const invoice = await VendorInvoice.findOneAndUpdate(
    { id: invoiceIdStr },
    { $set: { status: 'SUBMITTED' } },
    { new: true }
  ).lean()
  
  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceIdStr}`)
  }
  
  // Trigger notification
  await notifications.invoiceSubmitted(
    invoiceId.toString(),
    invoice.vendor_indent_id.toString(),
    invoice.vendor_id.toString()
  )
  
  return toPlainObject(invoice)
}

/**
 * Create Payment
 */
export async function createPayment(data: {
  invoice_id: string | mongoose.Types.ObjectId
  vendor_id: string | mongoose.Types.ObjectId
  payment_reference: string
  payment_date: Date
  amount_paid: number
}): Promise<any> {
  await connectDB()
  
  const paymentId = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  // Use string IDs instead of ObjectId
  const payment = new Payment({
    id: paymentId,
    invoice_id: String(data.invoice_id),  // Use string ID, not ObjectId
    vendor_id: String(data.vendor_id),  // Use string ID, not ObjectId
    payment_reference: data.payment_reference,
    payment_date: data.payment_date,
    amount_paid: data.amount_paid,
    status: 'PENDING',
  })
  
  await payment.save()
  return toPlainObject(payment)
}

/**
 * Complete Payment (updates invoice and vendor indent status)
 */
export async function completePayment(paymentId: string | mongoose.Types.ObjectId): Promise<any> {
  await connectDB()
  
  const paymentIdStr = typeof paymentId === 'string' ? paymentId : paymentId.toString()
  
  // String ID lookup only (ObjectId fallback removed - all IDs are now strings)
  const payment = await Payment.findOneAndUpdate(
    { id: paymentIdStr },
    { $set: { status: 'COMPLETED' } },
    { new: true }
  ).lean()
  
  if (!payment) {
    throw new Error(`Payment not found: ${paymentIdStr}`)
  }
  
  // Update invoice status by string ID
  await VendorInvoice.updateOne(
    { id: payment.invoice_id?.toString() || payment.invoice_id },
    { $set: { status: 'PAID' } }
  )
  
  // Update vendor indent status
  const invoice = await VendorInvoice.findOne({ id: payment.invoice_id?.toString() || payment.invoice_id }).lean()
  
  if (invoice) {
    await VendorIndent.updateOne(
      { id: invoice.vendor_indent_id?.toString() || invoice.vendor_indent_id },
      { $set: { status: 'PAID' } }
    )
    
    // Get indent ID for notification
    const vendorIndent = await VendorIndent.findOne({ id: invoice.vendor_indent_id?.toString() || invoice.vendor_indent_id }).lean()
    const indentId = vendorIndent?.indent_id?.toString()
    
    // Trigger payment notification
    await notifications.paymentCompleted(
      paymentId.toString(),
      payment.invoice_id.toString(),
      payment.vendor_id.toString(),
      indentId
    )
    
    // Check if indent can be closed
    const closed = await checkAndCloseIndent(invoice.vendor_indent_id?.toString() || invoice.vendor_indent_id)
    
    if (closed && indentId) {
      // Get company ID for notification
      const indent = await IndentHeader.findOne({ id: indentId }).lean()
      if (indent) {
        await notifications.indentClosed(
          indentId,
          indent.companyId.toString()
        )
      }
    }
  }
  
  return toPlainObject(payment)
}

/**
 * Check and close indent if all conditions met
 */
export async function checkAndCloseIndent(vendorIndentId: string | mongoose.Types.ObjectId): Promise<boolean> {
  await connectDB()
  
  const vendorIndentIdStr = typeof vendorIndentId === 'string' ? vendorIndentId : vendorIndentId.toString()
  
  // String ID lookup only (ObjectId fallback removed - all IDs are now strings)
  const vendorIndent = await VendorIndent.findOne({ id: vendorIndentIdStr }).lean()
  if (!vendorIndent) {
    return false
  }
  
  const indentId = vendorIndent.indent_id
  
  // Check all vendor indents are PAID
  const allVendorIndents = await VendorIndent.find({ indent_id: indentId }).lean()
  const allPaid = allVendorIndents.every(vi => vi.status === 'PAID')
  
  if (!allPaid) {
    return false
  }
  
  // Check all suborders are DELIVERED using string IDs
  const vendorIndentStringIds = allVendorIndents.map(vi => vi.id)
  const allSuborders = await OrderSuborder.find({
    vendor_indent_id: { $in: vendorIndentStringIds }
  }).lean()
  
  const allDelivered = allSuborders.every(so => 
    so.suborder_status === 'DELIVERED' || so.shipment_status === 'DELIVERED'
  )
  
  if (!allDelivered) {
    return false
  }
  
  // Update indent status to CLOSED by string ID
  await IndentHeader.updateOne(
    { id: indentId?.toString() || indentId },
    { $set: { status: 'CLOSED' } }
  )
  
  return true
}

/**
 * Get Indent by ID
 */
export async function getIndentById(indentId: string | mongoose.Types.ObjectId): Promise<any | null> {
  await connectDB()
  
  const indentIdStr = typeof indentId === 'string' ? indentId : indentId.toString()
  
  // String ID lookup only (ObjectId fallback removed - all IDs are now strings)
  const indent = await IndentHeader.findOne({ id: indentIdStr })
    .populate('companyId', 'id name')
    .populate('site_id', 'id name')
    .populate('created_by_user_id', 'id employeeId firstName lastName email')
    .lean()
  
  return indent ? toPlainObject(indent) : null
}

/**
 * Get Vendor Indents by Indent ID
 */
export async function getVendorIndentsByIndentId(indentId: string | mongoose.Types.ObjectId): Promise<any[]> {
  await connectDB()
  
  const indentIdStr = typeof indentId === 'string' ? indentId : indentId.toString()
  
  // String ID lookup only (ObjectId conversion removed - all IDs are now strings)
  const vendorIndents = await VendorIndent.find({
    indent_id: indentIdStr
  })
    .populate('vendor_id', 'id name')
    .lean()
  
  return vendorIndents.map(vi => toPlainObject(vi))
}

/**
 * Get Suborders by Order ID
 */
export async function getSubordersByOrderId(orderId: string | mongoose.Types.ObjectId): Promise<any[]> {
  await connectDB()
  
  const orderIdStr = typeof orderId === 'string' ? orderId : orderId.toString()
  
  // String ID lookup only (ObjectId conversion removed - all IDs are now strings)
  const suborders = await OrderSuborder.find({
    order_id: orderIdStr
  })
    .populate('vendor_id', 'id name')
    .populate('vendor_indent_id', 'id status')
    .lean()
  
  return suborders.map(so => toPlainObject(so))
}

/**
 * Get Suborders by Vendor ID (for vendor access)
 */
export async function getSubordersByVendorId(vendorId: string | mongoose.Types.ObjectId): Promise<any[]> {
  await connectDB()
  
  const vendorIdStr = typeof vendorId === 'string' ? vendorId : vendorId.toString()
  
  // String ID lookup only (ObjectId conversion removed - all IDs are now strings)
  const suborders = await OrderSuborder.find({
    vendor_id: vendorIdStr
  })
    .populate('order_id', 'id employeeName orderDate')
    .populate('vendor_indent_id', 'id status')
    .lean()
  
  return suborders.map(so => toPlainObject(so))
}

