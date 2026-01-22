const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../lib/db/data-access.ts');
let content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log('=== AGGRESSIVE REPAIR: COMPREHENSIVE STRUCTURAL FIX ===\n');
console.log(`File: lib/db/data-access.ts`);
console.log(`Total lines: ${lines.length}\n`);

const fixes = [];
let fixesApplied = 0;

// Pattern 1: Fix missing if checks before return statements
// Pattern: 
//   .lean() as any
//   
//     return []
//   }
const missingIfPatterns = [
  {
    // Line 7387 - Missing if (!employee) check
    line: 7386,
    check: (i) => {
      return lines[i].trim() === '' &&
             lines[i+1] && lines[i+1].trim().match(/^\s+return\s+\[\]\s*$/) &&
             lines[i+2] && lines[i+2].trim() === '}';
    },
    fix: (i) => {
      lines[i+1] = '  if (!employee) {';
      lines.splice(i+2, 0, '    return []');
      lines[i+3] = '  }';
      return { type: 'add_if_check', line: i+2, description: 'Added missing if (!employee) check' };
    }
  },
  {
    // Line 11461 - Missing if (locationDoc) check
    line: 11460,
    check: (i) => {
      return lines[i].trim().match(/\.lean\(\) as any\s*$/) &&
             lines[i+1] && lines[i+1].trim() === '' &&
             lines[i+2] && lines[i+2].trim().match(/^\s+locationId = locationDoc\._id\s*$/) &&
             lines[i+3] && lines[i+3].trim() === '}';
    },
    fix: (i) => {
      lines[i+2] = '    if (locationDoc) {';
      lines.splice(i+3, 0, '      locationId = locationDoc._id');
      lines[i+4] = '    }';
      return { type: 'add_if_check', line: i+3, description: 'Added missing if (locationDoc) check' };
    }
  },
  {
    // Line 11671 - Similar pattern
    line: 11670,
    check: (i) => {
      return lines[i].trim().match(/\.lean\(\) as any\s*$/) &&
             lines[i+1] && lines[i+1].trim() === '' &&
             lines[i+2] && lines[i+2].trim().match(/^\s+locationId = locationDoc\._id\s*$/) &&
             lines[i+3] && lines[i+3].trim() === '}';
    },
    fix: (i) => {
      lines[i+2] = '    if (locationDoc) {';
      lines.splice(i+3, 0, '      locationId = locationDoc._id');
      lines[i+4] = '    }';
      return { type: 'add_if_check', line: i+3, description: 'Added missing if (locationDoc) check' };
    }
  },
  {
    // Line 12057 - Similar pattern
    line: 12056,
    check: (i) => {
      return lines[i].trim().match(/\.lean\(\) as any\s*$/) &&
             lines[i+1] && lines[i+1].trim() === '' &&
             lines[i+2] && lines[i+2].trim().match(/^\s+locationId = locationDoc\._id\s*$/) &&
             lines[i+3] && lines[i+3].trim() === '}';
    },
    fix: (i) => {
      lines[i+2] = '    if (locationDoc) {';
      lines.splice(i+3, 0, '      locationId = locationDoc._id');
      lines[i+4] = '    }';
      return { type: 'add_if_check', line: i+3, description: 'Added missing if (locationDoc) check' };
    }
  },
  {
    // Line 20259 - Missing if (!returnRequest) check
    line: 20258,
    check: (i) => {
      return lines[i].trim().match(/\.lean\(\) as any\s*$/) &&
             lines[i+1] && lines[i+1].trim() === '' &&
             lines[i+2] && lines[i+2].trim().match(/^\s+return null\s*$/) &&
             lines[i+3] && lines[i+3].trim() === '}';
    },
    fix: (i) => {
      lines[i+2] = '  if (!returnRequest) {';
      lines.splice(i+3, 0, '    return null');
      lines[i+4] = '  }';
      return { type: 'add_if_check', line: i+3, description: 'Added missing if (!returnRequest) check' };
    }
  }
];

// Apply missing if check fixes
for (const pattern of missingIfPatterns) {
  if (pattern.check(pattern.line - 1)) {
    const fix = pattern.fix(pattern.line - 1);
    fixes.push(fix);
    fixesApplied++;
    console.log(`Fix: ${fix.description} at line ${fix.line}`);
  }
}

// Pattern 2: Fix missing if checks before assignments/returns in other locations
// Check for patterns like:
//   .lean() as any
//   
//     variable = value
//   }

// Pattern 3: Fix missing return statements or missing closing braces
// Check functions that end abruptly

// Pattern 4: Fix extra closing braces
// Look for consecutive closing braces that might be extra

// Pattern 5: Fix missing vendorMap initialization
// Check for vendorMap usage without initialization

console.log(`\n=== FIXES APPLIED ===`);
console.log(`Total fixes: ${fixesApplied}\n`);

if (fixesApplied > 0) {
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  console.log(`✅ Applied ${fixesApplied} fixes`);
} else {
  console.log('⚠️ No automatic fixes applied.');
}
