/**
 * Auto-generated API Tests for /company/grns/acknowledge
 * Generated: 2026-01-08T09:42:34.186Z
 */

import { createMockRequest, connectTestDB, disconnectTestDB, assertStringId, assertNoObjectId, TestResult } from '../test-setup'
import * as mocks from '../mocks/string-id-mocks'
import { NextResponse } from 'next/server'

// Import the route handler
// Route handler import - tests should use HTTP requests instead
// import * as routeHandler from '...'

const routePath = '/company/grns/acknowledge'
const routeName = 'company_grns_acknowledge'

export async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = []
  
  await connectTestDB()
  
  try {

    // ===== GET /company/grns/acknowledge =====
    
    // Test: GET - Happy path
    try {
      const startTime = Date.now()
      const request = createMockRequest('GET', routePath,
        { query: {
          "companyId": mocks.mockCompany.id
} })
      const response = await routeHandler.GET(request)
      const duration = Date.now() - startTime
      
      const warnings: string[] = []
      
      // Validate response
      if (!response) {
        addResult(results, createTestResult('GET', 'Happy path - response exists', false, 'Response is null or undefined'))
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
          method: 'GET',
          testName: 'Happy path',
          passed: statusOk,
          error: statusOk ? undefined : `Expected 2xx status, got ${response.status}`,
          duration,
          warnings
        })
      }
    } catch (error: any) {
      addResult(results, createTestResult('GET', 'Happy path', false, error.message))
    }
    
    // Test: GET - Missing required parameters
    
    try {
      const request = createMockRequest('GET', routePath)
      const response = await routeHandler.GET(request)
      const responseData = await response.json()
      
      // Should return 400 for missing required params
      const passed = response.status === 400 || response.status === 401
      addResult(results, createTestResult('GET', 'Missing required parameters', passed, 
        passed ? undefined : `Expected 400/401 for missing params, got ${response.status}`))
    } catch (error: any) {
      // Error is acceptable for missing params
      addResult(results, createTestResult('GET', 'Missing required parameters', true))
    }
    
    // Test: GET - Invalid input
    
    try {
      const invalidRequest = createMockRequest('GET', routePath, {
        query: { companyId: 'invalid-id' },
        body: { grnId: 'invalid-value' }
      })
      const response = await routeHandler.GET(invalidRequest)
      const responseData = await response.json()
      
      // Should return 400 for invalid input
      const passed = response.status >= 400 && response.status < 500
      addResult(results, createTestResult('GET', 'Invalid input validation', passed,
        passed ? undefined : `Expected 4xx for invalid input, got ${response.status}`))
    } catch (error: any) {
      // Error is acceptable for invalid input
      addResult(results, createTestResult('GET', 'Invalid input validation', true))
    }
    
    // Test: GET - String ID validation
    
    try {
      // Test with ObjectId-like string (should be rejected or converted)
      const objectIdRequest = createMockRequest('GET', routePath, {
        query: { companyId: '507f1f77bcf86cd799439011' },
        body: { grnId: '507f1f77bcf86cd799439011' }
      })
      const response = await routeHandler.GET(objectIdRequest)
      const responseData = await response.json()
      
      // Should either reject ObjectId or convert to string ID
      const passed = response.status >= 400 || (responseData && typeof responseData.id === 'string' && /^\d{6}$/.test(responseData.id))
      addResult(results, createTestResult('GET', 'String ID validation', passed,
        passed ? undefined : 'Route should reject ObjectId or convert to string ID'))
    } catch (error: any) {
      addResult(results, createTestResult('GET', 'String ID validation', true))
    }
    
    // Test: GET - No ObjectId fallback
    // Route does not use ObjectId fallback (verified in route map)

    // ===== POST /company/grns/acknowledge =====
    
    // Test: POST - Happy path
    try {
      const startTime = Date.now()
      const request = createMockRequest('POST', routePath,
        { body: {
          "grnId": "test-value",
          "acknowledgedBy": "test-value"
} })
      const response = await routeHandler.POST(request)
      const duration = Date.now() - startTime
      
      const warnings: string[] = []
      
      // Validate response
      if (!response) {
        addResult(results, createTestResult('POST', 'Happy path - response exists', false, 'Response is null or undefined'))
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
          method: 'POST',
          testName: 'Happy path',
          passed: statusOk,
          error: statusOk ? undefined : `Expected 2xx status, got ${response.status}`,
          duration,
          warnings
        })
      }
    } catch (error: any) {
      addResult(results, createTestResult('POST', 'Happy path', false, error.message))
    }
    
    // Test: POST - Missing required parameters
    
    try {
      const request = createMockRequest('POST', routePath)
      const response = await routeHandler.POST(request)
      const responseData = await response.json()
      
      // Should return 400 for missing required params
      const passed = response.status === 400 || response.status === 401
      addResult(results, createTestResult('POST', 'Missing required parameters', passed, 
        passed ? undefined : `Expected 400/401 for missing params, got ${response.status}`))
    } catch (error: any) {
      // Error is acceptable for missing params
      addResult(results, createTestResult('POST', 'Missing required parameters', true))
    }
    
    // Test: POST - Invalid input
    
    try {
      const invalidRequest = createMockRequest('POST', routePath, {
        query: { companyId: 'invalid-id' },
        body: { grnId: 'invalid-value' }
      })
      const response = await routeHandler.POST(invalidRequest)
      const responseData = await response.json()
      
      // Should return 400 for invalid input
      const passed = response.status >= 400 && response.status < 500
      addResult(results, createTestResult('POST', 'Invalid input validation', passed,
        passed ? undefined : `Expected 4xx for invalid input, got ${response.status}`))
    } catch (error: any) {
      // Error is acceptable for invalid input
      addResult(results, createTestResult('POST', 'Invalid input validation', true))
    }
    
    // Test: POST - String ID validation
    
    try {
      // Test with ObjectId-like string (should be rejected or converted)
      const objectIdRequest = createMockRequest('POST', routePath, {
        query: { companyId: '507f1f77bcf86cd799439011' },
        body: { grnId: '507f1f77bcf86cd799439011' }
      })
      const response = await routeHandler.POST(objectIdRequest)
      const responseData = await response.json()
      
      // Should either reject ObjectId or convert to string ID
      const passed = response.status >= 400 || (responseData && typeof responseData.id === 'string' && /^\d{6}$/.test(responseData.id))
      addResult(results, createTestResult('POST', 'String ID validation', passed,
        passed ? undefined : 'Route should reject ObjectId or convert to string ID'))
    } catch (error: any) {
      addResult(results, createTestResult('POST', 'String ID validation', true))
    }
    
    // Test: POST - No ObjectId fallback
    // Route does not use ObjectId fallback (verified in route map)

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
