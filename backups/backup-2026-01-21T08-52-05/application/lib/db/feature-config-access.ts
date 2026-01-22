/**
 * Feature Configuration Data Access Layer
 * Functions for managing system feature flags
 */

import connectDB from './mongodb'
import SystemFeatureConfig from '../models/SystemFeatureConfig'

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
 * Get System Feature Configuration
 * Returns the singleton feature config, creating it if it doesn't exist
 * @returns Feature configuration object
 */
export async function getSystemFeatureConfig(): Promise<any> {
  await connectDB()
  
  let config = await SystemFeatureConfig.findOne({ id: 'SYS_FEATURE_CFG' })
  
  if (!config) {
    // Create default config if it doesn't exist
    const newConfig = await SystemFeatureConfig.create({
      id: 'SYS_FEATURE_CFG',
      testOrdersEnabled: true, // Default: enabled
    })
    config = newConfig.toObject()
  }
  
  return toPlainObject(config)
}

/**
 * Update System Feature Configuration
 * @param updates Configuration updates
 * @param updatedBy Super Admin identifier (optional, for audit)
 * @returns Updated configuration
 */
export async function updateSystemFeatureConfig(
  updates: {
    testOrdersEnabled?: boolean
  },
  updatedBy?: string
): Promise<any> {
  await connectDB()
  
  const config = await SystemFeatureConfig.findOne({ id: 'SYS_FEATURE_CFG' })
  
  if (!config) {
    // Create if doesn't exist
    const newConfig = await SystemFeatureConfig.create({
      id: 'SYS_FEATURE_CFG',
      testOrdersEnabled: updates.testOrdersEnabled ?? true, // Default: enabled
    })
    return toPlainObject(newConfig.toObject())
  }
  
  if (updates.testOrdersEnabled !== undefined) {
    config.testOrdersEnabled = updates.testOrdersEnabled
  }
  
  await config.save()
  
  console.log(`[updateSystemFeatureConfig] ✅ Updated feature configuration (testOrdersEnabled: ${config.testOrdersEnabled})`)
  
  return toPlainObject(config.toObject())
}

