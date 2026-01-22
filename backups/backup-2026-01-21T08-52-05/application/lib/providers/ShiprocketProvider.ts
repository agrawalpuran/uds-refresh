/**
 * ShiprocketProvider Adapter
 * 
 * ============================================================================
 * UDS CONTEXT - Uniform Distribution System
 * ============================================================================
 * 
 * This provider is part of the Uniform Distribution System (UDS), a comprehensive
 * B2B2C cloud-based platform that automates uniform distribution, tracking, and
 * management for companies with distributed workforces.
 * 
 * SYSTEM OVERVIEW:
 * - UDS manages uniform ordering, eligibility tracking, and fulfillment workflows
 * - Multi-role portals: Company Admin, Employee/Consumer, Vendor, Super Admin
 * - Handles order approval, vendor coordination, and shipment execution
 * - Built on Next.js 16.0.3, TypeScript, MongoDB Atlas
 * - Deployed on Vercel: https://github.com/agrawalpuran/UDS.git
 * 
 * SHIPPING INTEGRATION ARCHITECTURE:
 * - UDS uses a provider abstraction layer (LogisticsProvider interface)
 * - Multiple providers supported: Shiprocket, Shipway, and others
 * - ShiprocketProvider implements the LogisticsProvider interface
 * - Handles shipment creation, tracking, pickup scheduling, and status sync
 * 
 * DATA FLOW:
 * 1. Order created in UDS → Vendor fulfills → Shipment execution triggered
 * 2. Shipment execution calls provider.createShipment() with UDS payload
 * 3. Provider maps UDS format → Shiprocket API format
 * 4. Shiprocket returns shipment_id, AWB, tracking details
 * 5. Provider maps Shiprocket response → UDS format
 * 6. UDS stores providerShipmentReference (shipment_id) for future operations
 * 
 * KEY UDS INTEGRATION POINTS:
 * - createShipment(): Called from lib/db/shipment-execution.ts
 * - getShipmentStatus(): Used for status synchronization
 * - schedulePickup(): Called from API route /api/shipments/[id]/pickup/schedule
 * - checkServiceability(): Used for courier routing and rate calculation
 * 
 * CRITICAL UDS REQUIREMENTS:
 * - providerShipmentReference MUST be shipment_id (not order_id)
 * - All downstream APIs (AWB, pickup, tracking) require shipment_id
 * - Status normalization: Shiprocket status → UDS standard status
 * - Field mapping: UDS payload → Shiprocket format (see inline comments)
 * 
 * ============================================================================
 * PROVIDER IMPLEMENTATION
 * ============================================================================
 * 
 * Concrete implementation of LogisticsProvider for Shiprocket logistics.
 * Handles all Shiprocket-specific API calls, authentication, and data mapping.
 * 
 * API Documentation: https://apidocs.shiprocket.in/
 */

import {
  LogisticsProvider,
  CreateShipmentPayload,
  CreateShipmentResult,
  ShipmentStatusResult,
  ServiceabilityResult,
  CancelShipmentResult,
  HealthCheckResult,
  normalizeShipmentStatus,
  GetSupportedCouriersResult,
  GetShippingRatesResult,
  SupportedCourier,
  ShippingRate,
  SchedulePickupPayload,
  SchedulePickupResult
} from './LogisticsProvider'

interface ShiprocketConfig {
  email: string
  password: string
  apiBaseUrl: string
  token?: string // Cached token (valid for 240 hours / 10 days)
  tokenExpiry?: Date
}

interface ShiprocketAuthResponse {
  token: string
  email: string
  id: number
  company_id: number
  first_name: string
  last_name: string
  created_at: string
}

interface ShiprocketCreateShipmentRequest {
  order_id: string
  order_date: string
  pickup_location: string
  billing_customer_name: string
  billing_last_name?: string
  billing_address: string
  billing_address_2?: string
  billing_city: string
  billing_state: string
  billing_pincode: string
  billing_country: string
  billing_email: string
  billing_phone: string
  shipping_is_billing: boolean
  shipping_customer_name: string
  shipping_last_name?: string
  shipping_address: string
  shipping_address_2?: string
  shipping_city: string
  shipping_state: string
  shipping_pincode: string
  shipping_country: string
  shipping_email: string
  shipping_phone: string
  order_items: Array<{
    name: string
    sku: string
    units: number
    selling_price: number
  }>
  payment_method: string
  sub_total: number
  length?: number
  breadth?: number
  height?: number
  weight?: number
  order_pickup_courier_id?: number // Optional: Pre-select courier (courier_company_id from Shiprocket)
}

export class ShiprocketProvider implements LogisticsProvider {
  readonly providerId: string
  readonly providerCode: string = 'SHIPROCKET'
  readonly providerName: string = 'Shiprocket'
  
  private config: ShiprocketConfig | null = null

  constructor(providerId: string) {
    this.providerId = providerId
  }

  /**
   * Initialize provider with credentials
   */
  async initialize(config: ShiprocketConfig): Promise<void> {
    // Normalize API Base URL (remove trailing slash)
    const normalizedApiBaseUrl = config.apiBaseUrl?.replace(/\/+$/, '') || 'https://apiv2.shiprocket.in'
    
    this.config = {
      ...config,
      apiBaseUrl: normalizedApiBaseUrl,
    }
    
    // Authenticate and get token if not provided or expired
    if (!this.config.token || (this.config.tokenExpiry && new Date() >= this.config.tokenExpiry)) {
      await this.authenticate()
    }
  }

  /**
   * Authenticate with Shiprocket API and get token
   */
  private async authenticate(): Promise<void> {
    if (!this.config) {
      throw new Error('ShiprocketProvider not initialized')
    }

    try {
      // Normalize URL to avoid double slashes
      const baseUrl = this.config.apiBaseUrl.replace(/\/+$/, '')
      const loginUrl = `${baseUrl}/v1/external/auth/login`
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: this.config.email,
          password: this.config.password,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Shiprocket authentication failed (${response.status}): ${errorText}`)
      }

      const authData: ShiprocketAuthResponse = await response.json()
      
      // Store token and calculate expiry (240 hours = 10 days)
      this.config.token = authData.token
      this.config.tokenExpiry = new Date(Date.now() + 240 * 60 * 60 * 1000) // 240 hours from now
      
      console.log(`[ShiprocketProvider] ✅ Authenticated successfully. Token expires: ${this.config.tokenExpiry.toISOString()}`)
    } catch (error: any) {
      console.error('[ShiprocketProvider] Authentication error:', error)
      throw new Error(`Failed to authenticate with Shiprocket: ${error.message}`)
    }
  }

  /**
   * Get authentication headers
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.config) {
      throw new Error('ShiprocketProvider not initialized')
    }

    // Refresh token if expired
    if (!this.config.token || (this.config.tokenExpiry && new Date() >= this.config.tokenExpiry)) {
      await this.authenticate()
    }

    return {
      'Authorization': `Bearer ${this.config.token}`,
      'Content-Type': 'application/json',
    }
  }

  /**
   * Make API request to Shiprocket
   */
  private async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any,
    contentType: 'json' | 'form-urlencoded' = 'json'
  ): Promise<any> {
    if (!this.config) {
      throw new Error('ShiprocketProvider not initialized')
    }

    // Normalize URL to avoid double slashes
    const baseUrl = this.config.apiBaseUrl.replace(/\/+$/, '')
    const endpointPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    const url = `${baseUrl}${endpointPath}`
    const authHeaders = await this.getAuthHeaders()
    
    // Prepare headers based on content type
    // Note: getAuthHeaders() may include Content-Type, so we'll override it based on contentType parameter
    const headers: Record<string, string> = {
      ...authHeaders,
    }
    
    // Remove Content-Type from authHeaders if present (we'll set it based on contentType parameter)
    delete headers['Content-Type']
    
    // Prepare body based on content type
    let requestBody: string | undefined = undefined
    if (body) {
      if (contentType === 'form-urlencoded') {
        // Convert object to URL-encoded form data
        const formData = new URLSearchParams()
        for (const key in body) {
          if (body.hasOwnProperty(key)) {
            const value = body[key]
            // Handle arrays (e.g., shipment_id: [123, 456])
            if (Array.isArray(value)) {
              // Shiprocket pickup API expects shipment_id as array
              // Format: shipment_id[0]=123&shipment_id[1]=456
              // OR: shipment_id=123,456 (comma-separated)
              // Based on Shiprocket API docs, use indexed format
              value.forEach((item, index) => {
                formData.append(`${key}[${index}]`, item.toString())
              })
            } else if (value !== null && value !== undefined) {
              formData.append(key, value.toString())
            }
          }
        }
        requestBody = formData.toString()
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
        
        // Log the form-encoded body for debugging
        console.log('[ShiprocketProvider] [makeRequest] Form-encoded body:', requestBody)
      } else {
        // Default: JSON
        requestBody = JSON.stringify(body)
        headers['Content-Type'] = 'application/json'
      }
    }
    
    const response = await fetch(url, {
      method,
      headers,
      body: requestBody,
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorData: any = null
      try {
        errorData = JSON.parse(errorText)
      } catch {
        // If not JSON, use text as-is
        errorData = errorText
      }
      
      // Create error object with full details
      const error = new Error(`Shiprocket API error (${response.status}): ${typeof errorData === 'string' ? errorData : JSON.stringify(errorData)}`)
      ;(error as any).response = {
        status: response.status,
        data: errorData,
        text: errorText,
      }
      throw error
    }

    return response.json()
  }

  /**
   * Create shipment
   */
  async createShipment(payload: CreateShipmentPayload): Promise<CreateShipmentResult> {
    console.log('[ShiprocketProvider] ==========================================')
    console.log('[ShiprocketProvider] [START] createShipment() called')
    console.log('[ShiprocketProvider] Timestamp:', new Date().toISOString())
    console.log('[ShiprocketProvider] Payload Summary:', {
      prNumber: payload.prNumber,
      fromAddress: { name: payload.fromAddress?.name, city: payload.fromAddress?.city, pincode: payload.fromAddress?.pincode },
      toAddress: { name: payload.toAddress?.name, city: payload.toAddress?.city, pincode: payload.toAddress?.pincode },
      courierCode: payload.courierCode,
      lengthCm: payload.lengthCm,
      breadthCm: payload.breadthCm,
      heightCm: payload.heightCm,
      weight: payload.weight,
    })
    console.log('[ShiprocketProvider] ==========================================')
    try {
      if (!this.config) {
        throw new Error('ShiprocketProvider not initialized')
      }

      // Default phone numbers (stored as constants)
      const DEFAULT_SENDER_PHONE = '9845154070' // Sender/Vendor phone number
      const DEFAULT_RECEIVER_PHONE = '8197077749' // Receiver/Employee phone number

      // Helper function to format phone number for Shiprocket (10 digits, no spaces/special chars)
      const formatPhoneForShiprocket = (phone: string | undefined | null, defaultPhone: string, phoneType: 'sender' | 'receiver'): string => {
        if (!phone || phone.trim() === '' || phone === '0000000000') {
          console.log(`[ShiprocketProvider] Using default ${phoneType} phone: ${defaultPhone}`)
          return defaultPhone
        }
        // Remove all non-digit characters
        const digitsOnly = phone.replace(/\D/g, '')
        // If it's 10 digits, use it
        if (digitsOnly.length === 10) {
          console.log(`[ShiprocketProvider] Using formatted ${phoneType} phone: ${digitsOnly} (from: ${phone})`)
          return digitsOnly
        }
        // If it starts with country code (91) and has 12 digits, remove country code
        if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
          const formatted = digitsOnly.substring(2)
          console.log(`[ShiprocketProvider] Using formatted ${phoneType} phone: ${formatted} (removed country code from: ${phone})`)
          return formatted
        }
        // Fallback to default if format is invalid
        console.log(`[ShiprocketProvider] Invalid ${phoneType} phone format: ${phone}, using default: ${defaultPhone}`)
        return defaultPhone
      }

      // Format phone numbers to ensure they're valid for Shiprocket
      const formattedBillingPhone = formatPhoneForShiprocket(payload.fromAddress.phone, DEFAULT_SENDER_PHONE, 'sender')
      const formattedShippingPhone = formatPhoneForShiprocket(payload.toAddress.phone, DEFAULT_RECEIVER_PHONE, 'receiver')

      // Map UDS payload to Shiprocket format
      const shiprocketPayload: ShiprocketCreateShipmentRequest = {
        order_id: payload.prNumber,
        order_date: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
        pickup_location: 'Primary', // Default pickup location, can be configured
        billing_customer_name: payload.fromAddress.name.split(' ')[0] || payload.fromAddress.name,
        billing_last_name: payload.fromAddress.name.split(' ').slice(1).join(' ') || undefined,
        billing_address: payload.fromAddress.address,
        billing_city: payload.fromAddress.city,
        billing_state: payload.fromAddress.state,
        billing_pincode: payload.fromAddress.pincode,
        billing_country: 'India',
        billing_email: payload.fromAddress.email || 'vendor@example.com',
        billing_phone: formattedBillingPhone,
        shipping_is_billing: false, // Different shipping address
        shipping_customer_name: payload.toAddress.name.split(' ')[0] || payload.toAddress.name,
        shipping_last_name: payload.toAddress.name.split(' ').slice(1).join(' ') || undefined,
        shipping_address: payload.toAddress.address,
        shipping_city: payload.toAddress.city,
        shipping_state: payload.toAddress.state,
        shipping_pincode: payload.toAddress.pincode,
        shipping_country: 'India',
        shipping_email: payload.toAddress.email || 'employee@example.com',
        shipping_phone: formattedShippingPhone,
        order_items: payload.items.map((item, index) => ({
          name: item.productName,
          sku: `SKU-${payload.prNumber}-${index}`,
          units: item.quantity,
          selling_price: payload.shipmentValue ? Math.round(payload.shipmentValue / payload.items.reduce((sum, i) => sum + i.quantity, 0)) : 0,
        })),
        payment_method: payload.paymentMode === 'COD' ? 'COD' : 'Prepaid',
        sub_total: payload.shipmentValue || 0,
        // Use chargeable weight from payload, or calculate from items, or use package weight
        weight: payload.weight || payload.items.reduce((sum, item) => sum + (item.weight || 0), 0),
        // Package dimensions (MANDATORY for aggregator shipments)
        length: payload.lengthCm,
        breadth: payload.breadthCm,
        height: payload.heightCm,
      }

      // If courierCode is provided from vendor routing, try to resolve it to courier_company_id
      if (payload.courierCode) {
        console.log(`[ShiprocketProvider] createShipment: courierCode provided from routing: ${payload.courierCode}`)
        try {
          // Get supported couriers to find matching courier_company_id
          const couriersResult = await this.getSupportedCouriers()
          if (couriersResult.success && couriersResult.couriers) {
            const searchCode = payload.courierCode.trim().toLowerCase()
            const matchingCourier = couriersResult.couriers.find((c: any) => {
              const courierCode = (c.courierCode || '').toLowerCase()
              const courierName = (c.courierName || '').toLowerCase()
              return courierCode === searchCode || 
                     courierName.includes(searchCode) || 
                     searchCode.includes(courierCode) ||
                     searchCode.includes(courierName.split(' ')[0]) // Match "DTDC" in "DTDC Surface"
            })
            
            if (matchingCourier) {
              // Use the courier code (which should be courier_company_id)
              const courierCompanyId = matchingCourier.courierCode
              if (courierCompanyId && /^\d+$/.test(courierCompanyId)) {
                shiprocketPayload.order_pickup_courier_id = parseInt(courierCompanyId, 10)
                console.log(`[ShiprocketProvider] createShipment: Resolved courier code to courier_company_id: ${courierCompanyId}`)
              } else {
                console.warn(`[ShiprocketProvider] createShipment: Could not resolve courier code to numeric ID: ${courierCompanyId}`)
              }
            } else {
              console.warn(`[ShiprocketProvider] createShipment: No matching courier found for code: ${payload.courierCode}`)
            }
          }
        } catch (error) {
          console.error(`[ShiprocketProvider] createShipment: Error resolving courier code:`, error)
          // Continue without courier selection - Shiprocket will auto-select
        }
      }

      // Step 1: Create the order via Shiprocket
      console.log('[ShiprocketProvider] ==========================================')
      console.log('[ShiprocketProvider] [STEP 1] CREATING ORDER via Shiprocket API')
      console.log('[ShiprocketProvider] Timestamp:', new Date().toISOString())
      console.log('[ShiprocketProvider] Endpoint: POST /v1/external/orders/create/adhoc')
      console.log('[ShiprocketProvider] Request Payload:', JSON.stringify(shiprocketPayload, null, 2))
      console.log('[ShiprocketProvider] ==========================================')
      
      const createResponse = await this.makeRequest('/v1/external/orders/create/adhoc', 'POST', shiprocketPayload)
      
      // Log FULL create response for debugging
      console.log('[ShiprocketProvider] ==========================================')
      console.log('[ShiprocketProvider] [STEP 1 RESULT] ORDER CREATE RESPONSE (FULL):')
      console.log('[ShiprocketProvider] Timestamp:', new Date().toISOString())
      console.log('[ShiprocketProvider]', JSON.stringify(createResponse, null, 2))
      console.log('[ShiprocketProvider] ==========================================')
      
      console.log('[ShiprocketProvider] [STEP 1 SUMMARY] Order created successfully:', {
        order_id: createResponse.order_id,
        shipment_id: createResponse.shipment_id,
        status: createResponse.status,
        has_awb_code: !!createResponse.awb_code,
        awb_code: createResponse.awb_code,
        awb_code_from_create: createResponse.awb_code || createResponse.awbCode || createResponse.awb,
      })

      // ====================================================
      // CRITICAL: Extract shipment_id (MANDATORY for all downstream operations)
      // Shiprocket returns BOTH order_id and shipment_id:
      // - order_id: Shiprocket internal order reference
      // - shipment_id: Shiprocket shipment execution reference (MANDATORY for AWB, pickup, tracking)
      // ====================================================
      const shipmentId = createResponse.shipment_id || createResponse.shipmentId
      const orderId = createResponse.order_id?.toString()
      
      console.log('[ShiprocketProvider] ==========================================')
      console.log('[ShiprocketProvider] [CRITICAL] EXTRACTING SHIPMENT IDENTIFIERS')
      console.log('[ShiprocketProvider] order_id (for audit only):', orderId)
      console.log('[ShiprocketProvider] shipment_id (MANDATORY for API calls):', shipmentId)
      console.log('[ShiprocketProvider] ==========================================')
      
      if (!shipmentId) {
        console.error('[ShiprocketProvider] ❌ CRITICAL ERROR: shipment_id not found in create response')
        console.error('[ShiprocketProvider] Full create response:', JSON.stringify(createResponse, null, 2))
        throw new Error(
          'Shiprocket shipment_id not received from API. ' +
          'This is MANDATORY for AWB assignment, pickup scheduling, and tracking. ' +
          'Cannot proceed with shipment creation.'
        )
      }
      
      // Validate shipment_id is a valid number or string
      const shipmentIdStr = shipmentId.toString().trim()
      if (!shipmentIdStr || shipmentIdStr === '0' || shipmentIdStr === 'null' || shipmentIdStr === 'undefined') {
        console.error('[ShiprocketProvider] ❌ CRITICAL ERROR: shipment_id is invalid:', shipmentIdStr)
        throw new Error(`Invalid shipment_id received from Shiprocket: ${shipmentIdStr}. Cannot proceed.`)
      }
      
      console.log('[ShiprocketProvider] ✅ shipment_id validated:', shipmentIdStr)

      // Check if AWB already exists in create response (Shiprocket may auto-assign)
      let awbCode: string | undefined = createResponse.awb_code || 
                                        createResponse.awbCode || 
                                        createResponse.awb ||
                                        createResponse.tracking_number ||
                                        createResponse.trackingNumber
      
      if (awbCode) {
        console.log('[ShiprocketProvider] ✅ AWB already present in create response:', awbCode)
        console.log('[ShiprocketProvider] Skipping assign/awb call - AWB already assigned')
      } else {
        console.log('[ShiprocketProvider] ⚠️ No AWB in create response, proceeding with assign/awb call')
      }

      // Step 2: Assign AWB number immediately after order creation (only if not already present)
      let awbAssignResponse: any = null
      let orderDetailsResponse: any = null

      if (!awbCode) {
        console.log('[ShiprocketProvider] ==========================================')
        console.log('[ShiprocketProvider] [STEP 2] ASSIGNING AWB via Shiprocket API')
        console.log('[ShiprocketProvider] Timestamp:', new Date().toISOString())
        console.log('[ShiprocketProvider] shipment_id:', shipmentId)
        console.log('[ShiprocketProvider] ==========================================')
        
        const awbAssignPayload: any = {
          shipment_id: shipmentId,
        }

        // If we have a courier selected, include it in AWB assignment
        if (shiprocketPayload.order_pickup_courier_id) {
          awbAssignPayload.courier_id = shiprocketPayload.order_pickup_courier_id
          console.log('[ShiprocketProvider] Including courier_id in AWB assignment:', awbAssignPayload.courier_id)
        }

        console.log('[ShiprocketProvider] AWB Assign Payload:', JSON.stringify(awbAssignPayload, null, 2))

        try {
          awbAssignResponse = await this.makeRequest('/v1/external/courier/assign/awb', 'POST', awbAssignPayload)
        
          // Log FULL assign/awb response for debugging
          console.log('[ShiprocketProvider] ==========================================')
          console.log('[ShiprocketProvider] [STEP 2 RESULT] AWB ASSIGN RESPONSE (FULL):')
          console.log('[ShiprocketProvider] Timestamp:', new Date().toISOString())
          console.log('[ShiprocketProvider]', JSON.stringify(awbAssignResponse, null, 2))
          console.log('[ShiprocketProvider] ==========================================')
          
          // Extract AWB code from response - check multiple possible field names
          // Shiprocket API may return: awb_code, awbCode, awb, response.awb_code, data.awb_code, etc.
          const awbFromAssign = awbAssignResponse.awb_code || 
                        awbAssignResponse.awbCode || 
                        awbAssignResponse.awb ||
                        awbAssignResponse.response?.awb_code ||
                        awbAssignResponse.data?.awb_code ||
                        awbAssignResponse.response?.awbCode ||
                        awbAssignResponse.data?.awbCode ||
                        (Array.isArray(awbAssignResponse.response) && awbAssignResponse.response[0]?.awb_code) ||
                        (Array.isArray(awbAssignResponse.data) && awbAssignResponse.data[0]?.awb_code)
          
          if (awbFromAssign) {
            awbCode = awbFromAssign
            console.log('[ShiprocketProvider] ✅ AWB from assign/awb response:', awbCode)
          } else {
            console.log('[ShiprocketProvider] ⚠️ AWB not found in assign/awb response, will fetch from order details')
          }

        } catch (assignError: any) {
          console.error('[ShiprocketProvider] ==========================================')
          console.error('[ShiprocketProvider] [STEP 2 ERROR] AWB ASSIGN FAILED')
          console.error('[ShiprocketProvider] Timestamp:', new Date().toISOString())
          console.error('[ShiprocketProvider] Error Type:', assignError.constructor.name)
          console.error('[ShiprocketProvider] Error Message:', assignError.message)
          console.error('[ShiprocketProvider] Error Stack:', assignError.stack)
          if (assignError.response) {
            console.error('[ShiprocketProvider] Error Response Status:', assignError.response?.status)
            console.error('[ShiprocketProvider] Error Response Data:', JSON.stringify(assignError.response?.data || assignError.response, null, 2))
          }
          console.error('[ShiprocketProvider] Full Error Object:', JSON.stringify(assignError, Object.getOwnPropertyNames(assignError), 2))
          console.error('[ShiprocketProvider] ==========================================')
          
          // Check if error is "Cannot reassign" - this means AWB already exists
          const errorMessage = assignError.message || JSON.stringify(assignError.response?.data || assignError.response || assignError)
          if (errorMessage.includes('Cannot reassign') || errorMessage.includes('Current AWB')) {
            console.log('[ShiprocketProvider] ⚠️ AWB assignment failed because AWB already exists - attempting to extract AWB from error message')
            
            // Try to extract AWB from error message (e.g., "Current AWB 7D123951305")
            const awbMatch = errorMessage.match(/Current AWB\s+([A-Z0-9]+)/i) || 
                            errorMessage.match(/AWB[:\s]+([A-Z0-9]+)/i) ||
                            errorMessage.match(/([A-Z]\d{10,})/i) // Pattern like "7D123951305"
            
            if (awbMatch && awbMatch[1]) {
              const extractedAWB = awbMatch[1].trim()
              console.log('[ShiprocketProvider] ✅ Extracted AWB from error message:', extractedAWB)
              awbCode = extractedAWB
            } else {
              console.log('[ShiprocketProvider] ⚠️ Could not extract AWB from error message, will fetch from order details')
            }
          } else {
            // For other errors, throw immediately
            throw new Error(`Failed to assign AWB: ${assignError.message || 'Unknown error'}. Shipment created but cannot be tracked.`)
          }
        }
      }

      // Step 3: Fetch order details using order_id to get AWB (if order_id is available)
      // Note: We use order_id here only for fetching AWB, but shipment_id is what we store
      // AWB may not be immediately available, so we retry with delays
      if (orderId) {
        // Only wait if we don't have AWB yet
        if (!awbCode) {
          // Wait a bit before fetching order details (AWB assignment may take time to propagate)
          const initialDelay = 5000 // 5 seconds
          const maxRetries = 3
          const retryDelay = 3000 // 3 seconds between retries
          
          console.log('[ShiprocketProvider] ==========================================')
          console.log('[ShiprocketProvider] [STEP 3] FETCHING ORDER DETAILS (AWB not yet found)')
          console.log('[ShiprocketProvider] Timestamp:', new Date().toISOString())
          console.log('[ShiprocketProvider] Current AWB Status:', awbCode ? `✅ Found: ${awbCode}` : '❌ Not found')
          console.log('[ShiprocketProvider] Waiting', initialDelay, 'ms (5 seconds) before first fetch (AWB may need time to propagate)...')
          console.log('[ShiprocketProvider] ==========================================')
          await new Promise(resolve => setTimeout(resolve, initialDelay))
          
          let awbFromOrderDetails: string | undefined = undefined
          
          // Retry logic: Try fetching order details multiple times with delays
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              console.log('[ShiprocketProvider] ==========================================')
              console.log(`[ShiprocketProvider] [STEP 3 ATTEMPT ${attempt}/${maxRetries}] FETCHING ORDER DETAILS`)
              console.log('[ShiprocketProvider] Timestamp:', new Date().toISOString())
              console.log('[ShiprocketProvider] Endpoint: GET /v1/external/orders/show/${orderId}')
              console.log('[ShiprocketProvider] order_id:', orderId)
              console.log('[ShiprocketProvider] ==========================================')
              
              const fetchStartTime = Date.now()
              orderDetailsResponse = await this.makeRequest(`/v1/external/orders/show/${orderId}`, 'GET')
              const fetchDuration = Date.now() - fetchStartTime
              
              console.log('[ShiprocketProvider] ==========================================')
              console.log(`[ShiprocketProvider] [STEP 3 ATTEMPT ${attempt} RESULT] ORDER DETAILS RESPONSE (FULL)`)
              console.log('[ShiprocketProvider] Timestamp:', new Date().toISOString())
              console.log('[ShiprocketProvider] Fetch Duration:', fetchDuration, 'ms')
              console.log('[ShiprocketProvider]', JSON.stringify(orderDetailsResponse, null, 2))
              console.log('[ShiprocketProvider] ==========================================')
              
              // Extract AWB from order details
              // According to Shiprocket API docs: /v1/external/orders/show/{order_id} returns awb_code at top level
              // Reference: https://apidocs.shiprocket.in/
              
              // PRIMARY: Check top-level fields first (as per Shiprocket API documentation)
              // The API returns awb_code directly in the response object
              awbFromOrderDetails = orderDetailsResponse.awb_code || 
                            orderDetailsResponse.tracking_number || 
                            orderDetailsResponse.awb ||
                            orderDetailsResponse.airwaybill_number
              
              console.log('[ShiprocketProvider] Primary extraction check:', {
                'awb_code': orderDetailsResponse.awb_code,
                'tracking_number': orderDetailsResponse.tracking_number,
                'awb': orderDetailsResponse.awb,
                'airwaybill_number': orderDetailsResponse.airwaybill_number,
                'result': awbFromOrderDetails
              })
              
              // SECONDARY: If not found at top level, check nested structures
              // Some API versions or responses may wrap the data
              if (!awbFromOrderDetails) {
                // Check data wrapper (common in some API versions)
                if (orderDetailsResponse.data) {
                  const dataObj = orderDetailsResponse.data
                  awbFromOrderDetails = dataObj.awb_code || 
                                dataObj.tracking_number || 
                                dataObj.awb ||
                                dataObj.airwaybill_number
                  if (awbFromOrderDetails) {
                    console.log('[ShiprocketProvider] ✅ Found AWB in data wrapper:', awbFromOrderDetails)
                  }
                }
                
                // Check shipment object (single shipment)
                if (!awbFromOrderDetails && orderDetailsResponse.shipment) {
                  const shipmentObj = orderDetailsResponse.shipment
                  awbFromOrderDetails = shipmentObj.awb_code || 
                                shipmentObj.tracking_number || 
                                shipmentObj.awb ||
                                shipmentObj.airwaybill_number
                  if (awbFromOrderDetails) {
                    console.log('[ShiprocketProvider] ✅ Found AWB in shipment object:', awbFromOrderDetails)
                  }
                }
                
                // Check shipments array (multiple shipments - take first)
                if (!awbFromOrderDetails && Array.isArray(orderDetailsResponse.shipments) && orderDetailsResponse.shipments.length > 0) {
                  const firstShipment = orderDetailsResponse.shipments[0]
                  awbFromOrderDetails = firstShipment.awb_code || 
                                firstShipment.tracking_number || 
                                firstShipment.awb ||
                                firstShipment.airwaybill_number
                  if (awbFromOrderDetails) {
                    console.log('[ShiprocketProvider] ✅ Found AWB in shipments array[0]:', awbFromOrderDetails)
                  }
                }
                
                // Check response wrapper (some API versions)
                if (!awbFromOrderDetails && orderDetailsResponse.response) {
                  const responseObj = orderDetailsResponse.response
                  awbFromOrderDetails = responseObj.awb_code || 
                                responseObj.tracking_number || 
                                responseObj.awb ||
                                responseObj.airwaybill_number
                  if (awbFromOrderDetails) {
                    console.log('[ShiprocketProvider] ✅ Found AWB in response wrapper:', awbFromOrderDetails)
                  }
                }
              }
              
              console.log('[ShiprocketProvider] AWB extraction result:', awbFromOrderDetails ? `✅ Found: ${awbFromOrderDetails}` : '❌ Not found')
              
              // If still not found, do a deep search and log everything
              if (!awbFromOrderDetails) {
                console.warn('[ShiprocketProvider] ⚠️ AWB not found using standard extraction. Performing deep search...')
                
                // Deep search function to find AWB anywhere in the object
                const deepSearchAWB = (obj: any, path: string = ''): string | null => {
                  if (!obj || typeof obj !== 'object') return null
                  
                  // Check current level for AWB-like fields
                  const awbFields = ['awb_code', 'awbCode', 'awb', 'tracking_number', 'trackingNumber', 'airwaybill_number', 'airwaybillNumber']
                  for (const field of awbFields) {
                    if (obj[field] && typeof obj[field] === 'string' && obj[field].trim().length > 0) {
                      const value = obj[field].trim()
                      // AWB format: usually alphanumeric, 8-15 chars (e.g., "7D123950995")
                      if (/^[A-Z0-9]{8,15}$/i.test(value)) {
                        console.log(`[ShiprocketProvider] ✅ Found AWB via deep search at path: ${path}.${field} = ${value}`)
                        return value
                      }
                    }
                  }
                  
                  // Recursively search nested objects and arrays
                  for (const key in obj) {
                    if (obj.hasOwnProperty(key) && typeof obj[key] === 'object' && obj[key] !== null) {
                      const result = deepSearchAWB(obj[key], path ? `${path}.${key}` : key)
                      if (result) return result
                    }
                  }
                  
                  return null
                }
                
                const deepFoundAWB = deepSearchAWB(orderDetailsResponse)
                if (deepFoundAWB) {
                  awbFromOrderDetails = deepFoundAWB
                  console.log('[ShiprocketProvider] ✅ AWB found via deep search:', awbFromOrderDetails)
                } else {
                  console.warn('[ShiprocketProvider] ⚠️ AWB not found even with deep search. Full response structure:')
                  console.warn('[ShiprocketProvider] Top-level keys:', Object.keys(orderDetailsResponse || {}))
                  // Log first level of nested objects
                  for (const key in orderDetailsResponse) {
                    if (orderDetailsResponse[key] && typeof orderDetailsResponse[key] === 'object' && !Array.isArray(orderDetailsResponse[key])) {
                      console.warn(`[ShiprocketProvider] ${key} keys:`, Object.keys(orderDetailsResponse[key]))
                    } else if (Array.isArray(orderDetailsResponse[key]) && orderDetailsResponse[key].length > 0) {
                      console.warn(`[ShiprocketProvider] ${key}[0] keys:`, Object.keys(orderDetailsResponse[key][0]))
                    }
                  }
                }
              }
              
              if (awbFromOrderDetails) {
                console.log(`[ShiprocketProvider] ✅ [STEP 3 SUCCESS] AWB code retrieved from order details (Attempt ${attempt}):`, awbFromOrderDetails)
                // Use AWB from order details (most reliable)
                awbCode = awbFromOrderDetails
                break // Success, exit retry loop
              } else {
                console.warn(`[ShiprocketProvider] ⚠️ [STEP 3 ATTEMPT ${attempt}] AWB not found in order details`)
                console.warn('[ShiprocketProvider] Order details response keys:', Object.keys(orderDetailsResponse || {}))
                console.warn('[ShiprocketProvider] Checking nested structures...')
                
                // Log all possible AWB locations for debugging
                console.warn('[ShiprocketProvider] - orderDetailsResponse.awb_code:', orderDetailsResponse?.awb_code)
                console.warn('[ShiprocketProvider] - orderDetailsResponse.awbCode:', orderDetailsResponse?.awbCode)
                console.warn('[ShiprocketProvider] - orderDetailsResponse.shipment?.awb_code:', orderDetailsResponse?.shipment?.awb_code)
                console.warn('[ShiprocketProvider] - orderDetailsResponse.shipments?.[0]?.awb_code:', orderDetailsResponse?.shipments?.[0]?.awb_code)
                
                // If this is not the last attempt, wait before retrying
                if (attempt < maxRetries) {
                  console.log(`[ShiprocketProvider] ⏳ Waiting ${retryDelay}ms (${retryDelay/1000}s) before retry ${attempt + 1}...`)
                  const waitStart = Date.now()
                  await new Promise(resolve => setTimeout(resolve, retryDelay))
                  const waitDuration = Date.now() - waitStart
                  console.log(`[ShiprocketProvider] ✅ Waited ${waitDuration}ms, proceeding to attempt ${attempt + 1}`)
                } else {
                  console.error('[ShiprocketProvider] ❌ [STEP 3 FAILED] All retry attempts exhausted')
                }
              }
            } catch (orderFetchError: any) {
              console.error('[ShiprocketProvider] ==========================================')
              console.error(`[ShiprocketProvider] [STEP 3 ATTEMPT ${attempt} ERROR] Failed to fetch order details`)
              console.error('[ShiprocketProvider] Timestamp:', new Date().toISOString())
              console.error('[ShiprocketProvider] Error Type:', orderFetchError.constructor.name)
              console.error('[ShiprocketProvider] Error Message:', orderFetchError.message)
              console.error('[ShiprocketProvider] Error Stack:', orderFetchError.stack)
              if (orderFetchError.response) {
                console.error('[ShiprocketProvider] Error Response Status:', orderFetchError.response?.status)
                console.error('[ShiprocketProvider] Error Response Data:', JSON.stringify(orderFetchError.response?.data || orderFetchError.response, null, 2))
              }
              console.error('[ShiprocketProvider] ==========================================')
              
              // If this is not the last attempt, wait before retrying
              if (attempt < maxRetries) {
                console.log(`[ShiprocketProvider] ⏳ Waiting ${retryDelay}ms (${retryDelay/1000}s) before retry ${attempt + 1}...`)
                const waitStart = Date.now()
                await new Promise(resolve => setTimeout(resolve, retryDelay))
                const waitDuration = Date.now() - waitStart
                console.log(`[ShiprocketProvider] ✅ Waited ${waitDuration}ms, proceeding to attempt ${attempt + 1}`)
              } else {
                // Last attempt failed
                if (!awbCode) {
                  console.error('[ShiprocketProvider] ❌ [STEP 3 FINAL ERROR] Failed to fetch order details after all attempts')
                  throw new Error(`Failed to fetch order details after ${maxRetries} attempts: ${orderFetchError.message}. AWB not available from assign/awb response either.`)
                }
              }
            }
          }
          
          // If we still don't have AWB after all retries, try using getShipmentStatus as fallback
          // This method is known to work and uses the same endpoint
          if (!awbCode && orderId) {
            console.log('[ShiprocketProvider] ==========================================')
            console.log('[ShiprocketProvider] [STEP 3 FALLBACK] Trying getShipmentStatus method to fetch AWB')
            console.log('[ShiprocketProvider] Timestamp:', new Date().toISOString())
            console.log('[ShiprocketProvider] order_id:', orderId)
            console.log('[ShiprocketProvider] ==========================================')
            
            try {
              const statusResult = await this.getShipmentStatus(orderId)
              if (statusResult.success && statusResult.trackingNumber) {
                // getShipmentStatus returns trackingNumber which is the AWB
                awbCode = statusResult.trackingNumber
                console.log('[ShiprocketProvider] ✅ [STEP 3 FALLBACK SUCCESS] AWB retrieved via getShipmentStatus:', awbCode)
                // Also update orderDetailsResponse for consistency
                orderDetailsResponse = statusResult.rawResponse
              } else {
                console.warn('[ShiprocketProvider] ⚠️ [STEP 3 FALLBACK] getShipmentStatus did not return AWB:', statusResult.error)
              }
            } catch (fallbackError: any) {
              console.error('[ShiprocketProvider] ❌ [STEP 3 FALLBACK ERROR] getShipmentStatus failed:', fallbackError.message)
            }
          }
          
          // Final check - if still no AWB, log everything
          if (!awbCode) {
            console.error('[ShiprocketProvider] ==========================================')
            console.error('[ShiprocketProvider] ❌ [STEP 3 FINAL] AWB not found after all retry attempts and fallback')
            console.error('[ShiprocketProvider] Timestamp:', new Date().toISOString())
            console.error('[ShiprocketProvider] order_id used:', orderId)
            console.error('[ShiprocketProvider] Final order details response keys:', orderDetailsResponse ? Object.keys(orderDetailsResponse) : 'No response')
            if (orderDetailsResponse) {
              console.error('[ShiprocketProvider] Full order details response:', JSON.stringify(orderDetailsResponse, null, 2))
            }
            console.error('[ShiprocketProvider] ==========================================')
          }
        } else {
          console.log('[ShiprocketProvider] ✅ [STEP 3 SKIPPED] AWB already found, no need to fetch order details')
          console.log('[ShiprocketProvider] AWB Code:', awbCode)
        }
      } else {
        console.warn('[ShiprocketProvider] ⚠️ order_id not available, cannot fetch order details')
        console.warn('[ShiprocketProvider] createResponse.order_id:', createResponse.order_id)
        console.warn('[ShiprocketProvider] shipmentId:', shipmentId)
      }
      
      // Final validation - AWB must be present
      if (!awbCode) {
        console.error('[ShiprocketProvider] ==========================================')
        console.error('[ShiprocketProvider] ❌ [FINAL VALIDATION FAILED] AWB code not found after all attempts')
        console.error('[ShiprocketProvider] Timestamp:', new Date().toISOString())
        if (awbAssignResponse) {
          console.error('[ShiprocketProvider] Assign/AWB response keys:', Object.keys(awbAssignResponse))
          console.error('[ShiprocketProvider] Assign/AWB response:', JSON.stringify(awbAssignResponse, null, 2))
        }
        if (orderDetailsResponse) {
          console.error('[ShiprocketProvider] Order details response keys:', Object.keys(orderDetailsResponse))
          console.error('[ShiprocketProvider] Order details response:', JSON.stringify(orderDetailsResponse, null, 2))
        }
        console.error('[ShiprocketProvider] ==========================================')
        throw new Error('AWB code not found in assign/awb response or order details. Check server logs for full response structure.')
      }
      
      console.log('[ShiprocketProvider] ==========================================')
      console.log('[ShiprocketProvider] ✅ [SUCCESS] Final AWB code:', awbCode)
      console.log('[ShiprocketProvider] Timestamp:', new Date().toISOString())
      console.log('[ShiprocketProvider] ==========================================')

      // ====================================================
      // CRITICAL: Return shipment_id (NOT order_id) as providerShipmentReference
      // This is MANDATORY for all downstream operations:
      // - AWB assignment (already uses shipment_id)
      // - Pickup scheduling (requires shipment_id)
      // - Pickup rescheduling (requires shipment_id)
      // - Tracking/status checks (can use shipment_id or order_id, but shipment_id is preferred)
      // ====================================================
      const providerShipmentReference = shipmentIdStr
      
      console.log('[ShiprocketProvider] ==========================================')
      console.log('[ShiprocketProvider] [CRITICAL] RETURNING PROVIDER SHIPMENT REFERENCE')
      console.log('[ShiprocketProvider] providerShipmentReference (shipment_id):', providerShipmentReference)
      console.log('[ShiprocketProvider] order_id (for audit only):', orderId)
      console.log('[ShiprocketProvider] ⚠️  IMPORTANT: All downstream APIs MUST use shipment_id')
      console.log('[ShiprocketProvider] ⚠️  DO NOT use order_id for AWB, pickup, or tracking APIs')
      console.log('[ShiprocketProvider] ==========================================')

      // Map Shiprocket response to UDS format
      return {
        success: true,
        // CRITICAL: Store shipment_id (NOT order_id) as providerShipmentReference
        providerShipmentReference: providerShipmentReference,
        trackingNumber: awbCode,
        trackingUrl: `https://shiprocket.co/tracking/${awbCode}`,
        estimatedDeliveryDate: createResponse.estimated_delivery_date 
          ? new Date(createResponse.estimated_delivery_date)
          : undefined,
        awbNumber: awbCode,
        rawResponse: {
          // Store full response for audit/debug
          createResponse,
          awbAssignResponse,
          orderDetailsResponse,
          // Store both identifiers explicitly for reference
          identifiers: {
            order_id: orderId, // For audit/debug only
            shipment_id: shipmentIdStr, // MANDATORY for all API calls
          },
        },
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
   * 
   * NOTE: providerShipmentReference should be shipment_id (not order_id)
   * This method can accept either, but shipment_id is preferred for consistency
   */
  async getShipmentStatus(providerShipmentReference: string): Promise<ShipmentStatusResult> {
    try {
      if (!this.config) {
        throw new Error('ShiprocketProvider not initialized')
      }

      if (!providerShipmentReference || !providerShipmentReference.trim()) {
        throw new Error('Provider shipment reference (shipment_id) is required')
      }

      const docketNumber = providerShipmentReference.trim()
      
      console.log('[ShiprocketProvider] [getShipmentStatus] Using providerShipmentReference:', docketNumber)
      console.log('[ShiprocketProvider] ⚠️  This should be shipment_id (not order_id) for best results')
      
      // Shiprocket API accepts both order_id and shipment_id for /orders/show
      // However, shipment_id is preferred as it's what we store in providerShipmentReference
      // Try orders/show first (works with both order_id and shipment_id)
      let response: any
      try {
        response = await this.makeRequest(`/v1/external/orders/show/${docketNumber}`)
      } catch (orderError: any) {
        // If orders/show fails, try as AWB code (for tracking by AWB)
        try {
          response = await this.makeRequest(`/v1/external/courier/track/awb/${docketNumber}`)
        } catch (awbError: any) {
          // Both failed - check error messages
          const errorMsg = orderError?.message || awbError?.message || 'Shipment not found'
          
          // Provide more helpful error message
          if (errorMsg.includes('not found') || errorMsg.includes('404') || errorMsg.includes('Invalid')) {
            throw new Error(`Shipment reference "${docketNumber}" not found. Please verify the shipment_id is correct.`)
          }
          throw new Error(errorMsg)
        }
      }

      // Check if response indicates an error
      if (response.error || response.message) {
        const errorMsg = response.error?.message || response.message || 'Unknown error'
        throw new Error(errorMsg)
      }

      // Map Shiprocket status to UDS status
      // According to Shiprocket API docs, status is at top level
      const shiprocketStatus = response.status || response.shipment_status || response.current_status || ''
      const normalizedStatus = normalizeShipmentStatus(shiprocketStatus)

      // Extract AWB/tracking number
      // According to Shiprocket API docs: awb_code is at top level in orders/show response
      // Reference: https://apidocs.shiprocket.in/
      const awbCode = response.awb_code || response.tracking_number || response.awb

      return {
        success: true,
        status: normalizedStatus,
        trackingNumber: awbCode || docketNumber,
        trackingUrl: response.tracking_url || response.tracking_link || (awbCode ? `https://shiprocket.co/tracking/${awbCode}` : undefined),
        currentLocation: response.current_status || response.status || response.location,
        estimatedDeliveryDate: response.estimated_delivery_date
          ? new Date(response.estimated_delivery_date)
          : undefined,
        deliveredDate: response.delivered_date
          ? new Date(response.delivered_date)
          : undefined,
        rawResponse: response,
      }
    } catch (error: any) {
      // Provide more user-friendly error messages
      let errorMessage = error.message || 'Unknown error'
      
      // Check for common error patterns and provide helpful messages
      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        errorMessage = `Docket number "${providerShipmentReference}" not found in provider system. Please verify the docket number is correct.`
      } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        errorMessage = 'Authentication failed. Please check provider credentials.'
      } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
        errorMessage = 'Access denied. Please check provider permissions.'
      } else if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
        errorMessage = 'Network error. Please check your connection and try again.'
      }
      
      return {
        success: false,
        status: 'FAILED',
        error: errorMessage,
        rawResponse: { error: errorMessage, originalError: error.message },
      }
    }
  }

  /**
   * Check serviceability
   * 
   * Shiprocket requires: pickup_postcode, delivery_postcode, weight, cod
   * If courierCode is provided, filters results to that specific courier
   */
  async checkServiceability(pincode: string, fromPincode?: string, weight?: number, codAmount?: number, courierCode?: string): Promise<ServiceabilityResult> {
    try {
      if (!this.config) {
        throw new Error('ShiprocketProvider not initialized')
      }

      // Shiprocket requires pickup_postcode, delivery_postcode, weight, and cod
      // Validate pincodes - both must be valid 6-digit pincodes
      if (!pincode || pincode.length !== 6 || !/^\d{6}$/.test(pincode)) {
        throw new Error('Destination pincode must be a valid 6-digit number')
      }
      
      if (!fromPincode || fromPincode.length !== 6 || !/^\d{6}$/.test(fromPincode)) {
        throw new Error('Source pincode must be a valid 6-digit number')
      }
      
      const pickupPincode = fromPincode
      const deliveryPincode = pincode
      const shipmentWeight = weight || 1.0 // Default 1 kg
      const cod = codAmount || 0 // Default COD amount

      const params = new URLSearchParams({ 
        pickup_postcode: pickupPincode,
        delivery_postcode: deliveryPincode,
        weight: shipmentWeight.toString(),
        cod: cod.toString(),
      })

      const response = await this.makeRequest(`/v1/external/courier/serviceability/?${params.toString()}`)

      // Shiprocket returns an object with data.available_courier_companies array
      let allAvailableCouriers = response?.data?.available_courier_companies || []
      
      // Always get all couriers first, then filter in-memory if courierCode is specified
      // This ensures consistent behavior between filtered and unfiltered requests
      let availableCouriers = allAvailableCouriers
      
      // Filter by courier code if specified - use exact matching on multiple identifier fields
      if (courierCode && Array.isArray(availableCouriers)) {
        const searchCode = courierCode.trim().toLowerCase()
        
        // Log for debugging (can be removed in production)
        console.log(`[ShiprocketProvider] Filtering by courierCode: "${courierCode}"`)
        console.log(`[ShiprocketProvider] Total couriers before filter: ${availableCouriers.length}`)
        
        availableCouriers = availableCouriers.filter((courier: any) => {
          // Check multiple identifier fields that Shiprocket might use
          const companyId = courier.courier_company_id?.toString() || ''
          const courierId = courier.courier_id?.toString() || ''
          const courierName = (courier.courier_name || '').toLowerCase()
          
          // Exact match on IDs (preferred), or name match as fallback
          const matches = 
            companyId.toLowerCase() === searchCode ||
            courierId.toLowerCase() === searchCode ||
            (courierName && courierName === searchCode) ||
            // Fallback: check if courierCode is contained in name (for legacy support)
            (courierName && courierName.includes(searchCode))
          
          if (matches) {
            console.log(`[ShiprocketProvider] Match found: companyId=${companyId}, courierId=${courierId}, name=${courier.courier_name}`)
          }
          
          return matches
        })
        
        console.log(`[ShiprocketProvider] Couriers after filter: ${availableCouriers.length}`)
        
        // Defensive check: If filtered result is empty but courier exists in unfiltered results,
        // it means the courierCode identifier doesn't match. Check if courier exists by name.
        if (availableCouriers.length === 0 && allAvailableCouriers.length > 0) {
          console.log(`[ShiprocketProvider] Filter returned empty. Checking if courier exists in unfiltered results...`)
          
          // Try to find by name match (case-insensitive)
          const foundByName = allAvailableCouriers.find((courier: any) => {
            const name = (courier.courier_name || '').toLowerCase()
            return name.includes(searchCode) || searchCode.includes(name)
          })
          
          if (foundByName) {
            console.log(`[ShiprocketProvider] Found courier by name match: ${foundByName.courier_name}`)
            // Use the found courier - it's serviceable, just identifier mismatch
            availableCouriers = [foundByName]
          }
        }
      }

      const serviceable = Array.isArray(availableCouriers) && availableCouriers.length > 0

      // Extract estimated days from first available courier if available
      let estimatedDays: number | undefined
      if (serviceable && availableCouriers[0]?.estimated_delivery_days) {
        const daysStr = availableCouriers[0].estimated_delivery_days
        estimatedDays = typeof daysStr === 'string' ? parseInt(daysStr, 10) : daysStr
      }

      // Map available couriers to our format
      // Use courier_company_id as primary identifier (consistent with getSupportedCouriers)
      const mappedCouriers = availableCouriers.map((courier: any) => {
        // Extract cost information - Shiprocket provides rate or freight_charge
        const cost = courier.rate || courier.freight_charge || courier.charge || 0
        const estimatedDays = typeof courier.estimated_delivery_days === 'string' 
          ? parseInt(courier.estimated_delivery_days, 10) 
          : courier.estimated_delivery_days
        
        return {
          courierCode: courier.courier_company_id?.toString() || courier.courier_id?.toString() || courier.courier_name || '',
          courierName: courier.courier_name || courier.courier_id?.toString() || 'Unknown',
          estimatedDays: estimatedDays,
          estimatedCost: typeof cost === 'string' ? parseFloat(cost) : (typeof cost === 'number' ? cost : 0),
          currency: 'INR',
          serviceTypes: courier.service_type ? [courier.service_type] : [],
        }
      })

      return {
        success: true,
        serviceable,
        estimatedDays: estimatedDays || (serviceable ? 3 : undefined),
        message: serviceable 
          ? courierCode
            ? `Serviceable by ${availableCouriers.length} courier(s) matching "${courierCode}"`
            : `Serviceable by ${availableCouriers.length} courier(s)`
          : courierCode
            ? `Not serviceable by courier "${courierCode}" in this area`
            : 'Not serviceable in this area',
        availableCouriers: mappedCouriers,
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
        throw new Error('ShiprocketProvider not initialized')
      }

      const response = await this.makeRequest(`/v1/external/orders/cancel/shipment/awbs`, 'POST', {
        awbs: [providerShipmentReference] // Shiprocket expects AWB code
      })

      return {
        success: true,
        cancelled: response.status === 'CANCELLED' || response.cancelled === true,
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
        console.error('[ShiprocketProvider] Health check failed: Provider not initialized')
        return {
          healthy: false,
          message: 'Provider not initialized',
          error: 'Provider configuration is missing',
        }
      }

      if (!this.config.email || !this.config.password) {
        console.error('[ShiprocketProvider] Health check failed: Missing credentials')
        return {
          healthy: false,
          message: 'Authentication credentials missing',
          error: 'Email and password are required for Shiprocket authentication',
        }
      }

      const startTime = Date.now()
      
      console.log(`[ShiprocketProvider] Starting health check for ${this.providerId}`)
      console.log(`[ShiprocketProvider] API Base URL: ${this.config.apiBaseUrl}`)
      console.log(`[ShiprocketProvider] Email: ${this.config.email.substring(0, 10)}...`)
      
      // Try to authenticate (this validates API connectivity)
      await this.authenticate()
      
      const responseTime = Date.now() - startTime

      console.log(`[ShiprocketProvider] ✅ Health check passed in ${responseTime}ms`)
      return {
        healthy: true,
        message: 'Shiprocket API is accessible and authentication successful',
        responseTime,
      }
    } catch (error: any) {
      console.error(`[ShiprocketProvider] ❌ Health check failed:`, error)
      return {
        healthy: false,
        error: error.message || 'Health check failed',
        message: `Health check failed: ${error.message}`,
      }
    }
  }

  // ============================================================================
  // OPTIONAL TEST/DIAGNOSTIC METHODS
  // ============================================================================

  /**
   * Get supported courier partners
   * Shiprocket returns courier list in serviceability response
   */
  async getSupportedCouriers(): Promise<GetSupportedCouriersResult> {
    try {
      if (!this.config) {
        throw new Error('ShiprocketProvider not initialized')
      }

      // Use a default serviceability check to get courier list
      // We'll use common pincodes (Mumbai to Mumbai)
      const response = await this.makeRequest(
        '/v1/external/courier/serviceability/?pickup_postcode=400001&delivery_postcode=400070&weight=1&cod=0',
        'GET'
      )

      const availableCouriers = response?.data?.available_courier_companies || []
      
      // Extract unique couriers
      const courierMap = new Map<string, SupportedCourier>()
      
      availableCouriers.forEach((courier: any) => {
        const courierId = courier.courier_company_id?.toString()
        if (courierId && !courierMap.has(courierId)) {
          const serviceTypes: ('SURFACE' | 'AIR' | 'EXPRESS')[] = []
          if (courier.is_surface) serviceTypes.push('SURFACE')
          if (!courier.is_surface && courier.mode === 1) serviceTypes.push('AIR')
          if (courier.courier_type === 'EXPRESS') serviceTypes.push('EXPRESS')
          
          courierMap.set(courierId, {
            courierCode: courierId,
            courierName: courier.courier_name || 'Unknown',
            serviceTypes: serviceTypes.length > 0 ? serviceTypes : ['SURFACE'],
            isActive: courier.blocked === 0,
          })
        }
      })

      return {
        success: true,
        couriers: Array.from(courierMap.values()),
        rawResponse: response,
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to fetch supported couriers',
        rawResponse: { error: error.message },
      }
    }
  }

  /**
   * Get shipping rates for a route
   * Shiprocket provides rates in serviceability response
   */
  async getShippingRates(
    fromPincode: string,
    toPincode: string,
    weight: number,
    codAmount: number = 0,
    dimensions?: { length?: number; width?: number; height?: number }
  ): Promise<GetShippingRatesResult> {
    try {
      if (!this.config) {
        throw new Error('ShiprocketProvider not initialized')
      }

      const params = new URLSearchParams({
        pickup_postcode: fromPincode,
        delivery_postcode: toPincode,
        weight: weight.toString(),
        cod: codAmount.toString(),
      })

      const response = await this.makeRequest(`/v1/external/courier/serviceability/?${params.toString()}`, 'GET')

      const availableCouriers = response?.data?.available_courier_companies || []
      
      const rates: ShippingRate[] = availableCouriers.map((courier: any) => ({
        courierCode: courier.courier_company_id?.toString() || '',
        courierName: courier.courier_name || 'Unknown',
        serviceType: courier.is_surface ? 'SURFACE' : 'AIR',
        estimatedCost: courier.rate || courier.freight_charge || 0,
        estimatedDeliveryDays: parseInt(courier.estimated_delivery_days || '3', 10),
        currency: 'INR',
        rawResponse: courier,
      }))

      return {
        success: true,
        rates,
        rawResponse: response,
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to fetch shipping rates',
        rawResponse: { error: error.message },
      }
    }
  }

  // ============================================================================
  // PICKUP SCHEDULING METHODS (ADD-ON FEATURE)
  // ============================================================================

  /**
   * Schedule a pickup for a shipment
   * Shiprocket API: POST /v1/external/courier/generate/pickup
   * Reference: https://apidocs.shiprocket.in/
   */
  async schedulePickup(payload: SchedulePickupPayload): Promise<SchedulePickupResult> {
    try {
      if (!this.config) {
        throw new Error('ShiprocketProvider not initialized')
      }

      console.log('[ShiprocketProvider] ==========================================')
      console.log('[ShiprocketProvider] [PICKUP SCHEDULE] Starting pickup scheduling')
      console.log('[ShiprocketProvider] AWB:', payload.awbNumber)
      console.log('[ShiprocketProvider] Timestamp:', new Date().toISOString())
      console.log('[ShiprocketProvider] ==========================================')

      // ====================================================
      // DATE VALIDATION & FORMATTING (MANDATORY)
      // Shiprocket requires YYYY-MM-DD format ONLY (no time)
      // ====================================================
      // Convert Date object to YYYY-MM-DD (strip time completely)
      const pickupDateStr = payload.pickupDate.toISOString().split('T')[0]
      
      // Final validation: Must be exactly YYYY-MM-DD (no time, no other format)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDateStr)) {
        throw new Error(`Invalid pickup date format: "${pickupDateStr}". Must be exactly YYYY-MM-DD (e.g., 2026-01-10).`)
      }
      
      console.log('[ShiprocketProvider] ✅ Pickup date validated:', pickupDateStr)

      // ====================================================
      // CRITICAL: Use providerShipmentReference directly as shipment_id
      // providerShipmentReference should ALREADY be shipment_id (not order_id)
      // If it's order_id, we need to resolve it, but this should not happen
      // if shipment creation stored shipment_id correctly
      // ====================================================
      let shipmentId = payload.providerShipmentReference
      
      console.log('[ShiprocketProvider] ==========================================')
      console.log('[ShiprocketProvider] [PICKUP SCHEDULE] Using providerShipmentReference')
      console.log('[ShiprocketProvider] providerShipmentReference:', shipmentId)
      console.log('[ShiprocketProvider] ⚠️  This should be shipment_id (not order_id)')
      console.log('[ShiprocketProvider] ==========================================')

      // Validate that providerShipmentReference looks like a shipment_id
      // Shiprocket shipment_id is typically a numeric ID
      // If it looks like order_id (or we're unsure), try to resolve it
      // But ideally, this should never happen if shipment creation was correct
      const looksLikeOrderId = shipmentId && shipmentId.toString().length > 8 // Order IDs are typically longer
      const looksLikeShipmentId = shipmentId && /^\d+$/.test(shipmentId.toString()) && shipmentId.toString().length <= 10
      
      if (looksLikeOrderId && !looksLikeShipmentId) {
        console.warn('[ShiprocketProvider] ⚠️  WARNING: providerShipmentReference looks like order_id, attempting to resolve shipment_id')
        console.warn('[ShiprocketProvider] This should not happen if shipment creation stored shipment_id correctly')
        
        try {
          const orderDetails = await this.makeRequest(`/v1/external/orders/show/${payload.providerShipmentReference}`, 'GET')
          if (orderDetails.shipment_id) {
            shipmentId = orderDetails.shipment_id.toString()
            console.log('[ShiprocketProvider] ✅ Resolved shipment_id from order details:', shipmentId)
            console.warn('[ShiprocketProvider] ⚠️  FIX NEEDED: Update shipment.providerShipmentReference to shipment_id')
          } else {
            console.error('[ShiprocketProvider] ❌ Could not resolve shipment_id from order details')
            throw new Error('shipment_id not found in order details. Cannot schedule pickup.')
          }
        } catch (error: any) {
          console.error('[ShiprocketProvider] ❌ Failed to resolve shipment_id:', error.message)
          throw new Error(`Cannot schedule pickup: providerShipmentReference appears to be order_id, but could not resolve shipment_id: ${error.message}`)
        }
      } else {
        console.log('[ShiprocketProvider] ✅ providerShipmentReference appears to be shipment_id, using directly')
      }

      // ====================================================
      // BUILD FORM-URLENCODED PAYLOAD
      // Shiprocket pickup API REQUIRES application/x-www-form-urlencoded
      // DO NOT send JSON - it will fail with misleading date format error
      // 
      // Required fields per Shiprocket API docs:
      // - shipment_id: Single shipment ID (numeric string)
      // - pickup_date: YYYY-MM-DD format ONLY
      // - status: "retry" (required)
      // ====================================================
      const shiprocketPayload: any = {
        shipment_id: shipmentId.toString(), // Single shipment_id (NOT array for form-urlencoded)
        pickup_date: pickupDateStr, // YYYY-MM-DD format ONLY
        status: 'retry', // Required by Shiprocket API
      }

      console.log('[ShiprocketProvider] ==========================================')
      console.log('[ShiprocketProvider] [PICKUP SCHEDULE] Request Payload:')
      console.log('[ShiprocketProvider] shipment_id:', shipmentId)
      console.log('[ShiprocketProvider] pickup_date:', pickupDateStr)
      console.log('[ShiprocketProvider] status: retry')
      console.log('[ShiprocketProvider] Content-Type: application/x-www-form-urlencoded')
      console.log('[ShiprocketProvider] ==========================================')

      // Call Shiprocket pickup generation API
      // CRITICAL: Use form-urlencoded (NOT JSON)
      // Reference: POST /v1/external/courier/generate/pickup
      // Shiprocket API docs: https://apidocs.shiprocket.in/
      const response = await this.makeRequest(
        '/v1/external/courier/generate/pickup', 
        'POST', 
        shiprocketPayload,
        'form-urlencoded' // CRITICAL: Use form-urlencoded, not JSON
      )

      console.log('[ShiprocketProvider] ==========================================')
      console.log('[ShiprocketProvider] [PICKUP SCHEDULE] Response:')
      console.log('[ShiprocketProvider]', JSON.stringify(response, null, 2))
      console.log('[ShiprocketProvider] ==========================================')

      // ====================================================
      // CRITICAL: Validate Shiprocket response
      // Shiprocket may return HTTP 200 but with Status: false in body
      // We MUST check the Status field, not just HTTP status code
      // ====================================================
      const responseStatus = response.Status !== undefined ? response.Status : 
                            response.status !== undefined ? response.status :
                            response.success !== undefined ? response.success :
                            true // Default to true if no status field (for backward compatibility)
      
      // Check if Status is explicitly false (case-insensitive)
      const isStatusFalse = responseStatus === false || 
                           responseStatus === 'false' || 
                           String(responseStatus).toLowerCase() === 'false'
      
      if (isStatusFalse) {
        const errorMessage = response.Message || 
                            response.message || 
                            response.error || 
                            'Pickup scheduling failed. Shiprocket returned Status: false'
        
        console.error('[ShiprocketProvider] ==========================================')
        console.error('[ShiprocketProvider] ❌ PICKUP SCHEDULE FAILED - Shiprocket returned Status: false')
        console.error('[ShiprocketProvider] Error message from Shiprocket:', errorMessage)
        console.error('[ShiprocketProvider] Full response:', JSON.stringify(response, null, 2))
        console.error('[ShiprocketProvider] ==========================================')
        
        throw new Error(errorMessage)
      }

      // Extract pickup reference ID from response
      // Shiprocket may return pickup_id, job_id, or reference_id
      const pickupReferenceId = response.pickup_id || 
                                response.job_id ||
                                response.pickup_reference_id || 
                                response.id ||
                                response.reference_id ||
                                response.data?.pickup_id ||
                                response.data?.job_id

      // CRITICAL: Validate that we have a pickup reference ID
      // If Shiprocket says success but doesn't provide pickup_id, it's still a failure
      if (!pickupReferenceId) {
        const errorMessage = response.Message || 
                            response.message || 
                            'Pickup scheduling failed: Shiprocket did not return a pickup reference ID'
        
        console.error('[ShiprocketProvider] ==========================================')
        console.error('[ShiprocketProvider] ❌ PICKUP SCHEDULE FAILED - No pickup reference ID in response')
        console.error('[ShiprocketProvider] Response Status:', responseStatus)
        console.error('[ShiprocketProvider] Full response:', JSON.stringify(response, null, 2))
        console.error('[ShiprocketProvider] ==========================================')
        
        throw new Error(errorMessage)
      }

      console.log('[ShiprocketProvider] ==========================================')
      console.log('[ShiprocketProvider] ✅ PICKUP SCHEDULE SUCCESS - Confirmed by Shiprocket')
      console.log('[ShiprocketProvider] Pickup Reference ID:', pickupReferenceId)
      console.log('[ShiprocketProvider] Response Status:', responseStatus)
      console.log('[ShiprocketProvider] ==========================================')

      return {
        success: true,
        pickupReferenceId: pickupReferenceId.toString(),
        pickupDate: payload.pickupDate,
        pickupTimeSlot: payload.pickupTimeSlot || '10:00-13:00',
        message: response.Message || response.message || response.data?.message || 'Pickup scheduled successfully',
        rawResponse: response,
      }
    } catch (error: any) {
      console.error('[ShiprocketProvider] ==========================================')
      console.error('[ShiprocketProvider] [PICKUP SCHEDULE] ERROR')
      console.error('[ShiprocketProvider] Error message:', error.message)
      if (error.response) {
        console.error('[ShiprocketProvider] Error response status:', error.response.status)
        console.error('[ShiprocketProvider] Error response data:', JSON.stringify(error.response.data || error.response, null, 2))
      }
      console.error('[ShiprocketProvider] ==========================================')
      
      // Extract meaningful error message from Shiprocket response
      let errorMessage = error.message || 'Failed to schedule pickup'
      if (error.response?.data) {
        const errorData = error.response.data
        if (typeof errorData === 'string') {
          errorMessage = errorData
        } else if (errorData.message) {
          errorMessage = errorData.message
        } else if (errorData.error) {
          errorMessage = errorData.error
        }
      }
      
      return {
        success: false,
        error: errorMessage,
        rawResponse: { 
          error: error.message, 
          response: error.response,
          stack: error.stack 
        },
      }
    }
  }

  /**
   * Reschedule an existing pickup
   * Shiprocket API: POST /v1/external/courier/generate/pickup (with updated date)
   * Note: Shiprocket may not have a dedicated reschedule endpoint, so we generate a new pickup
   * with the updated date. The old pickup will be automatically cancelled.
   */
  async reschedulePickup(pickupReferenceId: string, payload: SchedulePickupPayload): Promise<SchedulePickupResult> {
    try {
      if (!this.config) {
        throw new Error('ShiprocketProvider not initialized')
      }

      console.log('[ShiprocketProvider] ==========================================')
      console.log('[ShiprocketProvider] [PICKUP RESCHEDULE] Starting pickup rescheduling')
      console.log('[ShiprocketProvider] Pickup Reference ID:', pickupReferenceId)
      console.log('[ShiprocketProvider] Timestamp:', new Date().toISOString())
      console.log('[ShiprocketProvider] ==========================================')

      // ====================================================
      // DATE VALIDATION & FORMATTING (MANDATORY)
      // Shiprocket requires YYYY-MM-DD format ONLY (no time)
      // ====================================================
      // Convert Date object to YYYY-MM-DD (strip time completely)
      const pickupDateStr = payload.pickupDate.toISOString().split('T')[0]
      
      // Final validation: Must be exactly YYYY-MM-DD (no time, no other format)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDateStr)) {
        throw new Error(`Invalid pickup date format: "${pickupDateStr}". Must be exactly YYYY-MM-DD (e.g., 2026-01-10).`)
      }
      
      console.log('[ShiprocketProvider] ✅ Pickup date validated:', pickupDateStr)

      // ====================================================
      // CRITICAL: Use providerShipmentReference directly as shipment_id
      // Same logic as schedulePickup - should already be shipment_id
      // ====================================================
      let shipmentId = payload.providerShipmentReference
      
      console.log('[ShiprocketProvider] ==========================================')
      console.log('[ShiprocketProvider] [PICKUP RESCHEDULE] Using providerShipmentReference')
      console.log('[ShiprocketProvider] providerShipmentReference:', shipmentId)
      console.log('[ShiprocketProvider] ⚠️  This should be shipment_id (not order_id)')
      console.log('[ShiprocketProvider] ==========================================')

      // Validate and resolve if needed (same logic as schedulePickup)
      const looksLikeOrderId = shipmentId && shipmentId.toString().length > 8
      const looksLikeShipmentId = shipmentId && /^\d+$/.test(shipmentId.toString()) && shipmentId.toString().length <= 10
      
      if (looksLikeOrderId && !looksLikeShipmentId) {
        console.warn('[ShiprocketProvider] ⚠️  WARNING: providerShipmentReference looks like order_id, attempting to resolve shipment_id')
        
        try {
          const orderDetails = await this.makeRequest(`/v1/external/orders/show/${payload.providerShipmentReference}`, 'GET')
          if (orderDetails.shipment_id) {
            shipmentId = orderDetails.shipment_id.toString()
            console.log('[ShiprocketProvider] ✅ Resolved shipment_id from order details for reschedule:', shipmentId)
            console.warn('[ShiprocketProvider] ⚠️  FIX NEEDED: Update shipment.providerShipmentReference to shipment_id')
          } else {
            console.error('[ShiprocketProvider] ❌ Could not resolve shipment_id from order details')
            throw new Error('shipment_id not found in order details. Cannot reschedule pickup.')
          }
        } catch (error: any) {
          console.error('[ShiprocketProvider] ❌ Failed to resolve shipment_id:', error.message)
          throw new Error(`Cannot reschedule pickup: providerShipmentReference appears to be order_id, but could not resolve shipment_id: ${error.message}`)
        }
      } else {
        console.log('[ShiprocketProvider] ✅ providerShipmentReference appears to be shipment_id, using directly')
      }

      // ====================================================
      // BUILD FORM-URLENCODED PAYLOAD
      // Shiprocket pickup API REQUIRES application/x-www-form-urlencoded
      // DO NOT send JSON - it will fail with misleading date format error
      // 
      // Required fields per Shiprocket API docs:
      // - shipment_id: Single shipment ID (numeric string)
      // - pickup_date: YYYY-MM-DD format ONLY
      // - status: "retry" (required)
      // ====================================================
      const shiprocketPayload: any = {
        shipment_id: shipmentId.toString(), // Single shipment_id (NOT array for form-urlencoded)
        pickup_date: pickupDateStr, // YYYY-MM-DD format ONLY
        status: 'retry', // Required by Shiprocket API
      }

      console.log('[ShiprocketProvider] ==========================================')
      console.log('[ShiprocketProvider] [PICKUP RESCHEDULE] Request Payload:')
      console.log('[ShiprocketProvider] shipment_id:', shipmentId)
      console.log('[ShiprocketProvider] pickup_date:', pickupDateStr)
      console.log('[ShiprocketProvider] status: retry')
      console.log('[ShiprocketProvider] Content-Type: application/x-www-form-urlencoded')
      console.log('[ShiprocketProvider] ==========================================')

      // Call Shiprocket pickup generation API (same as schedule, but with new date)
      // CRITICAL: Use form-urlencoded (NOT JSON)
      // Shiprocket will handle cancelling the old pickup automatically
      // Reference: POST /v1/external/courier/generate/pickup
      // Shiprocket API docs: https://apidocs.shiprocket.in/
      const response = await this.makeRequest(
        '/v1/external/courier/generate/pickup', 
        'POST', 
        shiprocketPayload,
        'form-urlencoded' // CRITICAL: Use form-urlencoded, not JSON
      )

      console.log('[ShiprocketProvider] ==========================================')
      console.log('[ShiprocketProvider] [PICKUP RESCHEDULE] Response:')
      console.log('[ShiprocketProvider]', JSON.stringify(response, null, 2))
      console.log('[ShiprocketProvider] ==========================================')

      // ====================================================
      // CRITICAL: Validate Shiprocket response (same as schedulePickup)
      // ====================================================
      const responseStatus = response.Status !== undefined ? response.Status : 
                            response.status !== undefined ? response.status :
                            response.success !== undefined ? response.success :
                            true
      
      const isStatusFalse = responseStatus === false || 
                           responseStatus === 'false' || 
                           String(responseStatus).toLowerCase() === 'false'
      
      if (isStatusFalse) {
        const errorMessage = response.Message || 
                            response.message || 
                            response.error || 
                            'Pickup rescheduling failed. Shiprocket returned Status: false'
        
        console.error('[ShiprocketProvider] ==========================================')
        console.error('[ShiprocketProvider] ❌ PICKUP RESCHEDULE FAILED - Shiprocket returned Status: false')
        console.error('[ShiprocketProvider] Error message from Shiprocket:', errorMessage)
        console.error('[ShiprocketProvider] Full response:', JSON.stringify(response, null, 2))
        console.error('[ShiprocketProvider] ==========================================')
        
        throw new Error(errorMessage)
      }

      // Extract pickup reference ID from response
      const newPickupReferenceId = response.pickup_id || 
                                   response.job_id ||
                                   response.pickup_reference_id || 
                                   response.id ||
                                   response.reference_id ||
                                   response.data?.pickup_id ||
                                   response.data?.job_id ||
                                   pickupReferenceId // Fallback to existing if not provided

      // Validate that we have a pickup reference ID
      if (!newPickupReferenceId) {
        const errorMessage = response.Message || 
                            response.message || 
                            'Pickup rescheduling failed: Shiprocket did not return a pickup reference ID'
        
        console.error('[ShiprocketProvider] ==========================================')
        console.error('[ShiprocketProvider] ❌ PICKUP RESCHEDULE FAILED - No pickup reference ID in response')
        console.error('[ShiprocketProvider] Response Status:', responseStatus)
        console.error('[ShiprocketProvider] Full response:', JSON.stringify(response, null, 2))
        console.error('[ShiprocketProvider] ==========================================')
        
        throw new Error(errorMessage)
      }

      console.log('[ShiprocketProvider] ==========================================')
      console.log('[ShiprocketProvider] ✅ PICKUP RESCHEDULE SUCCESS - Confirmed by Shiprocket')
      console.log('[ShiprocketProvider] Pickup Reference ID:', newPickupReferenceId)
      console.log('[ShiprocketProvider] Response Status:', responseStatus)
      console.log('[ShiprocketProvider] ==========================================')

      return {
        success: true,
        pickupReferenceId: newPickupReferenceId.toString(),
        pickupDate: payload.pickupDate,
        pickupTimeSlot: payload.pickupTimeSlot || '10:00-13:00',
        message: response.Message || response.message || response.data?.message || 'Pickup rescheduled successfully',
        rawResponse: response,
      }
    } catch (error: any) {
      console.error('[ShiprocketProvider] ==========================================')
      console.error('[ShiprocketProvider] [PICKUP RESCHEDULE] ERROR')
      console.error('[ShiprocketProvider] Error message:', error.message)
      if (error.response) {
        console.error('[ShiprocketProvider] Error response status:', error.response.status)
        console.error('[ShiprocketProvider] Error response data:', JSON.stringify(error.response.data || error.response, null, 2))
      }
      console.error('[ShiprocketProvider] ==========================================')
      
      // Extract meaningful error message from Shiprocket response
      let errorMessage = error.message || 'Failed to reschedule pickup'
      if (error.response?.data) {
        const errorData = error.response.data
        if (typeof errorData === 'string') {
          errorMessage = errorData
        } else if (errorData.message) {
          errorMessage = errorData.message
        } else if (errorData.error) {
          errorMessage = errorData.error
        }
      }
      
      return {
        success: false,
        error: errorMessage,
        rawResponse: { 
          error: error.message, 
          response: error.response,
          stack: error.stack 
        },
      }
    }
  }
}

