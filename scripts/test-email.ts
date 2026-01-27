/**
 * Test Email Configuration
 * 
 * Sends a test email to verify SMTP settings are correct.
 * 
 * Usage: npm run test-email
 * Or:    npm run test-email -- your-email@example.com
 */

// Load environment variables from .env.local
import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { sendEmail, verifyConnection, EMAIL_ERROR_CODES } from '../lib/services/EmailProvider'

async function testEmailConfiguration() {
  console.log('\n========== EMAIL CONFIGURATION TEST ==========\n')

  // Check required environment variables
  const requiredVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS']
  const missingVars = requiredVars.filter(v => !process.env[v])
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:')
    missingVars.forEach(v => console.error(`   - ${v}`))
    console.error('\nPlease add these to your .env.local file.')
    process.exit(1)
  }

  console.log('📧 SMTP Configuration:')
  console.log(`   Host: ${process.env.SMTP_HOST}`)
  console.log(`   Port: ${process.env.SMTP_PORT}`)
  console.log(`   User: ${process.env.SMTP_USER}`)
  console.log(`   Pass: ${'*'.repeat(16)}`)
  console.log(`   From Name: ${process.env.SMTP_FROM_NAME || 'UDS Notifications'}`)
  console.log(`   From Email: ${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}`)
  console.log('')

  // Step 1: Verify SMTP connection
  console.log('--- Step 1: Verifying SMTP Connection ---')
  const connectionOk = await verifyConnection()
  
  if (!connectionOk) {
    console.error('\n❌ SMTP connection verification failed!')
    console.error('\nTroubleshooting tips:')
    console.error('   1. Check SMTP_USER and SMTP_PASS are correct')
    console.error('   2. For Gmail, use App Password (not regular password)')
    console.error('   3. Ensure 2FA is enabled on your Google account')
    console.error('   4. Generate App Password at: https://myaccount.google.com/apppasswords')
    process.exit(1)
  }
  
  console.log('✅ SMTP connection verified successfully!\n')

  // Step 2: Send test email
  console.log('--- Step 2: Sending Test Email ---')
  
  // Get recipient from command line args or use SMTP_USER
  const recipient = process.argv[2] || process.env.SMTP_USER
  
  if (!recipient) {
    console.error('❌ No recipient email specified')
    console.error('   Usage: npm run test-email -- your-email@example.com')
    process.exit(1)
  }

  console.log(`   Sending test email to: ${recipient}`)

  const result = await sendEmail({
    to: recipient,
    subject: '✅ UDS Email Test - Configuration Successful!',
    body: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #4A90A4, #2E7D32); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 30px; background-color: #f9f9f9; border-radius: 0 0 8px 8px; }
    .success { color: #2E7D32; font-size: 24px; font-weight: bold; }
    .info-box { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #4A90A4; }
    .footer { padding: 15px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Email Configuration Test</h1>
    </div>
    <div class="content">
      <p class="success">✅ Your email configuration is working!</p>
      
      <div class="info-box">
        <p><strong>Test Details:</strong></p>
        <p>📅 Date: ${new Date().toLocaleString()}</p>
        <p>📧 SMTP Host: ${process.env.SMTP_HOST}</p>
        <p>🔑 From: ${process.env.SMTP_FROM_NAME || 'UDS Notifications'}</p>
      </div>
      
      <p>Your UDS notification system is ready to send emails!</p>
      
      <p><strong>Next Steps:</strong></p>
      <ul>
        <li>Ensure <code>ENABLE_EMAIL_NOTIFICATIONS=true</code> in .env.local</li>
        <li>Templates are managed at <code>/dashboard/superadmin/notifications</code></li>
        <li>Emails will be sent automatically when order statuses change</li>
      </ul>
    </div>
    <div class="footer">
      <p>This is a test email from UDS (Uniform Distribution System)</p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  })

  console.log('')
  
  if (result.success) {
    console.log('========================================')
    console.log('✅ TEST EMAIL SENT SUCCESSFULLY!')
    console.log('========================================')
    console.log(`   Message ID: ${result.messageId}`)
    console.log(`   Recipient: ${recipient}`)
    console.log('')
    console.log('📬 Check your inbox (and spam folder) for the test email.')
    console.log('')
  } else {
    console.error('========================================')
    console.error('❌ FAILED TO SEND TEST EMAIL')
    console.error('========================================')
    console.error(`   Error: ${result.error}`)
    console.error(`   Error Code: ${result.errorCode}`)
    
    if (result.errorDetails) {
      console.error(`   Details: ${JSON.stringify(result.errorDetails, null, 2)}`)
    }
    
    // Provide specific troubleshooting based on error code
    console.error('\nTroubleshooting:')
    switch (result.errorCode) {
      case EMAIL_ERROR_CODES.AUTH_FAILED:
        console.error('   → Check your SMTP_PASS is a valid Gmail App Password')
        console.error('   → App Password should be 16 characters without spaces')
        console.error('   → Generate at: https://myaccount.google.com/apppasswords')
        break
      case EMAIL_ERROR_CODES.CONNECTION_FAILED:
        console.error('   → Check SMTP_HOST and SMTP_PORT settings')
        console.error('   → Ensure firewall allows outbound port 587')
        break
      case EMAIL_ERROR_CODES.INVALID_RECIPIENT:
        console.error('   → Check the recipient email address is valid')
        break
      default:
        console.error('   → Check the error details above')
    }
    
    process.exit(1)
  }
}

// Run the test
testEmailConfiguration().catch(error => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})
