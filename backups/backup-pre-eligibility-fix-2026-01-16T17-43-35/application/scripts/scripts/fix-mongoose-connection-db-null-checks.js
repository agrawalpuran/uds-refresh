/**
 * Script to add null checks for mongoose.connection.db
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

function fixMongooseDbAccess(filePath) {
  let content = fs.readFileSync(filePath, 'utf8')
  let modified = false

  // Pattern: mongoose.connection.db.collection(...)
  const pattern = /mongoose\.connection\.db\.collection\(/g
  const matches = [...content.matchAll(pattern)]

  if (matches.length > 0) {
    // Check if there's already a null check before the first usage
    const firstMatch = matches[0]
    const beforeMatch = content.substring(0, firstMatch.index)
    
    // Check if there's already a null check
    if (!beforeMatch.includes('mongoose.connection.db')) {
      // Find the line before the first mongoose.connection.db usage
      const lines = content.split('\n')
      let insertIndex = -1
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('mongoose.connection.db.collection(')) {
          insertIndex = i
          break
        }
      }
      
      if (insertIndex > 0) {
        // Find the function start to add the check after await connectDB()
        let connectDBIndex = -1
        for (let i = insertIndex; i >= 0; i--) {
          if (lines[i].includes('await connectDB()') || lines[i].includes('connectDB()')) {
            connectDBIndex = i
            break
          }
        }
        
        if (connectDBIndex >= 0) {
          // Insert null check after connectDB()
          const checkCode = `\n    if (!mongoose.connection.db) {\n      return NextResponse.json(\n        { error: 'Database connection not available' },\n        { status: 500 }\n      )\n    }`
          lines.splice(connectDBIndex + 1, 0, checkCode)
          content = lines.join('\n')
          modified = true
        }
      }
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8')
    console.log(`✅ Fixed ${filePath}`)
    return true
  }
  
  return false
}

// Main execution
console.log('🔍 Finding route files with mongoose.connection.db...')
const routeFiles = findRouteFiles(apiDir)
console.log(`📁 Found ${routeFiles.length} route files\n`)

let fixed = 0
for (const file of routeFiles) {
  if (fixMongooseDbAccess(file)) {
    fixed++
  }
}

console.log(`\n✅ Fixed ${fixed} files`)

