/**
 * MockProvider Adapter
 * 
 * Mock implementation of LogisticsProvider for testing without real API calls.
 * Simulates provider responses for development and testing purposes.
 * 
 * This can be used when:
 * - Real provider API is not available
 * - Testing payload structure
 * - Development without API credentials
 * - Integration testing
 */

import {
  LogisticsProvider,
  CreateShipmentPayload,
  CreateShipmentResult,
  ShipmentStatusResult,
  ServiceabilityResult,
  CancelShipmentResult,
  HealthCheckResult,
  GetSupportedCouriersResult,
  GetShippingRatesResult,
  SupportedCourier,
  ShippingRate,
} from './LogisticsProvider'

interface MockConfig {
  simulateDelay?: boolean
  simulateErrors?: boolean
  errorRate?: number // 0-1, probability of error
}

export class MockProvider implements LogisticsProvider {
  readonly providerId: string
  readonly providerCode: string = 'MOCK'
  readonly providerName: string = 'Mock Logistics Provider'
  
  private config: MockConfig
  private shipments: Map<string, any> = new Map() // Store mock shipments

  constructor(providerId: string) {
    this.providerId = providerId
    this.config = {
      simulateDelay: false,
      simulateErrors: false,
      errorRate: 0.1, // 10% error rate by default
    }
  }

  /**
   * Initialize provider with config
   */
  async initialize(config?: MockConfig): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config }
    }
  }

  /**
   * Simulate network delay
   */
  private async delay(ms: number = 100): Promise<void> {
    if (this.config.simulateDelay) {
      await new Promise(resolve => setTimeout(resolve, ms))
    }
  }

  /**
   * Simulate random errors
   */
  private shouldFail(): boolean {
    if (!this.config.simulateErrors) return false
    return Math.random() < (this.config.errorRate || 0.1)
  }

  /**
   * Create shipment
   */
  async createShipment(payload: CreateShipmentPayload): Promise<CreateShipmentResult> {
    await this.delay(200)

    if (this.shouldFail()) {
      return {
        success: false,
        providerShipmentReference: '',
        error: 'Mock error: Simulated API failure',
        rawResponse: { error: 'Simulated failure' },
      }
    }

    // Generate mock shipment reference
    const shipmentRef = `MOCK-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
    const trackingNumber = `TRACK-${Date.now()}`
    const trackingUrl = `https://track.mock.com/${trackingNumber}`
    
    // Calculate estimated delivery (3-5 days)
    const estimatedDelivery = new Date()
    estimatedDelivery.setDate(estimatedDelivery.getDate() + Math.floor(Math.random() * 3) + 3)

    // Store mock shipment
    this.shipments.set(shipmentRef, {
      reference: shipmentRef,
      status: 'CREATED',
      trackingNumber,
      trackingUrl,
      estimatedDelivery,
      payload,
      createdAt: new Date(),
    })

    return {
      success: true,
      providerShipmentReference: shipmentRef,
      trackingNumber,
      trackingUrl,
      estimatedDeliveryDate: estimatedDelivery,
      awbNumber: `AWB-${Date.now()}`,
      rawResponse: {
        shipment_id: shipmentRef,
        tracking_number: trackingNumber,
        tracking_url: trackingUrl,
        estimated_delivery_date: estimatedDelivery.toISOString(),
        awb: `AWB-${Date.now()}`,
      },
    }
  }

  /**
   * Get shipment status
   */
  async getShipmentStatus(providerShipmentReference: string): Promise<ShipmentStatusResult> {
    await this.delay(150)

    const shipment = this.shipments.get(providerShipmentReference)
    
    if (!shipment) {
      return {
        success: false,
        status: 'FAILED',
        error: 'Shipment not found',
        rawResponse: { error: 'Not found' },
      }
    }

    // Simulate status progression
    const daysSinceCreation = Math.floor((Date.now() - shipment.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    let status: 'CREATED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' = 'CREATED'
    
    if (daysSinceCreation >= 5) {
      status = 'DELIVERED'
      shipment.deliveredDate = new Date()
    } else if (daysSinceCreation >= 1) {
      status = 'IN_TRANSIT'
    }

    shipment.status = status

    return {
      success: true,
      status,
      trackingNumber: shipment.trackingNumber,
      trackingUrl: shipment.trackingUrl,
      currentLocation: status === 'IN_TRANSIT' ? 'Mumbai Hub' : undefined,
      estimatedDeliveryDate: shipment.estimatedDelivery,
      deliveredDate: shipment.deliveredDate,
      rawResponse: {
        status,
        tracking_number: shipment.trackingNumber,
        tracking_url: shipment.trackingUrl,
        current_location: status === 'IN_TRANSIT' ? 'Mumbai Hub' : undefined,
        estimated_delivery_date: shipment.estimatedDelivery.toISOString(),
        delivered_date: shipment.deliveredDate?.toISOString(),
      },
    }
  }

  /**
   * Check serviceability
   */
  async checkServiceability(pincode: string, fromPincode?: string, weight?: number, codAmount?: number, courierCode?: string): Promise<ServiceabilityResult> {
    await this.delay(100)

    // Mock: Serviceable for most pincodes, not serviceable for some
    const notServiceablePincodes = ['999999', '000000']
    const serviceable = !notServiceablePincodes.includes(pincode)

    // Mock available couriers
    const mockCouriers = [
      { courierCode: 'MOCK1', courierName: 'Mock Courier Express', estimatedDays: 2 },
      { courierCode: 'MOCK2', courierName: 'Mock Courier Standard', estimatedDays: 5 },
      { courierCode: 'MOCK3', courierName: 'Mock Courier Economy', estimatedDays: 7 },
    ]

    // Filter by courier code if specified
    let availableCouriers = serviceable ? mockCouriers : []
    if (courierCode && serviceable) {
      availableCouriers = mockCouriers.filter(c => 
        c.courierCode.toLowerCase().includes(courierCode.toLowerCase()) ||
        c.courierName.toLowerCase().includes(courierCode.toLowerCase())
      )
    }

    return {
      success: true,
      serviceable: availableCouriers.length > 0,
      estimatedDays: serviceable ? Math.floor(Math.random() * 3) + 3 : undefined,
      message: serviceable 
        ? courierCode
          ? `Serviceable by ${availableCouriers.length} courier(s) matching "${courierCode}"`
          : `Serviceable by ${availableCouriers.length} courier(s)`
        : 'Not serviceable in this area',
      availableCouriers: availableCouriers.map(c => ({
        courierCode: c.courierCode,
        courierName: c.courierName,
        estimatedDays: c.estimatedDays,
        serviceTypes: ['EXPRESS', 'STANDARD', 'ECONOMY'],
      })),
      rawResponse: {
        serviceable,
        estimated_days: serviceable ? Math.floor(Math.random() * 3) + 3 : undefined,
        message: serviceable ? 'Serviceable' : 'Not serviceable in this area',
      },
    }
  }

  /**
   * Cancel shipment
   */
  async cancelShipment(providerShipmentReference: string): Promise<CancelShipmentResult> {
    await this.delay(100)

    const shipment = this.shipments.get(providerShipmentReference)
    
    if (!shipment) {
      return {
        success: false,
        cancelled: false,
        error: 'Shipment not found',
        rawResponse: { error: 'Not found' },
      }
    }

    if (shipment.status === 'DELIVERED') {
      return {
        success: false,
        cancelled: false,
        error: 'Cannot cancel delivered shipment',
        rawResponse: { error: 'Already delivered' },
      }
    }

    shipment.status = 'FAILED'
    shipment.cancelled = true

    return {
      success: true,
      cancelled: true,
      message: 'Shipment cancelled successfully',
      rawResponse: {
        cancelled: true,
        status: 'CANCELLED',
        message: 'Shipment cancelled successfully',
      },
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    await this.delay(50)

    if (this.shouldFail()) {
      return {
        healthy: false,
        error: 'Mock health check failure',
      }
    }

    return {
      healthy: true,
      message: 'Mock provider is healthy',
      responseTime: Math.floor(Math.random() * 50) + 20, // 20-70ms
    }
  }

  /**
   * Get all mock shipments (for testing/debugging)
   */
  getAllShipments(): any[] {
    return Array.from(this.shipments.values())
  }

  /**
   * Clear all mock shipments (for testing)
   */
  clearShipments(): void {
    this.shipments.clear()
  }

  // ============================================================================
  // OPTIONAL TEST/DIAGNOSTIC METHODS
  // ============================================================================

  /**
   * Get supported courier partners (Mock)
   */
  async getSupportedCouriers(): Promise<GetSupportedCouriersResult> {
    await this.delay(100)

    const mockCouriers: SupportedCourier[] = [
      {
        courierCode: 'MOCK001',
        courierName: 'Mock Express Courier',
        serviceTypes: ['AIR', 'EXPRESS'],
        isActive: true,
      },
      {
        courierCode: 'MOCK002',
        courierName: 'Mock Surface Logistics',
        serviceTypes: ['SURFACE'],
        isActive: true,
      },
      {
        courierCode: 'MOCK003',
        courierName: 'Mock Multi-Mode Carrier',
        serviceTypes: ['SURFACE', 'AIR'],
        isActive: true,
      },
    ]

    return {
      success: true,
      couriers: mockCouriers,
      rawResponse: { couriers: mockCouriers },
    }
  }

  /**
   * Get shipping rates (Mock)
   */
  async getShippingRates(
    fromPincode: string,
    toPincode: string,
    weight: number,
    codAmount: number = 0,
    dimensions?: { length?: number; width?: number; height?: number }
  ): Promise<GetShippingRatesResult> {
    await this.delay(150)

    const mockRates: ShippingRate[] = [
      {
        courierCode: 'MOCK001',
        courierName: 'Mock Express Courier',
        serviceType: 'AIR',
        estimatedCost: Math.round(weight * 50 + (codAmount > 0 ? 20 : 0)),
        estimatedDeliveryDays: 2,
        currency: 'INR',
      },
      {
        courierCode: 'MOCK002',
        courierName: 'Mock Surface Logistics',
        serviceType: 'SURFACE',
        estimatedCost: Math.round(weight * 30 + (codAmount > 0 ? 15 : 0)),
        estimatedDeliveryDays: 5,
        currency: 'INR',
      },
      {
        courierCode: 'MOCK003',
        courierName: 'Mock Multi-Mode Carrier',
        serviceType: 'SURFACE',
        estimatedCost: Math.round(weight * 35 + (codAmount > 0 ? 18 : 0)),
        estimatedDeliveryDays: 4,
        currency: 'INR',
      },
    ]

    return {
      success: true,
      rates: mockRates,
      rawResponse: { rates: mockRates },
    }
  }
}

