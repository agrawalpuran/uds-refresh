/**
 * API Test Runner
 * Automatically discovers and runs all API tests
 */

import { TestReporter, TestResult } from './test-setup'
import { connectTestDB, disconnectTestDB } from './test-setup'
import * as fs from 'fs'
import * as path from 'path'

const TEST_DIR = path.join(__dirname, 'api')
const reporter = new TestReporter()

interface TestModule {
  runTests: () => Promise<TestResult[]>
}

async function discoverTests(): Promise<string[]> {
  const testFiles: string[] = []
  
  function scanDirectory(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      
      if (entry.isDirectory()) {
        scanDirectory(fullPath)
      } else if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.js')) {
        testFiles.push(fullPath)
      }
    }
  }
  
  scanDirectory(TEST_DIR)
  return testFiles
}

async function runTestFile(filePath: string): Promise<TestResult[]> {
  try {
    // Dynamic import of test file
    const testModule = await import(filePath) as TestModule
    
    if (typeof testModule.runTests === 'function') {
      return await testModule.runTests()
    } else {
      console.warn(`⚠️  Test file ${filePath} does not export runTests function`)
      return []
    }
  } catch (error: any) {
    console.error(`❌ Error running test file ${filePath}:`, error.message)
    return [{
      route: filePath,
      method: 'UNKNOWN',
      testName: 'Test file load',
      passed: false,
      error: error.message,
      duration: 0,
      warnings: []
    }]
  }
}

async function runAllTests() {
  console.log('🚀 Starting API Test Suite')
  console.log('='.repeat(80))
  console.log('')
  
  // Connect to test database
  try {
    await connectTestDB()
    console.log('✅ Connected to test database')
  } catch (error: any) {
    console.error('❌ Failed to connect to test database:', error.message)
    process.exit(1)
  }
  
  // Discover all test files
  console.log('🔍 Discovering test files...')
  const testFiles = await discoverTests()
  console.log(`   Found ${testFiles.length} test files`)
  console.log('')
  
  // Run each test file
  for (const testFile of testFiles) {
    console.log(`📝 Running tests from: ${path.relative(TEST_DIR, testFile)}`)
    const results = await runTestFile(testFile)
    results.forEach(r => reporter.addResult(r))
  }
  
  // Disconnect from database
  await disconnectTestDB()
  
  // Print report
  reporter.printReport()
  
  // Save report to file
  const reportPath = path.join(__dirname, '..', 'api-test-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(reporter.getSummary(), null, 2))
  console.log(`\n📄 Full report saved to: ${reportPath}`)
  
  // Exit with appropriate code
  const summary = reporter.getSummary()
  process.exit(summary.failed > 0 ? 1 : 0)
}

// Run if executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('❌ Test runner failed:', error)
    process.exit(1)
  })
}

export { runAllTests, discoverTests }
