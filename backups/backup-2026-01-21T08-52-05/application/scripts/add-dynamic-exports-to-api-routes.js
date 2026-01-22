/**
 * Script to add 'export const dynamic = "force-dynamic"' to all API route files
 * This ensures all API routes run in serverless mode on Vercel
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

function addDynamicExport(filePath) {
  let content = fs.readFileSync(filePath, 'utf8')

  // Skip if already has dynamic export
  if (content.includes('export const dynamic')) {
    console.log(`⏭️  Skipping ${filePath} - already has dynamic export`)
    return false
  }

  // Find the first import statement or export
  const lines = content.split('\n')
  let insertIndex = 0

  // Find where to insert (after imports, before first export)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('export')) {
      insertIndex = i
      break
    }
    if (i === lines.length - 1) {
      insertIndex = lines.length
    }
  }

  // Insert dynamic export
  lines.splice(insertIndex, 0, '', "// Force dynamic rendering for serverless functions", 'export const dynamic = \'force-dynamic\'')
  
  const newContent = lines.join('\n')
  fs.writeFileSync(filePath, newContent, 'utf8')
  console.log(`✅ Updated ${filePath}`)
  return true
}

// Main execution
console.log('🔍 Finding API route files...')
const routeFiles = findRouteFiles(apiDir)
console.log(`📁 Found ${routeFiles.length} route files\n`)

let updated = 0
for (const file of routeFiles) {
  if (addDynamicExport(file)) {
    updated++
  }
}

console.log(`\n✅ Updated ${updated} files`)
console.log(`⏭️  Skipped ${routeFiles.length - updated} files (already had dynamic export)`)

