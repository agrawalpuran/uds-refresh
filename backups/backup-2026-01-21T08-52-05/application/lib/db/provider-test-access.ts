/**
 * Data Access Functions for Logistics Provider Test Logging
 */

import connectDB from './mongodb'
import LogisticsProviderTestLog from '../models/LogisticsProviderTestLog'
import { generateShippingId } from './shipping-config-access'

// Helper function to convert Mongoose document to plain object
function toPlainObject(doc: any): any {
  if (!doc) return doc
  if (typeof doc.toObject === 'function') {
    return doc.toObject()
  }
  if (doc._id) {
    const obj = { ...doc }
    delete obj._id
    delete obj.__v
    return obj
  }
  return doc
}

/**
 * Create a test log entry
 */
export async function createTestLog(data: {
  providerId: string
  testType: 'SERVICEABILITY' | 'RATE' | 'TRACKING' | 'HEALTH' | 'COURIERS'
  requestPayload: any
  responsePayload?: any
  success: boolean
  errorMessage?: string
  executedBy?: string
}): Promise<any> {
  await connectDB()

  const testLogId = generateShippingId('TEST')
  
  const testLog = await LogisticsProviderTestLog.create({
    id: testLogId,
    providerId: data.providerId,
    testType: data.testType,
    requestPayload: JSON.stringify(data.requestPayload),
    responsePayload: data.responsePayload ? JSON.stringify(data.responsePayload) : undefined,
    success: data.success,
    errorMessage: data.errorMessage,
    executedBy: data.executedBy || 'system',
    executedAt: new Date(),
  })

  return toPlainObject(testLog)
}

/**
 * Get test logs for a provider
 */
export async function getTestLogs(
  providerId: string,
  testType?: 'SERVICEABILITY' | 'RATE' | 'TRACKING' | 'HEALTH' | 'COURIERS',
  limit: number = 50
): Promise<any[]> {
  await connectDB()

  const query: any = { providerId }
  if (testType) {
    query.testType = testType
  }

  const logs = await LogisticsProviderTestLog.find(query)
    .sort({ executedAt: -1 })
    .limit(limit)
    .lean()

  return logs.map((log: any) => {
    const plain = toPlainObject(log)
    // Parse JSON strings back to objects
    if (plain.requestPayload) {
      try {
        plain.requestPayload = JSON.parse(plain.requestPayload)
      } catch (e) {
        // Keep as string if parsing fails
      }
    }
    if (plain.responsePayload) {
      try {
        plain.responsePayload = JSON.parse(plain.responsePayload)
      } catch (e) {
        // Keep as string if parsing fails
      }
    }
    return plain
  })
}

/**
 * Get latest test log for a provider and test type
 */
export async function getLatestTestLog(
  providerId: string,
  testType: 'SERVICEABILITY' | 'RATE' | 'TRACKING' | 'HEALTH' | 'COURIERS'
): Promise<any | null> {
  await connectDB()

  const log = await LogisticsProviderTestLog.findOne({
    providerId,
    testType,
  })
    .sort({ executedAt: -1 })
    .lean()

  if (!log) return null

  const plain = toPlainObject(log)
  // Parse JSON strings back to objects
  if (plain.requestPayload) {
    try {
      plain.requestPayload = JSON.parse(plain.requestPayload)
    } catch (e) {
      // Keep as string if parsing fails
    }
  }
  if (plain.responsePayload) {
    try {
      plain.responsePayload = JSON.parse(plain.responsePayload)
    } catch (e) {
      // Keep as string if parsing fails
    }
  }
  return plain
}

