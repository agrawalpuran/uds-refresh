/**
 * Migration Script #6 — PREP FOR NEXT PHASE
 * 
 * Purpose: Set up logging infrastructure for tracking status migrations.
 * 
 * Creates:
 * - status_migration_logs collection for tracking all status updates
 * - Indexes for efficient querying
 * - Initial log entries documenting migration start
 * 
 * Usage: node scripts/migration-06-setup-migration-logs.js
 * 
 * @version 1.0.0
 * @created 2026-01-15
 */

require('dotenv').config()
const mongoose = require('mongoose')

// =============================================================================
// COLLECTION SETUP
// =============================================================================

async function setupMigrationLogsCollection(db) {
  console.log('\n' + '='.repeat(80))
  console.log('SETTING UP: status_migration_logs Collection')
  console.log('='.repeat(80))
  
  const collectionName = 'status_migration_logs'
  
  // Check if collection exists
  const collections = await db.listCollections({ name: collectionName }).toArray()
  if (collections.length > 0) {
    console.log(`Collection '${collectionName}' already exists`)
    
    // Get current count
    const count = await db.collection(collectionName).countDocuments()
    console.log(`Current log entries: ${count}`)
    
    return { created: false, existed: true, count }
  }
  
  // Create the collection with schema validation
  await db.createCollection(collectionName, {
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['entityType', 'entityId', 'action', 'timestamp'],
        properties: {
          entityType: {
            bsonType: 'string',
            enum: ['Order', 'PR', 'PO', 'Shipment', 'GRN', 'Invoice'],
            description: 'Type of entity being updated'
          },
          entityId: {
            bsonType: 'string',
            description: 'ID of the entity (e.g., order.id, shipment.shipmentId)'
          },
          action: {
            bsonType: 'string',
            enum: ['STATUS_UPDATE', 'STATUS_SYNC', 'STATUS_REPAIR', 'MIGRATION_START', 'MIGRATION_COMPLETE'],
            description: 'Type of action performed'
          },
          previousLegacyStatus: {
            bsonType: ['string', 'null'],
            description: 'Previous value of the legacy status field'
          },
          newLegacyStatus: {
            bsonType: ['string', 'null'],
            description: 'New value of the legacy status field (if changed)'
          },
          previousUnifiedStatus: {
            bsonType: ['string', 'null'],
            description: 'Previous value of the unified status field'
          },
          newUnifiedStatus: {
            bsonType: ['string', 'null'],
            description: 'New value of the unified status field'
          },
          source: {
            bsonType: 'string',
            description: 'Source of the update (migration script, API, status-engine, etc.)'
          },
          updatedBy: {
            bsonType: ['string', 'null'],
            description: 'User or system that performed the update'
          },
          timestamp: {
            bsonType: 'date',
            description: 'When the action occurred'
          },
          metadata: {
            bsonType: 'object',
            description: 'Additional context or data about the update'
          }
        }
      }
    }
  })
  
  console.log(`Collection '${collectionName}' created successfully`)
  
  // Create indexes
  console.log('\nCreating indexes...')
  
  const collection = db.collection(collectionName)
  
  await collection.createIndex({ entityType: 1, entityId: 1 })
  console.log('  ✓ Index: entityType + entityId')
  
  await collection.createIndex({ entityType: 1, timestamp: -1 })
  console.log('  ✓ Index: entityType + timestamp (descending)')
  
  await collection.createIndex({ action: 1, timestamp: -1 })
  console.log('  ✓ Index: action + timestamp')
  
  await collection.createIndex({ source: 1 })
  console.log('  ✓ Index: source')
  
  await collection.createIndex({ timestamp: -1 })
  console.log('  ✓ Index: timestamp (descending)')
  
  await collection.createIndex({ updatedBy: 1, timestamp: -1 })
  console.log('  ✓ Index: updatedBy + timestamp')
  
  // Create TTL index to auto-expire old logs after 90 days (optional)
  // await collection.createIndex({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 })
  // console.log('  ✓ TTL Index: auto-expire after 90 days')
  
  return { created: true, existed: false, count: 0 }
}

async function logMigrationStart(db) {
  console.log('\n' + '='.repeat(80))
  console.log('LOGGING: Migration Start Entry')
  console.log('='.repeat(80))
  
  const collection = db.collection('status_migration_logs')
  
  // Get counts of all entities
  const orderCount = await db.collection('orders').countDocuments({ pr_number: { $exists: false } })
  const prCount = await db.collection('orders').countDocuments({ pr_number: { $exists: true } })
  const poCount = await db.collection('purchaseorders').countDocuments()
  const shipmentCount = await db.collection('shipments').countDocuments()
  const grnCount = await db.collection('grns').countDocuments()
  const invoiceCount = await db.collection('invoices').countDocuments()
  
  const startLog = {
    entityType: 'Order', // Using Order as placeholder for system-level entry
    entityId: 'MIGRATION_SYSTEM',
    action: 'MIGRATION_START',
    previousLegacyStatus: null,
    newLegacyStatus: null,
    previousUnifiedStatus: null,
    newUnifiedStatus: null,
    source: 'migration-06-setup-migration-logs',
    updatedBy: 'system',
    timestamp: new Date(),
    metadata: {
      migrationVersion: '1.0.0',
      migrationPhase: 'unified-status-fields',
      entityCounts: {
        orders: orderCount,
        prs: prCount,
        pos: poCount,
        shipments: shipmentCount,
        grns: grnCount,
        invoices: invoiceCount,
        total: orderCount + prCount + poCount + shipmentCount + grnCount + invoiceCount,
      },
      scriptsExecuted: [
        'migration-01-add-unified-status-fields',
        'migration-02-status-normalization-audit',
        'migration-03-status-consistency-repair',
        'migration-04-orphaned-relationships-audit',
        'migration-05-optional-cleanup',
        'migration-06-setup-migration-logs',
      ],
      notes: 'Unified status field migration initialized. Dual-write ready.',
    }
  }
  
  await collection.insertOne(startLog)
  console.log('Migration start log entry created')
  
  console.log(`
Entity Counts at Migration Start:
  - Orders (non-PR): ${orderCount}
  - PRs: ${prCount}
  - POs: ${poCount}
  - Shipments: ${shipmentCount}
  - GRNs: ${grnCount}
  - Invoices: ${invoiceCount}
  - Total: ${startLog.metadata.entityCounts.total}
`)
  
  return startLog
}

async function createHelperFunctions(db) {
  console.log('\n' + '='.repeat(80))
  console.log('HELPER FUNCTIONS FOR STATUS LOGGING')
  console.log('='.repeat(80))
  
  console.log(`
To log status updates in your application code, use the following pattern:

============================================================================
// In lib/workflow/migration-logger.ts (create this file when ready)
============================================================================

import connectDB from '../db/mongodb'
import mongoose from 'mongoose'

interface StatusLogEntry {
  entityType: 'Order' | 'PR' | 'PO' | 'Shipment' | 'GRN' | 'Invoice'
  entityId: string
  action: 'STATUS_UPDATE' | 'STATUS_SYNC' | 'STATUS_REPAIR'
  previousLegacyStatus: string | null
  newLegacyStatus: string | null
  previousUnifiedStatus: string | null
  newUnifiedStatus: string | null
  source: string
  updatedBy?: string
  metadata?: Record<string, any>
}

export async function logStatusChange(entry: StatusLogEntry): Promise<void> {
  await connectDB()
  const db = mongoose.connection.db
  
  await db.collection('status_migration_logs').insertOne({
    ...entry,
    timestamp: new Date(),
  })
}

// Usage example:
// await logStatusChange({
//   entityType: 'Order',
//   entityId: 'ORD123',
//   action: 'STATUS_UPDATE',
//   previousLegacyStatus: 'Awaiting approval',
//   newLegacyStatus: 'Awaiting fulfilment',
//   previousUnifiedStatus: 'PENDING_APPROVAL',
//   newUnifiedStatus: 'IN_FULFILMENT',
//   source: 'status-engine',
//   updatedBy: 'admin@example.com',
//   metadata: { reason: 'Admin approved order' }
// })

============================================================================
// Query examples for reviewing logs:
============================================================================

// Get all updates for a specific entity:
db.status_migration_logs.find({ entityType: 'Order', entityId: 'ORD123' }).sort({ timestamp: -1 })

// Get recent updates across all entities:
db.status_migration_logs.find({}).sort({ timestamp: -1 }).limit(100)

// Get updates by source:
db.status_migration_logs.find({ source: 'status-engine' }).sort({ timestamp: -1 })

// Get inconsistency repairs:
db.status_migration_logs.find({ action: 'STATUS_REPAIR' }).sort({ timestamp: -1 })

// Count updates by entity type:
db.status_migration_logs.aggregate([
  { $group: { _id: '$entityType', count: { $sum: 1 } } },
  { $sort: { count: -1 } }
])
`)
  
  return true
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
  console.log('║     MIGRATION SCRIPT #6 — SETUP MIGRATION LOGS                               ║')
  console.log('║     Creates logging infrastructure for status migration tracking             ║')
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝')
  console.log()
  console.log(`Timestamp: ${new Date().toISOString()}`)
  
  const mongoUri = process.env.MONGODB_URI
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI environment variable not set')
    process.exit(1)
  }
  
  try {
    await mongoose.connect(mongoUri)
    console.log('Connected to MongoDB')
    
    const db = mongoose.connection.db
    
    // Setup collection
    const setupResult = await setupMigrationLogsCollection(db)
    
    // Log migration start
    await logMigrationStart(db)
    
    // Show helper functions
    await createHelperFunctions(db)
    
    // Summary
    console.log('\n' + '═'.repeat(80))
    console.log('SETUP SUMMARY')
    console.log('═'.repeat(80))
    
    console.log(`
┌─────────────────────────────────────────────────────────────────────────────┐
│ Collection: status_migration_logs                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ Status: ${setupResult.created ? '✅ CREATED' : '✅ ALREADY EXISTS'}                                                      │
│ Indexes: 6 created                                                          │
│ Initial Log: Migration start entry added                                    │
└─────────────────────────────────────────────────────────────────────────────┘

Next Steps:
1. Run migration-02 audit to verify status field consistency
2. Run migration-03 repair if needed
3. Run migration-04 to check for orphaned relationships
4. Implement dual-write logic in application code (Phase 2)
5. Monitor status_migration_logs for inconsistencies

The logging infrastructure is now ready for the next migration phase.
`)
    
    console.log('═'.repeat(80))
    console.log('SETUP COMPLETE')
    console.log('═'.repeat(80))
    
  } catch (error) {
    console.error('Migration error:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  }
}

main()
