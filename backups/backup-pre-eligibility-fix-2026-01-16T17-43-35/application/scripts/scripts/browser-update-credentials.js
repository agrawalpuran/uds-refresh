/**
 * Browser Console Script to Update Shiprocket Credentials
 * 
 * Copy and paste this into your browser console (F12) while on the UDS application
 * 
 * Instructions:
 * 1. Open browser console (F12)
 * 2. Navigate to any page in the UDS application
 * 3. Copy and paste this entire script
 * 4. Update the credentials below
 * 5. Run the script
 */

(async function updateShiprocketCredentials() {
  // ============================================
  // CONFIGURATION - UPDATE THESE VALUES
  // ============================================
  const companyId = '100004';
  const providerId = 'PROV_SR_ICICI'; // Get this from GET /api/companies/100004/shipping-providers
  const shiprocketEmail = 'YOUR_SHIPROCKET_EMAIL@example.com'; // Replace with actual email
  const shiprocketPassword = 'YOUR_SHIPROCKET_PASSWORD'; // Replace with actual password
  // ============================================

  try {
    console.log('🔍 Step 1: Checking existing providers...');
    
    // Get existing providers
    const getResponse = await fetch(`/api/companies/${companyId}/shipping-providers`);
    if (!getResponse.ok) {
      const error = await getResponse.json();
      throw new Error(`Failed to get providers: ${error.error || getResponse.statusText}`);
    }
    
    const providers = await getResponse.json();
    console.log(`✅ Found ${providers.length} provider(s):`);
    providers.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.providerName} (${p.providerCode}) - ID: ${p.providerId}`);
    });
    
    // Check if provider exists
    const provider = providers.find(p => p.providerId === providerId);
    if (!provider) {
      console.error(`\n❌ Provider ${providerId} not found for company ${companyId}`);
      console.log('\nAvailable providers:');
      providers.forEach(p => {
        console.log(`   - ${p.providerId} (${p.providerName})`);
      });
      return;
    }
    
    console.log(`\n🔧 Step 2: Updating credentials for provider ${providerId}...`);
    console.log(`   Email: ${shiprocketEmail.substring(0, 10)}...`);
    console.log(`   Password: ${'*'.repeat(shiprocketPassword.length)}`);
    
    // Update credentials
    const putResponse = await fetch(`/api/companies/${companyId}/shipping-providers`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        providerId: providerId,
        credentials: {
          apiKey: shiprocketEmail,    // For Shiprocket, apiKey = email
          apiSecret: shiprocketPassword,  // For Shiprocket, apiSecret = password
        },
        updatedBy: 'Browser Script',
      }),
    });
    
    if (!putResponse.ok) {
      const error = await putResponse.json();
      throw new Error(`Failed to update credentials: ${error.error || putResponse.statusText}`);
    }
    
    const result = await putResponse.json();
    
    console.log('\n✅ Successfully updated Shiprocket credentials!');
    console.log('\nUpdated Provider Details:');
    console.log(`   Company Shipping Provider ID: ${result.companyShippingProviderId}`);
    console.log(`   Provider ID: ${result.providerId}`);
    console.log(`   Provider Code: ${result.providerCode}`);
    console.log(`   Provider Name: ${result.providerName}`);
    console.log(`   Is Enabled: ${result.isEnabled}`);
    console.log(`   Is Default: ${result.isDefault}`);
    
    console.log('\n✅ Credentials have been encrypted and stored securely.');
    console.log('\n📝 Next Steps:');
    console.log('   1. Try creating a shipment again');
    console.log('   2. The system should now authenticate with Shiprocket successfully');
    console.log('   3. AWB number will be captured and stored in courierAwbNumber field');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
  }
})();

