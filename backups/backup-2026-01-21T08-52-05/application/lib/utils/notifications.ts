/**
 * Notification System for Indent Workflow
 * Handles in-app notifications (email support can be added later)
 */

export type NotificationType =
  | 'INDENT_CREATED'
  | 'ORDERS_GENERATED'
  | 'SUBORDER_SHIPPED'
  | 'SUBORDER_DELIVERED'
  | 'GRN_SUBMITTED'
  | 'INVOICE_SUBMITTED'
  | 'PAYMENT_COMPLETED'
  | 'INDENT_CLOSED'

export interface NotificationData {
  type: NotificationType
  indentId?: string
  orderId?: string
  suborderId?: string
  vendorId?: string
  companyId?: string
  userId?: string
  message: string
  metadata?: Record<string, any>
}

/**
 * Trigger notification (in-app)
 * TODO: Add email notification support
 */
export async function triggerNotification(data: NotificationData): Promise<void> {
  try {
    // Log notification for now
    console.log('[NOTIFICATION]', {
      type: data.type,
      message: data.message,
      metadata: data.metadata,
      timestamp: new Date().toISOString(),
    })

    // TODO: Store notification in database for in-app notifications
    // TODO: Send email notification if configured
    // TODO: Send push notification if configured

    // For now, we'll just log it
    // In production, this would:
    // 1. Store in notifications collection
    // 2. Send email if user has email notifications enabled
    // 3. Send push notification if user has push enabled
  } catch (error) {
    console.error('[NOTIFICATION ERROR]', error)
    // Don't throw - notifications should not break the workflow
  }
}

/**
 * Notification helper functions for each event type
 */
export const notifications = {
  indentCreated: async (indentId: string, companyId: string, userId: string) => {
    await triggerNotification({
      type: 'INDENT_CREATED',
      indentId,
      companyId,
      userId,
      message: `Indent created successfully`,
    })
  },

  ordersGenerated: async (indentId: string, orderIds: string[], companyId: string) => {
    await triggerNotification({
      type: 'ORDERS_GENERATED',
      indentId,
      companyId,
      message: `${orderIds.length} order(s) generated from indent`,
      metadata: { orderIds },
    })
  },

  suborderShipped: async (
    suborderId: string,
    orderId: string,
    vendorId: string,
    consignmentNumber?: string
  ) => {
    await triggerNotification({
      type: 'SUBORDER_SHIPPED',
      suborderId,
      orderId,
      vendorId,
      message: `Suborder shipped${consignmentNumber ? ` - Tracking: ${consignmentNumber}` : ''}`,
      metadata: { consignmentNumber },
    })
  },

  suborderDelivered: async (suborderId: string, orderId: string, vendorId: string) => {
    await triggerNotification({
      type: 'SUBORDER_DELIVERED',
      suborderId,
      orderId,
      vendorId,
      message: 'Suborder delivered successfully',
    })
  },

  grnSubmitted: async (grnId: string, vendorIndentId: string, vendorId: string) => {
    await triggerNotification({
      type: 'GRN_SUBMITTED',
      vendorId,
      message: 'GRN submitted successfully',
      metadata: { grnId, vendorIndentId },
    })
  },

  invoiceSubmitted: async (invoiceId: string, vendorIndentId: string, vendorId: string) => {
    await triggerNotification({
      type: 'INVOICE_SUBMITTED',
      vendorId,
      message: 'Invoice submitted successfully',
      metadata: { invoiceId, vendorIndentId },
    })
  },

  paymentCompleted: async (
    paymentId: string,
    invoiceId: string,
    vendorId: string,
    indentId?: string
  ) => {
    await triggerNotification({
      type: 'PAYMENT_COMPLETED',
      vendorId,
      message: 'Payment completed successfully',
      metadata: { paymentId, invoiceId, indentId },
    })
  },

  indentClosed: async (indentId: string, companyId: string) => {
    await triggerNotification({
      type: 'INDENT_CLOSED',
      indentId,
      companyId,
      message: 'Indent closed - All payments completed and orders delivered',
    })
  },
}

