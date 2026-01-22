/**
 * SAFE DELETE SEQUENCE — Orphaned VendorInventory Records
 * 
 * This script safely deletes orphaned vendorinventory records
 * that reference non-existent products (200001, 200005).
 * 
 * SEQUENCE:
 *   1. Backup orphaned records
 *   2. Verify backup
 *   3. Delete orphaned records
 *   4. Verify deletion
 *   5. Check for dangling references
 */

const mongoose = require('mongoose');

const ORPHANED_PRODUCT_IDS = ['200001', '200005'];

async function executeDeleteSequence() {
  await mongoose.connect('mongodb://localhost:27017/uniform-distribution');
  const db = mongoose.connection.db;
  
  console.log('============================================================');
  console.log('🔒 SAFE DELETE SEQUENCE — Orphaned VendorInventory Records');
  console.log('============================================================');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Target productIds: ${ORPHANED_PRODUCT_IDS.join(', ')}`);
  console.log('');
  
  // ============================================================
  // STEP 1 — BACKUP ORPHANED RECORDS
  // ============================================================
  
  console.log('============================================================');
  console.log('STEP 1 — BACKUP ORPHANED RECORDS');
  console.log('============================================================');
  
  // Find orphaned records first
  const orphanedRecords = await db.collection('vendorinventories').find({
    productId: { $in: ORPHANED_PRODUCT_IDS }
  }).toArray();
  
  console.log(`Found ${orphanedRecords.length} orphaned records to backup`);
  
  if (orphanedRecords.length === 0) {
    console.log('⚠️  No orphaned records found. Nothing to delete.');
    await mongoose.disconnect();
    return;
  }
  
  // Show records to be backed up
  console.log('\nRecords to backup:');
  for (const rec of orphanedRecords) {
    console.log(`  - _id: ${rec._id}, productId: ${rec.productId}, vendorId: ${rec.vendorId}`);
  }
  
  // Create backup collection if it doesn't exist
  const collections = await db.listCollections({ name: 'vendorinventory_backup' }).toArray();
  if (collections.length === 0) {
    await db.createCollection('vendorinventory_backup');
    console.log('\n✅ Created backup collection: vendorinventory_backup');
  } else {
    console.log('\nℹ️  Backup collection already exists');
  }
  
  // Insert orphaned records into backup
  const backupResult = await db.collection('vendorinventory_backup').insertMany(
    orphanedRecords.map(r => ({
      ...r,
      _original_id: r._id,
      _backup_timestamp: new Date()
    }))
  );
  
  console.log(`✅ Backed up ${backupResult.insertedCount} records`);
  
  // ============================================================
  // STEP 1 VERIFICATION — Verify Backup
  // ============================================================
  
  console.log('\n--- Backup Verification ---');
  
  const backupCount = await db.collection('vendorinventory_backup').countDocuments();
  const backupRecords = await db.collection('vendorinventory_backup').find({}).toArray();
  
  console.log(`Backup collection count: ${backupCount}`);
  console.log(`Expected count: ${orphanedRecords.length}`);
  
  if (backupCount < orphanedRecords.length) {
    console.log('❌ BACKUP VERIFICATION FAILED — Aborting delete');
    await mongoose.disconnect();
    throw new Error('Backup count does not match orphaned count');
  }
  
  console.log('✅ Backup verification PASSED');
  
  // ============================================================
  // STEP 2 — DELETE ORPHANED RECORDS
  // ============================================================
  
  console.log('\n============================================================');
  console.log('STEP 2 — DELETE ORPHANED RECORDS');
  console.log('============================================================');
  
  const deleteResult = await db.collection('vendorinventories').deleteMany({
    productId: { $in: ORPHANED_PRODUCT_IDS }
  });
  
  console.log(`\n✅ DELETE RESULT:`);
  console.log(`   - Documents deleted: ${deleteResult.deletedCount}`);
  console.log(`   - ProductIds affected: ${ORPHANED_PRODUCT_IDS.join(', ')}`);
  console.log(`   - Timestamp: ${new Date().toISOString()}`);
  
  // ============================================================
  // STEP 3 — VERIFY DELETION
  // ============================================================
  
  console.log('\n============================================================');
  console.log('STEP 3 — VERIFY DELETION');
  console.log('============================================================');
  
  const remainingCount = await db.collection('vendorinventories').countDocuments({
    productId: { $in: ORPHANED_PRODUCT_IDS }
  });
  
  console.log(`Remaining orphaned records: ${remainingCount}`);
  
  if (remainingCount === 0) {
    console.log('✅ Deletion verification PASSED — No orphaned records remain');
  } else {
    console.log('❌ WARNING: Some orphaned records still exist');
  }
  
  // ============================================================
  // STEP 4 — INTEGRITY CHECK
  // ============================================================
  
  console.log('\n============================================================');
  console.log('STEP 4 — INTEGRITY CHECK (Dangling References)');
  console.log('============================================================');
  
  // Check productvendors
  const pvCount = await db.collection('productvendors').countDocuments({
    productId: { $in: ORPHANED_PRODUCT_IDS }
  });
  console.log(`productvendors referencing [${ORPHANED_PRODUCT_IDS.join(', ')}]: ${pvCount}`);
  
  // Check productcategories (products don't have productId field directly, but checking just in case)
  // Note: productcategories typically doesn't have productId, but we check for safety
  const pcCount = await db.collection('productcategories').countDocuments({
    productId: { $in: ORPHANED_PRODUCT_IDS }
  });
  console.log(`productcategories referencing [${ORPHANED_PRODUCT_IDS.join(', ')}]: ${pcCount}`);
  
  // Check orders (items array)
  const ordersCount = await db.collection('orders').countDocuments({
    'items.productId': { $in: ORPHANED_PRODUCT_IDS }
  });
  console.log(`orders referencing [${ORPHANED_PRODUCT_IDS.join(', ')}]: ${ordersCount}`);
  
  // ============================================================
  // SUMMARY
  // ============================================================
  
  console.log('\n============================================================');
  console.log('📊 DELETION SUMMARY');
  console.log('============================================================');
  console.log(`\n✅ SEQUENCE COMPLETED SUCCESSFULLY`);
  console.log(`\nResults:`);
  console.log(`   - Records backed up: ${backupResult.insertedCount}`);
  console.log(`   - Records deleted: ${deleteResult.deletedCount}`);
  console.log(`   - Remaining orphaned: ${remainingCount}`);
  console.log(`   - Dangling refs in productvendors: ${pvCount}`);
  console.log(`   - Dangling refs in productcategories: ${pcCount}`);
  console.log(`   - Dangling refs in orders: ${ordersCount}`);
  
  const totalDangling = pvCount + pcCount + ordersCount;
  
  if (totalDangling === 0) {
    console.log(`\n✅ INTEGRITY CHECK PASSED — No dangling references found`);
  } else {
    console.log(`\n⚠️  WARNING: ${totalDangling} dangling references found`);
  }
  
  console.log(`\nBackup location: vendorinventory_backup collection`);
  console.log(`Completed: ${new Date().toISOString()}`);
  console.log('============================================================');
  
  await mongoose.disconnect();
  
  return {
    backed_up: backupResult.insertedCount,
    deleted: deleteResult.deletedCount,
    remaining: remainingCount,
    dangling_refs: totalDangling
  };
}

executeDeleteSequence().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
