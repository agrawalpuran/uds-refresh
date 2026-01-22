/**
 * Wrap Routes in Error Boundary
 * Adds top-level error handling to catch initialization errors
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

function wrapRouteHandler(content) {
  let modified = false
  let changes = []
  
  // Pattern: export async function GET|POST|PUT|DELETE|PATCH(request: Request)
  const handlerPattern = /export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH)\s*\([^)]*\)\s*\{/g
  
  let match
  const handlers = []
  while ((match = handlerPattern.exec(content)) !== null) {
    const method = match[1]
    const startPos = match.index
    const handlerStart = startPos + match[0].length
    
    // Find the matching closing brace
    let braceCount = 1
    let pos = handlerStart
    let handlerEnd = -1
    
    while (pos < content.length && braceCount > 0) {
      if (content[pos] === '{') braceCount++
      if (content[pos] === '}') braceCount--
      if (braceCount === 0) {
        handlerEnd = pos
        break
      }
      pos++
    }
    
    if (handlerEnd === -1) continue
    
    // Check if already wrapped in try-catch
    const handlerContent = content.substring(handlerStart, handlerEnd)
    if (handlerContent.trim().startsWith('try')) {
      continue // Already has try-catch
    }
    
    handlers.push({ method, startPos, handlerStart, handlerEnd })
  }
  
  // Process in reverse order
  for (let i = handlers.length - 1; i >= 0; i--) {
    const { method, handlerStart, handlerEnd } = handlers[i]
    
    // Extract handler body
    const handlerBody = content.substring(handlerStart, handlerEnd)
    
    // Wrap in try-catch
    const wrappedHandler = `\n  try {
${handlerBody}
  } catch (error: any) {
    console.error(\`[API] Error in ${method} handler:\`, error)
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
    )
  }`
    
    content = content.substring(0, handlerStart) + wrappedHandler + content.substring(handlerEnd)
    modified = true
    changes.push(`Wrapped ${method} handler in error boundary`)
  }
  
  return { content, modified, changes }
}

function fixRoute(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8')
    const originalContent = content
    
    // Check if already has try-catch at top level
    if (content.includes('export async function') && content.includes('try {')) {
      // Check if all handlers have try-catch
      const handlers = content.match(/export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH)/g) || []
      const tryBlocks = (content.match(/try\s*\{/g) || []).length
      
      // If number of handlers matches try blocks, assume already wrapped
      if (handlers.length === tryBlocks) {
        return { fixed: false, changes: [], file: path.relative(API_DIR, filePath) }
      }
    }
    
    const result = wrapRouteHandler(content)
    
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
  console.log('🔧 Wrapping Routes in Error Boundaries')
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
