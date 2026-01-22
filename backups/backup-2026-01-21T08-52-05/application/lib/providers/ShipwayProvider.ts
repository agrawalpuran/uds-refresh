/**
 * ShipwayProvider Adapter
 * 
 * Concrete implementation of LogisticsProvider for Shipway logistics.
 * Handles all Shipway-specific API calls, authentication, and data mapping.
 */

import {
  LogisticsProvider,
  CreateShipmentPayload,
  CreateShipmentResult,
  ShipmentStatusResult,
  ServiceabilityResult,
  CancelShipmentResult,
  HealthCheckResult,
  normalizeShipmentStatus
} from './LogisticsProvider'
import { encrypt, decrypt } from '@/lib/utils/encryption'

interface ShipwayConfig {
  apiKey: string
  apiSecret: string
  apiBaseUrl: string
  apiVersion?: string
}

interface ShipwayCreateShipmentRequest {
  order_id: string
  from_name: string
  from_address: string
  from_city: string
  from_state: string
  from_pincode: string
  from_phone: string
  from_email?: string
  to_name: string
  to_address: string
  to_city: string
  to_state: string
  to_pincode: string
  to_phone: string
  to_email?: string
  items: Array<{
    name: string
    quantity: number
    weight?: number
  }>
  payment_mode?: 'prepaid' | 'cod'
  cod_amount?: number
  shipment_value?: number
}

export class ShipwayProvider implements LogisticsProvider {
  readonly providerId: string
  readonly providerCode: string = 'SHIPWAY'
  readonly providerName: string = 'Shipway Logistics'
  
  private config: ShipwayConfig | null = null

  constructor(providerId: string) {
    this.providerId = providerId
  }

  /**
   * Initialize provider with credentials
   */
  async initialize(config: ShipwayConfig): Promise<void> {
    this.config = config
  }

  /**
   * Create authentication headers
   */
  private getAuthHeaders(): Record<string, string> {
    if (!this.config) {
      throw new Error('ShipwayProvider not initialized. Call initialize() first.')
    }

    // Shipway typically uses API key authentication
    // Adjust based on actual Shipway API requirements
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'X-API-Key': this.config.apiKey,
      'X-API-Secret': this.config.apiSecret,
      'Content-Type': 'application/json',
    }
  }

  /**
   * Make API request to Shipway
   */
  private async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<any> {
    if (!this.config) {
      throw new Error('ShipwayProvider not initialized')
    }

    const url = `${this.config.apiBaseUrl}${this.config.apiVersion ? `/${this.config.apiVersion}` : ''}${endpoint}`
    
    const response = await fetch(url, {
      method,
      headers: this.getAuthHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Shipway API error (${response.status}): ${errorText}`)
    }

    return response.json()
  }

  /**
   * Create shipment
   */
  async createShipment(payload: CreateShipmentPayload): Promise<CreateShipmentResult> {
    try {
      if (!this.config) {
        throw new Error('ShipwayProvider not initialized')
      }

      // Map UDS payload to Shipway format
      const shipwayPayload: ShipwayCreateShipmentRequest = {
        order_id: payload.prNumber,
        from_name: payload.fromAddress.name,
        from_address: payload.fromAddress.address,
        from_city: payload.fromAddress.city,
        from_state: payload.fromAddress.state,
        from_pincode: payload.fromAddress.pincode,
        from_phone: payload.fromAddress.phone,
        from_email: payload.fromAddress.email,
        to_name: payload.toAddress.name,
        to_address: payload.toAddress.address,
        to_city: payload.toAddress.city,
        to_state: payload.toAddress.state,
        to_pincode: payload.toAddress.pincode,
        to_phone: payload.toAddress.phone,
        to_email: payload.toAddress.email,
        items: payload.items.map(item => ({
          name: item.productName,
          quantity: item.quantity,
          weight: item.weight,
        })),
        payment_mode: payload.paymentMode?.toLowerCase() as 'prepaid' | 'cod' | undefined,
        cod_amount: payload.codAmount,
        shipment_value: payload.shipmentValue,
      }

      const response = await this.makeRequest('/shipments', 'POST', shipwayPayload)

      // Map Shipway response to UDS format
      // Adjust field names based on actual Shipway API response
      return {
        success: true,
        providerShipmentReference: response.shipment_id || response.id || response.reference,
        trackingNumber: response.tracking_number || response.awb,
        trackingUrl: response.tracking_url || response.tracking_link,
        estimatedDeliveryDate: response.estimated_delivery_date 
          ? new Date(response.estimated_delivery_date)
          : undefined,
        awbNumber: response.awb || response.awb_number,
        rawResponse: response,
      }
    } catch (error: any) {
      return {
        success: false,
        providerShipmentReference: '',
        error: error.message || 'Unknown error',
        rawResponse: { error: error.message },
      }
    }
  }

  /**
   * Get shipment status
   */
  async getShipmentStatus(providerShipmentReference: string): Promise<ShipmentStatusResult> {
    try {
      if (!this.config) {
        throw new Error('ShipwayProvider not initialized')
      }

      const response = await this.makeRequest(`/shipments/${providerShipmentReference}/status`)

      // Map Shipway status to UDS status
      const normalizedStatus = normalizeShipmentStatus(response.status || response.shipment_status)

      return {
        success: true,
        status: normalizedStatus,
        trackingNumber: response.tracking_number || response.awb,
        trackingUrl: response.tracking_url || response.tracking_link,
        currentLocation: response.current_location || response.location,
        estimatedDeliveryDate: response.estimated_delivery_date
          ? new Date(response.estimated_delivery_date)
          : undefined,
        deliveredDate: response.delivered_date
          ? new Date(response.delivered_date)
          : undefined,
        rawResponse: response,
      }
    } catch (error: any) {
      return {
        success: false,
        status: 'FAILED',
        error: error.message || 'Unknown error',
        rawResponse: { error: error.message },
      }
    }
  }

  /**
   * Check serviceability
   */
  async checkServiceability(pincode: string, fromPincode?: string, weight?: number, codAmount?: number, courierCode?: string): Promise<ServiceabilityResult> {
    try {
      if (!this.config) {
        throw new Error('ShipwayProvider not initialized')
      }

      const params = new URLSearchParams({ pincode })
      if (fromPincode) {
        params.append('from_pincode', fromPincode)
      }

      const response = await this.makeRequest(`/serviceability?${params.toString()}`)

      return {
        serviceable: response.serviceable === true || response.is_serviceable === true,
        estimatedDays: response.estimated_days || response.estimated_delivery_days,
        message: response.message || response.reason,
        rawResponse: response,
      }
    } catch (error: any) {
      return {
        serviceable: false,
        message: error.message || 'Serviceability check failed',
        rawResponse: { error: error.message },
      }
    }
  }

  /**
   * Cancel shipment
   */
  async cancelShipment(providerShipmentReference: string): Promise<CancelShipmentResult> {
    try {
      if (!this.config) {
        throw new Error('ShipwayProvider not initialized')
      }

      const response = await this.makeRequest(`/shipments/${providerShipmentReference}/cancel`, 'POST')

      return {
        success: true,
        cancelled: response.cancelled === true || response.status === 'CANCELLED',
        message: response.message || 'Shipment cancelled successfully',
        rawResponse: response,
      }
    } catch (error: any) {
      return {
        success: false,
        cancelled: false,
        error: error.message || 'Unknown error',
        rawResponse: { error: error.message },
      }
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      if (!this.config) {
        return {
          healthy: false,
          message: 'Provider not initialized',
        }
      }

      const startTime = Date.now()
      const response = await this.makeRequest('/health', 'GET')
      const responseTime = Date.now() - startTime

      return {
        healthy: response.status === 'ok' || response.healthy === true,
        message: response.message,
        responseTime,
      }
    } catch (error: any) {
      return {
        healthy: false,
        error: error.message || 'Health check failed',
      }
    }
  }
}

