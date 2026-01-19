/**
 * Improve Error Handling in API Routes
 * Updates catch blocks to return 404 for not found errors instead of 500
 */

const fs = require('fs')
const path = require('path')
const glob = require('glob')

const API_DIR = path.join(__dirname, '..', 'app', 'api')

function findRouteFiles() {
  return glob.sync('**/route.ts', { cwd: API_DIR, absolute: true })
}

function improveErrorHandling(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8')
    const originalContent = content
    let changes = []
    
    // Pattern: catch blocks that return 500 but should check for "not found" first
    // Look for catch blocks that don't check for "not found" before returning 500
    
    // Pattern 1: Simple catch that returns 500 without checking for not found
    const simpleCatchPattern = /(catch\s*\([^)]*\)\s*\{[^}]*)(return\s+NextResponse\.json\([^}]*\{\s*status:\s*500\s*\}[^}]*\))/g
    
    if (simpleCatchPattern.test(content)) {
      content = content.replace(simpleCatchPattern, (match, catchStart, returnStatement) => {
        // Check if there's already a not found check
        const beforeMatch = content.substring(Math.max(0, content.indexOf(match) - 300), content.indexOf(match))
        if (beforeMatch.includes('not found') && beforeMatch.includes('404')) {
          return match // Already has not found check
        }
        
        // Add not found check before 500
        return `${catchStart}
    // Return 404 for not found errors
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    if (errorMessage.includes('not found') || errorMessage.includes('Not found') || errorMessage.includes('does not exist')) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }
    
    ${returnStatement}`
      })
      changes.push('Added not found check in catch block')
    }
    
    // Pattern 2: Catch blocks with errorMessage but no not found check
    const errorMessagePattern = /(const\s+errorMessage\s*=\s*error\?\.\w+\s*\|\|\s*[^;]+;?\s*)(return\s+NextResponse\.json\([^}]*\{\s*status:\s*500\s*\}[^}]*\))/g
    
    if (errorMessagePattern.test(content)) {
      content = content.replace(errorMessagePattern, (match, errorMessageLine, returnStatement) => {
        const beforeMatch = content.substring(Math.max(0, content.indexOf(match) - 200), content.indexOf(match))
        if (beforeMatch.includes('not found') && beforeMatch.includes('404')) {
          return match
        }
        
        return `${errorMessageLine}
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || errorMessage.includes('Not found') || errorMessage.includes('does not exist')) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }
    
    ${returnStatement}`
      })
      changes.push('Added not found check after errorMessage')
    }
    
    // Pattern 3: Catch blocks that return 500 without any error message extraction
    const basicCatchPattern = /(catch\s*\([^)]*error[^)]*\)\s*\{[^}]*console\.error[^}]*)(return\s+NextResponse\.json\([^}]*\{\s*status:\s*500\s*\}[^}]*\))/g
    
    if (basicCatchPattern.test(content)) {
      content = content.replace(basicCatchPattern, (match, catchStart, returnStatement) => {
        const beforeMatch = content.substring(Math.max(0, content.indexOf(match) - 300), content.indexOf(match))
        if (beforeMatch.includes('not found') && beforeMatch.includes('404')) {
          return match
        }
        
        return `${catchStart}
    // Return appropriate status code based on error type
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || errorMessage.includes('Not found') || errorMessage.includes('does not exist')) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }
    
    // Return 400 for validation errors
    if (errorMessage.includes('required') || errorMessage.includes('invalid') || errorMessage.includes('missing')) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }
    
    ${returnStatement}`
      })
      changes.push('Added comprehensive error handling')
    }
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8')
      return { fixed: true, changes }
    }
    
    return { fixed: false, changes: [] }
  } catch (error) {
    return { fixed: false, error: error.message }
  }
}

// Main execution
console.log('🔧 Improving Error Handling in API Routes')
console.log('='.repeat(80))
console.log('')

const routeFiles = findRouteFiles()
console.log(`Found ${routeFiles.length} route files`)
console.log('')

const results = []
let fixedCount = 0

for (const file of routeFiles) {
  const relativePath = path.relative(API_DIR, file).replace(/\\/g, '/')
  process.stdout.write(`\rProcessing ${relativePath.padEnd(60)}...`)
  const result = improveErrorHandling(file)
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

const reportPath = path.join(__dirname, '..', 'error-handling-fix-report.json')
fs.writeFileSync(reportPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  summary: {
    totalFiles: routeFiles.length,
    filesFixed: fixedCount
  },
  results: results.filter(r => r.fixed)
}, null, 2))

console.log(`\n📄 Report saved to: ${reportPath}`)
