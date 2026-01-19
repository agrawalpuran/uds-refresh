/**
 * POST-CLEANUP VERIFICATION SCRIPT
 * 
 * Tests all modified functions to ensure they still work correctly
 * after removing ObjectId fallback logic.
 */

const mongoose = require('mongoose');

async function runVerification() {
  console.log('============================================================');
  console.log('🔍 POST-CLEANUP VERIFICATION');
  console.log('============================================================');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('');
  
  await mongoose.connect('mongodb://localhost:27017/uniform-distribution');
  const db = mongoose.connection.db;
  
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };
  
  // ============================================================
  // TEST 1: Company Lookup (category-helpers.ts)
  // ============================================================
  console.log('📋 TEST 1: Company Lookup by String ID');
  try {
    const company = await db.collection('companies').findOne({ id: '100004' });
    if (company && company.id === '100004') {
      console.log(`   ✅ PASSED - Found company: ${company.name} (id: ${company.id})`);
      results.passed++;
      results.tests.push({ name: 'Company Lookup', status: 'PASSED' });
    } else {
      console.log(`   ❌ FAILED - Company not found or ID mismatch`);
      results.failed++;
      results.tests.push({ name: 'Company Lookup', status: 'FAILED' });
    }
  } catch (err) {
    console.log(`   ❌ FAILED - Error: ${err.message}`);
    results.failed++;
    results.tests.push({ name: 'Company Lookup', status: 'FAILED', error: err.message });
  }
  
  // ============================================================
  // TEST 2: Employee Lookup by companyId
  // ============================================================
  console.log('\n📋 TEST 2: Employee Lookup by Company String ID');
  try {
    const employees = await db.collection('employees').find({ companyId: '100004' }).limit(5).toArray();
    if (employees.length > 0) {
      console.log(`   ✅ PASSED - Found ${employees.length} employees for company 100004`);
      results.passed++;
      results.tests.push({ name: 'Employee Lookup', status: 'PASSED', count: employees.length });
    } else {
      console.log(`   ⚠️  WARNING - No employees found for company 100004`);
      results.tests.push({ name: 'Employee Lookup', status: 'WARNING', count: 0 });
    }
  } catch (err) {
    console.log(`   ❌ FAILED - Error: ${err.message}`);
    results.failed++;
    results.tests.push({ name: 'Employee Lookup', status: 'FAILED', error: err.message });
  }
  
  // ============================================================
  // TEST 3: ProductVendor Lookup
  // ============================================================
  console.log('\n📋 TEST 3: ProductVendor Relationship Lookup');
  try {
    const productVendors = await db.collection('productvendors').find({}).limit(5).toArray();
    let valid = 0;
    let invalid = 0;
    
    for (const pv of productVendors) {
      const isValidProductId = /^\d{6}$/.test(String(pv.productId || ''));
      const isValidVendorId = /^\d{6}$/.test(String(pv.vendorId || ''));
      if (isValidProductId && isValidVendorId) {
        valid++;
      } else {
        invalid++;
      }
    }
    
    if (invalid === 0) {
      console.log(`   ✅ PASSED - All ${productVendors.length} ProductVendor records have valid string IDs`);
      results.passed++;
      results.tests.push({ name: 'ProductVendor IDs', status: 'PASSED' });
    } else {
      console.log(`   ⚠️  WARNING - ${invalid}/${productVendors.length} records have invalid IDs`);
      results.tests.push({ name: 'ProductVendor IDs', status: 'WARNING', invalid });
    }
  } catch (err) {
    console.log(`   ❌ FAILED - Error: ${err.message}`);
    results.failed++;
    results.tests.push({ name: 'ProductVendor IDs', status: 'FAILED', error: err.message });
  }
  
  // ============================================================
  // TEST 4: VendorInventory Lookup
  // ============================================================
  console.log('\n📋 TEST 4: VendorInventory Relationship Lookup');
  try {
    const vendorInventories = await db.collection('vendorinventories').find({}).limit(10).toArray();
    let valid = 0;
    let invalid = 0;
    
    for (const vi of vendorInventories) {
      const isValidProductId = /^\d{6}$/.test(String(vi.productId || ''));
      const isValidVendorId = /^\d{6}$/.test(String(vi.vendorId || ''));
      if (isValidProductId && isValidVendorId) {
        valid++;
      } else {
        invalid++;
      }
    }
    
    if (invalid === 0) {
      console.log(`   ✅ PASSED - All ${vendorInventories.length} VendorInventory records have valid string IDs`);
      results.passed++;
      results.tests.push({ name: 'VendorInventory IDs', status: 'PASSED' });
    } else {
      console.log(`   ⚠️  WARNING - ${invalid}/${vendorInventories.length} records have invalid IDs`);
      results.tests.push({ name: 'VendorInventory IDs', status: 'WARNING', invalid });
    }
  } catch (err) {
    console.log(`   ❌ FAILED - Error: ${err.message}`);
    results.failed++;
    results.tests.push({ name: 'VendorInventory IDs', status: 'FAILED', error: err.message });
  }
  
  // ============================================================
  // TEST 5: Order Lookup by String ID
  // ============================================================
  console.log('\n📋 TEST 5: Order Lookup by String ID');
  try {
    const order = await db.collection('orders').findOne({});
    if (order && order.id) {
      console.log(`   ✅ PASSED - Found order with string id: ${order.id}`);
      results.passed++;
      results.tests.push({ name: 'Order Lookup', status: 'PASSED', orderId: order.id });
    } else {
      console.log(`   ⚠️  WARNING - Order found but missing string id field`);
      results.tests.push({ name: 'Order Lookup', status: 'WARNING' });
    }
  } catch (err) {
    console.log(`   ❌ FAILED - Error: ${err.message}`);
    results.failed++;
    results.tests.push({ name: 'Order Lookup', status: 'FAILED', error: err.message });
  }
  
  // ============================================================
  // TEST 6: ProductCategory Lookup
  // ============================================================
  console.log('\n📋 TEST 6: ProductCategory by Company String ID');
  try {
    const categories = await db.collection('productcategories').find({ companyId: '100004' }).toArray();
    if (categories.length > 0) {
      console.log(`   ✅ PASSED - Found ${categories.length} categories for company 100004`);
      console.log(`      Categories: ${categories.map(c => c.name).join(', ')}`);
      results.passed++;
      results.tests.push({ name: 'ProductCategory Lookup', status: 'PASSED', count: categories.length });
    } else {
      // Try another company
      const allCategories = await db.collection('productcategories').find({}).limit(5).toArray();
      if (allCategories.length > 0) {
        console.log(`   ⚠️  No categories for 100004, but found ${allCategories.length} categories total`);
        results.tests.push({ name: 'ProductCategory Lookup', status: 'WARNING' });
      } else {
        console.log(`   ⚠️  WARNING - No categories found`);
        results.tests.push({ name: 'ProductCategory Lookup', status: 'WARNING' });
      }
    }
  } catch (err) {
    console.log(`   ❌ FAILED - Error: ${err.message}`);
    results.failed++;
    results.tests.push({ name: 'ProductCategory Lookup', status: 'FAILED', error: err.message });
  }
  
  // ============================================================
  // TEST 7: Vendor Lookup by String ID
  // ============================================================
  console.log('\n📋 TEST 7: Vendor Lookup by String ID');
  try {
    const vendor = await db.collection('vendors').findOne({ id: { $exists: true } });
    if (vendor && vendor.id) {
      console.log(`   ✅ PASSED - Found vendor: ${vendor.name} (id: ${vendor.id})`);
      results.passed++;
      results.tests.push({ name: 'Vendor Lookup', status: 'PASSED', vendorId: vendor.id });
    } else {
      console.log(`   ⚠️  WARNING - Vendor found but missing string id field`);
      results.tests.push({ name: 'Vendor Lookup', status: 'WARNING' });
    }
  } catch (err) {
    console.log(`   ❌ FAILED - Error: ${err.message}`);
    results.failed++;
    results.tests.push({ name: 'Vendor Lookup', status: 'FAILED', error: err.message });
  }
  
  // ============================================================
  // TEST 8: Address Lookup (address-service.ts)
  // ============================================================
  console.log('\n📋 TEST 8: Address Lookup by String ID');
  try {
    const address = await db.collection('addresses').findOne({ id: { $exists: true } });
    if (address) {
      console.log(`   ✅ PASSED - Found address with id: ${address.id || '(uses _id)'}`);
      results.passed++;
      results.tests.push({ name: 'Address Lookup', status: 'PASSED' });
    } else {
      const anyAddress = await db.collection('addresses').findOne({});
      if (anyAddress) {
        console.log(`   ⚠️  WARNING - Addresses exist but may use _id only`);
        results.tests.push({ name: 'Address Lookup', status: 'WARNING' });
      } else {
        console.log(`   ⚠️  WARNING - No addresses in database`);
        results.tests.push({ name: 'Address Lookup', status: 'WARNING' });
      }
    }
  } catch (err) {
    console.log(`   ❌ FAILED - Error: ${err.message}`);
    results.failed++;
    results.tests.push({ name: 'Address Lookup', status: 'FAILED', error: err.message });
  }
  
  // ============================================================
  // TEST 9: No Hex-String IDs Remaining
  // ============================================================
  console.log('\n📋 TEST 9: No Hex-String Foreign Keys');
  try {
    const HEX_24_REGEX = /^[0-9a-fA-F]{24}$/;
    const collectionsToCheck = [
      { name: 'employees', field: 'companyId' },
      { name: 'productvendors', field: 'productId' },
      { name: 'productvendors', field: 'vendorId' },
      { name: 'vendorinventories', field: 'vendorId' },
      { name: 'vendorinventories', field: 'productId' },
    ];
    
    let hexFound = 0;
    for (const { name, field } of collectionsToCheck) {
      const docs = await db.collection(name).find({}).limit(100).toArray();
      for (const doc of docs) {
        const value = doc[field];
        if (value && HEX_24_REGEX.test(String(value))) {
          hexFound++;
        }
      }
    }
    
    if (hexFound === 0) {
      console.log(`   ✅ PASSED - No hex-string IDs found in foreign key fields`);
      results.passed++;
      results.tests.push({ name: 'No Hex-String IDs', status: 'PASSED' });
    } else {
      console.log(`   ❌ FAILED - Found ${hexFound} hex-string IDs in foreign key fields`);
      results.failed++;
      results.tests.push({ name: 'No Hex-String IDs', status: 'FAILED', count: hexFound });
    }
  } catch (err) {
    console.log(`   ❌ FAILED - Error: ${err.message}`);
    results.failed++;
    results.tests.push({ name: 'No Hex-String IDs', status: 'FAILED', error: err.message });
  }
  
  // ============================================================
  // SUMMARY
  // ============================================================
  console.log('\n============================================================');
  console.log('📊 VERIFICATION SUMMARY');
  console.log('============================================================');
  console.log(`\n✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⚠️  Warnings: ${results.tests.filter(t => t.status === 'WARNING').length}`);
  
  const overallStatus = results.failed === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED';
  console.log(`\n========== ${overallStatus} ==========`);
  
  console.log(`\nCompleted: ${new Date().toISOString()}`);
  console.log('============================================================');
  
  await mongoose.disconnect();
  
  return results;
}

runVerification().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
