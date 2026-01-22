/**
 * Fix Mongoose lean() property access errors by adding 'as any' assertions
 */

const fs = require('fs')
const path = require('path')

const DATA_ACCESS_FILE = path.join(__dirname, '..', 'lib', 'db', 'data-access.ts')

console.log('🔧 Fixing Mongoose property access errors...')

let content = fs.readFileSync(DATA_ACCESS_FILE, 'utf8')
let fixesApplied = 0

// Fix property access on lean() results that don't have 'as any'
// Pattern: result.property where result comes from .lean()
const propertyAccessPattern = /(const\s+\w+\s*=\s*await\s+[\w.]+\([^)]*\)\s*\.lean\(\))(?!\s*as\s+any)/g
let match
const replacements = []

while ((match = propertyAccessPattern.exec(content)) !== null) {
  const fullMatch = match[0]
  const varName = fullMatch.match(/const\s+(\w+)/)?.[1]
  
  if (varName) {
    // Check if this variable is accessed with properties later (within next 500 chars)
    const next500 = content.substring(match.index, Math.min(match.index + 500, content.length))
    const varUsagePattern = new RegExp(`\\b${varName}\\.(id|name|email|companyId|locationId|employeeId|adminId|_id|vendorId|productId|status|uniformId|originalSize|requestedQty|sizeInventory|totalStock|enable_pr_po_workflow|enableEmployeeOrder|warehouseRefId)`, 'g')
    
    if (varUsagePattern.test(next500)) {
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

// Fix property access on already-typed variables
// Pattern: (result as any).property - ensure all property accesses use 'as any'
content = content.replace(
  /(\w+)\.(id|name|email|companyId|locationId|employeeId|adminId|_id|vendorId|productId|status|uniformId|originalSize|requestedQty|sizeInventory|totalStock|enable_pr_po_workflow|enableEmployeeOrder|warehouseRefId)/g,
  (match, varName, prop) => {
    // Check if this variable comes from a lean() call
    const beforeMatch = content.substring(Math.max(0, content.lastIndexOf('\n', content.indexOf(match)) - 500), content.indexOf(match))
    const leanPattern = new RegExp(`const\\s+${varName}\\s*=\\s*await[^\\n]*\\.lean\\(\\)`, 'g')
    
    if (leanPattern.test(beforeMatch) && !beforeMatch.includes(`${varName} as any`)) {
      fixesApplied++
      return `(${varName} as any).${prop}`
    }
    return match
  }
)

// Write the fixed content
fs.writeFileSync(DATA_ACCESS_FILE, content, 'utf8')

console.log(`✅ Applied ${fixesApplied} fixes for Mongoose property access`)
console.log('📝 Run TypeScript compiler to see remaining errors')
