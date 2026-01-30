/**
 * Set authConfig on ShipmentServiceProvider from CompanyShippingProvider credentials
 * This enables the health check to work at the provider level
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

let MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) MONGODB_URI = mongoMatch[1].trim()
  }
}

async function setProviderAuthConfig() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
  console.log('║     SET AUTH CONFIG ON SHIPMENT SERVICE PROVIDER                            ║')
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝')
  console.log()

  await mongoose.connect(MONGODB_URI)
  console.log('✅ Connected to MongoDB\n')

  const db = mongoose.connection.db
  const providersCollection = db.collection('shipmentserviceproviders')
  const companyProvidersCollection = db.collection('companyshippingproviders')

  const PROVIDER_ID = 'PROV_MJXY0QMESF'

  // Get the provider
  const provider = await providersCollection.findOne({ providerId: PROVIDER_ID })
  console.log('📋 Current ShipmentServiceProvider:')
  console.log(JSON.stringify({
    providerId: provider?.providerId,
    providerCode: provider?.providerCode,
    providerName: provider?.providerName,
    hasAuthConfig: !!provider?.authConfig,
    authConfigType: provider?.authConfig?.authType || 'NOT SET'
  }, null, 2))

  // Get credentials from CompanyShippingProvider (ICICI has the original credentials)
  const companyProvider = await companyProvidersCollection.findOne({ 
    companyId: '100004',
    providerId: PROVIDER_ID 
  })

  if (!companyProvider) {
    console.log('\n❌ CompanyShippingProvider not found for ICICI BANK!')
    await mongoose.disconnect()
    process.exit(1)
  }

  console.log('\n📋 Source credentials from CompanyShippingProvider (ICICI):')
  console.log(JSON.stringify({
    hasApiKey: !!companyProvider.apiKey,
    hasApiSecret: !!companyProvider.apiSecret
  }, null, 2))

  if (!companyProvider.apiKey || !companyProvider.apiSecret) {
    console.log('\n❌ No credentials found in CompanyShippingProvider!')
    await mongoose.disconnect()
    process.exit(1)
  }

  // Build authConfig for Shiprocket (uses BASIC auth with email/password)
  // The apiKey field stores email, apiSecret stores password (both encrypted)
  const authConfig = {
    authType: 'BASIC',
    credentials: {
      username: companyProvider.apiKey,    // email (already encrypted)
      password: companyProvider.apiSecret  // password (already encrypted)
    }
  }

  console.log('\n🔄 Updating ShipmentServiceProvider with authConfig...')

  const updateResult = await providersCollection.updateOne(
    { providerId: PROVIDER_ID },
    {
      $set: {
        authConfig: authConfig,
        updatedAt: new Date(),
        updatedBy: 'Database Script - Set authConfig from company credentials'
      }
    }
  )

  console.log('   Modified count:', updateResult.modifiedCount)

  // Verify
  const updatedProvider = await providersCollection.findOne({ providerId: PROVIDER_ID })
  console.log('\n📋 Updated ShipmentServiceProvider:')
  console.log(JSON.stringify({
    providerId: updatedProvider?.providerId,
    providerCode: updatedProvider?.providerCode,
    providerName: updatedProvider?.providerName,
    hasAuthConfig: !!updatedProvider?.authConfig,
    authConfigType: updatedProvider?.authConfig?.authType || 'NOT SET',
    hasCredentialsUsername: !!updatedProvider?.authConfig?.credentials?.username,
    hasCredentialsPassword: !!updatedProvider?.authConfig?.credentials?.password
  }, null, 2))

  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗')
  console.log('║                    AUTH CONFIG SET SUCCESSFULLY                              ║')
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝')
  console.log('\n✅ The health check should now work properly!')

  await mongoose.disconnect()
  console.log('\n🔌 Disconnected from MongoDB')
}

setProviderAuthConfig()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
