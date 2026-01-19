/**
 * Fix incorrectly placed "as any" statements that are on separate lines
 * These should be removed as they're causing syntax errors
 */

const fs = require('fs')
const path = require('path')

const DATA_ACCESS_FILE = path.join(__dirname, '..', 'lib', 'db', 'data-access.ts')

console.log('🔧 Fixing misplaced "as any" statements...')

let content = fs.readFileSync(DATA_ACCESS_FILE, 'utf8')
let fixesApplied = 0

// Pattern: line starting with whitespace followed by "as any" (standalone)
const misplacedPattern = /^\s+as any/gm

// Find all matches and their positions
const lines = content.split('\n')
const fixedLines = []

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  
  // Check if this line is a standalone "as any"
  if (/^\s+as any/.test(line)) {
    // Check if previous line ends with something that could use "as any"
    if (i > 0) {
      const prevLine = lines[i - 1]
      // If previous line ends with .lean() or similar, merge them
      if (prevLine.trim().endsWith('.lean()') || prevLine.trim().endsWith(')')) {
        // Merge: add "as any" to previous line and skip current line
        fixedLines[fixedLines.length - 1] = prevLine.trimEnd() + ' as any'
        fixesApplied++
        continue
      }
    }
    // Otherwise, just remove the standalone "as any" line
    fixesApplied++
    continue
  }
  
  fixedLines.push(line)
}

// Write the fixed content
const fixedContent = fixedLines.join('\n')
fs.writeFileSync(DATA_ACCESS_FILE, fixedContent, 'utf8')

console.log(`✅ Removed ${fixesApplied} misplaced "as any" statements`)
console.log('📝 Run TypeScript compiler to see remaining errors')
