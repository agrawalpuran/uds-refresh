/**
 * Fix all catch block structures and missing if braces in API routes
 */

const fs = require('fs')
const path = require('path')
const { glob } = require('glob')

async function fixCatchStructure() {
  console.log('🔧 Fixing catch block structures and missing braces...')

  const apiFiles = await glob('app/api/**/*.ts', { cwd: path.join(__dirname, '..') })
  let totalFixes = 0

  for (const file of apiFiles) {
    const filePath = path.join(__dirname, '..', file)
    let content = fs.readFileSync(filePath, 'utf8')
    let originalContent = content
    let fixesApplied = 0
    
    // Fix pattern: return ...) } followed by catch on next line
    // Should be: return ...)\n  } catch
    content = content.replace(/\)\s*\}\s*\n\s*catch\s*\(/g, ')\n  } catch (')
    
    // Fix missing closing braces in if statements before catch
    // Pattern: if (...) { ... return ... } catch
    // But if the if statement is missing a closing brace, we need to add it
    // This is tricky, so we'll look for common patterns
    
    // Fix: if statement with return, then another statement without closing brace
    const lines = content.split('\n')
    const fixedLines = []
    let braceDepth = 0
    let inTryBlock = false
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      
      // Track try blocks
      if (trimmed.startsWith('try {')) {
        inTryBlock = true
        braceDepth = 0
      }
      
      // Track braces
      const openBraces = (line.match(/\{/g) || []).length
      const closeBraces = (line.match(/\}/g) || []).length
      braceDepth += openBraces - closeBraces
      
      // Check if we're at the end of a try block and need to add closing brace
      if (inTryBlock && braceDepth === 0 && trimmed.startsWith('catch')) {
        // Check if previous non-empty line ends with return statement
        for (let j = i - 1; j >= 0; j--) {
          const prevLine = lines[j].trim()
          if (prevLine && !prevLine.startsWith('//')) {
            if (prevLine.endsWith(')') && !prevLine.endsWith('})')) {
              // Might need a closing brace, but this is complex
              // Let's be conservative and only fix obvious cases
            }
            break
          }
        }
      }
      
      fixedLines.push(line)
    }
    
    content = fixedLines.join('\n')
    
    // Fix missing closing braces in if statements in catch blocks
    // Pattern: if (...) { return ... } followed by another if or statement
    content = content.replace(/(if\s*\([^)]+\)\s*\{[^}]*return[^}]*NextResponse\.json\([^)]+\)[^}]*)\n\s*(\/\/\s*Return|if\s*\(|const\s+|let\s+|var\s+)/g, (match, p1, p2) => {
      // Check if p1 ends with }
      if (!p1.trim().endsWith('}')) {
        fixesApplied++
        return p1 + '\n    }\n    ' + p2
      }
      return match
    })
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8')
      totalFixes += fixesApplied
      if (fixesApplied > 0) {
        console.log(`  ✅ Fixed ${file}: ${fixesApplied} issue(s)`)
      }
    }
  }

  console.log(`✅ Total fixes applied: ${totalFixes}`)
}

fixCatchStructure().catch(console.error)
