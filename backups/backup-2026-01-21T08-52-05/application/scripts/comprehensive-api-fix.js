/**
 * Comprehensive API Route Fixer
 * Fixes all common error handling issues across all API routes
 */

const fs = require('fs')
const path = require('path')
const glob = require('glob')

const API_DIR = path.join(__dirname, '..', 'app', 'api')

// Find all route files
function findRouteFiles() {
  return glob.sync('**/route.ts', { cwd: API_DIR, absolute: true })
}

// Fix a route file comprehensively
function fixRouteFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8')
    const originalContent = content
    let changes = []
    
    // Fix 1: Add JSON parsing error handling for POST/PUT/PATCH
    const methods = ['POST', 'PUT', 'PATCH']
    methods.forEach(method => {
      const funcPattern = new RegExp(`export async function ${method}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\s*const\\s+body\\s*=\\s*await\\s+request\\.json\\(\\)`, 'm')
      if (funcPattern.test(content)) {
        // Check if it's already wrapped in try-catch
        const match = content.match(new RegExp(`export async function ${method}\\([^)]*\\)\\s*\\{([\\s\\S]{0,500})const\\s+body\\s*=\\s*await\\s+request\\.json\\(\\)`, 'm'))
        if (match) {
          const beforeJson = match[1]
          if (!beforeJson.includes('try {') && !beforeJson.includes('parseJsonBody')) {
            // Replace with safe parsing
            content = content.replace(
              new RegExp(`(export async function ${method}\\([^)]*\\)\\s*\\{[^\\n]*\\n[^\\n]*try\\s*\\{[^\\n]*\\n[^\\n]*)(const\\s+body\\s*=\\s*await\\s+request\\.json\\(\\))`, 'm'),
              `$1// Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({ 
        error: 'Invalid JSON in request body' 
      }, { status: 400 })
    }`
            )
            // Also handle case without try-catch
            content = content.replace(
              new RegExp(`(export async function ${method}\\([^)]*\\)\\s*\\{[^\\n]*\\n)(const\\s+body\\s*=\\s*await\\s+request\\.json\\(\\))`, 'm'),
              `$1// Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({ 
        error: 'Invalid JSON in request body' 
      }, { status: 400 })
    }`
            )
            changes.push(`Added JSON parsing error handling to ${method}`)
          }
        }
      }
    })
    
    // Fix 2: Improve error status codes in catch blocks
    // Replace 500 with 400 for validation errors
    const validationErrorPatterns = [
      /required/gi,
      /invalid/gi,
      /missing/gi,
      /not found/gi,
      /Unauthorized/gi,
      /authentication/gi
    ]
    
    content = content.replace(
      /return NextResponse\.json\(\s*\{\s*error:\s*error\.message[^}]*\},\s*\{\s*status:\s*500\s*\}\)/g,
      (match) => {
        const errorText = match.toLowerCase()
        if (validationErrorPatterns.some(pattern => pattern.test(errorText))) {
          if (errorText.includes('unauthorized') || errorText.includes('authentication')) {
            return match.replace('status: 500', 'status: 401')
          }
          return match.replace('status: 500', 'status: 400')
        }
        return match
      }
    )
    
    // Fix 3: Add error handling wrapper for catch blocks
    content = content.replace(
      /} catch \(error: any\) \{[\s\S]*?return NextResponse\.json\(\s*\{\s*error:\s*error\.message[^}]*\},\s*\{\s*status:\s*500\s*\}\)/g,
      (match) => {
        if (!match.includes('handleApiError') && !match.includes('error.message.includes')) {
          // Add improved error handling
          const improved = match.replace(
            /return NextResponse\.json\(\s*\{\s*error:\s*error\.message[^}]*\},\s*\{\s*status:\s*500\s*\}\)/,
            `// Return appropriate status code based on error type
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
          )
          return improved
        }
        return match
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
console.log('🔧 Comprehensive API Route Fixer')
console.log('='.repeat(80))
console.log('')

const routeFiles = findRouteFiles()
console.log(`Found ${routeFiles.length} route files`)
console.log('')

const results = []
let fixedCount = 0

for (const file of routeFiles) {
  const relativePath = path.relative(API_DIR, file)
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

const reportPath = path.join(__dirname, '..', 'comprehensive-api-fix-report.json')
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
console.log(`\n📄 Report saved to: ${reportPath}`)
