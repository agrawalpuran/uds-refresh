/**
 * LogisticsProvider Interface
 * 
 * Provider-agnostic interface for logistics/shipment operations.
 * All provider-specific logic is isolated behind this abstraction.
 */

export interface ServiceabilityResult {
  success?: boolean // Optional for backward compatibility
  serviceable: boolean
  estimatedDays?: number
  message?: string
  availableCouriers?: Array<{
    courierCode: string
    courierName: string
    estimatedDays?: number
    estimatedCost?: number // Shipping cost in INR
    currency?: string // Currency code (default: INR)
    serviceTypes?: string[]
  }>
  rawResponse?: any
}

export interface CreateShipmentPayload {
  prNumber: string
  poNumber?: string
  vendorId: string
  companyId: string
  fromAddress: {
    name: string
    address: string
    city: string
    state: string
    pincode: string
    phone: string
    email?: string
  }
  toAddress: {
    name: string
    address: string
    city: string
    state: string
    pincode: string
    phone: string
    email?: string
  }
  items: Array<{
    productName: string
    quantity: number
    weight?: number
    dimensions?: {
      length?: number
      width?: number
      height?: number
    }
  }>
  shipmentValue?: number
  paymentMode?: 'PREPAID' | 'COD'
  codAmount?: number
  courierCode?: string // Primary courier code from vendor routing (optional, provider-specific)
  // Package dimensions (MANDATORY for aggregator shipments)
  lengthCm?: number // Package length in cm
  breadthCm?: number // Package breadth in cm
  heightCm?: number // Package height in cm
  weight?: number // Chargeable weight in kg (MAX of dead weight and volumetric weight)
  volumetricWeight?: number // Calculated volumetric weight in kg
}

export interface CreateShipmentResult {
  success: boolean
  providerShipmentReference: string
  trackingNumber?: string
  trackingUrl?: string
  estimatedDeliveryDate?: Date
  awbNumber?: string
  error?: string
  rawResponse?: any
}

export interface ShipmentStatusResult {
  success: boolean
  status: 'CREATED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED'
  trackingNumber?: string
  trackingUrl?: string
  currentLocation?: string
  estimatedDeliveryDate?: Date
  deliveredDate?: Date
  error?: string
  rawResponse?: any
}

export interface CancelShipmentResult {
  success: boolean
  cancelled: boolean
  message?: string
  error?: string
  rawResponse?: any
}

export interface HealthCheckResult {
  healthy: boolean
  message?: string
  responseTime?: number
  error?: string
}

// Optional test/diagnostic methods
export interface SupportedCourier {
  courierCode: string
  courierName: string
  serviceTypes: ('SURFACE' | 'AIR' | 'EXPRESS')[]
  isActive?: boolean
}

export interface ShippingRate {
  courierCode: string
  courierName: string
  serviceType: 'SURFACE' | 'AIR' | 'EXPRESS'
  estimatedCost: number
  estimatedDeliveryDays: number
  currency?: string
  rawResponse?: any
}

export interface GetSupportedCouriersResult {
  success: boolean
  couriers?: SupportedCourier[]
  error?: string
  rawResponse?: any
}

export interface GetShippingRatesResult {
  success: boolean
  rates?: ShippingRate[]
  error?: string
  rawResponse?: any
}

// ============================================================================
// PICKUP SCHEDULING INTERFACES (ADD-ON FEATURE)
// ============================================================================

export interface SchedulePickupPayload {
  awbNumber: string // AWB number from shipment
  providerShipmentReference: string // Provider's shipment reference (e.g., order_id)
  warehouseId: string // Warehouse Ref ID
  pickupDate: Date // Scheduled pickup date
  pickupTimeSlot?: string // Optional time slot (e.g., "10:00-13:00")
  contactName: string // Contact person name
  contactPhone: string // Contact phone (normalized 10 digits)
  warehouseAddress: {
    addressLine1: string
    addressLine2?: string
    city: string
    state: string
    pincode: string
    country?: string
  }
}

export interface SchedulePickupResult {
  success: boolean
  pickupReferenceId?: string // Provider's pickup reference ID
  pickupDate?: Date // Confirmed pickup date
  pickupTimeSlot?: string // Confirmed time slot
  message?: string
  error?: string
  rawResponse?: any
}

/**
 * LogisticsProvider Interface
 * 
 * All logistics providers must implement this interface.
 * This ensures provider-agnostic execution throughout the system.
 */
export interface LogisticsProvider {
  /**
   * Provider identifier
   */
  readonly providerId: string
  readonly providerCode: string
  readonly providerName: string

  /**
   * Create a shipment via provider API
   */
  createShipment(payload: CreateShipmentPayload): Promise<CreateShipmentResult>

  /**
   * Get current status of a shipment
   */
  getShipmentStatus(providerShipmentReference: string): Promise<ShipmentStatusResult>

  /**
   * Check if a pincode is serviceable
   * @param pincode Delivery pincode
   * @param fromPincode Pickup pincode (optional)
   * @param weight Shipment weight in kg (optional, provider-specific)
   * @param codAmount COD amount (optional, provider-specific)
   * @param courierCode Specific courier code to check (optional, filters results)
   */
  checkServiceability(pincode: string, fromPincode?: string, weight?: number, codAmount?: number, courierCode?: string): Promise<ServiceabilityResult>

  /**
   * Cancel a shipment
   */
  cancelShipment(providerShipmentReference: string): Promise<CancelShipmentResult>

  /**
   * Health check for provider API
   */
  healthCheck(): Promise<HealthCheckResult>

  // ============================================================================
  // OPTIONAL TEST/DIAGNOSTIC METHODS
  // These methods are optional and may not be supported by all providers
  // ============================================================================

  /**
   * Get list of supported courier partners (OPTIONAL)
   * Returns undefined if not supported by provider
   */
  getSupportedCouriers?(): Promise<GetSupportedCouriersResult>

  /**
   * Get shipping rates for a route (OPTIONAL)
   * Returns undefined if not supported by provider
   */
  getShippingRates?(
    fromPincode: string,
    toPincode: string,
    weight: number,
    codAmount?: number,
    dimensions?: { length?: number; width?: number; height?: number }
  ): Promise<GetShippingRatesResult>

  // ============================================================================
  // PICKUP SCHEDULING METHODS (OPTIONAL - ADD-ON FEATURE)
  // These methods are optional and may not be supported by all providers
  // ============================================================================

  /**
   * Schedule a pickup for a shipment (OPTIONAL)
   * Returns undefined if not supported by provider
   */
  schedulePickup?(payload: SchedulePickupPayload): Promise<SchedulePickupResult>

  /**
   * Reschedule an existing pickup (OPTIONAL)
   * Returns undefined if not supported by provider
   */
  reschedulePickup?(pickupReferenceId: string, payload: SchedulePickupPayload): Promise<SchedulePickupResult>
}

/**
 * Normalize provider status to UDS standard status
 */
export function normalizeShipmentStatus(providerStatus: string): 'CREATED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' {
  const normalized = providerStatus.toUpperCase().trim()
  
  if (normalized.includes('CREATED') || normalized.includes('PICKED') || normalized.includes('BOOKED')) {
    return 'CREATED'
  }
  if (normalized.includes('IN_TRANSIT') || normalized.includes('TRANSIT') || normalized.includes('SHIPPED')) {
    return 'IN_TRANSIT'
  }
  if (normalized.includes('DELIVERED') || normalized.includes('COMPLETED')) {
    return 'DELIVERED'
  }
  if (normalized.includes('FAILED') || normalized.includes('CANCELLED') || normalized.includes('REJECTED')) {
    return 'FAILED'
  }
  
  // Default to IN_TRANSIT for unknown statuses
  return 'IN_TRANSIT'
}

