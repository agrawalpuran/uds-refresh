/**
 * Fix all extra closing parentheses in API routes
 */

const fs = require('fs')
const path = require('path')
const { glob } = require('glob')

async function fixApiRoutes() {
  console.log('🔧 Fixing all API route syntax errors...')

  const apiFiles = await glob('app/api/**/*.ts', { cwd: path.join(__dirname, '..') })
  let totalFixes = 0

  for (const file of apiFiles) {
    const filePath = path.join(__dirname, '..', file)
    let content = fs.readFileSync(filePath, 'utf8')
    let originalContent = content
    let fixesApplied = 0
    
    // Fix pattern: }) followed by ) on next line
    // Match: }\n    )\n  }
    content = content.replace(/(\}\s*\)\s*)\n\s*\)\s*\n\s*\}/g, '$1\n  }')
    
    // Fix pattern: )} followed by ) on next line  
    content = content.replace(/(\)\s*\}\s*)\n\s*\)\s*\n\s*\}/g, '$1\n  }')
    
    // Fix pattern: NextResponse.json(...) } ) on separate lines
    content = content.replace(/NextResponse\.json\(\s*\{[^}]*error[^}]*\},\s*\{[^}]*status[^}]*\}\s*\)\s*\}\s*\)/g, (match) => {
      return match.replace(/\}\s*\)$/, ')')
    })
    
    // More specific: lines ending with }) followed by ) on next line
    const lines = content.split('\n')
    const fixedLines = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const nextLine = i < lines.length - 1 ? lines[i + 1] : ''
      
      // If current line ends with }) and next line is just )
      if (line.trim().endsWith('})') && nextLine.trim() === ')') {
        fixedLines.push(line)
        i++ // Skip next line
        fixesApplied++
      } else {
        fixedLines.push(line)
      }
    }
    
    content = fixedLines.join('\n')
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8')
      totalFixes += fixesApplied
      console.log(`  ✅ Fixed ${file}: ${fixesApplied} issue(s)`)
    }
  }

  console.log(`✅ Total fixes applied: ${totalFixes}`)
}

fixApiRoutes().catch(console.error)
