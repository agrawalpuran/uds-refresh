/**
 * POST-MIGRATION VERIFICATION SCRIPT
 * 
 * Scans all key relationships to verify:
 * - Every foreign key maps to an existing StringId
 * - No hex-string remains
 * - No ObjectId remains
 * - No broken relationships
 * 
 * READ-ONLY - No modifications are made.
 */

const mongoose = require('mongoose');

const HEX_24_REGEX = /^[0-9a-fA-F]{24}$/;
const STRING_ID_REGEX = /^\d{6}$/;

function isHexString(value) {
  return typeof value === 'string' && HEX_24_REGEX.test(value);
}

function isObjectId(value) {
  if (!value) return false;
  if (value._bsontype === 'ObjectId' || value._bsontype === 'ObjectID') return true;
  if (value.constructor && (value.constructor.name === 'ObjectId' || value.constructor.name === 'ObjectID')) return true;
  if (typeof value.toHexString === 'function' && typeof value.getTimestamp === 'function') return true;
  return false;
}

function isValidStringId(value) {
  return typeof value === 'string' && STRING_ID_REGEX.test(value);
}

async function verifyRelationships() {
  await mongoose.connect('mongodb://localhost:27017/uniform-distribution');
  const db = mongoose.connection.db;
  
  console.log('============================================================');
  console.log('🔍 POST-MIGRATION RELATIONSHIP INTEGRITY VERIFICATION');
  console.log('============================================================');
  console.log('Mode: READ-ONLY');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('');
  
  const report = {
    relationships: [],
    summary: {
      totalChecked: 0,
      validReferences: 0,
      brokenReferences: 0,
      hexStringsFound: 0,
      objectIdsFound: 0,
      orphanedDocs: 0
    }
  };
  
  // Build lookup maps for all parent collections
  console.log('Building lookup maps...');
  
  const companies = await db.collection('companies').find({}).toArray();
  const companyIds = new Set(companies.map(c => c.id).filter(Boolean));
  console.log(`  - companies: ${companyIds.size} valid IDs`);
  
  const vendors = await db.collection('vendors').find({}).toArray();
  const vendorIds = new Set(vendors.map(v => v.id).filter(Boolean));
  console.log(`  - vendors: ${vendorIds.size} valid IDs`);
  
  const products = await db.collection('uniforms').find({}).toArray();
  const productIds = new Set(products.map(p => p.id).filter(Boolean));
  console.log(`  - products (uniforms): ${productIds.size} valid IDs`);
  
  const employees = await db.collection('employees').find({}).toArray();
  const employeeIds = new Set(employees.map(e => e.id || e.employeeId).filter(Boolean));
  console.log(`  - employees: ${employeeIds.size} valid IDs`);
  
  const orders = await db.collection('orders').find({}).toArray();
  const orderIds = new Set(orders.map(o => o.id).filter(Boolean));
  console.log(`  - orders: ${orderIds.size} valid IDs`);
  
  console.log('');
  
  // ============================================================
  // Relationship Checks
  // ============================================================
  
  const checks = [
    {
      name: 'employees.companyId → companies.id',
      collection: 'employees',
      field: 'companyId',
      validIds: companyIds
    },
    {
      name: 'productcategories.companyId → companies.id',
      collection: 'productcategories',
      field: 'companyId',
      validIds: companyIds
    },
    {
      name: 'vendorinventories.vendorId → vendors.id',
      collection: 'vendorinventories',
      field: 'vendorId',
      validIds: vendorIds
    },
    {
      name: 'vendorinventories.productId → products.id',
      collection: 'vendorinventories',
      field: 'productId',
      validIds: productIds
    },
    {
      name: 'productvendors.vendorId → vendors.id',
      collection: 'productvendors',
      field: 'vendorId',
      validIds: vendorIds
    },
    {
      name: 'productvendors.productId → products.id',
      collection: 'productvendors',
      field: 'productId',
      validIds: productIds
    },
    {
      name: 'orders.site_admin_approved_by → employees.id',
      collection: 'orders',
      field: 'site_admin_approved_by',
      validIds: employeeIds,
      optional: true // This field may be null
    },
    {
      name: 'shipments.orderId → orders.id',
      collection: 'shipments',
      field: 'orderId',
      validIds: orderIds,
      optional: true // Shipments may not have orderId
    },
    {
      name: 'poorders.order_id → orders.id',
      collection: 'poorders',
      field: 'order_id',
      validIds: orderIds
    }
  ];
  
  console.log('============================================================');
  console.log('RELATIONSHIP CHECKS');
  console.log('============================================================');
  
  for (const check of checks) {
    console.log(`\n📁 ${check.name}`);
    
    const docs = await db.collection(check.collection).find({}).toArray();
    
    let valid = 0;
    let broken = 0;
    let hexStrings = 0;
    let objectIds = 0;
    let nullValues = 0;
    const brokenRefs = [];
    const hexStringRefs = [];
    const objectIdRefs = [];
    
    for (const doc of docs) {
      const value = doc[check.field];
      
      // Skip null/undefined if field is optional
      if (!value) {
        nullValues++;
        if (check.optional) continue;
        // For non-optional fields, null is broken
        broken++;
        brokenRefs.push({ _id: doc._id, value: null, reason: 'null/undefined' });
        continue;
      }
      
      // Check for ObjectId type
      if (isObjectId(value)) {
        objectIds++;
        objectIdRefs.push({ _id: doc._id, value: value.toString() });
        continue;
      }
      
      // Check for hex-string
      if (isHexString(String(value))) {
        hexStrings++;
        hexStringRefs.push({ _id: doc._id, value: String(value) });
        continue;
      }
      
      // Check if it's a valid reference
      if (check.validIds.has(String(value))) {
        valid++;
      } else {
        broken++;
        brokenRefs.push({ _id: doc._id, value: String(value), reason: 'not found in parent' });
      }
    }
    
    report.summary.totalChecked += docs.length;
    report.summary.validReferences += valid;
    report.summary.brokenReferences += broken;
    report.summary.hexStringsFound += hexStrings;
    report.summary.objectIdsFound += objectIds;
    
    const result = {
      name: check.name,
      totalDocs: docs.length,
      valid,
      broken,
      hexStrings,
      objectIds,
      nullValues,
      brokenRefs: brokenRefs.slice(0, 5), // First 5 only
      hexStringRefs: hexStringRefs.slice(0, 5),
      objectIdRefs: objectIdRefs.slice(0, 5)
    };
    report.relationships.push(result);
    
    // Print results
    console.log(`   Total: ${docs.length}`);
    console.log(`   ✅ Valid references: ${valid}`);
    if (broken > 0) console.log(`   ❌ Broken references: ${broken}`);
    if (hexStrings > 0) console.log(`   ⚠️  Hex-strings found: ${hexStrings}`);
    if (objectIds > 0) console.log(`   ⚠️  ObjectIds found: ${objectIds}`);
    if (nullValues > 0) console.log(`   ℹ️  Null values: ${nullValues}`);
    
    // Print sample issues
    if (brokenRefs.length > 0) {
      console.log(`   Sample broken refs:`);
      brokenRefs.slice(0, 3).forEach(r => {
        console.log(`      - _id=${r._id}, value=${r.value}, reason=${r.reason}`);
      });
    }
    if (hexStringRefs.length > 0) {
      console.log(`   Sample hex-strings:`);
      hexStringRefs.slice(0, 3).forEach(r => {
        console.log(`      - _id=${r._id}, value=${r.value}`);
      });
    }
    if (objectIdRefs.length > 0) {
      console.log(`   Sample ObjectIds:`);
      objectIdRefs.slice(0, 3).forEach(r => {
        console.log(`      - _id=${r._id}, value=${r.value}`);
      });
    }
  }
  
  // ============================================================
  // Check for orphaned documents
  // ============================================================
  
  console.log('\n============================================================');
  console.log('ORPHANED DOCUMENT CHECK');
  console.log('============================================================');
  
  // Check for orphaned vendorinventories (vendor or product doesn't exist)
  const vendorInvs = await db.collection('vendorinventories').find({}).toArray();
  let orphanedVendorInv = 0;
  for (const inv of vendorInvs) {
    if (!vendorIds.has(String(inv.vendorId)) || !productIds.has(String(inv.productId))) {
      orphanedVendorInv++;
    }
  }
  console.log(`\n📁 vendorinventories: ${orphanedVendorInv} orphaned (vendor or product missing)`);
  
  // Check for orphaned productvendors
  const prodVendors = await db.collection('productvendors').find({}).toArray();
  let orphanedProdVendor = 0;
  for (const pv of prodVendors) {
    if (!vendorIds.has(String(pv.vendorId)) || !productIds.has(String(pv.productId))) {
      orphanedProdVendor++;
    }
  }
  console.log(`📁 productvendors: ${orphanedProdVendor} orphaned (vendor or product missing)`);
  
  report.summary.orphanedDocs = orphanedVendorInv + orphanedProdVendor;
  
  // ============================================================
  // SUMMARY
  // ============================================================
  
  console.log('\n============================================================');
  console.log('📊 VERIFICATION SUMMARY');
  console.log('============================================================');
  console.log(`\nTotal Relationships Checked: ${report.summary.totalChecked}`);
  console.log(`✅ Valid References: ${report.summary.validReferences}`);
  console.log(`❌ Broken References: ${report.summary.brokenReferences}`);
  console.log(`⚠️  Hex-Strings Found: ${report.summary.hexStringsFound}`);
  console.log(`⚠️  ObjectIds Found: ${report.summary.objectIdsFound}`);
  console.log(`🗑️  Orphaned Documents: ${report.summary.orphanedDocs}`);
  
  const status = (
    report.summary.brokenReferences === 0 &&
    report.summary.hexStringsFound === 0 &&
    report.summary.objectIdsFound === 0
  ) ? '✅ PASS' : '❌ ISSUES FOUND';
  
  console.log(`\n========== OVERALL STATUS: ${status} ==========`);
  console.log(`\nCompleted: ${new Date().toISOString()}`);
  console.log('============================================================');
  
  await mongoose.disconnect();
  
  return report;
}

verifyRelationships().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
