/**
 * Add connectDB() calls to routes that need them
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

function addConnectDB(content, filePath) {
  let modified = false
  let changes = []
  
  // Check if connectDB is imported
  const hasConnectDBImport = content.includes('import') && (
    content.includes('connectDB') || 
    content.includes("from '@/lib/db/mongodb'")
  )
  
  // Check if connectDB is called
  const hasConnectDBCall = content.includes('await connectDB()') || content.includes('connectDB()')
  
  // If route uses mongoose models but doesn't call connectDB, add it
  const usesMongoose = content.includes('mongoose') || 
                       content.includes('Model.findOne') ||
                       content.includes('Model.find(') ||
                       content.includes('Model.create(') ||
                       content.includes('Model.update') ||
                       content.includes('Model.delete')
  
  if (usesMongoose && !hasConnectDBCall) {
    // Add import if missing
    if (!hasConnectDBImport) {
      // Find last import statement
      const importMatch = content.match(/(import[^;]+;[\s\n]*)+/g)
      if (importMatch) {
        const lastImport = importMatch[importMatch.length - 1]
        const lastImportEnd = content.indexOf(lastImport) + lastImport.length
        const connectDBImport = `import connectDB from '@/lib/db/mongodb'\n`
        content = content.substring(0, lastImportEnd) + connectDBImport + content.substring(lastImportEnd)
        changes.push('Added connectDB import')
        modified = true
      }
    }
    
    // Add connectDB call at start of each handler
    const handlerPattern = /export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH)\s*\([^)]*\)\s*\{/g
    let match
    const handlers = []
    
    while ((match = handlerPattern.exec(content)) !== null) {
      const method = match[1]
      const handlerStart = match.index + match[0].length
      
      // Check if connectDB is already called in this handler
      const handlerContent = content.substring(handlerStart, handlerStart + 500)
      if (handlerContent.includes('connectDB()')) {
        continue
      }
      
      handlers.push({ method, handlerStart })
    }
    
    // Process in reverse
    for (let i = handlers.length - 1; i >= 0; i--) {
      const { method, handlerStart } = handlers[i]
      
      // Find first non-whitespace line
      let firstLineEnd = handlerStart
      while (firstLineEnd < content.length && (content[firstLineEnd] === ' ' || content[firstLineEnd] === '\n' || content[firstLineEnd] === '\t')) {
        firstLineEnd++
      }
      
      const connectDBCall = `\n    await connectDB()\n`
      content = content.substring(0, firstLineEnd) + connectDBCall + content.substring(firstLineEnd)
      changes.push(`Added connectDB() to ${method} handler`)
      modified = true
    }
  }
  
  return { content, modified, changes }
}

function fixRoute(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8')
    const originalContent = content
    
    const result = addConnectDB(content, filePath)
    
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
  console.log('🔧 Adding connectDB() to Routes')
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
