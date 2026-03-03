/**
 * MTM (Made-to-Measure) Data Access Layer
 * 
 * Self-contained data access functions for all MTM operations.
 * Kept separate from the main data-access.ts monolith to follow
 * the extension-based architecture pattern.
 * 
 * Follows the same conventions as category-helpers.ts and
 * feature-config-access.ts: connectDB at start, model imports,
 * toPlainObject helper, exported async functions.
 */

import connectDB from './mongodb'
import MTMSpecification, { IMTMSpecification } from '../models/MTMSpecification'
import ProductMTMConfig, { IProductMTMConfig } from '../models/ProductMTMConfig'
import VendorMTMCapability, { IVendorMTMCapability } from '../models/VendorMTMCapability'
import MeasurementProfile, { IMeasurementProfile } from '../models/MeasurementProfile'
import OrderMTMMeasurement, { IOrderMTMMeasurement } from '../models/OrderMTMMeasurement'
import Company from '../models/Company'

// =============================================================================
// HELPERS
// =============================================================================

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

function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `${prefix}-${timestamp}-${random}`.toUpperCase()
}

// =============================================================================
// MTM FEATURE FLAG
// =============================================================================

/**
 * Check if MTM is enabled for a company
 */
export async function isCompanyMTMEnabled(companyId: string): Promise<boolean> {
  await connectDB()
  const company = await Company.findOne({ id: companyId }).select('enable_mtm').lean()
  return company?.enable_mtm === true
}

// =============================================================================
// MTM SPECIFICATIONS
// =============================================================================

/**
 * Get all MTM specifications for a company
 */
export async function getMTMSpecifications(
  companyId: string,
  filters?: { garment_category?: string; status?: string }
): Promise<any[]> {
  await connectDB()

  const query: any = { companyId }
  if (filters?.garment_category) query.garment_category = filters.garment_category
  if (filters?.status) query.status = filters.status
  else query.status = 'active'

  const specs = await MTMSpecification.find(query).sort({ garment_category: 1 }).lean()
  return specs.map(toPlainObject)
}

/**
 * Get a single MTM specification by ID
 */
export async function getMTMSpecificationById(specId: string): Promise<any | null> {
  await connectDB()
  const spec = await MTMSpecification.findOne({ id: specId }).lean()
  return spec ? toPlainObject(spec) : null
}

/**
 * Create a new MTM specification
 */
export async function createMTMSpecification(data: {
  companyId: string
  garment_category: string
  specification_name: string
  measurement_points: any[]
  created_by?: string
}): Promise<any> {
  await connectDB()

  const id = generateId('MTMSPEC')

  const spec = await MTMSpecification.create({
    id,
    companyId: data.companyId,
    garment_category: data.garment_category,
    specification_name: data.specification_name,
    measurement_points: data.measurement_points,
    version: 1,
    status: 'active',
    created_by: data.created_by,
  })

  return toPlainObject(spec.toObject())
}

/**
 * Update an MTM specification
 */
export async function updateMTMSpecification(
  specId: string,
  updates: {
    specification_name?: string
    measurement_points?: any[]
    status?: 'active' | 'inactive'
    updated_by?: string
  }
): Promise<any | null> {
  await connectDB()

  const spec = await MTMSpecification.findOne({ id: specId })
  if (!spec) return null

  if (updates.specification_name !== undefined) spec.specification_name = updates.specification_name
  if (updates.measurement_points !== undefined) {
    spec.measurement_points = updates.measurement_points
    spec.version = (spec.version || 1) + 1
  }
  if (updates.status !== undefined) spec.status = updates.status
  if (updates.updated_by !== undefined) spec.updated_by = updates.updated_by

  await spec.save()
  return toPlainObject(spec.toObject())
}

export async function deleteMTMSpecification(specId: string): Promise<boolean> {
  await connectDB()
  const result = await MTMSpecification.deleteOne({ id: specId })
  return result.deletedCount > 0
}

// =============================================================================
// PRODUCT MTM CONFIG
// =============================================================================

/**
 * Get MTM config for products (which products support MTM)
 */
export async function getProductMTMConfigs(
  companyId: string,
  filters?: { productId?: string; status?: string }
): Promise<any[]> {
  await connectDB()

  const query: any = { companyId }
  if (filters?.productId) query.productId = filters.productId
  if (filters?.status) query.status = filters.status
  // Return ALL configs (both active and inactive) so the UI can show toggle state
  // Previously this defaulted to 'active' only, hiding disabled products

  const configs = await ProductMTMConfig.find(query).lean()
  return configs.map(doc => {
    const obj = toPlainObject(doc)
    obj.is_mtm_enabled = obj.status === 'active'
    return obj
  })
}

/**
 * Get MTM config for a specific product + company
 */
export async function getProductMTMConfig(
  productId: string,
  companyId: string
): Promise<any | null> {
  await connectDB()
  const config = await ProductMTMConfig.findOne({ productId, companyId, status: 'active' }).lean()
  return config ? toPlainObject(config) : null
}

/**
 * Create or update product MTM config (upsert)
 */
export async function upsertProductMTMConfig(data: {
  productId: string
  companyId: string
  mtm_specification_id?: string
  is_mtm_enabled?: boolean
  mtm_price_premium?: number
  estimated_production_days?: number
  status?: 'active' | 'inactive'
  created_by?: string
}): Promise<any> {
  await connectDB()

  // Map is_mtm_enabled boolean to status string
  const resolvedStatus = data.is_mtm_enabled !== undefined
    ? (data.is_mtm_enabled ? 'active' : 'inactive')
    : (data.status || 'active')

  const existing = await ProductMTMConfig.findOne({
    productId: data.productId,
    companyId: data.companyId,
  })

  if (existing) {
    if (data.mtm_specification_id) existing.mtm_specification_id = data.mtm_specification_id
    if (data.mtm_price_premium !== undefined) existing.mtm_price_premium = data.mtm_price_premium
    if (data.estimated_production_days !== undefined) existing.estimated_production_days = data.estimated_production_days
    existing.status = resolvedStatus
    existing.updated_by = data.created_by
    await existing.save()
    const result = toPlainObject(existing.toObject())
    result.is_mtm_enabled = existing.status === 'active'
    return result
  }

  const config = await ProductMTMConfig.create({
    productId: data.productId,
    companyId: data.companyId,
    mtm_specification_id: data.mtm_specification_id,
    mtm_price_premium: data.mtm_price_premium || 0,
    estimated_production_days: data.estimated_production_days,
    status: resolvedStatus,
    created_by: data.created_by,
  })

  const result = toPlainObject(config.toObject())
  result.is_mtm_enabled = config.status === 'active'
  return result
}

// =============================================================================
// VENDOR MTM CAPABILITIES
// =============================================================================

/**
 * Get MTM capabilities for a vendor
 */
export async function getVendorMTMCapabilities(
  vendorId: string,
  filters?: { garment_category?: string; is_active?: boolean }
): Promise<any[]> {
  await connectDB()

  const query: any = { vendorId }
  if (filters?.garment_category) query.garment_category = filters.garment_category
  if (filters?.is_active !== undefined) query.is_active = filters.is_active
  else query.is_active = true

  const capabilities = await VendorMTMCapability.find(query).sort({ garment_category: 1 }).lean()
  return capabilities.map(toPlainObject)
}

/**
 * Check if a vendor is MTM-capable for a specific garment category
 */
export async function isVendorMTMCapable(
  vendorId: string,
  garment_category: string
): Promise<boolean> {
  await connectDB()
  const capability = await VendorMTMCapability.findOne({
    vendorId,
    garment_category,
    is_active: true,
  }).lean()
  return !!capability
}

/**
 * Create or update vendor MTM capability (upsert)
 */
export async function upsertVendorMTMCapability(data: {
  vendorId: string
  garment_category: string
  is_active?: boolean
  max_daily_capacity?: number
  avg_production_days?: number
  quality_rating?: number
  notes?: string
  created_by?: string
}): Promise<any> {
  await connectDB()

  const existing = await VendorMTMCapability.findOne({
    vendorId: data.vendorId,
    garment_category: data.garment_category,
  })

  if (existing) {
    if (data.is_active !== undefined) existing.is_active = data.is_active
    if (data.max_daily_capacity !== undefined) existing.max_daily_capacity = data.max_daily_capacity
    if (data.avg_production_days !== undefined) existing.avg_production_days = data.avg_production_days
    if (data.quality_rating !== undefined) existing.quality_rating = data.quality_rating
    if (data.notes !== undefined) existing.notes = data.notes
    existing.updated_by = data.created_by
    await existing.save()
    return toPlainObject(existing.toObject())
  }

  const capability = await VendorMTMCapability.create({
    vendorId: data.vendorId,
    garment_category: data.garment_category,
    is_active: data.is_active !== undefined ? data.is_active : true,
    max_daily_capacity: data.max_daily_capacity,
    avg_production_days: data.avg_production_days,
    quality_rating: data.quality_rating,
    notes: data.notes,
    created_by: data.created_by,
  })

  return toPlainObject(capability.toObject())
}

// =============================================================================
// MEASUREMENT PROFILES
// =============================================================================

/**
 * Get the active measurement profile for an employee
 */
export async function getActiveMeasurementProfile(
  employeeId: string
): Promise<any | null> {
  await connectDB()
  const profile = await MeasurementProfile.findOne({
    employeeId,
    is_active: true,
    status: 'active',
  }).lean()
  return profile ? toPlainObject(profile) : null
}

/**
 * Get all measurement profiles for an employee (including inactive)
 */
export async function getMeasurementProfiles(
  employeeId: string,
  filters?: { status?: string }
): Promise<any[]> {
  await connectDB()

  const query: any = { employeeId }
  if (filters?.status) query.status = filters.status

  const profiles = await MeasurementProfile.find(query)
    .sort({ captured_at: -1 })
    .lean()
  return profiles.map(toPlainObject)
}

/**
 * Create a new measurement profile for an employee.
 * Automatically deactivates any previous active profile (handled by pre-save hook).
 */
export async function createMeasurementProfile(data: {
  employeeId: string
  companyId: string
  measurements: Record<string, { value: number; unit: 'cm' | 'inches' }>
  capture_method: 'MANUAL_TAPE' | 'PHOTO_AI' | 'PROFESSIONAL' | 'SELF_REPORTED'
  captured_by?: string
  notes?: string
  created_by?: string
}): Promise<any> {
  await connectDB()

  const id = generateId('MPROF')

  const profile = await MeasurementProfile.create({
    id,
    employeeId: data.employeeId,
    companyId: data.companyId,
    measurements: data.measurements,
    capture_method: data.capture_method,
    captured_by: data.captured_by,
    captured_at: new Date(),
    is_active: true,
    status: 'active',
    notes: data.notes,
    created_by: data.created_by,
  })

  return toPlainObject(profile.toObject())
}

/**
 * Update a measurement profile
 */
export async function updateMeasurementProfile(
  profileId: string,
  updates: {
    measurements?: Record<string, { value: number; unit: 'cm' | 'inches' }>
    capture_method?: 'MANUAL_TAPE' | 'PHOTO_AI' | 'PROFESSIONAL' | 'SELF_REPORTED'
    captured_by?: string
    notes?: string
    is_active?: boolean
    status?: 'active' | 'inactive'
    updated_by?: string
  }
): Promise<any | null> {
  await connectDB()

  const profile = await MeasurementProfile.findOne({ id: profileId })
  if (!profile) return null

  if (updates.measurements !== undefined) {
    profile.measurements = new Map(Object.entries(updates.measurements)) as any
    profile.captured_at = new Date()
  }
  if (updates.capture_method !== undefined) profile.capture_method = updates.capture_method
  if (updates.captured_by !== undefined) profile.captured_by = updates.captured_by
  if (updates.notes !== undefined) profile.notes = updates.notes
  if (updates.is_active !== undefined) profile.is_active = updates.is_active
  if (updates.status !== undefined) profile.status = updates.status
  if (updates.updated_by !== undefined) profile.updated_by = updates.updated_by

  await profile.save()
  return toPlainObject(profile.toObject())
}

// =============================================================================
// ORDER MTM MEASUREMENTS
// =============================================================================

/**
 * Get MTM measurements for an order
 */
export async function getOrderMTMMeasurements(orderId: string): Promise<any[]> {
  await connectDB()
  const measurements = await OrderMTMMeasurement.find({ order_id: orderId })
    .sort({ item_index: 1 })
    .lean()
  return measurements.map(toPlainObject)
}

/**
 * Get MTM measurement for a specific order item
 */
export async function getOrderItemMTMMeasurement(
  orderId: string,
  itemIndex: number
): Promise<any | null> {
  await connectDB()
  const measurement = await OrderMTMMeasurement.findOne({
    order_id: orderId,
    item_index: itemIndex,
  }).lean()
  return measurement ? toPlainObject(measurement) : null
}

/**
 * Create an MTM measurement record for an order item.
 * Called during order creation when an item has fit_type === 'MTM'.
 */
export async function createOrderMTMMeasurement(data: {
  order_id: string
  item_index: number
  product_id: string
  measurement_profile_id?: string
  mtm_specification_id: string
  measurements: Array<{ key: string; label: string; value: number; unit: 'cm' | 'inches' }>
  mtm_instructions?: string
  mtm_price_premium?: number
}): Promise<any> {
  await connectDB()

  const id = generateId('OMTM')

  const record = await OrderMTMMeasurement.create({
    id,
    order_id: data.order_id,
    item_index: data.item_index,
    product_id: data.product_id,
    measurement_profile_id: data.measurement_profile_id,
    mtm_specification_id: data.mtm_specification_id,
    measurements: data.measurements,
    mtm_instructions: data.mtm_instructions,
    mtm_price_premium: data.mtm_price_premium || 0,
  })

  return toPlainObject(record.toObject())
}

// =============================================================================
// COMPOSITE QUERIES (used by UI and order creation)
// =============================================================================

/**
 * Check if a product supports MTM for a given company.
 * Returns the specification details if MTM is available, null otherwise.
 */
export async function getProductMTMAvailability(
  productId: string,
  companyId: string
): Promise<{ available: boolean; config?: any; specification?: any } > {
  await connectDB()

  const mtmEnabled = await isCompanyMTMEnabled(companyId)
  if (!mtmEnabled) return { available: false }

  const config = await ProductMTMConfig.findOne({
    productId,
    companyId,
    status: 'active',
  }).lean()

  if (!config) return { available: false }

  const spec = await MTMSpecification.findOne({
    id: config.mtm_specification_id,
    status: 'active',
  }).lean()

  if (!spec) return { available: false }

  return {
    available: true,
    config: toPlainObject(config),
    specification: toPlainObject(spec),
  }
}

/**
 * Batch check MTM availability for multiple products in one company.
 * Returns a map of productId -> availability result.
 */
export async function getProductMTMAvailabilityBatch(
  productIds: string[],
  companyId: string
): Promise<Record<string, { available: boolean; config?: any; specification?: any }>> {
  await connectDB()

  const mtmEnabled = await isCompanyMTMEnabled(companyId)
  const result: Record<string, { available: boolean; config?: any; specification?: any }> = {}
  if (!mtmEnabled || productIds.length === 0) {
    for (const pid of productIds) result[pid] = { available: false }
    return result
  }

  const configs = await ProductMTMConfig.find({
    productId: { $in: productIds },
    companyId,
    status: 'active',
  }).lean()

  const specIds = [...new Set(configs.map((c: any) => c.mtm_specification_id).filter(Boolean))]
  const specs = specIds.length > 0
    ? await MTMSpecification.find({ id: { $in: specIds }, status: 'active' }).lean()
    : []
  const specMap = new Map(specs.map((s: any) => [s.id, s]))

  const configByProduct = new Map(configs.map((c: any) => [c.productId, c]))

  for (const pid of productIds) {
    const config = configByProduct.get(pid)
    if (!config) {
      result[pid] = { available: false }
      continue
    }
    const spec = specMap.get(config.mtm_specification_id)
    if (!spec) {
      result[pid] = { available: false }
      continue
    }
    result[pid] = {
      available: true,
      config: toPlainObject(config),
      specification: toPlainObject(spec),
    }
  }
  return result
}

/**
 * Validate that a vendor can fulfill an MTM order for a garment category.
 * Used during order creation to ensure the assigned vendor supports MTM.
 */
export async function validateVendorMTMCapability(
  vendorId: string,
  garment_category: string
): Promise<{ capable: boolean; capability?: any }> {
  await connectDB()

  const capability = await VendorMTMCapability.findOne({
    vendorId,
    garment_category,
    is_active: true,
  }).lean()

  return {
    capable: !!capability,
    capability: capability ? toPlainObject(capability) : undefined,
  }
}
