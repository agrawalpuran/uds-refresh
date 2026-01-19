/**
 * CENTRALIZED VENDOR RESOLUTION
 * 
 * This is the SINGLE SOURCE OF TRUTH for vendor identification.
 * All vendor-related queries MUST use this function to resolve vendorId.
 * 
 * This prevents vendor identification mismatches that cause catalog failures.
 */

import mongoose from 'mongoose'
import connectDB from '../db/mongodb'
import Vendor from '../models/Vendor'

export interface VendorResolutionResult {
  vendorId: string
  vendorObjectId: mongoose.Types.ObjectId
  vendorName: string
  resolved: boolean
  error?: string
}

/**
 * Resolves vendorId to vendor ObjectId with strict validation
 * 
 * @param vendorId - The vendor ID (string, e.g., "100001")
 * @returns VendorResolutionResult with vendorId, vendorObjectId, and vendorName
 * @throws Error if vendor cannot be resolved
 */
export async function resolveVendorId(vendorId: string): Promise<VendorResolutionResult> {
  await connectDB()
  
  // 🔍 LOG: Vendor resolution start
  console.log(`[VENDOR_RESOLUTION] START - Resolving vendorId: "${vendorId}" (type: ${typeof vendorId})`)
  
  if (!vendorId || typeof vendorId !== 'string' || vendorId.trim() === '') {
    const error = `Invalid vendorId: "${vendorId}". Must be a non-empty string.`
    console.error(`[VENDOR_RESOLUTION] ❌ ${error}`)
    throw new Error(error)
  }
  
  const trimmedVendorId = vendorId.trim()
  
  // Step 1: Find vendor by id field (string ID like "100001")
  const db = mongoose.connection.db
  if (!db) {
    const error = 'Database connection not available'
    console.error(`[VENDOR_RESOLUTION] ❌ ${error}`)
    throw new Error(error)
  }
  
  console.log(`[VENDOR_RESOLUTION] Querying vendors collection: { id: "${trimmedVendorId}" }`)
  const rawVendor = await db.collection('vendors').findOne({ id: trimmedVendorId })
  
  if (!rawVendor) {
    // List available vendors for debugging
    const allVendors = await db.collection('vendors').find({}).limit(10).toArray()
    const availableIds = allVendors.map((v: any) => `"${v.id}"`).join(', ')
    const error = `Vendor not found with id: "${trimmedVendorId}". Available vendor IDs: ${availableIds || 'none'}`
    console.error(`[VENDOR_RESOLUTION] ❌ ${error}`)
    throw new Error(error)
  }
  
  console.log(`[VENDOR_RESOLUTION] ✅ Vendor found:`, {
    name: rawVendor.name,
    id: rawVendor.id,
    _id: rawVendor._id?.toString(),
    _idType: rawVendor._id?.constructor?.name
  })
  
  // Step 2: Get MongoDB _id (always ObjectId for MongoDB documents)
  // Note: MongoDB's _id is always an ObjectId - this is different from our custom string ID fields
  const vendorObjectId = rawVendor._id as mongoose.Types.ObjectId
  
  if (!vendorObjectId) {
    const error = `Vendor document missing _id: ${rawVendor.id}`
    console.error(`[VENDOR_RESOLUTION] ❌ ${error}`)
    throw new Error(error)
  }
  
  console.log(`[VENDOR_RESOLUTION] ✅ SUCCESS - Resolved vendor:`, {
    vendorId: trimmedVendorId,
    vendorObjectId: vendorObjectId.toString(),
    vendorName: rawVendor.name
  })
  
  return {
    vendorId: trimmedVendorId,
    vendorObjectId,
    vendorName: rawVendor.name || 'Unknown Vendor',
    resolved: true
  }
}

/**
 * Resolves vendorId from email (for cases where only email is available)
 * 
 * @param email - Vendor email address
 * @returns VendorResolutionResult
 * @throws Error if vendor cannot be resolved
 */
export async function resolveVendorIdFromEmail(email: string): Promise<VendorResolutionResult> {
  await connectDB()
  
  console.log(`[VENDOR_RESOLUTION] Resolving vendor from email: "${email}"`)
  
  if (!email || typeof email !== 'string' || email.trim() === '') {
    throw new Error(`Invalid email: "${email}"`)
  }
  
  const normalizedEmail = email.trim().toLowerCase()
  
  // Find vendor by email
  const vendor = await Vendor.findOne({ 
    email: { $regex: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
  }).lean()
  
  if (!vendor || !vendor.id) {
    throw new Error(`Vendor not found with email: "${email}"`)
  }
  
  // Use the centralized resolver
  return await resolveVendorId(vendor.id)
}

