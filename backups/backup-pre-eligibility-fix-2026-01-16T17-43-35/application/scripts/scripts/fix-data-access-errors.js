/**
 * Fix Data Access Layer Error Handling
 * Changes "not found" errors to return null/empty instead of throwing
 */

const fs = require('fs')
const path = require('path')

const DATA_ACCESS_FILE = path.join(__dirname, '..', 'lib', 'db', 'data-access.ts')

function fixDataAccessErrors() {
  try {
    let content = fs.readFileSync(DATA_ACCESS_FILE, 'utf8')
    const originalContent = content
    let changes = []
    
    // Pattern 1: Functions that return single objects - should return null
    // Pattern: if (!X) { throw new Error('X not found') }
    // Should be: if (!X) { console.warn(...); return null }
    
    const singleObjectPatterns = [
      {
        pattern: /(if\s*\(!\s*product\s*\)\s*\{[^}]*)(throw\s+new\s+Error\([^)]*Product\s+not\s+found[^)]*\))/g,
        replacement: (match, before, throwStatement) => {
          return `${before}console.warn(\`[updateProduct] Product not found: \${productId}\`);
    return null // Return null instead of throwing - let API route handle 404`
        },
        name: 'updateProduct - return null'
      },
      {
        pattern: /(if\s*\(!\s*updated\s*\)\s*\{[^}]*)(throw\s+new\s+Error\([^)]*Product\s+not\s+found[^)]*\))/g,
        replacement: (match, before, throwStatement) => {
          return `${before}console.warn(\`[updateProduct] Product not found for update: \${productId}\`);
    return null // Return null instead of throwing - let API route handle 404`
        },
        name: 'updateProduct - return null for updated'
      },
      {
        pattern: /(if\s*\(!\s*vendor\s*\)\s*\{[^}]*)(throw\s+new\s+Error\([^)]*Vendor\s+not\s+found[^)]*\))/g,
        replacement: (match, before, throwStatement) => {
          // Check context - if it's in getProductsByVendor, return []
          const context = content.substring(Math.max(0, content.indexOf(match) - 200), content.indexOf(match))
          if (context.includes('getProductsByVendor')) {
            return `${before}console.warn(\`[getProductsByVendor] Vendor not found: \${vendorId}\`);
    return [] // Return empty array instead of throwing`
          }
          return `${before}console.warn(\`[updateVendor] Vendor not found: \${vendorId}\`);
    return null // Return null instead of throwing - let API route handle 404`
        },
        name: 'vendor not found - return null/empty'
      },
      {
        pattern: /(if\s*\(!\s*location\s*\)\s*\{[^}]*)(throw\s+new\s+Error\([^)]*Location\s+not\s+found[^)]*\))/g,
        replacement: (match, before, throwStatement) => {
          // Check context - if it's in deleteLocation or updateLocation, return early
          const context = content.substring(Math.max(0, content.indexOf(match) - 200), content.indexOf(match))
          if (context.includes('deleteLocation')) {
            return `${before}console.warn(\`[deleteLocation] Location not found: \${locationId}\`);
    return // Return early instead of throwing - let API route handle 404`
          }
          return `${before}console.warn(\`[updateLocation] Location not found: \${locationId}\`);
    return null // Return null instead of throwing - let API route handle 404`
        },
        name: 'location not found - return null/void'
      }
    ]
    
    for (const { pattern, replacement, name } of singleObjectPatterns) {
      if (pattern.test(content)) {
        content = content.replace(pattern, replacement)
        changes.push(name)
      }
    }
    
    // Pattern 2: Delete functions - should return early instead of throwing
    const deletePatterns = [
      {
        pattern: /(const\s+product\s*=\s*await\s+Uniform\.findOne[^}]+if\s*\(!\s*product\s*\)\s*\{[^}]*)(throw\s+new\s+Error\([^)]*Product\s+not\s+found[^)]*\))/g,
        replacement: (match, before, throwStatement) => {
          const context = content.substring(Math.max(0, content.indexOf(match) - 100), content.indexOf(match))
          if (context.includes('deleteProduct')) {
            return `${before}console.warn(\`[deleteProduct] Product not found: \${productId}\`);
    return // Return early instead of throwing - let API route handle 404`
          }
          return match // Don't change if not in deleteProduct
        },
        name: 'deleteProduct - return early'
      }
    ]
    
    for (const { pattern, replacement, name } of deletePatterns) {
      if (pattern.test(content)) {
        content = content.replace(pattern, replacement)
        changes.push(name)
      }
    }
    
    if (content !== originalContent) {
      fs.writeFileSync(DATA_ACCESS_FILE, content, 'utf8')
      return { fixed: true, changes }
    }
    
    return { fixed: false, changes: [] }
  } catch (error) {
    return { fixed: false, error: error.message }
  }
}

// Main execution
console.log('🔧 Fixing Data Access Layer Error Handling')
console.log('='.repeat(80))
console.log('')

const result = fixDataAccessErrors()

if (result.fixed) {
  console.log('✅ Fixed data-access.ts')
  console.log('Changes made:')
  result.changes.forEach(change => console.log(`  - ${change}`))
} else {
  console.log('⚠️  No changes made')
  if (result.error) {
    console.error(`Error: ${result.error}`)
  }
}

console.log('')
console.log('='.repeat(80))
