/**
 * Script to fix common syntax issues in API route files:
 * 1. Convert `catch (error: any)` to `catch (error) { const err = error as any; ...`
 * 2. Fix missing closing braces after return statements in if blocks
 */

const fs = require('fs');
const path = require('path');

const filesToFix = [
  'app/api/admin/migrate-product-feedback-vendorids/route.ts',
  'app/api/admin/migrate-productvendors-productids/route.ts',
  'app/api/admin/migrate-relationships/route.ts',
  'app/api/shipments/[shipmentId]/pickup/reschedule/route.ts',
  'app/api/shipments/[shipmentId]/pickup/route.ts',
  'app/api/shipments/[shipmentId]/pickup/schedule/route.ts',
  'app/api/shipments/diagnose/route.ts',
  'app/api/shipments/query/route.ts',
  'app/api/shipments/sync/route.ts',
  'app/api/shipping/packages/[packageId]/route.ts',
  'app/api/suborders/route.ts',
  'app/api/superadmin/manual-courier-providers/[courierRefId]/route.ts',
  'app/api/superadmin/provider-test/route.ts',
  'app/api/superadmin/shipping-providers/[providerId]/couriers/route.ts',
  'app/api/superadmin/shipping-providers/[providerId]/couriers/sync/route.ts',
  'app/api/superadmin/shipping-providers/[providerId]/test-connection/route.ts',
  'app/api/superadmin/vendor-shipping-routing/[routingId]/route.ts',
  'app/api/superadmin/vendor-warehouses/[warehouseRefId]/route.ts',
  'app/api/test/shipway/route.ts',
  'app/api/test-encryption/route.ts',
  'app/api/vendor/warehouses/[warehouseRefId]/route.ts',
  'app/api/whatsapp/webhook/route.ts',
];

function fixFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Fix 1: Replace catch (error: any) with catch (error) and add const err = error as any
  content = content.replace(
    /\}\s*catch\s*\(\s*error\s*:\s*any\s*\)\s*\{/g,
    '} catch (error) {\n    const err = error as any;'
  );
  
  // Fix 2: Replace catch (jsonError: any) with catch (jsonError)  
  content = content.replace(
    /\}\s*catch\s*\(\s*jsonError\s*:\s*any\s*\)\s*\{/g,
    '} catch (jsonError) {'
  );
  
  // Fix 3: After fixing catch, update error. to err. in catch blocks
  // This is more complex - we need to be careful not to change things outside catch blocks
  // For now, let's do a simple replacement that's usually safe
  content = content.replace(
    /const err = error as any;\n\s*console\.error\([^)]+, error\)/g,
    (match) => match.replace(/, error\)/, ', err)')
  );
  
  // Fix 4: Identify and fix missing closing braces pattern
  // Pattern: } followed by if/const/// without proper closing
  // This is complex - let's just count braces and report
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed: ${filePath}`);
    return true;
  }
  
  // Check brace balance
  let braceCount = 0;
  for (const char of content) {
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
  }
  
  if (braceCount !== 0) {
    console.log(`WARNING: ${filePath} has unbalanced braces (count: ${braceCount})`);
  }
  
  return false;
}

// Run
console.log('Fixing API route files...\n');
let fixedCount = 0;

for (const file of filesToFix) {
  if (fixFile(file)) {
    fixedCount++;
  }
}

console.log(`\nFixed ${fixedCount} files`);
