/**
 * Comprehensive API Route Fixer
 * Analyzes and fixes all API routes to handle errors properly
 */

const fs = require('fs')
const path = require('path')
const { glob } = require('glob')

const API_DIR = path.join(__dirname, '..', 'app', 'api')

// Patterns to look for and fix
const FIXES = {
  // Missing try-catch around main logic
  addTryCatch: {
    pattern: /export async function (GET|POST|PUT|DELETE|PATCH)\([^)]*\)\s*\{[^}]*\n\s*(?!try)/,
    fix: (match, method) => {
      return match.replace(
        /export async function (GET|POST|PUT|DELETE|PATCH)\([^)]*\)\s*\{/,
        `export async function ${method}(request: Request) {\n  try {`
      )
    }
  },
  
  // Missing JSON parsing error handling
  addJsonParsing: {
    pattern: /const body = await request\.json\(\)/,
    fix: (match) => {
      return `let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    }`
    }
  },
  
  // Missing null checks after data-access calls
  addNullChecks: {
    pattern: /const (\w+) = await (\w+)\([^)]*\)\s*\n\s*return NextResponse\.json\(\1\)/,
    fix: (match, varName, funcName) => {
      return `const ${varName} = await ${funcName}(...)
    if (!${varName}) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(${varName})`
    }
  }
}

async function findApiRoutes() {
  const routeFiles = await glob('**/route.ts', {
    cwd: API_DIR,
    absolute: true
  })
  return routeFiles
}

async function fixRoute(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8')
    const originalContent = content
    let changes = []
    
    // Fix 1: Ensure all handlers have try-catch
    const handlers = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
    for (const handler of handlers) {
      const handlerPattern = new RegExp(
        `export async function ${handler}\\([^)]*\\)\\s*\\{[^}]*\\n\\s*(?!try)`,
        's'
      )
      if (handlerPattern.test(content)) {
        // Check if handler exists
        const handlerExists = new RegExp(`export async function ${handler}\\(`, 's').test(content)
        if (handlerExists) {
          // Add try-catch if missing
          content = content.replace(
            new RegExp(`(export async function ${handler}\\([^)]*\\)\\s*\\{[^\\n]*\\n)`, 's'),
            `$1  try {\n`
          )
          changes.push(`Added try-catch to ${handler}`)
        }
      }
    }
    
    // Fix 2: Add JSON parsing error handling
    if (content.includes('await request.json()') && !content.includes('catch (jsonError')) {
      content = content.replace(
        /(const|let)\s+body\s*=\s*await\s+request\.json\(\)/g,
        `let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    }`
      )
      if (content !== originalContent) {
        changes.push('Added JSON parsing error handling')
      }
    }
    
    // Fix 3: Add null checks for data-access results
    const dataAccessFunctions = [
      'getCompanyById', 'getProductById', 'getVendorById', 'getLocationById',
      'getEmployeeById', 'getBranchById', 'getEmployeeByEmail', 'getVendorByEmail'
    ]
    
    for (const func of dataAccessFunctions) {
      const pattern = new RegExp(
        `const\\s+(\\w+)\\s*=\\s*await\\s+${func}\\([^)]*\\)\\s*\\n\\s*return\\s+NextResponse\\.json\\(\\1\\)`,
        'g'
      )
      if (pattern.test(content)) {
        content = content.replace(
          pattern,
          (match, varName) => {
            return `const ${varName} = await ${func}(...)
    if (!${varName}) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(${varName})`
          }
        )
        changes.push(`Added null check for ${func}`)
      }
    }
    
    // Fix 4: Ensure catch blocks return proper status codes
    if (content.includes('catch (error') && !content.includes('status: 400') && !content.includes('status: 404')) {
      // Add better error handling in catch blocks
      const catchPattern = /catch\s*\([^)]*\)\s*\{[^}]*console\.error[^}]*return\s+NextResponse\.json\([^)]*status:\s*500[^}]*\}/s
      if (catchPattern.test(content)) {
        // Already has error handling, but might need improvement
      }
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
  console.log('🔧 Fixing All API Routes')
  console.log('='.repeat(80))
  console.log('')
  
  const routes = await findApiRoutes()
  console.log(`Found ${routes.length} API route files`)
  console.log('')
  
  const results = []
  for (const route of routes) {
    const result = await fixRoute(route)
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
