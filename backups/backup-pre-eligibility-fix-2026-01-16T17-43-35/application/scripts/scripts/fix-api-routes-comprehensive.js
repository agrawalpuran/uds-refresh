/**
 * Comprehensive API Route Fixer - Phase 2
 * Fixes common patterns:
 * 1. Unprotected request.json() calls
 * 2. Missing null checks after data-access calls
 * 3. Missing parameter validation
 * 4. Routes that should return 400/404 but return 500
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
    
    // Fix 1: Replace unprotected request.json() calls
    const unprotectedJsonPatterns = [
      /(const|let)\s+body\s*=\s*await\s+request\.json\(\)/g,
      /(const|let)\s+(\w+)\s*=\s*await\s+request\.json\(\)/g,
    ]
    
    for (const pattern of unprotectedJsonPatterns) {
      if (pattern.test(content) && !content.includes('catch (jsonError')) {
        // Check if it's already in a try-catch
        const matches = content.match(new RegExp(pattern.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))
        if (matches) {
          for (const match of matches) {
            const beforeMatch = content.substring(0, content.indexOf(match))
            const afterMatch = content.substring(content.indexOf(match) + match.length)
            
            // Check if there's already a try-catch for JSON parsing
            const hasJsonErrorHandling = beforeMatch.includes('catch (jsonError') || 
                                        beforeMatch.includes('catch(jsonError')
            
            if (!hasJsonErrorHandling) {
              // Find the variable name
              const varMatch = match.match(/(const|let)\s+(\w+)\s*=/)
              if (varMatch) {
                const varName = varMatch[2]
                const replacement = `let ${varName}: any
    try {
      ${varName} = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    }`
                
                content = content.replace(match, replacement)
                changes.push(`Added JSON parsing error handling for ${varName}`)
              }
            }
          }
        }
      }
    }
    
    // Fix 2: Add null checks for data-access results that are returned directly
    const nullCheckPatterns = [
      {
        pattern: /const\s+(\w+)\s*=\s*await\s+getCompanyById\([^)]+\)\s*\n\s*return\s+NextResponse\.json\(\1\)/s,
        func: 'getCompanyById',
        message: 'Company not found'
      },
      {
        pattern: /const\s+(\w+)\s*=\s*await\s+getProductById\([^)]+\)\s*\n\s*return\s+NextResponse\.json\(\1\)/s,
        func: 'getProductById',
        message: 'Product not found'
      },
      {
        pattern: /const\s+(\w+)\s*=\s*await\s+getVendorById\([^)]+\)\s*\n\s*return\s+NextResponse\.json\(\1\)/s,
        func: 'getVendorById',
        message: 'Vendor not found'
      },
      {
        pattern: /const\s+(\w+)\s*=\s*await\s+getLocationById\([^)]+\)\s*\n\s*return\s+NextResponse\.json\(\1\)/s,
        func: 'getLocationById',
        message: 'Location not found'
      },
      {
        pattern: /const\s+(\w+)\s*=\s*await\s+getEmployeeById\([^)]+\)\s*\n\s*return\s+NextResponse\.json\(\1\)/s,
        func: 'getEmployeeById',
        message: 'Employee not found'
      },
      {
        pattern: /const\s+(\w+)\s*=\s*await\s+getBranchById\([^)]+\)\s*\n\s*return\s+NextResponse\.json\(\1\)/s,
        func: 'getBranchById',
        message: 'Branch not found'
      },
      {
        pattern: /const\s+(\w+)\s*=\s*await\s+getEmployeeByEmail\([^)]+\)\s*\n\s*return\s+NextResponse\.json\(\1\)/s,
        func: 'getEmployeeByEmail',
        message: 'Employee not found'
      },
      {
        pattern: /const\s+(\w+)\s*=\s*await\s+getVendorByEmail\([^)]+\)\s*\n\s*return\s+NextResponse\.json\(\1\)/s,
        func: 'getVendorByEmail',
        message: 'Vendor not found'
      },
    ]
    
    for (const { pattern, func, message } of nullCheckPatterns) {
      if (pattern.test(content)) {
        content = content.replace(
          pattern,
          (match, varName) => {
            // Check if null check already exists
            if (match.includes('if (!' + varName + ')')) {
              return match
            }
            return match.replace(
              /return\s+NextResponse\.json\(\1\)/,
              `if (!${varName}) {
      return NextResponse.json({ error: '${message}' }, { status: 404 })
    }
    return NextResponse.json(${varName})`
            )
          }
        )
        changes.push(`Added null check for ${func}`)
      }
    }
    
    // Fix 3: Improve catch blocks to return appropriate status codes
    const catchBlockPattern = /catch\s*\([^)]*error[^)]*\)\s*\{[^}]*console\.error[^}]*return\s+NextResponse\.json\([^)]*status:\s*500[^}]*\}/s
    
    if (catchBlockPattern.test(content)) {
      // Check if it already has good error handling
      const hasGoodErrorHandling = content.includes('status: 400') || 
                                   content.includes('status: 404') ||
                                   content.includes('errorMessage.includes')
      
      if (!hasGoodErrorHandling) {
        // Replace simple 500 returns with better error handling
        content = content.replace(
          /catch\s*\([^)]*error[^)]*\)\s*\{[^}]*console\.error[^}]*return\s+NextResponse\.json\([^)]*status:\s*500[^}]*\}/s,
          (match) => {
            // Don't replace if it already has good error handling
            if (match.includes('errorMessage.includes') || match.includes('status: 400')) {
              return match
            }
            
            return match.replace(
              /return\s+NextResponse\.json\([^)]*status:\s*500[^}]*\}/,
              `const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || 
        errorMessage.includes('Not found') || 
        errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    }
    
    // Return 401 for authentication errors
    if (errorMessage.includes('Unauthorized') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('token')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
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
  console.log('🔧 Comprehensive API Route Fixer - Phase 2')
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
