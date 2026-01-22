/**
 * Fix All Simple Catch Blocks
 * Replaces all catch blocks that only return 500 with better error handling
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
    
    // Pattern: catch block that returns 500 without checking error type
    // Look for: catch(...) { ... return NextResponse.json(..., { status: 500 }) }
    const simple500Pattern = /catch\s*\([^)]*error[^)]*\)\s*\{[^}]*return\s+NextResponse\.json\([^)]*status:\s*500[^}]*\}/gs
    
    const matches = content.match(simple500Pattern)
    if (matches) {
      for (const match of matches) {
        // Check if it already has good error handling
        if (match.includes('errorMessage.includes') || 
            match.includes('status: 400') || 
            match.includes('status: 404') ||
            match.includes('status: 401')) {
          continue // Skip if already has good error handling
        }
        
        // Extract console.error line if it exists
        const consoleErrorMatch = match.match(/console\.error\([^)]*\)/)
        const consoleError = consoleErrorMatch ? consoleErrorMatch[0] : 'console.error(\'API Error:\', error)'
        
        // Extract error message extraction if it exists
        let errorMessageExtraction = ''
        if (match.includes('error.message')) {
          const errorMsgMatch = match.match(/error\.message[^}]*/)
          if (errorMsgMatch) {
            errorMessageExtraction = errorMsgMatch[0]
          }
        }
        
        // Build replacement
        const replacement = match.replace(
          /return\s+NextResponse\.json\([^)]*status:\s*500[^}]*\}/,
          `${consoleError}
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
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
        
        content = content.replace(match, replacement)
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
  console.log('🔧 Fixing All Simple Catch Blocks')
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
