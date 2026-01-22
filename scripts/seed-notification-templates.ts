/**
 * Seed Notification Events and Templates
 * 
 * Creates basic notification events and email templates for Phase 1.
 * Run this script once to populate the database with initial data.
 * 
 * Usage: npx ts-node scripts/seed-notification-templates.ts
 * 
 * Creates:
 * - 3 NotificationEvents (ORDER_STATUS_CHANGED, PO_GENERATED, ORDER_MARKED_DELIVERED)
 * - 3 NotificationTemplates (one for each event)
 */

import mongoose from 'mongoose'
import NotificationEvent from '../lib/models/NotificationEvent'
import NotificationTemplate from '../lib/models/NotificationTemplate'

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uds'

// Event definitions
const events = [
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
]

// Template definitions with HTML content
const templates = [
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
]

async function seedNotificationData() {
  console.log('\n========== SEEDING NOTIFICATION DATA ==========\n')

  try {
    // Connect to MongoDB
    console.log(`Connecting to MongoDB: ${MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`)
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Seed Events
    console.log('--- Seeding NotificationEvents ---')
    for (const event of events) {
      const existing = await NotificationEvent.findOne({ eventCode: event.eventCode })
      if (existing) {
        console.log(`⏭️  Event already exists: ${event.eventCode} (${existing.eventId})`)
      } else {
        await NotificationEvent.create(event)
        console.log(`✅ Created event: ${event.eventCode} (${event.eventId})`)
      }
    }

    // Seed Templates
    console.log('\n--- Seeding NotificationTemplates ---')
    for (const template of templates) {
      const existing = await NotificationTemplate.findOne({ templateId: template.templateId })
      if (existing) {
        console.log(`⏭️  Template already exists: ${template.templateName} (${existing.templateId})`)
      } else {
        await NotificationTemplate.create(template)
        console.log(`✅ Created template: ${template.templateName} (${template.templateId})`)
      }
    }

    console.log('\n========== SEEDING COMPLETE ==========\n')

    // Summary
    const eventCount = await NotificationEvent.countDocuments()
    const templateCount = await NotificationTemplate.countDocuments()
    console.log(`Summary:`)
    console.log(`  - NotificationEvents: ${eventCount}`)
    console.log(`  - NotificationTemplates: ${templateCount}`)

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
