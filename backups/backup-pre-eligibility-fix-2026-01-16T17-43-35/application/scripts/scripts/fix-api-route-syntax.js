/**
 * Fix extra closing parentheses in API routes
 */

const fs = require('fs')
const path = require('path')
const glob = require('glob')

console.log('🔧 Fixing API route syntax errors...')

const apiFiles = glob.sync('app/api/**/*.ts', { cwd: path.join(__dirname, '..') })
let totalFixes = 0

for (const file of apiFiles) {
  const filePath = path.join(__dirname, '..', file)
  let content = fs.readFileSync(filePath, 'utf8')
  let fixesApplied = 0
  
  // Pattern: }) followed by ) on next line (extra closing paren)
  const pattern = /(\}\s*\)\s*)\n\s*\)\s*$/gm
  const matches = content.match(pattern)
  
  if (matches) {
    // Replace }) followed by ) with just })
    content = content.replace(/(\}\s*\)\s*)\n\s*\)\s*$/gm, '$1')
    fixesApplied = matches.length
  }
  
  // Also fix: )} followed by ) on next line
  const pattern2 = /(\}\s*\)\s*)\n\s*\)\s*$/gm
  if (pattern2.test(content)) {
    content = content.replace(/(\}\s*\)\s*)\n\s*\)\s*$/gm, '$1')
    fixesApplied++
  }
  
  // Fix: NextResponse.json(...) } ) pattern
  content = content.replace(/NextResponse\.json\([^)]+\)\s*\}\s*\)/g, (match) => {
    return match.replace(/\}\s*\)$/, '}')
  })
  
  if (fixesApplied > 0) {
    fs.writeFileSync(filePath, content, 'utf8')
    totalFixes += fixesApplied
    console.log(`  ✅ Fixed ${file}: ${fixesApplied} issue(s)`)
  }
}

console.log(`✅ Total fixes applied: ${totalFixes}`)
