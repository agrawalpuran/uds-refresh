/**
 * Fix remaining .lean() calls that need 'as any' type assertions
 */

const fs = require('fs')
const path = require('path')

const DATA_ACCESS_FILE = path.join(__dirname, '..', 'lib', 'db', 'data-access.ts')

console.log('🔧 Fixing remaining .lean() type assertions...')

let content = fs.readFileSync(DATA_ACCESS_FILE, 'utf8')
let fixesApplied = 0

// Pattern: .lean() followed by whitespace and NOT followed by 'as any'
const leanPattern = /\.lean\(\)\s*(?!as\s+any)/g

// Find all matches
const matches = []
let match
while ((match = leanPattern.exec(content)) !== null) {
  matches.push({
    index: match.index,
    length: match[0].length
  })
}

// Apply fixes in reverse order to maintain indices
matches.reverse()
for (const m of matches) {
  const before = content.substring(Math.max(0, m.index - 200), m.index)
  const after = content.substring(m.index + m.length, Math.min(m.index + m.length + 200, content.length))
  
  // Check if this is inside a string literal or comment
  const beforeContext = content.substring(Math.max(0, m.index - 500), m.index)
  const quotesBefore = (beforeContext.match(/"/g) || []).length
  const quotesAfter = (after.match(/"/g) || []).length
  
  // Skip if inside a string (odd number of quotes)
  if (quotesBefore % 2 !== 0) {
    continue
  }
  
  // Check if it's in a comment
  const lastComment = beforeContext.lastIndexOf('//')
  const lastNewline = beforeContext.lastIndexOf('\n')
  if (lastComment > lastNewline) {
    continue
  }
  
  // Replace .lean() with .lean() as any
  content = content.substring(0, m.index + m.length) + ' as any' + content.substring(m.index + m.length)
  fixesApplied++
}

// Write the fixed content
fs.writeFileSync(DATA_ACCESS_FILE, content, 'utf8')

console.log(`✅ Applied ${fixesApplied} fixes for .lean() type assertions`)
console.log('📝 Run TypeScript compiler to see remaining errors')
