/**
 * Fix Missing Unified Fields
 * 
 * This script populates missing unified status fields based on legacy fields.
 * Run this to bring unified field coverage to 100%.
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

// Status mappings (legacy -> unified)
const LegacyToUnifiedPOStatus = {
  'CREATED': 'CREATED',
  'SENT_TO_VENDOR': 'SENT_TO_VENDOR',
  'ACKNOWLEDGED': 'ACKNOWLEDGED',
  'IN_FULFILMENT': 'IN_FULFILMENT',
  'COMPLETED': 'FULLY_DELIVERED',
  'CANCELLED': 'CANCELLED',
};

const LegacyToUnifiedShipmentStatus = {
  'CREATED': 'CREATED',
  'IN_TRANSIT': 'IN_TRANSIT',
  'DELIVERED': 'DELIVERED',
  'FAILED': 'FAILED',
};

const LegacyToUnifiedPRStatus = {
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
};

async function fixMissingUnifiedFields() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');
  
  const db = mongoose.connection.db;
  const timestamp = new Date();
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FIX 1: Purchase Orders missing unified_po_status
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('FIX 1: Purchase Orders missing unified_po_status');
  console.log('═══════════════════════════════════════════════════════════════════');
  
  const posWithoutUnified = await db.collection('purchaseorders').find({
    $or: [
      { unified_po_status: { $exists: false } },
      { unified_po_status: null },
      { unified_po_status: '' }
    ]
  }).toArray();
  
  console.log(`Found ${posWithoutUnified.length} PO(s) missing unified_po_status`);
  
  for (const po of posWithoutUnified) {
    const legacyStatus = po.po_status || 'CREATED';
    const unifiedStatus = LegacyToUnifiedPOStatus[legacyStatus] || 'CREATED';
    
    console.log(`  → PO ${po.id}: ${legacyStatus} → unified: ${unifiedStatus}`);
    
    await db.collection('purchaseorders').updateOne(
      { _id: po._id },
      { 
        $set: { 
          unified_po_status: unifiedStatus,
          unified_po_status_updated_at: timestamp,
          unified_po_status_updated_by: 'migration-fix'
        } 
      }
    );
  }
  console.log(`✅ Fixed ${posWithoutUnified.length} PO(s)\n`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FIX 2: Shipments missing unified_shipment_status
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('FIX 2: Shipments missing unified_shipment_status');
  console.log('═══════════════════════════════════════════════════════════════════');
  
  const shipmentsWithoutUnified = await db.collection('shipments').find({
    $or: [
      { unified_shipment_status: { $exists: false } },
      { unified_shipment_status: null },
      { unified_shipment_status: '' }
    ]
  }).toArray();
  
  console.log(`Found ${shipmentsWithoutUnified.length} shipment(s) missing unified_shipment_status`);
  
  for (const shipment of shipmentsWithoutUnified) {
    const legacyStatus = shipment.shipmentStatus || 'CREATED';
    const unifiedStatus = LegacyToUnifiedShipmentStatus[legacyStatus] || 'CREATED';
    
    console.log(`  → Shipment ${shipment.shipmentId}: ${legacyStatus} → unified: ${unifiedStatus}`);
    
    await db.collection('shipments').updateOne(
      { _id: shipment._id },
      { 
        $set: { 
          unified_shipment_status: unifiedStatus,
          unified_shipment_status_updated_at: timestamp,
          unified_shipment_status_updated_by: 'migration-fix'
        } 
      }
    );
  }
  console.log(`✅ Fixed ${shipmentsWithoutUnified.length} shipment(s)\n`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FIX 3: Orders missing unified_pr_status
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('FIX 3: Orders/PRs missing unified_pr_status');
  console.log('═══════════════════════════════════════════════════════════════════');
  
  const ordersWithoutUnifiedPR = await db.collection('orders').find({
    pr_status: { $exists: true, $ne: null },
    $or: [
      { unified_pr_status: { $exists: false } },
      { unified_pr_status: null },
      { unified_pr_status: '' }
    ]
  }).toArray();
  
  console.log(`Found ${ordersWithoutUnifiedPR.length} order(s) missing unified_pr_status`);
  
  for (const order of ordersWithoutUnifiedPR) {
    const legacyStatus = order.pr_status || 'DRAFT';
    const unifiedStatus = LegacyToUnifiedPRStatus[legacyStatus] || 'DRAFT';
    
    console.log(`  → Order ${order.id}: ${legacyStatus} → unified: ${unifiedStatus}`);
    
    await db.collection('orders').updateOne(
      { _id: order._id },
      { 
        $set: { 
          unified_pr_status: unifiedStatus,
          unified_pr_status_updated_at: timestamp,
          unified_pr_status_updated_by: 'migration-fix'
        } 
      }
    );
  }
  console.log(`✅ Fixed ${ordersWithoutUnifiedPR.length} order(s)\n`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('MIGRATION FIX SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  POs fixed:        ${posWithoutUnified.length}`);
  console.log(`  Shipments fixed:  ${shipmentsWithoutUnified.length}`);
  console.log(`  Orders/PRs fixed: ${ordersWithoutUnifiedPR.length}`);
  console.log(`  Total fixed:      ${posWithoutUnified.length + shipmentsWithoutUnified.length + ordersWithoutUnifiedPR.length}`);
  console.log('');
  console.log('✅ All missing unified fields have been populated!');
  console.log('');
  console.log('Next step: Re-run the verification script:');
  console.log('  node scripts/phase3/phase3-unified-workflow-verification.js');
  
  await mongoose.disconnect();
}

fixMissingUnifiedFields().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
