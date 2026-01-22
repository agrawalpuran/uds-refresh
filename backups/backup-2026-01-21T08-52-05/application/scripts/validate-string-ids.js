/**
 * Static Code Analysis for String ID Validation
 * Scans codebase for ObjectId patterns and validates string ID usage
 */

const fs = require('fs')
const path = require('path')

const API_DIR = path.join(__dirname, '..', 'app', 'api')
const DATA_ACCESS_FILE = path.join(__dirname, '..', 'lib', 'db', 'data-access.ts')

// Patterns to detect
const OBJECTID_PATTERNS = [
  { pattern: /findById\(/g, name: 'findById() usage' },
  { pattern: /new\s+mongoose\.Types\.ObjectId\(/g, name: 'new mongoose.Types.ObjectId()' },
  { pattern: /new\s+ObjectId\(/g, name: 'new ObjectId()' },
  { pattern: /ObjectId\.isValid\(/g, name: 'ObjectId.isValid()' },
  { pattern: /\._id\s*=/g, name: 'Direct _id assignment' },
  { pattern: /\._id\.toString\(\)/g, name: '_id.toString()' },
  { pattern: /\$in:\s*\[.*ObjectId/g, name: '$in with ObjectId array' },
  { pattern: /findOne\(\s*\{\s*_id:/g, name: 'findOne({ _id: })' },
  { pattern: /findByIdAndUpdate\(/g, name: 'findByIdAndUpdate()' },
  { pattern: /findByIdAndDelete\(/g, name: 'findByIdAndDelete()' },
  { pattern: /\.equals\(/g, name: '.equals() method (ObjectId comparison)' },
]

const STRING_ID_PATTERNS = [
  { pattern: /findOne\(\s*\{\s*id:/g, name: 'findOne({ id: })' },
  { pattern: /find\(\s*\{\s*id:/g, name: 'find({ id: })' },
  { pattern: /findOneAndUpdate\(\s*\{\s*id:/g, name: 'findOneAndUpdate({ id: })' },
  { pattern: /deleteOne\(\s*\{\s*id:/g, name: 'deleteOne({ id: })' },
]

// Results
const results = {
  objectIdIssues: [],
  stringIdUsage: [],
  files: new Set(),
  totalFiles: 0
}

// Scan a file
function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const relativePath = path.relative(path.join(__dirname, '..'), filePath)
    let hasIssues = false
    let hasStringIds = false
    
    // Check for ObjectId patterns
    OBJECTID_PATTERNS.forEach(({ pattern, name }) => {
      const matches = content.match(pattern)
      if (matches) {
        const lines = content.split('\n')
        matches.forEach(() => {
          const lineNum = content.substring(0, content.indexOf(matches[0])).split('\n').length
          results.objectIdIssues.push({
            file: relativePath,
            line: lineNum,
            pattern: name,
            context: lines[lineNum - 1]?.trim().substring(0, 100) || ''
          })
          hasIssues = true
        })
      }
    })
    
    // Check for string ID patterns
    STRING_ID_PATTERNS.forEach(({ pattern, name }) => {
      const matches = content.match(pattern)
      if (matches) {
        results.stringIdUsage.push({
          file: relativePath,
          pattern: name,
          count: matches.length
        })
        hasStringIds = true
      }
    })
    
    if (hasIssues || hasStringIds) {
      results.files.add(relativePath)
    }
    
    results.totalFiles++
  } catch (error) {
    console.error(`Error scanning ${filePath}:`, error.message)
  }
}

// Scan directory recursively
function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    
    if (entry.isDirectory()) {
      scanDirectory(fullPath)
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
      scanFile(fullPath)
    }
  }
}

// Main execution
console.log('🔍 Scanning codebase for ObjectId patterns and string ID usage...')
console.log('')

// Scan API routes
console.log('📁 Scanning API routes...')
scanDirectory(API_DIR)

// Scan data access layer
console.log('📁 Scanning data access layer...')
if (fs.existsSync(DATA_ACCESS_FILE)) {
  scanFile(DATA_ACCESS_FILE)
}

// Print results
console.log('')
console.log('='.repeat(80))
console.log('📊 VALIDATION RESULTS')
console.log('='.repeat(80))
console.log(`Total files scanned: ${results.totalFiles}`)
console.log(`Files with issues: ${results.files.size}`)
console.log('')

// ObjectId issues
if (results.objectIdIssues.length > 0) {
  console.log(`❌ OBJECTID PATTERNS FOUND: ${results.objectIdIssues.length}`)
  console.log('-'.repeat(80))
  
  // Group by file
  const byFile = new Map()
  results.objectIdIssues.forEach(issue => {
    if (!byFile.has(issue.file)) {
      byFile.set(issue.file, [])
    }
    byFile.get(issue.file).push(issue)
  })
  
  byFile.forEach((issues, file) => {
    console.log(`\n📄 ${file}`)
    issues.forEach(issue => {
      console.log(`   Line ${issue.line}: ${issue.pattern}`)
      if (issue.context) {
        console.log(`   Context: ${issue.context}`)
      }
    })
  })
  console.log('')
} else {
  console.log('✅ No ObjectId patterns found!')
  console.log('')
}

// String ID usage
if (results.stringIdUsage.length > 0) {
  console.log(`✅ STRING ID PATTERNS FOUND: ${results.stringIdUsage.length}`)
  console.log('-'.repeat(80))
  
  // Group by pattern
  const byPattern = new Map()
  results.stringIdUsage.forEach(usage => {
    if (!byPattern.has(usage.pattern)) {
      byPattern.set(usage.pattern, [])
    }
    byPattern.get(usage.pattern).push(usage)
  })
  
  byPattern.forEach((usages, pattern) => {
    const totalCount = usages.reduce((sum, u) => sum + u.count, 0)
    console.log(`\n${pattern}: ${totalCount} occurrences`)
    usages.slice(0, 5).forEach(usage => {
      console.log(`   - ${usage.file} (${usage.count})`)
    })
    if (usages.length > 5) {
      console.log(`   ... and ${usages.length - 5} more files`)
    }
  })
  console.log('')
}

// Summary
console.log('='.repeat(80))
console.log('📋 SUMMARY')
console.log('='.repeat(80))
console.log(`ObjectId Issues: ${results.objectIdIssues.length}`)
console.log(`String ID Usage: ${results.stringIdUsage.length} files`)
console.log(`Files Needing Review: ${results.objectIdIssues.length > 0 ? results.files.size : 0}`)
console.log('')

// Save report
const reportPath = path.join(__dirname, '..', 'string-id-validation-report.json')
const report = {
  timestamp: new Date().toISOString(),
  summary: {
    totalFiles: results.totalFiles,
    filesWithIssues: results.files.size,
    objectIdIssues: results.objectIdIssues.length,
    stringIdUsage: results.stringIdUsage.length
  },
  objectIdIssues: results.objectIdIssues,
  stringIdUsage: results.stringIdUsage
}

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
console.log(`📄 Full report saved to: ${reportPath}`)

// Exit with error code if issues found
process.exit(results.objectIdIssues.length > 0 ? 1 : 0)
