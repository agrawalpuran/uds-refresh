/**
 * Copy API credentials from ICICI BANK to AKASA AIR
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

async function copyCredentials() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
  console.log('║     COPY API CREDENTIALS: ICICI BANK → AKASA AIR                            ║')
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝')
  console.log()

  await mongoose.connect(MONGODB_URI)
  console.log('✅ Connected to MongoDB\n')

  const db = mongoose.connection.db
  const collection = db.collection('companyshippingproviders')

  // Get ICICI BANK's credentials
  const iciciProvider = await collection.findOne({ companyId: '100004' })
  console.log('📋 ICICI BANK Company Shipping Provider:')
  console.log(JSON.stringify({
    companyShippingProviderId: iciciProvider?.companyShippingProviderId,
    companyId: iciciProvider?.companyId,
    providerId: iciciProvider?.providerId,
    hasApiKey: !!iciciProvider?.apiKey,
    hasApiSecret: !!iciciProvider?.apiSecret,
    hasAccessToken: !!iciciProvider?.accessToken,
    hasRefreshToken: !!iciciProvider?.refreshToken,
    hasProviderConfig: !!iciciProvider?.providerConfig
  }, null, 2))

  // Get AKASA AIR's current state
  const akasaProvider = await collection.findOne({ companyId: '100002' })
  console.log('\n📋 AKASA AIR Company Shipping Provider (Before):')
  console.log(JSON.stringify({
    companyShippingProviderId: akasaProvider?.companyShippingProviderId,
    companyId: akasaProvider?.companyId,
    providerId: akasaProvider?.providerId,
    hasApiKey: !!akasaProvider?.apiKey,
    hasApiSecret: !!akasaProvider?.apiSecret,
    hasAccessToken: !!akasaProvider?.accessToken,
    hasRefreshToken: !!akasaProvider?.refreshToken,
    hasProviderConfig: !!akasaProvider?.providerConfig
  }, null, 2))

  if (!iciciProvider) {
    console.log('\n❌ ICICI BANK provider not found!')
    await mongoose.disconnect()
    process.exit(1)
  }

  if (!akasaProvider) {
    console.log('\n❌ AKASA AIR provider not found!')
    await mongoose.disconnect()
    process.exit(1)
  }

  // Copy credentials from ICICI to AKASA
  console.log('\n🔄 Copying credentials...')
  
  const updateData = {
    updatedAt: new Date(),
    updatedBy: 'Database Script - Credentials copied from ICICI BANK'
  }

  // Only copy fields that exist
  if (iciciProvider.apiKey) updateData.apiKey = iciciProvider.apiKey
  if (iciciProvider.apiSecret) updateData.apiSecret = iciciProvider.apiSecret
  if (iciciProvider.accessToken) updateData.accessToken = iciciProvider.accessToken
  if (iciciProvider.refreshToken) updateData.refreshToken = iciciProvider.refreshToken
  if (iciciProvider.providerConfig) updateData.providerConfig = iciciProvider.providerConfig

  const updateResult = await collection.updateOne(
    { companyId: '100002' },
    { $set: updateData }
  )

  console.log('\n✅ Credentials copied from ICICI BANK to AKASA AIR')
  console.log('   Modified count:', updateResult.modifiedCount)

  // Verify
  const akasaUpdated = await collection.findOne({ companyId: '100002' })
  console.log('\n📋 AKASA AIR Company Shipping Provider (After):')
  console.log(JSON.stringify({
    companyShippingProviderId: akasaUpdated?.companyShippingProviderId,
    companyId: akasaUpdated?.companyId,
    providerId: akasaUpdated?.providerId,
    hasApiKey: !!akasaUpdated?.apiKey,
    hasApiSecret: !!akasaUpdated?.apiSecret,
    hasAccessToken: !!akasaUpdated?.accessToken,
    hasRefreshToken: !!akasaUpdated?.refreshToken,
    hasProviderConfig: !!akasaUpdated?.providerConfig
  }, null, 2))

  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗')
  console.log('║                          CREDENTIALS COPY COMPLETE                           ║')
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝')

  await mongoose.disconnect()
  console.log('\n🔌 Disconnected from MongoDB')
}

copyCredentials()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
