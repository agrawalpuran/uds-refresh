/**
 * Update Shiprocket Credentials for Company
 * 
 * Usage: node scripts/update-shiprocket-credentials.js <companyId> <providerId> <email> <password>
 * Example: node scripts/update-shiprocket-credentials.js 100004 PROV_SR_ICICI your-email@shiprocket.com your-password
 */

// Using native fetch (Node.js 18+)

const companyId = process.argv[2]
const providerId = process.argv[3]
const email = process.argv[4]
const password = process.argv[5]

if (!companyId || !providerId || !email || !password) {
  console.error('❌ Missing required parameters')
  console.log('\nUsage: node scripts/update-shiprocket-credentials.js <companyId> <providerId> <email> <password>')
  console.log('Example: node scripts/update-shiprocket-credentials.js 100004 PROV_SR_ICICI your-email@shiprocket.com your-password')
  process.exit(1)
}

async function updateCredentials() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    
    console.log(`\n🔍 Step 1: Checking existing providers for company ${companyId}...`)
    
    // First, get existing providers
    const getResponse = await fetch(`${baseUrl}/api/companies/${companyId}/shipping-providers`)
    if (!getResponse.ok) {
      const error = await getResponse.json()
      throw new Error(`Failed to get providers: ${error.error || getResponse.statusText}`)
    }
    
    const providers = await getResponse.json()
    console.log(`✅ Found ${providers.length} provider(s):`)
    providers.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.providerName} (${p.providerCode}) - ID: ${p.providerId}`)
    })
    
    // Check if provider exists
    const provider = providers.find(p => p.providerId === providerId)
    if (!provider) {
      console.error(`\n❌ Provider ${providerId} not found for company ${companyId}`)
      console.log('\nAvailable providers:')
      providers.forEach(p => {
        console.log(`   - ${p.providerId} (${p.providerName})`)
      })
      process.exit(1)
    }
    
    console.log(`\n🔧 Step 2: Updating credentials for provider ${providerId}...`)
    console.log(`   Email: ${email.substring(0, 10)}...`)
    console.log(`   Password: ${'*'.repeat(password.length)}`)
    
    // Update credentials
    const putResponse = await fetch(`${baseUrl}/api/companies/${companyId}/shipping-providers`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        providerId: providerId,
        credentials: {
          apiKey: email,    // For Shiprocket, apiKey = email
          apiSecret: password,  // For Shiprocket, apiSecret = password
        },
        updatedBy: 'Script (update-shiprocket-credentials)',
      }),
    })
    
    if (!putResponse.ok) {
      const error = await putResponse.json()
      throw new Error(`Failed to update credentials: ${error.error || putResponse.statusText}`)
    }
    
    const result = await putResponse.json()
    
    console.log('\n✅ Successfully updated Shiprocket credentials!')
    console.log('\nUpdated Provider Details:')
    console.log(`   Company Shipping Provider ID: ${result.companyShippingProviderId}`)
    console.log(`   Provider ID: ${result.providerId}`)
    console.log(`   Provider Code: ${result.providerCode}`)
    console.log(`   Provider Name: ${result.providerName}`)
    console.log(`   Is Enabled: ${result.isEnabled}`)
    console.log(`   Is Default: ${result.isDefault}`)
    
    console.log('\n✅ Credentials have been encrypted and stored securely.')
    console.log('\n📝 Next Steps:')
    console.log('   1. Try creating a shipment again')
    console.log('   2. The system should now authenticate with Shiprocket successfully')
    console.log('   3. AWB number will be captured and stored in courierAwbNumber field')
    
  } catch (error) {
    console.error('\n❌ Error:', error.message)
    if (error.stack) {
      console.error('\nStack trace:', error.stack)
    }
    process.exit(1)
  }
}

updateCredentials()

