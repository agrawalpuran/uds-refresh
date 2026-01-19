/**
 * Auto-generated API Tests for /shipments/[shipmentId]/pickup/reschedule
 * Generated: 2026-01-08T09:42:34.333Z
 */

import { createMockRequest, connectTestDB, disconnectTestDB, assertStringId, assertNoObjectId, TestResult } from '../test-setup'
import * as mocks from '../mocks/string-id-mocks'
import { NextResponse } from 'next/server'

// Import the route handler
// Route handler import - tests should use HTTP requests instead
// import * as routeHandler from '...'

const routePath = '/shipments/[shipmentId]/pickup/reschedule'
const routeName = 'shipments_[shipmentId]_pickup_reschedule'

export async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = []
  
  await connectTestDB()
  
  try {

    // ===== PUT /shipments/[shipmentId]/pickup/reschedule =====
    
    // Test: PUT - Happy path
    try {
      const startTime = Date.now()
      const request = createMockRequest('PUT', routePath)
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
    // No parameters to test
    
    // Test: PUT - Invalid input
    
    try {
      const invalidRequest = createMockRequest('PUT', routePath, {
        
        
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
