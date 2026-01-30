/**
 * PHASE 2: EXECUTION SCRIPT
 * Vendor Shipping Routing Configuration for AKASA AIR
 * 
 * Purpose: 
 * - Disable ICICI BANK routing (set isActive: false)
 * - Create active routing for AKASA AIR
 * 
 * Note: The unique constraint { vendorId, shipmentServiceProviderRefId } with 
 * partialFilterExpression: { isActive: true } only allows ONE active routing
 * per vendor + provider combination. By disabling ICICI's routing, AKASA can
 * have the active routing.
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables
let MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) {
  try {
    const envPath = path.join(__dirname, '..', '.env.local')
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8')
      const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
      if (mongoMatch) {
        MONGODB_URI = mongoMatch[1].trim()
      }
    }
  } catch (error) {
    console.error('Error loading .env.local:', error.message)
  }
}

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found. Please set it in .env.local or environment.')
  process.exit(1)
}

/**
 * Generate alphanumeric ID for shipping entities (≤15 chars)
 */
function generateShippingId(prefix) {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  const id = `${prefix}_${timestamp}${random}`.substring(0, 15)
  return id
}

async function executeVendorShippingRoutingSetup() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
  console.log('║       PHASE 2: VENDOR SHIPPING ROUTING EXECUTION FOR AKASA AIR              ║')
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣')
  console.log('║ Mode: DISABLE ICICI BANK → ENABLE AKASA AIR                                 ║')
  console.log('║ Note: Only ONE company can have active routing per vendor+provider          ║')
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝')
  console.log()

  // Track changes for logging
  const disabledRoutings = []
  const insertedRoutings = []
  const insertedProviders = []
  
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')
    
    const db = mongoose.connection.db

    // Collections
    const vendorShippingRoutingsCollection = db.collection('vendorshippingroutings')
    const companyShippingProvidersCollection = db.collection('companyshippingproviders')

    // Configuration
    const AKASA_COMPANY_ID = '100002'
    const ICICI_COMPANY_ID = '100004'
    
    // Provider details (from ICICI BANK config)
    const PROVIDER_ID = 'PROV_MJXY0QMESF'
    const PROVIDER_REF_ID = 100003
    const PRIMARY_COURIER_CODE = '6'
    const SECONDARY_COURIER_CODE = '225'

    // Vendors to map
    const VENDORS = [
      { vendorId: '100001', vendorName: 'UniformPro Inc' },
      { vendorId: '100002', vendorName: 'Footwear Plus' },
      { vendorId: '100003', vendorName: 'Elite Uniforms' }
    ]

    console.log('═══════════════════════════════════════════════════════════════════════════════')
    console.log('PRE-EXECUTION STATE')
    console.log('═══════════════════════════════════════════════════════════════════════════════')

    // Get ICICI BANK current state
    const iciciRoutings = await vendorShippingRoutingsCollection.find({ 
      companyId: ICICI_COMPANY_ID 
    }).toArray()
    
    const iciciActiveRoutings = iciciRoutings.filter(r => r.isActive)
    const iciciProvidersCount = await companyShippingProvidersCollection.countDocuments({ companyId: ICICI_COMPANY_ID })
    
    console.log(`\n📋 ICICI BANK current state:`)
    console.log(`   - Total Vendor Shipping Routings: ${iciciRoutings.length}`)
    console.log(`   - Active Routings: ${iciciActiveRoutings.length}`)
    console.log(`   - Company Shipping Providers: ${iciciProvidersCount}`)
    
    if (iciciActiveRoutings.length > 0) {
      console.log('\n   Active ICICI BANK Routings:')
      for (const r of iciciActiveRoutings) {
        console.log(`   - ${r.routingId}: Vendor ${r.vendorId} → Provider ${r.shipmentServiceProviderRefId}`)
      }
    }

    // Get AKASA AIR current state
    const akasaRoutingsCount = await vendorShippingRoutingsCollection.countDocuments({ companyId: AKASA_COMPANY_ID })
    const akasaProvidersCount = await companyShippingProvidersCollection.countDocuments({ companyId: AKASA_COMPANY_ID })
    
    console.log(`\n📋 AKASA AIR current state:`)
    console.log(`   - Vendor Shipping Routings: ${akasaRoutingsCount}`)
    console.log(`   - Company Shipping Providers: ${akasaProvidersCount}`)

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1: DISABLE ICICI BANK ROUTINGS
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════════════════════')
    console.log('STEP 1: Disabling ICICI BANK Vendor Shipping Routings')
    console.log('═══════════════════════════════════════════════════════════════════════════════')

    const now = new Date()

    for (const iciciRouting of iciciActiveRoutings) {
      // Only disable if it conflicts with what we're creating for AKASA
      const isConflicting = VENDORS.some(v => 
        v.vendorId === iciciRouting.vendorId && 
        iciciRouting.shipmentServiceProviderRefId === PROVIDER_REF_ID
      )

      if (isConflicting) {
        console.log(`\n   🔄 Disabling: ${iciciRouting.routingId}`)
        console.log(`      Vendor: ${iciciRouting.vendorId}`)
        console.log(`      Provider Ref: ${iciciRouting.shipmentServiceProviderRefId}`)

        await vendorShippingRoutingsCollection.updateOne(
          { _id: iciciRouting._id },
          { 
            $set: { 
              isActive: false, 
              updatedAt: now,
              updatedBy: 'Database Script - Disabled for AKASA AIR Setup'
            } 
          }
        )

        disabledRoutings.push({
          routingId: iciciRouting.routingId,
          vendorId: iciciRouting.vendorId,
          companyId: iciciRouting.companyId,
          providerRefId: iciciRouting.shipmentServiceProviderRefId
        })

        console.log(`   ✅ Disabled: ${iciciRouting.routingId}`)
      }
    }

    console.log(`\n   📊 Total ICICI BANK routings disabled: ${disabledRoutings.length}`)

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2: CREATE AKASA AIR VENDOR SHIPPING ROUTINGS
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════════════════════')
    console.log('STEP 2: Creating Vendor Shipping Routings for AKASA AIR')
    console.log('═══════════════════════════════════════════════════════════════════════════════')

    for (const vendor of VENDORS) {
      // Check if this exact combination already exists for AKASA
      const existing = await vendorShippingRoutingsCollection.findOne({
        vendorId: vendor.vendorId,
        companyId: AKASA_COMPANY_ID,
        shipmentServiceProviderRefId: PROVIDER_REF_ID
      })

      if (existing) {
        if (existing.isActive) {
          console.log(`\n   ⚠️  Skipping vendor ${vendor.vendorId} (${vendor.vendorName}) - already active: ${existing.routingId}`)
          continue
        } else {
          // Reactivate existing record
          console.log(`\n   🔄 Reactivating existing: ${existing.routingId} for vendor ${vendor.vendorId}`)
          await vendorShippingRoutingsCollection.updateOne(
            { _id: existing._id },
            { 
              $set: { 
                isActive: true, 
                updatedAt: now,
                updatedBy: 'Database Script - AKASA AIR Setup'
              } 
            }
          )
          insertedRoutings.push({ routingId: existing.routingId, vendorId: vendor.vendorId, reactivated: true })
          console.log(`   ✅ Reactivated: ${existing.routingId}`)
          continue
        }
      }

      const routingId = generateShippingId('VSR')
      
      const routingDoc = {
        routingId: routingId,
        vendorId: vendor.vendorId,
        companyId: AKASA_COMPANY_ID,
        shipmentServiceProviderRefId: PROVIDER_REF_ID,
        primaryCourierCode: PRIMARY_COURIER_CODE,
        secondaryCourierCode: SECONDARY_COURIER_CODE,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdBy: 'Database Script - AKASA AIR Setup',
        updatedBy: 'Database Script - AKASA AIR Setup'
      }

      console.log(`\n   📝 Inserting: ${routingId} for vendor ${vendor.vendorId} (${vendor.vendorName})`)
      
      const result = await vendorShippingRoutingsCollection.insertOne(routingDoc)
      
      if (result.insertedId) {
        insertedRoutings.push({ routingId, vendorId: vendor.vendorId, _id: result.insertedId, reactivated: false })
        console.log(`   ✅ Success! Inserted routing: ${routingId}`)
      } else {
        throw new Error(`Failed to insert routing for vendor ${vendor.vendorId}`)
      }
    }

    console.log(`\n   📊 Total AKASA AIR routings created/reactivated: ${insertedRoutings.length}`)

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: CREATE COMPANY SHIPPING PROVIDER FOR AKASA AIR
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════════════════════')
    console.log('STEP 3: Creating Company Shipping Provider for AKASA AIR')
    console.log('═══════════════════════════════════════════════════════════════════════════════')

    // Check if company-provider mapping already exists
    const existingProvider = await companyShippingProvidersCollection.findOne({
      companyId: AKASA_COMPANY_ID,
      providerId: PROVIDER_ID
    })

    if (existingProvider) {
      console.log(`\n   ⚠️  Company shipping provider already exists: ${existingProvider.companyShippingProviderId}`)
      
      if (!existingProvider.isEnabled) {
        console.log(`   🔄 Enabling existing provider...`)
        await companyShippingProvidersCollection.updateOne(
          { _id: existingProvider._id },
          { 
            $set: { 
              isEnabled: true, 
              updatedAt: now,
              updatedBy: 'Database Script - AKASA AIR Setup'
            } 
          }
        )
        console.log(`   ✅ Enabled existing company shipping provider`)
      } else {
        console.log(`   ✅ Provider is already enabled`)
      }
    } else {
      const companyShippingProviderId = generateShippingId('CSP')
      
      const providerDoc = {
        companyShippingProviderId: companyShippingProviderId,
        companyId: AKASA_COMPANY_ID,
        providerId: PROVIDER_ID,
        isEnabled: true,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
        createdBy: 'Database Script - AKASA AIR Setup',
        updatedBy: 'Database Script - AKASA AIR Setup'
      }

      console.log(`\n   📝 Inserting: ${companyShippingProviderId} mapping AKASA AIR to provider ${PROVIDER_ID}`)
      
      const result = await companyShippingProvidersCollection.insertOne(providerDoc)
      
      if (result.insertedId) {
        insertedProviders.push({ companyShippingProviderId, _id: result.insertedId })
        console.log(`   ✅ Success! Inserted company shipping provider: ${companyShippingProviderId}`)
      } else {
        throw new Error(`Failed to insert company shipping provider`)
      }
      
      console.log('\n   ⚠️  NOTE: API credentials were NOT configured.')
      console.log('   Configure credentials via the UI or directly in the database if needed.')
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // POST-EXECUTION VERIFICATION
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════════════════════════════════')
    console.log('POST-EXECUTION VERIFICATION')
    console.log('═══════════════════════════════════════════════════════════════════════════════')

    // Verify ICICI BANK state
    const iciciRoutingsAfter = await vendorShippingRoutingsCollection.find({ companyId: ICICI_COMPANY_ID }).toArray()
    const iciciActiveAfter = iciciRoutingsAfter.filter(r => r.isActive)
    
    console.log(`\n📋 ICICI BANK after execution:`)
    console.log(`   - Total Routings: ${iciciRoutingsAfter.length}`)
    console.log(`   - Active Routings: ${iciciActiveAfter.length} (was: ${iciciActiveRoutings.length})`)
    
    if (iciciActiveAfter.length > 0) {
      console.log('   Active Routings:')
      for (const r of iciciActiveAfter) {
        console.log(`   - ${r.routingId}: Vendor ${r.vendorId}`)
      }
    } else {
      console.log('   ⚠️  No active routings (all disabled)')
    }

    // Verify AKASA AIR state
    const akasaRoutingsAfter = await vendorShippingRoutingsCollection.find({ companyId: AKASA_COMPANY_ID }).toArray()
    const akasaActiveAfter = akasaRoutingsAfter.filter(r => r.isActive)
    const akasaProvidersAfter = await companyShippingProvidersCollection.countDocuments({ companyId: AKASA_COMPANY_ID })
    
    console.log(`\n📋 AKASA AIR after execution:`)
    console.log(`   - Total Routings: ${akasaRoutingsAfter.length} (was: ${akasaRoutingsCount})`)
    console.log(`   - Active Routings: ${akasaActiveAfter.length}`)
    console.log(`   - Company Shipping Providers: ${akasaProvidersAfter} (was: ${akasaProvidersCount})`)

    // Display AKASA AIR routings table
    console.log('\n📋 AKASA AIR Vendor Shipping Routings:')
    console.log('\n┌─────────────────┬──────────────────────┬──────────────┬──────────────────┬──────────────────┬──────────┐')
    console.log('│   Routing ID    │      Vendor ID       │ Provider Ref │ Primary Courier  │Secondary Courier │  Active  │')
    console.log('├─────────────────┼──────────────────────┼──────────────┼──────────────────┼──────────────────┼──────────┤')
    for (const r of akasaRoutingsAfter) {
      const vendorId = (r.vendorId || 'N/A').substring(0, 20).padEnd(20)
      const primaryCourier = (r.primaryCourierCode || 'N/A').substring(0, 16).padEnd(16)
      const secondaryCourier = (r.secondaryCourierCode || '-').substring(0, 16).padEnd(16)
      console.log(`│ ${(r.routingId || 'N/A').padEnd(15)} │ ${vendorId} │ ${(r.shipmentServiceProviderRefId || 'N/A').toString().padStart(10, ' ')} │ ${primaryCourier} │ ${secondaryCourier} │ ${r.isActive ? '  ✅   ' : '  ❌   '} │`)
    }
    console.log('└─────────────────┴──────────────────────┴──────────────┴──────────────────┴──────────────────┴──────────┘')

    // Display AKASA AIR company providers
    console.log('\n📋 AKASA AIR Company Shipping Providers:')
    const akasaProvidersList = await companyShippingProvidersCollection.find({ companyId: AKASA_COMPANY_ID }).toArray()
    
    console.log('\n┌─────────────────┬─────────────────┬──────────┬──────────┐')
    console.log('│ CSP ID          │   Provider ID   │ Enabled  │ Default  │')
    console.log('├─────────────────┼─────────────────┼──────────┼──────────┤')
    for (const p of akasaProvidersList) {
      console.log(`│ ${(p.companyShippingProviderId || 'N/A').padEnd(15)} │ ${(p.providerId || 'N/A').padEnd(15)} │ ${p.isEnabled ? '  ✅   ' : '  ❌   '} │ ${p.isDefault ? '  ✅   ' : '  ❌   '} │`)
    }
    console.log('└─────────────────┴─────────────────┴──────────┴──────────┘')

    // ═══════════════════════════════════════════════════════════════════════════
    // FINAL SUMMARY
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗')
    console.log('║                          EXECUTION COMPLETE                                  ║')
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝')
    
    console.log('\n📊 FINAL SUMMARY:')
    console.log('═══════════════════════════════════════════════════════════════════════════════')
    console.log('')
    console.log('   ICICI BANK Changes:')
    console.log(`   - Routings Disabled: ${disabledRoutings.length}`)
    if (disabledRoutings.length > 0) {
      for (const r of disabledRoutings) {
        console.log(`     • ${r.routingId} (Vendor: ${r.vendorId})`)
      }
    }
    console.log(`   - Status: ❌ Vendor shipping routing DISABLED`)
    console.log('')
    console.log('   AKASA AIR Changes:')
    console.log(`   - Routings Created/Reactivated: ${insertedRoutings.length}`)
    if (insertedRoutings.length > 0) {
      for (const r of insertedRoutings) {
        console.log(`     • ${r.routingId} (Vendor: ${r.vendorId})${r.reactivated ? ' [reactivated]' : ''}`)
      }
    }
    console.log(`   - Company Providers Created: ${insertedProviders.length}`)
    console.log(`   - Status: ✅ Vendor shipping routing ACTIVE`)
    console.log('')
    console.log('═══════════════════════════════════════════════════════════════════════════════')
    console.log('\n✅ AKASA AIR vendor shipping routing is now configured!')
    console.log('⚠️  ICICI BANK vendor shipping routing has been DISABLED.')

    // Save execution log
    const executionLog = {
      timestamp: new Date().toISOString(),
      status: 'SUCCESS',
      changes: {
        iciciBank: {
          disabledRoutings: disabledRoutings
        },
        akasaAir: {
          insertedRoutings: insertedRoutings,
          insertedProviders: insertedProviders
        }
      }
    }
    
    const logPath = path.join(__dirname, 'vendor-shipping-routing-execution-log.json')
    fs.writeFileSync(logPath, JSON.stringify(executionLog, null, 2))
    console.log(`\n📄 Execution log saved to: ${logPath}`)

  } catch (error) {
    console.error('\n❌ Error during execution:', error)
    
    // Log changes made before error
    console.log('\n⚠️  Changes made before error:')
    console.log('   Disabled ICICI Routings:', disabledRoutings.map(r => r.routingId))
    console.log('   Inserted AKASA Routings:', insertedRoutings.map(r => r.routingId))
    console.log('   Inserted AKASA Providers:', insertedProviders.map(p => p.companyShippingProviderId))
    
    throw error
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

// Run the execution
executeVendorShippingRoutingSetup()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
