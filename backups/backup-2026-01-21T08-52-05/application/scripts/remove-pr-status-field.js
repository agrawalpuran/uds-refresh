/**
 * Migration Script: Remove Legacy pr_status Field
 * 
 * This script removes the deprecated pr_status field from all Order documents
 * in MongoDB. This field has been replaced by unified_pr_status as part of
 * the unified status workflow migration.
 * 
 * SAFETY: Before running, ensure all orders have unified_pr_status populated.
 * 
 * Usage:
 *   node scripts/remove-pr-status-field.js [--dry-run]
 * 
 * Options:
 *   --dry-run    Preview changes without modifying the database
 * 
 * @created 2026-01-16
 */

const mongoose = require('mongoose')
require('dotenv').config({ path: '.env.local' })

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is not set')
  process.exit(1)
}

const isDryRun = process.argv.includes('--dry-run')

async function removeprStatusField() {
  console.log('='.repeat(70))
  console.log('Migration: Remove Legacy pr_status Field from Orders Collection')
  console.log('='.repeat(70))
  console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (no changes will be made)' : '⚡ LIVE (changes will be applied)'}`)
  console.log('')

  try {
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected successfully')
    console.log('')

    const db = mongoose.connection.db

    // Step 1: Check orders collection
    console.log('Step 1: Analyzing orders collection...')
    const ordersCollection = db.collection('orders')
    
    const totalOrders = await ordersCollection.countDocuments()
    console.log(`   Total orders: ${totalOrders}`)

    // Count orders with pr_status field
    const ordersWithPrStatus = await ordersCollection.countDocuments({ pr_status: { $exists: true } })
    console.log(`   Orders with pr_status field: ${ordersWithPrStatus}`)

    // Count orders with unified_pr_status field
    const ordersWithUnifiedPrStatus = await ordersCollection.countDocuments({ unified_pr_status: { $exists: true } })
    console.log(`   Orders with unified_pr_status field: ${ordersWithUnifiedPrStatus}`)

    // Check for orders that have pr_status but NOT unified_pr_status (potential data loss)
    const ordersNeedingMigration = await ordersCollection.countDocuments({
      pr_status: { $exists: true },
      unified_pr_status: { $exists: false }
    })
    console.log(`   Orders with pr_status but NO unified_pr_status: ${ordersNeedingMigration}`)
    console.log('')

    if (ordersNeedingMigration > 0) {
      console.log('⚠️  WARNING: Some orders have pr_status but no unified_pr_status!')
      console.log('   These orders need to be migrated before removing pr_status.')
      console.log('')
      console.log('   Running backfill to migrate legacy pr_status to unified_pr_status...')
      
      // Backfill unified_pr_status from pr_status for orders missing it
      const legacyToUnifiedMapping = {
        'DRAFT': 'DRAFT',
        'SUBMITTED': 'PENDING_SITE_ADMIN_APPROVAL',
        'PENDING_SITE_ADMIN_APPROVAL': 'PENDING_SITE_ADMIN_APPROVAL',
        'SITE_ADMIN_APPROVED': 'SITE_ADMIN_APPROVED',
        'PENDING_COMPANY_ADMIN_APPROVAL': 'PENDING_COMPANY_ADMIN_APPROVAL',
        'COMPANY_ADMIN_APPROVED': 'COMPANY_ADMIN_APPROVED',
        'REJECTED_BY_SITE_ADMIN': 'REJECTED',
        'REJECTED_BY_COMPANY_ADMIN': 'REJECTED',
        'PO_CREATED': 'LINKED_TO_PO',
        'FULLY_DELIVERED': 'FULLY_DELIVERED',
      }

      // Find and update orders needing migration
      const ordersToMigrate = await ordersCollection.find({
        pr_status: { $exists: true },
        unified_pr_status: { $exists: false }
      }).toArray()

      if (!isDryRun) {
        let migratedCount = 0
        for (const order of ordersToMigrate) {
          const legacyStatus = order.pr_status
          const unifiedStatus = legacyToUnifiedMapping[legacyStatus] || 'DRAFT'
          
          await ordersCollection.updateOne(
            { _id: order._id },
            { 
              $set: { 
                unified_pr_status: unifiedStatus,
                unified_pr_status_updated_at: new Date(),
                unified_pr_status_updated_by: 'migration-script'
              } 
            }
          )
          migratedCount++
        }
        console.log(`   ✅ Migrated ${migratedCount} orders to unified_pr_status`)
      } else {
        console.log(`   [DRY RUN] Would migrate ${ordersToMigrate.length} orders`)
        ordersToMigrate.slice(0, 5).forEach(order => {
          const unifiedStatus = legacyToUnifiedMapping[order.pr_status] || 'DRAFT'
          console.log(`   - Order ${order.id}: ${order.pr_status} → ${unifiedStatus}`)
        })
        if (ordersToMigrate.length > 5) {
          console.log(`   ... and ${ordersToMigrate.length - 5} more`)
        }
      }
      console.log('')
    }

    // Step 2: Remove pr_status field from all orders
    console.log('Step 2: Removing pr_status field from all orders...')
    
    if (ordersWithPrStatus === 0) {
      console.log('   ℹ️  No orders have pr_status field - nothing to remove')
    } else {
      if (!isDryRun) {
        const result = await ordersCollection.updateMany(
          { pr_status: { $exists: true } },
          { $unset: { pr_status: '' } }
        )
        console.log(`   ✅ Removed pr_status from ${result.modifiedCount} orders`)
      } else {
        console.log(`   [DRY RUN] Would remove pr_status from ${ordersWithPrStatus} orders`)
      }
    }
    console.log('')

    // Step 3: Verify the removal
    console.log('Step 3: Verification...')
    if (!isDryRun) {
      const remainingWithPrStatus = await ordersCollection.countDocuments({ pr_status: { $exists: true } })
      console.log(`   Orders still with pr_status: ${remainingWithPrStatus}`)
      
      if (remainingWithPrStatus === 0) {
        console.log('   ✅ All pr_status fields successfully removed!')
      } else {
        console.log('   ⚠️  Some orders still have pr_status - please investigate')
      }
    } else {
      console.log('   [DRY RUN] Verification skipped')
    }
    console.log('')

    // Step 4: Summary
    console.log('='.repeat(70))
    console.log('SUMMARY')
    console.log('='.repeat(70))
    console.log(`Total orders processed: ${totalOrders}`)
    console.log(`Orders with unified_pr_status: ${ordersWithUnifiedPrStatus}`)
    console.log(`pr_status fields removed: ${isDryRun ? '(dry run)' : ordersWithPrStatus}`)
    console.log('')
    
    if (isDryRun) {
      console.log('🔍 This was a DRY RUN. No changes were made.')
      console.log('   Run without --dry-run to apply changes.')
    } else {
      console.log('✅ Migration completed successfully!')
    }
    console.log('')

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('📡 Disconnected from MongoDB')
  }
}

// Run the migration
removeprStatusField()
