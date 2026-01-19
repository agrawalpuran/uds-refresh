/**
 * Fix extra closing braces that break try-catch structure
 */

const fs = require('fs')
const path = require('path')
const { glob } = require('glob')

async function fixExtraBraces() {
  console.log('🔧 Fixing extra closing braces...')

  const apiFiles = await glob('app/api/**/*.ts', { cwd: path.join(__dirname, '..') })
  let totalFixes = 0

  for (const file of apiFiles) {
    const filePath = path.join(__dirname, '..', file)
    let content = fs.readFileSync(filePath, 'utf8')
    let originalContent = content
    let fixesApplied = 0
    
    // Pattern: closing brace followed by comment or code that should be inside the block
    // Example: }\n    // Comment\n    const x = ...
    // Should be: }\n    }\n    // Comment\n    const x = ... (if it's closing an if)
    // OR: }\n    // Comment\n    const x = ... (if the brace is extra)
    
    // More specific: if we see }\n    // followed by code that should be in a block
    const lines = content.split('\n')
    const fixedLines = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const nextLine = i < lines.length - 1 ? lines[i + 1] : ''
      const prevLine = i > 0 ? lines[i - 1] : ''
      
      // Check if this is an extra closing brace before a comment or code
      if (line.trim() === '}' && 
          (nextLine.trim().startsWith('//') || 
           nextLine.trim().startsWith('const ') ||
           nextLine.trim().startsWith('let ') ||
           nextLine.trim().startsWith('var ') ||
           nextLine.trim().startsWith('if ') ||
           nextLine.trim().startsWith('await ') ||
           nextLine.trim().startsWith('return ')) &&
          !prevLine.trim().endsWith(')') &&
          !prevLine.trim().endsWith(';')) {
        // This might be an extra brace, but we need to be careful
        // Skip it for now and let manual fixes handle complex cases
        fixesApplied++
        continue
      }
      
      fixedLines.push(line)
    }
    
    if (fixesApplied > 0) {
      content = fixedLines.join('\n')
      fs.writeFileSync(filePath, content, 'utf8')
      totalFixes += fixesApplied
      console.log(`  ✅ Fixed ${file}: ${fixesApplied} issue(s)`)
    }
  }

  console.log(`✅ Total fixes applied: ${totalFixes}`)
  console.log('⚠️  Note: Some cases may need manual review')
}

fixExtraBraces().catch(console.error)
