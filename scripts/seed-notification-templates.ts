/**
 * Seed Notification Events and Templates
 * 
 * Creates notification events and email templates for all recipient types.
 * Run this script once to populate the database with initial data.
 * 
 * Usage: npm run seed-notifications
 * 
 * Creates events for:
 * - Employee notifications (order status, PO, delivery)
 * - Vendor notifications (new order, PO received, shipment reminder)
 * - Company Admin notifications (approval required, PO generated, delivery)
 * - Location Admin notifications (approval required, order status)
 */

// Load environment variables from .env.local
import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import mongoose from 'mongoose'
import NotificationEvent from '../lib/models/NotificationEvent'
import NotificationTemplate from '../lib/models/NotificationTemplate'

// MongoDB connection string - loaded from .env.local
const MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) {
  console.error('❌ ERROR: MONGODB_URI not found in environment variables!')
  console.error('   Make sure .env.local exists and contains MONGODB_URI')
  process.exit(1)
}

// =============================================================================
// EVENT DEFINITIONS - All Recipient Types
// =============================================================================

const events = [
  // EMPLOYEE EVENTS
  {
    eventId: '500001',
    eventCode: 'ORDER_STATUS_CHANGED',
    eventDescription: 'Triggered when an order status changes (e.g., Awaiting fulfilment → Dispatched)',
    defaultRecipientType: 'EMPLOYEE' as const,
    isActive: true,
  },
  {
    eventId: '500002',
    eventCode: 'PO_GENERATED',
    eventDescription: 'Triggered when a Purchase Order is generated for an order',
    defaultRecipientType: 'EMPLOYEE' as const,
    isActive: true,
  },
  {
    eventId: '500003',
    eventCode: 'ORDER_MARKED_DELIVERED',
    eventDescription: 'Triggered when an order is marked as delivered',
    defaultRecipientType: 'EMPLOYEE' as const,
    isActive: true,
  },
  {
    eventId: '500004',
    eventCode: 'ORDER_SHIPPED',
    eventDescription: 'Triggered when an order is shipped/dispatched with tracking info',
    defaultRecipientType: 'EMPLOYEE' as const,
    isActive: true,
  },
  
  // VENDOR EVENTS
  {
    eventId: '500010',
    eventCode: 'VENDOR_NEW_ORDER',
    eventDescription: 'Triggered when a new order is assigned to a vendor',
    defaultRecipientType: 'VENDOR' as const,
    isActive: true,
  },
  {
    eventId: '500011',
    eventCode: 'VENDOR_PO_RECEIVED',
    eventDescription: 'Triggered when a PO is generated and needs vendor action',
    defaultRecipientType: 'VENDOR' as const,
    isActive: true,
  },
  {
    eventId: '500012',
    eventCode: 'VENDOR_SHIPMENT_REMINDER',
    eventDescription: 'Reminder to vendor for pending shipments',
    defaultRecipientType: 'VENDOR' as const,
    isActive: true,
  },
  {
    eventId: '500013',
    eventCode: 'VENDOR_ORDER_CANCELLED',
    eventDescription: 'Notifies vendor when an order is cancelled',
    defaultRecipientType: 'VENDOR' as const,
    isActive: true,
  },
  
  // COMPANY ADMIN EVENTS
  {
    eventId: '500020',
    eventCode: 'COMPANY_ADMIN_APPROVAL_REQUIRED',
    eventDescription: 'Triggered when an order requires company admin approval',
    defaultRecipientType: 'COMPANY_ADMIN' as const,
    isActive: true,
  },
  {
    eventId: '500021',
    eventCode: 'COMPANY_ADMIN_PO_GENERATED',
    eventDescription: 'Notifies company admin when a PO is generated',
    defaultRecipientType: 'COMPANY_ADMIN' as const,
    isActive: true,
  },
  {
    eventId: '500022',
    eventCode: 'COMPANY_ADMIN_ORDER_DELIVERED',
    eventDescription: 'Notifies company admin when an order is delivered',
    defaultRecipientType: 'COMPANY_ADMIN' as const,
    isActive: true,
  },
  {
    eventId: '500023',
    eventCode: 'COMPANY_ADMIN_DAILY_SUMMARY',
    eventDescription: 'Daily summary of order activity for company admin',
    defaultRecipientType: 'COMPANY_ADMIN' as const,
    isActive: false, // Disabled by default - needs scheduled job
  },
  
  // LOCATION ADMIN EVENTS
  {
    eventId: '500030',
    eventCode: 'LOCATION_ADMIN_APPROVAL_REQUIRED',
    eventDescription: 'Triggered when an order requires location admin approval',
    defaultRecipientType: 'LOCATION_ADMIN' as const,
    isActive: true,
  },
  {
    eventId: '500031',
    eventCode: 'LOCATION_ADMIN_ORDER_STATUS',
    eventDescription: 'Notifies location admin of order status changes for their location',
    defaultRecipientType: 'LOCATION_ADMIN' as const,
    isActive: true,
  },
  {
    eventId: '500032',
    eventCode: 'LOCATION_ADMIN_ORDER_DELIVERED',
    eventDescription: 'Notifies location admin when an order at their location is delivered',
    defaultRecipientType: 'LOCATION_ADMIN' as const,
    isActive: true,
  },
  {
    eventId: '500033',
    eventCode: 'LOCATION_ADMIN_PO_GENERATED',
    eventDescription: 'Notifies location admin when a PO is generated for orders at their location',
    defaultRecipientType: 'LOCATION_ADMIN' as const,
    isActive: true,
  },
  
  // GRN EVENTS
  {
    eventId: '500040',
    eventCode: 'GRN_CREATED',
    eventDescription: 'Triggered when a vendor creates a GRN (Goods Receipt Note)',
    defaultRecipientType: 'COMPANY_ADMIN' as const,
    isActive: true,
  },
  {
    eventId: '500041',
    eventCode: 'GRN_ACKNOWLEDGED',
    eventDescription: 'Triggered when company admin acknowledges a GRN',
    defaultRecipientType: 'VENDOR' as const,
    isActive: true,
  },
  {
    eventId: '500042',
    eventCode: 'GRN_APPROVED',
    eventDescription: 'Triggered when a GRN is approved',
    defaultRecipientType: 'VENDOR' as const,
    isActive: true,
  },
  
  // INVOICE EVENTS
  {
    eventId: '500050',
    eventCode: 'INVOICE_CREATED',
    eventDescription: 'Triggered when a vendor creates an invoice',
    defaultRecipientType: 'COMPANY_ADMIN' as const,
    isActive: true,
  },
  {
    eventId: '500051',
    eventCode: 'INVOICE_APPROVED',
    eventDescription: 'Triggered when company admin approves an invoice',
    defaultRecipientType: 'VENDOR' as const,
    isActive: true,
  },
  {
    eventId: '500052',
    eventCode: 'INVOICE_PAID',
    eventDescription: 'Triggered when an invoice payment is completed',
    defaultRecipientType: 'VENDOR' as const,
    isActive: true,
  },
]

// =============================================================================
// TEMPLATE DEFINITIONS - HTML Email Templates
// =============================================================================

const templates = [
  // -------------------------------------------------------------------------
  // EMPLOYEE TEMPLATES
  // -------------------------------------------------------------------------
  {
    templateId: '600001',
    eventId: '500001', // ORDER_STATUS_CHANGED
    templateName: 'Order Status Changed - Employee Notification',
    subjectTemplate: 'Your Order {{orderId}} Status Changed to {{orderStatus}}',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #4A90A4; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .status { font-size: 18px; font-weight: bold; color: #4A90A4; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Order Status Update</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>Your order status has been updated.</p>
      <p><strong>Order ID:</strong> {{orderId}}</p>
      <p><strong>Previous Status:</strong> {{previousStatus}}</p>
      <p><strong>New Status:</strong> <span class="status">{{orderStatus}}</span></p>
      <p>You can track your order in the UDS portal.</p>
      <p>Thank you for using UDS!</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  {
    templateId: '600002',
    eventId: '500002', // PO_GENERATED
    templateName: 'PO Generated - Employee Notification',
    subjectTemplate: 'Purchase Order {{poNumber}} Generated for Your Order',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #2E7D32; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .po-number { font-size: 20px; font-weight: bold; color: #2E7D32; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Purchase Order Generated</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>A Purchase Order has been generated for your uniform request.</p>
      <p><strong>PO Number:</strong> <span class="po-number">{{poNumber}}</span></p>
      <p><strong>Vendor:</strong> {{vendorName}}</p>
      <p>Your order is now being processed by the vendor. You will receive another notification when it is dispatched.</p>
      <p>Thank you for your patience!</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  {
    templateId: '600003',
    eventId: '500003', // ORDER_MARKED_DELIVERED
    templateName: 'Order Delivered - Employee Notification',
    subjectTemplate: 'Your Order {{orderId}} Has Been Delivered!',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #1976D2; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .delivered { font-size: 22px; font-weight: bold; color: #1976D2; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Order Delivered!</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>Great news! Your order has been delivered.</p>
      <p><strong>Order ID:</strong> {{orderId}}</p>
      <p><strong>Status:</strong> <span class="delivered">Delivered</span></p>
      <p>Please inspect your items and confirm receipt in the UDS portal.</p>
      <p>If you have any issues with your order, please contact your company admin.</p>
      <p>Thank you for using UDS!</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  {
    templateId: '600004',
    eventId: '500004', // ORDER_SHIPPED
    templateName: 'Order Shipped - Employee Notification',
    subjectTemplate: '🚚 Your Order {{orderId}} Has Been Shipped!',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #4A90A4; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .tracking-box { background-color: #e8f4f8; border: 2px solid #4A90A4; border-radius: 8px; padding: 15px; margin: 20px 0; }
    .tracking-number { font-size: 20px; font-weight: bold; color: #4A90A4; letter-spacing: 1px; }
    .info-row { margin: 10px 0; }
    .label { font-weight: bold; color: #555; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚚 Your Order is On Its Way!</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>Great news! Your order has been shipped and is on its way to you.</p>
      
      <div class="tracking-box">
        <p class="info-row"><span class="label">Order ID:</span> {{orderId}}</p>
        <p class="info-row"><span class="label">AWB/Tracking Number:</span></p>
        <p class="tracking-number">{{awbNumber}}</p>
        <p class="info-row"><span class="label">Shipped By:</span> {{vendorName}}</p>
      </div>
      
      <p>You can use the tracking number above to track your shipment with the courier service.</p>
      <p>If you have any questions about your delivery, please contact your company admin.</p>
      <p>Thank you for using UDS!</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  
  // -------------------------------------------------------------------------
  // VENDOR TEMPLATES
  // -------------------------------------------------------------------------
  {
    templateId: '600010',
    eventId: '500010', // VENDOR_NEW_ORDER
    templateName: 'New Order - Vendor Notification',
    subjectTemplate: 'New Order Received: {{orderId}} from {{companyName}}',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #FF6B35; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .highlight { font-size: 18px; font-weight: bold; color: #FF6B35; }
    .action-btn { display: inline-block; padding: 12px 24px; background-color: #FF6B35; color: white; text-decoration: none; border-radius: 4px; margin-top: 15px; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📦 New Order Received</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>You have received a new uniform order through UDS.</p>
      <p><strong>Order ID:</strong> <span class="highlight">{{orderId}}</span></p>
      <p><strong>Company:</strong> {{companyName}}</p>
      <p><strong>Status:</strong> Awaiting Fulfilment</p>
      <p>Please log in to the vendor portal to review and process this order.</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  {
    templateId: '600011',
    eventId: '500011', // VENDOR_PO_RECEIVED
    templateName: 'PO Received - Vendor Notification',
    subjectTemplate: 'Purchase Order Received: {{poNumber}}',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #2E7D32; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .po-number { font-size: 22px; font-weight: bold; color: #2E7D32; }
    .details { background-color: #e8f5e9; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📋 Purchase Order Received</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>A new Purchase Order has been generated for fulfilment.</p>
      <div class="details">
        <p><strong>PO Number:</strong> <span class="po-number">{{poNumber}}</span></p>
        <p><strong>Company:</strong> {{companyName}}</p>
        <p><strong>Order ID:</strong> {{orderId}}</p>
      </div>
      <p>Please process this order and update the shipment details in the vendor portal.</p>
      <p>Timely fulfilment helps maintain good vendor ratings.</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  {
    templateId: '600012',
    eventId: '500012', // VENDOR_SHIPMENT_REMINDER
    templateName: 'Shipment Reminder - Vendor Notification',
    subjectTemplate: '⏰ Reminder: Order {{orderId}} Pending Shipment',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #FFA000; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .warning { background-color: #fff3e0; padding: 15px; border-left: 4px solid #FFA000; margin: 15px 0; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⏰ Shipment Reminder</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <div class="warning">
        <p><strong>Action Required:</strong> The following order is pending shipment.</p>
      </div>
      <p><strong>Order ID:</strong> {{orderId}}</p>
      <p><strong>PO Number:</strong> {{poNumber}}</p>
      <p><strong>Company:</strong> {{companyName}}</p>
      <p>Please update the shipment status in the vendor portal to maintain service levels.</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  {
    templateId: '600013',
    eventId: '500013', // VENDOR_ORDER_CANCELLED
    templateName: 'Order Cancelled - Vendor Notification',
    subjectTemplate: '❌ Order Cancelled: {{orderId}}',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #D32F2F; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .cancelled { color: #D32F2F; font-weight: bold; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>❌ Order Cancelled</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>The following order has been <span class="cancelled">cancelled</span>.</p>
      <p><strong>Order ID:</strong> {{orderId}}</p>
      <p><strong>PO Number:</strong> {{poNumber}}</p>
      <p><strong>Company:</strong> {{companyName}}</p>
      <p>Please do not process this order. If you have any questions, contact the company admin.</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  
  // -------------------------------------------------------------------------
  // COMPANY ADMIN TEMPLATES
  // -------------------------------------------------------------------------
  {
    templateId: '600020',
    eventId: '500020', // COMPANY_ADMIN_APPROVAL_REQUIRED
    templateName: 'Approval Required - Company Admin Notification',
    subjectTemplate: '🔔 Order Pending Approval: {{orderId}}',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #7B1FA2; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .pending { background-color: #f3e5f5; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .action-btn { display: inline-block; padding: 12px 24px; background-color: #7B1FA2; color: white; text-decoration: none; border-radius: 4px; margin-top: 15px; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔔 Approval Required</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>A new order requires your approval.</p>
      <div class="pending">
        <p><strong>Order ID:</strong> {{orderId}}</p>
        <p><strong>Employee:</strong> {{orderEmployeeName}}</p>
        <p><strong>Location:</strong> {{locationName}}</p>
      </div>
      <p>Please log in to the admin portal to review and approve/reject this order.</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  {
    templateId: '600021',
    eventId: '500021', // COMPANY_ADMIN_PO_GENERATED
    templateName: 'PO Generated - Company Admin Notification',
    subjectTemplate: 'Purchase Order Generated: {{poNumber}}',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #00695C; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .po-info { background-color: #e0f2f1; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📋 PO Generated</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>A Purchase Order has been generated for your company.</p>
      <div class="po-info">
        <p><strong>PO Number:</strong> {{poNumber}}</p>
        <p><strong>Vendor:</strong> {{vendorName}}</p>
        <p><strong>Order ID:</strong> {{orderId}}</p>
      </div>
      <p>The order is now being processed by the vendor.</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  {
    templateId: '600022',
    eventId: '500022', // COMPANY_ADMIN_ORDER_DELIVERED
    templateName: 'Order Delivered - Company Admin Notification',
    subjectTemplate: '✅ Order Delivered: {{orderId}}',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #1565C0; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .delivered { background-color: #e3f2fd; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Order Delivered</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>An order has been successfully delivered.</p>
      <div class="delivered">
        <p><strong>Order ID:</strong> {{orderId}}</p>
        <p><strong>Employee:</strong> {{orderEmployeeName}}</p>
        <p><strong>Location:</strong> {{locationName}}</p>
        <p><strong>Status:</strong> Delivered</p>
      </div>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  
  // -------------------------------------------------------------------------
  // LOCATION ADMIN TEMPLATES
  // -------------------------------------------------------------------------
  {
    templateId: '600030',
    eventId: '500030', // LOCATION_ADMIN_APPROVAL_REQUIRED
    templateName: 'Approval Required - Location Admin Notification',
    subjectTemplate: '🔔 Order Pending Site Approval: {{orderId}}',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #C62828; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .pending { background-color: #ffebee; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔔 Site Approval Required</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>A new order at your location requires approval.</p>
      <div class="pending">
        <p><strong>Order ID:</strong> {{orderId}}</p>
        <p><strong>Employee:</strong> {{orderEmployeeName}}</p>
        <p><strong>Company:</strong> {{companyName}}</p>
      </div>
      <p>Please log in to review and approve this order.</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  {
    templateId: '600031',
    eventId: '500031', // LOCATION_ADMIN_ORDER_STATUS
    templateName: 'Order Status Update - Location Admin Notification',
    subjectTemplate: 'Order Status Update: {{orderId}} - {{orderStatus}}',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #455A64; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .status { font-size: 18px; font-weight: bold; color: #455A64; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Order Status Update</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>An order at your location has been updated.</p>
      <p><strong>Order ID:</strong> {{orderId}}</p>
      <p><strong>Employee:</strong> {{orderEmployeeName}}</p>
      <p><strong>Previous Status:</strong> {{previousStatus}}</p>
      <p><strong>New Status:</strong> <span class="status">{{orderStatus}}</span></p>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  {
    templateId: '600032',
    eventId: '500032', // LOCATION_ADMIN_ORDER_DELIVERED
    templateName: 'Order Delivered - Location Admin Notification',
    subjectTemplate: '✅ Order Delivered at Your Location: {{orderId}}',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #388E3C; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .delivered { background-color: #e8f5e9; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Order Delivered</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>An order at your location has been delivered.</p>
      <div class="delivered">
        <p><strong>Order ID:</strong> {{orderId}}</p>
        <p><strong>Employee:</strong> {{orderEmployeeName}}</p>
        <p><strong>Status:</strong> Delivered</p>
      </div>
      <p>Please ensure the employee receives their items.</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  {
    templateId: '600033',
    eventId: '500033', // LOCATION_ADMIN_PO_GENERATED
    templateName: 'PO Generated - Location Admin Notification',
    subjectTemplate: '📋 Purchase Order Generated: {{poNumber}}',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #5C6BC0; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .po-info { background-color: #e8eaf6; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .po-number { font-size: 20px; font-weight: bold; color: #3F51B5; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📋 PO Generated</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>A Purchase Order has been generated for orders at your location.</p>
      <div class="po-info">
        <p><strong>PO Number:</strong> <span class="po-number">{{poNumber}}</span></p>
        <p><strong>Vendor:</strong> {{vendorName}}</p>
        <p><strong>Location:</strong> {{locationName}}</p>
      </div>
      <p>The order is now being processed by the vendor for fulfilment.</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  
  // -------------------------------------------------------------------------
  // GRN TEMPLATES
  // -------------------------------------------------------------------------
  {
    templateId: '600040',
    eventId: '500040', // GRN_CREATED
    templateName: 'GRN Created - Company Admin Notification',
    subjectTemplate: '📦 New GRN Submitted: {{grnNumber}} - Action Required',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #0288D1; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .grn-info { background-color: #e1f5fe; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .grn-number { font-size: 20px; font-weight: bold; color: #0277BD; }
    .action { background-color: #fff3e0; padding: 10px; border-left: 4px solid #FF9800; margin: 15px 0; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📦 New GRN Submitted</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>A new Goods Receipt Note (GRN) has been submitted by a vendor and requires your attention.</p>
      <div class="grn-info">
        <p><strong>GRN Number:</strong> <span class="grn-number">{{grnNumber}}</span></p>
        <p><strong>PO Number:</strong> {{poNumber}}</p>
        <p><strong>Vendor:</strong> {{vendorName}}</p>
        <p><strong>Company:</strong> {{companyName}}</p>
      </div>
      <div class="action">
        <strong>⚡ Action Required:</strong> Please review and acknowledge this GRN in the admin portal.
      </div>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  {
    templateId: '600041',
    eventId: '500041', // GRN_ACKNOWLEDGED
    templateName: 'GRN Acknowledged - Vendor Notification',
    subjectTemplate: '✅ GRN Acknowledged: {{grnNumber}}',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #43A047; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .grn-info { background-color: #e8f5e9; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .status { font-size: 18px; font-weight: bold; color: #2E7D32; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ GRN Acknowledged</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>Your GRN has been acknowledged by the company admin.</p>
      <div class="grn-info">
        <p><strong>GRN Number:</strong> {{grnNumber}}</p>
        <p><strong>PO Number:</strong> {{poNumber}}</p>
        <p><strong>Status:</strong> <span class="status">Acknowledged</span></p>
        <p><strong>Acknowledged By:</strong> {{acknowledgedBy}}</p>
      </div>
      <p>You can now proceed to create an invoice for this GRN.</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  {
    templateId: '600042',
    eventId: '500042', // GRN_APPROVED
    templateName: 'GRN Approved - Vendor Notification',
    subjectTemplate: '🎉 GRN Approved: {{grnNumber}}',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #1B5E20; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .grn-info { background-color: #e8f5e9; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .approved { font-size: 20px; font-weight: bold; color: #1B5E20; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 GRN Approved</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>Great news! Your GRN has been approved.</p>
      <div class="grn-info">
        <p><strong>GRN Number:</strong> {{grnNumber}}</p>
        <p><strong>PO Number:</strong> {{poNumber}}</p>
        <p><strong>Status:</strong> <span class="approved">Approved</span></p>
        <p><strong>Approved By:</strong> {{approvedBy}}</p>
      </div>
      <p>You can now proceed with invoicing.</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  
  // -------------------------------------------------------------------------
  // INVOICE TEMPLATES
  // -------------------------------------------------------------------------
  {
    templateId: '600050',
    eventId: '500050', // INVOICE_CREATED
    templateName: 'Invoice Created - Company Admin Notification',
    subjectTemplate: '🧾 New Invoice Submitted: {{invoiceNumber}} - Action Required',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #6A1B9A; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .invoice-info { background-color: #f3e5f5; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .invoice-number { font-size: 20px; font-weight: bold; color: #7B1FA2; }
    .amount { font-size: 24px; font-weight: bold; color: #4A148C; }
    .action { background-color: #fff3e0; padding: 10px; border-left: 4px solid #FF9800; margin: 15px 0; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧾 New Invoice Submitted</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>A new invoice has been submitted by a vendor and requires your approval.</p>
      <div class="invoice-info">
        <p><strong>Invoice Number:</strong> <span class="invoice-number">{{invoiceNumber}}</span></p>
        <p><strong>GRN Number:</strong> {{grnNumber}}</p>
        <p><strong>PO Number:</strong> {{poNumber}}</p>
        <p><strong>Vendor:</strong> {{vendorName}}</p>
        <p><strong>Amount:</strong> <span class="amount">₹{{invoiceAmount}}</span></p>
      </div>
      <div class="action">
        <strong>⚡ Action Required:</strong> Please review and approve this invoice in the admin portal.
      </div>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  {
    templateId: '600051',
    eventId: '500051', // INVOICE_APPROVED
    templateName: 'Invoice Approved - Vendor Notification',
    subjectTemplate: '✅ Invoice Approved: {{invoiceNumber}}',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #2E7D32; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .invoice-info { background-color: #e8f5e9; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .approved { font-size: 20px; font-weight: bold; color: #1B5E20; }
    .amount { font-size: 24px; font-weight: bold; color: #2E7D32; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Invoice Approved</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>Great news! Your invoice has been approved for payment.</p>
      <div class="invoice-info">
        <p><strong>Invoice Number:</strong> {{invoiceNumber}}</p>
        <p><strong>GRN Number:</strong> {{grnNumber}}</p>
        <p><strong>Status:</strong> <span class="approved">Approved</span></p>
        <p><strong>Amount:</strong> <span class="amount">₹{{invoiceAmount}}</span></p>
        <p><strong>Approved By:</strong> {{approvedBy}}</p>
      </div>
      <p>Payment will be processed according to the agreed terms.</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
  {
    templateId: '600052',
    eventId: '500052', // INVOICE_PAID
    templateName: 'Invoice Paid - Vendor Notification',
    subjectTemplate: '💰 Payment Completed: Invoice {{invoiceNumber}}',
    bodyTemplate: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #00695C; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9f9f9; }
    .payment-info { background-color: #e0f2f1; padding: 15px; border-radius: 4px; margin: 15px 0; }
    .paid { font-size: 22px; font-weight: bold; color: #00695C; }
    .amount { font-size: 28px; font-weight: bold; color: #004D40; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💰 Payment Completed</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>Your invoice payment has been completed!</p>
      <div class="payment-info">
        <p><strong>Invoice Number:</strong> {{invoiceNumber}}</p>
        <p><strong>Amount Paid:</strong> <span class="amount">₹{{invoiceAmount}}</span></p>
        <p><strong>Payment Reference:</strong> {{paymentReference}}</p>
        <p><strong>Payment Date:</strong> {{paymentDate}}</p>
        <p><strong>Status:</strong> <span class="paid">Paid</span></p>
      </div>
      <p>Thank you for your business!</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
    language: 'en',
    isActive: true,
  },
]

// =============================================================================
// MAIN SEEDING FUNCTION
// =============================================================================

async function seedNotificationData() {
  console.log('\n========== SEEDING NOTIFICATION DATA ==========\n')

  try {
    // Connect to MongoDB
    console.log(`Connecting to MongoDB: ${MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`)
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Seed Events
    console.log('--- Seeding NotificationEvents ---')
    let eventsCreated = 0
    let eventsSkipped = 0
    for (const event of events) {
      const existing = await NotificationEvent.findOne({ eventCode: event.eventCode })
      if (existing) {
        console.log(`⏭️  Event already exists: ${event.eventCode} (${existing.eventId})`)
        eventsSkipped++
      } else {
        await NotificationEvent.create(event)
        console.log(`✅ Created event: ${event.eventCode} (${event.eventId}) - ${event.defaultRecipientType}`)
        eventsCreated++
      }
    }

    // Seed Templates
    console.log('\n--- Seeding NotificationTemplates ---')
    let templatesCreated = 0
    let templatesSkipped = 0
    for (const template of templates) {
      const existing = await NotificationTemplate.findOne({ templateId: template.templateId })
      if (existing) {
        console.log(`⏭️  Template already exists: ${template.templateName} (${existing.templateId})`)
        templatesSkipped++
      } else {
        await NotificationTemplate.create(template)
        console.log(`✅ Created template: ${template.templateName} (${template.templateId})`)
        templatesCreated++
      }
    }

    console.log('\n========== SEEDING COMPLETE ==========\n')

    // Summary
    const eventCount = await NotificationEvent.countDocuments()
    const templateCount = await NotificationTemplate.countDocuments()
    console.log(`Summary:`)
    console.log(`  - Events created: ${eventsCreated}, skipped: ${eventsSkipped}`)
    console.log(`  - Templates created: ${templatesCreated}, skipped: ${templatesSkipped}`)
    console.log(`  - Total NotificationEvents: ${eventCount}`)
    console.log(`  - Total NotificationTemplates: ${templateCount}`)

    // List all events by recipient type
    console.log('\n--- Events by Recipient Type ---')
    const eventsByType = await NotificationEvent.aggregate([
      { $group: { _id: '$defaultRecipientType', count: { $sum: 1 } } }
    ])
    for (const { _id, count } of eventsByType) {
      console.log(`  - ${_id}: ${count} events`)
    }

  } catch (error: any) {
    console.error('❌ Error seeding data:', error.message)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  }
}

// Run if called directly
seedNotificationData()
