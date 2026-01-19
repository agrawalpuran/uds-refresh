/**
 * MongoDB ObjectId Field Scanner
 * 
 * Scans all collections to identify fields (excluding _id) that contain:
 * 1. BSON ObjectId type
 * 2. 24-character hex strings that look like ObjectIds
 * 
 * READ-ONLY - No modifications are made.
 */

const mongoose = require('mongoose');

const HEX_24_REGEX = /^[0-9a-fA-F]{24}$/;

async function scanDatabase() {
  await mongoose.connect('mongodb://localhost:27017/uniform-distribution');
  const db = mongoose.connection.db;
  
  console.log('========================================');
  console.log('MongoDB ObjectId Field Scanner');
  console.log('========================================\n');
  
  // Get all collections
  const collections = await db.listCollections().toArray();
  const collectionNames = collections.map(c => c.name).sort();
  
  console.log(`Found ${collectionNames.length} collections to scan.\n`);
  
  const report = {
    collections: {},
    summary: {
      totalCollections: collectionNames.length,
      collectionsWithObjectIdFields: 0,
      totalObjectIdFields: 0,
      totalHexStringFields: 0
    }
  };
  
  for (const collectionName of collectionNames) {
    console.log(`Scanning: ${collectionName}...`);
    
    const collection = db.collection(collectionName);
    const documents = await collection.find({}).limit(500).toArray(); // Sample up to 500 docs
    const totalCount = await collection.countDocuments();
    
    const fieldStats = {};
    
    for (const doc of documents) {
      scanDocument(doc, '', fieldStats);
    }
    
    // Filter out _id field
    delete fieldStats['_id'];
    
    // Filter to only fields with ObjectId or hex-string values
    const relevantFields = {};
    for (const [fieldPath, stats] of Object.entries(fieldStats)) {
      if (stats.objectIdCount > 0 || stats.hexStringCount > 0) {
        relevantFields[fieldPath] = stats;
      }
    }
    
    if (Object.keys(relevantFields).length > 0) {
      report.collections[collectionName] = {
        totalDocuments: totalCount,
        scannedDocuments: documents.length,
        fields: relevantFields
      };
      report.summary.collectionsWithObjectIdFields++;
      
      for (const stats of Object.values(relevantFields)) {
        if (stats.objectIdCount > 0) report.summary.totalObjectIdFields++;
        if (stats.hexStringCount > 0) report.summary.totalHexStringFields++;
      }
    }
  }
  
  // Print report
  printReport(report);
  
  await mongoose.disconnect();
}

function scanDocument(obj, prefix, fieldStats) {
  if (!obj || typeof obj !== 'object') return;
  
  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    
    if (!fieldStats[fieldPath]) {
      fieldStats[fieldPath] = {
        objectIdCount: 0,
        hexStringCount: 0,
        otherCount: 0,
        examples: [],
        isNested: prefix !== ''
      };
    }
    
    const stats = fieldStats[fieldPath];
    
    if (value === null || value === undefined) {
      // Skip nulls
    } else if (isObjectId(value)) {
      stats.objectIdCount++;
      if (stats.examples.length < 3) {
        stats.examples.push({ value: value.toString(), type: 'ObjectId' });
      }
    } else if (typeof value === 'string' && HEX_24_REGEX.test(value)) {
      stats.hexStringCount++;
      if (stats.examples.length < 3) {
        stats.examples.push({ value: value, type: 'hex-string' });
      }
    } else if (Array.isArray(value)) {
      // Check array items
      for (let i = 0; i < Math.min(value.length, 10); i++) {
        const item = value[i];
        if (isObjectId(item)) {
          stats.objectIdCount++;
          if (stats.examples.length < 3) {
            stats.examples.push({ value: item.toString(), type: 'ObjectId (array)' });
          }
        } else if (typeof item === 'string' && HEX_24_REGEX.test(item)) {
          stats.hexStringCount++;
          if (stats.examples.length < 3) {
            stats.examples.push({ value: item, type: 'hex-string (array)' });
          }
        } else if (typeof item === 'object' && item !== null) {
          // Scan nested objects in arrays
          scanDocument(item, fieldPath + '[]', fieldStats);
        }
      }
    } else if (typeof value === 'object' && value !== null && !Buffer.isBuffer(value) && !(value instanceof Date)) {
      // Recurse into nested objects
      scanDocument(value, fieldPath, fieldStats);
    } else {
      stats.otherCount++;
    }
  }
}

function isObjectId(value) {
  if (!value) return false;
  
  // Check if it's a BSON ObjectId
  if (value._bsontype === 'ObjectId' || value._bsontype === 'ObjectID') return true;
  
  // Check constructor name
  if (value.constructor && (value.constructor.name === 'ObjectId' || value.constructor.name === 'ObjectID')) return true;
  
  // Check if it has ObjectId methods
  if (typeof value.toHexString === 'function' && typeof value.getTimestamp === 'function') return true;
  
  return false;
}

function printReport(report) {
  console.log('\n\n========================================');
  console.log('1️⃣  COLLECTION SUMMARY');
  console.log('========================================\n');
  
  console.log(`Total Collections Scanned: ${report.summary.totalCollections}`);
  console.log(`Collections with ObjectId/Hex Fields: ${report.summary.collectionsWithObjectIdFields}`);
  console.log(`Total ObjectId-type Fields: ${report.summary.totalObjectIdFields}`);
  console.log(`Total Hex-String Fields: ${report.summary.totalHexStringFields}`);
  
  console.log('\n----------------------------------------');
  console.log('Collections with ObjectId/Hex Fields:');
  console.log('----------------------------------------\n');
  
  for (const [collectionName, data] of Object.entries(report.collections)) {
    const fieldCount = Object.keys(data.fields).length;
    const docsWithIssues = Object.values(data.fields).reduce((sum, f) => sum + f.objectIdCount + f.hexStringCount, 0);
    console.log(`📁 ${collectionName}`);
    console.log(`   Total Documents: ${data.totalDocuments}`);
    console.log(`   Scanned: ${data.scannedDocuments}`);
    console.log(`   Fields with ObjectId/Hex: ${fieldCount}`);
    console.log('');
  }
  
  console.log('\n========================================');
  console.log('2️⃣  FIELD-LEVEL DETAILS');
  console.log('========================================\n');
  
  for (const [collectionName, data] of Object.entries(report.collections)) {
    console.log(`\n📁 ${collectionName}`);
    console.log('─'.repeat(50));
    
    for (const [fieldPath, stats] of Object.entries(data.fields)) {
      console.log(`\n  Field: ${fieldPath}`);
      console.log(`    Nested: ${stats.isNested ? 'Yes' : 'No'}`);
      
      if (stats.objectIdCount > 0) {
        console.log(`    ObjectId Type: ${stats.objectIdCount} occurrences`);
      }
      if (stats.hexStringCount > 0) {
        console.log(`    Hex-String: ${stats.hexStringCount} occurrences`);
      }
      
      if (stats.examples.length > 0) {
        console.log(`    Examples:`);
        for (const ex of stats.examples) {
          console.log(`      - "${ex.value}" (${ex.type})`);
        }
      }
    }
  }
  
  console.log('\n\n========================================');
  console.log('3️⃣  RELATIONSHIP FIELDS SUMMARY');
  console.log('========================================\n');
  
  const relationshipFields = [
    'companyId', 'employeeId', 'vendorId', 'productId', 'locationId', 
    'orderId', 'uniformId', 'branchId', 'addressId', 'adminId',
    'parentCompanyId', 'createdBy', 'updatedBy', 'userId', 'order_id',
    'vendor_id', 'indent_id', 'invoice_id', 'company_id', 'site_id'
  ];
  
  const relationshipReport = {};
  
  for (const [collectionName, data] of Object.entries(report.collections)) {
    for (const [fieldPath, stats] of Object.entries(data.fields)) {
      const fieldName = fieldPath.split('.').pop().replace('[]', '');
      
      if (relationshipFields.some(rf => fieldName.toLowerCase().includes(rf.toLowerCase()))) {
        if (!relationshipReport[fieldName]) {
          relationshipReport[fieldName] = [];
        }
        relationshipReport[fieldName].push({
          collection: collectionName,
          fieldPath: fieldPath,
          objectIdCount: stats.objectIdCount,
          hexStringCount: stats.hexStringCount,
          examples: stats.examples
        });
      }
    }
  }
  
  for (const [fieldName, occurrences] of Object.entries(relationshipReport)) {
    console.log(`\n🔗 ${fieldName}`);
    for (const occ of occurrences) {
      const types = [];
      if (occ.objectIdCount > 0) types.push(`${occ.objectIdCount} ObjectId`);
      if (occ.hexStringCount > 0) types.push(`${occ.hexStringCount} hex-string`);
      console.log(`   - ${occ.collection}.${occ.fieldPath}: ${types.join(', ')}`);
    }
  }
  
  console.log('\n\n========================================');
  console.log('SCAN COMPLETE - NO DATA MODIFIED');
  console.log('========================================\n');
}

scanDatabase().catch(err => {
  console.error('Scan failed:', err);
  process.exit(1);
});
