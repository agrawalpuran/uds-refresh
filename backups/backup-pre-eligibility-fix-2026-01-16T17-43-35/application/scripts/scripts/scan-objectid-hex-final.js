/**
 * FINAL MONGODB SCAN — ObjectId & Hex-String Detection
 * 
 * READ-ONLY SCAN — No modifications made.
 * 
 * Identifies all fields (excluding _id) where values are stored as:
 * 1. MongoDB ObjectId type (BSON type 7)
 * 2. 24-character hex string matching ObjectId pattern
 */

const mongoose = require('mongoose');

const HEX_24_REGEX = /^[0-9a-fA-F]{24}$/;

function isObjectId(value) {
  if (!value) return false;
  if (value._bsontype === 'ObjectId' || value._bsontype === 'ObjectID') return true;
  if (value.constructor && (value.constructor.name === 'ObjectId' || value.constructor.name === 'ObjectID')) return true;
  if (typeof value.toHexString === 'function' && typeof value.getTimestamp === 'function') return true;
  return false;
}

function isHexString(value) {
  return typeof value === 'string' && HEX_24_REGEX.test(value);
}

function scanObject(obj, path = '', results = {}) {
  if (!obj || typeof obj !== 'object') return results;
  
  for (const [key, value] of Object.entries(obj)) {
    // Skip _id at root level only
    if (path === '' && key === '_id') continue;
    // Skip __v and other mongoose internals
    if (key === '__v') continue;
    
    const currentPath = path ? `${path}.${key}` : key;
    
    if (value === null || value === undefined) continue;
    
    // Check for ObjectId
    if (isObjectId(value)) {
      if (!results[currentPath]) {
        results[currentPath] = { type: 'ObjectId', count: 0, examples: [] };
      }
      results[currentPath].count++;
      if (results[currentPath].examples.length < 3) {
        results[currentPath].examples.push(value.toString());
      }
    }
    // Check for hex-string
    else if (isHexString(value)) {
      if (!results[currentPath]) {
        results[currentPath] = { type: 'hex-string', count: 0, examples: [] };
      }
      results[currentPath].count++;
      if (results[currentPath].examples.length < 3) {
        results[currentPath].examples.push(value);
      }
    }
    // Check nested _id (not root level)
    else if (key === '_id' && path !== '' && isObjectId(value)) {
      if (!results[currentPath]) {
        results[currentPath] = { type: 'ObjectId (nested)', count: 0, examples: [] };
      }
      results[currentPath].count++;
      if (results[currentPath].examples.length < 3) {
        results[currentPath].examples.push(value.toString());
      }
    }
    // Recurse into nested objects (but not arrays of primitives)
    else if (typeof value === 'object' && !Array.isArray(value)) {
      scanObject(value, currentPath, results);
    }
    // Handle arrays
    else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (isObjectId(item)) {
          const arrayPath = `${currentPath}[]`;
          if (!results[arrayPath]) {
            results[arrayPath] = { type: 'ObjectId', count: 0, examples: [] };
          }
          results[arrayPath].count++;
          if (results[arrayPath].examples.length < 3) {
            results[arrayPath].examples.push(item.toString());
          }
        } else if (isHexString(item)) {
          const arrayPath = `${currentPath}[]`;
          if (!results[arrayPath]) {
            results[arrayPath] = { type: 'hex-string', count: 0, examples: [] };
          }
          results[arrayPath].count++;
          if (results[arrayPath].examples.length < 3) {
            results[arrayPath].examples.push(item);
          }
        } else if (typeof item === 'object' && item !== null) {
          scanObject(item, `${currentPath}[]`, results);
        }
      }
    }
  }
  
  return results;
}

async function runScan() {
  console.log('============================================================');
  console.log('🔍 FINAL MONGODB SCAN — ObjectId & Hex-String Detection');
  console.log('============================================================');
  console.log('Mode: READ-ONLY (No modifications)');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('');
  
  await mongoose.connect('mongodb://localhost:27017/uniform-distribution');
  const db = mongoose.connection.db;
  
  // Get all collections
  const collections = await db.listCollections().toArray();
  const collectionNames = collections.map(c => c.name).filter(n => !n.startsWith('system.'));
  
  console.log(`Found ${collectionNames.length} collections to scan`);
  console.log('');
  
  const report = {
    collections: {},
    summary: {
      totalCollections: collectionNames.length,
      collectionsWithIssues: 0,
      totalObjectIdFields: 0,
      totalHexStringFields: 0
    }
  };
  
  // ============================================================
  // SCAN EACH COLLECTION
  // ============================================================
  
  for (const collectionName of collectionNames.sort()) {
    const docs = await db.collection(collectionName).find({}).toArray();
    
    const collectionResults = {
      totalDocs: docs.length,
      docsWithIssues: 0,
      fields: {}
    };
    
    for (const doc of docs) {
      const docFields = scanObject(doc);
      
      if (Object.keys(docFields).length > 0) {
        collectionResults.docsWithIssues++;
        
        for (const [fieldPath, fieldData] of Object.entries(docFields)) {
          if (!collectionResults.fields[fieldPath]) {
            collectionResults.fields[fieldPath] = {
              type: fieldData.type,
              count: 0,
              examples: []
            };
          }
          collectionResults.fields[fieldPath].count += fieldData.count;
          for (const ex of fieldData.examples) {
            if (collectionResults.fields[fieldPath].examples.length < 3) {
              if (!collectionResults.fields[fieldPath].examples.includes(ex)) {
                collectionResults.fields[fieldPath].examples.push(ex);
              }
            }
          }
        }
      }
    }
    
    report.collections[collectionName] = collectionResults;
    
    if (Object.keys(collectionResults.fields).length > 0) {
      report.summary.collectionsWithIssues++;
    }
  }
  
  // ============================================================
  // OUTPUT REPORT
  // ============================================================
  
  console.log('============================================================');
  console.log('### 1️⃣ COLLECTION SUMMARY');
  console.log('============================================================');
  console.log('');
  
  // Collections with issues first
  const collectionsWithIssues = Object.entries(report.collections)
    .filter(([_, data]) => Object.keys(data.fields).length > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  
  const collectionsWithoutIssues = Object.entries(report.collections)
    .filter(([_, data]) => Object.keys(data.fields).length === 0)
    .sort(([a], [b]) => a.localeCompare(b));
  
  if (collectionsWithIssues.length > 0) {
    console.log('⚠️  COLLECTIONS WITH ObjectId/Hex-String FIELDS:');
    console.log('');
    for (const [name, data] of collectionsWithIssues) {
      const fieldCount = Object.keys(data.fields).length;
      console.log(`   📁 ${name}`);
      console.log(`      - Documents: ${data.totalDocs}`);
      console.log(`      - Docs with issues: ${data.docsWithIssues}`);
      console.log(`      - Fields affected: ${fieldCount}`);
    }
  } else {
    console.log('✅ NO COLLECTIONS WITH ObjectId/Hex-String FIELDS FOUND');
  }
  
  console.log('');
  console.log('✅ CLEAN COLLECTIONS (no issues):');
  for (const [name, data] of collectionsWithoutIssues) {
    console.log(`   📁 ${name} (${data.totalDocs} docs)`);
  }
  
  // ============================================================
  // FIELD-LEVEL DETAILS
  // ============================================================
  
  console.log('');
  console.log('============================================================');
  console.log('### 2️⃣ FIELD-LEVEL DETAILS');
  console.log('============================================================');
  
  if (collectionsWithIssues.length === 0) {
    console.log('');
    console.log('✅ NO ObjectId OR HEX-STRING FIELDS DETECTED');
    console.log('   All foreign key fields are using proper string IDs.');
  } else {
    for (const [collectionName, data] of collectionsWithIssues) {
      console.log('');
      console.log(`📁 ${collectionName.toUpperCase()}`);
      console.log('-'.repeat(60));
      
      for (const [fieldPath, fieldData] of Object.entries(data.fields)) {
        const isNested = fieldPath.includes('.');
        console.log(`   Field: ${fieldPath}`);
        console.log(`   Type: ${fieldData.type}`);
        console.log(`   Count: ${fieldData.count}`);
        console.log(`   Nested: ${isNested ? 'Yes' : 'No'}`);
        console.log(`   Examples: ${fieldData.examples.join(', ')}`);
        console.log('');
        
        // Update summary counts
        if (fieldData.type.includes('ObjectId')) {
          report.summary.totalObjectIdFields++;
        } else {
          report.summary.totalHexStringFields++;
        }
      }
    }
  }
  
  // ============================================================
  // SUMMARY
  // ============================================================
  
  console.log('');
  console.log('============================================================');
  console.log('### 📊 SCAN SUMMARY');
  console.log('============================================================');
  console.log(`Total collections scanned: ${report.summary.totalCollections}`);
  console.log(`Collections with issues: ${report.summary.collectionsWithIssues}`);
  console.log(`Total ObjectId fields: ${report.summary.totalObjectIdFields}`);
  console.log(`Total hex-string fields: ${report.summary.totalHexStringFields}`);
  
  const overallStatus = report.summary.collectionsWithIssues === 0 
    ? '✅ DATABASE IS CLEAN — No ObjectId/hex-string foreign keys found'
    : `⚠️  ISSUES FOUND — ${report.summary.collectionsWithIssues} collections need attention`;
  
  console.log('');
  console.log(`========== ${overallStatus} ==========`);
  console.log(`Completed: ${new Date().toISOString()}`);
  console.log('============================================================');
  
  await mongoose.disconnect();
  
  return report;
}

runScan().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
