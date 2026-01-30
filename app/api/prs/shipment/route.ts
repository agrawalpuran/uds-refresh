
import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import { updatePRShipmentStatus, updatePRDeliveryStatus } from '@/lib/db/data-access'
import { createApiShipment, isApiShipmentEnabled } from '@/lib/db/shipment-execution'
import { getEnabledProvidersForCompany } from '@/lib/providers/ProviderFactory'
// Ensure models are registered
import '@/lib/models/Order'
import '@/lib/models/PurchaseOrder'
import '@/lib/models/Shipment'

/**
 * POST /api/prs/shipment
 * Update PR shipment status (vendor marks items as SHIPPED)
 * MANDATORY: shipperName, dispatchedDate, modeOfTransport, at least one item dispatchedQuantity > 0
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    // CRITICAL: Connect to database before any queries
    await connectDB()

    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json(
        {
          error: 'Invalid JSON in request body',
        },
        { status: 400 }
      )
    }

    const { prId, shipmentData, vendorId } = body

    // Validate required fields
    if (!prId) {
      return NextResponse.json({ error: 'PR ID is required' }, { status: 400 })
    }
    if (!vendorId) {
      return NextResponse.json({ error: 'Vendor ID is required' }, { status: 400 })
    }
    if (!shipmentData) {
      return NextResponse.json({ error: 'Shipment data is required' }, { status: 400 })
    }

    // Validate shipment data structure
    // Note: shipperName is optional in UI but we provide a default if not provided
    if (!shipmentData.shipperName || !shipmentData.shipperName.trim()) {
      shipmentData.shipperName = 'Vendor' // Default value when not provided from UI
    }

    if (!shipmentData.dispatchedDate) {
      return NextResponse.json({ error: 'dispatchedDate is required' }, { status: 400 })
    }
    if (!shipmentData.modeOfTransport) {
      return NextResponse.json({ error: 'modeOfTransport is required' }, { status: 400 })
    }
    if (
      !shipmentData.itemDispatchedQuantities ||
      !Array.isArray(shipmentData.itemDispatchedQuantities)
    ) {
      return NextResponse.json(
        { error: 'itemDispatchedQuantities array is required' },
        { status: 400 }
      )
    }

    // Parse dispatched date
    const dispatchedDate = new Date(shipmentData.dispatchedDate)
    const expectedDeliveryDate = shipmentData.expectedDeliveryDate
      ? new Date(shipmentData.expectedDeliveryDate)
      : undefined

    // Get company ID from order to check shipment mode
    console.log('[API /prs/shipment POST] ==========================================')
    console.log('[API /prs/shipment POST] Looking up order for shipment creation')
    console.log('[API /prs/shipment POST] prId:', prId)
    console.log('[API /prs/shipment POST] vendorId:', vendorId)
    console.log('[API /prs/shipment POST] ==========================================')

    const order = await import('@/lib/models/Order').then((m) => m.default)
    const mongoose = await import('mongoose')

    // Try to find order with detailed logging
    const orderDoc: any = await order.findOne({ id: prId, vendorId }).select('companyId').lean()

    if (!orderDoc) {
      // Try to find order without vendorId filter to see if it exists
      const orderWithoutVendor: any = await order
        .findOne({ id: prId })
        .select('id vendorId companyId')
        .lean()

      console.error('[API /prs/shipment POST] ❌ Order lookup failed')
      console.error('[API /prs/shipment POST] Searched with:', { id: prId, vendorId })

      if (orderWithoutVendor) {
        console.error('[API /prs/shipment POST] Order exists but vendorId mismatch:')
        console.error('[API /prs/shipment POST]   Expected vendorId:', vendorId)
        console.error('[API /prs/shipment POST]   Actual vendorId:', orderWithoutVendor.vendorId)
        return NextResponse.json(
          {
            error: 'Order not found for this vendor',
            details: `Order ${prId} exists but belongs to vendor ${orderWithoutVendor.vendorId}, not ${vendorId}`,
          },
          { status: 403 }
        )
      } else {
        console.error('[API /prs/shipment POST] Order does not exist with id:', prId)
        // Try to find similar orders for debugging
        const similarOrders = await order
          .find({ id: { $regex: prId.substring(0, Math.min(10, prId.length)) } })
          .select('id vendorId')
          .limit(5)
          .lean()
        console.error(
          '[API /prs/shipment POST] Similar order IDs found:',
          similarOrders.map((o: any) => ({ id: o.id, vendorId: o.vendorId }))
        )

        return NextResponse.json(
          {
            error: 'Order not found',
            details: `No order found with id: ${prId} and vendorId: ${vendorId}`,
            searchedPrId: prId,
            searchedVendorId: vendorId,
          },
          { status: 404 }
        )
      }
    }

    console.log('[API /prs/shipment POST] ✅ Order found:', {
      id: orderDoc.id,
      companyId: orderDoc.companyId,
    })

    // Extract companyId - use string ID directly
    const Company = await import('@/lib/models/Company').then((m) => m.default)
    let companyId: string | null = null
    if (orderDoc.companyId) {
      if (typeof orderDoc.companyId === 'object' && orderDoc.companyId?.id) {
        // Populated object with id field
        companyId = String(orderDoc.companyId.id)
      } else if (typeof orderDoc.companyId === 'string') {
        // Already a string (should be 6-digit company ID)
        companyId = orderDoc.companyId
      } else {
        // If it's an ObjectId/Buffer, convert to string and look up Company by string id
        // This handles legacy data where companyId might still be ObjectId
        const companyObjectIdStr = Buffer.isBuffer(orderDoc.companyId)
          ? orderDoc.companyId.toString('hex')
          : String(orderDoc.companyId)

        // Try to find company by string ID
        const companyIdStr = String(companyObjectIdStr)
        if (/^[A-Za-z0-9_-]{1,50}$/.test(companyIdStr)) {
          const company: any = await Company.findOne({ id: companyIdStr }).select('id').lean()
          if (company) {
            companyId = company.id
          }
        }
      }
    }

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID not found for order' }, { status: 400 })
    }

    // ====================================================
    // CHECKPOINT 1: Company Shipping Mode Resolution
    // ====================================================
    const company: any = await Company.findOne({ id: companyId })
      .select('shipmentRequestMode name')
      .lean()

    const companyShipmentMode = company?.shipmentRequestMode || 'MANUAL'
    const explicitShipmentMode = shipmentData.shipmentMode || 'MANUAL'

    console.log('[SHIP-RCA][COMPANY_MODE]', {
      companyId,
      companyName: company?.name || 'Unknown',
      companyShippingMode: companyShipmentMode,
      source: 'Company.findOne({ id: companyId }).select("shipmentRequestMode name")',
      dbValue: company?.shipmentRequestMode,
      resolvedValue: companyShipmentMode,
      isDefaulted: !company?.shipmentRequestMode,
      explicitShipmentMode,
    })

    // Determine if we should use API shipment:
    // 1. Explicit shipmentMode === 'API' from frontend, OR
    // 2. Company shipmentRequestMode === 'AUTOMATIC' (automatic detection)
    const shouldUseApiShipment =
      explicitShipmentMode === 'API' || companyShipmentMode === 'AUTOMATIC'

    // GUARDRAIL: If shipping mode is AUTOMATIC, reject manual courier overrides
    if (companyShipmentMode === 'AUTOMATIC') {
      // In AUTOMATIC mode, courier should come from routing, not from UI
      // If UI tries to pass a different courier, log a warning but allow it (for backward compatibility)
      // The routing-based courier will be used anyway
      if (shipmentData.carrierName && shipmentData.carrierName.trim()) {
        console.log(
          '[API /prs/shipment POST] ⚠️ AUTOMATIC mode: UI provided courier override:',
          shipmentData.carrierName
        )
        console.log('[API /prs/shipment POST] ⚠️ Routing-based courier will be used instead')
      }

      // In AUTOMATIC mode, modeOfTransport should be COURIER (not DIRECT)
      if (
        shipmentData.modeOfTransport &&
        shipmentData.modeOfTransport !== 'COURIER' &&
        shipmentData.modeOfTransport !== 'OTHER'
      ) {
        console.log(
          '[API /prs/shipment POST] ⚠️ AUTOMATIC mode: Invalid modeOfTransport:',
          shipmentData.modeOfTransport
        )
        console.log(
          '[API /prs/shipment POST] ⚠️ Overriding to COURIER for AUTOMATIC mode'
        )
        shipmentData.modeOfTransport = 'COURIER'
      }
    }

    console.log('[API /prs/shipment POST] Shipment mode determination:', {
      prId,
      vendorId,
      companyId,
      companyName: company?.name || 'Unknown',
      companyShipmentMode,
      explicitShipmentMode,
      shouldUseApiShipment,
      shipperName: shipmentData.shipperName,
      dispatchedDate: dispatchedDate.toISOString(),
    })

    // Check if API shipment should be used
    if (shouldUseApiShipment) {
      // PRE-CHECK: Auto-enable provider from vendor routing if it exists (before checking isApiShipmentEnabled)
      // This ensures providers are enabled when vendor routing is configured
      try {
        const { getActiveVendorRoutingForCompany } = await import(
          '@/lib/db/vendor-shipping-routing-access'
        )
        const preCheckRouting = await getActiveVendorRoutingForCompany(vendorId, companyId)

        if (preCheckRouting) {
          console.log(
            '[API /prs/shipment POST] Found vendor routing, checking if provider is enabled...'
          )
          const ShipmentServiceProvider = await import(
            '@/lib/models/ShipmentServiceProvider'
          ).then((m) => m.default)
          const preCheckProvider: any = await ShipmentServiceProvider.findOne({
            providerRefId: preCheckRouting.shipmentServiceProviderRefId,
          }).lean()

          if (preCheckProvider) {
            const CompanyShippingProvider = await import(
              '@/lib/models/CompanyShippingProvider'
            ).then((m) => m.default)
            const existingCompanyProvider: any = await CompanyShippingProvider.findOne({
              companyId,
              providerId: preCheckProvider.providerId,
            }).lean()

            // Auto-enable if routing exists but provider is not enabled
            if (!existingCompanyProvider || !existingCompanyProvider.isEnabled) {
              console.log(
                '[API /prs/shipment POST] ⚠️ Auto-enabling provider from vendor routing...'
              )
              const { generateShippingId } = await import('@/lib/db/shipping-config-access')

              if (!existingCompanyProvider) {
                // Create new
                const newCompanyShippingProviderId = generateShippingId('CSP')
                await CompanyShippingProvider.create({
                  companyShippingProviderId: newCompanyShippingProviderId,
                  companyId,
                  providerId: preCheckProvider.providerId,
                  isEnabled: true,
                  isDefault: false,
                  createdBy: 'System (Auto-enabled from vendor routing)',
                })
                console.log('[API /prs/shipment POST] ✅ Auto-enabled provider for company:', {
                  companyShippingProviderId: newCompanyShippingProviderId,
                  companyId,
                  providerId: preCheckProvider.providerId,
                  providerCode: preCheckProvider.providerCode,
                })
              } else {
                // Re-enable existing
                await CompanyShippingProvider.updateOne(
                  { companyId, providerId: preCheckProvider.providerId },
                  { $set: { isEnabled: true, updatedBy: 'System' } }
                )
                console.log('[API /prs/shipment POST] ✅ Re-enabled provider for company:', {
                  companyId,
                  providerId: preCheckProvider.providerId,
                  providerCode: preCheckProvider.providerCode,
                })
              }
            }
          }
        }
      } catch (error: any) {
        console.warn(
          '[API /prs/shipment POST] ⚠️ Error during pre-check auto-enablement:',
          error.message
        )
        // Continue - don't fail if auto-enablement fails
      }

      // ====================================================
      // CHECKPOINT 2: CompanyShippingProvider Presence
      // ====================================================
      const enabledProviders = await getEnabledProvidersForCompany(companyId)

      console.log('[SHIP-RCA][COMPANY_PROVIDERS]', {
        companyId,
        enabledProvidersCount: enabledProviders.length,
        providers: enabledProviders.map((p: any) => ({
          providerId: p.providerId,
          providerCode: p.providerCode,
          providerName: p.providerName,
          isEnabled: p.isEnabled,
          isDefault: p.isDefault,
          companyShippingProviderId: p.companyShippingProviderId,
        })),
        query: 'getEnabledProvidersForCompany(companyId)',
      })

      // Check if API shipment is enabled (after potential auto-enablement)
      console.log('[API /prs/shipment POST] Checking if API shipment is enabled for company:', companyId)
      const apiEnabled = await isApiShipmentEnabled(companyId)
      console.log('[API /prs/shipment POST] API shipment enabled check result:', apiEnabled)

      if (!apiEnabled) {
        // HARDENED: Throw explicit error instead of silent fallback

        // ====================================================
        // CHECKPOINT 3: Vendor Routing Resolution
        // ====================================================
        const { getActiveVendorRoutingForCompany } = await import(
          '@/lib/db/vendor-shipping-routing-access'
        )
        const errorCheckRouting = await getActiveVendorRoutingForCompany(vendorId, companyId)

        console.log('[SHIP-RCA][VENDOR_ROUTING]', {
          vendorId,
          companyId,
          routingFound: !!errorCheckRouting,
          routing: errorCheckRouting
            ? {
                routingId: errorCheckRouting.routingId,
                shipmentServiceProviderRefId: errorCheckRouting.shipmentServiceProviderRefId,
                primaryCourierCode: errorCheckRouting.primaryCourierCode,
                secondaryCourierCode: errorCheckRouting.secondaryCourierCode,
                isActive: errorCheckRouting.isActive,
                providerCode: errorCheckRouting.provider?.providerCode,
                providerName: errorCheckRouting.provider?.providerName,
              }
            : null,
          query: 'getActiveVendorRoutingForCompany(vendorId, companyId)',
        })

        console.error('[API /prs/shipment POST] ❌ API shipment not enabled for company:', {
          companyId,
          companyName: company?.name,
          companyShipmentMode: companyShipmentMode,
          companyShipmentModeType: typeof companyShipmentMode,
          explicitShipmentMode,
          shouldUseApiShipment,
          enabledProviderCount: enabledProviders.length,
          hasVendorRouting: !!errorCheckRouting,
        })

        // ====================================================
        // CHECKPOINT 4: AUTOMATIC DECISION GATE
        // ====================================================
        // CRITICAL: If company is explicitly set to AUTOMATIC, throw error (don't allow fallback)
        // Check both string comparison and type safety
        const isAutomaticMode =
          companyShipmentMode === 'AUTOMATIC' ||
          String(companyShipmentMode).toUpperCase() === 'AUTOMATIC'

        console.log('[SHIP-RCA][DECISION_GATE]', {
          companyShippingMode: companyShipmentMode,
          enabledProvidersCount: enabledProviders.length,
          hasVendorRouting: !!errorCheckRouting,
          hasCredentials: enabledProviders.some(
            (p: any) => p.apiKey || p.apiSecret || p.accessToken
          ),
          reasonForFallback: !isAutomaticMode
            ? 'Company mode is not AUTOMATIC'
            : enabledProviders.length === 0
            ? 'No enabled providers'
            : 'Unknown',
          willFallbackToManual: !isAutomaticMode && explicitShipmentMode !== 'API',
        })

        console.log('[API /prs/shipment POST] Mode check:', {
          companyShipmentMode,
          isAutomaticMode,
          explicitShipmentMode,
          shouldUseApiShipment,
        })

        if (isAutomaticMode) {
          let errorMessage = `No shipping providers enabled for company ${company?.name || companyId}.`

          if (errorCheckRouting) {
            errorMessage += ` Vendor routing is configured but provider is not enabled. This should have been auto-enabled - please contact support.`
          } else {
            errorMessage += ` Please configure vendor shipping routing and enable shipping providers in Company Settings before creating shipments.`
          }

          console.error(
            '[API /prs/shipment POST] 🚫 THROWING ERROR - AUTOMATIC mode requires providers:',
            errorMessage
          )

          return NextResponse.json(
            {
              error: errorMessage,
              type: 'provider_not_enabled',
              companyId,
              companyName: company?.name,
              hasVendorRouting: !!errorCheckRouting,
            },
            { status: 400 }
          )
        }

        // If explicit shipmentMode === 'API' but no providers enabled, throw error
        if (explicitShipmentMode === 'API') {
          console.error(
            '[API /prs/shipment POST] 🚫 THROWING ERROR - Explicit API mode requires providers'
          )
          return NextResponse.json(
            {
              error: `No shipping providers enabled for company ${company?.name || companyId}. Please enable at least one shipping provider before creating API shipments.`,
              type: 'provider_not_enabled',
              companyId,
              companyName: company?.name,
            },
            { status: 400 }
          )
        }

        // Otherwise, log warning and fall back to manual (for backward compatibility)
        // This should only happen if companyShipmentMode is NOT AUTOMATIC and explicitShipmentMode is NOT API
        console.log(
          '[SHIP-RCA][DECISION_GATE] ⚠️ FALLING BACK TO MANUAL - This should NOT happen if companyShipmentMode is AUTOMATIC',
          {
            companyShipmentMode,
            isAutomaticMode,
            explicitShipmentMode,
            enabledProvidersCount: enabledProviders.length,
            reason: 'Company mode is not AUTOMATIC and explicit mode is not API',
          }
        )
        console.log(
          '[API /prs/shipment POST] ⚠️ API shipment not enabled, falling back to manual (backward compatibility mode)'
        )
        // Continue with manual shipment below
      } else {
        // API shipment is enabled - proceed with automatic shipment
        // For AUTOMATIC mode, we need to get the provider and company shipping provider
        // Check if provider info is provided in request, otherwise get from vendor routing
        let providerId = shipmentData.providerId
        let companyShippingProviderId = shipmentData.companyShippingProviderId

        // If not provided, try to get from vendor shipping routing
        if (!providerId || !companyShippingProviderId) {
          console.log(
            '[API /prs/shipment POST] Provider info not in request, fetching from vendor routing...'
          )
          const { getActiveVendorRoutingForCompany } = await import(
            '@/lib/db/vendor-shipping-routing-access'
          )
          const routing = await getActiveVendorRoutingForCompany(vendorId, companyId)

          if (routing) {
            console.log('[API /prs/shipment POST] Found vendor routing for company:', {
              routingId: routing.routingId,
              vendorId: routing.vendorId,
              companyId: routing.companyId,
              providerRefId: routing.shipmentServiceProviderRefId,
              primaryCourierCode: routing.primaryCourierCode,
              secondaryCourierCode: routing.secondaryCourierCode,
              providerCode: routing.provider?.providerCode,
            })

            // Get provider details
            const ShipmentServiceProvider = await import(
              '@/lib/models/ShipmentServiceProvider'
            ).then((m) => m.default)
            const provider: any = await ShipmentServiceProvider.findOne({
              providerRefId: routing.shipmentServiceProviderRefId,
            }).lean()

            if (provider) {
              providerId = provider.providerId

              // ====================================================
              // CHECKPOINT 5: Credential & Enablement Check
              // ====================================================
              const CompanyShippingProvider = await import(
                '@/lib/models/CompanyShippingProvider'
              ).then((m) => m.default)
              let companyProvider: any = await CompanyShippingProvider.findOne({
                companyId,
                providerId: provider.providerId,
                isEnabled: true, // Fixed: CompanyShippingProvider uses isEnabled, not isActive
              }).lean()

              console.log('[SHIP-RCA][CREDENTIAL_CHECK]', {
                providerId: provider.providerId,
                providerCode: provider.providerCode,
                credentialSource: 'CompanyShippingProvider',
                isPresent: !!companyProvider,
                hasCredentials: companyProvider
                  ? !!(companyProvider.apiKey || companyProvider.apiSecret || companyProvider.accessToken)
                  : false,
                isEnabled: companyProvider?.isEnabled || false,
              })

              // AUTO-ENABLE: If vendor routing exists but CompanyShippingProvider doesn't, create it automatically
              if (!companyProvider) {
                console.log(
                  '[API /prs/shipment POST] ⚠️ CompanyShippingProvider not found, auto-enabling provider from vendor routing...'
                )
                const { generateShippingId } = await import(
                  '@/lib/db/shipping-config-access'
                )
                const newCompanyShippingProviderId = generateShippingId('CSP')

                try {
                  companyProvider = await CompanyShippingProvider.create({
                    companyShippingProviderId: newCompanyShippingProviderId,
                    companyId,
                    providerId: provider.providerId,
                    isEnabled: true,
                    isDefault: false,
                    createdBy: 'System (Auto-enabled from vendor routing)',
                  })
                  console.log('[API /prs/shipment POST] ✅ Auto-enabled provider for company:', {
                    companyShippingProviderId: companyProvider.companyShippingProviderId,
                    companyId,
                    providerId: provider.providerId,
                    providerCode: provider.providerCode,
                  })
                } catch (error: any) {
                  console.error('[API /prs/shipment POST] ❌ Failed to auto-enable provider:', error)
                  // Continue - will be caught by validation below
                }
              }

              if (companyProvider) {
                companyShippingProviderId = companyProvider.companyShippingProviderId
                console.log('[API /prs/shipment POST] ✅ Resolved provider and routing info:', {
                  providerId,
                  companyShippingProviderId,
                  providerCode: routing.provider?.providerCode,
                  primaryCourierCode: routing.primaryCourierCode,
                  secondaryCourierCode: routing.secondaryCourierCode,
                  routingId: routing.routingId,
                })

                // Store routing info in shipmentData for use in createApiShipment
                shipmentData.vendorRouting = routing
              } else {
                console.log(
                  '[API /prs/shipment POST] Company shipping provider mapping not found for provider:',
                  provider.providerId
                )
              }
            } else {
              console.log(
                '[API /prs/shipment POST] Provider not found for refId:',
                routing.shipmentServiceProviderRefId
              )
            }
          } else {
            console.log(
              '[API /prs/shipment POST] No active vendor shipping routing found for vendor:',
              vendorId,
              'company:',
              companyId
            )
          }
        }

        // Validate API shipment requirements
        if (!providerId || !companyShippingProviderId) {
          // HARDENED: Throw explicit error instead of silent fallback
          console.error('[API /prs/shipment POST] ❌ Missing provider info for API shipment:', {
            hasProviderId: !!providerId,
            hasCompanyShippingProviderId: !!companyShippingProviderId,
            companyId,
            companyName: company?.name,
            companyShipmentMode: companyShipmentMode,
          })

          // If AUTOMATIC mode, throw error (don't allow fallback)
          if (companyShipmentMode === 'AUTOMATIC') {
            return NextResponse.json(
              {
                error: `Unable to resolve shipping provider for company ${
                  company?.name || companyId
                }. Please ensure vendor shipping routing is configured correctly.`,
                type: 'provider_resolution_failed',
                companyId,
                companyName: company?.name,
                details: {
                  hasProviderId: !!providerId,
                  hasCompanyShippingProviderId: !!companyShippingProviderId,
                },
              },
              { status: 400 }
            )
          }

          // If explicit API mode, throw error
          if (explicitShipmentMode === 'API') {
            return NextResponse.json(
              {
                error:
                  'Unable to resolve shipping provider. Please ensure provider is enabled for company and vendor routing is configured.',
                type: 'provider_resolution_failed',
                companyId,
                companyName: company?.name,
              },
              { status: 400 }
            )
          }

          // Otherwise, log warning and fall back to manual
          // CRITICAL: This should NOT happen if companyShipmentMode is AUTOMATIC
          console.error(
            '[SHIP-RCA][DECISION_GATE] ⚠️ CRITICAL: Falling back to MANUAL despite missing provider info',
            {
              companyShipmentMode,
              hasProviderId: !!providerId,
              hasCompanyShippingProviderId: !!companyShippingProviderId,
              reason:
                'Provider info missing but not throwing error (backward compatibility)',
            }
          )
          console.log('[API /prs/shipment POST] Missing provider info, falling back to manual')
          // Fall back to manual if provider info is missing
        } else {
          console.log('[API /prs/shipment POST] Creating API shipment with provider:', {
            providerId,
            companyShippingProviderId,
            warehouseRefId: shipmentData.warehouseRefId,
          })

          // Prepare package data if provided
          const packageData = (shipmentData.shipmentPackageId || shipmentData.lengthCm)
            ? {
                shipmentPackageId: shipmentData.shipmentPackageId,
                lengthCm: shipmentData.lengthCm,
                breadthCm: shipmentData.breadthCm,
                heightCm: shipmentData.heightCm,
                volumetricWeight: shipmentData.volumetricWeight,
              }
            : undefined

          // ====================================================
          // CHECKPOINT 6: Final Mode Resolution (API Path)
          // ====================================================
          console.log('[SHIP-RCA][FINAL_CONTEXT]', {
            shipmentMode: 'API',
            companyShipmentMode,
            providerSelected: providerId,
            courierSelected:
              shipmentData.vendorRouting?.primaryCourierCode ||
              shipmentData.selectedCourierType ||
              'N/A',
            reason: 'API shipment enabled and provider resolved',
            hasProviderId: !!providerId,
            hasCompanyShippingProviderId: !!companyShippingProviderId,
            hasVendorRouting: !!shipmentData.vendorRouting,
          })

          // Create API shipment
          const apiResult = await createApiShipment(
            prId,
            vendorId,
            companyId,
            providerId,
            companyShippingProviderId,
            shipmentData.warehouseRefId, // Pass warehouse reference if provided
            shipmentData.vendorRouting, // Pass vendor routing (contains primaryCourierCode)
            packageData, // Pass package data if provided
            shipmentData.shippingCost, // Pass shipping cost
            shipmentData.selectedCourierType // Pass selected courier type (PRIMARY or SECONDARY)
          )

          console.log('[API /prs/shipment POST] 📦 API shipment result:', {
            success: apiResult.success,
            shipmentId: apiResult.shipmentId,
            error: apiResult.error,
          })

          if (!apiResult.success) {
            // CRITICAL: If AUTOMATIC mode and API shipment fails, throw error (don't fall back)
            if (companyShipmentMode === 'AUTOMATIC') {
              console.error(
                '[SHIP-RCA][DECISION_GATE] 🚫 CRITICAL: API shipment failed in AUTOMATIC mode',
                {
                  companyShipmentMode,
                  error: apiResult.error,
                  reason:
                    'API shipment creation failed - cannot fall back to MANUAL in AUTOMATIC mode',
                  providerId,
                  companyShippingProviderId,
                }
              )

              return NextResponse.json(
                {
                  error: `Automatic shipment creation failed: ${
                    apiResult.error || 'Unknown error'
                  }. Please check provider credentials and configuration.`,
                  type: 'api_shipment_failed',
                  companyId,
                  companyName: company?.name,
                  details: {
                    providerId,
                    companyShippingProviderId,
                    error: apiResult.error,
                    suggestion:
                      apiResult.error?.includes('email') ||
                      apiResult.error?.includes('password')
                        ? 'Missing or invalid Shiprocket credentials. Please configure email and password in Company Shipping Provider settings.'
                        : 'Check provider configuration and network connectivity.',
                  },
                },
                { status: 500 }
              )
            }

            // If not AUTOMATIC mode, allow fallback to manual (backward compatibility)
            if (shipmentData.allowManualFallback !== false) {
              console.log(
                '[API /prs/shipment POST] API shipment failed, falling back to manual:',
                apiResult.error
              )
              // Continue with manual shipment below
            } else {
              return NextResponse.json(
                { error: `API shipment failed: ${apiResult.error}` },
                { status: 500 }
              )
            }
          } else {
            // API shipment successful - update PR with shipment data
            console.log('[API /prs/shipment POST] ✅ API shipment successful, updating PR...')
            console.log(
              '[API /prs/shipment POST] 🔑 CRITICAL: Passing shipmentId from createApiShipment as shipmentReferenceNumber'
            )
            console.log(
              `[API /prs/shipment POST]    ShipmentId from createApiShipment: ${apiResult.shipmentId}`
            )

            // CRITICAL: Pass the shipmentId from createApiShipment as shipmentReferenceNumber
            // This ensures the Order document uses the same shipmentId as the Shipment document
            // Use carrierDisplayName when provided so order card shows courier company name (e.g. BLUEDART) not code (e.g. 6)
            const orderCarrierName = (shipmentData.carrierDisplayName && shipmentData.carrierDisplayName.trim())
              ? shipmentData.carrierDisplayName.trim()
              : shipmentData.carrierName?.trim()
            const updatedPR = await updatePRShipmentStatus(
              prId,
              {
                shipperName: shipmentData.shipperName?.trim() || 'API Shipment',
                carrierName: orderCarrierName,
                modeOfTransport: shipmentData.modeOfTransport || 'COURIER',
                trackingNumber: (apiResult as any).trackingNumber ?? (apiResult as any).courierAwbNumber ?? undefined,
                dispatchedDate,
                expectedDeliveryDate,
                shipmentReferenceNumber: apiResult.shipmentId, // Use the shipmentId from createApiShipment
                itemDispatchedQuantities: shipmentData.itemDispatchedQuantities,
                shippingCost: shipmentData.shippingCost, // Pass shipping cost
              },
              vendorId
            )

            console.log(
              '[API /prs/shipment POST] ✅ PR updated successfully with API shipment'
            )
            console.log(
              `[API /prs/shipment POST]    Updated PR shipmentId: ${updatedPR.shipmentId}`
            )

            const apiResponse = {
              ...updatedPR,
              shipmentMode: 'API',
              shipmentId: apiResult.shipmentId,
            }
            console.log('[API /prs/shipment POST] 📤 Returning API shipment response:', {
              shipmentMode: apiResponse.shipmentMode,
              shipmentId: apiResponse.shipmentId,
              companyId,
              companyName: company?.name,
            })
            return NextResponse.json(apiResponse, { status: 200 })
          }
        }
      }
    }

    // Manual shipment (default or fallback)
    console.log('[API /prs/shipment POST] Using MANUAL shipment mode', {
      companyId,
      companyName: company?.name,
      companyShipmentMode,
      reason: shouldUseApiShipment
        ? 'API shipment was requested but fell back to manual'
        : 'Manual shipment mode (default or explicit)',
    })

    const updatedPR = await updatePRShipmentStatus(
      prId,
      {
        shipperName: shipmentData.shipperName.trim(),
        carrierName: shipmentData.carrierName?.trim(),
        modeOfTransport: shipmentData.modeOfTransport,
        trackingNumber: shipmentData.trackingNumber?.trim(),
        dispatchedDate,
        expectedDeliveryDate,
        shipmentReferenceNumber: shipmentData.shipmentReferenceNumber?.trim(),
        itemDispatchedQuantities: shipmentData.itemDispatchedQuantities,
        // Package data
        shipmentPackageId: shipmentData.shipmentPackageId,
        lengthCm: shipmentData.lengthCm,
        breadthCm: shipmentData.breadthCm,
        heightCm: shipmentData.heightCm,
        volumetricWeight: shipmentData.volumetricWeight,
        // Shipping cost
        shippingCost: shipmentData.shippingCost,
      },
      vendorId
    )

    // ====================================================
    // CHECKPOINT 6: Final Mode Resolution (MANUAL Path)
    // ====================================================
    console.log('[SHIP-RCA][FINAL_CONTEXT]', {
      shipmentMode: 'MANUAL',
      companyShipmentMode,
      providerSelected: 'N/A',
      courierSelected: shipmentData.carrierName || 'N/A',
      reason: shouldUseApiShipment
        ? 'API shipment was requested but fell back to manual (backward compatibility)'
        : 'Manual shipment mode (default or explicit)',
      shouldUseApiShipment,
      explicitShipmentMode,
      enabledProvidersCount: 0, // Not checked in manual path
    })

    console.log('[API /prs/shipment POST] PR shipment status updated successfully (MANUAL mode)')
    const manualResponse = {
      ...updatedPR,
      shipmentMode: 'MANUAL',
    }
    console.log('[API /prs/shipment POST] Returning MANUAL shipment response:', {
      shipmentMode: manualResponse.shipmentMode,
      companyId,
      companyName: company?.name,
      companyShipmentMode,
      reason: shouldUseApiShipment
        ? '⚠️ WARNING: Company is set to AUTOMATIC but shipment was created in MANUAL mode. This should not happen!'
        : 'Manual mode (expected)',
    })
    return NextResponse.json(manualResponse, { status: 200 })
  } catch (error: any) {
    console.error('API Error in /api/prs/shipment POST:', error)
    console.error('API Error in /api/prs/shipment POST:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'

    // Return 400 for validation/input errors
    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('Invalid JSON')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

    // Return 404 for not found errors
    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('Not found') ||
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }

    // Return 401 for authentication errors
    if (
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('token')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 401 })
    }

    // Return 500 for server errors
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

/**
 * PUT /api/prs/shipment
 * Update PR delivery status (mark items as DELIVERED)
 */
export async function PUT(request: Request) {
  try {
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json(
        {
          error: 'Invalid JSON in request body',
        },
        { status: 400 }
      )
    }

    const { prId, deliveryData, vendorId } = body

    // Validate required fields
    if (!prId) {
      return NextResponse.json({ error: 'PR ID is required' }, { status: 400 })
    }
    if (!vendorId) {
      return NextResponse.json({ error: 'Vendor ID is required' }, { status: 400 })
    }
    if (!deliveryData) {
      return NextResponse.json({ error: 'Delivery data is required' }, { status: 400 })
    }
    if (!deliveryData.deliveredDate) {
      return NextResponse.json({ error: 'deliveredDate is required' }, { status: 400 })
    }
    if (
      !deliveryData.itemDeliveredQuantities ||
      !Array.isArray(deliveryData.itemDeliveredQuantities)
    ) {
      return NextResponse.json(
        { error: 'itemDeliveredQuantities array is required' },
        { status: 400 }
      )
    }

    // Parse delivered date
    const deliveredDate = new Date(deliveryData.deliveredDate)

    console.log('[API /prs/shipment PUT] Updating PR delivery status:', {
      prId,
      vendorId,
      deliveredDate: deliveredDate.toISOString(),
    })

    // Update PR delivery status
    const updatedPR = await updatePRDeliveryStatus(
      prId,
      {
        deliveredDate,
        receivedBy: deliveryData.receivedBy?.trim(),
        deliveryRemarks: deliveryData.deliveryRemarks?.trim(),
        itemDeliveredQuantities: deliveryData.itemDeliveredQuantities,
      },
      vendorId
    )

    console.log('[API /prs/shipment PUT] PR delivery status updated successfully')
    return NextResponse.json(updatedPR, { status: 200 })
  } catch (error: any) {
    console.error('API Error in /api/prs/shipment PUT:', error)
    console.error('API Error in /api/prs/shipment PUT:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'

    // Return 400 for validation/input errors
    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('Invalid JSON')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

    // Return 404 for not found errors
    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('Not found') ||
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }

    // Return 401 for authentication errors
    if (
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('token')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 401 })
    }

    // Return 500 for server errors
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
