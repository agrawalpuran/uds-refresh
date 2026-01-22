/**
 * Fix all )} patterns that should be )
 */

const fs = require('fs')
const path = require('path')
const { glob } = require('glob')

async function fixClosingParens() {
  console.log('🔧 Fixing )} patterns...')

  const apiFiles = await glob('app/api/**/*.ts', { cwd: path.join(__dirname, '..') })
  let totalFixes = 0

  for (const file of apiFiles) {
    const filePath = path.join(__dirname, '..', file)
    let content = fs.readFileSync(filePath, 'utf8')
    let originalContent = content
    
    // Fix )} that appears after NextResponse.json(...)
    // Pattern: NextResponse.json(...) } should be NextResponse.json(...)
    content = content.replace(/NextResponse\.json\([^)]+\)\s*\}/g, (match) => {
      return match.replace(/\s*\}$/, '')
    })
    
    // Fix standalone )} on lines
    content = content.replace(/\)\}/g, ')')
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8')
      const diff = (originalContent.match(/\)\}/g) || []).length - (content.match(/\)\}/g) || []).length
      totalFixes += diff
      console.log(`  ✅ Fixed ${file}: ${diff} issue(s)`)
    }
  }

  console.log(`✅ Total fixes applied: ${totalFixes}`)
}

fixClosingParens().catch(console.error)
