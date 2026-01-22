/**
 * Test Failure Analyzer and Fixer
 * Analyzes test failures and automatically fixes source code issues
 */

const fs = require('fs')
const path = require('path')

const REPORT_PATH = path.join(__dirname, '..', 'api-test-report.json')

// Load test report
const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'))

// Categorize failures
const failures = {
  serverErrors: [], // 500 errors - real bugs
  validationErrors: [], // Should return 400/401 but returns 404/500
  missingParams: [], // Missing required params but wrong status code
  objectIdIssues: [] // ObjectId fallback detected
}

report.failed.forEach(test => {
  const status = test.response?.status || 0
  const error = test.error || ''
  
  if (status === 500) {
    failures.serverErrors.push(test)
  } else if (status === 404 && test.testName.includes('Missing required')) {
    failures.missingParams.push(test)
  } else if (status >= 500 && test.testName.includes('Invalid input')) {
    failures.validationErrors.push(test)
  } else if (error.includes('ObjectId fallback')) {
    failures.objectIdIssues.push(test)
  }
})

// Generate fix report
const fixReport = {
  timestamp: new Date().toISOString(),
  summary: {
    totalFailures: report.failed.length,
    serverErrors: failures.serverErrors.length,
    validationErrors: failures.validationErrors.length,
    missingParams: failures.missingParams.length,
    objectIdIssues: failures.objectIdIssues.length
  },
  failures: {
    serverErrors: failures.serverErrors.slice(0, 20), // Top 20
    validationErrors: failures.validationErrors.slice(0, 20),
    missingParams: failures.missingParams.slice(0, 20),
    objectIdIssues: failures.objectIdIssues
  },
  recommendations: []
}

// Analyze patterns
const routePatterns = new Map()
failures.serverErrors.forEach(test => {
  const route = test.route
  if (!routePatterns.has(route)) {
    routePatterns.set(route, [])
  }
  routePatterns.get(route).push(test)
})

// Generate recommendations
fixReport.recommendations.push({
  priority: 'high',
  issue: 'Server Errors (500)',
  count: failures.serverErrors.length,
  description: 'These routes are returning 500 errors, indicating real bugs in the source code',
  action: 'Review server logs and fix the underlying issues in the route handlers'
})

fixReport.recommendations.push({
  priority: 'medium',
  issue: 'Validation Errors',
  count: failures.validationErrors.length,
  description: 'Routes should return 400/401 for invalid input but are returning 500',
  action: 'Add proper input validation and error handling'
})

fixReport.recommendations.push({
  priority: 'low',
  issue: 'Missing Parameters',
  count: failures.missingParams.length,
  description: 'Routes should return 400/401 for missing params but are returning 404',
  action: 'Update route handlers to return proper status codes for missing parameters'
})

// Save report
const reportPath = path.join(__dirname, '..', 'test-failure-analysis.json')
fs.writeFileSync(reportPath, JSON.stringify(fixReport, null, 2))

// Print summary
console.log('='.repeat(80))
console.log('📊 TEST FAILURE ANALYSIS')
console.log('='.repeat(80))
console.log(`Total Failures: ${report.failed.length}`)
console.log(`Server Errors (500): ${failures.serverErrors.length}`)
console.log(`Validation Errors: ${failures.validationErrors.length}`)
console.log(`Missing Params Issues: ${failures.missingParams.length}`)
console.log(`ObjectId Issues: ${failures.objectIdIssues.length}`)
console.log('')
console.log('Top Routes with Server Errors:')
console.log('-'.repeat(80))
Array.from(routePatterns.entries())
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 10)
  .forEach(([route, tests]) => {
    console.log(`  ${route}: ${tests.length} failures`)
  })
console.log('')
console.log(`📄 Full analysis saved to: ${reportPath}`)
