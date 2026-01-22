/**
 * API Test Runner - Executes API tests and generates report
 * Tests routes by making actual HTTP requests to a running server
 */

const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')

const ROUTE_MAP_PATH = path.join(__dirname, '..', 'api-route-map.json')
const TEST_PORT = process.env.TEST_PORT || 3001
const TEST_HOST = process.env.TEST_HOST || 'localhost'
const BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`

// Import seed function
const { seedDatabase } = require('./seed-test-data')

// Load route map
const routeMap = JSON.parse(fs.readFileSync(ROUTE_MAP_PATH, 'utf8'))

// Test results
const results = {
  passed: [],
  failed: [],
  warnings: [],
  total: 0,
  startTime: Date.now()
}

// Make HTTP request
function makeRequest(method, url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    }

    const protocol = urlObj.protocol === 'https:' ? https : http
    const req = protocol.request(requestOptions, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const jsonData = data ? JSON.parse(data) : {}
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: jsonData,
            raw: data
          })
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data,
            raw: data
          })
        }
      })
    })

    req.on('error', reject)
    
    if (options.body) {
      req.write(JSON.stringify(options.body))
    }
    
    req.end()
  })
}

// Check if server is running
async function checkServer() {
  try {
    const response = await makeRequest('GET', `${BASE_URL}/api/test-encryption`)
    return true
  } catch (error) {
    return false
  }
}

// Test a single route
async function testRoute(route) {
  const routeResults = []
  
  for (const method of route.methods) {
    const testCases = generateTestCases(route, method)
    
    for (const testCase of testCases) {
      try {
        const startTime = Date.now()
        const url = `${BASE_URL}${buildUrl(route.path, testCase.params, testCase.query)}`
        const response = await makeRequest(method, url, { body: testCase.body, headers: testCase.headers })
        const duration = Date.now() - startTime
        
        const testResult = {
          route: route.path,
          method,
          testName: testCase.name,
          passed: testCase.validate(response),
          error: testCase.validate(response) ? undefined : testCase.errorMessage,
          duration,
          warnings: testCase.checkWarnings(response),
          response: {
            status: response.status,
            data: response.data
          }
        }
        
        routeResults.push(testResult)
        
        if (testResult.passed) {
          results.passed.push(testResult)
        } else {
          results.failed.push(testResult)
        }
        
        if (testResult.warnings.length > 0) {
          results.warnings.push({
            route: route.path,
            method,
            warnings: testResult.warnings
          })
        }
        
        results.total++
      } catch (error) {
        const testResult = {
          route: route.path,
          method,
          testName: testCase.name,
          passed: false,
          error: error.message,
          duration: 0,
          warnings: []
        }
        
        routeResults.push(testResult)
        results.failed.push(testResult)
        results.total++
      }
    }
  }
  
  return routeResults
}

// Build URL with path parameters
function buildUrl(path, params = {}, query = {}) {
  let url = path
  
  // Replace path parameters
  Object.entries(params).forEach(([key, value]) => {
    url = url.replace(`[${key}]`, value)
  })
  
  // Add query parameters
  const queryString = Object.entries(query)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
  
  if (queryString) {
    url += `?${queryString}`
  }
  
  return url
}

// Generate test cases for a route
function generateTestCases(route, method) {
  const testCases = []
  
  // Test 1: Happy path (if possible)
  if (method === 'GET' || (method === 'POST' && route.bodyParams.length > 0)) {
    testCases.push({
      name: 'Happy path',
      params: generatePathParams(route.params),
      query: generateQueryParams(route.queryParams, method === 'GET'),
      body: method !== 'GET' ? generateBodyParams(route.bodyParams) : undefined,
      headers: {},
      validate: (response) => {
        // Accept 2xx, 3xx, or 4xx (but not 5xx)
        return response.status < 500
      },
      errorMessage: 'Server error (5xx)',
      checkWarnings: (response) => {
        const warnings = []
        const responseStr = JSON.stringify(response.data)
        
        // Check for ObjectId strings
        if (/[0-9a-fA-F]{24}/.test(responseStr)) {
          warnings.push('Response may contain ObjectId strings')
        }
        
        // Check for string IDs
        if (response.data && response.data.id && !/^\d{6}$/.test(response.data.id)) {
          warnings.push(`Response ID is not a 6-digit string: ${response.data.id}`)
        }
        
        return warnings
      }
    })
  }
  
  // Test 2: Missing required parameters (for POST/PUT/PATCH)
  if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && route.bodyParams.length > 0) {
    testCases.push({
      name: 'Missing required parameters',
      params: generatePathParams(route.params),
      query: {},
      body: {},
      headers: {},
      validate: (response) => response.status === 400 || response.status === 401,
      errorMessage: 'Should return 400/401 for missing params',
      checkWarnings: () => []
    })
  }
  
  // Test 3: Invalid input
  if (route.queryParams.length > 0 || route.bodyParams.length > 0) {
    testCases.push({
      name: 'Invalid input validation',
      params: generatePathParams(route.params),
      query: generateInvalidQueryParams(route.queryParams),
      body: method !== 'GET' ? generateInvalidBodyParams(route.bodyParams) : undefined,
      headers: {},
      validate: (response) => response.status >= 400 && response.status < 500,
      errorMessage: 'Should return 4xx for invalid input',
      checkWarnings: () => []
    })
  }
  
  // Test 4: String ID validation (if route has ID params)
  const hasIdParams = route.params.some(p => p.toLowerCase().includes('id')) ||
                     route.queryParams.some(p => p.toLowerCase().includes('id')) ||
                     route.bodyParams.some(p => p.toLowerCase().includes('id'))
  
  if (hasIdParams && route.hasObjectIdFallback) {
    testCases.push({
      name: 'ObjectId fallback detection',
      params: generatePathParams(route.params, true),
      query: generateQueryParams(route.queryParams, method === 'GET', true),
      body: method !== 'GET' ? generateBodyParams(route.bodyParams, true) : undefined,
      headers: {},
      validate: (response) => {
        // This test checks if route still uses ObjectId fallback
        // If route accepts ObjectId, it's a warning
        return response.status < 500
      },
      errorMessage: 'Route may still use ObjectId fallback',
      checkWarnings: (response) => {
        const warnings = []
        if (response.status < 400) {
          warnings.push('Route accepted ObjectId input - may have fallback logic')
        }
        return warnings
      }
    })
  }
  
  return testCases
}

// Generate path parameters
function generatePathParams(params, useObjectId = false) {
  const result = {}
  params.forEach(param => {
    if (useObjectId && param.toLowerCase().includes('id')) {
      result[param] = '507f1f77bcf86cd799439011' // Sample ObjectId
    } else if (param.toLowerCase().includes('id')) {
      result[param] = '100001' // Sample string ID
    } else {
      result[param] = 'test-value'
    }
  })
  return result
}

// Generate query parameters
function generateQueryParams(params, includeAll = true, useObjectId = false) {
  if (!includeAll || params.length === 0) return {}
  
  const result = {}
  params.forEach(param => {
    const lowerParam = param.toLowerCase()
    if (useObjectId && lowerParam.includes('id')) {
      result[param] = '507f1f77bcf86cd799439011'
    } else if (lowerParam.includes('companyid')) {
      result[param] = '100001' // Test company ID
    } else if (lowerParam.includes('employeeid')) {
      result[param] = '300001' // Test employee ID
    } else if (lowerParam.includes('locationid')) {
      result[param] = '400001' // Test location ID
    } else if (lowerParam.includes('vendorid')) {
      result[param] = '100001' // Test vendor ID
    } else if (lowerParam.includes('productid')) {
      result[param] = '200001' // Test product ID
    } else if (lowerParam.includes('categoryid')) {
      result[param] = '500001' // Test category ID
    } else if (lowerParam.includes('branchid')) {
      result[param] = '600001' // Test branch ID
    } else if (lowerParam.includes('email') || lowerParam.includes('adminemail')) {
      result[param] = 'employee@test.com' // Test employee email
    } else if (lowerParam.includes('status')) {
      result[param] = 'active'
    } else if (lowerParam.includes('true') || lowerParam.includes('false')) {
      result[param] = 'true'
    } else {
      result[param] = 'test-value'
    }
  })
  return result
}

// Generate invalid query parameters
function generateInvalidQueryParams(params) {
  const result = {}
  if (params.length > 0) {
    result[params[0]] = 'invalid-value'
  }
  return result
}

// Generate body parameters
function generateBodyParams(params, useObjectId = false) {
  const result = {}
  params.forEach(param => {
    const cleanParam = param.split('=')[0].trim()
    const lowerParam = cleanParam.toLowerCase()
    
    if (useObjectId && lowerParam.includes('id')) {
      result[cleanParam] = '507f1f77bcf86cd799439011'
    } else if (lowerParam.includes('companyid')) {
      result[cleanParam] = '100001' // Test company ID
    } else if (lowerParam.includes('employeeid')) {
      result[cleanParam] = '300001' // Test employee ID
    } else if (lowerParam.includes('locationid')) {
      result[cleanParam] = '400001' // Test location ID
    } else if (lowerParam.includes('vendorid')) {
      result[cleanParam] = '100001' // Test vendor ID
    } else if (lowerParam.includes('productid') || lowerParam.includes('uniformid')) {
      result[cleanParam] = '200001' // Test product ID
    } else if (lowerParam.includes('categoryid') || lowerParam.includes('parentcategoryid')) {
      result[cleanParam] = '500001' // Test category ID
    } else if (lowerParam.includes('branchid')) {
      result[cleanParam] = '600001' // Test branch ID
    } else if (lowerParam.includes('adminid')) {
      result[cleanParam] = '300001' // Test admin employee ID
    } else if (lowerParam.includes('email') || lowerParam.includes('adminemail')) {
      result[cleanParam] = 'employee@test.com' // Test employee email
    } else if (lowerParam.includes('name')) {
      result[cleanParam] = 'Test Name'
    } else if (lowerParam.includes('status')) {
      result[cleanParam] = 'active'
    } else if (lowerParam.includes('quantity') || lowerParam.includes('qty')) {
      result[cleanParam] = 1
    } else if (lowerParam.includes('price')) {
      result[cleanParam] = 1000
    } else {
      result[cleanParam] = 'test-value'
    }
  })
  return result
}

// Generate invalid body parameters
function generateInvalidBodyParams(params) {
  const result = {}
  if (params.length > 0) {
    const firstParam = params[0].split('=')[0].trim()
    result[firstParam] = 'invalid-value'
  }
  return result
}

// Print report
function printReport() {
  const duration = Date.now() - results.startTime
  
  console.log('\n' + '='.repeat(80))
  console.log('📊 API TEST REPORT')
  console.log('='.repeat(80))
  console.log(`Total Tests: ${results.total}`)
  console.log(`✅ Passed: ${results.passed.length}`)
  console.log(`❌ Failed: ${results.failed.length}`)
  console.log(`⚠️  Warnings: ${results.warnings.length}`)
  console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)}s`)
  console.log('')
  
  if (results.failed.length > 0) {
    console.log('❌ FAILED TESTS:')
    console.log('-'.repeat(80))
    results.failed.forEach(result => {
      console.log(`\n${result.route} [${result.method}] - ${result.testName}`)
      console.log(`  Status: ${result.response?.status || 'N/A'}`)
      console.log(`  Error: ${result.error}`)
      if (result.warnings.length > 0) {
        console.log(`  Warnings: ${result.warnings.join(', ')}`)
      }
    })
    console.log('')
  }
  
  if (results.warnings.length > 0) {
    console.log('⚠️  WARNINGS:')
    console.log('-'.repeat(80))
    results.warnings.forEach(warning => {
      console.log(`\n${warning.route} [${warning.method}]`)
      warning.warnings.forEach(w => console.log(`  - ${w}`))
    })
    console.log('')
  }
  
  // Group by route
  const byRoute = new Map()
  results.passed.forEach(r => {
    const key = `${r.route} [${r.method}]`
    if (!byRoute.has(key)) {
      byRoute.set(key, { passed: 0, failed: 0 })
    }
    byRoute.get(key).passed++
  })
  results.failed.forEach(r => {
    const key = `${r.route} [${r.method}]`
    if (!byRoute.has(key)) {
      byRoute.set(key, { passed: 0, failed: 0 })
    }
    byRoute.get(key).failed++
  })
  
  console.log('📋 TEST RESULTS BY ROUTE:')
  console.log('-'.repeat(80))
  Array.from(byRoute.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([route, counts]) => {
      const status = counts.failed === 0 ? '✅' : '❌'
      console.log(`${status} ${route}: ${counts.passed} passed, ${counts.failed} failed`)
    })
}

// Main execution
async function runTests() {
  console.log('🚀 Starting API Test Suite')
  console.log(`   Testing against: ${BASE_URL}`)
  console.log('')
  
  // Seed test database
  console.log('🌱 Seeding test database...')
  try {
    await seedDatabase()
    console.log('✅ Test database seeded')
    console.log('')
    // Wait a moment for database to be ready
    await new Promise(resolve => setTimeout(resolve, 1000))
  } catch (error) {
    console.error('⚠️  Warning: Could not seed database:', error.message)
    console.error('   Tests will continue but may fail due to missing test data')
    console.log('')
  }
  
  // Check if server is running
  console.log('🔍 Checking if server is running...')
  const serverRunning = await checkServer()
  if (!serverRunning) {
    console.error(`❌ Server is not running at ${BASE_URL}`)
    console.error('   Please start the development server first: npm run dev')
    process.exit(1)
  }
  console.log('✅ Server is running')
  console.log('')
  
  // Test each route
  console.log('🧪 Running tests...')
  for (let i = 0; i < routeMap.routes.length; i++) {
    const route = routeMap.routes[i]
    process.stdout.write(`\r   Testing ${i + 1}/${routeMap.routes.length}: ${route.path}`)
    await testRoute(route)
  }
  console.log('\n')
  
  // Print report
  printReport()
  
  // Save report to file
  const reportPath = path.join(__dirname, '..', 'api-test-report.json')
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.total,
      passed: results.passed.length,
      failed: results.failed.length,
      warnings: results.warnings.length,
      duration: Date.now() - results.startTime
    },
    passed: results.passed,
    failed: results.failed,
    warnings: results.warnings
  }
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`\n📄 Full report saved to: ${reportPath}`)
  
  // Exit with appropriate code
  process.exit(results.failed.length > 0 ? 1 : 0)
}

// Run if executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('❌ Test runner failed:', error)
    process.exit(1)
  })
}

module.exports = { runTests, testRoute }
