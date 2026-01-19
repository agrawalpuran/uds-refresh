/**
 * Comprehensive Route Fix
 * Adds null checks, connection error handling, and proper status codes
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
    let changes = []
    
    // Fix 1: Improve connection error detection in catch blocks
    // Add comprehensive connection error checks
    content = content.replace(
      /(const errorMessage = error\?\.message \|\| error\?\.toString\(\) \|\| 'Internal server error')/g,
      (match) => {
        const context = content.substring(Math.max(0, content.indexOf(match) - 200), content.indexOf(match) + 300)
        if (context.includes('isConnectionError') && context.includes('ECONNREFUSED')) {
          return match // Already has comprehensive check
        }
        
        // Add comprehensive connection error detection
        return `${match}
    const isConnectionError = errorMessage.includes('Mongo') || 
                              errorMessage.includes('connection') || 
                              errorMessage.includes('ECONNREFUSED') ||
                              errorMessage.includes('timeout') ||
                              errorMessage.includes('network') ||
                              error?.code === 'ECONNREFUSED' ||
                              error?.code === 'ETIMEDOUT' ||
                              error?.name === 'MongoNetworkError' ||
                              error?.name === 'MongoServerSelectionError'`
      }
    )
    
    // Fix 2: Add 503 status for connection errors
    content = content.replace(
      /(return NextResponse\.json\([^}]*\{\s*status:\s*500\s*\}\)[^}]*)/g,
      (match) => {
        const beforeMatch = content.substring(Math.max(0, content.indexOf(match) - 500), content.indexOf(match))
        if (beforeMatch.includes('isConnectionError') && beforeMatch.includes('503')) {
          return match // Already handles connection errors
        }
        if (beforeMatch.includes('isConnectionError')) {
          // Replace with conditional status
          return match.replace(
            /status:\s*500/g,
            'status: isConnectionError ? 503 : 500'
          )
        }
        return match
      }
    )
    
    // Fix 3: Add null checks for common patterns
    // Pattern: const result = await Model.findOne(); return NextResponse.json(result)
    // Should be: const result = await Model.findOne(); if (!result) return 404; return NextResponse.json(result)
    
    // This is complex, so we'll do it for specific common patterns
    const nullCheckPatterns = [
      {
        // Pattern: const X = await getXById(id); return NextResponse.json(X)
        pattern: /(const\s+(\w+)\s*=\s*await\s+get\w+ById\([^)]+\)\s*;?\s*)(return\s+NextResponse\.json\(\s*\2\s*\))/g,
        replacement: (match, before, varName, after) => {
          return `${before}if (!${varName}) {
      return NextResponse.json({ error: '${varName.charAt(0).toUpperCase() + varName.slice(1)} not found' }, { status: 404 })
    }
    ${after}`
        }
      }
    ]
    
    // Apply null check patterns
    for (const { pattern, replacement } of nullCheckPatterns) {
      if (pattern.test(content)) {
        content = content.replace(pattern, replacement)
        changes.push('Added null checks')
      }
    }
    
    // Fix 4: Improve error status code detection
    // Make sure "not found" errors return 404, not 500
    content = content.replace(
      /(return NextResponse\.json\(\s*\{\s*error:\s*errorMessage[^}]*\},\s*\{\s*status:\s*500\s*\}\))/g,
      (match) => {
        const beforeMatch = content.substring(Math.max(0, content.indexOf(match) - 300), content.indexOf(match))
        
        // Check if error handling already checks for "not found"
        if (beforeMatch.includes('not found') && beforeMatch.includes('404')) {
          return match // Already handles not found
        }
        
        // Add not found check before status 500
        return match.replace(
          /(return NextResponse\.json\(\s*\{\s*error:\s*errorMessage[^}]*\},\s*\{\s*status:\s*)500(\s*\}\))/,
          `// Return 404 for not found errors
    if (errorMessage.includes('not found') || errorMessage.includes('Not found') || errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    }
    
    $1500$2`
        )
      }
    )
    
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
console.log('🔧 Comprehensive Route Fix')
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

const reportPath = path.join(__dirname, '..', 'comprehensive-route-fix-report.json')
fs.writeFileSync(reportPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  summary: {
    totalFiles: routeFiles.length,
    filesFixed: fixedCount
  },
  results: results.filter(r => r.fixed)
}, null, 2))

console.log(`\n📄 Report saved to: ${reportPath}`)
