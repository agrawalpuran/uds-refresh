import mongoose from 'mongoose'
import connectDB from './mongodb'
import ManualCourierProvider from '../models/ManualCourierProvider'

/**
 * Convert Mongoose document to plain object
 */
function toPlainObject(doc: any): any {
  if (!doc) return null
  if (typeof doc.toObject === 'function') {
    return doc.toObject({ getters: true })
  }
  return doc
}

/**
 * Get all manual courier providers (optionally filtered by active status)
 */
export async function getAllManualCourierProviders(
  filters?: {
    isActive?: boolean
  }
): Promise<any[]> {
  await connectDB()
  
  const query: any = {}
  if (filters?.isActive !== undefined) {
    query.isActive = filters.isActive
  }
  
  const couriers = await ManualCourierProvider.find(query)
    .sort({ courierName: 1 })
    .lean()
  
  return couriers.map(toPlainObject)
}

/**
 * Get manual courier provider by courierRefId
 */
export async function getManualCourierProviderById(courierRefId: string): Promise<any | null> {
  await connectDB()
  const courier = await ManualCourierProvider.findOne({ courierRefId }).lean()
  return courier ? toPlainObject(courier) : null
}

/**
 * Get manual courier provider by courierCode
 */
export async function getManualCourierProviderByCode(courierCode: string): Promise<any | null> {
  await connectDB()
  const courier = await ManualCourierProvider.findOne({ 
    courierCode: courierCode.toUpperCase() 
  }).lean()
  return courier ? toPlainObject(courier) : null
}

/**
 * Create manual courier provider
 */
export async function createManualCourierProvider(
  courierData: {
    courierCode: string
    courierName: string
    isActive?: boolean
    contactWebsite?: string
    supportPhone?: string
    remarks?: string
  }
): Promise<any> {
  await connectDB()

  // Check if courierCode already exists
  const existing = await ManualCourierProvider.findOne({ 
    courierCode: courierData.courierCode.toUpperCase() 
  })
  if (existing) {
    throw new Error(`Courier code already exists: ${courierData.courierCode}`)
  }

  // Generate courier ID
  const courierRefId = (await import('./shipping-config-access')).generateShippingId('MCP')

  const courier = await ManualCourierProvider.create({
    courierRefId,
    courierCode: courierData.courierCode.toUpperCase().trim(),
    courierName: courierData.courierName.trim(),
    isActive: courierData.isActive ?? true,
    contactWebsite: courierData.contactWebsite?.trim(),
    supportPhone: courierData.supportPhone?.trim(),
    remarks: courierData.remarks?.trim(),
  })

  console.log(`[createManualCourierProvider] ✅ Created courier: ${courierRefId} (Code: ${courierData.courierCode})`)

  return toPlainObject(courier.toObject())
}

/**
 * Update manual courier provider
 */
export async function updateManualCourierProvider(
  courierRefId: string,
  updates: {
    courierCode?: string
    courierName?: string
    isActive?: boolean
    contactWebsite?: string
    supportPhone?: string
    remarks?: string
  }
): Promise<any> {
  await connectDB()
  
  const courier = await ManualCourierProvider.findOne({ courierRefId })
  if (!courier) {
    throw new Error(`Courier not found: ${courierRefId}`)
  }

  // If updating courierCode, check for duplicates
  if (updates.courierCode && updates.courierCode.toUpperCase() !== courier.courierCode) {
    const existing = await ManualCourierProvider.findOne({ 
      courierCode: updates.courierCode.toUpperCase(),
      courierRefId: { $ne: courierRefId }
    })
    if (existing) {
      throw new Error(`Courier code already exists: ${updates.courierCode}`)
    }
    courier.courierCode = updates.courierCode.toUpperCase().trim()
  }

  if (updates.courierName !== undefined) {
    courier.courierName = updates.courierName.trim()
  }
  if (updates.isActive !== undefined) {
    courier.isActive = updates.isActive
  }
  if (updates.contactWebsite !== undefined) {
    courier.contactWebsite = updates.contactWebsite?.trim() || undefined
  }
  if (updates.supportPhone !== undefined) {
    courier.supportPhone = updates.supportPhone?.trim() || undefined
  }
  if (updates.remarks !== undefined) {
    courier.remarks = updates.remarks?.trim() || undefined
  }

  await courier.save()

  return toPlainObject(courier.toObject())
}

/**
 * Delete manual courier provider (soft delete by setting isActive = false)
 */
export async function deleteManualCourierProvider(courierRefId: string): Promise<void> {
  await connectDB()
  
  const courier = await ManualCourierProvider.findOne({ courierRefId })
  if (!courier) {
    throw new Error(`Courier not found: ${courierRefId}`)
  }

  // Soft delete: set isActive = false
  courier.isActive = false
  await courier.save()
}

