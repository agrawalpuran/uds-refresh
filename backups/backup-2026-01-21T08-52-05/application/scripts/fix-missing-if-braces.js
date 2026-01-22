/**
 * Fix missing closing braces in if statements across API routes
 * This script identifies and fixes common patterns where if statements are missing closing braces
 */

const fs = require('fs')
const path = require('path')
const { glob } = require('glob')

async function fixMissingIfBraces() {
  console.log('🔧 Fixing missing if statement braces...')

  const apiFiles = await glob('app/api/**/*.ts', { cwd: path.join(__dirname, '..') })
  let totalFixes = 0

  for (const file of apiFiles) {
    const filePath = path.join(__dirname, '..', file)
    let content = fs.readFileSync(filePath, 'utf8')
    let originalContent = content
    let fixesApplied = 0
    
    // Pattern 1: if statement followed by return without closing brace
    // if (condition) {\n      return ...\n    \n    // Next statement
    // Should be: if (condition) {\n      return ...\n    }\n    // Next statement
    content = content.replace(/(if\s*\([^)]+\)\s*\{[^}]*return[^}]*)\n\s*(\/\/|\/\/|if\s*\(|const\s+|let\s+|var\s+)/g, (match, p1, p2) => {
      // Check if the if block already has a closing brace
      const lines = match.split('\n')
      const lastLine = lines[lines.length - 1]
      if (!lastLine.trim().endsWith('}')) {
        fixesApplied++
        return p1 + '\n    }\n    ' + p2
      }
      return match
    })
    
    // Pattern 2: if statement with nested if missing braces
    // This is more complex and might need manual review
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8')
      totalFixes += fixesApplied
      if (fixesApplied > 0) {
        console.log(`  ✅ Fixed ${file}: ${fixesApplied} issue(s)`)
      }
    }
  }

  console.log(`✅ Total fixes applied: ${totalFixes}`)
  console.log('⚠️  Note: Some complex cases may need manual review')
}

fixMissingIfBraces().catch(console.error)
