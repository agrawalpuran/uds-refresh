/**
 * Add All Missing Null Checks
 * Systematically adds null checks to all routes
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

function addNullChecks(content) {
  let modified = false
  let changes = []
  
  // Pattern: const var = await Model.findOne(...) followed by usage
  const patterns = [
    {
      regex: /(const|let)\s+(company)\s*=\s*await\s+Company\.findOne\([^)]+\)/g,
      varName: 'company',
      message: 'Company not found'
    },
    {
      regex: /(const|let)\s+(vendor)\s*=\s*await\s+Vendor\.findOne\([^)]+\)/g,
      varName: 'vendor',
      message: 'Vendor not found'
    },
    {
      regex: /(const|let)\s+(branch)\s*=\s*await\s+Branch\.findOne\([^)]+\)/g,
      varName: 'branch',
      message: 'Branch not found'
    },
    {
      regex: /(const|let)\s+(subcategory)\s*=\s*await\s+Subcategory\.findOne\([^)]+\)/g,
      varName: 'subcategory',
      message: 'Subcategory not found'
    },
    {
      regex: /(const|let)\s+(parentCategory|category)\s*=\s*await\s+Category\.findOne\([^)]+\)/g,
      varName: 'parentCategory|category',
      message: 'Category not found'
    },
    {
      regex: /(const|let)\s+(product)\s*=\s*await\s+Uniform\.findOne\([^)]+\)/g,
      varName: 'product',
      message: 'Product not found'
    },
    {
      regex: /(const|let)\s+(shipment)\s*=\s*await\s+Shipment\.findOne\([^)]+\)/g,
      varName: 'shipment',
      message: 'Shipment not found'
    },
    {
      regex: /(const|let)\s+(order)\s*=\s*await\s+Order\.findOne\([^)]+\)/g,
      varName: 'order',
      message: 'Order not found'
    },
    {
      regex: /(const|let)\s+(location)\s*=\s*await\s+Location\.findOne\([^)]+\)/g,
      varName: 'location',
      message: 'Location not found'
    },
    {
      regex: /(const|let)\s+(employee)\s*=\s*await\s+Employee\.findOne\([^)]+\)/g,
      varName: 'employee',
      message: 'Employee not found'
    },
  ]
  
  for (const { regex, varName: varPattern, message } of patterns) {
    const vars = varPattern.split('|')
    for (const varName of vars) {
      let match
      const matches = []
      
      while ((match = regex.exec(content)) !== null) {
        const actualVarName = match[2]
        if (actualVarName !== varName) continue
        
        const startPos = match.index
        const endPos = startPos + match[0].length
        const nextLineStart = content.indexOf('\n', endPos)
        
        if (nextLineStart === -1) continue
        
        // Check if null check exists
        const afterMatch = content.substring(endPos, Math.min(endPos + 200, content.length))
        if (afterMatch.includes(`if (!${actualVarName})`) || 
            afterMatch.includes(`if (${actualVarName} === null`)) {
          continue
        }
        
        // Check if variable is used
        const nextLines = content.substring(nextLineStart, Math.min(nextLineStart + 150, content.length))
        if (nextLines.includes(`${actualVarName}.`) || 
            nextLines.includes(`${actualVarName}[`) ||
            nextLines.includes(`${actualVarName}.id`) ||
            nextLines.includes(`${actualVarName}.name`)) {
          matches.push({ actualVarName, nextLineStart, message })
        }
      }
      
      // Process in reverse
      for (let i = matches.length - 1; i >= 0; i--) {
        const { actualVarName, nextLineStart, msg } = matches[i]
        
        const nullCheck = `\n    if (!${actualVarName}) {
      return NextResponse.json({ error: '${msg}' }, { status: 404 })
    }`
        
        content = content.substring(0, nextLineStart) + nullCheck + content.substring(nextLineStart)
        modified = true
        changes.push(`Added null check for ${actualVarName}`)
      }
    }
  }
  
  return { content, modified, changes }
}

function fixRoute(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8')
    const originalContent = content
    
    const result = addNullChecks(content)
    
    if (result.modified) {
      fs.writeFileSync(filePath, result.content, 'utf8')
      return { fixed: true, changes: result.changes, file: path.relative(API_DIR, filePath) }
    }
    
    return { fixed: false, changes: [], file: path.relative(API_DIR, filePath) }
  } catch (error) {
    return { fixed: false, error: error.message, file: path.relative(API_DIR, filePath) }
  }
}

async function main() {
  console.log('🔧 Adding All Missing Null Checks')
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
