/**
 * Script to fix Next.js 15+ params Promise issue in route handlers
 * Updates all route handlers to await params
 */

const fs = require('fs')
const path = require('path')

const apiDir = path.join(__dirname, '..', 'app', 'api')

function findRouteFiles(dir) {
  const files = []
  const items = fs.readdirSync(dir, { withFileTypes: true })

  for (const item of items) {
    const fullPath = path.join(dir, item.name)
    if (item.isDirectory()) {
      files.push(...findRouteFiles(fullPath))
    } else if (item.isFile() && item.name === 'route.ts') {
      files.push(fullPath)
    }
  }

  return files
}

function fixParamsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8')
  let modified = false

  // Pattern 1: { params }: { params: { ... } } - needs to become Promise<{ ... }>
  const pattern1 = /\{\s*params\s*\}\s*:\s*\{\s*params:\s*\{([^}]+)\}\s*\}/g
  const matches1 = [...content.matchAll(pattern1)]
  
  if (matches1.length > 0) {
    // Replace params type with Promise
    content = content.replace(
      /\{\s*params\s*\}\s*:\s*\{\s*params:\s*\{([^}]+)\}\s*\}/g,
      '{ params }: { params: Promise<{ $1 }> }'
    )
    
    // Find and replace direct params destructuring with await
    // Pattern: const { ... } = params (not already awaited)
    const paramsDestructurePattern = /const\s+(\{[^}]+\})\s*=\s*params\s*(?!\s*instanceof)/g
    if (paramsDestructurePattern.test(content)) {
      content = content.replace(
        /const\s+(\{[^}]+\})\s*=\s*params\s*(?!\s*instanceof)/g,
        'const $1 = await params'
      )
      modified = true
    }
    
    // Also handle: const id = params.id
    const paramsPropertyPattern = /const\s+(\w+)\s*=\s*params\.(\w+)/g
    if (paramsPropertyPattern.test(content) && !content.includes('await params')) {
      // Need to await params first, then access property
      const lines = content.split('\n')
      const newLines = []
      let lastParamsAwait = -1
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.match(/const\s+(\w+)\s*=\s*params\.(\w+)/)) {
          if (lastParamsAwait === -1 || i - lastParamsAwait > 5) {
            // Insert await params line before this line
            newLines.push('    const resolvedParams = await params')
            lastParamsAwait = i
          }
          newLines.push(line.replace(/params\.(\w+)/, 'resolvedParams.$1'))
        } else {
          newLines.push(line)
        }
      }
      content = newLines.join('\n')
      modified = true
    }
    
    modified = true
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8')
    console.log(`✅ Fixed ${filePath}`)
    return true
  }
  
  return false
}

// Main execution
console.log('🔍 Finding route files with params...')
const routeFiles = findRouteFiles(apiDir)
console.log(`📁 Found ${routeFiles.length} route files\n`)

let fixed = 0
for (const file of routeFiles) {
  if (fixParamsInFile(file)) {
    fixed++
  }
}

console.log(`\n✅ Fixed ${fixed} files`)

