/**
 * Direct API Route Fixer
 * Directly fixes common patterns in route files
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
    
    // Skip files we already fixed manually
    const skipFiles = [
      'locations/admin/route.ts',
      'locations/route.ts',
      'orders/route.ts',
      'products/route.ts',
      'vendors/route.ts',
      'subcategories/route.ts',
      'product-subcategory-mappings/route.ts'
    ]
    
    const relativePath = path.relative(API_DIR, filePath).replace(/\\/g, '/')
    if (skipFiles.some(skip => relativePath.includes(skip))) {
      return { fixed: false, changes: [], skipped: true }
    }
    
    // Fix 1: Add JSON parsing error handling
    // Pattern: const body = await request.json() (not in try-catch for JSON parsing)
    const jsonPattern = /(\s+)(const\s+body\s*=\s*await\s+request\.json\(\))/g
    if (jsonPattern.test(content)) {
      // Check each occurrence
      const lines = content.split('\n')
      let newLines = []
      let i = 0
      
      while (i < lines.length) {
        const line = lines[i]
        
        // Check if this line has request.json()
        if (line.includes('const') && line.includes('body') && line.includes('await request.json()')) {
          // Check if previous lines have try-catch for JSON parsing
          let hasJsonTryCatch = false
          for (let j = Math.max(0, i - 5); j < i; j++) {
            if (lines[j].includes('Invalid JSON in request body')) {
              hasJsonTryCatch = true
              break
            }
          }
          
          if (!hasJsonTryCatch) {
            // Check if we're already in a try block
            let inTryBlock = false
            let tryDepth = 0
            for (let j = Math.max(0, i - 20); j < i; j++) {
              if (lines[j].includes('try {')) {
                inTryBlock = true
                tryDepth++
              }
              if (lines[j].includes('} catch')) {
                tryDepth--
                if (tryDepth === 0) inTryBlock = false
              }
            }
            
            if (inTryBlock) {
              // We're in a try block, add nested try-catch for JSON parsing
              const indent = line.match(/^(\s*)/)[1]
              newLines.push(`${indent}// Parse JSON body with error handling`)
              newLines.push(`${indent}let body: any`)
              newLines.push(`${indent}try {`)
              newLines.push(`${indent}  body = await request.json()`)
              newLines.push(`${indent}} catch (jsonError: any) {`)
              newLines.push(`${indent}  return NextResponse.json({`)
              newLines.push(`${indent}    error: 'Invalid JSON in request body'`)
              newLines.push(`${indent}  }, { status: 400 })`)
              newLines.push(`${indent}}`)
              changes.push('Added JSON parsing error handling')
              i++
              continue
            }
          }
        }
        
        newLines.push(line)
        i++
      }
      
      if (newLines.length !== lines.length) {
        content = newLines.join('\n')
      }
    }
    
    // Fix 2: Improve error status codes
    // Replace status: 500 with appropriate codes based on error message
    const errorHandlingPattern = /(} catch \(error: any\) \{[\s\S]*?)(return NextResponse\.json\(\s*\{\s*error:\s*error\.message[^}]*\},\s*\{\s*status:\s*500\s*\}\))/g
    
    content = content.replace(errorHandlingPattern, (match, before, returnStmt) => {
      // Check if already has improved error handling
      if (before.includes('errorMessage.includes') || before.includes('handleApiError')) {
        return match
      }
      
      // Add improved error handling
      return before + `
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
    })
    
    // Fix 3: Replace simple status: 500 with improved handling
    content = content.replace(
      /return NextResponse\.json\(\s*\{\s*error:\s*error\.message[^}]*\},\s*\{\s*status:\s*500\s*\}\)/g,
      (match) => {
        // Only replace if not already in improved error handling block
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
      return { fixed: true, changes }
    }
    
    return { fixed: false, changes: [] }
  } catch (error) {
    return { fixed: false, error: error.message }
  }
}

// Main execution
console.log('🔧 Direct API Route Fixer')
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

// Save report
const report = {
  timestamp: new Date().toISOString(),
  summary: {
    totalFiles: routeFiles.length,
    filesFixed: fixedCount,
    filesUnchanged: routeFiles.length - fixedCount,
    filesWithErrors: results.filter(r => r.error).length
  },
  results: results.filter(r => r.fixed || r.error)
}

const reportPath = path.join(__dirname, '..', 'direct-api-fix-report.json')
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
console.log(`\n📄 Report saved to: ${reportPath}`)
