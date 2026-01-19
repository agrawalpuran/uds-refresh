/**
 * Fix corrupted null checks inserted by the previous script
 * Removes null checks that were incorrectly inserted in the middle of expressions
 */

const fs = require('fs')
const path = require('path')

const DATA_ACCESS_FILE = path.join(__dirname, '..', 'lib', 'db', 'data-access.ts')

console.log('🔧 Fixing corrupted null checks...')

let content = fs.readFileSync(DATA_ACCESS_FILE, 'utf8')
let fixesApplied = 0

// Pattern 1: Remove null checks in the middle of variable assignments
// Example: const x = \n  if (!var) { throw } \n var.property
content = content.replace(
  /(\w+)\s*=\s*\n\s*if\s*\(!(\w+)\)\s*\{\s*throw new Error\('(\w+) is null or undefined'\)\s*\}\s*\n\s*\2\.(\w+)/g,
  (match, var1, var2, varName, prop) => {
    fixesApplied++
    return `${var1} = ${var2}.${prop}`
  }
)

// Pattern 2: Remove null checks in the middle of template strings
// Example: `text ${ \n if (!var) { throw } \n var.property }`
content = content.replace(
  /\$\{\s*\n\s*if\s*\(!(\w+)\)\s*\{\s*throw new Error\('(\w+) is null or undefined'\)\s*\}\s*\n\s*\1\.(\w+)\s*\}/g,
  (match, varName, varName2, prop) => {
    fixesApplied++
    return `\${${varName}.${prop}}`
  }
)

// Pattern 3: Remove null checks in function arguments
// Example: func(\n  if (!var) { throw } \n var.property)
content = content.replace(
  /\(\s*\n\s*if\s*\(!(\w+)\)\s*\{\s*throw new Error\('(\w+) is null or undefined'\)\s*\}\s*\n\s*\1\.(\w+)\s*\)/g,
  (match, varName, varName2, prop) => {
    fixesApplied++
    return `(${varName}.${prop})`
  }
)

// Pattern 4: Remove standalone null checks that break expressions
// Example: \n  if (!var) { throw } \n var.property
content = content.replace(
  /\n\s*if\s*\(!(\w+)\)\s*\{\s*throw new Error\('(\w+) is null or undefined'\)\s*\}\s*\n\s*\1\.(\w+)/g,
  (match, varName, varName2, prop) => {
    fixesApplied++
    return `\n    ${varName}.${prop}`
  }
)

// Pattern 5: Fix duplicate db checks
content = content.replace(
  /if\s*\(!db\)\s*\{\s*throw new Error\('Database connection not available'\)\s*\}\s*\{/g,
  (match) => {
    fixesApplied++
    return 'if (!db) {'
  }
)

// Write the fixed content
fs.writeFileSync(DATA_ACCESS_FILE, content, 'utf8')

console.log(`✅ Removed ${fixesApplied} corrupted null checks`)
console.log('📝 Run TypeScript compiler to see remaining errors')
