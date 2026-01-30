/**
 * PHASE 1: ANALYSIS SCRIPT
 * Vendor Shipping Routing Configuration Analysis
 * 
 * Purpose: Read-only analysis to prepare for AKASA AIR configuration
 * - Extract ICICI BANK routing configuration
 * - Identify AKASA AIR existing mappings
 * - Produce summary of required database changes
 * 
 * *** NO INSERT, UPDATE, OR DELETE OPERATIONS ***
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

async function analyzeVendorShippingRouting() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
  console.log('║           PHASE 1: VENDOR SHIPPING ROUTING ANALYSIS (READ-ONLY)             ║')
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣')
  console.log('║ Target: Replicate ICICI BANK configuration for AKASA AIR                    ║')
  console.log('║ Mode: ANALYSIS ONLY - No database modifications                             ║')
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝')
  console.log()

  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')
    
    const db = mongoose.connection.db

    // Collections
    const companiesCollection = db.collection('companies')
    const vendorsCollection = db.collection('vendors')
    const vendorShippingRoutingsCollection = db.collection('vendorshippingroutings')
    const companyShippingProvidersCollection = db.collection('companyshippingproviders')
    const shipmentServiceProvidersCollection = db.collection('shipmentserviceproviders')

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 1: IDENTIFY COMPANIES
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
    console.log('║ SECTION 1: COMPANY IDENTIFICATION                                           ║')
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝')

    // Find ICICI BANK
    const iciciCompany = await companiesCollection.findOne({
      $or: [
        { name: { $regex: /icici/i } },
        { id: '100004' },
        { id: 'COMP-ICICI' }
      ]
    })

    if (!iciciCompany) {
      console.log('❌ ICICI BANK company not found!')
      process.exit(1)
    }

    console.log(`\n📍 ICICI BANK:`)
    console.log(`   _id: ${iciciCompany._id}`)
    console.log(`   id: ${iciciCompany.id}`)
    console.log(`   name: ${iciciCompany.name}`)

    // Find AKASA AIR
    const akasaCompany = await companiesCollection.findOne({
      $or: [
        { name: { $regex: /akasa/i } },
        { id: '100002' },
        { id: 'COMP-AKASA' }
      ]
    })

    if (!akasaCompany) {
      console.log('❌ AKASA AIR company not found!')
      process.exit(1)
    }

    console.log(`\n📍 AKASA AIR:`)
    console.log(`   _id: ${akasaCompany._id}`)
    console.log(`   id: ${akasaCompany.id}`)
    console.log(`   name: ${akasaCompany.name}`)

    const iciciCompanyId = iciciCompany.id
    const akasaCompanyId = akasaCompany.id

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 2: ALL SHIPMENT SERVICE PROVIDERS
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗')
    console.log('║ SECTION 2: SHIPMENT SERVICE PROVIDERS (SHIPPERS)                            ║')
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝')

    const allProviders = await shipmentServiceProvidersCollection.find({}).toArray()
    console.log(`\n📦 Total Shipment Service Providers: ${allProviders.length}`)
    
    if (allProviders.length > 0) {
      console.log('\n┌─────────────────┬──────────────┬───────────────────────────┬─────────────────┬──────────┐')
      console.log('│   Provider ID   │  Ref ID      │      Provider Name        │     Type        │  Active  │')
      console.log('├─────────────────┼──────────────┼───────────────────────────┼─────────────────┼──────────┤')
      for (const p of allProviders) {
        const refId = p.providerRefId ? p.providerRefId.toString().padStart(10, ' ') : 'N/A       '
        console.log(`│ ${(p.providerId || 'N/A').padEnd(15)} │ ${refId} │ ${(p.providerName || 'N/A').padEnd(25)} │ ${(p.providerType || 'N/A').padEnd(15)} │ ${p.isActive ? '  ✅   ' : '  ❌   '} │`)
      }
      console.log('└─────────────────┴──────────────┴───────────────────────────┴─────────────────┴──────────┘')
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 3: ICICI BANK - VENDOR SHIPPING ROUTINGS
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗')
    console.log('║ SECTION 3: ICICI BANK - VENDOR SHIPPING ROUTINGS                            ║')
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝')

    const iciciRoutings = await vendorShippingRoutingsCollection.find({
      companyId: iciciCompanyId
    }).toArray()

    console.log(`\n🚚 ICICI BANK Vendor Shipping Routings: ${iciciRoutings.length}`)

    if (iciciRoutings.length > 0) {
      console.log('\n┌─────────────────┬──────────────────────┬──────────────┬──────────────────┬──────────────────┬──────────┐')
      console.log('│   Routing ID    │      Vendor ID       │ Provider Ref │ Primary Courier  │Secondary Courier │  Active  │')
      console.log('├─────────────────┼──────────────────────┼──────────────┼──────────────────┼──────────────────┼──────────┤')
      for (const r of iciciRoutings) {
        const vendorId = (r.vendorId || 'N/A').substring(0, 20).padEnd(20)
        const primaryCourier = (r.primaryCourierCode || 'N/A').substring(0, 16).padEnd(16)
        const secondaryCourier = (r.secondaryCourierCode || '-').substring(0, 16).padEnd(16)
        console.log(`│ ${(r.routingId || 'N/A').padEnd(15)} │ ${vendorId} │ ${(r.shipmentServiceProviderRefId || 'N/A').toString().padStart(10, ' ')} │ ${primaryCourier} │ ${secondaryCourier} │ ${r.isActive ? '  ✅   ' : '  ❌   '} │`)
      }
      console.log('└─────────────────┴──────────────────────┴──────────────┴──────────────────┴──────────────────┴──────────┘')

      // Detailed view
      console.log('\n📋 ICICI BANK Routing Details (JSON):')
      for (const r of iciciRoutings) {
        console.log('\n---')
        console.log(JSON.stringify({
          routingId: r.routingId,
          vendorId: r.vendorId,
          companyId: r.companyId,
          shipmentServiceProviderRefId: r.shipmentServiceProviderRefId,
          primaryCourierCode: r.primaryCourierCode,
          secondaryCourierCode: r.secondaryCourierCode,
          isActive: r.isActive,
          createdBy: r.createdBy,
          createdAt: r.createdAt
        }, null, 2))
      }
    } else {
      console.log('\n⚠️  No vendor shipping routings found for ICICI BANK!')
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 4: ICICI BANK - COMPANY SHIPPING PROVIDERS
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗')
    console.log('║ SECTION 4: ICICI BANK - COMPANY SHIPPING PROVIDERS                          ║')
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝')

    const iciciProviders = await companyShippingProvidersCollection.find({
      companyId: iciciCompanyId
    }).toArray()

    console.log(`\n🏢 ICICI BANK Company Shipping Providers: ${iciciProviders.length}`)

    if (iciciProviders.length > 0) {
      console.log('\n┌─────────────────┬─────────────────┬──────────┬──────────┐')
      console.log('│ CSP ID          │   Provider ID   │ Enabled  │ Default  │')
      console.log('├─────────────────┼─────────────────┼──────────┼──────────┤')
      for (const p of iciciProviders) {
        console.log(`│ ${(p.companyShippingProviderId || 'N/A').padEnd(15)} │ ${(p.providerId || 'N/A').padEnd(15)} │ ${p.isEnabled ? '  ✅   ' : '  ❌   '} │ ${p.isDefault ? '  ✅   ' : '  ❌   '} │`)
      }
      console.log('└─────────────────┴─────────────────┴──────────┴──────────┘')

      // Detailed view
      console.log('\n📋 ICICI BANK Company Providers Details (JSON):')
      for (const p of iciciProviders) {
        console.log('\n---')
        console.log(JSON.stringify({
          companyShippingProviderId: p.companyShippingProviderId,
          companyId: p.companyId,
          providerId: p.providerId,
          isEnabled: p.isEnabled,
          isDefault: p.isDefault,
          hasApiKey: !!p.apiKey,
          hasApiSecret: !!p.apiSecret,
          hasAccessToken: !!p.accessToken,
          createdBy: p.createdBy,
          createdAt: p.createdAt
        }, null, 2))
      }
    } else {
      console.log('\n⚠️  No company shipping providers found for ICICI BANK!')
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 5: AKASA AIR - EXISTING CONFIGURATION
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗')
    console.log('║ SECTION 5: AKASA AIR - EXISTING CONFIGURATION                               ║')
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝')

    const akasaRoutings = await vendorShippingRoutingsCollection.find({
      companyId: akasaCompanyId
    }).toArray()

    console.log(`\n🚚 AKASA AIR Vendor Shipping Routings: ${akasaRoutings.length}`)
    if (akasaRoutings.length > 0) {
      console.log('\n⚠️  EXISTING AKASA AIR ROUTINGS FOUND:')
      for (const r of akasaRoutings) {
        console.log(JSON.stringify(r, null, 2))
      }
    }

    const akasaProviders = await companyShippingProvidersCollection.find({
      companyId: akasaCompanyId
    }).toArray()

    console.log(`\n🏢 AKASA AIR Company Shipping Providers: ${akasaProviders.length}`)
    if (akasaProviders.length > 0) {
      console.log('\n⚠️  EXISTING AKASA AIR PROVIDERS FOUND:')
      for (const p of akasaProviders) {
        console.log(JSON.stringify({
          companyShippingProviderId: p.companyShippingProviderId,
          companyId: p.companyId,
          providerId: p.providerId,
          isEnabled: p.isEnabled,
          isDefault: p.isDefault
        }, null, 2))
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 6: VENDORS ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗')
    console.log('║ SECTION 6: VENDORS INVOLVED IN ICICI BANK ROUTINGS                          ║')
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝')

    const vendorIds = [...new Set(iciciRoutings.map(r => r.vendorId))]
    console.log(`\n📦 Unique Vendors in ICICI routings: ${vendorIds.length}`)
    
    for (const vendorId of vendorIds) {
      const vendor = await vendorsCollection.findOne({ id: vendorId })
      if (vendor) {
        console.log(`\n   Vendor ID: ${vendorId}`)
        console.log(`   Name: ${vendor.name || 'N/A'}`)
        console.log(`   Status: ${vendor.status || 'N/A'}`)
      } else {
        console.log(`\n   ⚠️  Vendor ID: ${vendorId} - NOT FOUND in vendors collection!`)
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 7: CONFLICT ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗')
    console.log('║ SECTION 7: CONFLICT ANALYSIS                                                ║')
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝')

    let conflicts = []

    // Check for duplicate vendor+provider combinations for AKASA
    for (const r of iciciRoutings) {
      const existingAkasaRouting = await vendorShippingRoutingsCollection.findOne({
        vendorId: r.vendorId,
        shipmentServiceProviderRefId: r.shipmentServiceProviderRefId,
        companyId: akasaCompanyId,
        isActive: true
      })

      if (existingAkasaRouting) {
        conflicts.push({
          type: 'DUPLICATE_VENDOR_ROUTING',
          vendorId: r.vendorId,
          providerRefId: r.shipmentServiceProviderRefId,
          existing: existingAkasaRouting.routingId
        })
      }
    }

    // Check for existing company-provider mappings
    for (const p of iciciProviders) {
      const existingAkasaProvider = await companyShippingProvidersCollection.findOne({
        companyId: akasaCompanyId,
        providerId: p.providerId
      })

      if (existingAkasaProvider) {
        conflicts.push({
          type: 'EXISTING_COMPANY_PROVIDER',
          providerId: p.providerId,
          existing: existingAkasaProvider.companyShippingProviderId
        })
      }
    }

    if (conflicts.length > 0) {
      console.log(`\n⚠️  Potential Conflicts Found: ${conflicts.length}`)
      for (const c of conflicts) {
        console.log(JSON.stringify(c, null, 2))
      }
    } else {
      console.log('\n✅ No conflicts detected. Safe to proceed with replication.')
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SECTION 8: SUMMARY & PROPOSED CHANGES
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗')
    console.log('║ SECTION 8: SUMMARY & PROPOSED CHANGES                                       ║')
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝')

    console.log('\n📊 SUMMARY:')
    console.log('═══════════════════════════════════════════════════════════════════════════════')
    console.log(`   Source Company: ${iciciCompany.name} (ID: ${iciciCompanyId})`)
    console.log(`   Target Company: ${akasaCompany.name} (ID: ${akasaCompanyId})`)
    console.log('')
    console.log('   Tables Affected:')
    console.log('   ┌────────────────────────────────┬──────────────────────────────────┐')
    console.log('   │ Collection                     │ Records to Create                │')
    console.log('   ├────────────────────────────────┼──────────────────────────────────┤')
    
    // Calculate what needs to be created (excluding conflicts)
    const routingsToCreate = iciciRoutings.filter(r => {
      return !conflicts.some(c => 
        c.type === 'DUPLICATE_VENDOR_ROUTING' && 
        c.vendorId === r.vendorId && 
        c.providerRefId === r.shipmentServiceProviderRefId
      )
    })

    const providersToCreate = iciciProviders.filter(p => {
      return !conflicts.some(c => 
        c.type === 'EXISTING_COMPANY_PROVIDER' && 
        c.providerId === p.providerId
      )
    })

    console.log(`   │ vendorshippingroutings         │ ${routingsToCreate.length.toString().padStart(30)} │`)
    console.log(`   │ companyshippingproviders       │ ${providersToCreate.length.toString().padStart(30)} │`)
    console.log('   └────────────────────────────────┴──────────────────────────────────┘')
    
    console.log('\n   Vendors Involved:')
    for (const vendorId of vendorIds) {
      const vendor = await vendorsCollection.findOne({ id: vendorId })
      console.log(`   - ${vendorId}: ${vendor?.name || 'Unknown'}`)
    }

    console.log('\n   Shippers/Providers Involved:')
    const providerRefIds = [...new Set(iciciRoutings.map(r => r.shipmentServiceProviderRefId))]
    for (const refId of providerRefIds) {
      const provider = allProviders.find(p => p.providerRefId === refId)
      console.log(`   - Ref ID ${refId}: ${provider?.providerName || 'Unknown'} (${provider?.providerCode || 'N/A'})`)
    }

    console.log('\n   Conflicts:')
    if (conflicts.length > 0) {
      for (const c of conflicts) {
        console.log(`   ⚠️  ${c.type}: ${JSON.stringify(c)}`)
      }
    } else {
      console.log('   ✅ None')
    }

    console.log('\n═══════════════════════════════════════════════════════════════════════════════')
    console.log('\n✅ PHASE 1 ANALYSIS COMPLETE')
    console.log('\n⏸️  WAITING FOR CONFIRMATION TO PROCEED TO PHASE 2 (EXECUTION)')
    console.log('   Run the execution script only after reviewing the above summary.')
    console.log('')

    // Store analysis results for Phase 2
    const analysisResults = {
      timestamp: new Date().toISOString(),
      iciciCompany: { id: iciciCompanyId, name: iciciCompany.name },
      akasaCompany: { id: akasaCompanyId, name: akasaCompany.name },
      iciciRoutings: iciciRoutings.map(r => ({
        routingId: r.routingId,
        vendorId: r.vendorId,
        companyId: r.companyId,
        shipmentServiceProviderRefId: r.shipmentServiceProviderRefId,
        primaryCourierCode: r.primaryCourierCode,
        secondaryCourierCode: r.secondaryCourierCode,
        isActive: r.isActive
      })),
      iciciProviders: iciciProviders.map(p => ({
        companyShippingProviderId: p.companyShippingProviderId,
        companyId: p.companyId,
        providerId: p.providerId,
        isEnabled: p.isEnabled,
        isDefault: p.isDefault
      })),
      routingsToCreate: routingsToCreate.length,
      providersToCreate: providersToCreate.length,
      conflicts: conflicts,
      vendors: vendorIds,
      providers: providerRefIds
    }

    // Write analysis to file
    const outputPath = path.join(__dirname, 'vendor-shipping-routing-analysis.json')
    fs.writeFileSync(outputPath, JSON.stringify(analysisResults, null, 2))
    console.log(`📄 Analysis results saved to: ${outputPath}`)

  } catch (error) {
    console.error('\n❌ Error during analysis:', error)
    throw error
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

// Run the analysis
analyzeVendorShippingRouting()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
