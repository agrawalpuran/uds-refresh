/**
 * Vendor Shipping Routing Data Access Layer
 * Functions for managing vendor-to-shipping-aggregator routing configuration
 */

import connectDB from './mongodb'
import VendorShippingRouting from '../models/VendorShippingRouting'
import ShipmentServiceProvider from '../models/ShipmentServiceProvider'
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
 * Get vendor shipping routing by ID
 */
export async function getVendorShippingRoutingById(routingId: string): Promise<any | null> {
  await connectDB()
  
  const routing = await VendorShippingRouting.findOne({ routingId }).lean()
  
  if (!routing) {
    return null
  }
  
  return toPlainObject(routing)
}

/**
 * Get vendor shipping routing by vendor ID and provider
 */
export async function getVendorShippingRouting(
  vendorId: string,
  shipmentServiceProviderRefId?: number,
  activeOnly: boolean = true
): Promise<any[]> {
  await connectDB()
  
  const query: any = { vendorId }
  if (shipmentServiceProviderRefId) {
    query.shipmentServiceProviderRefId = shipmentServiceProviderRefId
  }
  if (activeOnly) {
    query.isActive = true
  }
  
  const routings = await VendorShippingRouting.find(query)
    .sort({ createdAt: -1 })
    .lean()
  
  // Enrich with provider details
  const providerRefIds = [...new Set(routings.map((r: any) => r.shipmentServiceProviderRefId).filter(Boolean))]
  const providers = await ShipmentServiceProvider.find({ providerRefId: { $in: providerRefIds } })
    .select('providerRefId providerCode providerName providerType isActive')
    .lean()
  
  const providerMap = new Map(providers.map((p: any) => [p.providerRefId, p]))
  
  return routings.map((r: any) => {
    const plain = toPlainObject(r)
    const provider = providerMap.get(r.shipmentServiceProviderRefId)
    if (provider) {
      (plain as any).provider = {
        providerRefId: provider.providerRefId,
        providerCode: provider.providerCode,
        providerName: provider.providerName,
        providerType: provider.providerType,
        isActive: provider.isActive,
      }
    }
    return plain
  })
}

/**
 * Get all vendor shipping routings (with optional filters)
 */
export async function getAllVendorShippingRoutings(
  filters?: {
    vendorId?: string
    companyId?: string
    shipmentServiceProviderRefId?: number
    isActive?: boolean
  }
): Promise<any[]> {
  await connectDB()
  
  const query: any = {}
  if (filters?.vendorId) {
    query.vendorId = filters.vendorId
  }
  if (filters?.companyId) {
    query.companyId = filters.companyId
  }
  if (filters?.shipmentServiceProviderRefId) {
    query.shipmentServiceProviderRefId = filters.shipmentServiceProviderRefId
  }
  if (filters?.isActive !== undefined) {
    query.isActive = filters.isActive
  }
  
  const routings = await VendorShippingRouting.find(query)
    .sort({ vendorId: 1, createdAt: -1 })
    .lean()
  
  // Enrich with provider details
  const providerRefIds = [...new Set(routings.map((r: any) => r.shipmentServiceProviderRefId).filter(Boolean))]
  const providers = await ShipmentServiceProvider.find({ providerRefId: { $in: providerRefIds } })
    .select('providerRefId providerCode providerName providerType isActive')
    .lean()
  
  const providerMap = new Map(providers.map((p: any) => [p.providerRefId, p]))
  
  return routings.map((r: any) => {
    const plain = toPlainObject(r)
    const provider = providerMap.get(r.shipmentServiceProviderRefId)
    if (provider) {
      (plain as any).provider = {
        providerRefId: provider.providerRefId,
        providerCode: provider.providerCode,
        providerName: provider.providerName,
        providerType: provider.providerType,
        isActive: provider.isActive,
      }
    }
    return plain
  })
}

/**
 * Create vendor shipping routing
 */
export async function createVendorShippingRouting(
  routingData: {
    vendorId: string
    companyId: string
    shipmentServiceProviderRefId: number
    primaryCourierCode: string
    secondaryCourierCode?: string
    isActive?: boolean
  },
  createdBy?: string
): Promise<any> {
  await connectDB()
  
  // Validate provider exists and is active
  const provider = await ShipmentServiceProvider.findOne({ 
    providerRefId: routingData.shipmentServiceProviderRefId,
    isActive: true
  }).lean()
  
  if (!provider) {
    throw new Error(`Provider with Ref ID ${routingData.shipmentServiceProviderRefId} not found or inactive`)
  }

  // NOTE: Courier code validation
  // The primaryCourierCode stored here is the provider's courier identifier (e.g., "DTDC_SURFACE", "DTDC", courier_company_id)
  // This is validated at runtime when creating shipments, not at save time
  // This allows flexibility as provider courier lists may change
  // Runtime validation ensures the courier exists and is serviceable for the route
  
  // Check for existing active routing for same vendor + provider
  const existing = await VendorShippingRouting.findOne({
    vendorId: routingData.vendorId,
    shipmentServiceProviderRefId: routingData.shipmentServiceProviderRefId,
    isActive: true,
  })
  
  if (existing) {
    // Deactivate existing routing
    existing.isActive = false
    existing.updatedBy = createdBy
    await existing.save()
  }
  
  // Generate routing ID
  const routingId = generateShippingId('VSR')
  
  const routing = await VendorShippingRouting.create({
    routingId,
    vendorId: routingData.vendorId,
    companyId: routingData.companyId,
    shipmentServiceProviderRefId: routingData.shipmentServiceProviderRefId,
    primaryCourierCode: routingData.primaryCourierCode.toUpperCase().trim(),
    secondaryCourierCode: routingData.secondaryCourierCode?.toUpperCase().trim(),
    isActive: routingData.isActive ?? true,
    createdBy: createdBy?.trim(),
  })
  
  console.log(`[createVendorShippingRouting] ✅ Created routing: ${routingId} (Vendor: ${routingData.vendorId}, Provider: ${routingData.shipmentServiceProviderRefId})`)
  
  // AUTO-ENABLE: Automatically enable provider for company when vendor routing is created
  try {
    const CompanyShippingProvider = await import('../models/CompanyShippingProvider').then(m => m.default)
    const existingCompanyProvider = await CompanyShippingProvider.findOne({
      companyId: routingData.companyId,
      providerId: provider.providerId,
    }).lean()
    
    if (!existingCompanyProvider) {
      const companyShippingProviderId = generateShippingId('CSP')
      await CompanyShippingProvider.create({
        companyShippingProviderId,
        companyId: routingData.companyId,
        providerId: provider.providerId,
        isEnabled: true,
        isDefault: false,
        createdBy: createdBy || 'System (Auto-enabled from vendor routing)',
      })
      console.log(`[createVendorShippingRouting] ✅ Auto-enabled provider ${provider.providerId} for company ${routingData.companyId}`)
    } else if (!existingCompanyProvider.isEnabled) {
      // Enable if it exists but is disabled
      await CompanyShippingProvider.updateOne(
        { companyId: routingData.companyId, providerId: provider.providerId },
        { $set: { isEnabled: true, updatedBy: createdBy || 'System' } }
      )
      console.log(`[createVendorShippingRouting] ✅ Re-enabled provider ${provider.providerId} for company ${routingData.companyId}`)
    }
  } catch (error: any) {
    // Log but don't fail routing creation if provider enablement fails
    console.warn(`[createVendorShippingRouting] ⚠️ Failed to auto-enable provider for company:`, error.message)
  }
  
  return toPlainObject(routing.toObject())
}

/**
 * Update vendor shipping routing
 */
export async function updateVendorShippingRouting(
  routingId: string,
  updates: {
    primaryCourierCode?: string
    secondaryCourierCode?: string
    isActive?: boolean
  },
  updatedBy?: string
): Promise<any> {
  await connectDB()
  
  const routing = await VendorShippingRouting.findOne({ routingId })
  if (!routing) {
    throw new Error(`Routing not found: ${routingId}`)
  }
  
  if (updates.primaryCourierCode !== undefined) {
    routing.primaryCourierCode = updates.primaryCourierCode.toUpperCase().trim()
  }
  if (updates.secondaryCourierCode !== undefined) {
    routing.secondaryCourierCode = updates.secondaryCourierCode ? updates.secondaryCourierCode.toUpperCase().trim() : undefined
  }
  if (updates.isActive !== undefined) {
    routing.isActive = updates.isActive
  }
  if (updatedBy) {
    routing.updatedBy = updatedBy.trim()
  }
  
  await routing.save()
  
  console.log(`[updateVendorShippingRouting] ✅ Updated routing: ${routingId}`)
  
  return toPlainObject(routing.toObject())
}

/**
 * Delete vendor shipping routing
 */
export async function deleteVendorShippingRouting(routingId: string): Promise<void> {
  await connectDB()
  
  const result = await VendorShippingRouting.deleteOne({ routingId })
  if (result.deletedCount === 0) {
    throw new Error(`Routing not found: ${routingId}`)
  }
  
  console.log(`[deleteVendorShippingRouting] ✅ Deleted routing: ${routingId}`)
}

/**
 * Get active routing for a vendor and provider
 */
export async function getActiveVendorRouting(
  vendorId: string,
  shipmentServiceProviderRefId: number
): Promise<any | null> {
  await connectDB()
  
  const routing = await VendorShippingRouting.findOne({
    vendorId,
    shipmentServiceProviderRefId,
    isActive: true,
  }).lean()
  
  if (!routing) {
    return null
  }
  
  return toPlainObject(routing)
}

/**
 * Get active routing for a vendor and company (for shipment creation)
 * This is the primary function used at runtime to resolve courier selection
 */
export async function getActiveVendorRoutingForCompany(
  vendorId: string,
  companyId: string
): Promise<any | null> {
  await connectDB()
  
  console.log(`[getActiveVendorRoutingForCompany] Looking for routing: vendorId=${vendorId}, companyId=${companyId}`)
  
  const routing = await VendorShippingRouting.findOne({
    vendorId,
    companyId,
    isActive: true,
  })
    .sort({ createdAt: -1 }) // Get most recent if multiple
    .lean()
  
  if (!routing) {
    console.log(`[getActiveVendorRoutingForCompany] No active routing found for vendor=${vendorId}, company=${companyId}`)
    return null
  }
  
  const plainRouting = toPlainObject(routing)
  
  // Enrich with provider details
  const provider = await ShipmentServiceProvider.findOne({ 
    providerRefId: routing.shipmentServiceProviderRefId 
  })
    .select('providerRefId providerCode providerName providerType isActive')
    .lean()
  
  if (provider) {
    (plainRouting as any).provider = {
      providerRefId: provider.providerRefId,
      providerCode: provider.providerCode,
      providerName: provider.providerName,
      providerType: provider.providerType,
      isActive: provider.isActive,
    }
  }
  
  console.log(`[getActiveVendorRoutingForCompany] Found routing:`, {
    routingId: plainRouting.routingId,
    primaryCourierCode: plainRouting.primaryCourierCode,
    secondaryCourierCode: plainRouting.secondaryCourierCode,
    providerCode: (plainRouting as any).provider?.providerCode,
  })
  
  return plainRouting
}

