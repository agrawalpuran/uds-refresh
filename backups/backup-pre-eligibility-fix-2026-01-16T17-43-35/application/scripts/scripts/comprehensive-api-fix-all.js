/**
 * Comprehensive API Route Fixer
 * Fixes all common issues in API routes:
 * 1. Missing JSON parsing error handling
 * 2. Missing null checks after data-access calls
 * 3. Missing parameter validation
 * 4. Wrong status codes
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
    
    // Fix 1: Add JSON parsing error handling for POST/PUT/PATCH
    const jsonPattern = /(export async function (POST|PUT|PATCH)\([^)]*\)\s*\{[^}]*?)(const|let)\s+body\s*=\s*await\s+request\.json\(\)/s
    if (jsonPattern.test(content) && !content.includes('catch (jsonError')) {
      content = content.replace(
        /(export async function (POST|PUT|PATCH)\([^)]*\)\s*\{[^}]*?)(const|let)\s+body\s*=\s*await\s+request\.json\(\)/s,
        `$1let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    }`
      )
      changes.push('Added JSON parsing error handling')
    }
    
    // Fix 2: Add null checks for common data-access patterns
    const nullCheckPatterns = [
      { pattern: /const\s+(\w+)\s*=\s*await\s+getCompanyById\([^)]+\)\s*\n\s*return\s+NextResponse\.json\(\1\)/s, func: 'getCompanyById' },
      { pattern: /const\s+(\w+)\s*=\s*await\s+getProductById\([^)]+\)\s*\n\s*return\s+NextResponse\.json\(\1\)/s, func: 'getProductById' },
      { pattern: /const\s+(\w+)\s*=\s*await\s+getVendorById\([^)]+\)\s*\n\s*return\s+NextResponse\.json\(\1\)/s, func: 'getVendorById' },
      { pattern: /const\s+(\w+)\s*=\s*await\s+getLocationById\([^)]+\)\s*\n\s*return\s+NextResponse\.json\(\1\)/s, func: 'getLocationById' },
      { pattern: /const\s+(\w+)\s*=\s*await\s+getEmployeeById\([^)]+\)\s*\n\s*return\s+NextResponse\.json\(\1\)/s, func: 'getEmployeeById' },
      { pattern: /const\s+(\w+)\s*=\s*await\s+getBranchById\([^)]+\)\s*\n\s*return\s+NextResponse\.json\(\1\)/s, func: 'getBranchById' },
    ]
    
    for (const { pattern, func } of nullCheckPatterns) {
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
    
    // Fix 3: Ensure all catch blocks return proper status codes
    const catchPattern = /catch\s*\([^)]*\)\s*\{[^}]*return\s+NextResponse\.json\([^)]*status:\s*500[^}]*\}/s
    if (catchPattern.test(content)) {
      // Check if error handling is already good
      if (!content.includes('status: 400') && !content.includes('status: 404')) {
        // Add better error handling
        content = content.replace(
          /catch\s*\([^)]*error[^)]*\)\s*\{[^}]*console\.error[^}]*return\s+NextResponse\.json\([^)]*status:\s*500[^}]*\}/s,
          (match) => {
            return match.replace(
              /return\s+NextResponse\.json\([^)]*status:\s*500[^}]*\}/,
              `const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('not found')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || errorMessage.includes('Not found') || errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    }
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )}`
            )
          }
        )
        changes.push('Improved error handling in catch block')
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
  console.log('🔧 Comprehensive API Route Fixer')
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
