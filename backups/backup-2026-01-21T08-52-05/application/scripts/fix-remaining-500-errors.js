/**
 * Fix Remaining 500 Errors
 * Fixes remaining status: 500 errors that should be 400/401
 */

const fs = require('fs')
const path = require('path')
const glob = require('glob')

const API_DIR = path.join(__dirname, '..', 'app', 'api')

function findRouteFiles() {
  return glob.sync('**/route.ts', { cwd: API_DIR, absolute: true })
}

function fixRouteFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8')
    const originalContent = content
    
    // Find all catch blocks with status: 500
    const catchPattern = /} catch \(error: any\) \{[\s\S]*?return NextResponse\.json\([^}]*status:\s*500[^}]*\)/g
    
    content = content.replace(catchPattern, (match) => {
      // Check if already has improved error handling
      if (match.includes('errorMessage.includes') || match.includes('handleApiError')) {
        return match
      }
      
      // Extract the catch block content
      const catchContent = match.match(/\} catch \(error: any\) \{([\s\S]*)/)[1]
      
      // Check if it's a simple return statement
      if (catchContent.includes('return NextResponse.json') && catchContent.includes('status: 500')) {
        // Replace with improved error handling
        return `} catch (error: any) {
    console.error('API Error:', error)
    
    // Return appropriate status code based on error type
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
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
    )`
      }
      
      return match
    })
    
    // Also fix simple status: 500 patterns
    content = content.replace(
      /return NextResponse\.json\(\s*\{\s*error:\s*error\.message[^}]*\},\s*\{\s*status:\s*500\s*\}\)/g,
      (match) => {
        const context = content.substring(Math.max(0, content.indexOf(match) - 200), content.indexOf(match))
        if (context.includes('errorMessage.includes') || context.includes('handleApiError')) {
          return match
        }
        
        return `// Return appropriate status code based on error type
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
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
    )`
      }
    )
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8')
      return { fixed: true }
    }
    
    return { fixed: false }
  } catch (error) {
    return { fixed: false, error: error.message }
  }
}

// Main execution
console.log('🔧 Fixing Remaining 500 Errors')
console.log('='.repeat(80))
console.log('')

const routeFiles = findRouteFiles()
console.log(`Found ${routeFiles.length} route files`)
console.log('')

const results = []
let fixedCount = 0

for (const file of routeFiles) {
  const relativePath = path.relative(API_DIR, file).replace(/\\/g, '/')
  process.stdout.write(`\rFixing ${relativePath.padEnd(60)}...`)
  const result = fixRouteFile(file)
  results.push({ file: relativePath, ...result })
  if (result.fixed) fixedCount++
}

console.log('\n')
console.log('='.repeat(80))
console.log('📊 FIX SUMMARY')
console.log('='.repeat(80))
console.log(`Total files: ${routeFiles.length}`)
console.log(`Files fixed: ${fixedCount}`)
console.log(`Files unchanged: ${routeFiles.length - fixedCount}`)
console.log(`Files with errors: ${results.filter(r => r.error).length}`)
