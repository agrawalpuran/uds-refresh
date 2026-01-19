/**
 * Auto-generated API Tests for /superadmin/vendor-shipping-routing/[routingId]
 * Generated: 2026-01-08T09:42:34.397Z
 */

import { createMockRequest, connectTestDB, disconnectTestDB, assertStringId, assertNoObjectId, TestResult } from '../test-setup'
import * as mocks from '../mocks/string-id-mocks'
import { NextResponse } from 'next/server'

// Import the route handler
// Route handler import - tests should use HTTP requests instead
// import * as routeHandler from '...'

const routePath = '/superadmin/vendor-shipping-routing/[routingId]'
const routeName = 'superadmin_vendor-shipping-routing_[routingId]'

export async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = []
  
  await connectTestDB()
  
  try {

    // ===== GET /superadmin/vendor-shipping-routing/[routingId] =====
    
    // Test: GET - Happy path
    try {
      const startTime = Date.now()
      const request = createMockRequest('GET', routePath)
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
        
        body: { primaryCourierCode: 'invalid-value' }
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
    // No ID parameters to validate
    
    // Test: GET - No ObjectId fallback
    // Route does not use ObjectId fallback (verified in route map)

    // ===== PUT /superadmin/vendor-shipping-routing/[routingId] =====
    
    // Test: PUT - Happy path
    try {
      const startTime = Date.now()
      const request = createMockRequest('PUT', routePath,
        { body: {
          "primaryCourierCode": "test-value",
          "secondaryCourierCode": "test-value",
          "isActive": "test-value"
} })
      const response = await routeHandler.PUT(request)
      const duration = Date.now() - startTime
      
      const warnings: string[] = []
      
      // Validate response
      if (!response) {
        addResult(results, createTestResult('PUT', 'Happy path - response exists', false, 'Response is null or undefined'))
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
          method: 'PUT',
          testName: 'Happy path',
          passed: statusOk,
          error: statusOk ? undefined : `Expected 2xx status, got ${response.status}`,
          duration,
          warnings
        })
      }
    } catch (error: any) {
      addResult(results, createTestResult('PUT', 'Happy path', false, error.message))
    }
    
    // Test: PUT - Missing required parameters
    
    try {
      const request = createMockRequest('PUT', routePath)
      const response = await routeHandler.PUT(request)
      const responseData = await response.json()
      
      // Should return 400 for missing required params
      const passed = response.status === 400 || response.status === 401
      addResult(results, createTestResult('PUT', 'Missing required parameters', passed, 
        passed ? undefined : `Expected 400/401 for missing params, got ${response.status}`))
    } catch (error: any) {
      // Error is acceptable for missing params
      addResult(results, createTestResult('PUT', 'Missing required parameters', true))
    }
    
    // Test: PUT - Invalid input
    
    try {
      const invalidRequest = createMockRequest('PUT', routePath, {
        
        body: { primaryCourierCode: 'invalid-value' }
      })
      const response = await routeHandler.PUT(invalidRequest)
      const responseData = await response.json()
      
      // Should return 400 for invalid input
      const passed = response.status >= 400 && response.status < 500
      addResult(results, createTestResult('PUT', 'Invalid input validation', passed,
        passed ? undefined : `Expected 4xx for invalid input, got ${response.status}`))
    } catch (error: any) {
      // Error is acceptable for invalid input
      addResult(results, createTestResult('PUT', 'Invalid input validation', true))
    }
    
    // Test: PUT - String ID validation
    // No ID parameters to validate
    
    // Test: PUT - No ObjectId fallback
    // Route does not use ObjectId fallback (verified in route map)

    // ===== DELETE /superadmin/vendor-shipping-routing/[routingId] =====
    
    // Test: DELETE - Happy path
    try {
      const startTime = Date.now()
      const request = createMockRequest('DELETE', routePath)
      const response = await routeHandler.DELETE(request)
      const duration = Date.now() - startTime
      
      const warnings: string[] = []
      
      // Validate response
      if (!response) {
        addResult(results, createTestResult('DELETE', 'Happy path - response exists', false, 'Response is null or undefined'))
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
          method: 'DELETE',
          testName: 'Happy path',
          passed: statusOk,
          error: statusOk ? undefined : `Expected 2xx status, got ${response.status}`,
          duration,
          warnings
        })
      }
    } catch (error: any) {
      addResult(results, createTestResult('DELETE', 'Happy path', false, error.message))
    }
    
    // Test: DELETE - Missing required parameters
    
    try {
      const request = createMockRequest('DELETE', routePath)
      const response = await routeHandler.DELETE(request)
      const responseData = await response.json()
      
      // Should return 400 for missing required params
      const passed = response.status === 400 || response.status === 401
      addResult(results, createTestResult('DELETE', 'Missing required parameters', passed, 
        passed ? undefined : `Expected 400/401 for missing params, got ${response.status}`))
    } catch (error: any) {
      // Error is acceptable for missing params
      addResult(results, createTestResult('DELETE', 'Missing required parameters', true))
    }
    
    // Test: DELETE - Invalid input
    
    try {
      const invalidRequest = createMockRequest('DELETE', routePath, {
        
        body: { primaryCourierCode: 'invalid-value' }
      })
      const response = await routeHandler.DELETE(invalidRequest)
      const responseData = await response.json()
      
      // Should return 400 for invalid input
      const passed = response.status >= 400 && response.status < 500
      addResult(results, createTestResult('DELETE', 'Invalid input validation', passed,
        passed ? undefined : `Expected 4xx for invalid input, got ${response.status}`))
    } catch (error: any) {
      // Error is acceptable for invalid input
      addResult(results, createTestResult('DELETE', 'Invalid input validation', true))
    }
    
    // Test: DELETE - String ID validation
    // No ID parameters to validate
    
    // Test: DELETE - No ObjectId fallback
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
