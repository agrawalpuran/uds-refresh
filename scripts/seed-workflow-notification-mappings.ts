/**
 * Seed Script: Workflow Notification Mappings
 * 
 * Populates the workflow_notification_mappings collection with
 * default configuration for Order, GRN, and Invoice workflows.
 * 
 * Usage:
 *   npx ts-node scripts/seed-workflow-notification-mappings.ts
 * 
 * @module scripts/seed-workflow-notification-mappings
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

import WorkflowNotificationMapping, {
  IWorkflowNotificationMapping,
  NOTIFICATION_CHANNELS,
  RECIPIENT_RESOLVERS,
} from '../lib/models/WorkflowNotificationMapping'
import { WORKFLOW_EVENT_TYPES } from '../lib/workflow/workflow-events'
import { WORKFLOW_ENTITY_TYPES } from '../lib/models/WorkflowConfiguration'

// =============================================================================
// DEFAULT NOTIFICATION MAPPINGS
// =============================================================================

const defaultMappings: Partial<IWorkflowNotificationMapping>[] = [
  // =========================================================================
  // ORDER NOTIFICATIONS (Global Defaults)
  // =========================================================================
  
  // 1. Order Submitted - Notify first approver
  {
    id: 'NM-ORDER-SUBMITTED-DEFAULT',
    companyId: '*',
    entityType: WORKFLOW_ENTITY_TYPES.ORDER,
    eventType: WORKFLOW_EVENT_TYPES.ENTITY_SUBMITTED,
    stageKey: null,
    recipientResolvers: [RECIPIENT_RESOLVERS.CURRENT_STAGE_ROLE],
    excludeActionPerformer: true,
    channels: [
      {
        channel: NOTIFICATION_CHANNELS.EMAIL,
        templateKey: 'ORDER_PENDING_APPROVAL',
        priority: 'NORMAL',
      },
    ],
    isActive: true,
    priority: 10,
    description: 'Notify first approver when order is submitted',
  },
  
  // 2. Order Approved at Stage - Notify next approver
  {
    id: 'NM-ORDER-STAGE-APPROVED-DEFAULT',
    companyId: '*',
    entityType: WORKFLOW_ENTITY_TYPES.ORDER,
    eventType: WORKFLOW_EVENT_TYPES.ENTITY_APPROVED_AT_STAGE,
    stageKey: null,
    recipientResolvers: [RECIPIENT_RESOLVERS.NEXT_STAGE_ROLE],
    excludeActionPerformer: true,
    channels: [
      {
        channel: NOTIFICATION_CHANNELS.EMAIL,
        templateKey: 'ORDER_PENDING_APPROVAL',
        priority: 'NORMAL',
      },
    ],
    isActive: true,
    priority: 10,
    description: 'Notify next approver when order moves to next stage',
  },
  
  // 3. Order Fully Approved - Notify requestor
  {
    id: 'NM-ORDER-APPROVED-REQUESTOR',
    companyId: '*',
    entityType: WORKFLOW_ENTITY_TYPES.ORDER,
    eventType: WORKFLOW_EVENT_TYPES.ENTITY_APPROVED,
    stageKey: null,
    recipientResolvers: [RECIPIENT_RESOLVERS.REQUESTOR],
    excludeActionPerformer: false,
    channels: [
      {
        channel: NOTIFICATION_CHANNELS.EMAIL,
        templateKey: 'ORDER_APPROVED',
        priority: 'HIGH',
      },
    ],
    isActive: true,
    priority: 10,
    description: 'Notify requestor when order is fully approved',
  },
  
  // 4. Order Fully Approved - Notify vendor
  {
    id: 'NM-ORDER-APPROVED-VENDOR',
    companyId: '*',
    entityType: WORKFLOW_ENTITY_TYPES.ORDER,
    eventType: WORKFLOW_EVENT_TYPES.ENTITY_APPROVED,
    stageKey: null,
    recipientResolvers: [RECIPIENT_RESOLVERS.VENDOR],
    excludeActionPerformer: false,
    channels: [
      {
        channel: NOTIFICATION_CHANNELS.EMAIL,
        templateKey: 'VENDOR_NEW_ORDER',
        priority: 'HIGH',
      },
    ],
    isActive: true,
    priority: 5,
    description: 'Notify vendor when order is fully approved',
  },
  
  // 5. Order Rejected - Notify requestor
  {
    id: 'NM-ORDER-REJECTED-REQUESTOR',
    companyId: '*',
    entityType: WORKFLOW_ENTITY_TYPES.ORDER,
    eventType: WORKFLOW_EVENT_TYPES.ENTITY_REJECTED,
    stageKey: null,
    recipientResolvers: [RECIPIENT_RESOLVERS.REQUESTOR],
    excludeActionPerformer: true,
    channels: [
      {
        channel: NOTIFICATION_CHANNELS.EMAIL,
        templateKey: 'ORDER_REJECTED',
        priority: 'HIGH',
      },
    ],
    isActive: true,
    priority: 10,
    description: 'Notify requestor when order is rejected',
  },
  
  // 6. Order Resubmitted - Notify first approver
  {
    id: 'NM-ORDER-RESUBMITTED-DEFAULT',
    companyId: '*',
    entityType: WORKFLOW_ENTITY_TYPES.ORDER,
    eventType: WORKFLOW_EVENT_TYPES.ENTITY_RESUBMITTED,
    stageKey: null,
    recipientResolvers: [RECIPIENT_RESOLVERS.CURRENT_STAGE_ROLE],
    excludeActionPerformer: true,
    channels: [
      {
        channel: NOTIFICATION_CHANNELS.EMAIL,
        templateKey: 'ORDER_RESUBMITTED',
        priority: 'NORMAL',
      },
    ],
    isActive: true,
    priority: 10,
    description: 'Notify first approver when order is resubmitted',
  },
  
  // =========================================================================
  // GRN NOTIFICATIONS (Global Defaults)
  // =========================================================================
  
  // 7. GRN Submitted - Notify approver
  {
    id: 'NM-GRN-SUBMITTED-DEFAULT',
    companyId: '*',
    entityType: WORKFLOW_ENTITY_TYPES.GRN,
    eventType: WORKFLOW_EVENT_TYPES.ENTITY_SUBMITTED,
    stageKey: null,
    recipientResolvers: [RECIPIENT_RESOLVERS.CURRENT_STAGE_ROLE],
    excludeActionPerformer: true,
    channels: [
      {
        channel: NOTIFICATION_CHANNELS.EMAIL,
        templateKey: 'GRN_PENDING_APPROVAL',
        priority: 'NORMAL',
      },
    ],
    isActive: true,
    priority: 10,
    description: 'Notify approver when GRN is raised',
  },
  
  // 8. GRN Approved - Notify vendor
  {
    id: 'NM-GRN-APPROVED-VENDOR',
    companyId: '*',
    entityType: WORKFLOW_ENTITY_TYPES.GRN,
    eventType: WORKFLOW_EVENT_TYPES.ENTITY_APPROVED,
    stageKey: null,
    recipientResolvers: [RECIPIENT_RESOLVERS.VENDOR],
    excludeActionPerformer: false,
    channels: [
      {
        channel: NOTIFICATION_CHANNELS.EMAIL,
        templateKey: 'GRN_APPROVED',
        priority: 'HIGH',
      },
    ],
    isActive: true,
    priority: 10,
    description: 'Notify vendor when GRN is approved',
  },
  
  // 9. GRN Rejected - Notify creator
  {
    id: 'NM-GRN-REJECTED-CREATOR',
    companyId: '*',
    entityType: WORKFLOW_ENTITY_TYPES.GRN,
    eventType: WORKFLOW_EVENT_TYPES.ENTITY_REJECTED,
    stageKey: null,
    recipientResolvers: [RECIPIENT_RESOLVERS.REQUESTOR],
    excludeActionPerformer: true,
    channels: [
      {
        channel: NOTIFICATION_CHANNELS.EMAIL,
        templateKey: 'GRN_REJECTED',
        priority: 'HIGH',
      },
    ],
    isActive: true,
    priority: 10,
    description: 'Notify GRN creator when GRN is rejected',
  },
  
  // =========================================================================
  // INVOICE NOTIFICATIONS (Global Defaults)
  // =========================================================================
  
  // 10. Invoice Submitted - Notify approver
  {
    id: 'NM-INVOICE-SUBMITTED-DEFAULT',
    companyId: '*',
    entityType: WORKFLOW_ENTITY_TYPES.INVOICE,
    eventType: WORKFLOW_EVENT_TYPES.ENTITY_SUBMITTED,
    stageKey: null,
    recipientResolvers: [RECIPIENT_RESOLVERS.CURRENT_STAGE_ROLE],
    excludeActionPerformer: true,
    channels: [
      {
        channel: NOTIFICATION_CHANNELS.EMAIL,
        templateKey: 'INVOICE_PENDING_APPROVAL',
        priority: 'NORMAL',
      },
    ],
    isActive: true,
    priority: 10,
    description: 'Notify approver when invoice is submitted',
  },
  
  // 11. Invoice Approved - Notify vendor
  {
    id: 'NM-INVOICE-APPROVED-VENDOR',
    companyId: '*',
    entityType: WORKFLOW_ENTITY_TYPES.INVOICE,
    eventType: WORKFLOW_EVENT_TYPES.ENTITY_APPROVED,
    stageKey: null,
    recipientResolvers: [RECIPIENT_RESOLVERS.VENDOR],
    excludeActionPerformer: false,
    channels: [
      {
        channel: NOTIFICATION_CHANNELS.EMAIL,
        templateKey: 'INVOICE_APPROVED',
        priority: 'HIGH',
      },
    ],
    isActive: true,
    priority: 10,
    description: 'Notify vendor when invoice is approved',
  },
  
  // 12. Invoice Rejected - Notify vendor
  {
    id: 'NM-INVOICE-REJECTED-VENDOR',
    companyId: '*',
    entityType: WORKFLOW_ENTITY_TYPES.INVOICE,
    eventType: WORKFLOW_EVENT_TYPES.ENTITY_REJECTED,
    stageKey: null,
    recipientResolvers: [RECIPIENT_RESOLVERS.VENDOR, RECIPIENT_RESOLVERS.REQUESTOR],
    excludeActionPerformer: true,
    channels: [
      {
        channel: NOTIFICATION_CHANNELS.EMAIL,
        templateKey: 'INVOICE_REJECTED',
        priority: 'HIGH',
      },
    ],
    isActive: true,
    priority: 10,
    description: 'Notify vendor and creator when invoice is rejected',
  },
  
  // =========================================================================
  // REMINDER NOTIFICATIONS (Global Defaults)
  // =========================================================================
  
  // 13. Approval Reminder
  {
    id: 'NM-APPROVAL-REMINDER-DEFAULT',
    companyId: '*',
    entityType: '*' as any,
    eventType: WORKFLOW_EVENT_TYPES.APPROVAL_REMINDER,
    stageKey: null,
    recipientResolvers: [RECIPIENT_RESOLVERS.CURRENT_STAGE_ROLE],
    excludeActionPerformer: false,
    channels: [
      {
        channel: NOTIFICATION_CHANNELS.EMAIL,
        templateKey: 'APPROVAL_REMINDER',
        priority: 'NORMAL',
      },
    ],
    isActive: true,
    priority: 5,
    description: 'Send approval reminder to current approvers',
  },
  
  // 14. Approval Escalation
  {
    id: 'NM-APPROVAL-ESCALATION-DEFAULT',
    companyId: '*',
    entityType: '*' as any,
    eventType: WORKFLOW_EVENT_TYPES.APPROVAL_ESCALATION,
    stageKey: null,
    recipientResolvers: [RECIPIENT_RESOLVERS.COMPANY_ADMIN],
    excludeActionPerformer: false,
    channels: [
      {
        channel: NOTIFICATION_CHANNELS.EMAIL,
        templateKey: 'APPROVAL_ESCALATION',
        priority: 'HIGH',
      },
    ],
    isActive: true,
    priority: 10,
    description: 'Escalate to Company Admin when approval timeout reached',
  },
]

// =============================================================================
// COMPANY-SPECIFIC OVERRIDES (Example: Company 100001)
// =============================================================================

const company100001Mappings: Partial<IWorkflowNotificationMapping>[] = [
  // Override: Also notify Company Admin on high-value orders
  {
    id: 'NM-ORDER-SUBMITTED-100001-HIGVAL',
    companyId: '100001',
    entityType: WORKFLOW_ENTITY_TYPES.ORDER,
    eventType: WORKFLOW_EVENT_TYPES.ENTITY_SUBMITTED,
    stageKey: null,
    recipientResolvers: [RECIPIENT_RESOLVERS.CURRENT_STAGE_ROLE, RECIPIENT_RESOLVERS.COMPANY_ADMIN],
    excludeActionPerformer: true,
    channels: [
      {
        channel: NOTIFICATION_CHANNELS.EMAIL,
        templateKey: 'ORDER_PENDING_APPROVAL_HIGHVALUE',
        priority: 'HIGH',
      },
    ],
    conditions: {
      minAmount: 50000, // Only for orders > 50,000
    },
    isActive: true,
    priority: 20, // Higher priority than default
    description: 'Notify Company Admin for high-value orders (>50K)',
  },
]

// =============================================================================
// SEED FUNCTION
// =============================================================================

async function seedNotificationMappings() {
  const mongoUri = process.env.MONGODB_URI
  
  if (!mongoUri) {
    console.error('MONGODB_URI not found in environment')
    process.exit(1)
  }
  
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(mongoUri)
    console.log('Connected successfully')
    
    // Clear existing mappings (optional)
    const shouldClear = process.argv.includes('--clear')
    if (shouldClear) {
      console.log('Clearing existing notification mappings...')
      await WorkflowNotificationMapping.deleteMany({})
      console.log('Cleared')
    }
    
    // Insert default mappings
    console.log('\nInserting default notification mappings...')
    for (const mapping of defaultMappings) {
      try {
        await WorkflowNotificationMapping.findOneAndUpdate(
          { id: mapping.id },
          mapping,
          { upsert: true, new: true }
        )
        console.log(`  ✓ ${mapping.id}: ${mapping.description}`)
      } catch (error: any) {
        console.error(`  ✗ ${mapping.id}: ${error.message}`)
      }
    }
    
    // Insert company-specific mappings
    console.log('\nInserting company-specific mappings...')
    for (const mapping of company100001Mappings) {
      try {
        await WorkflowNotificationMapping.findOneAndUpdate(
          { id: mapping.id },
          mapping,
          { upsert: true, new: true }
        )
        console.log(`  ✓ ${mapping.id}: ${mapping.description}`)
      } catch (error: any) {
        console.error(`  ✗ ${mapping.id}: ${error.message}`)
      }
    }
    
    // Summary
    const totalCount = await WorkflowNotificationMapping.countDocuments()
    const activeCount = await WorkflowNotificationMapping.countDocuments({ isActive: true })
    
    console.log('\n========================================')
    console.log('Notification Mapping Seed Complete')
    console.log('========================================')
    console.log(`Total mappings: ${totalCount}`)
    console.log(`Active mappings: ${activeCount}`)
    console.log('')
    
    // List by entity type
    const byEntityType = await WorkflowNotificationMapping.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$entityType', count: { $sum: 1 } } },
    ])
    console.log('By Entity Type:')
    for (const item of byEntityType) {
      console.log(`  ${item._id}: ${item.count}`)
    }
    
    // List by event type
    const byEventType = await WorkflowNotificationMapping.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$eventType', count: { $sum: 1 } } },
    ])
    console.log('\nBy Event Type:')
    for (const item of byEventType) {
      console.log(`  ${item._id}: ${item.count}`)
    }
    
  } catch (error) {
    console.error('Seed failed:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  }
}

// Run seed
seedNotificationMappings()
