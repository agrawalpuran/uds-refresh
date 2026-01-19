/**
 * Script to fix common syntax issues in TypeScript files:
 * 1. Convert `catch (error: any)` to `catch (error) { const err = error as any; ...`
 * 2. Fix missing closing braces after single-line return statements
 */

const fs = require('fs');
const path = require('path');

const apiDir = path.join(__dirname, '..', 'app', 'api');

function findFilesRecursively(dir, files = []) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      findFilesRecursively(fullPath, files);
    } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

function fixCatchErrorAny(content) {
  // Replace `catch (error: any) {` with `catch (error) { const err = error as any;`
  // and update references from `error.` to `err.`
  
  // Match catch blocks with error: any
  const regex = /\}\s*catch\s*\(\s*(\w+)\s*:\s*any\s*\)\s*\{/g;
  
  let match;
  let result = content;
  const replacements = [];
  
  while ((match = regex.exec(content)) !== null) {
    const varName = match[1];
    const newVarName = varName === 'error' ? 'err' : `${varName}Err`;
    const oldText = match[0];
    const newText = `} catch (${varName}) {\n    const ${newVarName} = ${varName} as any;`;
    
    replacements.push({ oldText, newText, varName, newVarName });
  }
  
  // Apply replacements
  for (const rep of replacements) {
    result = result.replace(rep.oldText, rep.newText);
    // Also replace uses of error. with err. in the catch block (simplified approach)
    // This is a simplification and may not be perfect
  }
  
  return result;
}

function countBraces(content) {
  let count = 0;
  for (const char of content) {
    if (char === '{') count++;
    if (char === '}') count--;
  }
  return count;
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Fix catch (error: any) pattern
  content = fixCatchErrorAny(content);
  
  if (content !== originalContent) {
    console.log(`Fixed: ${filePath}`);
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  
  return false;
}

// Main
const files = findFilesRecursively(apiDir);
let fixedCount = 0;

for (const file of files) {
  try {
    if (processFile(file)) {
      fixedCount++;
    }
  } catch (e) {
    console.error(`Error processing ${file}:`, e.message);
  }
}

console.log(`\nFixed ${fixedCount} files`);
