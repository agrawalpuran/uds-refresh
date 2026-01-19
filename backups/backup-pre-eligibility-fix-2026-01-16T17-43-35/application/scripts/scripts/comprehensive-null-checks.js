/**
 * Comprehensive Null Checks for API Routes
 * Adds null checks for all findOne/findById patterns
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
  
  // Pattern 1: const var = await Model.findOne({ id: ... })
  const findOnePattern = /(const|let)\s+(\w+)\s*=\s*await\s+(\w+)\.findOne\(\s*\{\s*id:\s*[^}]+\s*\}\s*\)/g
  
  let match
  const matches = []
  while ((match = findOnePattern.exec(content)) !== null) {
    matches.push({
      fullMatch: match[0],
      varName: match[2],
      modelName: match[3],
      index: match.index
    })
  }
  
  // Process matches in reverse order to maintain indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const { fullMatch, varName, modelName, index } = matches[i]
    
    // Skip common non-model names
    if (['mongoose', 'db', 'connection', 'request', 'response', 'NextResponse'].includes(modelName)) {
      continue
    }
    
    // Find the end of the assignment
    const endPos = index + fullMatch.length
    const nextLineStart = content.indexOf('\n', endPos)
    if (nextLineStart === -1) continue
    
    // Check if null check already exists
    const afterMatch = content.substring(endPos, Math.min(endPos + 300, content.length))
    if (afterMatch.includes(`if (!${varName})`) || 
        afterMatch.includes(`if (${varName} === null`) ||
        afterMatch.includes(`if (${varName} == null`) ||
        afterMatch.includes(`if (!${varName})`)) {
      continue
    }
    
    // Check if it's inside a try-catch that already handles it
    const beforeMatch = content.substring(Math.max(0, index - 200), index)
    if (beforeMatch.includes('try {') && afterMatch.includes('catch')) {
      // Check if catch handles null
      const catchMatch = afterMatch.match(/catch[^}]*\{[^}]*\}/s)
      if (catchMatch && catchMatch[0].includes('404')) {
        continue
      }
    }
    
    // Insert null check
    const nullCheck = `\n    if (!${varName}) {
      return NextResponse.json({ error: '${modelName} not found' }, { status: 404 })
    }`
    
    content = content.substring(0, nextLineStart) + nullCheck + content.substring(nextLineStart)
    modified = true
    changes.push(`Added null check for ${varName} (${modelName}.findOne)`)
  }
  
  // Pattern 2: const var = await getXxxById(...)
  const getByIdPatterns = [
    { pattern: /(const|let)\s+(\w+)\s*=\s*await\s+getCompanyById\([^)]+\)/g, message: 'Company not found' },
    { pattern: /(const|let)\s+(\w+)\s*=\s*await\s+getProductById\([^)]+\)/g, message: 'Product not found' },
    { pattern: /(const|let)\s+(\w+)\s*=\s*await\s+getVendorById\([^)]+\)/g, message: 'Vendor not found' },
    { pattern: /(const|let)\s+(\w+)\s*=\s*await\s+getLocationById\([^)]+\)/g, message: 'Location not found' },
    { pattern: /(const|let)\s+(\w+)\s*=\s*await\s+getEmployeeById\([^)]+\)/g, message: 'Employee not found' },
    { pattern: /(const|let)\s+(\w+)\s*=\s*await\s+getBranchById\([^)]+\)/g, message: 'Branch not found' },
    { pattern: /(const|let)\s+(\w+)\s*=\s*await\s+getEmployeeByEmail\([^)]+\)/g, message: 'Employee not found' },
    { pattern: /(const|let)\s+(\w+)\s*=\s*await\s+getVendorByEmail\([^)]+\)/g, message: 'Vendor not found' },
    { pattern: /(const|let)\s+(\w+)\s*=\s*await\s+getCompanyByAdminEmail\([^)]+\)/g, message: 'Company not found' },
    { pattern: /(const|let)\s+(\w+)\s*=\s*await\s+getLocationByAdminEmail\([^)]+\)/g, message: 'Location not found' },
    { pattern: /(const|let)\s+(\w+)\s*=\s*await\s+getBranchByAdminEmail\([^)]+\)/g, message: 'Branch not found' },
  ]
  
  for (const { pattern, message } of getByIdPatterns) {
    const matches = []
    let match
    while ((match = pattern.exec(content)) !== null) {
      matches.push({
        varName: match[2],
        index: match.index,
        endPos: match.index + match[0].length
      })
    }
    
    // Process in reverse
    for (let i = matches.length - 1; i >= 0; i--) {
      const { varName, index, endPos } = matches[i]
      
      const nextLineStart = content.indexOf('\n', endPos)
      if (nextLineStart === -1) continue
      
      const afterMatch = content.substring(endPos, Math.min(endPos + 300, content.length))
      if (afterMatch.includes(`if (!${varName})`) || 
          afterMatch.includes(`if (${varName} === null`)) {
        continue
      }
      
      const nullCheck = `\n    if (!${varName}) {
      return NextResponse.json({ error: '${message}' }, { status: 404 })
    }`
      
      content = content.substring(0, nextLineStart) + nullCheck + content.substring(nextLineStart)
      modified = true
      changes.push(`Added null check for ${varName}`)
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
  console.log('🔧 Comprehensive Null Checks for API Routes')
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
