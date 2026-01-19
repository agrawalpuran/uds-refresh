import mongoose from 'mongoose'
import connectDB from './mongodb'
import { generateShippingId } from './shipping-config-access'
import VendorWarehouse from '../models/VendorWarehouse'

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
 * Get vendor warehouse by warehouseRefId
 */
export async function getVendorWarehouseById(warehouseRefId: string): Promise<any | null> {
  await connectDB()
  const warehouse = await VendorWarehouse.findOne({ warehouseRefId }).lean()
  return warehouse ? toPlainObject(warehouse) : null
}

/**
 * Get all warehouses for a vendor (optionally filtered by active status)
 */
export async function getVendorWarehouses(
  vendorId: string,
  filters?: {
    isActive?: boolean
    isPrimary?: boolean
  }
): Promise<any[]> {
  await connectDB()
  
  const query: any = { vendorId }
  if (filters?.isActive !== undefined) {
    query.isActive = filters.isActive
  }
  if (filters?.isPrimary !== undefined) {
    query.isPrimary = filters.isPrimary
  }
  
  const warehouses = await VendorWarehouse.find(query)
    .sort({ isPrimary: -1, createdAt: -1 })
    .lean()
  
  return warehouses.map(toPlainObject)
}

/**
 * Get primary warehouse for a vendor
 */
export async function getPrimaryVendorWarehouse(
  vendorId: string
): Promise<any | null> {
  await connectDB()
  
  const query: any = { 
    vendorId, 
    isPrimary: true, 
    isActive: true 
  }
  
  const warehouse = await VendorWarehouse.findOne(query).lean()
  return warehouse ? toPlainObject(warehouse) : null
}

/**
 * Create vendor warehouse
 */
export async function createVendorWarehouse(
  warehouseData: {
    vendorId: string
    warehouseName: string
    addressLine1: string
    addressLine2?: string
    city: string
    state: string
    country?: string
    pincode: string
    contactName?: string
    contactPhone?: string
    isPrimary?: boolean
    isActive?: boolean
  },
  createdBy?: string
): Promise<any> {
  await connectDB()
  
  // Validate vendor exists
  const Vendor = (await import('../models/Vendor')).default
  const vendor = await Vendor.findOne({ id: warehouseData.vendorId }).lean()
  if (!vendor) {
    throw new Error(`Vendor not found: ${warehouseData.vendorId}`)
  }
  
  // If this is being set as primary, unset other primary warehouses
  if (warehouseData.isPrimary) {
    await VendorWarehouse.updateMany(
      { 
        vendorId: warehouseData.vendorId,
        isPrimary: true 
      },
      { isPrimary: false }
    )
  }
  
  // Generate warehouse ID
  const warehouseRefId = generateShippingId('VWH')
  
  // Create warehouse object - companyId is optional and omitted
  const warehouseDataToSave: any = {
    warehouseRefId,
    vendorId: warehouseData.vendorId,
    warehouseName: warehouseData.warehouseName,
    addressLine1: warehouseData.addressLine1,
    addressLine2: warehouseData.addressLine2,
    city: warehouseData.city,
    state: warehouseData.state,
    country: warehouseData.country || 'India',
    pincode: warehouseData.pincode,
    contactName: warehouseData.contactName,
    contactPhone: warehouseData.contactPhone,
    isPrimary: warehouseData.isPrimary ?? false,
    isActive: warehouseData.isActive ?? true,
    createdBy: createdBy?.trim(),
  }
  
  // Only include companyId if it's explicitly provided (for backward compatibility)
  // Otherwise, omit it entirely - the schema allows it to be undefined
  const warehouse = await VendorWarehouse.create(warehouseDataToSave)
  
  console.log(`[createVendorWarehouse] ✅ Created warehouse: ${warehouseRefId} (Vendor: ${warehouseData.vendorId})`)
  
  return toPlainObject(warehouse.toObject())
}

/**
 * Update vendor warehouse
 */
export async function updateVendorWarehouse(
  warehouseRefId: string,
  updates: {
    warehouseName?: string
    addressLine1?: string
    addressLine2?: string
    city?: string
    state?: string
    country?: string
    pincode?: string
    contactName?: string
    contactPhone?: string
    isPrimary?: boolean
    isActive?: boolean
  },
  updatedBy?: string
): Promise<any> {
  await connectDB()
  
  const warehouse = await VendorWarehouse.findOne({ warehouseRefId })
  if (!warehouse) {
    throw new Error(`Warehouse not found: ${warehouseRefId}`)
  }
  
  // If setting as primary, unset other primary warehouses for this vendor
  if (updates.isPrimary === true) {
    await VendorWarehouse.updateMany(
      { 
        vendorId: warehouse.vendorId,
        warehouseRefId: { $ne: warehouseRefId },
        isPrimary: true 
      },
      { isPrimary: false }
    )
  }
  
  // Update fields
  if (updates.warehouseName !== undefined) warehouse.warehouseName = updates.warehouseName
  if (updates.addressLine1 !== undefined) warehouse.addressLine1 = updates.addressLine1
  if (updates.addressLine2 !== undefined) warehouse.addressLine2 = updates.addressLine2
  if (updates.city !== undefined) warehouse.city = updates.city
  if (updates.state !== undefined) warehouse.state = updates.state
  if (updates.country !== undefined) warehouse.country = updates.country
  if (updates.pincode !== undefined) warehouse.pincode = updates.pincode
  if (updates.contactName !== undefined) warehouse.contactName = updates.contactName
  if (updates.contactPhone !== undefined) warehouse.contactPhone = updates.contactPhone
  if (updates.isPrimary !== undefined) warehouse.isPrimary = updates.isPrimary
  if (updates.isActive !== undefined) warehouse.isActive = updates.isActive
  if (updatedBy) warehouse.updatedBy = updatedBy.trim()
  
  await warehouse.save()
  
  console.log(`[updateVendorWarehouse] ✅ Updated warehouse: ${warehouseRefId}`)
  
  return toPlainObject(warehouse.toObject())
}

/**
 * Delete vendor warehouse (only if not referenced by shipments)
 */
export async function deleteVendorWarehouse(warehouseRefId: string): Promise<void> {
  await connectDB()
  
  // Check if warehouse is referenced by any shipments
  const Shipment = (await import('../models/Shipment')).default
  const shipmentCount = await Shipment.countDocuments({ warehouseRefId })
  
  if (shipmentCount > 0) {
    throw new Error(`Cannot delete warehouse: ${shipmentCount} shipment(s) reference this warehouse`)
  }
  
  const result = await VendorWarehouse.deleteOne({ warehouseRefId })
  if (result.deletedCount === 0) {
    throw new Error(`Warehouse not found: ${warehouseRefId}`)
  }
  
  console.log(`[deleteVendorWarehouse] ✅ Deleted warehouse: ${warehouseRefId}`)
}

/**
 * Validate vendor has at least one active warehouse
 */
export async function validateVendorHasActiveWarehouse(
  vendorId: string
): Promise<boolean> {
  await connectDB()
  
  const query: any = { vendorId, isActive: true }
  
  const count = await VendorWarehouse.countDocuments(query)
  return count > 0
}

