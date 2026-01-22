/**
 * ============================================================
 * 🟢 DELIVERABLE 1 — MIGRATION SCRIPT (CORRECTION)
 * ============================================================
 * 
 * SAFE, IDEMPOTENT MongoDB migration script to convert
 * hex-string and ObjectId values to proper 6-digit string IDs.
 * 
 * USAGE:
 *   DRY RUN (no changes):
 *     node scripts/migration-fix-hex-objectid-fields.js --dry-run
 * 
 *   APPLY CHANGES:
 *     node scripts/migration-fix-hex-objectid-fields.js --apply
 * 
 * The script will:
 *   - Scan all identified collections
 *   - Convert hex-strings and ObjectIds to proper string IDs
 *   - Preserve referential integrity
 *   - Log all changes
 *   - Provide summary counts
 */

const mongoose = require('mongoose');

// ============================================================
// CONFIGURATION
// ============================================================

const HEX_24_REGEX = /^[0-9a-fA-F]{24}$/;
const STRING_ID_REGEX = /^\d{6}$/;

const MIGRATION_CONFIG = {
  // Collections and their fields to migrate
  // Format: { collection, field, lookupCollection, lookupField }
  migrations: [
    // employees.companyId → lookup companies by _id, get id
    {
      collection: 'employees',
      field: 'companyId',
      lookupCollection: 'companies',
      lookupByObjectId: true,
      getStringIdFrom: 'id',
      description: 'Fix employees.companyId hex-string → company.id'
    },
    // productcategories.companyId → lookup companies by _id, get id
    {
      collection: 'productcategories',
      field: 'companyId',
      lookupCollection: 'companies',
      lookupByObjectId: true,
      getStringIdFrom: 'id',
      description: 'Fix productcategories.companyId hex-string → company.id'
    },
    // vendorinventories.vendorId → lookup vendors by _id, get id
    {
      collection: 'vendorinventories',
      field: 'vendorId',
      lookupCollection: 'vendors',
      lookupByObjectId: true,
      getStringIdFrom: 'id',
      description: 'Fix vendorinventories.vendorId hex-string → vendor.id'
    },
    // vendorinventories.productId → lookup uniforms by _id, get id
    {
      collection: 'vendorinventories',
      field: 'productId',
      lookupCollection: 'uniforms',
      lookupByObjectId: true,
      getStringIdFrom: 'id',
      description: 'Fix vendorinventories.productId hex-string → product.id'
    },
    // orders.site_admin_approved_by → lookup employees by _id, get id/employeeId
    {
      collection: 'orders',
      field: 'site_admin_approved_by',
      lookupCollection: 'employees',
      lookupByObjectId: true,
      getStringIdFrom: ['id', 'employeeId'],
      description: 'Fix orders.site_admin_approved_by hex-string → employee.id'
    },
    // poorders.order_id (ObjectId) → lookup orders by _id, get id
    {
      collection: 'poorders',
      field: 'order_id',
      lookupCollection: 'orders',
      lookupByObjectId: true,
      getStringIdFrom: 'id',
      description: 'Fix poorders.order_id ObjectId → order.id'
    }
  ],
  
  // Collections where the `id` field itself needs regeneration
  idFieldMigrations: [
    {
      collection: 'locationadmins',
      field: 'id',
      prefix: '800',
      description: 'Regenerate locationadmins.id from hex-string to 6-digit string'
    },
    {
      collection: 'productvendors',
      field: 'id',
      prefix: '900',
      description: 'Regenerate productvendors.id from hex-string to 6-digit string'
    },
    {
      collection: 'shipments',
      field: 'id',
      prefix: '700',
      description: 'Regenerate shipments.id from hex-string to 6-digit string'
    }
  ]
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

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

function needsMigration(value) {
  if (!value) return false;
  if (isValidStringId(value)) return false; // Already valid
  if (isObjectId(value)) return true;
  if (isHexString(value)) return true;
  return false;
}

function getObjectIdString(value) {
  if (isObjectId(value)) return value.toString();
  if (isHexString(value)) return value;
  return null;
}

// ============================================================
// MIGRATION FUNCTIONS
// ============================================================

async function buildLookupMap(db, collectionName, getStringIdFrom) {
  const collection = db.collection(collectionName);
  const docs = await collection.find({}).toArray();
  const map = new Map();
  
  for (const doc of docs) {
    const objectIdStr = doc._id.toString();
    let stringId = null;
    
    if (Array.isArray(getStringIdFrom)) {
      // Try multiple fields
      for (const field of getStringIdFrom) {
        if (doc[field] && isValidStringId(String(doc[field]))) {
          stringId = String(doc[field]);
          break;
        }
      }
    } else {
      stringId = doc[getStringIdFrom];
    }
    
    if (stringId && isValidStringId(String(stringId))) {
      map.set(objectIdStr, String(stringId));
    }
  }
  
  return map;
}

async function migrateRelationshipField(db, config, dryRun, log) {
  const { collection, field, lookupCollection, getStringIdFrom, description } = config;
  
  log(`\n📁 ${description}`);
  log(`   Collection: ${collection}`);
  log(`   Field: ${field}`);
  log(`   Lookup: ${lookupCollection}`);
  
  // Build lookup map: ObjectId string → business string ID
  const lookupMap = await buildLookupMap(db, lookupCollection, getStringIdFrom);
  log(`   Lookup map entries: ${lookupMap.size}`);
  
  const coll = db.collection(collection);
  const docs = await coll.find({}).toArray();
  
  let scanned = 0;
  let needsUpdate = 0;
  let updated = 0;
  let notFound = 0;
  let alreadyValid = 0;
  
  for (const doc of docs) {
    scanned++;
    const currentValue = doc[field];
    
    if (!currentValue) continue;
    
    if (isValidStringId(String(currentValue))) {
      alreadyValid++;
      continue;
    }
    
    if (!needsMigration(currentValue)) continue;
    
    needsUpdate++;
    const objectIdStr = getObjectIdString(currentValue);
    const newValue = lookupMap.get(objectIdStr);
    
    if (!newValue) {
      notFound++;
      log(`   ⚠️  No mapping found for ${field}="${objectIdStr}" in doc._id=${doc._id}`);
      continue;
    }
    
    if (dryRun) {
      log(`   [DRY-RUN] Would update ${field}: "${objectIdStr}" → "${newValue}" (doc._id=${doc._id})`);
    } else {
      await coll.updateOne(
        { _id: doc._id },
        { $set: { [field]: newValue } }
      );
      log(`   ✅ Updated ${field}: "${objectIdStr}" → "${newValue}" (doc._id=${doc._id})`);
    }
    updated++;
  }
  
  return { scanned, needsUpdate, updated, notFound, alreadyValid };
}

async function migrateIdField(db, config, dryRun, log) {
  const { collection, field, prefix, description } = config;
  
  log(`\n📁 ${description}`);
  log(`   Collection: ${collection}`);
  log(`   Field: ${field}`);
  log(`   Prefix: ${prefix}`);
  
  const coll = db.collection(collection);
  const docs = await coll.find({}).toArray();
  
  // Find the highest existing valid ID to continue from
  let maxId = 0;
  for (const doc of docs) {
    if (doc[field] && isValidStringId(String(doc[field]))) {
      const numPart = parseInt(String(doc[field]), 10);
      if (numPart > maxId) maxId = numPart;
    }
  }
  
  // Also check if prefix-based IDs exist
  const prefixNum = parseInt(prefix, 10) * 1000;
  if (prefixNum > maxId) maxId = prefixNum;
  
  let nextId = maxId + 1;
  
  let scanned = 0;
  let needsUpdate = 0;
  let updated = 0;
  let alreadyValid = 0;
  
  for (const doc of docs) {
    scanned++;
    const currentValue = doc[field];
    
    if (currentValue && isValidStringId(String(currentValue))) {
      alreadyValid++;
      continue;
    }
    
    if (!currentValue || isHexString(currentValue)) {
      needsUpdate++;
      const newId = String(nextId).padStart(6, '0');
      nextId++;
      
      if (dryRun) {
        log(`   [DRY-RUN] Would update ${field}: "${currentValue || 'null'}" → "${newId}" (doc._id=${doc._id})`);
      } else {
        await coll.updateOne(
          { _id: doc._id },
          { $set: { [field]: newId } }
        );
        log(`   ✅ Updated ${field}: "${currentValue || 'null'}" → "${newId}" (doc._id=${doc._id})`);
      }
      updated++;
    }
  }
  
  return { scanned, needsUpdate, updated, alreadyValid };
}

// ============================================================
// MAIN MIGRATION
// ============================================================

async function runMigration() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const apply = args.includes('--apply');
  
  if (!dryRun && !apply) {
    console.log('============================================================');
    console.log('USAGE:');
    console.log('  node scripts/migration-fix-hex-objectid-fields.js --dry-run');
    console.log('  node scripts/migration-fix-hex-objectid-fields.js --apply');
    console.log('============================================================');
    process.exit(1);
  }
  
  const logs = [];
  const log = (msg) => {
    console.log(msg);
    logs.push(msg);
  };
  
  log('============================================================');
  log('🔧 MongoDB Migration: Fix Hex-String and ObjectId Fields');
  log('============================================================');
  log(`Mode: ${dryRun ? '🔍 DRY-RUN (no changes will be made)' : '⚡ APPLY (changes will be committed)'}`);
  log(`Started: ${new Date().toISOString()}`);
  log('');
  
  await mongoose.connect('mongodb://localhost:27017/uniform-distribution');
  const db = mongoose.connection.db;
  
  const summary = {
    relationshipFields: [],
    idFields: [],
    totalScanned: 0,
    totalUpdated: 0,
    totalNotFound: 0
  };
  
  // ============================================================
  // PART 1: Migrate relationship fields (foreign keys)
  // ============================================================
  
  log('\n============================================================');
  log('PART 1: Migrating Relationship Fields (Foreign Keys)');
  log('============================================================');
  
  for (const config of MIGRATION_CONFIG.migrations) {
    try {
      const result = await migrateRelationshipField(db, config, dryRun, log);
      summary.relationshipFields.push({ ...config, ...result });
      summary.totalScanned += result.scanned;
      summary.totalUpdated += result.updated;
      summary.totalNotFound += result.notFound;
    } catch (err) {
      log(`   ❌ ERROR: ${err.message}`);
    }
  }
  
  // ============================================================
  // PART 2: Migrate ID fields (regenerate proper string IDs)
  // ============================================================
  
  log('\n============================================================');
  log('PART 2: Migrating ID Fields (Regenerate String IDs)');
  log('============================================================');
  
  for (const config of MIGRATION_CONFIG.idFieldMigrations) {
    try {
      const result = await migrateIdField(db, config, dryRun, log);
      summary.idFields.push({ ...config, ...result });
      summary.totalScanned += result.scanned;
      summary.totalUpdated += result.updated;
    } catch (err) {
      log(`   ❌ ERROR: ${err.message}`);
    }
  }
  
  // ============================================================
  // SUMMARY
  // ============================================================
  
  log('\n============================================================');
  log('📊 MIGRATION SUMMARY');
  log('============================================================');
  
  log('\n--- Relationship Field Migrations ---');
  for (const r of summary.relationshipFields) {
    log(`\n${r.collection}.${r.field}:`);
    log(`   Scanned: ${r.scanned}`);
    log(`   Already Valid: ${r.alreadyValid}`);
    log(`   Needed Update: ${r.needsUpdate}`);
    log(`   Updated: ${r.updated}`);
    log(`   Not Found: ${r.notFound}`);
  }
  
  log('\n--- ID Field Migrations ---');
  for (const r of summary.idFields) {
    log(`\n${r.collection}.${r.field}:`);
    log(`   Scanned: ${r.scanned}`);
    log(`   Already Valid: ${r.alreadyValid}`);
    log(`   Needed Update: ${r.needsUpdate}`);
    log(`   Updated: ${r.updated}`);
  }
  
  log('\n--- Overall ---');
  log(`Total Documents Scanned: ${summary.totalScanned}`);
  log(`Total Records Updated: ${summary.totalUpdated}`);
  log(`Total Not Found (no mapping): ${summary.totalNotFound}`);
  
  log(`\nCompleted: ${new Date().toISOString()}`);
  log(`Mode: ${dryRun ? 'DRY-RUN (no changes made)' : 'APPLY (changes committed)'}`);
  
  if (dryRun) {
    log('\n⚠️  This was a DRY-RUN. To apply changes, run with --apply');
  } else {
    log('\n✅ Migration completed successfully!');
  }
  
  log('\n============================================================');
  
  await mongoose.disconnect();
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
