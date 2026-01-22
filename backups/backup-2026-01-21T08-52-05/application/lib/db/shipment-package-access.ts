/**
 * Shipment Package Data Access Layer
 * Functions for managing shipment packages
 */

import connectDB from './mongodb'
import ShipmentPackage from '../models/ShipmentPackage'
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
 * Calculate volumetric weight
 */
export function calculateVolumetricWeight(
  lengthCm: number,
  breadthCm: number,
  heightCm: number,
  volumetricDivisor: number = 5000
): number {
  return (lengthCm * breadthCm * heightCm) / volumetricDivisor
}

/**
 * Get all shipment packages
 */
export async function getAllShipmentPackages(activeOnly: boolean = false): Promise<any[]> {
  await connectDB()
  
  const query: any = {}
  if (activeOnly) {
    query.isActive = true
  }
  
  const packages = await ShipmentPackage.find(query)
    .sort({ packageName: 1 })
    .lean()
  
  return packages.map((pkg: any) => {
    const plain = toPlainObject(pkg)
    // Calculate volumetric weight
    plain.volumetricWeightKg = calculateVolumetricWeight(
      plain.lengthCm,
      plain.breadthCm,
      plain.heightCm,
      plain.volumetricDivisor
    )
    return plain
  })
}

/**
 * Get shipment package by ID
 */
export async function getShipmentPackageById(packageId: string): Promise<any | null> {
  await connectDB()
  
  const pkg = await ShipmentPackage.findOne({ packageId }).lean()
  
  if (!pkg) {
    return null
  }
  
  const plain = toPlainObject(pkg)
  // Calculate volumetric weight
  plain.volumetricWeightKg = calculateVolumetricWeight(
    plain.lengthCm,
    plain.breadthCm,
    plain.heightCm,
    plain.volumetricDivisor
  )
  return plain
}

/**
 * Create shipment package
 */
export async function createShipmentPackage(
  packageData: {
    packageName: string
    lengthCm: number
    breadthCm: number
    heightCm: number
    volumetricDivisor?: number
    isActive?: boolean
  },
  createdBy?: string
): Promise<any> {
  await connectDB()
  
  // Generate package ID
  const packageId = generateShippingId('PKG')
  
  const pkg = await ShipmentPackage.create({
    packageId,
    packageName: packageData.packageName.trim(),
    lengthCm: packageData.lengthCm,
    breadthCm: packageData.breadthCm,
    heightCm: packageData.heightCm,
    volumetricDivisor: packageData.volumetricDivisor || 5000,
    isActive: packageData.isActive ?? true,
    createdBy: createdBy?.trim(),
  })
  
  const plain = toPlainObject(pkg.toObject())
  // Calculate volumetric weight
  plain.volumetricWeightKg = calculateVolumetricWeight(
    plain.lengthCm,
    plain.breadthCm,
    plain.heightCm,
    plain.volumetricDivisor
  )
  
  return plain
}

/**
 * Update shipment package
 */
export async function updateShipmentPackage(
  packageId: string,
  updates: {
    packageName?: string
    lengthCm?: number
    breadthCm?: number
    heightCm?: number
    volumetricDivisor?: number
    isActive?: boolean
  },
  updatedBy?: string
): Promise<any> {
  await connectDB()
  
  const pkg = await ShipmentPackage.findOne({ packageId })
  if (!pkg) {
    throw new Error(`Package not found: ${packageId}`)
  }
  
  if (updates.packageName !== undefined) {
    pkg.packageName = updates.packageName.trim()
  }
  if (updates.lengthCm !== undefined) {
    pkg.lengthCm = updates.lengthCm
  }
  if (updates.breadthCm !== undefined) {
    pkg.breadthCm = updates.breadthCm
  }
  if (updates.heightCm !== undefined) {
    pkg.heightCm = updates.heightCm
  }
  if (updates.volumetricDivisor !== undefined) {
    pkg.volumetricDivisor = updates.volumetricDivisor
  }
  if (updates.isActive !== undefined) {
    pkg.isActive = updates.isActive
  }
  if (updatedBy) {
    pkg.updatedBy = updatedBy.trim()
  }
  
  await pkg.save()
  
  const plain = toPlainObject(pkg.toObject())
  // Calculate volumetric weight
  plain.volumetricWeightKg = calculateVolumetricWeight(
    plain.lengthCm,
    plain.breadthCm,
    plain.heightCm,
    plain.volumetricDivisor
  )
  
  return plain
}

/**
 * Delete shipment package
 */
export async function deleteShipmentPackage(packageId: string): Promise<void> {
  await connectDB()
  
  const result = await ShipmentPackage.deleteOne({ packageId })
  if (result.deletedCount === 0) {
    throw new Error(`Package not found: ${packageId}`)
  }
}

