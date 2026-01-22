/**
 * Comprehensive Route Error Fixer
 * Fixes all common error patterns in API routes
 */

const fs = require('fs')
const path = require('path')
const { glob } = require('glob')

const API_DIR = path.join(__dirname, '..', 'app', 'api')

async function findApiRoutes() {
  const routeFiles = await glob('**/route.ts', {
    cwd: API_DIR,
    absolute: true
  })
  return routeFiles
}

function fixRoute(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8')
    const originalContent = content
    let changes = []
    
    // Fix 1: Add null checks after Model.findOne({ id: ... })
    const findOnePatterns = [
      { model: 'Company', var: 'company', msg: 'Company not found' },
      { model: 'Vendor', var: 'vendor', msg: 'Vendor not found' },
      { model: 'Branch', var: 'branch', msg: 'Branch not found' },
      { model: 'Subcategory', var: 'subcategory', msg: 'Subcategory not found' },
      { model: 'Category', var: 'category|parentCategory', msg: 'Category not found' },
      { model: 'Uniform', var: 'product', msg: 'Product not found' },
      { model: 'Shipment', var: 'shipment', msg: 'Shipment not found' },
      { model: 'Order', var: 'order', msg: 'Order not found' },
      { model: 'Location', var: 'location', msg: 'Location not found' },
      { model: 'Employee', var: 'employee', msg: 'Employee not found' },
      { model: 'ProductCategory', var: 'category', msg: 'Category not found' },
    ]
    
    for (const { model, var: varPattern, msg } of findOnePatterns) {
      const vars = varPattern.split('|')
      for (const varName of vars) {
        const pattern = new RegExp(
          `(const|let)\\s+${varName}\\s*=\\s*await\\s+${model}\\.findOne\\([^)]+\\)`,
          'g'
        )
        
        let match
        while ((match = pattern.exec(content)) !== null) {
          const startPos = match.index
          const endPos = startPos + match[0].length
          const nextLineStart = content.indexOf('\n', endPos)
          
          if (nextLineStart === -1) continue
          
          // Check if null check exists
          const afterMatch = content.substring(endPos, Math.min(endPos + 200, content.length))
          if (afterMatch.includes(`if (!${varName})`) || 
              afterMatch.includes(`if (${varName} === null`)) {
            continue
          }
          
          // Check if variable is used (needs null check)
          const nextLines = content.substring(nextLineStart, Math.min(nextLineStart + 150, content.length))
          if (nextLines.includes(`${varName}.`) || 
              nextLines.includes(`${varName}[`) ||
              nextLines.includes(`${varName}.id`)) {
            
            const nullCheck = `\n    if (!${varName}) {
      return NextResponse.json({ error: '${msg}' }, { status: 404 })
    }`
            
            content = content.substring(0, nextLineStart) + nullCheck + content.substring(nextLineStart)
            changes.push(`Added null check for ${varName} (${model}.findOne)`)
          }
        }
      }
    }
    
    // Fix 2: Ensure all handlers have try-catch
    const handlerPattern = /export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH)\s*\([^)]*\)\s*\{/g
    const handlers = []
    let match
    while ((match = handlerPattern.exec(content)) !== null) {
      handlers.push({ method: match[1], index: match.index })
    }
    
    // Check if handlers have try-catch (simple check)
    const tryCount = (content.match(/try\s*\{/g) || []).length
    if (handlers.length > tryCount) {
      // Some handlers missing try-catch - but we'll let the error boundary script handle this
    }
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8')
      return { fixed: true, changes, file: path.relative(API_DIR, filePath) }
    }
    
    return { fixed: false, changes: [], file: path.relative(API_DIR, filePath) }
  } catch (error) {
    return { fixed: false, error: error.message, file: path.relative(API_DIR, filePath) }
  }
}

async function main() {
  console.log('🔧 Comprehensive Route Error Fixer')
  console.log('='.repeat(80))
  console.log('')
  
  const routes = await findApiRoutes()
  console.log(`Found ${routes.length} API route files`)
  console.log('')
  
  const results = []
  for (const route of routes) {
    const result = fixRoute(route)
    results.push(result)
    if (result.fixed) {
      console.log(`✅ Fixed: ${result.file}`)
      if (result.changes.length > 0) {
        result.changes.forEach(change => console.log(`   - ${change}`))
      }
    }
  }
  
  const fixed = results.filter(r => r.fixed).length
  const errors = results.filter(r => r.error).length
  
  console.log('')
  console.log('='.repeat(80))
  console.log(`✅ Fixed: ${fixed} files`)
  if (errors > 0) {
    console.log(`❌ Errors: ${errors} files`)
  }
  console.log('')
}

main().catch(console.error)
