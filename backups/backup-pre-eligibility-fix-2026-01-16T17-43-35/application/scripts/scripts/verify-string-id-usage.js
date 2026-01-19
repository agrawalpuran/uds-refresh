/**
 * String ID Usage Verification Script
 * 
 * This script scans the data-access.ts file to verify no ObjectId usage remains
 * and all relationships use string IDs only.
 * 
 * Run with: node scripts/verify-string-id-usage.js
 */

const fs = require('fs');
const path = require('path');

const DATA_ACCESS_FILE = path.join(__dirname, '../lib/db/data-access.ts');

// Patterns to detect ObjectId usage
const VIOLATION_PATTERNS = [
  { pattern: /new\s+mongoose\.Types\.ObjectId\(/g, name: 'new ObjectId() call', severity: 'error' },
  { pattern: /ObjectId\.isValid\(/g, name: 'ObjectId.isValid() call', severity: 'warning' },
  { pattern: /mongoose\.Types\.ObjectId\.isValid\(/g, name: 'mongoose ObjectId.isValid()', severity: 'warning' },
  { pattern: /\._id\s*(?=[^=])/g, name: '._id field access (read)', severity: 'warning' },
  { pattern: /\{\s*_id:/g, name: '_id in filter/query', severity: 'error' },
  { pattern: /findById\(/g, name: 'findById() call', severity: 'warning' },
  { pattern: /\/\^?\[0-9a-fA-F\]\{24\}\$?\/\.test/g, name: '24-char hex validation', severity: 'warning' },
  { pattern: /\.length\s*===?\s*24/g, name: 'ID length === 24 check', severity: 'warning' },
  { pattern: /instanceof\s+mongoose\.Types\.ObjectId/g, name: 'ObjectId instanceof check', severity: 'warning' },
];

// Entities to check for proper string ID usage
const ENTITIES = [
  'Company', 'Employee', 'Vendor', 'Order', 'PurchaseOrder',
  'Invoice', 'Shipment', 'GRN', 'Uniform', 'Location',
  'Branch', 'ProductVendor', 'ProductCompany', 'CompanyAdmin',
  'VendorInventory', 'DesignationEligibility'
];

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

function scanForViolations(content) {
  const lines = content.split('\n');
  const violations = [];
  
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    
    VIOLATION_PATTERNS.forEach(({ pattern, name, severity }) => {
      // Reset regex state
      pattern.lastIndex = 0;
      
      let match;
      while ((match = pattern.exec(line)) !== null) {
        violations.push({
          line: lineNumber,
          column: match.index,
          pattern: name,
          severity,
          snippet: line.trim().substring(0, 100)
        });
      }
    });
  });
  
  return violations;
}

function categorizeViolations(violations) {
  const errors = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');
  return { errors, warnings };
}

function generateReport(violations) {
  const { errors, warnings } = categorizeViolations(violations);
  
  console.log('\n' + '='.repeat(80));
  console.log('STRING ID USAGE VERIFICATION REPORT');
  console.log('='.repeat(80));
  console.log(`File: ${DATA_ACCESS_FILE}`);
  console.log(`Scan Date: ${new Date().toISOString()}`);
  console.log('');
  
  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ NO OBJECTID VIOLATIONS FOUND');
    console.log('All lookups use string IDs correctly.');
    return true;
  }
  
  if (errors.length > 0) {
    console.log(`\n🔴 ERRORS (${errors.length} found) - Must Fix:`);
    console.log('-'.repeat(60));
    errors.forEach((v, i) => {
      console.log(`${i + 1}. Line ${v.line}: ${v.pattern}`);
      console.log(`   Snippet: ${v.snippet}`);
    });
  }
  
  if (warnings.length > 0) {
    console.log(`\n🟡 WARNINGS (${warnings.length} found) - Review:`);
    console.log('-'.repeat(60));
    warnings.forEach((v, i) => {
      console.log(`${i + 1}. Line ${v.line}: ${v.pattern}`);
      console.log(`   Snippet: ${v.snippet}`);
    });
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Violations: ${violations.length}`);
  console.log(`  - Errors: ${errors.length}`);
  console.log(`  - Warnings: ${warnings.length}`);
  console.log('');
  
  // Group by pattern type
  const byPattern = {};
  violations.forEach(v => {
    byPattern[v.pattern] = (byPattern[v.pattern] || 0) + 1;
  });
  
  console.log('Violations by Type:');
  Object.entries(byPattern).sort((a, b) => b[1] - a[1]).forEach(([pattern, count]) => {
    console.log(`  ${pattern}: ${count}`);
  });
  
  return errors.length === 0;
}

function main() {
  console.log('Scanning data-access.ts for ObjectId usage...\n');
  
  if (!fs.existsSync(DATA_ACCESS_FILE)) {
    console.error(`❌ File not found: ${DATA_ACCESS_FILE}`);
    process.exit(1);
  }
  
  const content = readFile(DATA_ACCESS_FILE);
  const violations = scanForViolations(content);
  const passed = generateReport(violations);
  
  if (!passed) {
    console.log('\n⚠️  ACTION REQUIRED: Fix all errors before deployment.');
    process.exit(1);
  } else {
    console.log('\n✅ Verification passed. String ID usage is correct.');
    process.exit(0);
  }
}

main();
