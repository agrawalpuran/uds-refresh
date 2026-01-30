/**
 * Shipment Execution Layer
 * 
 * Handles shipment creation, status updates, and provider synchronization.
 * All provider-specific logic is abstracted through LogisticsProvider interface.
 */

import connectDB from './mongodb'
import mongoose from 'mongoose'
import Shipment from '../models/Shipment'
import ShipmentApiLog from '../models/ShipmentApiLog'
import Order from '../models/Order'
import { getSystemShippingConfig } from './shipping-config-access'
import { createProvider, getEnabledProvidersForCompany } from '../providers/ProviderFactory'
import { LogisticsProvider, CreateShipmentPayload } from '../providers/LogisticsProvider'
import { encrypt } from '../utils/encryption'

// =============================================================================
// DUAL-WRITE INTEGRATION (Feature Flag: DUAL_WRITE_ENABLED)
// =============================================================================
import {
  safeDualWriteOrderStatus,
  type UnifiedOrderStatus,
} from '@/migrations/dualwrite/status-dualwrite-wrapper'

/**
 * Generate alphanumeric ID for shipment entities (≤15 chars)
 */
function generateShipmentId(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  const id = `SHIP_${timestamp}${random}`.substring(0, 15)
  return id
}

/**
 * Generate alphanumeric ID for log entries (≤15 chars)
 */
function generateLogId(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  const id = `LOG_${timestamp}${random}`.substring(0, 15)
  return id
}

/**
 * Log API call to provider
 */
export async function logShipmentApiCall(
  shipmentId: string | undefined,
  providerId: string,
  operationType: 'CREATE' | 'TRACK' | 'SERVICEABILITY' | 'CANCEL' | 'HEALTH_CHECK',
  requestPayload: any,
  responsePayload: any,
  httpStatus: number | undefined,
  success: boolean,
  errorDetails?: string
): Promise<void> {
  await connectDB()

  await ShipmentApiLog.create({
    logId: generateLogId(),
    shipmentId,
    providerId,
    operationType,
    requestPayload,
    responsePayload,
    httpStatus,
    success,
    errorDetails,
    timestamp: new Date(),
  })
}

/**
 * Check if API shipment is enabled for a company
 */
export async function isApiShipmentEnabled(companyId: string): Promise<boolean> {
  await connectDB()

  console.log('[isApiShipmentEnabled] Checking API shipment for company:', companyId)
  
  const config = await getSystemShippingConfig()
  console.log('[isApiShipmentEnabled] System shipping config:', {
    shippingIntegrationEnabled: config.shippingIntegrationEnabled,
  })
  
  if (!config.shippingIntegrationEnabled) {
    console.log('[isApiShipmentEnabled] Shipping integration is disabled globally')
    return false
  }

  // Check if company has any enabled providers
  const enabledProviders = await getEnabledProvidersForCompany(companyId)
  console.log('[isApiShipmentEnabled] Enabled providers for company:', {
    companyId,
    providerCount: enabledProviders.length,
    providers: enabledProviders.map((p: any) => ({
      providerId: p.providerId,
      providerCode: p.providerCode,
      providerName: p.providerName,
    })),
  })
  
  const result = enabledProviders.length > 0
  console.log('[isApiShipmentEnabled] Final result:', result)
  return result
}

/**
 * Create shipment via API provider
 */
export async function createApiShipment(
  prId: string,
  vendorId: string,
  companyId: string,
  providerId: string,
  companyShippingProviderId: string,
  warehouseRefId?: string, // Optional warehouse reference
  vendorRouting?: any, // Optional vendor routing (contains primaryCourierCode, secondaryCourierCode)
  packageData?: { // Optional package data
    shipmentPackageId?: string
    lengthCm?: number
    breadthCm?: number
    heightCm?: number
    volumetricWeight?: number
  },
  shippingCost?: number, // Optional shipping cost
  selectedCourierType?: 'PRIMARY' | 'SECONDARY' // Optional courier type selection
): Promise<{ success: boolean; shipmentId?: string; error?: string }> {
  await connectDB()

  try {
    // Get PR/Order data with employee populated
    const order = await Order.findOne({ id: prId, vendorId })
      .populate('employeeId', 'id employeeId firstName lastName mobile')
      .lean()
    if (!order) {
      throw new Error(`Order not found: ${prId}`)
    }

    // Get employee phone number (decrypt if encrypted)
    let employeePhone: string | undefined = undefined
    if (order.employeeId && typeof order.employeeId === 'object') {
      const employee = order.employeeId as any
      if (employee.mobile) {
        try {
          const { decrypt } = await import('@/lib/utils/encryption')
          // Try to decrypt (will fail if not encrypted, that's okay)
          try {
            employeePhone = decrypt(employee.mobile)
          } catch {
            // If decryption fails, assume it's already plain text
            employeePhone = employee.mobile
          }
        } catch (error) {
          console.warn('[createApiShipment] Failed to get employee phone:', error)
        }
      }
    }

    // Get warehouse if provided, otherwise get primary warehouse
    let warehouse: any = null
    let warehousePincode: string | undefined = undefined
    
    if (warehouseRefId) {
      const { getVendorWarehouseById } = await import('./vendor-warehouse-access')
      warehouse = await getVendorWarehouseById(warehouseRefId)
      if (!warehouse || warehouse.vendorId !== vendorId) {
        throw new Error(`Warehouse not found or does not belong to vendor: ${warehouseRefId}`)
      }
      warehousePincode = warehouse.pincode
    } else {
      // Get primary warehouse for vendor
      const { getPrimaryVendorWarehouse } = await import('./vendor-warehouse-access')
      warehouse = await getPrimaryVendorWarehouse(vendorId)
      if (warehouse) {
        warehouseRefId = warehouse.warehouseRefId
        warehousePincode = warehouse.pincode
      }
    }

    // Get provider instance
    const provider = await createProvider(providerId, companyId, companyShippingProviderId)
    if (!provider) {
      throw new Error(`Provider not found or not initialized: ${providerId}`)
    }

    // Default phone numbers (stored as constants)
    const DEFAULT_SENDER_PHONE = '9845154070' // Sender/Vendor phone number
    const DEFAULT_RECEIVER_PHONE = '8197077749' // Receiver/Employee phone number

    /**
     * Normalize and validate phone number for Shiprocket API
     * Steps: 1) Remove non-numeric, 2) Strip "91" country code, 3) Strip leading "0", 4) Must be exactly 10 digits
     * @throws Error if phone is invalid and validation is strict
     */
    const normalizePhoneNumber = (
      phone: string | undefined | null, 
      defaultPhone: string, 
      phoneType: 'sender' | 'receiver',
      strictValidation: boolean = false
    ): string => {
      // Step 1: Check if phone is empty/null
      if (!phone || phone.trim() === '' || phone === '0000000000') {
        if (strictValidation) {
          throw new Error(`${phoneType === 'sender' ? 'Pickup' : 'Recipient'} phone number is required and cannot be empty`)
        }
        console.log(`[createApiShipment] Using default ${phoneType} phone: ${defaultPhone}`)
        return defaultPhone
      }

      // Step 2: Remove all non-numeric characters
      let digitsOnly = phone.replace(/\D/g, '')
      
      // Step 3: Reject masked/obfuscated values
      if (digitsOnly.includes('*') || digitsOnly.includes('X') || /^9{6,}/.test(digitsOnly)) {
        if (strictValidation) {
          throw new Error(`${phoneType === 'sender' ? 'Pickup' : 'Recipient'} phone number appears to be masked or invalid: ${phone}`)
        }
        console.log(`[createApiShipment] Rejected masked ${phoneType} phone: ${phone}, using default`)
        return defaultPhone
      }

      // Step 4: Strip leading country code "91" if present
      if (digitsOnly.length >= 12 && digitsOnly.startsWith('91')) {
        digitsOnly = digitsOnly.substring(2)
      }

      // Step 5: Strip leading "0" if present
      if (digitsOnly.length > 10 && digitsOnly.startsWith('0')) {
        digitsOnly = digitsOnly.substring(1)
      }

      // Step 6: Validate final length must be exactly 10 digits
      if (digitsOnly.length !== 10) {
        if (strictValidation) {
          throw new Error(`${phoneType === 'sender' ? 'Pickup' : 'Recipient'} phone number must be exactly 10 digits after normalization. Got: ${digitsOnly.length} digits from "${phone}"`)
        }
        console.log(`[createApiShipment] Invalid ${phoneType} phone length: ${digitsOnly.length} digits from "${phone}", using default`)
        return defaultPhone
      }

      // Step 7: Validate only digits
      if (!/^\d{10}$/.test(digitsOnly)) {
        if (strictValidation) {
          throw new Error(`${phoneType === 'sender' ? 'Pickup' : 'Recipient'} phone number contains invalid characters: ${phone}`)
        }
        console.log(`[createApiShipment] Invalid ${phoneType} phone format: ${phone}, using default`)
        return defaultPhone
      }

      console.log(`[createApiShipment] ✅ Normalized ${phoneType} phone: ${digitsOnly} (from: ${phone})`)
      return digitsOnly
    }

    // Build shipment payload with warehouse address if available
    const fromAddress = warehouse ? {
      name: warehouse.warehouseName || order.vendorName || 'Vendor',
      address: `${warehouse.addressLine1}${warehouse.addressLine2 ? `, ${warehouse.addressLine2}` : ''}`,
      city: warehouse.city,
      state: warehouse.state,
      pincode: warehouse.pincode,
      phone: warehouse.contactPhone || DEFAULT_SENDER_PHONE, // Will be normalized later
      email: undefined,
    } : {
      name: order.vendorName || 'Vendor',
      address: order.deliveryAddress || 'Vendor Address',
      city: 'Vendor City', // TODO: Get from vendor profile
      state: 'Vendor State', // TODO: Get from vendor profile
      pincode: '000000', // TODO: Get from vendor profile
      phone: DEFAULT_SENDER_PHONE, // Default sender phone
      email: undefined,
    }

    // Use shipping address from order if available
    // Get recipient phone from employee record, fallback to default
    const recipientPhone = employeePhone || DEFAULT_RECEIVER_PHONE
    const toAddress = {
      name: order.employeeName || 'Recipient',
      address: order.shipping_address_line_1 || order.deliveryAddress || 'Delivery Address',
      city: order.shipping_city || order.dispatchLocation || 'City',
      state: order.shipping_state || 'State',
      pincode: order.shipping_pincode || '000000',
      phone: recipientPhone,
      email: undefined,
    }

    // ====================================================
    // VALIDATION: Phone Numbers (STRICT for AUTOMATIC mode)
    // ====================================================
    const isAutomaticMode = true // Always validate strictly for API shipments
    let normalizedSenderPhone: string
    let normalizedReceiverPhone: string
    
    try {
      normalizedSenderPhone = normalizePhoneNumber(
        fromAddress.phone, 
        DEFAULT_SENDER_PHONE, 
        'sender',
        isAutomaticMode
      )
      normalizedReceiverPhone = normalizePhoneNumber(
        toAddress.phone, 
        DEFAULT_RECEIVER_PHONE, 
        'receiver',
        isAutomaticMode
      )
    } catch (phoneError: any) {
      console.error('[SHIPMENT-API-ERROR] Phone validation failed:', {
        provider: providerId,
        reason: phoneError.message,
        senderPhone: fromAddress.phone,
        receiverPhone: toAddress.phone,
      })
      throw new Error(`Phone number validation failed: ${phoneError.message}`)
    }

    // ====================================================
    // VALIDATION: Shipment Package & Dimensions (MANDATORY)
    // ====================================================
    if (!packageData || !packageData.shipmentPackageId) {
      console.error('[SHIPMENT-API-ERROR] Package missing:', {
        provider: providerId,
        reason: 'Shipment package is required',
        hasPackageData: !!packageData,
      })
      throw new Error('Shipment package is required. Please select a package before creating shipment.')
    }

    // Get package details
    const { getShipmentPackageById, calculateVolumetricWeight } = await import('./shipment-package-access')
    const shipmentPackage = await getShipmentPackageById(packageData.shipmentPackageId)
    
    if (!shipmentPackage || !shipmentPackage.isActive) {
      console.error('[SHIPMENT-API-ERROR] Package not found or inactive:', {
        provider: providerId,
        reason: `Package ${packageData.shipmentPackageId} not found or inactive`,
        packageId: packageData.shipmentPackageId,
      })
      throw new Error(`Shipment package not found or inactive: ${packageData.shipmentPackageId}`)
    }

    // Use package dimensions or override from packageData
    const lengthCm = packageData.lengthCm || shipmentPackage.lengthCm
    const breadthCm = packageData.breadthCm || shipmentPackage.breadthCm
    const heightCm = packageData.heightCm || shipmentPackage.heightCm
    const volumetricDivisor = shipmentPackage.volumetricDivisor || 5000

    // Calculate volumetric weight
    const volumetricWeight = packageData.volumetricWeight || calculateVolumetricWeight(
      lengthCm,
      breadthCm,
      heightCm,
      volumetricDivisor
    )

    // Calculate chargeable weight (MAX of dead weight and volumetric weight)
    const deadWeightKg = shipmentPackage.deadWeightKg || 0
    const chargeableWeight = Math.max(deadWeightKg, volumetricWeight)

    console.log('[SHIPMENT-PAYLOAD] Package details:', {
      packageId: shipmentPackage.packageId,
      packageName: shipmentPackage.packageName,
      lengthCm,
      breadthCm,
      heightCm,
      volumetricDivisor,
      volumetricWeight,
      deadWeightKg,
      chargeableWeight,
      pickupPhone: normalizedSenderPhone,
      recipientPhone: normalizedReceiverPhone,
    })

    const shipmentPayload: CreateShipmentPayload = {
      prNumber: order.pr_number || order.id,
      poNumber: undefined, // TODO: Get from PO mapping if available
      vendorId: vendorId,
      companyId: companyId,
      fromAddress: {
        ...fromAddress,
        phone: normalizedSenderPhone, // Use normalized phone
      },
      toAddress: {
        ...toAddress,
        phone: normalizedReceiverPhone, // Use normalized phone
      },
      items: (order.items || []).map((item: any) => ({
        productName: item.uniformName || item.uniformId?.name || 'Product',
        quantity: item.quantity,
        weight: undefined, // TODO: Get from product data
      })),
      shipmentValue: order.total,
      paymentMode: 'PREPAID', // Default, can be configured
      courierCode: selectedCourierType === 'SECONDARY' && vendorRouting?.secondaryCourierCode
        ? vendorRouting.secondaryCourierCode
        : vendorRouting?.primaryCourierCode, // Use selected courier type or default to primary
      // Package dimensions (MANDATORY)
      lengthCm,
      breadthCm,
      heightCm,
      weight: chargeableWeight, // Chargeable weight
      volumetricWeight,
    }

    console.log('[createApiShipment] 📦 Shipment payload prepared:', {
      prNumber: shipmentPayload.prNumber,
      fromPincode: fromAddress.pincode,
      toPincode: toAddress.pincode,
      courierCode: shipmentPayload.courierCode,
      hasVendorRouting: !!vendorRouting,
      primaryCourierCode: vendorRouting?.primaryCourierCode,
      secondaryCourierCode: vendorRouting?.secondaryCourierCode,
      providerId,
      companyId,
      hasPackage: !!shipmentPackage,
      hasDimensions: !!(lengthCm && breadthCm && heightCm),
    })

    // Call provider API
    const startTime = Date.now()
    const result = await provider.createShipment(shipmentPayload)
    const responseTime = Date.now() - startTime

    // Log FULL provider response for debugging
    console.log('[createApiShipment] ==========================================')
    console.log('[createApiShipment] PROVIDER CREATE SHIPMENT RESULT (FULL):')
    console.log('[createApiShipment]', JSON.stringify(result, null, 2))
    console.log('[createApiShipment] ==========================================')

    // Log API call - store FULL result including all responses
    const logResponsePayload = {
      // Store the full result object which contains all responses
      fullResult: result,
      createResponse: result.rawResponse?.createResponse,
      awbAssignResponse: result.rawResponse?.awbAssignResponse,
      orderDetailsResponse: result.rawResponse?.orderDetailsResponse,
      // Also store the raw response as-is for backward compatibility
      rawResponse: result.rawResponse,
      // Extract key fields for easy viewing
      extractedFields: {
        order_id: result.rawResponse?.createResponse?.order_id,
        shipment_id: result.rawResponse?.createResponse?.shipment_id,
        awb_code: result.awbNumber || result.trackingNumber,
        providerShipmentReference: result.providerShipmentReference,
      },
    }
    
    console.log('[createApiShipment] ==========================================')
    console.log('[createApiShipment] STORING API LOG WITH FULL RESPONSES:')
    console.log('[createApiShipment]', JSON.stringify(logResponsePayload, null, 2))
    console.log('[createApiShipment] ==========================================')
    
    await logShipmentApiCall(
      undefined, // shipmentId not created yet
      providerId,
      'CREATE',
      shipmentPayload,
      logResponsePayload,
      result.success ? 200 : 500,
      result.success,
      result.error
    )

    if (!result.success) {
      throw new Error(result.error || 'Failed to create shipment via provider')
    }

    // ====================================================
    // CRITICAL VALIDATION: providerShipmentReference MUST be present
    // For Shiprocket: This should be shipment_id (NOT order_id)
    // ====================================================
    if (!result.providerShipmentReference || !result.providerShipmentReference.trim()) {
      console.error('[createApiShipment] ❌ CRITICAL ERROR: providerShipmentReference missing from provider response')
      console.error('[createApiShipment] Provider Response:', JSON.stringify(result, null, 2))
      throw new Error(
        'Provider shipment reference (shipment_id) not received from aggregator. ' +
        'Shipment cannot be tracked or managed. This indicates improper shipment persistence. ' +
        'For Shiprocket, this must be shipment_id (not order_id). ' +
        'Please check provider credentials and API response structure.'
      )
    }

    console.log('[createApiShipment] ==========================================')
    console.log('[createApiShipment] ✅ VALIDATION PASSED: providerShipmentReference received')
    console.log('[createApiShipment] providerShipmentReference (shipment_id):', result.providerShipmentReference)
    console.log('[createApiShipment] ⚠️  This is shipment_id (NOT order_id) - required for all downstream APIs')
    console.log('[createApiShipment] ==========================================')

    // Extract courier information from vendor routing
    const courierCode = selectedCourierType === 'SECONDARY' && vendorRouting?.secondaryCourierCode
      ? vendorRouting.secondaryCourierCode
      : vendorRouting?.primaryCourierCode

    // Extract AWB from provider response
    const courierAwb = result.awbNumber || result.trackingNumber

    // CRITICAL: Validate AWB is present (mandatory for status update)
    if (!courierAwb || !courierAwb.trim()) {
      console.error('[SHIPMENT-API-ERROR] AWB missing:', {
        provider: providerId,
        reason: 'Courier AWB number not received from provider',
        hasAwbNumber: !!result.awbNumber,
        hasTrackingNumber: !!result.trackingNumber,
        rawResponse: result.rawResponse,
      })
      throw new Error('Courier AWB number not received from provider. Shipment cannot be tracked. Status will NOT be updated to DISPATCHED.')
    }

    console.log('[createApiShipment] ✅ Courier AWB captured:', {
      courierAwb,
      courierCode,
      providerShipmentReference: result.providerShipmentReference,
    })

    // Create shipment record
    const shipmentId = generateShipmentId()
    console.log(`[createApiShipment] ==========================================`)
    console.log(`[createApiShipment] 📦 Creating Shipment document`)
    console.log(`[createApiShipment] Internal shipmentId (UDS): ${shipmentId}`)
    console.log(`[createApiShipment] Provider shipment reference (shipment_id): ${result.providerShipmentReference}`)
    console.log(`[createApiShipment] ⚠️  IMPORTANT: providerShipmentReference contains shipment_id (NOT order_id)`)
    console.log(`[createApiShipment] PR Number: ${prId}`)
    console.log(`[createApiShipment] ==========================================`)
    
    // Store FULL normalized response - ensure all important identifiers are captured
    const fullNormalizedResponse = {
      // Store complete raw response for audit/debug
      rawResponse: result.rawResponse,
      // Extract and store key identifiers explicitly
      identifiers: {
        // CRITICAL: providerShipmentReference is shipment_id (NOT order_id)
        providerShipmentReference: result.providerShipmentReference, // This is shipment_id
        orderId: result.rawResponse?.identifiers?.order_id || result.rawResponse?.createResponse?.order_id, // For audit only
        shipmentId: result.providerShipmentReference, // Same as providerShipmentReference (for clarity)
        awbCode: courierAwb,
        trackingNumber: result.trackingNumber,
      },
      // Store all response components
      createResponse: result.rawResponse?.createResponse,
      awbAssignResponse: result.rawResponse?.awbAssignResponse,
      orderDetailsResponse: result.rawResponse?.orderDetailsResponse,
      // Store metadata
      timestamp: new Date().toISOString(),
      providerCode: provider.providerCode,
    }
    
    await Shipment.create({
      shipmentId,
      prNumber: order.pr_number || order.id,
      poNumber: undefined, // TODO: Get from PO mapping
      vendorId: vendorId,
      shipmentMode: 'API',
      providerId: providerId,
      companyShippingProviderId: companyShippingProviderId,
      // CRITICAL: Store provider shipment reference (MANDATORY for all future API calls)
      providerShipmentReference: result.providerShipmentReference,
      trackingNumber: result.trackingNumber,
      trackingUrl: result.trackingUrl,
      warehouseRefId: warehouseRefId,
      warehousePincode: warehousePincode,
      // Package data
      shipmentPackageId: packageData?.shipmentPackageId,
      lengthCm: packageData?.lengthCm,
      breadthCm: packageData?.breadthCm,
      heightCm: packageData?.heightCm,
      volumetricWeight: packageData?.volumetricWeight,
      shippingCost: shippingCost,
      shipmentStatus: 'CREATED',
      lastProviderSyncAt: new Date(),
      // Store FULL normalized response (includes raw + extracted identifiers)
      rawProviderResponse: fullNormalizedResponse,
      // Courier-specific data
      courierAwbNumber: courierAwb.trim(),
      courierProviderCode: courierCode || undefined,
      courierStatus: 'CREATED',
      courierTrackingUrl: result.trackingUrl || undefined,
      courierResponseRaw: result.rawResponse || undefined,
    })

    console.log(`[createApiShipment] ==========================================`)
    console.log(`[createApiShipment] ✅ Shipment document created successfully`)
    console.log(`[createApiShipment] Internal shipmentId (UDS): ${shipmentId}`)
    console.log(`[createApiShipment] Provider shipment reference (shipment_id): ${result.providerShipmentReference}`)
    console.log(`[createApiShipment] ⚠️  IMPORTANT: All future aggregator API calls MUST use providerShipmentReference`)
    console.log(`[createApiShipment] ⚠️  providerShipmentReference contains shipment_id (NOT order_id)`)
    console.log(`[createApiShipment] ⚠️  DO NOT use internal shipmentId (${shipmentId}) for aggregator API calls`)
    console.log(`[createApiShipment] ==========================================`)

    // Update PR/Order with shipment data
    console.log(`[createApiShipment] 🔄 Updating Order document (PR: ${prId}) with shipmentId: ${shipmentId}`)
    
    // DUAL-WRITE: Order status (behind feature flag)
    let unifiedFields: Record<string, any> = {}
    if (process.env.DUAL_WRITE_ENABLED === "true") {
      try {
        const dualWriteResult = safeDualWriteOrderStatus(prId, 'DISPATCHED' as UnifiedOrderStatus, null, null, { source: 'createApiShipment' })
        unifiedFields = dualWriteResult.unifiedUpdate
        console.log(`[createApiShipment] 🔄 DUAL-WRITE: Order ${prId} → unified_status=DISPATCHED`)
      } catch (dualWriteError: any) {
        console.error(`[createApiShipment] ❌ DUAL-WRITE error (continuing with legacy): ${dualWriteError.message}`)
      }
    }
    
    await Order.updateOne(
      { id: prId },
      {
        $set: {
          shipmentId: shipmentId,
          trackingNumber: result.trackingNumber,
          logisticsProviderCode: provider.providerCode,
          logisticsTrackingUrl: result.trackingUrl,
          logisticsPayloadRef: result.providerShipmentReference,
          dispatchStatus: 'SHIPPED',
          dispatchedDate: new Date(),
          ...unifiedFields,
        },
      }
    )
    console.log(`[createApiShipment] ✅ Order document updated with shipmentId: ${shipmentId}`)

    return {
      success: true,
      shipmentId,
      trackingNumber: result.trackingNumber || undefined,
      courierAwbNumber: courierAwb?.trim() || undefined,
    }
  } catch (error: any) {
    console.error('[createApiShipment] Error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error',
    }
  }
}

/**
 * Fetch AWB number from provider for an existing shipment
 * Useful when AWB was not captured during initial creation
 */
export async function fetchShipmentAWB(shipmentId: string): Promise<{ success: boolean; awbNumber?: string; error?: string }> {
  await connectDB()

  try {
    const shipment = await Shipment.findOne({ shipmentId }).lean()
    if (!shipment) {
      throw new Error(`Shipment not found: ${shipmentId}`)
    }

    if (shipment.shipmentMode !== 'API' || !shipment.providerId || !shipment.providerShipmentReference) {
      return { success: false, error: 'Not an API shipment or missing provider data' }
    }

    // Get provider instance
    const provider = await createProvider(shipment.providerId)
    if (!provider) {
      throw new Error(`Provider not found: ${shipment.providerId}`)
    }

    // Fetch order details from provider to get AWB
    console.log(`[fetchShipmentAWB] ==========================================`)
    console.log(`[fetchShipmentAWB] Fetching AWB for shipment`)
    console.log(`[fetchShipmentAWB] Internal shipmentId (UDS): ${shipmentId}`)
    console.log(`[fetchShipmentAWB] Provider: ${shipment.providerId}`)
    console.log(`[fetchShipmentAWB] Provider Reference: ${shipment.providerShipmentReference}`)
    console.log(`[fetchShipmentAWB] ⚠️  Using providerShipmentReference for aggregator API call`)
    console.log(`[fetchShipmentAWB] ==========================================`)
    
    if (!shipment.providerShipmentReference) {
      console.error(`[fetchShipmentAWB] ❌ CRITICAL: providerShipmentReference missing`)
      throw new Error('Provider shipment reference is missing. Cannot fetch AWB. This shipment may have been created improperly.')
    }
    
    const statusResult = await provider.getShipmentStatus(shipment.providerShipmentReference)
    
    console.log('[fetchShipmentAWB] ==========================================')
    console.log('[fetchShipmentAWB] PROVIDER STATUS RESPONSE (FULL):')
    console.log('[fetchShipmentAWB]', JSON.stringify(statusResult, null, 2))
    console.log('[fetchShipmentAWB] ==========================================')
    
    if (!statusResult.success) {
      throw new Error(statusResult.error || 'Failed to fetch shipment status from provider')
    }

    const awbNumber = statusResult.trackingNumber || statusResult.rawResponse?.awb_code || statusResult.rawResponse?.awbCode || statusResult.rawResponse?.awb

    if (!awbNumber) {
      console.error(`[fetchShipmentAWB] AWB not found in status response:`, JSON.stringify(statusResult, null, 2))
      return { success: false, error: 'AWB number not found in provider response' }
    }

    // Update shipment with AWB
    await Shipment.updateOne(
      { shipmentId },
      {
        $set: {
          courierAwbNumber: awbNumber,
          trackingNumber: awbNumber,
          trackingUrl: statusResult.trackingUrl || `https://shiprocket.co/tracking/${awbNumber}`,
          courierTrackingUrl: statusResult.trackingUrl || `https://shiprocket.co/tracking/${awbNumber}`,
          lastProviderSyncAt: new Date(),
          courierResponseRaw: statusResult.rawResponse,
        },
      }
    )

    // Update Order with AWB (match by pr_number or id; Shipment.prNumber may be order.id when pr_number was empty)
    await Order.updateMany(
      { $or: [{ pr_number: shipment.prNumber }, { id: shipment.prNumber }] },
      {
        $set: {
          trackingNumber: awbNumber,
          logisticsTrackingUrl: statusResult.trackingUrl || `https://shiprocket.co/tracking/${awbNumber}`,
        },
      }
    )

    console.log(`[fetchShipmentAWB] ✅ AWB fetched and updated: ${awbNumber}`)

    return {
      success: true,
      awbNumber,
    }
  } catch (error: any) {
    console.error('[fetchShipmentAWB] Error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error',
    }
  }
}

/**
 * Sync shipment status from provider
 */
export async function syncShipmentStatus(shipmentId: string): Promise<{ success: boolean; updated: boolean; error?: string }> {
  await connectDB()

  try {
    const shipment = await Shipment.findOne({ shipmentId }).lean()
    if (!shipment) {
      throw new Error(`Shipment not found: ${shipmentId}`)
    }

    if (shipment.shipmentMode !== 'API' || !shipment.providerId || !shipment.providerShipmentReference) {
      return { success: true, updated: false } // Not an API shipment or missing provider data
    }

    if (shipment.shipmentStatus === 'DELIVERED' || shipment.shipmentStatus === 'FAILED') {
      return { success: true, updated: false } // Already in final state
    }

    // Get provider instance (without company context for status checks)
    const provider = await createProvider(shipment.providerId)
    if (!provider) {
      throw new Error(`Provider not found: ${shipment.providerId}`)
    }

    // Get status from provider
    console.log(`[syncShipmentStatus] ==========================================`)
    console.log(`[syncShipmentStatus] Syncing shipment status from provider`)
    console.log(`[syncShipmentStatus] Internal shipmentId (UDS): ${shipmentId}`)
    console.log(`[syncShipmentStatus] Provider: ${shipment.providerId}`)
    console.log(`[syncShipmentStatus] Provider Reference: ${shipment.providerShipmentReference}`)
    console.log(`[syncShipmentStatus] ⚠️  Using providerShipmentReference for aggregator API call`)
    console.log(`[syncShipmentStatus] ==========================================`)
    
    const startTime = Date.now()
    const statusResult = await provider.getShipmentStatus(shipment.providerShipmentReference)
    const responseTime = Date.now() - startTime

    // Log API call
    await logShipmentApiCall(
      shipmentId,
      shipment.providerId,
      'TRACK',
      { providerShipmentReference: shipment.providerShipmentReference },
      statusResult.rawResponse || statusResult,
      statusResult.success ? 200 : 500,
      statusResult.success,
      statusResult.error
    )

    if (!statusResult.success) {
      throw new Error(statusResult.error || 'Failed to get shipment status from provider')
    }

    // Update shipment
    const updates: any = {
      shipmentStatus: statusResult.status,
      lastProviderSyncAt: new Date(),
      rawProviderResponse: statusResult.rawResponse,
    }

    if (statusResult.trackingNumber) {
      updates.trackingNumber = statusResult.trackingNumber
    }
    if (statusResult.trackingUrl) {
      updates.trackingUrl = statusResult.trackingUrl
    }

    // Update courier status if shipment has courier data
    if (shipment.courierProviderCode) {
      updates.courierStatus = statusResult.status
      if (statusResult.trackingUrl) {
        updates.courierTrackingUrl = statusResult.trackingUrl
      }
      if (statusResult.rawResponse) {
        updates.courierResponseRaw = statusResult.rawResponse
      }
    }

    await Shipment.updateOne({ shipmentId }, { $set: updates })

    // If delivered, update PR/Order delivery status
    if (statusResult.status === 'DELIVERED') {
      // DUAL-WRITE: Order status (behind feature flag)
      let unifiedDeliveryFields: Record<string, any> = {}
      if (process.env.DUAL_WRITE_ENABLED === "true") {
        try {
          const dualWriteResult = safeDualWriteOrderStatus(shipment.prNumber || '', 'DELIVERED' as UnifiedOrderStatus, null, null, { source: 'syncShipmentStatus' })
          unifiedDeliveryFields = dualWriteResult.unifiedUpdate
          console.log(`[syncShipmentStatus] 🔄 DUAL-WRITE: Order (PR: ${shipment.prNumber}) → unified_status=DELIVERED`)
        } catch (dualWriteError: any) {
          console.error(`[syncShipmentStatus] ❌ DUAL-WRITE error (continuing with legacy): ${dualWriteError.message}`)
        }
      }
      
      await Order.updateOne(
        { pr_number: shipment.prNumber },
        {
          $set: {
            deliveryStatus: 'DELIVERED',
            deliveredDate: statusResult.deliveredDate || new Date(),
            trackingNumber: statusResult.trackingNumber || shipment.trackingNumber,
            logisticsTrackingUrl: statusResult.trackingUrl || shipment.trackingUrl,
            ...unifiedDeliveryFields,
          },
        }
      )

      // Update item-level delivery quantities (no status change here, just items)
      const order = await Order.findOne({ pr_number: shipment.prNumber }).lean()
      if (order && order.items) {
        const updatedItems = order.items.map((item: any) => ({
          ...item,
          deliveredQuantity: item.quantity, // Mark all items as delivered
          itemShipmentStatus: 'DELIVERED',
        }))

        await Order.updateOne(
          { pr_number: shipment.prNumber },
          { $set: { items: updatedItems } }
        )
      }
    }

    return {
      success: true,
      updated: true,
    }
  } catch (error: any) {
    console.error('[syncShipmentStatus] Error:', error)
    return {
      success: false,
      updated: false,
      error: error.message || 'Unknown error',
    }
  }
}

/**
 * Sync all pending API shipments
 */
export async function syncAllPendingShipments(): Promise<{ synced: number; errors: number }> {
  await connectDB()

  const pendingShipments = await Shipment.find({
    shipmentMode: 'API',
    shipmentStatus: { $in: ['CREATED', 'IN_TRANSIT'] },
    providerId: { $exists: true },
    providerShipmentReference: { $exists: true },
  })
    .select('shipmentId')
    .lean()

  let synced = 0
  let errors = 0

  for (const shipment of pendingShipments) {
    const result = await syncShipmentStatus(shipment.shipmentId)
    if (result.success && result.updated) {
      synced++
    } else if (!result.success) {
      errors++
    }
  }

  return { synced, errors }
}

