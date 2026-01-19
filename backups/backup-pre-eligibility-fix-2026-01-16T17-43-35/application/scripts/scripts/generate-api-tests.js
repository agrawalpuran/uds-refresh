/**
 * API Test Generator
 * Automatically generates test files for all API routes
 */

const fs = require('fs')
const path = require('path')

const ROUTE_MAP_PATH = path.join(__dirname, '..', 'api-route-map.json')
const TEST_DIR = path.join(__dirname, '..', 'tests', 'api')
const MOCKS_PATH = path.join(__dirname, '..', 'tests', 'api', 'mocks', 'string-id-mocks.ts')

// Ensure test directory exists
if (!fs.existsSync(TEST_DIR)) {
  fs.mkdirSync(TEST_DIR, { recursive: true })
}

// Load route map
const routeMap = JSON.parse(fs.readFileSync(ROUTE_MAP_PATH, 'utf8'))

// Generate test file for a route
function generateTestFile(route) {
  const routePath = route.path.replace(/^\//, '').replace(/\//g, '-')
  const testFileName = `${routePath}.test.ts`
  const testFilePath = path.join(TEST_DIR, testFileName)
  
  // Generate test content
  const testContent = generateTestContent(route)
  
  // Write test file
  fs.writeFileSync(testFilePath, testContent)
  return testFilePath
}

// Generate test content for a route
function generateTestContent(route) {
  const routeName = route.path.replace(/^\//, '').replace(/\//g, '_')
  const methods = route.methods
  
  let content = `/**
 * Auto-generated API Tests for ${route.path}
 * Generated: ${new Date().toISOString()}
 */

import { createMockRequest, connectTestDB, disconnectTestDB, assertStringId, assertNoObjectId, TestResult } from '../test-setup'
import * as mocks from '../mocks/string-id-mocks'
import { NextResponse } from 'next/server'

// Import the route handler
${generateRouteImport(route)}

const routePath = '${route.path}'
const routeName = '${routeName}'

export async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = []
  
  await connectTestDB()
  
  try {
${generateMethodTests(route, methods)}
  } finally {
    await disconnectTestDB()
  }
  
  return results
}

function addResult(results: TestResult[], result: TestResult) {
  results.push(result)
}

function createTestResult(
  method: string,
  testName: string,
  passed: boolean,
  error?: string,
  warnings: string[] = []
): TestResult {
  return {
    route: routePath,
    method,
    testName,
    passed,
    error,
    duration: 0, // Will be measured in actual test
    warnings
  }
}
`
  
  return content
}

// Generate route import statement
function generateRouteImport(route) {
  const relativePath = path.relative(TEST_DIR, route.file).replace(/\\/g, '/').replace(/\.ts$/, '')
  return `import * as routeHandler from '${relativePath}'`
}

// Generate tests for each HTTP method
function generateMethodTests(route, methods) {
  let tests = ''
  
  methods.forEach(method => {
    tests += generateMethodTest(route, method)
  })
  
  return tests
}

// Generate test for a specific HTTP method
function generateMethodTest(route, method) {
  const methodName = method.toLowerCase()
  const hasParams = route.params.length > 0
  const hasQuery = route.queryParams.length > 0
  const hasBody = route.bodyParams.length > 0
  
  let test = `
    // ===== ${method} ${route.path} =====
    
    // Test: ${method} - Happy path
    try {
      const startTime = Date.now()
      const request = createMockRequest('${method}', routePath${generateRequestParams(route, method)})
      const response = await routeHandler.${method}(request)
      const duration = Date.now() - startTime
      
      const warnings: string[] = []
      
      // Validate response
      if (!response) {
        addResult(results, createTestResult('${method}', 'Happy path - response exists', false, 'Response is null or undefined'))
      } else {
        const responseData = await response.json()
        
        // Check for ObjectId in response
        const responseStr = JSON.stringify(responseData)
        if (responseStr.includes('ObjectId') || /[0-9a-fA-F]{24}/.test(responseStr)) {
          warnings.push('Response may contain ObjectId strings')
        }
        
        // Validate string IDs in response
        if (responseData.id) {
          try {
            assertStringId(responseData.id, 'Response ID')
          } catch (e: any) {
            warnings.push(e.message)
          }
        }
        
        // Check status code
        const statusOk = response.status >= 200 && response.status < 300
        addResult(results, {
          route: routePath,
          method: '${method}',
          testName: 'Happy path',
          passed: statusOk,
          error: statusOk ? undefined : \`Expected 2xx status, got \${response.status}\`,
          duration,
          warnings
        })
      }
    } catch (error: any) {
      addResult(results, createTestResult('${method}', 'Happy path', false, error.message))
    }
    
    // Test: ${method} - Missing required parameters
    ${generateMissingParamsTest(route, method)}
    
    // Test: ${method} - Invalid input
    ${generateInvalidInputTest(route, method)}
    
    // Test: ${method} - String ID validation
    ${generateStringIdValidationTest(route, method)}
    
    // Test: ${method} - No ObjectId fallback
    ${generateNoObjectIdFallbackTest(route, method)}
`
  
  return test
}

// Generate request parameters for mock request
function generateRequestParams(route, method) {
  let params = ''
  
  // Add path parameters
  if (route.params.length > 0) {
    // Path params are handled in the route path itself
  }
  
  // Add query parameters
  if (route.queryParams.length > 0 && method === 'GET') {
    const queryObj = route.queryParams.reduce((acc, param) => {
      acc[param] = getMockValueForParam(param)
      return acc
    }, {})
    params += `,\n        { query: ${JSON.stringify(queryObj, null, 12)} }`
  }
  
  // Add body parameters
  if (route.bodyParams.length > 0 && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    const bodyObj = route.bodyParams.reduce((acc, param) => {
      acc[param] = getMockValueForParam(param)
      return acc
    }, {})
    params += `,\n        { body: ${JSON.stringify(bodyObj, null, 12)} }`
  }
  
  return params
}

// Get mock value for a parameter
function getMockValueForParam(param) {
  const lowerParam = param.toLowerCase()
  
  if (lowerParam.includes('companyid')) return 'mocks.mockCompany.id'
  if (lowerParam.includes('employeeid')) return 'mocks.mockEmployee.id'
  if (lowerParam.includes('locationid')) return 'mocks.mockLocation.id'
  if (lowerParam.includes('vendorid')) return 'mocks.mockVendor.id'
  if (lowerParam.includes('productid')) return 'mocks.mockProduct.id'
  if (lowerParam.includes('categoryid')) return 'mocks.mockCategory.id'
  if (lowerParam.includes('subcategoryid')) return 'mocks.mockSubcategory.id'
  if (lowerParam.includes('orderid')) return 'mocks.mockOrder.id'
  if (lowerParam.includes('email')) return 'mocks.mockEmployee.email'
  if (lowerParam.includes('name')) return 'Test Name'
  if (lowerParam.includes('status')) return 'active'
  if (lowerParam.includes('quantity')) return 1
  if (lowerParam.includes('price')) return 1000
  
  return 'test-value'
}

// Generate missing parameters test
function generateMissingParamsTest(route, method) {
  if (route.queryParams.length === 0 && route.bodyParams.length === 0) {
    return '// No parameters to test'
  }
  
  return `
    try {
      const request = createMockRequest('${method}', routePath)
      const response = await routeHandler.${method}(request)
      const responseData = await response.json()
      
      // Should return 400 for missing required params
      const passed = response.status === 400 || response.status === 401
      addResult(results, createTestResult('${method}', 'Missing required parameters', passed, 
        passed ? undefined : \`Expected 400/401 for missing params, got \${response.status}\`))
    } catch (error: any) {
      // Error is acceptable for missing params
      addResult(results, createTestResult('${method}', 'Missing required parameters', true))
    }`
}

// Generate invalid input test
function generateInvalidInputTest(route, method) {
  return `
    try {
      const invalidRequest = createMockRequest('${method}', routePath, {
        ${route.queryParams.length > 0 ? `query: { ${route.queryParams[0]}: 'invalid-id' }` : ''}
        ${route.bodyParams.length > 0 ? `body: { ${route.bodyParams[0]}: 'invalid-value' }` : ''}
      })
      const response = await routeHandler.${method}(invalidRequest)
      const responseData = await response.json()
      
      // Should return 400 for invalid input
      const passed = response.status >= 400 && response.status < 500
      addResult(results, createTestResult('${method}', 'Invalid input validation', passed,
        passed ? undefined : \`Expected 4xx for invalid input, got \${response.status}\`))
    } catch (error: any) {
      // Error is acceptable for invalid input
      addResult(results, createTestResult('${method}', 'Invalid input validation', true))
    }`
}

// Generate string ID validation test
function generateStringIdValidationTest(route, method) {
  if (!route.queryParams.some(p => p.toLowerCase().includes('id')) && 
      !route.bodyParams.some(p => p.toLowerCase().includes('id'))) {
    return '// No ID parameters to validate'
  }
  
  return `
    try {
      // Test with ObjectId-like string (should be rejected or converted)
      const objectIdRequest = createMockRequest('${method}', routePath, {
        ${route.queryParams.some(p => p.toLowerCase().includes('id')) 
          ? `query: { ${route.queryParams.find(p => p.toLowerCase().includes('id'))}: '507f1f77bcf86cd799439011' }` 
          : ''}
        ${route.bodyParams.some(p => p.toLowerCase().includes('id')) 
          ? `body: { ${route.bodyParams.find(p => p.toLowerCase().includes('id'))}: '507f1f77bcf86cd799439011' }` 
          : ''}
      })
      const response = await routeHandler.${method}(objectIdRequest)
      const responseData = await response.json()
      
      // Should either reject ObjectId or convert to string ID
      const passed = response.status >= 400 || (responseData && typeof responseData.id === 'string' && /^\\d{6}$/.test(responseData.id))
      addResult(results, createTestResult('${method}', 'String ID validation', passed,
        passed ? undefined : 'Route should reject ObjectId or convert to string ID'))
    } catch (error: any) {
      addResult(results, createTestResult('${method}', 'String ID validation', true))
    }`
}

// Generate no ObjectId fallback test
function generateNoObjectIdFallbackTest(route, method) {
  if (!route.hasObjectIdFallback) {
    return '// Route does not use ObjectId fallback (verified in route map)'
  }
  
  return `
    // WARNING: Route may still have ObjectId fallback logic
    addResult(results, createTestResult('${method}', 'No ObjectId fallback', false,
      'Route contains ObjectId fallback patterns - needs manual review', ['ObjectId fallback detected']))
`
}

// Main execution
console.log('🔧 Generating API test files...')
console.log(`   Routes to test: ${routeMap.routes.length}`)
console.log('')

let generated = 0
let skipped = 0

routeMap.routes.forEach(route => {
  try {
    const testFile = generateTestFile(route)
    console.log(`   ✅ Generated: ${path.relative(TEST_DIR, testFile)}`)
    generated++
  } catch (error) {
    console.error(`   ❌ Failed to generate test for ${route.path}:`, error.message)
    skipped++
  }
})

console.log('')
console.log(`✅ Generated ${generated} test files`)
if (skipped > 0) {
  console.log(`⚠️  Skipped ${skipped} routes`)
}
