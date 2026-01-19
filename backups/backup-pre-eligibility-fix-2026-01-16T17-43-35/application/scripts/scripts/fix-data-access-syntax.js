const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../lib/db/data-access.ts');
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);

let fixes = [];

// Fix 1: Remove duplicate `.lean() as any as any` -> `.lean() as any`
content = content.replace(/\.lean\(\)\s+as\s+any\s+as\s+any/g, '.lean() as any');

// Fix 2: Fix indentation issues with return statements before catch blocks
// This is a complex pattern, so we'll handle it manually for specific cases

// Fix 3: Remove duplicate db connection checks
content = content.replace(/if\s*\(\s*!db\s*\)\s*\{\s*[\r\n]+\s*throw\s+new\s+Error\(['"]Database\s+connection\s+not\s+available['"]\)[\r\n]+\s*\}\s*[\r\n]+\s*if\s*\(\s*!db\s*\)\s*\{/g, 'if (!db) {');

// Fix 4: Fix malformed Promise.all patterns
content = content.replace(/await\s+Promise\.all\(\[[\s\S]*?\]\s*\)\s*[\r\n]+\s*if\s*\(/g, (match) => {
  // Ensure Promise.all is properly closed
  if (!match.includes('])')) {
    return match.replace(/\]\s*[\r\n]+\s*if\s*\(/, ']) \n        \n        if (');
  }
  return match;
});

fs.writeFileSync(filePath, content, 'utf8');
console.log('Applied automated fixes to data-access.ts');
