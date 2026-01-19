/**
 * Fix Mongoose lean() type issues by adding 'as any' assertions
 * This script adds type assertions to all .lean() results to fix TypeScript errors
 */

const fs = require('fs')
const path = require('path')

const DATA_ACCESS_FILE = path.join(__dirname, '..', 'lib', 'db', 'data-access.ts')

console.log('🔧 Fixing Mongoose lean() type issues...')

let content = fs.readFileSync(DATA_ACCESS_FILE, 'utf8')
let fixesApplied = 0

// Pattern 1: Fix direct property access on lean() results
// Example: const result = await Model.findOne().lean(); result.id
// Fix: const result = await Model.findOne().lean() as any; result.id

// Find all .lean() calls followed by property access
const leanPattern = /(const\s+\w+\s*=\s*await\s+[\w.]+\([^)]*\)\s*\.lean\(\))/g
let match
const replacements = []

while ((match = leanPattern.exec(content)) !== null) {
  const fullMatch = match[0]
  const varName = fullMatch.match(/const\s+(\w+)/)?.[1]
  
  if (varName) {
    // Check if this variable is accessed with properties later
    const varUsagePattern = new RegExp(`\\b${varName}\\.(id|name|email|companyId|locationId|employeeId|adminId|_id|vendorId|productId|status|uniformId|originalSize|requestedQty|sizeInventory|totalStock|enable_pr_po_workflow|locationId|enableEmployeeOrder)`, 'g')
    const hasPropertyAccess = varUsagePattern.test(content.substring(match.index))
    
    if (hasPropertyAccess && !fullMatch.includes('as any')) {
      replacements.push({
        index: match.index,
        length: fullMatch.length,
        old: fullMatch,
        new: fullMatch + ' as any'
      })
    }
  }
}

// Apply replacements in reverse order to maintain indices
replacements.sort((a, b) => b.index - a.index)
for (const replacement of replacements) {
  content = content.substring(0, replacement.index) + replacement.new + content.substring(replacement.index + replacement.length)
  fixesApplied++
}

// Pattern 2: Fix property access in chained calls
// Example: location.companyId.id
// Fix: (location as any).companyId.id or location.companyId?.id

// Pattern 3: Fix array property access
// Example: employees.map(e => e.id)
// Fix: employees.map((e: any) => e.id)

// Pattern 4: Fix Set/Map iteration by converting to Array
content = content.replace(
  /for\s*\(\s*const\s+(\w+)\s+of\s+new\s+Set\(([^)]+)\)\s*\)/g,
  (match, varName, setContent) => {
    fixesApplied++
    return `for (const ${varName} of Array.from(new Set(${setContent})))`
  }
)

content = content.replace(
  /for\s*\(\s*const\s+(\w+)\s+of\s+(\w+)\.entries\(\)\s*\)/g,
  (match, varName, mapName) => {
    fixesApplied++
    return `for (const ${varName} of Array.from(${mapName}.entries()))`
  }
)

// Pattern 5: Fix MapIterator iteration
content = content.replace(
  /for\s*\(\s*const\s+(\w+)\s+of\s+(\w+)\.values\(\)\s*\)/g,
  (match, varName, mapName) => {
    fixesApplied++
    return `for (const ${varName} of Array.from(${mapName}.values()))`
  }
)

// Pattern 6: Fix type mismatches - Array vs single object
// Example: Type 'never[]' is missing properties
// This is usually a return type issue - need to check function signatures

// Pattern 7: Fix 'db' is possibly 'undefined'
content = content.replace(
  /const\s+db\s*=\s*mongoose\.connection\.db\s*\n\s*if\s*\(!db\)/g,
  (match) => {
    if (!match.includes('throw new Error')) {
      fixesApplied++
      return match.replace('if (!db)', 'if (!db) {\n    throw new Error(\'Database connection not available\')\n  }')
    }
    return match
  }
)

// Write the fixed content
fs.writeFileSync(DATA_ACCESS_FILE, content, 'utf8')

console.log(`✅ Applied ${fixesApplied} automatic fixes`)
console.log('⚠️  Some errors may require manual fixes')
console.log('📝 Run TypeScript compiler to see remaining errors')
