const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../lib/db/data-access.ts');
let content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log('=== COMPREHENSIVE SYNTAX FIX FOR data-access.ts ===\n');
console.log(`Total lines: ${lines.length}\n`);

const fixes = [];
let fixesApplied = 0;

// Step 1: Find all export async functions and track their structure
const functions = [];
let currentFunction = null;
let braceDepth = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();
  
  // Track function declarations
  const funcMatch = trimmed.match(/^export\s+async\s+function\s+(\w+)/);
  if (funcMatch) {
    if (currentFunction) {
      functions.push({ ...currentFunction, endLine: i - 1 });
    }
    currentFunction = {
      name: funcMatch[1],
      startLine: i,
      braceDepth: 0,
      endLine: null
    };
    braceDepth = 0;
  }
  
  // Count braces for current function
  if (currentFunction) {
    for (const char of line) {
      if (char === '{') braceDepth++;
      if (char === '}') braceDepth--;
    }
    
    currentFunction.braceDepth = braceDepth;
    
    // Function ends when braceDepth reaches 0
    if (braceDepth === 0 && trimmed.match(/^\}/) && i > currentFunction.startLine) {
      currentFunction.endLine = i;
      functions.push({ ...currentFunction });
      currentFunction = null;
    }
  }
}

// Add last function if file ends without closing
if (currentFunction) {
  currentFunction.endLine = lines.length - 1;
  functions.push(currentFunction);
}

console.log(`Found ${functions.length} export async functions\n`);

// Step 2: Check each function for return statements outside the function
let returnErrors = [];

for (const func of functions) {
  // Check lines immediately after function end
  if (func.endLine && func.endLine < lines.length - 1) {
    // Look for return statements in the 5 lines after function end
    for (let i = func.endLine + 1; i < Math.min(func.endLine + 6, lines.length); i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      if (trimmed.match(/^\s*return\s+/)) {
        // Check if this is actually inside the next function
        let isInNextFunction = false;
        for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
          if (lines[j].trim().match(/^export\s+async\s+function/)) {
            // Check brace balance between function end and return
            let balance = 0;
            for (let k = func.endLine; k <= i; k++) {
              for (const char of lines[k]) {
                if (char === '{') balance++;
                if (char === '}') balance--;
              }
            }
            
            if (balance > 0) {
              // There's an unclosed brace, so return might be in the function
              isInNextFunction = true;
            }
            break;
          }
        }
        
        if (!isInNextFunction) {
          returnErrors.push({
            line: i + 1,
            function: func.name,
            functionEndLine: func.endLine + 1,
            content: trimmed.substring(0, 60)
          });
        }
      }
    }
  }
}

console.log(`Found ${returnErrors.length} return statements outside functions:\n`);
returnErrors.forEach(err => {
  console.log(`Line ${err.line}: ${err.content} (after function ${err.function} ends at line ${err.functionEndLine})`);
});

// Step 3: Fix issues by finding the actual structural problems
// The issue is usually an extra closing brace before the return statement
let fixedLines = new Set();

for (const err of returnErrors) {
  // Look backwards from the return statement to find the function it belongs to
  let targetFunction = null;
  for (let i = err.line - 1; i >= 0; i--) {
    const funcMatch = lines[i].trim().match(/^export\s+async\s+function\s+(\w+)/);
    if (funcMatch) {
      // Check if return is after this function's end
      let braceBalance = 0;
      let funcStart = i;
      let funcEnd = -1;
      
      // Find where function actually ends
      for (let j = i; j < lines.length; j++) {
        for (const char of lines[j]) {
          if (char === '{') braceBalance++;
          if (char === '}') braceBalance--;
        }
        if (braceBalance === 0 && j > i) {
          funcEnd = j;
          break;
        }
      }
      
      // If return is before function end, this is the function
      if (funcEnd >= 0 && err.line - 1 < funcEnd) {
        targetFunction = { name: funcMatch[1], start: funcStart, end: funcEnd };
        break;
      } else if (err.line - 1 > funcEnd && funcEnd >= 0) {
        // Return is after this function - check if there's an extra brace
        // Look for consecutive closing braces before the return
        let consecutiveCloses = 0;
        for (let k = err.line - 2; k >= Math.max(funcEnd, err.line - 10); k--) {
          if (lines[k].trim() === '}') {
            consecutiveCloses++;
          } else if (lines[k].trim() !== '' && !lines[k].trim().startsWith('//')) {
            break;
          }
        }
        
        if (consecutiveCloses >= 2) {
          // There's likely an extra closing brace
          // Find the function that should contain this return
          // Check brace balance from function start to return
          braceBalance = 0;
          for (let j = funcStart; j < err.line - 1; j++) {
            for (const char of lines[j]) {
              if (char === '{') braceBalance++;
              if (char === '}') braceBalance--;
            }
          }
          
          if (braceBalance > 0) {
            // Function hasn't closed - the return should be inside it
            // Remove the extra closing brace
            for (let k = err.line - 2; k >= Math.max(funcEnd + 1, err.line - 10); k--) {
              if (lines[k].trim() === '}' && !fixedLines.has(k)) {
                console.log(`Removing extra closing brace at line ${k + 1} (before return at line ${err.line})`);
                lines[k] = ''; // Remove the extra brace
                fixedLines.add(k);
                fixes.push({
                  type: 'remove_extra_brace',
                  line: k + 1,
                  function: funcMatch[1],
                  description: `Removed extra closing brace before return statement at line ${err.line}`
                });
                fixesApplied++;
                break;
              }
            }
          }
        }
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
  console.log(`\n✅ Fixed ${fixesApplied} issues`);
} else {
  console.log('\n⚠️ No automatic fixes applied. Manual review needed.');
}
