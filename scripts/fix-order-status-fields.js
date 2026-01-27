/**
 * Data Migration Script: Fix Order Status Fields
 * 
 * This script fixes orders that have inconsistent status fields:
 * - status = 'Awaiting fulfilment' but unified_status = 'PENDING_APPROVAL'
 * - unified_pr_status is undefined (vendors can't see orders)
 * 
 * The fix updates these orders to have consistent status fields so:
 * - They are removed from the approvals page
 * - Vendors can see them in their dashboard
 * 
 * Usage: node scripts/fix-order-status-fields.js [--dry-run]
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

const DRY_RUN = process.argv.includes('--dry-run');

async function fixOrderStatusFields() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');
    
    const db = mongoose.connection.db;
    
    console.log('='.repeat(80));
    console.log(DRY_RUN ? '🔍 DRY RUN MODE - No changes will be made' : '🔧 LIVE MODE - Changes will be applied');
    console.log('='.repeat(80));
    
    // Find orders with inconsistent status fields
    // Case 1: status='Awaiting fulfilment' but unified_status='PENDING_APPROVAL'
    const inconsistentOrders = await db.collection('orders').find({
      status: 'Awaiting fulfilment',
      $or: [
        { unified_status: 'PENDING_APPROVAL' },
        { unified_status: { $exists: false } },
        { unified_status: null }
      ]
    }).toArray();
    
    console.log(`\n📋 Found ${inconsistentOrders.length} order(s) with inconsistent status fields:\n`);
    
    if (inconsistentOrders.length === 0) {
      console.log('✅ No orders need fixing!');
      await mongoose.disconnect();
      return;
    }
    
    // Display orders before fixing
    for (const order of inconsistentOrders) {
      console.log(`Order: ${order.id}`);
      console.log(`  Company: ${order.companyId}`);
      console.log(`  Vendor: ${order.vendorId} (${order.vendorName || 'N/A'})`);
      console.log(`  Current status: ${order.status}`);
      console.log(`  Current unified_status: ${order.unified_status || 'undefined'}`);
      console.log(`  Current unified_pr_status: ${order.unified_pr_status || 'undefined'}`);
      console.log(`  company_admin_approved_by: ${order.company_admin_approved_by || 'undefined'}`);
      console.log('');
    }
    
    if (DRY_RUN) {
      console.log('\n🔍 DRY RUN: Would update the following fields:');
      console.log('  unified_status: PENDING_APPROVAL → IN_FULFILMENT');
      console.log('  unified_pr_status: undefined → COMPANY_ADMIN_APPROVED');
      console.log('\nRun without --dry-run to apply changes.');
      await mongoose.disconnect();
      return;
    }
    
    // Apply fixes
    console.log('\n🔧 Applying fixes...\n');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const order of inconsistentOrders) {
      try {
        const updateFields = {
          unified_status: 'IN_FULFILMENT',
          unified_pr_status: 'COMPANY_ADMIN_APPROVED',
        };
        
        // Only set approval fields if not already set
        if (!order.company_admin_approved_by) {
          updateFields.company_admin_approved_by = 'SYSTEM_MIGRATION';
          updateFields.company_admin_approved_at = new Date();
        }
        
        const result = await db.collection('orders').updateOne(
          { id: order.id },
          { $set: updateFields }
        );
        
        if (result.modifiedCount > 0) {
          console.log(`✅ Fixed order ${order.id}:`);
          console.log(`   unified_status: ${order.unified_status || 'undefined'} → IN_FULFILMENT`);
          console.log(`   unified_pr_status: ${order.unified_pr_status || 'undefined'} → COMPANY_ADMIN_APPROVED`);
          successCount++;
        } else {
          console.log(`⚠️ Order ${order.id} was not modified`);
        }
      } catch (error) {
        console.error(`❌ Failed to fix order ${order.id}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total orders found: ${inconsistentOrders.length}`);
    console.log(`Successfully fixed: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    
    // Verify the fix
    console.log('\n🔍 Verifying fix...');
    const remainingInconsistent = await db.collection('orders').countDocuments({
      status: 'Awaiting fulfilment',
      $or: [
        { unified_status: 'PENDING_APPROVAL' },
        { unified_status: { $exists: false } },
        { unified_status: null }
      ]
    });
    
    if (remainingInconsistent === 0) {
      console.log('✅ All orders now have consistent status fields!');
    } else {
      console.log(`⚠️ ${remainingInconsistent} order(s) still have inconsistent status fields`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

fixOrderStatusFields();
