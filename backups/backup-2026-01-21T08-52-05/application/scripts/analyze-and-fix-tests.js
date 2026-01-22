/**
 * Test Analyzer and Fixer
 * Analyzes test failures and automatically fixes them
 */

const fs = require('fs')
const path = require('path')

const TEST_DIR = path.join(__dirname, '..', 'tests', 'api')
const MOCKS_FILE = path.join(__dirname, '..', 'tests', 'api', 'mocks', 'string-id-mocks.ts')

// Common issues and fixes
const commonFixes = {
  // Fix mock references that are strings instead of actual values
  fixMockReferences: (content) => {
    // Replace "mocks.mockCompany.id" with actual mock values
    content = content.replace(/"mocks\.mockCompany\.id"/g, 'mocks.mockCompany.id')
    content = content.replace(/"mocks\.mockEmployee\.id"/g, 'mocks.mockEmployee.id')
    content = content.replace(/"mocks\.mockLocation\.id"/g, 'mocks.mockLocation.id')
    content = content.replace(/"mocks\.mockVendor\.id"/g, 'mocks.mockVendor.id')
    content = content.replace(/"mocks\.mockProduct\.id"/g, 'mocks.mockProduct.id')
    content = content.replace(/"mocks\.mockCategory\.id"/g, 'mocks.mockCategory.id')
    content = content.replace(/"mocks\.mockSubcategory\.id"/g, 'mocks.mockSubcategory.id')
    return content
  },
  
  // Fix syntax errors in test files
  fixSyntaxErrors: (content) => {
    // Fix missing comma in object literals
    content = content.replace(/query:\s*\{([^}]+)\}\s*body:/g, 'query: {$1},\n        body:')
    // Fix missing function definitions
    if (!content.includes('function addResult')) {
      content = content.replace(
        /export async function runTests/,
        `function addResult(results, result) {
  results.push(result)
}

function createTestResult(method, testName, passed, error, warnings = []) {
  return {
    route: routePath,
    method,
    testName,
    passed,
    error,
    duration: 0,
    warnings: Array.isArray(warnings) ? warnings : []
  }
}

export async function runTests`
      )
    }
    return content
  },
  
  // Fix import paths
  fixImports: (content, filePath) => {
    // Fix relative import paths
    const relativePath = path.relative(path.dirname(filePath), path.join(__dirname, '..', 'app', 'api'))
      .replace(/\\/g, '/')
    
    // The route handler import won't work directly - we'll need to use HTTP requests instead
    // For now, comment it out and note that tests need HTTP-based approach
    if (content.includes('import * as routeHandler from')) {
      content = content.replace(
        /import \* as routeHandler from ['"][^'"]+['"]/,
        '// Route handler import - tests should use HTTP requests instead\n// import * as routeHandler from \'...\''
      )
    }
    return content
  }
}

// Analyze a test file
function analyzeTestFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const issues = []
    
    // Check for common issues
    if (content.includes('"mocks.mock')) {
      issues.push({
        type: 'mock_reference',
        severity: 'high',
        description: 'Mock references are strings instead of actual values'
      })
    }
    
    if (content.includes('import * as routeHandler') && !content.includes('// Route handler import')) {
      issues.push({
        type: 'import_error',
        severity: 'high',
        description: 'Direct route handler import won\'t work with Next.js App Router'
      })
    }
    
    if (!content.includes('function addResult')) {
      issues.push({
        type: 'missing_function',
        severity: 'medium',
        description: 'Missing addResult helper function'
      })
    }
    
    if (content.includes('query: {') && content.includes('body: {') && !content.includes(',')) {
      issues.push({
        type: 'syntax_error',
        severity: 'high',
        description: 'Missing comma between query and body in createMockRequest'
      })
    }
    
    return {
      file: path.relative(TEST_DIR, filePath),
      issues,
      needsFix: issues.length > 0
    }
  } catch (error) {
    return {
      file: path.relative(TEST_DIR, filePath),
      issues: [{ type: 'read_error', severity: 'critical', description: error.message }],
      needsFix: true
    }
  }
}

// Fix a test file
function fixTestFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8')
    const originalContent = content
    
    // Apply all fixes
    content = commonFixes.fixMockReferences(content)
    content = commonFixes.fixSyntaxErrors(content)
    content = commonFixes.fixImports(content, filePath)
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8')
      return { fixed: true, changes: content.length - originalContent.length }
    }
    
    return { fixed: false, changes: 0 }
  } catch (error) {
    return { fixed: false, error: error.message }
  }
}

// Main execution
console.log('🔍 Analyzing test files...')
console.log('')

const testFiles = fs.readdirSync(TEST_DIR)
  .filter(f => f.endsWith('.test.ts') || f.endsWith('.test.js'))
  .map(f => path.join(TEST_DIR, f))

const analysis = []
const fixes = []

for (const testFile of testFiles) {
  const analysisResult = analyzeTestFile(testFile)
  analysis.push(analysisResult)
  
  if (analysisResult.needsFix) {
    console.log(`📝 ${analysisResult.file}: ${analysisResult.issues.length} issue(s)`)
    analysisResult.issues.forEach(issue => {
      console.log(`   - ${issue.type}: ${issue.description}`)
    })
    
    const fixResult = fixTestFile(testFile)
    if (fixResult.fixed) {
      fixes.push({ file: analysisResult.file, fixed: true })
      console.log(`   ✅ Fixed`)
    } else if (fixResult.error) {
      fixes.push({ file: analysisResult.file, fixed: false, error: fixResult.error })
      console.log(`   ❌ Fix failed: ${fixResult.error}`)
    }
  }
}

console.log('')
console.log('='.repeat(80))
console.log('📊 ANALYSIS SUMMARY')
console.log('='.repeat(80))
console.log(`Total test files: ${testFiles.length}`)
console.log(`Files with issues: ${analysis.filter(a => a.needsFix).length}`)
console.log(`Files fixed: ${fixes.filter(f => f.fixed).length}`)
console.log(`Files with errors: ${fixes.filter(f => f.error).length}`)

// Generate report
const report = {
  timestamp: new Date().toISOString(),
  summary: {
    totalFiles: testFiles.length,
    filesWithIssues: analysis.filter(a => a.needsFix).length,
    filesFixed: fixes.filter(f => f.fixed).length,
    filesWithErrors: fixes.filter(f => f.error).length
  },
  analysis,
  fixes
}

const reportPath = path.join(__dirname, '..', 'test-fix-report.json')
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
console.log(`\n📄 Report saved to: ${reportPath}`)
