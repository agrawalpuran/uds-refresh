const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../lib/db/data-access.ts');
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log('=== AGGRESSIVE REPAIR MODE: COMPREHENSIVE STRUCTURAL ANALYSIS ===\n');
console.log(`File: lib/db/data-access.ts`);
console.log(`Total lines: ${lines.length}\n`);

const issues = {
  topLevelReturns: [],
  missingBraces: [],
  extraBraces: [],
  unclosedFunctions: [],
  misplacedCode: [],
  brokenIndentation: []
};

// Track function boundaries
const functions = [];
let currentFunction = null;
let braceStack = [];
let inString = false;
let stringChar = null;
let inComment = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();
  const lineNum = i + 1;
  
  // Skip empty lines and comments for structure analysis
  if (trimmed === '' || trimmed.startsWith('//')) continue;
  
  // Track function declarations
  const funcMatch = trimmed.match(/^export\s+async\s+function\s+(\w+)/);
  if (funcMatch) {
    if (currentFunction) {
      currentFunction.endLine = i - 1;
      functions.push({ ...currentFunction });
    }
    currentFunction = {
      name: funcMatch[1],
      startLine: i,
      endLine: null,
      braceCount: 0
    };
    braceStack = [];
  }
  
  // Count braces (skip strings and comments)
  let lineBraces = 0;
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    const nextChar = j < line.length - 1 ? line[j + 1] : null;
    
    // Handle strings
    if (!inString && !inComment && (char === '"' || char === "'" || char === '`')) {
      inString = true;
      stringChar = char;
    } else if (inString && char === stringChar && (j === 0 || line[j-1] !== '\\')) {
      inString = false;
      stringChar = null;
      continue;
    }
    if (inString) continue;
    
    // Handle comments
    if (!inComment && char === '/' && nextChar === '/') break;
    if (!inComment && char === '/' && nextChar === '*') {
      inComment = true;
      j++;
      continue;
    }
    if (inComment && char === '*' && nextChar === '/') {
      inComment = false;
      j++;
      continue;
    }
    if (inComment) continue;
    
    // Count braces
    if (char === '{') {
      lineBraces++;
      braceStack.push({ line: lineNum, type: 'open' });
    }
    if (char === '}') {
      lineBraces--;
      if (braceStack.length > 0) {
        braceStack.pop();
      } else {
        issues.extraBraces.push({
          line: lineNum,
          function: currentFunction?.name || 'NONE',
          issue: 'Extra closing brace - no matching opening brace'
        });
      }
    }
  }
  
  // Check for top-level return statements
  if (currentFunction) {
    currentFunction.braceCount += lineBraces;
    
    // If braceCount reaches 0, function has closed
    if (currentFunction.braceCount === 0 && trimmed.match(/^\}/)) {
      currentFunction.endLine = i;
      functions.push({ ...currentFunction });
      currentFunction = null;
    }
  } else if (trimmed.match(/^\s*return\s+/)) {
    // Return statement outside any function
    issues.topLevelReturns.push({
      line: lineNum,
      content: trimmed.substring(0, 60),
      issue: 'Return statement at top level (not inside any function)'
    });
  }
}

// Add last function if file doesn't end with closing brace
if (currentFunction) {
  currentFunction.endLine = lines.length - 1;
  functions.push(currentFunction);
}

// Check for unclosed functions
for (const func of functions) {
  if (func.endLine === null || func.braceCount !== 0) {
    issues.unclosedFunctions.push({
      function: func.name,
      startLine: func.startLine + 1,
      endLine: func.endLine ? func.endLine + 1 : 'EOF',
      braceCount: func.braceCount,
      issue: `Function ${func.name} has brace imbalance: ${func.braceCount > 0 ? `Missing ${func.braceCount} closing` : `Extra ${Math.abs(func.braceCount)} closing`} brace(s)`
    });
  }
}

// Check for return statements that appear after function end
for (let i = 0; i < functions.length - 1; i++) {
  const func = functions[i];
  const nextFunc = functions[i + 1];
  
  if (func.endLine && nextFunc.startLine) {
    // Check lines between functions for return statements
    for (let j = func.endLine + 1; j < nextFunc.startLine; j++) {
      const trimmed = lines[j].trim();
      if (trimmed.match(/^\s*return\s+/)) {
        issues.topLevelReturns.push({
          line: j + 1,
          function: func.name,
          nextFunction: nextFunc.name,
          content: trimmed.substring(0, 60),
          issue: `Return statement between functions ${func.name} and ${nextFunc.name}`
        });
      }
    }
  }
}

// Print comprehensive report
console.log('=== STRUCTURAL ISSUES FOUND ===\n');

if (issues.topLevelReturns.length > 0) {
  console.log(`TOP-LEVEL RETURN STATEMENTS: ${issues.topLevelReturns.length}`);
  issues.topLevelReturns.forEach(issue => {
    console.log(`  Line ${issue.line}: ${issue.issue}`);
    console.log(`    ${issue.content}`);
    if (issue.function) console.log(`    (After function: ${issue.function})`);
    if (issue.nextFunction) console.log(`    (Before function: ${issue.nextFunction})`);
    console.log('');
  });
}

if (issues.extraBraces.length > 0) {
  console.log(`EXTRA CLOSING BRACES: ${issues.extraBraces.length}`);
  issues.extraBraces.forEach(issue => {
    console.log(`  Line ${issue.line} (${issue.function}): ${issue.issue}`);
  });
  console.log('');
}

if (issues.unclosedFunctions.length > 0) {
  console.log(`UNCLOSED FUNCTIONS: ${issues.unclosedFunctions.length}`);
  issues.unclosedFunctions.forEach(issue => {
    console.log(`  ${issue.function} (line ${issue.startLine}): ${issue.issue}`);
  });
  console.log('');
}

console.log(`=== SUMMARY ===`);
console.log(`Total functions found: ${functions.length}`);
console.log(`Top-level returns: ${issues.topLevelReturns.length}`);
console.log(`Extra braces: ${issues.extraBraces.length}`);
console.log(`Unclosed functions: ${issues.unclosedFunctions.length}`);

// Export issues for fixing
const reportPath = path.join(__dirname, '../scripts/structural-issues-report.json');
fs.writeFileSync(reportPath, JSON.stringify({
  functions: functions.length,
  issues: {
    topLevelReturns: issues.topLevelReturns.length,
    extraBraces: issues.extraBraces.length,
    unclosedFunctions: issues.unclosedFunctions.length
  },
  details: {
    topLevelReturns: issues.topLevelReturns,
    extraBraces: issues.extraBraces,
    unclosedFunctions: issues.unclosedFunctions
  }
}, null, 2));

console.log(`\n✅ Detailed report saved to: ${reportPath}`);
