/**
 * Test Setup for API Testing
 * Configures test environment and utilities
 */

import { NextRequest } from 'next/server'
import mongoose from 'mongoose'

// Mock environment variables
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test-uds'
process.env.NODE_ENV = 'test'

// Test utilities
export function createMockRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  path: string,
  options: {
    body?: any
    query?: Record<string, string>
    headers?: Record<string, string>
  } = {}
): NextRequest {
  const url = new URL(path, 'http://localhost:3000')
  
  // Add query parameters
  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
  }
  
  // Create request
  const request = new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  
  return request
}

// Database connection helper
export async function connectTestDB() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI!, {
      serverSelectionTimeoutMS: 5000,
    })
  }
}

export async function disconnectTestDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
}

// Clean database helper (use with caution)
export async function cleanTestDB() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('cleanTestDB can only be used in test environment')
  }
  
  const collections = mongoose.connection.collections
  for (const key in collections) {
    await collections[key].deleteMany({})
  }
}

// Assertion helpers
export function assertStringId(id: any, fieldName: string = 'ID') {
  if (typeof id !== 'string') {
    throw new Error(`${fieldName} must be a string, got ${typeof id}`)
  }
  if (!/^\d{6}$/.test(id)) {
    throw new Error(`${fieldName} must be a 6-digit numeric string, got ${id}`)
  }
}

export function assertNoObjectId(value: any, fieldName: string = 'Field') {
  if (value && typeof value === 'object') {
    if (value.constructor?.name === 'ObjectId' || value instanceof mongoose.Types.ObjectId) {
      throw new Error(`${fieldName} contains ObjectId, expected string ID`)
    }
  }
  if (typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) {
    // This might be an ObjectId string - warn but don't fail
    console.warn(`⚠️  ${fieldName} appears to be an ObjectId string: ${value}`)
  }
}

export function assertResponseStructure(response: any, expectedFields: string[]) {
  const missingFields = expectedFields.filter(field => !(field in response))
  if (missingFields.length > 0) {
    throw new Error(`Response missing fields: ${missingFields.join(', ')}`)
  }
}

// Test result tracking
export interface TestResult {
  route: string
  method: string
  testName: string
  passed: boolean
  error?: string
  duration: number
  warnings: string[]
}

export class TestReporter {
  private results: TestResult[] = []
  
  addResult(result: TestResult) {
    this.results.push(result)
  }
  
  getSummary() {
    const passed = this.results.filter(r => r.passed).length
    const failed = this.results.filter(r => !r.passed).length
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0)
    
    return {
      total: this.results.length,
      passed,
      failed,
      totalDuration,
      results: this.results
    }
  }
  
  printReport() {
    const summary = this.getSummary()
    
    console.log('\n' + '='.repeat(80))
    console.log('📊 API TEST REPORT')
    console.log('='.repeat(80))
    console.log(`Total Tests: ${summary.total}`)
    console.log(`✅ Passed: ${summary.passed}`)
    console.log(`❌ Failed: ${summary.failed}`)
    console.log(`⏱️  Total Duration: ${summary.totalDuration.toFixed(2)}ms`)
    console.log('')
    
    if (summary.failed > 0) {
      console.log('❌ FAILED TESTS:')
      console.log('-'.repeat(80))
      this.results.filter(r => !r.passed).forEach(result => {
        console.log(`\n${result.route} [${result.method}] - ${result.testName}`)
        console.log(`  Error: ${result.error}`)
        if (result.warnings.length > 0) {
          console.log(`  Warnings: ${result.warnings.join(', ')}`)
        }
      })
      console.log('')
    }
    
    // Group by route
    const byRoute = new Map<string, TestResult[]>()
    this.results.forEach(r => {
      const key = `${r.route} [${r.method}]`
      if (!byRoute.has(key)) {
        byRoute.set(key, [])
      }
      byRoute.get(key)!.push(r)
    })
    
    console.log('📋 TEST RESULTS BY ROUTE:')
    console.log('-'.repeat(80))
    byRoute.forEach((results, route) => {
      const passed = results.filter(r => r.passed).length
      const failed = results.filter(r => !r.passed).length
      const status = failed === 0 ? '✅' : '❌'
      console.log(`${status} ${route}: ${passed} passed, ${failed} failed`)
    })
  }
}
