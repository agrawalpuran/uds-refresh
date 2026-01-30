import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import { getActiveVendorRoutingForCompany } from '@/lib/db/vendor-shipping-routing-access'
import { getShipmentServiceProviderByRefId } from '@/lib/db/shipping-config-access'
import { getProviderInstance } from '@/lib/providers/ProviderFactory'
import { getShipmentPackageById } from '@/lib/db/shipment-package-access'
import { calculateVolumetricWeight } from '@/lib/db/shipment-package-access'

/**
 * POST /api/shipping/estimate
 * Get shipping estimation (serviceability, cost, timeline) for primary and secondary couriers
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    }

    const { sourcePincode, destinationPincode, shipmentPackageId, weightDetails, companyId, vendorId } = body

    console.log('[shipping/estimate API] Received request:', {
      sourcePincode,
      destinationPincode,
      shipmentPackageId,
      volumetricWeight: weightDetails?.volumetricWeight,
      companyId,
      vendorId,
    })

    // Validation
    if (!sourcePincode || !destinationPincode) {
      console.error('[shipping/estimate API] Missing pincodes:', { sourcePincode, destinationPincode })
      return NextResponse.json(
        { error: 'sourcePincode and destinationPincode are required' },
        { status: 400 }
      )
    }

    // Ensure pincodes are strings and valid 6-digit format
    const sourcePincodeStr = String(sourcePincode).trim()
    const destinationPincodeStr = String(destinationPincode).trim()

    if (!/^\d{6}$/.test(sourcePincodeStr) || !/^\d{6}$/.test(destinationPincodeStr)) {
      console.error('[shipping/estimate API] Invalid pincode format:', { sourcePincodeStr, destinationPincodeStr })
      return NextResponse.json(
        { error: 'Pincodes must be 6-digit numbers' },
        { status: 400 }
      )
    }

    if (!companyId || !vendorId) {
      return NextResponse.json(
        { error: 'companyId and vendorId are required' },
        { status: 400 }
      )
    }

    await connectDB()

    console.log('[shipping/estimate API] Validated pincodes:', {
      sourcePincode: sourcePincodeStr,
      destinationPincode: destinationPincodeStr,
    })

    // Get vendor routing
    const routing = await getActiveVendorRoutingForCompany(vendorId, companyId)
    if (!routing) {
      console.error('[shipping/estimate API] No active vendor routing found:', { vendorId, companyId })
      return NextResponse.json({
        primary: null,
        secondary: null,
        error: 'No active vendor routing found',
      }, { status: 200 })
    }

    console.log('[shipping/estimate API] Found routing:', {
      routingId: routing.routingId,
      primaryCourierCode: routing.primaryCourierCode,
      secondaryCourierCode: routing.secondaryCourierCode,
      providerRefId: routing.shipmentServiceProviderRefId,
    })

    // Get provider - routing already has providerCode populated, but we need full provider for auth
    const provider = await getShipmentServiceProviderByRefId(routing.shipmentServiceProviderRefId, true)
    if (!provider) {
      console.error('[shipping/estimate API] Provider not found for refId:', routing.shipmentServiceProviderRefId)
      return NextResponse.json({
        primary: null,
        secondary: null,
        error: 'Shipping provider not found',
      }, { status: 200 })
    }

    console.log('[shipping/estimate API] Found provider:', {
      providerId: provider.providerId,
      providerCode: provider.providerCode,
      providerName: provider.providerName,
    })

    // Get package details if provided
    let volumetricWeight = weightDetails?.volumetricWeight
    if (shipmentPackageId && !volumetricWeight) {
      const pkg = await getShipmentPackageById(shipmentPackageId)
      if (pkg) {
        volumetricWeight = pkg.volumetricWeightKg
      }
    }

    console.log('[shipping/estimate API] Weight details:', {
      volumetricWeight,
      shipmentPackageId,
    })

    // Get provider instance (with decrypted authConfig from ShipmentServiceProvider)
    let providerInstance: any
    try {
      providerInstance = await getProviderInstance(provider.providerCode, undefined)
    } catch (authError: any) {
      const msg = authError?.message || String(authError)
      console.error('[shipping/estimate API] Provider init failed:', msg)
      const isCreds = /credential|password|email|decrypt|auth|key|missing|required/i.test(msg)
      const userMessage = isCreds
        ? 'Shipping provider credentials are missing or could not be decrypted. Please ensure ENCRYPTION_KEY is correct and credentials are set in Super Admin → Shipping Provider (authConfig) or Company Shipping Provider settings.'
        : msg
      return NextResponse.json({ error: userMessage }, { status: 500 })
    }
    if (!providerInstance) {
      return NextResponse.json({
        primary: null,
        secondary: null,
        error: 'Provider instance not available',
      }, { status: 200 })
    }

    // Check serviceability for primary courier
    let primaryResult: any = null
    if (routing.primaryCourierCode) {
      try {
        console.log('[shipping/estimate API] Checking primary courier serviceability:', {
          fromPincode: sourcePincodeStr,
          toPincode: destinationPincodeStr,
          courierCode: routing.primaryCourierCode,
          weight: volumetricWeight || 1,
        })

        // checkServiceability signature: (pincode: string, fromPincode?: string, weight?: number, codAmount?: number, courierCode?: string)
        // Note: pincode = destination, fromPincode = source
        const serviceability = await providerInstance.checkServiceability(
          destinationPincodeStr,  // pincode (destination)
          sourcePincodeStr,       // fromPincode (source)
          volumetricWeight || 1,  // weight (default to 1kg if not provided)
          0,                      // codAmount (estimation doesn't need COD)
          routing.primaryCourierCode // courierCode
        )

        console.log('[shipping/estimate API] Primary courier serviceability result:', serviceability)

        // Extract cost and courier name from availableCouriers if serviceable
        let estimatedCost: number | undefined = undefined
        let courierName: string | undefined = undefined
        
        if (serviceability.serviceable && serviceability.availableCouriers && serviceability.availableCouriers.length > 0) {
          // Try to find matching courier by code (handle both string and numeric codes)
          const primaryCodeStr = String(routing.primaryCourierCode).trim()
          const matchingCourier = serviceability.availableCouriers.find((c: any) => {
            const courierCodeStr = String(c.courierCode || '').trim()
            return courierCodeStr === primaryCodeStr || 
                   courierCodeStr.toLowerCase() === primaryCodeStr.toLowerCase() ||
                   courierCodeStr === primaryCodeStr.toString()
          })
          
          const selectedCourier = matchingCourier || serviceability.availableCouriers[0]
          estimatedCost = selectedCourier?.estimatedCost
          courierName = selectedCourier?.courierName
          
          // If courier name is still not found, try to get it from provider's courier list
          if (!courierName || courierName === routing.primaryCourierCode) {
            try {
              if (providerInstance.getSupportedCouriers) {
                const couriersResult = await providerInstance.getSupportedCouriers()
                if (couriersResult.success && couriersResult.couriers) {
                  const providerCourier = couriersResult.couriers.find((c: any) => {
                    const codeStr = String(c.courierCode || '').trim()
                    return codeStr === primaryCodeStr || 
                           codeStr.toLowerCase() === primaryCodeStr.toLowerCase()
                  })
                  if (providerCourier?.courierName) {
                    courierName = providerCourier.courierName
                    console.log('[shipping/estimate API] Found courier name from provider list:', {
                      code: routing.primaryCourierCode,
                      name: courierName,
                    })
                  }
                }
              }
            } catch (error: any) {
              console.warn('[shipping/estimate API] Failed to fetch courier name from provider:', error.message)
            }
          }
          
          // Final fallback to courier code if name is still not available
          if (!courierName) {
            courierName = routing.primaryCourierCode
          }
        } else {
          // If not serviceable, still try to get courier name from provider list
          try {
            if (providerInstance.getSupportedCouriers) {
              const couriersResult = await providerInstance.getSupportedCouriers()
              if (couriersResult.success && couriersResult.couriers) {
                const primaryCodeStr = String(routing.primaryCourierCode).trim()
                const providerCourier = couriersResult.couriers.find((c: any) => {
                  const codeStr = String(c.courierCode || '').trim()
                  return codeStr === primaryCodeStr || 
                         codeStr.toLowerCase() === primaryCodeStr.toLowerCase()
                })
                if (providerCourier?.courierName) {
                  courierName = providerCourier.courierName
                }
              }
            }
          } catch (error: any) {
            console.warn('[shipping/estimate API] Failed to fetch courier name from provider:', error.message)
          }
          
          // Fallback to courier code
          if (!courierName) {
            courierName = routing.primaryCourierCode
          }
        }

        primaryResult = {
          courier: routing.primaryCourierCode,
          courierName: courierName,
          serviceable: serviceability.serviceable || false,
          estimatedDays: serviceability.estimatedDays || undefined,
          estimatedCost: estimatedCost,
          message: serviceability.message || undefined,
        }
      } catch (error: any) {
        primaryResult = {
          courier: routing.primaryCourierCode,
          serviceable: false,
          message: error.message || 'Serviceability check failed',
        }
      }
    }

    // Check serviceability for secondary courier
    let secondaryResult: any = null
    if (routing.secondaryCourierCode) {
      try {
        console.log('[shipping/estimate API] Checking secondary courier serviceability:', {
          fromPincode: sourcePincodeStr,
          toPincode: destinationPincodeStr,
          courierCode: routing.secondaryCourierCode,
          weight: volumetricWeight || 1,
        })

        // checkServiceability signature: (pincode: string, fromPincode?: string, weight?: number, codAmount?: number, courierCode?: string)
        // Note: pincode = destination, fromPincode = source
        const serviceability = await providerInstance.checkServiceability(
          destinationPincodeStr,  // pincode (destination)
          sourcePincodeStr,       // fromPincode (source)
          volumetricWeight || 1,  // weight
          0,                      // codAmount
          routing.secondaryCourierCode // courierCode
        )

        console.log('[shipping/estimate API] Secondary courier serviceability result:', serviceability)

        // Extract cost and courier name from availableCouriers if serviceable
        let estimatedCost: number | undefined = undefined
        let courierName: string | undefined = undefined
        
        if (serviceability.serviceable && serviceability.availableCouriers && serviceability.availableCouriers.length > 0) {
          // Try to find matching courier by code (handle both string and numeric codes)
          const secondaryCodeStr = String(routing.secondaryCourierCode).trim()
          const matchingCourier = serviceability.availableCouriers.find((c: any) => {
            const courierCodeStr = String(c.courierCode || '').trim()
            return courierCodeStr === secondaryCodeStr || 
                   courierCodeStr.toLowerCase() === secondaryCodeStr.toLowerCase() ||
                   courierCodeStr === secondaryCodeStr.toString()
          })
          
          const selectedCourier = matchingCourier || serviceability.availableCouriers[0]
          estimatedCost = selectedCourier?.estimatedCost
          courierName = selectedCourier?.courierName
          
          // If courier name is still not found, try to get it from provider's courier list
          if (!courierName || courierName === routing.secondaryCourierCode) {
            try {
              if (providerInstance.getSupportedCouriers) {
                const couriersResult = await providerInstance.getSupportedCouriers()
                if (couriersResult.success && couriersResult.couriers) {
                  const providerCourier = couriersResult.couriers.find((c: any) => {
                    const codeStr = String(c.courierCode || '').trim()
                    return codeStr === secondaryCodeStr || 
                           codeStr.toLowerCase() === secondaryCodeStr.toLowerCase()
                  })
                  if (providerCourier?.courierName) {
                    courierName = providerCourier.courierName
                    console.log('[shipping/estimate API] Found secondary courier name from provider list:', {
                      code: routing.secondaryCourierCode,
                      name: courierName,
                    })
                  }
                }
              }
            } catch (error: any) {
              console.warn('[shipping/estimate API] Failed to fetch secondary courier name from provider:', error.message)
            }
          }
          
          // Final fallback to courier code if name is still not available
          if (!courierName) {
            courierName = routing.secondaryCourierCode
          }
        } else {
          // If not serviceable, still try to get courier name from provider list
          try {
            if (providerInstance.getSupportedCouriers) {
              const couriersResult = await providerInstance.getSupportedCouriers()
              if (couriersResult.success && couriersResult.couriers) {
                const secondaryCodeStr = String(routing.secondaryCourierCode).trim()
                const providerCourier = couriersResult.couriers.find((c: any) => {
                  const codeStr = String(c.courierCode || '').trim()
                  return codeStr === secondaryCodeStr || 
                         codeStr.toLowerCase() === secondaryCodeStr.toLowerCase()
                })
                if (providerCourier?.courierName) {
                  courierName = providerCourier.courierName
                }
              }
            }
          } catch (error: any) {
            console.warn('[shipping/estimate API] Failed to fetch secondary courier name from provider:', error.message)
          }
          
          // Fallback to courier code
          if (!courierName) {
            courierName = routing.secondaryCourierCode
          }
        }

        secondaryResult = {
          courier: routing.secondaryCourierCode,
          courierName: courierName,
          serviceable: serviceability.serviceable || false,
          estimatedDays: serviceability.estimatedDays || undefined,
          estimatedCost: estimatedCost,
          message: serviceability.message || undefined,
        }
      } catch (error: any) {
        secondaryResult = {
          courier: routing.secondaryCourierCode,
          serviceable: false,
          message: error.message || 'Serviceability check failed',
        }
      }
    }

    return NextResponse.json({
      success: true,
      primary: primaryResult,
      secondary: secondaryResult,
    }, { status: 200 })
  } catch (error: any) {
    console.error('[shipping/estimate API] Error:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || 
        errorMessage.includes('Not found') || 
        errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    }
    
    // Return 401 for authentication errors
    if (errorMessage.includes('Unauthorized') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('token')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
      )
    }
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
