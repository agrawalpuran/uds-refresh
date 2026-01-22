const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../lib/db/data-access.ts');
let content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log('=== COMPREHENSIVE STRUCTURAL FIX FOR data-access.ts ===\n');
console.log(`Total lines: ${lines.length}\n`);

const fixes = [];
let fixesApplied = 0;

// Pattern 1: Fix missing if (!employee) checks before return []
// Look for pattern:
//   }).lean()
//   
//     return []
//   }

// Pattern 2: Fix missing if (!locationDoc) checks before assignment
// Look for pattern:
//   .lean() as any
//   
//     locationId = locationDoc._id
//   }

// Pattern 3: Fix missing if (!returnRequest) checks before return
// Look for pattern:
//   .lean() as any
//   
//     return null
//   }

// Fix 1: Line 7387 - Missing if (!employee) check
if (lines[7386].trim() === '' && 
    lines[7387].trim().match(/^\s+return\s+\[\]\s*$/) && 
    lines[7388].trim() === '}') {
  console.log(`Fix 1: Line 7387 - Adding missing if (!employee) check`);
  lines[7387] = '  if (!employee) {';
  lines.splice(7388, 0, '    return []');
  lines[7389] = '  }';
  fixes.push({ type: 'add_if_check', line: 7387, description: 'Added missing if (!employee) check before return []' });
  fixesApplied++;
}

// Fix 2: Line 11461 - Missing if (locationDoc) check
if (lines[11459].trim().match(/\.lean\(\) as any\s*$/) &&
    lines[11460].trim() === '' &&
    lines[11461].trim().match(/^\s+locationId = locationDoc\._id\s*$/) &&
    lines[11462].trim() === '}') {
  console.log(`Fix 2: Line 11461 - Adding missing if (locationDoc) check`);
  lines[11461] = '    if (locationDoc) {';
  lines.splice(11462, 0, '      locationId = locationDoc._id');
  lines[11463] = '    }';
  fixes.push({ type: 'add_if_check', line: 11461, description: 'Added missing if (locationDoc) check before assignment' });
  fixesApplied++;
}

// Fix 3: Line 11671 - Similar pattern (check context)
// Fix 4: Line 12057 - Similar pattern (check context)
// Fix 5: Line 20259 - Missing if (!returnRequest) check
if (lines[20257].trim().match(/\.lean\(\) as any\s*$/) &&
    lines[20258].trim() === '' &&
    lines[20259].trim().match(/^\s+return null\s*$/) &&
    lines[20260].trim() === '}') {
  console.log(`Fix 5: Line 20259 - Adding missing if (!returnRequest) check`);
  lines[20259] = '  if (!returnRequest) {';
  lines.splice(20260, 0, '    return null');
  lines[20261] = '  }';
  fixes.push({ type: 'add_if_check', line: 20259, description: 'Added missing if (!returnRequest) check before return null' });
  fixesApplied++;
}

// Fix 6: Line 16178 - Return statement appears to be outside function
// This one is trickier - need to check if there's a missing closing brace
// The return statement at 16178 should be inside getDesignationEligibilityByDesignation
// Let's check the brace balance from function start to return
let funcStartLine = 16075;
let returnLine = 16177; // 0-indexed: 16178 - 1
let braceBalance = 0;
for (let i = funcStartLine; i < returnLine; i++) {
  for (const char of lines[i]) {
    if (char === '{') braceBalance++;
    if (char === '}') braceBalance--;
  }
}
if (braceBalance <= 0) {
  console.log(`Fix 6: Line 16178 - Function appears to have closed prematurely, brace balance: ${braceBalance}`);
  // Look for extra closing braces before the return
  for (let i = returnLine - 1; i >= Math.max(funcStartLine, returnLine - 10); i--) {
    if (lines[i].trim() === '}' && braceBalance <= 0) {
      // Check if removing this brace would fix it
      let testBalance = braceBalance + 1;
      if (testBalance > 0) {
        console.log(`  Removing extra closing brace at line ${i + 1}`);
        lines[i] = '';
        fixes.push({ type: 'remove_extra_brace', line: i + 1, description: 'Removed extra closing brace before return statement' });
        fixesApplied++;
        break;
      }
    }
  }
}

console.log(`\n=== FIXES APPLIED ===`);
console.log(`Total fixes: ${fixesApplied}\n`);

fixes.forEach(fix => {
  console.log(`${fix.type} at line ${fix.line}: ${fix.description}`);
});

if (fixesApplied > 0) {
  // Write fixed content
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  console.log(`\n✅ Applied ${fixesApplied} fixes`);
} else {
  console.log('\n⚠️ No automatic fixes applied. Manual review needed.');
}
