/**
 * Get Shiprocket Token Script
 * 
 * This script authenticates with Shiprocket API and retrieves the JWT token.
 * 
 * Usage: node scripts/get-shiprocket-token.js
 */

const SHIPROCKET_EMAIL = 'agrawalpuran@gmail.com'
const SHIPROCKET_PASSWORD = '!d%wun0jY75pPeapvAJ9kZo#ylHYgIOr'
const SHIPROCKET_API_BASE = 'https://apiv2.shiprocket.in'

async function getShiprocketToken() {
  try {
    console.log('='.repeat(80))
    console.log('GETTING SHIPROCKET TOKEN')
    console.log('='.repeat(80))
    console.log('')
    console.log(`Email: ${SHIPROCKET_EMAIL}`)
    console.log(`API Base: ${SHIPROCKET_API_BASE}`)
    console.log('')

    const response = await fetch(`${SHIPROCKET_API_BASE}/v1/external/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: SHIPROCKET_EMAIL,
        password: SHIPROCKET_PASSWORD,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Authentication failed (${response.status}): ${errorText}`)
    }

    const authData = await response.json()

    console.log('✅ Authentication Successful!')
    console.log('')
    console.log('Token Details:')
    console.log('='.repeat(80))
    console.log(`Token: ${authData.token}`)
    console.log(`Email: ${authData.email}`)
    console.log(`User ID: ${authData.id}`)
    console.log(`Company ID: ${authData.company_id}`)
    console.log(`Name: ${authData.first_name} ${authData.last_name}`)
    console.log(`Created At: ${authData.created_at}`)
    console.log('')
    console.log('Token Validity:')
    console.log('='.repeat(80))
    console.log('✅ Token is valid for 240 hours (10 days)')
    console.log('✅ Token expires:', new Date(Date.now() + 240 * 60 * 60 * 1000).toISOString())
    console.log('')
    console.log('Usage:')
    console.log('='.repeat(80))
    console.log('Include this token in API requests:')
    console.log(`Authorization: Bearer ${authData.token}`)
    console.log('')

  } catch (error) {
    console.error('❌ Error getting token:', error.message)
    process.exit(1)
  }
}

getShiprocketToken()

