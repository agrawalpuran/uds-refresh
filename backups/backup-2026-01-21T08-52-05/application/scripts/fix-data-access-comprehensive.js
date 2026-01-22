const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../lib/db/data-access.ts');
let content = fs.readFileSync(filePath, 'utf8');
const originalLength = content.length;

console.log('Starting comprehensive fixes...');

// Fix 1: Remove duplicate `.lean() as any as any` -> `.lean() as any`
let count1 = (content.match(/\.lean\(\)\s+as\s+any\s+as\s+any/g) || []).length;
content = content.replace(/\.lean\(\)\s+as\s+any\s+as\s+any/g, '.lean() as any');
console.log(`Fixed ${count1} duplicate .lean() as any patterns`);

// Fix 2: Fix duplicate db connection checks
let count2 = (content.match(/if\s*\(\s*!db\s*\)\s*\{[\s\S]*?throw\s+new\s+Error\(['"]Database\s+connection\s+not\s+available['"]\)[\s\S]*?\}[\s\S]*?if\s*\(\s*!db\s*\)\s*\{/g) || []).length;
content = content.replace(/if\s*\(\s*!db\s*\)\s*\{[\s\S]*?throw\s+new\s+Error\(['"]Database\s+connection\s+not\s+available['"]\)[\s\S]*?\}[\s\S]*?if\s*\(\s*!db\s*\)\s*\{/g, 'if (!db) {\n    throw new Error(\'Database connection not available\')\n  }');
console.log(`Fixed ${count2} duplicate db checks`);

// Fix 3: Fix orphaned closing braces before function declarations
// Pattern: } followed by export async function (with blank line)
content = content.replace(/\}\s*\n\s*\n\s*export\s+async\s+function/g, '}\n\nexport async function');

// Fix 4: Fix malformed if statements with line breaks in conditions
content = content.replace(/if\s*\(\s*!([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\)\s*\n\s*\{/g, 'if (!$1) {');

// Fix 5: Fix orphaned standalone statements (like "location.id" on its own line)
content = content.replace(/^\s*[a-zA-Z_$][a-zA-Z0-9_$]*\.[a-zA-Z_$][a-zA-Z0-9_$]*\s*$/gm, '');

// Fix 6: Fix missing closing parentheses in function calls
content = content.replace(/await\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\.\s*findOne\([^)]*$/gm, (match) => {
  if (!match.includes(')')) {
    return match + ')';
  }
  return match;
});

// Fix 7: Remove extra blank lines (more than 2 consecutive)
content = content.replace(/\n{4,}/g, '\n\n\n');

// Fix 8: Fix indentation issues with return statements in try blocks
content = content.replace(/(\s+)return\s+([^\n]+)\n\s+\}\s+catch/g, '$1  return $2\n$1} catch');

fs.writeFileSync(filePath, content, 'utf8');
console.log(`\n✅ Comprehensive fixes applied. File size: ${originalLength} -> ${content.length} characters`);
console.log('Please review and test the changes.');
